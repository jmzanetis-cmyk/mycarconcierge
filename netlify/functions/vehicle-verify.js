// vehicle-verify.js — tiered vehicle ownership verification
//
// Routes (via _redirects):
//   POST /api/vehicle/decode-vin                      — VIN → NHTSA decode + match check
//   POST /api/registration/verify                     — upload reg doc → Claude vision → name match
//   GET  /api/registration/verifications              — list verifications (admin) or own (member)
//   PUT  /api/registration/verifications/:id          — admin approve / reject
//   GET  /api/registration/held-rides                 — admin: rides in pending_name_review
//   POST /api/registration/held-rides/:id/approve     — admin: approve held ride → dispatch
//   POST /api/registration/held-rides/:id/reject      — admin: reject held ride → cancel + refund
'use strict';

const { createClient } = require('@supabase/supabase-js');
const { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return require('stripe')(key, { apiVersion: STRIPE_API_VERSION });
}

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

function getBearerToken(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function parsePath(event) {
  return (event.path || '')
    .replace(/^\/?\.netlify\/functions\/vehicle-verify\/?/, '')
    .replace(/^\/?api\/(?:vehicle|registration)\/?/, '')
    .replace(/^\/+/, '');
}

async function getUser(event, supabase) {
  const token = getBearerToken(event);
  if (!token) return { error: json(401, { error: 'Missing bearer token' }) };
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: json(401, { error: 'Invalid token' }) };
  return { user };
}

async function getAdminUser(event, supabase) {
  const auth = await getUser(event, supabase);
  if (auth.error) return auth;
  const { data: profile } = await supabase.from('profiles')
    .select('role').eq('id', auth.user.id).single();
  if (profile?.role !== 'admin') return { error: json(403, { error: 'Admin only' }) };
  return { user: auth.user };
}

// Compute how many tokens from profileName appear in extractedName (0–100).
// Uses the profile token coverage approach: "JOHN A SMITH" still matches "John Smith" fully.
function nameMatchScore(profileName, extractedName) {
  if (!profileName || !extractedName) return 0;
  const normalize = s =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const profileTokens = normalize(profileName).split(' ').filter(Boolean);
  const extractedSet  = new Set(normalize(extractedName).split(' ').filter(Boolean));
  if (!profileTokens.length || !extractedSet.size) return 0;
  const matches = profileTokens.filter(t => extractedSet.has(t)).length;
  return Math.round((matches / profileTokens.length) * 100);
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

// POST /decode-vin
async function handleDecodeVin(event, supabase) {
  const auth = await getUser(event, supabase);
  if (auth.error) return auth.error;
  const { user } = auth;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const { vehicle_id, vin, year, make, model } = body;

  if (!vin) return json(400, { error: 'vin required' });

  // Confirm vehicle belongs to this user
  if (vehicle_id) {
    const { data: veh } = await supabase.from('vehicles')
      .select('owner_id').eq('id', vehicle_id).single();
    if (!veh || veh.owner_id !== user.id) return json(403, { error: 'Vehicle not found' });
  }

  // Call NHTSA vPIC
  const nhtsaUrl =
    `https://vpic.api.nhtsa.dot.gov/api/vehicles/decodevinvalues/${encodeURIComponent(vin.toUpperCase())}?format=json`;
  let decoded;
  try {
    const res = await fetch(nhtsaUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`NHTSA ${res.status}`);
    const data = await res.json();
    decoded = (data.Results || [])[0] || {};
  } catch (err) {
    console.error('[vehicle-verify] NHTSA error:', err.message);
    return json(502, { error: 'VIN lookup temporarily unavailable' });
  }

  const decodedYear  = decoded.ModelYear?.trim() || '';
  const decodedMake  = decoded.Make?.trim() || '';
  const decodedModel = decoded.Model?.trim() || '';
  const decodedErrorCode = decoded.ErrorCode?.trim() || '';

  // ErrorCode '0' = success; anything else = unrecognised VIN
  if (!decodedMake || decodedErrorCode !== '0') {
    return json(200, { match: false, warning: 'VIN not recognised — please double-check it.' });
  }

  // Fuzzy match: normalised lowercase contains-check
  const norm     = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const makeOk   = !make  || norm(decodedMake).includes(norm(make))   || norm(make).includes(norm(decodedMake));
  const modelOk  = !model || norm(decodedModel).includes(norm(model))  || norm(model).includes(norm(decodedModel));
  const yearOk   = !year  || String(decodedYear) === String(year);
  const allMatch = makeOk && modelOk && yearOk;

  // Update vehicle when it matches
  if (allMatch && vehicle_id) {
    await supabase.from('vehicles').update({ vin_decoded: true })
      .eq('id', vehicle_id).eq('owner_id', user.id);
  }

  const warning = !allMatch
    ? `This VIN decodes to a ${decodedYear} ${decodedMake} ${decodedModel} — please check your vehicle details.`
    : null;

  return json(200, {
    match: allMatch,
    decoded: { year: decodedYear, make: decodedMake, model: decodedModel },
    warning,
  });
}

// POST /verify
async function handleVerify(event, supabase) {
  const auth = await getUser(event, supabase);
  if (auth.error) return auth.error;
  const { user } = auth;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const { registrationUrl, vehicleId, contextNote } = body;

  if (!registrationUrl) return json(400, { error: 'registrationUrl required' });
  if (!vehicleId)       return json(400, { error: 'vehicleId required' });

  // Confirm vehicle belongs to this user
  const { data: veh } = await supabase.from('vehicles')
    .select('owner_id').eq('id', vehicleId).single();
  if (!veh || veh.owner_id !== user.id) return json(403, { error: 'Vehicle not found' });

  // Fetch member profile name
  const { data: profile } = await supabase.from('profiles')
    .select('full_name').eq('id', user.id).single();
  const profileName = profile?.full_name || '';

  // Fetch image and encode as base64 for Claude vision
  let imageB64, mediaType;
  try {
    const imgRes = await fetch(registrationUrl, { signal: AbortSignal.timeout(15000) });
    if (!imgRes.ok) throw new Error(`Image fetch ${imgRes.status}`);
    const buf = await imgRes.arrayBuffer();
    imageB64  = Buffer.from(buf).toString('base64');
    const ct  = imgRes.headers.get('content-type') || 'image/jpeg';
    mediaType = ct.startsWith('image/png') ? 'image/png' : 'image/jpeg';
  } catch (err) {
    console.error('[vehicle-verify] image fetch error:', err.message);
    return json(502, { error: 'Failed to fetch registration image' });
  }

  // Claude vision extraction
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return json(500, { error: 'AI service not configured' });

  let extracted = {};
  let extractedText = '';
  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageB64 } },
            { type: 'text', text:
              'This is a vehicle registration document. Extract ONLY these fields and return valid JSON:\n' +
              '{"owner_name": "<registered owner name exactly as printed>", "vin": "<VIN if visible>", "plate": "<license plate if visible>", "raw_text": "<first 400 chars of visible text>"}\n' +
              'If a field is not visible, use null. Return only the JSON object, no other text.'
            },
          ],
        }],
      }),
    });
    const aiData = await aiRes.json();
    const rawText = aiData?.content?.[0]?.text || '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
    extractedText = extracted.raw_text || rawText.slice(0, 400);
  } catch (err) {
    console.error('[vehicle-verify] Claude error:', err.message);
    return json(502, { error: 'AI extraction failed — please try again' });
  }

  const extractedOwnerName = (extracted.owner_name || '').trim();
  const score = nameMatchScore(profileName, extractedOwnerName);

  // ≥80 = auto-approve; <80 = manual_review
  const AUTO_THRESHOLD = 80;
  const status = score >= AUTO_THRESHOLD ? 'approved' : 'manual_review';

  // Insert verification record
  const { data: verif, error: verifErr } = await supabase
    .from('registration_verifications')
    .insert({
      user_id:              user.id,
      vehicle_id:           vehicleId,
      registration_url:     registrationUrl,
      extracted_text:       extractedText,
      extracted_owner_name: extractedOwnerName || null,
      extracted_vin:        (extracted.vin || '').trim() || null,
      extracted_plate:      (extracted.plate || '').trim() || null,
      profile_name:         profileName,
      name_match_score:     score,
      context_note:         contextNote || null,
      status,
    })
    .select()
    .single();

  if (verifErr) {
    console.error('[vehicle-verify] insert error:', verifErr.message);
    return json(500, { error: 'Failed to save verification' });
  }

  // Auto-approve: flip registration_verified on the vehicle
  if (status === 'approved') {
    await supabase.from('vehicles').update({
      registration_verified:        true,
      registration_verification_id: verif.id,
    }).eq('id', vehicleId).eq('owner_id', user.id);
  }

  return json(200, {
    success: true,
    status,
    name_match_score:     score,
    extracted_owner_name: extractedOwnerName,
    details: status === 'approved'
      ? 'Registration verified — your vehicle is now unlocked for all services.'
      : 'We need to manually review your registration. You\'ll be notified within 24 hours.',
  });
}

// GET /verifications
async function handleGetVerifications(event, supabase) {
  const token = getBearerToken(event);
  if (!token) return json(401, { error: 'Missing bearer token' });
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return json(401, { error: 'Invalid token' });

  const { data: profile } = await supabase.from('profiles')
    .select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';

  const qs = event.queryStringParameters || {};

  if (isAdmin) {
    // Admin sees all (optionally filtered by status)
    let q = supabase.from('registration_verifications')
      .select(`*, user:profiles!registration_verifications_user_id_fkey(full_name, email), vehicle:vehicles(year,make,model)`)
      .order('created_at', { ascending: false })
      .limit(200);
    if (qs.status && qs.status !== 'all') q = q.eq('status', qs.status);
    const { data, error } = await q;
    if (error) return json(500, { error: error.message });
    return json(200, { success: true, verifications: data || [] });
  }

  // Member sees own verifications for a specific vehicle
  const { vehicleId } = qs;
  if (!vehicleId) return json(400, { error: 'vehicleId required' });
  const { data, error } = await supabase
    .from('registration_verifications')
    .select('id, status, name_match_score, extracted_owner_name, created_at')
    .eq('user_id', user.id)
    .eq('vehicle_id', vehicleId)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) return json(500, { error: error.message });
  return json(200, { success: true, verifications: data || [] });
}

// PUT /verifications/:id  — admin approve/reject
async function handleUpdateVerification(event, supabase, verifId) {
  const auth = await getAdminUser(event, supabase);
  if (auth.error) return auth.error;
  const { user } = auth;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const { status, admin_notes } = body;
  if (!['approved', 'rejected'].includes(status)) return json(400, { error: 'status must be approved or rejected' });

  const { data: verif } = await supabase.from('registration_verifications')
    .select('vehicle_id, user_id').eq('id', verifId).single();
  if (!verif) return json(404, { error: 'Verification not found' });

  await supabase.from('registration_verifications').update({
    status,
    reviewed_by:  user.id,
    reviewed_at:  new Date().toISOString(),
    review_notes: admin_notes || null,
  }).eq('id', verifId);

  // If admin approves, flip registration_verified on the vehicle
  if (status === 'approved') {
    await supabase.from('vehicles').update({
      registration_verified:        true,
      registration_verification_id: verifId,
    }).eq('id', verif.vehicle_id);

    // Also release any rides held pending this vehicle's name review
    await supabase.from('rides').update({ status: 'requested' })
      .eq('member_id', verif.user_id)
      .eq('member_vehicle_id', verif.vehicle_id) // denormalised column if present; safe no-op if not
      .eq('status', 'pending_name_review');
  }

  return json(200, { success: true, status });
}

// GET /held-rides  — admin: list rides in pending_name_review
async function handleGetHeldRides(event, supabase) {
  const auth = await getAdminUser(event, supabase);
  if (auth.error) return auth.error;

  const { data, error } = await supabase
    .from('rides')
    .select(`
      id, status, created_at, pickup_address, dropoff_address,
      estimated_fare, stripe_payment_intent_id,
      member_vehicle_make, member_vehicle_model, member_vehicle_year,
      member:profiles!rides_member_id_fkey(id, full_name, email),
      vehicle:vehicles(id, registration_verified, registration_verification_id,
        verif:registration_verifications(
          name_match_score, extracted_owner_name, profile_name, context_note, status
        )
      )
    `)
    .eq('status', 'pending_name_review')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[vehicle-verify] held-rides query error:', error.message);
    return json(500, { error: error.message });
  }
  return json(200, { success: true, rides: data || [] });
}

// POST /held-rides/:id/approve  — admin approves; ride → requested (dispatches)
async function handleApproveHeldRide(event, supabase, rideId) {
  const auth = await getAdminUser(event, supabase);
  if (auth.error) return auth.error;

  const { data: ride } = await supabase.from('rides')
    .select('status, member_id').eq('id', rideId).single();
  if (!ride) return json(404, { error: 'Ride not found' });
  if (ride.status !== 'pending_name_review') return json(400, { error: 'Ride is not in pending_name_review' });

  const { error } = await supabase.from('rides')
    .update({ status: 'requested' }).eq('id', rideId);
  if (error) return json(500, { error: error.message });

  return json(200, { success: true, message: 'Ride approved and queued for dispatch.' });
}

// POST /held-rides/:id/reject  — admin rejects; ride cancelled + payment voided
async function handleRejectHeldRide(event, supabase, rideId) {
  const auth = await getAdminUser(event, supabase);
  if (auth.error) return auth.error;

  const { data: ride } = await supabase.from('rides')
    .select('status, stripe_payment_intent_id').eq('id', rideId).single();
  if (!ride) return json(404, { error: 'Ride not found' });
  if (ride.status !== 'pending_name_review') return json(400, { error: 'Ride is not in pending_name_review' });

  // Cancel the manual-capture payment intent (never captured → no charge)
  if (ride.stripe_payment_intent_id) {
    try {
      const stripe = getStripe();
      if (stripe) {
        const pi = await stripe.paymentIntents.retrieve(ride.stripe_payment_intent_id);
        if (['requires_capture', 'requires_confirmation', 'requires_payment_method'].includes(pi.status)) {
          await stripe.paymentIntents.cancel(ride.stripe_payment_intent_id);
        } else if (pi.status === 'succeeded') {
          await stripe.refunds.create({ payment_intent: ride.stripe_payment_intent_id });
        }
      }
    } catch (stripeErr) {
      console.error('[vehicle-verify] Stripe cancel error:', stripeErr.message);
    }
  }

  const { error } = await supabase.from('rides')
    .update({ status: 'cancelled_system' }).eq('id', rideId);
  if (error) return json(500, { error: error.message });

  return json(200, { success: true, message: 'Ride rejected and payment voided.' });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});

  const supabase = getServiceSupabase();
  if (!supabase) return json(500, { error: 'Service unavailable' });

  const method = event.httpMethod;
  const path   = parsePath(event);

  try {
    // POST /decode-vin
    if (method === 'POST' && path === 'decode-vin') return handleDecodeVin(event, supabase);

    // POST /verify
    if (method === 'POST' && path === 'verify') return handleVerify(event, supabase);

    // GET /verifications
    if (method === 'GET' && path === 'verifications') return handleGetVerifications(event, supabase);

    // PUT /verifications/:id
    const verifMatch = path.match(/^verifications\/([a-f0-9-]{36})$/);
    if (method === 'PUT' && verifMatch) return handleUpdateVerification(event, supabase, verifMatch[1]);

    // GET /held-rides
    if (method === 'GET' && path === 'held-rides') return handleGetHeldRides(event, supabase);

    // POST /held-rides/:id/approve
    const approveMatch = path.match(/^held-rides\/([a-f0-9-]{36})\/approve$/);
    if (method === 'POST' && approveMatch) return handleApproveHeldRide(event, supabase, approveMatch[1]);

    // POST /held-rides/:id/reject
    const rejectMatch = path.match(/^held-rides\/([a-f0-9-]{36})\/reject$/);
    if (method === 'POST' && rejectMatch) return handleRejectHeldRide(event, supabase, rejectMatch[1]);

    return json(404, { error: 'Route not found' });
  } catch (err) {
    console.error('[vehicle-verify] unhandled error:', err);
    return json(500, { error: 'Internal server error' });
  }
};

// ============================================================================
// provider-application
//
// Server-side endpoint for creating a provider_applications row. Replaces the
// browser-side supabaseClient.from('provider_applications').insert(...) calls
// in www/signup-provider.js and www/onboarding-provider.html.
//
// Why this exists:
//   - The previous client-side insert trusted the client to set user_id, which
//     meant a malicious user could potentially submit applications under
//     another user's account.
//   - There was no server-side input validation, no real client-IP capture,
//     no rate limit against spam applications, and no event emission for the
//     AI ops fleet to react to.
//
// This handler:
//   1. Validates the user's Supabase JWT and uses that as the source of truth
//      for user_id (overriding whatever the client sends).
//   2. Validates payload shape (lengths, formats, agreement fields).
//   3. Enforces a 1-application-per-user-per-24h rate limit (returns 429).
//   4. Captures the real client IP from x-forwarded-for / x-nf-client-connection-ip.
//   5. Inserts via the service-role client.
//   6. Emits provider.application_submitted into agent_events so Gatekeeper
//      (when enabled) can pick it up.
//   7. Sends best-effort confirmation emails to the applicant and to the
//      admin alert address.
//   8. Writes an admin_audit_log row.
//
// Mounted at /.netlify/functions/provider-application and reachable via the
// /api/provider-application proxy in www/_redirects.
// ============================================================================

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const FROM_EMAIL  = process.env.RESEND_FROM_EMAIL  || 'My Car Concierge <noreply@mycarconcierge.com>';
const ADMIN_EMAIL = process.env.ADMIN_ALERT_EMAIL  || 'admin@mycarconcierge.com';

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: typeof data === 'string' ? data : JSON.stringify(data)
  };
}

function getClientIp(event) {
  const h = event.headers || {};
  const xff = h['x-forwarded-for'] || h['X-Forwarded-For'];
  if (xff) return xff.split(',')[0].trim();
  return h['x-nf-client-connection-ip'] || h['client-ip'] || h['x-real-ip'] || null;
}

function getBearerToken(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 320;
}

function isPhone(v) {
  // Loose phone check — at least 7 digits, allows spaces/dashes/parens/+ prefix.
  return typeof v === 'string' && (v.replace(/\D/g, '').length >= 7) && v.length <= 30;
}

function strLen(v, min, max) {
  return typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
}

// Server-side allowlist of permitted services_offered values. The expected
// `service_categories` reference table doesn't exist in this Supabase project,
// so we maintain the allowlist here. Both the canonical snake_case keys (used
// by the new signup form) and the legacy display strings (preserved in older
// provider_applications rows) are accepted, normalized to lowercase for the
// comparison so casing differences don't reject legitimate values.
const ALLOWED_SERVICES = new Set([
  // canonical keys from www/signup-provider.html
  'oil_change','brakes','tires','engine','transmission','electrical',
  'diagnostics','paint','detailing','car_wash','glass','exhaust',
  'suspension','inspection','mobile_service','other',
  // legacy display strings still present in production data
  'oil change','brake service','tire rotation','tires / alignment',
  'engine repair','engine diagnostics','battery replacement','air filter',
  'a/c service','alignment','multi-point inspection','suspension repair',
  'windshield replacement','state inspection','glass repair'
].map(s => s.toLowerCase()));

function validateServices(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return 'services_offered must be a non-empty array';
  if (arr.length > 30)                          return 'services_offered too long (>30)';
  for (const s of arr) {
    if (typeof s !== 'string' || s.length > 100) return 'services_offered entries must be strings under 100 chars';
    if (!ALLOWED_SERVICES.has(s.toLowerCase()))  return `services_offered contains unknown value: ${s}`;
  }
  return null;
}

// Validate the request body shape and return either { errors: [...] } or
// { clean: { ... } } with whitelisted fields ready to insert. The list of
// permitted columns lives here (defense-in-depth): nothing the client sends
// outside this list reaches the database.
function validateAndClean(body) {
  const errors = [];

  if (!strLen(body.business_name, 2, 200))   errors.push('business_name (2-200 chars) required');
  if (!strLen(body.contact_name,  2, 100))   errors.push('contact_name (2-100 chars) required');
  if (!isPhone(body.phone))                   errors.push('phone required');
  if (!isEmail(body.email))                   errors.push('email required');
  const svcErr = validateServices(body.services_offered);
  if (svcErr) errors.push(svcErr);
  if (!body.agreement_signed_at)              errors.push('agreement_signed_at required');
  if (!strLen(body.legal_signatory_name, 2, 200)) errors.push('legal_signatory_name required');

  if (errors.length) return { errors };

  // Whitelist allowed columns. Anything else (especially user_id, status,
  // created_at, agreement_ip_address) is dropped on the floor and supplied by
  // the server below.
  const allowed = [
    'provider_alias', 'business_name', 'business_type', 'contact_name', 'phone', 'email',
    'legal_signatory_name', 'agreement_signed_at', 'agreement_signature',
    'website', 'street_address', 'city', 'state', 'zip_code',
    'service_area', 'service_radius_miles', 'services_offered',
    'brand_specializations', 'years_in_business', 'employees_count', 'bays_count',
    'vehicles_per_week',
    'has_loaner_vehicles', 'loaner_vehicle_count', 'loaner_vehicle_types',
    'loaner_delivery_options', 'loaner_requirements', 'loaner_fee_type', 'loaner_fee_amount',
    'pickup_delivery_options', 'pickup_radius_miles', 'pickup_fee_type', 'pickup_fee_amount',
    'is_founding_provider', 'founding_agreement_id',
    'referral_code', 'how_heard_about_us'
  ];
  const clean = {};
  for (const k of allowed) {
    if (body[k] !== undefined) clean[k] = body[k];
  }
  return { clean };
}

async function emitEvent(supabase, eventType, payload, source) {
  try {
    const { data, error } = await supabase
      .from('agent_events')
      .insert({ event_type: eventType, payload, source })
      .select('id').single();
    if (error) {
      console.error('[provider-application] emitEvent failed:', error.message);
      return null;
    }
    return data?.id || null;
  } catch (e) {
    console.error('[provider-application] emitEvent threw:', e.message);
    return null;
  }
}

async function sendEmail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return false;
  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
    return true;
  } catch (e) {
    console.error('[provider-application] email send failed:', e.message);
    return false;
  }
}

async function audit(supabase, row) {
  try { await supabase.from('admin_audit_log').insert(row); } catch (e) { /* best-effort */ }
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  if (event.httpMethod !== 'POST')    return jsonResponse(405, { error: 'POST only' });

  const supabase = getServiceSupabase();
  if (!supabase) return jsonResponse(500, { error: 'Database not configured' });

  // 1) JWT-derived user_id is the SOURCE OF TRUTH. Whatever the client sends
  //    in the body for user_id is ignored.
  const token = getBearerToken(event);
  if (!token) return jsonResponse(401, { error: 'Authorization Bearer token required' });
  let authedUser = null;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return jsonResponse(401, { error: 'invalid or expired token' });
    authedUser = data.user;
  } catch (e) {
    return jsonResponse(401, { error: 'token validation failed' });
  }
  const userId = authedUser.id;

  // 2) Parse body, validate.
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch { return jsonResponse(400, { error: 'invalid JSON body' }); }
  }
  const v = validateAndClean(body);
  if (v.errors) return jsonResponse(400, { error: 'validation failed', details: v.errors });

  // 3) Rate limit: 1 application per user per 24h.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existing, error: existingErr } = await supabase
    .from('provider_applications')
    .select('id, created_at')
    .eq('user_id', userId)
    .gte('created_at', cutoff)
    .limit(1);
  if (existingErr) {
    console.error('[provider-application] rate-limit query failed:', existingErr.message);
    // Fail-open on the rate-limit query — we'd rather accept a duplicate than
    // block a legit application because of a transient query error.
  } else if (existing && existing.length > 0) {
    return jsonResponse(429, {
      error: 'You already submitted an application in the last 24 hours.',
      existing_application_id: existing[0].id
    });
  }

  // 4) Build the insert row. user_id, agreement_ip_address, and status are
  //    server-set. We preserve the previous client-side behavior of marking
  //    submissions from the signup flow as 'approved' (the multi-step form
  //    already enforces all the must-haves before reaching here).
  const insertRow = {
    ...v.clean,
    user_id: userId,
    agreement_ip_address: getClientIp(event),
    status: 'approved'
  };

  // 5) Insert via service-role client (bypasses RLS).
  const { data: app, error: insertErr } = await supabase
    .from('provider_applications')
    .insert(insertRow)
    .select('id, business_name, contact_name, email')
    .single();
  if (insertErr) {
    console.error('[provider-application] insert failed:', insertErr.message);
    return jsonResponse(500, { error: 'failed to create application', details: insertErr.message });
  }

  // 6) Audit + event emission + emails — all best-effort, do not fail the
  //    request if any individual side-effect errors out.
  await audit(supabase, {
    action: 'create_provider_application',
    target_id: userId, target_type: 'provider_application',
    metadata: { application_id: app.id, business_name: app.business_name, ip: insertRow.agreement_ip_address },
    performed_by: 'self'
  });

  await emitEvent(supabase, 'provider.application_submitted', {
    application_id: app.id,
    user_id: userId,
    business_name: app.business_name,
    contact_name: app.contact_name,
    email: app.email
  }, 'provider-application');

  // Confirmation to applicant.
  await sendEmail(app.email,
    'We received your provider application',
    `<p>Hi ${app.contact_name || 'there'},</p>
     <p>Thanks for applying to join My Car Concierge as a provider for <strong>${app.business_name}</strong>. Our team will review your application and get back to you shortly.</p>
     <p>— My Car Concierge</p>`);

  // Heads-up to admin.
  await sendEmail(ADMIN_EMAIL,
    `New provider application: ${app.business_name}`,
    `<p>A new provider application was submitted.</p>
     <ul>
       <li><strong>Business:</strong> ${app.business_name}</li>
       <li><strong>Contact:</strong> ${app.contact_name} &lt;${app.email}&gt;</li>
       <li><strong>Application ID:</strong> ${app.id}</li>
       <li><strong>User ID:</strong> ${userId}</li>
     </ul>
     <p>Review in the admin console.</p>`);

  return jsonResponse(200, { application_id: app.id, business_name: app.business_name });
};

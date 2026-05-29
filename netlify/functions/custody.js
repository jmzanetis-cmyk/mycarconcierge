'use strict';

// netlify/functions/custody.js
//
// Custody-chain endpoints, gated by the custody_chain_enabled feature flag.
// Every route checks isFeatureEnabledForUser before doing anything else.
//
// Routes (via _redirects):
//   POST /api/custody/handoffs               → create handoff record
//   POST /api/custody/handoffs/:id/release   → releasing party releases
//   POST /api/custody/handoffs/:id/accept    → receiving party accepts
//   POST /api/custody/handoffs/:id/dispute   → receiving party disputes
//   POST /api/custody/photos                 → record photo metadata
//   GET  /api/custody/jobs/:jobId            → full custody chain for a job
//
// Photo path convention: custody/{job_id}/{handoff_id}/{photo_id}.jpg
// This convention is defined in custody.client. custody.js validates it but
// never constructs it — path strings originate only from the client.
//
// Accept/dispute logic replicates the close_handoff_accept /
// close_handoff_dispute SECURITY DEFINER RPCs because those functions use
// auth.uid() which is null under service role. Checks are equivalent.

var utils = require('./utils');
var { isFeatureEnabledForUser } = require('./_shared/feature-flag-check');

// Validates storage_path matches the convention from custody.client:
//   custody/{job_id}/{handoff_id}/{photo_id}.jpg
// Captures [1]=job_id [2]=handoff_id [3]=photo_id for cross-checking.
var CUSTODY_PATH_RE = /^custody\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.jpg$/i;

var VALID_LEG          = new Set(['member_to_driver','driver_to_shop','shop_to_driver','driver_to_member','driver_to_driver']);
var VALID_ROLE         = new Set(['member','provider','driver']);
var VALID_ANGLE        = new Set(['front','rear','driver_side','passenger_side','roof','wheel_fl','wheel_fr','wheel_rl','wheel_rr','interior_front','interior_rear','cargo','odometer','other']);
var VALID_DISPUTE_TYPE = new Set(['new_damage','missing_item','condition_mismatch','cleaning_revealed']);
var UUID_RE            = /^[0-9a-f-]{36}$/i;

// ── helpers ────────────────────────────────────────────────────────────────

function parsePath(event) {
  var raw = event.path || '';
  return raw
    .replace(/^\/?\.netlify\/functions\/custody\/?/, '')
    .replace(/^\/api\/custody\/?/, '')
    .replace(/^\/+|\/+$/g, '');
}

async function authenticate(event, supabase) {
  var authHeader = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!authHeader.startsWith('Bearer ')) return null;
  var token = authHeader.slice(7).trim();
  if (!token) return null;
  var result = await supabase.auth.getUser(token);
  var user = result.data && result.data.user;
  if (result.error || !user) return null;
  return user;
}

function bail(message, statusCode) {
  var e = new Error(message);
  e.statusCode = statusCode || 400;
  throw e;
}

function validateCustodyPath(storagePath, expectedJobId, expectedHandoffId) {
  var m = CUSTODY_PATH_RE.exec(storagePath);
  if (!m) bail('storage_path must match custody/{job_id}/{handoff_id}/{photo_id}.jpg', 400);
  if (m[1].toLowerCase() !== expectedJobId.toLowerCase())
    bail('storage_path job_id segment does not match body job_id', 400);
  if (m[2].toLowerCase() !== expectedHandoffId.toLowerCase())
    bail('storage_path handoff_id segment does not match body handoff_id', 400);
  return m[3]; // photo_id (filename stem)
}

// Mirror of is_job_party() SQL function: returns true if the user is
// the job's member/provider OR appears on any handoff for this job.
async function isJobParty(supabase, jobId, userId) {
  var jobRes = await supabase
    .from('concierge_jobs')
    .select('id')
    .eq('id', jobId)
    .or('member_id.eq.' + userId + ',provider_id.eq.' + userId)
    .maybeSingle();
  if (jobRes.data) return true;

  var handoffRes = await supabase
    .from('custody_handoffs')
    .select('id')
    .eq('job_id', jobId)
    .or('releasing_party_id.eq.' + userId + ',receiving_party_id.eq.' + userId)
    .limit(1);
  return !!(handoffRes.data && handoffRes.data.length > 0);
}

// Mirror of assert_prev_accepted() SQL function.
async function assertPrevAccepted(supabase, jobId, sequence) {
  if (sequence <= 1) return;
  var prev = await supabase
    .from('custody_handoffs')
    .select('status')
    .eq('job_id', jobId)
    .eq('sequence', sequence - 1)
    .single();
  if (prev.data && prev.data.status !== 'accepted')
    bail('Previous handoff (seq ' + (sequence - 1) + ') is not yet accepted', 409);
}

// ── route handlers ──────────────────────────────────────────────────────────

// POST /handoffs — releasing party creates a new handoff record
async function handleCreateHandoff(supabase, body, userId) {
  var jobId        = (body.job_id               || '').trim();
  var leg          = (body.leg                  || '').trim();
  var relRole      = (body.releasing_party_role  || '').trim();
  var recvId       = (body.receiving_party_id   || '').trim();
  var recvRole     = (body.receiving_party_role  || '').trim();

  if (!jobId)                    bail('job_id is required');
  if (!VALID_LEG.has(leg))       bail('invalid leg value');
  if (!VALID_ROLE.has(relRole))  bail('invalid releasing_party_role');
  if (!recvId || !UUID_RE.test(recvId)) bail('receiving_party_id must be a valid UUID');
  if (!VALID_ROLE.has(recvRole)) bail('invalid receiving_party_role');

  var party = await isJobParty(supabase, jobId, userId);
  if (!party) bail('Not a party to this job', 403);

  // Auto-sequence: one past current max for this job (DB unique constraint
  // handles the unlikely concurrent-creation race — client can retry on 409).
  var seqRes = await supabase
    .from('custody_handoffs')
    .select('sequence')
    .eq('job_id', jobId)
    .order('sequence', { ascending: false })
    .limit(1);
  var nextSeq = seqRes.data && seqRes.data.length > 0 ? seqRes.data[0].sequence + 1 : 1;

  var ins = await supabase.from('custody_handoffs').insert({
    job_id:               jobId,
    sequence:             nextSeq,
    leg:                  leg,
    releasing_party_id:   userId,
    releasing_party_role: relRole,
    receiving_party_id:   recvId,
    receiving_party_role: recvRole,
    status:               'pending'
  }).select().single();
  if (ins.error) throw ins.error;

  return { success: true, handoff: ins.data };
}

// POST /handoffs/:id/release — releasing party marks photos taken, advances to awaiting_receiver
async function handleRelease(supabase, handoffId, body, userId) {
  var hRes = await supabase.from('custody_handoffs').select('*').eq('id', handoffId).single();
  if (hRes.error || !hRes.data) bail('Handoff not found', 404);
  var h = hRes.data;

  if (h.releasing_party_id !== userId) bail('Only the releasing party may release this handoff', 403);
  if (h.status !== 'pending')          bail('Handoff must be in pending status to release', 409);

  var atRes = await supabase.from('custody_attestations').insert({
    handoff_id:   h.id,
    job_id:       h.job_id,
    party_id:     userId,
    party_role:   h.releasing_party_role,
    type:         'release',
    condition_ok: true,
    notes:        body.notes || null
  });
  if (atRes.error) throw atRes.error;

  var upd = await supabase.from('custody_handoffs').update({
    status:                'awaiting_receiver',
    released_at:           new Date().toISOString(),
    handoff_lat:           body.lat            != null ? body.lat            : null,
    handoff_lng:           body.lng            != null ? body.lng            : null,
    handoff_gps_accuracy_m: body.gps_accuracy_m != null ? body.gps_accuracy_m : null
  }).eq('id', handoffId);
  if (upd.error) throw upd.error;

  return { success: true, handoff_id: handoffId, status: 'awaiting_receiver' };
}

// POST /handoffs/:id/accept — receiving party accepts condition
// Replicates close_handoff_accept() SECURITY DEFINER logic (service role
// cannot call it because auth.uid() is null under service role).
async function handleAccept(supabase, handoffId, body, userId) {
  var hRes = await supabase.from('custody_handoffs').select('*').eq('id', handoffId).single();
  if (hRes.error || !hRes.data) bail('Handoff not found', 404);
  var h = hRes.data;

  if (h.receiving_party_id !== userId) bail('Only the receiving party may accept this handoff', 403);
  if (h.status !== 'awaiting_receiver') bail('Handoff must be awaiting receiver to accept', 409);

  await assertPrevAccepted(supabase, h.job_id, h.sequence);

  var atRes = await supabase.from('custody_attestations').insert({
    handoff_id:   h.id,
    job_id:       h.job_id,
    party_id:     userId,
    party_role:   h.receiving_party_role,
    type:         'accept',
    condition_ok: true,
    notes:        body.notes || null
  });
  if (atRes.error) throw atRes.error;

  var upd = await supabase.from('custody_handoffs').update({
    status:      'accepted',
    received_at: new Date().toISOString()
  }).eq('id', handoffId);
  if (upd.error) throw upd.error;

  return { success: true, handoff_id: handoffId, status: 'accepted' };
}

// POST /handoffs/:id/dispute — receiving party disputes condition
// Replicates close_handoff_dispute() SECURITY DEFINER logic.
async function handleDispute(supabase, handoffId, body, userId) {
  var disputeType = (body.type || '').trim();
  if (!VALID_DISPUTE_TYPE.has(disputeType)) bail('invalid dispute type');

  var hRes = await supabase.from('custody_handoffs').select('*').eq('id', handoffId).single();
  if (hRes.error || !hRes.data) bail('Handoff not found', 404);
  var h = hRes.data;

  if (h.receiving_party_id !== userId) bail('Only the receiving party may dispute this handoff', 403);
  if (h.status !== 'awaiting_receiver') bail('Handoff must be awaiting receiver to dispute', 409);

  var atRes = await supabase.from('custody_attestations').insert({
    handoff_id:   h.id,
    job_id:       h.job_id,
    party_id:     userId,
    party_role:   h.receiving_party_role,
    type:         'dispute',
    condition_ok: false,
    notes:        body.description || null
  });
  if (atRes.error) throw atRes.error;

  var dRes = await supabase.from('custody_disputes').insert({
    job_id:              h.job_id,
    handoff_id:          h.id,
    raised_by:           userId,
    raised_by_role:      h.receiving_party_role,
    type:                disputeType,
    description:         body.description || null,
    implicated_party_id: h.releasing_party_id,
    implicated_role:     h.releasing_party_role
  }).select('id').single();
  if (dRes.error) throw dRes.error;

  var upd = await supabase.from('custody_handoffs').update({
    status:      'disputed',
    received_at: new Date().toISOString()
  }).eq('id', handoffId);
  if (upd.error) throw upd.error;

  return { success: true, handoff_id: handoffId, dispute_id: dRes.data.id, status: 'disputed' };
}

// POST /photos — record photo metadata after client has uploaded to storage.
// Path validation enforces the custody.client convention without reproducing it here.
// Client may supply an explicit `id` so the row id matches the filename stem (1:1 mapping).
async function handlePhotoMetadata(supabase, body, userId) {
  var handoffId    = (body.handoff_id       || '').trim();
  var jobId        = (body.job_id           || '').trim();
  var angle        = (body.angle            || '').trim();
  var storagePath  = (body.storage_path     || '').trim();
  var capturedAt   = (body.captured_at      || '').trim();
  var capturedRole = (body.captured_by_role || '').trim();

  if (!handoffId)                    bail('handoff_id is required');
  if (!jobId)                        bail('job_id is required');
  if (!VALID_ANGLE.has(angle))       bail('invalid angle');
  if (!capturedAt)                   bail('captured_at is required');
  if (!VALID_ROLE.has(capturedRole)) bail('invalid captured_by_role');

  // Path format check — derives photo_id from path (source of truth)
  var photoId = validateCustodyPath(storagePath, jobId, handoffId);

  // If client supplied an explicit id, it must match the path's photo_id
  if (body.id && body.id.trim().toLowerCase() !== photoId.toLowerCase())
    bail('body id does not match photo_id in storage_path', 400);

  var party = await isJobParty(supabase, jobId, userId);
  if (!party) bail('Not a party to this job', 403);

  // Verify handoff belongs to this job
  var hRes = await supabase
    .from('custody_handoffs')
    .select('id')
    .eq('id', handoffId)
    .eq('job_id', jobId)
    .single();
  if (hRes.error || !hRes.data) bail('Handoff not found on this job', 404);

  var row = {
    handoff_id:        handoffId,
    job_id:            jobId,
    captured_by:       userId,
    captured_by_role:  capturedRole,
    angle:             angle,
    storage_path:      storagePath,
    captured_at:       capturedAt,
    gps_lat:           body.gps_lat          != null ? body.gps_lat          : null,
    gps_lng:           body.gps_lng          != null ? body.gps_lng          : null,
    gps_accuracy_m:    body.gps_accuracy_m   != null ? body.gps_accuracy_m   : null,
    live_capture:      body.live_capture !== false,
    quality_score:     body.quality_score    != null ? body.quality_score    : null,
    quality_flags:     Array.isArray(body.quality_flags) ? body.quality_flags : []
  };
  // Preserve client-supplied id so row id == filename stem (custody.client convention)
  if (body.id) row.id = body.id.trim();

  var ins = await supabase.from('custody_photos').insert(row).select().single();
  if (ins.error) throw ins.error;

  return { success: true, photo: ins.data };
}

// GET /jobs/:jobId — full custody chain visible to this user
async function handleGetJob(supabase, jobId, userId) {
  if (!jobId || !UUID_RE.test(jobId)) bail('invalid job_id', 400);

  var party = await isJobParty(supabase, jobId, userId);
  if (!party) bail('Not a party to this job', 403);

  var [handoffs, photos, attestations, disputes, fees] = await Promise.all([
    supabase.from('custody_handoffs').select('*').eq('job_id', jobId).order('sequence'),
    supabase.from('custody_photos').select('*').eq('job_id', jobId).order('created_at'),
    supabase.from('custody_attestations').select('*').eq('job_id', jobId).order('created_at'),
    supabase.from('custody_disputes').select('*').eq('job_id', jobId).order('created_at'),
    supabase.from('return_fees').select('*').eq('job_id', jobId).order('created_at')
  ]);

  for (var r of [handoffs, photos, attestations, disputes, fees]) {
    if (r.error) throw r.error;
  }

  return {
    success:      true,
    job_id:       jobId,
    handoffs:     handoffs.data     || [],
    photos:       photos.data       || [],
    attestations: attestations.data || [],
    disputes:     disputes.data     || [],
    return_fees:  fees.data         || []
  };
}

// ── main handler ───────────────────────────────────────────────────────────

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  var user = await authenticate(event, supabase);
  if (!user) return utils.errorResponse(401, 'Authentication required');

  var enabled = await isFeatureEnabledForUser(supabase, 'custody_chain_enabled', user.id);
  if (!enabled) return utils.errorResponse(403, 'feature_not_enabled');

  var route  = parsePath(event);
  var parts  = route.split('/');
  var method = event.httpMethod;

  try {
    var body = {};
    if (event.body) {
      try { body = JSON.parse(event.body); } catch (e) { return utils.errorResponse(400, 'Invalid JSON'); }
    }

    var result;

    // POST /handoffs
    if (route === 'handoffs' && method === 'POST') {
      result = await handleCreateHandoff(supabase, body, user.id);

    // POST /handoffs/:id/release
    } else if (parts.length === 3 && parts[0] === 'handoffs' && parts[2] === 'release' && method === 'POST') {
      result = await handleRelease(supabase, parts[1], body, user.id);

    // POST /handoffs/:id/accept
    } else if (parts.length === 3 && parts[0] === 'handoffs' && parts[2] === 'accept' && method === 'POST') {
      result = await handleAccept(supabase, parts[1], body, user.id);

    // POST /handoffs/:id/dispute
    } else if (parts.length === 3 && parts[0] === 'handoffs' && parts[2] === 'dispute' && method === 'POST') {
      result = await handleDispute(supabase, parts[1], body, user.id);

    // POST /photos
    } else if (route === 'photos' && method === 'POST') {
      result = await handlePhotoMetadata(supabase, body, user.id);

    // GET /jobs/:jobId
    } else if (parts.length === 2 && parts[0] === 'jobs' && method === 'GET') {
      result = await handleGetJob(supabase, parts[1], user.id);

    } else {
      return utils.errorResponse(404, 'Unknown route: ' + method + ' ' + route);
    }

    return utils.successResponse(result);
  } catch (e) {
    if (e.statusCode) return utils.errorResponse(e.statusCode, e.message);
    console.error('[custody] ' + method + ' ' + route + ' error:', e.message);
    return utils.errorResponse(500, 'Something went wrong');
  }
};

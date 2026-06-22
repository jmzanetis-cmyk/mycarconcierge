// ============================================================================
// plan-bids — provider bid placement, edit, and withdrawal
//
//   POST  /api/plan-bids            — create a bid on a care_plan
//                                     body: { care_plan_id, amount, note? }
//   PATCH /api/plan-bids/:id        — edit (amount/note) or withdraw a bid
//                                     edit body:     { amount?, note? }
//                                     withdraw body: { status: 'withdrawn' }
//
// Auth: Bearer JWT (provider's own Supabase session token).
//
// Gate (POST + edit-PATCH):
//   role IN ('provider','admin')
//   AND verification_status = 'verified'   (admins bypass)
//   AND suspended_at IS NULL               (admins bypass)
//
// Withdraw-PATCH bypasses the verification/suspension gates so a provider
// can always back out of a pending bid even if their status changes.
//
// Insert atomicity: POST routes through the place_plan_bid RPC
// (supabase/migrations/20260619_plan_bid_rpc.sql), which decrements
// free_trial_bids first then bid_credits in the same transaction as the
// plan_bids insert. Eliminates the read-then-write double-spend race.
//
// Client expects the sentinel error 'verification_required' (job-board.html
// :1130). All other errors are descriptive lowercase tags.
// ============================================================================
'use strict';

const utils = require('./utils');
const { serviceTypesToBuckets } = require('./_eligibility');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function jsonResp(code, data) {
  return { statusCode: code, headers: CORS_HEADERS, body: JSON.stringify(data) };
}

function getBearerToken(event) {
  const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

// Extract a UUID from /api/plan-bids/:id. Returns null for the collection path.
function getBidIdFromPath(eventPath) {
  if (!eventPath) return null;
  const parts = eventPath.split('/').filter(Boolean);
  const tail = parts[parts.length - 1];
  if (!tail || tail === 'plan-bids') return null;
  return utils.isValidUUID(tail) ? tail : null;
}

// serviceTypesToBuckets() lives in ./_eligibility.js — same function used by
// provider-packages.js (the open-jobs board) so the gate and the board agree
// on what counts as a service-fit match. Drift here = "I can see this job
// but can't bid on it" UX bugs. See _eligibility.js header for details.

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const supabase = utils.createSupabaseClient();
  if (!supabase) return jsonResp(500, { error: 'server_misconfigured' });

  const token = getBearerToken(event);
  if (!token) return jsonResp(401, { error: 'authentication_required' });

  const authResult = await supabase.auth.getUser(token);
  if (authResult.error || !authResult.data || !authResult.data.user) {
    return jsonResp(401, { error: 'invalid_token' });
  }
  const user = authResult.data.user;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (_e) { return jsonResp(400, { error: 'invalid_json' }); }

  const bidId = getBidIdFromPath(event.path);

  if (event.httpMethod === 'POST' && !bidId) {
    return handleCreate(supabase, user, body);
  }
  if (event.httpMethod === 'PATCH' && bidId) {
    return handlePatch(supabase, user, bidId, body);
  }
  return jsonResp(405, { error: 'method_not_allowed' });
};

// ── Gate check ─────────────────────────────────────────────────────────────
// Resolves to null on pass, or a fully-formed jsonResp on fail. Admins bypass
// verification + suspension checks (mirrors plan_bids RLS).
async function checkBidGate(supabase, userId) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, role, verification_status, suspended_at')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    return jsonResp(403, { error: 'profile_not_found' });
  }
  if (profile.role === 'admin') return null;
  if (profile.role !== 'provider') return jsonResp(403, { error: 'not_a_provider' });
  if (profile.verification_status !== 'verified') {
    return jsonResp(403, { error: 'verification_required' });
  }
  if (profile.suspended_at !== null) return jsonResp(403, { error: 'suspended' });
  return null;
}

// ── POST /api/plan-bids ────────────────────────────────────────────────────
async function handleCreate(supabase, user, body) {
  const careplanId = body && body.care_plan_id;
  const amountRaw = body && body.amount;
  const noteRaw = body && body.note;

  if (!careplanId || !utils.isValidUUID(careplanId)) {
    return jsonResp(400, { error: 'invalid_care_plan_id' });
  }
  const amount = Number.parseFloat(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return jsonResp(400, { error: 'invalid_amount' });
  }
  const note = (typeof noteRaw === 'string') ? noteRaw.slice(0, 2000) : null;

  const gateFail = await checkBidGate(supabase, user.id);
  if (gateFail) return gateFail;

  // Care plan must exist, be open, and within its bidding window.
  // 1d-1: SELECT widened to include service_types for the service-fit check below.
  const planResult = await supabase
    .from('care_plans')
    .select('id, status, bid_closes_at, service_types')
    .eq('id', careplanId)
    .single();

  if (planResult.error || !planResult.data) {
    return jsonResp(404, { error: 'care_plan_not_found' });
  }
  const plan = planResult.data;
  if (plan.status !== 'open') {
    return jsonResp(400, { error: 'care_plan_not_open' });
  }
  if (plan.bid_closes_at && new Date(plan.bid_closes_at) <= new Date()) {
    return jsonResp(400, { error: 'bidding_closed' });
  }

  // 1d-1: service-fit gate. Admins bypass. Providers must have declared
  // match_categories AND have at least one bucket overlapping the job's
  // service_types. Fail-closed on missing/empty prefs (provider must
  // declare services; prompt UI is part of 1d-3). Pre-RPC so a rejection
  // never burns a credit. Two parallel reads to avoid serializing on a
  // role lookup we only need for the admin-bypass decision.
  const [profileRes, prefRes] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('provider_match_preferences').select('match_categories').eq('profile_id', user.id).maybeSingle(),
  ]);
  const isAdmin = !profileRes.error && profileRes.data && profileRes.data.role === 'admin';

  if (!isAdmin) {
    const matchCategories = prefRes.data && prefRes.data.match_categories;
    if (!matchCategories || matchCategories.length === 0) {
      return jsonResp(403, { error: 'categories_required' });
    }

    const jobBuckets = serviceTypesToBuckets(plan.service_types);
    // Defensive note: if jobBuckets is empty (the plan has no service_types
    // — schema default is the empty array), we have no service-fit signal
    // to gate on. Pass through to the RPC rather than reject every bid on
    // under-specified plans. Strict mode would reject here; revisit if/when
    // the create-care-plan flow mandates service_types.
    if (jobBuckets.length > 0) {
      const provSet = new Set(matchCategories);
      const overlap = jobBuckets.some(b => provSet.has(b));
      if (!overlap) {
        return jsonResp(403, { error: 'service_not_offered' });
      }
    }
  }

  // Atomic decrement + insert via RPC.
  const rpcResult = await supabase.rpc('place_plan_bid', {
    p_provider_id: user.id,
    p_care_plan_id: careplanId,
    p_amount: amount,
    p_note: note,
  });

  if (rpcResult.error) {
    const code = rpcResult.error.code;
    const msg = rpcResult.error.message || '';
    if (code === 'P0001' || msg.indexOf('no_credits_available') !== -1) {
      return jsonResp(402, { error: 'no_credits' });
    }
    if (code === 'P0002' || msg.indexOf('duplicate_bid') !== -1) {
      return jsonResp(409, { error: 'duplicate_bid' });
    }
    console.error('[plan-bids] place_plan_bid RPC failed:', msg);
    return jsonResp(500, { error: 'rpc_failed' });
  }

  // RPC returns a TABLE; supabase-js gives an array.
  const row = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
  if (!row || !row.bid_id) {
    console.error('[plan-bids] place_plan_bid returned empty row:', rpcResult.data);
    return jsonResp(500, { error: 'rpc_empty_result' });
  }

  return jsonResp(200, {
    bid_id: row.bid_id,
    consumed_source: row.consumed_source,
    remaining_free_trial_bids: row.remaining_free,
    remaining_bid_credits: row.remaining_credits,
  });
}

// ── PATCH /api/plan-bids/:id ────────────────────────────────────────────────
async function handlePatch(supabase, user, bidId, body) {
  const bidResult = await supabase
    .from('plan_bids')
    .select('id, provider_id, care_plan_id, status')
    .eq('id', bidId)
    .single();

  if (bidResult.error || !bidResult.data) {
    return jsonResp(404, { error: 'bid_not_found' });
  }
  const bid = bidResult.data;
  if (bid.provider_id !== user.id) {
    return jsonResp(403, { error: 'not_bid_owner' });
  }

  const isWithdraw = body && body.status === 'withdrawn';

  if (isWithdraw) {
    // Withdraw is always allowed for a pending bid the user owns — no
    // verification/suspension gate (graceful exit).
    if (bid.status !== 'pending') {
      return jsonResp(400, { error: 'bid_not_pending' });
    }
    const upRes = await supabase
      .from('plan_bids')
      .update({ status: 'withdrawn' })
      .eq('id', bidId);
    if (upRes.error) {
      console.error('[plan-bids] withdraw update failed:', upRes.error.message);
      return jsonResp(500, { error: 'update_failed' });
    }
    return jsonResp(200, { bid_id: bidId, status: 'withdrawn' });
  }

  // Edit (amount and/or note). Requires the full gate.
  if (bid.status !== 'pending') {
    return jsonResp(400, { error: 'bid_not_pending' });
  }
  const gateFail = await checkBidGate(supabase, user.id);
  if (gateFail) return gateFail;

  // Confirm the care_plan is still open + within its window.
  const planResult = await supabase
    .from('care_plans')
    .select('id, status, bid_closes_at')
    .eq('id', bid.care_plan_id)
    .single();
  if (planResult.error || !planResult.data) {
    return jsonResp(404, { error: 'care_plan_not_found' });
  }
  const plan = planResult.data;
  if (plan.status !== 'open') return jsonResp(400, { error: 'care_plan_not_open' });
  if (plan.bid_closes_at && new Date(plan.bid_closes_at) <= new Date()) {
    return jsonResp(400, { error: 'bidding_closed' });
  }

  const update = {};
  if (typeof body.amount !== 'undefined') {
    const a = Number.parseFloat(body.amount);
    if (!Number.isFinite(a) || a <= 0) return jsonResp(400, { error: 'invalid_amount' });
    update.amount = a;
  }
  if (typeof body.note !== 'undefined') {
    update.note = (typeof body.note === 'string') ? body.note.slice(0, 2000) : null;
  }
  if (Object.keys(update).length === 0) {
    return jsonResp(400, { error: 'no_updates' });
  }

  const upRes = await supabase
    .from('plan_bids')
    .update(update)
    .eq('id', bidId)
    .select('id, amount, note, status')
    .single();

  if (upRes.error) {
    console.error('[plan-bids] edit update failed:', upRes.error.message);
    return jsonResp(500, { error: 'update_failed' });
  }
  return jsonResp(200, {
    bid_id: upRes.data.id,
    amount: upRes.data.amount,
    note: upRes.data.note,
    status: upRes.data.status,
  });
}

// ============================================================================
// auto-bid-prefill — review/confirm/dismiss API for auto-bid prefill notify
//
//   GET   /api/auto-bid-prefill/:id — fetch one prefill + joined plan/item
//                                      details + a freshly computed distance,
//                                      for rendering the review card.
//   PATCH /api/auto-bid-prefill/:id — { status: 'confirmed', amount? } or
//                                      { status: 'dismissed' }.
//
// Phase 5 of the auto-bid redesign (2026-09-16). Mirrors plan-bids.js's
// shape (Pattern B: utils.createSupabaseClient, CORS_HEADERS, jsonResp,
// path-tail id extraction, PATCH+body.status as the action discriminator)
// since 'confirmed' here is functionally "place a bid" and should be gated
// exactly the way plan-bids.js gates a manual bid — same RPC, same
// re-checks, so a confirmed prefill is indistinguishable from a bid a
// provider placed by hand once it lands in plan_bids.
//
// Auth: Bearer JWT (provider's own session token). Ownership is enforced
// in code (prefill.provider_id === user.id), not RLS — this endpoint runs
// under service_role like every other Pattern B handler in this codebase.
//
// EXPIRY (lazy, no separate scheduled sweep): a pending prefill expires at
// min(care_plans.bid_closes_at, auto_bid_prefills.created_at + 2h),
// whichever is sooner — a stale notification that finally gets tapped
// shouldn't submit a bid on a job that's already closed or moved on. GET
// and PATCH both check this and flip status → 'expired' on first touch
// past the deadline, rather than running a dedicated cron for it — same
// "lazy reconcile on read" idiom used elsewhere in this codebase (see
// care-plans.js's Stripe escrow reconciliation).
// ============================================================================
'use strict';

const utils = require('./utils');
const { isServiceFit } = require('./_eligibility');
const { planWithinRadius } = require('./_distance');

const EXPIRE_WINDOW_MS = 2 * 60 * 60 * 1000; // 2h

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
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

function getIdFromPath(eventPath) {
  if (!eventPath) return null;
  const parts = eventPath.split('/').filter(Boolean);
  const tail = parts[parts.length - 1];
  if (!tail || tail === 'auto-bid-prefill') return null;
  return utils.isValidUUID(tail) ? tail : null;
}

// Loads the prefill + joined care_plan + service_menu_items row, verifies
// ownership, and lazily expires it if past its deadline. Returns
// { error: jsonResp } on any failure, or { prefill, plan, item } on success.
async function loadOwnedPrefill(supabase, user, id) {
  const { data: prefill, error } = await supabase
    .from('auto_bid_prefills')
    .select('id, provider_id, care_plan_id, item_key, prefilled_amount_cents, status, created_at, responded_at')
    .eq('id', id)
    .single();

  if (error || !prefill) return { error: jsonResp(404, { error: 'prefill_not_found' }) };
  if (prefill.provider_id !== user.id) return { error: jsonResp(403, { error: 'not_prefill_owner' }) };

  const [planRes, itemRes] = await Promise.all([
    supabase.from('care_plans')
      .select('id, title, description, status, bid_closes_at, city, state, zip_code, lat, lng, categories, service_types, member_id, vehicle:vehicle_id(year,make,model)')
      .eq('id', prefill.care_plan_id).single(),
    supabase.from('service_menu_items')
      .select('item_key, label, category').eq('item_key', prefill.item_key).single(),
  ]);
  if (planRes.error || !planRes.data) return { error: jsonResp(404, { error: 'care_plan_not_found' }) };
  if (itemRes.error || !itemRes.data) return { error: jsonResp(404, { error: 'item_not_found' }) };

  // Lazy expiry check.
  if (prefill.status === 'pending') {
    const createdMs = new Date(prefill.created_at).getTime();
    const planCloseMs = planRes.data.bid_closes_at ? new Date(planRes.data.bid_closes_at).getTime() : Infinity;
    const deadlineMs = Math.min(createdMs + EXPIRE_WINDOW_MS, planCloseMs);
    if (Date.now() > deadlineMs) {
      await supabase.from('auto_bid_prefills')
        .update({ status: 'expired', responded_at: new Date().toISOString() })
        .eq('id', id).eq('status', 'pending'); // guard: don't clobber a race with a real confirm/dismiss
      prefill.status = 'expired';
    }
  }

  return { prefill, plan: planRes.data, item: itemRes.data };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return jsonResp(200, {});

  const supabase = utils.createSupabaseClient();
  if (!supabase) return jsonResp(500, { error: 'server_misconfigured' });

  const token = getBearerToken(event);
  if (!token) return jsonResp(401, { error: 'authentication_required' });
  const authResult = await supabase.auth.getUser(token);
  if (authResult.error || !authResult.data || !authResult.data.user) {
    return jsonResp(401, { error: 'invalid_token' });
  }
  const user = authResult.data.user;

  const id = getIdFromPath(event.path);
  if (!id) return jsonResp(400, { error: 'invalid_id' });

  if (event.httpMethod === 'GET') return handleGet(supabase, user, id);
  if (event.httpMethod === 'PATCH') return handlePatch(supabase, user, id, event);
  return jsonResp(405, { error: 'method_not_allowed' });
};

async function handleGet(supabase, user, id) {
  const loaded = await loadOwnedPrefill(supabase, user, id);
  if (loaded.error) return loaded.error;
  const { prefill, plan, item } = loaded;

  // Fresh distance for display — provider's coords may have changed since
  // the notify engine computed this at insert time; recompute rather than
  // trust a stored value we never stored in the first place.
  const { data: profile } = await supabase
    .from('profiles').select('lat, lng').eq('id', user.id).maybeSingle();
  const { miles } = planWithinRadius(plan, profile && profile.lat, profile && profile.lng, 500);

  return jsonResp(200, {
    id: prefill.id,
    status: prefill.status,
    item_key: prefill.item_key,
    item_label: item.label,
    category: item.category,
    prefilled_amount_cents: prefill.prefilled_amount_cents,
    created_at: prefill.created_at,
    responded_at: prefill.responded_at,
    care_plan: {
      id: plan.id,
      title: plan.title,
      description: plan.description,
      city: plan.city,
      state: plan.state,
      zip_code: plan.zip_code,
      vehicle: plan.vehicle,
      bid_closes_at: plan.bid_closes_at,
    },
    distance_miles: miles,
  });
}

async function handlePatch(supabase, user, id, event) {
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (_e) { return jsonResp(400, { error: 'invalid_json' }); }

  const action = body && body.status;
  if (action !== 'confirmed' && action !== 'dismissed') {
    return jsonResp(400, { error: 'invalid_status', detail: "status must be 'confirmed' or 'dismissed'" });
  }

  const loaded = await loadOwnedPrefill(supabase, user, id);
  if (loaded.error) return loaded.error;
  const { prefill, plan, item } = loaded;

  if (prefill.status !== 'pending') {
    return jsonResp(409, { error: 'prefill_not_pending', current_status: prefill.status });
  }

  if (action === 'dismissed') {
    const { error: upErr } = await supabase
      .from('auto_bid_prefills')
      .update({ status: 'dismissed', responded_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'pending');
    if (upErr) return jsonResp(500, { error: 'update_failed', detail: upErr.message });
    return jsonResp(200, { ok: true, status: 'dismissed' });
  }

  // action === 'confirmed' — this is a real bid placement, gated exactly
  // the way plan-bids.js gates a manual one.
  const amountRaw = (body.amount !== undefined && body.amount !== null)
    ? body.amount
    : prefill.prefilled_amount_cents / 100;
  const amount = Number.parseFloat(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return jsonResp(400, { error: 'invalid_amount' });
  }

  const gateFail = await checkBidGate(supabase, user.id);
  if (gateFail) return gateFail;

  if (plan.member_id === user.id) return jsonResp(403, { error: 'self_bid' });
  if (plan.status !== 'open') return jsonResp(400, { error: 'care_plan_not_open' });
  if (plan.bid_closes_at && new Date(plan.bid_closes_at) <= new Date()) {
    return jsonResp(400, { error: 'bidding_closed' });
  }

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
    if (!isServiceFit(plan, matchCategories)) {
      return jsonResp(403, { error: 'service_not_offered' });
    }
  }

  const note = `Auto-bid from rate card: ${item.label}`;
  const rpcResult = await supabase.rpc('place_plan_bid', {
    p_provider_id: user.id,
    p_care_plan_id: plan.id,
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
    console.error('[auto-bid-prefill] place_plan_bid RPC failed:', msg);
    return jsonResp(500, { error: 'rpc_failed' });
  }

  const row = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
  if (!row || !row.bid_id) {
    console.error('[auto-bid-prefill] place_plan_bid returned empty row:', rpcResult.data);
    return jsonResp(500, { error: 'rpc_empty_result' });
  }

  const { error: upErr } = await supabase
    .from('auto_bid_prefills')
    .update({ status: 'confirmed', responded_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pending');
  if (upErr) {
    // Bid already placed successfully (credit already deducted atomically);
    // this update is best-effort bookkeeping. Log, don't fail the response.
    console.error('[auto-bid-prefill] post-confirm status update failed:', upErr.message);
  }

  return jsonResp(200, {
    ok: true,
    status: 'confirmed',
    bid_id: row.bid_id,
    consumed_source: row.consumed_source,
    remaining_free: row.remaining_free,
    remaining_credits: row.remaining_credits,
  });
}

// Mirrors plan-bids.js's checkBidGate exactly.
async function checkBidGate(supabase, userId) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, role, verification_status, suspended_at')
    .eq('id', userId)
    .single();
  if (error || !profile) return jsonResp(403, { error: 'profile_not_found' });
  if (profile.role === 'admin') return null;
  if (profile.role !== 'provider') return jsonResp(403, { error: 'not_a_provider' });
  if (profile.verification_status !== 'verified') return jsonResp(403, { error: 'verification_required' });
  if (profile.suspended_at !== null) return jsonResp(403, { error: 'suspended' });
  return null;
}

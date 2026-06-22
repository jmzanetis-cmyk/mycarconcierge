// ============================================================================
// netlify/functions/provider-packages.js
// Provider open-jobs board (CR2 / Step 1d-3 v1).
//
// PURPOSE:
//   Replaces the dead /api/provider/packages endpoint that providers-bids.js
//   has called since the maintenance_packages era. Returns the list of open,
//   non-expired care_plans the calling provider is eligible to bid on —
//   eligibility mirrors plan-bids.js's gate exactly via the shared
//   ./_eligibility.serviceTypesToBuckets, so providers never see a job on
//   their board that the gate would 403 on bid.
//
// PIPELINE:
//   1. JWT auth (Pattern B).
//   2. Role + verification gate: caller must be admin OR (verified, non-
//      suspended provider). Mirrors plan-bids.js checkBidGate.
//   3. Fetch provider_match_preferences.match_categories. If empty AND not
//      admin → return { packages: [], categories_required: true }. Client
//      surfaces the categories-prompt UI instead of a generic empty state.
//   4. SELECT open + non-expired care_plans (status='open' AND
//      (bid_closes_at IS NULL OR bid_closes_at > now())) with vehicle join.
//   5. Service-fit filter: keep plans where serviceTypesToBuckets(plan
//      .service_types) overlaps the provider's match_categories. Empty
//      service_types passes through (permissive default — MIRRORS the bid
//      gate's plan-bids.js:228-240 behavior). Admins bypass the filter.
//   6. Project each row to the render shape providers-bids.js
//      renderPackageCard expects (legacy maintenance_packages field names
//      aliased from care_plans columns) so the client renderer works
//      unchanged.
//
// DELIBERATELY DEFERRED (v2 / 1d-3 follow-ups):
//   - "Invited for you" section: plan_invitations table is dormant in prod
//     today (0 rows; no writer; the matchmaker pass that populates it is 1d-2
//     work, not yet built). Surfacing now would render an empty section.
//   - "Matched for you" pills (matchmaker.rank): the existing matchmaker
//     fires on care_plan.auction_closed which never happens for real plans
//     (no code sets that status; only matchmaker-smoke synthesizes events).
//     0 matchmaker.rank rows for real OPEN plans today.
//   - Member-badge join (platform_fee_exempt, provider_verified,
//     referred_by_provider_id from member's profiles row): RLS+join
//     complexity. Undefined values just hide the pill in render — acceptable
//     for v1.
//   - _lowestBid / _myBid augmentation: requires per-plan plan_bids
//     aggregation queries. Defer.
//   - Distance gate: 1b-5 dependency. When provider + plan both have lat/lng,
//     add `point<@>point <= match_radius_miles` filter. Null-safe (per
//     never-block rule) on either side missing coords.
//
// CONVENTIONS: Pattern B (utils.createSupabaseClient, CORS_HEADERS const,
// jsonResp helper, lowercase sentinel errors). Mirrors plan-bids.js +
// care-plans.js + geocode.js + provider-profile-save.js.
// ============================================================================
'use strict';

const utils = require('./utils');
const { serviceTypesToBuckets } = require('./_eligibility');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return jsonResp(405, { error: 'method_not_allowed' });
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

  // Role + verification gate — mirrors plan-bids.js:checkBidGate.
  const profileRes = await supabase
    .from('profiles')
    .select('role, verification_status, suspended_at')
    .eq('id', user.id)
    .single();
  if (profileRes.error || !profileRes.data) {
    return jsonResp(403, { error: 'profile_not_found' });
  }
  const profile = profileRes.data;
  const isAdmin = profile.role === 'admin';
  if (!isAdmin) {
    if (profile.role !== 'provider') return jsonResp(403, { error: 'not_a_provider' });
    if (profile.verification_status !== 'verified') {
      return jsonResp(403, { error: 'verification_required' });
    }
    if (profile.suspended_at !== null) return jsonResp(403, { error: 'suspended' });
  }

  // Provider's declared service categories (first eligibility filter).
  const prefRes = await supabase
    .from('provider_match_preferences')
    .select('match_categories')
    .eq('profile_id', user.id)
    .maybeSingle();
  const matchCategories = (prefRes.data && prefRes.data.match_categories) || [];

  // categories_required: provider hasn't declared service categories yet.
  // The bid gate would 403 categories_required on any bid attempt; the board
  // can't show anything meaningful either. Client surfaces the categories-
  // prompt UI instead of a generic empty state. Admins bypass — they see
  // all eligible plans regardless of their own (probably empty) categories.
  if (!isAdmin && matchCategories.length === 0) {
    return jsonResp(200, { packages: [], categories_required: true });
  }

  // SELECT open + non-expired care_plans. RLS additionally enforces
  // verified-non-suspended-provider on this read (post-20260619a), but the
  // explicit gate above is the canonical check — RLS is defense-in-depth.
  const nowIso = new Date().toISOString();
  const { data: plans, error: plansErr } = await supabase
    .from('care_plans')
    .select(`
      id, title, description, status, bid_count, bid_closes_at, service_types,
      city, state, zip_code, lat, lng,
      created_at, vehicle_id, member_id,
      vehicles:vehicle_id(id, year, make, model, nickname)
    `)
    .eq('status', 'open')
    .or(`bid_closes_at.is.null,bid_closes_at.gt.${nowIso}`)
    .order('created_at', { ascending: false });

  if (plansErr) {
    console.error('[provider-packages] care_plans select failed:', plansErr.message);
    return jsonResp(500, { error: 'fetch_failed' });
  }

  // Service-fit filter — MIRRORS plan-bids.js:228-240 exactly:
  //   - empty service_types on the plan → permissive default, passes
  //   - otherwise → buckets must overlap with provider's match_categories
  //   - admins bypass entirely
  const provSet = new Set(matchCategories);
  const filtered = (plans || []).filter(p => {
    if (isAdmin) return true;
    const jobBuckets = serviceTypesToBuckets(p.service_types);
    if (jobBuckets.length === 0) return true;
    return jobBuckets.some(b => provSet.has(b));
  });

  // Alias to the legacy maintenance_packages render shape that
  // providers-bids.js renderPackageCard still expects. care_plans columns
  // map → maintenance_packages-named keys so the client renderer is
  // unchanged. Fields with no equivalent (frequency, parts_preference,
  // crowd_funded) are simply absent — renderPackageCard handles undefined
  // by skipping that decoration.
  const packages = filtered.map(p => ({
    id: p.id,
    title: p.title,
    description: p.description,
    status: p.status,
    created_at: p.created_at,
    vehicles: p.vehicles,
    member_id: p.member_id,
    member_city: p.city,
    member_state: p.state,
    member_zip: p.zip_code,
    lat: p.lat,
    lng: p.lng,
    bidding_deadline: p.bid_closes_at,
    service_types: p.service_types,
    _bidCount: p.bid_count || 0,
  }));

  return jsonResp(200, { packages });
};

// ============================================================================
// netlify/functions/job-board.js
// Backend for www/job-board.html (the standalone provider Job Board page).
//
// HISTORY: job-board.html shipped calling GET /api/job-board — an endpoint
// that never existed (no function, no redirect). The page rendered its error
// state for every provider from day one. This function implements the
// contract the page already speaks, reusing provider-packages.js's auth +
// eligibility pipeline (Pattern B) with three deliberate differences:
//
//   1. UNVERIFIED PROVIDERS CAN BROWSE. The page has a "verification
//      required" banner and disables bidding client-side; plan-bids.js
//      remains the authoritative bid gate. We return provider_verified so
//      the banner renders, instead of 403ing the whole list.
//   2. MY-BID ANNOTATION, NOT EXCLUSION. The page has a "My Bids" tab and
//      renders bid badges, so plans the caller has bid on stay in the list
//      with `my_bid` attached (provider-packages.js excludes them instead).
//   3. RESPONSE SHAPE: { plans, total, tab_counts, provider_verified,
//      auto_bid_enabled } with care_plans-native field names (the page reads
//      value_min/value_max/bid_closes_at/city/state directly).
//
// Query params honored: page, limit, tab (all|no-bids|closing-soon|my-bids),
// q (title/description search), service_type, min_value, sort
// (nearest|newest|closing|value — 'nearest' falls back to newest until the
// distance work lands). max_distance accepted but ignored (same deferral as
// provider-packages.js).
// ============================================================================
'use strict';

const utils = require('./utils');
const { planCategories, isServiceFit } = require('./_eligibility');

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

const CLOSING_SOON_MS = 24 * 60 * 60 * 1000; // bid window ends within 24h

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

  // Role gate — providers and admins only. Verification does NOT gate
  // browsing (difference #1 above); suspension does.
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
    if (profile.suspended_at !== null) return jsonResp(403, { error: 'suspended' });
  }
  const providerVerified = isAdmin || profile.verification_status === 'verified';

  // Service-category eligibility (mirrors provider-packages.js / the bid gate).
  const prefRes = await supabase
    .from('provider_match_preferences')
    .select('match_categories')
    .eq('profile_id', user.id)
    .maybeSingle();
  const matchCategories = (prefRes.data && prefRes.data.match_categories) || [];
  if (!isAdmin && matchCategories.length === 0) {
    return jsonResp(200, {
      plans: [], total: 0, categories_required: true,
      provider_verified: providerVerified, auto_bid_enabled: false,
      tab_counts: { all: 0, no_bids: 0, closing_soon: 0, my_bids: 0 },
    });
  }

  // Caller's existing bids → my_bid annotation + the "My Bids" tab.
  const { data: myBidRows } = await supabase
    .from('plan_bids')
    .select('id, care_plan_id, amount, status, is_auto_bid')
    .eq('provider_id', user.id);
  const myBidByPlan = new Map((myBidRows || []).map(b => [b.care_plan_id, b]));

  // Open + non-expired care plans.
  const nowIso = new Date().toISOString();
  const { data: plans, error: plansErr } = await supabase
    .from('care_plans')
    .select(`
      id, title, description, status, bid_count, bid_closes_at, service_types,
      categories, bundle_id, bundle_position,
      services, value_min, value_max, city, state, zip_code, lat, lng,
      created_at, vehicle_id, member_id,
      vehicles:vehicle_id(id, year, make, model, nickname)
    `)
    .eq('status', 'open')
    // A caller must not see or bid on their own care plan (dual-role accounts
    // — role=provider + is_also_member — can otherwise self-inflate bid counts
    // and, importantly, this is exactly the App Review demo-account path).
    // Filtered at the query so tab_counts stay accurate too.
    .neq('member_id', user.id)
    .or(`bid_closes_at.is.null,bid_closes_at.gt.${nowIso}`)
    .order('created_at', { ascending: false });

  if (plansErr) {
    console.error('[job-board] care_plans select failed:', plansErr.message);
    return jsonResp(500, { error: 'fetch_failed' });
  }

  // Service-fit filter — same rules as the bid gate (permissive on plans with
  // no category signal; admins bypass). Bid-on plans are KEPT (difference #2).
  // 2.6.1: decided by _eligibility.isServiceFit over care_plans.categories
  // (legacy rows fall back to classifying service_types). Each plan is
  // annotated with its effective categories so the card can render chips.
  const eligible = (plans || []).filter(p => isAdmin || isServiceFit(p, matchCategories))
    .map(p => ({ ...p, categories: planCategories(p), my_bid: myBidByPlan.get(p.id) || null }));

  // ── Query params: tab / search / service_type / min_value / sort / paging ──
  const qs = event.queryStringParameters || {};
  let list = eligible;

  const q = (qs.q || '').trim().toLowerCase();
  if (q) {
    list = list.filter(p =>
      (p.title || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.vehicles && `${p.vehicles.year || ''} ${p.vehicles.make || ''} ${p.vehicles.model || ''}`.toLowerCase().includes(q)));
  }

  // Spec 2.6.3 — 'mine' filter routes through isServiceFit against the
  // provider's match_categories. For non-admins this is a no-op (the
  // eligibility gate above already applied the same filter), but keeping
  // it explicit both future-proofs a later relaxation of the default
  // gate and gives admins a "narrow to my prefs" toggle.
  if (qs.service_type === 'mine') {
    list = list.filter(p => isServiceFit(p, matchCategories));
  } else if (qs.service_type && qs.service_type !== 'all') {
    const st = qs.service_type.toLowerCase();
    // 2.6.1: a category slug matches on categories; anything else keeps the
    // legacy substring match on service_types (the filter chips send slugs).
    list = list.filter(p =>
      (p.categories || []).includes(st) ||
      (p.service_types || []).some(t => String(t).toLowerCase().includes(st)));
  }

  const minValue = parseFloat(qs.min_value || '0');
  if (minValue > 0) list = list.filter(p => (parseFloat(p.value_max) || 0) >= minValue);

  // Spec 2.6.3 (with 2026-09-15 clarification): `all` stays anchored to the
  // unfiltered eligible set so the "All jobs" badge always tells the
  // provider how many jobs they *could* see if they cleared filters. The
  // other three (no_bids, closing_soon, my_bids) follow the ACTIVE
  // service_type + search filter, so switching from All jobs → My
  // specialties visibly shrinks those badges but never the "all" total.
  // Tab-scoping (which tab is selected) is applied AFTER counts.
  const soonCutoff = Date.now() + CLOSING_SOON_MS;
  const tabCounts = {
    all: eligible.length,
    no_bids: list.filter(p => !p.bid_count).length,
    closing_soon: list.filter(p =>
      p.bid_closes_at && new Date(p.bid_closes_at).getTime() <= soonCutoff).length,
    my_bids: list.filter(p => p.my_bid).length,
  };

  const tab = qs.tab || 'all';
  if (tab === 'no-bids')      list = list.filter(p => !p.bid_count);
  else if (tab === 'closing-soon') list = list.filter(p =>
    p.bid_closes_at && new Date(p.bid_closes_at).getTime() <= soonCutoff);
  else if (tab === 'my-bids') list = list.filter(p => p.my_bid);

  const sort = qs.sort || 'newest';
  if (sort === 'closing') {
    list = [...list].sort((a, b) =>
      new Date(a.bid_closes_at || '9999-01-01') - new Date(b.bid_closes_at || '9999-01-01'));
  } else if (sort === 'value') {
    list = [...list].sort((a, b) => (parseFloat(b.value_max) || 0) - (parseFloat(a.value_max) || 0));
  } // 'nearest' + 'newest' → created_at desc (already ordered)

  const total = list.length;
  const page = Math.max(1, parseInt(qs.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(qs.limit || '20', 10) || 20));
  const pageItems = list.slice((page - 1) * limit, page * limit);

  return jsonResp(200, {
    plans: pageItems,
    total,
    tab_counts: tabCounts,
    provider_verified: providerVerified,
    // Spec 2.6.3: tells the client whether to pre-select the "My specialties"
    // filter on load. Admins might not have match prefs, so gate on the
    // matchCategories array length rather than the role.
    has_match_categories: matchCategories.length > 0,
    auto_bid_enabled: false, // auto-bid engine reports separately; page treats undefined/false the same
  });
};

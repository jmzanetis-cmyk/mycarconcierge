// ============================================================================
// MCC — Bid Provider Summary
//
// GET /api/bids/provider-summary?package_id=<uuid>
//
// Returns { stats, performance } — two maps keyed by provider_id — for exactly
// the provider_ids that have bid on the given package. Existed as an
// unwritten dependency of members-packages.js viewPackage() and
// fetchAiBidRanking() since commit bdea8039 (2026-01-23): the client
// referenced `providerStats[...]` and `providerPerformance[...]` as if they
// were populated maps, but they were never declared anywhere. Result: an
// uncaught ReferenceError inside bids.map() the moment a member tapped Open
// on any package with a bid, killing the async function before the modal
// could open. This endpoint is the server side that closes that gap.
//
// Why an endpoint instead of direct supabase-js:
//   - provider_stats has no member-read RLS policy (owner+admin only). It
//     also contains sensitive columns (strikes, flagged_for_upsell_pattern,
//     suspended_reason, total_earnings, complaint_counts, ...) that must
//     never leak to members.
//   - provider_performance HAS an open pp_select_authed policy today, but
//     the client should reach it via the same endpoint so a future tightening
//     of that policy doesn't silently break the UI.
//
// Field whitelist (explicit — must NEVER be broadened without a real reason):
//   stats:       provider_id, average_rating, jobs_completed, total_reviews,
//                response_rate, on_time_rate, repeat_customer_rate
//   performance: provider_id, tier, overall_score, rating_avg, rating_count,
//                jobs_completed, on_time_rate, badges
//
// Ownership check: caller MUST be the member on the package (auth.uid() =
// maintenance_packages.member_id). Non-owners get 403 with no data.
//
// Reviewer guard: App Store reviewer accounts get a realistic mock so the
// demo bid list shows ratings/tiers/badges without touching real
// provider_stats rows. Mirrors the pattern in care-plans.js:434 and
// upsell-handlers.js:handleApprove.
// ============================================================================

'use strict';

const { createClient } = require('@supabase/supabase-js');
const { isReviewerAccount } = require('./_shared/reviewer-guard');

const STATS_FIELDS = 'provider_id, average_rating, jobs_completed, total_reviews, response_rate, on_time_rate, repeat_customer_rate';
const PERF_FIELDS  = 'provider_id, tier, overall_score, rating_avg, rating_count, jobs_completed, on_time_rate, badges';

// Any field NOT in this list must not appear in the response. Cross-referenced
// by the unit test — if this comment or the list drifts from the server code
// below, the leakage-blocking test fails loudly.
const STATS_ALLOWED = new Set(['provider_id', 'average_rating', 'jobs_completed', 'total_reviews', 'response_rate', 'on_time_rate', 'repeat_customer_rate']);
const PERF_ALLOWED  = new Set(['provider_id', 'tier', 'overall_score', 'rating_avg', 'rating_count', 'jobs_completed', 'on_time_rate', 'badges']);

function supabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

async function getUser(event, sb) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { error: json(401, { error: 'Missing token' }) };
  const { data: { user }, error } = await sb.auth.getUser(m[1].trim());
  if (error || !user) return { error: json(401, { error: 'Invalid token' }) };
  return { user };
}

function isValidUuid(s) {
  return typeof s === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// Belt-and-suspenders whitelist enforcement: even though the SELECT already
// limits to safe columns, walk the returned rows and strip anything not on
// the allowlist. Protects against a future PostgREST behavior change or a
// human editing the SELECT string carelessly. The unit test cross-checks
// both the SELECT string AND that this pass strips a synthetic sensitive
// field injected into the fake row.
function whitelistRow(row, allowedSet) {
  const out = {};
  for (const k of Object.keys(row || {})) {
    if (allowedSet.has(k)) out[k] = row[k];
  }
  return out;
}

// Reviewer-mock payload. Deliberately realistic-looking so the demo UI
// exercises the badge/tier/rating render paths without exposing real
// provider metrics. Values chosen to look plausible for a reviewer:
//   tier=gold, 4.8 stars, 47 jobs, 96% on-time, 2 badges.
function reviewerMockPayload(providerIds) {
  const stats = {};
  const performance = {};
  for (const id of providerIds) {
    stats[id] = {
      provider_id: id,
      average_rating: 4.8,
      jobs_completed: 47,
      total_reviews: 42,
      response_rate: 0.95,
      on_time_rate: 96,
      repeat_customer_rate: 0.31,
    };
    performance[id] = {
      provider_id: id,
      tier: 'gold',
      overall_score: 92,
      rating_avg: 4.8,
      rating_count: 42,
      jobs_completed: 47,
      on_time_rate: 96,
      badges: ['top_rated', 'quick_responder'],
    };
  }
  return { stats, performance, reviewer_mock: true };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const sb = supabase();
  const auth = await getUser(event, sb);
  if (auth.error) return auth.error;

  const packageId = event.queryStringParameters?.package_id || '';
  if (!isValidUuid(packageId)) return json(400, { error: 'package_id (uuid) required' });

  // Ownership check — member must own the package. RLS on maintenance_packages
  // would also gate this (auth.uid() = member_id), but the endpoint runs as
  // service-role so we enforce it explicitly here.
  const { data: pkg, error: pkgErr } = await sb
    .from('maintenance_packages')
    .select('id, member_id')
    .eq('id', packageId)
    .maybeSingle();
  if (pkgErr) return json(500, { error: pkgErr.message });
  if (!pkg) return json(404, { error: 'Package not found' });
  if (pkg.member_id !== auth.user.id) return json(403, { error: 'Forbidden' });

  // Extract provider_ids from bids on this package.
  const { data: bids, error: bidsErr } = await sb
    .from('bids')
    .select('provider_id')
    .eq('package_id', packageId);
  if (bidsErr) return json(500, { error: bidsErr.message });

  const providerIds = [...new Set((bids || []).map(b => b.provider_id).filter(Boolean))];
  if (providerIds.length === 0) {
    return json(200, { stats: {}, performance: {} });
  }

  // Reviewer bypass — return a realistic mock, don't touch real provider data.
  if (await isReviewerAccount(sb, auth.user.id)) {
    return json(200, reviewerMockPayload(providerIds));
  }

  // Parallel fetch, whitelist SELECTs.
  const [statsRes, perfRes] = await Promise.all([
    sb.from('provider_stats').select(STATS_FIELDS).in('provider_id', providerIds),
    sb.from('provider_performance').select(PERF_FIELDS).in('provider_id', providerIds),
  ]);

  if (statsRes.error) {
    console.error('[bid-provider-summary] provider_stats select failed:', statsRes.error.message);
  }
  if (perfRes.error) {
    console.error('[bid-provider-summary] provider_performance select failed:', perfRes.error.message);
  }

  const stats = {};
  for (const row of statsRes.data || []) {
    if (!row.provider_id) continue;
    stats[row.provider_id] = whitelistRow(row, STATS_ALLOWED);
  }
  const performance = {};
  for (const row of perfRes.data || []) {
    if (!row.provider_id) continue;
    performance[row.provider_id] = whitelistRow(row, PERF_ALLOWED);
  }

  return json(200, { stats, performance });
};

// Exported for the unit test — the leakage check needs to assert both that
// the SELECT strings only name safe fields AND that the whitelistRow pass
// strips any surprise field that somehow slips through.
module.exports.STATS_FIELDS = STATS_FIELDS;
module.exports.PERF_FIELDS = PERF_FIELDS;
module.exports.STATS_ALLOWED = STATS_ALLOWED;
module.exports.PERF_ALLOWED = PERF_ALLOWED;
module.exports.whitelistRow = whitelistRow;

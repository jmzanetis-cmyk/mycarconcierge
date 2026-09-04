// netlify/functions/admin-provider-outreach.js
//
// Provider Call List — manual B2B provider-acquisition cold-call tracking.
//
// This is deliberately separate from outreach-admin.js / admin-marketing.js
// (the AI Outreach Engine, which auto-discovers leads via Apollo/Places and
// has AI draft+send email/SMS at scale). This feature is for a human caller
// working a pre-built phone list market by market, logging attempts and
// outcomes as they go — there is no AI drafting, no sending, no email
// addresses at all. See supabase/migrations/20260904_provider_call_prospects.sql
// for the schema and 2026-09-04 seed data (130 prospects, 8 markets, from
// Jordan's MCC_National_Call_List.xlsx).
//
// Routes (mounted at /.netlify/functions/admin-provider-outreach/* and
// proxied from /api/admin/provider-outreach/* via www/_redirects):
//
//   GET  /rollup                       → per-market + aggregate call-funnel stats (Rollup sheet, live)
//   GET  /markets                      → market metadata (beachhead arc, regulatory hook, how to play it)
//   GET  /bid-packs                    → static pricing-tier reference table
//   GET  /prospects?market=<market>    → prospects for one market, ordered by priority then row_number
//   PUT  /prospects/:id                → update the caller-entered fields on one prospect
//
// Auth: Supabase Bearer JWT, either profiles.role === 'admin' (super_admin)
// or an active admin_team_members row whose role includes 'marketing-outreach'
// in lib/admin-role-permissions.js (Team Login — utils.authenticateAdminSection).
// This lives under the existing Marketing & Outreach nav section, already
// visible to the marketing role, so no new permission entry is needed.

'use strict';

var utils = require('./utils');

// Only these columns may be written by PUT /prospects/:id — every reference
// column (business_name, phone, google_rating, etc.) sourced from Google
// Places is intentionally excluded so a caller can never overwrite it.
var EDITABLE_FIELDS = [
  'contact_name', 'attempt_1', 'attempt_2', 'attempt_3', 'outcome',
  // Screen + Core (2026-09-04b: discovery/screening half of the call script,
  // originally only ever captured on the paper worksheet, never on a column)
  's1_operating_model', 'p1_how_found', 'p2_booking_process', 'p2_where_lose_jobs',
  'p3_growth_attempts', 'p3_attempt_cost', 'p4_platform_experience', 'p4b_which_platforms',
  'p5_ideal_customer', 'p5_not_worth_time', 'p6_monthly_spend', 'p7_slowest_time',
  'l1_regulatory_impact', 'l1_detail',
  // Describe + reaction
  'r1_first_reaction', 'r2_first_worry',
  // Price test (original schema)
  'b1_send_bid', 'b2_fair_price', 'b2_price_unit', 'b3_bid_style',
  'r3_yes_reason', 'r3_no_reason',
  // Close
  'c1_referral', 'bid_pack_pitched', 'bid_pack_decline_reason', 'what_they_said',
  'c2_first_refusal', 'interest_rating', 'notes'
];

// Path parsing follows the lesson learned the hard way in admin-team.js
// (2026-09-04 fix, e2246a2): Netlify hands a redirected function's
// event.path as the ORIGINAL incoming request path, e.g.
// "/api/admin/provider-outreach/prospects/abc123" — never the rewritten
// .netlify/functions/... destination. Match explicit whole-prefix patterns
// only; never chain partial-word regex replaces, which is what silently
// mangled "team-invites" into "-invites" last time.
function normalizePath(raw) {
  var patterns = [
    [/^\/?\.netlify\/functions\/admin-provider-outreach\/?/, ''],
    [/^\/?api\/admin\/provider-outreach\/?/, '']
  ];
  for (var i = 0; i < patterns.length; i++) {
    if (patterns[i][0].test(raw)) {
      return raw.replace(patterns[i][0], '').replace(/\/+$/, '');
    }
  }
  return raw.replace(/^\/+/, '').replace(/\/+$/, '');
}

function jsonResponse(statusCode, data) {
  return {
    statusCode: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS'
    },
    body: JSON.stringify(data)
  };
}

// Rollup math, matching the definitions on the original workbook's Rollup
// sheet exactly (README + Rollup sheet notes, 2026-08-20):
//   Dialed        = rows where Attempt 1 is filled in
//   Live contact  = any Outcome starting with "Reached"
//   Surveys complete = Outcome containing "survey complete"
//   Wants Jordan  = Outcome containing "wants Jordan"
//   Reach rate    = Live contact / Dialed
//   Survey rate   = Surveys complete / Dialed
//   Threshold met = Surveys complete >= 6 (minimum before drawing any
//                   conclusion about a market — README, "Target" row)
//   B1 Yes        = B1 answer starting with "Yes"
//   Avg fair price (per BID only) = avg(B2 fair price) where B2 price unit
//                   indicates "per bid" (a "per customer won" answer is not
//                   a bid price and must not be averaged in with it)
//   Pack pitched  = Bid Pack Pitched starting with "Yes"
//   C2 first refusal = C2 first-refusal field is filled in
function computeRollup(prospects) {
  var dialed = 0, live = 0, surveys = 0, wantsJordan = 0, b1Yes = 0, packPitched = 0, c2 = 0;
  var priority1 = 0;
  var bidPrices = [];

  prospects.forEach(function (p) {
    if (p.priority === 1) priority1++;
    if (p.attempt_1) dialed++;
    var outcome = (p.outcome || '').trim();
    if (/^reached/i.test(outcome)) live++;
    if (/survey complete/i.test(outcome)) surveys++;
    if (/wants jordan/i.test(outcome)) wantsJordan++;
    if (/^yes/i.test(p.b1_send_bid || '')) b1Yes++;
    if (/^yes/i.test(p.bid_pack_pitched || '')) packPitched++;
    if (p.c2_first_refusal && String(p.c2_first_refusal).trim()) c2++;
    if (p.b2_fair_price != null && /per\s*bid/i.test(p.b2_price_unit || '')) {
      bidPrices.push(Number(p.b2_fair_price));
    }
  });

  var reachRate = dialed > 0 ? Math.round((live / dialed) * 1000) / 10 : null;
  var surveyRate = dialed > 0 ? Math.round((surveys / dialed) * 1000) / 10 : null;
  var b1YesRate = surveys > 0 ? Math.round((b1Yes / surveys) * 1000) / 10 : null;
  var avgFairPrice = bidPrices.length
    ? Math.round((bidPrices.reduce(function (a, b) { return a + b; }, 0) / bidPrices.length) * 100) / 100
    : null;
  var thresholdMet = surveys >= 6;

  return {
    prospects: prospects.length,
    priority_1: priority1,
    dialed: dialed,
    live_contact: live,
    surveys_complete: surveys,
    wants_jordan: wantsJordan,
    reach_rate_pct: reachRate,
    survey_rate_pct: surveyRate,
    threshold_met: thresholdMet,
    threshold_label: thresholdMet ? 'Yes' : ('No — need ' + Math.max(0, 6 - surveys) + ' more'),
    b1_yes: b1Yes,
    b1_yes_rate_pct: b1YesRate,
    avg_fair_price_per_bid: avgFairPrice,
    n_priced_per_bid: bidPrices.length,
    pack_pitched: packPitched,
    c2_first_refusal: c2
  };
}

async function handleRollup(supabase) {
  var marketsRes = await supabase.from('provider_call_markets').select('market, market_rank').order('market_rank', { ascending: true });
  if (marketsRes.error) throw new Error(marketsRes.error.message);

  var prospectsRes = await supabase.from('provider_call_prospects')
    .select('market, priority, attempt_1, outcome, b1_send_bid, b2_fair_price, b2_price_unit, bid_pack_pitched, c2_first_refusal');
  if (prospectsRes.error) throw new Error(prospectsRes.error.message);

  var byMarket = {};
  (prospectsRes.data || []).forEach(function (p) {
    if (!byMarket[p.market]) byMarket[p.market] = [];
    byMarket[p.market].push(p);
  });

  var markets = (marketsRes.data || []).map(function (m) {
    var rollup = computeRollup(byMarket[m.market] || []);
    return Object.assign({ market: m.market, market_rank: m.market_rank }, rollup);
  });

  var allMarkets = computeRollup(prospectsRes.data || []);

  return { markets: markets, all_markets: allMarkets };
}

async function handleMarkets(supabase) {
  var res = await supabase.from('provider_call_markets').select('*').order('market_rank', { ascending: true });
  if (res.error) throw new Error(res.error.message);
  return { markets: res.data || [] };
}

async function handleBidPacks(supabase) {
  var res = await supabase.from('provider_call_bid_packs').select('*').order('sort_order', { ascending: true });
  if (res.error) throw new Error(res.error.message);
  return { bid_packs: res.data || [] };
}

async function handleProspects(supabase, qs) {
  var market = qs.market || '';
  if (!market) throw Object.assign(new Error('market query parameter is required'), { statusCode: 400 });
  var res = await supabase.from('provider_call_prospects')
    .select('*')
    .eq('market', market)
    .order('priority', { ascending: true })
    .order('row_number', { ascending: true });
  if (res.error) throw new Error(res.error.message);
  return { prospects: res.data || [] };
}

async function handleUpdateProspect(supabase, id, body) {
  if (!id) throw Object.assign(new Error('Prospect id is required'), { statusCode: 400 });
  var update = {};
  EDITABLE_FIELDS.forEach(function (f) {
    if (Object.prototype.hasOwnProperty.call(body, f)) update[f] = body[f];
  });
  if (Object.keys(update).length === 0) {
    throw Object.assign(new Error('No editable fields provided'), { statusCode: 400 });
  }
  var res = await supabase.from('provider_call_prospects').update(update).eq('id', id).select().maybeSingle();
  if (res.error) throw new Error(res.error.message);
  if (!res.data) throw Object.assign(new Error('Prospect not found'), { statusCode: 404 });
  return { prospect: res.data };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();

  var supabase = utils.createSupabaseClient();
  if (!supabase) return jsonResponse(500, { error: 'Server configuration error' });

  var admin = await utils.authenticateAdminSection(event, supabase, 'marketing-outreach');
  if (!admin) return jsonResponse(401, { error: 'Authentication required' });

  var path = normalizePath(event.path || '');
  var method = event.httpMethod;
  var qs = event.queryStringParameters || {};
  var body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch (e) { body = {}; }
  }

  try {
    if (method === 'GET' && path === 'rollup') {
      return jsonResponse(200, await handleRollup(supabase));
    }
    if (method === 'GET' && path === 'markets') {
      return jsonResponse(200, await handleMarkets(supabase));
    }
    if (method === 'GET' && path === 'bid-packs') {
      return jsonResponse(200, await handleBidPacks(supabase));
    }
    if (method === 'GET' && path === 'prospects') {
      return jsonResponse(200, await handleProspects(supabase, qs));
    }
    var updateMatch = /^prospects\/([^\/]+)$/.exec(path);
    if (method === 'PUT' && updateMatch) {
      return jsonResponse(200, await handleUpdateProspect(supabase, updateMatch[1], body));
    }

    return jsonResponse(404, { error: 'Unknown route: ' + method + ' ' + path });
  } catch (e) {
    console.error('[admin-provider-outreach]', e);
    return jsonResponse(e.statusCode || 500, { error: e.message || 'Internal error' });
  }
};

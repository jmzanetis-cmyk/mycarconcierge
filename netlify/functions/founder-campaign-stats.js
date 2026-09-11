// GET /api/founder/campaign-stats
//
// Serves loadWefunderWidget() in www/founder-dashboard.js -- previously
// dead-called at a route with no handler anywhere (server.js's dev route
// was removed and never ported). 30-min cached scrape of the public
// Wefunder campaign page, restricted to authenticated admins or active
// founders (member_founder_profiles.status='active').
//
// Distinct from /api/founder/campaign-link-stats (a DIFFERENT, still-live
// dev-only route reading founder_campaign_clicks/founder_campaign_investments
// for a founder's own referral-link performance) -- do not conflate the two.
'use strict';

var utils = require('./utils');

var wefunderStatsCache = null;
var CACHE_TTL_MS = 30 * 60 * 1000;
var CAMPAIGN_URL = 'https://wefunder.com/my.car.concierge';

function fallbackStats(errorFlag) {
  var stats = { raised: 0, investors: 0, goal: 0, valuation: null, daysLeft: null, campaignUrl: CAMPAIGN_URL, live: false };
  if (errorFlag) stats.error = true;
  return stats;
}

async function scrapeStats() {
  var stats = fallbackStats(false);
  var res = await fetch(CAMPAIGN_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MyCar/1.0)', 'Accept': 'text/html,application/xhtml+xml' }
  });
  var html = await res.text();

  var nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      var nd = JSON.parse(nextDataMatch[1]);
      var c = (nd && nd.props && nd.props.pageProps && (nd.props.pageProps.campaign || nd.props.pageProps.Company || nd.props.pageProps.company)) || {};
      stats.raised = parseFloat(c.amount_raised || c.amountRaised || c.total_raised || 0);
      stats.investors = parseInt(c.num_investors || c.numInvestors || c.investor_count || 0, 10);
      stats.goal = parseFloat(c.maximum_goal || c.goal_amount || c.minimum_goal || c.goal || 0);
      stats.valuation = c.valuation || c.pre_money_valuation || null;
      if (c.deadline_date || c.deadline || c.closes_at) {
        var deadline = new Date(c.deadline_date || c.deadline || c.closes_at);
        stats.daysLeft = Math.max(0, Math.ceil((deadline - new Date()) / 86400000));
      }
      stats.live = stats.raised > 0 || stats.investors > 0;
    } catch (e) {
      // fall through to regex fallback below
    }
  }

  if (!stats.live) {
    var raisedMatch = html.match(/\$([0-9,]+(?:\.[0-9]+)?[KkMm]?)\s*(?:raised|committed)/i);
    if (raisedMatch) {
      var raw = raisedMatch[1].replace(/,/g, '');
      stats.raised = /[Kk]$/.test(raw) ? parseFloat(raw) * 1000 : (/[Mm]$/.test(raw) ? parseFloat(raw) * 1000000 : parseFloat(raw));
    }
    var invMatch = html.match(/([0-9,]+)\s+investors?/i);
    if (invMatch) stats.investors = parseInt(invMatch[1].replace(/,/g, ''), 10);
    stats.live = stats.raised > 0 || stats.investors > 0;
  }

  return stats;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'GET') return utils.errorResponse(405, 'Method not allowed');

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(503, 'Service temporarily unavailable');

  var authHeader = event.headers['authorization'] || event.headers['Authorization'];
  var token = authHeader ? String(authHeader).replace(/^Bearer\s+/i, '').trim() : null;
  if (!token) return utils.errorResponse(401, 'Unauthorized');

  var authRes = await supabase.auth.getUser(token);
  if (authRes.error || !authRes.data || !authRes.data.user) return utils.errorResponse(401, 'Unauthorized');
  var user = authRes.data.user;

  var isAdmin = (user.app_metadata && user.app_metadata.role === 'admin') || (user.user_metadata && user.user_metadata.role === 'admin');
  if (!isAdmin) {
    try {
      var fpRes = await supabase
        .from('member_founder_profiles')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      if (!fpRes.data) return utils.errorResponse(403, 'Founder access required');
    } catch (e) {
      return utils.errorResponse(403, 'Founder access required');
    }
  }

  var now = Date.now();
  if (wefunderStatsCache && (now - wefunderStatsCache.ts) < CACHE_TTL_MS) {
    return utils.successResponse(wefunderStatsCache.data);
  }

  try {
    var stats = await scrapeStats();
    wefunderStatsCache = { ts: now, data: stats };
    return utils.successResponse(stats);
  } catch (err) {
    console.error('[founder-campaign-stats] scrape error:', err.message);
    var fallback = (wefunderStatsCache && wefunderStatsCache.data) || fallbackStats(true);
    return utils.successResponse(fallback);
  }
};

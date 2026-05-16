// netlify/functions/survey-area-check.js — Task #343
//
// Public endpoint for the marketing survey at /survey to drive the
// post-onboarding confirmation copy + CTA based on whether MCC is
// live in the prospect's ZIP. Mounted at GET /api/survey/area-check
// via www/_redirects.
//
// Ported from www/server.js (GET /api/survey/area-check, ~line 44889).
// Same behaviour: looks up the ZIP in live_service_areas (table may
// not exist yet pre-launch — that's fine, returns live:false). On
// Supabase misconfiguration, returns live:false with the waitlist
// message — exact dev parity (the dev handler also degrades to the
// pre-launch waitlist copy when supabase is unavailable or the table
// is missing).
//
// Per-instance public-tier rate limit (30 req / 60 s per IP) matches
// the dev limiter.

var utils = require('./utils');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'GET')     return utils.errorResponse(405, 'Method not allowed');

  var rl = utils.publicRateLimit('survey-area-check', utils.getClientIp(event));
  if (!rl.allowed) return utils.rateLimitedResponse(rl);

  var qs  = event.queryStringParameters || {};
  var zip = qs.zip ? String(qs.zip).trim().slice(0, 10) : '';
  if (!zip) return utils.errorResponse(400, 'zip is required');

  var isLive = false;
  var supabase = utils.createSupabaseClient();
  if (supabase) {
    try {
      var areaResult = await supabase
        .from('live_service_areas')
        .select('zip')
        .eq('zip', zip)
        .eq('active', true)
        .maybeSingle();
      // Dev parity: ANY error here (missing table, RLS, etc.) means
      // pre-launch — we silently keep isLive=false. Don't 5xx.
      if (!areaResult.error && areaResult.data) isLive = true;
    } catch (areaErr) {
      // Table not created yet — MCC is pre-launch everywhere
      isLive = false;
    }
  }

  var message = isLive
    ? 'MCC is live in your area — explore the platform now!'
    : 'You\'re on the waitlist. We\'ll notify you the moment MCC launches near you.';
  return utils.successResponse({ ok: true, live: isLive, zip: zip, message: message });
};

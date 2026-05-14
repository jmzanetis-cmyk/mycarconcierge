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

var RATE_LIMIT_MAX = 30;
var RATE_LIMIT_WINDOW_MS = 60000;
var rateBuckets = new Map();

function getClientIp(event) {
  var headers = event.headers || {};
  var fwd = headers['x-forwarded-for'] || headers['X-Forwarded-For'] || '';
  if (fwd) return String(fwd).split(',')[0].trim();
  return headers['x-nf-client-connection-ip']
      || headers['client-ip']
      || (event.clientContext && event.clientContext.ip)
      || 'unknown';
}

function checkRateLimit(prefix, ip) {
  var now = Date.now();
  var key = prefix + ':' + ip;
  var bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { start: now, count: 1 });
    if (rateBuckets.size > 1000) {
      for (var k of rateBuckets.keys()) {
        var b = rateBuckets.get(k);
        if (now - b.start > RATE_LIMIT_WINDOW_MS) rateBuckets.delete(k);
      }
    }
    return { allowed: true };
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfterMs: RATE_LIMIT_WINDOW_MS - (now - bucket.start) };
  }
  bucket.count += 1;
  return { allowed: true };
}

function rateLimited(rl) {
  return {
    statusCode: 429,
    headers: Object.assign({}, utils.headers, {
      'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000))
    }),
    body: JSON.stringify({ error: 'Too many requests. Please try again shortly.' })
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'GET')     return utils.errorResponse(405, 'Method not allowed');

  var rl = checkRateLimit('survey-area-check', getClientIp(event));
  if (!rl.allowed) return rateLimited(rl);

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

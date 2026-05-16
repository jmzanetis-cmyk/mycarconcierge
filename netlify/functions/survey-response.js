// netlify/functions/survey-response.js — Task #343
//
// Public endpoint for the marketing survey at /survey to create / update
// a row in survey_responses. Mounted at POST /api/survey/response via
// www/_redirects.
//
// Ported from www/server.js (POST /api/survey/response, ~line 44552).
// Same behaviour: if `response_id` is supplied, the existing row is
// updated with whichever of email / discovery_answers / interested /
// first_name are present in the payload. Otherwise a fresh row is
// inserted with the supplied feature_ratings / discovery_answers /
// interested / session_id / email / first_name and a sha256-truncated
// ip_hash.
//
// Per-instance public-tier rate limit (30 req / 60 s per IP) matches
// the dev limiter. On Supabase misconfiguration the handler returns
// 200 with id:null so the frontend's existing branchless flow keeps
// working — exact dev parity (the dev handler returns id:null when
// supabase is null too).

var crypto = require('node:crypto');
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
  if (event.httpMethod !== 'POST') return utils.errorResponse(405, 'Method not allowed');

  var ip = getClientIp(event);
  var rl = checkRateLimit('survey-response', ip);
  if (!rl.allowed) return rateLimited(rl);

  var body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return utils.errorResponse(400, 'Invalid JSON body'); }

  var supabase = utils.createSupabaseClient();

  try {
    var feature_ratings   = body.feature_ratings;
    var discovery_answers = body.discovery_answers;
    var interested        = body.interested;
    var session_id        = body.session_id;
    var email             = body.email;
    var response_id       = body.response_id;
    var first_name        = body.first_name;

    // Update path — incremental save to an existing survey_responses row.
    if (response_id) {
      if (supabase) {
        var updatePayload = {};
        if (email)             updatePayload.email = String(email).trim().toLowerCase().slice(0, 254);
        if (discovery_answers) updatePayload.discovery_answers = discovery_answers;
        if (typeof interested === 'boolean') updatePayload.interested = interested;
        if (first_name)        updatePayload.first_name = String(first_name).trim().slice(0, 100);
        if (Object.keys(updatePayload).length > 0) {
          await supabase.from('survey_responses').update(updatePayload).eq('id', response_id);
        }
      }
      return utils.successResponse({ ok: true, id: response_id });
    }

    // Insert path — fresh survey_responses row.
    var ipHash = ip && ip !== 'unknown'
      ? crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16)
      : null;
    var inserted = null;
    if (supabase) {
      var insertResult = await supabase.from('survey_responses').insert({
        feature_ratings:   feature_ratings || null,
        discovery_answers: discovery_answers || null,
        interested:        typeof interested === 'boolean' ? interested : null,
        session_id:        session_id || null,
        email:             email      ? String(email).trim().toLowerCase().slice(0, 254) : null,
        first_name:        first_name ? String(first_name).trim().slice(0, 100) : null,
        ip_hash:           ipHash
      }).select('id').single();
      if (insertResult.error) {
        console.error('[survey-response] insert error:',
          insertResult.error.message, insertResult.error.details || '');
        // Dev parity: dev never throws here either — `inserted` just
        // stays null and the response still comes back 200 with id:null.
      } else {
        inserted = insertResult.data;
      }
    }

    return utils.successResponse({ ok: true, id: inserted ? inserted.id : null });
  } catch (err) {
    console.error('[survey-response] unexpected error:', err && err.message ? err.message : err);
    return utils.errorResponse(500, 'Failed to save survey response');
  }
};

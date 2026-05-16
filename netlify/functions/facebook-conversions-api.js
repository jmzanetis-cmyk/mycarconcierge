// Facebook Conversions API (CAPI) forwarder — Task #184
//
// Server-side mirror for the Facebook Pixel events fired by www/fb-pixel.js.
// Used for events that need to land in Events Manager even when the user is
// no longer in the browser (e.g. Stripe webhook fires "Purchase" hours after
// the user closed the tab).
//
// Routes (mounted at /api/fb/conversions in www/_redirects):
//
//   POST /api/fb/conversions
//     body: { event_name, event_id?, event_source_url?, action_source?, user_data?, custom_data? }
//
//     event_name      Facebook standard event (Lead, CompleteRegistration,
//                     Subscribe, Purchase, etc.). Required.
//     event_id        Optional dedup key — pair this with the same event_id
//                     used on the browser-side fbq('track', ev, params, {eventID})
//                     so Facebook collapses duplicate browser+server events.
//     event_source_url The page URL the conversion originated on (recommended).
//     action_source   'website' (default), 'system_generated', etc.
//     user_data       { em, ph, fn, ln, ct, st, zp, country, external_id, ... }
//                     Plain values are SHA-256 hashed before sending unless
//                     they already look hashed (64 hex chars).
//     custom_data     { value, currency, content_name, content_category, ... }
//
// Required environment variables (set in Netlify):
//
//   FACEBOOK_PIXEL_ID         — pixel ID this CAPI forwarder posts to.
//   FACEBOOK_CAPI_TOKEN       — long-lived system-user access token from
//                               Events Manager → Settings → Conversions API.
//   FACEBOOK_TEST_EVENT_CODE  — optional. If present, every event is sent
//                               with this test_event_code so it shows up in
//                               the Events Manager "Test Events" tab without
//                               polluting production attribution.
//
// If either of the first two env vars is missing, the function returns 503 so
// callers can degrade gracefully (the browser pixel still works on its own).

var crypto = require('crypto');
var https = require('https');

var FB_GRAPH_VERSION = 'v23.0';

function jsonResponse(statusCode, bodyObj) {
  return {
    statusCode: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    },
    body: JSON.stringify(bodyObj)
  };
}

// Hash a single user-data field per Facebook's spec (lowercased + trimmed,
// then SHA-256 hex). Phones strip non-digits before hashing. If the value
// already looks like a SHA-256 hex digest, pass it through unchanged.
function hashField(name, value) {
  if (value === null || value === undefined) return null;
  var s = String(value).trim();
  if (!s) return null;
  if (/^[a-f0-9]{64}$/i.test(s)) return s.toLowerCase();
  if (name === 'ph') s = s.replace(/[^0-9]/g, '');
  else s = s.toLowerCase();
  if (!s) return null;
  return crypto.createHash('sha256').update(s).digest('hex');
}

// Fields Facebook expects to be SHA-256 hashed before being sent.
var HASHED_FIELDS = ['em', 'ph', 'fn', 'ln', 'ct', 'st', 'zp', 'country', 'external_id', 'db', 'ge'];

function buildUserData(input, headers) {
  input = input || {};
  var out = {};
  for (var i = 0; i < HASHED_FIELDS.length; i++) {
    var k = HASHED_FIELDS[i];
    if (input[k] !== undefined && input[k] !== null && input[k] !== '') {
      var hashed = hashField(k, input[k]);
      if (hashed) out[k] = hashed;
    }
  }
  // Pass through Facebook click/browser cookies if the caller provided them
  // (these don't get hashed). The browser pixel sets fbp + fbc as cookies; the
  // caller should forward them so CAPI events match the browser session.
  if (input.fbp) out.fbp = String(input.fbp);
  if (input.fbc) out.fbc = String(input.fbc);

  // Best-effort pickup of client IP + user agent from the request headers so
  // Facebook can attribute the event to the right ad click. Both fields are
  // sent in plain text per the CAPI spec.
  var ip = null;
  var ua = null;
  if (headers) {
    var fwd = headers['x-forwarded-for'] || headers['X-Forwarded-For'];
    if (fwd) ip = String(fwd).split(',')[0].trim();
    if (!ip) ip = headers['x-nf-client-connection-ip'] || headers['client-ip'] || null;
    ua = headers['user-agent'] || headers['User-Agent'] || null;
  }
  if (input.client_ip_address) ip = input.client_ip_address;
  if (input.client_user_agent) ua = input.client_user_agent;
  if (ip) out.client_ip_address = ip;
  if (ua) out.client_user_agent = ua;
  return out;
}

function postToFacebook(pixelId, token, payload) {
  var body = Buffer.from(JSON.stringify(payload), 'utf8');
  var path = '/' + FB_GRAPH_VERSION + '/' + encodeURIComponent(pixelId)
    + '/events?access_token=' + encodeURIComponent(token);
  var opts = {
    method: 'POST',
    hostname: 'graph.facebook.com',
    path: path,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': body.length
    }
  };
  return new Promise(function(resolve, reject) {
    var req = https.request(opts, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var txt = Buffer.concat(chunks).toString('utf8');
        var parsed = null;
        try { parsed = JSON.parse(txt); } catch (_e) { parsed = { raw: txt }; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return jsonResponse(204, {});
  }
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  var pixelId = process.env.FACEBOOK_PIXEL_ID;
  var token = process.env.FACEBOOK_CAPI_TOKEN;
  if (!pixelId || !token) {
    return jsonResponse(503, {
      error: 'capi_not_configured',
      message: 'FACEBOOK_PIXEL_ID and FACEBOOK_CAPI_TOKEN must be set in Netlify env.'
    });
  }

  var body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (_e) {
    return jsonResponse(400, { error: 'invalid_json' });
  }

  var eventName = body.event_name;
  if (!eventName || typeof eventName !== 'string') {
    return jsonResponse(400, { error: 'missing_event_name' });
  }

  var headers = event.headers || {};
  var fbEvent = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: body.action_source || 'website',
    event_source_url: body.event_source_url || headers.referer || headers.Referer || undefined,
    event_id: body.event_id || undefined,
    user_data: buildUserData(body.user_data, headers),
    custom_data: body.custom_data || undefined
  };

  // Strip undefined keys so the JSON sent to Facebook stays tidy.
  Object.keys(fbEvent).forEach(function(k) {
    if (fbEvent[k] === undefined) delete fbEvent[k];
  });

  var payload = { data: [fbEvent] };
  if (process.env.FACEBOOK_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.FACEBOOK_TEST_EVENT_CODE;
  }

  try {
    var fbResp = await postToFacebook(pixelId, token, payload);
    if (fbResp.status >= 200 && fbResp.status < 300) {
      return jsonResponse(200, { ok: true, fb: fbResp.body });
    }
    return jsonResponse(502, { ok: false, fb_status: fbResp.status, fb: fbResp.body });
  } catch (err) {
    return jsonResponse(500, { ok: false, error: err && err.message ? err.message : String(err) });
  }
};

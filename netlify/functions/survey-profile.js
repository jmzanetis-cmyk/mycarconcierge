// netlify/functions/survey-profile.js — Task #212
//
// Public lead-capture endpoint for the marketing survey at /survey.
// Mounted at POST /api/survey/profile via www/_redirects.
//
// History: this handler used to live in the dead shadow tree at
// www/netlify/functions/ which Netlify never deployed (the canonical
// functions dir per the root netlify.toml is /netlify/functions/).
// Task #208 deleted the shadow tree, exposing the long-standing 404
// for every prospect submitting the live survey form. This file ports
// the dev logic from www/server.js (POST /api/survey/profile, ~line
// 44930) into the canonical functions dir so it actually ships.
//
// Behaviour mirrors the dev handler:
//   - Validates first_name + email (others optional, last_name nullable)
//   - If survey_response_id is provided, updates that survey_responses
//     row with the contact fields too
//   - Inserts into customer_profiles with the same per-field truncation
//     limits used by dev (100 / 254 / 30 / 20 / 10 / 60 / 80 chars)
//   - On unique-email collision (Postgres 23505), looks up the existing
//     row and returns { ok:true, id, duplicate:true } instead of 500
//   - Best-effort in-memory rate limit matching the dev "public" tier
//     (30 requests / 60 s per IP). Per-instance only — Netlify cold
//     starts will reset the counter, but it still blunts a single
//     instance being hammered, which is what the dev limiter does too.

var utils = require('./utils');

// ---- Best-effort per-instance rate limit ---------------------------
// Matches www/server.js RATE_LIMIT_TIERS.public { limit:30, windowMs:60000 }.
var RATE_LIMIT_MAX = 30;
var RATE_LIMIT_WINDOW_MS = 60000;
var rateBuckets = new Map();

function getClientIp(event) {
  var headers = event.headers || {};
  var fwd = headers['x-forwarded-for'] || headers['X-Forwarded-For'] || '';
  if (fwd) {
    return String(fwd).split(',')[0].trim();
  }
  return headers['x-nf-client-connection-ip']
      || headers['client-ip']
      || event.clientContext && event.clientContext.ip
      || 'unknown';
}

function checkRateLimit(ip) {
  var now = Date.now();
  var key = 'survey-profile:' + ip;
  var bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { start: now, count: 1 });
    // Opportunistic cleanup so the Map can't grow unbounded between cold starts.
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

function trim(value, max) {
  if (value === undefined || value === null) return null;
  return String(value).trim().slice(0, max);
}

function trimEmail(value) {
  if (!value) return null;
  return String(value).trim().toLowerCase().slice(0, 254);
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return utils.optionsResponse();
  }
  if (event.httpMethod !== 'POST') {
    return utils.errorResponse(405, 'Method not allowed');
  }

  var rl = checkRateLimit(getClientIp(event));
  if (!rl.allowed) {
    return {
      statusCode: 429,
      headers: Object.assign({}, utils.headers, {
        'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000))
      }),
      body: JSON.stringify({ error: 'Too many requests. Please try again shortly.' })
    };
  }

  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return utils.errorResponse(400, 'Invalid JSON body');
  }

  var first_name = body.first_name;
  var email = body.email;
  if (!first_name || !email) {
    return utils.errorResponse(400, 'first_name and email are required');
  }

  var supabase = utils.createSupabaseClient();
  if (!supabase) {
    console.error('[survey-profile] Supabase not configured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)');
    return utils.errorResponse(503, 'Service temporarily unavailable');
  }

  var firstNameTrimmed = trim(first_name, 100);
  var lastNameTrimmed = body.last_name ? trim(body.last_name, 100) : null;
  var emailTrimmed = trimEmail(email);
  var phoneTrimmed = body.phone ? trim(body.phone, 30) : null;
  var zipTrimmed = body.zip ? trim(body.zip, 20) : null;
  var survey_response_id = body.survey_response_id || null;

  try {
    // Mirror dev behaviour: if we have the survey_responses row, update
    // its contact fields too so analytics stays aligned with the profile.
    if (survey_response_id) {
      var updateResult = await supabase.from('survey_responses').update({
        first_name: firstNameTrimmed,
        last_name: lastNameTrimmed,
        email: emailTrimmed,
        phone: phoneTrimmed,
        zip: zipTrimmed
      }).eq('id', survey_response_id);
      if (updateResult.error) {
        // Non-fatal — log and continue with the profile insert.
        console.warn('[survey-profile] survey_responses update failed:', updateResult.error.message);
      }
    }

    var insertResult = await supabase.from('customer_profiles').insert({
      survey_response_id: survey_response_id,
      first_name: firstNameTrimmed,
      // Dev inserts '' (not null) when last_name is missing — preserve that.
      last_name: lastNameTrimmed === null ? '' : lastNameTrimmed,
      email: emailTrimmed,
      phone: phoneTrimmed,
      zip: zipTrimmed,
      vehicle_year: body.vehicle_year ? trim(body.vehicle_year, 10) : null,
      vehicle_make: body.vehicle_make ? trim(body.vehicle_make, 60) : null,
      vehicle_model: body.vehicle_model ? trim(body.vehicle_model, 80) : null
    }).select('id').single();

    if (insertResult.error) {
      // 23505 = unique_violation on the email column. Look up the existing
      // row and return its id so the caller can keep going as if it had
      // just created one.
      if (insertResult.error.code === '23505') {
        var existing = await supabase
          .from('customer_profiles')
          .select('id')
          .eq('email', emailTrimmed)
          .maybeSingle();
        if (existing.data) {
          return utils.successResponse({ ok: true, id: existing.data.id, duplicate: true });
        }
      }
      console.error('[survey-profile] customer_profiles insert error:',
        insertResult.error.message, insertResult.error.details || '');
      return utils.errorResponse(500, 'Failed to save profile');
    }

    return utils.successResponse({
      ok: true,
      id: insertResult.data ? insertResult.data.id : null
    });
  } catch (err) {
    console.error('[survey-profile] unexpected error:', err && err.message ? err.message : err);
    return utils.errorResponse(500, 'Failed to save profile');
  }
};

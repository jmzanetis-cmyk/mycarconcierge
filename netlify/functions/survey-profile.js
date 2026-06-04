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
//     (30 requests / 60 s per IP) via utils.publicRateLimit. Per-instance
//     only — Netlify cold starts will reset the counter, but it still
//     blunts a single instance being hammered, which is what the dev
//     limiter does too.

var utils = require('./utils');
var { sendSms } = require('./_shared/sms');

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

  var rl = utils.publicRateLimit('survey-profile', utils.getClientIp(event));
  if (!rl.allowed) return utils.rateLimitedResponse(rl);

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
  // Parity with dev (www/server.js POST /api/survey/profile): when the
  // Supabase client can't be built (missing SUPABASE_URL /
  // SUPABASE_SERVICE_ROLE_KEY), dev silently returns 200 with id:null
  // because its `inserted` variable stays null. Mirror that exactly so
  // the frontend's `if (!d.id) throw` path triggers the same retry UX
  // in both environments. The misconfiguration is logged loudly so ops
  // can see it.
  if (!supabase) {
    console.error('[survey-profile] Supabase not configured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY) — returning ok:true id:null per dev parity');
    return utils.successResponse({ ok: true, id: null });
  }

  var firstNameTrimmed = trim(first_name, 100);
  var lastNameTrimmed = body.last_name ? trim(body.last_name, 100) : null;
  var emailTrimmed = trimEmail(email);
  var phoneTrimmed = body.phone ? trim(body.phone, 30) : null;
  var zipTrimmed = body.zip ? trim(body.zip, 20) : null;
  var survey_response_id = body.survey_response_id || null;
  var smsOptIn = body.sms_opt_in === true || body.sms_opt_in === 'true';

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
      vehicle_model: body.vehicle_model ? trim(body.vehicle_model, 80) : null,
      sms_opt_in: smsOptIn,
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

    // Send welcome SMS if the prospect opted in and gave a phone number.
    // Respects sms_opt_out / TCPA fail-closed via the shared sendSms helper.
    if (smsOptIn && phoneTrimmed) {
      sendSms({
        supabase,
        toPhone: phoneTrimmed,
        body: 'Welcome to My Car Concierge! Reply STOP at any time to opt out.',
      }).then(function(res) {
        if (!res.sent) console.warn('[survey-profile] welcome SMS skipped:', res.reason);
      }).catch(function(e) {
        console.warn('[survey-profile] welcome SMS error:', e.message);
      });
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

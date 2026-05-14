// netlify/functions/survey-referral-link.js — Task #343
//
// Public endpoint for the marketing survey at /survey to issue a
// shareable referral link to prospects who finish the discovery
// flow. Mounted at POST /api/survey/referral-link via www/_redirects.
//
// Ported from www/server.js (POST /api/survey/referral-link,
// ~line 44730). Same behaviour:
//   - Requires email + at least one of (customer_profile_id,
//     survey_response_id, session_id).
//   - Idempotent: if the customer's auth user already has an open
//     referral row, returns its existing code instead of generating
//     a new one.
//   - Otherwise:
//       * Looks up an existing auth user by email via the `profiles`
//         table (cheaper than auth.admin.listUsers).
//       * If none, creates a "shadow" auth user (email-unconfirmed,
//         random password) so the referrals.referrer_id FK to
//         auth.users is satisfied. The full account is activated
//         later when the prospect completes signup-member.html.
//       * Links the shadow user back onto customer_profiles when
//         possible.
//       * Generates a unique 9-char MCCxxxxxx referral code (up to
//         5 attempts) and inserts into the referrals table with
//         $10 referrer / $10 referred credit (1000 cents each).
//       * Persists the code on survey_responses for traceability.
//   - On unrecoverable failure to issue a code, returns 503 — same
//     as dev — so the frontend can show a retry CTA.
//
// Two rate limits apply, matching dev: per-IP (public tier 30 / 60 s)
// and per-email (3 / 60 s, used as a flood guard against shadow-user
// creation). The per-email cap is intentionally tighter than the
// per-IP one because shadow user creation is much more expensive
// than the IP-level survey reads.

var utils = require('./utils');

var RATE_LIMIT_MAX = 30;
var RATE_LIMIT_WINDOW_MS = 60000;
var EMAIL_RATE_MAX = 3;
var EMAIL_RATE_WINDOW_MS = 60000;
var rateBuckets = new Map();
var emailRateBuckets = new Map();

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

function checkEmailRateLimit(emailLower) {
  var now = Date.now();
  var bucket = emailRateBuckets.get(emailLower);
  if (!bucket || now - bucket.start > EMAIL_RATE_WINDOW_MS) {
    emailRateBuckets.set(emailLower, { start: now, count: 1 });
    if (emailRateBuckets.size > 1000) {
      for (var k of emailRateBuckets.keys()) {
        var b = emailRateBuckets.get(k);
        if (now - b.start > EMAIL_RATE_WINDOW_MS) emailRateBuckets.delete(k);
      }
    }
    return { allowed: true };
  }
  if (bucket.count >= EMAIL_RATE_MAX) {
    return { allowed: false, retryAfterMs: EMAIL_RATE_WINDOW_MS - (now - bucket.start) };
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

// Mirrors www/server.js generateReferralCode (~line 10584). Same
// alphabet (no I, O, 0, 1 — visually unambiguous) and same length
// so codes issued by either path are indistinguishable downstream.
function generateReferralCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code = 'MCC';
  for (var i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'POST')    return utils.errorResponse(405, 'Method not allowed');

  var rl = checkRateLimit('survey-referral', getClientIp(event));
  if (!rl.allowed) return rateLimited(rl);

  var body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return utils.errorResponse(400, 'Invalid JSON body'); }

  var customer_profile_id = body.customer_profile_id;
  var survey_response_id  = body.survey_response_id;
  var session_id          = body.session_id;
  var email               = body.email;

  if (!customer_profile_id && !survey_response_id && !session_id) {
    return utils.errorResponse(400, 'customer_profile_id, survey_response_id, or session_id required');
  }
  if (!email) return utils.errorResponse(400, 'email is required to generate a referral link');

  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(email)) return utils.errorResponse(400, 'Valid email is required');

  var cleanEmail = String(email).trim().toLowerCase();
  var emailRl = checkEmailRateLimit(cleanEmail);
  if (!emailRl.allowed) return rateLimited(emailRl);

  var supabase = utils.createSupabaseClient();
  if (!supabase) {
    // Dev parity: when supabase is unavailable, dev's `referralCode`
    // stays null and the handler 503s.
    console.error('[survey-referral-link] Supabase not configured — cannot issue referral link');
    return utils.errorResponse(503, 'Referral link unavailable. Please try again.');
  }

  try {
    var referralCode = null;

    // Step 1 — idempotency: if the customer already has an auth user
    // with an open referral row, return its existing code.
    if (customer_profile_id) {
      try {
        var profResult = await supabase
          .from('customer_profiles')
          .select('auth_user_id')
          .eq('id', customer_profile_id)
          .maybeSingle();
        if (profResult.data && profResult.data.auth_user_id) {
          var existingRefResult = await supabase
            .from('referrals')
            .select('referral_code')
            .eq('referrer_id', profResult.data.auth_user_id)
            .is('referred_id', null)
            .maybeSingle();
          if (existingRefResult.data && existingRefResult.data.referral_code) {
            referralCode = existingRefResult.data.referral_code;
          }
        }
      } catch (checkErr) {
        console.warn('[survey-referral-link] idempotency check error:', checkErr.message);
      }
    }

    // Step 2 — generate a new referral code if we don't already have one.
    if (!referralCode) {
      var shadowUserId = null;
      try {
        // Look up an existing auth user by email via profiles (cheaper
        // than auth.admin.listUsers, matches dev exactly).
        var existingProfileResult = await supabase
          .from('profiles')
          .select('id')
          .eq('email', cleanEmail)
          .maybeSingle();
        if (existingProfileResult.data && existingProfileResult.data.id) {
          shadowUserId = existingProfileResult.data.id;
          console.log('[survey-referral-link] Found existing auth user via profiles:', shadowUserId);
        } else {
          // Create the shadow auth user.
          var tempPassword = 'SurveyTemp!' + Math.random().toString(36).slice(2, 12);
          var newUserResult = await supabase.auth.admin.createUser({
            email: cleanEmail,
            password: tempPassword,
            email_confirm: false,
            user_metadata: {
              account_type: 'member',
              source: 'discovery_survey',
              customer_profile_id: customer_profile_id || null
            }
          });
          if (newUserResult.error) {
            console.warn('[survey-referral-link] Shadow user creation error:', newUserResult.error.message);
          } else {
            shadowUserId = newUserResult.data && newUserResult.data.user && newUserResult.data.user.id;
            console.log('[survey-referral-link] Created shadow auth user:', shadowUserId);
          }
        }
      } catch (authErr) {
        console.warn('[survey-referral-link] Auth lookup/create error:', authErr.message);
      }

      if (shadowUserId) {
        // Link shadow user back onto customer_profiles when we can.
        if (customer_profile_id) {
          try {
            await supabase.from('customer_profiles')
              .update({ auth_user_id: shadowUserId })
              .eq('id', customer_profile_id);
          } catch (linkErr) {
            console.warn('[survey-referral-link] customer_profile link error:', linkErr.message);
          }
        }

        // Up to 5 attempts to land a unique code.
        var attempts = 0;
        while (!referralCode && attempts < 5) {
          var candidate = generateReferralCode();
          var dupResult = await supabase
            .from('referrals')
            .select('id')
            .eq('referral_code', candidate)
            .maybeSingle();
          if (!dupResult.data) {
            var refInsertResult = await supabase.from('referrals').insert({
              referrer_id:              shadowUserId,
              referral_code:            candidate,
              status:                   'pending',
              referrer_credit_amount:   1000,
              referred_credit_amount:   1000
            });
            if (!refInsertResult.error) {
              referralCode = candidate;
              if (survey_response_id) {
                try {
                  await supabase.from('survey_responses')
                    .update({ referral_code: referralCode })
                    .eq('id', survey_response_id);
                } catch (_) { /* non-fatal */ }
              }
            } else {
              console.warn('[survey-referral-link] referrals insert error:', refInsertResult.error.message);
            }
          }
          attempts++;
        }
      }
    }

    if (!referralCode) {
      return utils.errorResponse(503, 'Referral link unavailable. Please try again.');
    }

    var referralUrl = 'https://mycarconcierge.com/signup-member.html?ref=' + referralCode;
    return utils.successResponse({
      ok: true,
      referral_code: referralCode,
      referral_url:  referralUrl
    });
  } catch (err) {
    console.error('[survey-referral-link] unexpected error:', err && err.message ? err.message : err);
    return utils.errorResponse(500, 'Failed to generate referral link');
  }
};

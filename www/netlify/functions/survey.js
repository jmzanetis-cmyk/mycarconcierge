var utils = require('./utils');
var crypto = require('crypto');

function generateReferralCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code = 'MCC';
  for (var i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return utils.optionsResponse();
  }

  var rawPath = event.path || '';
  var subPath = rawPath
    .replace(/^\/?\.netlify\/functions\/survey\/?/, '')
    .replace(/^\/?api\/survey\/?/, '')
    .split('?')[0]
    .replace(/\/$/, '');

  var supabase = utils.createSupabaseClient();
  var body = {};
  try {
    if (event.body) body = JSON.parse(event.body);
  } catch (e) {}

  var clientIP = (event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown').split(',')[0].trim();

  if (subPath === 'response' && event.httpMethod === 'POST') {
    try {
      var feature_ratings = body.feature_ratings;
      var interested = body.interested;
      var session_id = body.session_id;
      var email = body.email;
      var response_id = body.response_id;
      var discovery_answers = body.discovery_answers;
      var first_name = body.first_name;

      if (response_id) {
        if (supabase) {
          var updatePayload = {};
          if (email) updatePayload.email = email.trim().toLowerCase().slice(0, 254);
          if (discovery_answers) updatePayload.discovery_answers = discovery_answers;
          if (typeof interested === 'boolean') updatePayload.interested = interested;
          if (first_name) updatePayload.first_name = first_name.trim().slice(0, 100);
          if (Object.keys(updatePayload).length > 0) {
            await supabase.from('survey_responses').update(updatePayload).eq('id', response_id);
          }
        }
        return utils.successResponse({ ok: true, id: response_id });
      }

      var ipHash = clientIP ? crypto.createHash('sha256').update(clientIP).digest('hex').slice(0, 16) : null;
      var inserted = null;
      if (supabase) {
        var insResult = await supabase.from('survey_responses').insert({
          feature_ratings: feature_ratings || null,
          discovery_answers: discovery_answers || null,
          interested: typeof interested === 'boolean' ? interested : null,
          session_id: session_id || null,
          email: email ? email.trim().toLowerCase().slice(0, 254) : null,
          first_name: first_name ? first_name.trim().slice(0, 100) : null,
          ip_hash: ipHash
        }).select('id').single();
        inserted = insResult.data;
      }
      return utils.successResponse({ ok: true, id: inserted ? inserted.id : null });
    } catch (err) {
      console.error('[Survey] POST /survey/response error:', err.message);
      return utils.errorResponse(500, 'Failed to save survey response');
    }
  }

  if (subPath === 'abandoned' && event.httpMethod === 'POST') {
    try {
      var ab_email = body.email;
      var ab_response_id = body.response_id;
      var ab_first_name = body.first_name;

      if (!ab_email || !ab_email.includes('@')) {
        return utils.successResponse({ ok: true, skipped: 'no_email' });
      }
      var cleanEmail = ab_email.trim().toLowerCase().slice(0, 254);
      if (supabase) {
        var existing = await supabase
          .from('abandoned_signups')
          .select('id, recovery_email_count')
          .eq('email', cleanEmail)
          .eq('type', 'member')
          .maybeSingle();
        if (!existing.data) {
          try {
            await supabase.from('abandoned_signups').insert({
              email: cleanEmail,
              type: 'member',
              step: 'discovery_survey',
              recovered: false
            });
          } catch (insErr) {
            console.warn('[Survey] abandoned_signups insert error:', insErr.message);
          }
        }
        if (ab_response_id) {
          try {
            await supabase.from('survey_responses')
              .update({
                email: cleanEmail,
                first_name: ab_first_name ? ab_first_name.trim().slice(0, 100) : null
              })
              .eq('id', ab_response_id);
          } catch (upErr) {
            console.warn('[Survey] survey_responses update error:', upErr.message);
          }
        }
      }
      return utils.successResponse({ ok: true });
    } catch (err) {
      console.error('[Survey] POST /survey/abandoned error:', err.message);
      return utils.errorResponse(500, 'Failed to record abandoned survey');
    }
  }

  if (subPath === 'profile' && event.httpMethod === 'POST') {
    try {
      var p_survey_response_id = body.survey_response_id;
      var p_first_name = body.first_name;
      var p_last_name = body.last_name;
      var p_email = body.email;
      var p_phone = body.phone;
      var p_zip = body.zip;
      var p_vehicle_year = body.vehicle_year;
      var p_vehicle_make = body.vehicle_make;
      var p_vehicle_model = body.vehicle_model;

      if (!p_first_name || !p_email) {
        return utils.errorResponse(400, 'first_name and email are required');
      }

      var p_inserted = null;
      if (supabase) {
        if (p_survey_response_id) {
          await supabase.from('survey_responses').update({
            first_name: p_first_name.trim().slice(0, 100),
            last_name:  p_last_name ? p_last_name.trim().slice(0, 100) : null,
            email:      p_email.trim().toLowerCase().slice(0, 254),
            phone:      p_phone ? p_phone.trim().slice(0, 30) : null,
            zip:        p_zip   ? p_zip.trim().slice(0, 20) : null
          }).eq('id', p_survey_response_id);
        }

        var profileInsert = await supabase.from('customer_profiles').insert({
          survey_response_id: p_survey_response_id || null,
          first_name: p_first_name.trim().slice(0, 100),
          last_name:  p_last_name ? p_last_name.trim().slice(0, 100) : '',
          email:      p_email.trim().toLowerCase().slice(0, 254),
          phone:      p_phone ? p_phone.trim().slice(0, 30) : null,
          zip:        p_zip   ? p_zip.trim().slice(0, 20) : null,
          vehicle_year:  p_vehicle_year  ? p_vehicle_year.trim().slice(0, 10) : null,
          vehicle_make:  p_vehicle_make  ? p_vehicle_make.trim().slice(0, 60) : null,
          vehicle_model: p_vehicle_model ? p_vehicle_model.trim().slice(0, 80) : null
        }).select('id').single();

        if (profileInsert.error) {
          var pgCode = profileInsert.error.code;
          if (pgCode === '23505') {
            var existingProfile = await supabase
              .from('customer_profiles')
              .select('id')
              .eq('email', p_email.trim().toLowerCase().slice(0, 254))
              .maybeSingle();
            if (existingProfile.data) {
              return utils.successResponse({ ok: true, id: existingProfile.data.id, duplicate: true });
            }
          }
          console.error('[Survey] customer_profiles insert error:', profileInsert.error.message);
          throw new Error(profileInsert.error.message);
        }
        p_inserted = profileInsert.data;
      }
      return utils.successResponse({ ok: true, id: p_inserted ? p_inserted.id : null });
    } catch (err) {
      console.error('[Survey] POST /survey/profile error:', err.message);
      return utils.errorResponse(500, 'Failed to save profile');
    }
  }

  if (subPath === 'area-check' && event.httpMethod === 'GET') {
    try {
      var qs = event.queryStringParameters || {};
      var zip = (qs.zip || '').trim().slice(0, 10);
      if (!zip) {
        return utils.errorResponse(400, 'zip is required');
      }
      var isLive = false;
      if (supabase) {
        try {
          var areaResult = await supabase
            .from('live_service_areas')
            .select('zip')
            .eq('zip', zip)
            .eq('active', true)
            .maybeSingle();
          if (areaResult.data) isLive = true;
        } catch (areaErr) {
          isLive = false;
        }
      }
      var message = isLive
        ? 'MCC is live in your area — explore the platform now!'
        : "You're on the waitlist. We'll notify you the moment MCC launches near you.";
      return utils.successResponse({ ok: true, live: isLive, zip: zip, message: message });
    } catch (err) {
      console.error('[Survey] GET /survey/area-check error:', err.message);
      return utils.errorResponse(500, 'Area check failed');
    }
  }

  if (subPath === 'referral-link' && event.httpMethod === 'POST') {
    try {
      var rl_customer_profile_id = body.customer_profile_id;
      var rl_survey_response_id = body.survey_response_id;
      var rl_session_id = body.session_id;
      var rl_email = body.email;

      if (!rl_customer_profile_id && !rl_survey_response_id && !rl_session_id) {
        return utils.errorResponse(400, 'customer_profile_id, survey_response_id, or session_id required');
      }
      if (!rl_email) {
        return utils.errorResponse(400, 'email is required to generate a referral link');
      }
      var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      if (!emailRegex.test(rl_email)) {
        return utils.errorResponse(400, 'Valid email is required');
      }

      var referralCode = null;
      if (supabase) {
        if (rl_customer_profile_id) {
          try {
            var profResult = await supabase
              .from('customer_profiles')
              .select('auth_user_id')
              .eq('id', rl_customer_profile_id)
              .maybeSingle();
            if (profResult.data && profResult.data.auth_user_id) {
              var existingRef = await supabase
                .from('referrals')
                .select('referral_code')
                .eq('referrer_id', profResult.data.auth_user_id)
                .is('referred_id', null)
                .maybeSingle();
              if (existingRef.data && existingRef.data.referral_code) {
                referralCode = existingRef.data.referral_code;
              }
            }
          } catch (checkErr) {
            console.warn('[Survey] referral idempotency check error:', checkErr.message);
          }
        }

        if (!referralCode) {
          var shadowUserId = null;
          try {
            var cleanEmailRef = rl_email.trim().toLowerCase();
            var existingProfileRef = await supabase
              .from('profiles')
              .select('id')
              .eq('email', cleanEmailRef)
              .maybeSingle();
            if (existingProfileRef.data && existingProfileRef.data.id) {
              shadowUserId = existingProfileRef.data.id;
            } else {
              var tempPassword = 'SurveyTemp!' + Math.random().toString(36).slice(2, 12);
              var newUserResult = await supabase.auth.admin.createUser({
                email: cleanEmailRef,
                password: tempPassword,
                email_confirm: false,
                user_metadata: {
                  account_type: 'member',
                  source: 'discovery_survey',
                  customer_profile_id: rl_customer_profile_id || null
                }
              });
              if (newUserResult.error) {
                console.warn('[Survey] Shadow user creation error:', newUserResult.error.message);
              } else {
                shadowUserId = newUserResult.data && newUserResult.data.user ? newUserResult.data.user.id : null;
              }
            }
          } catch (authErr) {
            console.warn('[Survey] Auth user lookup/create error:', authErr.message);
          }

          if (shadowUserId) {
            if (rl_customer_profile_id) {
              try {
                await supabase.from('customer_profiles')
                  .update({ auth_user_id: shadowUserId })
                  .eq('id', rl_customer_profile_id);
              } catch (linkErr) {
                console.warn('[Survey] customer_profile auth_user_id update error:', linkErr.message);
              }
            }

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
                  referrer_id: shadowUserId,
                  referral_code: candidate,
                  status: 'pending',
                  referrer_credit_amount: 1000,
                  referred_credit_amount: 1000
                });
                if (!refInsertResult.error) {
                  referralCode = candidate;
                  if (rl_survey_response_id) {
                    try {
                      await supabase.from('survey_responses')
                        .update({ referral_code: referralCode })
                        .eq('id', rl_survey_response_id);
                    } catch (_) {}
                  }
                } else {
                  console.warn('[Survey] referrals insert error:', refInsertResult.error.message);
                }
              }
              attempts++;
            }
          }
        }
      }

      if (!referralCode) {
        return utils.errorResponse(503, 'Referral link unavailable. Please try again.');
      }

      var referralUrl = 'https://mycarconcierge.com/signup-member.html?ref=' + referralCode;
      return utils.successResponse({ ok: true, referral_code: referralCode, referral_url: referralUrl });
    } catch (err) {
      console.error('[Survey] POST /survey/referral-link error:', err.message);
      return utils.errorResponse(500, 'Failed to generate referral link');
    }
  }

  if (subPath === 'job' && event.httpMethod === 'POST') {
    try {
      var j_customer_profile_id = body.customer_profile_id;
      var j_service_type = body.service_type;
      var j_vehicle_description = body.vehicle_description;
      var j_issue_description = body.issue_description;
      var j_urgency = body.urgency;
      var j_zip = body.zip;
      var j_budget_range = body.budget_range;

      if (!j_issue_description) {
        return utils.errorResponse(400, 'issue_description is required');
      }

      var j_inserted = null;
      if (supabase) {
        var jobResult = await supabase.from('job_listings').insert({
          customer_profile_id: j_customer_profile_id || null,
          service_type:        j_service_type        ? j_service_type.slice(0, 80) : null,
          vehicle_description: j_vehicle_description ? j_vehicle_description.slice(0, 300) : null,
          issue_description:   j_issue_description.slice(0, 2000),
          urgency:             j_urgency             ? j_urgency.slice(0, 40) : null,
          zip:                 j_zip                 ? j_zip.trim().slice(0, 20) : null,
          budget_range:        j_budget_range        ? j_budget_range.slice(0, 40) : null
        }).select('id').single();
        j_inserted = jobResult.data;
      }
      return utils.successResponse({ ok: true, id: j_inserted ? j_inserted.id : null });
    } catch (err) {
      console.error('[Survey] POST /survey/job error:', err.message);
      return utils.errorResponse(500, 'Failed to save job listing');
    }
  }

  return utils.errorResponse(404, 'Not found');
};

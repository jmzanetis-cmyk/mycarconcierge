// netlify/functions/survey-abandoned.js — Task #343
//
// Public endpoint for the marketing survey at /survey to record drop-offs
// so the existing follow-up outreach pipeline can re-engage prospects
// who quit before completing. Mounted at POST /api/survey/abandoned via
// www/_redirects.
//
// Ported from www/server.js (POST /api/survey/abandoned, ~line 44602).
// Same behaviour: requires an email to do anything (no email → returns
// 200 with skipped:'no_email'); upserts into abandoned_signups (only
// inserts when there's no existing 'member' row for that email so the
// recovery_email_count counter on existing rows is preserved); and if
// a response_id is passed, also patches that survey_responses row's
// email + first_name. All Supabase failures are logged + swallowed so
// the frontend's fire-and-forget call never sees a 5xx.
//
// Per-instance public-tier rate limit (30 req / 60 s per IP) matches
// the dev limiter. On Supabase misconfiguration the handler returns
// ok:true with no DB side effect, mirroring the dev path.

var utils = require('./utils');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'POST') return utils.errorResponse(405, 'Method not allowed');

  var rl = utils.publicRateLimit('survey-abandoned', utils.getClientIp(event));
  if (!rl.allowed) return utils.rateLimitedResponse(rl);

  var body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return utils.errorResponse(400, 'Invalid JSON body'); }

  var email      = body.email;
  var response_id = body.response_id;
  var first_name = body.first_name;

  // Dev parity: no email → 200 with skipped:'no_email' (NOT a 4xx —
  // the frontend fires this on every drop-off, including ones where
  // we never captured an email).
  if (!email || String(email).indexOf('@') === -1) {
    return utils.successResponse({ ok: true, skipped: 'no_email' });
  }
  var cleanEmail = String(email).trim().toLowerCase().slice(0, 254);

  var supabase = utils.createSupabaseClient();
  try {
    if (supabase) {
      // Only insert when there's no existing 'member' row for this
      // email — preserves recovery_email_count on existing rows so
      // the follow-up cadence isn't reset by a re-drop-off.
      var existingResult = await supabase
        .from('abandoned_signups')
        .select('id, recovery_email_count')
        .eq('email', cleanEmail)
        .eq('type', 'member')
        .maybeSingle();
      if (!existingResult.data) {
        var insertResult = await supabase.from('abandoned_signups').insert({
          email:     cleanEmail,
          type:      'member',
          step:      'discovery_survey',
          recovered: false
        });
        if (insertResult.error) {
          console.warn('[survey-abandoned] abandoned_signups insert error:', insertResult.error.message);
        }
      }
      if (response_id) {
        var upResult = await supabase.from('survey_responses').update({
          email:      cleanEmail,
          first_name: first_name ? String(first_name).trim().slice(0, 100) : null
        }).eq('id', response_id);
        if (upResult.error) {
          console.warn('[survey-abandoned] survey_responses update error:', upResult.error.message);
        }
      }
    }
    return utils.successResponse({ ok: true });
  } catch (err) {
    console.error('[survey-abandoned] unexpected error:', err && err.message ? err.message : err);
    return utils.errorResponse(500, 'Failed to record abandoned survey');
  }
};

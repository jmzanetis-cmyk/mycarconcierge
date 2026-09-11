// GET /api/provider/bgc/report-url/:id
//
// Serves viewBgCheckReport() in www/providers.js / www/providers-settings.js
// -- previously dead-called at /api/bgcheck/report-url/:id, a route with no
// handler anywhere. :id is a provider_background_checks.id row (see
// bgc-provider-status.js, bgc-provider-initiate.js).
//
// Returns { reportUrl } pointed at whichever of report_widget_url /
// report_url is populated. In mock mode (the default -- see
// bgc-provider-initiate.js) neither is ever set, so this correctly
// resolves to reportUrl: null and the frontend shows its own "Report not
// yet available" message; nothing here needs BGC_LIVE_MODE awareness.
'use strict';

var utils = require('./utils');

async function resolveCaller(supabase, authHeader) {
  if (!authHeader) return null;
  var token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  var result = await supabase.auth.getUser(token);
  if (result.error || !result.data || !result.data.user) return null;
  return result.data.user;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'GET') return utils.errorResponse(405, 'Method not allowed');

  var checkId = utils.extractPathParam(event.path);
  if (!checkId || !utils.isValidUUID(checkId)) return utils.errorResponse(400, 'A valid check id is required in path');

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(503, 'Service temporarily unavailable');

  var authHeader = event.headers['authorization'] || event.headers['Authorization'];
  var caller = await resolveCaller(supabase, authHeader);
  if (!caller) return utils.errorResponse(401, 'Authorization required');

  var allowedId = caller.id;
  try {
    var profRes = await supabase
      .from('profiles')
      .select('team_provider_id')
      .eq('id', caller.id)
      .maybeSingle();
    if (profRes.data && profRes.data.team_provider_id) allowedId = profRes.data.team_provider_id;
  } catch (e) {
    // fall back to self-only
  }

  var checkRes = await supabase
    .from('provider_background_checks')
    .select('id, provider_id, report_url, report_widget_url')
    .eq('id', checkId)
    .maybeSingle();

  if (checkRes.error) {
    console.error('[bgc-provider-report-url] query error:', checkRes.error.message);
    return utils.errorResponse(500, 'Failed to load report');
  }
  var check = checkRes.data;
  if (!check || (check.provider_id !== caller.id && check.provider_id !== allowedId)) {
    return utils.errorResponse(404, 'Background check not found');
  }

  return utils.successResponse({ success: true, reportUrl: check.report_widget_url || check.report_url || null });
};

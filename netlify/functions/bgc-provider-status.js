// GET /api/provider/bgc/status/:id
//
// Serves the provider-facing "Background Checks" tab in
// www/providers.js and www/providers-settings.js. Those files have called
// /api/bgcheck/status/:id since before this session started -- a route
// with no handler anywhere (dev or prod); providers-settings.js even
// short-circuited its own renderer with an early return and a "coming
// soon" placeholder rather than fire the known-dead fetch (see the
// "Audit Batch 2 (2026-07-16)" comments removed alongside this file).
//
// Reads provider_background_checks -- NOT employee_background_checks,
// which is a separate, employee-only table built for Task #372's public
// member-facing compliance badges (see provider-bgc-compliance.js,
// initiate-background-check.js). provider_background_checks already
// supports both subject_type='provider' (the provider's own check) and
// subject_type='employee' (a team_members row's check), which is exactly
// the {providerCheck, employeeChecks} shape both frontends already
// render -- this endpoint was simply never built. See
// supabase/migrations/20260911b_provider_background_checks_schema.sql
// for the table's full (newly-documented) shape.
//
// Vendor: BackgroundChecks.com, operated by ClearChecks (confirmed with
// Jordan 2026-09-11; Checkr was retired). See bgc-provider-initiate.js
// for the mock/live ordering flow that populates rows here.
//
// Auth: Bearer JWT. :id must be either the caller's own id, or the id the
// caller is delegated to act as via profiles.team_provider_id (a
// team-member account) -- the same resolution both frontends already
// perform client-side (providerProfile?.team_provider_id || currentUser?.id).
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

  var requestedId = utils.extractPathParam(event.path);
  if (!requestedId) return utils.errorResponse(400, 'provider id required in path');

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(503, 'Service temporarily unavailable');

  var authHeader = event.headers['authorization'] || event.headers['Authorization'];
  var caller = await resolveCaller(supabase, authHeader);
  if (!caller) return utils.errorResponse(401, 'Authorization required');

  // Resolve the provider account this caller may view: themselves, or (for
  // a team-member login) the provider they're delegated to act as.
  var allowedId = caller.id;
  try {
    var profRes = await supabase
      .from('profiles')
      .select('team_provider_id')
      .eq('id', caller.id)
      .maybeSingle();
    if (profRes.data && profRes.data.team_provider_id) allowedId = profRes.data.team_provider_id;
  } catch (e) {
    // profiles.team_provider_id isn't guaranteed to exist in every
    // environment -- fall back to self-only rather than fail the request.
  }

  if (requestedId !== caller.id && requestedId !== allowedId) {
    return utils.errorResponse(403, 'Not authorized to view this provider\'s background checks');
  }
  var providerId = allowedId;

  var rowsRes = await supabase
    .from('provider_background_checks')
    .select('id, provider_id, employee_id, subject_type, subject_first_name, subject_last_name, subject_email, status, invitation_url, report_url, report_widget_url, created_at, updated_at, completed_at')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false });

  if (rowsRes.error) {
    console.error('[bgc-provider-status] query error:', rowsRes.error.message);
    return utils.errorResponse(500, 'Failed to load background check status');
  }

  var all = rowsRes.data || [];
  var providerCheck = null;
  var employeeChecks = [];
  for (var i = 0; i < all.length; i++) {
    var row = all[i];
    if (row.subject_type === 'provider' && !providerCheck) {
      providerCheck = row; // most recent, since rows are ordered created_at desc
    } else if (row.subject_type !== 'provider') {
      employeeChecks.push(row);
    }
  }

  // apiConfigured tells the UI whether a real BackgroundChecks.com key is
  // resolvable for this provider (platform-wide token, or their own
  // enrolled sub-account) -- mirrors the same check bgc-provider-initiate.js
  // makes before ordering a real report.
  var apiConfigured = !!process.env.BGC_API_TOKEN;
  if (!apiConfigured) {
    try {
      var acctRes = await supabase
        .from('provider_background_check_accounts')
        .select('bgchecks_account_id')
        .eq('provider_id', providerId)
        .maybeSingle();
      apiConfigured = !!(acctRes.data && acctRes.data.bgchecks_account_id);
    } catch (e) {
      // leave apiConfigured false
    }
  }

  return utils.successResponse({ success: true, providerCheck: providerCheck, employeeChecks: employeeChecks, apiConfigured: apiConfigured });
};

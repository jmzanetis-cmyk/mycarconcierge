// POST /api/provider/bgc/initiate
//
// Serves submitBackgroundCheck() in both www/providers.js and
// www/providers-settings.js. Both files already had a fully-built modal +
// submit flow; providers.js posted to the dead /api/bgcheck/initiate (no
// handler anywhere), and providers-settings.js posted to
// /api/provider/initiate-background-check (a real, live route -- but that
// handler is Task #372's employee-only compliance system: it requires an
// existing provider_employees.id and has no subjectType='provider' path
// at all, so every provider-self-check request there 400'd on
// "employeeId required", and providerId there is actually a team_members
// row, a different table/id-space than provider_employees).
//
// This endpoint is the real replacement for both: it writes to
// provider_background_checks (see
// supabase/migrations/20260911b_provider_background_checks_schema.sql),
// which has always supported subject_type='provider' (self) and
// subject_type='employee' (employee_id -> a team_members row) in one
// table -- exactly what both frontends' modal already collects. Task
// #372's employee_background_checks / initiate-background-check.js /
// provider-bgc-compliance.js system is untouched by this file.
//
// Body: { providerId, subjectType: 'provider'|'employee', employeeId?,
//         email, firstName, lastName, state?, phone?, providerEmail?,
//         providerName?, fcraAcknowledged? }
//
// Vendor: BackgroundChecks.com, operated by ClearChecks (confirmed with
// Jordan 2026-09-11 -- Checkr was retired). Mirrors the
// mock/live pattern already established in initiate-background-check.js:
//   MOCK (default, BGC_LIVE_MODE !== 'true') -- inserts a pending row with
//     a synthetic report id, no outbound call. This is the mode Jordan
//     asked for when this endpoint was built (2026-09-11) -- flip
//     BGC_LIVE_MODE=true in Netlify once ready to order real reports.
//   LIVE (BGC_LIVE_MODE === 'true') -- calls BackgroundChecks.com's
//     POST {BGC_API_BASE}/orders/new using the provider's enrolled
//     sub-account key (provider_background_check_accounts.bgchecks_api_key,
//     set via the registration widget -> bgc-decrypt-token.js) or the
//     platform-wide BGC_API_TOKEN fallback.
//
// SSN/DOB are NEVER sent to or stored by MCC -- BackgroundChecks.com
// collects PII directly from the applicant via the invite link / widget.
'use strict';

var utils = require('./utils');

var BGC_API_BASE = process.env.BGC_API_BASE || 'https://app.backgroundchecks.com/api';
var BGC_DEFAULT_SKU = process.env.BGC_DEFAULT_REPORT_SKU || 'HIRE1';

function isLiveMode() {
  return String(process.env.BGC_LIVE_MODE || '').toLowerCase() === 'true';
}

async function resolveCaller(supabase, authHeader) {
  if (!authHeader) return null;
  var token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  var result = await supabase.auth.getUser(token);
  if (result.error || !result.data || !result.data.user) return null;
  return result.data.user;
}

// Resolves which BackgroundChecks.com API key to order under: the
// provider's own enrolled sub-account first, falling back to the
// platform-wide token so orders still work (against the platform account)
// before a provider has enrolled. Returns { apiKey, scope }.
async function resolveBgcApiKey(supabase, providerId) {
  var acctRes = await supabase
    .from('provider_background_check_accounts')
    .select('bgchecks_api_key')
    .eq('provider_id', providerId)
    .maybeSingle();
  if (acctRes.data && acctRes.data.bgchecks_api_key) {
    return { apiKey: acctRes.data.bgchecks_api_key, scope: 'sub_account' };
  }
  if (process.env.BGC_API_TOKEN) {
    return { apiKey: process.env.BGC_API_TOKEN, scope: 'platform' };
  }
  return { apiKey: null, scope: null };
}

async function orderBgcReport(apiKey, email) {
  var url = BGC_API_BASE + '/orders/new?api_token=' + encodeURIComponent(apiKey);
  var resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accepts': 'application/json' },
    body: JSON.stringify({
      report_sku: BGC_DEFAULT_SKU,
      order_quantity: 1,
      applicant_emails: [email],
      terms_agree: 'Y',
    }),
  });
  var text = await resp.text();
  var parsed;
  try { parsed = text ? JSON.parse(text) : {}; } catch (e) { parsed = { raw: text }; }
  if (!resp.ok) {
    var err = new Error('bgc_order_failed');
    err.upstreamStatus = resp.status;
    err.upstreamBody = parsed;
    throw err;
  }
  var applicant = parsed && Array.isArray(parsed.applicants) ? parsed.applicants[0] : null;
  var reportKey = applicant && applicant.report_key;
  var inviteUrl = applicant && applicant.applicant_invite_url;
  if (!reportKey) {
    var err2 = new Error('bgc_no_report_key');
    err2.upstreamStatus = resp.status;
    err2.upstreamBody = parsed;
    throw err2;
  }
  return { reportKey: reportKey, inviteUrl: inviteUrl || null };
}

async function alertAdminOfMock(reportId, providerId) {
  var adminTo = process.env.ADMIN_EMAIL || process.env.MCC_FROM_EMAIL;
  var resendKey = process.env.RESEND_API_KEY;
  if (!adminTo || !resendKey) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.MCC_FROM_EMAIL || 'no-reply@mycarconcierge.com',
        to: adminTo,
        subject: '[MCC] Background check ordered in MOCK mode (provider tab)',
        html: '<h2>Background Check Mocked</h2>' +
          '<p>A provider-tab background check was requested but <strong>BGC_LIVE_MODE is not enabled</strong>.</p>' +
          '<p>A mock report ID was returned and no real check was ordered.</p>' +
          '<p><strong>Mock report ID:</strong> ' + reportId + '</p>' +
          '<p><strong>Provider ID:</strong> ' + (providerId || 'unknown') + '</p>',
      }),
    });
  } catch (e) {
    // best-effort only
  }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'POST') return utils.errorResponse(405, 'Method not allowed');

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(503, 'Service temporarily unavailable');

  var authHeader = event.headers['authorization'] || event.headers['Authorization'];
  var caller = await resolveCaller(supabase, authHeader);
  if (!caller) return utils.errorResponse(401, 'Authorization required');

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return utils.errorResponse(400, 'Invalid JSON'); }

  // Resolve which provider account this check is filed under: the caller
  // themselves, or (team-member login) the provider they're delegated to
  // act as -- never trust body.providerId blindly.
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
  var requestedProviderId = (body.providerId || '').trim();
  if (requestedProviderId && requestedProviderId !== caller.id && requestedProviderId !== allowedId) {
    return utils.errorResponse(403, 'Not authorized to initiate a background check for this provider');
  }
  var providerId = allowedId;

  var subjectType = body.subjectType === 'employee' ? 'employee' : 'provider';
  var email = (body.email || '').trim();
  var firstName = (body.firstName || '').trim();
  var lastName = (body.lastName || '').trim();
  if (!email || !firstName || !lastName) {
    return utils.errorResponse(400, 'email, firstName, and lastName are required');
  }

  var employeeId = null;
  if (subjectType === 'employee') {
    employeeId = (body.employeeId || '').trim();
    if (!employeeId) return utils.errorResponse(400, 'employeeId is required for an employee check');
    try {
      var memberRes = await supabase
        .from('team_members')
        .select('id, provider_id')
        .eq('id', employeeId)
        .eq('provider_id', providerId)
        .maybeSingle();
      if (memberRes.error || !memberRes.data) {
        return utils.errorResponse(404, 'Team member not found for this provider');
      }
    } catch (e) {
      return utils.errorResponse(500, 'Failed to verify team member');
    }
  }

  var reportId;
  var inviteUrl = null;
  var mocked = false;
  var mode;

  if (!isLiveMode()) {
    mocked = true;
    mode = 'mock';
    reportId = 'mock_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    console.error(
      '[bgc-provider-initiate] BGC_LIVE_MODE is not enabled — background check is MOCKED.' +
      ' Provider will appear screened but no real check was ordered.' +
      ' Set BGC_LIVE_MODE=true in Netlify environment variables to activate live checks.'
    );
    await alertAdminOfMock(reportId, providerId);
  } else {
    var resolved = await resolveBgcApiKey(supabase, providerId);
    if (!resolved.apiKey) {
      return utils.errorResponse(400, 'No BackgroundChecks.com API key configured for this provider, and no platform-wide fallback is set.');
    }
    try {
      var ordered = await orderBgcReport(resolved.apiKey, email);
      reportId = ordered.reportKey;
      inviteUrl = ordered.inviteUrl;
      mode = resolved.scope === 'sub_account' ? 'live' : 'live_platform';
    } catch (e) {
      console.error('[bgc-provider-initiate] BGC API error', e.upstreamStatus || '-', JSON.stringify(e.upstreamBody || e.message));
      return utils.errorResponse(502, 'Failed to initiate background check with BackgroundChecks.com');
    }
  }

  var insertRes = await supabase
    .from('provider_background_checks')
    .insert({
      provider_id: providerId,
      employee_id: employeeId,
      subject_type: subjectType,
      subject_first_name: firstName,
      subject_last_name: lastName,
      subject_email: email,
      subject_phone: body.phone || null,
      work_location_state: body.state || null,
      status: 'pending',
      api_provider: 'backgroundchecks',
      external_order_id: reportId,
      invitation_url: inviteUrl,
    })
    .select('id, status')
    .single();

  if (insertRes.error || !insertRes.data) {
    console.error('[bgc-provider-initiate] insert failed', insertRes.error && insertRes.error.message);
    return utils.errorResponse(500, 'Failed to save background check request');
  }

  return utils.successResponse({
    success: true,
    id: insertRes.data.id,
    reportId: reportId,
    applicantUrl: inviteUrl,
    status: insertRes.data.status,
    apiConfigured: !mocked,
    mocked: mocked,
    mode: mode,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Task #112 + Task #372 — Initiate a background check for one employee
//
// Auth: caller must send a Supabase user JWT in Authorization: Bearer <token>.
// We resolve the calling user, confirm they own (or are admin of) the employee
// row's provider_id, then call BackgroundChecks.com.
//
// Two paths:
//   1) MOCK (default) — used when BGC_LIVE_MODE !== 'true'. Inserts a
//      pending row with a synthetic report id. Lets the dashboard flow be
//      tested end-to-end without hitting BGC.
//   2) LIVE (BGC_LIVE_MODE === 'true') — calls
//      `POST {BGC_API_BASE}/orders/new?api_token=...` with the provider's
//      sub-account API key (from provider_background_check_accounts.bgchecks_api_key,
//      falling back to the platform-wide BGC_API_TOKEN). Sends NO SSN/DOB —
//      BGC collects PII directly from the applicant via either the
//      hosted invite URL or the embedded JS widget (see bgc-compliance.js).
//      Stores the returned report_key + applicant_invite_url on the
//      employee_background_checks row.
//
// SSN/DOB are NEVER sent to or stored by MCC.
// ─────────────────────────────────────────────────────────────────────────────

const { createSupabaseClient } = require('./utils');

const BGC_API_BASE = process.env.BGC_API_BASE || 'https://app.backgroundchecks.com/api';
const BGC_DEFAULT_SKU = process.env.BGC_DEFAULT_REPORT_SKU || 'HIRE1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

function isLiveMode() {
  return String(process.env.BGC_LIVE_MODE || '').toLowerCase() === 'true';
}

async function resolveCaller(supabase, authHeader) {
  if (!authHeader) return null;
  const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function callerCanAdminEmployee(supabase, callerId, employee) {
  if (!callerId || !employee) return false;
  if (employee.provider_id === callerId) return true;
  const { data: prof } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle();
  return prof && prof.role === 'admin';
}

// Resolves which BGC API token to use for ordering reports for this provider.
// Preference: provider's own sub-account API key (set via the registration
// widget → /token/decrypt path). Fallback: platform-wide BGC_API_TOKEN
// (used when a provider hasn't enrolled a sub-account yet — orders show up
// on the platform's account in the BGC console). Returns { apiKey, scope }.
async function resolveBgcApiKey(supabase, providerId) {
  const { data: acct } = await supabase
    .from('provider_background_check_accounts')
    .select('bgchecks_api_key')
    .eq('provider_id', providerId)
    .maybeSingle();
  if (acct && acct.bgchecks_api_key) {
    return { apiKey: acct.bgchecks_api_key, scope: 'sub_account' };
  }
  if (process.env.BGC_API_TOKEN) {
    return { apiKey: process.env.BGC_API_TOKEN, scope: 'platform' };
  }
  return { apiKey: null, scope: null };
}

// Calls BGC's POST /orders/new. Returns { reportKey, inviteUrl } on success
// or throws an Error with .upstreamStatus + .upstreamBody on failure.
async function orderBgcReport(apiKey, employee) {
  const url = `${BGC_API_BASE}/orders/new?api_token=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accepts': 'application/json'
    },
    body: JSON.stringify({
      report_sku: BGC_DEFAULT_SKU,
      order_quantity: 1,
      applicant_emails: [employee.email],
      terms_agree: 'Y'
    })
  });
  const text = await resp.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
  if (!resp.ok) {
    const err = new Error('bgc_order_failed');
    err.upstreamStatus = resp.status;
    err.upstreamBody = parsed;
    throw err;
  }
  const applicant = parsed && Array.isArray(parsed.applicants) ? parsed.applicants[0] : null;
  const reportKey = applicant && applicant.report_key;
  const inviteUrl = applicant && applicant.applicant_invite_url;
  if (!reportKey) {
    const err = new Error('bgc_no_report_key');
    err.upstreamStatus = resp.status;
    err.upstreamBody = parsed;
    throw err;
  }
  return { reportKey, inviteUrl: inviteUrl || null };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { employeeId } = body;
  if (!employeeId) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'employeeId required' }) };
  }

  const supabase = createSupabaseClient();
  if (!supabase) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'db_unavailable' }) };
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const caller = await resolveCaller(supabase, authHeader);
  if (!caller) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const { data: employee, error: empErr } = await supabase
    .from('provider_employees')
    .select('id, provider_id, first_name, last_name, email')
    .eq('id', employeeId)
    .maybeSingle();
  if (empErr || !employee) {
    return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'employee_not_found' }) };
  }

  if (!(await callerCanAdminEmployee(supabase, caller.id, employee))) {
    return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'forbidden' }) };
  }

  // ── Order the report (live or mock). We INSERT the new row BEFORE
  // superseding the prior current row so any failure leaves the existing
  // check intact and the provider's compliance does not silently drop.
  let reportId;
  let inviteUrl = null;
  let mocked = false;
  let mode;

  if (!isLiveMode()) {
    mocked = true;
    mode = 'mock';
    reportId = 'mock_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    console.warn('[BGC initiate] BGC_LIVE_MODE not enabled — using mock report id', reportId);
  } else {
    // Live mode: employee email is required because BGC sends the applicant
    // invite to that address (and the widget resolves SSN/DOB intake against
    // the report_key). Refuse to silently swap to mock.
    if (!employee.email) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'employee_email_required_for_live' }) };
    }
    const { apiKey, scope } = await resolveBgcApiKey(supabase, employee.provider_id);
    if (!apiKey) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'bgc_not_configured', message: 'No BGC sub-account API key for this provider, and BGC_API_TOKEN is not set platform-wide.' })
      };
    }
    try {
      const result = await orderBgcReport(apiKey, employee);
      reportId = result.reportKey;
      inviteUrl = result.inviteUrl;
      mode = scope === 'sub_account' ? 'live' : 'live_platform';
    } catch (e) {
      console.error('[BGC initiate] BGC API error', e.upstreamStatus || '-', JSON.stringify(e.upstreamBody || e.message));
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'bgc_initiation_failed',
          upstream_status: e.upstreamStatus || null,
          upstream_body: e.upstreamBody || null
        })
      };
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from('employee_background_checks')
    .insert({
      employee_id: employeeId,
      provider_id: employee.provider_id,
      bgc_report_id: reportId,
      applicant_invite_url: inviteUrl,
      status: 'pending',
      is_current: true
    })
    .select('id')
    .single();
  if (insErr || !inserted) {
    console.error('[BGC initiate] insert failed', insErr?.message);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'db_insert_failed' }) };
  }

  // Now (and only now) supersede any prior current rows for this employee.
  const { error: supErr } = await supabase
    .from('employee_background_checks')
    .update({ is_current: false })
    .eq('employee_id', employeeId)
    .eq('is_current', true)
    .neq('id', inserted.id);
  if (supErr) {
    console.warn('[BGC initiate] supersede prior failed (non-fatal)', supErr.message);
  }

  await supabase.rpc('calculate_provider_compliance', { p_provider_id: employee.provider_id });

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      success: true,
      reportId,
      applicantInviteUrl: inviteUrl,
      status: 'pending',
      mocked,
      mode
    })
  };
};

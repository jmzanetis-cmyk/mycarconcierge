// ─────────────────────────────────────────────────────────────────────────────
// Task #112 — Initiate a background check for one employee
//
// Auth: caller must send a Supabase user JWT in Authorization: Bearer <token>.
// We resolve the calling user, confirm they own (or are admin of) the employee
// row's provider_id, then call BackgroundChecks.com.
//
// In dev / before BGC_API_TOKEN is set, runs in MOCK mode: creates a pending
// employee_background_checks row with a synthetic report id and returns it
// so the dashboard flow can be tested end-to-end without hitting BGC.
// ─────────────────────────────────────────────────────────────────────────────

const { createSupabaseClient } = require('./utils');

const BGC_API_BASE = process.env.BGC_API_BASE || 'https://api.backgroundchecks.com/v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

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
  // Admin override
  const { data: prof } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle();
  return prof?.role === 'admin';
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

  const { employeeId, dob, ssn, address } = body;
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

  // ── Call BGC, or mock when no token configured ───────────────────────────
  // We deliberately call BGC and INSERT the new row BEFORE superseding the old
  // current row, so that any failure leaves the prior check intact and the
  // provider's compliance does not silently drop.
  const apiToken = process.env.BGC_API_TOKEN;
  let reportId;
  let mocked = false;

  if (!apiToken) {
    mocked = true;
    reportId = 'mock_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    console.warn('[BGC initiate] BGC_API_TOKEN not set — using mock report id', reportId);
  } else {
    try {
      const resp = await fetch(`${BGC_API_BASE}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiToken}`
        },
        body: JSON.stringify({
          first_name: employee.first_name,
          last_name: employee.last_name,
          email: employee.email,
          date_of_birth: dob,
          ssn,
          address
        })
      });
      if (!resp.ok) {
        const errBody = await resp.text();
        console.error('[BGC initiate] BGC API error', resp.status, errBody);
        return {
          statusCode: 502,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'bgc_initiation_failed', upstream_status: resp.status })
        };
      }
      const data = await resp.json();
      reportId = data.id || data.report_id;
      if (!reportId) {
        console.error('[BGC initiate] BGC response missing report id', data);
        return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: 'bgc_no_report_id' }) };
      }
    } catch (e) {
      console.error('[BGC initiate] BGC API call threw', e.message);
      return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: 'bgc_unreachable' }) };
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from('employee_background_checks')
    .insert({
      employee_id: employeeId,
      provider_id: employee.provider_id,
      bgc_report_id: reportId,
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
  // Excluding the just-inserted id makes this safe even if it briefly raced.
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
    body: JSON.stringify({ success: true, reportId, status: 'pending', mocked })
  };
};

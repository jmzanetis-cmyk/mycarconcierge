// ─────────────────────────────────────────────────────────────────────────────
// Task #372 — Admin Live/Mock visibility (Step 6)
//
// GET /api/admin/bgc/providers
//   Returns one row per provider with bgc_total_employees / bgc_compliance_pct
//   plus pending_count / completed_count from employee_background_checks and
//   the live_mode flag from provider_background_check_accounts. Admin UI
//   uses this to render a "Live" vs "Mock" pill next to each provider in
//   the existing providers table.
//
// Auth: x-admin-password matching ADMIN_PASSWORD (same scheme as the
//   admin-facebook function). No supabase JWT required because admin in
//   prod authenticates with the env-shared password.
// ─────────────────────────────────────────────────────────────────────────────

const { createSupabaseClient } = require('./utils');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password, Authorization',
  'Content-Type': 'application/json'
};

function isAuthorizedByPassword(event) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const provided = event.headers?.['x-admin-password'] || event.headers?.['X-Admin-Password'];
  return provided && provided === expected;
}

async function isAuthorizedByJwt(supabase, event) {
  const auth = event.headers?.authorization || event.headers?.Authorization;
  if (!auth) return false;
  const token = String(auth).replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return false;
  const { data: prof } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle();
  return prof && prof.role === 'admin';
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  const supabase = createSupabaseClient();
  if (!supabase) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'db_unavailable' }) };
  }
  if (!isAuthorizedByPassword(event) && !(await isAuthorizedByJwt(supabase, event))) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const liveModeFlag = String(process.env.BGC_LIVE_MODE || '').toLowerCase() === 'true';

  // Pull every provider with at least one BGC employee or account row. We
  // intentionally don't paginate — the universe of providers with any BGC
  // activity is small enough that a single admin call is fine.
  const { data: accounts } = await supabase
    .from('provider_background_check_accounts')
    .select('provider_id, bgchecks_account_id, bgchecks_api_key, live_mode, source_token, updated_at');

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, business_name, full_name, email, bgc_total_employees, bgc_compliant_employees, bgc_compliance_pct, bgc_badge_verified')
    .eq('role', 'provider')
    .gt('bgc_total_employees', 0);

  // Only count REAL checks (exclude mock-mode rows whose bgc_report_id
  // starts with 'mock_'). Admin needs a true picture of live activity.
  const { data: checks } = await supabase
    .from('employee_background_checks')
    .select('provider_id, status, bgc_report_id')
    .eq('is_current', true)
    .not('bgc_report_id', 'like', 'mock_%');

  const acctById = {};
  (accounts || []).forEach(a => { acctById[a.provider_id] = a; });

  const counts = {};
  (checks || []).forEach(c => {
    if (!counts[c.provider_id]) counts[c.provider_id] = { pending: 0, clear: 0, consider: 0, failed: 0, expired: 0 };
    if (counts[c.provider_id][c.status] !== undefined) counts[c.provider_id][c.status]++;
  });

  // Union of profiles-with-employees + providers-with-an-account.
  const idSet = new Set((profiles || []).map(p => p.id));
  (accounts || []).forEach(a => idSet.add(a.provider_id));
  const profById = {};
  (profiles || []).forEach(p => { profById[p.id] = p; });

  // For any provider in the union that we didn't already pull a profile
  // for (i.e. they have an account row but bgc_total_employees=0), fetch
  // the lightweight profile fields too so the admin row has a name.
  const missingProfileIds = Array.from(idSet).filter(id => !profById[id]);
  if (missingProfileIds.length > 0) {
    const { data: extra } = await supabase
      .from('profiles')
      .select('id, business_name, full_name, email')
      .in('id', missingProfileIds);
    (extra || []).forEach(p => { profById[p.id] = p; });
  }

  const rows = Array.from(idSet).map(id => {
    const p = profById[id] || {};
    const a = acctById[id] || null;
    const c = counts[id] || { pending: 0, clear: 0, consider: 0, failed: 0, expired: 0 };
    // A provider is "live" only if global BGC_LIVE_MODE is on AND they have
    // either their own decrypted API key or fall back to the platform token.
    // We deliberately ignore the `live_mode` column on
    // provider_background_check_accounts here: that column is set by the
    // decrypt-token flow as a hint, but the AUTHORITATIVE definition of
    // "this provider is hitting real BGC" is the global env flag plus the
    // presence of an actual credential (sub-account or platform fallback).
    // Computing it server-side avoids the row-flag and operator-config
    // drifting apart in admin.
    const hasApiKey = !!(a && a.bgchecks_api_key);
    const hasPlatformFallback = !!process.env.BGC_API_TOKEN;
    const live = liveModeFlag && (hasApiKey || hasPlatformFallback);
    return {
      provider_id: id,
      business_name: p.business_name || p.full_name || 'Unnamed',
      email: p.email || null,
      bgc_total_employees: p.bgc_total_employees || 0,
      bgc_compliance_pct: Number(p.bgc_compliance_pct || 0),
      bgc_badge_verified: !!p.bgc_badge_verified,
      live_mode: live,
      mode_reason: !liveModeFlag ? 'BGC_LIVE_MODE off'
                 : hasApiKey ? 'sub-account API key on file'
                 : hasPlatformFallback ? 'platform fallback token'
                 : 'no API credential',
      bgchecks_account_id: a ? a.bgchecks_account_id : null,
      pending_count: c.pending,
      completed_count: c.clear + c.consider,
      failed_count: c.failed,
      account_updated_at: a ? a.updated_at : null
    };
  }).sort((a, b) => (b.pending_count + b.completed_count) - (a.pending_count + a.completed_count));

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      success: true,
      live_mode_global: liveModeFlag,
      platform_fallback: !!process.env.BGC_API_TOKEN,
      providers: rows
    })
  };
};

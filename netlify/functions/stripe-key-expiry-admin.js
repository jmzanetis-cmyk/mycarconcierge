// ============================================================================
// MCC Stripe Key Expiry — Admin Endpoint (Task #246)
//
// Routes (mounted via www/_redirects → /api/admin/stripe-key-expiry/*):
//   GET  /api/admin/stripe-key-expiry          — current config + status pill
//   POST /api/admin/stripe-key-expiry          — { expiry_date: 'YYYY-MM-DD' }
//                                                Upserts the date, advancing
//                                                ai_ops_settings.updated_at
//                                                which resets alert state.
//   POST /api/admin/stripe-key-expiry/run-now  — manually trigger the daily
//                                                checker (admin-only).
// ============================================================================

const { createClient } = require('@supabase/supabase-js');
const { _runChecker, _computeStatus, _SETTINGS_KEY, _MODULE } = require('./stripe-key-expiry-scheduled');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-password, X-Admin-Password, x-admin-token, X-Admin-Token',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    },
    body: JSON.stringify(data)
  };
}

function authenticateAdmin(event) {
  const pw    = (event.headers['x-admin-password'] || event.headers['X-Admin-Password'] || '').trim();
  const token = (event.headers['x-admin-token']    || event.headers['X-Admin-Token']    || '').trim();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  return pw === adminPassword || token === adminPassword;
}

async function fetchStatus(supabase) {
  const { data: setting } = await supabase
    .from('ai_ops_settings')
    .select('key,value,updated_at')
    .eq('key', _SETTINGS_KEY)
    .maybeSingle();

  if (!setting || !setting.value) {
    return {
      configured: false,
      expiry_date: null,
      updated_at: null,
      days_until: null,
      level: 'unknown',
      recent_alerts: []
    };
  }

  const expiryDateStr = String(setting.value).trim();
  let status = { daysUntil: null, level: 'unknown' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(expiryDateStr)) {
    status = _computeStatus(expiryDateStr);
  }

  const sinceIso = setting.updated_at || new Date(0).toISOString();
  const { data: alerts } = await supabase
    .from('ai_action_log')
    .select('action_type, created_at, outcome, decision')
    .eq('module', _MODULE)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(20);

  return {
    configured: true,
    expiry_date: expiryDateStr,
    updated_at: setting.updated_at,
    days_until: status.daysUntil,
    level: status.level,
    recent_alerts: alerts || []
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, { ok: true });
  if (!authenticateAdmin(event)) return jsonResponse(401, { error: 'Unauthorized' });

  const supabase = getSupabase();
  if (!supabase) return jsonResponse(500, { error: 'Database not configured' });

  const rawPath = event.path || '';
  const subPath = rawPath.replace(/^.*\/stripe-key-expiry/, '').replace(/^\//, '');
  const method = event.httpMethod;

  try {
    if (method === 'GET' && subPath === '') {
      const status = await fetchStatus(supabase);
      return jsonResponse(200, status);
    }

    if (method === 'POST' && subPath === '') {
      let body = {};
      try { body = JSON.parse(event.body || '{}'); } catch { return jsonResponse(400, { error: 'Invalid JSON body' }); }
      const expiryDate = String(body.expiry_date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
        return jsonResponse(400, { error: 'expiry_date must be YYYY-MM-DD' });
      }
      const { error } = await supabase.from('ai_ops_settings').upsert(
        { key: _SETTINGS_KEY, value: expiryDate, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
      if (error) return jsonResponse(500, { error: error.message });
      const status = await fetchStatus(supabase);
      return jsonResponse(200, { success: true, ...status });
    }

    if (method === 'POST' && subPath === 'run-now') {
      const result = await _runChecker(supabase);
      return jsonResponse(200, result);
    }

    return jsonResponse(404, { error: 'Not found', path: subPath, method });
  } catch (err) {
    console.error('[StripeKeyExpiryAdmin] Error:', err.message);
    return jsonResponse(500, { error: err.message });
  }
};

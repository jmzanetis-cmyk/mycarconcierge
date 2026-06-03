// ============================================================================
// MCC API Key Expiry — Admin Endpoint (Task #353)
//
// Generalizes the Task #246 Stripe-only admin endpoint into a multi-key one.
//
// Routes (mounted via www/_redirects):
//   GET  /api/admin/api-key-expiry             — list of all tracked keys
//                                                with their current status
//                                                + recent alert log entries.
//   POST /api/admin/api-key-expiry             — { key_id, expiry_date }
//                                                Upserts the date for that
//                                                tracked key, advancing
//                                                ai_ops_settings.updated_at
//                                                which resets alert state.
//   POST /api/admin/api-key-expiry/run-now     — manually trigger the daily
//                                                checker for every tracked
//                                                key (or one if `key_id`
//                                                is supplied in the body).
//
// Backward-compat routes (kept so existing bookmarks + old admin.js code
// still work while we generalize the UI):
//   GET  /api/admin/stripe-key-expiry          — narrow shape returning the
//                                                Stripe entry only, in the
//                                                Task #246 response format.
//   POST /api/admin/stripe-key-expiry          — { expiry_date } for Stripe.
//   POST /api/admin/stripe-key-expiry/run-now  — runs Stripe-only.
// ============================================================================

const { createClient } = require('@supabase/supabase-js');
const { TRACKED_KEYS, findKeyConfig } = require('../../lib/api-key-expiry-config');
const { _runChecker, _computeStatus } = require('./api-key-expiry-scheduled');
const utils = require('./utils');

const STRIPE_KEY_ID = 'stripe_secret_key';

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

async function fetchKeyStatus(supabase, keyConfig) {
  const { data: setting } = await supabase
    .from('ai_ops_settings')
    .select('key,value,updated_at')
    .eq('key', keyConfig.setting_key)
    .maybeSingle();

  const base = {
    id: keyConfig.id,
    label: keyConfig.label,
    env_var: keyConfig.env_var,
    feature: keyConfig.feature,
    rotation_steps: keyConfig.rotation_steps
  };

  // Check if a live probe has failed in the last 24 hours (Task #458 / #459)
  const since24h = new Date(Date.now() - 86400000).toISOString();
  const { data: recentProbeAlert } = await supabase
    .from('ai_action_log')
    .select('action_type, created_at, outcome')
    .eq('module', keyConfig.module)
    .eq('action_type', 'probe_alert')
    .eq('outcome', 'sent')
    .gte('created_at', since24h)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!setting || !setting.value) {
    return {
      ...base,
      configured: false,
      expiry_date: null,
      updated_at: null,
      days_until: null,
      level: 'unknown',
      probe_failing: !!recentProbeAlert,
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
    .eq('module', keyConfig.module)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(20);

  return {
    ...base,
    configured: true,
    expiry_date: expiryDateStr,
    updated_at: setting.updated_at,
    days_until: status.daysUntil,
    level: status.level,
    probe_failing: !!recentProbeAlert,
    recent_alerts: alerts || []
  };
}

async function fetchAllStatuses(supabase) {
  const keys = [];
  for (const keyConfig of TRACKED_KEYS) {
    keys.push(await fetchKeyStatus(supabase, keyConfig));
  }
  return { keys };
}

async function upsertExpiryDate(supabase, keyConfig, expiryDate) {
  const { error } = await supabase.from('ai_ops_settings').upsert(
    { key: keyConfig.setting_key, value: expiryDate, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  if (error) throw new Error(error.message);
}

function normalizeSubPath(rawPath) {
  return rawPath
    .replace(/^\/?\.netlify\/functions\/api-key-expiry-admin\/?/, '')
    .replace(/^\/?\.netlify\/functions\/stripe-key-expiry-admin\/?/, '')
    .replace(/^\/api\/admin\/api-key-expiry\/?/, '')
    .replace(/^\/api\/admin\/stripe-key-expiry\/?/, '')
    .replace(/^\/+/, '');
}

function isLegacyStripePath(rawPath) {
  return /\/api\/admin\/stripe-key-expiry/.test(rawPath)
      || /\/\.netlify\/functions\/stripe-key-expiry-admin/.test(rawPath);
}

// Backward-compat shape — what Task #246's GET /api/admin/stripe-key-expiry
// returned. Used when an older client hits the legacy URL so we don't break
// any bookmark or external script that depended on the narrower payload.
function legacyStripeStatusShape(stripeStatus) {
  if (!stripeStatus.configured) {
    return {
      configured: false,
      expiry_date: null,
      updated_at: null,
      days_until: null,
      level: 'unknown',
      recent_alerts: []
    };
  }
  return {
    configured: true,
    expiry_date: stripeStatus.expiry_date,
    updated_at: stripeStatus.updated_at,
    days_until: stripeStatus.days_until,
    level: stripeStatus.level,
    recent_alerts: stripeStatus.recent_alerts
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, { ok: true });

  const supabase = getSupabase();
  if (!supabase) return jsonResponse(500, { error: 'Database not configured' });

  const admin = await utils.authenticateBearerAdmin(event, supabase);
  if (!admin) return jsonResponse(401, { error: 'Unauthorized' });

  const rawPath = event.path || '';
  const subPath = normalizeSubPath(rawPath);
  const legacy = isLegacyStripePath(rawPath);
  const method = event.httpMethod;

  try {
    // ----- Legacy Stripe-only shape -----
    if (legacy) {
      const stripeCfg = findKeyConfig(STRIPE_KEY_ID);
      if (method === 'GET' && subPath === '') {
        const status = await fetchKeyStatus(supabase, stripeCfg);
        return jsonResponse(200, legacyStripeStatusShape(status));
      }
      if (method === 'POST' && subPath === '') {
        let body = {};
        try { body = JSON.parse(event.body || '{}'); } catch { return jsonResponse(400, { error: 'Invalid JSON body' }); }
        const expiryDate = String(body.expiry_date || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
          return jsonResponse(400, { error: 'expiry_date must be YYYY-MM-DD' });
        }
        await upsertExpiryDate(supabase, stripeCfg, expiryDate);
        const status = await fetchKeyStatus(supabase, stripeCfg);
        return jsonResponse(200, { success: true, ...legacyStripeStatusShape(status) });
      }
      if (method === 'POST' && subPath === 'run-now') {
        const result = await _runChecker(supabase, { onlyKeyId: STRIPE_KEY_ID });
        return jsonResponse(200, result);
      }
      return jsonResponse(404, { error: 'Not found', path: subPath, method });
    }

    // ----- Generalized /api/admin/api-key-expiry -----
    if (method === 'GET' && subPath === '') {
      const data = await fetchAllStatuses(supabase);
      return jsonResponse(200, data);
    }

    if (method === 'POST' && subPath === '') {
      let body = {};
      try { body = JSON.parse(event.body || '{}'); } catch { return jsonResponse(400, { error: 'Invalid JSON body' }); }
      const keyId = String(body.key_id || '').trim();
      const expiryDate = String(body.expiry_date || '').trim();
      const keyConfig = findKeyConfig(keyId);
      if (!keyConfig) return jsonResponse(400, { error: `Unknown key_id: ${keyId}` });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
        return jsonResponse(400, { error: 'expiry_date must be YYYY-MM-DD' });
      }
      await upsertExpiryDate(supabase, keyConfig, expiryDate);
      const status = await fetchKeyStatus(supabase, keyConfig);
      return jsonResponse(200, { success: true, key: status });
    }

    if (method === 'POST' && subPath === 'run-now') {
      let body = {};
      try { body = JSON.parse(event.body || '{}'); } catch { /* empty body is fine */ }
      const onlyKeyId = body && body.key_id ? String(body.key_id).trim() : null;
      if (onlyKeyId && !findKeyConfig(onlyKeyId)) {
        return jsonResponse(400, { error: `Unknown key_id: ${onlyKeyId}` });
      }
      const result = await _runChecker(supabase, onlyKeyId ? { onlyKeyId } : {});
      return jsonResponse(200, result);
    }

    return jsonResponse(404, { error: 'Not found', path: subPath, method });
  } catch (err) {
    console.error('[ApiKeyExpiryAdmin] Error:', err.message);
    return jsonResponse(500, { error: err.message });
  }
};

exports._fetchAllStatuses = fetchAllStatuses;
exports._fetchKeyStatus = fetchKeyStatus;

// ============================================================================
// apollo-admin
//
// Privileged endpoints that back the Apollo discovery controls in the
// Outreach engine control panel (www/admin-outreach.js renderEngineControlPanel).
// Before this existed, the panel referenced an `apolloConfig` global that was
// never loaded and an `enableApolloDiscovery()` button handler that didn't
// exist — so admin could see "Discovery Stalled" but had no working button to
// investigate or restart.
//
// Routes (mounted at /.netlify/functions/apollo-admin/* and proxied from
// /api/admin/apollo/* via www/_redirects):
//
//   GET  /config       -> { config: <apollo_config block> }
//   PUT  /config       { ...partial updates }     (merges into apollo_config)
//   POST /run-now      {}                         (triggers one discovery cycle)
//
// All routes require the x-admin-password (or x-admin-token) header to match
// ADMIN_PASSWORD. All routes use the service-role Supabase client so they
// bypass RLS, and every action writes an admin_audit_log row.
//
// Modeled on netlify/functions/provider-admin.js.
// ============================================================================

const {
  createSupabaseClient,
  getApolloConfig,
  saveApolloConfig,
  runApolloDiscoveryCycle
} = require('./outreach-engine-core');

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token, x-admin-token, X-Admin-Password, x-admin-password',
      'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS'
    },
    body: typeof data === 'string' ? data : JSON.stringify(data)
  };
}

function authenticateAdmin(event) {
  const headers = event.headers || {};
  const pw = (headers['x-admin-password'] || headers['X-Admin-Password'] || '').trim();
  const tk = (headers['x-admin-token']    || headers['X-Admin-Token']    || '').trim();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  return pw === adminPassword || tk === adminPassword;
}

// Best-effort audit row writer. Audit failures must not block the privileged
// action they describe (the action already happened).
async function audit(supabase, row) {
  try {
    await supabase.from('admin_audit_log').insert(row);
  } catch (e) {
    console.error('[apollo-admin] audit write failed:', e.message);
  }
}

// Whitelist of fields the admin UI may persist into apollo_config. Anything
// outside this set is dropped so a malformed PUT can't accidentally clobber
// internal lock state (running_since, running_nonce) or rotation indices.
// search_profiles is intentionally NOT exposed — it's a large nested array
// best edited in code review, not via prompt() in the browser.
const ALLOWED_CONFIG_KEYS = new Set([
  'enabled',
  'interval_hours',
  'per_page',
  'auto_enrich',
  'enrich_batch',
  'instantly_auto_sync',
  'instantly_provider_campaign_id'
]);

function sanitizeConfigUpdates(body) {
  const out = {};
  const errors = [];
  for (const key of Object.keys(body || {})) {
    if (!ALLOWED_CONFIG_KEYS.has(key)) continue;
    const value = body[key];
    switch (key) {
      case 'enabled':
      case 'auto_enrich':
      case 'instantly_auto_sync':
        if (typeof value !== 'boolean') {
          errors.push(`${key} must be a boolean`);
        } else {
          out[key] = value;
        }
        break;
      case 'interval_hours': {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 1 || n > 168) {
          errors.push('interval_hours must be a number between 1 and 168');
        } else {
          out[key] = n;
        }
        break;
      }
      case 'per_page': {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 100) {
          errors.push('per_page must be an integer between 1 and 100');
        } else {
          out[key] = n;
        }
        break;
      }
      case 'enrich_batch': {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 0 || n > 100) {
          errors.push('enrich_batch must be an integer between 0 and 100');
        } else {
          out[key] = n;
        }
        break;
      }
      case 'instantly_provider_campaign_id':
        if (value === null || value === '') {
          out[key] = null;
        } else if (typeof value !== 'string' || value.length > 200) {
          errors.push('instantly_provider_campaign_id must be a string (max 200 chars) or null');
        } else {
          out[key] = value.trim();
        }
        break;
      default:
        break;
    }
  }
  return { updates: out, errors };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  if (!authenticateAdmin(event)) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  const supabase = createSupabaseClient();
  if (!supabase) return jsonResponse(500, { error: 'Database not configured' });

  // Strip both the netlify-functions prefix and the /api/admin/apollo proxy
  // prefix so the same handler works from either entry point.
  const route = (event.path || '')
    .replace(/^\/?\.netlify\/functions\/apollo-admin\/?/, '')
    .replace(/^\/?api\/admin\/apollo\/?/, '')
    .replace(/^\/+/, '');
  const method = event.httpMethod;
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); }
    catch { return jsonResponse(400, { error: 'invalid JSON body' }); }
  }

  try {
    if (route === 'config' && method === 'GET') {
      const config = await getApolloConfig(supabase);
      // Strip the lock fields from the response — they're internal mechanics,
      // not something admin should see or edit. Keep last_run/last_successful_*
      // because the UI badge needs them to compute "stalled" vs "active".
      const { running_since, running_nonce, ...visibleConfig } = config;
      return jsonResponse(200, { config: visibleConfig });
    }

    if (route === 'config' && method === 'PUT') {
      const { updates, errors } = sanitizeConfigUpdates(body);
      if (errors.length > 0) {
        return jsonResponse(400, { error: 'invalid config', details: errors });
      }
      if (Object.keys(updates).length === 0) {
        return jsonResponse(400, { error: 'no valid config fields supplied' });
      }
      const newCfg = await saveApolloConfig(supabase, updates);
      await audit(supabase, {
        action: 'update_apollo_config',
        target_type: 'engine_state',
        metadata: { updates },
        performed_by: 'admin'
      });
      const { running_since, running_nonce, ...visibleConfig } = newCfg;
      return jsonResponse(200, { config: visibleConfig, updated_keys: Object.keys(updates) });
    }

    if (route === 'run-now' && method === 'POST') {
      // Audit FIRST so even crashes during the cycle leave a "tried to run"
      // breadcrumb. The cycle itself logs detailed outcomes into
      // outreach_activity_log via runApolloDiscoveryCycle.
      await audit(supabase, {
        action: 'apollo_run_now',
        target_type: 'engine_state',
        metadata: { triggered_at: new Date().toISOString() },
        performed_by: 'admin'
      });

      const cfgBefore = await getApolloConfig(supabase);
      // Refuse to run when disabled — flipping `enabled` is a separate,
      // auditable action via PUT /config. A silent enable from "Run now"
      // would hide that change from the audit trail.
      if (cfgBefore.enabled !== true) {
        return jsonResponse(409, {
          error: 'Apollo discovery is disabled. Enable it via /config first.',
          result: { skipped: true, reason: 'automation_disabled' }
        });
      }

      // Bypass the "not_due since last_run" guard so admin's manual "Run now"
      // actually runs even when scheduled cadence hasn't elapsed. We null
      // out last_run, then restore it ourselves if the cycle ended up not
      // writing a fresh last_run (e.g., HTTP error before the success path).
      const previousLastRun = cfgBefore.last_run || null;
      await saveApolloConfig(supabase, { last_run: null });

      let result;
      try {
        result = await runApolloDiscoveryCycle(supabase);
      } catch (err) {
        result = { success: false, error: err.message, error_kind: 'handler_exception' };
      }

      // The cycle writes last_run only on the success path. Re-read and, if
      // it wasn't updated, restore the previous value so a failed manual run
      // doesn't reset the scheduled cadence to "due now".
      try {
        const cfgAfter = await getApolloConfig(supabase);
        if (!cfgAfter.last_run && previousLastRun) {
          await saveApolloConfig(supabase, { last_run: previousLastRun });
        }
      } catch (e) {
        console.error('[apollo-admin] last_run restore failed:', e.message);
      }

      return jsonResponse(200, { result });
    }

    return jsonResponse(404, { error: 'Not found', path: route, method });
  } catch (e) {
    console.error('[apollo-admin] handler error:', e);
    return jsonResponse(500, { error: e.message });
  }
};

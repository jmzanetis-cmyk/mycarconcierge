// ============================================================================
// admin-audit-log
//
// Generic viewer endpoint backing the "Admin Audit Log" panel in admin.html
// (Task #330). Apollo-only viewer was added in Task #275 via apollo-admin.js
// /audit-log, but the rest of the audited actions (provider suspend/activate,
// autosuspend_low_rated, application approvals/rejections, adjust_bid_credits,
// concierge job state changes, user role flips, etc.) had no UI surface.
//
// Route (mounted at /.netlify/functions/admin-audit-log and proxied from
// /api/admin/audit-log via www/_redirects):
//
//   GET /?action=&target_id=&performed_by=&limit=&before=
//
// Query params (all optional):
//   action        - exact match on admin_audit_log.action
//   target_id     - exact match on target_id (uuid or string)
//   performed_by  - exact match on performed_by
//   limit         - 1..100 (default 50)
//   before        - ISO timestamp; only return rows with performed_at < before
//                   (cheap keyset pagination so the panel can "Load older")
//
// Requires x-admin-password (or x-admin-token) matching ADMIN_PASSWORD. Uses
// the service-role Supabase client so it bypasses RLS. Read-only.
// ============================================================================

const { createClient } = require('@supabase/supabase-js');
const utils = require('./utils');

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token, x-admin-token, X-Admin-Password, x-admin-password',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
    },
    body: typeof data === 'string' ? data : JSON.stringify(data)
  };
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Closed set of audit action values currently written somewhere in the
// codebase. Surfaced as `available_actions` so the UI's filter <select>
// can stay in sync without a second round-trip. Keep alphabetized.
const KNOWN_ACTIONS = [
  'activate_provider',
  'adjust_bid_credits',
  'apollo_lock_force_cleared',
  'apollo_manual_enrich',
  'apollo_manual_search',
  'apollo_run_now',
  'approve_provider_application',
  'assign_concierge_driver',
  'autosuspend_low_rated',
  'cancel_concierge_job',
  'check_low_rated',
  'create_concierge_job',
  'create_provider_application',
  'reject_provider_application',
  'request_application_info',
  'suspend_provider',
  'transition_concierge_job',
  'update_apollo_config',
  'update_concierge_job_address',
  'update_user_role'
];

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  if (event.httpMethod !== 'GET')     return jsonResponse(405, { error: 'GET only' });

  const supabase = getSupabase();
  if (!supabase) return jsonResponse(500, { error: 'Database not configured' });

  const admin = await utils.authenticateBearerAdmin(event, supabase);
  if (!admin) return jsonResponse(401, { error: 'Unauthorized' });

  const params = event.queryStringParameters || {};
  const limit = Math.min(Math.max(parseInt(params.limit, 10) || 50, 1), 100);

  try {
    let query = supabase
      .from('admin_audit_log')
      .select('id,action,target_id,target_type,reason,metadata,performed_by,performed_at')
      .order('performed_at', { ascending: false })
      .limit(limit);

    if (params.action && typeof params.action === 'string') {
      query = query.eq('action', params.action.trim());
    }
    if (params.target_id && typeof params.target_id === 'string') {
      query = query.eq('target_id', params.target_id.trim());
    }
    if (params.performed_by && typeof params.performed_by === 'string') {
      query = query.eq('performed_by', params.performed_by.trim());
    }
    if (params.before && typeof params.before === 'string') {
      // ISO timestamp validation — Postgres will also reject malformed values
      // but we'd rather return a clean 400 than a 500.
      const d = new Date(params.before);
      if (isNaN(d.getTime())) return jsonResponse(400, { error: 'before must be a valid ISO timestamp' });
      query = query.lt('performed_at', d.toISOString());
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return jsonResponse(200, {
      success: true,
      rows: data || [],
      available_actions: KNOWN_ACTIONS
    });
  } catch (err) {
    console.error('[admin-audit-log] error:', err);
    return jsonResponse(500, { error: err.message });
  }
};

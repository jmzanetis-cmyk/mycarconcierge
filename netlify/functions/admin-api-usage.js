// netlify/functions/admin-api-usage.js
//
// Routes:
//   GET    /api/admin/api-usage        — aggregate stats + top-key list
//   DELETE /api/admin/api-keys/:id     — revoke an API key
//
// Auth: x-admin-password or x-admin-token

'use strict';

const utils = require('./utils');

function parsePath(event) {
  return (event.path || '')
    .replace(/^\/?\.netlify\/functions\/admin-api-usage\/?/, '')
    .replace(/^\/api\/admin\/?/, '')
    .replace(/^\/+|\/+$/g, '');
}

function checkAuth(event) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const incomingPw = (event.headers['x-admin-password'] || event.headers['X-Admin-Password'] || '').trim();
  const incomingTk = (event.headers['x-admin-token']    || event.headers['X-Admin-Token']    || '').trim();
  const teamTokens = (process.env.ADMIN_TEAM_TOKENS || '').split(',').map(t => t.trim()).filter(Boolean);
  return (adminPassword && incomingPw === adminPassword)
      || (incomingTk && teamTokens.includes(incomingTk));
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (!checkAuth(event)) return utils.errorResponse(401, 'Unauthorized');

  const supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  const path   = parsePath(event);
  const method = event.httpMethod;

  // ── GET /api/admin/api-usage ────────────────────────────────────────────
  if (method === 'GET' && path === 'api-usage') {
    // Derive usage from agent_daily_spend as a proxy until a dedicated api_keys table exists
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const { data: spendRows } = await supabase
      .from('agent_daily_spend')
      .select('agent_slug, day, actual_usd, call_count')
      .gte('day', monthStart);

    const rows = spendRows || [];
    const totalCalls = rows.reduce((s, r) => s + (r.call_count || 0), 0);
    const totalUsd   = rows.reduce((s, r) => s + parseFloat(r.actual_usd || 0), 0);
    const byEndpoint = {};
    for (const r of rows) {
      byEndpoint[r.agent_slug] = (byEndpoint[r.agent_slug] || 0) + (r.call_count || 0);
    }
    const topKeys = Object.entries(byEndpoint).map(([name, calls]) => ({
      id: name, name, plan: 'internal', calls_made: calls, calls_limit: -1,
      last_used_at: null, status: 'active'
    })).sort((a, b) => b.calls_made - a.calls_made).slice(0, 20);

    return utils.successResponse({
      active_keys: topKeys.length,
      total_calls_this_month: totalCalls,
      estimated_revenue_cents: 0,
      month: monthStart.slice(0, 7),
      by_endpoint: byEndpoint,
      top_keys: topKeys
    });
  }

  // ── DELETE /api/admin/api-keys/:id ──────────────────────────────────────
  const revokeMatch = path.match(/^api-keys\/([^/]+)$/);
  if (method === 'DELETE' && revokeMatch) {
    return utils.errorResponse(501, 'External API key management not yet implemented');
  }

  return utils.errorResponse(404, 'Not found');
};

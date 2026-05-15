// ============================================================================
// MCC Launch Broadcast — Admin Endpoint (Task #222)
//
// Surfaces send progress + bounce/complaint stats from the launch broadcast
// (scripts/send-bgc-launch-broadcast.js) so the marketing team can watch the
// rollout live without running SQL.
//
// Routes (mounted via www/_redirects → /api/admin/launch-broadcast/*):
//   GET /api/admin/launch-broadcast/stats
//        → per-audience counts (sent / bounced / complained / failed)
//          plus the global email_unsubscribes total.
//   GET /api/admin/launch-broadcast/bounces?limit=50
//        → recent bounced / complained / failed rows with email + reason
//          for list-cleaning.
//
// Auth: x-admin-password (matches process.env.ADMIN_PASSWORD), same header
// the rest of the admin endpoints use.
// ============================================================================

const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-password, X-Admin-Password, x-admin-token, X-Admin-Token',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
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

const AUDIENCES = ['customer', 'provider'];
const STATUSES  = ['sent', 'bounced', 'complained', 'failed'];

// Page through rows in chunks to count by (audience, status). We use head
// count queries — no row data is fetched.
async function fetchStats(supabase) {
  const out = {
    audiences: {},
    totals:    { sent: 0, bounced: 0, complained: 0, failed: 0, total: 0 },
    unsubscribes_total: 0,
    table_missing: false,
    last_send_at: null,
    error: null
  };
  for (const audience of AUDIENCES) {
    out.audiences[audience] = { sent: 0, bounced: 0, complained: 0, failed: 0, total: 0 };
  }

  // Per-(audience,status) counts via head:true (cheap; returns count only).
  for (const audience of AUDIENCES) {
    for (const status of STATUSES) {
      const { count, error } = await supabase
        .from('bgc_launch_email_sends')
        .select('id', { count: 'exact', head: true })
        .eq('audience', audience)
        .eq('status', status);
      if (error) {
        // Table missing is the only "expected" failure mode (script hasn't
        // been deployed / SQL hasn't been run yet) — surface it gracefully.
        if (/relation .* does not exist|schema cache/i.test(error.message)) {
          out.table_missing = true;
          out.error = 'bgc_launch_email_sends table not yet created — run the launch broadcast first.';
          return out;
        }
        out.error = error.message;
        return out;
      }
      const n = count || 0;
      out.audiences[audience][status]     = n;
      out.audiences[audience].total      += n;
      out.totals[status]                 += n;
      out.totals.total                   += n;
    }
  }

  // Most recent send (across both audiences) — gives the team a "last
  // activity" signal so they know the script is still progressing.
  try {
    const { data: latest } = await supabase
      .from('bgc_launch_email_sends')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.created_at) out.last_send_at = latest.created_at;
  } catch { /* non-fatal */ }

  // Global suppression list size. Best-effort: a missing table here just
  // leaves the count at 0 — the dashboard will show "—".
  try {
    const { count } = await supabase
      .from('email_unsubscribes')
      .select('email', { count: 'exact', head: true });
    out.unsubscribes_total = count || 0;
  } catch { /* non-fatal */ }

  return out;
}

async function fetchBounces(supabase, limit) {
  const cap = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const { data, error } = await supabase
    .from('bgc_launch_email_sends')
    .select('email, audience, status, error_message, created_at')
    .in('status', ['bounced', 'complained', 'failed'])
    .order('created_at', { ascending: false })
    .limit(cap);
  if (error) {
    if (/relation .* does not exist|schema cache/i.test(error.message)) {
      return { rows: [], table_missing: true, error: null };
    }
    return { rows: [], table_missing: false, error: error.message };
  }
  return { rows: data || [], table_missing: false, error: null };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, { ok: true });
  if (!authenticateAdmin(event))      return jsonResponse(401, { error: 'Unauthorized' });

  const supabase = getSupabase();
  if (!supabase) return jsonResponse(500, { error: 'Database not configured' });

  const rawPath = event.path || '';
  const subPath = rawPath
    .replace(/^\/?\.netlify\/functions\/launch-broadcast-admin\/?/, '')
    .replace(/^\/api\/admin\/launch-broadcast\/?/, '')
    .replace(/^\/+/, '');

  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'GET only' });

  try {
    if (subPath === 'stats' || subPath === '') {
      const stats = await fetchStats(supabase);
      return jsonResponse(200, stats);
    }
    if (subPath === 'bounces') {
      const limit = (event.queryStringParameters || {}).limit;
      const result = await fetchBounces(supabase, limit);
      return jsonResponse(200, result);
    }
    return jsonResponse(404, { error: `unknown sub-route: ${subPath}` });
  } catch (e) {
    console.error('[launch-broadcast-admin] handler error:', e);
    return jsonResponse(500, { error: e.message || 'Internal error' });
  }
};

module.exports.fetchStats = fetchStats;
module.exports.fetchBounces = fetchBounces;

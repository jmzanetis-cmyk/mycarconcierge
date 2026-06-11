// ============================================================================
// MCC — Ops Flags Admin Queue (Step 7 / spec §5.5 + §10.5)
//
// Routes:
//   GET  /api/admin/ops-flags          — list open flags, filterable
//   PATCH /api/admin/ops-flags/:id     — ack / resolve / dismiss
//
// Auth: Bearer Supabase token → profiles.role = 'admin' (same pattern as
// admin-data.js). ops_flags has no client-side RLS; all reads/writes go
// through this endpoint using the service-role client.
//
// The queue is designed for 5-min/day triage at pilot volume. Flags are
// ordered by severity (urgent → review → info) then created_at desc so the
// most actionable items appear first without any manual sorting.
// ============================================================================

'use strict';

const { createClient } = require('@supabase/supabase-js');

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function jsonResponse(status, data) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
    },
    body: JSON.stringify(data),
  };
}

function getBearerToken(event) {
  const auth = (event.headers.authorization || event.headers.Authorization || '').trim();
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function isUuid(v) {
  return typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

async function authenticateAdmin(event, supabase) {
  const token = getBearerToken(event);
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single();
  if (!profile || profile.role !== 'admin') return null;
  return data.user;
}

function parsePath(event) {
  return (event.path || '')
    .replace(/^\/?\.netlify\/functions\/ops-flags-admin\/?/, '')
    .replace(/^\/api\/admin\/ops-flags\/?/, '')
    .replace(/^\/+|\/+$/g, '');
}

// Severity sort order for display: urgent first.
const SEVERITY_ORDER = { urgent: 0, review: 1, info: 2 };

async function handleList(supabase, qs) {
  const status   = qs.status   || 'open';
  const severity = qs.severity || null;
  const kind     = qs.kind     || null;
  const jobId    = qs.job_id   || null;
  const driverId = qs.driver_id || null;
  const limit    = Math.min(parseInt(qs.limit) || 50, 200);

  const validStatuses = new Set(['open', 'acked', 'resolved', 'dismissed', 'all']);
  if (!validStatuses.has(status)) return jsonResponse(400, { error: 'invalid status filter' });

  let q = supabase.from('ops_flags')
    .select(`
      id, kind, severity, status,
      job_id, ride_id, handoff_id, driver_id,
      detail,
      created_at, resolved_at, resolved_by, resolution_note
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status !== 'all') q = q.eq('status', status);
  if (severity) q = q.eq('severity', severity);
  if (kind)     q = q.eq('kind', kind);
  if (jobId && isUuid(jobId))     q = q.eq('job_id', jobId);
  if (driverId && isUuid(driverId)) q = q.eq('driver_id', driverId);

  const { data, error } = await q;
  if (error) return jsonResponse(500, { error: error.message });

  // Client-side severity sort within each created_at bucket so urgent items
  // always float to the top within same-second ties.
  const sorted = (data || []).sort((a, b) => {
    const sA = SEVERITY_ORDER[a.severity] ?? 99;
    const sB = SEVERITY_ORDER[b.severity] ?? 99;
    if (sA !== sB) return sA - sB;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return jsonResponse(200, { flags: sorted, count: sorted.length });
}

async function handlePatch(supabase, flagId, body, adminUser) {
  if (!isUuid(flagId)) return jsonResponse(400, { error: 'invalid flag id' });

  const VALID_STATUSES = new Set(['acked', 'resolved', 'dismissed']);
  if (!body.status || !VALID_STATUSES.has(body.status)) {
    return jsonResponse(400, { error: `status must be one of: ${[...VALID_STATUSES].join(', ')}` });
  }

  const update = {
    status:          body.status,
    resolution_note: body.resolution_note ?? null,
  };
  if (body.status === 'resolved' || body.status === 'dismissed') {
    update.resolved_at = new Date().toISOString();
    update.resolved_by = adminUser.id;
  }

  const { data, error } = await supabase
    .from('ops_flags')
    .update(update)
    .eq('id', flagId)
    .select()
    .maybeSingle();

  if (error) return jsonResponse(500, { error: error.message });
  if (!data)  return jsonResponse(404, { error: 'flag not found' });

  return jsonResponse(200, { flag: data });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, '');

  const supabase = getServiceSupabase();
  if (!supabase) return jsonResponse(500, { error: 'supabase not configured' });

  const admin = await authenticateAdmin(event, supabase);
  if (!admin) return jsonResponse(403, { error: 'admin auth required' });

  const path = parsePath(event);
  const qs   = event.queryStringParameters || {};

  try {
    if (event.httpMethod === 'GET' && !path) {
      return await handleList(supabase, qs);
    }

    if (event.httpMethod === 'PATCH' && path) {
      let body = {};
      try { body = JSON.parse(event.body || '{}'); } catch {}
      return await handlePatch(supabase, path, body, admin);
    }

    return jsonResponse(405, { error: 'method not allowed' });
  } catch (e) {
    console.error('[ops-flags-admin] threw:', e);
    return jsonResponse(500, { error: e.message || 'internal error' });
  }
};

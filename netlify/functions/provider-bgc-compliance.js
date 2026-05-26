// provider-bgc-compliance.js
//
// GET /api/provider-bgc-compliance?provider_ids=id1,id2,...
//
// Public endpoint: computes team BGC compliance per provider so members can
// see which providers have a fully verified team before accepting a bid.
//
// badge values:
//   'all'     — every employee has a current clear check (within 365 days)
//   'partial' — at least one verified but not all
//   'none'    — no checks on file (badge not shown to members)
//
// 365-day expiry: a check is "current" only when status='clear' AND
// expires_at > NOW(). Since expires_at = completed_at + 1 year this naturally
// enforces the annual renewal requirement.

'use strict';

const { createSupabaseClient } = require('./utils');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function resp(status, body) {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'GET') return resp(405, { error: 'Method not allowed' });

  const qs = event.queryStringParameters || {};
  const raw = (qs.provider_ids || '').trim();
  if (!raw) return resp(400, { error: 'provider_ids required' });

  const ids = raw.split(',').map(s => s.trim()).filter(s => UUID_RE.test(s));
  if (!ids.length) return resp(400, { error: 'No valid provider_ids' });
  if (ids.length > 50) return resp(400, { error: 'Too many provider_ids (max 50)' });

  const supabase = createSupabaseClient();
  if (!supabase) return resp(500, { error: 'db_unavailable' });

  const now = new Date().toISOString();

  const { data: checks, error } = await supabase
    .from('employee_background_checks')
    .select('provider_id, status, expires_at, completed_at')
    .in('provider_id', ids)
    .eq('is_current', true);

  if (error) {
    console.error('[provider-bgc-compliance] query error:', error.message);
    return resp(500, { error: 'db_query_failed' });
  }

  const byProvider = {};
  ids.forEach(id => { byProvider[id] = { total: 0, verified: 0, last_checked_at: null }; });

  for (const c of (checks || [])) {
    const row = byProvider[c.provider_id];
    if (!row) continue;
    row.total++;
    if ((c.status === 'clear' || c.status === 'passed') && c.expires_at && c.expires_at > now) {
      row.verified++;
    }
    const at = c.completed_at;
    if (at && (!row.last_checked_at || at > row.last_checked_at)) row.last_checked_at = at;
  }

  const compliance = ids.map(id => {
    const d = byProvider[id];
    const badge = d.total > 0 && d.verified === d.total ? 'all'
                : d.verified > 0 ? 'partial'
                : 'none';
    return { provider_id: id, total: d.total, verified: d.verified, badge, last_checked_at: d.last_checked_at };
  });

  return resp(200, { success: true, compliance });
};

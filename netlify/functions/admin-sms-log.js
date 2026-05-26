// netlify/functions/admin-sms-log.js
//
// Routes:
//   GET  /api/admin/sms-log?page=1&limit=25&status=&type=
//   POST /api/admin/sms-log/refresh-status  body: {message_sid}
//
// Auth: x-admin-password or x-admin-token

'use strict';

const utils = require('./utils');

const PAGE_LIMIT = 25;

function parsePath(event) {
  return (event.path || '')
    .replace(/^\/?\.netlify\/functions\/admin-sms-log\/?/, '')
    .replace(/^\/api\/admin\/sms-log\/?/, '')
    .replace(/^\/+|\/+$/g, '');
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();

  const adminPassword = process.env.ADMIN_PASSWORD;
  const incomingPw = (event.headers['x-admin-password'] || event.headers['X-Admin-Password'] || '').trim();
  const incomingTk = (event.headers['x-admin-token']    || event.headers['X-Admin-Token']    || '').trim();
  const teamTokens = (process.env.ADMIN_TEAM_TOKENS || '').split(',').map(t => t.trim()).filter(Boolean);

  const authed = (adminPassword && incomingPw === adminPassword)
              || (incomingTk && teamTokens.includes(incomingTk));
  if (!authed) return utils.errorResponse(401, 'Unauthorized');

  const supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  const path   = parsePath(event);
  const method = event.httpMethod;

  // ── POST /api/admin/sms-log/refresh-status ──────────────────────────────
  if (method === 'POST' && path === 'refresh-status') {
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch { return utils.errorResponse(400, 'Invalid JSON'); }
    const sid = (body.message_sid || '').trim();
    if (!sid) return utils.errorResponse(400, 'message_sid required');

    const Twilio = (() => { try { return require('twilio'); } catch { return null; } })();
    if (!Twilio || !process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      return utils.errorResponse(503, 'Twilio not configured');
    }
    try {
      const client  = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      const message = await client.messages(sid).fetch();
      const { error } = await supabase.from('sms_log')
        .update({ status: message.status, error_code: message.errorCode ? String(message.errorCode) : null, error_message: message.errorMessage || null })
        .eq('message_sid', sid);
      if (error) throw error;
      return utils.successResponse({ status: message.status });
    } catch (e) {
      return utils.errorResponse(500, e.message);
    }
  }

  // ── GET /api/admin/sms-log ──────────────────────────────────────────────
  if (method === 'GET' && !path) {
    const params    = event.queryStringParameters || {};
    const page      = Math.max(1, parseInt(params.page || '1', 10));
    const limit     = Math.min(100, Math.max(1, parseInt(params.limit || String(PAGE_LIMIT), 10)));
    const offset    = (page - 1) * limit;
    const statusFilter = (params.status || '').trim();
    const typeFilter   = (params.type   || '').trim();

    let q = supabase.from('sms_log')
      .select('id, to_phone_masked, message_type, message_sid, status, error_code, error_message, created_at', { count: 'exact' });
    if (statusFilter) q = q.eq('status', statusFilter);
    if (typeFilter)   q = q.eq('message_type', typeFilter);
    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data: rows, count, error } = await q;
    if (error) return utils.errorResponse(500, error.message);

    // summary stats for last 7 days
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: stats7d } = await supabase.from('sms_log')
      .select('status')
      .gte('created_at', since7d);

    const total7d  = stats7d ? stats7d.length : 0;
    const failed7d = stats7d ? stats7d.filter(r => r.status === 'failed' || r.status === 'undelivered').length : 0;
    const delivered7d = stats7d ? stats7d.filter(r => r.status === 'delivered').length : 0;
    const deliveryRate = total7d > 0 ? Math.round((delivered7d / total7d) * 100) : 100;

    return utils.successResponse({
      rows: rows || [],
      total: count || 0,
      page,
      limit,
      summary: { total7d, failed7d, deliveryRate }
    });
  }

  return utils.errorResponse(404, 'Not found');
};

'use strict';

// GET  /api/member/:userId/login-activity          — list caller's login events (last 30 days, max 50)
// POST /api/login-activity/:activityId/acknowledge — mark a failed attempt as "this was me"
// POST /api/login-activity/:activityId/report-suspicious — flag for security review
//
// Auth: Bearer JWT.  Callers can only access their own rows.

const { createClient } = require('@supabase/supabase-js');

function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function authenticate(event, supabase) {
  const auth = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!auth.startsWith('Bearer ')) return null;
  const { data, error } = await supabase.auth.getUser(auth.slice(7));
  return error || !data?.user ? null : data.user;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' } };
  }

  const supabase = getServiceClient();
  if (!supabase) return json(500, { error: 'Server configuration error' });

  const user = await authenticate(event, supabase);
  if (!user) return json(401, { error: 'Authentication required' });

  const path   = event.path || '';
  const method = event.httpMethod;

  // POST /api/login-activity/:activityId/acknowledge
  const ackMatch = path.match(/\/api\/login-activity\/([0-9a-f-]{36})\/acknowledge$/);
  if (method === 'POST' && ackMatch) {
    const activityId = ackMatch[1];
    const { data, error } = await supabase
      .from('login_activity')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('id', activityId)
      .eq('user_id', user.id)
      .is('acknowledged_at', null)
      .select('id')
      .maybeSingle();

    if (error) return json(500, { error: error.message });
    if (!data) return json(404, { error: 'Activity not found or already acknowledged.' });
    return json(200, { success: true });
  }

  // POST /api/login-activity/:activityId/report-suspicious
  const reportMatch = path.match(/\/api\/login-activity\/([0-9a-f-]{36})\/report-suspicious$/);
  if (method === 'POST' && reportMatch) {
    const activityId = reportMatch[1];
    const { data, error } = await supabase
      .from('login_activity')
      .update({ reported_suspicious: true })
      .eq('id', activityId)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle();

    if (error) return json(500, { error: error.message });
    if (!data) return json(404, { error: 'Activity not found.' });
    return json(200, { success: true, message: 'Suspicious activity reported. We recommend changing your password.' });
  }

  // GET /api/member/:userId/login-activity
  const listMatch = path.match(/\/api\/member\/([0-9a-f-]{36})\/login-activity$/);
  if (method === 'GET' && listMatch) {
    const requestedUserId = listMatch[1];
    if (requestedUserId !== user.id) return json(403, { error: 'Forbidden' });

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: activities, error } = await supabase
      .from('login_activity')
      .select('id, login_at, ip_address, device_type, browser, os, location_city, location_country, is_successful, failure_reason, acknowledged_at, reported_suspicious')
      .eq('user_id', user.id)
      .gte('login_at', since)
      .order('login_at', { ascending: false })
      .limit(50);

    if (error) {
      // Table not provisioned yet — return empty activity list rather than 500
      const tableNotFound = error.code === 'PGRST116'
        || (error.message && (error.message.includes('does not exist') || error.message.includes('relation')));
      if (tableNotFound) {
        return json(200, { success: true, activities: [], failed_unacknowledged_count: 0 });
      }
      return json(500, { error: error.message });
    }

    const rows = activities || [];
    const failed_unacknowledged_count = rows.filter(a => !a.is_successful && !a.acknowledged_at).length;

    return json(200, { success: true, activities: rows, failed_unacknowledged_count });
  }

  return json(404, { error: 'Not found' });
};

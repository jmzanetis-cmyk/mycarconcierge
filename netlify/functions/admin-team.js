const { createClient } = require('@supabase/supabase-js');
const crypto = require('node:crypto');

function createSupabaseClient() {
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token, x-admin-token, x-admin-password',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Credentials': 'true'
    },
    body: JSON.stringify(data)
  };
}

function authenticateAdmin(event) {
  const token = (event.headers['x-admin-token'] || event.headers['X-Admin-Token'] || '').trim();
  const password = (event.headers['x-admin-password'] || event.headers['X-Admin-Password'] || '').trim();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  return token === adminPassword || password === adminPassword;
}

exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return jsonResponse(204, '');
  }

  if (!authenticateAdmin(event)) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  const supabase = createSupabaseClient();
  if (!supabase) {
    return jsonResponse(500, { error: 'Database not configured' });
  }

  const rawPath = event.path || '';
  const path = rawPath
    .replace(/^\/?\.netlify\/functions\/admin-team\/?/, '')
    .replace(/^\/api\/admin\/team\/?/, '')
    .replace(/^\/+/, '');
  const method = event.httpMethod;
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch (e) { body = {}; }
  }

  try {
    if (method === 'GET' && (path === 'members' || path === '')) {
      const { data, error } = await supabase
        .from('admin_team_members')
        .select('id, email, display_name, role, status, last_login, created_at')
        .order('created_at', { ascending: true });
      if (error?.message && error.message.includes('does not exist')) return jsonResponse(200, []);
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, data || []);
    }

    if (method === 'GET' && path === 'invites') {
      const { data, error } = await supabase
        .from('admin_team_invites')
        .select('id, email, role, status, token, created_at, expires_at, invited_by')
        .order('created_at', { ascending: false });
      if (error?.message && error.message.includes('does not exist')) return jsonResponse(200, []);
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, data || []);
    }

    if (method === 'POST' && path === 'invites') {
      const { email, role } = body;
      if (!email || !role) {
        return jsonResponse(400, { error: 'Email and role are required' });
      }
      const validRoles = ['super_admin', 'crm_manager', 'marketing', 'operations', 'finance', 'support'];
      if (!validRoles.includes(role)) {
        return jsonResponse(400, { error: 'Invalid role' });
      }
      const normalizedEmail = email.toLowerCase().trim();
      const { data: existingMembers } = await supabase
        .from('admin_team_members')
        .select('id')
        .eq('email', normalizedEmail)
        .limit(1);
      if (existingMembers && existingMembers.length > 0) {
        return jsonResponse(409, { error: 'A user with this email already exists' });
      }
      const { data: existingInvites } = await supabase
        .from('admin_team_invites')
        .select('id')
        .eq('email', normalizedEmail)
        .eq('status', 'pending')
        .limit(1);
      if (existingInvites && existingInvites.length > 0) {
        return jsonResponse(409, { error: 'A pending invite already exists for this email' });
      }
      const token = crypto.randomBytes(32).toString('hex');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
      const invite = {
        token,
        email: normalizedEmail,
        role,
        invited_by: 'super_admin',
        status: 'pending',
        created_at: now.toISOString(),
        expires_at: expiresAt
      };
      const { data: inserted, error: insertError } = await supabase
        .from('admin_team_invites')
        .insert(invite)
        .select()
        .single();
      if (insertError) return jsonResponse(500, { error: insertError.message });
      const inviteUrl = `https://mycarconcierge.com/admin-invite.html?token=${token}`;
      return jsonResponse(200, {
        success: true,
        invite: { id: inserted.id, token, email: normalizedEmail, role, expires_at: expiresAt },
        inviteUrl
      });
    }

    if (method === 'DELETE' && path.startsWith('invites/')) {
      const inviteId = path.replace('invites/', '');
      const { error } = await supabase
        .from('admin_team_invites')
        .delete()
        .eq('id', inviteId);
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, { success: true });
    }

    return jsonResponse(404, { error: 'Not found' });
  } catch (err) {
    return jsonResponse(500, { error: err.message || 'Internal error' });
  }
};

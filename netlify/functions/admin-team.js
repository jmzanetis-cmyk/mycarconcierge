// netlify/functions/admin-team.js
//
// Routes:
//   GET    /api/admin/team-members          — list team members
//   POST   /api/admin/team-members          — add a team member (direct, no invite)
//   PUT    /api/admin/team-members/:id      — update member
//   DELETE /api/admin/team-members/:id      — remove member
//   GET    /api/admin/team-invites          — list invites
//   POST   /api/admin/team-invites          — create an invite
//   DELETE /api/admin/team-invites/:id      — revoke an invite
//
// Auth: Authorization: Bearer <supabase_token> → verify with getUser → profiles.role === 'admin'

'use strict';

const utils = require('./utils');
const crypto = require('node:crypto');

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    },
    body: JSON.stringify(data)
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();

  const supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  const admin = await utils.authenticateBearerAdmin(event, supabase);
  if (!admin) return utils.errorResponse(401, 'Authentication required');

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

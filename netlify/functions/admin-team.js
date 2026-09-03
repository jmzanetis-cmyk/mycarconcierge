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

// See the 2026-09-03 fix note above exports.handler for why this exists
// instead of the old chained-regex approach.
function normalizeTeamPath(raw) {
  const patterns = [
    [/^\/?\.netlify\/functions\/admin-team\/members\/?/, 'members/'],
    [/^\/?\.netlify\/functions\/admin-team\/invites\/?/, 'invites/'],
    [/^\/?api\/admin\/team-members\/?/, 'members/'],
    [/^\/?api\/admin\/team-invites\/?/, 'invites/'],
  ];
  for (const [re, prefix] of patterns) {
    if (re.test(raw)) {
      const rest = raw.replace(re, '');
      return (prefix + rest).replace(/\/$/, '');
    }
  }
  return raw.replace(/^\/+/, '');
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();

  const supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  const admin = await utils.authenticateBearerAdmin(event, supabase);
  if (!admin) return utils.errorResponse(401, 'Authentication required');

  const rawPath = event.path || '';
  const path = normalizeTeamPath(rawPath);
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

    if (method === 'DELETE' && path.startsWith('invites/') && !path.includes('/send-')) {
      const inviteId = path.replace('invites/', '');
      const { error } = await supabase
        .from('admin_team_invites')
        .delete()
        .eq('id', inviteId);
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, { success: true });
    }

    // Task: admin-portal audit — add/edit/remove member and send-invite
    // email/sms were all missing from this router (fell through to the
    // final 404 below); server.js has working versions but they operate on
    // a JSON-file user store and a bespoke session/password scheme that
    // predates this table. admin-invite.js's accept flow already commits
    // this feature to real Supabase Auth + admin_team_members, so these
    // follow that same model rather than the legacy JSON-file one — see
    // supabase/migrations/20260903a_admin_team_members_invites.sql for the
    // reasoning (that migration also creates the two tables this whole file
    // depends on, which never existed in the database until now).

    if (method === 'POST' && (path === 'members' || path === '')) {
      const { email, password, display_name, role } = body;
      if (!email || !password || !display_name || !role) {
        return jsonResponse(400, { error: 'Email, password, display name, and role are required' });
      }
      const validRoles = ['super_admin', 'crm_manager', 'marketing', 'operations', 'finance', 'support'];
      if (!validRoles.includes(role)) return jsonResponse(400, { error: 'Invalid role' });
      if (password.length < 8) return jsonResponse(400, { error: 'Password must be at least 8 characters' });
      const normalizedEmail = email.toLowerCase().trim();

      const { data: existing } = await supabase
        .from('admin_team_members')
        .select('id')
        .eq('email', normalizedEmail)
        .limit(1);
      if (existing && existing.length > 0) {
        return jsonResponse(409, { error: 'A team member with this email already exists' });
      }

      const { data: authData, error: signUpErr } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true
      });
      if (signUpErr) {
        if (signUpErr.message && signUpErr.message.toLowerCase().includes('already registered')) {
          return jsonResponse(409, { error: 'A user with this email already exists' });
        }
        return jsonResponse(500, { error: signUpErr.message || 'Failed to create account' });
      }

      const { data: inserted, error: insertError } = await supabase
        .from('admin_team_members')
        .insert({ user_id: authData.user.id, email: normalizedEmail, display_name, role, status: 'active' })
        .select('id, email, display_name, role, status')
        .single();
      if (insertError) return jsonResponse(500, { error: insertError.message });

      return jsonResponse(201, inserted);
    }

    if (method === 'PUT' && path.startsWith('members/')) {
      const memberId = path.replace('members/', '');
      const updates = {};
      if (body.role) {
        const validRoles = ['super_admin', 'crm_manager', 'marketing', 'operations', 'finance', 'support'];
        if (!validRoles.includes(body.role)) return jsonResponse(400, { error: 'Invalid role' });
        updates.role = body.role;
      }
      if (body.display_name) updates.display_name = body.display_name;
      if (body.status && ['active', 'disabled', 'inactive'].includes(body.status)) updates.status = body.status;
      updates.updated_at = new Date().toISOString();

      // Password changes go through Supabase Auth, not a column on this
      // table — need the member's user_id first.
      if (body.password) {
        if (body.password.length < 8) return jsonResponse(400, { error: 'Password must be at least 8 characters' });
        const { data: member } = await supabase.from('admin_team_members').select('user_id').eq('id', memberId).single();
        if (member?.user_id) {
          const { error: pwErr } = await supabase.auth.admin.updateUserById(member.user_id, { password: body.password });
          if (pwErr) return jsonResponse(500, { error: pwErr.message || 'Failed to update password' });
        }
      }

      const { error } = await supabase.from('admin_team_members').update(updates).eq('id', memberId);
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, { success: true });
    }

    if (method === 'DELETE' && path.startsWith('members/')) {
      const memberId = path.replace('members/', '');
      // Deactivate rather than hard-delete the Auth user — matches the
      // "disabled" status this table already models, and avoids silently
      // destroying an account that might need to be restored. The row
      // itself is removed so it drops off the roster immediately.
      const { data: member } = await supabase.from('admin_team_members').select('user_id').eq('id', memberId).single();
      if (member?.user_id) {
        try { await supabase.auth.admin.updateUserById(member.user_id, { ban_duration: '876000h' }); } catch (_e) { /* best-effort */ }
      }
      const { error } = await supabase.from('admin_team_members').delete().eq('id', memberId);
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, { success: true });
    }

    if (method === 'POST' && path.match(/^invites\/[^/]+\/send-email$/)) {
      const inviteId = path.split('/')[1];
      const { data: invite, error: lookupErr } = await supabase
        .from('admin_team_invites')
        .select('id, email, role, token')
        .eq('id', inviteId)
        .single();
      if (lookupErr || !invite) return jsonResponse(404, { error: 'Invite not found' });

      let Resend;
      try { ({ Resend } = require('resend')); } catch (_e) { /* not installed */ }
      const apiKey = process.env.RESEND_API_KEY;
      if (!Resend || !apiKey) return jsonResponse(500, { error: 'Email service not configured' });
      const resend = new Resend(apiKey);

      const inviteUrl = `https://mycarconcierge.com/admin-invite.html?token=${invite.token}`;
      const roleLabel = (invite.role || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
      try {
        await resend.emails.send({
          from: 'My Car Concierge <noreply@mycarconcierge.com>',
          to: invite.email,
          subject: "You're Invited to Join the My Car Concierge Admin Team",
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#12161c;color:#f5f5f7;padding:40px;border-radius:16px;">
              <div style="text-align:center;margin-bottom:32px;">
                <h1 style="color:#c9a84c;margin:0;font-size:24px;">My Car Concierge</h1>
                <p style="color:#a0a8b8;margin-top:8px;">Admin Team Invitation</p>
              </div>
              <p style="font-size:16px;line-height:1.6;">You've been invited to join the My Car Concierge admin team as a <strong style="color:#c9a84c;">${roleLabel}</strong>.</p>
              <p style="font-size:14px;line-height:1.6;color:#a0a8b8;">Click the button below to set up your account. This invite expires in 48 hours.</p>
              <div style="text-align:center;margin:32px 0;">
                <a href="${inviteUrl}" style="display:inline-block;padding:14px 32px;background:#c9a84c;color:#12161c;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">Complete Setup</a>
              </div>
              <p style="font-size:12px;color:#6b7280;text-align:center;">If the button doesn't work, copy and paste this link:<br>${inviteUrl}</p>
            </div>
          `
        });
        return jsonResponse(200, { success: true });
      } catch (err) {
        return jsonResponse(500, { error: err.message || 'Failed to send email' });
      }
    }

    if (method === 'POST' && path.match(/^invites\/[^/]+\/send-sms$/)) {
      const inviteId = path.split('/')[1];
      const phone = body.phone || body.phone_number;
      if (!phone) return jsonResponse(400, { error: 'Phone number is required' });

      const { data: invite, error: lookupErr } = await supabase
        .from('admin_team_invites')
        .select('id, email, role, token')
        .eq('id', inviteId)
        .single();
      if (lookupErr || !invite) return jsonResponse(404, { error: 'Invite not found' });

      const inviteUrl = `https://mycarconcierge.com/admin-invite.html?token=${invite.token}`;
      const roleLabel = (invite.role || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
      const smsBody = `My Car Concierge: You've been invited to join the admin team as ${roleLabel}. Set up your account here: ${inviteUrl} (Expires in 48hrs)`;

      const { sendSms } = require('./_shared/sms');
      const result = await sendSms({ supabase, toPhone: phone, body: smsBody });
      if (!result.sent) {
        return jsonResponse(result.reason === 'sms_opt_out' ? 400 : 500, { error: result.error || result.reason || 'Failed to send SMS' });
      }
      return jsonResponse(200, { success: true });
    }

    return jsonResponse(404, { error: 'Not found' });
  } catch (err) {
    return jsonResponse(500, { error: err.message || 'Internal error' });
  }
};

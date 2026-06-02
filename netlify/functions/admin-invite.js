// netlify/functions/admin-invite.js
//
// Public endpoints for accepting admin team invites (no auth required — token IS the credential).
//
// Routes:
//   GET  /api/admin/invite-validate?token=<hex>  — check token validity
//   POST /api/admin/invite-accept                — set password + create team member record

'use strict';

const { createClient } = require('@supabase/supabase-js');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

function json(status, data) {
  return { statusCode: status, headers: CORS, body: JSON.stringify(data) };
}

function createSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  const supabase = createSupabaseClient();
  if (!supabase) return json(500, { error: 'Server configuration error' });

  const rawPath = event.path || '';
  const path = rawPath
    .replace(/^\/?\.netlify\/functions\/admin-invite\/?/, '')
    .replace(/^\/api\/admin\//, '')
    .replace(/^\/+|\/+$/g, '');

  // ── GET /api/admin/invite-validate?token=<hex> ────────────────────────────
  if (event.httpMethod === 'GET' && path === 'invite-validate') {
    const token = (event.queryStringParameters || {}).token || '';
    if (!token) return json(400, { valid: false, reason: 'Missing token' });

    const { data, error } = await supabase
      .from('admin_team_invites')
      .select('id, email, role, status, expires_at')
      .eq('token', token)
      .single();

    if (error || !data) return json(200, { valid: false, reason: 'Invalid invite link' });
    if (data.status !== 'pending') return json(200, { valid: false, reason: 'This invite has already been used or was revoked' });
    if (new Date(data.expires_at) < new Date()) return json(200, { valid: false, reason: 'This invite link has expired' });

    return json(200, { valid: true, email: data.email, role: data.role });
  }

  // ── POST /api/admin/invite-accept ─────────────────────────────────────────
  if (event.httpMethod === 'POST' && path === 'invite-accept') {
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

    const { token, displayName, password } = body;
    if (!token || !displayName || !password) return json(400, { error: 'token, displayName, and password are required' });
    if (password.length < 8) return json(400, { error: 'Password must be at least 8 characters' });

    const { data: invite, error: lookupErr } = await supabase
      .from('admin_team_invites')
      .select('id, email, role, status, expires_at')
      .eq('token', token)
      .single();

    if (lookupErr || !invite) return json(400, { error: 'Invalid invite token' });
    if (invite.status !== 'pending') return json(400, { error: 'This invite has already been used or was revoked' });
    if (new Date(invite.expires_at) < new Date()) return json(400, { error: 'This invite link has expired' });

    // Create Supabase auth user
    const { data: authData, error: signUpErr } = await supabase.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true
    });

    if (signUpErr) {
      if (signUpErr.message && signUpErr.message.toLowerCase().includes('already registered')) {
        return json(409, { error: 'An account with this email already exists' });
      }
      return json(500, { error: signUpErr.message || 'Failed to create account' });
    }

    const userId = authData.user.id;

    // Insert team member record
    await supabase.from('admin_team_members').insert({
      user_id: userId,
      email: invite.email,
      display_name: displayName,
      role: invite.role,
      status: 'active',
      created_at: new Date().toISOString()
    });

    // Mark invite as accepted
    await supabase.from('admin_team_invites')
      .update({ status: 'accepted' })
      .eq('id', invite.id);

    return json(200, { success: true, email: invite.email, role: invite.role });
  }

  return json(404, { error: 'Not found' });
};

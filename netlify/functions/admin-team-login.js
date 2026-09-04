// netlify/functions/admin-team-login.js
//
// POST /api/admin/team-login
//   Body: { email, password }
//
// Task: Team Login (2026-09-03) — the actual sign-in step for the invite
// flow admin-invite.js already builds accounts through. A team member who
// accepted an invite (real Supabase Auth user + admin_team_members row —
// see supabase/migrations/20260903a_admin_team_members_invites.sql and
// netlify/functions/admin-invite.js) signs in here with the email/password
// they set on the accept page (www/admin-invite.html).
//
// The frontend side of this — the team-login form, performTeamLogin(),
// getAdminHeaders() falling back to the stored team token — has existed in
// www/admin.js/admin.html since before this fix and already points at this
// exact route. It was just 404ing: no Netlify function, no www/_redirects
// rule existed for it. The only prior implementation was server.js's
// dev-only in-memory-session version (~line 32185), which can't run here —
// Netlify functions are stateless between invocations, so there is no
// process-local Map to keep a session in.
//
// This verifies the password via real Supabase Auth (these are genuine
// auth.users accounts, not a separate password store) and hands back that
// same Supabase access_token as `token` — it works unmodified with
// utils.authenticateAdminSection's supabase.auth.getUser(token) check,
// exactly like a full super-admin's own session token does. No bespoke
// session store needed.

'use strict';

const utils = require('./utils');
const ADMIN_ROLE_PERMISSIONS = require('../../lib/admin-role-permissions');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();

  const supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  // GET /api/admin/team-login — "who am I" for a session that's already
  // signed in via plain Supabase Auth (Authorization: Bearer <access_token>)
  // rather than this endpoint's own POST. 2026-09-04f: a team member's real
  // credentials also pass the admin portal's ordinary Sign In form (they're
  // genuine auth.users accounts), and that form only ever checked
  // profiles.role === 'admin' — so a team member using it, or just
  // reloading the page with that session still active, landed on "Access
  // Denied" even though their account was perfectly valid. www/admin.js
  // now falls back to this route (no password needed — the bearer token
  // already proves who they are) before giving up. Reuses
  // authenticateAdminSection with no section filter, i.e. "any active
  // team member, whatever their role" — same identity shape POST returns.
  if (event.httpMethod === 'GET') {
    const admin = await utils.authenticateAdminSection(event, supabase, null);
    if (!admin || admin.role === 'super_admin') {
      return utils.errorResponse(403, 'This account is not set up for team admin access');
    }

    // 2026-09-04g: this "whoami" path is a real, successful sign-in for the
    // team member (it's how the page-reload / onAuthStateChange fallback
    // resolves their session) but it was never recording last_login the way
    // the POST path does below — so anyone who only ever landed here (rather
    // than through the password-based Sign In form) showed "Never" in Team
    // Management even after actually logging in and using the portal.
    // Best-effort, same as POST — a failed write must not block the response.
    try {
      await supabase.from('admin_team_members')
        .update({ last_login: new Date().toISOString() })
        .eq('user_id', admin.id);
    } catch (e) {
      console.error('[admin-team-login] GET last_login update failed (non-fatal):', e.message);
    }

    return utils.successResponse({
      success: true,
      token: (event.headers['authorization'] || event.headers['Authorization'] || '').trim().slice(7).trim(),
      user: { displayName: admin.displayName, role: admin.role, email: admin.email },
      permissions: ADMIN_ROLE_PERMISSIONS[admin.role] || []
    });
  }

  if (event.httpMethod !== 'POST') return utils.errorResponse(405, 'Method not allowed');

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return utils.errorResponse(400, 'Invalid JSON'); }

  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  if (!email || !password) return utils.errorResponse(400, 'Email and password are required');

  // Verify the password on a SEPARATE client instance, not `supabase` — calling
  // auth.signInWithPassword() rebinds whichever client it's called on to that
  // user's session, so every later .from() query on the SAME instance would run
  // RLS-scoped as that user instead of as the service role it was created with.
  // admin_team_members has RLS enabled with zero policies (service-role-only
  // access by design), so reusing `supabase` here silently zeroed out the
  // lookup below on every real login attempt.
  const authClient = utils.createSupabaseClient();
  const { data: signInData, error: signInErr } = await authClient.auth.signInWithPassword({ email, password });
  if (signInErr || !signInData || !signInData.user || !signInData.session) {
    // Deliberately generic — don't reveal whether the email exists at all.
    return utils.errorResponse(401, 'Invalid email or password');
  }

  const { data: member, error: memberErr } = await supabase
    .from('admin_team_members')
    .select('id, display_name, role, status')
    .eq('user_id', signInData.user.id)
    .maybeSingle();

  if (memberErr || !member) {
    return utils.errorResponse(403, 'This account is not set up for team admin access');
  }
  if (member.status !== 'active') {
    return utils.errorResponse(403, 'This team account has been disabled — contact an admin.');
  }

  // Best-effort — a failed last_login write must not block the login itself.
  try {
    await supabase.from('admin_team_members')
      .update({ last_login: new Date().toISOString() })
      .eq('id', member.id);
  } catch (e) {
    console.error('[admin-team-login] last_login update failed (non-fatal):', e.message);
  }

  return utils.successResponse({
    success: true,
    token: signInData.session.access_token,
    user: { displayName: member.display_name, role: member.role, email: signInData.user.email },
    permissions: ADMIN_ROLE_PERMISSIONS[member.role] || []
  });
};

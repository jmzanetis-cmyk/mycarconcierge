// POST /api/account/delete
//
// Member-initiated hard delete. Validates the caller's JWT, then runs the
// shared deletion cascade in account-deletion-core.js (same path used by
// the Facebook data-deletion callback). Requires the member to supply their
// current password for confirmation so an attacker with a stolen JWT cannot
// silently wipe an account.
//
// Body: { password: string }
// Auth: Bearer JWT

'use strict';

const { createClient } = require('@supabase/supabase-js');
const { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');
const { performAccountDeletion } = require('./account-deletion-core');

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return require('stripe')(key, { apiVersion: STRIPE_API_VERSION });
}

function getSupabase(key) {
  const url = process.env.SUPABASE_URL;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function resp(status, body) {
  return { statusCode: status, headers: cors, body: JSON.stringify(body) };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return resp(405, { error: 'Method not allowed' });

  const token = (event.headers?.authorization || event.headers?.Authorization || '')
    .replace(/^Bearer\s+/i, '').trim();
  if (!token) return resp(401, { error: 'Authentication required' });

  const anonSupabase = getSupabase(process.env.SUPABASE_ANON_KEY);
  const serviceSupabase = getSupabase(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!anonSupabase || !serviceSupabase) return resp(500, { error: 'Server configuration error' });

  // Validate JWT
  const { data: { user }, error: authErr } = await anonSupabase.auth.getUser(token);
  if (authErr || !user) return resp(401, { error: 'Invalid or expired token' });

  // Require password confirmation to prevent accidental or stolen-token deletion
  let parsed;
  try { parsed = JSON.parse(event.body || '{}'); } catch { return resp(400, { error: 'Invalid JSON' }); }
  const { password } = parsed;
  if (!password || typeof password !== 'string' || password.length < 1) {
    return resp(400, { error: 'password required for account deletion' });
  }

  // Verify the password by attempting a sign-in
  const { error: signInErr } = await anonSupabase.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (signInErr) return resp(403, { error: 'Incorrect password' });

  const requestId = 'del-' + Date.now();
  const result = await performAccountDeletion({
    supabase: serviceSupabase,
    serviceSupabase,
    stripe: getStripe(),
    userId: user.id,
    userEmail: user.email,
    requestId,
    source: 'in_app',
  });

  if (!result.success) {
    return resp(result.statusCode || 500, { error: result.error });
  }
  return resp(200, { success: true });
};

'use strict';

// POST /api/2fa/totp/verify
//   Login-time TOTP challenge. Called after signInWithPassword succeeds and
//   the user is shown the TOTP screen. Verifies the 6-digit code against the
//   user's enrolled TOTP factor via Supabase GoTrue MFA, then writes
//   two_factor_verified_at so the existing page gate (auth-check-access.js)
//   and any future API gate continue to work without changes.
//
//   Body: { factorId: string, code: string (6 digits) }
//   Auth: caller's own Supabase Bearer JWT (not admin-gated).
//
//   Rate-limited via two_factor_rate_limits (action_type='totp_verify'):
//   5 attempts → 15-minute lockout — same parameters as confirm-enroll.

var crypto           = require('node:crypto');
var { createClient } = require('@supabase/supabase-js');

var TOTP_VERIFY_MAX_ATTEMPTS = 5;
var TOTP_LOCKOUT_MS = 15 * 60 * 1000;

// Mirrors hashBackupCode() in totp-enroll.js — must stay in sync.
function hashBackupCode(plaintext) {
  return crypto.createHash('sha256')
    .update(plaintext.replace(/-/g, '').toUpperCase())
    .digest('hex');
}

var headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function jsonResponse(statusCode, data) {
  return { statusCode: statusCode, headers: headers, body: JSON.stringify(data) };
}

function getSupabase() {
  var url = process.env.SUPABASE_URL;
  var key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Mirrors checkTotpVerifyRateLimit() in totp-enroll.js.
async function checkTotpVerifyRateLimit(supabase, userId) {
  var now = new Date();
  var { data: record } = await supabase
    .from('two_factor_rate_limits')
    .select('*')
    .eq('user_id', userId)
    .eq('action_type', 'totp_verify')
    .single();

  if (!record) {
    await supabase.from('two_factor_rate_limits').insert({
      user_id: userId,
      action_type: 'totp_verify',
      attempt_count: 1,
      first_attempt_at: now.toISOString()
    });
    return { allowed: true };
  }

  if (record.locked_until && new Date(record.locked_until) > now) {
    var mins = Math.ceil((new Date(record.locked_until) - now) / 60000);
    return { allowed: false, error: 'Too many failed attempts. Try again in ' + mins + ' minute(s).' };
  }

  if (record.locked_until) {
    await supabase.from('two_factor_rate_limits')
      .update({ attempt_count: 1, locked_until: null,
                first_attempt_at: now.toISOString(), updated_at: now.toISOString() })
      .eq('user_id', userId).eq('action_type', 'totp_verify');
    return { allowed: true };
  }

  if (record.attempt_count >= TOTP_VERIFY_MAX_ATTEMPTS) {
    var lockUntil = new Date(now.getTime() + TOTP_LOCKOUT_MS);
    await supabase.from('two_factor_rate_limits')
      .update({ locked_until: lockUntil.toISOString(), updated_at: now.toISOString() })
      .eq('user_id', userId).eq('action_type', 'totp_verify');
    return { allowed: false, error: 'Too many failed attempts. Account locked for 15 minutes.' };
  }

  await supabase.from('two_factor_rate_limits')
    .update({ attempt_count: record.attempt_count + 1, updated_at: now.toISOString() })
    .eq('user_id', userId).eq('action_type', 'totp_verify');
  return { allowed: true };
}

async function clearTotpVerifyRateLimit(supabase, userId) {
  await supabase.from('two_factor_rate_limits')
    .delete()
    .eq('user_id', userId)
    .eq('action_type', 'totp_verify');
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, { ok: true });
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  var supabase = getSupabase();
  if (!supabase) return jsonResponse(500, { error: 'Server configuration error' });

  var authHeader = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!authHeader.startsWith('Bearer ')) return jsonResponse(401, { error: 'Authentication required' });
  var userToken = authHeader.slice(7).trim();
  if (!userToken) return jsonResponse(401, { error: 'Authentication required' });

  var authResult = await supabase.auth.getUser(userToken);
  var user = authResult.data && authResult.data.user;
  if (authResult.error || !user) return jsonResponse(401, { error: 'Authentication required' });

  var body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) { /* invalid JSON */ }

  var factorId = body.factorId;
  var code     = body.code;
  if (!factorId || typeof factorId !== 'string') return jsonResponse(400, { error: 'factorId required' });
  var isTotpCode   = typeof code === 'string' && /^\d{6}$/.test(code);
  var isBackupCode = typeof code === 'string' && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(code);
  if (!isTotpCode && !isBackupCode) {
    return jsonResponse(400, { error: 'code must be 6 digits or a backup code (XXXX-XXXX)' });
  }

  var rateCheck = await checkTotpVerifyRateLimit(supabase, user.id);
  if (!rateCheck.allowed) return jsonResponse(429, { error: rateCheck.error });

  // ── Backup code path ────────────────────────────────────────────────────
  if (isBackupCode) {
    var bcHash = hashBackupCode(code);
    var { data: backupRow } = await supabase
      .from('totp_backup_codes')
      .select('id, used_at')
      .eq('user_id', user.id)
      .eq('code_hash', bcHash)
      .maybeSingle();

    if (!backupRow) return jsonResponse(422, { error: 'Invalid backup code' });
    if (backupRow.used_at) return jsonResponse(422, { error: 'Backup code already used' });

    await supabase.from('totp_backup_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('id', backupRow.id);
    await clearTotpVerifyRateLimit(supabase, user.id);
    await supabase.from('profiles').update({
      two_factor_verified_at: new Date().toISOString()
    }).eq('id', user.id);

    return jsonResponse(200, { success: true });
  }

  var supabaseUrl = process.env.SUPABASE_URL;
  var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  var challengeRes = await fetch(supabaseUrl + '/auth/v1/factors/' + factorId + '/challenge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + userToken,
      'apikey': supabaseKey
    }
  });
  var challengeData = await challengeRes.json();
  if (!challengeRes.ok) {
    return jsonResponse(challengeRes.status, {
      error: challengeData.msg || challengeData.message || 'Challenge failed'
    });
  }

  var verifyRes = await fetch(supabaseUrl + '/auth/v1/factors/' + factorId + '/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + userToken,
      'apikey': supabaseKey
    },
    body: JSON.stringify({ challenge_id: challengeData.id, code: code })
  });
  var verifyData = await verifyRes.json();
  if (!verifyRes.ok) {
    return jsonResponse(verifyRes.status, {
      error: verifyData.msg || verifyData.message || 'Verification failed'
    });
  }

  await clearTotpVerifyRateLimit(supabase, user.id);

  // Write two_factor_verified_at — the column both the page gate
  // (auth-check-access.js) and the recently-verified shortcut in login.js read.
  await supabase.from('profiles').update({
    two_factor_verified_at: new Date().toISOString()
  }).eq('id', user.id);

  return jsonResponse(200, { success: true });
};

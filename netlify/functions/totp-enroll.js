'use strict';

// POST /api/2fa/totp/enroll
//   Starts TOTP factor enrolment for the authenticated user.
//   Calls the Supabase auth MFA API on behalf of the user (user's own JWT,
//   not admin-gated). Returns factorId, otpauth URI, QR-code SVG, and raw
//   secret for manual entry. Does NOT set two_factor_enabled — that only
//   happens after the first code is successfully verified via confirm-enroll.
//
// POST /api/2fa/totp/confirm-enroll
//   Completes enrolment: verifies the first TOTP code against Supabase MFA,
//   sets profiles.two_factor_enabled = true and two_factor_verified_at = now(),
//   then generates 10 backup codes. Only their SHA-256 hashes are stored in
//   totp_backup_codes; the plaintext codes are returned ONCE in this response
//   and never stored. Any prior backup codes for the user are replaced.
//   Rate-limited via two_factor_rate_limits (action_type='totp_verify'):
//   5 attempts then 15-minute lockout — mirrors verify_code in server.js.
//
// Auth: caller's own Supabase Bearer JWT (not admin-gated).

var crypto = require('node:crypto');
var { createClient } = require('@supabase/supabase-js');

var BACKUP_CODE_COUNT = 10;
var TOTP_VERIFY_MAX_ATTEMPTS = 5;
var TOTP_LOCKOUT_MS = 15 * 60 * 1000;

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

// SHA-256 hash normalised to strip dashes and uppercase — matches hash2faCode()
// in server.js so backup-code redemption (Phase 3) can use the same logic.
function hashBackupCode(plaintext) {
  return crypto.createHash('sha256')
    .update(plaintext.replace(/-/g, '').toUpperCase())
    .digest('hex');
}

// Generates N codes in XXXX-XXXX format.
// Charset omits O, I, 0, 1 to prevent transcription errors.
function generateBackupCodes(n) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var codes = [];
  for (var i = 0; i < n; i++) {
    var bytes = crypto.randomBytes(8);
    var raw = '';
    for (var j = 0; j < 8; j++) raw += chars[bytes[j] % chars.length];
    codes.push(raw.slice(0, 4) + '-' + raw.slice(4));
  }
  return codes;
}

// Mirrors checkVerifyCodeRateLimit() in server.js.
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

  var supabase = getSupabase();
  if (!supabase) return jsonResponse(500, { error: 'Server configuration error' });

  // Authenticate: user's own Bearer JWT (any valid Supabase user).
  var authHeader = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!authHeader.startsWith('Bearer ')) return jsonResponse(401, { error: 'Authentication required' });
  var userToken = authHeader.slice(7).trim();
  if (!userToken) return jsonResponse(401, { error: 'Authentication required' });

  var authResult = await supabase.auth.getUser(userToken);
  var user = authResult.data && authResult.data.user;
  if (authResult.error || !user) return jsonResponse(401, { error: 'Authentication required' });

  var rawPath = (event.path || '').replace(/^\//, '');
  var subPath = rawPath
    .replace(/^\.netlify\/functions\/totp-enroll\/?/, '')
    .replace(/^api\/2fa\/totp\/?/, '');
  var method = event.httpMethod;
  var supabaseUrl = process.env.SUPABASE_URL;
  var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // ── POST /api/2fa/totp/enroll ─────────────────────────────────────────────
  if (method === 'POST' && subPath === 'enroll') {
    // MFA enrol must be performed with the user's own JWT — service-role key
    // as the apikey identifies the project; GoTrue uses the Bearer JWT for the
    // user context on /auth/v1/factors.
    var enrollRes = await fetch(supabaseUrl + '/auth/v1/factors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + userToken,
        'apikey': supabaseKey
      },
      body: JSON.stringify({ factor_type: 'totp', issuer: 'MyCar Concierge' })
    });
    var enrollData = await enrollRes.json();
    if (!enrollRes.ok) {
      return jsonResponse(enrollRes.status, {
        error: enrollData.msg || enrollData.message || enrollData.error_description || 'Enrollment failed'
      });
    }
    return jsonResponse(200, {
      factorId: enrollData.id,
      uri:      enrollData.totp.uri,
      qrCode:   enrollData.totp.qr_code,
      secret:   enrollData.totp.secret
    });
  }

  // ── POST /api/2fa/totp/confirm-enroll ─────────────────────────────────────
  if (method === 'POST' && subPath === 'confirm-enroll') {
    var body = {};
    try { body = JSON.parse(event.body || '{}'); } catch (e) { /* invalid JSON — body stays {} */ }

    var factorId = body.factorId;
    var code     = body.code;
    if (!factorId || typeof factorId !== 'string') {
      return jsonResponse(400, { error: 'factorId required' });
    }
    if (!code || !/^\d{6}$/.test(code)) {
      return jsonResponse(400, { error: 'code must be 6 digits' });
    }

    var rateCheck = await checkTotpVerifyRateLimit(supabase, user.id);
    if (!rateCheck.allowed) return jsonResponse(429, { error: rateCheck.error });

    // Issue a challenge for the factor.
    var challengeRes = await fetch(
      supabaseUrl + '/auth/v1/factors/' + factorId + '/challenge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + userToken,
          'apikey': supabaseKey
        }
      }
    );
    var challengeData = await challengeRes.json();
    if (!challengeRes.ok) {
      return jsonResponse(challengeRes.status, {
        error: challengeData.msg || challengeData.message || 'Challenge failed'
      });
    }

    // Verify the TOTP code against the challenge.
    var verifyRes = await fetch(
      supabaseUrl + '/auth/v1/factors/' + factorId + '/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + userToken,
          'apikey': supabaseKey
        },
        body: JSON.stringify({ challenge_id: challengeData.id, code: code })
      }
    );
    var verifyData = await verifyRes.json();
    if (!verifyRes.ok) {
      return jsonResponse(verifyRes.status, {
        error: verifyData.msg || verifyData.message || 'Verification failed'
      });
    }

    await clearTotpVerifyRateLimit(supabase, user.id);

    // Generate backup codes; store only hashes (plaintext returned once below).
    var plaintextCodes = generateBackupCodes(BACKUP_CODE_COUNT);
    var codeRows = plaintextCodes.map(function(c) {
      return { user_id: user.id, code_hash: hashBackupCode(c) };
    });
    await supabase.from('totp_backup_codes').delete().eq('user_id', user.id);
    await supabase.from('totp_backup_codes').insert(codeRows);

    // Mark the user as enrolled and recently verified (same columns the page
    // gate reads, so auth-check-access.js needs no changes).
    await supabase.from('profiles').update({
      two_factor_enabled:    true,
      two_factor_verified_at: new Date().toISOString()
    }).eq('id', user.id);

    return jsonResponse(200, {
      success:     true,
      backupCodes: plaintextCodes
    });
  }

  return jsonResponse(404, { error: 'Not found' });
};

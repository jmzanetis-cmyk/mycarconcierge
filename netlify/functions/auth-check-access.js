// netlify/functions/auth-check-access.js
//
// Netlify function port of server.js handleAuthCheckAccess (line 6411).
// Called by admin.js immediately after Supabase login to determine whether
// the session also satisfies the 2FA requirement (if the account has it on).
//
// Route: GET /api/auth/check-access
//        Authorization: Bearer <supabase_access_token>
//
// Responses:
//   401 { authorized: false, reason: 'not_authenticated' }
//       No Bearer header, expired token, or Supabase JWT rejection.
//
//   200 { authorized: false, reason: '2fa_required',
//         redirectTo: '/login.html?2fa=required' }
//       Valid user whose profile has two_factor_enabled=true and whose
//       two_factor_verified_at is absent or older than 60 minutes.
//
//   200 { authorized: true, userId: '<uuid>' }
//       Valid user; 2FA either not enabled or verified within the hour.
//
// Fail-open on 2FA DB errors (matches server.js behaviour at line 6352).

'use strict';

var utils = require('./utils');

var UNAUTHORIZED = {
  statusCode: 401,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify({ authorized: false, reason: 'not_authenticated' })
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'GET') return utils.errorResponse(405, 'Method not allowed');

  // ── 1. Extract Bearer token ───────────────────────────────────────────────
  var authHeader = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!authHeader.startsWith('Bearer ')) return UNAUTHORIZED;
  var token = authHeader.slice(7).trim();
  if (!token) return UNAUTHORIZED;

  // ── 2. Validate JWT with Supabase ─────────────────────────────────────────
  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  var authResult = await supabase.auth.getUser(token);
  var user = authResult.data && authResult.data.user;
  if (authResult.error || !user) return UNAUTHORIZED;

  // ── 3. Check 2FA status ───────────────────────────────────────────────────
  try {
    var profileResult = await supabase
      .from('profiles')
      .select('two_factor_enabled, two_factor_verified_at')
      .eq('id', user.id)
      .single();

    var profile = profileResult.data;

    if (profile && profile.two_factor_enabled) {
      var recentlyVerified = false;
      if (profile.two_factor_verified_at) {
        var verifiedAt = new Date(profile.two_factor_verified_at);
        var hourAgo   = new Date(Date.now() - 60 * 60 * 1000);
        recentlyVerified = verifiedAt > hourAgo;
      }

      if (!recentlyVerified) {
        return utils.successResponse({
          authorized: false,
          reason: '2fa_required',
          redirectTo: '/login.html?2fa=required'
        });
      }
    }
  } catch (err) {
    // Fail open — same as server.js line 6352.
    console.error('[auth-check-access] 2FA profile check error:', err.message);
  }

  // ── 4. Authorized ─────────────────────────────────────────────────────────
  return utils.successResponse({ authorized: true, userId: user.id });
};

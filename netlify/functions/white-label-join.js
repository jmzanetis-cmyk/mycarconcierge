// netlify/functions/white-label-join.js
//
// POST /api/white-label/tenant/join
//
// Attaches the authenticated caller to a white-label tenant. Previously
// dead-called -- server.js's dev route was removed and never ported. Ported
// near-verbatim from the pre-deletion www/server.js history (git show
// 5587e05:www/server.js).
//
// Role is ALWAYS server-derived from profiles.role (provider/pending_provider
// -> 'provider', else 'member') -- a client-supplied role is never trusted;
// this preserves a security property from the original handler.
//
// Three mutually exclusive ways to identify the target tenant, checked in
// order:
//   1. body.invite_token       -- signed with the tenant's own join_token.
//                                  No caller generates these yet (the admin
//                                  "generate invite" endpoint doesn't exist),
//                                  ported for completeness / future use.
//   2. body.domain_join_token  -- minted by GET /api/white-label/config when
//                                  an authenticated user hits a resolved
//                                  tenant domain.
//   3. body.tenant_id + x-admin-token header === ADMIN_PASSWORD (admin/manual
//                                  fallback).
//
// NOTE: profiles.tenant_id has no CREATE TABLE/ALTER in supabase/migrations/
// -- schema drift, added directly in Supabase. Trusting it exists, matching
// the original handler (same situation as provider-profile-publish.js's
// directory_slug/directory_opt_in).
//
// 2026-09-11: providers are exclusive to one tenant at a time (Jordan --
// "make sure a provider under one tenant could not be under a different
// tenant"). Enforced two ways: an app-level pre-check here (for a clean 409
// instead of a raw DB error), AND a DB-level partial unique index
// (white_label_tenant_users_provider_exclusive, see
// 20260911_wl_provider_exclusive.sql) as the real guarantee against races.
// Members/admins/owners are unrestricted -- only 'provider' is exclusive.
'use strict';

var crypto = require('node:crypto');
var utils = require('./utils');

var JOIN_RATE_LIMIT_MAX = 10;
var JOIN_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
// CAVEAT: in-memory, per-function-instance only -- same tradeoff as
// utils.publicRateLimit. Blunts abuse from a single hot instance; not a
// cross-instance defence.
var joinRateBuckets = new Map();

function joinRateLimited(userId) {
  var now = Date.now();
  var bucket = joinRateBuckets.get(userId);
  if (!bucket || now - bucket.start > JOIN_RATE_LIMIT_WINDOW_MS) {
    joinRateBuckets.set(userId, { start: now, count: 1 });
    return false;
  }
  if (bucket.count >= JOIN_RATE_LIMIT_MAX) return true;
  bucket.count += 1;
  return false;
}

function decodeToken(raw) {
  try {
    return JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }
}

function timingSafeEqualHex(a, b) {
  try {
    var bufA = Buffer.from(String(a), 'hex');
    var bufB = Buffer.from(String(b), 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch (e) {
    return false;
  }
}

async function resolveTenantFromInviteToken(supabase, body) {
  var decoded = decodeToken(body.invite_token);
  if (!decoded || !decoded.tenant_id || !decoded.expires_at || !decoded.sig) return { error: 'Invalid invite token' };
  if (Date.now() > decoded.expires_at) return { error: 'Invite token expired' };
  var tenantRes = await supabase.from('white_label_tenants').select('*').eq('id', decoded.tenant_id).eq('status', 'active').maybeSingle();
  var tenant = tenantRes.data;
  if (!tenant) return { error: 'Tenant not found' };
  var expectedSig = crypto.createHmac('sha256', tenant.join_token).update(decoded.tenant_id + ':' + decoded.expires_at).digest('hex');
  if (!timingSafeEqualHex(decoded.sig, expectedSig)) return { error: 'Invalid invite token' };
  return { tenant: tenant };
}

async function resolveTenantFromDomainJoinToken(supabase, body, userId) {
  var decoded = decodeToken(body.domain_join_token);
  if (!decoded || !decoded.tenant_id || !decoded.user_id || !decoded.exp || !decoded.sig) return { error: 'Invalid domain join token' };
  if (Date.now() > decoded.exp) return { error: 'Domain join token expired' };
  if (decoded.user_id !== userId) return { error: 'Invalid domain join token' };
  var secret = process.env.ADMIN_PASSWORD || 'wl-domain-secret';
  var expectedSig = crypto.createHmac('sha256', secret).update(decoded.tenant_id + ':' + decoded.user_id + ':' + decoded.exp).digest('hex');
  if (!timingSafeEqualHex(decoded.sig, expectedSig)) return { error: 'Invalid domain join token' };
  var tenantRes = await supabase.from('white_label_tenants').select('*').eq('id', decoded.tenant_id).eq('status', 'active').maybeSingle();
  if (!tenantRes.data) return { error: 'Tenant not found' };
  return { tenant: tenantRes.data };
}

async function resolveTenantFromAdminFallback(supabase, body, event) {
  var adminToken = (event.headers || {})['x-admin-token'] || (event.headers || {})['X-Admin-Token'];
  if (!body.tenant_id || !adminToken || !process.env.ADMIN_PASSWORD || adminToken !== process.env.ADMIN_PASSWORD) {
    return { error: 'invite_token or domain_join is required.' };
  }
  var tenantRes = await supabase.from('white_label_tenants').select('*').eq('id', body.tenant_id).eq('status', 'active').maybeSingle();
  if (!tenantRes.data) return { error: 'Tenant not found' };
  return { tenant: tenantRes.data };
}

var PROVIDER_EXCLUSIVE_MESSAGE = 'This account is already registered as a provider under a different tenant. A provider can only belong to one tenant at a time -- leave the other tenant first.';

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'POST') return utils.errorResponse(405, 'Method not allowed');

  var authHeader = (event.headers || {})['authorization'] || (event.headers || {})['Authorization'];
  var token = authHeader ? String(authHeader).replace(/^Bearer\s+/i, '').trim() : null;
  if (!token) return utils.errorResponse(401, 'Unauthorized');

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(503, 'Service temporarily unavailable');

  var authRes;
  try { authRes = await supabase.auth.getUser(token); } catch (e) { return utils.errorResponse(401, 'Unauthorized'); }
  if (authRes.error || !authRes.data || !authRes.data.user) return utils.errorResponse(401, 'Unauthorized');
  var user = authRes.data.user;

  if (joinRateLimited(user.id)) {
    return utils.errorResponse(429, 'Too many join attempts. Please try again later.');
  }

  var body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch (e) { return utils.errorResponse(400, 'Invalid JSON body'); }

  try {
    var resolution;
    if (body.invite_token) {
      resolution = await resolveTenantFromInviteToken(supabase, body);
    } else if (body.domain_join_token) {
      resolution = await resolveTenantFromDomainJoinToken(supabase, body, user.id);
    } else {
      resolution = await resolveTenantFromAdminFallback(supabase, body, event);
    }
    if (resolution.error) return utils.errorResponse(400, resolution.error);
    var tenant = resolution.tenant;

    // Role is server-derived, never trusted from the client.
    var profileRes = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    var profileRole = profileRes.data ? profileRes.data.role : null;
    var role = (profileRole === 'provider' || profileRole === 'pending_provider') ? 'provider' : 'member';

    // Existing-membership short-circuit: never downgrades an existing role.
    // Checked before the exclusivity check so re-joining the SAME tenant
    // (e.g. a stale client retrying) is always a no-op, never a 409.
    var existingRes = await supabase.from('white_label_tenant_users').select('*').eq('tenant_id', tenant.id).eq('user_id', user.id).maybeSingle();
    if (existingRes.data) {
      return utils.successResponse({ success: true, membership: existingRes.data, already_member: true });
    }

    // Provider exclusivity: a provider may only belong to ONE tenant at a
    // time. Does not apply to members/admins/owners.
    if (role === 'provider') {
      var otherRes = await supabase.from('white_label_tenant_users')
        .select('id')
        .eq('user_id', user.id)
        .eq('role', 'provider')
        .neq('tenant_id', tenant.id)
        .maybeSingle();
      if (otherRes.data) {
        return utils.errorResponse(409, PROVIDER_EXCLUSIVE_MESSAGE);
      }
    }

    // Seat limit check (skip if unlimited, -1).
    var limitCol = role === 'provider' ? 'max_providers' : 'max_members';
    var limit = tenant[limitCol];
    if (limit !== -1 && limit !== null && limit !== undefined) {
      var countRes = await supabase.from('white_label_tenant_users').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('role', role);
      if ((countRes.count || 0) >= limit) {
        return utils.errorResponse(402, 'This tenant has reached its ' + role + ' seat limit.');
      }
    }

    var insertRes = await supabase.from('white_label_tenant_users').insert({ tenant_id: tenant.id, user_id: user.id, role: role }).select().single();
    if (insertRes.error) {
      // Defence-in-depth against the provider-exclusivity race: the DB-level
      // partial unique index (white_label_tenant_users_provider_exclusive)
      // is the real guarantee; this converts its violation into the same
      // friendly message instead of a raw 500.
      if (insertRes.error.code === '23505') return utils.errorResponse(409, PROVIDER_EXCLUSIVE_MESSAGE);
      throw new Error(insertRes.error.message);
    }

    // Best-effort: stamp profiles.tenant_id only if it isn't already set.
    try {
      await supabase.from('profiles').update({ tenant_id: tenant.id }).eq('id', user.id).is('tenant_id', null);
    } catch (e) { /* non-fatal */ }

    return utils.successResponse({ success: true, membership: insertRes.data });
  } catch (err) {
    console.error('[white-label-join]', err.message);
    return utils.errorResponse(500, 'Failed to join tenant');
  }
};

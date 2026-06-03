var crypto = require('node:crypto');

var headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

var UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(str) {
  return UUID_REGEX.test(str);
}

function getGuestTokenSecret() {
  var adminPassword = process.env.COOKIE_SECRET || process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error('[utils] COOKIE_SECRET (or ADMIN_PASSWORD) is required for guest token operations');
  }
  return crypto.createHash('sha256').update('mcc-guest-split-' + adminPassword).digest('hex');
}

function generateGuestToken(participantId) {
  return crypto.createHmac('sha256', getGuestTokenSecret()).update(participantId).digest('hex').substring(0, 32);
}

function verifyGuestToken(participantId, token) {
  if (!token || token.length !== 32) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(generateGuestToken(participantId), 'utf8'));
  } catch (e) {
    return false;
  }
}

function extractPathParam(eventPath) {
  var parts = eventPath.split('/');
  return parts[parts.length - 1];
}

function createSupabaseClient() {
  var createClient = require('@supabase/supabase-js').createClient;
  var supabaseUrl = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return null;
  }
  return createClient(supabaseUrl, serviceKey);
}

// Bearer-token auth for team-accessible endpoints.
// Accepts two kinds of callers via Authorization: Bearer <token>:
//   1. ADMIN_TEAM_TOKENS entry (CSV env var) → { type: 'team' } — no DB round-trip.
//   2. Supabase JWT where profiles.role === 'admin' → { type: 'admin', user }.
// Returns null if the token doesn't match either.
async function authenticateBearerAdminOrTeam(event, supabase) {
  var authHeader = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!authHeader.startsWith('Bearer ')) return null;
  var token = authHeader.slice(7).trim();
  if (!token) return null;

  var teamTokens = (process.env.ADMIN_TEAM_TOKENS || '').split(',').map(function(t) { return t.trim(); }).filter(Boolean);
  if (teamTokens.includes(token)) return { type: 'team' };

  if (!supabase) return null;
  var authResult = await supabase.auth.getUser(token);
  var user = authResult.data && authResult.data.user;
  if (authResult.error || !user) return null;
  var profileResult = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profileResult.error) return null;
  var profile = profileResult.data;
  if (!profile || profile.role !== 'admin') return null;
  return { type: 'admin', user: user };
}

// Bearer-token admin auth: verifies JWT, then checks profiles.role === 'admin'.
// Used by admin Netlify functions that have migrated off the static ADMIN_PASSWORD.
async function authenticateBearerAdmin(event, supabase) {
  var authHeader = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!authHeader.startsWith('Bearer ')) return null;
  var token = authHeader.slice(7).trim();
  if (!token) return null;
  var authResult = await supabase.auth.getUser(token);
  var user = authResult.data && authResult.data.user;
  if (authResult.error || !user) return null;
  var profileResult = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profileResult.error) {
    console.error('[utils] admin profile lookup failed:', profileResult.error.message);
    return null;
  }
  var profile = profileResult.data;
  if (!profile || profile.role !== 'admin') return null;
  return user;
}

function errorResponse(statusCode, message) {
  return {
    statusCode: statusCode,
    headers: headers,
    body: JSON.stringify({ error: message })
  };
}

function successResponse(data) {
  return {
    statusCode: 200,
    headers: headers,
    body: JSON.stringify(data)
  };
}

function optionsResponse() {
  return { statusCode: 200, headers: headers, body: '' };
}

// ---- Shared best-effort per-instance rate limiter ------------------
// Mirrors the dev "public" tier in www/server.js
// (RATE_LIMIT_TIERS.public = { limit: 30, windowMs: 60_000 }).
//
// CAVEAT: this lives in process memory, so each Netlify function
// instance has its own bucket map. Cold starts wipe counters, and
// concurrent instances enforce independently. It blunts a single
// instance being hammered — which is exactly what the dev limiter
// does too — but is NOT a cross-instance defence. If/when we need
// that, swap the backing store (e.g. Upstash, Supabase) behind the
// same API and every caller benefits.
var PUBLIC_RATE_LIMIT_MAX = 30;
var PUBLIC_RATE_LIMIT_WINDOW_MS = 60000;
var rateBuckets = new Map();

function getClientIp(event) {
  var h = event.headers || {};
  var fwd = h['x-forwarded-for'] || h['X-Forwarded-For'] || '';
  if (fwd) return String(fwd).split(',')[0].trim();
  return h['x-nf-client-connection-ip']
      || h['client-ip']
      || (event.clientContext && event.clientContext.ip)
      || 'unknown';
}

function publicRateLimit(prefix, identifier) {
  var now = Date.now();
  var key = prefix + ':' + identifier;
  var bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start > PUBLIC_RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { start: now, count: 1 });
    // Opportunistic cleanup so the Map can't grow unbounded.
    if (rateBuckets.size > 1000) {
      for (var k of rateBuckets.keys()) {
        var b = rateBuckets.get(k);
        if (now - b.start > PUBLIC_RATE_LIMIT_WINDOW_MS) rateBuckets.delete(k);
      }
    }
    return { allowed: true };
  }
  if (bucket.count >= PUBLIC_RATE_LIMIT_MAX) {
    return { allowed: false, retryAfterMs: PUBLIC_RATE_LIMIT_WINDOW_MS - (now - bucket.start) };
  }
  bucket.count += 1;
  return { allowed: true };
}

function rateLimitedResponse(rl) {
  return {
    statusCode: 429,
    headers: Object.assign({}, headers, {
      'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000))
    }),
    body: JSON.stringify({ error: 'Too many requests. Please try again shortly.' })
  };
}

module.exports = {
  headers: headers,
  isValidUUID: isValidUUID,
  generateGuestToken: generateGuestToken,
  verifyGuestToken: verifyGuestToken,
  extractPathParam: extractPathParam,
  createSupabaseClient: createSupabaseClient,
  authenticateBearerAdminOrTeam: authenticateBearerAdminOrTeam,
  authenticateBearerAdmin: authenticateBearerAdmin,
  errorResponse: errorResponse,
  successResponse: successResponse,
  optionsResponse: optionsResponse,
  getClientIp: getClientIp,
  publicRateLimit: publicRateLimit,
  rateLimitedResponse: rateLimitedResponse
};

// ============================================================================
// provider-match-preferences (Task #389)
//
// Serves the per-provider match-preference panel in providers-settings.js:
//
//   GET  /api/provider/match-preferences        — read current prefs row
//   POST /api/provider/match-preferences        — upsert prefs
//   POST /api/provider/match-preferences/resume — clear pause flag
//
// All three require a valid provider Bearer JWT; user_id always comes from
// the token, never the request body.
// ============================================================================

'use strict';

const { createClient } = require('@supabase/supabase-js');

const ALLOWED_CATEGORIES = new Set([
  'maintenance', 'manufacturer_service', 'accident_repair',
  'performance', 'cosmetic', 'offroad', 'snow_removal', 'other'
]);

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    },
    body: typeof data === 'string' ? data : JSON.stringify(data)
  };
}

function getBearerToken(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

async function authenticate(event) {
  const supabase = getServiceSupabase();
  if (!supabase) return { error: jsonResponse(500, { error: 'Database not configured' }) };
  const token = getBearerToken(event);
  if (!token) return { error: jsonResponse(401, { error: 'Authorization Bearer token required' }) };
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return { error: jsonResponse(401, { error: 'invalid or expired token' }) };
    return { supabase, user: data.user };
  } catch (e) {
    return { error: jsonResponse(401, { error: 'token validation failed' }) };
  }
}

async function handleGet(supabase, userId) {
  const { data, error } = await supabase
    .from('provider_match_preferences')
    .select('*')
    .eq('profile_id', userId)
    .maybeSingle();
  if (error) return jsonResponse(500, { error: error.message });
  return jsonResponse(200, data || null);
}

async function handlePost(event, supabase, userId) {
  let body;
  try { body = event.body ? JSON.parse(event.body) : {}; }
  catch { return jsonResponse(400, { error: 'invalid JSON body' }); }

  const { match_categories, match_radius_miles, matches_paused, matches_paused_until } = body;

  const errors = [];
  if (!Array.isArray(match_categories)) {
    errors.push('match_categories must be an array');
  } else {
    const bad = match_categories.filter(c => !ALLOWED_CATEGORIES.has(c));
    if (bad.length) errors.push(`invalid categories: ${bad.join(', ')}`);
  }
  const radius = Number.parseInt(match_radius_miles, 10);
  if (!Number.isFinite(radius) || radius <= 0 || radius > 500) {
    errors.push('match_radius_miles must be an integer 1-500');
  }
  if (typeof matches_paused !== 'boolean') {
    errors.push('matches_paused must be a boolean');
  }
  if (matches_paused_until !== undefined && matches_paused_until !== null) {
    if (typeof matches_paused_until !== 'string' || Number.isNaN(Date.parse(matches_paused_until))) {
      errors.push('matches_paused_until must be an ISO-8601 string or null');
    }
  }
  if (errors.length) return jsonResponse(400, { error: errors.join('; ') });

  const row = {
    profile_id: userId,
    match_categories: match_categories,
    match_radius_miles: radius,
    matches_paused: matches_paused,
    matches_paused_until: (matches_paused && matches_paused_until) ? matches_paused_until : null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('provider_match_preferences')
    .upsert(row, { onConflict: 'profile_id' })
    .select()
    .single();
  if (error) return jsonResponse(500, { error: error.message });
  return jsonResponse(200, { preferences: data });
}

async function handleResume(supabase, userId) {
  const { data, error } = await supabase
    .from('provider_match_preferences')
    .update({ matches_paused: false, matches_paused_until: null, updated_at: new Date().toISOString() })
    .eq('profile_id', userId)
    .select()
    .single();
  if (error) return jsonResponse(500, { error: error.message });
  return jsonResponse(200, { preferences: data });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const auth = await authenticate(event);
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const rawPath = event.path || '';
  const sub = rawPath
    .replace(/^.*?\/(api\/provider\/match-preferences|provider-match-preferences)\/?/, '')
    .replace(/\/+$/, '');

  if (event.httpMethod === 'GET' && sub === '') {
    return handleGet(supabase, user.id);
  }
  if (event.httpMethod === 'POST' && sub === '') {
    return handlePost(event, supabase, user.id);
  }
  if (event.httpMethod === 'POST' && sub === 'resume') {
    return handleResume(supabase, user.id);
  }

  return jsonResponse(405, { error: 'method not allowed' });
};

// ============================================================================
// netlify/functions/provider-profile-save.js
// Server-side endpoint for the provider settings "Save Profile" button
// (Step 1d-1b-2).
//
// PURPOSE:
//   Replaces the dead /api/provider/profile/save endpoint that providers-
//   settings.js has been POSTing to since at least 2026-03 (the route was
//   in _dev-only-api-routes.json:192 and never wired in _redirects, so
//   every Save Profile click returned 404 in prod). This endpoint:
//     1. Authenticates the caller via Bearer JWT (must be the provider
//        themselves — service-role bypasses RLS but we verify identity
//        from the token).
//     2. Geocodes the supplied street/city/state/zip via the in-process
//        geocodeAddress (./geocode), which never throws — failure
//        resolves to {lat:null, lng:null, precision:null}.
//     3. Writes street_address/city/state/zip_code/business_name/
//        business_phone/bio/hourly_rate AND lat/lng to the caller's
//        profiles row in a single UPDATE.
//   The save never blocks on geocode failure (per the 1d-1b never-block
//   rule): if geocode misses, address fields still save and lat/lng go
//   to NULL; the distance gate (1b-5) skips null-coord providers.
//
// PAYLOAD:
//   POST /api/provider/profile/save
//   Authorization: Bearer <provider JWT>
//   Content-Type: application/json
//   {
//     business_name?:  string,
//     phone?:          string,
//     street_address?: string,   // NEW for 1b-2
//     city?:           string,
//     state?:          string,   // 2-letter
//     zip_code?:       string,   // 5-digit
//     bio?:            string,
//     hourly_rate?:    number
//   }
//   All fields optional. Only present fields are updated (partial UPDATE
//   semantics — undefined keys are not sent to the DB).
//
// RESPONSE:
//   200 { ok: true, precision: 'street'|'zip'|null }
//   4xx { error: <sentinel> }   on validation/auth failure
//   500 { error: 'server_misconfigured' | 'update_failed' }
//
// CONVENTIONS: Pattern B (utils.createSupabaseClient, CORS_HEADERS const,
// jsonResp helper, lowercase sentinel errors). Mirrors plan-bids.js +
// geocode.js.
// ============================================================================
'use strict';

const utils = require('./utils');
const { geocodeAddress } = require('./geocode');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

// Map client payload key → profiles column name. The two differ ONLY where
// the client name lacks a noun (e.g. phone → business_phone). Anything
// not in this map is rejected (whitelist semantics).
const FIELD_MAP = {
  business_name:  'business_name',
  phone:          'phone',
  street_address: 'street_address',
  city:           'city',
  state:          'state',
  zip_code:       'zip_code',
};

function jsonResp(code, data) {
  return { statusCode: code, headers: CORS_HEADERS, body: JSON.stringify(data) };
}

function getBearerToken(event) {
  const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

// Build the UPDATE row from the client payload. Includes only whitelisted
// keys that were actually supplied (so a partial save doesn't null-out
// untouched columns). Lightly trims string values.
function buildUpdate(body) {
  const update = {};
  for (const [clientKey, dbCol] of Object.entries(FIELD_MAP)) {
    if (body[clientKey] === undefined) continue;
    let v = body[clientKey];
    if (typeof v === 'string') v = v.trim();
    if (v === '') v = null;
    update[dbCol] = v;
  }
  return update;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return jsonResp(405, { error: 'method_not_allowed' });
  }

  const supabase = utils.createSupabaseClient();
  if (!supabase) return jsonResp(500, { error: 'server_misconfigured' });

  const token = getBearerToken(event);
  if (!token) return jsonResp(401, { error: 'authentication_required' });

  const authResult = await supabase.auth.getUser(token);
  if (authResult.error || !authResult.data || !authResult.data.user) {
    return jsonResp(401, { error: 'invalid_token' });
  }
  const user = authResult.data.user;

  // Role check — endpoint is provider-only (or member with is_also_provider).
  // Members without provider status hitting this path get 403 instead of a
  // silent UPDATE on their profile row.
  const { data: callerProfile, error: roleErr } = await supabase
    .from('profiles')
    .select('role, is_also_provider')
    .eq('id', user.id)
    .maybeSingle();
  if (roleErr || !callerProfile) {
    return jsonResp(403, { error: 'not_a_provider' });
  }
  if (callerProfile.role !== 'provider' && !callerProfile.is_also_provider) {
    return jsonResp(403, { error: 'not_a_provider' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (_e) { return jsonResp(400, { error: 'invalid_json' }); }

  const update = buildUpdate(body);

  // Geocode if any address component was supplied. Use the in-process
  // helper — it handles rate-limiting, retry, zip-centroid fallback, and
  // never throws. Reads the address fields from the *update* object (post-
  // trim) so the geocoder sees what's actually about to be stored.
  let precision = null;
  const addrTouched =
    update.street_address !== undefined ||
    update.city !== undefined ||
    update.state !== undefined ||
    update.zip_code !== undefined;

  if (addrTouched) {
    // Pull the values that will be on the row after this update — present
    // ones from the payload, absent ones from the current DB row.
    const { data: existing } = await supabase
      .from('profiles')
      .select('street_address, city, state, zip_code')
      .eq('id', user.id)
      .maybeSingle();

    const street = update.street_address !== undefined ? update.street_address : (existing && existing.street_address) || '';
    const city   = update.city           !== undefined ? update.city           : (existing && existing.city)           || '';
    const state  = update.state          !== undefined ? update.state          : (existing && existing.state)          || '';
    const zip    = update.zip_code       !== undefined ? update.zip_code       : (existing && existing.zip_code)       || '';

    const result = await geocodeAddress({ street, city, state, zip });
    update.lat = result.lat;
    update.lng = result.lng;
    precision = result.precision;
  }

  // Empty update (no fields supplied + no geocode happened) — nothing to do.
  if (Object.keys(update).length === 0) {
    return jsonResp(200, { ok: true, precision: null, note: 'no_changes' });
  }

  update.updated_at = new Date().toISOString();

  const { error: uErr } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', user.id);

  if (uErr) {
    console.error('[provider-profile-save] update failed:', uErr.message);
    return jsonResp(500, { error: 'update_failed', details: uErr.message });
  }

  return jsonResp(200, { ok: true, precision });
};

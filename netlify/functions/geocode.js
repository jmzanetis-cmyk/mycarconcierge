// ============================================================================
// netlify/functions/geocode.js
// Server-side geocoding service for Step 1d-1b-1.
//
// PURPOSE:
//   - HTTP: POST /api/geocode {street, city, state, zip} → {lat, lng, precision}
//   - In-process: require('./geocode').geocodeAddress({...}) — called by
//     care-plans.js (Stage 1d-1b-4 server-side care_plan create) and
//     plan-bids.js (Stage 1d-1b-5 distance gate).
//
// PIPELINE (per the 1d-1b playbook):
//   1. If street + city + state → Nominatim /search with a proper
//      User-Agent (ToS), ≥1s rate-limit between calls, AbortController
//      5s timeout, retry once on 5xx / timeout. Hit → precision:'street'.
//   2. Else / if step 1 misses → zip_centroids SELECT (service-role).
//      Hit → precision:'zip'.
//   3. Both miss → {lat:null, lng:null, precision:null}.
//
// NEVER-THROW contract:
//   geocodeAddress() always resolves to the {lat, lng, precision} shape.
//   Every internal failure path is caught and folded into precision:null.
//   Callers (savePackage, plan-bids gate) rely on this — geocoding failure
//   must never block job creation or ungate a provider.
//
// CONVENTIONS:
//   Pattern B (matches plan-bids.js): utils.createSupabaseClient(),
//   CORS_HEADERS const, jsonResp helper, lowercase sentinel errors,
//   Bearer-JWT authentication on the HTTP path.
// ============================================================================
'use strict';

const utils = require('./utils');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'MyCarConcierge/1.0 (contact: support@mycarconcierge.com)';
const NOMINATIM_TIMEOUT_MS = 5000;
const NOMINATIM_MIN_INTERVAL_MS = 1000;
const NOMINATIM_RETRY_BACKOFF_MS = 250;

// Best-effort rate-limit timestamp. Lives in module scope so it persists
// across requests served by the same warm function instance. Across cold
// starts and concurrent instances this drifts back to 0 — Nominatim's
// 1-req/s limit is per-IP, and Netlify functions can spread across IPs,
// so worst case we briefly issue a few requests per second. At current
// volume that's acceptable; a DB-backed semaphore is the upgrade path
// if we ever hit the ToS ceiling.
let lastCallAt = 0;

function jsonResp(code, data) {
  return { statusCode: code, headers: CORS_HEADERS, body: JSON.stringify(data) };
}

function getBearerToken(event) {
  const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rateLimitWait() {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < NOMINATIM_MIN_INTERVAL_MS) {
    await sleep(NOMINATIM_MIN_INTERVAL_MS - elapsed);
  }
}

// Normalize a raw zip input to the 5-char string zip_centroids stores.
// Handles ZIP+4 ('12345-6789' → '12345') and zero-padding ('1001' → '01001').
// Returns null if the input doesn't look like a US zip.
function normalizeZip(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const five = s.split('-')[0];
  if (!/^\d{1,5}$/.test(five)) return null;
  return five.padStart(5, '0');
}

// One Nominatim attempt. Resolves to:
//   { ok: true,  data }                                — 2xx with parseable JSON
//   { ok: false, retryable: true,  reason }            — 5xx, timeout, or fetch throw
//   { ok: false, retryable: false, reason }            — 4xx or bad JSON
// Never throws.
async function nominatimFetchOnce(query) {
  const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'Accept-Language': 'en',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status >= 500) {
      return { ok: false, retryable: true, reason: `status_${res.status}` };
    }
    if (!res.ok) {
      return { ok: false, retryable: false, reason: `status_${res.status}` };
    }
    let data;
    try { data = await res.json(); }
    catch (_e) { return { ok: false, retryable: false, reason: 'bad_json' }; }
    return { ok: true, data };
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err && (err.name === 'AbortError' || err.code === 'ABORT_ERR');
    return { ok: false, retryable: true, reason: isAbort ? 'timeout' : 'fetch_error' };
  }
}

// Geocode via Nominatim with rate-limit + one retry on 5xx/timeout.
// Returns {lat, lng} or null. Never throws.
async function geocodeViaNominatim(query) {
  await rateLimitWait();
  let result = await nominatimFetchOnce(query);
  lastCallAt = Date.now();

  if (!result.ok && result.retryable) {
    await sleep(NOMINATIM_RETRY_BACKOFF_MS);
    await rateLimitWait();
    result = await nominatimFetchOnce(query);
    lastCallAt = Date.now();
  }

  if (!result.ok) return null;
  const arr = result.data;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const first = arr[0];
  const lat = parseFloat(first.lat);
  const lng = parseFloat(first.lon);   // Nominatim returns 'lon' — map to lng
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

// Zip-centroid fallback. Service-role SELECT on public.zip_centroids.
// Returns {lat, lng} or null. Never throws.
async function geocodeViaZipCentroid(rawZip) {
  const zip = normalizeZip(rawZip);
  if (!zip) return null;
  const supabase = utils.createSupabaseClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('zip_centroids')
      .select('lat, lng')
      .eq('zip', zip)
      .maybeSingle();
    if (error || !data) return null;
    const lat = parseFloat(data.lat);
    const lng = parseFloat(data.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch (_e) {
    return null;
  }
}

// Named export. Resolves to {lat, lng, precision} where precision is
// 'street' | 'zip' | null. NEVER throws.
async function geocodeAddress(input) {
  const street = input && input.street ? String(input.street).trim() : '';
  const city   = input && input.city   ? String(input.city).trim()   : '';
  const state  = input && input.state  ? String(input.state).trim()  : '';
  const zipRaw = input && (input.zip !== undefined && input.zip !== null) ? String(input.zip).trim() : '';

  // Step 1: street-precise (only if we have enough to form a real query).
  if (street && city && state) {
    let query = `${street}, ${city}, ${state}`;
    if (zipRaw) query += ` ${zipRaw}`;
    const coords = await geocodeViaNominatim(query);
    if (coords) {
      return { lat: coords.lat, lng: coords.lng, precision: 'street' };
    }
  }

  // Step 2: zip-centroid fallback.
  if (zipRaw) {
    const coords = await geocodeViaZipCentroid(zipRaw);
    if (coords) {
      return { lat: coords.lat, lng: coords.lng, precision: 'zip' };
    }
  }

  // Step 3: both missed.
  return { lat: null, lng: null, precision: null };
}

// HTTP handler. POST /api/geocode, JWT-required.
async function handler(event) {
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

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (_e) { return jsonResp(400, { error: 'invalid_json' }); }

  const result = await geocodeAddress({
    street: body.street,
    city:   body.city,
    state:  body.state,
    zip:    body.zip,
  });

  return jsonResp(200, result);
}

exports.handler = handler;
exports.geocodeAddress = geocodeAddress;

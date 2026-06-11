// ============================================================================
// MCC Live Tracking — ETA endpoint (Step 7 / spec §5.2 + §10.4)
//
// GET /api/tracking/eta?job_id=<uuid>
//
// Calls Google Routes API (Compute Routes v2) to get drive-time ETA from the
// latest tracking_ping to the active leg's destination. Only fires when
// live_tracking_enabled = true on the job.
//
// Cost ceiling (§10.4): result is cached in-process for ETA_CACHE_SECS (30 s)
// keyed by job_id. A more precise presence-gate (skip when no viewer is
// subscribed) can be layered on once Supabase Presence is wired on the member
// tracking screen; for pilot volume (Alpha Auto Body) this cache is sufficient.
//
// Auth: Bearer Supabase token → is_job_party(job_id, user_id). Any party
// (member, provider, driver) may call. Non-party → 403. Missing token → 401.
// ============================================================================

'use strict';

const { createClient } = require('@supabase/supabase-js');

const ETA_CACHE_SECS = 30;
const FRESHNESS_SECS = 10 * 60; // ignore pings older than 10 min
const FALLBACK_MPS   = 13.4;    // 30 mph fallback when no speed data

const _etaCache = new Map(); // job_id → { eta_seconds, distance_meters, cached_at }

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function jsonResponse(status, data, extra = {}) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      ...extra,
    },
    body: JSON.stringify(data),
  };
}

function getBearerToken(event) {
  const auth = (event.headers.authorization || event.headers.Authorization || '').trim();
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function isUuid(v) {
  return typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

async function callRoutesApi(originLat, originLng, destLat, destLng) {
  const key = process.env.GOOGLE_ROUTES_API_KEY;
  if (!key) return null;

  const body = {
    origin:      { location: { latLng: { latitude: originLat, longitude: originLng } } },
    destination: { location: { latLng: { latitude: destLat,   longitude: destLng   } } },
    travelMode:  'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
  };

  try {
    const resp = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
        },
        body: JSON.stringify(body),
      }
    );
    if (!resp.ok) {
      console.warn('[tracking-eta] Routes API non-2xx:', resp.status);
      return null;
    }
    const data = await resp.json();
    const route = data.routes && data.routes[0];
    if (!route) return null;
    const durationSecs = route.duration ? parseInt(route.duration.replace('s', ''), 10) : null;
    return {
      eta_seconds:      durationSecs,
      distance_meters:  route.distanceMeters || null,
      source:           'google_routes',
    };
  } catch (e) {
    console.error('[tracking-eta] Routes API threw:', e.message);
    return null;
  }
}

function haversineMeters(a, b) {
  const R = 6_371_000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function haversineEta(ping, dest) {
  const dist = haversineMeters(ping, dest);
  const speed = (ping.speed_smoothed && ping.speed_smoothed > 1 && ping.speed_smoothed < 50)
    ? ping.speed_smoothed
    : FALLBACK_MPS;
  return { eta_seconds: Math.round(dist / speed), distance_meters: Math.round(dist), source: 'haversine' };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, '');
  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'method not allowed' });

  const supabase = getServiceSupabase();
  if (!supabase) return jsonResponse(500, { error: 'supabase not configured' });

  const token = getBearerToken(event);
  if (!token) return jsonResponse(401, { error: 'missing bearer token' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return jsonResponse(401, { error: 'invalid token' });

  const jobId = (event.queryStringParameters || {}).job_id;
  if (!jobId || !isUuid(jobId)) return jsonResponse(400, { error: 'job_id required' });

  // Verify caller is a job party.
  const { data: partyRows, error: partyErr } = await supabase.rpc('is_job_party', {
    p_job_id:  jobId,
    p_user_id: user.id,
  });
  if (partyErr) return jsonResponse(500, { error: partyErr.message });
  if (!partyRows) return jsonResponse(403, { error: 'not a party to this job' });

  // Check cache.
  const cached = _etaCache.get(jobId);
  if (cached && (Date.now() - new Date(cached.cached_at).getTime()) < ETA_CACHE_SECS * 1000) {
    return jsonResponse(200, { ...cached, cache_hit: true });
  }

  // Fetch latest tracking ping + active leg destination.
  const freshCutoff = new Date(Date.now() - FRESHNESS_SECS * 1000).toISOString();
  const [pingRes, legRes, jobRes] = await Promise.all([
    supabase.from('tracking_pings')
      .select('lat, lng, heading, speed, speed_smoothed, accuracy, recorded_at, subject, driver_role')
      .eq('job_id', jobId)
      .gte('recorded_at', freshCutoff)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('concierge_job_legs')
      .select('id, sequence, to_lat, to_lng, to_address, status')
      .eq('job_id', jobId)
      .eq('status', 'in_progress')
      .order('sequence', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase.from('concierge_jobs')
      .select('live_tracking_enabled, dropoff_lat, dropoff_lng, dropoff_address')
      .eq('id', jobId)
      .maybeSingle(),
  ]);

  if (!jobRes.data || !jobRes.data.live_tracking_enabled) {
    return jsonResponse(200, { eta_seconds: null, distance_meters: null, message: 'tracking not enabled' });
  }

  const ping = pingRes.data;
  if (!ping) {
    return jsonResponse(200, { eta_seconds: null, distance_meters: null, message: 'no recent ping' });
  }

  const leg = legRes.data;
  const dest = (leg && leg.to_lat != null)
    ? { lat: leg.to_lat, lng: leg.to_lng, address: leg.to_address }
    : (jobRes.data.dropoff_lat != null
        ? { lat: jobRes.data.dropoff_lat, lng: jobRes.data.dropoff_lng }
        : null);

  if (!dest) {
    return jsonResponse(200, { eta_seconds: null, distance_meters: null, message: 'no destination' });
  }

  // Try Google Routes; fall back to Haversine.
  let result = await callRoutesApi(ping.lat, ping.lng, dest.lat, dest.lng);
  if (!result) result = haversineEta(ping, dest);

  const response = {
    eta_seconds:      result.eta_seconds,
    distance_meters:  result.distance_meters,
    source:           result.source,
    leg_id:           leg ? leg.id : null,
    destination:      dest,
    ping_recorded_at: ping.recorded_at,
    cached_at:        new Date().toISOString(),
    cache_hit:        false,
  };

  _etaCache.set(jobId, response);
  if (_etaCache.size > 1000) {
    for (const [k, v] of _etaCache) {
      if (Date.now() - new Date(v.cached_at).getTime() > 120_000) _etaCache.delete(k);
    }
  }

  return jsonResponse(200, response);
};

// ============================================================================
// Task #335 — Member-facing live driver tracking for active concierge jobs.
//
// Mounted at  /.netlify/functions/member-job-tracking
// Proxied via /api/concierge/active-job-tracking  (see www/_redirects;
// must be listed BEFORE the catch-all /api/concierge/* line so it isn't
// swallowed by concierge-jobs-public).
//
// Routes:
//   GET /api/concierge/active-job-tracking
//          [?job_id=<uuid>]    — track a specific job the caller owns,
//                                otherwise auto-pick the member's most
//                                recent in_progress (or scheduled) job.
//
// Why this exists:
//   driver_location_pings has RLS that lets the driver and admins read
//   pings but NOT the member who's expecting the driver. Rather than
//   relax the RLS (which would also expose every historical breadcrumb),
//   we expose ONLY:
//     - the latest ping per assigned driver
//     - clamped to ≤ TRACKING_FRESHNESS_MS old
//     - only while the job is in_progress / scheduled
//     - only to the member who owns the job
//   through this server-side endpoint, which uses the service-role client
//   to bypass RLS after verifying ownership.
//
// Rate limiting:
//   In-memory per-instance map keyed by (user_id, job_id) with a min
//   interval of TRACKING_MIN_INTERVAL_MS. Drivers ping the DB no more
//   often than every few seconds anyway, and the SELECT is one indexed
//   lookup, so this is sufficient to stop a malicious client from
//   hammering the DB at high QPS. Netlify Functions are short-lived and
//   can scale horizontally, so this is best-effort — the goal is to keep
//   honest clients honest, not to defend against a distributed attack.
//   (If we ever need cross-instance enforcement, swap this for a tiny
//   member_tracking_request_log table like driver_otp_send_log.)
// ============================================================================

const { createClient } = require('@supabase/supabase-js');

// Pings older than this are not returned (matches the brief: "~10 min").
const TRACKING_FRESHNESS_MS  = 10 * 60 * 1000;
// Min ms between requests per (user, job). 4s = comfortably faster than a
// human-perceivable refresh cadence but still well under driver ping rate.
const TRACKING_MIN_INTERVAL_MS = 4 * 1000;
// Statuses where it's meaningful to show a map.
const TRACKABLE_STATUSES = new Set(['scheduled', 'in_progress']);

const _rateMap = new Map(); // key: `${userId}:${jobId}` → lastRequestMs

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function jsonResponse(statusCode, data, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      ...extraHeaders
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

function isUuid(v) {
  return typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// Haversine distance (meters) between two {lat, lng} points.
function haversineMeters(a, b) {
  if (a == null || b == null) return null;
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const R = 6_371_000; // earth radius m
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Compute ETA in seconds from the latest ping to the active leg's
// destination (or job dropoff fallback). Uses ping.speed_mps when it's a
// plausible driving speed; falls back to 30 mph (13.4 m/s).
function estimateEtaSeconds(ping, target) {
  const distM = haversineMeters(ping, target);
  if (distM == null) return null;
  const FALLBACK_MPS = 13.4;
  const speed = (ping.speed_mps && ping.speed_mps > 2 && ping.speed_mps < 50)
    ? ping.speed_mps
    : FALLBACK_MPS;
  return Math.round(distM / speed);
}

function checkRateLimit(userId, jobId) {
  const key = `${userId}:${jobId || '_'}`;
  const now = Date.now();
  const last = _rateMap.get(key) || 0;
  if (now - last < TRACKING_MIN_INTERVAL_MS) {
    const retryAfter = Math.ceil((TRACKING_MIN_INTERVAL_MS - (now - last)) / 1000);
    return { limited: true, retryAfter };
  }
  _rateMap.set(key, now);
  // Cheap GC: keep map bounded.
  if (_rateMap.size > 5_000) {
    for (const [k, v] of _rateMap) if (now - v > 60_000) _rateMap.delete(k);
  }
  return { limited: false };
}

async function authenticateUser(event, supabase) {
  const token = getBearerToken(event);
  if (!token) return { error: jsonResponse(401, { error: 'missing bearer token' }) };
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { error: jsonResponse(401, { error: 'invalid token' }) };
  return { user: data.user };
}

// Find the job to track. If `jobId` is given, verify the caller owns it.
// Otherwise pick the caller's most recent active (in_progress > scheduled)
// concierge job.
async function resolveJob(supabase, userId, jobId) {
  if (jobId) {
    const { data, error } = await supabase
      .from('concierge_jobs')
      .select('id, member_id, status, dropoff_lat, dropoff_lng, dropoff_address, live_tracking_enabled')
      .eq('id', jobId)
      .maybeSingle();
    if (error) return { error: jsonResponse(500, { error: error.message }) };
    if (!data) return { error: jsonResponse(404, { error: 'job not found' }) };
    if (data.member_id !== userId) return { error: jsonResponse(403, { error: 'not your job' }) };
    return { job: data };
  }
  // Auto-pick: prefer in_progress, fall back to scheduled.
  const { data, error } = await supabase
    .from('concierge_jobs')
    .select('id, member_id, status, dropoff_lat, dropoff_lng, dropoff_address, scheduled_start_at, updated_at')
    .eq('member_id', userId)
    .in('status', ['in_progress', 'scheduled'])
    .order('status', { ascending: true })          // 'in_progress' < 'scheduled' lex
    .order('updated_at', { ascending: false })
    .limit(1);
  // Note: auto-pick doesn't select live_tracking_enabled; resolveJob callers
  // that need it should pass jobId explicitly (member tracking screen always does).
  if (error) return { error: jsonResponse(500, { error: error.message }) };
  if (!data || !data.length) return { job: null };
  return { job: data[0] };
}

async function handleTracking(event, supabase, user) {
  const q = event.queryStringParameters || {};
  const requestedJobId = q.job_id || null;
  if (requestedJobId && !isUuid(requestedJobId)) {
    return jsonResponse(400, { error: 'invalid job_id' });
  }

  const rl = checkRateLimit(user.id, requestedJobId);
  if (rl.limited) {
    return jsonResponse(429,
      { error: 'rate_limited', retry_after_seconds: rl.retryAfter },
      { 'Retry-After': String(rl.retryAfter) }
    );
  }

  const resolved = await resolveJob(supabase, user.id, requestedJobId);
  if (resolved.error) return resolved.error;
  if (!resolved.job) {
    return jsonResponse(200, { job: null, tracking: null, message: 'no active job' });
  }
  const job = resolved.job;

  if (!TRACKABLE_STATUSES.has(job.status)) {
    return jsonResponse(200, {
      job: { id: job.id, status: job.status },
      tracking: null,
      message: `job is ${job.status} — tracking unavailable`
    });
  }

  // Find the active (in_progress) leg if any, plus the assigned drivers.
  // Surface DB errors explicitly — we'd rather 500 than silently lie about
  // "no driver assigned yet" when the actual cause is a query failure.
  const [legsRes, assignmentsRes] = await Promise.all([
    supabase.from('concierge_job_legs')
      .select('id, sequence, status, to_lat, to_lng, to_address, from_lat, from_lng')
      .eq('job_id', job.id)
      .order('sequence', { ascending: true }),
    supabase.from('concierge_job_drivers')
      .select('driver_id, role, accepted_at, declined_at')
      .eq('job_id', job.id)
      .is('declined_at', null)
  ]);
  if (legsRes.error)        return jsonResponse(500, { error: legsRes.error.message });
  if (assignmentsRes.error) return jsonResponse(500, { error: assignmentsRes.error.message });
  const legs = legsRes.data, assignments = assignmentsRes.data;

  const activeDriverIds = (assignments || [])
    .filter(a => a.accepted_at)
    .map(a => a.driver_id);

  if (activeDriverIds.length === 0) {
    return jsonResponse(200, {
      job: { id: job.id, status: job.status },
      tracking: { pings: [], drivers: [] },
      message: 'no accepted driver yet'
    });
  }

  // The active leg = first in_progress, fallback to first pending.
  const activeLeg = (legs || []).find(l => l.status === 'in_progress')
                 || (legs || []).find(l => l.status === 'pending')
                 || null;
  const targetPoint = (activeLeg && activeLeg.to_lat != null)
    ? { lat: activeLeg.to_lat, lng: activeLeg.to_lng, address: activeLeg.to_address }
    : (job.dropoff_lat != null
        ? { lat: job.dropoff_lat, lng: job.dropoff_lng, address: job.dropoff_address }
        : null);

  const freshCutoff = new Date(Date.now() - TRACKING_FRESHNESS_MS).toISOString();
  let latestPings = [];

  if (job.live_tracking_enabled) {
    // New tracking system: seed from tracking_pings, return track:job: channel.
    // tracking_pings uses speed (raw) + speed_smoothed; use smoothed for ETA.
    const { data: pingRows, error: pingErr } = await supabase
      .from('tracking_pings')
      .select('driver_id, lat, lng, heading, speed, speed_smoothed, accuracy, recorded_at, subject, driver_role, event_kind, low_power')
      .eq('job_id', job.id)
      .in('driver_id', activeDriverIds)
      .gte('recorded_at', freshCutoff)
      .order('recorded_at', { ascending: false })
      .limit(24);
    if (pingErr) return jsonResponse(500, { error: pingErr.message });

    // Latest ping per (driver_id, subject) tuple — tandem jobs have two subjects.
    const latestPerKey = new Map();
    for (const p of (pingRows || [])) {
      const key = `${p.driver_id}:${p.subject}`;
      if (!latestPerKey.has(key)) latestPerKey.set(key, p);
    }
    latestPings = [...latestPerKey.values()].map(p => ({
      driver_id:       p.driver_id,
      lat:             p.lat,
      lng:             p.lng,
      heading:         p.heading,
      speed_mps:       p.speed,
      speed_smoothed:  p.speed_smoothed,
      accuracy_m:      p.accuracy,
      subject:         p.subject,
      driver_role:     p.driver_role,
      event_kind:      p.event_kind,
      low_power:       p.low_power,
      recorded_at:     p.recorded_at,
      eta_seconds:     targetPoint
        ? estimateEtaSeconds({ ...p, speed_mps: p.speed_smoothed || p.speed }, targetPoint)
        : null,
    }));
  } else {
    // Legacy system: seed from driver_location_pings, return concierge_job: channel.
    // Scoping by job_id is critical — see original comment above.
    const { data: pingRows, error: pingErr } = await supabase
      .from('driver_location_pings')
      .select('id, driver_id, lat, lng, heading, speed_mps, accuracy_m, recorded_at, job_id')
      .eq('job_id', job.id)
      .in('driver_id', activeDriverIds)
      .gte('recorded_at', freshCutoff)
      .order('recorded_at', { ascending: false })
      .limit(24);
    if (pingErr) return jsonResponse(500, { error: pingErr.message });

    const latestPerDriver = new Map();
    for (const p of (pingRows || [])) {
      if (!latestPerDriver.has(p.driver_id)) latestPerDriver.set(p.driver_id, p);
    }
    latestPings = [...latestPerDriver.values()].map(p => ({
      driver_id:   p.driver_id,
      lat:         p.lat,
      lng:         p.lng,
      heading:     p.heading,
      speed_mps:   p.speed_mps,
      accuracy_m:  p.accuracy_m,
      recorded_at: p.recorded_at,
      eta_seconds: targetPoint ? estimateEtaSeconds(p, targetPoint) : null,
    }));
  }

  // Driver name/photo, joined separately (drivers table is small).
  let driverProfiles = [];
  try {
    const { data: drivers } = await supabase.from('drivers')
      .select('id, name, avatar_url')
      .in('id', activeDriverIds);
    driverProfiles = drivers || [];
  } catch { /* best-effort */ }

  // Detect open hold: most recent custody_hold_event per active handoff is hold_start.
  let holdState = null;
  if (job.live_tracking_enabled && activeDriverIds.length > 0) {
    try {
      const { data: handoffs } = await supabase
        .from('custody_handoffs')
        .select('id')
        .eq('job_id', job.id);
      const handoffIds = (handoffs || []).map(h => h.id);
      if (handoffIds.length > 0) {
        const { data: holdRows } = await supabase
          .from('custody_hold_events')
          .select('kind, lat, lng, created_at, handoff_id')
          .in('handoff_id', handoffIds)
          .in('driver_id', activeDriverIds)
          .order('created_at', { ascending: false })
          .limit(4);
        if (holdRows && holdRows.length > 0) {
          const latestByHandoff = new Map();
          for (const row of holdRows) {
            if (!latestByHandoff.has(row.handoff_id)) latestByHandoff.set(row.handoff_id, row);
          }
          for (const [, latest] of latestByHandoff) {
            if (latest.kind === 'hold_start') {
              holdState = { since: latest.created_at, coarse_lat: Math.round(latest.lat * 100) / 100, coarse_lng: Math.round(latest.lng * 100) / 100 };
              break;
            }
          }
        }
      }
    } catch { /* best-effort — hold detection failure does not block the response */ }
  }

  return jsonResponse(200, {
    job: { id: job.id, status: job.status },
    tracking: {
      target:       targetPoint,
      active_leg:   activeLeg ? {
        id: activeLeg.id, sequence: activeLeg.sequence, status: activeLeg.status,
        to_address: activeLeg.to_address
      } : null,
      drivers:      driverProfiles,
      pings:        latestPings,
      hold_state:   holdState,
      freshness_s:  TRACKING_FRESHNESS_MS / 1000,
      // Server-issued Realtime channel descriptor. When live_tracking_enabled,
      // the publisher fires LocPing events on track:job:{id}; viewers subscribe
      // to that channel after first paint. Legacy jobs use the concierge_job:
      // channel (driver-api.js broadcast).
      realtime: job.live_tracking_enabled
        ? {
            channel:    'track:job:' + job.id,
            event:      'loc_ping',
            job_id:     job.id,
            driver_ids: activeDriverIds,
          }
        : {
            channel:    'concierge_job:' + job.id,
            event:      'driver_ping',
            job_id:     job.id,
            driver_ids: activeDriverIds,
          },
      generated_at: new Date().toISOString()
    }
  });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, '');
  if (event.httpMethod !== 'GET')     return jsonResponse(405, { error: 'method not allowed' });

  const supabase = getServiceSupabase();
  if (!supabase) return jsonResponse(500, { error: 'supabase not configured' });

  const { user, error: authErr } = await authenticateUser(event, supabase);
  if (authErr) return authErr;

  try {
    return await handleTracking(event, supabase, user);
  } catch (e) {
    console.error('[member-job-tracking] handler threw:', e);
    return jsonResponse(500, { error: e.message || 'internal error' });
  }
};

// Exported for tests.
exports._internals = {
  haversineMeters,
  estimateEtaSeconds,
  checkRateLimit,
  _rateMap,
  TRACKING_FRESHNESS_MS,
  TRACKING_MIN_INTERVAL_MS
};

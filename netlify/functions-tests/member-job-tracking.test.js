'use strict';
//
// Task #335 — Smoke test for the member-facing live driver tracking endpoint.
//
// Covers:
//   - 401 when bearer token missing
//   - 401 when supabase.auth.getUser rejects
//   - 403 when caller doesn't own the requested job
//   - 404 when job_id doesn't exist
//   - 400 when job_id is malformed
//   - 200 with tracking=null when no active job
//   - 200 with tracking=null when job is completed/cancelled (untrackable)
//   - 200 with pings + ETA when active in_progress job + fresh ping
//   - stale pings (>10 min) are filtered out
//   - 429 on rapid repeat calls (rate limit)
//   - Haversine + ETA helpers behave sensibly
//

process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';

// ────────────────────────────────────────────────────────────────────────────
// Fake supabase client. Each test gives us a fresh module via require-cache
// busting so the in-memory rate-limit map starts clean per test.
// ────────────────────────────────────────────────────────────────────────────

function makeSupabase(world) {
  // world: { authUser, jobs[], legs[], assignments[], pings[], drivers[] }
  function rowsForTable(name) {
    if (name === 'concierge_jobs')          return world.jobs || [];
    if (name === 'concierge_job_legs')      return world.legs || [];
    if (name === 'concierge_job_drivers')   return world.assignments || [];
    if (name === 'driver_location_pings')   return world.pings || [];
    if (name === 'drivers')                 return world.drivers || [];
    return [];
  }
  function builder(name) {
    let rows = rowsForTable(name).slice();
    let limitN = null;
    const b = {
      select() { return b; },
      eq(col, val)       { rows = rows.filter(r => r[col] === val); return b; },
      in(col, vals)      { rows = rows.filter(r => vals.includes(r[col])); return b; },
      is(col, val)       { rows = rows.filter(r => (val === null ? r[col] == null : r[col] === val)); return b; },
      gte(col, val)      { rows = rows.filter(r => r[col] != null && r[col] >= val); return b; },
      order(col, opts)   {
        const asc = !opts || opts.ascending !== false;
        rows.sort((a,b2) => {
          const av = a[col], bv = b2[col];
          if (av === bv) return 0;
          if (av == null) return 1; if (bv == null) return -1;
          return (av < bv ? -1 : 1) * (asc ? 1 : -1);
        });
        return b;
      },
      limit(n)           { limitN = n; return b; },
      maybeSingle()      { return Promise.resolve({ data: rows[0] || null, error: null }); },
      then(resolve)      {
        const out = limitN != null ? rows.slice(0, limitN) : rows;
        return Promise.resolve({ data: out, error: null }).then(resolve);
      }
    };
    return b;
  }
  return {
    from: (name) => builder(name),
    auth: {
      getUser: async (token) => {
        if (world.authReject || !token) return { data: null, error: new Error('bad token') };
        return { data: { user: world.authUser }, error: null };
      }
    }
  };
}

function freshHandler(world) {
  // Bust the cache so in-memory rate-limit map is fresh.
  delete require.cache[require.resolve('../functions/member-job-tracking')];
  const path = require.resolve('@supabase/supabase-js', {
    paths: [require('node:path').join(__dirname, '..', 'functions')]
  });
  require.cache[path] = {
    id: path, filename: path, loaded: true,
    exports: { createClient: () => makeSupabase(world) }
  };
  return require('../functions/member-job-tracking');
}

function req(opts = {}) {
  return {
    httpMethod: 'GET',
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
    queryStringParameters: opts.query || {}
  };
}

(async () => {
  let pass = 0, fail = 0;
  function ok(name, cond) { cond ? (pass++, console.log('  ok  ', name)) : (fail++, console.error('  FAIL', name)); }
  function eq(name, a, b) { ok(name + ` (got=${JSON.stringify(a)} expected=${JSON.stringify(b)})`, a === b); }

  // ── 1. 401 — no bearer token ────────────────────────────────────────────
  {
    const fn = freshHandler({});
    const r = await fn.handler(req());
    eq('no token → 401', r.statusCode, 401);
  }

  // ── 2. 401 — bad token ──────────────────────────────────────────────────
  {
    const fn = freshHandler({ authReject: true });
    const r = await fn.handler(req({ token: 'x' }));
    eq('bad token → 401', r.statusCode, 401);
  }

  // ── 3. 400 — malformed job_id ───────────────────────────────────────────
  {
    const fn = freshHandler({ authUser: { id: 'u1' } });
    const r = await fn.handler(req({ token: 't', query: { job_id: 'not-a-uuid' } }));
    eq('malformed job_id → 400', r.statusCode, 400);
  }

  // ── 4. 404 — job not found ──────────────────────────────────────────────
  {
    const fn = freshHandler({ authUser: { id: 'u1' }, jobs: [] });
    const r = await fn.handler(req({ token: 't', query: { job_id: '11111111-1111-1111-1111-111111111111' } }));
    eq('unknown job_id → 404', r.statusCode, 404);
  }

  // ── 5. 403 — caller doesn't own the job ────────────────────────────────
  {
    const jobId = '22222222-2222-2222-2222-222222222222';
    const fn = freshHandler({
      authUser: { id: 'u1' },
      jobs: [{ id: jobId, member_id: 'someone-else', status: 'in_progress' }]
    });
    const r = await fn.handler(req({ token: 't', query: { job_id: jobId } }));
    eq('not owner → 403', r.statusCode, 403);
  }

  // ── 6. 200 with tracking=null — no active job for member ───────────────
  {
    const fn = freshHandler({ authUser: { id: 'u1' }, jobs: [] });
    const r = await fn.handler(req({ token: 't' }));
    eq('no active job → 200', r.statusCode, 200);
    const body = JSON.parse(r.body);
    ok('no active job → tracking=null', body.tracking === null);
    ok('no active job → job=null',      body.job === null);
  }

  // ── 7. 200 with tracking=null — job is completed (untrackable) ─────────
  {
    const jobId = '33333333-3333-3333-3333-333333333333';
    const fn = freshHandler({
      authUser: { id: 'u1' },
      jobs: [{ id: jobId, member_id: 'u1', status: 'completed' }]
    });
    const r = await fn.handler(req({ token: 't', query: { job_id: jobId } }));
    eq('completed job → 200', r.statusCode, 200);
    const body = JSON.parse(r.body);
    ok('completed job → tracking=null', body.tracking === null);
    ok('completed job → message mentions status', /completed/.test(body.message || ''));
  }

  // ── 8. 200 with pings + ETA — happy path ───────────────────────────────
  {
    const jobId = '44444444-4444-4444-4444-444444444444';
    const driverId = 'dr-1';
    const now = Date.now();
    const fn = freshHandler({
      authUser: { id: 'u1' },
      jobs: [{
        id: jobId, member_id: 'u1', status: 'in_progress',
        dropoff_lat: 30.27, dropoff_lng: -97.74, dropoff_address: '123 Main'
      }],
      legs: [{
        id: 'leg-1', job_id: jobId, sequence: 1, status: 'in_progress',
        from_lat: 30.25, from_lng: -97.75,
        to_lat: 30.27, to_lng: -97.74, to_address: '123 Main'
      }],
      assignments: [{
        job_id: jobId, driver_id: driverId, role: 'primary',
        accepted_at: new Date(now - 60_000).toISOString(), declined_at: null
      }],
      pings: [
        { id: 1, driver_id: driverId, job_id: jobId, lat: 30.26, lng: -97.745, heading: 90, speed_mps: 12,
          accuracy_m: 5, recorded_at: new Date(now - 5_000).toISOString() },
        { id: 2, driver_id: driverId, job_id: jobId, lat: 30.255, lng: -97.748, heading: 92, speed_mps: 13,
          accuracy_m: 5, recorded_at: new Date(now - 30_000).toISOString() }
      ],
      drivers: [{ id: driverId, name: 'Alex Driver', avatar_url: null }]
    });
    const r = await fn.handler(req({ token: 't', query: { job_id: jobId } }));
    eq('happy path → 200', r.statusCode, 200);
    const body = JSON.parse(r.body);
    ok('happy path → tracking present',         body.tracking && Array.isArray(body.tracking.pings));
    eq('happy path → one ping (latest only)',   body.tracking.pings.length, 1);
    eq('happy path → ping is the freshest',     body.tracking.pings[0].lat, 30.26);
    ok('happy path → eta_seconds computed',     typeof body.tracking.pings[0].eta_seconds === 'number');
    ok('happy path → eta_seconds positive',     body.tracking.pings[0].eta_seconds > 0);
    eq('happy path → driver name surfaced',     body.tracking.drivers[0].name, 'Alex Driver');
    ok('happy path → target carries dest',      body.tracking.target && body.tracking.target.lat === 30.27);
    // Task #447 — response carries a Realtime broadcast descriptor the
    // member client uses to subscribe for live driver dot motion.
    ok('happy path → realtime descriptor present', body.tracking.realtime && typeof body.tracking.realtime === 'object');
    eq('happy path → realtime channel scoped to job',
       body.tracking.realtime.channel, 'concierge_job:' + jobId);
    eq('happy path → realtime event name',
       body.tracking.realtime.event, 'driver_ping');
    ok('happy path → realtime driver_ids list',
       Array.isArray(body.tracking.realtime.driver_ids) &&
       body.tracking.realtime.driver_ids.includes(driverId));
  }

  // ── 9. Stale pings (>10 min) get filtered out ──────────────────────────
  {
    const jobId = '55555555-5555-5555-5555-555555555555';
    const fn = freshHandler({
      authUser: { id: 'u1' },
      jobs: [{ id: jobId, member_id: 'u1', status: 'in_progress',
               dropoff_lat: 30.27, dropoff_lng: -97.74 }],
      legs:  [],
      assignments: [{ job_id: jobId, driver_id: 'dr-1', role: 'primary',
                      accepted_at: new Date().toISOString(), declined_at: null }],
      pings: [{ id: 99, driver_id: 'dr-1', job_id: jobId, lat: 30.25, lng: -97.75,
                recorded_at: new Date(Date.now() - 11 * 60 * 1000).toISOString() }],
      drivers: [{ id: 'dr-1', name: 'X' }]
    });
    const r = await fn.handler(req({ token: 't', query: { job_id: jobId } }));
    eq('stale pings → 200', r.statusCode, 200);
    const body = JSON.parse(r.body);
    eq('stale pings filtered out', body.tracking.pings.length, 0);
  }

  // ── 10. Rate-limit kicks in on rapid repeat calls ──────────────────────
  {
    const jobId = '66666666-6666-6666-6666-666666666666';
    const fn = freshHandler({
      authUser: { id: 'u1' },
      jobs: [{ id: jobId, member_id: 'u1', status: 'in_progress' }],
      legs: [], assignments: [], pings: [], drivers: []
    });
    const r1 = await fn.handler(req({ token: 't', query: { job_id: jobId } }));
    const r2 = await fn.handler(req({ token: 't', query: { job_id: jobId } }));
    eq('first call → 200', r1.statusCode, 200);
    eq('second call within 4s → 429', r2.statusCode, 429);
    const body = JSON.parse(r2.body);
    ok('429 carries retry_after_seconds', typeof body.retry_after_seconds === 'number');
    ok('429 sets Retry-After header', !!r2.headers['Retry-After']);
  }

  // ── 11. Helper sanity ──────────────────────────────────────────────────
  {
    const fn = freshHandler({});
    const { haversineMeters, estimateEtaSeconds } = fn._internals;
    // ~111 km per degree of latitude near the equator.
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    ok('haversine ~111km for 1 deg lat', d > 110_000 && d < 112_000);
    const eta = estimateEtaSeconds({ lat: 0, lng: 0, speed_mps: 10 }, { lat: 0, lng: 0.01 });
    ok('estimateEtaSeconds returns positive int', Number.isInteger(eta) && eta > 0);
    const etaNoSpeed = estimateEtaSeconds({ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 });
    ok('estimateEtaSeconds falls back to 30mph when speed missing',
       Number.isInteger(etaNoSpeed) && etaNoSpeed > 0);
  }

  // ── 12. Cross-job exposure regression — pings from OTHER jobs by the
  //        same driver must NOT leak through service-role bypass. ──────
  {
    const jobId      = '77777777-7777-7777-7777-777777777777';
    const otherJobId = '88888888-8888-8888-8888-888888888888';
    const driverId   = 'dr-1';
    const now = Date.now();
    const fn = freshHandler({
      authUser: { id: 'u1' },
      jobs: [{ id: jobId, member_id: 'u1', status: 'in_progress',
               dropoff_lat: 30.27, dropoff_lng: -97.74 }],
      legs: [],
      assignments: [{ job_id: jobId, driver_id: driverId, role: 'primary',
                      accepted_at: new Date(now - 60_000).toISOString(), declined_at: null }],
      // Fresher ping exists but is bound to a DIFFERENT job — must be filtered out.
      pings: [
        { id: 1, driver_id: driverId, job_id: otherJobId, lat: 99.9, lng: 99.9,
          recorded_at: new Date(now - 1_000).toISOString() },
        { id: 2, driver_id: driverId, job_id: jobId,      lat: 30.26, lng: -97.745,
          recorded_at: new Date(now - 5_000).toISOString() }
      ],
      drivers: [{ id: driverId, name: 'X' }]
    });
    const r = await fn.handler(req({ token: 't', query: { job_id: jobId } }));
    eq('cross-job → 200', r.statusCode, 200);
    const body = JSON.parse(r.body);
    eq('cross-job → exactly one ping', body.tracking.pings.length, 1);
    eq('cross-job → returned ping is from THIS job', body.tracking.pings[0].lat, 30.26);
  }

  console.log(`\n${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
})().catch((e) => { console.error('Test runner threw:', e); process.exit(1); });

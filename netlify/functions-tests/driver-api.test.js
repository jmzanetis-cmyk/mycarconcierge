// ============================================================================
// driver-api smoke tests (Task #332)
//
// In-process tests for netlify/functions/driver-api.js. Stubs Supabase with
// chainable mocks (no live DB). Coverage:
//
//   1. send-code: rejects unknown phones with 404 DRIVER_NOT_FOUND.
//   2. send-code: rejects malformed phones with 400 BAD_REQUEST.
//   3. authenticated routes: 401 AUTH_REQUIRED when no Bearer header.
//   4. /jobs/:id: 403 JOB_NOT_ASSIGNED when driver is not on the job.
//   5. /accept: 409 ROLE_TAKEN when another driver already accepted the role.
//   6. /legs/:id/start: 422 LEG_OUT_OF_ORDER if a prior same-role leg is pending.
//   7. /legs/:id/location: success path inserts up to 50 pings; 51 → 400.
//
// Plus a unit assertion that the EXPAND_SCENARIO table in the admin function
// covers all 11 scenarios with sensible leg counts.
//
// Run with:  node netlify/functions-tests/driver-api.test.js
// ============================================================================

'use strict';

const assert = require('assert');

process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';
process.env.SUPABASE_ANON_KEY = 'stub-anon-key';
// No Twilio creds — the send-code happy path is not exercised here; we only
// test the pre-Twilio guards (unknown phone, bad format, rate limit).
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;
delete process.env.TWILIO_VERIFY_SERVICE_SID;

// ---------------------------------------------------------------------------
// Configurable Supabase stub. Each test sets `dbState` to script returns.
// ---------------------------------------------------------------------------

let dbState = {};

function makeChain(table) {
  const filters = {};
  let _selectInsertReturn = null;
  const chain = {
    _table: table,
    select(_cols) { return chain; },
    eq(col, val) { filters[col] = val; return chain; },
    neq(_c,_v) { return chain; },
    gte(_c,_v) { return chain; },
    lte(_c,_v) { return chain; },
    lt(_c,_v)  { return chain; },
    gt(_c,_v)  { return chain; },
    is(_c,_v)  { return chain; },
    not(_c,_o,_v) { return chain; },
    in(_c,_v)  { return chain; },
    order()     { return chain; },
    limit()     { return chain; },
    maybeSingle() {
      const fn = dbState[`${table}.maybeSingle`];
      return Promise.resolve(fn ? fn(filters) : { data: null, error: null });
    },
    single() {
      const fn = dbState[`${table}.single`];
      return Promise.resolve(fn ? fn(filters) : { data: null, error: null });
    },
    insert(rows) {
      const fn = dbState[`${table}.insert`];
      _selectInsertReturn = fn ? fn(rows) : { data: null, error: null };
      return chain;
    },
    update(_row) {
      const fn = dbState[`${table}.update`];
      _selectInsertReturn = fn ? fn(_row, filters) : { data: null, error: null };
      return chain;
    },
    upsert(_row) {
      _selectInsertReturn = { data: _row, error: null };
      return chain;
    },
    delete() { return chain; },
    then(resolve, reject) {
      // For raw SELECT chains used in fanout queries.
      if (_selectInsertReturn) return Promise.resolve(_selectInsertReturn).then(resolve, reject);
      const fn = dbState[`${table}.then`];
      return Promise.resolve(fn ? fn(filters) : { data: [], error: null }).then(resolve, reject);
    }
  };
  return chain;
}

// Per-test override: tests that exercise authenticated routes set
// `currentAuthUserId` to the auth.users.id whose getUser() lookup should
// succeed. Tests that exercise unauthenticated routes leave it null.
let currentAuthUserId = null;
const supabaseStub = {
  from: (t) => makeChain(t),
  auth: {
    getUser: async (_token) => {
      if (!currentAuthUserId) return { data: { user: null }, error: { message: 'no user' } };
      return { data: { user: { id: currentAuthUserId } }, error: null };
    },
    admin: {
      generateLink: async (_opts) => ({
        data: { properties: { hashed_token: 'stub-hashed-token' } }, error: null
      })
    },
    verifyOtp: async (_opts) => ({
      data: { session: { access_token: 'stub-access', refresh_token: 'stub-refresh', expires_in: 3600, expires_at: 9999999999 } },
      error: null
    }),
    refreshSession: async (_opts) => ({
      data: { session: { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600, expires_at: 9999999999 } },
      error: null
    })
  }
};
// Stub the supabase package at every path Node might resolve it to. The
// netlify/functions tree has its own node_modules, so the top-level
// require.resolve and the require.resolve from within netlify/functions/
// can return different absolute paths.
const Module = require('module');
const stubExports = { createClient: () => supabaseStub };
const cacheEntry = (p) => ({ id: p, filename: p, loaded: true, exports: stubExports });
const fnDir = require('node:path').resolve(__dirname, '../functions');
const fnRequire = Module.createRequire(fnDir + '/_resolver.js');
for (const r of [require, fnRequire]) {
  try {
    const p = r.resolve('@supabase/supabase-js');
    require.cache[p] = cacheEntry(p);
  } catch (_) { /* not present at that location */ }
}

// Now load the function under test (after stubbing).
const driverApi = require('../functions/driver-api');

const adminFn = require('../functions/concierge-jobs-admin');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent({ path, method = 'GET', headers = {}, query = {}, body = null }) {
  return {
    path, httpMethod: method,
    headers: { host: 'stub.local', ...headers },
    queryStringParameters: query,
    body: body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body))
  };
}
function parse(res) { try { return JSON.parse(res.body); } catch { return null; } }
function bearer(driverId) {
  // Token contents don't matter — supabaseStub.auth.getUser() is what
  // authorizes. We map driver -> profile_id via PROFILE_FOR. Tests set
  // currentAuthUserId before calling the handler.
  currentAuthUserId = PROFILE_FOR[driverId] || null;
  return { authorization: 'Bearer stub-driver-token-for-' + driverId };
}

const DRIVER_A = '11111111-1111-1111-1111-111111111111';
const DRIVER_B = '22222222-2222-2222-2222-222222222222';
const PROFILE_A = '99999999-9999-9999-9999-9999999999aa';
const PROFILE_B = '99999999-9999-9999-9999-9999999999bb';
const PROFILE_FOR = { [DRIVER_A]: PROFILE_A, [DRIVER_B]: PROFILE_B };
const JOB_X    = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LEG_1    = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
const LEG_2    = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

(async () => {
  // ---- 1) send-code: unknown phone -> 404 ----
  dbState = { 'drivers.maybeSingle': () => ({ data: null, error: null }) };
  let res = await driverApi.handler(makeEvent({
    path: '/api/driver/v1/auth/send-code', method: 'POST',
    body: { phone: '+19998887777' }
  }));
  assert.strictEqual(res.statusCode, 404, '1: unknown phone should be 404');
  assert.strictEqual(parse(res).error.code, 'DRIVER_NOT_FOUND');
  console.log('  ✓ 1) send-code rejects unknown phones with 404 DRIVER_NOT_FOUND');

  // ---- 2) send-code: malformed phone -> 400 ----
  dbState = {};
  res = await driverApi.handler(makeEvent({
    path: '/api/driver/v1/auth/send-code', method: 'POST',
    body: { phone: 'not-a-phone' }
  }));
  assert.strictEqual(res.statusCode, 400, '2: malformed phone should be 400');
  assert.strictEqual(parse(res).error.code, 'BAD_REQUEST');
  console.log('  ✓ 2) send-code rejects malformed phones with 400 BAD_REQUEST');

  // ---- 2b) verify-code happy path -> mints native Supabase session ----
  process.env.TWILIO_ACCOUNT_SID = 'ACstub'; process.env.TWILIO_AUTH_TOKEN = 'stub';
  process.env.TWILIO_VERIFY_SERVICE_SID = 'VAstub';
  const _origFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ status: 'approved' }) });
  dbState = {
    'drivers.maybeSingle': () => ({
      data: { id: DRIVER_A, profile_id: PROFILE_A, full_name: 'A', phone: '+12015550100', email: 'a@example.com', status: 'active' },
      error: null
    })
  };
  res = await driverApi.handler(makeEvent({
    path: '/api/driver/v1/auth/verify-code', method: 'POST',
    body: { phone: '+12015550100', code: '123456' }
  }));
  global.fetch = _origFetch;
  delete process.env.TWILIO_ACCOUNT_SID; delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_VERIFY_SERVICE_SID;
  assert.strictEqual(res.statusCode, 200, '2b: verify-code happy path should be 200');
  const sessBody = parse(res);
  assert.ok(sessBody.access_token, '2b: response must include access_token');
  assert.ok(sessBody.refresh_token, '2b: response must include refresh_token');
  assert.strictEqual(sessBody.token_type, 'Bearer');
  console.log('  ✓ 2b) verify-code happy path mints Supabase access+refresh tokens');

  // ---- 3) authenticated route without bearer -> 401 ----
  dbState = {};
  res = await driverApi.handler(makeEvent({
    path: '/api/driver/v1/me', method: 'GET'
  }));
  assert.strictEqual(res.statusCode, 401, '3: missing JWT should be 401');
  assert.strictEqual(parse(res).error.code, 'AUTH_REQUIRED');
  console.log('  ✓ 3) authenticated routes return 401 AUTH_REQUIRED without bearer');

  // ---- 4) /jobs/:id when not assigned -> 403 ----
  dbState = {
    'drivers.maybeSingle': () => ({ data: { id: DRIVER_A, status: 'active', full_name: 'A', phone: '+12015550100' }, error: null }),
    'concierge_job_drivers.maybeSingle': () => ({ data: null, error: null })
  };
  res = await driverApi.handler(makeEvent({
    path: `/api/driver/v1/jobs/${JOB_X}`, method: 'GET',
    headers: bearer(DRIVER_A)
  }));
  assert.strictEqual(res.statusCode, 403, '4: foreign job should be 403');
  assert.strictEqual(parse(res).error.code, 'JOB_NOT_ASSIGNED');
  console.log('  ✓ 4) fetching another driver\'s job returns 403 JOB_NOT_ASSIGNED');

  // ---- 5) /accept when role already taken by another driver -> 409 ----
  dbState = {
    'drivers.maybeSingle': () => ({ data: { id: DRIVER_A, status: 'active', full_name: 'A', phone: '+12015550100' }, error: null }),
    'concierge_job_drivers.maybeSingle': () => ({
      data: { role: 'primary', accepted_at: null, declined_at: null, job_id: JOB_X }, error: null
    }),
    'concierge_jobs.maybeSingle': () => ({
      data: { id: JOB_X, status: 'scheduled', tier: 1, scenario: 1, legs: [] }, error: null
    }),
    // The fanout SELECT used by handleAccept's role-conflict check
    'concierge_job_drivers.then': () => ({
      data: [{ driver_id: DRIVER_B, role: 'primary', accepted_at: '2026-05-14T10:00:00Z' }], error: null
    })
  };
  res = await driverApi.handler(makeEvent({
    path: `/api/driver/v1/jobs/${JOB_X}/accept`, method: 'POST',
    headers: bearer(DRIVER_A), body: {}
  }));
  assert.strictEqual(res.statusCode, 409, '5: role already taken should be 409');
  assert.strictEqual(parse(res).error.code, 'ROLE_TAKEN');
  console.log('  ✓ 5) accepting an already-taken role returns 409 ROLE_TAKEN');

  // ---- 6) /legs/:id/start out of order -> 422 ----
  dbState = {
    'drivers.maybeSingle': () => ({ data: { id: DRIVER_A, status: 'active', full_name: 'A', phone: '+12015550100' }, error: null }),
    'concierge_job_drivers.maybeSingle': () => ({
      data: { role: 'primary', accepted_at: '2026-05-14T10:00:00Z', declined_at: null, job_id: JOB_X }, error: null
    }),
    'concierge_jobs.maybeSingle': () => ({
      data: {
        id: JOB_X, status: 'scheduled', tier: 1, scenario: 3,
        legs: [
          { id: LEG_1, sequence: 1, leg_type: 'passenger_ride', driver_role: 'primary', status: 'pending' },
          { id: LEG_2, sequence: 2, leg_type: 'passenger_ride', driver_role: 'primary', status: 'pending' }
        ]
      },
      error: null
    })
  };
  res = await driverApi.handler(makeEvent({
    path: `/api/driver/v1/jobs/${JOB_X}/legs/${LEG_2}/start`, method: 'POST',
    headers: bearer(DRIVER_A), body: {}
  }));
  assert.strictEqual(res.statusCode, 422, '6: out-of-order start should be 422');
  assert.strictEqual(parse(res).error.code, 'LEG_OUT_OF_ORDER');
  console.log('  ✓ 6) starting a leg out of sequence returns 422 LEG_OUT_OF_ORDER');

  // ---- 7a) /legs/:id/location with 3 valid pings -> 200 ----
  let lastInsertedRows = null;
  dbState = {
    'drivers.maybeSingle': () => ({ data: { id: DRIVER_A, status: 'active', full_name: 'A', phone: '+12015550100' }, error: null }),
    'concierge_job_drivers.maybeSingle': () => ({
      data: { role: 'primary', accepted_at: '2026-05-14T10:00:00Z', declined_at: null, job_id: JOB_X }, error: null
    }),
    'concierge_jobs.maybeSingle': () => ({
      data: {
        id: JOB_X, status: 'in_progress', tier: 1, scenario: 1,
        legs: [{ id: LEG_1, sequence: 1, leg_type: 'passenger_ride', driver_role: 'primary', status: 'in_progress' }]
      },
      error: null
    }),
    'driver_location_pings.insert': (rows) => { lastInsertedRows = rows; return { data: null, error: null }; }
  };
  res = await driverApi.handler(makeEvent({
    path: `/api/driver/v1/jobs/${JOB_X}/legs/${LEG_1}/location`, method: 'POST',
    headers: bearer(DRIVER_A),
    body: { pings: [
      { lat: 40.7, lng: -74.0 },
      { lat: 40.71, lng: -74.01, accuracy_m: 9 },
      { lat: 40.72, lng: -74.02, heading: 90 }
    ] }
  }));
  assert.strictEqual(res.statusCode, 200, '7a: 3 pings should succeed');
  assert.strictEqual(parse(res).inserted, 3);
  assert.ok(lastInsertedRows && lastInsertedRows.length === 3);
  console.log('  ✓ 7a) location ping batch under 50 inserts succeeds');

  // ---- 7c) /legs/:id/location when leg not started -> 409 LEG_NOT_STARTED ----
  dbState = {
    'drivers.maybeSingle': () => ({ data: { id: DRIVER_A, status: 'active', full_name: 'A', phone: '+12015550100' }, error: null }),
    'concierge_job_drivers.maybeSingle': () => ({
      data: { role: 'primary', accepted_at: '2026-05-14T10:00:00Z', declined_at: null, job_id: JOB_X }, error: null
    }),
    'concierge_jobs.maybeSingle': () => ({
      data: { id: JOB_X, status: 'scheduled', tier: 1, scenario: 1,
        legs: [{ id: LEG_1, sequence: 1, leg_type: 'passenger_ride', driver_role: 'primary', status: 'pending' }] },
      error: null
    })
  };
  res = await driverApi.handler(makeEvent({
    path: `/api/driver/v1/jobs/${JOB_X}/legs/${LEG_1}/location`, method: 'POST',
    headers: bearer(DRIVER_A),
    body: { pings: [{ lat: 40.7, lng: -74.0 }] }
  }));
  assert.strictEqual(res.statusCode, 409, '7c: pings before leg start should be 409');
  assert.strictEqual(parse(res).error.code, 'LEG_NOT_STARTED');
  console.log('  ✓ 7c) location ping before /start returns 409 LEG_NOT_STARTED');

  // ---- 7d) /legs/:id/location for the OTHER role's leg -> 403 LEG_NOT_YOURS ----
  dbState = {
    'drivers.maybeSingle': () => ({ data: { id: DRIVER_A, status: 'active', full_name: 'A', phone: '+12015550100' }, error: null }),
    'concierge_job_drivers.maybeSingle': () => ({
      data: { role: 'primary', accepted_at: '2026-05-14T10:00:00Z', declined_at: null, job_id: JOB_X }, error: null
    }),
    'concierge_jobs.maybeSingle': () => ({
      data: { id: JOB_X, status: 'in_progress', tier: 4, scenario: 9,
        legs: [{ id: LEG_2, sequence: 1, leg_type: 'passenger_ride', driver_role: 'secondary', status: 'in_progress' }] },
      error: null
    })
  };
  res = await driverApi.handler(makeEvent({
    path: `/api/driver/v1/jobs/${JOB_X}/legs/${LEG_2}/location`, method: 'POST',
    headers: bearer(DRIVER_A),
    body: { pings: [{ lat: 40.7, lng: -74.0 }] }
  }));
  assert.strictEqual(res.statusCode, 403, '7d: foreign-role leg pings should be 403');
  assert.strictEqual(parse(res).error.code, 'LEG_NOT_YOURS');
  console.log('  ✓ 7d) location ping for other role\'s leg returns 403 LEG_NOT_YOURS');

  // ---- 7b) /legs/:id/location with 51 pings -> 400 ----
  const tooMany = Array.from({ length: 51 }, () => ({ lat: 40.7, lng: -74.0 }));
  res = await driverApi.handler(makeEvent({
    path: `/api/driver/v1/jobs/${JOB_X}/legs/${LEG_1}/location`, method: 'POST',
    headers: bearer(DRIVER_A), body: { pings: tooMany }
  }));
  assert.strictEqual(res.statusCode, 400, '7b: 51 pings should be 400');
  assert.strictEqual(parse(res).error.code, 'BAD_REQUEST');
  console.log('  ✓ 7b) location ping batch >50 returns 400 BAD_REQUEST');

  // ---- 8) EXPAND_SCENARIO covers all 11 scenarios ----
  for (let s = 1; s <= 11; s++) {
    const blueprint = adminFn.EXPAND_SCENARIO[s];
    assert.ok(Array.isArray(blueprint) && blueprint.length >= 1, `scenario ${s} blueprint missing`);
    for (const leg of blueprint) {
      assert.ok(['passenger_ride','vehicle_shuttle','chase_follow'].includes(leg.leg_type),
        `scenario ${s} bad leg_type ${leg.leg_type}`);
      assert.ok(['primary','secondary'].includes(leg.driver_role),
        `scenario ${s} bad driver_role ${leg.driver_role}`);
    }
    // tier ↔ scenario consistency.
    assert.ok(adminFn.SCENARIO_TIER[s] >= 1 && adminFn.SCENARIO_TIER[s] <= 4);
  }
  console.log('  ✓ 8) EXPAND_SCENARIO covers all 11 scenarios');

  console.log('\nAll driver-api smoke tests passed.');
})().catch(e => { console.error('TEST FAILURE:', e); process.exit(1); });

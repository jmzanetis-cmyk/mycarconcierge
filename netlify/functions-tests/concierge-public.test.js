// ============================================================================
// concierge-jobs-public smoke tests (Task #369)
//
// In-process tests for netlify/functions/concierge-jobs-public.js. Stubs
// Supabase with chainable mocks (no live DB).
//
// Coverage:
//   1. Missing bearer token -> 401.
//   2. Member create with no appointment -> 200, member_id forced to caller,
//      created_by_kind='member', created_by_id=caller, status='requested'.
//   3. Member create with someone else's appointment -> 403.
//   4. Provider create requires provider role -> 403 when caller isn't one.
//   5. Provider create with own appointment -> 200, provider_id=caller.
//   6. Cancel by non-owner -> 403; by owner -> 200.
//   7. Scenario expansion mirrors the admin function (parity).
//   8. Bad scenario number -> 400.
//
// Run with:  node netlify/functions-tests/concierge-public.test.js
// ============================================================================

'use strict';
const assert = require('assert');

process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';
process.env.SUPABASE_ANON_KEY = 'stub-anon-key';

let dbState = {};
let lastInserted = {};
let currentAuthUserId = null;

function makeChain(table) {
  const filters = {};
  let _ret = null;
  const chain = {
    _table: table,
    select() { return chain; },
    eq(c, v) { filters[c] = v; return chain; },
    neq() { return chain; }, gte() { return chain; }, lte() { return chain; },
    in() { return chain; }, is() { return chain; }, not() { return chain; },
    order() { return chain; }, limit() { return chain; },
    maybeSingle() {
      const fn = dbState[`${table}.maybeSingle`];
      return Promise.resolve(fn ? fn(filters) : { data: null, error: null });
    },
    single() {
      const fn = dbState[`${table}.single`];
      return Promise.resolve(fn ? fn(filters) : { data: null, error: null });
    },
    insert(rows) {
      lastInserted[table] = rows;
      const fn = dbState[`${table}.insert`];
      _ret = fn ? fn(rows) : { data: rows, error: null };
      return chain;
    },
    update(row) {
      lastInserted[`${table}.update`] = { row, filters: { ...filters } };
      const fn = dbState[`${table}.update`];
      _ret = fn ? fn(row, filters) : { data: row, error: null };
      return chain;
    },
    upsert(r) { _ret = { data: r, error: null }; return chain; },
    delete() { return chain; },
    then(resolve, reject) {
      if (_ret) return Promise.resolve(_ret).then(resolve, reject);
      const fn = dbState[`${table}.then`];
      return Promise.resolve(fn ? fn(filters) : { data: [], error: null }).then(resolve, reject);
    }
  };
  return chain;
}

const supabaseStub = {
  from: (t) => makeChain(t),
  auth: {
    getUser: async (_t) => {
      if (!currentAuthUserId) return { data: { user: null }, error: { message: 'no user' } };
      return { data: { user: { id: currentAuthUserId } }, error: null };
    }
  }
};

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

const fn = require('../functions/concierge-jobs-public');
const adminFn = require('../functions/concierge-jobs-admin');

function makeEvent({ path, method = 'GET', headers = {}, query = {}, body = null }) {
  return {
    path, httpMethod: method,
    headers: { host: 'stub.local', ...headers },
    queryStringParameters: query,
    body: body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body))
  };
}
function parse(res) { try { return JSON.parse(res.body); } catch { return null; } }
function bearerFor(userId) {
  currentAuthUserId = userId;
  return { authorization: `Bearer stub-${userId}` };
}

const MEMBER_A   = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const MEMBER_B   = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PROVIDER_X = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const APPT_1     = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const JOB_1      = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

(async () => {
  // ---- 1) missing bearer -> 401 ----
  currentAuthUserId = null;
  let res = await fn.handler(makeEvent({ path: '/api/concierge', method: 'GET' }));
  assert.strictEqual(res.statusCode, 401, '1: missing bearer should be 401');
  console.log('  ✓ 1) missing bearer returns 401');

  // ---- 2) member create with no appointment ----
  lastInserted = {};
  dbState = {
    'profiles.maybeSingle': () => ({ data: { id: MEMBER_A, role: 'member' }, error: null }),
    'concierge_jobs.single': (_f) => ({
      data: { id: JOB_1, member_id: MEMBER_A, scenario: 1, tier: 1,
              pickup_address: '1 Main', dropoff_address: '2 Shop',
              pickup_lat: 40, pickup_lng: -74, dropoff_lat: 41, dropoff_lng: -75 },
      error: null
    }),
    'concierge_job_legs.then': () => ({ data: [{ id: 'leg-1' }], error: null })
  };
  res = await fn.handler(makeEvent({
    path: '/api/concierge', method: 'POST',
    headers: bearerFor(MEMBER_A),
    body: { tier: 1, scenario: 1, pickup_address: '1 Main', dropoff_address: '2 Shop' }
  }));
  assert.strictEqual(res.statusCode, 200, '2: member create should be 200, got ' + res.statusCode + ' ' + res.body);
  const insertedJob = lastInserted['concierge_jobs'];
  assert.strictEqual(insertedJob.member_id, MEMBER_A, '2: member_id forced to caller');
  assert.strictEqual(insertedJob.created_by_kind, 'member');
  assert.strictEqual(insertedJob.created_by_id, MEMBER_A);
  assert.strictEqual(insertedJob.status, 'requested');
  console.log('  ✓ 2) member create defaults member_id, created_by_kind=member, status=requested');

  // ---- 3) member tries to ride on someone else's appointment -> 403 ----
  lastInserted = {};
  dbState = {
    'profiles.maybeSingle': () => ({ data: { id: MEMBER_A, role: 'member' }, error: null }),
    'appointments.maybeSingle': () => ({
      data: { id: APPT_1, member_id: MEMBER_B, provider_id: PROVIDER_X }, error: null
    })
  };
  res = await fn.handler(makeEvent({
    path: '/api/concierge', method: 'POST',
    headers: bearerFor(MEMBER_A),
    body: { tier: 1, scenario: 1, appointment_id: APPT_1 }
  }));
  assert.strictEqual(res.statusCode, 403, '3: cross-member appointment should be 403');
  console.log('  ✓ 3) member cannot create job on someone else\'s appointment (403)');

  // ---- 4) provider create when caller isn\'t a provider -> 403 ----
  dbState = {
    'profiles.maybeSingle': () => ({ data: { id: MEMBER_A, role: 'member' }, error: null })
  };
  res = await fn.handler(makeEvent({
    path: '/api/concierge', method: 'POST',
    headers: bearerFor(MEMBER_A),
    body: { tier: 1, scenario: 1, appointment_id: APPT_1, created_by_kind: 'provider' }
  }));
  assert.strictEqual(res.statusCode, 403, '4: non-provider acting as provider should be 403');
  console.log('  ✓ 4) non-provider creating as provider returns 403');

  // ---- 5) provider create with own appointment -> 200 ----
  lastInserted = {};
  dbState = {
    'profiles.maybeSingle': () => ({ data: { id: PROVIDER_X, role: 'provider' }, error: null }),
    'appointments.maybeSingle': () => ({
      data: { id: APPT_1, member_id: MEMBER_A, provider_id: PROVIDER_X }, error: null
    }),
    'concierge_jobs.single': () => ({
      data: { id: JOB_1, member_id: MEMBER_A, provider_id: PROVIDER_X, scenario: 4, tier: 2,
              pickup_address: 'a', dropoff_address: 'b', pickup_lat: 0, pickup_lng: 0, dropoff_lat: 0, dropoff_lng: 0 },
      error: null
    }),
    'concierge_job_legs.then': () => ({ data: [{ id: 'leg-1' }], error: null })
  };
  res = await fn.handler(makeEvent({
    path: '/api/concierge', method: 'POST',
    headers: bearerFor(PROVIDER_X),
    body: { tier: 2, scenario: 4, appointment_id: APPT_1, created_by_kind: 'provider' }
  }));
  assert.strictEqual(res.statusCode, 200, '5: provider create should be 200');
  const provJob = lastInserted['concierge_jobs'];
  assert.strictEqual(provJob.member_id, MEMBER_A, '5: member_id read from appointment');
  assert.strictEqual(provJob.provider_id, PROVIDER_X);
  assert.strictEqual(provJob.created_by_kind, 'provider');
  assert.strictEqual(provJob.created_by_id, PROVIDER_X);
  console.log('  ✓ 5) provider create with own appointment populates provider_id + created_by_kind=provider');

  // ---- 6) cancel: non-owner forbidden, owner allowed ----
  dbState = {
    'profiles.maybeSingle': () => ({ data: { id: MEMBER_B, role: 'member' }, error: null }),
    'concierge_jobs.maybeSingle': () => ({
      data: { id: JOB_1, status: 'requested', member_id: MEMBER_A, provider_id: null, created_by_id: MEMBER_A },
      error: null
    })
  };
  res = await fn.handler(makeEvent({
    path: `/api/concierge/${JOB_1}/cancel`, method: 'POST',
    headers: bearerFor(MEMBER_B), body: { reason: 'wrong person' }
  }));
  assert.strictEqual(res.statusCode, 403, '6a: non-owner cancel should be 403');

  dbState['profiles.maybeSingle'] = () => ({ data: { id: MEMBER_A, role: 'member' }, error: null });
  res = await fn.handler(makeEvent({
    path: `/api/concierge/${JOB_1}/cancel`, method: 'POST',
    headers: bearerFor(MEMBER_A), body: { reason: 'changed plans' }
  }));
  assert.strictEqual(res.statusCode, 200, '6b: owner cancel should be 200, got ' + res.statusCode + ' ' + res.body);
  console.log('  ✓ 6) cancel forbids non-owner (403) and allows owner (200)');

  // ---- 7) parity with admin scenario table ----
  for (let s = 1; s <= 11; s++) {
    assert.deepStrictEqual(fn.EXPAND_SCENARIO[s], adminFn.EXPAND_SCENARIO[s],
      `scenario ${s} blueprint must match admin function`);
  }
  console.log('  ✓ 7) public + admin EXPAND_SCENARIO tables are identical');

  // ---- 8) bad scenario -> 400 ----
  dbState = { 'profiles.maybeSingle': () => ({ data: { id: MEMBER_A, role: 'member' }, error: null }) };
  res = await fn.handler(makeEvent({
    path: '/api/concierge', method: 'POST',
    headers: bearerFor(MEMBER_A),
    body: { tier: 1, scenario: 99 }
  }));
  assert.strictEqual(res.statusCode, 400, '8: bad scenario should be 400');
  console.log('  ✓ 8) bad scenario returns 400 validation error');

  console.log('\nAll concierge-jobs-public smoke tests passed.');
})().catch(e => { console.error('TEST FAILURE:', e); process.exit(1); });

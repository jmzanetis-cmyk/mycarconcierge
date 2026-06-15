// ============================================================================
// ride-cancellation.test.js
//
// Covers:
//   1) GET /cancellation-notice 404 when job not found
//   2) GET /cancellation-notice 200 returns policy + estimated fee
//   3) POST /cancel 401 without auth
//   4) POST /cancel 400 on invalid fault value
//   5) POST /cancel 404 when job not found
//   6) POST /cancel 409 when job already cancelled
//   7) POST /cancel 200 happy path — creates cancellation record
// ============================================================================
'use strict';

const assert = require('assert');
const path   = require('path');

const TOKEN    = 'valid-token';
const USER_ID  = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const JOB_ID   = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DRIVER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

process.env.SUPABASE_URL               = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY  = 'stub-key';
process.env.FEATURE_CANCELLATION_POLICY = 'false';

let _stub = null;

// Stub @supabase/supabase-js at both root and functions-local paths
const supabasePaths = new Set([
  require.resolve('@supabase/supabase-js'),
  require.resolve('@supabase/supabase-js', { paths: [path.join(__dirname, '..', 'functions')] }),
]);
for (const sp of supabasePaths) {
  require.cache[sp] = {
    id: sp, filename: sp, loaded: true,
    exports: { createClient: () => _stub },
  };
}

// Stub stripe to prevent real calls
try {
  const stripePath = require.resolve('stripe', { paths: [path.join(__dirname, '..', 'functions')] });
  require.cache[stripePath] = {
    id: stripePath, filename: stripePath, loaded: true,
    exports: () => ({}),
  };
} catch (_) {}

const handler = require('../functions/ride-cancellation').handler;

function makeJobStub({ job = null, existing = null, assignments = [] } = {}) {
  const insertResult = {
    id: 'cancel-1', concierge_job_id: JOB_ID,
    fault: 'passenger', created_at: new Date().toISOString(),
  };
  const stub = {
    _table: null,
    from(t) {
      const s = Object.assign(Object.create(stub), { _table: t });
      return s;
    },
    select() { return this; },
    eq()     { return this; },
    in()     { return this; },
    order()  { return this; },
    limit()  { return this; },
    gt()     { return this; },
    insert() {
      return {
        select: () => ({ single: () => Promise.resolve({ data: insertResult, error: null }) }),
      };
    },
    update() { return { eq: () => Promise.resolve({ error: null }) }; },
    maybeSingle() {
      if (this._table === 'concierge_jobs') {
        if (!job) return Promise.resolve({ data: null, error: { message: 'not found' } });
        return Promise.resolve({ data: job, error: null });
      }
      if (this._table === 'ride_cancellations') {
        return Promise.resolve({ data: existing, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    then(resolve) {
      if (this._table === 'concierge_job_drivers') return resolve({ data: assignments, error: null });
      return resolve({ data: [], error: null });
    },
    rpc() { return Promise.resolve({ data: null, error: null }); },
    auth: {
      getUser(token) {
        if (token === TOKEN) return Promise.resolve({ data: { user: { id: USER_ID } }, error: null });
        return Promise.resolve({ data: { user: null }, error: { message: 'invalid' } });
      },
    },
  };
  return stub;
}

function event({ method = 'GET', jobId = JOB_ID, subpath = '/cancellation-notice', token, body } = {}) {
  return {
    httpMethod: method,
    path: `/api/rides/${jobId}${subpath}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    queryStringParameters: {},
    body: body ? JSON.stringify(body) : null,
  };
}

function parse(res) { try { return JSON.parse(res.body); } catch { return null; } }

async function run() {
  let passed = 0, failed = 0;
  const failures = [];
  function ok(label)       { passed++; console.log('  ok  ' + label); }
  function fail(label, err) {
    failed++;
    failures.push(`${label}: ${err?.message ?? String(err)}`);
    console.log('  FAIL ' + label + ' — ' + (err?.message ?? err));
  }

  // 1) GET notice — job not found → 404
  _stub = makeJobStub({ job: null });
  try {
    const res = await handler(event());
    assert.strictEqual(res.statusCode, 404, `expected 404, got ${res.statusCode}`);
    ok('GET /cancellation-notice 404 when job not found');
  } catch (e) { fail('GET notice 404', e); }

  // 2) GET notice — found job → 200 with policy
  _stub = makeJobStub({ job: { id: JOB_ID, status: 'confirmed', tier: 2, scenario: 4, member_id: USER_ID }, assignments: [] });
  try {
    const res = await handler(event());
    assert.strictEqual(res.statusCode, 200, `expected 200, got ${res.statusCode} body=${res.body}`);
    const body = parse(res);
    assert.ok(body.policy, 'should have policy object');
    assert.ok(typeof body.policy.driver_fault_fee_cents_per_driver === 'number');
    assert.ok(body.estimated_fee !== undefined, 'should have estimated_fee');
    ok('GET /cancellation-notice 200 returns policy and estimated fee');
  } catch (e) { fail('GET notice 200', e); }

  // 3) POST cancel — no auth → 401
  _stub = makeJobStub({ job: { id: JOB_ID, status: 'confirmed', tier: 2, scenario: 4, member_id: USER_ID } });
  try {
    const res = await handler(event({ method: 'POST', subpath: '/cancel', body: { fault: 'none' } }));
    assert.strictEqual(res.statusCode, 401, `expected 401, got ${res.statusCode}`);
    ok('POST /cancel 401 without auth');
  } catch (e) { fail('POST cancel 401', e); }

  // 4) POST cancel — invalid fault → 400
  _stub = makeJobStub({ job: { id: JOB_ID, status: 'confirmed', tier: 2, scenario: 4, member_id: USER_ID } });
  try {
    const res = await handler(event({ method: 'POST', subpath: '/cancel', token: TOKEN, body: { fault: 'bogus' } }));
    assert.strictEqual(res.statusCode, 400, `expected 400, got ${res.statusCode}`);
    ok('POST /cancel 400 on invalid fault value');
  } catch (e) { fail('POST cancel 400', e); }

  // 5) POST cancel — job not found → 404
  _stub = makeJobStub({ job: null });
  try {
    const res = await handler(event({ method: 'POST', subpath: '/cancel', token: TOKEN, body: { fault: 'none' } }));
    assert.strictEqual(res.statusCode, 404, `expected 404, got ${res.statusCode}`);
    ok('POST /cancel 404 when job not found');
  } catch (e) { fail('POST cancel 404', e); }

  // 6) POST cancel — already cancelled → 409
  _stub = makeJobStub({
    job: { id: JOB_ID, status: 'confirmed', tier: 2, scenario: 4, member_id: USER_ID },
    existing: { id: 'existing-cancel' },
  });
  try {
    const res = await handler(event({ method: 'POST', subpath: '/cancel', token: TOKEN, body: { fault: 'none' } }));
    assert.strictEqual(res.statusCode, 409, `expected 409, got ${res.statusCode}`);
    ok('POST /cancel 409 when job already cancelled');
  } catch (e) { fail('POST cancel 409', e); }

  // 7) POST cancel — happy path → 200
  _stub = makeJobStub({
    job: { id: JOB_ID, status: 'confirmed', tier: 2, scenario: 4, member_id: USER_ID },
    existing: null,
    assignments: [],
  });
  try {
    const res = await handler(event({ method: 'POST', subpath: '/cancel', token: TOKEN, body: { fault: 'passenger', reason: 'Changed plans' } }));
    assert.strictEqual(res.statusCode, 200, `expected 200, got ${res.statusCode} body=${res.body}`);
    const body = parse(res);
    assert.strictEqual(body.success, true);
    assert.ok(body.cancellation_id, 'should return cancellation_id');
    ok('POST /cancel 200 happy path creates cancellation record');
  } catch (e) { fail('POST cancel 200 happy path', e); }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
}

run().catch(err => { console.error('Test runner crashed:', err); process.exit(1); });

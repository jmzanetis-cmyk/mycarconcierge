// ============================================================================
// Task #146 — Lockdown regression test for the four new admin endpoints.
//
// Asserts that the following routes:
//   GET  /api/admin/agent-fleet/badge-summary
//   GET  /api/admin/agent-fleet/actions/by-target?target_id=...
//   GET  /api/admin/agent-fleet/stats/24h
//   GET  /api/admin/ai-ops/actions?target_id=...
//
//   1) reject the request with a non-2xx status when no admin credential is
//      sent (catches a future refactor that drops handler-level
//      authenticateAdmin), AND
//   2) accept a valid x-admin-password header and return a 2xx JSON body
//      whose shape matches what the dashboard consumes.
//
// The handlers are invoked in-process. Supabase is stubbed with a
// chainable query mock so the test runs without a real database — the goal
// is to exercise the auth gate + JSON shape, not Supabase semantics.
//
// Run with:  node netlify/functions/admin-routes-auth.test.js
// Exits non-zero on the first assertion failure.
// ============================================================================

'use strict';

const assert = require('assert');

const ADMIN_PASSWORD = 'test-admin-password-task-146';
process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';

// Build a Supabase chain mock that satisfies every method the four routes
// call. Every chainable method returns `chain` so the routes can compose
// .from().select().eq().is().gte().or().limit().range().order(). The chain
// is itself thenable so `await q` resolves to a benign empty result that
// will not throw inside the handlers.
function makeSupabaseStub() {
  const emptyResult = { data: [], count: 0, error: null };
  const chain = {};
  const passthrough = ['from','select','order','range','limit','eq','neq','gt',
    'gte','lt','lte','is','in','or','filter','match','not','contains','overlaps',
    'textSearch','update','delete','upsert'];
  for (const fn of passthrough) chain[fn] = () => chain;
  chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
  chain.single      = () => Promise.resolve({ data: null, error: null });
  chain.insert      = () => Promise.resolve({ data: null, error: null });
  // Make the chain awaitable.
  chain.then = (resolve, reject) => Promise.resolve(emptyResult).then(resolve, reject);
  return chain;
}

// Replace `@supabase/supabase-js` BEFORE any handler is required so both
// agent-fleet-runtime.getSupabase() and ai-ops-admin.getSupabase() pick up
// the stub instead of opening a real network client.
const supabasePath = require.resolve('@supabase/supabase-js');
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: { createClient: () => makeSupabaseStub() }
};

// Required AFTER the stub is installed.
const agentFleet = require('./agent-fleet-admin');
const aiOps      = require('./ai-ops-admin');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeEvent({ path, method = 'GET', headers = {}, query = {} }) {
  return {
    path,
    httpMethod: method,
    headers: { host: 'stub.local', ...headers },
    queryStringParameters: query,
    body: null
  };
}

function parseBody(res) {
  try { return JSON.parse(res.body); } catch { return null; }
}

const ROUTES = [
  {
    label: 'GET /api/admin/agent-fleet/badge-summary',
    handler: agentFleet.handler,
    event: () => makeEvent({ path: '/api/admin/agent-fleet/badge-summary' }),
    assertOkShape(body) {
      assert.ok(body && typeof body === 'object', 'badge-summary body must be an object');
      for (const key of ['open_dlq','needs_review','unack_spend_alerts','total_attention']) {
        assert.strictEqual(typeof body[key], 'number', `badge-summary.${key} must be a number`);
      }
    }
  },
  {
    label: 'GET /api/admin/agent-fleet/actions/by-target',
    handler: agentFleet.handler,
    event: () => makeEvent({
      path: '/api/admin/agent-fleet/actions/by-target',
      query: { target_id: '11111111-1111-1111-1111-111111111111', target_kind: 'provider' }
    }),
    assertOkShape(body) {
      assert.ok(body && typeof body === 'object', 'actions/by-target body must be an object');
      assert.ok(Array.isArray(body.actions), 'actions/by-target.actions must be an array');
      assert.strictEqual(body.target_id, '11111111-1111-1111-1111-111111111111');
      assert.strictEqual(body.target_kind, 'provider');
    }
  },
  {
    label: 'GET /api/admin/agent-fleet/stats/24h',
    handler: agentFleet.handler,
    event: () => makeEvent({ path: '/api/admin/agent-fleet/stats/24h' }),
    assertOkShape(body) {
      assert.ok(body && typeof body === 'object', 'stats/24h body must be an object');
      for (const key of ['actions_taken','escalated','failed']) {
        assert.strictEqual(typeof body[key], 'number', `stats/24h.${key} must be a number`);
      }
      assert.ok(body.sources && typeof body.sources === 'object', 'stats/24h.sources must be present');
    }
  },
  {
    label: 'GET /api/admin/ai-ops/actions?target_id=...',
    handler: aiOps.handler,
    event: () => makeEvent({
      path: '/api/admin/ai-ops/actions',
      query: { target_id: 'tgt-task-146', limit: '5', page: '1' }
    }),
    assertOkShape(body) {
      assert.ok(body && typeof body === 'object', 'ai-ops actions body must be an object');
      assert.ok(Array.isArray(body.actions), 'ai-ops actions.actions must be an array');
      assert.strictEqual(typeof body.page, 'number');
      assert.strictEqual(typeof body.limit, 'number');
      assert.strictEqual(typeof body.total, 'number');
    }
  }
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function run() {
  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const route of ROUTES) {
    // 1) Without credentials → must NOT return a 2xx.
    try {
      const res = await route.handler(route.event());
      assert.ok(res && typeof res.statusCode === 'number',
        `${route.label}: handler must return { statusCode }`);
      assert.ok(res.statusCode < 200 || res.statusCode >= 300,
        `${route.label}: expected NON-2xx without admin credentials, got ${res.statusCode}`);
      // The handlers in question return 401 — assert that explicitly so we
      // catch a future refactor that loosens the gate to e.g. 403/redirect.
      assert.strictEqual(res.statusCode, 401,
        `${route.label}: expected 401 without admin credentials, got ${res.statusCode}`);
      passed++;
      console.log(`  ok  ${route.label}  [no-auth → ${res.statusCode}]`);
    } catch (err) {
      failed++;
      failures.push(`[no-auth] ${route.label}: ${err.message}`);
      console.log(`  FAIL ${route.label}  [no-auth] — ${err.message}`);
    }

    // 2) With valid x-admin-password → must return 2xx + expected JSON shape.
    try {
      const ev = route.event();
      ev.headers['x-admin-password'] = ADMIN_PASSWORD;
      const res = await route.handler(ev);
      assert.ok(res && typeof res.statusCode === 'number',
        `${route.label}: handler must return { statusCode }`);
      assert.ok(res.statusCode >= 200 && res.statusCode < 300,
        `${route.label}: expected 2xx with admin credentials, got ${res.statusCode} body=${res.body}`);
      const body = parseBody(res);
      assert.ok(body !== null, `${route.label}: response body must be JSON`);
      route.assertOkShape(body);
      passed++;
      console.log(`  ok  ${route.label}  [auth → ${res.statusCode}]`);
    } catch (err) {
      failed++;
      failures.push(`[auth] ${route.label}: ${err.message}`);
      console.log(`  FAIL ${route.label}  [auth] — ${err.message}`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});

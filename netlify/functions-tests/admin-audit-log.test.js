// ============================================================================
// Smoke test for the generic /api/admin/audit-log endpoint added in Task #330.
//
// Covers:
//   1) 401 without admin credentials
//   2) 405 on non-GET method
//   3) 400 on malformed `before` query param
//   4) 200 happy path returns { success, rows, available_actions }
//   5) `available_actions` contains the actions the rest of the codebase
//      currently writes to admin_audit_log (drift guard — if a new action is
//      added in a handler without registering it here, the panel filter
//      won't include it).
//
// Run with:  node netlify/functions-tests/admin-audit-log.test.js
// Exits non-zero on the first assertion failure.
// ============================================================================

'use strict';

const assert = require('assert');
const fs     = require('node:fs');
const path   = require('node:path');

const ADMIN_PASSWORD = 'test-admin-password-task-330';
process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';

// Supabase stub — chainable query object that resolves to an empty page.
const STUB_ROWS = [
  { id: 1, action: 'suspend_provider', target_id: 'p1', target_type: 'profile',
    reason: 'rude to customer', metadata: { source: 'manual' },
    performed_by: 'admin', performed_at: '2026-05-15T10:00:00Z' },
  { id: 2, action: 'adjust_bid_credits', target_id: 'p2', target_type: 'profile',
    reason: 'promo refund', metadata: { before: 5, after: 15, delta: 10 },
    performed_by: 'admin', performed_at: '2026-05-15T09:00:00Z' }
];

function makeSupabaseStub() {
  const state = { filters: [], orderField: null, limit: null };
  const chain = {};
  chain.from = () => chain;
  chain.select = () => chain;
  chain.eq = (col, val) => { state.filters.push(['eq', col, val]); return chain; };
  chain.lt = (col, val) => { state.filters.push(['lt', col, val]); return chain; };
  chain.order = (col) => { state.orderField = col; return chain; };
  chain.limit = (n) => { state.limit = n; return chain; };
  chain.then = (resolve) => resolve({ data: STUB_ROWS, error: null });
  return chain;
}

const supabasePaths = new Set([
  require.resolve('@supabase/supabase-js'),
  require.resolve('@supabase/supabase-js', { paths: [path.join(__dirname, '..', 'functions')] })
]);
for (const sp of supabasePaths) {
  require.cache[sp] = {
    id: sp, filename: sp, loaded: true,
    exports: { createClient: () => makeSupabaseStub() }
  };
}

const handler = require('../functions/admin-audit-log').handler;

function makeEvent({ method = 'GET', headers = {}, query = {} } = {}) {
  return {
    path: '/api/admin/audit-log',
    httpMethod: method,
    headers: { host: 'stub.local', ...headers },
    queryStringParameters: query,
    body: null
  };
}

function parseBody(res) {
  try { return JSON.parse(res.body); } catch { return null; }
}

async function run() {
  let passed = 0, failed = 0;
  const failures = [];
  function ok(label) { passed++; console.log('  ok  ' + label); }
  function fail(label, err) { failed++; failures.push(`${label}: ${err.message}`); console.log('  FAIL ' + label + ' — ' + err.message); }

  // 1) No credentials → 401
  try {
    const res = await handler(makeEvent({}));
    assert.strictEqual(res.statusCode, 401, `expected 401, got ${res.statusCode}`);
    ok('rejects request without admin credentials (401)');
  } catch (e) { fail('rejects request without admin credentials', e); }

  // 2) Non-GET method → 405
  try {
    const res = await handler(makeEvent({ method: 'POST', headers: { 'x-admin-password': ADMIN_PASSWORD } }));
    assert.strictEqual(res.statusCode, 405, `expected 405, got ${res.statusCode}`);
    ok('rejects non-GET method (405)');
  } catch (e) { fail('rejects non-GET method', e); }

  // 3) Malformed before timestamp → 400
  try {
    const res = await handler(makeEvent({
      headers: { 'x-admin-password': ADMIN_PASSWORD },
      query: { before: 'not-a-date' }
    }));
    assert.strictEqual(res.statusCode, 400, `expected 400, got ${res.statusCode}`);
    ok('rejects malformed before timestamp (400)');
  } catch (e) { fail('rejects malformed before timestamp', e); }

  // 4) Happy path returns expected shape
  let body;
  try {
    const res = await handler(makeEvent({
      headers: { 'x-admin-password': ADMIN_PASSWORD },
      query: { action: 'suspend_provider', limit: '10' }
    }));
    assert.strictEqual(res.statusCode, 200, `expected 200, got ${res.statusCode} body=${res.body}`);
    body = parseBody(res);
    assert.ok(body, 'body must be JSON');
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.rows), 'rows must be an array');
    assert.ok(Array.isArray(body.available_actions), 'available_actions must be an array');
    assert.ok(body.rows.length >= 1, 'rows should contain at least one stub row');
    assert.ok(body.rows[0].action, 'each row should expose an action field');
    ok('happy path returns { success, rows, available_actions }');
  } catch (e) { fail('happy path', e); }

  // 5) Drift guard: every action literal handlers write must appear in
  //    available_actions, otherwise the filter <select> in admin.html won't
  //    list it and operators won't see a way to narrow to that action.
  try {
    const FUNCTIONS_DIR = path.join(__dirname, '..', 'functions');
    const writerFiles = [
      'provider-admin.js',
      'provider-application-review.js',
      'provider-application.js',
      'apollo-admin.js',
      'outreach-admin.js',
      'concierge-jobs-admin.js',
      'concierge-jobs-public.js'
    ];
    const found = new Set();
    for (const f of writerFiles) {
      const src = fs.readFileSync(path.join(FUNCTIONS_DIR, f), 'utf8');
      const re = /action:\s*'([a-z_]+)'/g;
      let m;
      while ((m = re.exec(src)) !== null) found.add(m[1]);
    }
    // Strip false-positive matches that aren't audit-log actions.
    // Both 'true' and 'escalated' appear as the value of action: in
    // unrelated contexts (event payloads etc.).
    const IGNORE = new Set(['true', 'escalated', 'increment', 'approve', 'deny', 'revision']);
    const writtenActions = [...found].filter(a => !IGNORE.has(a));

    const available = new Set(body.available_actions);
    const missing = writtenActions.filter(a => !available.has(a));
    assert.deepStrictEqual(missing, [],
      `available_actions is missing audit actions that handlers actually write: ${missing.join(', ')}. ` +
      `Update KNOWN_ACTIONS in netlify/functions/admin-audit-log.js.`);
    ok(`available_actions covers all ${writtenActions.length} writer-emitted actions`);
  } catch (e) { fail('available_actions drift guard', e); }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
}

run().catch(err => { console.error('Test runner crashed:', err); process.exit(1); });

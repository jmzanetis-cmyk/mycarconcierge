// ============================================================================
// Smoke test for GET /api/admin/stats/kpis (Task #61, 2026-09-10).
//
// This route backs the Dashboard's top stat-card row (Pending Applications /
// Active Providers / In Escrow / Open Disputes / Revenue / Active Packages —
// www/admin.html stat-pending-apps etc.). Those cards used to query
// supabaseClient directly from the browser (www/admin.js updateDashboard()),
// which only ever resolves real rows for a profiles.role=admin session — a
// Team Login session has no such session, so the cards silently read 0 for
// every team-login user regardless of their actual permissions. This route
// moves the same queries server-side behind authenticateAdminSection(...,
// 'dashboard') with the service-role client, same pattern as the sibling
// overview/revenue/users/orders routes in this same file.
//
// Covers:
//   1) 401 without credentials
//   2) 405 on non-GET method
//   3) Happy path (super_admin session) — correct counts + correct
//      escrow/revenue sums from the held/released payment rows
//   4) Happy path (marketing Team Login session) — this is the actual bug
//      fix: proves a team-login user gets the same real numbers a
//      super_admin gets, not RLS-blocked zeros
//   5) Inactive team member → 401
//
// Run with:  node netlify/functions-tests/admin-stats-kpis.test.js
// Exits non-zero on the first assertion failure.
// ============================================================================

'use strict';

const assert = require('assert');
const path   = require('node:path');

process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';

const FIX = {
  pendingApps: 4,
  activeProviders: 12,
  heldPayments: [{ amount_total: 150.5 }, { amount_total: 299.99 }],
  openDisputes: 2,
  releasedPayments: [{ amount_mcc_fee: 10.25 }, { amount_mcc_fee: 5.75 }, { amount_mcc_fee: 3 }],
  activePackages: 7,
  openTickets: 3
};
const EXPECT_ESCROW = 150.5 + 299.99;
const EXPECT_REVENUE = 10.25 + 5.75 + 3;

// Which auth identity the stub should resolve for this run — set per test.
let AUTH_MODE = 'super_admin'; // 'super_admin' | 'team_marketing' | 'team_inactive' | 'none'

function makeSupabaseStub() {
  // IMPORTANT: each .from(table) call must build and return its OWN
  // independent query-builder object. handleKpis() fires 7 queries
  // concurrently via Promise.all — if they all shared one mutable
  // 'currentTable' variable (as an earlier version of this stub did),
  // whichever query happened to finish building its chain last would
  // silently win for every .then() callback, since those callbacks only
  // run as microtasks after all 7 chains are synchronously constructed.
  // The real @supabase/supabase-js client returns a fresh builder per
  // .from() call, so this stub must too.
  function makeQuery(tableName) {
    const state = { selectFields: null, selectOpts: null };
    const q = {};
    q.select = (fields, opts) => { state.selectFields = fields; state.selectOpts = opts; return q; };
    q.eq = () => q;
    q.is = () => q;
    q.in = () => q;
    q.single = () => {
      if (tableName === 'profiles') {
        if (AUTH_MODE === 'super_admin') return Promise.resolve({ data: { role: 'admin' }, error: null });
        return Promise.resolve({ data: { role: 'member' }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    };
    q.maybeSingle = () => {
      if (tableName === 'admin_team_members') {
        if (AUTH_MODE === 'team_marketing') {
          return Promise.resolve({ data: { id: 'tm-1', role: 'marketing', status: 'active', display_name: 'Maria' }, error: null });
        }
        if (AUTH_MODE === 'team_inactive') {
          return Promise.resolve({ data: { id: 'tm-2', role: 'marketing', status: 'disabled', display_name: 'Old Hire' }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    };
    q.then = (resolve) => {
      if (tableName === 'provider_applications') return resolve({ count: FIX.pendingApps, error: null });
      if (tableName === 'profiles') return resolve({ count: FIX.activeProviders, error: null });
      if (tableName === 'payments') {
        if (state.selectFields === 'amount_total') return resolve({ data: FIX.heldPayments, error: null });
        if (state.selectFields === 'amount_mcc_fee') return resolve({ data: FIX.releasedPayments, error: null });
        return resolve({ data: [], error: null });
      }
      if (tableName === 'disputes') return resolve({ count: FIX.openDisputes, error: null });
      if (tableName === 'maintenance_packages') return resolve({ count: FIX.activePackages, error: null });
      if (tableName === 'helpdesk_tickets') return resolve({ count: FIX.openTickets, error: null });
      return resolve({ data: [], count: 0, error: null });
    };
    return q;
  }

  const chain = {};
  chain.from = (tableName) => makeQuery(tableName);
  chain.auth = {
    getUser: async (token) => {
      if (!token || AUTH_MODE === 'none') return { data: { user: null }, error: { message: 'no token' } };
      return { data: { user: { id: 'stub-user-id', email: 'stub@example.com' } }, error: null };
    }
  };
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

const handler = require('../functions/admin-stats').handler;

function makeEvent({ method = 'GET', headers = {} } = {}) {
  return {
    path: '/api/admin/stats/kpis',
    httpMethod: method,
    headers: { host: 'stub.local', ...headers },
    queryStringParameters: {},
    body: null
  };
}

function parseBody(res) {
  try { return JSON.parse(res.body); } catch { return null; }
}

function assertKpiMath(body, label) {
  assert.strictEqual(body.success, true, `${label}: success should be true`);
  const d = body.data;
  assert.strictEqual(d.pendingApps, FIX.pendingApps, `${label}: pendingApps`);
  assert.strictEqual(d.activeProviders, FIX.activeProviders, `${label}: activeProviders`);
  assert.strictEqual(d.openDisputes, FIX.openDisputes, `${label}: openDisputes`);
  assert.strictEqual(d.activePackages, FIX.activePackages, `${label}: activePackages`);
  assert.strictEqual(d.openTickets, FIX.openTickets, `${label}: openTickets`);
  assert.ok(Math.abs(d.escrowAmount - EXPECT_ESCROW) < 0.001, `${label}: escrowAmount expected ${EXPECT_ESCROW} got ${d.escrowAmount}`);
  assert.ok(Math.abs(d.revenue - EXPECT_REVENUE) < 0.001, `${label}: revenue expected ${EXPECT_REVENUE} got ${d.revenue}`);
}

async function run() {
  let passed = 0, failed = 0;
  const failures = [];
  function ok(label) { passed++; console.log('  ok  ' + label); }
  function fail(label, err) { failed++; failures.push(`${label}: ${err.message}`); console.log('  FAIL ' + label + ' — ' + err.message); }

  // 1) No credentials → 401
  try {
    AUTH_MODE = 'none';
    const res = await handler(makeEvent({}));
    assert.strictEqual(res.statusCode, 401, `expected 401, got ${res.statusCode}`);
    ok('rejects request without credentials (401)');
  } catch (e) { fail('rejects request without credentials', e); }

  // 2) Non-GET method → 405
  try {
    AUTH_MODE = 'super_admin';
    const res = await handler(makeEvent({ method: 'POST', headers: { authorization: 'Bearer faketoken' } }));
    assert.strictEqual(res.statusCode, 405, `expected 405, got ${res.statusCode}`);
    ok('rejects non-GET method (405)');
  } catch (e) { fail('rejects non-GET method', e); }

  // 3) Happy path — super_admin session gets correct counts + sums
  try {
    AUTH_MODE = 'super_admin';
    const res = await handler(makeEvent({ headers: { authorization: 'Bearer faketoken' } }));
    assert.strictEqual(res.statusCode, 200, `expected 200, got ${res.statusCode} body=${res.body}`);
    const body = parseBody(res);
    assertKpiMath(body, 'super_admin');
    ok('super_admin happy path returns correct counts and escrow/revenue sums');
  } catch (e) { fail('super_admin happy path', e); }

  // 4) Happy path — marketing Team Login session gets the SAME real
  //    numbers, not RLS-blocked zeros. This is the actual bug this route
  //    exists to fix.
  try {
    AUTH_MODE = 'team_marketing';
    const res = await handler(makeEvent({ headers: { authorization: 'Bearer faketoken' } }));
    assert.strictEqual(res.statusCode, 200, `expected 200, got ${res.statusCode} body=${res.body}`);
    const body = parseBody(res);
    assertKpiMath(body, 'team_marketing');
    ok('marketing Team Login session gets real (non-zero, correct) KPI numbers');
  } catch (e) { fail('marketing Team Login happy path', e); }

  // 5) Inactive team member → 401
  try {
    AUTH_MODE = 'team_inactive';
    const res = await handler(makeEvent({ headers: { authorization: 'Bearer faketoken' } }));
    assert.strictEqual(res.statusCode, 401, `expected 401, got ${res.statusCode}`);
    ok('rejects a disabled team member (401)');
  } catch (e) { fail('rejects disabled team member', e); }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
}

run().catch(err => { console.error('Test runner crashed:', err); process.exit(1); });

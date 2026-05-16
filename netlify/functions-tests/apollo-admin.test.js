// ============================================================================
// Task #331 — Regression tests for netlify/functions/apollo-admin.js
//
// Why this test exists:
//   Tasks #274 and #275 added five new routes (GET /status, POST /search,
//   POST /enrich, GET /enrich-queue, GET /audit-log) plus expanded the
//   PUT /config validation whitelist (cities/titles/industries, admin_phone
//   E.164, digest_hour_utc 0-23). None had unit-level coverage. A typo in
//   the auth check or validation would ship to production silently.
//
//   This file mirrors the in-process stub pattern from
//   provider-application.test.js: Module.prototype.require is patched so the
//   handler picks up an in-memory Supabase stub and a no-op
//   outreach-engine-core, without touching the network or a real DB.
//
// Coverage:
//   - Auth: missing/wrong x-admin-password → 401
//   - PUT /config: unknown keys are silently dropped (whitelist)
//   - PUT /config: admin_phone must be E.164 (invalid → 400, valid → 200)
//   - PUT /config: digest_hour_utc must be int 0..23 (out of range → 400)
//   - PUT /config: applyProfileOverrides splices cities/titles/industries
//     into search_profiles[0] without clobbering search_profiles[1]
//   - GET /audit-log: ?action= filters to a single APOLLO_ACTIONS value,
//     unknown actions fall back to the full whitelist
//   - GET /audit-log: ?limit= is capped at 100 (and floored at 1)
//
// Run with:  node netlify/functions-tests/apollo-admin.test.js
// Exits non-zero on the first failing assertion.
// ============================================================================

'use strict';

const assert = require('assert');
const Module = require('module');

process.env.ADMIN_PASSWORD = 'test-admin-pw-task-331';
process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';
delete process.env.APOLLO_API_KEY;

// ---------------------------------------------------------------------------
// In-memory state shared between the stubbed outreach-engine-core and the
// stubbed Supabase client, so the handler's reads-after-writes line up the
// way they would in production.
// ---------------------------------------------------------------------------
const state = {
  apolloConfig: {
    enabled: false,
    interval_hours: 6,
    per_page: 25,
    auto_enrich: false,
    enrich_batch: 5,
    search_profiles: [
      { name: 'Providers', lead_type: 'provider', cities: ['Old City'], titles: ['old title'], industries: ['old industry'] },
      { name: 'Investors', lead_type: 'investor', cities: ['NY'], titles: ['vc'], industries: ['finance'] }
    ],
    running_since: null,
    running_nonce: null,
    last_run: null
  },
  saveCalls: [],
  auditRows: [],
  // Pre-seeded admin_audit_log rows for the GET /audit-log tests. Mix of
  // Apollo and non-Apollo actions so the filter logic is actually exercised.
  auditLog: [
    { id: 1, action: 'apollo_run_now',         target_type: 'engine_state', metadata: {}, performed_by: 'admin', performed_at: '2026-05-10T00:00:00Z' },
    { id: 2, action: 'apollo_manual_search',   target_type: 'engine_state', metadata: {}, performed_by: 'admin', performed_at: '2026-05-11T00:00:00Z' },
    { id: 3, action: 'apollo_manual_enrich',   target_type: 'engine_state', metadata: {}, performed_by: 'admin', performed_at: '2026-05-12T00:00:00Z' },
    { id: 4, action: 'update_apollo_config',   target_type: 'engine_state', metadata: {}, performed_by: 'admin', performed_at: '2026-05-13T00:00:00Z' },
    { id: 5, action: 'some_other_admin_action', target_type: 'whatever',    metadata: {}, performed_by: 'admin', performed_at: '2026-05-14T00:00:00Z' }
  ],
  // Records the .limit() argument from the most recent audit-log query so
  // the test can assert the handler clamped it.
  lastAuditLimit: null,
  lastAuditActionFilter: null
};

// ---------------------------------------------------------------------------
// Supabase stub. Only admin_audit_log needs real behavior — everything else
// returns empty/no-op since these tests don't hit /status, /search, /enrich,
// /enrich-queue, or /run-now.
// ---------------------------------------------------------------------------
function makeSupabaseStub() {
  return {
    from(table) {
      return makeQuery(table);
    }
  };
}

function makeQuery(table) {
  const filters = { actions: null };
  let limitValue = null;

  const q = {
    select: () => q,
    eq: () => q,
    neq: () => q,
    in: (col, values) => { if (col === 'action') filters.actions = values; return q; },
    gt: () => q,
    gte: () => q,
    lt: () => q,
    lte: () => q,
    is: () => q,
    or: () => q,
    not: () => q,
    like: () => q,
    ilike: () => q,
    filter: () => q,
    contains: () => q,
    order: () => q,
    limit: (n) => { limitValue = n; return q; },
    range: () => q,
    single:      () => Promise.resolve({ data: null, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    insert(row) {
      if (table === 'admin_audit_log') {
        state.auditRows.push(row);
      }
      return Promise.resolve({ data: null, error: null });
    },
    then(resolve, reject) {
      if (table === 'admin_audit_log') {
        state.lastAuditLimit = limitValue;
        state.lastAuditActionFilter = filters.actions;
        const rows = state.auditLog
          .filter(r => !filters.actions || filters.actions.includes(r.action))
          .slice(0, limitValue || 25);
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      }
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    }
  };

  return q;
}

// ---------------------------------------------------------------------------
// outreach-engine-core stub. The handler only calls four exports from it;
// stub them all so loading apollo-admin.js doesn't pull in the real module
// (which would try to wire up the Supabase client, agent fleet, etc).
// ---------------------------------------------------------------------------
const outreachStub = {
  createSupabaseClient: () => makeSupabaseStub(),
  getApolloConfig: async () => ({ ...state.apolloConfig, search_profiles: state.apolloConfig.search_profiles.map(p => ({ ...p })) }),
  saveApolloConfig: async (_supabase, updates) => {
    state.saveCalls.push(JSON.parse(JSON.stringify(updates)));
    Object.assign(state.apolloConfig, updates);
    return { ...state.apolloConfig };
  },
  runApolloDiscoveryCycle: async () => ({ success: true, skipped: false })
};

// ---------------------------------------------------------------------------
// Patch require so the handler picks up the stubs above instead of the real
// modules. Must be installed before the handler is loaded below.
// ---------------------------------------------------------------------------
const origRequire = Module.prototype.require;
Module.prototype.require = function patchedRequire(id) {
  if (id === './outreach-engine-core') return outreachStub;
  return origRequire.apply(this, arguments);
};

const { handler } = require('../functions/apollo-admin');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeEvent(opts) {
  const { method = 'GET', route = '', body = null, headers = {}, query = {} } = opts || {};
  return {
    httpMethod: method,
    path: `/.netlify/functions/apollo-admin/${route}`,
    headers: { 'x-admin-password': process.env.ADMIN_PASSWORD, ...headers },
    queryStringParameters: query,
    body: body == null ? null : JSON.stringify(body)
  };
}

function parseBody(res) {
  try { return JSON.parse(res.body); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('auth: missing x-admin-password header returns 401', async () => {
  const res = await handler(makeEvent({ method: 'GET', route: 'config', headers: { 'x-admin-password': '' } }));
  assert.strictEqual(res.statusCode, 401);
  assert.deepStrictEqual(parseBody(res), { error: 'Unauthorized' });
});

test('auth: wrong x-admin-password returns 401', async () => {
  const res = await handler(makeEvent({ method: 'GET', route: 'config', headers: { 'x-admin-password': 'not-the-real-pw' } }));
  assert.strictEqual(res.statusCode, 401);
});

test('auth: x-admin-token also accepted when it matches ADMIN_PASSWORD', async () => {
  const res = await handler(makeEvent({
    method: 'GET',
    route: 'config',
    headers: { 'x-admin-password': '', 'x-admin-token': process.env.ADMIN_PASSWORD }
  }));
  assert.strictEqual(res.statusCode, 200);
});

test('PUT /config: unknown keys are silently dropped by the whitelist', async () => {
  state.saveCalls.length = 0;
  const res = await handler(makeEvent({
    method: 'PUT',
    route: 'config',
    body: { enabled: true, malicious_field: 'pwned', running_nonce: 'attacker-set', random_key: 42 }
  }));
  assert.strictEqual(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${res.body}`);
  const body = parseBody(res);
  assert.deepStrictEqual(body.updated_keys, ['enabled'],
    `only the whitelisted "enabled" key should be persisted; got ${JSON.stringify(body.updated_keys)}`);
  assert.strictEqual(state.saveCalls.length, 1);
  const saved = state.saveCalls[0];
  assert.ok(!('malicious_field' in saved), 'malicious_field must be dropped');
  assert.ok(!('running_nonce' in saved), 'running_nonce must not be settable via PUT /config');
  assert.ok(!('random_key' in saved), 'unknown random_key must be dropped');
  assert.strictEqual(saved.enabled, true);
});

test('PUT /config: empty updates after sanitization returns 400', async () => {
  const res = await handler(makeEvent({
    method: 'PUT',
    route: 'config',
    body: { only_garbage: 'x', another_unknown: 1 }
  }));
  assert.strictEqual(res.statusCode, 400);
  assert.match(parseBody(res).error, /no valid config fields/i);
});

test('PUT /config: admin_phone rejects non-E.164 formats', async () => {
  for (const bad of ['5551234567', '+0123', '+', 'phone-number', '+1-201-555-0100']) {
    const res = await handler(makeEvent({ method: 'PUT', route: 'config', body: { admin_phone: bad } }));
    assert.strictEqual(res.statusCode, 400, `"${bad}" should be rejected`);
    const b = parseBody(res);
    assert.ok(Array.isArray(b.details) && b.details.some(d => /E\.164/.test(d)),
      `expected E.164 error for "${bad}", got ${JSON.stringify(b)}`);
  }
});

test('PUT /config: admin_phone accepts a valid E.164 number', async () => {
  state.saveCalls.length = 0;
  const res = await handler(makeEvent({ method: 'PUT', route: 'config', body: { admin_phone: '+12015550100' } }));
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(state.saveCalls.at(-1).admin_phone, '+12015550100');
});

test('PUT /config: admin_phone null or empty disables SMS (stored as null)', async () => {
  state.saveCalls.length = 0;
  for (const value of [null, '', '   ']) {
    const res = await handler(makeEvent({ method: 'PUT', route: 'config', body: { admin_phone: value } }));
    assert.strictEqual(res.statusCode, 200, `expected 200 for ${JSON.stringify(value)}`);
    assert.strictEqual(state.saveCalls.at(-1).admin_phone, null);
  }
});

test('PUT /config: digest_hour_utc must be integer in [0, 23]', async () => {
  for (const bad of [-1, 24, 25, 100, 1.5, 'abc']) {
    const res = await handler(makeEvent({ method: 'PUT', route: 'config', body: { digest_hour_utc: bad } }));
    assert.strictEqual(res.statusCode, 400, `${bad} should be rejected`);
    const b = parseBody(res);
    assert.ok(b.details.some(d => /digest_hour_utc/.test(d)),
      `expected digest_hour_utc error for ${bad}, got ${JSON.stringify(b)}`);
  }
  for (const good of [0, 12, 23]) {
    state.saveCalls.length = 0;
    const res = await handler(makeEvent({ method: 'PUT', route: 'config', body: { digest_hour_utc: good } }));
    assert.strictEqual(res.statusCode, 200, `${good} should be accepted`);
    assert.strictEqual(state.saveCalls.at(-1).digest_hour_utc, good);
  }
});

test('PUT /config: applyProfileOverrides splices cities/titles/industries into search_profiles[0] only', async () => {
  // Reset to a known two-profile shape.
  state.apolloConfig.search_profiles = [
    { name: 'Providers', lead_type: 'provider', cities: ['Old City'], titles: ['old title'], industries: ['old industry'] },
    { name: 'Investors', lead_type: 'investor', cities: ['NY'], titles: ['vc'], industries: ['finance'] }
  ];
  state.saveCalls.length = 0;

  const res = await handler(makeEvent({
    method: 'PUT',
    route: 'config',
    body: {
      cities: ['Newark', 'Jersey City'],
      titles: 'owner, manager',          // delimited string form should be parsed too
      industries: ['auto repair']
    }
  }));
  assert.strictEqual(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${res.body}`);

  const saved = state.saveCalls.at(-1);
  // The top-level cities/titles/industries must be stripped out and folded
  // into search_profiles[0]; they should NOT appear at the top level of
  // the saved payload (otherwise the rotated cycle wouldn't pick them up).
  assert.ok(!('cities' in saved), 'top-level cities must be stripped');
  assert.ok(!('titles' in saved), 'top-level titles must be stripped');
  assert.ok(!('industries' in saved), 'top-level industries must be stripped');
  assert.ok(Array.isArray(saved.search_profiles), 'search_profiles must be spliced into the save payload');
  assert.strictEqual(saved.search_profiles.length, 2, 'second (Investors) profile must be preserved');

  const provider = saved.search_profiles[0];
  assert.deepStrictEqual(provider.cities, ['Newark', 'Jersey City']);
  assert.deepStrictEqual(provider.titles, ['owner', 'manager']);
  assert.deepStrictEqual(provider.industries, ['auto repair']);
  assert.strictEqual(provider.name, 'Providers', 'profile name must be preserved');

  const investor = saved.search_profiles[1];
  assert.deepStrictEqual(investor.cities, ['NY'], 'Investors profile cities must not be touched');
  assert.deepStrictEqual(investor.titles, ['vc']);
  assert.deepStrictEqual(investor.industries, ['finance']);

  // updated_keys reflects the originally-requested keys, not the spliced
  // search_profiles internal mutation.
  const body = parseBody(res);
  assert.deepStrictEqual([...body.updated_keys].sort(), ['cities', 'industries', 'titles']);
});

test('GET /audit-log: no filter returns only APOLLO_ACTIONS rows', async () => {
  const res = await handler(makeEvent({ method: 'GET', route: 'audit-log' }));
  assert.strictEqual(res.statusCode, 200);
  const body = parseBody(res);
  assert.strictEqual(body.success, true);
  assert.deepStrictEqual(body.available_actions,
    ['update_apollo_config', 'apollo_run_now', 'apollo_manual_search', 'apollo_manual_enrich']);
  // The filter passed to Supabase must be the full APOLLO_ACTIONS whitelist —
  // so the non-Apollo "some_other_admin_action" row is excluded.
  assert.deepStrictEqual([...state.lastAuditActionFilter].sort(),
    ['apollo_manual_enrich', 'apollo_manual_search', 'apollo_run_now', 'update_apollo_config']);
  assert.ok(body.rows.every(r => body.available_actions.includes(r.action)),
    `unexpected non-Apollo row(s): ${JSON.stringify(body.rows)}`);
});

test('GET /audit-log: ?action= filters to a single whitelisted action', async () => {
  const res = await handler(makeEvent({
    method: 'GET',
    route: 'audit-log',
    query: { action: 'apollo_run_now' }
  }));
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(state.lastAuditActionFilter, ['apollo_run_now']);
  const body = parseBody(res);
  assert.ok(body.rows.every(r => r.action === 'apollo_run_now'));
});

test('GET /audit-log: unknown ?action= falls back to the full whitelist (no SQL injection vector)', async () => {
  const res = await handler(makeEvent({
    method: 'GET',
    route: 'audit-log',
    query: { action: "some_other_admin_action' OR 1=1--" }
  }));
  assert.strictEqual(res.statusCode, 200);
  // Falls back to the full APOLLO_ACTIONS list — the attacker-supplied
  // action must NOT make it into the IN() filter.
  assert.deepStrictEqual([...state.lastAuditActionFilter].sort(),
    ['apollo_manual_enrich', 'apollo_manual_search', 'apollo_run_now', 'update_apollo_config']);
});

test('GET /audit-log: ?limit= is capped at 100', async () => {
  for (const requested of [101, 500, 99999]) {
    await handler(makeEvent({ method: 'GET', route: 'audit-log', query: { limit: String(requested) } }));
    assert.strictEqual(state.lastAuditLimit, 100,
      `requested limit ${requested} should be clamped to 100, got ${state.lastAuditLimit}`);
  }
});

test('GET /audit-log: ?limit= is floored at 1', async () => {
  for (const requested of ['0', '-5', 'not-a-number']) {
    await handler(makeEvent({ method: 'GET', route: 'audit-log', query: { limit: requested } }));
    // 0/negative/NaN all collapse to the default 25 via `parseInt(...) || 10`
    // followed by Math.max(_, 1), so the floor is at least 1 — the important
    // contract is "no zero or negative limit ever reaches Supabase".
    assert.ok(state.lastAuditLimit >= 1,
      `limit "${requested}" must produce >=1, got ${state.lastAuditLimit}`);
  }
});

test('GET /audit-log: in-range ?limit= is honored as-is', async () => {
  await handler(makeEvent({ method: 'GET', route: 'audit-log', query: { limit: '7' } }));
  assert.strictEqual(state.lastAuditLimit, 7);
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
async function run() {
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  ok  ${t.name}`);
      passed++;
    } catch (err) {
      console.error(`  FAIL  ${t.name}`);
      console.error(err && err.stack ? err.stack : err);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});

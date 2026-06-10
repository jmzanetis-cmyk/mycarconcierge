// ============================================================================
// Lockdown regression tests for the apollo-health + clear-apollo-lock admin
// endpoints in netlify/functions/outreach-admin.js (Task #337).
//
// Coverage:
//   1) GET  /apollo-health: lock_stuck:false when running_since is absent.
//   2) GET  /apollo-health: lock_stuck:false when held < 6 min.
//   3) GET  /apollo-health: lock_stuck:true + correct lock_held_minutes
//      when held >= 6 min.
//   4) POST /clear-apollo-lock: clears running_since + running_nonce from
//      engine_state.metadata.apollo_config, AND writes the
//      apollo_lock_force_cleared rows to both outreach_activity_log and
//      admin_audit_log.
//   5) GET  /apollo-health rejects without Bearer admin token (401).
//   6) POST /clear-apollo-lock rejects without Bearer admin token (401).
//
// Handler runs in-process. Supabase is stubbed with a chainable query mock
// so the test does not touch a real database.
//
// Run with:  node netlify/functions-tests/outreach-admin-apollo-lock.test.js
// Exits non-zero on the first assertion failure.
// ============================================================================

'use strict';

const assert = require('assert');
const path   = require('node:path');

const ADMIN_PASSWORD = 'test-admin-password-task-347';
process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';

// ---------------------------------------------------------------------------
// Configurable Supabase stub. Each test sets `dbState.engineMetadata` to
// script the row returned by `engine_state.select(...).single()`. Inserts
// against outreach_activity_log + admin_audit_log are captured into
// `dbState.inserts[table]` so the test can assert audit rows were written.
// engine_state.update() captures its payload into `dbState.lastUpdate`.
// ---------------------------------------------------------------------------

let dbState;
function resetDbState() {
  dbState = {
    engineMetadata: {},      // value of engine_state.metadata
    lastUpdate: null,         // last engine_state.update() payload
    inserts: {                // captured insert rows by table
      outreach_activity_log: [],
      admin_audit_log: []
    }
  };
}

function makeChain(table) {
  const chain = {
    _table: table,
    select() { return chain; },
    eq()     { return chain; },
    order()  { return chain; },
    limit()  { return chain; },
    in()     { return chain; },
    is()     { return chain; },
    not()    { return chain; },
    or()     { return chain; },
    range()  { return chain; },
    single() {
      if (table === 'engine_state') {
        return Promise.resolve({ data: { metadata: dbState.engineMetadata }, error: null });
      }
      if (table === 'profiles') {
        return Promise.resolve({ data: { role: 'admin' }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
    insert(rows) {
      if (dbState.inserts[table]) {
        const rowList = Array.isArray(rows) ? rows : [rows];
        for (const r of rowList) dbState.inserts[table].push(r);
      }
      // outreach-admin.js + releaseApolloLock both `await` the insert/update
      // promises directly without `.select()` chaining, so resolve from the
      // chain itself (then-able).
      return Promise.resolve({ data: null, error: null });
    },
    update(payload) {
      if (table === 'engine_state') dbState.lastUpdate = payload;
      return {
        eq: () => Promise.resolve({ data: null, error: null }),
        then: (resolve) => resolve({ data: null, error: null })
      };
    },
    delete() { return chain; },
    then(resolve) { return Promise.resolve({ data: [], count: 0, error: null }).then(resolve); }
  };
  return chain;
}

const supabaseStub = {
  from: (t) => makeChain(t),
  auth: {
    getUser: async (token) => {
      if (!token) return { data: { user: null }, error: { message: 'no token' } };
      return { data: { user: { id: 'stub-admin-uid' } }, error: null };
    }
  }
};

// Stub @supabase/supabase-js at every path Node might resolve it to. The
// netlify/functions/ tree has its own nested node_modules — see the same
// note in admin-routes-auth.test.js.
const supabasePaths = new Set([
  require.resolve('@supabase/supabase-js'),
  require.resolve('@supabase/supabase-js', { paths: [path.join(__dirname, '..', 'functions')] })
]);
const stubExports = { createClient: () => supabaseStub };
for (const sp of supabasePaths) {
  require.cache[sp] = { id: sp, filename: sp, loaded: true, exports: stubExports };
}

// Load the function under test AFTER stubbing so the inner Supabase
// require() returns our stub.
const outreachAdmin = require('../functions/outreach-admin');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent({ path, method = 'GET', headers = {}, body = null }) {
  return {
    path,
    httpMethod: method,
    headers: { host: 'stub.local', ...headers },
    queryStringParameters: {},
    body: body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body))
  };
}
function parse(res) { try { return JSON.parse(res.body); } catch { return null; } }
function adminHeaders() { return { authorization: 'Bearer stub-admin-bearer' }; }

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

(async () => {
  // ---- 1) apollo-health, no running_since -> lock_stuck:false ----
  resetDbState();
  dbState.engineMetadata = { apollo_config: { enabled: true } };
  let res = await outreachAdmin.handler(makeEvent({
    path: '/api/admin/outreach/apollo-health', method: 'GET', headers: adminHeaders()
  }));
  assert.strictEqual(res.statusCode, 200, '1: status should be 200');
  let body = parse(res);
  assert.strictEqual(body.lock_stuck, false, '1: lock_stuck must be false when running_since absent');
  assert.strictEqual(body.lock_held_minutes, 0, '1: lock_held_minutes must be 0');
  assert.strictEqual(body.lock_running_since, null, '1: lock_running_since must be null');
  assert.ok(typeof body.lock_ttl_minutes === 'number' && body.lock_ttl_minutes > 0,
    '1: lock_ttl_minutes must be a positive number');
  console.log('  ✓ 1) apollo-health: lock_stuck=false when running_since is absent');

  // ---- 2) apollo-health, held 5 min -> lock_stuck:false, held=5 ----
  resetDbState();
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000 - 1000).toISOString();
  dbState.engineMetadata = { apollo_config: { running_since: fiveMinAgo, running_nonce: 'n1' } };
  res = await outreachAdmin.handler(makeEvent({
    path: '/api/admin/outreach/apollo-health', method: 'GET', headers: adminHeaders()
  }));
  assert.strictEqual(res.statusCode, 200, '2: status should be 200');
  body = parse(res);
  assert.strictEqual(body.lock_stuck, false, '2: lock_stuck must be false when held < 6 min');
  assert.strictEqual(body.lock_held_minutes, 5, '2: lock_held_minutes must be 5');
  assert.strictEqual(body.lock_running_since, fiveMinAgo, '2: lock_running_since must echo input');
  console.log('  ✓ 2) apollo-health: lock_stuck=false when held < 6 min, lock_held_minutes=5');

  // ---- 3) apollo-health, held 7 min -> lock_stuck:true, held=7 ----
  resetDbState();
  const sevenMinAgo = new Date(Date.now() - 7 * 60 * 1000 - 1000).toISOString();
  dbState.engineMetadata = { apollo_config: { running_since: sevenMinAgo, running_nonce: 'n2' } };
  res = await outreachAdmin.handler(makeEvent({
    path: '/api/admin/outreach/apollo-health', method: 'GET', headers: adminHeaders()
  }));
  assert.strictEqual(res.statusCode, 200, '3: status should be 200');
  body = parse(res);
  assert.strictEqual(body.lock_stuck, true, '3: lock_stuck must be true when held >= 6 min');
  assert.strictEqual(body.lock_held_minutes, 7, '3: lock_held_minutes must be 7');
  assert.strictEqual(body.lock_running_since, sevenMinAgo, '3: lock_running_since must echo input');
  console.log('  ✓ 3) apollo-health: lock_stuck=true + lock_held_minutes=7 when held >= 6 min');

  // ---- 4) clear-apollo-lock clears + writes both audit rows ----
  resetDbState();
  dbState.engineMetadata = {
    apollo_config: { enabled: true, running_since: sevenMinAgo, running_nonce: 'n3', interval_hours: 6 },
    other_top_level: 'preserved'
  };
  res = await outreachAdmin.handler(makeEvent({
    path: '/api/admin/outreach/clear-apollo-lock', method: 'POST', headers: adminHeaders(), body: {}
  }));
  assert.strictEqual(res.statusCode, 200, '4: status should be 200');
  body = parse(res);
  assert.strictEqual(body.success, true, '4: success must be true');

  // engine_state.update() must have been called with apollo_config sans
  // running_since / running_nonce, and the rest of the metadata intact.
  assert.ok(dbState.lastUpdate, '4: engine_state.update must have been called');
  const updatedMeta = dbState.lastUpdate.metadata || {};
  assert.strictEqual(updatedMeta.other_top_level, 'preserved',
    '4: unrelated metadata keys must be preserved');
  const updatedCfg = updatedMeta.apollo_config || {};
  assert.ok(!('running_since' in updatedCfg),
    '4: running_since must be deleted from apollo_config');
  assert.ok(!('running_nonce' in updatedCfg),
    '4: running_nonce must be deleted from apollo_config');
  assert.strictEqual(updatedCfg.enabled, true,
    '4: other apollo_config keys must be preserved');
  assert.strictEqual(updatedCfg.interval_hours, 6,
    '4: other apollo_config keys must be preserved');

  // Audit rows in BOTH tables.
  const activityRows = dbState.inserts.outreach_activity_log;
  const auditRows    = dbState.inserts.admin_audit_log;
  assert.ok(activityRows.length >= 1,
    '4: outreach_activity_log must have at least one apollo_lock_force_cleared row');
  assert.strictEqual(activityRows[0].event_type, 'apollo_lock_force_cleared',
    '4: outreach_activity_log row must be apollo_lock_force_cleared');
  assert.ok(auditRows.length >= 1,
    '4: admin_audit_log must have at least one apollo_lock_force_cleared row');
  assert.strictEqual(auditRows[0].action, 'apollo_lock_force_cleared',
    '4: admin_audit_log row must use action=apollo_lock_force_cleared');
  console.log('  ✓ 4) clear-apollo-lock clears running_since/nonce and writes both audit rows');

  // ---- 5) apollo-health without x-admin-token -> 401 ----
  resetDbState();
  res = await outreachAdmin.handler(makeEvent({
    path: '/api/admin/outreach/apollo-health', method: 'GET'
    // no headers
  }));
  assert.strictEqual(res.statusCode, 401, '5: missing admin token must be 401');
  console.log('  ✓ 5) apollo-health rejects without Bearer admin token (401)');

  // ---- 6) clear-apollo-lock without x-admin-token -> 401 ----
  resetDbState();
  res = await outreachAdmin.handler(makeEvent({
    path: '/api/admin/outreach/clear-apollo-lock', method: 'POST', body: {}
    // no headers
  }));
  assert.strictEqual(res.statusCode, 401, '6: missing admin token must be 401');
  // And no DB writes should have happened.
  assert.strictEqual(dbState.lastUpdate, null,
    '6: no engine_state.update should fire when unauthorized');
  assert.strictEqual(dbState.inserts.outreach_activity_log.length, 0,
    '6: no outreach_activity_log rows should be written when unauthorized');
  assert.strictEqual(dbState.inserts.admin_audit_log.length, 0,
    '6: no admin_audit_log rows should be written when unauthorized');
  console.log('  ✓ 6) clear-apollo-lock rejects without Bearer admin token (401)');

  console.log('\nAll outreach-admin apollo-lock smoke tests passed.');
})().catch(e => { console.error('TEST FAILURE:', e); process.exit(1); });

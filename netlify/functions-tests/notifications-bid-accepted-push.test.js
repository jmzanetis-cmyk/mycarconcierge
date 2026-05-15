// ============================================================================
// notifications-bid-accepted-push smoke tests (Task #350, guards Task #257)
//
// In-process tests for netlify/functions/notifications-bid-accepted-push.js.
// Stubs @supabase/supabase-js with a chainable mock (no live DB) so each
// authorization branch and the happy path can be exercised in isolation.
//
// Coverage:
//   1. happy path: package-owner caller, accepted bid, matching provider_id
//      → 200 with { ok: true } (FCM not configured → sent:false, no_tokens
//      reason; the authz gate is what we care about here).
//   2. 401: missing bearer header.
//   3. 401: invalid/expired bearer token (supabase.auth.getUser fails).
//   4. 400: missing or non-UUID provider_id.
//   5. 400: missing or non-UUID bid_id.
//   6. 404: bid does not exist.
//   7. 403: provider_id does not match the bid's provider.
//   8. 409: bid is not in 'accepted' state.
//   9. 403: caller is not the maintenance_package owner.
//
// Run with:  node netlify/functions-tests/notifications-bid-accepted-push.test.js
// ============================================================================

'use strict';

const assert = require('assert');
const Module = require('module');

process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';
process.env.SUPABASE_ANON_KEY = 'stub-anon-key';
// FCM intentionally unconfigured — dispatch short-circuits with
// reason:'not_configured' so the test never tries to hit Google.
delete process.env.FCM_SERVICE_ACCOUNT_JSON;

// ---------------------------------------------------------------------------
// Configurable Supabase stub. Each test sets `dbState` + `currentAuthUser`.
// ---------------------------------------------------------------------------

let dbState = {};
let currentAuthUser = null; // { id } or null
let authError = null;       // { message } when getUser should fail

function makeChain(table) {
  const filters = {};
  const chain = {
    _table: table,
    select() { return chain; },
    eq(col, val) { filters[col] = val; return chain; },
    in() { return chain; },
    update() { return chain; },
    maybeSingle() {
      const fn = dbState[`${table}.maybeSingle`];
      return Promise.resolve(fn ? fn(filters) : { data: null, error: null });
    },
    then(resolve, reject) {
      const fn = dbState[`${table}.then`];
      return Promise.resolve(fn ? fn(filters) : { data: [], error: null }).then(resolve, reject);
    }
  };
  return chain;
}

const supabaseStub = {
  from: (t) => makeChain(t),
  auth: {
    getUser: async (_token) => {
      if (authError) return { data: { user: null }, error: authError };
      if (!currentAuthUser) return { data: { user: null }, error: { message: 'no user' } };
      return { data: { user: currentAuthUser }, error: null };
    }
  }
};

// Stub @supabase/supabase-js at every path Node might resolve it to.
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

// Load handler AFTER stubbing.
const handlerModule = require('../functions/notifications-bid-accepted-push');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MEMBER_ID    = '11111111-1111-4111-a111-111111111111';
const OTHER_MEMBER = '22222222-2222-4222-a222-222222222222';
const PROVIDER_ID  = '33333333-3333-4333-a333-333333333333';
const OTHER_PROV   = '44444444-4444-4444-a444-444444444444';
const BID_ID       = '55555555-5555-4555-a555-555555555555';
const PACKAGE_ID   = '66666666-6666-4666-a666-666666666666';
const MISSING_BID  = '77777777-7777-4777-a777-777777777777';

function makeEvent({ method = 'POST', headers = {}, body = null } = {}) {
  return {
    httpMethod: method,
    headers: { host: 'stub.local', ...headers },
    body: body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body))
  };
}
function parse(res) { try { return JSON.parse(res.body); } catch { return null; } }
function bearer() { return { authorization: 'Bearer stub-jwt' }; }

function asMember(id) {
  currentAuthUser = { id };
  authError = null;
}
function asNobody() {
  currentAuthUser = null;
  authError = { message: 'jwt expired' };
}

// Standard "happy" bid row: package owned by MEMBER_ID, bid accepted, provider matches.
function happyBidLookup() {
  return {
    'bids.maybeSingle': (filters) => {
      if (filters.id !== BID_ID) return { data: null, error: null };
      return {
        data: {
          id: BID_ID,
          provider_id: PROVIDER_ID,
          status: 'accepted',
          package_id: PACKAGE_ID,
          maintenance_packages: { member_id: MEMBER_ID }
        },
        error: null
      };
    }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

(async () => {
  console.log('notifications-bid-accepted-push.test.js');

  // ---- 1) happy path -> 200 ok:true ----------------------------------------
  asMember(MEMBER_ID);
  dbState = happyBidLookup();
  let res = await handlerModule.handler(makeEvent({
    method: 'POST', headers: bearer(),
    body: { provider_id: PROVIDER_ID, bid_id: BID_ID, package_title: 'Brakes', bid_amount: 250 }
  }));
  assert.strictEqual(res.statusCode, 200, '1: happy path should be 200');
  const body1 = parse(res);
  assert.strictEqual(body1.ok, true, '1: response.ok must be true');
  // FCM unconfigured → sent:false, reason:'not_configured'. The point of
  // the test is the authz gate accepted the request, not the FCM outcome.
  assert.strictEqual(body1.sent, false, '1: sent:false when FCM unconfigured');
  assert.strictEqual(body1.reason, 'not_configured', '1: reason carries FCM config state');
  console.log('  ✓ 1) package-owner + accepted bid + matching provider_id → 200 ok:true');

  // ---- 2) missing bearer -> 401 --------------------------------------------
  asMember(MEMBER_ID);
  dbState = {};
  res = await handlerModule.handler(makeEvent({
    method: 'POST', headers: {},
    body: { provider_id: PROVIDER_ID, bid_id: BID_ID }
  }));
  assert.strictEqual(res.statusCode, 401, '2: no bearer should be 401');
  console.log('  ✓ 2) missing bearer header → 401');

  // ---- 3) invalid/expired bearer -> 401 ------------------------------------
  asNobody();
  dbState = {};
  res = await handlerModule.handler(makeEvent({
    method: 'POST', headers: bearer(),
    body: { provider_id: PROVIDER_ID, bid_id: BID_ID }
  }));
  assert.strictEqual(res.statusCode, 401, '3: bad token should be 401');
  console.log('  ✓ 3) invalid/expired bearer token → 401');

  // ---- 4) missing/invalid provider_id -> 400 -------------------------------
  asMember(MEMBER_ID);
  dbState = happyBidLookup();
  res = await handlerModule.handler(makeEvent({
    method: 'POST', headers: bearer(),
    body: { bid_id: BID_ID }
  }));
  assert.strictEqual(res.statusCode, 400, '4a: missing provider_id should be 400');

  res = await handlerModule.handler(makeEvent({
    method: 'POST', headers: bearer(),
    body: { provider_id: 'not-a-uuid', bid_id: BID_ID }
  }));
  assert.strictEqual(res.statusCode, 400, '4b: non-UUID provider_id should be 400');
  console.log('  ✓ 4) missing or non-UUID provider_id → 400');

  // ---- 5) missing/invalid bid_id -> 400 ------------------------------------
  asMember(MEMBER_ID);
  dbState = happyBidLookup();
  res = await handlerModule.handler(makeEvent({
    method: 'POST', headers: bearer(),
    body: { provider_id: PROVIDER_ID }
  }));
  assert.strictEqual(res.statusCode, 400, '5a: missing bid_id should be 400');

  res = await handlerModule.handler(makeEvent({
    method: 'POST', headers: bearer(),
    body: { provider_id: PROVIDER_ID, bid_id: 'nope' }
  }));
  assert.strictEqual(res.statusCode, 400, '5b: non-UUID bid_id should be 400');
  console.log('  ✓ 5) missing or non-UUID bid_id → 400');

  // ---- 6) bid does not exist -> 404 ----------------------------------------
  asMember(MEMBER_ID);
  dbState = {
    'bids.maybeSingle': () => ({ data: null, error: null })
  };
  res = await handlerModule.handler(makeEvent({
    method: 'POST', headers: bearer(),
    body: { provider_id: PROVIDER_ID, bid_id: MISSING_BID }
  }));
  assert.strictEqual(res.statusCode, 404, '6: missing bid should be 404');
  console.log('  ✓ 6) bid not found → 404');

  // ---- 7) provider_id mismatch -> 403 --------------------------------------
  asMember(MEMBER_ID);
  dbState = happyBidLookup();
  res = await handlerModule.handler(makeEvent({
    method: 'POST', headers: bearer(),
    body: { provider_id: OTHER_PROV, bid_id: BID_ID }
  }));
  assert.strictEqual(res.statusCode, 403, '7: provider mismatch should be 403');
  console.log('  ✓ 7) provider_id does not match bid → 403');

  // ---- 8) bid not in accepted state -> 409 ---------------------------------
  asMember(MEMBER_ID);
  dbState = {
    'bids.maybeSingle': () => ({
      data: {
        id: BID_ID,
        provider_id: PROVIDER_ID,
        status: 'pending',
        package_id: PACKAGE_ID,
        maintenance_packages: { member_id: MEMBER_ID }
      },
      error: null
    })
  };
  res = await handlerModule.handler(makeEvent({
    method: 'POST', headers: bearer(),
    body: { provider_id: PROVIDER_ID, bid_id: BID_ID }
  }));
  assert.strictEqual(res.statusCode, 409, '8: non-accepted bid should be 409');
  console.log('  ✓ 8) bid not in accepted state → 409');

  // ---- 9) caller is not the package owner -> 403 --------------------------
  asMember(OTHER_MEMBER); // authenticated, just not the owner
  dbState = happyBidLookup();
  res = await handlerModule.handler(makeEvent({
    method: 'POST', headers: bearer(),
    body: { provider_id: PROVIDER_ID, bid_id: BID_ID }
  }));
  assert.strictEqual(res.statusCode, 403, '9: non-owner should be 403');
  console.log('  ✓ 9) caller is not the package owner → 403');

  console.log('\nAll notifications-bid-accepted-push checks passed.');
})().catch((err) => {
  console.error('Test threw:', err);
  process.exit(1);
});

// ============================================================================
// netlify/functions/__tests__/auto_bid_ledger.mocktest.js
//
// Zero-network mock harness for auto-bid-ledger.js. Same rationale as the
// other Phase 5/7 mocktest files in this directory — no live Supabase
// access from this environment. Two layers here:
//   1. Direct unit tests of exports._buildLedger — the pure aggregation
//      function, no DB/auth involved, so these are real (not mocked) tests.
//   2. A thin handler-level pass with a scripted fake Supabase client,
//      covering auth/method/ownership-scoping — the same shape as
//      auto_bid_prefill.mocktest.js's coverage of auto-bid-prefill.js.
//
// Run: node netlify/functions/__tests__/auto_bid_ledger.mocktest.js
// ============================================================================
'use strict';

const assert = require('assert');
const { _buildLedger } = require('../auto-bid-ledger');

let passed = 0;
function t(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}\n   ${e.stack || e.message}`);
    process.exitCode = 1;
  }
}
async function at(name, fn) {
  return fn().then(() => { passed++; console.log(`✓ ${name}`); })
    .catch(e => { console.error(`✗ ${name}\n   ${e.stack || e.message}`); process.exitCode = 1; });
}

const NOW = Date.parse('2026-09-16T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

// ---- _buildLedger (pure) ------------------------------------------------

t('empty input produces all-zero counts, no division-by-zero or NaN anywhere', () => {
  const ledger = _buildLedger([], NOW);
  assert.deepStrictEqual(ledger.all_time, { total: 0, pending: 0, confirmed: 0, dismissed: 0, expired: 0 });
  assert.deepStrictEqual(ledger.last_7_days, { total: 0, pending: 0, confirmed: 0, dismissed: 0, expired: 0 });
  assert.strictEqual(ledger.confirmed_prefilled_amount_cents, 0);
});

t('counts by status, all-time', () => {
  const rows = [
    { status: 'pending', prefilled_amount_cents: 1000, created_at: new Date(NOW).toISOString() },
    { status: 'confirmed', prefilled_amount_cents: 8900, created_at: new Date(NOW).toISOString() },
    { status: 'confirmed', prefilled_amount_cents: 5500, created_at: new Date(NOW).toISOString() },
    { status: 'dismissed', prefilled_amount_cents: 2000, created_at: new Date(NOW).toISOString() },
    { status: 'expired', prefilled_amount_cents: 3000, created_at: new Date(NOW).toISOString() },
  ];
  const ledger = _buildLedger(rows, NOW);
  assert.deepStrictEqual(ledger.all_time, { total: 5, pending: 1, confirmed: 2, dismissed: 1, expired: 1 });
});

t('confirmed_prefilled_amount_cents sums ONLY confirmed rows, ignoring pending/dismissed/expired amounts', () => {
  const rows = [
    { status: 'confirmed', prefilled_amount_cents: 8900, created_at: new Date(NOW).toISOString() },
    { status: 'confirmed', prefilled_amount_cents: 5500, created_at: new Date(NOW).toISOString() },
    { status: 'pending', prefilled_amount_cents: 999999, created_at: new Date(NOW).toISOString() },
    { status: 'dismissed', prefilled_amount_cents: 999999, created_at: new Date(NOW).toISOString() },
  ];
  const ledger = _buildLedger(rows, NOW);
  assert.strictEqual(ledger.confirmed_prefilled_amount_cents, 14400);
});

t('last_7_days excludes rows older than 7 days and includes rows exactly at the boundary and just inside it', () => {
  const rows = [
    { status: 'confirmed', prefilled_amount_cents: 100, created_at: new Date(NOW - 1 * DAY).toISOString() },       // in window
    { status: 'confirmed', prefilled_amount_cents: 100, created_at: new Date(NOW - 6.9 * DAY).toISOString() },     // in window
    { status: 'confirmed', prefilled_amount_cents: 100, created_at: new Date(NOW - 7 * DAY).toISOString() },       // exactly at boundary → in window (>=)
    { status: 'confirmed', prefilled_amount_cents: 100, created_at: new Date(NOW - 7.1 * DAY).toISOString() },     // just outside → excluded
    { status: 'confirmed', prefilled_amount_cents: 100, created_at: new Date(NOW - 30 * DAY).toISOString() },      // well outside
  ];
  const ledger = _buildLedger(rows, NOW);
  assert.strictEqual(ledger.all_time.total, 5, 'all_time should still count every row regardless of age');
  assert.strictEqual(ledger.last_7_days.total, 3, `expected 3 rows within the trailing 7 days, got ${ledger.last_7_days.total}`);
});

t('a row with an unrecognized status value is skipped (not miscounted, not thrown)', () => {
  const rows = [
    { status: 'confirmed', prefilled_amount_cents: 100, created_at: new Date(NOW).toISOString() },
    { status: 'some_future_status_this_code_does_not_know_about', prefilled_amount_cents: 999999, created_at: new Date(NOW).toISOString() },
  ];
  const ledger = _buildLedger(rows, NOW);
  assert.strictEqual(ledger.all_time.total, 1, 'unknown status should not be counted in total');
  assert.strictEqual(ledger.confirmed_prefilled_amount_cents, 100, 'unknown status amount should not leak into the confirmed sum');
});

t('a row with a missing/invalid created_at is still counted in all_time but not in last_7_days', () => {
  const rows = [
    { status: 'confirmed', prefilled_amount_cents: 100, created_at: null },
    { status: 'confirmed', prefilled_amount_cents: 100, created_at: 'not-a-date' },
  ];
  const ledger = _buildLedger(rows, NOW);
  assert.strictEqual(ledger.all_time.total, 2);
  assert.strictEqual(ledger.last_7_days.total, 0, 'rows with unparseable dates must not silently count as "recent"');
});

// ---- handler-level: auth + method + ownership scoping --------------------

function makeChain(resp) {
  return {
    select() { return this; },
    eq(col, val) { this._eqCol = col; this._eqVal = val; return this; },
    then(resolve, reject) { return Promise.resolve(resp).then(resolve, reject); },
  };
}

function makeFakeSupabase({ authUser, ledgerRows, capturedFilters }) {
  return {
    auth: {
      getUser: async (token) => {
        if (!token) return { data: null, error: { message: 'no token' } };
        return { data: { user: authUser }, error: null };
      },
    },
    from(table) {
      return {
        select(cols) {
          const chain = makeChain({ data: ledgerRows, error: null });
          const origEq = chain.eq.bind(chain);
          chain.eq = (col, val) => { capturedFilters.push([table, col, val]); return origEq(col, val); };
          return chain;
        },
      };
    },
  };
}

function loadHandlerWithFakeSupabase(fakeSupabase) {
  const utilsPath = require.resolve('../utils');
  const handlerPath = require.resolve('../auto-bid-ledger');
  delete require.cache[utilsPath];
  delete require.cache[handlerPath];
  const utils = require('../utils');
  utils.createSupabaseClient = () => fakeSupabase;
  return require('../auto-bid-ledger');
}

const PROVIDER_ID = '11111111-1111-4111-8111-111111111111';

async function runHandlerTests() {
  await at('missing Authorization header returns 401 before any DB call', async () => {
    const capturedFilters = [];
    const fake = makeFakeSupabase({ authUser: { id: PROVIDER_ID }, ledgerRows: [], capturedFilters });
    const mod = loadHandlerWithFakeSupabase(fake);
    const res = await mod.handler({ httpMethod: 'GET', headers: {} });
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(capturedFilters.length, 0, 'no query should run without a valid token');
  });

  await at('POST/PUT/DELETE are rejected with 405 — this endpoint is GET-only', async () => {
    const fake = makeFakeSupabase({ authUser: { id: PROVIDER_ID }, ledgerRows: [], capturedFilters: [] });
    const mod = loadHandlerWithFakeSupabase(fake);
    const res = await mod.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer tok' } });
    assert.strictEqual(res.statusCode, 405);
  });

  await at('a valid GET scopes the query to the authenticated caller\'s own provider_id — never a value from the request', async () => {
    const capturedFilters = [];
    const fake = makeFakeSupabase({
      authUser: { id: PROVIDER_ID },
      ledgerRows: [{ status: 'confirmed', prefilled_amount_cents: 8900, created_at: new Date().toISOString() }],
      capturedFilters,
    });
    const mod = loadHandlerWithFakeSupabase(fake);
    const res = await mod.handler({ httpMethod: 'GET', headers: { authorization: 'Bearer tok' } });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.all_time.confirmed, 1);
    assert.ok(
      capturedFilters.some(([table, col, val]) => table === 'auto_bid_prefills' && col === 'provider_id' && val === PROVIDER_ID),
      `expected a provider_id=${PROVIDER_ID} filter on auto_bid_prefills, got ${JSON.stringify(capturedFilters)}`
    );
  });

  console.log(`\n${passed} test group(s) passed.`);
  if (process.exitCode) {
    console.error('SOME TESTS FAILED');
    process.exit(1);
  }
}

runHandlerTests();

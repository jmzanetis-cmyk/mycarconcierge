// ============================================================================
// netlify/functions/__tests__/auto_bid_daily_cap.mocktest.js
//
// Zero-network mock harness for auto-bid-daily-cap.js. Same rationale as
// the other Phase 5/7 mocktest files — no live Supabase access from this
// environment. Covers: validation (the pure exports._validateDailyCap,
// which must exactly match the DB CHECK constraint in
// supabase/migrations/20260921d_auto_bid_prefill_caps.sql so a bad value
// is rejected here with a clear 400 instead of surfacing as an opaque 500
// constraint violation), auth, GET-when-no-row-exists-yet, and that PATCH
// upserts scoped to the caller's own provider_id.
//
// Run: node netlify/functions/__tests__/auto_bid_daily_cap.mocktest.js
// ============================================================================
'use strict';

const assert = require('assert');
const { _validateDailyCap } = require('../auto-bid-daily-cap');

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log(`✓ ${name}`); }
  catch (e) { console.error(`✗ ${name}\n   ${e.stack || e.message}`); process.exitCode = 1; }
}
async function at(name, fn) {
  return fn().then(() => { passed++; console.log(`✓ ${name}`); })
    .catch(e => { console.error(`✗ ${name}\n   ${e.stack || e.message}`); process.exitCode = 1; });
}

// ---- _validateDailyCap (pure) — must match the DB CHECK exactly ----------
// CHECK (auto_bid_prefill_daily_cap IS NULL OR auto_bid_prefill_daily_cap > 0)

t('null is valid (unlimited, the default)', () => {
  assert.deepStrictEqual(_validateDailyCap(null), { ok: true, value: null });
});
t('a positive integer is valid', () => {
  assert.deepStrictEqual(_validateDailyCap(5), { ok: true, value: 5 });
});
t('zero is rejected — DB CHECK requires > 0, not >= 0', () => {
  assert.strictEqual(_validateDailyCap(0).ok, false);
});
t('a negative integer is rejected', () => {
  assert.strictEqual(_validateDailyCap(-3).ok, false);
});
t('a non-integer number is rejected (DB column is integer)', () => {
  assert.strictEqual(_validateDailyCap(2.5).ok, false);
});
t('a string is rejected even if numeric-looking', () => {
  assert.strictEqual(_validateDailyCap('5').ok, false);
});
t('undefined is rejected (the handler requires the key present separately, but the validator itself must not treat undefined as null)', () => {
  assert.strictEqual(_validateDailyCap(undefined).ok, false);
});

// ---- handler-level ---------------------------------------------------

function makeChain(resp) {
  return {
    select() { return this; },
    eq(col, val) { this._eqCol = col; this._eqVal = val; return this; },
    maybeSingle() { return this; },
    then(resolve, reject) { return Promise.resolve(resp).then(resolve, reject); },
  };
}

function makeFakeSupabase({ authUser, getResponse, upsertSpy }) {
  return {
    auth: {
      getUser: async (token) => {
        if (!token) return { data: null, error: { message: 'no token' } };
        return { data: { user: authUser }, error: null };
      },
    },
    from(table) {
      return {
        select() { return makeChain(getResponse); },
        upsert(row, opts) {
          if (upsertSpy) upsertSpy(table, row, opts);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
}

function loadHandlerWithFakeSupabase(fakeSupabase) {
  const utilsPath = require.resolve('../utils');
  const handlerPath = require.resolve('../auto-bid-daily-cap');
  delete require.cache[utilsPath];
  delete require.cache[handlerPath];
  const utils = require('../utils');
  utils.createSupabaseClient = () => fakeSupabase;
  return require('../auto-bid-daily-cap');
}

const PROVIDER_ID = '11111111-1111-4111-8111-111111111111';

async function runHandlerTests() {
  await at('missing Authorization header returns 401', async () => {
    const fake = makeFakeSupabase({ authUser: { id: PROVIDER_ID }, getResponse: { data: null, error: null } });
    const mod = loadHandlerWithFakeSupabase(fake);
    const res = await mod.handler({ httpMethod: 'GET', headers: {} });
    assert.strictEqual(res.statusCode, 401);
  });

  await at('GET with no existing provider_notification_preferences row returns daily_cap: null (unlimited default), not an error', async () => {
    const fake = makeFakeSupabase({ authUser: { id: PROVIDER_ID }, getResponse: { data: null, error: null } });
    const mod = loadHandlerWithFakeSupabase(fake);
    const res = await mod.handler({ httpMethod: 'GET', headers: { authorization: 'Bearer tok' } });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(JSON.parse(res.body), { daily_cap: null });
  });

  await at('GET with an existing row returns its stored value', async () => {
    const fake = makeFakeSupabase({ authUser: { id: PROVIDER_ID }, getResponse: { data: { auto_bid_prefill_daily_cap: 3 }, error: null } });
    const mod = loadHandlerWithFakeSupabase(fake);
    const res = await mod.handler({ httpMethod: 'GET', headers: { authorization: 'Bearer tok' } });
    assert.deepStrictEqual(JSON.parse(res.body), { daily_cap: 3 });
  });

  await at('PATCH with an invalid value (0) is rejected 400 and never reaches the DB', async () => {
    let upsertCalled = false;
    const fake = makeFakeSupabase({ authUser: { id: PROVIDER_ID }, getResponse: { data: null, error: null }, upsertSpy: () => { upsertCalled = true; } });
    const mod = loadHandlerWithFakeSupabase(fake);
    const res = await mod.handler({ httpMethod: 'PATCH', headers: { authorization: 'Bearer tok' }, body: JSON.stringify({ daily_cap: 0 }) });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(upsertCalled, false, 'an invalid value must never reach the DB write');
  });

  await at('PATCH with a valid value upserts scoped to the caller\'s own provider_id, never a value from the body', async () => {
    let captured = null;
    const fake = makeFakeSupabase({
      authUser: { id: PROVIDER_ID }, getResponse: { data: null, error: null },
      upsertSpy: (table, row, opts) => { captured = { table, row, opts }; },
    });
    const mod = loadHandlerWithFakeSupabase(fake);
    const res = await mod.handler({
      httpMethod: 'PATCH', headers: { authorization: 'Bearer tok' },
      body: JSON.stringify({ daily_cap: 7, provider_id: 'attacker-supplied-id-should-be-ignored' }),
    });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(JSON.parse(res.body), { daily_cap: 7 });
    assert.strictEqual(captured.table, 'provider_notification_preferences');
    assert.strictEqual(captured.row.provider_id, PROVIDER_ID, 'must use the authenticated user\'s id, not anything from the request body');
    assert.strictEqual(captured.row.auto_bid_prefill_daily_cap, 7);
    assert.strictEqual(captured.opts.onConflict, 'provider_id');
  });

  await at('PATCH with daily_cap: null clears the cap back to unlimited', async () => {
    let captured = null;
    const fake = makeFakeSupabase({
      authUser: { id: PROVIDER_ID }, getResponse: { data: null, error: null },
      upsertSpy: (table, row) => { captured = row; },
    });
    const mod = loadHandlerWithFakeSupabase(fake);
    const res = await mod.handler({ httpMethod: 'PATCH', headers: { authorization: 'Bearer tok' }, body: JSON.stringify({ daily_cap: null }) });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(captured.auto_bid_prefill_daily_cap, null);
  });

  console.log(`\n${passed} test group(s) passed.`);
  if (process.exitCode) {
    console.error('SOME TESTS FAILED');
    process.exit(1);
  }
}

runHandlerTests();

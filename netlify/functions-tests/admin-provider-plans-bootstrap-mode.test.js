// Mode-aware bootstrap regression guard.
//
// The pre-fix bootstrap used a single stripe_price_monthly column, so a
// sandbox run left a test-mode price id sitting in that field and the
// subsequent production run silently skipped ("already_provisioned") —
// then plan-checkout handed the test id to LIVE Stripe. See migration
// 20260920a for the storage change and the file header of
// admin-provider-plans-bootstrap.js for the whole story.
//
// This test proves the bootstrap loop honors that split:
//
//   1. DB row with only stripe_price_monthly_test set + isLive=true →
//      bootstrap MUST create fresh Stripe product + price and write to
//      the LIVE columns; must NOT touch the _test columns; must NOT
//      short-circuit as already_provisioned.
//   2. DB row with a valid live id + isLive=true → skip; no create call.
//   3. DB row with a live id that Stripe 404s + isLive=true → recreate.
//   4. DB row with only test id + isLive=false → skip (test id retrieves OK).

'use strict';
const assert = require('assert');
const { bootstrapPlans, columnsForMode } = require('../functions/admin-provider-plans-bootstrap');

function makeStripe({ retrieveMap = {}, priceRetrieveMissing = new Set() } = {}) {
  const calls = { productsCreate: [], pricesCreate: [], pricesRetrieve: [] };
  return {
    calls,
    products: {
      create: async (args) => {
        calls.productsCreate.push(args);
        return { id: 'prod_new_' + (calls.productsCreate.length) };
      },
    },
    prices: {
      create: async (args) => {
        calls.pricesCreate.push(args);
        return { id: 'price_new_' + (calls.pricesCreate.length) };
      },
      retrieve: async (id) => {
        calls.pricesRetrieve.push(id);
        if (priceRetrieveMissing.has(id)) {
          const e = new Error('No such price: ' + id);
          e.code = 'resource_missing';
          throw e;
        }
        if (retrieveMap[id]) return retrieveMap[id];
        return { id };
      },
    },
  };
}

// Minimal supabase-js chain stub — just enough to satisfy the bootstrap
// select + update shapes.
function makeSupabase(rows) {
  const state = { rows: rows.map(r => ({ ...r })), updates: [] };
  const chain = (tableName) => {
    let filters = [];
    let mode = 'select';
    let patch = null;
    const b = {
      select(_cols) { return this; },
      eq(col, val) { filters.push(row => row[col] === val); return this; },
      order(_col, _opts) { return this; },
      update(p) { mode = 'update'; patch = p; return this; },
      then(resolve) {
        if (mode === 'update') {
          const targets = state.rows.filter(r => filters.every(f => f(r)));
          for (const r of targets) Object.assign(r, patch);
          state.updates.push({ table: tableName, patch, filters: filters.length });
          resolve({ data: targets, error: null });
        } else {
          const found = state.rows.filter(r => filters.every(f => f(r)));
          resolve({ data: found, error: null });
        }
      },
    };
    return b;
  };
  return { _state: state, from: chain };
}

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); console.log('  ok  ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + ': ' + e.stack); fail++; }
}

(async () => {

await t('columnsForMode routes live/test to correct columns', () => {
  assert.deepStrictEqual(columnsForMode(true),
    { priceCol: 'stripe_price_monthly',      productCol: 'stripe_product_id' });
  assert.deepStrictEqual(columnsForMode(false),
    { priceCol: 'stripe_price_monthly_test', productCol: 'stripe_product_id_test' });
});

await t('isLive + only test id present → creates live product/price, leaves _test alone', async () => {
  const supabase = makeSupabase([{
    plan_key: 'starter', name: 'Starter', credits_per_month: 10, monthly_price_cents: 8900,
    is_active: true, sort_order: 1,
    stripe_price_monthly: null,
    stripe_price_monthly_test: 'price_TEST_1',
    stripe_product_id: null,
    stripe_product_id_test: null,
  }]);
  const stripe = makeStripe();
  const results = await bootstrapPlans({ supabase, stripe, isLive: true });

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].status, 'created');
  assert.strictEqual(stripe.calls.productsCreate.length, 1, 'one product create call');
  assert.strictEqual(stripe.calls.pricesCreate.length, 1,   'one price create call');
  assert.strictEqual(stripe.calls.pricesRetrieve.length, 0,
    'no retrieve — live column was null, no lookup needed');

  const row = supabase._state.rows[0];
  assert.ok(row.stripe_price_monthly.startsWith('price_new_'), 'live price col written');
  assert.ok(row.stripe_product_id.startsWith('prod_new_'),     'live product col written');
  assert.strictEqual(row.stripe_price_monthly_test, 'price_TEST_1', 'test price col untouched');
  assert.strictEqual(row.stripe_product_id_test, null,             'test product col untouched');
});

await t('isLive + valid live id already present → skip, no create call', async () => {
  const supabase = makeSupabase([{
    plan_key: 'starter', name: 'Starter', credits_per_month: 10, monthly_price_cents: 8900,
    is_active: true, sort_order: 1,
    stripe_price_monthly: 'price_LIVE_1',
    stripe_price_monthly_test: 'price_TEST_1',
    stripe_product_id: 'prod_LIVE_1',
    stripe_product_id_test: null,
  }]);
  const stripe = makeStripe();
  const results = await bootstrapPlans({ supabase, stripe, isLive: true });

  assert.strictEqual(results[0].status, 'skipped');
  assert.strictEqual(results[0].reason, 'already_provisioned');
  assert.deepStrictEqual(stripe.calls.pricesRetrieve, ['price_LIVE_1']);
  assert.strictEqual(stripe.calls.productsCreate.length, 0);
  assert.strictEqual(stripe.calls.pricesCreate.length,   0);
});

await t('isLive + live id 404s in Stripe → recreate; test cols still untouched', async () => {
  const supabase = makeSupabase([{
    plan_key: 'starter', name: 'Starter', credits_per_month: 10, monthly_price_cents: 8900,
    is_active: true, sort_order: 1,
    stripe_price_monthly: 'price_LIVE_gone',
    stripe_price_monthly_test: 'price_TEST_1',
    stripe_product_id: 'prod_LIVE_gone',
    stripe_product_id_test: 'prod_TEST_1',
  }]);
  const stripe = makeStripe({ priceRetrieveMissing: new Set(['price_LIVE_gone']) });
  const results = await bootstrapPlans({ supabase, stripe, isLive: true });

  assert.strictEqual(results[0].status, 'created', 'recreated on 404');
  assert.strictEqual(stripe.calls.productsCreate.length, 1);
  assert.strictEqual(stripe.calls.pricesCreate.length,   1);

  const row = supabase._state.rows[0];
  assert.ok(row.stripe_price_monthly.startsWith('price_new_'), 'live price col rewritten');
  assert.strictEqual(row.stripe_price_monthly_test, 'price_TEST_1', 'test price col still untouched');
  assert.strictEqual(row.stripe_product_id_test,    'prod_TEST_1',  'test product col still untouched');
});

await t('!isLive + only test id present + valid → skip', async () => {
  const supabase = makeSupabase([{
    plan_key: 'starter', name: 'Starter', credits_per_month: 10, monthly_price_cents: 8900,
    is_active: true, sort_order: 1,
    stripe_price_monthly: null,
    stripe_price_monthly_test: 'price_TEST_1',
    stripe_product_id: null,
    stripe_product_id_test: 'prod_TEST_1',
  }]);
  const stripe = makeStripe();
  const results = await bootstrapPlans({ supabase, stripe, isLive: false });

  assert.strictEqual(results[0].status, 'skipped');
  assert.deepStrictEqual(stripe.calls.pricesRetrieve, ['price_TEST_1']);
  assert.strictEqual(stripe.calls.productsCreate.length, 0);
  assert.strictEqual(stripe.calls.pricesCreate.length,   0);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
})();

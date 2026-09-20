// Tolerant-accessor drift guard for the 2026-04-22.dahlia payload shape.
//
// Netlify webhook endpoints receive events at the account-level API
// version (currently 2026-04-22.dahlia). Field paths differ from what
// the SDK's pinned 2024-04-10 types describe:
//
//   invoice.subscription                           → invoice.parent.subscription_details.subscription
//   invoice.subscription_details.metadata          → invoice.parent.subscription_details.metadata
//   subscription.current_period_start / _end       → subscription.items.data[0].current_period_*
//
// _provider-plan-webhooks.js reads via invoiceSubId / invoiceSubMeta /
// subPeriod so both shapes flow through the same code. This test builds
// one fixture per shape (old + dahlia) that describe the SAME underlying
// state, feeds each through the accessors, and asserts identical output.
//
// If Stripe rolls the field paths again, add another fixture below.

'use strict';

const assert = require('assert');
const {
  invoiceSubId,
  invoiceSubMeta,
  subPeriod,
  isProviderPlanInvoice,
} = require('../functions/_provider-plan-webhooks');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ok  ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + ': ' + e.message); fail++; }
}

// ── Fixture: invoice ────────────────────────────────────────────────
const SUB_ID  = 'sub_TEST_1UHUyr';
const CUST_ID = 'cus_TEST_VI58US';

// Pre-dahlia shape — old fields at root
const invoiceOld = {
  id: 'in_test_old',
  amount_paid: 8900,
  subscription: SUB_ID,
  subscription_details: {
    metadata: { product: 'provider_plan', provider_id: 'p1', plan_key: 'starter' },
  },
};

// Dahlia shape — `parent.subscription_details` carries id + metadata
const invoiceDahlia = {
  id: 'in_test_dahlia',
  amount_paid: 8900,
  parent: {
    subscription_details: {
      subscription: SUB_ID,
      metadata: { product: 'provider_plan', provider_id: 'p1', plan_key: 'starter' },
    },
  },
};

// Dahlia shape with expanded subscription (object instead of id)
const invoiceDahliaExpanded = {
  id: 'in_test_dahlia_expanded',
  amount_paid: 8900,
  parent: {
    subscription_details: {
      subscription: { id: SUB_ID, object: 'subscription' },
      metadata: { product: 'provider_plan' },
    },
  },
};

t('invoiceSubId — old shape returns the id string', () => {
  assert.strictEqual(invoiceSubId(invoiceOld), SUB_ID);
});
t('invoiceSubId — dahlia shape returns the id string', () => {
  assert.strictEqual(invoiceSubId(invoiceDahlia), SUB_ID);
});
t('invoiceSubId — dahlia expanded object gets coerced to id', () => {
  assert.strictEqual(invoiceSubId(invoiceDahliaExpanded), SUB_ID);
});
t('invoiceSubId — no subscription anywhere returns null', () => {
  assert.strictEqual(invoiceSubId({ id: 'in_none', amount_paid: 100 }), null);
});

t('invoiceSubMeta — old shape returns metadata', () => {
  assert.strictEqual(invoiceSubMeta(invoiceOld).product, 'provider_plan');
});
t('invoiceSubMeta — dahlia shape returns metadata', () => {
  assert.strictEqual(invoiceSubMeta(invoiceDahlia).product, 'provider_plan');
});
t('invoiceSubMeta — missing metadata returns empty object', () => {
  assert.deepStrictEqual(invoiceSubMeta({ id: 'in_none' }), {});
});

t('isProviderPlanInvoice — old shape true', () => {
  assert.strictEqual(isProviderPlanInvoice(invoiceOld), true);
});
t('isProviderPlanInvoice — dahlia shape true', () => {
  assert.strictEqual(isProviderPlanInvoice(invoiceDahlia), true);
});
t('isProviderPlanInvoice — white-label subscription false', () => {
  assert.strictEqual(isProviderPlanInvoice({
    parent: { subscription_details: { subscription: 'sub_x', metadata: { product: 'white_label' } } },
  }), false);
});

// ── Fixture: subscription ─────────────────────────────────────────────
const PERIOD_START = 1758294932;
const PERIOD_END   = PERIOD_START + 30 * 86400;

const subOld = {
  id: SUB_ID,
  customer: CUST_ID,
  status: 'active',
  current_period_start: PERIOD_START,
  current_period_end: PERIOD_END,
  items: { data: [{ price: { recurring: { interval: 'month' } } }] },
  metadata: { product: 'provider_plan', provider_id: 'p1', plan_key: 'starter' },
};

const subDahlia = {
  id: SUB_ID,
  customer: CUST_ID,
  status: 'active',
  items: {
    data: [{
      current_period_start: PERIOD_START,
      current_period_end:   PERIOD_END,
      price: { recurring: { interval: 'month' } },
    }],
  },
  metadata: { product: 'provider_plan', provider_id: 'p1', plan_key: 'starter' },
};

t('subPeriod — old shape returns root period', () => {
  const p = subPeriod(subOld);
  assert.strictEqual(p.start, PERIOD_START);
  assert.strictEqual(p.end, PERIOD_END);
});
t('subPeriod — dahlia shape returns items[0] period', () => {
  const p = subPeriod(subDahlia);
  assert.strictEqual(p.start, PERIOD_START);
  assert.strictEqual(p.end, PERIOD_END);
});
t('subPeriod — old and dahlia produce identical values for same state', () => {
  assert.deepStrictEqual(subPeriod(subOld), subPeriod(subDahlia));
});
t('subPeriod — empty subscription returns null start/end', () => {
  const p = subPeriod({ id: 'sub_x' });
  assert.strictEqual(p.start, null);
  assert.strictEqual(p.end, null);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);

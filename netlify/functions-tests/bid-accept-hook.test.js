// convertProviderTrial + onBidAccepted unit test.
//
// Phase 2 §2.4a — verifies the trial-conversion hook's DB effects and
// Stripe call shape without needing a live provider JWT or sandbox
// Stripe access. Stubs both dependencies.
//
// Covers:
//   1. Trialing sub + no converted_at → Stripe.subscriptions.update called
//      with (id, {trial_end:'now', proration_behavior:'none'}); DB row
//      gets converted_at + converting_bid_id stamped.
//   2. No trialing sub for provider → skipped, no Stripe call.
//   3. Already converted (converted_at present) → skipped by the
//      .is('converted_at', null) filter; no Stripe call.
//   4. Stripe API throws → audit_log row written, no throw into caller.
//   5. onBidAccepted still calls notifyAcceptedProvider even when the
//      trial conversion skipped — hook composition is order-preserving.

'use strict';
const assert = require('assert');
const Module = require('module');

// ─── Stub `stripe` module so no network call happens ────────────────
const stripeCalls = [];
let stripeShouldThrow = null;

const stripeFactory = function () {
  return {
    subscriptions: {
      update: async (id, params) => {
        stripeCalls.push({ id, params });
        if (stripeShouldThrow) throw new Error(stripeShouldThrow);
        return { id, status: 'active' };
      },
    },
  };
};

// Intercept `require('stripe')` at Module._load time. No file resolution
// happens for the intercepted name, so no MODULE_NOT_FOUND.
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'stripe') return stripeFactory;
  return origLoad.call(this, request, parent, isMain);
};

// Set STRIPE_SECRET_KEY so the module doesn't bail on getStripe() null.
process.env.STRIPE_SECRET_KEY = 'sk_test_stub_for_unit_test';

const { convertProviderTrial, onBidAccepted } = require('../functions/_bid-accept-hook');

// ─── Minimal Supabase stub ──────────────────────────────────────────
// Only the query shapes used by convertProviderTrial are implemented.
function makeSb(initial) {
  const tables = JSON.parse(JSON.stringify(initial || {}));
  return {
    _tables: tables,
    from(name) {
      let filters = [];
      let mode = 'select';
      let patch = null;
      let insertRow = null;
      const b = {
        select(_cols) { return this; },
        eq(col, val) { filters.push(row => row[col] === val); return this; },
        is(col, val) { filters.push(row => (val === null ? row[col] == null : row[col] === val)); return this; },
        update(p) { mode = 'update'; patch = p; return this; },
        insert(row) { mode = 'insert'; insertRow = row; return this; },
        maybeSingle: async () => {
          const rows = (tables[name] || []).filter(r => filters.every(f => f(r)));
          return { data: rows[0] || null, error: null };
        },
        then(resolve, reject) {
          try {
            if (mode === 'update') {
              const rows = (tables[name] || []).filter(r => filters.every(f => f(r)));
              for (const r of rows) Object.assign(r, patch);
              resolve({ data: rows, error: null });
            } else if (mode === 'insert') {
              (tables[name] = tables[name] || []).push(insertRow);
              resolve({ data: [insertRow], error: null });
            } else {
              const rows = (tables[name] || []).filter(r => filters.every(f => f(r)));
              resolve({ data: rows, error: null });
            }
          } catch (e) { if (reject) reject(e); else throw e; }
        },
        catch() { return this; },
      };
      return b;
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────
let pass = 0, fail = 0;
async function t(name, fn) {
  stripeCalls.length = 0;
  stripeShouldThrow = null;
  try { await fn(); console.log('  ok  ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + ': ' + e.stack); fail++; }
}

(async () => {

await t('trialing sub → Stripe.subscriptions.update + DB stamps converted_at', async () => {
  const sb = makeSb({
    provider_subscriptions: [{
      id: 'ps-1', stripe_subscription_id: 'sub_1', provider_id: 'p1',
      status: 'trialing', converted_at: null, plan_key: 'starter',
    }],
  });
  const res = await convertProviderTrial(sb, 'p1', 'bid-42');
  assert.strictEqual(res.converted, 'sub_1', 'returns converted sub id');
  assert.strictEqual(stripeCalls.length, 1, 'one Stripe API call');
  assert.strictEqual(stripeCalls[0].id, 'sub_1');
  assert.strictEqual(stripeCalls[0].params.trial_end, 'now');
  assert.strictEqual(stripeCalls[0].params.proration_behavior, 'none');
  const row = sb._tables.provider_subscriptions[0];
  assert.ok(row.converted_at, 'converted_at stamped');
  assert.strictEqual(row.converting_bid_id, 'bid-42', 'converting_bid_id stamped');
});

await t('no trialing sub → skipped, no Stripe call', async () => {
  const sb = makeSb({ provider_subscriptions: [] });
  const res = await convertProviderTrial(sb, 'p_nope', 'bid-1');
  assert.strictEqual(res.skipped, 'no_trialing_sub');
  assert.strictEqual(stripeCalls.length, 0);
});

await t('already converted (status=active) → skipped, no Stripe call', async () => {
  const sb = makeSb({
    provider_subscriptions: [{
      id: 'ps-2', stripe_subscription_id: 'sub_2', provider_id: 'p2',
      status: 'active', converted_at: '2026-09-01T00:00:00Z',
    }],
  });
  const res = await convertProviderTrial(sb, 'p2', 'bid-2');
  assert.strictEqual(res.skipped, 'no_trialing_sub',
    'status=active does not match .eq(status,trialing)');
  assert.strictEqual(stripeCalls.length, 0);
});

await t('trialing sub with converted_at already set → skipped by null filter', async () => {
  const sb = makeSb({
    provider_subscriptions: [{
      id: 'ps-3', stripe_subscription_id: 'sub_3', provider_id: 'p3',
      status: 'trialing', converted_at: '2026-09-01T00:00:00Z',
    }],
  });
  const res = await convertProviderTrial(sb, 'p3', 'bid-3');
  assert.strictEqual(res.skipped, 'no_trialing_sub',
    'converted_at IS NOT NULL fails the .is(converted_at,null) filter');
  assert.strictEqual(stripeCalls.length, 0);
});

await t('Stripe API throws → audit_log row written, no exception', async () => {
  stripeShouldThrow = 'stripe api down';
  const sb = makeSb({
    provider_subscriptions: [{
      id: 'ps-4', stripe_subscription_id: 'sub_4', provider_id: 'p4',
      status: 'trialing', converted_at: null,
    }],
  });
  let threw = false;
  let res;
  try { res = await convertProviderTrial(sb, 'p4', 'bid-4'); }
  catch (_) { threw = true; }
  assert.strictEqual(threw, false, 'convertProviderTrial never throws');
  assert.strictEqual(res.skipped, 'stripe_api_error');
  const audits = sb._tables.admin_audit_log || [];
  assert.strictEqual(audits.length, 1, 'admin_audit_log row inserted');
  assert.strictEqual(audits[0].action, 'trial_conversion_failed');
  assert.strictEqual(audits[0].reason, 'stripe_api_error');
});

await t('onBidAccepted still calls notifyAcceptedProvider on skip', async () => {
  let notified = false;
  const sb = makeSb({ provider_subscriptions: [] });
  await onBidAccepted(sb, {
    bid: { id: 'bid-5', provider_id: 'p_none' },
    callerId: 'member-1', planId: 'plan-1', planTitle: 'Oil Change', bidAmount: 89,
    notifyAcceptedProvider: async () => { notified = true; },
  });
  assert.strictEqual(notified, true, 'notify runs regardless of trial conversion outcome');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
})();

// ============================================================================
// Flow 1 — Stripe Webhook Events
//
// Pure unit tests with in-memory Supabase + Stripe stubs. No live creds.
// Run via: node netlify/functions-tests/stripe-webhook-events.test.js
//
// Covers:
//   - Signature verification (bad sig → 400, missing secret → 500)
//   - checkout.session.completed: bid pack grant + founder commission
//   - checkout.session.completed idempotency (duplicate session_id → skip)
//   - checkout.session.completed: non-bid-pack + unpaid → no-op
//   - payment_intent.succeeded: tip charged→paid, subsidy status transition
//   - payment_intent.payment_failed: tip/subsidy fail + admin email sent
//   - payout.paid / payout.failed / payout.canceled: driver_cashouts state machine
//   - transfer.paid: cashout + tip both marked paid
//   - transfer.failed: cashout marked failed + admin email sent
//   - Unknown event type: silently ignored, still returns 200
//   - DB exception mid-handler: still returns 200 (no Stripe retry storm)
// ============================================================================

'use strict';

const path = require('path');
const Module = require('module');

let testsRun = 0;
let testsFailed = 0;

async function run(name, fn) {
  testsRun++;
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    testsFailed++;
    console.error(`✗ ${name}\n   ${err.stack || err.message}`);
  }
}

function truthy(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }
function eq(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg || 'eq failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ── stub module loader ──────────────────────────────────────────────────────
const origLoad = Module._load;
const stubs = new Map();
let currentSupabase = {};
let currentStripe = {};
stubs.set('@supabase/supabase-js', { createClient: () => currentSupabase });
stubs.set('stripe', () => currentStripe);
Module._load = function(request, parent, ...rest) {
  if (stubs.has(request)) return stubs.get(request);
  return origLoad.call(this, request, parent, ...rest);
};

process.env.SUPABASE_URL              = 'http://stub';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';
process.env.STRIPE_SECRET_KEY         = 'sk_stub';
process.env.STRIPE_WEBHOOK_SECRET     = 'whsec_stub';
process.env.RESEND_API_KEY            = 'resend_stub';
process.env.ADMIN_EMAIL               = 'admin@stub.test';
process.env.MCC_FROM_EMAIL            = 'noreply@stub.test';

let fetchCalls = [];
global.fetch = async (url, opts) => {
  fetchCalls.push({ url, body: opts?.body ? JSON.parse(opts.body) : null });
  return { ok: true };
};

const { handler } = require(path.resolve(__dirname, '../functions/stripe-webhook'));

// ── helpers ──────────────────────────────────────────────────────────────────

function makeRequest(stripeEvent, sig = 'valid_sig') {
  return {
    body: JSON.stringify(stripeEvent),
    headers: { 'stripe-signature': sig },
  };
}

function stripeWith(eventOrFn) {
  return {
    webhooks: {
      constructEvent: typeof eventOrFn === 'function'
        ? eventOrFn
        : () => eventOrFn,
    },
  };
}

function stripeThrows(msg = 'No signatures found') {
  return stripeWith(() => { throw new Error(msg); });
}

function event(type, obj) {
  return { type, data: { object: obj } };
}

// ── Supabase stub ─────────────────────────────────────────────────────────
//
// All chainable Supabase builder methods return the same builder object.
// The builder is thenable so `await builder.update(...).eq(...).in(...)` works
// without needing to call `.select()` or a terminal method.
// `.maybeSingle()` / `.single()` resolve with the first matching row (or null).
// `.insert(row)` stores the row and caches the result for terminal calls.
//
function makeSupabase(opts = {}) {
  const tables = {};
  for (const [k, v] of Object.entries(opts.tables || {})) {
    tables[k] = v.map(r => ({ ...r }));
  }
  const ops = [];

  function from(tableName) {
    const rows = tables[tableName] || (tables[tableName] = []);
    let mode = 'select';
    const filters = [];
    let patch = null;
    let pendingResult = null;

    function applyFilters(src) {
      return src.filter(r => filters.every(fn => fn(r)));
    }

    function settle() {
      if (mode === 'update') {
        const matched = applyFilters(rows);
        for (const r of matched) Object.assign(r, patch);
        ops.push({ op: 'update', table: tableName, patch, count: matched.length });
        return { data: null, error: null };
      }
      if (mode === 'insert') {
        return pendingResult;
      }
      return { data: applyFilters(rows), error: null };
    }

    const b = {
      then(resolve, reject) {
        try { resolve(settle()); } catch (e) { if (reject) reject(e); }
      },
      select() { return b; },
      eq(col, val) { filters.push(r => r[col] === val); return b; },
      in(col, vals) { filters.push(r => vals.includes(r[col])); return b; },
      limit() { return b; },
      order() { return b; },
      async maybeSingle() {
        if (mode === 'insert') return pendingResult;
        return { data: applyFilters(rows)[0] || null, error: null };
      },
      async single() {
        if (mode === 'insert') return pendingResult;
        return { data: applyFilters(rows)[0] || null, error: null };
      },
      insert(row) {
        mode = 'insert';
        const err = (opts.insertErrors || {})[tableName];
        if (err) {
          pendingResult = { data: null, error: err };
        } else {
          rows.push({ ...row, id: rows.length + 1 });
          ops.push({ op: 'insert', table: tableName });
          pendingResult = { data: { id: rows.length }, error: null };
        }
        return b;
      },
      update(p) { mode = 'update'; patch = p; return b; },
    };
    return b;
  }

  return { from, _tables: tables, _ops: ops };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

async function main() {

  // ── Signature & config guards ─────────────────────────────────────────────

  await run('missing STRIPE_SECRET_KEY → 500', async () => {
    const saved = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      currentStripe = stripeThrows('key missing');
      currentSupabase = makeSupabase();
      const res = await handler(makeRequest(event('checkout.session.completed', {})));
      eq(res.statusCode, 500);
    } finally {
      process.env.STRIPE_SECRET_KEY = saved;
    }
  });

  await run('missing STRIPE_WEBHOOK_SECRET → 500', async () => {
    const saved = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    try {
      currentStripe = stripeWith(event('checkout.session.completed', {}));
      currentSupabase = makeSupabase();
      const res = await handler(makeRequest(event('checkout.session.completed', {})));
      eq(res.statusCode, 500);
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = saved;
    }
  });

  await run('bad Stripe signature → 400', async () => {
    currentStripe = stripeThrows('No signatures found matching the expected signature');
    currentSupabase = makeSupabase();
    const res = await handler(makeRequest(event('checkout.session.completed', {}), 'bad_sig'));
    eq(res.statusCode, 400);
    truthy(res.body.includes('Webhook Error'));
  });

  // ── checkout.session.completed: bid pack ──────────────────────────────────

  await run('checkout bid pack: inserts purchase row, increments bid_credits', async () => {
    const session = {
      id: 'cs_test_1',
      payment_intent: 'pi_test_1',
      payment_status: 'paid',
      amount_total: 5000,
      metadata: { provider_id: 'prov-1', bids: '10', bonus_bids: '2', pack_id: 'starter', type: 'bid_pack' },
    };
    currentStripe = stripeWith(event('checkout.session.completed', session));
    currentSupabase = makeSupabase({
      tables: { profiles: [{ id: 'prov-1', bid_credits: 3, referred_by_founder_id: null }] },
    });
    const res = await handler(makeRequest({}));
    eq(res.statusCode, 200);
    eq(currentSupabase._tables.bid_credit_purchases.length, 1, 'purchase row inserted');
    eq(currentSupabase._tables.bid_credit_purchases[0].bids_purchased, 12, '10+2 bids');
    eq(currentSupabase._tables.bid_credit_purchases[0].amount_paid, 50, '$50 in dollars');
    eq(currentSupabase._tables.profiles[0].bid_credits, 15, '3 existing + 12');
  });

  await run('checkout bid pack: idempotency — duplicate session_id skips grant', async () => {
    const session = {
      id: 'cs_test_dup',
      payment_intent: 'pi_test_dup',
      payment_status: 'paid',
      amount_total: 5000,
      metadata: { provider_id: 'prov-1', bids: '10', bonus_bids: '0' },
    };
    currentStripe = stripeWith(event('checkout.session.completed', session));
    currentSupabase = makeSupabase({
      tables: {
        bid_credit_purchases: [{ stripe_session_id: 'cs_test_dup', provider_id: 'prov-1' }],
        profiles: [{ id: 'prov-1', bid_credits: 10 }],
      },
    });
    const res = await handler(makeRequest({}));
    eq(res.statusCode, 200);
    eq(currentSupabase._tables.bid_credit_purchases.length, 1, 'no new row inserted');
    eq(currentSupabase._tables.profiles[0].bid_credits, 10, 'credits unchanged');
  });

  await run('checkout bid pack: no provider_id → no-op', async () => {
    const session = {
      id: 'cs_nop',
      payment_intent: 'pi_nop',
      payment_status: 'paid',
      amount_total: 5000,
      metadata: { bids: '10' },
    };
    currentStripe = stripeWith(event('checkout.session.completed', session));
    currentSupabase = makeSupabase({ tables: { bid_credit_purchases: [] } });
    const res = await handler(makeRequest({}));
    eq(res.statusCode, 200);
    eq(currentSupabase._tables.bid_credit_purchases.length, 0, 'no insert without provider_id');
  });

  await run('checkout bid pack: payment_status=unpaid → no-op', async () => {
    const session = {
      id: 'cs_unpaid',
      payment_intent: 'pi_unpaid',
      payment_status: 'unpaid',
      amount_total: 5000,
      metadata: { provider_id: 'prov-1', bids: '10' },
    };
    currentStripe = stripeWith(event('checkout.session.completed', session));
    currentSupabase = makeSupabase({ tables: { bid_credit_purchases: [] } });
    const res = await handler(makeRequest({}));
    eq(res.statusCode, 200);
    eq(currentSupabase._tables.bid_credit_purchases.length, 0);
  });

  await run('checkout bid pack: non-bid_pack type → no-op', async () => {
    const session = {
      id: 'cs_merch',
      payment_intent: 'pi_merch',
      payment_status: 'paid',
      amount_total: 2000,
      metadata: { provider_id: 'prov-1', bids: '5', type: 'merch_order' },
    };
    currentStripe = stripeWith(event('checkout.session.completed', session));
    currentSupabase = makeSupabase({ tables: { bid_credit_purchases: [] } });
    const res = await handler(makeRequest({}));
    eq(res.statusCode, 200);
    eq(currentSupabase._tables.bid_credit_purchases.length, 0);
  });

  await run('checkout bid pack + founder commission: commission row + balance updated', async () => {
    const session = {
      id: 'cs_founder',
      payment_intent: 'pi_founder_1',
      payment_status: 'paid',
      amount_total: 10000,
      metadata: { provider_id: 'prov-1', bids: '20', bonus_bids: '0' },
    };
    currentStripe = stripeWith(event('checkout.session.completed', session));
    currentSupabase = makeSupabase({
      tables: {
        profiles: [{ id: 'prov-1', bid_credits: 0, referred_by_founder_id: 'founder-user-1' }],
        member_founder_profiles: [{
          id: 'mfp-1',
          user_id: 'founder-user-1',
          commission_rate: '0.10',
          status: 'active',
          total_commissions_earned: 0,
          pending_balance: 0,
        }],
        founder_commissions: [],
      },
    });
    const res = await handler(makeRequest({}));
    eq(res.statusCode, 200);
    eq(currentSupabase._tables.founder_commissions.length, 1, 'commission row created');
    eq(currentSupabase._tables.founder_commissions[0].commission_amount, 10.00, '10% of $100');
    eq(currentSupabase._tables.founder_commissions[0].commission_type, 'bid_pack');
    eq(currentSupabase._tables.member_founder_profiles[0].pending_balance, 10.00);
    eq(currentSupabase._tables.member_founder_profiles[0].total_commissions_earned, 10.00);
  });

  await run('checkout bid pack + founder commission: idempotency — dup source_transaction_id skips', async () => {
    const session = {
      id: 'cs_founder_dup',
      payment_intent: 'pi_already_commisioned',
      payment_status: 'paid',
      amount_total: 10000,
      metadata: { provider_id: 'prov-1', bids: '20', bonus_bids: '0' },
    };
    currentStripe = stripeWith(event('checkout.session.completed', session));
    currentSupabase = makeSupabase({
      tables: {
        profiles: [{ id: 'prov-1', bid_credits: 0, referred_by_founder_id: 'founder-user-1' }],
        member_founder_profiles: [{
          id: 'mfp-1',
          user_id: 'founder-user-1',
          commission_rate: '0.10',
          status: 'active',
          total_commissions_earned: 10,
          pending_balance: 10,
        }],
        founder_commissions: [{ source_transaction_id: 'pi_already_commisioned', founder_id: 'mfp-1' }],
      },
    });
    const res = await handler(makeRequest({}));
    eq(res.statusCode, 200);
    eq(currentSupabase._tables.founder_commissions.length, 1, 'no duplicate commission');
    eq(currentSupabase._tables.member_founder_profiles[0].pending_balance, 10, 'balance unchanged');
  });

  await run('checkout bid pack + founder: inactive founder → no commission', async () => {
    const session = {
      id: 'cs_inactive',
      payment_intent: 'pi_inactive',
      payment_status: 'paid',
      amount_total: 10000,
      metadata: { provider_id: 'prov-1', bids: '20', bonus_bids: '0' },
    };
    currentStripe = stripeWith(event('checkout.session.completed', session));
    currentSupabase = makeSupabase({
      tables: {
        profiles: [{ id: 'prov-1', bid_credits: 0, referred_by_founder_id: 'founder-user-1' }],
        member_founder_profiles: [{
          id: 'mfp-1',
          user_id: 'founder-user-1',
          commission_rate: '0.10',
          status: 'suspended',
          total_commissions_earned: 0,
          pending_balance: 0,
        }],
        founder_commissions: [],
      },
    });
    const res = await handler(makeRequest({}));
    eq(res.statusCode, 200);
    eq(currentSupabase._tables.founder_commissions.length, 0, 'no commission for suspended founder');
  });

  // ── payment_intent.succeeded ───────────────────────────────────────────────

  await run('payment_intent.succeeded: tip charged→paid', async () => {
    const pi = {
      id: 'pi_tip_1',
      metadata: { type: 'tip', ride_id: 'ride-1', driver_id: 'drv-1' },
    };
    currentStripe = stripeWith(event('payment_intent.succeeded', pi));
    currentSupabase = makeSupabase({
      tables: {
        driver_tips: [{ ride_id: 'ride-1', driver_id: 'drv-1', status: 'charged', amount: 500 }],
      },
    });
    const res = await handler(makeRequest({}));
    eq(res.statusCode, 200);
    eq(currentSupabase._tables.driver_tips[0].status, 'paid');
  });

  await run('payment_intent.succeeded: tip in wrong status (not charged) → no update', async () => {
    const pi = {
      id: 'pi_tip_2',
      metadata: { type: 'tip', ride_id: 'ride-2', driver_id: 'drv-2' },
    };
    currentStripe = stripeWith(event('payment_intent.succeeded', pi));
    currentSupabase = makeSupabase({
      tables: {
        driver_tips: [{ ride_id: 'ride-2', driver_id: 'drv-2', status: 'pending', amount: 300 }],
      },
    });
    await handler(makeRequest({}));
    // Filter in handler requires status='charged', so 'pending' row won't match
    eq(currentSupabase._tables.driver_tips[0].status, 'pending');
  });

  await run('payment_intent.succeeded: provider subsidy → rides updated', async () => {
    const pi = {
      id: 'pi_subsidy_1',
      metadata: { type: 'provider_subsidy', ride_id: 'ride-s1' },
    };
    currentStripe = stripeWith(event('payment_intent.succeeded', pi));
    currentSupabase = makeSupabase({
      tables: {
        rides: [{ id: 'ride-s1', provider_subsidy_status: 'pending' }],
      },
    });
    const res = await handler(makeRequest({}));
    eq(res.statusCode, 200);
    eq(currentSupabase._tables.rides[0].provider_subsidy_status, 'charged');
  });

  // ── payment_intent.payment_failed ─────────────────────────────────────────

  await run('payment_intent.payment_failed: tip pending→failed + admin email', async () => {
    fetchCalls = [];
    const pi = {
      id: 'pi_tip_fail',
      amount: 500,
      metadata: { type: 'tip', ride_id: 'ride-3', driver_id: 'drv-3' },
      last_payment_error: { message: 'Card declined' },
    };
    currentStripe = stripeWith(event('payment_intent.payment_failed', pi));
    currentSupabase = makeSupabase({
      tables: {
        driver_tips: [{ ride_id: 'ride-3', driver_id: 'drv-3', status: 'pending', amount: 500 }],
      },
    });
    const res = await handler(makeRequest({}));
    eq(res.statusCode, 200);
    eq(currentSupabase._tables.driver_tips[0].status, 'failed');
    eq(fetchCalls.length, 1, 'admin email sent');
    truthy(fetchCalls[0].body?.subject?.includes('Payment failed'), 'email subject mentions payment failed');
  });

  await run('payment_intent.payment_failed: subsidy → rides failed', async () => {
    fetchCalls = [];
    const pi = {
      id: 'pi_sub_fail',
      amount: 2000,
      metadata: { type: 'provider_subsidy', ride_id: 'ride-s2' },
      last_payment_error: { message: 'Insufficient funds' },
    };
    currentStripe = stripeWith(event('payment_intent.payment_failed', pi));
    currentSupabase = makeSupabase({
      tables: {
        rides: [{ id: 'ride-s2', provider_subsidy_status: 'pending' }],
      },
    });
    const res = await handler(makeRequest({}));
    eq(res.statusCode, 200);
    eq(currentSupabase._tables.rides[0].provider_subsidy_status, 'failed');
    eq(fetchCalls.length, 1, 'admin email sent');
  });

  // ── payout state machine ──────────────────────────────────────────────────

  await run('payout.paid: processing cashout → completed', async () => {
    const payout = { id: 'po_test_1', amount: 15000 };
    currentStripe = stripeWith(event('payout.paid', payout));
    currentSupabase = makeSupabase({
      tables: {
        driver_cashouts: [{ stripe_payout_id: 'po_test_1', status: 'processing', driver_id: 'drv-1' }],
      },
    });
    const res = await handler(makeRequest({}));
    eq(res.statusCode, 200);
    eq(currentSupabase._tables.driver_cashouts[0].status, 'completed');
    truthy(currentSupabase._tables.driver_cashouts[0].completed_at, 'completed_at set');
  });

  await run('payout.paid: pending cashout → completed', async () => {
    const payout = { id: 'po_test_2', amount: 8000 };
    currentStripe = stripeWith(event('payout.paid', payout));
    currentSupabase = makeSupabase({
      tables: {
        driver_cashouts: [{ stripe_payout_id: 'po_test_2', status: 'pending', driver_id: 'drv-2' }],
      },
    });
    await handler(makeRequest({}));
    eq(currentSupabase._tables.driver_cashouts[0].status, 'completed');
  });

  await run('payout.failed: cashout → failed + admin email', async () => {
    fetchCalls = [];
    const payout = { id: 'po_fail_1', amount: 10000, failure_message: 'Account closed' };
    currentStripe = stripeWith(event('payout.failed', payout));
    currentSupabase = makeSupabase({
      tables: {
        driver_cashouts: [{ stripe_payout_id: 'po_fail_1', status: 'processing' }],
      },
    });
    const res = await handler(makeRequest({}));
    eq(res.statusCode, 200);
    eq(currentSupabase._tables.driver_cashouts[0].status, 'failed');
    eq(currentSupabase._tables.driver_cashouts[0].error, 'Account closed');
    eq(fetchCalls.length, 1, 'admin email sent on payout failure');
  });

  await run('payout.canceled: cashout → cancelled', async () => {
    const payout = { id: 'po_cancel_1' };
    currentStripe = stripeWith(event('payout.canceled', payout));
    currentSupabase = makeSupabase({
      tables: {
        driver_cashouts: [{ stripe_payout_id: 'po_cancel_1', status: 'processing' }],
      },
    });
    const res = await handler(makeRequest({}));
    eq(res.statusCode, 200);
    eq(currentSupabase._tables.driver_cashouts[0].status, 'cancelled');
  });

  // ── transfer events ───────────────────────────────────────────────────────

  await run('transfer.paid: cashout processing→paid + tip marked paid', async () => {
    const transfer = { id: 'tr_test_1', amount: 12000 };
    currentStripe = stripeWith(event('transfer.paid', transfer));
    currentSupabase = makeSupabase({
      tables: {
        driver_cashouts: [{ stripe_transfer_id: 'tr_test_1', status: 'processing' }],
        driver_tips: [{ stripe_transfer_id: 'tr_test_1', status: 'charged' }],
      },
    });
    const res = await handler(makeRequest({}));
    eq(res.statusCode, 200);
    eq(currentSupabase._tables.driver_cashouts[0].status, 'paid');
    truthy(currentSupabase._tables.driver_cashouts[0].completed_at, 'completed_at set on cashout');
    eq(currentSupabase._tables.driver_tips[0].status, 'paid');
    eq(currentSupabase._tables.driver_tips[0].stripe_transfer_id, 'tr_test_1');
  });

  await run('transfer.failed: cashout → failed + admin email', async () => {
    fetchCalls = [];
    const transfer = { id: 'tr_fail_1', amount: 9000, failure_message: 'Destination account blocked' };
    currentStripe = stripeWith(event('transfer.failed', transfer));
    currentSupabase = makeSupabase({
      tables: {
        driver_cashouts: [{ stripe_transfer_id: 'tr_fail_1', status: 'processing' }],
      },
    });
    const res = await handler(makeRequest({}));
    eq(res.statusCode, 200);
    eq(currentSupabase._tables.driver_cashouts[0].status, 'failed');
    eq(currentSupabase._tables.driver_cashouts[0].error, 'Destination account blocked');
    eq(fetchCalls.length, 1, 'admin email sent on transfer failure');
  });

  // ── edge cases ─────────────────────────────────────────────────────────────

  await run('unknown event type → silently ignored, returns 200', async () => {
    currentStripe = stripeWith(event('customer.subscription.created', { id: 'sub_1' }));
    currentSupabase = makeSupabase();
    const res = await handler(makeRequest({}));
    eq(res.statusCode, 200);
    const body = JSON.parse(res.body);
    eq(body.received, true);
  });

  await run('DB exception mid-handler → still returns 200 (no Stripe retry storm)', async () => {
    const session = {
      id: 'cs_dberr',
      payment_intent: 'pi_dberr',
      payment_status: 'paid',
      amount_total: 5000,
      metadata: { provider_id: 'prov-1', bids: '10', bonus_bids: '0' },
    };
    currentStripe = stripeWith(event('checkout.session.completed', session));
    // Supabase stub that throws on any call
    currentSupabase = {
      from() { throw new Error('DB connection refused'); },
    };
    const res = await handler(makeRequest({}));
    eq(res.statusCode, 200, 'must return 200 even on DB error — prevents Stripe retry loop');
  });

  // ── report ──────────────────────────────────────────────────────────────────
  console.log(`\n${testsRun - testsFailed}/${testsRun} passed`);
  if (testsFailed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });

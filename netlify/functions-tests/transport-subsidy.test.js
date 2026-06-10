// ============================================================================
// Flow 7 — Provider Subsidy (transport-request.js provider-request + webhook)
//
// Pure unit tests. No live Stripe or Supabase.
// Run via: node netlify/functions-tests/transport-subsidy.test.js
//
// Covers:
//   Request creation side (handleProviderRequest):
//     - 0% subsidy → member pays full fare, no provider PI created
//     - 100% subsidy → member pays $0, provider charged full fare
//     - 50% subsidy → member and provider split evenly
//     - Subsidy on tandem ride: provider charged 50% of 1.5× fare
//     - Provider has no stripe_customer_id → 400 before ride is created
//     - Subsidy PI fails → ride deleted, 402
//
//   Webhook state transition (payment_intent.succeeded):
//     - provider_subsidy type → rides.provider_subsidy_status = 'charged'
//     (This is re-verified here in the context of the full flow for clarity;
//      the exhaustive webhook tests live in stripe-webhook-events.test.js)
//
//   Webhook failure (payment_intent.payment_failed):
//     - provider_subsidy type → rides.provider_subsidy_status = 'failed'
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
function near(actual, expected, tol, msg) {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`${msg || 'near'}: expected ${expected} ±${tol}, got ${actual}`);
  }
}

// ── stub module loader ──────────────────────────────────────────────────────
const origLoad = Module._load;
const stubs = new Map();
let currentSupabase = {};
let currentStripe = {};
// transport-request.js uses getStripe() → require('stripe')(key, opts)
stubs.set('@supabase/supabase-js', { createClient: () => currentSupabase });
stubs.set('stripe', () => currentStripe);
// stripe-webhook.js also requires stripe — same stub is fine since both use factory pattern
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

global.fetch = async () => ({ ok: true });

const transportHandler = require(path.resolve(__dirname, '../functions/transport-request')).handler;
const webhookHandler   = require(path.resolve(__dirname, '../functions/stripe-webhook')).handler;

// ── Supabase builder ──────────────────────────────────────────────────────

function makeSupabase(opts = {}) {
  const user = opts.user !== undefined ? opts.user : { id: 'prov-user-1' };
  const tables = {};
  for (const [k, v] of Object.entries(opts.tables || {})) tables[k] = v.map(r => ({ ...r }));

  const deletedIds = [];

  function from(tableName) {
    const rows = tables[tableName] || (tables[tableName] = []);
    const filters = [];
    let mode = 'select';
    let patch = null;
    let pendingResult = null;

    function applyFilters(src) { return src.filter(r => filters.every(fn => fn(r))); }

    function settle() {
      if (mode === 'update') {
        const matched = applyFilters(rows);
        for (const r of matched) Object.assign(r, patch);
        return { data: null, error: null };
      }
      if (mode === 'insert') return pendingResult;
      if (mode === 'delete') {
        const toDelete = applyFilters(rows).map(r => r.id);
        toDelete.forEach(id => deletedIds.push(id));
        const keep = rows.filter(r => !toDelete.includes(r.id));
        rows.length = 0; rows.push(...keep);
        return { data: null, error: null };
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
        const newRow = { ...row, id: `${tableName}-${rows.length + 1}` };
        rows.push(newRow);
        pendingResult = { data: newRow, error: null };
        return b;
      },
      update(p) { mode = 'update'; patch = p; return b; },
      delete() { mode = 'delete'; return b; },
    };
    return b;
  }

  return {
    auth: {
      async getUser() {
        if (!user) return { data: { user: null }, error: { message: 'invalid' } };
        return { data: { user }, error: null };
      },
    },
    from,
    _tables: tables,
    _deletedIds: deletedIds,
  };
}

function makeStripe(opts = {}) {
  let piAmountCharged = null;
  const stripe = {
    customers: {
      async retrieve() {
        if (opts.customerError) throw opts.customerError;
        return { invoice_settings: { default_payment_method: opts.defaultPM || 'pm_prov_1' } };
      },
    },
    paymentIntents: {
      async create(params) {
        if (opts.piError) throw opts.piError;
        piAmountCharged = params.amount;
        return { id: 'pi_subsidy_' + Date.now(), status: 'succeeded' };
      },
    },
    _getPiAmount: () => piAmountCharged,
  };
  return stripe;
}

function makeWebhookStripe(eventObj) {
  return {
    webhooks: { constructEvent: () => eventObj },
  };
}

function providerRequest(overrides = {}) {
  return {
    httpMethod: 'POST',
    path: '/api/transport/provider-request',
    headers: { authorization: 'Bearer tok_provider' },
    body: JSON.stringify({
      member_id: 'member-1',
      pickup_address: '100 Main St',
      dropoff_address: '200 Oak Ave',
      estimated_distance_miles: 3,
      is_asap: true,
      subsidy_pct: 0,
      ...overrides,
    }),
  };
}

function webhookEvent(type, obj) {
  return {
    body: '{}',
    headers: { 'stripe-signature': 'valid_sig' },
    _eventObj: { type, data: { object: obj } },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

async function main() {

  // ── Subsidy request creation ──────────────────────────────────────────────

  await run('0% subsidy: member pays full fare, no provider PI created', async () => {
    const stripe = makeStripe();
    currentStripe = stripe;
    const sb = makeSupabase({
      tables: {
        profiles: [{ id: 'prov-user-1', role: 'provider', stripe_customer_id: null }],
      },
    });
    currentSupabase = sb;
    const res = await transportHandler(providerRequest({ subsidy_pct: 0 }));
    eq(res.statusCode, 201);
    const ride = sb._tables.rides[0];
    // estimateFare(3, false) = $35
    near(ride.estimated_fare, 35, 0.01);
    eq(ride.base_rate, 35, 'member pays full $35');
    eq(ride.provider_discount_amount, 0, 'provider contributes $0');
    eq(stripe._getPiAmount(), null, 'no Stripe PI created for 0% subsidy');
  });

  await run('100% subsidy: member pays $0, provider charged full fare', async () => {
    const stripe = makeStripe();
    currentStripe = stripe;
    const sb = makeSupabase({
      tables: {
        profiles: [{ id: 'prov-user-1', role: 'provider', stripe_customer_id: 'cus_prov_1' }],
      },
    });
    currentSupabase = sb;
    const res = await transportHandler(providerRequest({ subsidy_pct: 100, estimated_distance_miles: 3 }));
    eq(res.statusCode, 201);
    const ride = sb._tables.rides[0];
    eq(ride.base_rate, 0, 'member pays $0');
    near(ride.provider_discount_amount, 35, 0.01, 'provider covers all $35');
    // Provider charged $35 = 3500 cents
    eq(stripe._getPiAmount(), 3500, 'provider PI charged 100% of fare');
  });

  await run('50% subsidy: member and provider split evenly', async () => {
    const stripe = makeStripe();
    currentStripe = stripe;
    const sb = makeSupabase({
      tables: {
        profiles: [{ id: 'prov-user-1', role: 'provider', stripe_customer_id: 'cus_prov_1' }],
      },
    });
    currentSupabase = sb;
    const res = await transportHandler(providerRequest({ subsidy_pct: 50, estimated_distance_miles: 3 }));
    eq(res.statusCode, 201);
    const ride = sb._tables.rides[0];
    near(ride.base_rate, 17.5, 0.01, 'member pays $17.50');
    near(ride.provider_discount_amount, 17.5, 0.01, 'provider pays $17.50');
    eq(stripe._getPiAmount(), 1750, 'provider PI = $17.50 = 1750 cents');
  });

  await run('subsidy on tandem (paired) ride: provider charged 50% of 1.5× fare', async () => {
    const stripe = makeStripe();
    currentStripe = stripe;
    const sb = makeSupabase({
      tables: {
        profiles: [{ id: 'prov-user-1', role: 'provider', stripe_customer_id: 'cus_prov_1' }],
      },
    });
    currentSupabase = sb;
    // tandem fare for 3 mi = $35 × 1.5 = $52.50; 50% subsidy → provider pays $26.25
    const res = await transportHandler(providerRequest({ subsidy_pct: 50, estimated_distance_miles: 3, is_tandem: true }));
    eq(res.statusCode, 201);
    near(stripe._getPiAmount(), 2625, 1, 'provider PI = $26.25 for tandem');
  });

  await run('provider has no stripe_customer_id → 400, ride NOT created', async () => {
    const stripe = makeStripe();
    currentStripe = stripe;
    const sb = makeSupabase({
      tables: {
        profiles: [{ id: 'prov-user-1', role: 'provider', stripe_customer_id: null }],
      },
    });
    currentSupabase = sb;
    const res = await transportHandler(providerRequest({ subsidy_pct: 50 }));
    eq(res.statusCode, 400);
    eq(sb._tables.rides?.length || 0, 0, 'no ride created when provider has no payment method');
  });

  await run('subsidy PI fails → ride deleted, 402', async () => {
    const stripe = makeStripe({ piError: new Error('Insufficient funds') });
    currentStripe = stripe;
    const sb = makeSupabase({
      tables: {
        profiles: [{ id: 'prov-user-1', role: 'provider', stripe_customer_id: 'cus_prov_1' }],
      },
    });
    currentSupabase = sb;
    const res = await transportHandler(providerRequest({ subsidy_pct: 100 }));
    eq(res.statusCode, 402);
    eq(sb._deletedIds.length, 1, 'ride must be deleted when subsidy charge fails');
  });

  // ── Webhook subsidy state transitions ─────────────────────────────────────
  // These re-verify the subsidy webhook path in the context of the full flow.
  // Exhaustive webhook tests live in stripe-webhook-events.test.js.

  await run('webhook payment_intent.succeeded: provider_subsidy → rides.provider_subsidy_status = charged', async () => {
    const pi = {
      id: 'pi_sub_webhook',
      metadata: { type: 'provider_subsidy', ride_id: 'ride-wh-1' },
    };
    currentStripe = makeWebhookStripe({ type: 'payment_intent.succeeded', data: { object: pi } });
    const sb = makeSupabase({
      tables: {
        rides: [{ id: 'ride-wh-1', provider_subsidy_status: 'pending' }],
      },
    });
    currentSupabase = sb;
    const res = await webhookHandler(webhookEvent('payment_intent.succeeded', pi));
    eq(res.statusCode, 200);
    eq(sb._tables.rides[0].provider_subsidy_status, 'charged');
  });

  await run('webhook payment_intent.payment_failed: provider_subsidy → rides.provider_subsidy_status = failed', async () => {
    const pi = {
      id: 'pi_sub_fail',
      amount: 3500,
      metadata: { type: 'provider_subsidy', ride_id: 'ride-wh-2' },
      last_payment_error: { message: 'Card declined' },
    };
    currentStripe = makeWebhookStripe({ type: 'payment_intent.payment_failed', data: { object: pi } });
    const sb = makeSupabase({
      tables: {
        rides: [{ id: 'ride-wh-2', provider_subsidy_status: 'pending' }],
      },
    });
    currentSupabase = sb;
    const res = await webhookHandler(webhookEvent('payment_intent.payment_failed', pi));
    eq(res.statusCode, 200);
    eq(sb._tables.rides[0].provider_subsidy_status, 'failed');
  });

  console.log(`\n${testsRun - testsFailed}/${testsRun} passed`);
  if (testsFailed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });

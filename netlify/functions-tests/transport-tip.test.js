// ============================================================================
// Flow 6 — Tip Flow (transport-request.js POST /api/transport/tip)
//
// Pure unit tests. No live Stripe or Supabase.
// Run via: node netlify/functions-tests/transport-tip.test.js
//
// Covers:
//   - Happy path: driver_tips row inserted + PI charged → status=charged, 201
//   - Tip amount bounds: < 50¢ → 400; > $100 → 400
//   - Not the member's ride → 403
//   - Member has no stripe_customer_id → 400
//   - Customer retrieval fails → 400
//   - No default payment method on customer → 400
//   - Stripe PI creation fails → tip status=failed, 402 (ride not affected)
//   - Tip row inserted before charge so there's a record even if charge fails
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

const { handler } = require(path.resolve(__dirname, '../functions/transport-request'));

// ── Supabase builder ──────────────────────────────────────────────────────

function makeSupabase(opts = {}) {
  const user = opts.user !== undefined ? opts.user : { id: 'user-1' };
  const tables = {};
  for (const [k, v] of Object.entries(opts.tables || {})) tables[k] = v.map(r => ({ ...r }));

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
      return { data: applyFilters(rows), error: null };
    }

    const b = {
      then(resolve, reject) {
        try { resolve(settle()); } catch (e) { if (reject) reject(e); }
      },
      select() { return b; },
      eq(col, val) { filters.push(r => r[col] === val); return b; },
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
        const err = opts.insertErrors && opts.insertErrors[tableName];
        if (err) {
          pendingResult = { data: null, error: err };
        } else {
          const newRow = { ...row, id: `${tableName}-${rows.length + 1}` };
          rows.push(newRow);
          pendingResult = { data: newRow, error: null };
        }
        return b;
      },
      update(p) { mode = 'update'; patch = p; return b; },
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
  };
}

function makeStripe(opts = {}) {
  return {
    customers: {
      async retrieve(id) {
        if (opts.customerError) throw opts.customerError;
        return { invoice_settings: { default_payment_method: opts.defaultPM || 'pm_tip_1' } };
      },
    },
    paymentIntents: {
      async create(params) {
        if (opts.piError) throw opts.piError;
        return { id: 'pi_tip_created', status: 'succeeded' };
      },
    },
  };
}

function tipRequest(body = {}) {
  return {
    httpMethod: 'POST',
    path: '/api/transport/tip',
    headers: { authorization: 'Bearer tok_member' },
    body: JSON.stringify({
      ride_id: 'ride-1',
      driver_id: 'drv-1',
      amount_cents: 500,
      ...body,
    }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

async function main() {

  await run('happy path: tip row inserted, PI charged → status=charged, 201', async () => {
    currentStripe = makeStripe();
    const sb = makeSupabase({
      tables: {
        rides: [{ id: 'ride-1', member_id: 'user-1' }],
        profiles: [{ id: 'user-1', stripe_customer_id: 'cus_1' }],
      },
    });
    currentSupabase = sb;
    const res = await handler(tipRequest());
    eq(res.statusCode, 201);
    const body = JSON.parse(res.body);
    eq(body.tipped, true);
    // Tip row should exist and be marked charged
    eq(sb._tables.driver_tips.length, 1, 'tip row created');
    eq(sb._tables.driver_tips[0].status, 'charged');
    eq(sb._tables.driver_tips[0].amount, 5.00, '500 cents → $5.00');
  });

  await run('tip amount too small (< 50¢) → 400', async () => {
    currentStripe = makeStripe();
    currentSupabase = makeSupabase({
      tables: {
        rides: [{ id: 'ride-1', member_id: 'user-1' }],
        profiles: [{ id: 'user-1', stripe_customer_id: 'cus_1' }],
      },
    });
    const res = await handler(tipRequest({ amount_cents: 25 }));
    eq(res.statusCode, 400);
    truthy(JSON.parse(res.body).error?.includes('$0.50'));
  });

  await run('tip amount too large (> $100) → 400', async () => {
    currentStripe = makeStripe();
    currentSupabase = makeSupabase({
      tables: {
        rides: [{ id: 'ride-1', member_id: 'user-1' }],
        profiles: [{ id: 'user-1', stripe_customer_id: 'cus_1' }],
      },
    });
    const res = await handler(tipRequest({ amount_cents: 10001 }));
    eq(res.statusCode, 400);
    truthy(JSON.parse(res.body).error?.includes('$100'));
  });

  await run('not member\'s ride → 403', async () => {
    currentStripe = makeStripe();
    currentSupabase = makeSupabase({
      tables: {
        rides: [{ id: 'ride-1', member_id: 'other-user' }],
        profiles: [{ id: 'user-1', stripe_customer_id: 'cus_1' }],
      },
    });
    const res = await handler(tipRequest());
    eq(res.statusCode, 403);
  });

  await run('no stripe_customer_id on member → 400', async () => {
    currentStripe = makeStripe();
    currentSupabase = makeSupabase({
      tables: {
        rides: [{ id: 'ride-1', member_id: 'user-1' }],
        profiles: [{ id: 'user-1', stripe_customer_id: null }],
      },
    });
    const res = await handler(tipRequest());
    eq(res.statusCode, 400);
    truthy(JSON.parse(res.body).error?.toLowerCase().includes('payment method'));
  });

  await run('customer retrieval fails → 400', async () => {
    currentStripe = makeStripe({ customerError: new Error('No such customer') });
    currentSupabase = makeSupabase({
      tables: {
        rides: [{ id: 'ride-1', member_id: 'user-1' }],
        profiles: [{ id: 'user-1', stripe_customer_id: 'cus_bad' }],
      },
    });
    const res = await handler(tipRequest());
    eq(res.statusCode, 400);
    truthy(JSON.parse(res.body).error?.toLowerCase().includes('payment method'));
  });

  await run('no default PM on customer → 400', async () => {
    currentStripe = makeStripe({ defaultPM: null });
    currentSupabase = makeSupabase({
      tables: {
        rides: [{ id: 'ride-1', member_id: 'user-1' }],
        profiles: [{ id: 'user-1', stripe_customer_id: 'cus_1' }],
      },
    });
    // Override customer retrieve to return null default_payment_method
    currentStripe.customers = {
      async retrieve() { return { invoice_settings: { default_payment_method: null } }; },
    };
    const res = await handler(tipRequest());
    eq(res.statusCode, 400);
  });

  await run('Stripe PI fails → tip row created (record exists), status=failed, 402', async () => {
    const piErr = new Error('Card declined');
    currentStripe = makeStripe({ piError: piErr });
    const sb = makeSupabase({
      tables: {
        rides: [{ id: 'ride-1', member_id: 'user-1' }],
        profiles: [{ id: 'user-1', stripe_customer_id: 'cus_1' }],
      },
    });
    currentSupabase = sb;
    const res = await handler(tipRequest());
    eq(res.statusCode, 402);
    truthy(JSON.parse(res.body).error?.includes('Payment failed'));
    // Tip row must exist — it was inserted before the charge attempt
    eq(sb._tables.driver_tips.length, 1, 'tip row must exist even after charge failure');
    eq(sb._tables.driver_tips[0].status, 'failed', 'tip status = failed (not removed)');
  });

  console.log(`\n${testsRun - testsFailed}/${testsRun} passed`);
  if (testsFailed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });

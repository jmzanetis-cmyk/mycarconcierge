// ============================================================================
// Flow 3 — Transport Fare + Payment Authorization (transport-request.js)
//
// Pure unit tests. No live Stripe or Supabase.
// Run via: node netlify/functions-tests/transport-fare-payment.test.js
//
// Covers:
//   - Fare tiers: $35 / $50 / $65 / $80 / $100 / $4/mi (>25 mi)
//   - Tandem (paired vehicle) adds 50% to base fare
//   - provider_covers=true → memberRate=0, no Stripe PI created
//   - Unverified vehicle registration → 403
//   - Identity not verified → 403
//   - name_match_score < 80 → status = pending_name_review, PI still created
//   - No saved payment method → 400, ride deleted
//   - Stripe PI creation fails → 402, ride deleted
//   - Provider request: 50% subsidy charges provider half
//   - Provider request: include_return=true → return leg inserted
//   - Provider request: subsidy charge fails → 402, ride deleted
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
function near(actual, expected, tolerance, msg) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${msg || 'near failed'}: expected ${expected} ±${tolerance}, got ${actual}`);
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
  // opts.user              — auth user (default: { id: 'user-1' })
  // opts.tables            — { tableName: [rows] }
  // opts.insertResults     — { tableName: { data, error } } override per table
  // opts.piCreateError     — error to throw from stripe.paymentIntents.create

  const user = opts.user !== undefined ? opts.user : { id: 'user-1' };
  const tables = {};
  for (const [k, v] of Object.entries(opts.tables || {})) tables[k] = v.map(r => ({ ...r }));

  const ops = [];
  const deletedRideIds = [];

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
        ops.push({ op: 'update', table: tableName, patch, count: matched.length });
        return { data: null, error: null };
      }
      if (mode === 'insert') return pendingResult;
      if (mode === 'delete') {
        const toDelete = applyFilters(rows).map(r => r.id);
        toDelete.forEach(id => deletedRideIds.push(id));
        const keep = rows.filter(r => !toDelete.includes(r.id));
        rows.length = 0; rows.push(...keep);
        ops.push({ op: 'delete', table: tableName, count: toDelete.length });
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
      not(col, op, val) {
        if (op === 'is') filters.push(r => r[col] != null);
        return b;
      },
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
        const override = opts.insertResults && opts.insertResults[tableName];
        if (override) {
          pendingResult = override;
        } else {
          const newRow = { ...row, id: `${tableName}-${rows.length + 1}` };
          rows.push(newRow);
          ops.push({ op: 'insert', table: tableName });
          pendingResult = { data: newRow, error: null };
        }
        return b;
      },
      update(p) { mode = 'update'; patch = p; return b; },
      delete() { mode = 'delete'; return b; },
    };
    return b;
  }

  return {
    auth: {
      async getUser(token) {
        if (!user) return { data: { user: null }, error: { message: 'invalid' } };
        return { data: { user }, error: null };
      },
    },
    from,
    _tables: tables,
    _ops: ops,
    _deletedRideIds: deletedRideIds,
  };
}

// Default member profile: identity verified, has Stripe customer
function memberProfile(overrides = {}) {
  return {
    id: 'user-1',
    identity_verified: true,
    stripe_customer_id: 'cus_member_1',
    ...overrides,
  };
}

// Default vehicle: verified, no registration_verification
function vehicle(overrides = {}) {
  return {
    id: 'veh-1',
    owner_id: 'user-1',
    registration_verified: true,
    registration_verification_id: null,
    make: 'Toyota', model: 'Camry', year: 2020, color: 'Blue', license_plate: 'ABC123',
    ...overrides,
  };
}

function makeStripe(opts = {}) {
  return {
    customers: {
      async retrieve(id) {
        if (opts.customerRetrieveError) throw opts.customerRetrieveError;
        return { invoice_settings: { default_payment_method: opts.defaultPM || 'pm_test_1' } };
      },
    },
    paymentMethods: {
      async list() { return { data: opts.defaultPM ? [{ id: opts.defaultPM }] : [] }; },
    },
    paymentIntents: {
      async create(params) {
        if (opts.piCreateError) throw opts.piCreateError;
        return { id: 'pi_test_' + Date.now(), status: 'requires_capture', ...params };
      },
    },
  };
}

function memberRequest(overrides = {}) {
  return {
    httpMethod: 'POST',
    path: '/api/transport',
    headers: { authorization: 'Bearer tok_member' },
    body: JSON.stringify({
      pickup_address: '100 Main St',
      dropoff_address: '200 Oak Ave',
      vehicle_id: 'veh-1',
      estimated_distance_miles: 3,
      is_asap: true,
      ...overrides,
    }),
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
      ...overrides,
    }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Fare tiers (tested through member request with identity verified, no vehicle check for simplicity)
// ═══════════════════════════════════════════════════════════════════════════

async function main() {

  // ── Fare tiers ────────────────────────────────────────────────────────────

  const fareTierCases = [
    [2,   false, 35,   '0-5 mi solo → $35'],
    [3,   true,  52.5, '0-5 mi tandem → $52.50'],
    [7,   false, 50,   '5-10 mi solo → $50'],
    [12,  false, 65,   '10-15 mi solo → $65'],
    [17,  false, 80,   '15-20 mi solo → $80'],
    [22,  false, 100,  '20-25 mi solo → $100'],
    [26,  false, 104,  '>25 mi → $4/mi × 26 = $104'],
  ];

  for (const [miles, tandem, expectedFare, label] of fareTierCases) {
    await run(`fare tier: ${label}`, async () => {
      currentStripe = makeStripe();
      const sb = makeSupabase({
        tables: {
          vehicles: [vehicle()],
          profiles: [memberProfile()],
        },
      });
      currentSupabase = sb;
      const res = await handler(memberRequest({ estimated_distance_miles: miles, is_tandem: tandem }));
      eq(res.statusCode, 201);
      const body = JSON.parse(res.body);
      // ride row stores estimated_fare
      const insertedRide = sb._tables.rides[0];
      near(insertedRide.estimated_fare, expectedFare, 0.01, label);
    });
  }

  // ── Member request guards ─────────────────────────────────────────────────

  await run('unverified vehicle registration → 403', async () => {
    currentStripe = makeStripe();
    currentSupabase = makeSupabase({
      tables: {
        vehicles: [vehicle({ registration_verified: false })],
        profiles: [memberProfile()],
      },
    });
    const res = await handler(memberRequest());
    eq(res.statusCode, 403);
    const body = JSON.parse(res.body);
    eq(body.code, 'REGISTRATION_REQUIRED');
  });

  await run('identity not verified → 403', async () => {
    currentStripe = makeStripe();
    currentSupabase = makeSupabase({
      tables: {
        vehicles: [vehicle()],
        profiles: [memberProfile({ identity_verified: false })],
      },
    });
    const res = await handler(memberRequest());
    eq(res.statusCode, 403);
    const body = JSON.parse(res.body);
    eq(body.code, 'IDENTITY_REQUIRED');
  });

  await run('low name_match_score (<80) → status=pending_name_review', async () => {
    currentStripe = makeStripe();
    currentSupabase = makeSupabase({
      tables: {
        vehicles: [vehicle({ registration_verification_id: 'rv-1' })],
        registration_verifications: [{ id: 'rv-1', name_match_score: 65 }],
        profiles: [memberProfile()],
      },
    });
    const res = await handler(memberRequest());
    eq(res.statusCode, 201);
    const body = JSON.parse(res.body);
    eq(body.status, 'pending_name_review');
    eq(body.pending_review, true);
  });

  await run('provider_covers=true → memberRate=0, no Stripe PI created', async () => {
    let piCreated = false;
    currentStripe = {
      customers: {
        async retrieve() { return { invoice_settings: { default_payment_method: 'pm_1' } }; },
      },
      paymentMethods: { async list() { return { data: [] }; } },
      paymentIntents: {
        async create() { piCreated = true; return { id: 'pi_never' }; },
      },
    };
    const sb = makeSupabase({
      tables: {
        vehicles: [vehicle()],
        profiles: [memberProfile()],
      },
    });
    currentSupabase = sb;
    const res = await handler(memberRequest({ provider_covers: true }));
    eq(res.statusCode, 201);
    eq(piCreated, false, 'Stripe PI must NOT be created when provider covers 100%');
    eq(sb._tables.rides[0].base_rate, 0, 'memberRate stored as 0');
  });

  await run('no saved payment method → 400, ride deleted', async () => {
    currentStripe = {
      customers: {
        async retrieve() { return { invoice_settings: { default_payment_method: null } }; },
      },
      paymentMethods: { async list() { return { data: [] }; } },
      paymentIntents: { async create() { return { id: 'pi_1' }; } },
    };
    const sb = makeSupabase({
      tables: {
        vehicles: [vehicle()],
        profiles: [memberProfile()],
      },
    });
    currentSupabase = sb;
    const res = await handler(memberRequest());
    eq(res.statusCode, 400);
    eq(sb._deletedRideIds.length, 1, 'ride must be deleted when no payment method');
  });

  await run('Stripe PI create fails → 402, ride deleted', async () => {
    const err = new Error('Your card has insufficient funds');
    err.code = 'card_declined';
    currentStripe = makeStripe({ piCreateError: err });
    const sb = makeSupabase({
      tables: {
        vehicles: [vehicle()],
        profiles: [memberProfile()],
      },
    });
    currentSupabase = sb;
    const res = await handler(memberRequest());
    eq(res.statusCode, 402);
    eq(sb._deletedRideIds.length, 1, 'ride must be deleted when PI creation fails');
  });

  // ── Provider request ──────────────────────────────────────────────────────

  await run('provider request: 50% subsidy → memberPays=half, providerPays=half', async () => {
    let piAmount = null;
    currentStripe = {
      customers: {
        async retrieve() { return { invoice_settings: { default_payment_method: 'pm_prov_1' } }; },
      },
      paymentIntents: {
        async create(params) { piAmount = params.amount; return { id: 'pi_subsidy' }; },
      },
    };
    const sb = makeSupabase({
      user: { id: 'prov-user-1' },
      tables: {
        profiles: [
          { id: 'prov-user-1', role: 'provider', stripe_customer_id: 'cus_prov_1' },
        ],
      },
    });
    currentSupabase = sb;
    const res = await handler(providerRequest({ subsidy_pct: 50, estimated_distance_miles: 3 }));
    eq(res.statusCode, 201);
    // estimateFare(3, false) = $35; 50% subsidy → providerPays = $17.50 = 1750 cents
    eq(piAmount, 1750, 'provider charged 50% of $35 = $17.50 (1750 cents)');
    eq(sb._tables.rides[0].base_rate, 17.5, 'member pays half');
    eq(sb._tables.rides[0].provider_discount_amount, 17.5, 'provider covers half');
  });

  await run('provider request: include_return=true → return leg inserted', async () => {
    currentStripe = makeStripe();
    const sb = makeSupabase({
      user: { id: 'prov-user-1' },
      tables: {
        profiles: [{ id: 'prov-user-1', role: 'provider', stripe_customer_id: null }],
      },
    });
    currentSupabase = sb;
    const res = await handler(providerRequest({ include_return: true, subsidy_pct: 0 }));
    eq(res.statusCode, 201);
    // should have 2 rides: outbound + return leg
    eq(sb._tables.rides.length, 2, 'return leg must be auto-created');
    eq(sb._tables.rides[1].status, 'awaiting_vehicle_ready', 'return leg starts awaiting vehicle ready');
    eq(sb._tables.rides[1].is_round_trip, true);
  });

  await run('provider request: subsidy PI fails → 402, ride deleted', async () => {
    const err = new Error('Insufficient funds');
    currentStripe = {
      customers: {
        async retrieve() { return { invoice_settings: { default_payment_method: 'pm_prov_1' } }; },
      },
      paymentIntents: { async create() { throw err; } },
    };
    const sb = makeSupabase({
      user: { id: 'prov-user-1' },
      tables: {
        profiles: [{ id: 'prov-user-1', role: 'provider', stripe_customer_id: 'cus_prov_1' }],
      },
    });
    currentSupabase = sb;
    const res = await handler(providerRequest({ subsidy_pct: 100, estimated_distance_miles: 3 }));
    eq(res.statusCode, 402);
    eq(sb._deletedRideIds.length, 1, 'ride must be deleted when subsidy charge fails');
  });

  console.log(`\n${testsRun - testsFailed}/${testsRun} passed`);
  if (testsFailed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });

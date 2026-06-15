// ============================================================================
// wallet-member.test.js
//
// Covers:
//   1) 404 when FEATURE_WALLET not enabled
//   2) 401 without auth token
//   3) GET /balance 200 — no wallet row returns zero defaults
//   4) GET /balance 200 — existing wallet row returns balances
//   5) POST /load 400 — missing amount_cents
//   6) POST /load 400 — missing payment_method_id
//   7) POST /load 402 — Stripe charge fails
//   8) POST /load 200 — happy path, no bonus (< $25)
//   9) POST /load 200 — happy path, 10% bonus (>= $25)
// ============================================================================
'use strict';

const assert = require('assert');
const path   = require('path');

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TOKEN   = 'valid-token';
const PM_ID   = 'pm_test_valid';

process.env.SUPABASE_URL              = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-key';
process.env.STRIPE_SECRET_KEY         = 'sk_test_stub';

let _stub      = null;
let _stripeStub = null;

// Stub @supabase/supabase-js at both root and functions-local paths
const supabasePaths = new Set([
  require.resolve('@supabase/supabase-js'),
  require.resolve('@supabase/supabase-js', { paths: [path.join(__dirname, '..', 'functions')] }),
]);
for (const sp of supabasePaths) {
  require.cache[sp] = {
    id: sp, filename: sp, loaded: true,
    exports: { createClient: () => _stub },
  };
}

// Stub stripe
try {
  const stripePath = require.resolve('stripe', { paths: [path.join(__dirname, '..', 'functions')] });
  require.cache[stripePath] = {
    id: stripePath, filename: stripePath, loaded: true,
    exports: () => _stripeStub,
  };
} catch (_) {}

const handler = require('../functions/wallet-member').handler;

function makeStub({ walletRow = null, stripeError = null, piStatus = 'succeeded', rpcError = null } = {}) {
  const PI_ID = 'pi_test_001';
  _stripeStub = {
    customers: {
      create: async () => ({ id: 'cus_test' }),
    },
    paymentIntents: {
      create: async () => {
        if (stripeError) throw new Error(stripeError);
        return { id: PI_ID, status: piStatus };
      },
    },
  };

  _stub = {
    _table: null,
    from(t) { return Object.assign(Object.create(this), { _table: t }); },
    select() { return this; },
    eq()     { return this; },
    single()  {
      if (this._table === 'profiles') {
        return Promise.resolve({ data: { stripe_customer_id: null, email: 'test@example.com' }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    maybeSingle() {
      if (this._table === 'wallet_accounts') {
        return Promise.resolve({ data: walletRow, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    update() { return { eq: () => Promise.resolve({ error: null }) }; },
    rpc(name) {
      if (name === 'wallet_load') {
        if (rpcError) return Promise.resolve({ data: null, error: { message: rpcError } });
        return Promise.resolve({
          data: [{ cash_balance_cents: 500, bonus_balance_cents: 0 }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
    auth: {
      getUser(token) {
        if (token === TOKEN) return Promise.resolve({ data: { user: { id: USER_ID } }, error: null });
        return Promise.resolve({ data: { user: null }, error: { message: 'invalid' } });
      },
    },
  };
}

function event({ method = 'GET', token, subpath = 'balance', body = null } = {}) {
  return {
    httpMethod: method,
    path: `/api/wallet/${subpath}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    queryStringParameters: {},
    body: body ? JSON.stringify(body) : null,
  };
}

function parse(res) { try { return JSON.parse(res.body); } catch { return null; } }

async function run() {
  let passed = 0, failed = 0;
  const failures = [];
  function ok(label)        { passed++; console.log('  ok  ' + label); }
  function fail(label, err) {
    failed++;
    failures.push(`${label}: ${err?.message ?? String(err)}`);
    console.log('  FAIL ' + label + ' — ' + (err?.message ?? err));
  }

  // 1) FEATURE_WALLET off → 404
  delete process.env.FEATURE_WALLET;
  makeStub();
  try {
    const res = await handler(event({ token: TOKEN }));
    assert.strictEqual(res.statusCode, 404, `expected 404 got ${res.statusCode}`);
    ok('404 when FEATURE_WALLET not enabled');
  } catch (e) { fail('404 flag off', e); }

  process.env.FEATURE_WALLET = 'true';

  // 2) No auth → 401
  makeStub();
  try {
    const res = await handler(event({ token: null }));
    assert.strictEqual(res.statusCode, 401, `expected 401 got ${res.statusCode}`);
    ok('401 without auth token');
  } catch (e) { fail('401 no auth', e); }

  // 3) GET /balance — no wallet row → 200 with zero defaults
  makeStub({ walletRow: null });
  try {
    const res = await handler(event({ token: TOKEN }));
    assert.strictEqual(res.statusCode, 200, `expected 200 got ${res.statusCode} body=${res.body}`);
    const body = parse(res);
    assert.strictEqual(body.cash_balance_cents, 0);
    assert.strictEqual(body.bonus_balance_cents, 0);
    assert.strictEqual(body.total_cents, 0);
    ok('GET /balance 200 zero defaults when no wallet row');
  } catch (e) { fail('GET balance zero defaults', e); }

  // 4) GET /balance — existing wallet row → 200 with balances
  makeStub({
    walletRow: {
      cash_balance_cents: 1000, bonus_balance_cents: 250,
      auto_reload_enabled: false, auto_reload_threshold_cents: null, auto_reload_amount_cents: null,
    },
  });
  try {
    const res = await handler(event({ token: TOKEN }));
    assert.strictEqual(res.statusCode, 200, `expected 200 got ${res.statusCode}`);
    const body = parse(res);
    assert.strictEqual(body.cash_balance_cents, 1000);
    assert.strictEqual(body.bonus_balance_cents, 250);
    assert.strictEqual(body.total_cents, 1250);
    ok('GET /balance 200 returns correct balances from wallet row');
  } catch (e) { fail('GET balance with row', e); }

  // 5) POST /load — missing amount_cents → 400
  makeStub();
  try {
    const res = await handler(event({ method: 'POST', token: TOKEN, subpath: 'load', body: { payment_method_id: PM_ID } }));
    assert.strictEqual(res.statusCode, 400, `expected 400 got ${res.statusCode}`);
    ok('POST /load 400 missing amount_cents');
  } catch (e) { fail('POST load 400 no amount', e); }

  // 6) POST /load — missing payment_method_id → 400
  makeStub();
  try {
    const res = await handler(event({ method: 'POST', token: TOKEN, subpath: 'load', body: { amount_cents: 500 } }));
    assert.strictEqual(res.statusCode, 400, `expected 400 got ${res.statusCode}`);
    ok('POST /load 400 missing payment_method_id');
  } catch (e) { fail('POST load 400 no pm', e); }

  // 7) POST /load — Stripe error → 402
  makeStub({ stripeError: 'Card declined' });
  try {
    const res = await handler(event({ method: 'POST', token: TOKEN, subpath: 'load', body: { amount_cents: 500, payment_method_id: PM_ID } }));
    assert.strictEqual(res.statusCode, 402, `expected 402 got ${res.statusCode}`);
    ok('POST /load 402 when Stripe charge fails');
  } catch (e) { fail('POST load 402 stripe error', e); }

  // 8) POST /load — happy path, < $25 → no bonus
  makeStub();
  try {
    const res = await handler(event({ method: 'POST', token: TOKEN, subpath: 'load', body: { amount_cents: 1000, payment_method_id: PM_ID } }));
    assert.strictEqual(res.statusCode, 200, `expected 200 got ${res.statusCode} body=${res.body}`);
    const body = parse(res);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.cash_loaded_cents, 1000);
    assert.strictEqual(body.bonus_granted_cents, 0, 'no bonus below $25 threshold');
    ok('POST /load 200 happy path under $25 — no bonus');
  } catch (e) { fail('POST load 200 no bonus', e); }

  // 9) POST /load — happy path, >= $25 → 10% bonus
  makeStub();
  try {
    const res = await handler(event({ method: 'POST', token: TOKEN, subpath: 'load', body: { amount_cents: 2500, payment_method_id: PM_ID } }));
    assert.strictEqual(res.statusCode, 200, `expected 200 got ${res.statusCode} body=${res.body}`);
    const body = parse(res);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.cash_loaded_cents, 2500);
    assert.strictEqual(body.bonus_granted_cents, 250, '10% of $25 = $2.50 bonus');
    ok('POST /load 200 happy path at $25 threshold — 10% bonus granted');
  } catch (e) { fail('POST load 200 with bonus', e); }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
}

run().catch(err => { console.error('Test runner crashed:', err); process.exit(1); });

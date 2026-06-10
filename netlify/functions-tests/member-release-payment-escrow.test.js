// ============================================================================
// Flow 2 — Escrow Release (member-release-payment.js)
//
// Pure unit tests. No live Stripe or Supabase.
// Run via: node netlify/functions-tests/member-release-payment-escrow.test.js
//
// Covers:
//   - Auth guard (missing token → 401)
//   - Payment not found → 404
//   - Forbidden — payment belongs to another member → 403
//   - Already-released idempotency → 200 + already_released: true
//   - Legacy payment (no Stripe PI) → RPC only, stripe_captured: false
//   - Happy path: Stripe capture + RPC → 200 + stripe_captured: true
//   - Stripe capture error (non-recoverable) → 402
//   - Stripe payment_intent_unexpected_state (already captured) → still marks released
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

const { handler } = require(path.resolve(__dirname, '../functions/member-release-payment'));

// ── Supabase stub ─────────────────────────────────────────────────────────

function makeSupabase(opts = {}) {
  // opts.user          — { id } returned from auth.getUser (null → auth error)
  // opts.payments      — rows in payments table
  // opts.rpcError      — error returned from rpc() (null → success)
  // opts.captureResult — override stripe PI capture result

  const user = opts.user !== undefined ? opts.user : { id: 'user-1' };
  const payments = opts.payments || [];
  const ops = [];

  function from(tableName) {
    const rows = tableName === 'payments' ? payments : [];
    const filters = [];

    function applyFilters(src) {
      return src.filter(r => filters.every(fn => fn(r)));
    }

    const b = {
      then(resolve) { resolve({ data: applyFilters(rows), error: null }); },
      select() { return b; },
      eq(col, val) { filters.push(r => r[col] === val); return b; },
      limit() { return b; },
      async maybeSingle() {
        const found = applyFilters(rows);
        return { data: found[0] || null, error: null };
      },
      async single() {
        const found = applyFilters(rows);
        return { data: found[0] || null, error: null };
      },
    };
    return b;
  }

  const rpcCalls = [];
  async function rpc(name, args) {
    rpcCalls.push({ name, args });
    return { data: null, error: opts.rpcError || null };
  }

  return {
    auth: {
      async getUser(token) {
        if (!user) return { data: { user: null }, error: { message: 'invalid token' } };
        return { data: { user }, error: null };
      },
    },
    from,
    rpc,
    _ops: ops,
    _rpcCalls: rpcCalls,
  };
}

function makeStripe(captureResult = null) {
  return {
    paymentIntents: {
      async capture(piId) {
        if (captureResult instanceof Error) throw captureResult;
        return captureResult || { id: piId, status: 'succeeded' };
      },
    },
  };
}

function makeRequest(packageId = 'pkg-1', token = 'tok_member') {
  return {
    httpMethod: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ packageId }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

async function main() {

  await run('missing auth token → 401', async () => {
    currentStripe = makeStripe();
    currentSupabase = makeSupabase();
    const res = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ packageId: 'pkg-1' }) });
    eq(res.statusCode, 401);
  });

  await run('invalid token → 401', async () => {
    currentStripe = makeStripe();
    currentSupabase = makeSupabase({ user: null });
    const res = await handler(makeRequest());
    eq(res.statusCode, 401);
  });

  await run('payment not found → 404', async () => {
    currentStripe = makeStripe();
    currentSupabase = makeSupabase({ payments: [] });
    const res = await handler(makeRequest('pkg-missing'));
    eq(res.statusCode, 404);
  });

  await run('wrong member → 403', async () => {
    currentStripe = makeStripe();
    currentSupabase = makeSupabase({
      user: { id: 'user-intruder' },
      payments: [{ package_id: 'pkg-1', member_id: 'user-1', stripe_payment_intent_id: 'pi_1', status: 'authorized' }],
    });
    const res = await handler(makeRequest('pkg-1'));
    eq(res.statusCode, 403);
  });

  await run('already released → 200 + already_released: true, no Stripe call', async () => {
    let captureCallCount = 0;
    currentStripe = {
      paymentIntents: {
        async capture() { captureCallCount++; return {}; },
      },
    };
    currentSupabase = makeSupabase({
      payments: [{ package_id: 'pkg-1', member_id: 'user-1', stripe_payment_intent_id: 'pi_1', status: 'released' }],
    });
    const res = await handler(makeRequest('pkg-1'));
    eq(res.statusCode, 200);
    const body = JSON.parse(res.body);
    eq(body.already_released, true);
    eq(captureCallCount, 0, 'Stripe capture must NOT be called when already released');
  });

  await run('legacy payment (no Stripe PI) → RPC only, stripe_captured: false', async () => {
    currentStripe = makeStripe();
    const sb = makeSupabase({
      payments: [{ package_id: 'pkg-1', member_id: 'user-1', stripe_payment_intent_id: null, stripe_payment_intent: null, stripe_payment_id: null, status: 'authorized' }],
    });
    currentSupabase = sb;
    const res = await handler(makeRequest('pkg-1'));
    eq(res.statusCode, 200);
    const body = JSON.parse(res.body);
    eq(body.stripe_captured, false);
    eq(sb._rpcCalls.length, 1, 'RPC must be called for legacy payment');
    eq(sb._rpcCalls[0].name, 'member_release_payment');
  });

  await run('happy path: Stripe capture + RPC → stripe_captured: true', async () => {
    currentStripe = makeStripe();
    const sb = makeSupabase({
      payments: [{ package_id: 'pkg-1', member_id: 'user-1', stripe_payment_intent_id: 'pi_abc', status: 'authorized' }],
    });
    currentSupabase = sb;
    const res = await handler(makeRequest('pkg-1'));
    eq(res.statusCode, 200);
    const body = JSON.parse(res.body);
    eq(body.stripe_captured, true);
    eq(sb._rpcCalls.length, 1);
    eq(sb._rpcCalls[0].args.p_package_id, 'pkg-1');
  });

  await run('Stripe capture fails (card error) → 402, RPC not called', async () => {
    const err = Object.assign(new Error('Your card was declined'), { code: 'card_declined' });
    currentStripe = makeStripe(err);
    const sb = makeSupabase({
      payments: [{ package_id: 'pkg-1', member_id: 'user-1', stripe_payment_intent_id: 'pi_bad', status: 'authorized' }],
    });
    currentSupabase = sb;
    const res = await handler(makeRequest('pkg-1'));
    eq(res.statusCode, 402);
    eq(sb._rpcCalls.length, 0, 'RPC must not be called when Stripe capture fails');
  });

  await run('Stripe payment_intent_unexpected_state (already captured) → marks released anyway', async () => {
    // This fires when the webhook already captured the PI before the member clicked release.
    const alreadyCapturedErr = Object.assign(new Error('Cannot capture a payment intent that is already captured'), { code: 'payment_intent_unexpected_state' });
    currentStripe = makeStripe(alreadyCapturedErr);
    const sb = makeSupabase({
      payments: [{ package_id: 'pkg-1', member_id: 'user-1', stripe_payment_intent_id: 'pi_already', status: 'authorized' }],
    });
    currentSupabase = sb;
    const res = await handler(makeRequest('pkg-1'));
    eq(res.statusCode, 200);
    const body = JSON.parse(res.body);
    eq(body.stripe_captured, true);
    eq(sb._rpcCalls.length, 1, 'RPC must still be called even when capture returned unexpected_state');
  });

  console.log(`\n${testsRun - testsFailed}/${testsRun} passed`);
  if (testsFailed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });

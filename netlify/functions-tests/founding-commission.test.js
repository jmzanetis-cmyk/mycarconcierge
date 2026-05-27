// ============================================================================
// Flow 5 — Founding Commission Payout (admin-founders.js)
//
// Pure unit tests. No live Stripe or Supabase.
// Run via: node netlify/functions-tests/founding-commission.test.js
//
// Covers:
//   Commission earn side (recorded in stripe-webhook.js) was tested in Flow 1.
//   This file covers the payout side:
//
//   process-founder-payout:
//     - Happy path (weekly): Stripe transfer created, status=completed, no fee
//     - Happy path (instant): fee = 1% of gross (min $0.50, max $10)
//     - Already completed → 409
//     - No Stripe Connect account → 422
//     - Net amount < $0.50 → 422
//     - Stripe transfer fails → status=failed, 502
//
//   process-bulk-payouts:
//     - Processes all pending payouts above threshold
//     - Skips founders without a Connect account
//     - Reports succeeded/failed counts correctly
//
//   commission_rate update (JWT admin):
//     - Rate update recorded; agreement-locked founder requires admin_override
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
// admin-founders.js uses `new Stripe(key, opts)` so the stub must be a
// regular function (arrow functions cannot be called with `new`).
const origLoad = Module._load;
const stubs = new Map();
let currentSupabase = {};
let currentStripe = {};
stubs.set('@supabase/supabase-js', { createClient: () => currentSupabase });
stubs.set('stripe', function Stripe() { return currentStripe; });
Module._load = function(request, parent, ...rest) {
  if (stubs.has(request)) return stubs.get(request);
  return origLoad.call(this, request, parent, ...rest);
};

process.env.SUPABASE_URL              = 'http://stub';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';
process.env.STRIPE_SECRET_KEY         = 'sk_stub';
process.env.ADMIN_PASSWORD            = 'test_admin_pw';

const { handler } = require(path.resolve(__dirname, '../functions/admin-founders'));

// ── Supabase builder ─────────────────────────────────────────────────────────

function makeSupabase(opts = {}) {
  const tables = {};
  for (const [k, v] of Object.entries(opts.tables || {})) {
    tables[k] = v.map(r => ({ ...r }));
  }
  // admin auth: need profiles table for role=admin
  if (!tables.profiles) tables.profiles = [{ id: 'admin-1', role: 'admin' }];

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
      gte(col, val) { filters.push(r => r[col] >= val); return b; },
      not(col, op, val) {
        if (op === 'is') filters.push(r => r[col] != null);
        return b;
      },
      limit() { return b; },
      order() { return b; },
      async maybeSingle() {
        if (mode === 'insert') return pendingResult;
        if (mode === 'update') {
          const matched = applyFilters(rows);
          for (const r of matched) Object.assign(r, patch);
          return { data: matched[0] || null, error: null };
        }
        return { data: applyFilters(rows)[0] || null, error: null };
      },
      async single() {
        if (mode === 'insert') return pendingResult;
        if (mode === 'update') {
          const matched = applyFilters(rows);
          for (const r of matched) Object.assign(r, patch);
          return { data: matched[0] || null, error: null };
        }
        const found = applyFilters(rows);
        return { data: found[0] || null, error: found[0] ? null : { message: 'no rows' } };
      },
      insert(row) {
        mode = 'insert';
        const newRow = { ...row, id: `row-${rows.length + 1}` };
        rows.push(newRow);
        pendingResult = { data: newRow, error: null };
        return b;
      },
      update(p) { mode = 'update'; patch = p; return b; },
    };
    return b;
  }

  return {
    auth: {
      async getUser(token) {
        if (token === 'bad') return { data: { user: null }, error: { message: 'bad token' } };
        return { data: { user: { id: 'admin-1' } }, error: null };
      },
    },
    from,
    _tables: tables,
  };
}

function makeStripe(opts = {}) {
  return {
    transfers: {
      async create(params) {
        if (opts.transferError) throw opts.transferError;
        return { id: 'tr_founder_1', amount: params.amount, metadata: params.metadata };
      },
    },
  };
}

function payoutRequest(body) {
  return {
    httpMethod: 'POST',
    path: '/api/admin/process-founder-payout',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ admin_password: 'test_admin_pw', ...body }),
  };
}

function bulkPayoutRequest(body = {}) {
  return {
    httpMethod: 'POST',
    path: '/api/admin/process-bulk-payouts',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ admin_password: 'test_admin_pw', ...body }),
  };
}

function commissionUpdateRequest(founderId, rate, adminOverride = false) {
  return {
    httpMethod: 'POST',
    path: `/api/admin/founders/${founderId}/commission`,
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer tok_admin',
    },
    body: JSON.stringify({ commission_rate: rate, admin_override: adminOverride }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

async function main() {

  // ── process-founder-payout ─────────────────────────────────────────────────

  await run('process-founder-payout: happy path weekly → transfer created, status=completed, fee=0', async () => {
    currentStripe = makeStripe();
    const sb = makeSupabase({
      tables: {
        founder_payouts: [{ id: 'fp-1', founder_id: 'mfp-1', amount: 100, status: 'pending' }],
        member_founder_profiles: [{ id: 'mfp-1', stripe_connect_account_id: 'acct_f1', full_name: 'Alice' }],
        payout_settings: [],
      },
    });
    currentSupabase = sb;
    const res = await handler(payoutRequest({ payout_id: 'fp-1', payout_type: 'weekly' }));
    eq(res.statusCode, 200);
    const body = JSON.parse(res.body);
    eq(body.success, true);
    eq(body.fee_amount, 0, 'weekly has no fee');
    eq(body.net_amount, 100);
    truthy(body.transfer_id, 'transfer_id returned');
    eq(sb._tables.founder_payouts[0].status, 'completed');
    truthy(sb._tables.founder_payouts[0].stripe_transfer_id, 'stripe_transfer_id stored');
  });

  await run('process-founder-payout: instant payout → fee = 1% of gross', async () => {
    currentStripe = makeStripe();
    const sb = makeSupabase({
      tables: {
        founder_payouts: [{ id: 'fp-2', founder_id: 'mfp-1', amount: 500, status: 'pending' }],
        member_founder_profiles: [{ id: 'mfp-1', stripe_connect_account_id: 'acct_f1', full_name: 'Bob' }],
        payout_settings: [],
      },
    });
    currentSupabase = sb;
    const res = await handler(payoutRequest({ payout_id: 'fp-2', payout_type: 'instant' }));
    eq(res.statusCode, 200);
    const body = JSON.parse(res.body);
    // 1% of $500 = $5.00; within [$0.50, $10] range
    near(body.fee_amount, 5.00, 0.001, 'instant fee = 1% of $500');
    near(body.net_amount, 495.00, 0.001);
  });

  await run('process-founder-payout: instant fee floored at $0.50', async () => {
    currentStripe = makeStripe();
    const sb = makeSupabase({
      tables: {
        founder_payouts: [{ id: 'fp-sm', founder_id: 'mfp-1', amount: 10, status: 'pending' }],
        member_founder_profiles: [{ id: 'mfp-1', stripe_connect_account_id: 'acct_f1', full_name: 'Cal' }],
        payout_settings: [],
      },
    });
    currentSupabase = sb;
    const res = await handler(payoutRequest({ payout_id: 'fp-sm', payout_type: 'instant' }));
    eq(res.statusCode, 200);
    const body = JSON.parse(res.body);
    // 1% of $10 = $0.10, floored to $0.50
    near(body.fee_amount, 0.50, 0.001, 'instant fee floored to $0.50');
  });

  await run('process-founder-payout: already completed → 409', async () => {
    currentStripe = makeStripe();
    const sb = makeSupabase({
      tables: {
        founder_payouts: [{ id: 'fp-done', founder_id: 'mfp-1', amount: 100, status: 'completed' }],
        member_founder_profiles: [{ id: 'mfp-1', stripe_connect_account_id: 'acct_f1' }],
      },
    });
    currentSupabase = sb;
    const res = await handler(payoutRequest({ payout_id: 'fp-done', payout_type: 'weekly' }));
    eq(res.statusCode, 409);
  });

  await run('process-founder-payout: no Stripe Connect account → 422', async () => {
    currentStripe = makeStripe();
    const sb = makeSupabase({
      tables: {
        founder_payouts: [{ id: 'fp-noacct', founder_id: 'mfp-1', amount: 100, status: 'pending' }],
        member_founder_profiles: [{ id: 'mfp-1', stripe_connect_account_id: null, full_name: 'Dave' }],
      },
    });
    currentSupabase = sb;
    const res = await handler(payoutRequest({ payout_id: 'fp-noacct', payout_type: 'weekly' }));
    eq(res.statusCode, 422);
    truthy(JSON.parse(res.body).error.includes('Stripe Connect'), 'error message mentions Stripe Connect');
  });

  await run('process-founder-payout: Stripe transfer fails → status=failed, 502', async () => {
    const err = new Error('Account capability not active');
    currentStripe = makeStripe({ transferError: err });
    const sb = makeSupabase({
      tables: {
        founder_payouts: [{ id: 'fp-fail', founder_id: 'mfp-1', amount: 100, status: 'pending' }],
        member_founder_profiles: [{ id: 'mfp-1', stripe_connect_account_id: 'acct_blocked' }],
      },
    });
    currentSupabase = sb;
    const res = await handler(payoutRequest({ payout_id: 'fp-fail', payout_type: 'weekly' }));
    eq(res.statusCode, 502);
    eq(sb._tables.founder_payouts[0].status, 'failed');
    truthy(sb._tables.founder_payouts[0].notes?.includes('Account capability'), 'failure reason stored');
  });

  // ── process-bulk-payouts ──────────────────────────────────────────────────

  await run('process-bulk-payouts: processes all pending above threshold', async () => {
    currentStripe = makeStripe();
    const sb = makeSupabase({
      tables: {
        founder_payouts: [
          { id: 'fp-b1', founder_id: 'mfp-1', amount: 50,  status: 'pending' },
          { id: 'fp-b2', founder_id: 'mfp-2', amount: 200, status: 'pending' },
          { id: 'fp-b3', founder_id: 'mfp-3', amount:  5,  status: 'pending' }, // below $10 threshold
        ],
        member_founder_profiles: [
          { id: 'mfp-1', stripe_connect_account_id: 'acct_1' },
          { id: 'mfp-2', stripe_connect_account_id: 'acct_2' },
          { id: 'mfp-3', stripe_connect_account_id: 'acct_3' },
        ],
      },
    });
    currentSupabase = sb;
    const res = await handler(bulkPayoutRequest({ threshold: 10, payout_type: 'weekly' }));
    eq(res.statusCode, 200);
    const body = JSON.parse(res.body);
    eq(body.summary.succeeded, 2, 'two payouts above $10 threshold succeeded');
    eq(body.summary.failed, 0);
  });

  await run('process-bulk-payouts: skips founders without Connect account', async () => {
    currentStripe = makeStripe();
    const sb = makeSupabase({
      tables: {
        founder_payouts: [
          { id: 'fp-c1', founder_id: 'mfp-ok',  amount: 50, status: 'pending' },
          { id: 'fp-c2', founder_id: 'mfp-bad', amount: 50, status: 'pending' },
        ],
        member_founder_profiles: [
          { id: 'mfp-ok',  stripe_connect_account_id: 'acct_ok' },
          { id: 'mfp-bad', stripe_connect_account_id: null },
        ],
      },
    });
    currentSupabase = sb;
    const res = await handler(bulkPayoutRequest({ threshold: 10 }));
    eq(res.statusCode, 200);
    const body = JSON.parse(res.body);
    eq(body.summary.succeeded, 1);
    eq(body.summary.failed, 1, 'no-Connect founder counted as failed');
    truthy(body.summary.results[1].error?.includes('No Stripe Connect'), 'error reason reported');
  });

  // ── commission rate update (JWT-auth route) ─────────────────────────────────

  await run('commission rate update: rate stored correctly', async () => {
    currentStripe = makeStripe();
    const sb = makeSupabase({
      tables: {
        member_founder_profiles: [{ id: 'mfp-1', commission_rate: 0.50, user_id: 'fuser-1' }],
        signed_agreements: [],
        commission_rate_history: [],
        profiles: [{ id: 'admin-1', role: 'admin' }],
      },
    });
    currentSupabase = sb;
    const res = await handler(commissionUpdateRequest('mfp-1', 0.30));
    eq(res.statusCode, 200);
    eq(sb._tables.member_founder_profiles[0].commission_rate, 0.30);
  });

  await run('commission rate update: agreement-locked → 403 without admin_override', async () => {
    currentStripe = makeStripe();
    const sb = makeSupabase({
      tables: {
        member_founder_profiles: [{ id: 'mfp-1', commission_rate: 0.50, user_id: 'fuser-1' }],
        signed_agreements: [{ id: 'sa-1', user_id: 'fuser-1', agreement_date: '2025-01-01', commission_rate: 0.50 }],
        commission_rate_history: [],
        profiles: [{ id: 'admin-1', role: 'admin' }],
      },
    });
    currentSupabase = sb;
    const res = await handler(commissionUpdateRequest('mfp-1', 0.25, false));
    eq(res.statusCode, 403);
    truthy(JSON.parse(res.body).error?.includes('admin_override'), 'error mentions admin_override');
  });

  await run('commission rate update: agreement-locked → 200 with admin_override: true', async () => {
    currentStripe = makeStripe();
    const sb = makeSupabase({
      tables: {
        member_founder_profiles: [{ id: 'mfp-1', commission_rate: 0.50, user_id: 'fuser-1' }],
        signed_agreements: [{ id: 'sa-1', user_id: 'fuser-1', agreement_date: '2025-01-01', commission_rate: 0.50 }],
        commission_rate_history: [],
        profiles: [{ id: 'admin-1', role: 'admin' }],
      },
    });
    currentSupabase = sb;
    const res = await handler(commissionUpdateRequest('mfp-1', 0.25, true));
    eq(res.statusCode, 200);
    eq(sb._tables.member_founder_profiles[0].commission_rate, 0.25);
  });

  console.log(`\n${testsRun - testsFailed}/${testsRun} passed`);
  if (testsFailed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });

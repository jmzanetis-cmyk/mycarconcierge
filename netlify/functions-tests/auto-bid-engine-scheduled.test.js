// ============================================================================
// auto-bid-engine-scheduled.test.js
//
// Covers the three post-refactor paths for the eligibility + credit-consuming
// rewrite of auto-bid-engine-scheduled.js:
//
//   (A) eligible + credited provider → place_plan_bid RPC called with the
//       correct params; post-RPC is_auto_bid marker UPDATE fires
//   (B) zero-credit provider (P0001 from RPC) → provider added to run-scoped
//       low-balance set and skipped on the next plan in the same run;
//       exactly one `auto_bid_out_of_credits` notification inserted
//   (C) unverified / suspended provider → RPC never called, no notification
//   (D) low-balance dedupe: an unread prior `auto_bid_out_of_credits`
//       notification suppresses a fresh insert on the next hourly tick
//
// Run with:  node netlify/functions-tests/auto-bid-engine-scheduled.test.js
// Exits non-zero on the first assertion failure.
// ============================================================================
'use strict';

const assert = require('assert');
const path   = require('node:path');

process.env.SUPABASE_URL              = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';

// Per-test state, mutated at the top of each case. The stub reads from
// this via a closure so we don't have to re-stub createClient each time.
let currentState = null;

function makeSupabaseStub() {
  const chain = {};
  const s = () => currentState;
  let op = null;

  chain.from = (table) => {
    op = { table, method: null, filters: [], insertPayload: null, updatePayload: null, limitN: null };
    return chain;
  };
  chain.select  = () => { op.method = op.method || 'select'; return chain; };
  chain.insert  = (payload) => {
    op.method = 'insert';
    op.insertPayload = payload;
    s().insertsByTable[op.table] = s().insertsByTable[op.table] || [];
    s().insertsByTable[op.table].push(payload);
    return chain;
  };
  chain.update  = (payload) => {
    op.method = 'update';
    op.updatePayload = payload;
    s().updatesByTable[op.table] = s().updatesByTable[op.table] || [];
    s().updatesByTable[op.table].push(payload);
    return chain;
  };
  chain.eq      = (col, val)      => { op.filters.push(['eq', col, val]); return chain; };
  chain.in      = (col, val)      => { op.filters.push(['in', col, val]); return chain; };
  chain.gt      = (col, val)      => { op.filters.push(['gt', col, val]); return chain; };
  chain.not     = (col, oper, val) => { op.filters.push(['not', col, oper, val]); return chain; };
  chain.is      = (col, val)      => { op.filters.push(['is', col, val]); return chain; };
  chain.order   = ()              => chain;
  chain.limit   = (n)             => { op.limitN = n; return chain; };

  const resolveOp = () => {
    const t = op.table;
    if (op.method === 'insert') {
      const insertFail = s().insertFailure?.[t];
      if (insertFail) return { data: null, error: insertFail };
      return { data: op.insertPayload, error: null };
    }
    if (op.method === 'update') {
      const updateFail = s().updateFailure?.[t];
      if (updateFail) return { data: null, error: updateFail };
      return { data: null, error: null };
    }
    // select
    if (t === 'care_plans')                 return { data: s().plans        || [], error: null };
    if (t === 'provider_auto_bid_settings') return { data: s().settings     || [], error: null };
    if (t === 'profiles')                   return { data: s().profiles     || [], error: null };
    if (t === 'plan_bids')                  return { data: s().existingBids || [], error: null };
    if (t === 'notifications')              return { data: s().existingNotification || null, error: null };
    return { data: null, error: null };
  };

  // Thenable: `await sb.from(...).select(...).eq(...)` awaits the chain directly.
  chain.then        = (resolve, reject) => Promise.resolve(resolveOp()).then(resolve, reject);
  chain.maybeSingle = ()                 => Promise.resolve(resolveOp());
  chain.single      = ()                 => Promise.resolve(resolveOp());

  chain.rpc = (name, params) => {
    s().rpcCalls = s().rpcCalls || [];
    s().rpcCalls.push({ name, params });
    const rpcRes = s().rpcResponses?.[name];
    if (rpcRes) return Promise.resolve(rpcRes);
    // Default: success. Matches the shape place_plan_bid returns.
    return Promise.resolve({
      data:  [{ bid_id: 'stub-bid-id', consumed_source: 'free_trial', remaining_free: 2, remaining_credits: 0 }],
      error: null,
    });
  };

  return chain;
}

// Stub @supabase/supabase-js at require time so the engine's createClient
// call returns our stub. Two paths cover the root + nested function deps.
const supabasePaths = new Set([
  require.resolve('@supabase/supabase-js'),
  require.resolve('@supabase/supabase-js', { paths: [path.join(__dirname, '..', 'functions')] })
]);
for (const sp of supabasePaths) {
  require.cache[sp] = {
    id: sp, filename: sp, loaded: true,
    exports: { createClient: () => makeSupabaseStub() }
  };
}

const handler = require('../functions/auto-bid-engine-scheduled').handler;

function freshState() {
  return {
    plans:                [],
    settings:             [],
    profiles:             [],
    existingBids:         [],
    existingNotification: null,
    rpcResponses:         {},
    rpcCalls:             [],
    insertsByTable:       {},
    updatesByTable:       {},
    insertFailure:        {},
    updateFailure:        {},
  };
}

async function run() {
  let passed = 0, failed = 0;
  const failures = [];
  function ok(label)         { passed++; console.log('  ok  ' + label); }
  function fail(label, err)  { failed++; failures.push(label + ': ' + err.message); console.log('  FAIL ' + label + ' — ' + err.message); }

  // ── (A) Eligible + credited provider ─────────────────────────────────────
  try {
    currentState = freshState();
    currentState.plans = [{
      id: 'plan-A', service_types: ['brakes'], value_min: 100, value_max: 200,
      city: 'Newark', state: 'NJ',
    }];
    currentState.settings = [{
      provider_id: 'prov-eligible', max_bid_percent: 85,
      max_distance_miles: 25, service_categories: [],
    }];
    currentState.profiles = [{
      id: 'prov-eligible', role: 'provider',
      verification_status: 'verified', suspended_at: null,
    }];
    // Default RPC response is success (see makeSupabaseStub)

    const res = await handler();
    const body = JSON.parse(res.body);

    // RPC called exactly once with the correct params
    assert.strictEqual(currentState.rpcCalls.length, 1,
      `expected 1 RPC call, got ${currentState.rpcCalls.length}`);
    const call = currentState.rpcCalls[0];
    assert.strictEqual(call.name, 'place_plan_bid');
    assert.strictEqual(call.params.p_provider_id, 'prov-eligible');
    assert.strictEqual(call.params.p_care_plan_id, 'plan-A');
    assert.strictEqual(call.params.p_amount, 85);  // 100 * 0.85
    assert.match(call.params.p_note, /Auto-bid at 85%/);

    // Post-RPC UPDATE marks is_auto_bid=true on the freshly-inserted plan_bids row
    assert.ok(currentState.updatesByTable.plan_bids, 'expected plan_bids update');
    assert.strictEqual(currentState.updatesByTable.plan_bids.length, 1);
    assert.deepStrictEqual(currentState.updatesByTable.plan_bids[0], { is_auto_bid: true });

    // No notification for the happy path
    assert.strictEqual(currentState.insertsByTable.notifications, undefined,
      'expected no notification insert for eligible+credited provider');

    // Response counters
    assert.strictEqual(body.placed, 1);
    assert.strictEqual(body.low_balance_providers, 0);
    assert.strictEqual(body.low_balance_notified,  0);

    ok('(A) eligible+credited: RPC called; is_auto_bid update fires; no notification');
  } catch (e) { fail('(A) eligible+credited', e); }

  // ── (B) Zero-credit provider (P0001 from RPC) ────────────────────────────
  try {
    currentState = freshState();
    // Two plans to prove single-notification-per-run + no repeat RPC after P0001
    currentState.plans = [
      { id: 'plan-B1', service_types: ['brakes'], value_min: 100 },
      { id: 'plan-B2', service_types: ['brakes'], value_min: 200 },
    ];
    currentState.settings = [{
      provider_id: 'prov-nocredit', max_bid_percent: 85,
      max_distance_miles: 25, service_categories: [],
    }];
    currentState.profiles = [{
      id: 'prov-nocredit', role: 'provider',
      verification_status: 'verified', suspended_at: null,
    }];
    currentState.rpcResponses.place_plan_bid = {
      data:  null,
      error: { code: 'P0001', message: 'no_credits_available' },
    };

    const res = await handler();
    const body = JSON.parse(res.body);

    // RPC tried on plan-B1, then provider added to lowBalanceProviders and
    // short-circuited on plan-B2. Exactly ONE RPC call.
    assert.strictEqual(currentState.rpcCalls.length, 1,
      `expected 1 RPC call (P0001 short-circuits further attempts), got ${currentState.rpcCalls.length}`);

    // Exactly ONE notification insert with the right shape
    assert.ok(currentState.insertsByTable.notifications, 'expected 1 notification insert');
    assert.strictEqual(currentState.insertsByTable.notifications.length, 1);
    const notif = currentState.insertsByTable.notifications[0];
    assert.strictEqual(notif.user_id, 'prov-nocredit');
    assert.strictEqual(notif.type, 'auto_bid_out_of_credits');
    assert.match(notif.title, /Auto-bid paused/);
    assert.match(notif.message, /no bid credits left/);
    assert.strictEqual(notif.metadata.source, 'auto-bid-engine-scheduled');

    // No plan_bids UPDATE (RPC failed → no bid to mark)
    assert.strictEqual(currentState.updatesByTable.plan_bids, undefined,
      'expected no plan_bids update for zero-credit provider');

    // Response counters
    assert.strictEqual(body.placed, 0);
    assert.strictEqual(body.low_balance_providers, 1);
    assert.strictEqual(body.low_balance_notified,  1);

    ok('(B) zero-credit: 1 RPC call, 1 notification, provider skipped on 2nd plan');
  } catch (e) { fail('(B) zero-credit', e); }

  // ── (C1) Unverified provider ─────────────────────────────────────────────
  try {
    currentState = freshState();
    currentState.plans = [{ id: 'plan-C1', service_types: ['brakes'], value_min: 100 }];
    currentState.settings = [{
      provider_id: 'prov-unverified', max_bid_percent: 85,
      max_distance_miles: 25, service_categories: [],
    }];
    currentState.profiles = [{
      id: 'prov-unverified', role: 'provider',
      verification_status: 'pending',           // ← NOT 'verified'
      suspended_at: null,
    }];

    const res = await handler();
    const body = JSON.parse(res.body);

    assert.strictEqual(currentState.rpcCalls.length, 0,
      'expected NO RPC call for unverified provider');
    assert.strictEqual(currentState.insertsByTable.notifications, undefined,
      'expected NO notification for unverified provider');
    assert.strictEqual(body.placed, 0);
    assert.strictEqual(body.low_balance_providers, 0);

    ok('(C1) verification_status="pending" → no bid, no notification');
  } catch (e) { fail('(C1) unverified', e); }

  // ── (C2) Suspended provider ──────────────────────────────────────────────
  try {
    currentState = freshState();
    currentState.plans = [{ id: 'plan-C2', service_types: ['brakes'], value_min: 100 }];
    currentState.settings = [{
      provider_id: 'prov-suspended', max_bid_percent: 85,
      max_distance_miles: 25, service_categories: [],
    }];
    currentState.profiles = [{
      id: 'prov-suspended', role: 'provider',
      verification_status: 'verified',
      suspended_at: '2026-05-01T00:00:00Z',      // ← suspended
    }];

    const res = await handler();
    const body = JSON.parse(res.body);

    assert.strictEqual(currentState.rpcCalls.length, 0,
      'expected NO RPC call for suspended provider');
    assert.strictEqual(currentState.insertsByTable.notifications, undefined);
    assert.strictEqual(body.placed, 0);

    ok('(C2) suspended_at != null → no bid, no notification');
  } catch (e) { fail('(C2) suspended', e); }

  // ── (D) Dedupe: existing unread notification suppresses fresh insert ─────
  try {
    currentState = freshState();
    currentState.plans = [{ id: 'plan-D', service_types: ['brakes'], value_min: 100 }];
    currentState.settings = [{
      provider_id: 'prov-dedupe', max_bid_percent: 85,
      max_distance_miles: 25, service_categories: [],
    }];
    currentState.profiles = [{
      id: 'prov-dedupe', role: 'provider',
      verification_status: 'verified', suspended_at: null,
    }];
    currentState.rpcResponses.place_plan_bid = {
      data:  null,
      error: { code: 'P0001', message: 'no_credits_available' },
    };
    // Simulate an unread prior notification already present
    currentState.existingNotification = { id: 'notif-existing' };

    const res = await handler();
    const body = JSON.parse(res.body);

    // RPC still tried (dedupe only affects the notification insert)
    assert.strictEqual(currentState.rpcCalls.length, 1);
    // But NO new notification inserted (existing unread one suppresses it)
    assert.strictEqual(currentState.insertsByTable.notifications, undefined,
      'expected NO fresh notification when unread one already exists');
    assert.strictEqual(body.low_balance_providers, 1);
    assert.strictEqual(body.low_balance_notified, 0,
      'low_balance_notified should be 0 due to dedupe');

    ok('(D) dedupe: existing unread notification suppresses fresh insert');
  } catch (e) { fail('(D) dedupe', e); }

  console.log('\n[auto-bid-engine-scheduled.test.js] ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) {
    console.error('\nFailures:');
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
  }
}

run().catch((e) => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});

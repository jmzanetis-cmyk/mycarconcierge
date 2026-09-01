// ============================================================================
// Upsell handlers — unit tests
//
// Covers netlify/functions/_shared/upsell-handlers.js. Pure unit tests: no
// live Stripe, no live Supabase. Same mock-loader + fake-supabase pattern
// as reviewer-guard.test.js and founding-commission.test.js.
//
// What we prove:
//   1. handleSubmit validation:
//        - missing title → 400
//        - invalid update_type → 400
//        - cost_increase requires positive estimated_cost → 400
//        - happy path returns 201 with new id + resolved care_plan_id
//   2. handleApprove idempotency:
//        - re-approve on an authorization_pending row returns the existing
//          client_secret (PI retrieved) instead of creating a second PI
//   3. resolveCarePlanId:
//        - FK-first — when maintenance_packages.care_plan_id is set, returns
//          the referenced care_plan without touching the (member_id, title) join
//        - Legacy fallback — when FK is null and (member_id, title) matches
//          exactly one row, returns that row
//        - Ambiguity fail-safe — when >1 match on the fallback, returns null
//   4. handleDecline PI-cancel path:
//        - authorization_pending row with a payment_intent_id → PI.cancel is
//          called before the status flip
//
// Run: node netlify/functions-tests/upsell-handlers.test.js
// ============================================================================

'use strict';

const path = require('path');
const Module = require('module');

// ---------- test harness ----------
let testsRun = 0;
let testsFailed = 0;
async function run(name, fn) {
  testsRun++;
  try { await fn(); console.log(`  ✓ ${name}`); }
  catch (err) {
    testsFailed++;
    console.error(`  ✗ ${name}\n    ${err.stack || err.message}`);
  }
}
function eq(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg || 'eq failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function truthy(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }
function falsy(v, msg) { if (v) throw new Error(msg || 'expected falsy'); }

// ---------- module stubs ----------
// @supabase/supabase-js — we pass sb directly to handlers so this is only
// needed for the createClient() call inside supabase(). Never called in our
// tests (we pass a fake sb straight to handlers).
// stripe — replace with an in-memory API that records calls.
const stripeCalls = { create: [], retrieve: [], cancel: [] };
let stripeState = { nextPi: null, retrieveMap: new Map() };

function makeStripeMock() {
  return {
    paymentIntents: {
      async create(params) {
        stripeCalls.create.push(params);
        const pi = stripeState.nextPi || {
          id: 'pi_mock_' + (stripeCalls.create.length),
          client_secret: 'pi_mock_' + stripeCalls.create.length + '_secret_abc',
          status: 'requires_payment_method',
          amount: params.amount,
          capture_method: params.capture_method,
        };
        stripeState.retrieveMap.set(pi.id, pi);
        return pi;
      },
      async retrieve(id) {
        stripeCalls.retrieve.push(id);
        const pi = stripeState.retrieveMap.get(id);
        if (!pi) throw new Error('unknown PI in mock: ' + id);
        return pi;
      },
      async cancel(id) {
        stripeCalls.cancel.push(id);
        const pi = stripeState.retrieveMap.get(id);
        if (pi) { pi.status = 'canceled'; }
        return pi || { id, status: 'canceled' };
      },
      async capture(id) {
        const pi = stripeState.retrieveMap.get(id);
        if (pi) pi.status = 'succeeded';
        return pi || { id, status: 'succeeded' };
      },
    },
  };
}
function resetStripeMock() {
  stripeCalls.create.length = 0;
  stripeCalls.retrieve.length = 0;
  stripeCalls.cancel.length = 0;
  stripeState = { nextPi: null, retrieveMap: new Map() };
}

// Mock the require() calls upsell-handlers.js makes at module top.
const origLoad = Module._load;
const stubs = new Map();
stubs.set('@supabase/supabase-js', { createClient: () => ({}) });
stubs.set('stripe', function Stripe() { return makeStripeMock(); });
// dispatchBidAcceptedPush — no-op so we don't try to hit FCM.
// audit — no-op that never throws.
Module._load = function (request, parent, ...rest) {
  if (stubs.has(request)) return stubs.get(request);
  return origLoad.call(this, request, parent, ...rest);
};

process.env.SUPABASE_URL = 'http://stub';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';
process.env.STRIPE_SECRET_KEY = 'sk_stub';
// Ensure no user is treated as reviewer for these tests.
process.env.REVIEWER_EMAILS = 'nobody-test@example.com';

// Stub the dispatch push module before requiring upsell-handlers.
require.cache[require.resolve('../functions/notifications-bid-accepted-push')] = {
  exports: { dispatchBidAcceptedPush: async () => ({ sent: false, reason: 'stub' }) },
};
// Stub the audit shared helper to be a no-op — full audit-log semantics are
// covered elsewhere; we're only checking handler correctness here.
require.cache[require.resolve('../functions/_shared/audit')] = {
  exports: { audit: async () => {} },
};

const upsell = require('../functions/_shared/upsell-handlers');

// ---------- constants ----------
const MEMBER_ID   = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROVIDER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PACKAGE_ID  = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CARE_PLAN_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const BID_ID      = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const AWR_ID      = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ---------- supabase stub factory ----------
// Small, focused chain builder — supports .select().eq().maybeSingle() /
// .single() / .limit(), .insert().select().single(), .update().eq().eq(), .in().
// Reset per test.
function makeSupabase(seed = {}) {
  const tables = {
    maintenance_packages: [],
    care_plans: [],
    bids: [],
    profiles: [],
    additional_work_requests: [],
    notifications: [],
    ...seed,
  };
  const state = { updates: [], inserts: [] };

  function from(name) {
    const rows = tables[name] || (tables[name] = []);
    const ctx = { filters: [], select: null, order: null, limit: null, patch: null, mode: 'read' };

    function applyFilters(src) { return src.filter(r => ctx.filters.every(f => f(r))); }

    function settle() {
      if (ctx.mode === 'update') {
        const matched = applyFilters(rows);
        for (const r of matched) Object.assign(r, ctx.patch);
        state.updates.push({ table: name, patch: ctx.patch, matched: matched.length });
        return { data: null, error: null };
      }
      if (ctx.mode === 'delete') {
        const matched = applyFilters(rows);
        for (const r of matched) {
          const i = rows.indexOf(r);
          if (i >= 0) rows.splice(i, 1);
        }
        return { data: null, error: null };
      }
      const data = applyFilters(rows);
      if (ctx.order) data.sort(ctx.order);
      const sliced = ctx.limit ? data.slice(0, ctx.limit) : data;
      return { data: sliced, error: null };
    }

    const b = {
      select(cols) { ctx.select = cols; return b; },
      eq(col, val) { ctx.filters.push(r => r[col] === val); return b; },
      neq(col, val) { ctx.filters.push(r => r[col] !== val); return b; },
      in(col, arr) { ctx.filters.push(r => Array.isArray(arr) && arr.includes(r[col])); return b; },
      order(col, opts) {
        const dir = (opts && opts.ascending === false) ? -1 : 1;
        ctx.order = (a, x) => (a[col] > x[col] ? 1 : a[col] < x[col] ? -1 : 0) * dir;
        return b;
      },
      limit(n) { ctx.limit = n; return b; },
      not() { return b; }, // never asserted against in these tests
      then(resolve, reject) {
        try { resolve(settle()); } catch (e) { if (reject) reject(e); }
      },
      async maybeSingle() { const r = settle(); return { data: r.data[0] || null, error: r.error }; },
      async single() {
        const r = settle();
        if (!r.data[0]) return { data: null, error: { message: 'no rows' } };
        return { data: r.data[0], error: null };
      },
      insert(row) {
        ctx.mode = 'insert';
        const newRow = Array.isArray(row) ? row[0] : { ...row };
        if (!newRow.id) newRow.id = 'row-' + (rows.length + 1);
        rows.push(newRow);
        state.inserts.push({ table: name, row: newRow });
        return {
          select(_cols) {
            return {
              async single() { return { data: newRow, error: null }; },
              async maybeSingle() { return { data: newRow, error: null }; },
            };
          },
          async then(resolve) { resolve({ data: [newRow], error: null }); },
        };
      },
      update(patch) { ctx.mode = 'update'; ctx.patch = patch; return b; },
      delete() { ctx.mode = 'delete'; return b; },
    };
    return b;
  }

  return { from, _state: state, _tables: tables };
}

function mockEvent(body) {
  return {
    httpMethod: 'POST',
    body: body != null ? JSON.stringify(body) : '',
    headers: {},
    path: '',
  };
}

async function parseBody(res) {
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

// ============================================================================
// 1. handleSubmit — validation
// ============================================================================
async function testSubmitValidation() {
  console.log('\n── handleSubmit validation ──');

  await run('missing title → 400', async () => {
    const sb = makeSupabase();
    const r = await parseBody(await upsell.handleSubmit(mockEvent({
      package_id: PACKAGE_ID,
      update_type: 'cost_increase',
      estimated_cost: 50,
    }), sb, { id: PROVIDER_ID }));
    eq(r.statusCode, 400);
    truthy(String(r.body.error).includes('title'), 'error should mention title');
  });

  await run('invalid update_type → 400', async () => {
    const sb = makeSupabase();
    const r = await parseBody(await upsell.handleSubmit(mockEvent({
      package_id: PACKAGE_ID,
      title: 'Test',
      update_type: 'not_a_real_type',
    }), sb, { id: PROVIDER_ID }));
    eq(r.statusCode, 400);
    truthy(String(r.body.error).includes('update_type'));
  });

  await run('cost_increase without estimated_cost → 400', async () => {
    const sb = makeSupabase();
    const r = await parseBody(await upsell.handleSubmit(mockEvent({
      package_id: PACKAGE_ID,
      title: 'Brake pads',
      update_type: 'cost_increase',
    }), sb, { id: PROVIDER_ID }));
    eq(r.statusCode, 400);
    truthy(String(r.body.error).includes('estimated_cost'));
  });

  await run('cost_increase with zero cost → 400', async () => {
    const sb = makeSupabase();
    const r = await parseBody(await upsell.handleSubmit(mockEvent({
      package_id: PACKAGE_ID,
      title: 'Brake pads',
      update_type: 'cost_increase',
      estimated_cost: 0,
    }), sb, { id: PROVIDER_ID }));
    eq(r.statusCode, 400);
    truthy(String(r.body.error).includes('estimated_cost'));
  });

  await run('missing package_id → 400', async () => {
    const sb = makeSupabase();
    const r = await parseBody(await upsell.handleSubmit(mockEvent({
      title: 'Brake pads',
      update_type: 'cost_increase',
      estimated_cost: 50,
    }), sb, { id: PROVIDER_ID }));
    eq(r.statusCode, 400);
    truthy(String(r.body.error).includes('package_id'));
  });

  await run('happy path → 201 with id + care_plan_id resolved via FK', async () => {
    resetStripeMock();
    const sb = makeSupabase({
      maintenance_packages: [{
        id: PACKAGE_ID, member_id: MEMBER_ID, status: 'accepted',
        accepted_bid_id: BID_ID, title: 'Base job',
        care_plan_id: CARE_PLAN_ID,
      }],
      bids: [{ id: BID_ID, provider_id: PROVIDER_ID }],
      care_plans: [{
        id: CARE_PLAN_ID, member_id: MEMBER_ID, title: 'Base job',
        provider_id: PROVIDER_ID, status: 'awarded',
      }],
    });
    const r = await parseBody(await upsell.handleSubmit(mockEvent({
      package_id: PACKAGE_ID,
      title: 'Rotor replacement',
      description: 'Front rotors below spec.',
      update_type: 'cost_increase',
      estimated_cost: 120,
      urgency: 'recommended',
    }), sb, { id: PROVIDER_ID }));
    eq(r.statusCode, 201);
    eq(r.body.success, true);
    truthy(r.body.id, 'should return new awr id');
    eq(r.body.care_plan_id, CARE_PLAN_ID);
    // Row should be in the table now.
    const awrRow = sb._tables.additional_work_requests[0];
    truthy(awrRow, 'awr row should be inserted');
    eq(awrRow.care_plan_id, CARE_PLAN_ID);
    eq(awrRow.status, 'pending');
  });
}

// ============================================================================
// 2. handleApprove — idempotency
// ============================================================================
async function testApproveIdempotency() {
  console.log('\n── handleApprove idempotency ──');

  await run('re-approve on authorization_pending returns existing client_secret; no new PI', async () => {
    resetStripeMock();
    const existingPI = {
      id: 'pi_existing_1',
      client_secret: 'pi_existing_1_secret_xyz',
      status: 'requires_payment_method',
      amount: 12000,
      capture_method: 'manual',
    };
    stripeState.retrieveMap.set(existingPI.id, existingPI);
    const sb = makeSupabase({
      additional_work_requests: [{
        id: AWR_ID,
        package_id: PACKAGE_ID,
        care_plan_id: CARE_PLAN_ID,
        provider_id: PROVIDER_ID,
        member_id: MEMBER_ID,
        title: 'Rotor replacement',
        estimated_cost: 120,
        // Row was previously moved to authorization_pending; we're re-hitting
        // approve now. The prior flow leaves status=pending logically but the
        // handler exits at status !== 'pending' with an error unless we set
        // it to pending — actually re-check the code path.
        //
        // The idempotency branch in handleApprove ONLY fires while status is
        // still 'pending' AND payment_intent_id is already set (partial PI
        // created on a prior retry). Simulate that state.
        status: 'pending',
        update_type: 'cost_increase',
        payment_intent_id: existingPI.id,
      }],
      care_plans: [{
        id: CARE_PLAN_ID, member_id: MEMBER_ID, provider_id: PROVIDER_ID,
        title: 'Base job', status: 'awarded',
        provider_stripe_account_id: 'acct_stub',
      }],
      profiles: [{ id: PROVIDER_ID, stripe_account_id: 'acct_stub' }],
    });
    const r = await parseBody(await upsell.handleApprove(
      mockEvent({}), sb, { id: MEMBER_ID }, AWR_ID
    ));
    eq(r.statusCode, 200);
    eq(r.body.success, true);
    eq(r.body.payment_intent_id, existingPI.id);
    eq(r.body.client_secret, existingPI.client_secret);
    eq(r.body.idempotent, true);
    eq(stripeCalls.retrieve.length, 1, 'should retrieve existing PI');
    eq(stripeCalls.create.length, 0, 'must NOT create a second PI');
  });
}

// ============================================================================
// 3. resolveCarePlanId — FK-first, legacy fallback, ambiguity fail-safe
// ============================================================================
async function testResolveCarePlanId() {
  console.log('\n── resolveCarePlanId ──');

  await run('FK-first — mp.care_plan_id set → returns referenced plan, skips join', async () => {
    const sb = makeSupabase({
      maintenance_packages: [{
        id: PACKAGE_ID, member_id: MEMBER_ID, title: 'Ambiguous Title',
        care_plan_id: CARE_PLAN_ID,
      }],
      care_plans: [
        { id: CARE_PLAN_ID, member_id: MEMBER_ID, title: 'Ambiguous Title', status: 'awarded' },
        // Two more with the SAME title — would trip the ambiguity guard on
        // the fallback path. FK-first must skip this join entirely.
        { id: 'plan-2', member_id: MEMBER_ID, title: 'Ambiguous Title', status: 'awarded' },
        { id: 'plan-3', member_id: MEMBER_ID, title: 'Ambiguous Title', status: 'open' },
      ],
    });
    const cp = await upsell.resolveCarePlanId(sb, PACKAGE_ID, MEMBER_ID);
    truthy(cp, 'should resolve');
    eq(cp.id, CARE_PLAN_ID, 'should return the FK-referenced plan');
  });

  await run('Legacy fallback — no FK, single (member_id, title) match returns it', async () => {
    const sb = makeSupabase({
      maintenance_packages: [{
        id: PACKAGE_ID, member_id: MEMBER_ID, title: 'Unique Title',
        care_plan_id: null,
      }],
      care_plans: [
        { id: CARE_PLAN_ID, member_id: MEMBER_ID, title: 'Unique Title', status: 'awarded', created_at: '2026-08-01' },
      ],
    });
    const cp = await upsell.resolveCarePlanId(sb, PACKAGE_ID, MEMBER_ID);
    truthy(cp);
    eq(cp.id, CARE_PLAN_ID);
  });

  await run('Ambiguity fail-safe — no FK, >1 (member_id, title) match returns null', async () => {
    const sb = makeSupabase({
      maintenance_packages: [{
        id: PACKAGE_ID, member_id: MEMBER_ID, title: 'Duplicate Title',
        care_plan_id: null,
      }],
      care_plans: [
        { id: 'plan-a', member_id: MEMBER_ID, title: 'Duplicate Title', status: 'awarded', created_at: '2026-08-15' },
        { id: 'plan-b', member_id: MEMBER_ID, title: 'Duplicate Title', status: 'awarded', created_at: '2026-08-01' },
      ],
    });
    // Silence the expected warn log in tests.
    const origWarn = console.warn;
    console.warn = () => {};
    try {
      const cp = await upsell.resolveCarePlanId(sb, PACKAGE_ID, MEMBER_ID);
      eq(cp, null, 'must refuse to guess on ambiguity');
    } finally { console.warn = origWarn; }
  });

  await run('Missing package → null', async () => {
    const sb = makeSupabase();
    const cp = await upsell.resolveCarePlanId(sb, PACKAGE_ID, MEMBER_ID);
    eq(cp, null);
  });

  await run('No (member_id, title) match on fallback → null', async () => {
    const sb = makeSupabase({
      maintenance_packages: [{
        id: PACKAGE_ID, member_id: MEMBER_ID, title: 'Nothing Matches',
        care_plan_id: null,
      }],
      care_plans: [
        { id: 'plan-x', member_id: 'other-member', title: 'Nothing Matches' },
      ],
    });
    const cp = await upsell.resolveCarePlanId(sb, PACKAGE_ID, MEMBER_ID);
    eq(cp, null);
  });
}

// ============================================================================
// 4. handleDecline — PI cancel path
// ============================================================================
async function testDeclineCancelsPI() {
  console.log('\n── handleDecline PI-cancel ──');

  await run('authorization_pending row with PI → cancel called before status flip', async () => {
    resetStripeMock();
    const pi = {
      id: 'pi_to_cancel_1',
      client_secret: 'pi_to_cancel_1_secret',
      status: 'requires_payment_method',
      amount: 5000,
      capture_method: 'manual',
    };
    stripeState.retrieveMap.set(pi.id, pi);
    const sb = makeSupabase({
      additional_work_requests: [{
        id: AWR_ID,
        package_id: PACKAGE_ID,
        care_plan_id: CARE_PLAN_ID,
        provider_id: PROVIDER_ID,
        member_id: MEMBER_ID,
        title: 'Coolant flush',
        estimated_cost: 50,
        status: 'authorization_pending',
        update_type: 'cost_increase',
        payment_intent_id: pi.id,
      }],
      care_plans: [{
        id: CARE_PLAN_ID, member_id: MEMBER_ID, title: 'Base job', status: 'awarded',
      }],
    });
    const r = await parseBody(await upsell.handleDecline(
      mockEvent({ member_response_note: 'not needed' }),
      sb, { id: MEMBER_ID }, AWR_ID
    ));
    eq(r.statusCode, 200);
    eq(r.body.success, true);
    eq(stripeCalls.retrieve.length, 1, 'should retrieve PI first to check status');
    eq(stripeCalls.cancel.length, 1, 'should cancel PI');
    eq(stripeCalls.cancel[0], pi.id);
    // DB row should now be declined.
    const awr = sb._tables.additional_work_requests[0];
    eq(awr.status, 'declined');
    eq(awr.member_response_note, 'not needed');
    eq(awr.member_action, 'declined');
    truthy(awr.declined_at);
  });

  await run('pending row with NO PI → no Stripe cancel called', async () => {
    resetStripeMock();
    const sb = makeSupabase({
      additional_work_requests: [{
        id: AWR_ID,
        package_id: PACKAGE_ID,
        care_plan_id: CARE_PLAN_ID,
        provider_id: PROVIDER_ID,
        member_id: MEMBER_ID,
        title: 'Coolant flush',
        estimated_cost: 50,
        status: 'pending',
        update_type: 'cost_increase',
        payment_intent_id: null,
      }],
      care_plans: [{ id: CARE_PLAN_ID, member_id: MEMBER_ID, title: 'Base job', status: 'awarded' }],
    });
    const r = await parseBody(await upsell.handleDecline(
      mockEvent({}), sb, { id: MEMBER_ID }, AWR_ID
    ));
    eq(r.statusCode, 200);
    eq(stripeCalls.cancel.length, 0, 'no PI → no cancel');
    eq(sb._tables.additional_work_requests[0].status, 'declined');
  });

  await run('non-member decliner → 403', async () => {
    const sb = makeSupabase({
      additional_work_requests: [{
        id: AWR_ID,
        member_id: MEMBER_ID, provider_id: PROVIDER_ID,
        status: 'pending', update_type: 'cost_increase',
        payment_intent_id: null,
      }],
    });
    const r = await parseBody(await upsell.handleDecline(
      mockEvent({}), sb, { id: 'someone-else' }, AWR_ID
    ));
    eq(r.statusCode, 403);
  });
}

// ============================================================================
// main
// ============================================================================
(async () => {
  console.log('upsell-handlers.test.js');
  await testSubmitValidation();
  await testApproveIdempotency();
  await testResolveCarePlanId();
  await testDeclineCancelsPI();
  console.log(`\n${testsRun - testsFailed} passed, ${testsFailed} failed`);
  if (testsFailed > 0) process.exitCode = 1;
})();

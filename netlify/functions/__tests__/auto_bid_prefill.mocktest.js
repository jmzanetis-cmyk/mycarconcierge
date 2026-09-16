// ============================================================================
// netlify/functions/__tests__/auto_bid_prefill.mocktest.js
//
// Zero-network mock harness for auto-bid-prefill.js's exports.handler.
// I (Claude) wrote and verified this file myself instead of routing through
// CC, because I don't have live network access to this project's Supabase
// instance from this environment (confirmed blocked — DNS resolution to
// the project host fails from here). CC's equivalent phases all did a real
// round-trip through a live temp provider account; this can't do that.
// What it CAN do: exercise the actual exports.handler code path — auth,
// ownership checks, the lazy-expiry branch, the RPC error-code mapping,
// the amount-in-dollars conversion — against a scripted fake Supabase
// client, so a logic bug (wrong status code, wrong field name, wrong
// branch) fails loudly here even without a live database.
//
// This does NOT replace a real live-account round-trip before this ships.
// Run: node netlify/functions/__tests__/auto_bid_prefill.mocktest.js
// ============================================================================
'use strict';

const assert = require('assert');
const Module = require('module');

// ---- Fake Supabase query builder --------------------------------------
// Keyed per-table, with separate canned responses for select vs update vs
// rpc. Good enough to drive auto-bid-prefill.js's exact call shapes without
// simulating real Postgres semantics.
function makeChain(resp) {
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    update(patch) { chain._patch = patch; return chain; },
    single() { return chain; },
    maybeSingle() { return chain; },
    then(resolve, reject) { return Promise.resolve(resp).then(resolve, reject); },
  };
  return chain;
}

function makeFakeSupabase({ tables, rpcResponse, authUser, updateSpy }) {
  return {
    auth: {
      getUser: async (token) => {
        if (!token) return { data: null, error: { message: 'no token' } };
        return { data: { user: authUser }, error: null };
      },
    },
    from(table) {
      const t = tables[table] || {};
      return {
        select() {
          return makeChain(t.select || { data: null, error: { message: 'no select fixture for ' + table } });
        },
        update(patch) {
          if (updateSpy) updateSpy(table, patch);
          return makeChain(t.update || { error: null });
        },
      };
    },
    rpc(name, args) {
      if (rpcSpyHolder.spy) rpcSpyHolder.spy(name, args);
      return Promise.resolve(rpcResponse);
    },
  };
}
const rpcSpyHolder = {};

// ---- Load the real handler with utils.createSupabaseClient patched ----
function loadHandlerWithFakeSupabase(fakeSupabase) {
  const utilsPath = require.resolve('../utils');
  const handlerPath = require.resolve('../auto-bid-prefill');
  delete require.cache[utilsPath];
  delete require.cache[handlerPath];
  const utils = require('../utils');
  utils.createSupabaseClient = () => fakeSupabase;
  const mod = require('../auto-bid-prefill');
  return mod;
}

let passed = 0;
function t(name, fn) {
  return fn().then(() => { passed++; console.log(`✓ ${name}`); })
    .catch(e => { console.error(`✗ ${name}\n   ${e.stack || e.message}`); process.exitCode = 1; });
}

const NOW = Date.now();
const FUTURE = new Date(NOW + 3 * 3600 * 1000).toISOString();
const RECENT = new Date(NOW - 5 * 60 * 1000).toISOString(); // 5 min ago — well within 2h window
const STALE = new Date(NOW - 3 * 3600 * 1000).toISOString(); // 3h ago — past the 2h window
const PROVIDER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_ID = '33333333-3333-4333-8333-333333333333';
const PREFILL_ID = '44444444-4444-4444-8444-444444444444';

function basePrefill(overrides) {
  return Object.assign({
    id: PREFILL_ID, provider_id: PROVIDER_ID, care_plan_id: PLAN_ID,
    item_key: 'oil_change_synthetic', prefilled_amount_cents: 8900,
    status: 'pending', created_at: RECENT, responded_at: null,
  }, overrides);
}
function basePlan(overrides) {
  return Object.assign({
    id: PLAN_ID, title: 'Synthetic oil change', description: 'test',
    status: 'open', bid_closes_at: FUTURE, city: 'Newark', state: 'NJ',
    zip_code: '07102', lat: 40.7, lng: -74.2, categories: ['maintenance'],
    service_types: [], member_id: OTHER_ID, vehicle: { year: 2020, make: 'Honda', model: 'Civic' },
  }, overrides);
}
const ITEM = { item_key: 'oil_change_synthetic', label: 'Oil Change (Full Synthetic)', category: 'maintenance' };
const PROFILE = { id: PROVIDER_ID, role: 'provider', verification_status: 'verified', suspended_at: null, lat: 40.8, lng: -74.3 };
const PREFS = { match_categories: ['maintenance'], match_radius_miles: 25 };

function mkEvent(method, path, body) {
  return { httpMethod: method, path, headers: { Authorization: 'Bearer faketoken' }, body: body ? JSON.stringify(body) : undefined };
}

(async () => {
  // 1. GET happy path
  await t('GET pending prefill returns full detail', async () => {
    const fake = makeFakeSupabase({
      authUser: { id: PROVIDER_ID },
      tables: {
        auto_bid_prefills: { select: { data: basePrefill(), error: null } },
        care_plans: { select: { data: basePlan(), error: null } },
        service_menu_items: { select: { data: ITEM, error: null } },
        profiles: { select: { data: PROFILE, error: null } },
      },
    });
    const { handler } = loadHandlerWithFakeSupabase(fake);
    const res = await handler(mkEvent('GET', `/api/auto-bid-prefill/${PREFILL_ID}`));
    assert.strictEqual(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.status, 'pending');
    assert.strictEqual(json.item_label, 'Oil Change (Full Synthetic)');
    assert.strictEqual(json.prefilled_amount_cents, 8900);
    assert.ok(typeof json.distance_miles === 'number' && json.distance_miles > 0, 'distance should be computed');
  });

  // 2. GET not owner
  await t('GET on a prefill owned by someone else returns 403', async () => {
    const fake = makeFakeSupabase({
      authUser: { id: OTHER_ID },
      tables: { auto_bid_prefills: { select: { data: basePrefill(), error: null } } },
    });
    const { handler } = loadHandlerWithFakeSupabase(fake);
    const res = await handler(mkEvent('GET', `/api/auto-bid-prefill/${PREFILL_ID}`));
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(JSON.parse(res.body).error, 'not_prefill_owner');
  });

  // 3. GET not found
  await t('GET on a nonexistent prefill returns 404', async () => {
    const fake = makeFakeSupabase({
      authUser: { id: PROVIDER_ID },
      tables: { auto_bid_prefills: { select: { data: null, error: { message: 'no rows' } } } },
    });
    const { handler } = loadHandlerWithFakeSupabase(fake);
    const res = await handler(mkEvent('GET', `/api/auto-bid-prefill/${PREFILL_ID}`));
    assert.strictEqual(res.statusCode, 404);
  });

  // 4. GET lazy-expiry
  await t('GET past its deadline lazily flips to expired and reports it', async () => {
    let updateCalls = [];
    const fake = makeFakeSupabase({
      authUser: { id: PROVIDER_ID },
      tables: {
        auto_bid_prefills: { select: { data: basePrefill({ created_at: STALE }), error: null } },
        care_plans: { select: { data: basePlan(), error: null } },
        service_menu_items: { select: { data: ITEM, error: null } },
        profiles: { select: { data: PROFILE, error: null } },
      },
      updateSpy: (table, patch) => updateCalls.push({ table, patch }),
    });
    const { handler } = loadHandlerWithFakeSupabase(fake);
    const res = await handler(mkEvent('GET', `/api/auto-bid-prefill/${PREFILL_ID}`));
    assert.strictEqual(JSON.parse(res.body).status, 'expired');
    assert.ok(updateCalls.some(c => c.table === 'auto_bid_prefills' && c.patch.status === 'expired'),
      'expected an update flipping status to expired');
  });

  // 5. PATCH dismiss
  await t('PATCH dismissed on a pending prefill succeeds and does not call the bid RPC', async () => {
    let rpcCalled = false;
    rpcSpyHolder.spy = () => { rpcCalled = true; };
    const fake = makeFakeSupabase({
      authUser: { id: PROVIDER_ID },
      tables: {
        auto_bid_prefills: { select: { data: basePrefill(), error: null }, update: { error: null } },
        care_plans: { select: { data: basePlan(), error: null } },
        service_menu_items: { select: { data: ITEM, error: null } },
      },
      rpcResponse: { data: null, error: { message: 'should not be called' } },
    });
    const { handler } = loadHandlerWithFakeSupabase(fake);
    const res = await handler(mkEvent('PATCH', `/api/auto-bid-prefill/${PREFILL_ID}`, { status: 'dismissed' }));
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(JSON.parse(res.body).status, 'dismissed');
    assert.strictEqual(rpcCalled, false, 'dismiss must never call place_plan_bid');
    rpcSpyHolder.spy = null;
  });

  // 6. PATCH confirm happy path
  await t('PATCH confirmed on a pending prefill calls place_plan_bid with the right note+amount and marks confirmed', async () => {
    let rpcArgs = null;
    rpcSpyHolder.spy = (name, args) => { rpcArgs = args; };
    let updateCalls = [];
    const fake = makeFakeSupabase({
      authUser: { id: PROVIDER_ID },
      tables: {
        auto_bid_prefills: { select: { data: basePrefill(), error: null }, update: { error: null } },
        care_plans: { select: { data: basePlan(), error: null } },
        service_menu_items: { select: { data: ITEM, error: null } },
        profiles: { select: { data: PROFILE, error: null } },
        provider_match_preferences: { select: { data: PREFS, error: null } },
      },
      updateSpy: (table, patch) => updateCalls.push({ table, patch }),
      rpcResponse: { data: [{ bid_id: 'bid-1', consumed_source: 'credits', remaining_free: 0, remaining_credits: 4 }], error: null },
    });
    const { handler } = loadHandlerWithFakeSupabase(fake);
    const res = await handler(mkEvent('PATCH', `/api/auto-bid-prefill/${PREFILL_ID}`, { status: 'confirmed' }));
    assert.strictEqual(res.statusCode, 200, res.body);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.bid_id, 'bid-1');
    assert.ok(rpcArgs, 'RPC should have been called');
    assert.strictEqual(rpcArgs.p_provider_id, PROVIDER_ID);
    assert.strictEqual(rpcArgs.p_care_plan_id, PLAN_ID);
    assert.strictEqual(rpcArgs.p_amount, 89, 'prefilled_amount_cents 8900 should convert to 89 dollars');
    assert.strictEqual(rpcArgs.p_note, 'Auto-bid from rate card: Oil Change (Full Synthetic)');
    assert.ok(updateCalls.some(c => c.table === 'auto_bid_prefills' && c.patch.status === 'confirmed'));
    rpcSpyHolder.spy = null;
  });

  // 7. PATCH confirm respects an edited amount, converting dollars correctly
  await t('PATCH confirmed with a caller-supplied amount overrides the prefilled one', async () => {
    let rpcArgs = null;
    rpcSpyHolder.spy = (name, args) => { rpcArgs = args; };
    const fake = makeFakeSupabase({
      authUser: { id: PROVIDER_ID },
      tables: {
        auto_bid_prefills: { select: { data: basePrefill(), error: null }, update: { error: null } },
        care_plans: { select: { data: basePlan(), error: null } },
        service_menu_items: { select: { data: ITEM, error: null } },
        profiles: { select: { data: PROFILE, error: null } },
        provider_match_preferences: { select: { data: PREFS, error: null } },
      },
      rpcResponse: { data: [{ bid_id: 'bid-2', consumed_source: 'free_trial', remaining_free: 2, remaining_credits: 0 }], error: null },
    });
    const { handler } = loadHandlerWithFakeSupabase(fake);
    const res = await handler(mkEvent('PATCH', `/api/auto-bid-prefill/${PREFILL_ID}`, { status: 'confirmed', amount: 125.5 }));
    assert.strictEqual(res.statusCode, 200, res.body);
    assert.strictEqual(rpcArgs.p_amount, 125.5);
    rpcSpyHolder.spy = null;
  });

  // 8. PATCH confirm — no credits (P0001)
  await t('PATCH confirmed maps P0001/no_credits_available to 402 no_credits', async () => {
    const fake = makeFakeSupabase({
      authUser: { id: PROVIDER_ID },
      tables: {
        auto_bid_prefills: { select: { data: basePrefill(), error: null }, update: { error: null } },
        care_plans: { select: { data: basePlan(), error: null } },
        service_menu_items: { select: { data: ITEM, error: null } },
        profiles: { select: { data: PROFILE, error: null } },
        provider_match_preferences: { select: { data: PREFS, error: null } },
      },
      rpcResponse: { data: null, error: { code: 'P0001', message: 'no_credits_available' } },
    });
    const { handler } = loadHandlerWithFakeSupabase(fake);
    const res = await handler(mkEvent('PATCH', `/api/auto-bid-prefill/${PREFILL_ID}`, { status: 'confirmed' }));
    assert.strictEqual(res.statusCode, 402);
    assert.strictEqual(JSON.parse(res.body).error, 'no_credits');
  });

  // 9. PATCH confirm — duplicate (P0002)
  await t('PATCH confirmed maps P0002/duplicate_bid to 409 duplicate_bid', async () => {
    const fake = makeFakeSupabase({
      authUser: { id: PROVIDER_ID },
      tables: {
        auto_bid_prefills: { select: { data: basePrefill(), error: null }, update: { error: null } },
        care_plans: { select: { data: basePlan(), error: null } },
        service_menu_items: { select: { data: ITEM, error: null } },
        profiles: { select: { data: PROFILE, error: null } },
        provider_match_preferences: { select: { data: PREFS, error: null } },
      },
      rpcResponse: { data: null, error: { code: 'P0002', message: 'duplicate_bid' } },
    });
    const { handler } = loadHandlerWithFakeSupabase(fake);
    const res = await handler(mkEvent('PATCH', `/api/auto-bid-prefill/${PREFILL_ID}`, { status: 'confirmed' }));
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(JSON.parse(res.body).error, 'duplicate_bid');
  });

  // 10. PATCH confirm — invalid amount
  await t('PATCH confirmed with amount <= 0 is rejected before touching the RPC', async () => {
    let rpcCalled = false;
    rpcSpyHolder.spy = () => { rpcCalled = true; };
    const fake = makeFakeSupabase({
      authUser: { id: PROVIDER_ID },
      tables: {
        auto_bid_prefills: { select: { data: basePrefill(), error: null } },
        care_plans: { select: { data: basePlan(), error: null } },
        service_menu_items: { select: { data: ITEM, error: null } },
      },
    });
    const { handler } = loadHandlerWithFakeSupabase(fake);
    const res = await handler(mkEvent('PATCH', `/api/auto-bid-prefill/${PREFILL_ID}`, { status: 'confirmed', amount: -5 }));
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(rpcCalled, false);
    rpcSpyHolder.spy = null;
  });

  // 11. PATCH on an already-handled prefill
  await t('PATCH on a non-pending prefill returns 409 prefill_not_pending', async () => {
    const fake = makeFakeSupabase({
      authUser: { id: PROVIDER_ID },
      tables: {
        auto_bid_prefills: { select: { data: basePrefill({ status: 'confirmed' }), error: null } },
        care_plans: { select: { data: basePlan(), error: null } },
        service_menu_items: { select: { data: ITEM, error: null } },
      },
    });
    const { handler } = loadHandlerWithFakeSupabase(fake);
    const res = await handler(mkEvent('PATCH', `/api/auto-bid-prefill/${PREFILL_ID}`, { status: 'dismissed' }));
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(JSON.parse(res.body).error, 'prefill_not_pending');
  });

  // 12. PATCH invalid status body
  await t('PATCH with an unrecognized status value is rejected', async () => {
    const fake = makeFakeSupabase({ authUser: { id: PROVIDER_ID }, tables: {} });
    const { handler } = loadHandlerWithFakeSupabase(fake);
    const res = await handler(mkEvent('PATCH', `/api/auto-bid-prefill/${PREFILL_ID}`, { status: 'bogus' }));
    assert.strictEqual(res.statusCode, 400);
  });

  // 13. No bearer token
  await t('Missing Authorization header returns 401 before any DB call', async () => {
    const fake = makeFakeSupabase({ authUser: { id: PROVIDER_ID }, tables: {} });
    const { handler } = loadHandlerWithFakeSupabase(fake);
    const res = await handler({ httpMethod: 'GET', path: `/api/auto-bid-prefill/${PREFILL_ID}`, headers: {} });
    assert.strictEqual(res.statusCode, 401);
  });

  console.log(`\n${passed} / 13 test group(s) passed.`);
  if (passed < 13) process.exitCode = 1;
})();

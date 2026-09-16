// ============================================================================
// netlify/functions/__tests__/auto_bid_prefill_notify_daily_cap.mocktest.js
//
// Zero-network mock harness for the Phase 7 daily-cap gate added to
// auto-bid-prefill-notify-scheduled.js. Same rationale and limits as
// auto_bid_prefill.mocktest.js (Phase 5): I don't have live network access
// to this project's Supabase instance from this environment, so this
// exercises the REAL exports.handler against a scripted fake
// @supabase/supabase-js client instead. It does NOT replace a live
// round-trip (Phase 4's own notify-engine logic — distance/service-fit/
// item-matching — was already proven live by CC; this file only proves
// the new cap-gate behavior added on top of that, in isolation, by
// stubbing the push dispatcher so FCM is never touched).
//
// Run: node netlify/functions/__tests__/auto_bid_prefill_notify_daily_cap.mocktest.js
// ============================================================================
'use strict';

const assert = require('assert');

process.env.SUPABASE_URL = 'https://fake.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';

// ---- Fake Supabase query builder --------------------------------------
// Generic chain that records every call (select/eq/or/in/gte/insert/single)
// into `state`, then resolves via a per-table `responder(state)` function
// when awaited. This lets each test scenario distinguish the two different
// auto_bid_prefills SELECTs (the dedup pre-check vs. the Phase 7
// today's-count query) by inspecting `state` (the count query always has
// `.gte('created_at', ...)`; the dedup pre-check never does) rather than by
// call order, which is more robust to future edits.
function makeChain(state, responder) {
  const chain = {
    select(cols) { state.select = cols; return chain; },
    eq(col, val) { (state.eq = state.eq || []).push([col, val]); return chain; },
    or(expr) { state.or = expr; return chain; },
    in(col, vals) { (state.in = state.in || []).push([col, vals]); return chain; },
    gte(col, val) { state.gte = [col, val]; return chain; },
    insert(row) { state.insert = row; return chain; },
    single() { state.single = true; return chain; },
    then(resolve, reject) { return Promise.resolve(responder(state)).then(resolve, reject); },
  };
  return chain;
}

function makeFakeSupabase(tableResponders) {
  return {
    from(table) {
      const responder = tableResponders[table] || (() => ({ data: [], error: null }));
      const state = { table };
      return makeChain(state, responder);
    },
  };
}

// ---- Load the real handler with @supabase/supabase-js + the push
//      dispatcher patched -----------------------------------------------
function loadHandlerWithFakeSupabase(fakeSupabase) {
  const supabaseJsPath = require.resolve('@supabase/supabase-js');
  const pushModulePath = require.resolve('../notifications-auto-bid-prefill-push');
  const handlerPath = require.resolve('../auto-bid-prefill-notify-scheduled');
  delete require.cache[supabaseJsPath];
  delete require.cache[pushModulePath];
  delete require.cache[handlerPath];

  const supabaseJs = require('@supabase/supabase-js');
  supabaseJs.createClient = () => fakeSupabase;

  // Stub the push dispatcher — push/FCM behavior was already proven live
  // by CC in Phase 4's own verification; this file only tests the new cap
  // gate, so a real send would just be noise (and would need its own FCM
  // mocking to avoid a real network call).
  const pushModule = require('../notifications-auto-bid-prefill-push');
  pushModule.dispatchAutoBidPrefill = async () => ({ sent: false, reason: 'stubbed_in_mocktest' });

  const mod = require('../auto-bid-prefill-notify-scheduled');
  return mod;
}

let passed = 0;
function t(name, fn) {
  return fn().then(() => { passed++; console.log(`✓ ${name}`); })
    .catch(e => { console.error(`✗ ${name}\n   ${e.stack || e.message}`); process.exitCode = 1; });
}

// ---- Fixtures -----------------------------------------------------------
// isServiceFit is permissive when a plan carries no category signal (see
// _eligibility.js), so leaving categories/service_types empty sidesteps
// needing realistic provider match_categories fixtures — this file is
// testing the cap gate, not the service-fit gate (already covered by
// Phase 4's own live verification).
function plan(id, title, overrides) {
  return Object.assign({
    id, title, service_types: [], categories: null,
    member_id: 'member-not-a-provider', lat: 40.0, lng: -74.0,
    bid_closes_at: null, status: 'open',
  }, overrides);
}
function profile(id) {
  return { id, role: 'provider', verification_status: 'verified', suspended_at: null, lat: 40.0001, lng: -74.0001 };
}
function pref(id) {
  return { profile_id: id, match_categories: [], match_radius_miles: 25 };
}
function rateCardRow(providerId, itemKey) {
  return { provider_id: providerId, item_key: itemKey, price_cents: 8900, active: true };
}

const PROV_AT_CAP     = '11111111-1111-4111-8111-111111111111'; // cap=1, already sent 1 today → must skip
const PROV_IN_RUN_CAP = '22222222-2222-4222-8222-222222222222'; // cap=1, sent 0 today, 2 matching plans this run
const PROV_UNCAPPED   = '33333333-3333-4333-8333-333333333333'; // no cap row → never gated

// Each provider carries a DIFFERENT rate-card item, and each plan's title
// matches exactly one item_key, so plan↔provider pairs are isolated by the
// existing skipped_not_on_rate_card gate rather than by any cap-specific
// fixture trick — the cap gate is the only thing under test here.
const ITEM_AT_CAP     = 'oil_change_synthetic';
const ITEM_IN_RUN_CAP = 'tire_rotation';
const ITEM_UNCAPPED   = 'battery_replacement';

const PLAN_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; // targets PROV_AT_CAP
const PLAN_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; // targets PROV_IN_RUN_CAP (1st)
const PLAN_3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'; // targets PROV_IN_RUN_CAP (2nd)
const PLAN_4 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'; // targets PROV_UNCAPPED (1st)
const PLAN_5 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'; // targets PROV_UNCAPPED (2nd)

const providerIds = [PROV_AT_CAP, PROV_IN_RUN_CAP, PROV_UNCAPPED];
const plans = [
  plan(PLAN_1, 'Synthetic oil change needed'),
  plan(PLAN_2, 'Tire rotation please'),
  plan(PLAN_3, 'Need a tire rotation'),
  plan(PLAN_4, 'Battery replacement needed'),
  plan(PLAN_5, 'New battery install'),
];
const rateCardRows = [
  rateCardRow(PROV_AT_CAP, ITEM_AT_CAP),
  rateCardRow(PROV_IN_RUN_CAP, ITEM_IN_RUN_CAP),
  rateCardRow(PROV_UNCAPPED, ITEM_UNCAPPED),
];
const profiles = providerIds.map(profile);
const prefs = providerIds.map(pref);

const notifPrefs = [
  { provider_id: PROV_AT_CAP, auto_bid_prefill_daily_cap: 1 },
  { provider_id: PROV_IN_RUN_CAP, auto_bid_prefill_daily_cap: 1 },
  // PROV_UNCAPPED intentionally has no row at all — the common case.
];

// PROV_AT_CAP already has 1 auto_bid_prefills row created today — at cap
// before the run even starts.
const todaysPrefillRows = [
  { provider_id: PROV_AT_CAP },
];

let insertedRows = [];

function tableResponders() {
  insertedRows = [];
  let nextInsertId = 1;
  return {
    care_plans: (state) => ({ data: plans, error: null }),
    provider_rate_card_items: (state) => ({ data: rateCardRows, error: null }),
    profiles: (state) => ({ data: profiles, error: null }),
    provider_match_preferences: (state) => ({ data: prefs, error: null }),
    service_menu_items: (state) => ({ data: [
      { item_key: 'oil_change_synthetic', label: 'Synthetic Oil Change' },
      { item_key: 'tire_rotation', label: 'Tire Rotation' },
      { item_key: 'battery_replacement', label: 'Battery Replacement' },
    ], error: null }),
    provider_notification_preferences: (state) => ({ data: notifPrefs, error: null }),
    auto_bid_prefills: (state) => {
      if (state.insert) {
        const row = Object.assign({ id: `inserted-${nextInsertId++}` }, state.insert);
        insertedRows.push(row);
        return { data: row, error: null };
      }
      if (state.gte) {
        // Phase 7's today's-count query.
        return { data: todaysPrefillRows, error: null };
      }
      // The pre-existing dedup pre-check query (provider_id, care_plan_id).
      return { data: [], error: null };
    },
  };
}

async function run() {
  await t('provider already at today\'s cap is skipped entirely, even though it would otherwise pass every gate', async () => {
    const fake = makeFakeSupabase(tableResponders());
    const mod = loadHandlerWithFakeSupabase(fake);
    const res = await mod.handler({});
    const body = JSON.parse(res.body);
    assert.strictEqual(body.error, undefined, 'handler reported an error: ' + JSON.stringify(body));
    assert.ok(body.skipped_daily_cap >= 1, `expected skipped_daily_cap >= 1, got ${body.skipped_daily_cap}`);
    assert.ok(
      !insertedRows.some(r => r.provider_id === PROV_AT_CAP),
      'PROV_AT_CAP should not have received an insert — it was at cap before the run started'
    );
  });

  await t('a provider under cap at DB-read time but hitting cap mid-run (via a 2nd matching plan) is capped in-memory, not just seeded from the DB', async () => {
    const fake = makeFakeSupabase(tableResponders());
    const mod = loadHandlerWithFakeSupabase(fake);
    await mod.handler({});
    const inRunInserts = insertedRows.filter(r => r.provider_id === PROV_IN_RUN_CAP);
    assert.strictEqual(
      inRunInserts.length, 1,
      `PROV_IN_RUN_CAP has cap=1 and 0 sent today but 2 matching plans this run — expected exactly 1 insert (in-run cap enforcement), got ${inRunInserts.length}`
    );
  });

  await t('an uncapped provider (no provider_notification_preferences row at all) is never gated by the cap logic', async () => {
    const fake = makeFakeSupabase(tableResponders());
    const mod = loadHandlerWithFakeSupabase(fake);
    await mod.handler({});
    const uncappedInserts = insertedRows.filter(r => r.provider_id === PROV_UNCAPPED);
    assert.strictEqual(
      uncappedInserts.length, 2,
      `PROV_UNCAPPED has no cap row and 2 matching plans — expected both to insert (unlimited default), got ${uncappedInserts.length}`
    );
  });

  await t('counts.skipped_daily_cap matches the cap gate\'s cheap-short-circuit design (once a provider is capped, every remaining candidate plan for them skips via skipped_daily_cap, not the later gates)', async () => {
    const fake = makeFakeSupabase(tableResponders());
    const mod = loadHandlerWithFakeSupabase(fake);
    const res = await mod.handler({});
    const body = JSON.parse(res.body);
    // PROV_AT_CAP is capped before the run starts, so all 5 plans skip via
    // skipped_daily_cap (5) rather than reaching skipped_not_on_rate_card,
    // even for the 4 plans whose item wouldn't have matched anyway — the
    // cap check is intentionally placed before the rate-card check so a
    // capped-out provider does zero further gate work. PROV_IN_RUN_CAP's
    // 1st candidate plan (item mismatch) is evaluated before it hits cap,
    // so it correctly falls through to skipped_not_on_rate_card; its
    // remaining 3 plans (after the cap-triggering insert) skip via
    // skipped_daily_cap. Total: 5 + 3 = 8.
    assert.strictEqual(body.skipped_daily_cap, 8, `expected exactly 8 daily-cap skips, got ${body.skipped_daily_cap}`);
    assert.strictEqual(body.skipped_not_on_rate_card, 4, `expected exactly 4 not-on-rate-card skips, got ${body.skipped_not_on_rate_card}`);
    assert.strictEqual(body.prefills_inserted, 3, `expected exactly 3 real inserts (1 PROV_IN_RUN_CAP + 2 PROV_UNCAPPED), got ${body.prefills_inserted}`);
  });

  console.log(`\n${passed}/4 passed`);
  if (process.exitCode) {
    console.error('SOME TESTS FAILED');
    process.exit(1);
  }
}

run();

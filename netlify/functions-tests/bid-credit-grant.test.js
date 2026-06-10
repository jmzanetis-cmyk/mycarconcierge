// ============================================================================
// Task #394 — Bid Credit Grant / Reconciler smoke tests
//
// Pure unit tests with an in-memory Supabase + Stripe stub. No live creds.
// Run via: node netlify/functions-tests/bid-credit-grant.test.js
//
// Covers the regression at the heart of Task #394: forcing a DB error on the
// bid_credit_grants insert (or the profiles fetch/update) MUST return
// { ok:false } from grantBidCredits so the Stripe webhook caller emits a 5xx
// (Stripe will retry) and MUST log an escalated ai_action_log row so admins
// are alerted — never a silent 200 with no credit row.
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

// ---------- stub module loader ----------
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

process.env.SUPABASE_URL = 'http://stub';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';
process.env.STRIPE_SECRET_KEY = 'sk_stub';

const { grantBidCredits, FAILURE_MODULE } = require(path.resolve(__dirname, '../../lib/bid-credit-grants'));
const reconciler = require(path.resolve(__dirname, '../functions/bid-credit-reconciler-scheduled'));

// ---------- supabase stub ----------
function makeSupabase({ grantInsertError = null, fetchError = null, updateError = null, existingGrants = [], existingPurchases = [], existingProfile = { id: 'prov-1', bid_credits: 5 } } = {}) {
  const tables = {
    bid_credit_grants: [...existingGrants],
    bid_credit_purchases: [...existingPurchases],
    profiles: [existingProfile],
    ai_action_log: [],
  };
  function from(name) {
    const rows = tables[name] || (tables[name] = []);
    const ctx = { _filters: [], _mode: null, _patch: null };
    function applyFilters() { return rows.filter(r => ctx._filters.every(fn => fn(r))); }
    function settle() {
      if (ctx._mode === 'update') {
        if (name === 'profiles' && updateError) return { data: null, error: updateError };
        for (const r of applyFilters()) Object.assign(r, ctx._patch);
        return { data: null, error: null };
      }
      if (ctx._mode === 'delete') {
        const keep = rows.filter(r => !ctx._filters.every(fn => fn(r)));
        rows.length = 0; rows.push(...keep);
        return { data: null, error: null };
      }
      return { data: applyFilters(), error: null };
    }
    const builder = {
      select() { return builder; },
      eq(col, val) {
        ctx._filters.push(r => r[col] === val);
        if (ctx._mode === 'update' || ctx._mode === 'delete') {
          return { then: (resolve) => resolve(settle()) };
        }
        return builder;
      },
      limit() { return builder; },
      order() { return builder; },
      async maybeSingle() {
        const f = applyFilters();
        return { data: f[0] || null, error: null };
      },
      async single() {
        if (name === 'profiles' && fetchError) return { data: null, error: fetchError };
        const f = applyFilters();
        return { data: f[0] || null, error: null };
      },
      async insert(row) {
        if (name === 'bid_credit_grants' && grantInsertError) return { data: null, error: grantInsertError };
        if (name === 'bid_credit_grants' && rows.some(r => r.transaction_id === row.transaction_id)) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        rows.push({ ...row, id: rows.length + 1 });
        return { data: null, error: null };
      },
      update(patch) { ctx._mode = 'update'; ctx._patch = patch; return builder; },
      delete() { ctx._mode = 'delete'; return builder; },
    };
    return builder;
  }
  return { from, _tables: tables };
}

async function main() {
  const baseArgs = { providerId: 'prov-1', totalBids: 10, packId: 'starter', transactionId: 'pi_test_1', requestId: 'req1', logger: { log() {}, error() {} } };

  await run('happy path: inserts grant, increments bid_credits, returns ok', async () => {
    const sb = makeSupabase();
    const result = await grantBidCredits(sb, baseArgs);
    eq(result.ok, true);
    eq(result.alreadyGranted, false);
    eq(result.newCredits, 15);
    eq(sb._tables.bid_credit_grants.length, 1);
    eq(sb._tables.profiles[0].bid_credits, 15);
    eq(sb._tables.ai_action_log.length, 0, 'no failure log on happy path');
  });

  await run('idempotent 23505: skips and returns ok+alreadyGranted, no profile mutation', async () => {
    const sb = makeSupabase({ existingGrants: [{ transaction_id: 'pi_test_1', provider_id: 'prov-1', total_bids: 10 }] });
    const result = await grantBidCredits(sb, baseArgs);
    eq(result.ok, true);
    eq(result.alreadyGranted, true);
    eq(sb._tables.profiles[0].bid_credits, 5, 'credits unchanged');
    eq(sb._tables.ai_action_log.length, 0);
  });

  await run('REGRESSION: grant_insert DB error returns ok:false (caller emits 5xx, NOT silent 200)', async () => {
    const sb = makeSupabase({ grantInsertError: { code: '08006', message: 'connection failure' } });
    const result = await grantBidCredits(sb, baseArgs);
    eq(result.ok, false);
    eq(result.stage, 'grant_insert_failed');
    truthy(result.code, 'code is set');
    eq(sb._tables.profiles[0].bid_credits, 5, 'credits NOT incremented when grant insert fails');
    eq(sb._tables.ai_action_log.length, 1, 'failure escalated to ai_action_log');
    eq(sb._tables.ai_action_log[0].module, FAILURE_MODULE);
    eq(sb._tables.ai_action_log[0].escalated, true);
    eq(sb._tables.ai_action_log[0].outcome, 'failed');
  });

  await run('REGRESSION: profile fetch error returns ok:false + cleans up grant row + logs alert', async () => {
    const sb = makeSupabase({ fetchError: { code: '57014', message: 'query canceled' } });
    const result = await grantBidCredits(sb, baseArgs);
    eq(result.ok, false);
    eq(result.stage, 'profile_fetch_failed');
    eq(sb._tables.bid_credit_grants.length, 0, 'grant row rolled back so Stripe retry can re-insert');
    eq(sb._tables.profiles[0].bid_credits, 5);
    eq(sb._tables.ai_action_log.length, 1);
  });

  await run('REGRESSION: profile update error returns ok:false + cleans up grant row + logs alert', async () => {
    const sb = makeSupabase({ updateError: { code: '23514', message: 'check violation' } });
    const result = await grantBidCredits(sb, baseArgs);
    eq(result.ok, false);
    eq(result.stage, 'profile_update_failed');
    eq(sb._tables.bid_credit_grants.length, 0);
    eq(sb._tables.profiles[0].bid_credits, 5, 'credits NOT incremented when profile update fails');
    eq(sb._tables.ai_action_log.length, 1);
  });

  await run('precheck: missing supabase rejects without DB call', async () => {
    const r = await grantBidCredits(null, baseArgs);
    eq(r.ok, false);
    eq(r.stage, 'precheck');
  });

  await run('precheck: zero totalBids rejected', async () => {
    const sb = makeSupabase();
    const r = await grantBidCredits(sb, { ...baseArgs, totalBids: 0 });
    eq(r.ok, false);
    eq(r.stage, 'precheck');
    eq(sb._tables.bid_credit_grants.length, 0);
  });

  // ---------- Reconciler tests ----------
  function makeStripe(sessions) {
    return {
      checkout: {
        sessions: {
          async list() { return { data: sessions, has_more: false }; }
        }
      }
    };
  }

  // Stub fetch for all reconciler tests: sendAdminEmail() calls fetch() when
  // missing sessions are found and must never send real emails from the test suite.
  global.fetch = async () => ({ ok: true, status: 200, text: async () => '{}', json: async () => ({}) });

  const oldSec = Math.floor((Date.now() - 2 * 60 * 60 * 1000) / 1000); // 2h ago
  const recentSec = Math.floor((Date.now() - 5 * 60 * 1000) / 1000);   // 5m ago

  await run('reconciler: flags paid bid-pack session with no grant row + logs ai_action_log', async () => {
    const sb = makeSupabase();
    const stripe = makeStripe([
      { id: 'cs_1', payment_intent: 'pi_missing', payment_status: 'paid', amount_total: 1000, created: oldSec,
        metadata: { provider_id: 'prov-1', bids: '5', bonus_bids: '0', pack_id: 'starter' } }
    ]);
    const result = await reconciler.runReconcilerImpl({ supabase: sb, stripe });
    eq(result.scanned, 1);
    eq(result.missing_count, 1);
    eq(result.missing[0].payment_intent, 'pi_missing');
    eq(sb._tables.ai_action_log.length, 1);
    eq(sb._tables.ai_action_log[0].module, 'bid_credit_grant_missing');
    eq(sb._tables.ai_action_log[0].escalated, true);
  });

  await run('reconciler: skips sessions inside the 1h grace window (webhook retry may still land)', async () => {
    const sb = makeSupabase();
    const stripe = makeStripe([
      { id: 'cs_2', payment_intent: 'pi_recent', payment_status: 'paid', amount_total: 1000, created: recentSec,
        metadata: { provider_id: 'prov-1', bids: '5' } }
    ]);
    const result = await reconciler.runReconcilerImpl({ supabase: sb, stripe });
    eq(result.scanned, 0);
    eq(result.missing_count, 0);
  });

  await run('reconciler: skips when bid_credit_purchases row already exists', async () => {
    const sb = makeSupabase({ existingPurchases: [{ stripe_payment_id: 'pi_ok', provider_id: 'prov-1', total_bids: 5 }] });
    const stripe = makeStripe([
      { id: 'cs_3', payment_intent: 'pi_ok', payment_status: 'paid', amount_total: 1000, created: oldSec,
        metadata: { provider_id: 'prov-1', bids: '5' } }
    ]);
    const result = await reconciler.runReconcilerImpl({ supabase: sb, stripe });
    eq(result.scanned, 1);
    eq(result.missing_count, 0);
    eq(sb._tables.ai_action_log.length, 0);
  });

  await run('reconciler: ignores non-bid-pack checkouts (merch, saas, no provider_id)', async () => {
    const sb = makeSupabase();
    const stripe = makeStripe([
      { id: 'cs_m', payment_intent: 'pi_m', payment_status: 'paid', amount_total: 1000, created: oldSec, metadata: { type: 'merch_order', bids: '5', provider_id: 'p1' } },
      { id: 'cs_s', payment_intent: 'pi_s', payment_status: 'paid', amount_total: 1000, created: oldSec, metadata: { type: 'saas_subscription', provider_id: 'p1' } },
      { id: 'cs_n', payment_intent: 'pi_n', payment_status: 'paid', amount_total: 1000, created: oldSec, metadata: { bids: '5' } },
      { id: 'cs_u', payment_intent: 'pi_u', payment_status: 'unpaid', amount_total: 1000, created: oldSec, metadata: { bids: '5', provider_id: 'p1' } },
    ]);
    const result = await reconciler.runReconcilerImpl({ supabase: sb, stripe });
    eq(result.scanned, 0);
    eq(result.missing_count, 0);
  });

  await run('reconciler: dedupes — already-alerted transaction not re-flagged', async () => {
    const sb = makeSupabase();
    sb._tables.ai_action_log.push({ module: 'bid_credit_grant_missing', target_id: 'pi_dup', action_type: 'paid_no_grant' });
    const stripe = makeStripe([
      { id: 'cs_d', payment_intent: 'pi_dup', payment_status: 'paid', amount_total: 1000, created: oldSec,
        metadata: { provider_id: 'prov-1', bids: '5' } }
    ]);
    const result = await reconciler.runReconcilerImpl({ supabase: sb, stripe });
    eq(result.missing_count, 0);
    eq(sb._tables.ai_action_log.length, 1, 'no duplicate alert added');
  });

  console.log(`\n${testsRun - testsFailed}/${testsRun} passed`);
  if (testsFailed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });

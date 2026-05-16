// Task #324 — coverage for Treasurer Apply paths.
//
// Exercises every branch of applyTreasurerReview / _treasurerCapture /
// _treasurerRefund / _treasurerRetryPayout / _treasurerDenyRefund /
// _treasurerEscalatePayout, plus the smoke-row guard at the
// applyAction entry. Stripe SDK is stubbed (no network/creds) and
// Supabase is faked in-process. Runs under `npm test` via
// scripts/run-function-tests.sh discovery.

const path = require('path');
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const modPath = path.resolve(__dirname, '../functions/agent-fleet-admin.js');
delete require.cache[modPath];
const admin = require(modPath);
const {
  applyAction,
  applyTreasurerReview,
  _treasurerCapture,
  _treasurerRefund,
  _treasurerRetryPayout,
  _treasurerDenyRefund,
  _treasurerEscalatePayout
} = admin.__test;

let failures = 0;
let passed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log('PASS:', label); }
  else { failures++; console.error('FAIL:', label); }
}

// ---------- Supabase fake ----------
// Chained-query shim that matches the call shape in agent-fleet-admin.js.
// Tracks every update/insert so tests can assert that side-effects fired
// (or — for the fail-closed branch — did NOT fire).
function makeSupabase({ injectErrors = {}, seed = {} } = {}) {
  const state = {
    agent_actions: [],
    care_plan_completions: [],
    care_plans: [],
    profiles: [],
    member_founder_profiles: [],
    founder_commissions: [],
    ...seed
  };
  const writes = [];

  function from(table) {
    const ctx = { table, _filters: [], _mode: null, _patch: null, _row: null };
    function rowsMatching() {
      return (state[table] || []).filter(r =>
        ctx._filters.every(([c, v, op]) => op === 'neq' ? r[c] !== v : r[c] === v));
    }
    function exec() {
      return new Promise(resolve => {
        const inj = injectErrors[`${table}.${ctx._mode || 'select'}`];
        if (inj) return resolve({ data: null, error: { message: inj } });
        if (ctx._mode === 'insert') {
          const r = { id: 'gen-' + Math.floor(Math.random() * 1e9), ...ctx._row };
          state[table] = state[table] || [];
          state[table].push(r);
          writes.push({ table, op: 'insert', row: r });
          return resolve({ data: [r], error: null });
        }
        const rows = rowsMatching();
        if (ctx._mode === 'update') {
          rows.forEach(r => Object.assign(r, ctx._patch));
          writes.push({ table, op: 'update', patch: ctx._patch, filters: ctx._filters });
          return resolve({ data: rows, error: null });
        }
        resolve({ data: rows, error: null });
      });
    }
    const builder = {
      select() { return builder; },
      eq(c, v) { ctx._filters.push([c, v, 'eq']); return builder; },
      neq(c, v) { ctx._filters.push([c, v, 'neq']); return builder; },
      gte() { return builder; },
      order() { return builder; },
      limit() { return builder; },
      range() { return builder; },
      maybeSingle() { return exec().then(r => ({ data: (r.data || [])[0] || null, error: r.error })); },
      single()      { return exec().then(r => ({ data: (r.data || [])[0] || null, error: r.error })); },
      then(res, rej) { return exec().then(res, rej); },
      update(patch) {
        ctx._mode = 'update'; ctx._patch = patch;
        return {
          eq(c, v) { ctx._filters.push([c, v, 'eq']); return this; },
          neq(c, v) { ctx._filters.push([c, v, 'neq']); return this; },
          select() { return { then: (res, rej) => exec().then(res, rej) }; },
          then(res, rej) { return exec().then(res, rej); }
        };
      },
      insert(row) {
        ctx._mode = 'insert'; ctx._row = row;
        return {
          select() {
            return { single() { return exec().then(r => ({ data: (r.data || [])[0] || null, error: r.error })); } };
          },
          then(res, rej) { return exec().then(res, rej); }
        };
      }
    };
    return builder;
  }
  return { state, writes, from };
}

// ---------- Stripe stub ----------
function makeStripe(overrides = {}) {
  const calls = { capture: [], retrieve: [], cancel: [], refund: [], payout: [], transfer: [], accountRetrieve: [] };
  const api = {
    paymentIntents: {
      capture: async (id, body, opts) => {
        calls.capture.push({ id, body, opts });
        if (overrides.captureError) throw new Error(overrides.captureError);
        return overrides.capture || { id, amount_received: 25000, amount: 25000 };
      },
      retrieve: async (id) => {
        calls.retrieve.push({ id });
        if (overrides.retrieveError) throw new Error(overrides.retrieveError);
        return overrides.retrieve || { id, status: 'succeeded', amount_received: 25000, amount: 25000 };
      },
      cancel: async (id, body, opts) => {
        calls.cancel.push({ id, body, opts });
        if (overrides.cancelError) throw new Error(overrides.cancelError);
        return { id, status: 'canceled' };
      }
    },
    refunds: {
      create: async (body, opts) => {
        calls.refund.push({ body, opts });
        if (overrides.refundError) throw new Error(overrides.refundError);
        return { id: 're_test_' + (body.amount || 0), amount: body.amount };
      }
    },
    payouts: {
      create: async (body, opts) => {
        calls.payout.push({ body, opts });
        if (overrides.payoutError) throw new Error(overrides.payoutError);
        return { id: 'po_test_' + (body.amount || 0), amount: body.amount };
      }
    },
    transfers: {
      create: async (body, opts) => {
        calls.transfer.push({ body, opts });
        if (overrides.transferError) throw new Error(overrides.transferError);
        return { id: 'tr_test_' + (body.amount || 0), amount: body.amount };
      }
    },
    accounts: {
      retrieve: async (id) => {
        calls.accountRetrieve.push({ id });
        return overrides.account || { id, payouts_enabled: true, charges_enabled: true };
      }
    }
  };
  return { api, calls };
}

function makeTreasurerAction(id, recommendation, payload = {}) {
  return {
    id,
    agent_slug: 'treasurer',
    action_type: 'review',
    review_status: 'proposed',
    decision: { recommendation, payload }
  };
}

function executedRow(sb) {
  return sb.state.agent_actions.find(r => r.action_type === 'apply' && r.agent_slug === 'treasurer');
}

(async () => {
  // ============================================================
  // 1. manual_review is rejected outright
  // ============================================================
  {
    const sb = makeSupabase();
    const action = makeTreasurerAction(1, 'manual_review', { care_plan_id: 'plan-x' });
    sb.state.agent_actions.push(action);
    const r = await applyTreasurerReview(sb, 1, action);
    ok(r.status === 400 && /manual_review/i.test(r.error),
       'manual_review is refused with 400');
    ok(!executedRow(sb), 'manual_review never marks executed');
  }

  // ============================================================
  // 2. unknown recommendation rejected
  // ============================================================
  {
    const sb = makeSupabase();
    const action = makeTreasurerAction(2, 'something_weird');
    const r = await applyTreasurerReview(sb, 2, action);
    ok(r.status === 400 && /Unknown Treasurer recommendation/.test(r.error),
       'unknown recommendation returns 400');
  }

  // ============================================================
  // 3. deny_refund: audit-only, marks completion resolved, marks executed
  // ============================================================
  {
    const sb = makeSupabase({ seed: {
      care_plan_completions: [{ id: 'cpc-d', care_plan_id: 'plan-d', status: 'open' }]
    }});
    const action = makeTreasurerAction(3, 'deny_refund', { care_plan_id: 'plan-d' });
    sb.state.agent_actions.push(action);
    const r = await _treasurerDenyRefund(sb, 3, action, { care_plan_id: 'plan-d' });
    ok(r.ok && r.denied && r.audit_warning === null, 'deny_refund returns ok/denied');
    ok(sb.state.care_plan_completions[0].status === 'resolved',
       'deny_refund marks completion resolved');
    const orig = sb.state.agent_actions.find(a => a.id === 3);
    ok(orig.review_status === 'executed', 'deny_refund stamps original action executed');
    ok(executedRow(sb), 'deny_refund writes audit-trail row');
  }

  // ============================================================
  // 4. escalate_payout: audit-only, never touches Stripe
  // ============================================================
  {
    const sb = makeSupabase();
    const action = makeTreasurerAction(4, 'escalate_payout',
      { payout_id: 'po_fail', provider_id: 'prov-1', failure_code: 'account_closed' });
    sb.state.agent_actions.push(action);
    const r = await _treasurerEscalatePayout(sb, 4, action, action.decision.payload);
    ok(r.ok && r.escalated && r.payout_id === 'po_fail',
       'escalate_payout returns ok/escalated');
    ok(sb.state.agent_actions.find(a => a.id === 4).review_status === 'executed',
       'escalate_payout stamps executed');
  }

  // ============================================================
  // 5. _treasurerCapture: missing care_plan_id → 400
  // ============================================================
  {
    const sb = makeSupabase();
    const { api } = makeStripe();
    const r = await _treasurerCapture(sb, api, 5, makeTreasurerAction(5, 'approve_capture'), {});
    ok(r.status === 400 && /care_plan_id required/.test(r.error),
       'capture without care_plan_id returns 400');
  }

  // ============================================================
  // 6. _treasurerCapture: success + commission skipped (no referrer)
  // ============================================================
  {
    const sb = makeSupabase({ seed: {
      care_plan_completions: [{
        id: 'cpc-1', care_plan_id: 'plan-1', provider_id: 'prov-1',
        stripe_payment_intent_id: 'pi_1', payment_capture_status: 'requires_capture',
        founder_commission_status: 'none', created_at: '2026-05-15T00:00:00Z'
      }],
      care_plans: [{ id: 'plan-1', payment_status: 'pending', status: 'open' }],
      profiles: [{ id: 'prov-1', referred_by_founder_id: null }]
    }});
    const action = makeTreasurerAction(6, 'approve_capture', { care_plan_id: 'plan-1' });
    sb.state.agent_actions.push(action);
    const { api, calls } = makeStripe();
    const r = await _treasurerCapture(sb, api, 6, action, { care_plan_id: 'plan-1' });
    ok(r.ok && r.captured && r.captured_amount === 250,
       'capture returns ok with $250 captured');
    ok(calls.capture[0]?.opts?.idempotencyKey === 'treasurer_apply_capture_6',
       'capture uses deterministic idempotency key');
    ok(sb.state.care_plan_completions[0].payment_capture_status === 'captured',
       'cpc.payment_capture_status flipped to captured');
    ok(sb.state.care_plans[0].payment_status === 'captured' && sb.state.care_plans[0].status === 'completed',
       'care_plans row updated to captured/completed');
    ok(r.commission && r.commission.skipped && r.commission.reason === 'no_referrer',
       'commission skipped (no founder referrer)');
    ok(sb.state.agent_actions.find(a => a.id === 6).review_status === 'executed',
       'original action stamped executed');
  }

  // ============================================================
  // 7. _treasurerCapture: success + commission payout fires
  // ============================================================
  {
    const sb = makeSupabase({ seed: {
      care_plan_completions: [{
        id: 'cpc-2', care_plan_id: 'plan-2', provider_id: 'prov-2',
        stripe_payment_intent_id: 'pi_2', payment_capture_status: 'requires_capture',
        founder_commission_status: 'none', created_at: '2026-05-15T00:00:00Z'
      }],
      care_plans: [{ id: 'plan-2', payment_status: 'pending', status: 'open' }],
      profiles: [{ id: 'prov-2', referred_by_founder_id: 'founder-user-1' }],
      member_founder_profiles: [{
        id: 'mf-1', user_id: 'founder-user-1', email: 'jane@example.com',
        stripe_connect_account_id: 'acct_founder', instant_payout_enabled: true,
        payout_preference: 'instant', referral_code: 'JANE', status: 'active'
      }]
    }});
    const action = makeTreasurerAction(7, 'approve_capture', { care_plan_id: 'plan-2' });
    sb.state.agent_actions.push(action);
    const { api, calls } = makeStripe();
    const r = await _treasurerCapture(sb, api, 7, action, { care_plan_id: 'plan-2' });
    ok(r.ok && r.captured, 'capture w/ commission returns ok');
    ok(calls.transfer.length === 1, 'one Stripe transfer fired for commission');
    ok(calls.transfer[0].body.destination === 'acct_founder',
       'transfer destination is founder connect account');
    ok(calls.transfer[0].body.amount === 12500,
       'transfer amount = 50% of $250 = 12500 cents');
    ok(r.commission && r.commission.transferId && r.commission.amount === 125,
       'commissionResult includes transferId + $125 amount');
    const fc = sb.state.founder_commissions[0];
    ok(fc && fc.status === 'paid' && fc.stripe_transfer_id === r.commission.transferId,
       'founder_commissions row written as paid');
    ok(sb.state.care_plan_completions[0].founder_commission_status === 'paid',
       'cpc.founder_commission_status updated to paid');
  }

  // ============================================================
  // 8. _treasurerCapture: already captured → no-op + executed
  // ============================================================
  {
    const sb = makeSupabase({ seed: {
      care_plan_completions: [{
        id: 'cpc-3', care_plan_id: 'plan-3', provider_id: 'prov-3',
        stripe_payment_intent_id: 'pi_3', payment_capture_status: 'captured',
        founder_commission_status: 'paid', created_at: '2026-05-15T00:00:00Z'
      }]
    }});
    const action = makeTreasurerAction(8, 'approve_capture', { care_plan_id: 'plan-3' });
    sb.state.agent_actions.push(action);
    const { api, calls } = makeStripe();
    const r = await _treasurerCapture(sb, api, 8, action, { care_plan_id: 'plan-3' });
    ok(r.ok && r.already_captured === true && calls.capture.length === 0,
       'already-captured short-circuits without calling Stripe');
    ok(sb.state.agent_actions.find(a => a.id === 8).review_status === 'executed',
       'already-captured still stamps executed');
  }

  // ============================================================
  // 9. _treasurerCapture: DB update fails AFTER Stripe capture
  //    → MUST NOT mark executed; surfaces fail-closed 500
  // ============================================================
  {
    const sb = makeSupabase({
      seed: {
        care_plan_completions: [{
          id: 'cpc-4', care_plan_id: 'plan-4', provider_id: 'prov-4',
          stripe_payment_intent_id: 'pi_4', payment_capture_status: 'requires_capture',
          founder_commission_status: 'none', created_at: '2026-05-15T00:00:00Z'
        }],
        care_plans: [{ id: 'plan-4', payment_status: 'pending', status: 'open' }]
      },
      injectErrors: { 'care_plan_completions.update': 'connection reset' }
    });
    const action = makeTreasurerAction(9, 'approve_capture', { care_plan_id: 'plan-4' });
    sb.state.agent_actions.push(action);
    const { api, calls } = makeStripe();
    const r = await _treasurerCapture(sb, api, 9, action, { care_plan_id: 'plan-4' });
    ok(r.status === 500 && /capture succeeded but DB update failed/.test(r.error),
       'fail-closed: DB update failure after Stripe capture returns 500');
    ok(/safe to retry/.test(r.error),
       'error mentions safe-to-retry (Stripe idempotency)');
    ok(calls.capture.length === 1, 'Stripe was called exactly once');
    ok(sb.state.agent_actions.find(a => a.id === 9).review_status === 'proposed',
       'fail-closed: original action NOT marked executed');
    ok(!executedRow(sb), 'fail-closed: no audit-trail apply row was written');
  }

  // ============================================================
  // 10. _treasurerRefund on requires_capture → cancel path
  // ============================================================
  {
    const sb = makeSupabase({ seed: {
      care_plan_completions: [{
        id: 'cpc-5', care_plan_id: 'plan-5',
        stripe_payment_intent_id: 'pi_5', payment_capture_status: 'requires_capture',
        captured_amount: null, refund_amount: null, created_at: '2026-05-15T00:00:00Z'
      }],
      care_plans: [{ id: 'plan-5', payment_status: 'authorized' }]
    }});
    const action = makeTreasurerAction(10, 'approve_refund', { care_plan_id: 'plan-5' });
    sb.state.agent_actions.push(action);
    const { api, calls } = makeStripe({ retrieve: { id: 'pi_5', status: 'requires_capture', amount: 25000 } });
    const r = await _treasurerRefund(sb, api, 10, action, { care_plan_id: 'plan-5' });
    ok(r.ok && r.cancelled && r.refund_amount === 0 && r.is_full === true,
       'requires_capture path cancels with $0 refund');
    ok(calls.cancel.length === 1 && calls.cancel[0].opts.idempotencyKey === 'treasurer_apply_cancel_10',
       'PI cancel called with idempotency key');
    ok(calls.refund.length === 0, 'no refund issued on cancel path');
    ok(sb.state.care_plans[0].payment_status === 'cancelled',
       'care_plans.payment_status flipped to cancelled');
    ok(sb.state.agent_actions.find(a => a.id === 10).review_status === 'executed',
       'cancel path stamps executed');
  }

  // ============================================================
  // 11. _treasurerRefund on succeeded → full refund (no payload.amount)
  // ============================================================
  {
    const sb = makeSupabase({ seed: {
      care_plan_completions: [{
        id: 'cpc-6', care_plan_id: 'plan-6',
        stripe_payment_intent_id: 'pi_6', payment_capture_status: 'captured',
        captured_amount: 250, created_at: '2026-05-15T00:00:00Z'
      }],
      care_plans: [{ id: 'plan-6', payment_status: 'captured' }]
    }});
    const action = makeTreasurerAction(11, 'approve_refund', { care_plan_id: 'plan-6' });
    sb.state.agent_actions.push(action);
    const { api, calls } = makeStripe({ retrieve: { id: 'pi_6', status: 'succeeded', amount_received: 25000, amount: 25000 } });
    const r = await _treasurerRefund(sb, api, 11, action, { care_plan_id: 'plan-6' });
    ok(r.ok && r.refunded && r.is_full === true && r.refund_amount === 250,
       'full refund returns is_full + $250');
    ok(calls.refund[0].body.amount === 25000, 'Stripe refund called for 25000 cents');
    ok(calls.refund[0].opts.idempotencyKey === 'treasurer_apply_refund_11_25000',
       'refund uses amount-scoped idempotency key');
    ok(sb.state.care_plan_completions[0].payment_capture_status === 'refunded',
       'cpc marked refunded');
    ok(sb.state.care_plans[0].payment_status === 'refunded',
       'care_plans marked refunded');
  }

  // ============================================================
  // 12. _treasurerRefund: partial refund (amount < PI amount)
  // ============================================================
  {
    const sb = makeSupabase({ seed: {
      care_plan_completions: [{
        id: 'cpc-7', care_plan_id: 'plan-7',
        stripe_payment_intent_id: 'pi_7', payment_capture_status: 'captured',
        captured_amount: 250, created_at: '2026-05-15T00:00:00Z'
      }],
      care_plans: [{ id: 'plan-7', payment_status: 'captured' }]
    }});
    const action = makeTreasurerAction(12, 'approve_refund', { care_plan_id: 'plan-7', amount: 100 });
    sb.state.agent_actions.push(action);
    const { api, calls } = makeStripe({ retrieve: { id: 'pi_7', status: 'succeeded', amount_received: 25000, amount: 25000 } });
    const r = await _treasurerRefund(sb, api, 12, action, { care_plan_id: 'plan-7', amount: 100 });
    ok(r.ok && r.refunded && r.is_full === false && r.refund_amount === 100,
       'partial refund returns is_full:false + $100');
    ok(calls.refund[0].body.amount === 10000, 'Stripe refund called for 10000 cents');
    ok(sb.state.care_plan_completions[0].payment_capture_status === 'partially_refunded',
       'cpc marked partially_refunded');
    ok(sb.state.care_plans[0].payment_status === 'partially_refunded',
       'care_plans marked partially_refunded');
  }

  // ============================================================
  // 13. _treasurerRefund: requested amount bounded by PI amount
  // ============================================================
  {
    const sb = makeSupabase({ seed: {
      care_plan_completions: [{
        id: 'cpc-8', care_plan_id: 'plan-8',
        stripe_payment_intent_id: 'pi_8', payment_capture_status: 'captured',
        captured_amount: 250, created_at: '2026-05-15T00:00:00Z'
      }],
      care_plans: [{ id: 'plan-8', payment_status: 'captured' }]
    }});
    const action = makeTreasurerAction(13, 'approve_refund', { care_plan_id: 'plan-8', amount: 99999 });
    sb.state.agent_actions.push(action);
    const { api, calls } = makeStripe({ retrieve: { id: 'pi_8', status: 'succeeded', amount_received: 25000, amount: 25000 } });
    const r = await _treasurerRefund(sb, api, 13, action, { care_plan_id: 'plan-8', amount: 99999 });
    ok(r.ok && r.refund_amount === 250 && r.is_full === true,
       'over-request is capped at PI amount and treated as full');
    ok(calls.refund[0].body.amount === 25000,
       'Stripe refund called for capped 25000 cents (not 9999900)');
  }

  // ============================================================
  // 14. _treasurerRefund: PI in unsupported status → 409
  // ============================================================
  {
    const sb = makeSupabase({ seed: {
      care_plan_completions: [{
        id: 'cpc-9', care_plan_id: 'plan-9',
        stripe_payment_intent_id: 'pi_9', payment_capture_status: 'captured',
        created_at: '2026-05-15T00:00:00Z'
      }]
    }});
    const { api } = makeStripe({ retrieve: { id: 'pi_9', status: 'processing', amount: 25000 } });
    const r = await _treasurerRefund(sb, api, 14, makeTreasurerAction(14, 'approve_refund'), { care_plan_id: 'plan-9' });
    ok(r.status === 409 && /Cannot refund PaymentIntent in status: processing/.test(r.error),
       'unsupported PI status returns 409');
  }

  // ============================================================
  // 15. _treasurerRetryPayout: missing payload → 400
  // ============================================================
  {
    const sb = makeSupabase();
    const { api } = makeStripe();
    const r1 = await _treasurerRetryPayout(sb, api, 15, makeTreasurerAction(15, 'retry_payout'), {});
    ok(r1.status === 400 && /provider_id required/.test(r1.error),
       'retry_payout without provider_id → 400');
    const r2 = await _treasurerRetryPayout(sb, api, 15, makeTreasurerAction(15, 'retry_payout'), { provider_id: 'p' });
    ok(r2.status === 400 && /amount required/.test(r2.error),
       'retry_payout without amount → 400');
  }

  // ============================================================
  // 16. _treasurerRetryPayout: provider missing stripe_account_id → 400
  // ============================================================
  {
    const sb = makeSupabase({ seed: {
      profiles: [{ id: 'prov-noacct', stripe_account_id: null }]
    }});
    const { api } = makeStripe();
    const r = await _treasurerRetryPayout(sb, api, 16, makeTreasurerAction(16, 'retry_payout'),
      { provider_id: 'prov-noacct', amount: 50 });
    ok(r.status === 400 && /missing stripe_account_id/.test(r.error),
       'provider missing stripe_account_id rejected (escalate instead)');
  }

  // ============================================================
  // 17. _treasurerRetryPayout: success
  // ============================================================
  {
    const sb = makeSupabase({ seed: {
      profiles: [{ id: 'prov-ok', stripe_account_id: 'acct_prov' }]
    }});
    const action = makeTreasurerAction(17, 'retry_payout',
      { provider_id: 'prov-ok', amount: 75.5, currency: 'USD', payout_id: 'po_orig' });
    sb.state.agent_actions.push(action);
    const { api, calls } = makeStripe();
    const r = await _treasurerRetryPayout(sb, api, 17, action,
      { provider_id: 'prov-ok', amount: 75.5, currency: 'USD', payout_id: 'po_orig' });
    ok(r.ok && r.retried && r.amount === 75.5 && r.currency === 'usd',
       'retry_payout success returns ok + lowercased currency');
    ok(calls.payout[0].body.amount === 7550 && calls.payout[0].opts.stripeAccount === 'acct_prov',
       'payout fired against provider connected account');
    ok(calls.payout[0].opts.idempotencyKey === 'treasurer_apply_retry_payout_17',
       'payout uses deterministic idempotency key');
    ok(r.new_payout_id && r.new_payout_id.startsWith('po_test_'),
       'new payout id surfaced in response');
    ok(sb.state.agent_actions.find(a => a.id === 17).review_status === 'executed',
       'retry_payout stamps executed');
  }

  // ============================================================
  // 18. _treasurerRetryPayout: Stripe payout failure → 502, no executed
  // ============================================================
  {
    const sb = makeSupabase({ seed: {
      profiles: [{ id: 'prov-fail', stripe_account_id: 'acct_fail' }]
    }});
    const action = makeTreasurerAction(18, 'retry_payout',
      { provider_id: 'prov-fail', amount: 50 });
    sb.state.agent_actions.push(action);
    const { api } = makeStripe({ payoutError: 'balance insufficient' });
    const r = await _treasurerRetryPayout(sb, api, 18, action, { provider_id: 'prov-fail', amount: 50 });
    ok(r.status === 502 && /Stripe payout retry failed/.test(r.error) && /balance insufficient/.test(r.error),
       'Stripe failure surfaces 502 with underlying message');
    ok(sb.state.agent_actions.find(a => a.id === 18).review_status === 'proposed',
       'failed payout never stamps executed');
  }

  // ============================================================
  // 19. Smoke-row guard: applyAction refuses payload.__smoke=true
  // ============================================================
  {
    const sb = makeSupabase();
    const smokeAction = {
      id: 19,
      agent_slug: 'treasurer',
      action_type: 'review',
      review_status: 'proposed',
      decision: { recommendation: 'approve_capture', payload: { care_plan_id: 'plan-smoke', __smoke: true } }
    };
    sb.state.agent_actions.push(smokeAction);
    const r = await applyAction(sb, 19);
    ok(r.status === 400 && /synthetic smoke proposal/.test(r.error),
       'applyAction blocks synthetic smoke rows');
    ok(sb.state.agent_actions.find(a => a.id === 19).review_status === 'proposed',
       'smoke row never flips to executed');
  }

  // ============================================================
  // 20. Smoke-row guard works with JSON-string decision too
  // ============================================================
  {
    const sb = makeSupabase();
    const smokeAction = {
      id: 20,
      agent_slug: 'treasurer',
      action_type: 'review',
      review_status: 'proposed',
      decision: JSON.stringify({ recommendation: 'approve_refund', payload: { care_plan_id: 'plan-smoke', __smoke: true } })
    };
    sb.state.agent_actions.push(smokeAction);
    const r = await applyAction(sb, 20);
    ok(r.status === 400 && /synthetic smoke proposal/.test(r.error),
       'smoke guard parses stringified decision');
  }

  // ============================================================
  // 21. applyAction routes treasurer reviews through applyTreasurerReview
  //     (verifies the manual_review reject reaches us via the entry point)
  // ============================================================
  {
    const sb = makeSupabase();
    const action = makeTreasurerAction(21, 'manual_review', {});
    sb.state.agent_actions.push(action);
    const r = await applyAction(sb, 21);
    ok(r.status === 400 && /manual_review/i.test(r.error),
       'applyAction → treasurer review → manual_review rejection');
  }

  // ============================================================
  // 22. End-to-end happy path through applyTreasurerReview (validates
  //     dispatch + _getStripe() init path together, not just helpers).
  //     Stubs the real `require('stripe')` so no live SDK call is made.
  // ============================================================
  {
    // agent-fleet-admin.js has a sibling node_modules/ (netlify/functions/
    // node_modules/stripe) that wins resolution over the workspace root,
    // so we must resolve stripe from the admin module's perspective —
    // otherwise our cache override targets the wrong filename key and
    // the real Stripe SDK gets loaded instead.
    const stripeResolved = require.resolve('stripe', { paths: [path.dirname(modPath)] });
    const originalEntry = require.cache[stripeResolved];
    const { api: stubApi, calls } = makeStripe();
    require.cache[stripeResolved] = {
      id: stripeResolved, filename: stripeResolved, loaded: true,
      exports: (_key, _opts) => stubApi
    };
    try {
      const sb = makeSupabase({ seed: {
        care_plan_completions: [{
          id: 'cpc-e2e', care_plan_id: 'plan-e2e', provider_id: 'prov-e2e',
          stripe_payment_intent_id: 'pi_e2e', payment_capture_status: 'requires_capture',
          founder_commission_status: 'none', created_at: '2026-05-15T00:00:00Z'
        }],
        care_plans: [{ id: 'plan-e2e', payment_status: 'pending', status: 'open' }],
        profiles: [{ id: 'prov-e2e', referred_by_founder_id: null }]
      }});
      const action = makeTreasurerAction(22, 'approve_capture', { care_plan_id: 'plan-e2e' });
      sb.state.agent_actions.push(action);
      const r = await applyTreasurerReview(sb, 22, action);
      ok(r.ok && r.captured && r.captured_amount === 250,
         'e2e: applyTreasurerReview dispatched approve_capture + Stripe init succeeded');
      ok(calls.capture.length === 1 && calls.capture[0].opts.idempotencyKey === 'treasurer_apply_capture_22',
         'e2e: Stripe capture called via _getStripe() with idempotency key');
      ok(sb.state.agent_actions.find(a => a.id === 22).review_status === 'executed',
         'e2e: original action stamped executed via full dispatch');
    } finally {
      if (originalEntry) require.cache[stripeResolved] = originalEntry;
      else delete require.cache[stripeResolved];
    }
  }

  if (failures) {
    console.error(`\n${failures} failure(s) / ${passed} pass(es)`);
    process.exit(1);
  }
  console.log(`\nAll Task #324 Treasurer apply checks passed (${passed} assertions).`);
})().catch(e => { console.error('test threw:', e); process.exit(1); });

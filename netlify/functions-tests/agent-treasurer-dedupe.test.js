// Task #325 — Automated regression for Treasurer duplicate-event protection.
//
// Task #320 added two layers of dedupe to netlify/functions/agent-treasurer.js:
//   1. Application-level guard via findExistingTreasurerAction (skips the LLM
//      call when a proposed/executed review row already exists for the same
//      event_type + payment_id|payout_id|care_plan_id).
//   2. DB-level backstop via the unique partial indexes in
//      supabase/migrations/20260514b_treasurer_review_unique.sql.
//
// This test exercises layer (2): two near-simultaneous Promise.all-style
// invocations both pass the application guard (the lookup table is empty),
// both call the LLM, and both attempt to INSERT a proposed row. We simulate
// the Postgres 23505 unique-violation in the fake logAction so the second
// insert fails the way it would in prod. The assertion: exactly ONE
// `proposed` row + exactly ONE `skipped` row tagged
// dedupe_source='db_unique_index' land in agent_actions, and the two HTTP
// responses are { success: true, recommendation: ... } and
// { success: true, reason: 'already_reviewed' }.
//
// Each scenario covers a different lifecycle key:
//   - payment.captured        → dedupe on payment_id
//   - payment.refund_requested → dedupe on care_plan_id only (no payment_id)
//   - payout.failed           → dedupe on payout_id
//
// No real DB / Stripe / Anthropic calls are made; the runtime functions
// (getSupabase, getAgent, callLLM, logAction, loadActivePrompt) are stubbed
// in-process before agent-treasurer.js is required, so cleanup is implicit.

'use strict';

const path = require('node:path');

process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-pw-treasurer-dedupe';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'sk-test-dummy';

// ---------------------------------------------------------------------------
// Override runtime exports BEFORE requiring agent-treasurer. The handler
// destructures these names at module-load time, so any later mutation of the
// runtime module would be ignored.
// ---------------------------------------------------------------------------
const runtimePath = require.resolve('../functions/agent-fleet-runtime');
delete require.cache[runtimePath];
const runtime = require(runtimePath);

const audit = [];           // every logAction call lands here
const proposedKeys = new Set(); // simulates the DB unique partial index

function dedupeKey(decision) {
  if (!decision) return null;
  const et = decision.event_type;
  const p = decision.payload || {};
  // Mirrors the index scope: per event_type, on whichever key is present.
  // For payment.captured / payment.refund_requested we prefer payment_id,
  // falling back to care_plan_id (matches both unique indexes in the
  // migration). For payout.failed we use payout_id.
  if (et === 'payout.failed') return `${et}::payout::${p.payout_id || 'none'}`;
  if (p.payment_id)  return `${et}::pi::${p.payment_id}`;
  if (p.care_plan_id) return `${et}::cp::${p.care_plan_id}`;
  return `${et}::none`;
}

// Fake supabase whose every query returns empty / null. The treasurer
// handler only touches supabase via findExistingTreasurerAction (returns
// null → application guard passes) and via the various context loaders
// (return { missing: true } shapes — harmless to the dedupe path).
function makeFakeSupabase() {
  function builder() {
    const b = {
      select() { return b; },
      eq()     { return b; },
      neq()    { return b; },
      or()     { return b; },
      order()  { return b; },
      limit()  { return b; },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      single()      { return Promise.resolve({ data: null, error: null }); },
      then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej); }
    };
    return b;
  }
  return { from() { return builder(); } };
}

runtime.getSupabase = () => makeFakeSupabase();

runtime.getAgent = async () => ({
  slug: 'treasurer', enabled: true, autonomy: 'propose', model: 'claude-sonnet-4-5',
  daily_spend_cap_usd: 5
});

runtime.loadActivePrompt = async (_sb, _slug, fallback) => fallback;

runtime.callLLM = async () => ({
  text: JSON.stringify({
    recommendation: 'approve_capture',
    confidence: 0.9,
    reasoning: 'test stub',
    concerns: []
  }),
  tokensIn: 10, tokensOut: 10, costUsd: 0.0001, model: 'claude-sonnet-4-5'
});

runtime.logAction = async (_sb, args) => {
  // Simulate the DB unique partial index: only one proposed review row
  // per (event_type, key) can ever exist. Second insert fails 23505,
  // exactly like Postgres would in prod — and crucially, no row lands in
  // agent_actions on that failure, so we don't push it to the audit array.
  if (args.actionType === 'review' && args.status === 'proposed') {
    const k = dedupeKey(args.decision);
    if (proposedKeys.has(k)) {
      return {
        id: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "agent_actions_treasurer_review_unique_*"'
        }
      };
    }
    proposedKeys.add(k);
  }
  // Successful insert — snapshot it for the test to assert on.
  audit.push({
    actionType: args.actionType,
    status: args.status,
    decision: args.decision,
    eventId: args.eventId,
    reasoning: args.reasoning
  });
  return { id: audit.length };
};

// Now safe to require the handler — its destructured runtime refs will
// resolve to the stubs above.
const treasurerPath = require.resolve('../functions/agent-treasurer');
delete require.cache[treasurerPath];
const { handler } = require(treasurerPath);

// ---------------------------------------------------------------------------
// Test scaffolding (matches the other functions-tests files).
// ---------------------------------------------------------------------------
let passed = 0;
let failures = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log('PASS:', label); }
  else      { failures++; console.error('FAIL:', label); }
}

function makeRequest(envelope) {
  return {
    httpMethod: 'POST',
    headers: { 'x-admin-password': process.env.ADMIN_PASSWORD },
    body: JSON.stringify(envelope)
  };
}

async function runRaceScenario(label, envelope) {
  audit.length = 0;
  proposedKeys.clear();

  const req = makeRequest(envelope);
  // Two parallel invocations of the same event. Both will see empty
  // findExistingTreasurerAction results (fake supabase returns []), both
  // will reach the proposed insert; the fake logAction simulates 23505 on
  // the second insert, which the handler must convert into a `skipped`
  // audit row tagged dedupe_source='db_unique_index'.
  const [r1, r2] = await Promise.all([handler(req), handler(req)]);

  ok(r1.statusCode === 200, `${label}: first call returned 200`);
  ok(r2.statusCode === 200, `${label}: second call returned 200`);

  const b1 = JSON.parse(r1.body);
  const b2 = JSON.parse(r2.body);

  const successWithRec = [b1, b2].filter(b => b && b.success && b.recommendation);
  const successAlready = [b1, b2].filter(b => b && b.success && b.reason === 'already_reviewed');
  ok(successWithRec.length === 1, `${label}: exactly one caller received a recommendation`);
  ok(successAlready.length === 1, `${label}: exactly one caller short-circuited to already_reviewed`);

  const proposedRows = audit.filter(a => a.actionType === 'review' && a.status === 'proposed');
  const skippedDbRows = audit.filter(a =>
    a.actionType === 'review' &&
    a.status === 'skipped' &&
    a.decision && a.decision.dedupe_source === 'db_unique_index'
  );
  const otherSkipped = audit.filter(a =>
    a.actionType === 'review' &&
    a.status === 'skipped' &&
    (!a.decision || a.decision.dedupe_source !== 'db_unique_index')
  );

  ok(proposedRows.length === 1,
     `${label}: exactly 1 proposed row landed (got ${proposedRows.length})`);
  ok(skippedDbRows.length === 1,
     `${label}: exactly 1 skipped(dedupe_source=db_unique_index) row landed (got ${skippedDbRows.length})`);
  ok(otherSkipped.length === 0,
     `${label}: no other skipped rows (got ${otherSkipped.length})`);

  // The skipped row must carry the original event_type + payload so an
  // operator can correlate it back to the duplicate dispatch.
  const skip = skippedDbRows[0];
  ok(skip && skip.decision && skip.decision.event_type === envelope.event_type,
     `${label}: skipped row preserves event_type=${envelope.event_type}`);
}

// ---------------------------------------------------------------------------
// Scenarios — one per dedupe key path the migration creates an index for.
// ---------------------------------------------------------------------------
(async () => {
  try {
    await runRaceScenario('payment.captured (payment_id)', {
      event_type: 'payment.captured',
      event_id: 'evt-cap-' + Date.now(),
      payload: {
        payment_id:   'pi_test_dedupe_capture',
        care_plan_id: 'cp_test_dedupe_capture',
        member_id:    'm-dedupe-1',
        provider_id:  'p-dedupe-1',
        amount:       250,
        currency:     'usd',
        captured_at:  new Date().toISOString()
      }
    });

    await runRaceScenario('payment.refund_requested (care_plan_id only)', {
      event_type: 'payment.refund_requested',
      event_id: 'evt-refund-' + Date.now(),
      payload: {
        // Deliberately NO payment_id — exercises the care_plan_id-scoped
        // index (agent_actions_treasurer_review_unique_refund_care_plan).
        care_plan_id: 'cp_test_dedupe_refund_only',
        member_id:    'm-dedupe-2',
        amount:       125,
        currency:     'usd',
        reason:       'work_not_completed',
        requested_at: new Date().toISOString()
      }
    });

    await runRaceScenario('payout.failed (payout_id)', {
      event_type: 'payout.failed',
      event_id: 'evt-payout-' + Date.now(),
      payload: {
        payout_id:    'po_test_dedupe_failed',
        provider_id:  'p-dedupe-3',
        amount:       75,
        currency:     'usd',
        failure_code: 'account_inactive',
        failed_at:    new Date().toISOString()
      }
    });

    console.log(`\n${passed} passed, ${failures} failed`);
    if (failures > 0) process.exit(1);
  } catch (e) {
    console.error('FATAL:', e.stack || e.message);
    process.exit(1);
  }
})();

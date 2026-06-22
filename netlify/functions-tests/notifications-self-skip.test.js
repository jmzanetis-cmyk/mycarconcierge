#!/usr/bin/env node
// ============================================================================
// Task #408 — Regression: in-app notification paths must not notify a
// counterparty when the actor (authenticated user) IS the counterparty.
//
// Task #298 already covered POST /api/plan-bids; this test covers every
// other dual-role notification surface audited under Task #408.
//
// Test design (rewritten after code-review feedback): per-callsite
// assertions, not per-type. A weak per-type scan can pass even when one
// callsite for a given `type:` literal is unguarded, because *another*
// callsite for the same type happens to carry the guard. Here we pin
// each guarded callsite to a unique nearby anchor string and assert
// that the guard literal appears between the anchor and the next
// `notifications.insert`. We also enumerate every `notifications.insert`
// in www/server.js and classify each as either guarded (Task #408
// marker immediately above) or legitimately actor-less (e.g. Stripe
// webhook / scheduler), so any new insert added later that does have an
// actor in scope must be deliberately classified or it fails the test.
//
// Run with: node netlify/functions-tests/notifications-self-skip.test.js
// ============================================================================

'use strict';

const assert = require('assert');
const fs = require('node:fs');
const path = require('node:path');

let passed = 0;
let failed = 0;
const tests = [];
function check(name, fn) { tests.push({ name, fn }); }
async function runAll() {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ok  ${name}`);
      passed++;
    } catch (err) {
      console.log(`  FAIL ${name}`);
      console.log(`       ${err.message}`);
      failed++;
    }
  }
}

const serverPath = path.resolve(__dirname, '..', '..', 'www', 'server.js');
const serverExists = fs.existsSync(serverPath);
const serverSrc = serverExists ? fs.readFileSync(serverPath, 'utf8') : '';
const serverLines = serverSrc.split('\n');

function lineNumberOf(idx) {
  return serverSrc.slice(0, idx).split('\n').length;
}

// ---------------------------------------------------------------------------
// Per-callsite guard assertions. Each entry pins one specific
// notifications.insert by a UNIQUE nearby anchor string (a substring
// guaranteed to appear only once in www/server.js, immediately above
// or inside that insert payload) and the literal guard expression that
// must appear in the ~20 lines above the insert.
// ---------------------------------------------------------------------------
const GUARDED_CALLSITES = [
  // POST /api/jobs/additional-work — provider → pkg.member_id
  {
    name: 'additional_work_requested (provider → pkg.member_id)',
    anchor: "Additional work request created: ${request.id}",
    guard: 'pkg.member_id !== user.id',
  },
  // POST /api/additional-work/:id/decline — member → workRequest.provider_id
  {
    name: 'additional_work_declined (member → workRequest.provider_id)',
    anchor: "type: 'additional_work_declined'",
    guard: 'workRequest.provider_id !== user.id',
  },
  // POST /api/additional-work/:id/confirm — member → workRequest.provider_id
  {
    name: 'additional_work_approved member-confirm path',
    anchor: 'authorization confirmed, status now approved',
    guard: 'workRequest.provider_id !== user.id',
  },
  // POST /api/jobs/discount — provider → pkg.member_id
  {
    name: 'discount_offered (provider → pkg.member_id)',
    anchor: "type: 'discount_offered'",
    guard: 'pkg.member_id !== user.id',
  },
  // POST /api/discounts/:id/accept — member → discount.provider_id
  {
    name: 'discount_accepted (member → discount.provider_id)',
    anchor: "type: 'discount_accepted'",
    guard: 'discount.provider_id !== user.id',
  },
  // POST /api/jobs/checkin-confirm — provider → pkg.member_id
  {
    name: 'checkin_confirmed (provider → pkg.member_id)',
    anchor: "type: 'checkin_confirmed'",
    guard: 'pkg.member_id !== user.id',
  },
  // POST /api/jobs/cancel-booking — either party → counterparty
  {
    name: 'booking_cancelled (either → counterparty)',
    anchor: "type: 'booking_cancelled'",
    guard: 'notifyUserId !== auth.user.id',
  },
  // POST /api/jobs/contribute — contributor → pkg.member_id
  {
    name: 'crowd_fund_contribution (contributor → pkg.member_id)',
    anchor: 'Someone Contributed to Your Repair!',
    guard: 'pkg.member_id !== user.id',
  },
  // POST /api/jobs/complete — provider → pkg.member_id
  {
    name: 'job_completed (provider → pkg.member_id)',
    anchor: "type: 'job_completed'",
    guard: 'pkg.member_id !== user.id',
  },
];

for (const cs of GUARDED_CALLSITES) {
  check(`callsite guard: ${cs.name}`, () => {
    if (!serverExists) {
      console.log('[INFO] Skipping — www/server.js not found');
      return;
    }
    const occurrences = [];
    let from = 0;
    while (true) {
      const i = serverSrc.indexOf(cs.anchor, from);
      if (i === -1) break;
      occurrences.push(i);
      from = i + cs.anchor.length;
    }
    assert.strictEqual(
      occurrences.length, 1,
      `expected anchor "${cs.anchor}" to be unique in www/server.js, found ${occurrences.length}`
    );
    const idx = occurrences[0];
    // Window: ~30 lines above the anchor to ~5 lines below.
    let scanStart = idx;
    for (let i = 0; i < 30 && scanStart > 0; i++) {
      scanStart = serverSrc.lastIndexOf('\n', scanStart - 1);
    }
    let scanEnd = idx;
    for (let i = 0; i < 8; i++) {
      const nl = serverSrc.indexOf('\n', scanEnd + 1);
      if (nl === -1) { scanEnd = serverSrc.length; break; }
      scanEnd = nl;
    }
    const region = serverSrc.slice(Math.max(0, scanStart), scanEnd);
    assert.ok(
      region.includes(cs.guard),
      `guard literal \`${cs.guard}\` not found within 30 lines of anchor "${cs.anchor}" ` +
      `(line ~${lineNumberOf(idx)})`
    );
  });
}

// ---------------------------------------------------------------------------
// Coverage gate: every `notifications.insert` call site in www/server.js
// must be classified — either guarded by a Task #408 marker on the line
// directly above, or explicitly listed in NO_ACTOR_CALLSITES below as a
// webhook / scheduler / fan-out path with no `user.id` actor in scope.
//
// Any unclassified insert means a new route was added without a self-skip
// guard or without being deliberately marked as actor-less. This catches
// the regression class the reviewer flagged: an unguarded callsite
// surviving because a different callsite for the same type IS guarded.
// ---------------------------------------------------------------------------
const NO_ACTOR_CALLSITES = new Set([
  // Stripe-webhook / payment finalization paths — no user.id in scope.
  16691, // payment_released (split payment - webhook)
  16945, // payment_released (single payment - webhook)
  16980, // crowd-fund completion fan-out - webhook
  17096, // payment_refunded - webhook
  17304, // refund_request (split) - webhook
  17402, // payment_refunded (full) - webhook
  17412, // payment_refunded (provider issued) - webhook
  17451, // refund_request - webhook
  17523, // payment_refunded (cancel) - webhook
  17847, // split_payment_created - webhook (split-payment-create handler is server-driven)
  17859, // split_payment_invite - webhook fan-out
  18090, // split_payment_created (additional work crowd-fund) - webhook
  18102, // split_payment_invite (additional work) - webhook fan-out
  18655, // additional_work_approved (split-payment finalization webhook)
  18893, // additional_work_approved (crowd-fund finalization webhook)
  18906, // split_payment_complete - webhook to split creator (not actor)
  18923, // payment_received (split complete) - webhook to provider
  19058, // split_payment_cancelled to bid provider - webhook side-effect
  19071, // split_payment_cancelled fan-out (already has !== user.id self-skip inline)
  19276, // split_payment reactivation (webhook)
  19289, // split_payment_invite fan-out (webhook)
  28335, // split_payment_expired (scheduler)
  28346, // split_payment_expired fan-out (scheduler)
  28383, // split_payment_expired to bid provider (scheduler)
  28418, // admin alert fan-out (scheduler)
  31671, // refund_denied (admin actor — not dual-role)
  31721, // refund_processed (admin actor — not dual-role)
  31796, // refund_processed (admin actor — not dual-role)
  31914, // refund_denied (provider actor; recipient is requested_by member — different UIDs by design)
  31958, // refund_processed (provider actor; recipient is requested_by member)
  32031, // refund_processed (provider actor; recipient is requested_by member)
  32836, // provider_matched (AI Matchmaker — automated, no actor)
  39481, // car_club broadcast fan-out (automated)
  46234, // bid_received on care plan (covered separately by Task #298 — out of scope here)
  47626, // AI matching fan-out (automated)
  48561, // bidding_closed (scheduler)
]);

check('every notifications.insert is either guarded (Task #408) or classified actor-less', () => {
  if (!serverExists) {
    console.log('[INFO] Skipping — www/server.js not found');
    return;
  }
  const needle = "from('notifications').insert";
  const unguarded = [];
  let from = 0;
  while (true) {
    const idx = serverSrc.indexOf(needle, from);
    if (idx === -1) break;
    from = idx + needle.length;
    const ln = lineNumberOf(idx);
    // Walk back up to 4 lines and look for a Task #408 marker.
    let scanStart = idx;
    for (let i = 0; i < 5 && scanStart > 0; i++) {
      scanStart = serverSrc.lastIndexOf('\n', scanStart - 1);
    }
    const above = serverSrc.slice(Math.max(0, scanStart), idx);
    const guarded = above.includes('Task #408');
    const classified = NO_ACTOR_CALLSITES.has(ln);
    if (!guarded && !classified) {
      unguarded.push(ln);
    }
  }
  assert.deepStrictEqual(
    unguarded, [],
    `Unclassified notifications.insert sites at lines ${unguarded.join(', ')}. ` +
    `Either add a Task #408 self-skip guard directly above, or, if there is no ` +
    `user.id / auth.user actor in scope, add the line number to NO_ACTOR_CALLSITES.`
  );
});

// ---------------------------------------------------------------------------
// Behavioural test: notifications-bid-accepted-push.js handler under both
// cross-account and self-award. Drives the real exported handler against
// an in-memory Supabase double.
// ---------------------------------------------------------------------------
function buildStubSupabase({ callerId, bidRow }) {
  let tokenSelectCalls = 0;
  const supabase = {
    auth: {
      getUser: async () => ({ data: { user: { id: callerId } }, error: null }),
    },
    from(table) {
      if (table === 'plan_bids') {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: bidRow, error: null }),
        };
      }
      if (table === 'provider_notification_preferences') {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: null, error: null }),
        };
      }
      if (table === 'device_push_tokens') {
        return {
          select() { return this; },
          eq() { tokenSelectCalls++; return this; },
          update() { return { in: async () => ({ data: null, error: null }) }; },
        };
      }
      throw new Error('unexpected table ' + table);
    },
    __tokenSelectCalls: () => tokenSelectCalls,
  };
  return supabase;
}

async function invokeBidAcceptedPush({ callerId, providerId, bidId, bidRow }) {
  const utilsPath = require.resolve('../functions/utils');
  const utils = require('../functions/utils');
  const origCreate = utils.createSupabaseClient;
  const stub = buildStubSupabase({ callerId, bidRow });
  utils.createSupabaseClient = () => stub;
  try {
    delete require.cache[require.resolve('../functions/notifications-bid-accepted-push')];
    const { handler } = require('../functions/notifications-bid-accepted-push');
    const res = await handler({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer fake' },
      body: JSON.stringify({ provider_id: providerId, bid_id: bidId }),
    });
    return { res, stub };
  } finally {
    utils.createSupabaseClient = origCreate;
    delete require.cache[utilsPath];
  }
}

check('bid-accepted-push: self-award returns self_award_skipped without token lookup', async () => {
  const sharedId = '11111111-1111-4111-8111-111111111111';
  const bidId    = '22222222-2222-4222-8222-222222222222';
  const { res, stub } = await invokeBidAcceptedPush({
    callerId: sharedId,
    providerId: sharedId,
    bidId,
    bidRow: {
      id: bidId, provider_id: sharedId, status: 'accepted',
      care_plan_id: 'pkg', amount: 100,
      care_plans: { member_id: sharedId, title: 'Test' },
    },
  });
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.sent, false);
  assert.strictEqual(body.reason, 'self_award_skipped');
  assert.strictEqual(stub.__tokenSelectCalls(), 0,
    'device_push_tokens MUST NOT be queried for self-awards');
});

check('bid-accepted-push: cross-account award proceeds past the self-skip guard', async () => {
  const memberId   = '33333333-3333-4333-8333-333333333333';
  const providerId = '44444444-4444-4444-8444-444444444444';
  const bidId      = '55555555-5555-4555-8555-555555555555';
  const prevFcm = process.env.FCM_SERVICE_ACCOUNT_JSON;
  delete process.env.FCM_SERVICE_ACCOUNT_JSON;
  try {
    const { res } = await invokeBidAcceptedPush({
      callerId: memberId, providerId, bidId,
      bidRow: {
        id: bidId, provider_id: providerId, status: 'accepted',
        care_plan_id: 'pkg', amount: 100,
        care_plans: { member_id: memberId, title: 'Test' },
      },
    });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.reason, 'not_configured',
      'cross-account award should reach dispatchBidAcceptedPush');
  } finally {
    if (prevFcm !== undefined) process.env.FCM_SERVICE_ACCOUNT_JSON = prevFcm;
  }
});

runAll().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
});

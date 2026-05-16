'use strict';

// Task #328: provider-side coverage for completing and disputing care plans.
//
// Sibling spec to care-plan-payment-journey.spec.js (Task #282), which only
// exercises the member side. This spec drives the same Stripe Connect
// plumbing from the provider's perspective so a regression in the payout
// transfer (destination charge → connected account) or the dispute freeze
// (held → disputed, /complete blocked, admin/AI resolver doesn't double-
// capture) can't slip into production unnoticed.
//
// There is no dedicated provider-facing care-plans UI yet (the relevant-files
// note in the task references `www/providers-care-plans.js`, which doesn't
// exist), so this spec is API-level only — it verifies the data the provider
// session can actually read (`GET /api/care-plans/:id/completion`) and the
// Stripe primitives that drive a provider payout, both of which a future
// provider UI would surface.

const { test, expect } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const crypto = require('crypto');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_TEST_CONNECT_ACCOUNT_ID = process.env.STRIPE_TEST_CONNECT_ACCOUNT_ID || null;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const TEST_MEMBER_EMAIL = process.env.MEMBER_TEST_EMAIL || 'testmember@mcc-test.com';
const TEST_MEMBER_PASS = process.env.MEMBER_TEST_PASSWORD || 'TestPass123!';
const TEST_PROVIDER_EMAIL = process.env.PROVIDER_TEST_EMAIL || 'testprovider_a@mcc-test.com';
const TEST_PROVIDER_PASS = process.env.PROVIDER_TEST_PASSWORD || 'TestPass123!';
const TEST_PROVIDER_B_EMAIL = process.env.PROVIDER_B_TEST_EMAIL || 'testprovider_b@mcc-test.com';

const SKIP_REASON = (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
  ? 'Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY' : null;

function buildStripeWebhookSignature(rawBody, secret, timestamp) {
  const ts = timestamp || Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  return `t=${ts},v1=${v1}`;
}

test.describe('Care plan provider journey (Task #328)', () => {
  test.skip(!!SKIP_REASON, SKIP_REASON || '');

  const seededPlanIds = [];
  let sb;
  let stripe = null;
  let stripeUsable = false;
  let stripeConnectAccountId = null;
  let restoreProviderStripeId = null;
  let memberId, memberToken, providerId, providerToken, providerBId;
  let restoreConfidenceThreshold = null;

  test.beforeAll(async () => {
    sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: member } = await sb.from('profiles').select('id').eq('email', TEST_MEMBER_EMAIL).single();
    const { data: provider } = await sb.from('profiles').select('id, stripe_account_id').eq('email', TEST_PROVIDER_EMAIL).single();
    const { data: providerB } = await sb.from('profiles').select('id').eq('email', TEST_PROVIDER_B_EMAIL).single();
    if (!member || !provider || !providerB) {
      throw new Error(`Test fixtures missing: ensure ${TEST_MEMBER_EMAIL}, ${TEST_PROVIDER_EMAIL}, ${TEST_PROVIDER_B_EMAIL} profiles exist.`);
    }
    memberId = member.id;
    providerId = provider.id;
    providerBId = providerB.id;
    restoreProviderStripeId = provider.stripe_account_id;

    async function mintToken(email, password) {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_SERVICE_KEY },
        body: JSON.stringify({ email, password })
      });
      if (!r.ok) throw new Error(`${email} sign-in failed: HTTP ${r.status}`);
      return (await r.json()).access_token;
    }
    memberToken = await mintToken(TEST_MEMBER_EMAIL, TEST_MEMBER_PASS);
    providerToken = await mintToken(TEST_PROVIDER_EMAIL, TEST_PROVIDER_PASS);

    if (STRIPE_SECRET_KEY) {
      try {
        const { STRIPE_API_VERSION } = require('../lib/stripe-api-version');
        stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
        let acct;
        if (STRIPE_TEST_CONNECT_ACCOUNT_ID) {
          acct = await stripe.accounts.retrieve(STRIPE_TEST_CONNECT_ACCOUNT_ID);
        } else {
          acct = await stripe.accounts.create({
            type: 'express', country: 'US',
            email: `mcc-task328-${Date.now()}@example.com`,
            capabilities: { card_payments: { requested: true }, transfers: { requested: true } }
          });
          stripeConnectAccountId = acct.id;
        }
        let usable = acct.charges_enabled;
        if (!usable && STRIPE_TEST_CONNECT_ACCOUNT_ID) {
          try {
            const probe = await stripe.paymentIntents.create({
              amount: 1000, currency: 'usd', capture_method: 'manual',
              transfer_data: { destination: acct.id },
              payment_method_types: ['card']
            });
            await stripe.paymentIntents.cancel(probe.id).catch(() => {});
            usable = true;
          } catch (probeErr) {
            console.warn(`[Task #328] Probe PI failed on ${acct.id}: ${probeErr.code || ''} ${probeErr.message}`);
          }
        }
        if (usable) {
          await sb.from('profiles').update({ stripe_account_id: acct.id }).eq('id', providerId);
          stripeUsable = true;
        } else {
          console.warn(`[Task #328] Stripe disabled: Connect account ${acct.id} not charges_enabled. Set STRIPE_TEST_CONNECT_ACCOUNT_ID to a pre-onboarded test account.`);
        }
      } catch (err) {
        console.warn(`[Task #328] Stripe disabled: ${err.code || ''} ${err.message}`);
      }
    }
  });

  test.afterAll(async () => {
    if (!sb) return;
    if (stripe && seededPlanIds.length) {
      const { data: plans } = await sb.from('care_plans').select('id, stripe_payment_intent_id').in('id', seededPlanIds);
      for (const p of (plans || [])) {
        if (p.stripe_payment_intent_id) {
          try {
            const pi = await stripe.paymentIntents.retrieve(p.stripe_payment_intent_id);
            if (['requires_payment_method', 'requires_confirmation', 'requires_action', 'requires_capture'].includes(pi.status)) {
              await stripe.paymentIntents.cancel(p.stripe_payment_intent_id);
            }
          } catch (_) { /* ignore */ }
        }
      }
    }
    if (seededPlanIds.length) {
      await sb.from('care_plan_completions').delete().in('care_plan_id', seededPlanIds);
      await sb.from('plan_bids').delete().in('care_plan_id', seededPlanIds);
      await sb.from('care_plans').delete().in('id', seededPlanIds);
    }
    if (stripeConnectAccountId && stripe) {
      try { await stripe.accounts.del(stripeConnectAccountId); } catch (_) {}
    }
    await sb.from('profiles').update({ stripe_account_id: restoreProviderStripeId }).eq('id', providerId);

    // Reset the AI ops confidence threshold to whatever was there before this
    // suite touched it — otherwise we'd leave the shared dev/CI environment
    // stuck in shadow mode (or in auto-exec mode) for unrelated tests.
    if (restoreConfidenceThreshold !== null && ADMIN_PASSWORD) {
      try {
        await fetch(`${BASE_URL}/api/admin/ai-ops/settings`, {
          method: 'POST',
          headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' },
          body: JSON.stringify({ confidence_threshold: restoreConfidenceThreshold })
        });
      } catch (_) { /* best-effort cleanup */ }
    }
  });

  async function seedPlan() {
    const closesAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const { data: plan, error: planErr } = await sb.from('care_plans').insert({
      title: `Task328 plan ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      member_id: memberId, status: 'open', zip_code: '10001',
      service_types: ['oil_change'], bid_closes_at: closesAt
    }).select().single();
    if (planErr) throw planErr;
    seededPlanIds.push(plan.id);

    const { data: bidA, error: e1 } = await sb.from('plan_bids').insert({
      care_plan_id: plan.id, provider_id: providerId, amount: 175, status: 'pending'
    }).select().single();
    if (e1) throw e1;
    const { data: bidB, error: e2 } = await sb.from('plan_bids').insert({
      care_plan_id: plan.id, provider_id: providerBId, amount: 220, status: 'pending'
    }).select().single();
    if (e2) throw e2;
    return { plan, acceptedBid: bidA, otherBid: bidB };
  }

  async function postSignedWebhook(request, eventType, paymentIntent, planId, bidId) {
    const payload = JSON.stringify({
      id: `evt_test_${Date.now()}`,
      object: 'event',
      type: eventType,
      api_version: '2024-06-20',
      created: Math.floor(Date.now() / 1000),
      data: { object: { ...paymentIntent, metadata: { ...(paymentIntent.metadata || {}), flow: 'care_plan', care_plan_id: planId, bid_id: bidId } } },
      livemode: false, pending_webhooks: 0, request: { id: null, idempotency_key: null }
    });
    const sig = buildStripeWebhookSignature(payload, STRIPE_WEBHOOK_SECRET);
    const res = await request.post(`${BASE_URL}/webhook/stripe`, {
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig },
      data: payload
    });
    expect(res.status()).toBe(200);
  }

  async function pollPlan(planId, predicate, attempts = 15) {
    for (let i = 0; i < attempts; i++) {
      const { data } = await sb.from('care_plans').select('*').eq('id', planId).single();
      if (data && predicate(data)) return data;
      await new Promise(r => setTimeout(r, 200));
    }
    const { data } = await sb.from('care_plans').select('*').eq('id', planId).single();
    return data;
  }

  // Drives the member side from open → held escrow on the plan. Returns the
  // seeded plan, accepted bid, and PI id once payment_status='held'.
  async function seedHeldPlan(request) {
    const { plan, acceptedBid } = await seedPlan();
    const acceptRes = await request.post(`${BASE_URL}/api/care-plans/${plan.id}/accept-bid`, {
      headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
      data: { bid_id: acceptedBid.id }
    });
    expect(acceptRes.status()).toBe(200);
    const piId = (await acceptRes.json()).payment_intent_id;
    await stripe.paymentIntents.confirm(piId, {
      payment_method: 'pm_card_visa',
      return_url: `${BASE_URL}/members.html`
    });
    const piHeld = await stripe.paymentIntents.retrieve(piId);
    expect(piHeld.status).toBe('requires_capture');
    await postSignedWebhook(request, 'payment_intent.amount_capturable_updated', piHeld, plan.id, acceptedBid.id);
    const heldRow = await pollPlan(plan.id, (p) => p.payment_status === 'held');
    expect(heldRow.payment_status).toBe('held');
    return { plan, acceptedBid, piId };
  }

  // --- Always-on contract guarantees -----------------------------------------

  test('GET /completion is 401 without auth', async ({ request }) => {
    const { plan } = await seedPlan();
    const res = await request.get(`${BASE_URL}/api/care-plans/${plan.id}/completion`);
    expect(res.status()).toBe(401);
  });

  test('GET /completion is 403 for an unrelated provider', async ({ request }) => {
    // No completion row exists yet → endpoint returns 404 (not 403) for
    // anyone. To exercise the 403 path, seed a stub completion row tied to
    // providerB and try to read it as the providerA session.
    const { plan, acceptedBid } = await seedPlan();
    const { error: insErr } = await sb.from('care_plan_completions').insert({
      care_plan_id: plan.id,
      accepted_bid_id: acceptedBid.id,
      member_id: memberId,
      provider_id: providerBId,
      status: 'completed',
      bid_amount: 175,
      completed_at: new Date().toISOString()
    });
    if (insErr) throw insErr;
    const res = await request.get(`${BASE_URL}/api/care-plans/${plan.id}/completion`, {
      headers: { Authorization: `Bearer ${providerToken}` }
    });
    expect(res.status()).toBe(403);
  });

  // --- Stripe-gated provider payout path -------------------------------------

  test('Provider payout: capture creates destination transfer + provider can read completion', async ({ request }) => {
    test.skip(!stripeUsable, 'Stripe test key not usable in this environment');
    test.skip(!STRIPE_WEBHOOK_SECRET, 'STRIPE_WEBHOOK_SECRET required');

    const { plan, acceptedBid, piId } = await seedHeldPlan(request);

    // Before /complete the completion row doesn't exist yet, so the provider's
    // own /completion read should 404. This is the "funds held, awaiting
    // provider-side action" state surfaced to a future provider UI.
    const preRes = await request.get(`${BASE_URL}/api/care-plans/${plan.id}/completion`, {
      headers: { Authorization: `Bearer ${providerToken}` }
    });
    expect(preRes.status()).toBe(404);

    // Provider-side DB visibility: care_plans row carries the provider's id
    // + Connect account id so a future "my awarded plans" view can render
    // the "funds held" state. We assert via service-role since there's no
    // provider-readable HTTP endpoint for the plan row in dev.
    const { data: planHeldRow } = await sb.from('care_plans')
      .select('payment_status, provider_id, provider_stripe_account_id, escrow_amount')
      .eq('id', plan.id).single();
    expect(planHeldRow.payment_status).toBe('held');
    expect(planHeldRow.provider_id).toBe(providerId);
    expect(planHeldRow.provider_stripe_account_id).toMatch(/^acct_/);
    expect(Number(planHeldRow.escrow_amount)).toBe(175);

    // Member marks complete → server captures the PI.
    const completeRes = await request.post(`${BASE_URL}/api/care-plans/${plan.id}/complete`, {
      headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
      data: { completion_notes: 'Task328 provider payout' }
    });
    expect(completeRes.status()).toBe(201);
    const completeBody = await completeRes.json();
    expect(completeBody.payment.captured).toBe(true);
    expect(completeBody.payment.payment_intent_id).toBe(piId);

    // Plan flips to captured + status=completed (legacy mirror).
    const { data: planFinal } = await sb.from('care_plans')
      .select('payment_status, status').eq('id', plan.id).single();
    expect(planFinal.payment_status).toBe('captured');

    // Provider session can now read the completion row via the assigned-
    // provider branch of the /completion endpoint.
    const provReadRes = await request.get(`${BASE_URL}/api/care-plans/${plan.id}/completion`, {
      headers: { Authorization: `Bearer ${providerToken}` }
    });
    expect(provReadRes.status()).toBe(200);
    const provBody = await provReadRes.json();
    expect(provBody.completion).toBeTruthy();
    expect(provBody.completion.provider_id).toBe(providerId);
    expect(provBody.completion.status).toBe('completed');
    expect(provBody.completion.accepted_bid_id).toBe(acceptedBid.id);
    expect(Number(provBody.completion.captured_amount)).toBe(175);
    expect(provBody.completion.payment_capture_status).toBe('captured');
    expect(provBody.completion.stripe_payment_intent_id).toBe(piId);

    // Payout proof: destination charge with transfer_data.destination
    // generates an automatic Transfer to the connected account on capture.
    // The transfer id appears on the charge once the PI succeeds — this is
    // the "paid out" state a future provider UI would surface.
    const piCaptured = await stripe.paymentIntents.retrieve(piId, { expand: ['latest_charge'] });
    expect(piCaptured.status).toBe('succeeded');
    const charge = piCaptured.latest_charge && typeof piCaptured.latest_charge === 'object'
      ? piCaptured.latest_charge
      : await stripe.charges.retrieve(piCaptured.latest_charge);
    expect(charge.captured).toBe(true);
    expect(charge.transfer).toMatch(/^tr_/);
    expect(charge.destination || (charge.transfer_data && charge.transfer_data.destination))
      .toBe(planHeldRow.provider_stripe_account_id);

    const transfer = await stripe.transfers.retrieve(charge.transfer);
    expect(transfer.destination).toBe(planHeldRow.provider_stripe_account_id);
    expect(transfer.amount).toBe(17500);
  });

  // --- Dispute freeze + admin/AI resolver must not double-capture ------------

  test('Dispute path: held → disputed freezes /complete + admin resolver does not double-capture', async ({ request }) => {
    test.skip(!stripeUsable, 'Stripe test key not usable in this environment');
    test.skip(!STRIPE_WEBHOOK_SECRET, 'STRIPE_WEBHOOK_SECRET required');
    test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD required for admin/AI dispute resolver');

    const { plan, acceptedBid, piId } = await seedHeldPlan(request);

    // Member raises a dispute while funds are held. Endpoint flips the plan
    // payment_status to 'disputed' AND inserts a disputed completion stub
    // (no capture has happened yet — that's the freeze).
    const dispRes = await request.post(`${BASE_URL}/api/care-plans/${plan.id}/dispute`, {
      headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
      data: { dispute_reason: 'no_show', dispute_description: 'Provider never arrived' }
    });
    expect(dispRes.status()).toBe(200);
    const dispBody = await dispRes.json();
    expect(dispBody.payment_frozen).toBe(true);
    expect(dispBody.completion).toBeTruthy();
    expect(dispBody.completion.status).toBe('disputed');
    const completionId = dispBody.completion.id;

    // Plan must reflect the freeze, PI must still be held (NOT captured).
    const { data: planAfterDispute } = await sb.from('care_plans')
      .select('payment_status, stripe_payment_intent_id').eq('id', plan.id).single();
    expect(planAfterDispute.payment_status).toBe('disputed');
    const piFrozen = await stripe.paymentIntents.retrieve(piId);
    expect(piFrozen.status).toBe('requires_capture');

    // Provider can read the disputed completion — a future provider UI uses
    // this signal to render the "dispute raised, action needed" state.
    const provReadRes = await request.get(`${BASE_URL}/api/care-plans/${plan.id}/completion`, {
      headers: { Authorization: `Bearer ${providerToken}` }
    });
    expect(provReadRes.status()).toBe(200);
    const provBody = await provReadRes.json();
    expect(provBody.completion.status).toBe('disputed');
    expect(provBody.completion.provider_id).toBe(providerId);
    expect(provBody.completion.dispute_reason).toBe('no_show');

    // /complete is now hard-blocked: the dispute freeze is what prevents a
    // double-capture race (member can't both dispute and accept payout).
    const completeRes = await request.post(`${BASE_URL}/api/care-plans/${plan.id}/complete`, {
      headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
      data: { completion_notes: 'should be rejected' }
    });
    expect(completeRes.status()).toBe(409);
    const completeErr = await completeRes.json();
    expect(String(completeErr.error || '').toLowerCase()).toContain('dispute');

    // Snapshot the current threshold so afterAll can put it back, then force
    // shadow mode (confidence_threshold=1.0) so the resolver always escalates
    // instead of auto-executing. That's the production-safe default and is
    // what proves the resolver doesn't trigger a capture.
    const settingsGetRes = await request.get(`${BASE_URL}/api/admin/ai-ops/settings`, {
      headers: { 'x-admin-password': ADMIN_PASSWORD }
    });
    if (settingsGetRes.ok()) {
      const cur = await settingsGetRes.json();
      if (restoreConfidenceThreshold === null && typeof cur.confidence_threshold === 'number') {
        restoreConfidenceThreshold = cur.confidence_threshold;
      }
    }
    const settingsRes = await request.post(`${BASE_URL}/api/admin/ai-ops/settings`, {
      headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' },
      data: { confidence_threshold: 1.0 }
    });
    expect(settingsRes.status()).toBe(200);

    const triggerRes = await request.post(`${BASE_URL}/api/admin/ai-ops/dispute-resolver/trigger`, {
      headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' },
      data: { completion_id: completionId }
    });
    expect(triggerRes.status()).toBe(200);
    const triggerBody = await triggerRes.json();
    // Either escalated or recommended an action — but never auto-captured.
    expect(triggerBody.success).toBe(true);
    expect(triggerBody.auto_executed === true && triggerBody.action !== 'escalated').toBe(false);

    // The whole point: PI must NOT have been captured by the resolver.
    const piAfterResolver = await stripe.paymentIntents.retrieve(piId);
    expect(piAfterResolver.status).toBe('requires_capture');
    expect(piAfterResolver.amount_received).toBe(0);

    // Plan stays frozen; completion row stays in a non-completed state so the
    // member's /complete attempt above can never have left a captured row
    // behind either.
    const { data: planStill } = await sb.from('care_plans')
      .select('payment_status').eq('id', plan.id).single();
    expect(planStill.payment_status).toBe('disputed');
    const { data: compStill } = await sb.from('care_plan_completions')
      .select('status, payment_capture_status, captured_at')
      .eq('id', completionId).single();
    expect(['disputed', 'resolved']).toContain(compStill.status);
    expect(compStill.payment_capture_status).not.toBe('captured');
    expect(compStill.captured_at).toBeNull();
  });

  test('Dispute resolution: auto-exec mode still must not double-capture held funds', async ({ request }) => {
    test.skip(!stripeUsable, 'Stripe test key not usable in this environment');
    test.skip(!STRIPE_WEBHOOK_SECRET, 'STRIPE_WEBHOOK_SECRET required');
    test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD required for admin/AI dispute resolver');

    // Companion to the freeze test above: this one explicitly drives the
    // resolver in AUTO-EXECUTE mode (confidence_threshold=0) so any decision
    // the model returns is acted on. The invariant under test is that NO
    // resolution path — refund_member, partial_refund, deny_refund, or
    // escalate — ever calls Stripe capture on the held PI. The resolver
    // writes recommendations + updates the completion row, but capture must
    // remain the explicit job of /complete (which is blocked while disputed).
    const { plan, piId } = await seedHeldPlan(request);
    const dispRes = await request.post(`${BASE_URL}/api/care-plans/${plan.id}/dispute`, {
      headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
      data: { dispute_reason: 'quality_issue', dispute_description: 'Oil filter not replaced as agreed' }
    });
    expect(dispRes.status()).toBe(200);
    const completionId = (await dispRes.json()).completion.id;

    // Snapshot threshold for afterAll, then force auto-exec mode.
    const getRes = await request.get(`${BASE_URL}/api/admin/ai-ops/settings`, {
      headers: { 'x-admin-password': ADMIN_PASSWORD }
    });
    if (getRes.ok()) {
      const cur = await getRes.json();
      if (restoreConfidenceThreshold === null && typeof cur.confidence_threshold === 'number') {
        restoreConfidenceThreshold = cur.confidence_threshold;
      }
    }
    const setRes = await request.post(`${BASE_URL}/api/admin/ai-ops/settings`, {
      headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' },
      data: { confidence_threshold: 0.0, max_auto_refund: 1000 }
    });
    expect(setRes.status()).toBe(200);

    const triggerRes = await request.post(`${BASE_URL}/api/admin/ai-ops/dispute-resolver/trigger`, {
      headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' },
      data: { completion_id: completionId }
    });
    expect(triggerRes.status()).toBe(200);
    const triggerBody = await triggerRes.json();
    expect(triggerBody.success).toBe(true);

    // Core invariant regardless of which branch the AI took: the held PI must
    // not have been captured by the resolver. Capture is /complete's job and
    // /complete is hard-blocked while payment_status='disputed'.
    const piAfter = await stripe.paymentIntents.retrieve(piId);
    expect(piAfter.status).toBe('requires_capture');
    expect(piAfter.amount_received).toBe(0);

    const { data: compAfter } = await sb.from('care_plan_completions')
      .select('status, payment_capture_status, captured_at, captured_amount, ai_resolution')
      .eq('id', completionId).single();
    // Status moved if the resolver auto-executed; either way, it must NOT be
    // 'completed' (that would imply a successful capture path) and the
    // capture-side fields must remain unset.
    expect(compAfter.status).not.toBe('completed');
    expect(compAfter.payment_capture_status).not.toBe('captured');
    expect(compAfter.captured_at).toBeNull();
    expect(compAfter.captured_amount).toBeNull();

    // Re-confirm /complete is still blocked post-resolution — the resolver
    // doesn't quietly unfreeze the plan and re-open a capture window.
    const completeAgain = await request.post(`${BASE_URL}/api/care-plans/${plan.id}/complete`, {
      headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
      data: { completion_notes: 'should still be rejected' }
    });
    expect(completeAgain.status()).toBe(409);
  });

  // --- Task #421: provider dashboard surface for awarded plans ---------------

  test('GET /api/care-plans/awarded requires auth + provider role', async ({ request }) => {
    const noAuth = await request.get(`${BASE_URL}/api/care-plans/awarded`);
    expect(noAuth.status()).toBe(401);

    // Member token → 403 (not a provider role)
    const asMember = await request.get(`${BASE_URL}/api/care-plans/awarded`, {
      headers: { Authorization: `Bearer ${memberToken}` }
    });
    expect(asMember.status()).toBe(403);
  });

  test('GET /api/care-plans/awarded only returns plans where this provider won', async ({ request }) => {
    const { plan } = await seedHeldPlan(request).catch(async (e) => {
      // Stripe-disabled environments: fall back to a non-held seeded plan
      // by manually flipping accepted_bid_id + provider_id on the row so the
      // endpoint can still surface it.
      const { plan, acceptedBid } = await seedPlan();
      await sb.from('care_plans').update({
        accepted_bid_id: acceptedBid.id,
        provider_id: providerId,
        status: 'awarded'
      }).eq('id', plan.id);
      await sb.from('plan_bids').update({ status: 'accepted' }).eq('id', acceptedBid.id);
      return { plan };
    });

    const res = await request.get(`${BASE_URL}/api/care-plans/awarded`, {
      headers: { Authorization: `Bearer ${providerToken}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.plans)).toBe(true);
    const row = body.plans.find(p => p.id === plan.id);
    expect(row).toBeTruthy();
    // Sanity: enrichment fields should be present (member/vehicle may be null
    // for the bare seed, but the keys must exist so the UI can render).
    expect(row).toHaveProperty('completion');
    expect(row).toHaveProperty('member');
    expect(row).toHaveProperty('vehicle');
    expect(row).toHaveProperty('accepted_bid');
  });

  test('GET /api/care-plans/awarded excludes plans where another provider won (even if care_plans.provider_id drifted)', async ({ request }) => {
    // Authoritative ownership comes from plan_bids, not the denormalized
    // care_plans.provider_id column. Seed: providerB wins the bid, but
    // care_plans.provider_id is forcibly set to providerA. Endpoint must
    // STILL exclude this plan from providerA's awarded list.
    const { plan, otherBid } = await seedPlan(); // otherBid is providerB's bid
    await sb.from('plan_bids').update({ status: 'accepted' }).eq('id', otherBid.id);
    await sb.from('care_plans').update({
      accepted_bid_id: otherBid.id,
      // Intentional drift: provider_id wrong on the denormalized column.
      provider_id: providerId,
      status: 'awarded'
    }).eq('id', plan.id);

    const res = await request.get(`${BASE_URL}/api/care-plans/awarded`, {
      headers: { Authorization: `Bearer ${providerToken}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // ProviderA must NOT see providerB's plan even though the denormalized
    // provider_id column was tampered with to point at providerA.
    const row = body.plans.find(p => p.id === plan.id);
    expect(row).toBeFalsy();
  });

  test('GET /api/care-plans/awarded surfaces dispute reason + description to provider', async ({ request }) => {
    // Seed an awarded plan + a member-raised dispute and confirm the provider
    // can see the reason/description through their own dashboard endpoint
    // (no need to read the member's /completion endpoint).
    const { plan, acceptedBid } = await seedPlan();
    await sb.from('care_plans').update({
      accepted_bid_id: acceptedBid.id,
      provider_id: providerId,
      status: 'awarded',
      payment_status: 'disputed'
    }).eq('id', plan.id);
    await sb.from('plan_bids').update({ status: 'accepted' }).eq('id', acceptedBid.id);
    const { error: cErr } = await sb.from('care_plan_completions').insert({
      care_plan_id: plan.id,
      accepted_bid_id: acceptedBid.id,
      member_id: memberId,
      provider_id: providerId,
      status: 'disputed',
      bid_amount: 175,
      dispute_reason: 'quality',
      dispute_description: 'Oil filter not replaced as agreed',
      disputed_at: new Date().toISOString()
    });
    if (cErr) throw cErr;

    const res = await request.get(`${BASE_URL}/api/care-plans/awarded`, {
      headers: { Authorization: `Bearer ${providerToken}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const row = body.plans.find(p => p.id === plan.id);
    expect(row).toBeTruthy();
    expect(row.payment_status).toBe('disputed');
    expect(row.completion).toBeTruthy();
    expect(row.completion.status).toBe('disputed');
    expect(row.completion.dispute_reason).toBe('quality');
    expect(row.completion.dispute_description).toContain('Oil filter');
  });

  test('Provider dashboard UI renders awarded plan card with status badge + dispute reason', async ({ page }) => {
    // Seed: awarded plan in disputed state attributed to providerA.
    const { plan, acceptedBid } = await seedPlan();
    await sb.from('care_plans').update({
      accepted_bid_id: acceptedBid.id,
      provider_id: providerId,
      status: 'awarded',
      payment_status: 'disputed',
      title: `Task421 UI plan ${Date.now()}`
    }).eq('id', plan.id);
    await sb.from('plan_bids').update({ status: 'accepted' }).eq('id', acceptedBid.id);
    await sb.from('care_plan_completions').insert({
      care_plan_id: plan.id,
      accepted_bid_id: acceptedBid.id,
      member_id: memberId,
      provider_id: providerId,
      status: 'disputed',
      bid_amount: 175,
      dispute_reason: 'quality',
      dispute_description: 'UI smoke: oil filter not replaced as agreed',
      disputed_at: new Date().toISOString()
    });

    // Login via the UI: /login.html → password tab is default → submit.
    await page.goto(`${BASE_URL}/login.html`);
    await page.fill('#email', TEST_PROVIDER_EMAIL);
    await page.fill('#password', TEST_PROVIDER_PASS);
    await Promise.all([
      page.waitForURL(/providers\.html/, { timeout: 30_000 }),
      page.click('#login-btn')
    ]).catch(async () => {
      // Some envs land on members.html first then redirect via JS; force-nav
      // if we didn't auto-route to the provider dashboard.
      await page.goto(`${BASE_URL}/providers.html`);
    });
    await page.goto(`${BASE_URL}/providers.html`);

    // Wait for the awarded-plans section + script to be present.
    await page.waitForSelector('#care-plans-awarded-list', { timeout: 15_000 });

    // Click the nav item to open the section and trigger a fresh load.
    await page.click('.nav-item[data-section="care-plans-awarded"]');

    // Wait for the seeded plan card to appear (script auto-loads on bind too).
    const cardSel = `.cp-awarded-card[data-plan-id="${plan.id}"]`;
    await page.waitForSelector(cardSel, { timeout: 20_000 });
    const card = page.locator(cardSel);
    await expect(card).toBeVisible();

    // Status badge must read "Disputed".
    await expect(card.locator('.cp-status-badge')).toHaveText(/Disputed/i);

    // Dispute panel must surface the reason + description to the provider.
    const dispute = card.locator('.cp-dispute-panel');
    await expect(dispute).toBeVisible();
    await expect(dispute).toContainText(/quality/i);
    await expect(dispute).toContainText(/oil filter not replaced/i);
  });
});

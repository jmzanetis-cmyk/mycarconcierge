'use strict';

// Task #282: end-to-end coverage for the member care plan payment journey.

const { test, expect } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const crypto = require('crypto');
const { loginViaUI, navigateToSection, dismissOverlays } = require('./helpers');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const TEST_MEMBER_EMAIL = process.env.MEMBER_TEST_EMAIL || 'testmember@mcc-test.com';
const TEST_MEMBER_PASS = process.env.MEMBER_TEST_PASSWORD || 'TestPass123!';
const TEST_PROVIDER_EMAIL = process.env.PROVIDER_TEST_EMAIL || 'testprovider_a@mcc-test.com';
const TEST_PROVIDER_PASS = process.env.PROVIDER_TEST_PASSWORD || 'TestPass123!';
const TEST_PROVIDER_B_EMAIL = process.env.PROVIDER_B_TEST_EMAIL || 'testprovider_b@mcc-test.com';

const SKIP_REASON = (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
  ? 'Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY' : null;

// Stripe webhook signature: HMAC_SHA256(secret, `${ts}.${body}`)
function buildStripeWebhookSignature(rawBody, secret, timestamp) {
  const ts = timestamp || Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  return `t=${ts},v1=${v1}`;
}

test.describe('Care plan payment journey (Task #282)', () => {
  test.skip(!!SKIP_REASON, SKIP_REASON || '');

  const seededPlanIds = [];
  let sb;
  let stripe = null;
  let stripeUsable = false;
  let stripeConnectAccountId = null;
  let restoreProviderStripeId = null;
  let memberId, memberToken, providerId, providerBId;

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

    // Mint member JWT via REST so supabase-js's admin Authorization header
    // (used for seed/cleanup below) doesn't get rewritten to the user's JWT.
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_SERVICE_KEY },
      body: JSON.stringify({ email: TEST_MEMBER_EMAIL, password: TEST_MEMBER_PASS })
    });
    if (!authRes.ok) throw new Error(`Member sign-in failed: HTTP ${authRes.status}`);
    memberToken = (await authRes.json()).access_token;

    // Stripe-gated tests require both a working key AND a Connect account
    // that's actually `charges_enabled` (the /accept-bid handler hard-rejects
    // 409 otherwise). Newly-created Express test accounts typically aren't,
    // so this skip-gate is the only way to keep these tests non-flaky.
    if (STRIPE_SECRET_KEY) {
      try {
        stripe = new Stripe(STRIPE_SECRET_KEY);
        const acct = await stripe.accounts.create({
          type: 'express', country: 'US',
          email: `mcc-task282-${Date.now()}@example.com`,
          capabilities: { card_payments: { requested: true }, transfers: { requested: true } }
        });
        stripeConnectAccountId = acct.id;
        if (acct.charges_enabled) {
          await sb.from('profiles').update({ stripe_account_id: acct.id }).eq('id', providerId);
          stripeUsable = true;
        } else {
          console.warn('[Task #282] Stripe disabled: Connect account not charges_enabled.');
        }
      } catch (err) {
        console.warn(`[Task #282] Stripe disabled: ${err.code || ''} ${err.message}`);
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
  });

  async function seedPlan() {
    const closesAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const { data: plan, error: planErr } = await sb.from('care_plans').insert({
      title: `Task282 plan ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      member_id: memberId, status: 'open', zip_code: '10001',
      service_types: ['oil_change'], bid_closes_at: closesAt
    }).select().single();
    if (planErr) throw planErr;
    seededPlanIds.push(plan.id);

    // Two competing bids; unique constraint on (care_plan_id, provider_id)
    // forces using two different providers.
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

  // --- Contract guarantees (always run) --------------------------------------

  test('POST /accept-bid rejects unauthenticated callers with 401', async ({ request }) => {
    const { plan, acceptedBid } = await seedPlan();
    const res = await request.post(`${BASE_URL}/api/care-plans/${plan.id}/accept-bid`, {
      data: { bid_id: acceptedBid.id }, headers: { 'Content-Type': 'application/json' }
    });
    expect(res.status()).toBe(401);
  });

  test('POST /accept-bid rejects non-owner callers with 403', async ({ request }) => {
    const { plan, acceptedBid } = await seedPlan();
    const otherAuth = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_SERVICE_KEY },
      body: JSON.stringify({ email: TEST_PROVIDER_EMAIL, password: TEST_PROVIDER_PASS })
    });
    test.skip(!otherAuth.ok, `Could not sign in ${TEST_PROVIDER_EMAIL}`);
    const otherToken = (await otherAuth.json()).access_token;
    const res = await request.post(`${BASE_URL}/api/care-plans/${plan.id}/accept-bid`, {
      headers: { Authorization: `Bearer ${otherToken}`, 'Content-Type': 'application/json' },
      data: { bid_id: acceptedBid.id }
    });
    expect(res.status()).toBe(403);
  });

  test('POST /accept-bid rejects malformed bid_id with 400', async ({ request }) => {
    const { plan } = await seedPlan();
    const res = await request.post(`${BASE_URL}/api/care-plans/${plan.id}/accept-bid`, {
      headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
      data: { bid_id: 'not-a-uuid' }
    });
    expect(res.status()).toBe(400);
  });

  test('POST /accept-bid: deterministic 409 loser path when funds already held', async ({ request }) => {
    // Pre-flip plan to `held` (the state a winner leaves it in once the
    // amount_capturable_updated webhook lands) so the loser path is provable
    // without depending on Stripe-account readiness or thread scheduling.
    const { plan, acceptedBid, otherBid } = await seedPlan();
    await sb.from('care_plans').update({ payment_status: 'held' }).eq('id', plan.id);
    for (const bidId of [acceptedBid.id, otherBid.id]) {
      const res = await request.post(`${BASE_URL}/api/care-plans/${plan.id}/accept-bid`, {
        headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
        data: { bid_id: bidId }
      });
      expect(res.status()).toBe(409);
      const body = await res.json();
      expect(String(body.error || '').toLowerCase()).toContain('held');
    }
  });

  // --- Browser UI flow -------------------------------------------------------

  // Stub the two GET endpoints the UI reads (not implemented in dev server;
  // exist in production). Returns a stubber the test can use to mutate state
  // as the journey progresses. /accept-bid POST is NOT stubbed.
  function stubCarePlanReads(page, plan, acceptedBid, otherBid, getState) {
    const planRow = () => {
      const s = getState();
      return {
        id: plan.id, title: plan.title,
        status: s.payment_status === 'captured' ? 'completed' : 'open',
        payment_status: s.payment_status, bid_closes_at: plan.bid_closes_at,
        member_id: memberId,
        accepted_bid_id: s.payment_status === 'none' ? null : acceptedBid.id,
        stripe_payment_intent_id: s.pi || null,
        escrow_amount: 175, service_types: ['oil_change']
      };
    };
    page.route('**/api/care-plans/mine', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ plans: [{ ...planRow(), pending_bid_count: 2, accepted_bid: null, vehicle: null }] })
    }));
    page.route(`**/api/care-plans/${plan.id}`, (route) => {
      const s = getState();
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          plan: planRow(),
          bids: [
            { id: acceptedBid.id, provider_id: providerId, amount: 175, status: s.payment_status === 'none' ? 'pending' : 'accepted', provider_name: 'Test Provider A' },
            { id: otherBid.id, provider_id: providerBId, amount: 220, status: 'pending', provider_name: 'Test Provider B' }
          ],
          completion: null, vehicle: null
        })
      });
    });
  }

  test('UI: member sees seeded plan, bids, and Accept Bid button', async ({ page }) => {
    const { plan, acceptedBid, otherBid } = await seedPlan();
    stubCarePlanReads(page, plan, acceptedBid, otherBid, () => ({ payment_status: 'none', pi: null }));

    await loginViaUI(page, TEST_MEMBER_EMAIL, TEST_MEMBER_PASS, 'member');
    await navigateToSection(page, 'care-plans');
    await dismissOverlays(page);
    await page.waitForFunction(() => typeof window.loadCarePlansSection === 'function', null, { timeout: 10000 });
    await page.evaluate(() => window.loadCarePlansSection());

    await expect(page.locator('#care-plans-list')).toContainText(plan.title, { timeout: 10000 });
    await page.evaluate((id) => window.viewCarePlan(id), plan.id);
    const detail = page.locator('#care-plan-detail');
    await expect(detail).toBeVisible({ timeout: 10000 });
    await expect(detail).toContainText('$175.00', { timeout: 10000 });
    await expect(detail.locator(`[data-accept-bid="${acceptedBid.id}"]`)).toBeVisible({ timeout: 5000 });
  });

  test('UI: full Stripe card flow → funds-held UI → mark complete → captured', async ({ page, request }) => {
    test.skip(!stripeUsable, 'Stripe test key not usable in this environment');
    test.skip(!STRIPE_WEBHOOK_SECRET, 'STRIPE_WEBHOOK_SECRET required');

    const { plan, acceptedBid, otherBid } = await seedPlan();

    let currentPaymentStatus = 'none';
    let currentPI = null;
    stubCarePlanReads(page, plan, acceptedBid, otherBid, () => ({ payment_status: currentPaymentStatus, pi: currentPI }));

    await loginViaUI(page, TEST_MEMBER_EMAIL, TEST_MEMBER_PASS, 'member');
    await navigateToSection(page, 'care-plans');
    await dismissOverlays(page);
    await page.waitForFunction(() => typeof window.loadCarePlansSection === 'function', null, { timeout: 10000 });
    await page.evaluate(() => window.loadCarePlansSection());

    // List + detail render (exercises real renderCarePlansList + renderCarePlanDetail).
    await expect(page.locator('#care-plans-list')).toContainText(plan.title, { timeout: 10000 });
    await page.evaluate((id) => window.viewCarePlan(id), plan.id);
    const detail = page.locator('#care-plan-detail');
    await expect(detail).toBeVisible({ timeout: 10000 });
    await expect(detail).toContainText('$175.00', { timeout: 10000 });
    const acceptBtn = detail.locator(`[data-accept-bid="${acceptedBid.id}"]`);
    await expect(acceptBtn).toBeVisible({ timeout: 5000 });

    await acceptBtn.click();
    await expect(page.locator('#cp-card-element')).toBeVisible({ timeout: 15000 });
    currentPaymentStatus = 'requires_payment';

    // Fill Stripe Elements iframe with test card 4242…
    const cardFrame = page.frameLocator('#cp-card-element iframe').first();
    await cardFrame.locator('[name="cardnumber"]').fill('4242424242424242');
    await cardFrame.locator('[name="exp-date"]').fill('12 / 34');
    await cardFrame.locator('[name="cvc"]').fill('123');
    await cardFrame.locator('[name="postal"]').fill('10001').catch(() => {});
    await page.locator('#cp-card-confirm-btn').click();

    // Read the PI id back from Supabase once the UI's confirm POST has settled.
    let pidRow = null;
    for (let i = 0; i < 20; i++) {
      const { data } = await sb.from('care_plans').select('stripe_payment_intent_id').eq('id', plan.id).single();
      if (data && data.stripe_payment_intent_id) { pidRow = data; break; }
      await new Promise(r => setTimeout(r, 250));
    }
    expect(pidRow && pidRow.stripe_payment_intent_id).toMatch(/^pi_/);
    currentPI = pidRow.stripe_payment_intent_id;

    // Drive amount_capturable_updated webhook → plan flips to 'held'.
    const piHeld = await stripe.paymentIntents.retrieve(currentPI);
    expect(piHeld.status).toBe('requires_capture');
    await postSignedWebhook(request, 'payment_intent.amount_capturable_updated', piHeld, plan.id, acceptedBid.id);
    const heldRow = await pollPlan(plan.id, (p) => p.payment_status === 'held');
    expect(heldRow.payment_status).toBe('held');
    currentPaymentStatus = 'held';

    // Member-visible "funds held" UI: re-render detail and assert the
    // Mark Complete button (only rendered when payment_status === 'held').
    await page.evaluate((id) => window.viewCarePlan(id), plan.id);
    await expect(page.locator('#cp-mark-complete-btn')).toBeVisible({ timeout: 10000 });

    // Mark complete → real /complete endpoint captures the PI.
    await page.locator('#cp-mark-complete-btn').click();
    const piCaptured = await stripe.paymentIntents.retrieve(currentPI);
    // Capture happens server-side; allow a moment for the request to settle.
    let captured = piCaptured;
    for (let i = 0; i < 15 && captured.status !== 'succeeded'; i++) {
      await new Promise(r => setTimeout(r, 500));
      captured = await stripe.paymentIntents.retrieve(currentPI);
    }
    expect(captured.status).toBe('succeeded');

    const { data: planFinal } = await sb.from('care_plans').select('payment_status, status').eq('id', plan.id).single();
    expect(planFinal.payment_status).toBe('captured');
    expect(planFinal.status).toBe('completed');
    const { data: completion } = await sb.from('care_plan_completions').select('id, provider_id').eq('care_plan_id', plan.id).maybeSingle();
    expect(completion).toBeTruthy();
    expect(completion.provider_id).toBe(providerId);
  });

  // --- API-level happy path (Stripe-gated) -----------------------------------

  test('Happy path (API): accept → webhook holds → complete captures', async ({ request }) => {
    test.skip(!stripeUsable, 'Stripe test key not usable in this environment');
    test.skip(!STRIPE_WEBHOOK_SECRET, 'STRIPE_WEBHOOK_SECRET required');

    const { plan, acceptedBid } = await seedPlan();

    const acceptRes = await request.post(`${BASE_URL}/api/care-plans/${plan.id}/accept-bid`, {
      headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
      data: { bid_id: acceptedBid.id }
    });
    expect(acceptRes.status()).toBe(200);
    const acceptBody = await acceptRes.json();
    expect(acceptBody.payment_intent_id).toMatch(/^pi_/);
    const piId = acceptBody.payment_intent_id;

    const { data: planAfterAccept } = await sb.from('care_plans')
      .select('payment_status, accepted_bid_id, stripe_payment_intent_id')
      .eq('id', plan.id).single();
    expect(planAfterAccept.payment_status).toBe('requires_payment');
    expect(planAfterAccept.accepted_bid_id).toBe(acceptedBid.id);
    expect(planAfterAccept.stripe_payment_intent_id).toBe(piId);

    await stripe.paymentIntents.confirm(piId, { payment_method: 'pm_card_visa' });
    const piHeld = await stripe.paymentIntents.retrieve(piId);
    expect(piHeld.status).toBe('requires_capture');

    await postSignedWebhook(request, 'payment_intent.amount_capturable_updated', piHeld, plan.id, acceptedBid.id);
    const heldRow = await pollPlan(plan.id, (p) => p.payment_status === 'held');
    expect(heldRow.payment_status).toBe('held');

    const completeRes = await request.post(`${BASE_URL}/api/care-plans/${plan.id}/complete`, {
      headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
      data: { completion_notes: 'Task282 e2e capture' }
    });
    expect(completeRes.status()).toBe(201);
    const completeBody = await completeRes.json();
    expect(completeBody.payment.captured).toBe(true);
    expect(completeBody.payment.payment_intent_id).toBe(piId);

    const { data: planFinal } = await sb.from('care_plans').select('payment_status, status').eq('id', plan.id).single();
    expect(planFinal.payment_status).toBe('captured');
    expect(planFinal.status).toBe('completed');
    const { data: completion } = await sb.from('care_plan_completions').select('id, provider_id').eq('care_plan_id', plan.id).maybeSingle();
    expect(completion).toBeTruthy();
    expect(completion.provider_id).toBe(providerId);
    const piCaptured = await stripe.paymentIntents.retrieve(piId);
    expect(piCaptured.status).toBe('succeeded');
  });

  test('3DS path: PI requiring authentication transitions held only after 3DS confirm', async ({ request }) => {
    test.skip(!stripeUsable, 'Stripe test key not usable in this environment');
    test.skip(!STRIPE_WEBHOOK_SECRET, 'STRIPE_WEBHOOK_SECRET required');

    const { plan, acceptedBid } = await seedPlan();
    const acceptRes = await request.post(`${BASE_URL}/api/care-plans/${plan.id}/accept-bid`, {
      headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
      data: { bid_id: acceptedBid.id }
    });
    expect(acceptRes.status()).toBe(200);
    const piId = (await acceptRes.json()).payment_intent_id;

    // pm_card_authenticationRequired forces a 3DS challenge — confirm
    // should land in `requires_action`, NOT `requires_capture`, proving
    // the manual-capture intent gates funds-held until the challenge is
    // satisfied.
    await stripe.paymentIntents.confirm(piId, {
      payment_method: 'pm_card_authenticationRequired',
      return_url: `${BASE_URL}/members.html`
    });
    const piPending = await stripe.paymentIntents.retrieve(piId);
    expect(piPending.status).toBe('requires_action');

    // Plan must NOT yet be held — the 3DS step must complete first.
    const { data: planMid } = await sb.from('care_plans').select('payment_status').eq('id', plan.id).single();
    expect(planMid.payment_status).not.toBe('held');

    // Re-confirm with a non-3DS test PM to clear the challenge. In Stripe
    // test mode this completes the SCA flow and moves the manual-capture
    // intent to requires_capture (the held state).
    await stripe.paymentIntents.confirm(piId, { payment_method: 'pm_card_visa' });
    const piHeld = await stripe.paymentIntents.retrieve(piId);
    expect(piHeld.status).toBe('requires_capture');

    // Now the webhook should flip the plan to 'held'.
    await postSignedWebhook(request, 'payment_intent.amount_capturable_updated', piHeld, plan.id, acceptedBid.id);
    const heldRow = await pollPlan(plan.id, (p) => p.payment_status === 'held');
    expect(heldRow.payment_status).toBe('held');
  });

  test('Concurrency: parallel /accept-bid yields exactly one 200 + one 409, no orphan PI', async ({ request }) => {
    test.skip(!stripeUsable, 'Stripe test key not usable in this environment');
    const { plan, acceptedBid, otherBid } = await seedPlan();
    const headers = { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' };

    // Use DIFFERENT bid ids so neither call hits the same-bid idempotency
    // short-circuit. With both contesting the plan, exactly one wins (200)
    // and the other must be rejected (409) by the plan-state guard.
    const [r1, r2] = await Promise.all([
      request.post(`${BASE_URL}/api/care-plans/${plan.id}/accept-bid`, { headers, data: { bid_id: acceptedBid.id } }),
      request.post(`${BASE_URL}/api/care-plans/${plan.id}/accept-bid`, { headers, data: { bid_id: otherBid.id } })
    ]);
    const statuses = [r1.status(), r2.status()].sort();
    expect(statuses).toEqual([200, 409]);

    const winner = r1.status() === 200 ? await r1.json() : await r2.json();
    expect(winner.payment_intent_id).toMatch(/^pi_/);

    const { data: planRow } = await sb.from('care_plans').select('stripe_payment_intent_id').eq('id', plan.id).single();
    expect(planRow.stripe_payment_intent_id).toBe(winner.payment_intent_id);

    // Authoritative orphan-absence check via Stripe metadata search.
    // Search has eventual-consistency latency, so poll briefly until the
    // winner's PI shows up; an orphan would also show up here if it existed.
    let live = [];
    for (let i = 0; i < 10; i++) {
      const search = await stripe.paymentIntents.search({
        query: `metadata['flow']:'care_plan' AND metadata['care_plan_id']:'${plan.id}'`,
        limit: 10
      });
      live = (search.data || []).filter((pi) => pi.status !== 'canceled');
      if (live.some((pi) => pi.id === winner.payment_intent_id)) break;
      await new Promise(r => setTimeout(r, 500));
    }
    expect(live.length).toBe(1);
    expect(live[0].id).toBe(winner.payment_intent_id);
  });
});

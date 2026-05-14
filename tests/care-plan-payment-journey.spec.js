'use strict';

// Task #282: End-to-end coverage for the member care plan payment journey.
//
// Scenario A (happy path): seed a member + care plan + two competing provider
// bids, sign the member in, accept one bid via the live /accept-bid endpoint
// (which creates a manual-capture Stripe PaymentIntent), simulate the
// `payment_intent.amount_capturable_updated` webhook by flipping the plan to
// `payment_status='held'`, then mark the plan complete and verify Stripe
// captured the funds and a `care_plan_completions` row was written.
//
// Scenario B (concurrency): fire two parallel POSTs to /accept-bid against the
// same plan; one must succeed (200 with a single PaymentIntent) and the other
// must be rejected with a 409 — there must be no second "orphan" PaymentIntent
// authorized against the member.
//
// The full live leg requires a working Stripe test-mode key AND a Connect
// account on the seeded provider. When Stripe isn't usable (e.g. expired key
// in dev sandboxes) we still exercise every contract path the endpoints expose
// (auth, ownership, bid validation, plan-state 409) so the test stays useful.

const { test, expect } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

const TEST_MEMBER_EMAIL = process.env.MEMBER_TEST_EMAIL || 'testmember@mcc-test.com';
const TEST_MEMBER_PASS = process.env.MEMBER_TEST_PASSWORD || 'TestPass123!';
const TEST_PROVIDER_EMAIL = process.env.PROVIDER_TEST_EMAIL || 'testprovider_a@mcc-test.com';
const TEST_PROVIDER_B_EMAIL = process.env.PROVIDER_B_TEST_EMAIL || 'testprovider_b@mcc-test.com';

const SKIP_REASON = (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
  ? 'Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (skipping care-plan journey suite)'
  : null;

test.describe('Care plan payment journey (Task #282)', () => {
  test.skip(!!SKIP_REASON, SKIP_REASON || '');

  const seededPlanIds = [];
  let sb;
  let stripe = null;
  let stripeUsable = false;
  let stripeConnectAccountId = null;
  let restoreProviderStripeId = null;

  let memberId;
  let memberToken;
  let providerId;
  let providerBId;

  test.beforeAll(async () => {
    // Service-role client used for ALL admin/seed operations. We never call
    // signInWithPassword on this client because supabase-js would switch its
    // Authorization header from the service role key to the user's JWT and
    // subsequent inserts would start hitting RLS.
    sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 1. Resolve member + provider profiles already seeded by the test suite.
    const { data: member } = await sb.from('profiles').select('id').eq('email', TEST_MEMBER_EMAIL).single();
    const { data: provider } = await sb.from('profiles').select('id, stripe_account_id').eq('email', TEST_PROVIDER_EMAIL).single();
    const { data: providerB } = await sb.from('profiles').select('id').eq('email', TEST_PROVIDER_B_EMAIL).single();
    if (!member || !provider || !providerB) {
      throw new Error(`Test fixtures missing: ensure ${TEST_MEMBER_EMAIL}, ${TEST_PROVIDER_EMAIL}, and ${TEST_PROVIDER_B_EMAIL} profiles exist.`);
    }
    memberId = member.id;
    providerId = provider.id;
    providerBId = providerB.id;
    restoreProviderStripeId = provider.stripe_account_id;

    // 2. Member JWT for the live API calls — minted via the GoTrue REST API
    //    directly (mirrors tests/helpers.js#getAdminBrowserSession). Going
    //    through supabase-js's signInWithPassword would mutate the calling
    //    client's Authorization header from the service-role key to the
    //    member JWT, breaking subsequent admin seeds.
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_SERVICE_KEY },
      body: JSON.stringify({ email: TEST_MEMBER_EMAIL, password: TEST_MEMBER_PASS })
    });
    if (!authRes.ok) {
      throw new Error(`Member sign-in failed: HTTP ${authRes.status} ${await authRes.text()}`);
    }
    const session = await authRes.json();
    memberToken = session.access_token;

    // 3. Probe Stripe — we need both a working key and the ability to mint a
    //    test Connect account so the provider has a destination for the
    //    transfer. If anything fails we leave `stripeUsable` false and the
    //    live-capture test gracefully skips.
    if (STRIPE_SECRET_KEY) {
      try {
        stripe = new Stripe(STRIPE_SECRET_KEY);
        const acct = await stripe.accounts.create({
          type: 'express',
          country: 'US',
          email: `mcc-task282-${Date.now()}@example.com`,
          capabilities: { card_payments: { requested: true }, transfers: { requested: true } }
        });
        stripeConnectAccountId = acct.id;
        // The /accept-bid handler hard-rejects (409) when the destination
        // account isn't `charges_enabled`. Newly-created Express accounts
        // typically aren't, so refuse to mark the live leg usable unless
        // Stripe says the account can actually accept charges — otherwise
        // we'd surface flaky 409s instead of clean skips.
        if (acct.charges_enabled) {
          await sb.from('profiles').update({ stripe_account_id: acct.id }).eq('id', providerId);
          stripeUsable = true;
        } else {
          console.warn('[Task #282 spec] Stripe live leg disabled: Connect account not charges_enabled (Express accounts in test mode typically require onboarding before charges_enabled flips true).');
          stripeUsable = false;
        }
      } catch (err) {
        console.warn(`[Task #282 spec] Stripe live leg disabled: ${err.code || ''} ${err.message}`);
        stripeUsable = false;
      }
    }
  });

  test.afterAll(async () => {
    if (!sb) return;
    // Cancel any still-open PaymentIntents we created on these plans.
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
    // Clean up the test Connect account and restore the provider's prior value.
    if (stripeConnectAccountId && stripe) {
      try { await stripe.accounts.del(stripeConnectAccountId); } catch (_) {}
    }
    await sb.from('profiles').update({ stripe_account_id: restoreProviderStripeId }).eq('id', providerId);
  });

  async function seedPlan({ closeOffsetMin = 60 } = {}) {
    const closesAt = new Date(Date.now() + closeOffsetMin * 60_000).toISOString();
    const { data: plan, error: planErr } = await sb.from('care_plans').insert({
      title: `Task282 plan ${Date.now()}`,
      member_id: memberId,
      status: 'open',
      zip_code: '10001',
      service_types: ['oil_change'],
      bid_closes_at: closesAt
    }).select().single();
    if (planErr) throw planErr;
    seededPlanIds.push(plan.id);

    // Two competing bids from two different providers (a unique constraint on
    // (care_plan_id, provider_id) prevents seeding two bids from the same
    // provider). Provider A is the one we'll accept; provider B is the loser.
    const { data: bidA, error: bidAErr } = await sb.from('plan_bids').insert({
      care_plan_id: plan.id, provider_id: providerId, amount: 175, status: 'pending'
    }).select().single();
    if (bidAErr) throw bidAErr;
    const { data: bidB, error: bidBErr } = await sb.from('plan_bids').insert({
      care_plan_id: plan.id, provider_id: providerBId, amount: 220, status: 'pending'
    }).select().single();
    if (bidBErr) throw bidBErr;

    return { plan, acceptedBid: bidA, otherBid: bidB };
  }

  // --- Contract guarantees that don't need Stripe -----------------------------

  test('POST /accept-bid rejects unauthenticated callers with 401', async ({ request }) => {
    const { plan, acceptedBid } = await seedPlan();
    const res = await request.post(`${BASE_URL}/api/care-plans/${plan.id}/accept-bid`, {
      data: { bid_id: acceptedBid.id },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(res.status()).toBe(401);
  });

  test('POST /accept-bid rejects non-owner callers with 403', async ({ request }) => {
    // Mint a JWT for a different user (the test provider) and try to accept a
    // bid on the member's plan — the handler must refuse with 403 even though
    // the caller is otherwise authenticated.
    const { plan, acceptedBid } = await seedPlan();
    const otherAuth = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_SERVICE_KEY },
      body: JSON.stringify({
        email: TEST_PROVIDER_EMAIL,
        password: process.env.PROVIDER_TEST_PASSWORD || 'TestPass123!'
      })
    });
    test.skip(!otherAuth.ok, `Could not sign in ${TEST_PROVIDER_EMAIL} to test ownership 403`);
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

  test('POST /accept-bid blocks 409 when payment_status is already held', async ({ request }) => {
    // Optimistic-concurrency guard: any plan whose payment_status is outside
    // {none, requires_payment, failed, cancelled} must reject a fresh
    // /accept-bid even if a (real or stale) payment is already in flight.
    const { plan, acceptedBid } = await seedPlan();
    await sb.from('care_plans').update({ payment_status: 'held' }).eq('id', plan.id);
    const res = await request.post(`${BASE_URL}/api/care-plans/${plan.id}/accept-bid`, {
      headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
      data: { bid_id: acceptedBid.id }
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(String(body.error || '').toLowerCase()).toContain('held');
  });

  // --- Live escrow journey (Stripe) ------------------------------------------

  test('Happy path: accept bid → funds held → mark complete → captured', async ({ request }) => {
    test.skip(!stripeUsable, 'Stripe test key not usable in this environment');

    const { plan, acceptedBid } = await seedPlan();

    // 1) Accept the bid → server creates a manual-capture PaymentIntent.
    const acceptRes = await request.post(`${BASE_URL}/api/care-plans/${plan.id}/accept-bid`, {
      headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
      data: { bid_id: acceptedBid.id }
    });
    expect(acceptRes.status()).toBe(200);
    const acceptBody = await acceptRes.json();
    expect(acceptBody.payment_intent_id).toMatch(/^pi_/);
    expect(acceptBody.client_secret).toBeTruthy();
    expect(Number(acceptBody.escrow_amount)).toBeGreaterThan(0);
    const piId = acceptBody.payment_intent_id;

    // 2) The plan should now reflect requires_payment + the accepted bid.
    const { data: planAfterAccept } = await sb.from('care_plans')
      .select('payment_status, accepted_bid_id, stripe_payment_intent_id, escrow_amount')
      .eq('id', plan.id).single();
    expect(planAfterAccept.payment_status).toBe('requires_payment');
    expect(planAfterAccept.accepted_bid_id).toBe(acceptedBid.id);
    expect(planAfterAccept.stripe_payment_intent_id).toBe(piId);

    // 3) Confirm the PI server-side with Stripe's tokenless test PM. This
    //    moves the manual-capture intent straight to `requires_capture`,
    //    mimicking what the front-end's Stripe.js confirm flow does.
    await stripe.paymentIntents.confirm(piId, { payment_method: 'pm_card_visa' });
    const piHeld = await stripe.paymentIntents.retrieve(piId);
    expect(piHeld.status).toBe('requires_capture');

    // 4) Simulate the `amount_capturable_updated` webhook flipping the plan
    //    into the held-funds state that the /complete endpoint requires.
    await sb.from('care_plans').update({ payment_status: 'held' }).eq('id', plan.id);

    // 5) Mark complete → server captures the PI and writes a completion row.
    const completeRes = await request.post(`${BASE_URL}/api/care-plans/${plan.id}/complete`, {
      headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' },
      data: { completion_notes: 'Task282 e2e capture' }
    });
    expect(completeRes.status()).toBe(201);
    const completeBody = await completeRes.json();
    expect(completeBody.payment.captured).toBe(true);
    expect(completeBody.payment.payment_intent_id).toBe(piId);
    expect(completeBody.completion).toBeTruthy();

    // 6) Database side-effects: plan flips to captured/completed and a
    //    care_plan_completions row is persisted for the accepted bid.
    const { data: planFinal } = await sb.from('care_plans')
      .select('payment_status, status').eq('id', plan.id).single();
    expect(planFinal.payment_status).toBe('captured');
    expect(planFinal.status).toBe('completed');

    const { data: completion } = await sb.from('care_plan_completions')
      .select('id, care_plan_id, provider_id').eq('care_plan_id', plan.id).maybeSingle();
    expect(completion).toBeTruthy();
    expect(completion.provider_id).toBe(providerId);

    // 7) Stripe agrees the PI was captured.
    const piCaptured = await stripe.paymentIntents.retrieve(piId);
    expect(piCaptured.status).toBe('succeeded');
  });

  test('Concurrency: parallel /accept-bid yields exactly one success and no orphan PaymentIntent', async ({ request }) => {
    test.skip(!stripeUsable, 'Stripe test key not usable in this environment');

    const { plan, acceptedBid } = await seedPlan();
    const headers = { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' };
    const payload = { bid_id: acceptedBid.id };

    const [r1, r2] = await Promise.all([
      request.post(`${BASE_URL}/api/care-plans/${plan.id}/accept-bid`, { headers, data: payload }),
      request.post(`${BASE_URL}/api/care-plans/${plan.id}/accept-bid`, { headers, data: payload })
    ]);

    const statuses = [r1.status(), r2.status()].sort();
    const bodies = await Promise.all([r1.json(), r2.json()]);

    // The endpoint also has an idempotency branch that returns 200 with
    // `already_initiated:true` when the SAME bid_id is replayed against an
    // existing in-flight PI. Acceptable outcomes are therefore:
    //   * one 200 + one 409 (concurrency guard tripped on the loser), or
    //   * two 200s where one carries `already_initiated:true` (idempotency
    //     short-circuit returned the same PI to both callers).
    // What we MUST NOT see is two distinct PaymentIntents authorized.
    const okBodies = bodies.filter((_, i) => [r1, r2][i].status() === 200);
    const piIds = new Set(okBodies.map((b) => b.payment_intent_id).filter(Boolean));
    expect(piIds.size).toBe(1);

    if (statuses[0] === 200 && statuses[1] === 409) {
      // expected concurrency-loser path
    } else {
      expect(statuses).toEqual([200, 200]);
      const idemFlag = okBodies.some((b) => b.already_initiated === true);
      expect(idemFlag).toBe(true);
    }

    // No orphan PI: only one PI may exist on the plan, and Stripe must agree
    // that's the only one in an authorizable state for this idempotency prefix.
    const { data: planRow } = await sb.from('care_plans')
      .select('stripe_payment_intent_id').eq('id', plan.id).single();
    expect(planRow.stripe_payment_intent_id).toBe([...piIds][0]);

    // Authoritative check against Stripe itself: search for every
    // PaymentIntent tagged with this care_plan_id + bid_id and prove there's
    // exactly one (the idempotency key on the server should have de-duped the
    // race; if it didn't, a second authorized PI would show up here even when
    // our DB only stores one).
    const search = await stripe.paymentIntents.search({
      query: `metadata['flow']:'care_plan' AND metadata['care_plan_id']:'${plan.id}' AND metadata['bid_id']:'${acceptedBid.id}'`,
      limit: 10
    });
    const authorizable = (search.data || []).filter((pi) => pi.status !== 'canceled');
    expect(authorizable.length).toBe(1);
    expect(authorizable[0].id).toBe(planRow.stripe_payment_intent_id);
  });
});

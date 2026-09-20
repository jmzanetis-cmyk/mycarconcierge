// ============================================================================
// provider-plan-checkout
//
// POST /api/provider/plan-checkout  { plan_key: 'starter' | 'standard' }
//
// Creates a Stripe Checkout Session in subscription mode with the §2.4a
// "Free until first customer" trial mechanics:
//   • trial_period_days = 730 (Stripe's practical ceiling)
//   • trial_settings.end_behavior.missing_payment_method = 'cancel'
//     (card must be attached at checkout; if it's ever missing when the
//     trial ends, subscription cancels rather than dropping to unpaid)
//   • subscription_data.metadata: product='provider_plan', provider_id, plan_key
//     (webhook handlers gate on these; see _provider-plan-webhooks.js)
//
// One trial per provider ever (§2.4a). This endpoint pre-checks with a
// 409 trial_used response before hitting Stripe; the DB partial unique
// index on provider_subscriptions(provider_id) WHERE trial_started_at
// IS NOT NULL is the belt-and-suspenders.
//
// Auth: Bearer JWT of role='provider'.
// Route mapped in www/_redirects: /api/provider/plan-checkout
// ============================================================================

const { createClient } = require('@supabase/supabase-js');
const { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');
const { isLiveKey } = require('../../lib/stripe-mode');

const TRIAL_DAYS = 730;

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return require('stripe')(key, { apiVersion: STRIPE_API_VERSION });
}

function siteOrigin(event) {
  const proto = (event.headers && (event.headers['x-forwarded-proto'] || 'https'));
  const host  = (event.headers && (event.headers['x-forwarded-host'] || event.headers.host));
  if (host) return `${proto}://${host}`;
  return process.env.SITE_URL || 'https://www.mycarconcierge.com';
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(204, '');
  if (event.httpMethod !== 'POST')    return json(405, { error: 'POST only' });

  // FEATURE_PROVIDER_PLANS gate — see /api/config for the client-side
  // counterpart. Server-side gate stays regardless of what the client
  // renders (defense against curl bypass). Webhooks are NOT gated —
  // once a subscription exists it must be honored even if the flag flips.
  if (process.env.FEATURE_PROVIDER_PLANS !== 'true') {
    return json(403, { error: 'plans_disabled' });
  }

  const supabase = getSupabase();
  if (!supabase) return json(500, { error: 'Database not configured' });
  const stripe = getStripe();
  if (!stripe) return json(500, { error: 'Stripe not configured' });

  // ── Auth ────────────────────────────────────────────────────────────
  const auth = event.headers.authorization || event.headers.Authorization || '';
  const token = (auth.match(/^Bearer\s+(.+)$/i) || [])[1];
  if (!token) return json(401, { error: 'Bearer token required' });

  const { data: userData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !userData || !userData.user) return json(401, { error: 'invalid token' });
  const user = userData.user;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, role, business_name, full_name')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return json(404, { error: 'profile not found' });
  if (profile.role !== 'provider') return json(403, { error: 'provider role required' });

  // ── Body ────────────────────────────────────────────────────────────
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch { return json(400, { error: 'invalid JSON' }); }
  }
  const planKey = body.plan_key;
  if (!planKey) return json(400, { error: 'plan_key required' });

  // ── Plan lookup ─────────────────────────────────────────────────────
  // Mode-aware price id read — see admin-provider-plans-bootstrap.js
  // header for why the DB stores test and live ids side-by-side.
  const isLive = isLiveKey(process.env.STRIPE_SECRET_KEY || '');
  const priceCol = isLive ? 'stripe_price_monthly' : 'stripe_price_monthly_test';

  const { data: plan } = await supabase
    .from('subscription_plans')
    .select('plan_key, name, credits_per_month, ' + priceCol + ', is_active')
    .eq('plan_key', planKey)
    .maybeSingle();
  if (!plan) return json(404, { error: 'plan not found', plan_key: planKey });
  if (!plan.is_active) return json(400, { error: 'plan not active', plan_key: planKey });
  const stripePrice = plan[priceCol];
  if (!stripePrice) {
    return json(503, {
      error: 'plan_not_provisioned',
      details: `${priceCol} is null for ${planKey} (livemode=${isLive}). Run POST /api/admin/provider-plans/bootstrap.`,
    });
  }

  // ── §2.4a one trial per provider ────────────────────────────────────
  const { data: priorTrial } = await supabase
    .from('provider_subscriptions')
    .select('id, status')
    .eq('provider_id', user.id)
    .not('trial_started_at', 'is', null)
    .maybeSingle();
  if (priorTrial) {
    return json(409, {
      error: 'trial_used',
      details: 'A trial has already been started for this provider. Subscribe on a paid plan directly, or contact support.',
    });
  }

  // ── Stripe customer (idempotent by email) ───────────────────────────
  // Reuse an existing customer if one exists for this email; otherwise
  // create. Providers don't otherwise have a stripe_customer_id column
  // on profiles today (Stripe Connect uses stripe_account_id, distinct).
  let customerId = null;
  try {
    const { data: existingCustomers } = await stripe.customers.list({ email: profile.email, limit: 1 });
    if (existingCustomers && existingCustomers.length > 0) {
      customerId = existingCustomers[0].id;
    } else {
      const created = await stripe.customers.create({
        email: profile.email,
        name: profile.business_name || profile.full_name || undefined,
        metadata: { provider_id: user.id },
      });
      customerId = created.id;
    }
  } catch (e) {
    console.error('[plan-checkout] stripe customer error:', e.message);
    return json(502, { error: 'stripe_customer_failed', details: e.message });
  }

  const origin = siteOrigin(event);
  // §native purchase flow — see create-bid-checkout.js. Client sends
  // platform:'native' when the trial is started from Capacitor; the
  // return page is a static one that any Safari session can render.
  const isNativeCaller = body.platform === 'native';
  const successUrl = isNativeCaller
    ? `${origin}/purchase-complete.html?kind=plan&plan=${encodeURIComponent(planKey)}`
    : `${origin}/providers.html?subscription=success#subscription`;
  const cancelUrl  = isNativeCaller
    ? `${origin}/purchase-cancelled.html?kind=plan`
    : `${origin}/providers.html?subscription=cancelled#subscription`;

  // Checkout copy — Stripe hard-codes the 730-day trial header text
  // ("Free for 730 days · Then $X per month starting ..."), so the
  // clarifying language lives here in the custom_text block and in
  // subscription_data.description. Both fields cap at 1200 characters
  // per Stripe. Wording review 2026-09-20 — pending counsel per PR #17
  // item (d).
  const CUSTOM_TEXT_SUBMIT =
    "Your card will not be charged until you win your first customer on MyCarConcierge. When your first bid is accepted, your plan starts at the monthly price shown and renews monthly until you cancel. Stripe requires a fixed trial length, so it shows the maximum (730 days); your actual free period ends at your first accepted bid. You can also buy one-time bid credit packs at any time, with or without a plan.";
  const CUSTOM_TEXT_AFTER_SUBMIT =
    "You're set. No charge today — billing begins when your first bid is accepted. Manage or cancel anytime from Credits & Plans.";
  const SUB_DESCRIPTION =
    'MCC ' + (plan.name || planKey) + ' — free until first accepted bid';

  // ── Checkout Session ────────────────────────────────────────────────
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: stripePrice, quantity: 1 }],
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        trial_settings: {
          end_behavior: { missing_payment_method: 'cancel' },
        },
        description: SUB_DESCRIPTION,
        metadata: {
          product: 'provider_plan',
          provider_id: user.id,
          plan_key: planKey,
        },
      },
      custom_text: {
        submit:       { message: CUSTOM_TEXT_SUBMIT },
        after_submit: { message: CUSTOM_TEXT_AFTER_SUBMIT },
      },
      payment_method_collection: 'always',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        product: 'provider_plan',
        provider_id: user.id,
        platform: isNativeCaller ? 'native' : 'web',
        plan_key: planKey,
      },
    });
    return json(200, { checkout_url: session.url, session_id: session.id });
  } catch (e) {
    console.error('[plan-checkout] session create failed:', e.message);
    return json(502, { error: 'checkout_failed', details: e.message });
  }
};

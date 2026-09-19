// ============================================================================
// admin-provider-plans-bootstrap
//
// One-shot admin endpoint that seeds Stripe Products + monthly Prices for
// every active subscription_plans row where stripe_price_monthly IS NULL.
// Idempotent — plans already carrying a Stripe price ID are skipped.
//
// Environment sensitivity:
//   • On the provider-plans branch draft (deploy-preview context), Netlify
//     serves the sk_test_… Stripe key. Running this endpoint there creates
//     TEST-mode products/prices. Safe.
//   • On production (main branch, live context), Netlify serves sk_live_…
//     Running this endpoint there creates LIVE products. Do NOT run in prod
//     until Jordan explicitly says "create live products" — the Phase 2 spec
//     says live products get created at merge time, not before.
//
// Metadata written to each Stripe Product + Price:
//   product          = 'provider_plan'   (webhook handlers gate on this)
//   plan_key         = 'starter' | 'standard' | ...
//   credits_per_month= '10' | '25' | ...
//
// Auth: admin Bearer JWT (utils.authenticateBearerAdmin).
//
// Route: POST /.netlify/functions/admin-provider-plans-bootstrap
//         (also exposed at /api/admin/provider-plans/bootstrap via _redirects)
// ============================================================================

const { createClient } = require('@supabase/supabase-js');
const utils = require('./utils');

const { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body: typeof data === 'string' ? data : JSON.stringify(data),
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

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  if (event.httpMethod !== 'POST')    return jsonResponse(405, { error: 'POST only' });

  const supabase = getSupabase();
  if (!supabase) return jsonResponse(500, { error: 'Database not configured' });

  const admin = await utils.authenticateBearerAdmin(event, supabase);
  if (!admin) return jsonResponse(401, { error: 'Unauthorized' });

  const stripe = getStripe();
  if (!stripe) return jsonResponse(500, { error: 'Stripe not configured' });

  // Startup log — proves which mode we're seeding into.
  const rawKey = process.env.STRIPE_SECRET_KEY || '';
  const keyPrefix = rawKey.slice(0, 8);
  const isLive = rawKey.startsWith('sk_live_');
  console.log(`[admin-provider-plans-bootstrap] stripe_key_prefix=${keyPrefix} livemode=${isLive}`);

  // Only bootstrap plans that are active AND missing a monthly Stripe price.
  // Pro / Shop (is_active=false) stay dormant; when they're released, this
  // endpoint re-runs and provisions them without touching the two live ones.
  const { data: plans, error: qErr } = await supabase
    .from('subscription_plans')
    .select('plan_key, name, credits_per_month, monthly_price_cents, stripe_price_monthly')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (qErr) return jsonResponse(500, { error: 'plan fetch failed', details: qErr.message });

  const results = [];
  for (const plan of plans || []) {
    if (plan.stripe_price_monthly) {
      results.push({ plan_key: plan.plan_key, status: 'skipped', reason: 'already_provisioned',
                     stripe_price_monthly: plan.stripe_price_monthly });
      continue;
    }

    try {
      // 1. Create the Product with metadata that webhook handlers gate on.
      const product = await stripe.products.create({
        name: `MCC ${plan.name}`,
        description: `${plan.credits_per_month} bid credits per month`,
        metadata: {
          product: 'provider_plan',
          plan_key: plan.plan_key,
          credits_per_month: String(plan.credits_per_month),
        },
      });

      // 2. Create the recurring monthly Price with the same metadata mirrored.
      //    Stripe recommends metadata on both Product AND Price because some
      //    webhook payloads reference only one or the other depending on
      //    event type.
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.monthly_price_cents,
        currency: 'usd',
        recurring: { interval: 'month' },
        metadata: {
          product: 'provider_plan',
          plan_key: plan.plan_key,
          credits_per_month: String(plan.credits_per_month),
        },
      });

      // 3. Record the price ID on the plan. Store product ID too for future
      //    reference (annual price creation in Phase 3 will attach here).
      const { error: uErr } = await supabase
        .from('subscription_plans')
        .update({ stripe_price_monthly: price.id })
        .eq('plan_key', plan.plan_key);
      if (uErr) throw new Error(`db update failed: ${uErr.message}`);

      results.push({
        plan_key: plan.plan_key,
        status: 'created',
        stripe_product_id: product.id,
        stripe_price_monthly: price.id,
        unit_amount_cents: plan.monthly_price_cents,
      });
    } catch (e) {
      console.error(`[admin-provider-plans-bootstrap] ${plan.plan_key} failed:`, e.message);
      results.push({ plan_key: plan.plan_key, status: 'error', error: e.message });
    }
  }

  return jsonResponse(200, {
    livemode: isLive,
    stripe_key_prefix: keyPrefix,
    processed: results.length,
    results,
  });
};

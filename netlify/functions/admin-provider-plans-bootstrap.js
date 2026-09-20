// ============================================================================
// admin-provider-plans-bootstrap
//
// One-shot admin endpoint that seeds Stripe Products + monthly Prices for
// every active subscription_plans row. Idempotent — plans already carrying
// a valid Stripe price ID for the current key mode are skipped.
//
// Mode awareness (the whole point of migration 20260920a):
//   • Draft (sk_test_…) writes to stripe_product_id_test /
//     stripe_price_monthly_test and reads only those columns for the skip
//     check.
//   • Production (sk_live_…) writes to stripe_product_id /
//     stripe_price_monthly and reads only those.
//
// The DB is shared between draft and production, so the pre-migration
// single-column layout would have made a prod bootstrap silently skip
// creation (test ids from the sandbox run sat in the same field). See PR
// discussion + 20260920a header for the failure mode.
//
// Skip check is now two-part:
//   (a) DB column for this mode is non-null, AND
//   (b) stripe.prices.retrieve(id) succeeds (id still exists in Stripe).
// If (a) passes but (b) 404s (someone deleted the object out-of-band),
// we treat it as unprovisioned and recreate — the new price id overwrites
// the stale one.
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

// Column pair for the current Stripe mode. Exported for the unit test.
function columnsForMode(isLive) {
  return isLive
    ? { priceCol: 'stripe_price_monthly',       productCol: 'stripe_product_id' }
    : { priceCol: 'stripe_price_monthly_test',  productCol: 'stripe_product_id_test' };
}

// Bootstrap loop factored out of the handler so the unit test can drive it
// against stripe + supabase stubs without setting up an HTTP event.
async function bootstrapPlans({ supabase, stripe, isLive }) {
  const { priceCol, productCol } = columnsForMode(isLive);

  const { data: plans, error: qErr } = await supabase
    .from('subscription_plans')
    .select(
      'plan_key, name, credits_per_month, monthly_price_cents, ' +
      'stripe_price_monthly, stripe_price_monthly_test, ' +
      'stripe_product_id, stripe_product_id_test'
    )
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (qErr) throw new Error('plan fetch failed: ' + qErr.message);

  const results = [];
  for (const plan of plans || []) {
    const existingPrice = plan[priceCol];

    if (existingPrice) {
      // (b) Confirm the price still exists in Stripe. If it does, skip.
      // A `resource_missing` means someone deleted it out-of-band — fall
      // through to recreate.
      try {
        await stripe.prices.retrieve(existingPrice);
        results.push({
          plan_key: plan.plan_key,
          status: 'skipped',
          reason: 'already_provisioned',
          [priceCol]: existingPrice,
        });
        continue;
      } catch (e) {
        if (e.code !== 'resource_missing') {
          results.push({ plan_key: plan.plan_key, status: 'error',
                         error: 'stripe retrieve failed: ' + e.message });
          continue;
        }
        // resource_missing → fall through to recreate.
      }
    }

    try {
      const product = await stripe.products.create({
        name: `MCC ${plan.name}`,
        description: `${plan.credits_per_month} bid credits per month`,
        metadata: {
          product: 'provider_plan',
          plan_key: plan.plan_key,
          credits_per_month: String(plan.credits_per_month),
        },
      });

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

      // Write ONLY the columns for this mode. Explicit object build so the
      // opposite mode's columns are never touched — critical when both
      // modes share the DB.
      const patch = {};
      patch[priceCol]   = price.id;
      patch[productCol] = product.id;

      const { error: uErr } = await supabase
        .from('subscription_plans')
        .update(patch)
        .eq('plan_key', plan.plan_key);
      if (uErr) throw new Error(`db update failed: ${uErr.message}`);

      results.push({
        plan_key: plan.plan_key,
        status: 'created',
        [productCol]: product.id,
        [priceCol]:   price.id,
        unit_amount_cents: plan.monthly_price_cents,
      });
    } catch (e) {
      console.error(`[admin-provider-plans-bootstrap] ${plan.plan_key} failed:`, e.message);
      results.push({ plan_key: plan.plan_key, status: 'error', error: e.message });
    }
  }

  return results;
}

async function bootstrapCoupon(stripe) {
  // Subscriber pack discount coupon per spec §2.4 — retrieve-before-create
  // so re-runs don't fail on duplicate id. Stripe coupons are mode-scoped
  // exactly like prices, so the "already exists" check runs per-mode
  // naturally without any DB gymnastics.
  try {
    try {
      const existing = await stripe.coupons.retrieve('mcc-subscriber-10off');
      return { status: 'exists', id: existing.id, percent_off: existing.percent_off };
    } catch (notFoundErr) {
      if (notFoundErr.code === 'resource_missing') {
        const created = await stripe.coupons.create({
          id: 'mcc-subscriber-10off',
          percent_off: 10,
          duration: 'forever',
          name: 'MCC Subscriber (10% off any pack)',
          metadata: { product: 'provider_plan_subscriber_pack_discount' },
        });
        return { status: 'created', id: created.id, percent_off: created.percent_off };
      }
      throw notFoundErr;
    }
  } catch (e) {
    console.error('[admin-provider-plans-bootstrap] coupon bootstrap failed:', e.message);
    return { status: 'error', error: e.message };
  }
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

  const rawKey = process.env.STRIPE_SECRET_KEY || '';
  const keyPrefix = rawKey.slice(0, 8);
  const isLive = rawKey.startsWith('sk_live_');
  console.log(`[admin-provider-plans-bootstrap] stripe_key_prefix=${keyPrefix} livemode=${isLive}`);

  let results;
  try {
    results = await bootstrapPlans({ supabase, stripe, isLive });
  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
  const couponInfo = await bootstrapCoupon(stripe);

  return jsonResponse(200, {
    livemode: isLive,
    stripe_key_prefix: keyPrefix,
    processed: results.length,
    results,
    coupon: couponInfo,
  });
};

exports.bootstrapPlans   = bootstrapPlans;
exports.bootstrapCoupon  = bootstrapCoupon;
exports.columnsForMode   = columnsForMode;

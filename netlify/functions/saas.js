// GET  /api/saas/plans          — public plan catalog from saas_plans table
// POST /api/saas/checkout        — create Stripe Checkout session (auth required)
// POST /api/saas/billing-portal  — create Stripe Billing Portal session (auth required)
const { createClient } = require('@supabase/supabase-js');
const { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return require('stripe')(key, { apiVersion: STRIPE_API_VERSION });
}

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

async function getUser(event, sb) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { error: json(401, { error: 'Missing token' }) };
  const { data: { user }, error } = await sb.auth.getUser(m[1].trim());
  if (error || !user) return { error: json(401, { error: 'Invalid token' }) };
  return { user };
}

function stripRoute(path) {
  return (path || '').replace(/.*\/api\/saas\/?/, '').replace(/\/$/, '');
}

// Build the nested plans object: { [product]: { name, description, tiers: { [plan]: {...} } } }
function shapePlans(rows) {
  const PRODUCT_LABELS = {
    fleet: { name: 'Fleet Management', description: 'Manage your entire fleet with real-time tracking, maintenance, and reporting.' },
    shop: { name: 'Shop Tools', description: 'Streamline your shop operations with scheduling, CRM, and digital check-in.' },
    outreach: { name: 'Outreach & Marketing', description: 'Grow your customer base with automated outreach, reviews, and promotions.' },
    ai_api: { name: 'AI API Access', description: 'Access the My Car Concierge AI API for vehicle insights, matching, and diagnostics.' },
    white_label: { name: 'White Label', description: 'Deploy a fully branded version of My Car Concierge for your business.' },
  };

  const products = {};
  for (const row of rows) {
    if (!products[row.product]) {
      const label = PRODUCT_LABELS[row.product] || { name: row.product, description: '' };
      products[row.product] = { name: label.name, description: label.description, tiers: {} };
    }
    products[row.product].tiers[row.plan] = {
      name: row.display_name,
      price_monthly: row.price_monthly,
      price_annual: row.price_annual,
      stripe_price_id: row.stripe_price_id || null,
      stripe_price_id_annual: row.stripe_price_id_annual || null,
      features: Array.isArray(row.features) ? row.features : (row.features || []),
      limits: row.limits || null,
    };
  }
  return products;
}

async function handlePlans(sb) {
  const { data, error } = await sb
    .from('saas_plans')
    .select('product, plan, display_name, price_monthly, price_annual, stripe_price_id, stripe_price_id_annual, features, limits')
    .eq('is_active', true)
    .order('product')
    .order('price_monthly');

  if (error) return json(500, { error: error.message });
  return json(200, { plans: shapePlans(data || []) });
}

async function ensureStripeCustomer(sb, st, user) {
  const { data: profile } = await sb
    .from('profiles')
    .select('stripe_customer_id, email, full_name')
    .eq('id', user.id)
    .single();

  if (profile?.stripe_customer_id) return profile.stripe_customer_id;

  const customer = await st.customers.create({
    email: user.email || profile?.email,
    name: profile?.full_name || undefined,
    metadata: { user_id: user.id },
  });

  await sb.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', user.id);
  return customer.id;
}

async function handleCheckout(event, sb, user) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const { product, plan, billing = 'monthly', success_url, cancel_url } = body;
  if (!product || !plan) return json(400, { error: 'product and plan required' });

  const { data: planRow } = await sb
    .from('saas_plans')
    .select('stripe_price_id, stripe_price_id_annual')
    .eq('product', product)
    .eq('plan', plan)
    .eq('is_active', true)
    .single();

  if (!planRow) return json(404, { error: 'Plan not found' });

  const priceId = billing === 'annual' ? planRow.stripe_price_id_annual : planRow.stripe_price_id;
  if (!priceId) return json(400, { error: 'This plan requires contacting sales' });

  const st = stripe();
  if (!st) return json(500, { error: 'Payment system unavailable' });

  const customerId = await ensureStripeCustomer(sb, st, user);
  const origin = process.env.URL || 'https://mycarconcierge.com';

  const session = await st.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: success_url || `${origin}/members.html?saas_success=1`,
    cancel_url: cancel_url || `${origin}/members.html`,
    metadata: { user_id: user.id, product, plan },
    subscription_data: {
      metadata: { user_id: user.id, product, plan },
    },
  });

  return json(200, { url: session.url });
}

async function handleBillingPortal(event, sb, user) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const origin = process.env.URL || 'https://mycarconcierge.com';
  const return_url = body.return_url || `${origin}/members.html`;

  const st = stripe();
  if (!st) return json(500, { error: 'Payment system unavailable' });

  const customerId = await ensureStripeCustomer(sb, st, user);

  const session = await st.billingPortal.sessions.create({
    customer: customerId,
    return_url,
  });

  return json(200, { url: session.url });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  const route = stripRoute(event.path);
  const sb = supabase();

  if (event.httpMethod === 'GET' && route === 'plans') return handlePlans(sb);

  const auth = await getUser(event, sb);
  if (auth.error) return auth.error;

  if (event.httpMethod === 'POST' && route === 'checkout') return handleCheckout(event, sb, auth.user);
  if (event.httpMethod === 'POST' && route === 'billing-portal') return handleBillingPortal(event, sb, auth.user);

  return json(405, { error: 'Method not allowed' });
};

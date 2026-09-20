// ============================================================================
// provider-plan-portal
//
// POST /api/provider/plan-portal
//
// Returns a Stripe Billing Portal Session URL for the caller's provider
// subscription. Providers use this to view/change/cancel their plan.
// The Portal is configured (in Stripe dashboard, one-time) with:
//   • cancel at period end
//   • downgrade at period end
//   • upgrade immediate with proration
// per spec §2.4.
//
// Auth: Bearer JWT of role='provider'.
// Route mapped in www/_redirects: /api/provider/plan-portal
// ============================================================================

const { createClient } = require('@supabase/supabase-js');
const { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');

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

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(204, '');
  if (event.httpMethod !== 'POST')    return json(405, { error: 'POST only' });

  // FEATURE_PROVIDER_PLANS gate — see plan-checkout for rationale. Portal
  // is gated too because it depends on the plans flow being live.
  if (process.env.FEATURE_PROVIDER_PLANS !== 'true') {
    return json(403, { error: 'plans_disabled' });
  }

  const supabase = getSupabase();
  if (!supabase) return json(500, { error: 'Database not configured' });
  const stripe = getStripe();
  if (!stripe) return json(500, { error: 'Stripe not configured' });

  const auth = event.headers.authorization || event.headers.Authorization || '';
  const token = (auth.match(/^Bearer\s+(.+)$/i) || [])[1];
  if (!token) return json(401, { error: 'Bearer token required' });
  const { data: userData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !userData || !userData.user) return json(401, { error: 'invalid token' });
  const user = userData.user;

  const { data: sub } = await supabase
    .from('provider_subscriptions')
    .select('stripe_customer_id, stripe_subscription_id')
    .eq('provider_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub || !sub.stripe_customer_id) {
    return json(404, { error: 'no_subscription', details: 'No provider subscription on file.' });
  }

  const origin = (() => {
    const proto = (event.headers && (event.headers['x-forwarded-proto'] || 'https'));
    const host  = (event.headers && (event.headers['x-forwarded-host'] || event.headers.host));
    if (host) return `${proto}://${host}`;
    return process.env.SITE_URL || 'https://www.mycarconcierge.com';
  })();

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/providers.html#subscription`,
    });
    return json(200, { portal_url: portal.url });
  } catch (e) {
    console.error('[plan-portal] session create failed:', e.message);
    return json(502, { error: 'portal_failed', details: e.message });
  }
};

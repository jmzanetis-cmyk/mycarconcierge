// ============================================================================
// admin-plan-consent-preflight
//
// Section A verification-before-merge helper. Creates a Stripe Checkout
// Session with consent_collection.terms_of_service='required' and
// immediately expires it — proves the connected account has the ToS URL
// set in the current key's mode (test on draft, live on prod) without
// leaving a Session open.
//
// Admin-only. POST /.netlify/functions/admin-plan-consent-preflight.
// Reads no DB state; makes exactly two Stripe API calls per invocation
// (create + expire). No side effects on subscriptions, ledger, or DB.
//
// Cleanup path: after Section F is signed off, this endpoint is safe to
// delete — no other code links to it and the routing is direct-URL only.
// ============================================================================

'use strict';

const { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');
const { isLiveKey } = require('../../lib/stripe-mode');
const { TERMS_URL } = require('../../lib/plan-terms-version');
const utils = require('./utils');

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

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(204, '');
  if (event.httpMethod !== 'POST')    return json(405, { error: 'POST only' });

  const supabase = utils.createSupabaseClient();
  if (!supabase) return json(500, { error: 'Database not configured' });

  const admin = await utils.authenticateBearerAdmin(event, supabase);
  if (!admin) return json(401, { error: 'Unauthorized' });

  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key) return json(500, { error: 'Stripe not configured' });
  const isLive = isLiveKey(key);
  const stripe = require('stripe')(key, { apiVersion: STRIPE_API_VERSION });

  // Look up any active recurring price so the create call succeeds.
  let priceId = null;
  try {
    const prices = await stripe.prices.list({ active: true, type: 'recurring', limit: 5 });
    priceId = prices.data[0] && prices.data[0].id;
  } catch (e) {
    return json(502, { error: 'prices_list_failed', details: e.message });
  }
  if (!priceId) return json(404, { error: 'no_recurring_price_in_mode' });

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: 3 },
      payment_method_types: ['card', 'link'],
      consent_collection: { terms_of_service: 'required' },
      custom_text: {
        terms_of_service_acceptance: {
          message: `I agree to the [Terms of Service](${TERMS_URL}).`,
        },
      },
      success_url: 'https://www.mycarconcierge.com/purchase-complete.html?kind=plan',
      cancel_url:  'https://www.mycarconcierge.com/purchase-cancelled.html?kind=plan',
    });
  } catch (e) {
    return json(200, {
      ok: false,
      livemode: isLive,
      stripe_key_prefix: key.slice(0, 8),
      stripe_error_type: e.type || null,
      stripe_error_code: e.code || null,
      error_message: e.message,
    });
  }

  // Expire immediately so nothing lingers.
  let expired;
  try {
    const e = await stripe.checkout.sessions.expire(session.id);
    expired = { id: e.id, status: e.status };
  } catch (e) {
    expired = { error: e.message };
  }

  return json(200, {
    ok: true,
    livemode: isLive,
    stripe_key_prefix: key.slice(0, 8),
    session_created: session.id,
    session_status: session.status,
    expired,
  });
};

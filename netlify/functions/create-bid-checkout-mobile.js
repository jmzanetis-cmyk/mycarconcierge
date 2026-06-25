// ============================================================================
// create-bid-checkout-mobile — bid credit purchase via mobile wallet
//
// POST /api/create-bid-checkout-mobile
//   Body: { packId, providerId, paymentMethodId, walletType }
//
// Unlike the Stripe Checkout redirect flow, this endpoint:
//   1. Validates the pack and provider.
//   2. Creates and confirms a PaymentIntent directly (off-session not needed —
//      the caller already holds the mobile wallet PM from the in-app payment
//      sheet).
//   3. On success, inserts into bid_credit_purchases and increments
//      profiles.bid_credits immediately so the provider sees their credits
//      without waiting for the webhook.
//
// The Stripe webhook will still fire for payment_intent.succeeded and become
// a no-op (idempotency check on bid_credit_purchases.stripe_payment_id).
// ============================================================================
'use strict';

const { createClient } = require('@supabase/supabase-js');
const { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');

function utils() { return require('./utils'); }

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils().optionsResponse();
  if (event.httpMethod !== 'POST') return utils().errorResponse(405, 'Method not allowed');

  const authHeader = event.headers['authorization'] || event.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return utils().errorResponse(401, 'Authentication required');
  }
  const token = authHeader.substring(7);

  const supabase = utils().createSupabaseClient();
  if (!supabase) return utils().errorResponse(500, 'Server configuration error');

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return utils().errorResponse(401, 'Invalid or expired token');

  let parsed;
  try { parsed = JSON.parse(event.body); }
  catch { return utils().errorResponse(400, 'Invalid JSON'); }

  const { packId, providerId: bodyProviderId, paymentMethodId, walletType } = parsed;

  if (!packId || !utils().isValidUUID(packId)) return utils().errorResponse(400, 'Valid packId is required');
  if (!paymentMethodId) return utils().errorResponse(400, 'paymentMethodId is required');

  // Identity guard (audit #4 — bid-credit IDOR). This endpoint writes credits
  // DIRECTLY to bid_credit_purchases + profiles.bid_credits without waiting for
  // the webhook, so trusting a body-supplied providerId would let an authed
  // provider grant credits to any other provider's account instantly. The
  // authenticated user is the only legitimate purchaser.
  const authedProviderId = user.id;
  if (bodyProviderId && bodyProviderId !== authedProviderId) {
    return utils().errorResponse(400, 'providerId mismatch — credits can only be purchased for the authenticated account');
  }

  // Role gate — only providers can buy bid credits.
  const { data: profile, error: profileErr } = await supabase
    .from('profiles').select('role').eq('id', authedProviderId).single();
  if (profileErr || !profile) return utils().errorResponse(403, 'Profile not found');
  if (profile.role !== 'provider') return utils().errorResponse(403, 'Only providers can purchase bid credits');

  // Validate pack
  const { data: pack, error: packErr } = await supabase
    .from('bid_packs').select('*').eq('id', packId).eq('is_active', true).single();
  if (packErr || !pack) return utils().errorResponse(400, 'Invalid service credit pack');

  const priceInCents = Math.round(pack.price * 100);
  const totalBids    = pack.bid_count + (pack.bonus_bids || 0);

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return utils().errorResponse(500, 'Payment service configuration error. Please contact support.');

  const stripe = require('stripe')(stripeKey, { apiVersion: STRIPE_API_VERSION });

  let pi;
  try {
    pi = await stripe.paymentIntents.create({
      amount:         priceInCents,
      currency:       'usd',
      payment_method: paymentMethodId,
      confirm:        true,
      // return_url required for some wallet flows (3DS, redirects)
      return_url: 'https://www.mycarconcierge.com/providers.html?purchase=success',
      description: `${pack.name} — ${totalBids} bid credits`,
      metadata: {
        provider_id: authedProviderId,
        pack_id:     packId,
        bids:        pack.bid_count.toString(),
        bonus_bids:  (pack.bonus_bids || 0).toString(),
        wallet_type: walletType || 'unknown',
      },
    });
  } catch (err) {
    console.error('[create-bid-checkout-mobile] Stripe error:', err.message);
    let msg = 'Payment failed';
    if (err.type === 'StripeAuthenticationError')  msg = 'Payment service configuration error. Please contact support.';
    if (err.type === 'StripeCardError')             msg = err.message;
    return utils().errorResponse(402, msg);
  }

  if (pi.status !== 'succeeded') {
    return utils().errorResponse(402, `Payment not completed (status: ${pi.status}). Please try again.`);
  }

  // Idempotency guard before granting credits
  const { data: existing } = await supabase.from('bid_credit_purchases')
    .select('id').eq('stripe_payment_id', pi.id).limit(1).maybeSingle();

  if (!existing) {
    await supabase.from('bid_credit_purchases').insert({
      provider_id:      authedProviderId,
      pack_id:          packId,
      bids_purchased:   totalBids,
      amount_paid:      pack.price,
      stripe_session_id: `mobile_${pi.id}`,
      stripe_payment_id: pi.id,
      status:           'completed',
      created_at:       new Date().toISOString(),
    }).catch(e => {
      // Race with webhook — only log if it's not a uniqueness violation
      if (!e.message?.includes('23505')) console.error('[create-bid-checkout-mobile] purchase insert error:', e.message);
    });

    const { data: balanceRow } = await supabase.from('profiles')
      .select('bid_credits').eq('id', authedProviderId).maybeSingle();
    await supabase.from('profiles')
      .update({ bid_credits: (balanceRow?.bid_credits || 0) + totalBids })
      .eq('id', authedProviderId);
  }

  return utils().successResponse({
    success:    true,
    credits:    totalBids,
    pack_name:  pack.name,
    payment_id: pi.id,
  });
};

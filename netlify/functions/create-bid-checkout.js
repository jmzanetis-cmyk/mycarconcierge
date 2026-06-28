let utils = require('./utils');
let Stripe = require('stripe');
const { audit: sharedAudit } = require('./_shared/audit');

// Money-path audit wrapper: always log + alert on failure. A failed audit
// must NEVER throw into the money operation.
const audit = (supabase, row) =>
  sharedAudit(supabase, row, {
    alertOnFailure: true,
    logOnFailure: true,
    logPrefix: '[create-bid-checkout]',
  });

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return utils.optionsResponse();
  }

  if (event.httpMethod !== 'POST') {
    return utils.errorResponse(405, 'Method not allowed');
  }

  let authHeader = event.headers['authorization'] || event.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return utils.errorResponse(401, 'Authentication required');
  }

  let token = authHeader.substring(7);
  let supabase = utils.createSupabaseClient();
  if (!supabase) {
    return utils.errorResponse(500, 'Server configuration error');
  }

  let authResult = await supabase.auth.getUser(token);
  if (authResult.error || !authResult.data.user) {
    return utils.errorResponse(401, 'Invalid or expired token');
  }

  let parsed;
  try {
    parsed = JSON.parse(event.body);
  } catch (e) {
    return utils.errorResponse(400, 'Invalid JSON');
  }

  let packId = parsed.packId;
  let bodyProviderId = parsed.providerId; // back-compat: accepted but must equal authed id

  if (!packId || !utils.isValidUUID(packId)) {
    return utils.errorResponse(400, 'Valid packId is required');
  }

  // Identity guard (audit #4 — bid-credit IDOR). Credits MUST land on the
  // authenticated purchaser only. The Stripe webhook trusts metadata.provider_id
  // verbatim, so any body-supplied id that mismatches the authed user would
  // route credits to another account. Surface the mismatch with a 400 rather
  // than silently override, so the failure is loud in logs.
  let authedProviderId = authResult.data.user.id;
  if (bodyProviderId && bodyProviderId !== authedProviderId) {
    return utils.errorResponse(400, 'providerId mismatch — credits can only be purchased for the authenticated account');
  }

  // Role gate — only providers can buy bid credits.
  let profileResult = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authedProviderId)
    .single();
  if (profileResult.error || !profileResult.data) {
    return utils.errorResponse(403, 'Profile not found');
  }
  if (profileResult.data.role !== 'provider') {
    return utils.errorResponse(403, 'Only providers can purchase bid credits');
  }

  let packResult = await supabase
    .from('bid_packs')
    .select('*')
    .eq('id', packId)
    .eq('is_active', true)
    .single();

  if (packResult.error || !packResult.data) {
    return utils.errorResponse(400, 'Invalid service credit pack');
  }

  let pack = packResult.data;
  let priceInCents = Math.round(pack.price * 100);
  let totalBids = pack.bid_count + (pack.bonus_bids || 0);

  try {
    let { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');
    let stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
    let domain = 'https://www.mycarconcierge.com';

    let session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: pack.name,
            description: totalBids + ' bid credits' + (pack.bonus_bids > 0 ? ' (' + pack.bid_count + ' + ' + pack.bonus_bids + ' bonus)' : ''),
          },
          unit_amount: priceInCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: domain + '/providers.html?purchase=success&pack=' + packId,
      cancel_url: domain + '/providers.html?purchase=cancelled',
      metadata: {
        provider_id: authedProviderId,
        pack_id: packId,
        bids: pack.bid_count.toString(),
        bonus_bids: (pack.bonus_bids || 0).toString()
      }
    });

    await audit(supabase, {
      action: 'bid_credits_checkout_initiated',
      target_id: session.id,
      target_type: 'stripe_checkout_session',
      performed_by: authedProviderId,
      metadata: {
        pack_id: packId,
        pack_name: pack.name,
        price_cents: priceInCents,
        bid_count: pack.bid_count,
        bonus_bids: pack.bonus_bids || 0,
        total_bids: totalBids,
      },
    });

    return utils.successResponse({ url: session.url });

  } catch (error) {
    console.error('Stripe checkout error:', error.message, error.type || '', error.code || '');
    let msg = 'Failed to create checkout session';
    if (error.type === 'StripeAuthenticationError') {
      msg = 'Payment service configuration error. Please contact support.';
    } else if (error.type === 'StripeInvalidRequestError') {
      msg = 'Invalid checkout request: ' + error.message;
    }
    return utils.errorResponse(500, msg);
  }
};

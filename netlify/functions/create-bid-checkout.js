let utils = require('./utils');
let Stripe = require('stripe');

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
  let providerId = parsed.providerId;

  if (!packId || !utils.isValidUUID(packId)) {
    return utils.errorResponse(400, 'Valid packId is required');
  }
  if (!providerId || !utils.isValidUUID(providerId)) {
    return utils.errorResponse(400, 'Valid providerId is required');
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
    let stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
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
        provider_id: providerId,
        pack_id: packId,
        bids: pack.bid_count.toString(),
        bonus_bids: (pack.bonus_bids || 0).toString()
      }
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

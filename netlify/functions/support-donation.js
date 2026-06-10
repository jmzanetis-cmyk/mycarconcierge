const utils = require('./utils');
const Stripe = require('stripe');

const MIN_CENTS = 100;   // $1
const MAX_CENTS = 50000; // $500

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return utils.optionsResponse();
  }

  if (event.httpMethod !== 'POST') {
    return utils.errorResponse(405, 'Method not allowed');
  }

  let parsed;
  try {
    parsed = JSON.parse(event.body);
  } catch (e) {
    return utils.errorResponse(400, 'Invalid JSON');
  }

  const { amount_cents, donor_email, donor_name } = parsed;

  if (!amount_cents || typeof amount_cents !== 'number' || !Number.isInteger(amount_cents)) {
    return utils.errorResponse(400, 'amount_cents must be an integer');
  }
  if (amount_cents < MIN_CENTS) {
    return utils.errorResponse(400, 'Minimum donation is $1');
  }
  if (amount_cents > MAX_CENTS) {
    return utils.errorResponse(400, 'Maximum donation is $500');
  }

  // Sanitise optional string fields
  const safeEmail = typeof donor_email === 'string' ? donor_email.trim().slice(0, 254) : undefined;
  const safeName  = typeof donor_name  === 'string' ? donor_name.trim().slice(0, 100)  : undefined;

  try {
    const { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');
    const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
    const domain  = 'https://www.mycarconcierge.com';

    const sessionParams = {
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Support MCC Driver Launch',
            description: 'Help launch vehicle pickup & delivery — one-time contribution, not an investment',
          },
          unit_amount: amount_cents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: domain + '/donation-thanks.html?amount=' + amount_cents,
      cancel_url:  domain + '/#driver-fund-section',
      metadata: {
        type:       'support_donation',
        amount_usd: (amount_cents / 100).toFixed(2),
      },
    };

    if (safeEmail) {
      sessionParams.customer_email = safeEmail;
      sessionParams.metadata.donor_email = safeEmail;
    }
    if (safeName) {
      sessionParams.metadata.donor_name = safeName;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return utils.successResponse({ url: session.url });

  } catch (error) {
    console.error('support-donation stripe error:', error.message, error.type || '', error.code || '');
    let msg = 'Failed to create checkout session';
    if (error.type === 'StripeAuthenticationError') {
      msg = 'Payment service configuration error. Please contact support.';
    }
    return utils.errorResponse(500, msg);
  }
};

let utils = require('./utils');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return utils.optionsResponse();
  }

  if (event.httpMethod !== 'GET') {
    return utils.errorResponse(405, 'Method not allowed');
  }

  let params = event.queryStringParameters || {};
  let errorCode = params.error;
  let errorDescription = params.error_description;

  if (errorCode) {
    console.warn('[StripeConnect] Callback error:', errorCode, errorDescription);
    let encoded = encodeURIComponent(errorDescription || errorCode);
    return {
      statusCode: 302,
      headers: { 'Location': 'https://mycarconcierge.com/founder-dashboard.html?stripe=error&reason=' + encoded },
      body: ''
    };
  }

  let stripeAccountId = params.stripe_account || params.state;

  if (stripeAccountId && process.env.STRIPE_SECRET_KEY) {
    try {
      let Stripe = require('stripe');
      let { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');
      let stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
      let account = await stripe.accounts.retrieve(stripeAccountId);

      if (account?.id) {
        let supabase = utils.createSupabaseClient();
        if (supabase) {
          await supabase
            .from('member_founder_profiles')
            .update({
              stripe_connect_account_id: account.id,
              payout_method: 'stripe_connect',
              updated_at: new Date().toISOString()
            })
            .eq('stripe_connect_account_id', account.id);
        }
        console.log('[StripeConnect] Account verified:', account.id, 'details_submitted:', account.details_submitted);
      }
    } catch (verifyErr) {
      console.warn('[StripeConnect] Account verification skipped:', verifyErr.message);
    }
  }

  return {
    statusCode: 302,
    headers: { 'Location': 'https://mycarconcierge.com/founder-dashboard.html?stripe=success' },
    body: ''
  };
};

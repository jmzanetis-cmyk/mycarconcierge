var utils = require('./utils');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return utils.optionsResponse();
  }

  if (event.httpMethod !== 'GET') {
    return utils.errorResponse(405, 'Method not allowed');
  }

  var params = event.queryStringParameters || {};
  var errorCode = params.error;
  var errorDescription = params.error_description;

  if (errorCode) {
    console.warn('[StripeConnect] Callback error:', errorCode, errorDescription);
    var encoded = encodeURIComponent(errorDescription || errorCode);
    return {
      statusCode: 302,
      headers: { 'Location': 'https://mycarconcierge.com/founder-dashboard.html?stripe=error&reason=' + encoded },
      body: ''
    };
  }

  var stripeAccountId = params.stripe_account || params.state;

  if (stripeAccountId && process.env.STRIPE_SECRET_KEY) {
    try {
      var Stripe = require('stripe');
      var stripe = Stripe(process.env.STRIPE_SECRET_KEY);
      var account = await stripe.accounts.retrieve(stripeAccountId);

      if (account && account.id) {
        var supabase = utils.createSupabaseClient();
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

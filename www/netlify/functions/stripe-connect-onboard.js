var utils = require('./utils');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return utils.optionsResponse();
  }

  if (event.httpMethod !== 'POST') {
    return utils.errorResponse(405, 'Method not allowed');
  }

  try {
    var founderId = utils.extractPathParam(event.path);

    if (!utils.isValidUUID(founderId)) {
      return utils.errorResponse(400, 'Invalid founder ID');
    }

    var authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
    var token = authHeader.replace('Bearer ', '');

    if (!token) {
      return utils.errorResponse(401, 'Authentication required');
    }

    var supabase = utils.createSupabaseClient();
    if (!supabase) {
      return utils.errorResponse(503, 'Service temporarily unavailable');
    }

    var authResult = await supabase.auth.getUser(token);
    var user = authResult.data && authResult.data.user;

    if (!user) {
      return utils.errorResponse(401, 'Invalid or expired token');
    }

    var founderResult = await supabase
      .from('member_founder_profiles')
      .select('id, email, full_name, stripe_connect_account_id, user_id')
      .eq('id', founderId)
      .single();

    if (founderResult.error || !founderResult.data) {
      return utils.errorResponse(404, 'Founder profile not found');
    }

    var founder = founderResult.data;

    if (founder.user_id !== user.id) {
      return utils.errorResponse(403, 'Not authorized to access this founder profile');
    }

    var stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    var accountId = founder.stripe_connect_account_id;

    if (!accountId) {
      var account = await stripe.accounts.create({
        type: 'express',
        email: founder.email,
        metadata: {
          founder_id: founderId,
          founder_name: founder.full_name
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true }
        }
      });

      accountId = account.id;

      await supabase
        .from('member_founder_profiles')
        .update({
          stripe_connect_account_id: accountId,
          payout_method: 'stripe_connect',
          updated_at: new Date().toISOString()
        })
        .eq('id', founderId);
    }

    var accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: 'https://mycarconcierge.com/founder-dashboard.html?stripe=refresh',
      return_url: 'https://mycarconcierge.com/founder-dashboard.html?stripe=success',
      type: 'account_onboarding'
    });

    return utils.successResponse({ url: accountLink.url });
  } catch (err) {
    console.error('stripe-connect-onboard error:', err);
    return utils.errorResponse(500, 'Internal server error');
  }
};

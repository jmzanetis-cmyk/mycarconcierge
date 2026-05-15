let utils = require('./utils');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return utils.optionsResponse();
  }

  if (event.httpMethod !== 'POST') {
    return utils.errorResponse(405, 'Method not allowed');
  }

  try {
    let founderId = utils.extractPathParam(event.path);

    if (!utils.isValidUUID(founderId)) {
      return utils.errorResponse(400, 'Invalid founder ID');
    }

    let authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
    let token = authHeader.replace('Bearer ', '');

    if (!token) {
      return utils.errorResponse(401, 'Authentication required');
    }

    let supabase = utils.createSupabaseClient();
    if (!supabase) {
      return utils.errorResponse(503, 'Service temporarily unavailable');
    }

    let authResult = await supabase.auth.getUser(token);
    let user = authResult.data && authResult.data.user;

    if (!user) {
      return utils.errorResponse(401, 'Invalid or expired token');
    }

    let founderResult = await supabase
      .from('member_founder_profiles')
      .select('id, email, full_name, stripe_connect_account_id, user_id')
      .eq('id', founderId)
      .single();

    if (founderResult.error || !founderResult.data) {
      return utils.errorResponse(404, 'Founder profile not found');
    }

    let founder = founderResult.data;

    if (founder.user_id !== user.id) {
      return utils.errorResponse(403, 'Not authorized to access this founder profile');
    }

    let { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');
    let stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
    let accountId = founder.stripe_connect_account_id;

    if (!accountId) {
      let account = await stripe.accounts.create({
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

    let accountLink = await stripe.accountLinks.create({
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

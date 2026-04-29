var utils = require('./utils');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return utils.optionsResponse();
  }

  if (event.httpMethod !== 'GET') {
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
      .select('stripe_connect_account_id, user_id')
      .eq('id', founderId)
      .single();

    if (founderResult.error || !founderResult.data) {
      return utils.errorResponse(404, 'Founder profile not found');
    }

    var founder = founderResult.data;

    if (founder.user_id !== user.id) {
      return utils.errorResponse(403, 'Not authorized to access this founder profile');
    }

    if (!founder.stripe_connect_account_id) {
      return utils.successResponse({
        connected: false,
        details_submitted: false,
        charges_enabled: false,
        payouts_enabled: false
      });
    }

    var stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
    var account = await stripe.accounts.retrieve(founder.stripe_connect_account_id);

    return utils.successResponse({
      connected: true,
      account_id: account.id,
      details_submitted: account.details_submitted,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      requirements: account.requirements
    });
  } catch (err) {
    console.error('stripe-connect-status error:', err);
    return utils.errorResponse(500, 'Internal server error');
  }
};

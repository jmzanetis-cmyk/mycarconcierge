var utils = require('./utils');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return utils.optionsResponse();
  }

  if (event.httpMethod !== 'POST') {
    return utils.errorResponse(405, 'Method not allowed');
  }

  try {
    var participantId = utils.extractPathParam(event.path);

    if (!utils.isValidUUID(participantId)) {
      return utils.errorResponse(400, 'Invalid participant ID');
    }

    var body = JSON.parse(event.body || '{}');
    var token = body.token;

    if (!utils.verifyGuestToken(participantId, token)) {
      return utils.errorResponse(403, 'Invalid or expired token');
    }

    var supabase = utils.createSupabaseClient();
    if (!supabase) {
      return utils.errorResponse(503, 'Service temporarily unavailable');
    }

    var result = await supabase
      .from('split_participants')
      .select('id, email, display_name, amount_cents, status, split_payment_id, split_payments(package_id, total_amount_cents, status, expires_at)')
      .eq('id', participantId)
      .single();

    if (result.error || !result.data) {
      return utils.errorResponse(404, 'Participant not found');
    }

    var participant = result.data;

    if (participant.split_payments && participant.split_payments.expires_at && new Date(participant.split_payments.expires_at) < new Date()) {
      return utils.errorResponse(400, 'This split payment has expired');
    }

    if (participant.status === 'paid') {
      return utils.successResponse({ already_paid: true });
    }

    var packageTitle = '';
    if (participant.split_payments && participant.split_payments.package_id) {
      var pkgResult = await supabase
        .from('maintenance_packages')
        .select('title')
        .eq('id', participant.split_payments.package_id)
        .single();

      if (pkgResult.data) {
        packageTitle = pkgResult.data.title;
      }
    }

    return utils.successResponse({
      success: true,
      amountCents: participant.amount_cents,
      totalAmountCents: participant.split_payments ? participant.split_payments.total_amount_cents : null,
      displayName: participant.display_name,
      email: participant.email,
      packageTitle: packageTitle,
      expiresAt: participant.split_payments ? participant.split_payments.expires_at : null,
      splitStatus: participant.split_payments ? participant.split_payments.status : null
    });
  } catch (err) {
    console.error('split-guest-details error:', err);
    return utils.errorResponse(500, 'Internal server error');
  }
};

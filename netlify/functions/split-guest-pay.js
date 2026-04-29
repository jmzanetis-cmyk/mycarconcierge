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
      .select('id, email, display_name, amount_cents, status, split_payment_id, member_id, payment_intent_id, split_payments(package_id, total_amount_cents, status, expires_at)')
      .eq('id', participantId)
      .single();

    if (result.error || !result.data) {
      return utils.errorResponse(404, 'Participant not found');
    }

    var participant = result.data;

    if (participant.member_id) {
      return utils.errorResponse(400, 'This participant is linked to an account. Please log in to pay.');
    }

    if (participant.split_payments && participant.split_payments.expires_at && new Date(participant.split_payments.expires_at) < new Date()) {
      return utils.errorResponse(400, 'This split payment has expired');
    }

    if (participant.status === 'paid') {
      return utils.errorResponse(400, 'This share has already been paid');
    }

    if (participant.split_payments && participant.split_payments.status !== 'pending') {
      return utils.errorResponse(400, 'This split payment is no longer accepting payments');
    }

    var stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
    var clientSecret;
    var paymentIntentId;

    if (participant.payment_intent_id) {
      try {
        var existingPI = await stripe.paymentIntents.retrieve(participant.payment_intent_id);
        if (existingPI && (existingPI.status === 'requires_payment_method' || existingPI.status === 'requires_confirmation' || existingPI.status === 'requires_action')) {
          clientSecret = existingPI.client_secret;
          paymentIntentId = existingPI.id;
        }
      } catch (e) {
        console.log('Could not retrieve existing PaymentIntent, creating new one');
      }
    }

    if (!clientSecret) {
      var paymentIntent = await stripe.paymentIntents.create({
        amount: participant.amount_cents,
        currency: 'usd',
        capture_method: 'automatic',
        metadata: {
          split_payment_id: participant.split_payment_id,
          participant_id: participantId,
          package_id: participant.split_payments ? participant.split_payments.package_id : '',
          type: 'guest_split_payment_share'
        },
        description: 'Split payment share (guest) for package ' + (participant.split_payments ? participant.split_payments.package_id : '')
      });

      clientSecret = paymentIntent.client_secret;
      paymentIntentId = paymentIntent.id;

      await supabase
        .from('split_participants')
        .update({
          payment_intent_id: paymentIntentId,
          stripe_client_secret: clientSecret,
          status: 'pending'
        })
        .eq('id', participantId);
    }

    return utils.successResponse({
      success: true,
      clientSecret: clientSecret,
      paymentIntentId: paymentIntentId,
      amountCents: participant.amount_cents
    });
  } catch (err) {
    console.error('split-guest-pay error:', err);
    return utils.errorResponse(500, 'Internal server error');
  }
};

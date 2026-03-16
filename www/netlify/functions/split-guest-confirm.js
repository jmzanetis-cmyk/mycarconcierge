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
    var payment_intent_id = body.payment_intent_id;

    if (!utils.verifyGuestToken(participantId, token)) {
      return utils.errorResponse(403, 'Invalid or expired token');
    }

    if (!payment_intent_id) {
      return utils.errorResponse(400, 'Missing payment_intent_id');
    }

    var supabase = utils.createSupabaseClient();
    if (!supabase) {
      return utils.errorResponse(503, 'Service temporarily unavailable');
    }

    var result = await supabase
      .from('split_participants')
      .select('id, status, payment_intent_id, split_payment_id')
      .eq('id', participantId)
      .single();

    if (result.error || !result.data) {
      return utils.errorResponse(404, 'Participant not found');
    }

    var participant = result.data;

    if (participant.status === 'paid') {
      return utils.errorResponse(400, 'This share has already been paid');
    }

    if (participant.payment_intent_id !== payment_intent_id) {
      return utils.errorResponse(400, 'Payment intent mismatch');
    }

    var stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    var paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

    if (paymentIntent.status !== 'succeeded') {
      return utils.errorResponse(400, 'Payment has not been completed. Status: ' + paymentIntent.status);
    }

    await supabase
      .from('split_participants')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString()
      })
      .eq('id', participantId);

    var allParticipants = await supabase
      .from('split_participants')
      .select('id, status')
      .eq('split_payment_id', participant.split_payment_id);

    if (allParticipants.data) {
      var allPaid = true;
      for (var i = 0; i < allParticipants.data.length; i++) {
        if (allParticipants.data[i].id === participantId) continue;
        if (allParticipants.data[i].status !== 'paid') {
          allPaid = false;
          break;
        }
      }

      if (allPaid) {
        var splitResult = await supabase
          .from('split_payments')
          .update({ status: 'complete' })
          .eq('id', participant.split_payment_id)
          .select('package_id')
          .single();

        if (splitResult.data && splitResult.data.package_id) {
          await supabase
            .from('maintenance_packages')
            .update({
              status: 'payment_held',
              split_payment_id: participant.split_payment_id,
              updated_at: new Date().toISOString()
            })
            .eq('id', splitResult.data.package_id);
        }
      }
    }

    return utils.successResponse({ success: true });
  } catch (err) {
    console.error('split-guest-confirm error:', err);
    return utils.errorResponse(500, 'Internal server error');
  }
};

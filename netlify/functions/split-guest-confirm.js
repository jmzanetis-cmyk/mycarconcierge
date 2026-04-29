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

    var stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
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
          .select('id, package_id, total_amount_cents, created_by')
          .eq('id', participant.split_payment_id)
          .single();

        var packageId = splitResult.data && splitResult.data.package_id;
        var splitPaymentData = splitResult.data || {};

        await supabase
          .from('split_payments')
          .update({ status: 'complete', updated_at: new Date().toISOString() })
          .eq('id', participant.split_payment_id);

        if (packageId) {
          await supabase
            .from('maintenance_packages')
            .update({
              status: 'payment_held',
              split_payment_id: participant.split_payment_id,
              updated_at: new Date().toISOString()
            })
            .eq('id', packageId);

          var pendingWorkResult = await supabase
            .from('additional_work_requests')
            .select('id, provider_id, title, estimated_cost')
            .eq('package_id', packageId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1);

          if (pendingWorkResult.data && pendingWorkResult.data.length > 0) {
            var work = pendingWorkResult.data[0];
            var workAmountCents = Math.round((work.estimated_cost || 0) * 100);
            if (workAmountCents === splitPaymentData.total_amount_cents) {
              await supabase
                .from('additional_work_requests')
                .update({ status: 'approved', updated_at: new Date().toISOString() })
                .eq('id', work.id);

              if (work.provider_id) {
                await supabase.from('notifications').insert({
                  user_id: work.provider_id,
                  type: 'additional_work_approved',
                  title: 'Additional Work Approved & Funded',
                  message: 'Additional work "' + (work.title || 'Additional Work') + '" has been crowd-funded and approved. You may proceed with the work.',
                  entity_type: 'additional_work_request',
                  entity_id: work.id
                });
              }
            }
          }

          if (splitPaymentData.created_by) {
            await supabase.from('notifications').insert({
              user_id: splitPaymentData.created_by,
              type: 'split_payment_complete',
              title: 'Split Payment Complete!',
              message: 'All participants have paid their share. The service can now proceed.',
              entity_type: 'split_payment',
              entity_id: participant.split_payment_id
            });
          }

          var acceptedBidResult = await supabase
            .from('maintenance_packages')
            .select('accepted_bid_id')
            .eq('id', packageId)
            .single();

          if (acceptedBidResult.data && acceptedBidResult.data.accepted_bid_id) {
            var bidResult = await supabase
              .from('bids')
              .select('provider_id')
              .eq('id', acceptedBidResult.data.accepted_bid_id)
              .single();

            if (bidResult.data && bidResult.data.provider_id) {
              await supabase.from('notifications').insert({
                user_id: bidResult.data.provider_id,
                type: 'payment_received',
                title: 'Payment Received',
                message: 'The split payment has been completed. You can now begin the service.',
                entity_type: 'package',
                entity_id: packageId
              });
            }
          }
        }

        return utils.successResponse({ success: true, participantPaid: true, allPaid: true, splitComplete: true });
      }
    }

    return utils.successResponse({ success: true, participantPaid: true, allPaid: false, splitComplete: false });
  } catch (err) {
    console.error('split-guest-confirm error:', err);
    return utils.errorResponse(500, 'Internal server error');
  }
};

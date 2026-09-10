'use strict';

// POST /api/split/guest-pay/:participantId
// Body: { token }
// Guest counterpart of split-pay.js. Reviewer-guard resolves via the
// split's organizer (created_by) since a guest has no JWT identity of its
// own -- same pattern the feature-flag check below already uses.

var utils = require('./utils');
var { isFeatureEnabledForUser } = require('./_shared/feature-flag-check');
var { isReviewerAccount } = require('./_shared/reviewer-guard');
var { completeSplitParticipant } = require('./_shared/split-completion');
var { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');

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
      .select('id, email, display_name, amount_cents, status, split_payment_id, member_id, payment_intent_id, split_payments(package_id, total_amount_cents, status, expires_at, created_by)')
      .eq('id', participantId)
      .single();

    if (result.error || !result.data) {
      return utils.errorResponse(404, 'Participant not found');
    }

    var participant = result.data;

    // Feature gate (ships dark for launch) — resolve via the split's organizer.
    var organizerId = participant.split_payments && participant.split_payments.created_by;
    var spEnabled = organizerId
      ? await isFeatureEnabledForUser(supabase, 'split_payments_enabled', organizerId)
      : false;
    if (!spEnabled) return utils.errorResponse(403, 'feature_disabled');

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

    var carePlanId = participant.split_payments ? participant.split_payments.package_id : null;

    // Reviewer-organized splits never touch real Stripe money, same as the
    // member path in split-pay.js.
    if (organizerId && await isReviewerAccount(supabase, organizerId)) {
      var mockResult = await completeSplitParticipant(supabase, participantId);
      if (mockResult.error) return utils.errorResponse(500, 'Failed to complete reviewer-mocked payment');
      return utils.successResponse({
        success: true,
        reviewer_mock: true,
        splitComplete: !!mockResult.splitComplete,
        amountCents: participant.amount_cents,
      });
    }

    var stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
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
      var piParams = {
        amount: participant.amount_cents,
        currency: 'usd',
        capture_method: 'automatic',
        metadata: {
          split_payment_id: participant.split_payment_id,
          participant_id: participantId,
          care_plan_id: carePlanId || '',
          type: 'guest_split_payment_share'
        },
        description: 'Split payment share (guest) for care plan ' + (carePlanId || '')
      };

      // Route this share straight to the provider's connected account, same
      // as split-pay.js and the main escrow charge in care-plans.js.
      if (carePlanId) {
        var planRes = await supabase.from('care_plans').select('provider_id').eq('id', carePlanId).single();
        if (planRes.data && planRes.data.provider_id) {
          var provRes = await supabase.from('profiles').select('stripe_account_id').eq('id', planRes.data.provider_id).single();
          if (provRes.data && provRes.data.stripe_account_id) {
            piParams.transfer_data = { destination: provRes.data.stripe_account_id };
          }
        }
      }

      var paymentIntent = await stripe.paymentIntents.create(piParams);

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

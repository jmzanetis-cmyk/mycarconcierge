'use strict';

// POST /api/split/guest-confirm/:participantId
// Body: { token, payment_intent_id }
// Guest counterpart of split-confirm.js -- re-verifies the PaymentIntent
// actually succeeded via Stripe (guests have no session to trust), then
// shares the same completion logic via _shared/split-completion.js.

var utils = require('./utils');
var { isFeatureEnabledForUser } = require('./_shared/feature-flag-check');
var { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');
var { completeSplitParticipant } = require('./_shared/split-completion');

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
      .select('id, status, payment_intent_id, split_payment_id, split_payments(expires_at, status, created_by)')
      .eq('id', participantId)
      .single();

    if (result.error || !result.data) {
      return utils.errorResponse(404, 'Participant not found');
    }

    var participant = result.data;
    var splitPayment = participant.split_payments;

    // Feature gate (ships dark for launch) — resolve via the split's organizer.
    var organizerId = splitPayment && splitPayment.created_by;
    var spEnabled = organizerId
      ? await isFeatureEnabledForUser(supabase, 'split_payments_enabled', organizerId)
      : false;
    if (!spEnabled) return utils.errorResponse(403, 'feature_disabled');

    if (splitPayment && splitPayment.expires_at && new Date(splitPayment.expires_at) < new Date()) {
      return utils.errorResponse(400, 'This split payment has expired');
    }

    if (splitPayment && splitPayment.status !== 'pending') {
      return utils.errorResponse(400, 'This split payment is no longer active');
    }

    if (participant.status === 'paid') {
      return utils.errorResponse(400, 'This share has already been paid');
    }

    if (participant.payment_intent_id !== payment_intent_id) {
      return utils.errorResponse(400, 'Payment intent mismatch');
    }

    var stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
    var paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

    if (paymentIntent.status !== 'succeeded') {
      return utils.errorResponse(400, 'Payment has not been completed. Status: ' + paymentIntent.status);
    }

    var completion = await completeSplitParticipant(supabase, participantId);
    if (completion.error === 'not_found') return utils.errorResponse(404, 'Participant not found');
    if (completion.error) return utils.errorResponse(500, 'Failed to update payment status');

    return utils.successResponse({
      success: true,
      participantPaid: true,
      allPaid: !!completion.splitComplete,
      splitComplete: !!completion.splitComplete,
    });
  } catch (err) {
    console.error('split-guest-confirm error:', err);
    return utils.errorResponse(500, 'Internal server error');
  }
};

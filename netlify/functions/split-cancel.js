'use strict';

// POST /api/split/cancel/:splitId
// Auth: Bearer JWT (must be the split's creator)
//
// Ported from server.js's handleSplitCancel (never made it into
// netlify/functions -- see split-status.js's header comment, same gap).
//
// Refunds/cancels every participant's Stripe PaymentIntent, then resets the
// care plan back to exactly the state it was in right after the bid was
// accepted: payment_status 'requires_payment', no stripe_payment_intent_id,
// no split_payment_id. That's deliberate, not a shortcut -- care-plans.js's
// handleAcceptBid is already idempotent on (plan, accepted_bid_id) and the
// frontend's "resume payment" path (members-care-plans.js) already re-calls
// POST /api/care-plans/:id/accept-bid with the same bid_id whenever it needs
// a fresh client_secret. Resetting to this exact state means that existing
// path mints a brand new full-amount PaymentIntent with zero new code here,
// instead of duplicating accept-bid's PI-creation logic (transfer_data,
// Stripe minimums, metadata) a third time.

var utils = require('./utils');
var { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'POST') return utils.errorResponse(405, 'Method not allowed');

  var authHeader = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!authHeader.startsWith('Bearer ')) return utils.errorResponse(401, 'Authorization required');
  var token = authHeader.slice(7).trim();

  var splitId = utils.extractPathParam(event.path);
  if (!splitId || !utils.isValidUUID(splitId))
    return utils.errorResponse(400, 'Invalid split payment ID');

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(503, 'Service temporarily unavailable');

  var userResult = await supabase.auth.getUser(token);
  if (userResult.error || !userResult.data?.user) return utils.errorResponse(401, 'Invalid or expired auth token');
  var userId = userResult.data.user.id;

  try {
    var splitRes = await supabase.from('split_payments').select('*').eq('id', splitId).single();
    if (splitRes.error || !splitRes.data) return utils.errorResponse(404, 'Split payment not found');
    var splitPayment = splitRes.data;

    if (splitPayment.created_by !== userId)
      return utils.errorResponse(403, 'Only the creator can cancel a split payment');
    if (splitPayment.status !== 'pending')
      return utils.errorResponse(400, `Cannot cancel split payment in ${splitPayment.status} status`);

    var carePlanId = splitPayment.package_id;
    var partsRes = await supabase.from('split_participants').select('*').eq('split_payment_id', splitId);
    var participants = partsRes.data || [];

    var stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });

    var refundedCount = 0;
    var cancelledCount = 0;
    for (var participant of participants) {
      if (!participant.payment_intent_id) continue;
      try {
        var pi = await stripe.paymentIntents.retrieve(participant.payment_intent_id);
        if (pi.status === 'succeeded') {
          await stripe.refunds.create({ payment_intent: participant.payment_intent_id });
          refundedCount++;
        } else if (['requires_payment_method', 'requires_confirmation', 'requires_action', 'requires_capture'].includes(pi.status)) {
          await stripe.paymentIntents.cancel(participant.payment_intent_id);
          cancelledCount++;
        }
      } catch (stripeErr) {
        console.error('[split-cancel] error processing participant ' + participant.id + ':', stripeErr.message);
      }
    }

    await supabase.from('split_participants').update({ status: 'cancelled' }).eq('split_payment_id', splitId);
    await supabase.from('split_payments').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', splitId);

    if (carePlanId) {
      await supabase.from('care_plans').update({
        payment_status: 'requires_payment',
        stripe_payment_intent_id: null,
        split_payment_id: null,
        updated_at: new Date().toISOString(),
      }).eq('id', carePlanId);

      var planRes = await supabase.from('care_plans').select('title, provider_id').eq('id', carePlanId).single();
      var plan = planRes.data;
      if (plan && plan.provider_id) {
        await supabase.from('notifications').insert({
          user_id: plan.provider_id,
          type: 'split_payment_cancelled',
          title: 'Split Payment Cancelled',
          message: 'The split payment for "' + (plan.title || 'a service') + '" has been cancelled. The job is still active and awaiting a new payment arrangement.',
          entity_type: 'care_plan',
          entity_id: carePlanId,
        });
      }
    }

    for (var p of participants) {
      if (p.member_id && p.member_id !== userId) {
        await supabase.from('notifications').insert({
          user_id: p.member_id,
          type: 'split_payment_cancelled',
          title: 'Split Payment Cancelled',
          message: 'The split payment has been cancelled. Any charges have been refunded.',
          entity_type: 'split_payment',
          entity_id: splitId,
        });
      }
    }

    return utils.successResponse({
      success: true,
      refundedCount: refundedCount,
      cancelledCount: cancelledCount,
      message: 'Split payment cancelled successfully',
    });
  } catch (err) {
    console.error('[split-cancel] error:', err);
    return utils.errorResponse(500, 'Internal server error');
  }
};

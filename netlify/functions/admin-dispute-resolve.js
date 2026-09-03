// ============================================================================
// admin-dispute-resolve — admin resolves a payment dispute (real Stripe
// refund when the member wins)
//
// POST /api/admin/disputes/:id/resolve
//   Body: { winner: 'member' | 'provider', resolution_amount, notes }
//   Auth: Authorization: Bearer <supabase admin JWT>
//
// Fixes Disputes → "Resolve for Member", which previously marked
// payments.status = 'refunded' directly from the browser with no
// stripe.refunds.create call and no row written to the refunds table — the
// member saw "resolved" but no money moved. Ported from the proven
// admin-initiated refund path in server.js (~line 14355, the isAdmin branch
// of the escrow refund handler) for the Stripe call + refunds insert shape,
// and from admin-refunds.js for the auth/response conventions used
// elsewhere in this codebase's Netlify functions.
// ============================================================================
'use strict';

var utils = require('./utils');
var { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');
var { audit: sharedAudit } = require('./_shared/audit');

function audit(supabase, row) {
  return sharedAudit(supabase, row, {
    alertOnFailure: true,
    logOnFailure: true,
    logPrefix: '[admin-dispute-resolve]',
  });
}

function getStripe() {
  var key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return require('stripe')(key, { apiVersion: STRIPE_API_VERSION });
}

function parsePath(event) {
  var raw = event.path || '';
  return raw
    .replace(/^\/?\.netlify\/functions\/admin-dispute-resolve\/?/, '')
    .replace(/^\/api\/admin\/disputes\/?/, '')
    .replace(/^\/+|\/+$/g, '');
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'POST') return utils.errorResponse(405, 'Method not allowed');

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  var user = await utils.authenticateBearerAdmin(event, supabase);
  if (!user) return utils.errorResponse(401, 'Authentication required');

  var path = parsePath(event);
  var m = path.match(/^([^/]+)\/resolve$/);
  if (!m) return utils.errorResponse(404, 'Unknown route');
  var disputeId = m[1];

  var body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (e) {
    return utils.errorResponse(400, 'Invalid JSON');
  }

  var winner = body.winner;
  var notes = body.notes;
  var resolutionAmount = Number(body.resolution_amount) || 0;

  if (!['member', 'provider'].includes(winner)) {
    return utils.errorResponse(400, "winner must be 'member' or 'provider'");
  }
  if (!notes) return utils.errorResponse(400, 'Resolution notes are required');

  var disputeResult = await supabase
    .from('disputes')
    .select('id, status, maintenance_packages(id, payments(id, amount_total, status, provider_id, stripe_payment_intent_id, stripe_payment_intent, stripe_payment_id))')
    .eq('id', disputeId)
    .maybeSingle();

  if (disputeResult.error || !disputeResult.data) return utils.errorResponse(404, 'Dispute not found');
  var dispute = disputeResult.data;

  if (dispute.status && dispute.status.indexOf('resolved_') === 0) {
    return utils.errorResponse(400, 'Dispute is already ' + dispute.status);
  }

  var payment = (dispute.maintenance_packages && dispute.maintenance_packages.payments && dispute.maintenance_packages.payments[0]) || null;

  var stripeRefundId = null;
  var refundedAmountCents = 0;

  if (winner === 'member') {
    if (!payment) return utils.errorResponse(400, 'No payment found on this dispute — cannot refund');

    var piId = payment.stripe_payment_intent_id || payment.stripe_payment_intent || payment.stripe_payment_id;
    var amountTotalCents = Math.round((Number(payment.amount_total) || 0) * 100);
    refundedAmountCents = resolutionAmount > 0 ? Math.round(resolutionAmount * 100) : amountTotalCents;
    var isPartial = refundedAmountCents < amountTotalCents;

    if (piId) {
      var stripe = getStripe();
      if (!stripe) return utils.errorResponse(500, 'Payment service unavailable');
      try {
        var refundParams = { payment_intent: piId };
        if (isPartial) refundParams.amount = refundedAmountCents;
        var stripeRefund = await stripe.refunds.create(refundParams);
        stripeRefundId = stripeRefund.id;
      } catch (refundErr) {
        console.error('[admin-dispute-resolve] Stripe refund error:', refundErr && refundErr.message);
        return utils.errorResponse(402, 'Refund failed: ' + (refundErr && refundErr.message));
      }
    }
    // No Stripe PI on file — legacy/offline payment. Proceed to mark
    // refunded in the DB with stripe_refund_id left null, same graceful
    // degradation used elsewhere in this codebase's money paths.

    var refundInsert = await supabase.from('refunds').insert({
      package_id: dispute.maintenance_packages.id,
      payment_intent_id: piId || null,
      stripe_refund_id: stripeRefundId,
      amount_cents: refundedAmountCents,
      refund_type: isPartial ? 'partial' : 'full',
      reason: notes,
      status: 'processed',
      requested_by: user.id,
      approved_by: user.id,
      requested_at: new Date().toISOString(),
      approved_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
    });
    if (refundInsert.error) {
      console.error('[admin-dispute-resolve] refunds insert failed (Stripe refund already processed):', refundInsert.error.message);
    }

    var paymentUpdate = await supabase
      .from('payments')
      .update({
        status: isPartial ? 'partially_refunded' : 'refunded',
        refund_amount: refundedAmountCents / 100,
        refund_reason: notes,
        refunded_at: new Date().toISOString(),
      })
      .eq('id', payment.id);
    if (paymentUpdate.error) {
      console.error('[admin-dispute-resolve] payments update failed (Stripe refund already processed):', paymentUpdate.error.message);
    }

    if (payment.provider_id) {
      var strikeResult = await supabase.rpc('increment_provider_strikes', { provider_id: payment.provider_id });
      if (strikeResult.error) {
        console.error('[admin-dispute-resolve] increment_provider_strikes failed:', strikeResult.error.message);
      }
    }
  }

  var disputeUpdate = await supabase
    .from('disputes')
    .update({
      status: 'resolved_' + winner,
      resolution_amount: winner === 'member' ? refundedAmountCents / 100 : 0,
      resolution_notes: notes,
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', disputeId);

  if (disputeUpdate.error) {
    console.error('[admin-dispute-resolve] disputes update failed after refund:', disputeUpdate.error.message);
    return utils.errorResponse(
      500,
      (winner === 'member' ? 'Refund was processed in Stripe but the ' : '') +
        'dispute record failed to update — check dispute ' + disputeId + ' manually.'
    );
  }

  await audit(supabase, {
    action: 'dispute_resolved_by_admin',
    target_id: disputeId,
    target_type: 'dispute',
    performed_by: user.id,
    metadata: {
      winner: winner,
      payment_id: payment ? payment.id : null,
      stripe_refund_id: stripeRefundId,
      refunded_amount_cents: winner === 'member' ? refundedAmountCents : 0,
      stripe_refunded: !!stripeRefundId,
    },
  });

  return utils.successResponse({
    success: true,
    winner: winner,
    stripe_refunded: !!stripeRefundId,
    refunded_amount_cents: winner === 'member' ? refundedAmountCents : 0,
  });
};

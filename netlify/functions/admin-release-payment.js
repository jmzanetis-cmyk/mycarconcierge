// ============================================================================
// admin-release-payment — admin releases a held payment (real Stripe capture)
//
// POST /api/admin/payments/:id/release
//   Auth: Authorization: Bearer <supabase admin JWT>
//
// Fixes the Payments → "Release" button, which previously flipped
// payments.status to 'released' directly from the browser with no Stripe
// capture and no audit trail — the escrowed funds never actually moved.
// This follows the same capture pattern already proven correct in
// member-release-payment.js (the member-initiated release-on-completion
// flow), adapted for an admin caller keyed on payment id rather than
// package id + ownership check.
// ============================================================================
'use strict';

var utils = require('./utils');
var { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');
var { audit: sharedAudit } = require('./_shared/audit');

// Money-path audit wrapper: always log + alert on failure. A failed audit
// must NEVER throw into the money operation.
function audit(supabase, row) {
  return sharedAudit(supabase, row, {
    alertOnFailure: true,
    logOnFailure: true,
    logPrefix: '[admin-release-payment]',
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
    .replace(/^\/?\.netlify\/functions\/admin-release-payment\/?/, '')
    .replace(/^\/api\/admin\/payments\/?/, '')
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
  var m = path.match(/^([^/]+)\/release$/);
  if (!m) return utils.errorResponse(404, 'Unknown route');
  var paymentId = m[1];

  var pmtResult = await supabase
    .from('payments')
    .select('id, package_id, status, stripe_payment_intent_id, stripe_payment_intent, stripe_payment_id')
    .eq('id', paymentId)
    .maybeSingle();

  if (pmtResult.error || !pmtResult.data) return utils.errorResponse(404, 'Payment not found');
  var payment = pmtResult.data;

  if (payment.status === 'released') {
    return utils.successResponse({ success: true, already_released: true });
  }

  var piId = payment.stripe_payment_intent_id || payment.stripe_payment_intent || payment.stripe_payment_id;
  var stripeCaptured = false;

  if (piId) {
    var stripe = getStripe();
    if (!stripe) return utils.errorResponse(500, 'Payment service unavailable');
    try {
      await stripe.paymentIntents.capture(piId);
      stripeCaptured = true;
    } catch (captureErr) {
      // 'payment_intent_unexpected_state' means it was already captured
      // elsewhere (e.g. by a webhook) — not a real failure, fall through
      // and mark released. Any other error is a real capture failure and
      // must NOT be swallowed into a false "released" state.
      if (!captureErr || captureErr.code !== 'payment_intent_unexpected_state') {
        console.error('[admin-release-payment] Stripe capture error:', captureErr && captureErr.message);
        return utils.errorResponse(402, 'Payment capture failed: ' + (captureErr && captureErr.message));
      }
    }
  }
  // No Stripe PI at all — legacy/offline payment. Fall through to marking
  // released with stripeCaptured: false, same graceful degradation as
  // member-release-payment.js.

  var updateResult = await supabase
    .from('payments')
    .update({ status: 'released', released_at: new Date().toISOString() })
    .eq('id', paymentId);

  if (updateResult.error) {
    console.error('[admin-release-payment] captured but DB update failed:', updateResult.error.message);
    return utils.errorResponse(
      500,
      'Payment was captured in Stripe but the database update failed — check payment ' + paymentId + ' manually before retrying.'
    );
  }

  await audit(supabase, {
    action: 'payment_released_by_admin',
    target_id: paymentId,
    target_type: 'payment',
    performed_by: user.id,
    metadata: {
      package_id: payment.package_id,
      stripe_payment_intent_id: piId || null,
      previous_status: payment.status,
      new_status: 'released',
      stripe_captured: stripeCaptured,
    },
  });

  return utils.successResponse({ success: true, stripe_captured: stripeCaptured });
};

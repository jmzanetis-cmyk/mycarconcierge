'use strict';

// POST /api/split/create
// Auth: Bearer JWT (member)
// Body: { care_plan_id, participants: [{email, amount_cents, display_name?, is_guest?}] }
//
// Ported from the retired maintenance_packages/package-escrow flow onto
// care_plans (the live checkout path -- see care-plans.js). The member can
// only reach this once a bid is accepted and a full-amount Stripe
// PaymentIntent already exists on the plan (payment_status
// 'requires_payment', set by care-plans.js's handleAcceptBid). Splitting the
// bill means: cancel that PI (the member isn't paying it themselves), and
// let each participant pay their own share via split-pay.js / split-guest-pay.js.
//
// split_payments.package_id predates care_plans and has no FK/type
// constraint tying it to maintenance_packages -- for splits created against a
// care plan it holds the care_plans.id instead. Nothing else reads it as a
// literal "package" reference downstream in this file's ported siblings.
//
// Creates a split_payments row + split_participants rows.
// Returns: { success, split_id, participants }

var utils = require('./utils');
var { isFeatureEnabledForUser } = require('./_shared/feature-flag-check');
var { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'POST') return utils.errorResponse(405, 'Method not allowed');

  var authHeader = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!authHeader.startsWith('Bearer ')) return utils.errorResponse(401, 'Authorization required');
  var token = authHeader.slice(7).trim();

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(503, 'Service temporarily unavailable');

  var userResult = await supabase.auth.getUser(token);
  if (userResult.error || !userResult.data?.user) return utils.errorResponse(401, 'Invalid or expired auth token');
  var userId = userResult.data.user.id;

  // Feature gate (ships dark for launch)
  var spEnabled = await isFeatureEnabledForUser(supabase, 'split_payments_enabled', userId);
  if (!spEnabled) return utils.errorResponse(403, 'feature_disabled');

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return utils.errorResponse(400, 'Invalid JSON'); }

  var carePlanId    = (body.care_plan_id || '').trim();
  var participants  = Array.isArray(body.participants) ? body.participants : [];

  if (!carePlanId || !utils.isValidUUID(carePlanId))
    return utils.errorResponse(400, 'care_plan_id is required and must be a valid UUID');
  if (participants.length < 1)
    return utils.errorResponse(400, 'At least one participant is required');
  if (participants.some(p => !p.email || !p.amount_cents || p.amount_cents < 100))
    return utils.errorResponse(400, 'Each participant requires email and amount_cents >= 100');

  // Verify the care plan belongs to this user and is at the "awaiting your
  // card authorization" step -- the only point the Split Payment button is
  // ever shown (see members-care-plans.js's renderCardAuthorizePanel).
  var planRes = await supabase
    .from('care_plans')
    .select('id, title, member_id, provider_id, payment_status, stripe_payment_intent_id, split_payment_id')
    .eq('id', carePlanId)
    .eq('member_id', userId)
    .single();
  if (planRes.error || !planRes.data)
    return utils.errorResponse(404, 'Care plan not found or not owned by you');
  var plan = planRes.data;

  if (plan.payment_status !== 'requires_payment' || !plan.stripe_payment_intent_id)
    return utils.errorResponse(409, 'This care plan is not awaiting card authorization -- a split payment cannot be started');

  var stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });

  // The pending PI's amount is the ground truth for "what needs to be
  // split" -- it already accounts for any MCC credits/wallet balance applied
  // at accept-bid time, which participant amounts must sum to exactly.
  var existingPI;
  try {
    existingPI = await stripe.paymentIntents.retrieve(plan.stripe_payment_intent_id);
  } catch (stripeErr) {
    return utils.errorResponse(500, stripeErr.message || 'Failed to look up the pending payment');
  }
  if (existingPI.status === 'succeeded') {
    return utils.errorResponse(409, 'This care plan has already been paid');
  }
  if (!['requires_payment_method', 'requires_confirmation', 'requires_action', 'requires_capture'].includes(existingPI.status)) {
    return utils.errorResponse(409, `Cannot split payment -- pending charge is ${existingPI.status}`);
  }

  var totalCents = participants.reduce((sum, p) => sum + p.amount_cents, 0);
  if (totalCents !== existingPI.amount) {
    return utils.errorResponse(400, `Split amounts ($${(totalCents / 100).toFixed(2)}) must total the full charge amount ($${(existingPI.amount / 100).toFixed(2)})`);
  }

  try {
    await stripe.paymentIntents.cancel(plan.stripe_payment_intent_id);
  } catch (stripeErr) {
    // requires_capture PIs that raced to capture, or a PI already cancelled
    // by a retry, both surface here -- re-check status rather than fail closed
    // on every Stripe error, since a stale cache is a poor reason to block.
    console.error('[split-create] PI cancel failed:', stripeErr.message);
    try {
      var recheck = await stripe.paymentIntents.retrieve(plan.stripe_payment_intent_id);
      if (recheck.status !== 'canceled') {
        return utils.errorResponse(500, 'Failed to release the pending charge before splitting. Please try again.');
      }
    } catch (e2) {
      return utils.errorResponse(500, 'Failed to release the pending charge before splitting. Please try again.');
    }
  }

  var expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(); // 72 hours

  var splitRes = await supabase
    .from('split_payments')
    .insert({ package_id: carePlanId, created_by: userId, total_amount_cents: totalCents, status: 'pending', expires_at: expiresAt })
    .select('id')
    .single();
  if (splitRes.error) {
    console.error('[split-create] split_payments insert:', splitRes.error.message);
    return utils.errorResponse(500, 'Failed to create split payment');
  }
  var splitId = splitRes.data.id;

  // Link the plan to this split and move it out of "requires_payment" now
  // that the original PI is cancelled -- the card-authorize panel must not
  // be shown again for this plan while a split is in flight.
  var linkErr = (await supabase.from('care_plans').update({
    split_payment_id: splitId,
    payment_status: 'pending_split_payment',
    stripe_payment_intent_id: null,
    updated_at: new Date().toISOString(),
  }).eq('id', carePlanId)).error;
  if (linkErr) console.error('[split-create] care_plans link failed:', linkErr.message);

  // Resolve member_id for each participant by email where possible
  var emails = participants.map(p => p.email.trim().toLowerCase());
  var profilesRes = await supabase.from('profiles').select('id, email').in('email', emails);
  var emailToMemberId = {};
  if (profilesRes.data) {
    for (var profile of profilesRes.data) {
      emailToMemberId[profile.email.toLowerCase()] = profile.id;
    }
  }

  var rows = participants.map(p => {
    var email     = p.email.trim().toLowerCase();
    var memberId  = emailToMemberId[email] || null;
    return {
      split_payment_id: splitId,
      email,
      display_name: p.display_name || null,
      amount_cents: p.amount_cents,
      member_id: memberId,
      status: 'invited',
      invited_at: new Date().toISOString()
    };
  });

  var partRes = await supabase.from('split_participants').insert(rows).select('id, email, amount_cents, member_id, status');
  if (partRes.error) {
    console.error('[split-create] split_participants insert:', partRes.error.message);
    return utils.errorResponse(500, 'Failed to create participants');
  }

  // Build invite tokens for guest participants
  var participantsOut = partRes.data.map(p => ({
    id: p.id,
    email: p.email,
    amount_cents: p.amount_cents,
    is_member: !!p.member_id,
    invite_token: p.member_id ? null : utils.generateGuestToken(p.id)
  }));

  return utils.successResponse({ success: true, split_id: splitId, participants: participantsOut });
};

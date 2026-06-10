// POST /api/packages/:id/contribute
// Step 1: body = { amount_cents }              → creates Stripe PaymentIntent, returns { client_secret }
// Step 2: body = { payment_intent_id, amount_cents, message } → verifies + records contribution
'use strict';
let utils = require('./utils');
let { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'POST') return utils.errorResponse(405, 'Method not allowed');

  try {
    let packageId = utils.extractPathParam(event.path);
    if (!utils.isValidUUID(packageId)) return utils.errorResponse(400, 'Invalid package ID');

    let authHeader = event.headers && (event.headers.authorization || event.headers.Authorization);
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return utils.errorResponse(401, 'Authorization required');
    }

    let token = authHeader.slice(7).trim();
    let supabase = utils.createSupabaseClient();
    if (!supabase) return utils.errorResponse(503, 'Service temporarily unavailable');

    let userResult = await supabase.auth.getUser(token);
    if (userResult.error || !userResult.data || !userResult.data.user) {
      return utils.errorResponse(401, 'Invalid token');
    }
    let userId = userResult.data.user.id;

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return utils.errorResponse(400, 'Invalid JSON'); }

    let pkgResult = await supabase
      .from('maintenance_packages')
      .select('id, crowd_funded, status, funding_goal_cents, member_id')
      .eq('id', packageId)
      .single();

    if (pkgResult.error || !pkgResult.data) return utils.errorResponse(404, 'Package not found');
    let pkg = pkgResult.data;
    if (!pkg.crowd_funded) return utils.errorResponse(400, 'Package is not crowd-funded');
    if (!['pending', 'active', 'open'].includes(pkg.status)) {
      return utils.errorResponse(400, 'Package is not open for contributions');
    }

    let stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });

    // ── Step 2: confirm + record ──────────────────────────────────────────
    if (body.payment_intent_id) {
      let { payment_intent_id, amount_cents, message } = body;
      if (!amount_cents || amount_cents < 100) return utils.errorResponse(400, 'amount_cents must be at least 100');

      let pi;
      try { pi = await stripe.paymentIntents.retrieve(payment_intent_id); }
      catch (e) { return utils.errorResponse(400, 'Could not retrieve PaymentIntent: ' + e.message); }

      if (pi.status !== 'succeeded') {
        return utils.errorResponse(400, 'Payment has not been completed. Status: ' + pi.status);
      }
      if (pi.metadata.package_id !== packageId || pi.metadata.contributor_id !== userId) {
        return utils.errorResponse(403, 'PaymentIntent does not match this request');
      }
      if (pi.amount !== amount_cents) {
        return utils.errorResponse(400, 'amount_cents does not match PaymentIntent amount');
      }

      let dupCheck = await supabase
        .from('crowd_fund_contributions')
        .select('id')
        .eq('payment_intent_id', payment_intent_id)
        .maybeSingle();
      if (dupCheck.data) return utils.successResponse({ success: true, already_recorded: true });

      let { error: insertError } = await supabase
        .from('crowd_fund_contributions')
        .insert({
          package_id:        packageId,
          contributor_id:    userId,
          amount_cents:      amount_cents,
          payment_intent_id: payment_intent_id,
          message:           message || null,
          status:            'completed',
        });

      if (insertError) {
        console.error('package-contribute insert error:', insertError.message);
        return utils.errorResponse(500, 'Failed to record contribution');
      }

      await supabase.from('notifications').insert({
        user_id:     pkg.member_id,
        type:        'crowd_fund_contribution',
        title:       'New Contribution Received',
        message:     'Someone contributed $' + (amount_cents / 100).toFixed(2) + ' to your crowd-funded request.',
        entity_type: 'maintenance_package',
        entity_id:   packageId,
      });

      return utils.successResponse({ success: true, recorded: true });
    }

    // ── Step 1: create PaymentIntent ──────────────────────────────────────
    let { amount_cents } = body;
    if (!amount_cents || amount_cents < 100) return utils.errorResponse(400, 'amount_cents must be at least 100');
    if (amount_cents > 500000) return utils.errorResponse(400, 'amount_cents exceeds maximum ($5,000)');

    let pi = await stripe.paymentIntents.create({
      amount:   amount_cents,
      currency: 'usd',
      metadata: {
        package_id:     packageId,
        contributor_id: userId,
        type:           'crowd_fund_contribution',
      },
    });

    return utils.successResponse({ client_secret: pi.client_secret });
  } catch (err) {
    console.error('package-contribute error:', err);
    return utils.errorResponse(500, 'Internal server error');
  }
};

// ============================================================================
// _bid-accept-hook
//
// Single choke point for everything that must run when a plan_bid is
// marked accepted. Wired into care-plans.js at three branches (wallet-
// covered / reviewer-mock / normal Stripe path) so a future fourth accept
// path can't accidentally skip either the provider push or the trial
// conversion.
//
// onBidAccepted(sb, bid, callerId, plan) does two things, in order:
//   1. convertProviderTrial() — if the provider has a trialing
//      subscription, end its trial via stripe.subscriptions.update({
//      trial_end:'now' }). Idempotent; single-use per subscription.
//      Failures are audit-logged and swallowed — the accept must succeed.
//   2. notifyAcceptedProvider() — push + in-app notification.
//
// See docs/specs/provider-subscriptions-build-spec.md §2.4a.
// ============================================================================

const { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');

function _stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return require('stripe')(key, { apiVersion: STRIPE_API_VERSION });
}

// Attempt to end the provider's trialing subscription. Every failure mode
// (no trialing sub, already converted, Stripe API error) is a no-throw —
// the accept path must not fail because of subscription bookkeeping.
async function convertProviderTrial(sb, providerId, bidId) {
  try {
    if (!providerId) return { skipped: 'no_provider_id' };

    const { data: sub, error: qErr } = await sb
      .from('provider_subscriptions')
      .select('id, stripe_subscription_id, status, converted_at, plan_key')
      .eq('provider_id', providerId)
      .eq('status', 'trialing')
      .is('converted_at', null)
      .maybeSingle();
    if (qErr) {
      console.warn('[bid-accept-hook] provider_subscriptions lookup failed:', qErr.message);
      return { skipped: 'lookup_failed' };
    }
    if (!sub) return { skipped: 'no_trialing_sub' };

    const stripe = _stripe();
    if (!stripe) {
      // Env not configured — flag via audit, don't throw.
      await sb.from('admin_audit_log').insert({
        action: 'trial_conversion_failed',
        target_id: providerId,
        target_type: 'profile',
        performed_by: 'bid-accept-hook',
        reason: 'stripe_env_missing',
        metadata: { subscription_id: sub.id, bid_id: bidId },
      }).catch(() => {});
      return { skipped: 'stripe_env_missing' };
    }

    // Ask Stripe to end the trial immediately. proration_behavior='none'
    // per §2.4a — the conversion invoice is the first month; unspent
    // trial credits carry via the existing rollover cap logic in
    // handleProviderPlanInvoicePaid.
    const nowIso = new Date().toISOString();
    try {
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        trial_end: 'now',
        proration_behavior: 'none',
      });
    } catch (stripeErr) {
      console.error('[bid-accept-hook] stripe conversion failed:', stripeErr.message);
      await sb.from('admin_audit_log').insert({
        action: 'trial_conversion_failed',
        target_id: providerId,
        target_type: 'profile',
        performed_by: 'bid-accept-hook',
        reason: 'stripe_api_error',
        metadata: {
          subscription_id: sub.id,
          stripe_subscription_id: sub.stripe_subscription_id,
          bid_id: bidId,
          error: stripeErr.message,
        },
      }).catch(() => {});
      return { skipped: 'stripe_api_error' };
    }

    // Stamp converted_at / converting_bid_id on our row. The Stripe
    // update above will emit customer.subscription.updated → our
    // handleProviderPlanSubscriptionUpdated syncs status='active'. We
    // record the conversion metadata here regardless.
    await sb.from('provider_subscriptions')
      .update({ converted_at: nowIso, converting_bid_id: bidId })
      .eq('id', sub.id);

    return { converted: sub.stripe_subscription_id, at: nowIso };
  } catch (e) {
    // Belt-and-suspenders: nothing about trial conversion is allowed to
    // throw into the accept flow.
    console.error('[bid-accept-hook] convertProviderTrial exception:', e.message);
    try {
      await sb.from('admin_audit_log').insert({
        action: 'trial_conversion_failed',
        target_id: providerId,
        target_type: 'profile',
        performed_by: 'bid-accept-hook',
        reason: 'exception',
        metadata: { bid_id: bidId, error: e.message },
      });
    } catch (_) { /* swallow */ }
    return { skipped: 'exception' };
  }
}

// onBidAccepted — single call site used by care-plans.js after each of
// the three plan_bids status='accepted' updates. Ordering: trial first
// (payment side-effect), then push (user-visible side-effect). Push
// receives the accept-side callerId separately per its existing shape.
async function onBidAccepted(sb, { bid, callerId, planId, planTitle, bidAmount, notifyAcceptedProvider }) {
  // Trial conversion (may Stripe-call; guarded to never throw).
  await convertProviderTrial(sb, bid.provider_id, bid.id);

  // Existing notification path — unchanged behavior. Passed in as a
  // parameter so this module doesn't have to import from care-plans.js
  // (would create a circular dependency).
  await notifyAcceptedProvider(sb, bid.provider_id, callerId, planId, planTitle, bidAmount);
}

module.exports = { onBidAccepted, convertProviderTrial };

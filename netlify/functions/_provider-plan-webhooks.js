// ============================================================================
// _provider-plan-webhooks
//
// Stripe webhook handlers for the provider-plan subscription product.
// Called from stripe-webhook.js's event dispatcher. Every handler gates on
// `metadata.product === 'provider_plan'` first so it never touches the
// white-label subscription product (which owns the same event types).
//
// See docs/specs/provider-subscriptions-build-spec.md §2.3, §2.4a, §2.5.
//
// Provider identification: plan-checkout attaches `metadata.provider_id`
// to the Stripe Subscription (and hence to its invoices). Each handler
// reads that first; falls back to provider_subscriptions.stripe_customer_id
// lookup if the subscription metadata is missing.
//
// Idempotency: every ledger insert uses `invoice_id + source='subscription'`
// or `ref_type='trial_grant' + ref_id=subscription.id` as a duplicate check.
// Stripe replays cannot double-grant.
// ============================================================================

const TRIAL_REF_TYPE     = 'trial_grant';
const INVOICE_REF_TYPE   = 'invoice_paid';
const UPGRADE_REF_TYPE   = 'upgrade_prorated';

function isProviderPlanSub(sub) {
  return sub && sub.metadata && sub.metadata.product === 'provider_plan';
}

function isProviderPlanInvoice(inv) {
  // Invoices don't always carry line-item metadata; check the subscription
  // reference and let the caller lazily load it.
  return inv && (
    (inv.subscription_details && inv.subscription_details.metadata &&
       inv.subscription_details.metadata.product === 'provider_plan') ||
    (inv.metadata && inv.metadata.product === 'provider_plan')
  );
}

async function _findProviderSubRow(supabase, stripeSubId) {
  if (!stripeSubId) return null;
  const { data } = await supabase
    .from('provider_subscriptions')
    .select('*')
    .eq('stripe_subscription_id', stripeSubId)
    .maybeSingle();
  return data || null;
}

async function _sumRemainingSubscriptionCredits(supabase, providerId) {
  // Remaining balance in subscription-source lots =
  //   SUM(grant delta) + SUM(child spend/expiry/reversal delta)
  // Simplification: sum ALL rows where source='subscription' — grants are +N,
  // spends are -N (source='bid' but lot_id points at the grant), expiries
  // are -N (source='expiry' pointing at the grant). Since we need to sum
  // only the "living" balance tied to subscription lots, walk grants and
  // add spend children.
  const { data: grants } = await supabase
    .from('credit_ledger')
    .select('id, delta')
    .eq('provider_id', providerId)
    .eq('source', 'subscription')
    .gt('delta', 0);
  if (!grants || grants.length === 0) return 0;
  const grantIds = grants.map(g => g.id);
  const { data: children } = await supabase
    .from('credit_ledger')
    .select('lot_id, delta')
    .in('lot_id', grantIds);
  const childSum = new Map();
  for (const c of children || []) {
    childSum.set(c.lot_id, (childSum.get(c.lot_id) || 0) + c.delta);
  }
  let total = 0;
  for (const g of grants) total += g.delta + (childSum.get(g.id) || 0);
  return Math.max(0, total);
}

// ----------------------------------------------------------------------------
// customer.subscription.created — trial lot grant (§2.4a)
// ----------------------------------------------------------------------------
async function handleProviderPlanSubscriptionCreated(sub, supabase) {
  if (!isProviderPlanSub(sub)) return { skipped: 'not_provider_plan' };

  const providerId = sub.metadata.provider_id || null;
  if (!providerId) {
    console.warn('[provider-plan-webhook] subscription.created missing metadata.provider_id, sub=', sub.id);
    return { skipped: 'no_provider_id' };
  }

  const planKey = sub.metadata.plan_key || null;
  if (!planKey) return { skipped: 'no_plan_key' };

  // Fetch plan row for credits_per_month.
  const { data: plan } = await supabase
    .from('subscription_plans').select('plan_key, credits_per_month')
    .eq('plan_key', planKey).maybeSingle();
  if (!plan) return { skipped: 'plan_not_found', plan_key: planKey };

  const nowIso = new Date().toISOString();
  const status = sub.status;
  const isTrial = status === 'trialing';
  const billingInterval = (sub.items && sub.items.data && sub.items.data[0] &&
    sub.items.data[0].price && sub.items.data[0].price.recurring &&
    sub.items.data[0].price.recurring.interval === 'year') ? 'year' : 'month';

  // Upsert the provider_subscriptions row. The trial_started_at partial
  // unique index enforces one-trial-per-provider at the DB layer.
  const upsertRow = {
    provider_id: providerId,
    plan_key: planKey,
    stripe_subscription_id: sub.id,
    stripe_customer_id: sub.customer || null,
    status,
    billing_interval: billingInterval,
    current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
    current_period_end:   sub.current_period_end   ? new Date(sub.current_period_end   * 1000).toISOString() : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    trial_started_at: isTrial ? nowIso : null,
  };
  const { error: upsertErr } = await supabase
    .from('provider_subscriptions')
    .upsert(upsertRow, { onConflict: 'stripe_subscription_id' });
  if (upsertErr) {
    // If the one-trial-per-provider unique index rejects, surface it.
    console.error('[provider-plan-webhook] subscription upsert failed:', upsertErr.message);
    return { error: 'provider_subscriptions upsert failed', details: upsertErr.message };
  }

  // Trial lot grant — only if trialing and not already granted for this sub.
  if (isTrial) {
    const { data: prior } = await supabase
      .from('credit_ledger')
      .select('id')
      .eq('provider_id', providerId)
      .eq('source', 'subscription')
      .eq('ref_type', TRIAL_REF_TYPE)
      .eq('ref_id', sub.id)
      .limit(1);
    if (prior && prior.length > 0) {
      return { skipped: 'trial_already_granted', ledger_id: prior[0].id };
    }

    const { error: ledErr } = await supabase.from('credit_ledger').insert({
      provider_id: providerId,
      delta: plan.credits_per_month,
      source: 'subscription',
      ref_type: TRIAL_REF_TYPE,
      ref_id: sub.id,
    });
    if (ledErr) {
      console.error('[provider-plan-webhook] trial grant insert failed:', ledErr.message);
      return { error: 'trial_grant_failed', details: ledErr.message };
    }
    return { granted: plan.credits_per_month, kind: 'trial' };
  }

  return { synced: true, status };
}

// ----------------------------------------------------------------------------
// invoice.paid — monthly grant + rollover cap (§2.3)
// ----------------------------------------------------------------------------
async function handleProviderPlanInvoicePaid(invoice, supabase) {
  if (!isProviderPlanInvoice(invoice)) {
    // Cheap gate: look up the subscription row we own to see if it's ours.
    const stripeSubId = invoice.subscription;
    if (!stripeSubId) return { skipped: 'no_subscription_ref' };
    const owned = await _findProviderSubRow(supabase, stripeSubId);
    if (!owned) return { skipped: 'not_provider_plan' };
    // Fall through — we own this sub even though invoice metadata missed.
    invoice.metadata = Object.assign({}, invoice.metadata, { product: 'provider_plan' });
  }
  if (!(invoice.amount_paid > 0)) return { skipped: 'amount_paid_zero' };

  const stripeSubId = invoice.subscription;
  const subRow = await _findProviderSubRow(supabase, stripeSubId);
  if (!subRow) return { skipped: 'sub_row_not_found', stripe_sub_id: stripeSubId };
  const providerId = subRow.provider_id;

  // Idempotency: no duplicate grant for the same invoice.
  const { data: prior } = await supabase
    .from('credit_ledger')
    .select('id')
    .eq('provider_id', providerId)
    .eq('source', 'subscription')
    .eq('invoice_id', invoice.id)
    .limit(1);
  if (prior && prior.length > 0) return { skipped: 'already_granted', ledger_id: prior[0].id };

  const { data: plan } = await supabase
    .from('subscription_plans').select('plan_key, credits_per_month')
    .eq('plan_key', subRow.plan_key).maybeSingle();
  if (!plan) return { skipped: 'plan_not_found' };

  const allotment = plan.credits_per_month;

  // Rollover cap: carry = min(remaining, allotment). Excess expires.
  const remaining = await _sumRemainingSubscriptionCredits(supabase, providerId);
  const carry = Math.min(remaining, allotment);
  const toExpire = remaining - carry;

  if (toExpire > 0) {
    // Walk oldest subscription grants; expire each until we've clawed back
    // `toExpire` credits. Insert one expiry row per lot with the exact
    // remaining balance so the sum-check invariant holds.
    const { data: grants } = await supabase
      .from('credit_ledger')
      .select('id, delta, created_at')
      .eq('provider_id', providerId)
      .eq('source', 'subscription')
      .gt('delta', 0)
      .order('created_at', { ascending: true });
    let left = toExpire;
    for (const g of grants || []) {
      if (left <= 0) break;
      const { data: chSum } = await supabase
        .from('credit_ledger').select('delta').eq('lot_id', g.id);
      const spent = (chSum || []).reduce((a, r) => a + r.delta, 0);
      const lotRemaining = g.delta + spent;
      if (lotRemaining <= 0) continue;
      const expireBy = Math.min(lotRemaining, left);
      const { error: expErr } = await supabase.from('credit_ledger').insert({
        provider_id: providerId,
        delta: -expireBy,
        source: 'expiry',
        lot_id: g.id,
        invoice_id: invoice.id,
        ref_type: 'rollover_cap',
        ref_id: stripeSubId,
      });
      if (expErr) {
        console.error('[provider-plan-webhook] expiry insert failed:', expErr.message);
        break;
      }
      left -= expireBy;
    }
  }

  // Grant the new month.
  const { error: grErr } = await supabase.from('credit_ledger').insert({
    provider_id: providerId,
    delta: allotment,
    source: 'subscription',
    invoice_id: invoice.id,
    ref_type: INVOICE_REF_TYPE,
    ref_id: stripeSubId,
  });
  if (grErr) {
    console.error('[provider-plan-webhook] grant insert failed:', grErr.message);
    return { error: 'grant_failed', details: grErr.message };
  }

  // Post-grant balance assertion: sum must be ≤ 2 × allotment.
  const postBalance = await _sumRemainingSubscriptionCredits(supabase, providerId);
  if (postBalance > 2 * allotment) {
    console.warn(`[provider-plan-webhook] rollover cap breached: provider=${providerId} balance=${postBalance} allotment=${allotment}`);
  }

  return { granted: allotment, expired: toExpire, post_balance: postBalance };
}

// ----------------------------------------------------------------------------
// invoice.payment_failed — status→past_due (§2.5)
// ----------------------------------------------------------------------------
async function handleProviderPlanInvoicePaymentFailed(invoice, supabase) {
  const stripeSubId = invoice.subscription;
  if (!stripeSubId) return { skipped: 'no_subscription_ref' };
  const subRow = await _findProviderSubRow(supabase, stripeSubId);
  if (!subRow) return { skipped: 'not_provider_plan' };

  await supabase
    .from('provider_subscriptions')
    .update({ status: 'past_due' })
    .eq('stripe_subscription_id', stripeSubId);
  return { synced: 'past_due' };
}

// ----------------------------------------------------------------------------
// customer.subscription.updated — status/period/plan sync + upgrade delta
// ----------------------------------------------------------------------------
async function handleProviderPlanSubscriptionUpdated(sub, supabase) {
  if (!isProviderPlanSub(sub)) return { skipped: 'not_provider_plan' };

  const subRow = await _findProviderSubRow(supabase, sub.id);
  if (!subRow) {
    // Race: updated fires before created was processed. Treat as create.
    return handleProviderPlanSubscriptionCreated(sub, supabase);
  }

  const newPlanKey = sub.metadata.plan_key || subRow.plan_key;
  const oldPlanKey = subRow.plan_key;

  const patch = {
    status: sub.status,
    plan_key: newPlanKey,
    current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
    current_period_end:   sub.current_period_end   ? new Date(sub.current_period_end   * 1000).toISOString() : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
  };
  await supabase
    .from('provider_subscriptions').update(patch)
    .eq('stripe_subscription_id', sub.id);

  // Upgrade mid-period: grant (new - old) if the plan_key changed to a
  // larger allotment. Same idempotency shape as invoice.paid.
  if (newPlanKey !== oldPlanKey) {
    const { data: [oldPlan, newPlan] } = await supabase
      .from('subscription_plans').select('plan_key, credits_per_month')
      .in('plan_key', [oldPlanKey, newPlanKey]);
    const oldC = (oldPlan && oldPlan.credits_per_month) || 0;
    const newC = (newPlan && newPlan.credits_per_month) || 0;
    const delta = newC - oldC;
    if (delta > 0) {
      const proratedInvoiceId = `upgrade:${sub.id}:${oldPlanKey}->${newPlanKey}`;
      const { data: prior } = await supabase
        .from('credit_ledger').select('id')
        .eq('provider_id', subRow.provider_id)
        .eq('invoice_id', proratedInvoiceId).limit(1);
      if (!prior || prior.length === 0) {
        await supabase.from('credit_ledger').insert({
          provider_id: subRow.provider_id,
          delta,
          source: 'subscription',
          invoice_id: proratedInvoiceId,
          ref_type: UPGRADE_REF_TYPE,
          ref_id: sub.id,
        });
      }
    }
  }

  return { synced: true, status: sub.status, plan_key: newPlanKey };
}

// ----------------------------------------------------------------------------
// customer.subscription.deleted — end + 60-day expiry stamp (§2.5)
// ----------------------------------------------------------------------------
async function handleProviderPlanSubscriptionDeleted(sub, supabase) {
  if (!isProviderPlanSub(sub)) return { skipped: 'not_provider_plan' };

  const subRow = await _findProviderSubRow(supabase, sub.id);
  if (!subRow) return { skipped: 'sub_row_not_found' };

  const endedAtIso = new Date().toISOString();
  const expiresAtIso = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString();

  await supabase
    .from('provider_subscriptions')
    .update({ status: sub.status || 'canceled', ended_at: endedAtIso, canceled_at: endedAtIso })
    .eq('stripe_subscription_id', sub.id);

  // Stamp expires_at on every open subscription lot for this provider.
  // Not per-lot — bulk update on grants that don't already carry a stamp.
  await supabase
    .from('credit_ledger')
    .update({ expires_at: expiresAtIso })
    .eq('provider_id', subRow.provider_id)
    .eq('source', 'subscription')
    .gt('delta', 0)
    .is('expires_at', null);

  return { ended_at: endedAtIso, expires_at: expiresAtIso };
}

module.exports = {
  isProviderPlanSub,
  isProviderPlanInvoice,
  handleProviderPlanSubscriptionCreated,
  handleProviderPlanInvoicePaid,
  handleProviderPlanInvoicePaymentFailed,
  handleProviderPlanSubscriptionUpdated,
  handleProviderPlanSubscriptionDeleted,
};

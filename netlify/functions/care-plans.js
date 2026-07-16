// GET    /api/care-plans/mine                    — member's own care plans
// GET    /api/care-plans/:id                     — detail + bids
// POST   /api/care-plans/:id/accept-bid          — accept a bid, create escrow PaymentIntent
// POST   /api/care-plans/:id/complete            — capture escrow, release to provider
// POST   /api/care-plans/:id/dispute             — freeze escrow, notify admin
const { createClient } = require('@supabase/supabase-js');
const { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');
const { dispatchBidAcceptedPush } = require('./notifications-bid-accepted-push');
const { audit: sharedAudit } = require('./_shared/audit');

// Money-path audit wrapper: always log + alert on failure. A failed audit
// must NEVER throw into the money operation — the shared helper guarantees
// this. See netlify/functions/_shared/audit.js.
const audit = (supabase, row) =>
  sharedAudit(supabase, row, {
    alertOnFailure: true,
    logOnFailure: true,
    logPrefix: '[care-plans]',
  });

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return require('stripe')(key, { apiVersion: STRIPE_API_VERSION });
}

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

async function getUser(event, sb) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { error: json(401, { error: 'Missing token' }) };
  const { data: { user }, error } = await sb.auth.getUser(m[1].trim());
  if (error || !user) return { error: json(401, { error: 'Invalid token' }) };
  return { user };
}

function stripRoute(path) {
  return (path || '').replace(/.*\/api\/care-plans\/?/, '').replace(/\/$/, '');
}

// Build the completion object from a care_plan row (no separate table needed)
function buildCompletion(plan) {
  if (!plan.accepted_bid_id) return null;
  if (!['captured', 'disputed'].includes(plan.payment_status)) return null;
  return {
    captured_amount: plan.payment_status === 'captured' ? plan.escrow_amount : null,
    captured_at: plan.payment_status === 'captured' ? plan.updated_at : null,
    disputed_at: plan.payment_status === 'disputed' ? plan.updated_at : null,
    dispute_reason: plan.dispute_reason || null,
    completion_notes: plan.completion_notes || null,
  };
}

async function handleMine(sb, user) {
  const { data: plans, error } = await sb
    .from('care_plans')
    .select(`
      id, title, description, status, bid_closes_at, bid_count,
      accepted_bid_id, provider_id, payment_status, escrow_amount,
      created_at, updated_at, vehicle_id,
      vehicles:vehicle_id(id, year, make, model, nickname)
    `)
    .eq('member_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return json(500, { error: error.message });

  const planList = plans || [];
  if (!planList.length) return json(200, { plans: [] });

  // Fetch pending bid counts + accepted bids in bulk
  const planIds = planList.map(p => p.id);

  const { data: pendingBids } = await sb
    .from('plan_bids')
    .select('care_plan_id')
    .in('care_plan_id', planIds)
    .eq('status', 'pending');

  const pendingMap = {};
  for (const b of (pendingBids || [])) {
    pendingMap[b.care_plan_id] = (pendingMap[b.care_plan_id] || 0) + 1;
  }

  // Fetch accepted bids for plans that have one
  const acceptedPlanIds = planList.filter(p => p.accepted_bid_id).map(p => p.accepted_bid_id);
  const { data: acceptedBids } = acceptedPlanIds.length
    ? await sb.from('plan_bids').select('id, amount, status, provider_id').in('id', acceptedPlanIds)
    : { data: [] };
  const acceptedBidMap = {};
  for (const b of (acceptedBids || [])) {
    acceptedBidMap[b.id] = b;
  }

  const result = planList.map(p => ({
    ...p,
    vehicle: p.vehicles || null,
    vehicles: undefined,
    pending_bid_count: pendingMap[p.id] || 0,
    accepted_bid: p.accepted_bid_id ? (acceptedBidMap[p.accepted_bid_id] || null) : null,
  }));

  return json(200, { plans: result });
}

async function handleGetOne(sb, user, planId) {
  const { data: plan, error } = await sb
    .from('care_plans')
    .select(`
      *,
      vehicles:vehicle_id(id, year, make, model, nickname, color, license_plate)
    `)
    .eq('id', planId)
    .single();

  if (error || !plan) return json(404, { error: 'Care plan not found' });
  if (plan.member_id !== user.id) return json(403, { error: 'Forbidden' });

  // Two-query stitch — the plan_bids.provider_id FK targets auth.users, not
  // profiles, so a `profiles!plan_bids_provider_id_fkey` embed makes PostgREST
  // return an error which was previously swallowed (member saw "No bids yet").
  const { data: bids, error: bidsErr } = await sb
    .from('plan_bids')
    .select('id, care_plan_id, provider_id, amount, note, status, is_auto_bid, created_at')
    .eq('care_plan_id', planId)
    .order('created_at', { ascending: true });

  if (bidsErr) {
    console.error('[care-plans] plan_bids select failed:', bidsErr.message);
    return json(500, { error: 'Failed to load bids' });
  }

  const providerIds = [...new Set((bids || []).map(b => b.provider_id).filter(Boolean))];
  let providersById = {};
  if (providerIds.length > 0) {
    const { data: providers, error: provErr } = await sb
      .from('profiles')
      .select('id, full_name, business_name, avatar_url')
      .in('id', providerIds);
    if (provErr) {
      // Non-fatal — return bids with null provider fields rather than 500ing.
      console.error('[care-plans] profiles stitch failed:', provErr.message);
    } else {
      providersById = Object.fromEntries((providers || []).map(p => [p.id, p]));
    }
  }

  const bidList = (bids || []).map(b => ({
    ...b,
    provider: providersById[b.provider_id] || null,
    notes: b.note,
  }));

  const vehicle = plan.vehicles || null;
  const completion = buildCompletion(plan);

  return json(200, {
    plan: { ...plan, vehicles: undefined },
    bids: bidList,
    completion,
    vehicle,
  });
}

// Fire-and-forget winner notification: in-app row + FCM push.
// Mirrors the matchmaker-path notification (agent-fleet-admin.js bid_accepted)
// and reuses the same dispatcher as /api/notifications/bid-accepted-push.
// Non-fatal: any failure is logged but never blocks the accept/escrow.
// Self-skip when the caller IS the provider (QA/dual-role accounts) — mirrors
// the Task #408 guard in notifications-bid-accepted-push.js.
async function notifyAcceptedProvider(sb, providerId, callerId, planId, planTitle, bidAmount) {
  if (!providerId || providerId === callerId) return;
  const title = planTitle || 'care plan';
  const amountLabel = '$' + Number(bidAmount).toFixed(2);
  try {
    await sb.from('notifications').insert({
      user_id: providerId,
      type: 'bid_accepted',
      title: 'Your bid was accepted',
      message: `Your bid of ${amountLabel} for "${title}" was accepted. Contact the member to schedule the work.`,
      link_type: 'care_plan',
      link_id: planId,
    });
  } catch (err) {
    console.warn('[accept-bid] in-app notification insert failed:', err.message);
  }
  try {
    await dispatchBidAcceptedPush(sb, providerId, title, Number(bidAmount));
  } catch (err) {
    console.warn('[accept-bid] push dispatch failed:', err.message);
  }
}

async function handleAcceptBid(event, sb, user, planId) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const { bid_id, credits_to_apply } = body;
  if (!bid_id) return json(400, { error: 'bid_id required' });

  const creditsCents = Number.isInteger(credits_to_apply) && credits_to_apply > 0
    ? credits_to_apply : 0;

  const { data: plan } = await sb.from('care_plans').select('*').eq('id', planId).single();
  if (!plan) return json(404, { error: 'Care plan not found' });
  if (plan.member_id !== user.id) return json(403, { error: 'Forbidden' });
  if (!['open', 'failed', 'cancelled'].includes(plan.status) && plan.payment_status !== 'requires_payment') {
    return json(400, { error: 'This care plan is not accepting bid acceptance' });
  }

  // Idempotent: if same bid is already accepted and PI exists, return existing client_secret
  if (plan.accepted_bid_id === bid_id && plan.stripe_payment_intent_id && plan.payment_status === 'requires_payment') {
    const st = stripe();
    if (st) {
      try {
        const pi = await st.paymentIntents.retrieve(plan.stripe_payment_intent_id);
        if (pi.client_secret) {
          return json(200, {
            success: true,
            client_secret: pi.client_secret,
            credit_applied_cents: plan.credit_applied_cents || 0,
          });
        }
      } catch (_) {}
    }
  }

  // Verify bid belongs to this plan
  const { data: bid } = await sb.from('plan_bids').select('*').eq('id', bid_id).eq('care_plan_id', planId).single();
  if (!bid) return json(404, { error: 'Bid not found on this care plan' });

  // If plan already has a different accepted bid, it's a race
  if (plan.accepted_bid_id && plan.accepted_bid_id !== bid_id && plan.payment_status === 'held') {
    return json(409, { error: 'A bid has already been accepted and payment is held for this care plan' });
  }

  const st = stripe();
  if (!st) return json(500, { error: 'Payment system unavailable' });

  // Fetch provider Stripe account
  const { data: provProfile } = await sb
    .from('profiles')
    .select('stripe_account_id')
    .eq('id', bid.provider_id)
    .single();

  const bidAmountCents = Math.round(Number(bid.amount) * 100);

  // Atomically deduct credits from member_credits ledger and stamp care plan.
  // The RPC locks the care plan row and guards against over-redemption.
  let appliedCreditsCents = 0;
  if (creditsCents > 0) {
    const { data: rpcData, error: rpcErr } = await sb.rpc('redeem_credits_for_payment', {
      p_member_id: user.id,
      p_care_plan_id: planId,
      p_credits_cents: creditsCents,
    });
    if (rpcErr) return json(400, { error: rpcErr.message || 'Failed to apply credits' });
    appliedCreditsCents = (rpcData && rpcData[0]?.credit_applied_cents) || creditsCents;
  }

  // FEATURE_WALLET: debit wallet balance before charging card (ships dark — off by default)
  let walletDeductedCents = 0;
  if (process.env.FEATURE_WALLET === 'true') {
    const netBeforeWallet = bidAmountCents - appliedCreditsCents;
    if (netBeforeWallet > 0) {
      const { data: walletRow } = await sb
        .from('wallet_accounts')
        .select('cash_balance_cents, bonus_balance_cents')
        .eq('owner_id', user.id)
        .eq('owner_type', 'member')
        .maybeSingle();
      const available = walletRow
        ? (walletRow.cash_balance_cents || 0) + (walletRow.bonus_balance_cents || 0)
        : 0;
      if (available > 0) {
        walletDeductedCents = Math.min(available, netBeforeWallet);
        const { error: wErr } = await sb.rpc('wallet_spend', {
          p_owner_id:     user.id,
          p_owner_type:   'member',
          p_amount_cents: walletDeductedCents,
          p_ref_id:       planId,
          p_description:  'Care plan ' + planId,
        });
        if (wErr) {
          console.warn('[care-plans] wallet_spend error (non-fatal, falling back to card):', wErr.message);
          walletDeductedCents = 0;
        }
      }
    }
  }

  const rawChargeCents = bidAmountCents - appliedCreditsCents - walletDeductedCents;

  // If wallet + credits cover the full charge, mark held without a Stripe PI
  if (rawChargeCents <= 0) {
    const { error: updateErr } = await sb.from('care_plans').update({
      accepted_bid_id: bid_id,
      provider_id: bid.provider_id,
      status: 'awarded',
      payment_status: 'held',
      escrow_amount: bid.amount,
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', planId);
    if (updateErr) return json(500, { error: updateErr.message });
    await sb.from('plan_bids').update({ status: 'accepted' }).eq('id', bid_id);
    // Sweep losing bids. plan_bids.status CHECK only allows
    // ('pending','accepted','rejected','withdrawn') — 'not_selected' was failing
    // silently and leaving losers stuck on 'pending'. Now writes 'rejected' and
    // surfaces any error (still non-fatal — the bid is already awarded).
    const { error: sweepErr } = await sb.from('plan_bids').update({ status: 'rejected' })
      .eq('care_plan_id', planId).neq('id', bid_id).eq('status', 'pending');
    if (sweepErr) console.error('[accept-bid] competitor sweep failed:', sweepErr);
    await audit(sb, {
      action: 'bid_accepted',
      target_id: planId,
      target_type: 'care_plan',
      performed_by: user.id,
      metadata: {
        bid_id,
        provider_id: bid.provider_id,
        escrow_status: 'held',
        escrow_amount: bid.amount,
        credit_applied_cents: appliedCreditsCents,
        wallet_applied_cents: walletDeductedCents,
      },
    });
    await notifyAcceptedProvider(sb, bid.provider_id, user.id, planId, plan.title, bid.amount);
    return json(200, {
      success: true,
      paid_by_wallet: true,
      credit_applied_cents: appliedCreditsCents + walletDeductedCents,
    });
  }

  const chargeAmountCents = Math.max(rawChargeCents, 50); // Stripe minimum 50¢

  const piParams = {
    amount: chargeAmountCents,
    currency: 'usd',
    capture_method: 'manual',
    metadata: {
      care_plan_id:         planId,
      bid_id:               bid.id,
      member_id:            user.id,
      provider_id:          bid.provider_id,
      credit_applied_cents: String(appliedCreditsCents),
      wallet_applied_cents: String(walletDeductedCents),
    },
  };
  if (provProfile?.stripe_account_id) {
    piParams.transfer_data = { destination: provProfile.stripe_account_id };
  }

  let pi;
  try {
    pi = await st.paymentIntents.create(piParams);
  } catch (stripeErr) {
    return json(500, { error: stripeErr.message || 'Failed to create payment intent' });
  }

  // Update care plan — credit columns already set by RPC if credits were applied
  const { error: updateErr } = await sb.from('care_plans').update({
    accepted_bid_id: bid_id,
    provider_id: bid.provider_id,
    status: 'awarded',
    payment_status: 'requires_payment',
    stripe_payment_intent_id: pi.id,
    escrow_amount: bid.amount,
    accepted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', planId);

  if (updateErr) return json(500, { error: updateErr.message });

  // Mark winning bid accepted; sweep losing pending bids to 'rejected'.
  // plan_bids.status CHECK allows ('pending','accepted','rejected','withdrawn');
  // the prior 'not_selected' literal failed the constraint silently and left
  // losers stuck on 'pending'. Now we capture + log any sweep error (non-fatal
  // — the winning bid is already accepted and the care_plan already awarded).
  await sb.from('plan_bids').update({ status: 'accepted' }).eq('id', bid_id);
  const { error: sweepErr } = await sb.from('plan_bids').update({ status: 'rejected' })
    .eq('care_plan_id', planId).neq('id', bid_id).eq('status', 'pending');
  if (sweepErr) console.error('[accept-bid] competitor sweep failed:', sweepErr);

  await audit(sb, {
    action: 'bid_accepted',
    target_id: planId,
    target_type: 'care_plan',
    performed_by: user.id,
    metadata: {
      bid_id,
      provider_id: bid.provider_id,
      escrow_status: 'requires_payment',
      escrow_amount: bid.amount,
      charge_amount_cents: chargeAmountCents,
      credit_applied_cents: appliedCreditsCents,
      wallet_applied_cents: walletDeductedCents,
      stripe_payment_intent_id: pi.id,
    },
  });

  await notifyAcceptedProvider(sb, bid.provider_id, user.id, planId, plan.title, bid.amount);

  return json(200, {
    success: true,
    client_secret: pi.client_secret,
    credit_applied_cents: appliedCreditsCents,
    wallet_applied_cents: walletDeductedCents,
  });
}

async function handleComplete(event, sb, user, planId) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const { data: plan } = await sb.from('care_plans').select('*').eq('id', planId).single();
  if (!plan) return json(404, { error: 'Care plan not found' });
  if (plan.member_id !== user.id) return json(403, { error: 'Forbidden' });
  if (plan.payment_status !== 'held') {
    return json(409, { error: 'Funds are not in held state for this care plan' });
  }
  if (!plan.stripe_payment_intent_id) return json(400, { error: 'No payment intent on record' });

  const st = stripe();
  if (!st) return json(500, { error: 'Payment system unavailable' });

  try {
    await st.paymentIntents.capture(plan.stripe_payment_intent_id);
  } catch (stripeErr) {
    return json(500, { error: stripeErr.message || 'Failed to capture payment' });
  }

  const { error: updateErr } = await sb.from('care_plans').update({
    payment_status: 'captured',
    status: 'completed',
    completion_notes: body.completion_notes || null,
    updated_at: new Date().toISOString(),
  }).eq('id', planId);

  if (updateErr) return json(500, { error: updateErr.message });

  await audit(sb, {
    action: 'payment_captured',
    target_id: planId,
    target_type: 'care_plan',
    performed_by: user.id,
    metadata: {
      stripe_payment_intent_id: plan.stripe_payment_intent_id,
      provider_id: plan.provider_id,
      escrow_amount: plan.escrow_amount,
      previous_status: 'held',
      new_status: 'captured',
    },
  });

  // Notify provider
  if (plan.provider_id) {
    await sb.from('notifications').insert({
      user_id: plan.provider_id,
      type: 'care_plan_completed',
      title: 'Care plan completed — funds released',
      message: 'The member has marked the care plan complete. Funds are on their way.',
      metadata: { care_plan_id: planId },
    }).catch(() => {});
  }

  return json(200, { success: true });
}

async function handleDispute(event, sb, user, planId) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const { dispute_reason, dispute_description } = body;
  if (!dispute_reason) return json(400, { error: 'dispute_reason required' });
  if (!dispute_description) return json(400, { error: 'dispute_description required' });

  const { data: plan } = await sb.from('care_plans').select('*').eq('id', planId).single();
  if (!plan) return json(404, { error: 'Care plan not found' });
  if (plan.member_id !== user.id) return json(403, { error: 'Forbidden' });
  if (plan.payment_status !== 'held') {
    return json(409, { error: 'Funds are not in held state — cannot raise a dispute' });
  }

  const { error: updateErr } = await sb.from('care_plans').update({
    payment_status: 'disputed',
    dispute_reason: dispute_reason,
    updated_at: new Date().toISOString(),
  }).eq('id', planId);

  if (updateErr) return json(500, { error: updateErr.message });

  await audit(sb, {
    action: 'dispute_opened',
    target_id: planId,
    target_type: 'care_plan',
    performed_by: user.id,
    reason: dispute_reason,
    metadata: {
      dispute_description,
      provider_id: plan.provider_id,
      escrow_amount: plan.escrow_amount,
      previous_status: 'held',
      new_status: 'disputed',
    },
  });

  // Record in disputes table for admin review
  await sb.from('disputes').insert({
    filed_by: user.id,
    filed_by_role: 'member',
    reason: dispute_reason,
    description: dispute_description,
    status: 'open',
  }).catch(() => {});

  // Notify admin via notifications (admin monitors this type)
  await sb.from('notifications').insert({
    type: 'care_plan_disputed',
    title: 'Care plan disputed',
    message: `Member raised a dispute: ${dispute_reason}`,
    metadata: { care_plan_id: planId, member_id: user.id, provider_id: plan.provider_id, reason: dispute_reason },
  }).catch(() => {});

  return json(200, { success: true });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  const sb = supabase();
  const auth = await getUser(event, sb);
  if (auth.error) return auth.error;

  const route = stripRoute(event.path);
  const segments = route.split('/');
  const first = segments[0];  // '' or planId
  const sub = segments[1];    // 'accept-bid', 'complete', 'dispute'

  if (event.httpMethod === 'GET' && first === 'mine') return handleMine(sb, auth.user);
  if (event.httpMethod === 'GET' && first && !sub) return handleGetOne(sb, auth.user, first);
  if (event.httpMethod === 'POST' && first && sub === 'accept-bid') return handleAcceptBid(event, sb, auth.user, first);
  if (event.httpMethod === 'POST' && first && sub === 'complete') return handleComplete(event, sb, auth.user, first);
  if (event.httpMethod === 'POST' && first && sub === 'dispute') return handleDispute(event, sb, auth.user, first);

  return json(405, { error: 'Method not allowed' });
};

// ============================================================================
// stripe-webhook — handles real-time Stripe events
//
// Events handled:
//   checkout.session.completed  — grant bid credits immediately; record founder commission
//   payment_intent.succeeded    — update tip/subsidy status
//   payment_intent.payment_failed — update tip/subsidy status; alert admin
//   payout.paid                 — mark driver_cashouts row completed
//   payout.failed               — mark driver_cashouts row failed; alert admin
//   payout.canceled             — mark driver_cashouts row cancelled
//   transfer.paid               — mark driver_cashouts + tip row paid
//   transfer.failed             — mark driver_cashouts row failed; alert admin
//   account.updated             — sync driver Stripe Connect status
//
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL,
//      SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, ADMIN_EMAIL, MCC_FROM_EMAIL
// ============================================================================
'use strict';

const { createClient } = require('@supabase/supabase-js');
const { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return require('stripe')(key, { apiVersion: STRIPE_API_VERSION });
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function adminEmail(subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  const to     = process.env.ADMIN_EMAIL || process.env.MCC_FROM_EMAIL;
  const from   = process.env.MCC_FROM_EMAIL || 'no-reply@mycarconcierge.com';
  if (!apiKey || !to) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  }).catch(e => console.error('[stripe-webhook] admin email error:', e.message));
}

// ── checkout.session.completed ─────────────────────────────────────────────

async function handleCheckoutComplete(session, supabase) {
  const meta      = session.metadata || {};
  const totalBids = parseInt(meta.bids || '0', 10) + parseInt(meta.bonus_bids || '0', 10);

  // Only bid-pack purchases carry provider_id + bids in metadata
  if (!meta.provider_id || !(totalBids > 0)) return;
  if (meta.type && meta.type !== 'bid_pack')  return;
  if (session.payment_status !== 'paid')       return;

  // Idempotency: skip if already recorded
  const { data: existing } = await supabase.from('bid_credit_purchases')
    .select('id').eq('stripe_session_id', session.id).limit(1).maybeSingle();
  if (existing) {
    console.log('[stripe-webhook] bid credits already granted for session', session.id);
    return;
  }

  // Record purchase
  const { error: insErr } = await supabase.from('bid_credit_purchases').insert({
    provider_id:      meta.provider_id,
    pack_id:          meta.pack_id || null,
    bids_purchased:   totalBids,
    amount_paid:      (session.amount_total || 0) / 100,
    stripe_session_id: session.id,
    stripe_payment_id: session.payment_intent || null,
    status:           'completed',
    created_at:       new Date().toISOString(),
  });

  if (insErr) {
    if (insErr.code === '23505') return; // race — already inserted
    console.error('[stripe-webhook] bid_credit_purchases insert failed:', insErr.message);
    return;
  }

  // Increment bid_credits balance
  const { data: p } = await supabase.from('profiles')
    .select('bid_credits').eq('id', meta.provider_id).maybeSingle();
  await supabase.from('profiles')
    .update({ bid_credits: (p?.bid_credits || 0) + totalBids })
    .eq('id', meta.provider_id);

  console.log(`[stripe-webhook] granted ${totalBids} bid credits to provider ${meta.provider_id}`);

  // Founder commission for bid pack (best-effort)
  await _recordBidPackFounderCommission(session, meta, supabase);
}

async function _recordBidPackFounderCommission(session, meta, supabase) {
  try {
    const { data: profile } = await supabase.from('profiles')
      .select('referred_by_founder_id').eq('id', meta.provider_id).maybeSingle();
    if (!profile?.referred_by_founder_id) return;

    const { data: founder } = await supabase.from('member_founder_profiles')
      .select('id, commission_rate, total_commissions_earned, pending_balance, status')
      .eq('user_id', profile.referred_by_founder_id).maybeSingle();
    if (!founder || founder.status !== 'active') return;

    // Idempotency
    const { data: dup } = await supabase.from('founder_commissions')
      .select('id').eq('source_transaction_id', session.payment_intent).limit(1).maybeSingle();
    if (dup) return;

    const purchaseAmount  = (session.amount_total || 0) / 100;
    const commissionRate  = parseFloat(founder.commission_rate || 0.50);
    const commissionAmt   = parseFloat((purchaseAmount * commissionRate).toFixed(2));
    if (commissionAmt <= 0) return;

    const { data: inserted, error: commErr } = await supabase.from('founder_commissions').insert({
      founder_id:            founder.id,
      referred_provider_id:  meta.provider_id,
      commission_type:       'bid_pack',
      source_transaction_id: session.payment_intent,
      original_amount:       purchaseAmount,
      commission_rate:       commissionRate,
      commission_amount:     commissionAmt,
      purchase_amount:       purchaseAmount,
      description:           `Bid pack commission (${(commissionRate * 100).toFixed(0)}%) — webhook`,
      status:                'pending',
      created_at:            new Date().toISOString(),
      updated_at:            new Date().toISOString(),
    }).select('id').single();

    if (commErr) {
      if (commErr.code !== '23505') console.error('[stripe-webhook] founder_commissions insert failed:', commErr.message);
      return;
    }

    await supabase.from('member_founder_profiles').update({
      total_commissions_earned: parseFloat(founder.total_commissions_earned || 0) + commissionAmt,
      pending_balance:          parseFloat(founder.pending_balance || 0) + commissionAmt,
      updated_at:               new Date().toISOString(),
    }).eq('id', founder.id);

    console.log(`[stripe-webhook] founder commission $${commissionAmt} recorded for founder ${founder.id}`);
  } catch (e) {
    console.warn('[stripe-webhook] founder commission error (non-fatal):', e.message);
  }
}

// ── payment_intent.succeeded ───────────────────────────────────────────────

async function handlePaymentIntentSucceeded(pi, supabase) {
  const meta = pi.metadata || {};
  if (meta.type === 'tip' && meta.ride_id && meta.driver_id) {
    // transport-request.js sets 'charged' synchronously after PI creation,
    // so by the time this webhook fires the status is 'charged', not 'pending'.
    await supabase.from('driver_tips')
      .update({ status: 'paid' })
      .eq('ride_id', meta.ride_id)
      .eq('driver_id', meta.driver_id)
      .eq('status', 'charged');
  }
  if (meta.type === 'provider_subsidy' && meta.ride_id) {
    await supabase.from('rides')
      .update({ provider_subsidy_status: 'charged' })
      .eq('id', meta.ride_id);
  }
}

// ── payment_intent.payment_failed ─────────────────────────────────────────

async function handlePaymentIntentFailed(pi, supabase) {
  const meta = pi.metadata || {};
  const reason = pi.last_payment_error?.message || 'Payment declined';

  if (meta.type === 'tip' && meta.ride_id && meta.driver_id) {
    await supabase.from('driver_tips')
      .update({ status: 'failed' })
      .eq('ride_id', meta.ride_id)
      .eq('driver_id', meta.driver_id)
      .eq('status', 'pending');
  }
  if (meta.type === 'provider_subsidy' && meta.ride_id) {
    await supabase.from('rides')
      .update({ provider_subsidy_status: 'failed' })
      .eq('id', meta.ride_id);
  }

  await adminEmail(
    `[MCC] Payment failed: ${pi.id}`,
    `<h2>Payment Intent Failed</h2>
     <p><strong>PI:</strong> ${pi.id}</p>
     <p><strong>Amount:</strong> $${((pi.amount || 0) / 100).toFixed(2)}</p>
     <p><strong>Type:</strong> ${meta.type || 'unknown'}</p>
     <p><strong>Error:</strong> ${reason}</p>
     <pre>${JSON.stringify(meta, null, 2)}</pre>`
  );
}

// ── transfer.paid ──────────────────────────────────────────────────────────

async function handleTransferPaid(transfer, supabase) {
  const now = new Date().toISOString();
  await supabase.from('driver_cashouts')
    .update({ status: 'paid', completed_at: now })
    .eq('stripe_transfer_id', transfer.id)
    .in('status', ['processing']);
  // Also mark tip paid if this transfer corresponds to a tip
  await supabase.from('driver_tips')
    .update({ status: 'paid', stripe_transfer_id: transfer.id })
    .eq('stripe_transfer_id', transfer.id);
}

// ── transfer.failed ────────────────────────────────────────────────────────

async function handleTransferFailed(transfer, supabase) {
  const reason = transfer.failure_message || 'Transfer failed';
  await supabase.from('driver_cashouts')
    .update({ status: 'failed', error: reason })
    .eq('stripe_transfer_id', transfer.id);

  await adminEmail(
    `[MCC] Transfer failed: ${transfer.id}`,
    `<h2>Stripe Transfer Failed</h2>
     <p><strong>Transfer:</strong> ${transfer.id}</p>
     <p><strong>Amount:</strong> $${((transfer.amount || 0) / 100).toFixed(2)}</p>
     <p><strong>Reason:</strong> ${reason}</p>`
  );
}

// ── payout.paid ────────────────────────────────────────────────────────────

async function handlePayoutPaid(payout, supabase) {
  const now = new Date().toISOString();
  await supabase.from('driver_cashouts')
    .update({ status: 'completed', completed_at: now })
    .eq('stripe_payout_id', payout.id)
    .in('status', ['processing', 'pending']);
}

// ── payout.failed ──────────────────────────────────────────────────────────

async function handlePayoutFailed(payout, supabase) {
  const reason = payout.failure_message || payout.failure_code || 'Payout failed';
  await supabase.from('driver_cashouts')
    .update({ status: 'failed', error: reason })
    .eq('stripe_payout_id', payout.id);

  await adminEmail(
    `[MCC] Payout failed: ${payout.id}`,
    `<h2>Stripe Payout Failed</h2>
     <p><strong>Payout:</strong> ${payout.id}</p>
     <p><strong>Amount:</strong> $${((payout.amount || 0) / 100).toFixed(2)}</p>
     <p><strong>Reason:</strong> ${reason}</p>`
  );
}

// ── payout.canceled ────────────────────────────────────────────────────────

async function handlePayoutCanceled(payout, supabase) {
  await supabase.from('driver_cashouts')
    .update({ status: 'cancelled' })
    .eq('stripe_payout_id', payout.id);
}

// ── account.updated ────────────────────────────────────────────────────────

async function handleAccountUpdated(account, supabase) {
  const payoutsEnabled = account.payouts_enabled === true;

  // Update drivers table
  await supabase.from('drivers')
    .update({ stripe_payouts_enabled: payoutsEnabled, updated_at: new Date().toISOString() })
    .eq('stripe_connect_account_id', account.id);

  // Update member_founder_profiles if this is a founder's Connect account
  await supabase.from('member_founder_profiles')
    .update({ updated_at: new Date().toISOString() })
    .eq('stripe_connect_account_id', account.id);

  console.log(`[stripe-webhook] account.updated ${account.id}: payouts_enabled=${payoutsEnabled}`);
}

// ── Handler ────────────────────────────────────────────────────────────────

exports.handler = async function(event) {
  const stripe = getStripe();
  if (!stripe) {
    console.error('[stripe-webhook] STRIPE_SECRET_KEY not set');
    return { statusCode: 500, body: 'Stripe not configured' };
  }

  const sig           = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set');
    return { statusCode: 500, body: 'Webhook secret not configured' };
  }

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // Return 200 to Stripe immediately; process synchronously within the same invocation.
  // Netlify functions can return before async work if we fire-and-forget, but doing it
  // synchronously here keeps the error log clean and doesn't risk Stripe retrying valid events.
  const supabase = getSupabase();
  if (!supabase) {
    console.error('[stripe-webhook] Supabase not configured');
    return { statusCode: 200, body: JSON.stringify({ received: true, warning: 'database not configured' }) };
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(stripeEvent.data.object, supabase);
        break;
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(stripeEvent.data.object, supabase);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(stripeEvent.data.object, supabase);
        break;
      case 'payout.paid':
        await handlePayoutPaid(stripeEvent.data.object, supabase);
        break;
      case 'payout.failed':
        await handlePayoutFailed(stripeEvent.data.object, supabase);
        break;
      case 'payout.canceled':
        await handlePayoutCanceled(stripeEvent.data.object, supabase);
        break;
      case 'transfer.paid':
        await handleTransferPaid(stripeEvent.data.object, supabase);
        break;
      case 'transfer.failed':
        await handleTransferFailed(stripeEvent.data.object, supabase);
        break;
      case 'account.updated':
        await handleAccountUpdated(stripeEvent.data.object, supabase);
        break;
      default:
        // Ignore other event types — Stripe sends many; only handle what we act on
        break;
    }
  } catch (err) {
    // Always return 200 — a non-200 causes Stripe to retry, which would double-grant credits
    console.error(`[stripe-webhook] error handling ${stripeEvent.type}:`, err.message);
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

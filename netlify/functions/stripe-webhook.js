// ============================================================================
// stripe-webhook — handles real-time Stripe events
//
// Events handled:
//   checkout.session.completed                     — grant bid credits; record founder commission
//   charge.refunded                                — void/claw back founder commission on refund
//   charge.dispute.created                         — void/claw back founder commission on dispute
//   payment_intent.succeeded                       — update tip/subsidy status
//   payment_intent.payment_failed                  — update tip/subsidy status; alert admin
//   payout.paid                                    — mark driver_cashouts row completed
//   payout.failed                                  — mark driver_cashouts row failed; alert admin
//   payout.canceled                                — mark driver_cashouts row cancelled
//   transfer.paid                                  — mark driver_cashouts + tip row paid
//   transfer.failed                                — mark driver_cashouts row failed; alert admin
//   account.updated                                — sync driver Stripe Connect status
//   identity.verification_session.verified         — set identity_verified=true on profile
//   identity.verification_session.requires_input   — log/update session id
//
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL,
//      SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, ADMIN_EMAIL, MCC_FROM_EMAIL
// ============================================================================
'use strict';

const { createClient } = require('@supabase/supabase-js');
const { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');
const { audit: sharedAudit } = require('./_shared/audit');

// Money-path audit wrapper: always log + alert on failure. A failed audit
// must NEVER throw into the webhook handler — Stripe would retry on a
// non-200 and double-process. performed_by is always 'stripe_webhook'
// for these events (no user actor).
const audit = (supabase, row) =>
  sharedAudit(supabase, row, {
    alertOnFailure: true,
    logOnFailure: true,
    logPrefix: '[stripe-webhook]',
  });

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
  const prevBidCredits = p?.bid_credits || 0;
  await supabase.from('profiles')
    .update({ bid_credits: prevBidCredits + totalBids })
    .eq('id', meta.provider_id);

  console.log(`[stripe-webhook] granted ${totalBids} bid credits to provider ${meta.provider_id}`);

  await audit(supabase, {
    action: 'bid_credits_granted',
    target_id: meta.provider_id,
    target_type: 'profile',
    performed_by: 'stripe_webhook',
    metadata: {
      stripe_session_id: session.id,
      stripe_payment_intent: session.payment_intent || null,
      pack_id: meta.pack_id || null,
      bids_purchased: parseInt(meta.bids || '0', 10),
      bonus_bids: parseInt(meta.bonus_bids || '0', 10),
      total_bids: totalBids,
      amount_paid_cents: session.amount_total || 0,
      previous_bid_credits: prevBidCredits,
      new_bid_credits: prevBidCredits + totalBids,
    },
  });

  // Founder commission for bid pack (best-effort, routed through service-role RPC)
  await _recordBidPackFounderCommission(session, meta, supabase);
}

async function _recordBidPackFounderCommission(session, meta, supabase) {
  // Single writer: delegate entirely to the record_bid_pack_commission RPC which is
  // SECURITY DEFINER, service_role-only, and idempotent on transaction_id. The RPC
  // also updates member_founder_profiles.pending_balance atomically.
  try {
    const purchaseAmount = (session.amount_total || 0) / 100;
    if (!session.payment_intent || purchaseAmount <= 0) return;

    const { data: commissionId, error } = await supabase.rpc('record_bid_pack_commission', {
      p_provider_id:     meta.provider_id,
      p_purchase_amount: purchaseAmount,
      p_transaction_id:  session.payment_intent,
    });

    if (error) {
      console.warn('[stripe-webhook] record_bid_pack_commission RPC error (non-fatal):', error.message);
      return;
    }

    if (commissionId) {
      console.log(`[stripe-webhook] founder commission recorded via RPC — id ${commissionId}`);
      await audit(supabase, {
        action: 'founder_commission_recorded',
        target_id: commissionId,
        target_type: 'founder_commission',
        performed_by: 'stripe_webhook',
        metadata: {
          provider_id: meta.provider_id,
          stripe_session_id: session.id,
          stripe_payment_intent: session.payment_intent,
          purchase_amount: purchaseAmount,
        },
      });
    }
    // NULL return = no referrer, inactive founder, or idempotent duplicate — all fine
  } catch (e) {
    console.warn('[stripe-webhook] founder commission error (non-fatal):', e.message);
  }
}

// ── charge.refunded / charge.dispute.created — clawback ───────────────────
//
// Shared handler for both events. For commissions still in pending/payable:
//   void the row and decrement pending_balance so the next payout doesn't
//   include it. For already-paid commissions: insert a negative adjustment
//   row (status=payable) that nets against the founder's next payout.
//
// Idempotent: repeated deliveries of the same event are harmless.
// Non-fatal: any error is logged but the function still returns 200 to Stripe.

async function _handleFounderCommissionClawback(paymentIntentId, reason, supabase) {
  if (!paymentIntentId) return;
  try {
    // Look up the commission. Rows may have been written with source_transaction_id
    // (pre-RPC-consolidation webhook) or transaction_id (RPC path). Check both;
    // the RPC now writes both columns to the same value so this query covers either era.
    const { data: commission } = await supabase
      .from('founder_commissions')
      .select('id, founder_id, commission_amount, status')
      .or(`source_transaction_id.eq.${paymentIntentId},transaction_id.eq.${paymentIntentId}`)
      .not('commission_type', 'eq', 'clawback_adjustment')
      .limit(1)
      .maybeSingle();

    if (!commission) return; // no commission for this charge — nothing to do

    const now = new Date().toISOString();

    if (commission.status === 'voided') {
      // Already voided — idempotent
      return;
    }

    if (commission.status === 'pending' || commission.status === 'payable') {
      // Void before payout — just cancel the row and remove from pending balance
      await supabase.from('founder_commissions')
        .update({ status: 'voided', voided_at: now, updated_at: now })
        .eq('id', commission.id);

      const snap = await supabase.from('member_founder_profiles')
        .select('pending_balance')
        .eq('id', commission.founder_id)
        .single();
      const prevBal = parseFloat((snap.data && snap.data.pending_balance) || 0);

      await supabase.from('member_founder_profiles').update({
        pending_balance: Math.max(0, parseFloat((prevBal - parseFloat(commission.commission_amount)).toFixed(2))),
        updated_at:      now,
      }).eq('id', commission.founder_id);

      console.log(`[stripe-webhook] founder commission ${commission.id} voided — ${reason}`);
      await audit(supabase, {
        action: 'founder_commission_clawback',
        target_id: commission.id,
        target_type: 'founder_commission',
        performed_by: 'stripe_webhook',
        reason,
        metadata: {
          founder_id: commission.founder_id,
          stripe_payment_intent: paymentIntentId,
          clawback_branch: 'void_unpaid',
          commission_amount: parseFloat(commission.commission_amount),
          previous_status: commission.status,
          new_status: 'voided',
          previous_pending_balance: prevBal,
          new_pending_balance: Math.max(0, parseFloat((prevBal - parseFloat(commission.commission_amount)).toFixed(2))),
        },
      });
      return;
    }

    if (commission.status === 'paid') {
      // Already paid out — carry the debit as a negative adjustment row.
      // Idempotency key: clawback_ prefix on the transaction id.
      const clawbackKey = 'clawback_' + paymentIntentId;

      const { error: adjErr } = await supabase.from('founder_commissions').insert({
        founder_id:            commission.founder_id,
        commission_type:       'clawback_adjustment',
        source_transaction_id: clawbackKey,
        transaction_id:        clawbackKey,
        commission_amount:     -Math.abs(parseFloat(commission.commission_amount)),
        original_amount:       0,
        purchase_amount:       0,
        commission_rate:       0,
        description:           `Clawback adjustment — ${reason} on ${paymentIntentId}`,
        status:                'payable',
        became_payable_at:     now,
        created_at:            now,
        updated_at:            now,
      });

      if (adjErr) {
        if (adjErr.code === '23505') return; // already inserted — idempotent
        console.warn('[stripe-webhook] clawback adjustment insert error (non-fatal):', adjErr.message);
        return;
      }

      // Decrement pending_balance by the adjustment so the next payout nets correctly
      const snap2 = await supabase.from('member_founder_profiles')
        .select('pending_balance')
        .eq('id', commission.founder_id)
        .single();
      const prevBal2 = parseFloat((snap2.data && snap2.data.pending_balance) || 0);
      const debit    = Math.abs(parseFloat(commission.commission_amount));

      await supabase.from('member_founder_profiles').update({
        pending_balance: Math.max(0, parseFloat((prevBal2 - debit).toFixed(2))),
        updated_at:      now,
      }).eq('id', commission.founder_id);

      console.log(`[stripe-webhook] clawback adjustment inserted for paid commission ${commission.id} — ${reason}`);
      await audit(supabase, {
        action: 'founder_commission_clawback',
        target_id: commission.id,
        target_type: 'founder_commission',
        performed_by: 'stripe_webhook',
        reason,
        metadata: {
          founder_id: commission.founder_id,
          stripe_payment_intent: paymentIntentId,
          clawback_branch: 'adjustment_paid',
          clawback_key: clawbackKey,
          original_commission_amount: parseFloat(commission.commission_amount),
          adjustment_amount: -Math.abs(parseFloat(commission.commission_amount)),
          previous_pending_balance: prevBal2,
          new_pending_balance: Math.max(0, parseFloat((prevBal2 - debit).toFixed(2))),
        },
      });
    }
  } catch (e) {
    console.warn('[stripe-webhook] commission clawback error (non-fatal):', e.message);
  }
}

async function handleChargeRefunded(charge, supabase) {
  await _handleFounderCommissionClawback(charge.payment_intent, 'refund', supabase);
}

async function handleChargeDisputeCreated(dispute, supabase) {
  // dispute.payment_intent is present in Stripe API 2024-04-10+
  await _handleFounderCommissionClawback(dispute.payment_intent, 'dispute', supabase);
}

// ── payment_intent.succeeded ───────────────────────────────────────────────

async function handlePaymentIntentSucceeded(pi, supabase) {
  const meta = pi.metadata || {};

  // Wallet top-up: credit cash to wallet and return immediately
  if (meta.type === 'wallet_load' && meta.wallet_owner_id && meta.wallet_owner_type) {
    const { error: wErr } = await supabase.rpc('wallet_load', {
      p_owner_id:              meta.wallet_owner_id,
      p_owner_type:            meta.wallet_owner_type,
      p_cash_cents:            pi.amount,
      p_stripe_payment_intent: pi.id,
      p_description:           'Wallet top-up via card',
    });
    if (wErr) console.error('[stripe-webhook] wallet_load RPC error:', wErr.message);
    // TODO: audit when FEATURE_WALLET ships
    return;
  }

  if (meta.type === 'tip' && meta.ride_id && meta.driver_id) {
    // transport-request.js sets 'charged' synchronously after PI creation,
    // so by the time this webhook fires the status is 'charged', not 'pending'.
    await supabase.from('driver_tips')
      .update({ status: 'paid' })
      .eq('ride_id', meta.ride_id)
      .eq('driver_id', meta.driver_id)
      .eq('status', 'charged');
    await audit(supabase, {
      action: 'payment_received',
      target_id: pi.id,
      target_type: 'stripe_payment_intent',
      performed_by: 'stripe_webhook',
      metadata: {
        flow: 'driver_tip',
        ride_id: meta.ride_id,
        driver_id: meta.driver_id,
        amount_cents: pi.amount,
        previous_status: 'charged',
        new_status: 'paid',
      },
    });
  }
  if (meta.type === 'provider_subsidy' && meta.ride_id) {
    await supabase.from('rides')
      .update({ provider_subsidy_status: 'charged' })
      .eq('id', meta.ride_id);
    await audit(supabase, {
      action: 'provider_subsidy_charged',
      target_id: meta.ride_id,
      target_type: 'ride',
      performed_by: 'stripe_webhook',
      metadata: {
        stripe_payment_intent: pi.id,
        amount_cents: pi.amount,
        new_status: 'charged',
      },
    });
  }

  // Grant pending referral credits on first care-plan payment
  if (meta.care_plan_id && meta.member_id) {
    await _grantPendingReferralCredits(meta.member_id, supabase);
  }

  // Accrue car-club points when member pays a car-club provider
  if (meta.care_plan_id && meta.member_id && meta.provider_id && pi.amount > 0) {
    await _accrueCarClubPoints(meta.member_id, meta.provider_id, pi.amount, pi.id, supabase);
  }
}

// Moves a pending referral row to credited and issues member_credits for both parties.
// Only fires on the first care-plan payment for a given referred user.
// Idempotent: referral rows already in status credited/voided are skipped.
async function _grantPendingReferralCredits(memberId, supabase) {
  try {
    // Find a pending referral where this member is the referred party
    const { data: ref } = await supabase
      .from('referrals')
      .select('id, referrer_id, referred_id, referrer_credit_amount, referred_credit_amount')
      .eq('referred_id', memberId)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle();

    if (!ref) return; // no pending referral — nothing to do

    const now = new Date().toISOString();

    // Mark credited first (idempotency anchor)
    const { error: updateErr } = await supabase.from('referrals')
      .update({ status: 'credited', credited_at: now })
      .eq('id', ref.id)
      .eq('status', 'pending'); // guard against race

    if (updateErr) {
      if (updateErr.code === '23505' || updateErr.message?.includes('0 rows')) return;
      console.warn('[stripe-webhook] referral credit update error (non-fatal):', updateErr.message);
      return;
    }

    // Grant credits to both parties
    await supabase.from('member_credits').insert([
      {
        member_id:   ref.referrer_id,
        amount:      ref.referrer_credit_amount || 1000,
        type:        'referral',
        description: 'Referral credit — a friend completed their first service',
        referral_id: ref.id,
      },
      {
        member_id:   ref.referred_id,
        amount:      ref.referred_credit_amount || 1000,
        type:        'referral',
        description: 'Welcome credit — first service completed with referral code',
        referral_id: ref.id,
      },
    ]);

    console.log(`[stripe-webhook] referral credits granted — referral ${ref.id} member ${memberId}`);
    // NOTE: spec called this "donation_credited" but the code path is the
    // referral-credit grant (no donation flow exists here). Using the
    // accurate action name; flagged in report for Jordan to confirm.
    await audit(supabase, {
      action: 'referral_credits_granted',
      target_id: ref.id,
      target_type: 'referral',
      performed_by: 'stripe_webhook',
      metadata: {
        referrer_id: ref.referrer_id,
        referred_id: ref.referred_id,
        referrer_credit_amount: ref.referrer_credit_amount || 1000,
        referred_credit_amount: ref.referred_credit_amount || 1000,
        triggering_member_id: memberId,
      },
    });
  } catch (e) {
    console.warn('[stripe-webhook] _grantPendingReferralCredits error (non-fatal):', e.message);
  }
}

// Accrue car-club loyalty points when a member pays a club provider.
// No-op when: provider has no club, member isn't a club member, or points are disabled.
async function _accrueCarClubPoints(memberId, providerId, amountCents, paymentIntentId, supabase) {
  try {
    const { data: club } = await supabase
      .from('car_clubs')
      .select('id, points_enabled, is_active')
      .eq('provider_id', providerId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (!club || !club.points_enabled) return;

    const { data: membership } = await supabase
      .from('club_memberships')
      .select('id')
      .eq('club_id', club.id)
      .eq('member_id', memberId)
      .eq('is_active', true)
      .maybeSingle();

    if (!membership) return;

    await supabase.rpc('accrue_points', {
      p_club_id:     club.id,
      p_member_id:   memberId,
      p_amount_cents: amountCents,
      p_source_ref:  paymentIntentId,
    });

    console.log(`[stripe-webhook] car-club points accrued — club ${club.id} member ${memberId} ${amountCents}¢`);
    // NOTE: spec called this "rewards_points_accrued" but the code path is
    // specifically car-club loyalty points. Using the accurate name;
    // flagged in report for Jordan to confirm.
    await audit(supabase, {
      action: 'car_club_points_accrued',
      target_id: club.id,
      target_type: 'car_club',
      performed_by: 'stripe_webhook',
      metadata: {
        member_id: memberId,
        provider_id: providerId,
        amount_cents: amountCents,
        stripe_payment_intent: paymentIntentId,
      },
    });
  } catch (e) {
    console.warn('[stripe-webhook] _accrueCarClubPoints error (non-fatal):', e.message);
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
    await audit(supabase, {
      action: 'payment_failed',
      target_id: pi.id,
      target_type: 'stripe_payment_intent',
      performed_by: 'stripe_webhook',
      reason,
      metadata: {
        flow: 'driver_tip',
        ride_id: meta.ride_id,
        driver_id: meta.driver_id,
        amount_cents: pi.amount,
        new_status: 'failed',
      },
    });
  }
  if (meta.type === 'provider_subsidy' && meta.ride_id) {
    await supabase.from('rides')
      .update({ provider_subsidy_status: 'failed' })
      .eq('id', meta.ride_id);
    await audit(supabase, {
      action: 'provider_subsidy_failed',
      target_id: meta.ride_id,
      target_type: 'ride',
      performed_by: 'stripe_webhook',
      reason,
      metadata: {
        stripe_payment_intent: pi.id,
        amount_cents: pi.amount,
        new_status: 'failed',
      },
    });
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
  await audit(supabase, {
    action: 'transfer_completed',
    target_id: transfer.id,
    target_type: 'stripe_transfer',
    performed_by: 'stripe_webhook',
    metadata: {
      amount_cents: transfer.amount,
      destination: transfer.destination || null,
      new_status: 'paid',
      completed_at: now,
    },
  });
}

// ── transfer.failed ────────────────────────────────────────────────────────

async function handleTransferFailed(transfer, supabase) {
  const reason = transfer.failure_message || 'Transfer failed';
  await supabase.from('driver_cashouts')
    .update({ status: 'failed', error: reason })
    .eq('stripe_transfer_id', transfer.id);

  await audit(supabase, {
    action: 'transfer_failed',
    target_id: transfer.id,
    target_type: 'stripe_transfer',
    performed_by: 'stripe_webhook',
    reason,
    metadata: {
      amount_cents: transfer.amount,
      destination: transfer.destination || null,
      new_status: 'failed',
    },
  });

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
  await audit(supabase, {
    action: 'payout_completed',
    target_id: payout.id,
    target_type: 'stripe_payout',
    performed_by: 'stripe_webhook',
    metadata: {
      amount_cents: payout.amount,
      arrival_date: payout.arrival_date || null,
      new_status: 'completed',
      completed_at: now,
    },
  });
}

// ── payout.failed ──────────────────────────────────────────────────────────

async function handlePayoutFailed(payout, supabase) {
  const reason = payout.failure_message || payout.failure_code || 'Payout failed';
  await supabase.from('driver_cashouts')
    .update({ status: 'failed', error: reason })
    .eq('stripe_payout_id', payout.id);

  await audit(supabase, {
    action: 'payout_failed',
    target_id: payout.id,
    target_type: 'stripe_payout',
    performed_by: 'stripe_webhook',
    reason,
    metadata: {
      amount_cents: payout.amount,
      failure_code: payout.failure_code || null,
      new_status: 'failed',
    },
  });

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
  await audit(supabase, {
    action: 'driver_cashout_cancelled',
    target_id: payout.id,
    target_type: 'driver_cashout',
    performed_by: 'stripe_webhook',
    metadata: {
      stripe_payout_id: payout.id,
      amount_cents: payout.amount,
      new_status: 'cancelled',
    },
  });
}

// ── identity.verification_session.verified ─────────────────────────────────

async function handleIdentityVerified(session, supabase) {
  const userId = session.metadata?.user_id;
  if (!userId) {
    console.warn('[stripe-webhook] identity session missing user_id metadata:', session.id);
    return;
  }

  await supabase.from('profiles').update({
    identity_verified:          true,
    stripe_identity_session_id: session.id,
    identity_verified_at:       new Date().toISOString(),
    updated_at:                 new Date().toISOString(),
  }).eq('id', userId);

  console.log(`[stripe-webhook] identity verified for user ${userId} via session ${session.id}`);
}

// ── identity.verification_session.requires_input ──────────────────────────

async function handleIdentityRequiresInput(session, supabase) {
  const userId = session.metadata?.user_id;
  const reason = session.last_error?.reason || 'unknown';
  console.warn(`[stripe-webhook] identity requires_input user=${userId} session=${session.id} reason=${reason}`);

  // Keep stripe_identity_session_id current so status endpoint can report the right state
  if (userId) {
    await supabase.from('profiles')
      .update({ stripe_identity_session_id: session.id, updated_at: new Date().toISOString() })
      .eq('id', userId);
  }
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

// ── Central idempotency gate ───────────────────────────────────────────────
//
// Inserts a row in public.webhook_events keyed on Stripe's stable event.id.
// On conflict, decides whether to skip (already-processed or in-flight) or
// reprocess (stale or failed). Returns { skip, reason }. The dispatcher uses
// skip=true to short-circuit BEFORE any handler runs and BEFORE any audit()
// call fires — so a replayed event produces zero side effects, including no
// duplicate audit rows on the handlers (driver tip, subsidy, transfer,
// payout, etc.) whose audit() calls sit after a no-op status update.
//
// FAIL-SAFE POSTURE: every gate query is wrapped. If a query throws (table
// missing on first deploy, transient DB error, etc.), the gate returns
// { skip: false, reason: 'gate_error' } and the handler runs anyway. The
// existing per-handler guards (status checks, unique-constraint catches,
// zero-row filters) remain in place as defense-in-depth. The opposite
// posture (fail-closed = skip handler on gate error) would silently drop a
// first-delivery event when the gate had a transient hiccup — strictly
// worse than today, since Stripe doesn't retry on 200.

const GATE_STALE_THRESHOLD_MIN = 15;

async function gateAcquireOrSkip(supabase, stripeEvent) {
  const summary = {
    id:       stripeEvent.id,
    type:     stripeEvent.type,
    livemode: stripeEvent.livemode === true,
    created:  stripeEvent.created || null,
  };

  try {
    // 1. Attempt to claim the event. If no row exists, this inserts one with
    //    status='processing' and we hold the gate. Plain .insert() (no
    //    .select().maybeSingle() chain) matches the proven 23505-handling
    //    pattern at stripe-webhook.js bid_credit_purchases — guarantees the
    //    unique violation surfaces as insErr.code='23505' rather than throwing.
    const { error: insErr } = await supabase
      .from('webhook_events')
      .insert({
        stripe_event_id:   stripeEvent.id,
        event_type:        stripeEvent.type,
        status:            'processing',
        raw_event_summary: summary,
      });

    if (!insErr) {
      return { skip: false, reason: 'fresh' };
    }

    if (insErr.code !== '23505') {
      // Real DB error (not a UNIQUE conflict) — fail OPEN, handler runs.
      console.error('[stripe-webhook] gate insert failed (fail-open):', insErr.message);
      return { skip: false, reason: 'gate_error' };
    }

    // 2. 23505 unique_violation — duplicate event. Read the existing row to decide.
    const { data: existing, error: selErr } = await supabase
      .from('webhook_events')
      .select('id, status, received_at, retry_count')
      .eq('stripe_event_id', stripeEvent.id)
      .maybeSingle();

    if (selErr || !existing) {
      // Gate select after conflict failed (e.g. table missing entirely).
      // Fail OPEN — let the handler run; per-handler guards are the safety net.
      console.error('[stripe-webhook] gate select failed (fail-open):', selErr?.message || 'no row after conflict');
      return { skip: false, reason: 'gate_error' };
    }

    if (existing.status === 'processed') {
      return { skip: true, reason: 'already_processed' };
    }

    const ageMin = (Date.now() - new Date(existing.received_at).getTime()) / 60000;

    if (existing.status === 'processing' && ageMin < GATE_STALE_THRESHOLD_MIN) {
      // Another delivery is in flight — let it finish.
      return { skip: true, reason: 'in_flight' };
    }

    // Stale 'processing' (older than 15 min — previous invocation abandoned)
    // OR 'failed' (manual Stripe Resend or our own retry). Reset and retry.
    const { error: updErr } = await supabase
      .from('webhook_events')
      .update({
        status:        'processing',
        received_at:   new Date().toISOString(),
        retry_count:   (existing.retry_count || 0) + 1,
        error_message: null,
      })
      .eq('id', existing.id);

    if (updErr) {
      console.error('[stripe-webhook] gate reprocess update failed (fail-open):', updErr.message);
      return { skip: false, reason: 'gate_error' };
    }

    return { skip: false, reason: existing.status === 'failed' ? 'retry_failed' : 'retry_stale' };
  } catch (e) {
    // Catch-all: any uncaught throw (network, driver crash, missing table on
    // first deploy) → fail OPEN. Per-handler guards still apply.
    console.error('[stripe-webhook] gate threw unexpectedly (fail-open):', e.message);
    return { skip: false, reason: 'gate_error' };
  }
}

async function gateMarkProcessed(supabase, stripeEventId) {
  try {
    await supabase
      .from('webhook_events')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('stripe_event_id', stripeEventId);
  } catch (e) {
    // The event ALREADY processed at this point; only the gate row's
    // bookkeeping is affected. A future replay of this event would re-run
    // the handler (per-handler guards prevent damage) until the row is
    // eventually marked processed by a subsequent attempt.
    console.error('[stripe-webhook] gate mark-processed failed:', e.message);
  }
}

async function gateMarkFailed(supabase, stripeEventId, errorMessage) {
  try {
    await supabase
      .from('webhook_events')
      .update({
        status:        'failed',
        error_message: String(errorMessage || '').slice(0, 1000),
      })
      .eq('stripe_event_id', stripeEventId);
  } catch (e) {
    console.error('[stripe-webhook] gate mark-failed update failed:', e.message);
  }
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

  // ── Idempotency gate — sits ABOVE the handler dispatch so a replayed
  //    event short-circuits without running any handler or firing any audit().
  const gate = await gateAcquireOrSkip(supabase, stripeEvent);
  if (gate.skip) {
    console.log(`[stripe-webhook] gate skip ${stripeEvent.id} (${gate.reason})`);
    return { statusCode: 200, body: JSON.stringify({ received: true, skipped: true, reason: gate.reason }) };
  }

  let handlerSucceeded = false;
  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(stripeEvent.data.object, supabase);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(stripeEvent.data.object, supabase);
        break;
      case 'charge.dispute.created':
        await handleChargeDisputeCreated(stripeEvent.data.object, supabase);
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
      case 'identity.verification_session.verified':
        await handleIdentityVerified(stripeEvent.data.object, supabase);
        break;
      case 'identity.verification_session.requires_input':
        await handleIdentityRequiresInput(stripeEvent.data.object, supabase);
        break;
      default:
        // Ignore other event types — Stripe sends many; only handle what we act on
        break;
    }
    handlerSucceeded = true;
  } catch (err) {
    // Always return 200 — a non-200 causes Stripe to retry, which would double-grant credits.
    // The gate row records the failure; admin is alerted; manual Stripe Resend remains the
    // human-controlled escape if the failure was transient.
    console.error(`[stripe-webhook] error handling ${stripeEvent.type}:`, err.message);
    await gateMarkFailed(supabase, stripeEvent.id, err.message);
    await adminEmail(
      `[MCC] Webhook handler error: ${stripeEvent.type}`,
      `<h2>Webhook handler threw</h2>
       <p><strong>Event:</strong> ${stripeEvent.id}</p>
       <p><strong>Type:</strong> ${stripeEvent.type}</p>
       <p><strong>Error:</strong> ${(err.message || '').replace(/</g, '&lt;')}</p>
       <p>Gate row marked status='failed'. Re-deliver from the Stripe Dashboard if the
       cause was transient — the gate will allow reprocessing of failed rows.</p>`
    );
  }

  if (handlerSucceeded) {
    await gateMarkProcessed(supabase, stripeEvent.id);
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

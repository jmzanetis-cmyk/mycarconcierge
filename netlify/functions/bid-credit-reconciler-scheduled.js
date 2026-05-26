// ============================================================================
// Task #394 — Bid Credit Reconciler (daily scheduled function)
//
// Safety net for the Stripe webhook bid-credit path. The webhook itself now
// returns 5xx + escalates to ai_action_log on DB failure (see
// lib/bid-credit-grants.js), but if Stripe ever exhausts its 3-day retry
// window without a successful credit grant the provider would still be left
// charged-without-credits. This function reconciles by:
//
//   1. Listing Stripe Checkout Sessions completed in the last 7 days with
//      metadata.bids set (i.e. bid-pack purchases).
//   2. Checking each session's payment_intent against bid_credit_grants.
//   3. For any session paid >= 1h ago without a matching grant row, log an
//      escalated ai_action_log row (module='bid_credit_grant_missing') and
//      email the admin via Resend.
//
// Cron: daily at 03:30 UTC (after payment-tracker at 03:00). See netlify.toml.
//
// Required env vars: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// RESEND_API_KEY, ADMIN_EMAIL (or MCC_FROM_EMAIL fallback).
// ============================================================================

'use strict';

const { createClient } = require('@supabase/supabase-js');
const { logAiAction } = require('./_shared/ai-ops');
const { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');

const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const GRACE_MS = 60 * 60 * 1000; // 1h grace so an in-flight webhook retry isn't flagged
const RECON_MODULE = 'bid_credit_grant_missing';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return require('stripe')(key, { apiVersion: STRIPE_API_VERSION });
}

async function alreadyAlerted(supabase, transactionId) {
  try {
    const { data } = await supabase.from('ai_action_log')
      .select('id').eq('module', RECON_MODULE).eq('target_id', String(transactionId))
      .limit(1).maybeSingle();
    return !!data;
  } catch { return false; }
}

async function sendAdminEmail(missing) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_EMAIL || process.env.MCC_FROM_EMAIL;
  const from = process.env.MCC_FROM_EMAIL || 'no-reply@mycarconcierge.com';
  if (!apiKey || !to || !missing.length) return { sent: false, reason: 'no_recipient_or_empty' };

  const rows = missing.map(m =>
    `<tr><td>${m.session_id}</td><td>${m.payment_intent || ''}</td><td>${m.provider_id || ''}</td><td>${m.total_bids}</td><td>$${(m.amount_total/100).toFixed(2)}</td><td>${new Date(m.completed_at * 1000).toISOString()}</td></tr>`
  ).join('');

  const html = `
    <h2>Bid credits paid for but not delivered</h2>
    <p>The Stripe webhook failed to grant bid credits for the following completed checkout sessions, and Stripe's automatic retry window did not recover them. Manual remediation required: insert a row into <code>bid_credit_grants</code> AND increment <code>profiles.bid_credits</code> by <code>total_bids</code> for each affected provider.</p>
    <table border="1" cellpadding="6" cellspacing="0">
      <thead><tr><th>Session</th><th>Payment Intent</th><th>Provider</th><th>Bids</th><th>Amount</th><th>Completed</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject: `[MCC] ${missing.length} bid-pack payment(s) missing credits`, html })
    });
    return { sent: res.ok, status: res.status };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

async function runReconcilerImpl({ supabase, stripe, now = Date.now() }) {
  const since = Math.floor((now - LOOKBACK_MS) / 1000);
  const cutoff = Math.floor((now - GRACE_MS) / 1000);

  const missing = [];
  let scanned = 0;

  // Paginate Stripe checkout sessions
  let startingAfter = undefined;
  for (let page = 0; page < 20; page++) {
    const params = { limit: 100, created: { gte: since } };
    if (startingAfter) params.starting_after = startingAfter;
    const list = await stripe.checkout.sessions.list(params);
    for (const s of list.data) {
      const meta = s.metadata || {};
      // Only bid-pack checkouts (have metadata.bids set, no special `type`)
      const totalBids = parseInt(meta.bids || '0', 10) + parseInt(meta.bonus_bids || '0', 10);
      if (!meta.provider_id || !(totalBids > 0)) continue;
      if (meta.type && meta.type !== 'bid_pack') continue;
      if (s.payment_status !== 'paid') continue;
      if (!s.payment_intent) continue;
      if ((s.created || 0) > cutoff) continue; // still within grace window

      scanned++;
      const { data: row } = await supabase.from('bid_credit_grants')
        .select('id').eq('transaction_id', s.payment_intent).limit(1).maybeSingle();
      if (row) continue;

      if (await alreadyAlerted(supabase, s.payment_intent)) continue;

      missing.push({
        session_id: s.id,
        payment_intent: s.payment_intent,
        provider_id: meta.provider_id,
        pack_id: meta.pack_id || null,
        total_bids: totalBids,
        amount_total: s.amount_total || 0,
        completed_at: s.created || 0,
      });
    }
    if (!list.has_more) break;
    startingAfter = list.data[list.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  for (const m of missing) {
    await logAiAction(supabase, {
      module: RECON_MODULE,
      actionType: 'paid_no_grant',
      targetId: m.payment_intent,
      decision: m,
      confidence: 1.0,
      autoExecuted: false,
      escalated: true,
      outcome: 'flagged',
      executionTimeMs: 0,
    });
  }

  const emailResult = missing.length > 0 ? await sendAdminEmail(missing) : { sent: false, reason: 'no_missing' };

  return {
    success: true,
    scanned,
    missing_count: missing.length,
    missing,
    email: emailResult,
  };
}

// ---------------------------------------------------------------------------
// Bid-pack founder commission recording
// Runs after the main reconciler. For every confirmed bid-pack purchase
// (payment_status=paid + bid_credit_grants row exists), checks whether the
// purchasing provider was referred by a founding member. If so, inserts a
// pending founder_commissions row + commission_reconciliation_queue entry.
// Idempotent: skips sessions that already have a founder_commissions row.
// ---------------------------------------------------------------------------
async function recordBidPackCommissions({ supabase, stripe, now = Date.now() }) {
  const since   = Math.floor((now - LOOKBACK_MS) / 1000);
  const cutoff  = Math.floor((now - GRACE_MS)    / 1000);
  let recorded  = 0;
  let skipped   = 0;

  let startingAfter;
  for (let page = 0; page < 20; page++) {
    const params = { limit: 100, created: { gte: since } };
    if (startingAfter) params.starting_after = startingAfter;
    const list = await stripe.checkout.sessions.list(params);

    for (const s of list.data) {
      const meta      = s.metadata || {};
      const totalBids = parseInt(meta.bids || '0', 10) + parseInt(meta.bonus_bids || '0', 10);
      if (!meta.provider_id || !(totalBids > 0)) continue;
      if (meta.type && meta.type !== 'bid_pack')  continue;
      if (s.payment_status !== 'paid')             continue;
      if (!s.payment_intent)                       continue;
      if ((s.created || 0) > cutoff)               continue;

      // Only process confirmed grants (not missing ones — those are the reconciler's job)
      const { data: grant } = await supabase.from('bid_credit_grants')
        .select('id').eq('transaction_id', s.payment_intent).limit(1).maybeSingle();
      if (!grant) continue;

      // Idempotency: skip if commission row already exists for this transaction
      const { data: existingComm } = await supabase.from('founder_commissions')
        .select('id').eq('source_transaction_id', s.payment_intent).limit(1).maybeSingle();
      if (existingComm) { skipped++; continue; }

      // Look up whether this provider was referred by a founding member
      const { data: profile } = await supabase.from('profiles')
        .select('referred_by_founder_id').eq('id', meta.provider_id).maybeSingle();
      if (!profile?.referred_by_founder_id) continue;

      const { data: founder } = await supabase.from('member_founder_profiles')
        .select('id, commission_rate, total_commissions_earned, pending_balance, status')
        .eq('user_id', profile.referred_by_founder_id)
        .maybeSingle();
      if (!founder || founder.status !== 'active') continue;

      const purchaseAmount  = (s.amount_total || 0) / 100;
      const commissionRate  = parseFloat(founder.commission_rate || 0.50);
      const commissionAmt   = parseFloat((purchaseAmount * commissionRate).toFixed(2));
      if (commissionAmt <= 0) continue;

      const { data: inserted, error: insErr } = await supabase
        .from('founder_commissions')
        .insert({
          founder_id:            founder.id,
          referred_provider_id:  meta.provider_id,
          commission_type:       'bid_pack',
          source_transaction_id: s.payment_intent,
          original_amount:       purchaseAmount,
          commission_rate:       commissionRate,
          commission_amount:     commissionAmt,
          purchase_amount:       purchaseAmount,
          description:           `Bid pack purchase commission (${(commissionRate * 100).toFixed(0)}%)`,
          status:                'pending',
          created_at:            new Date().toISOString(),
          updated_at:            new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insErr) {
        if (insErr.code === '23505') { skipped++; continue; } // race — already inserted
        console.error('[BidCreditReconciler] commission insert error:', insErr.message);
        continue;
      }

      // Enqueue for admin payout review
      await supabase.from('commission_reconciliation_queue').insert({
        commission_id: inserted.id,
        founder_id:    founder.id,
        amount:        commissionAmt,
        status:        'pending',
        created_at:    new Date().toISOString(),
      }).catch(e => console.warn('[BidCreditReconciler] recon queue insert skipped:', e.message));

      // Update running totals on the founder profile
      await supabase.from('member_founder_profiles').update({
        total_commissions_earned: parseFloat((founder.total_commissions_earned || 0)) + commissionAmt,
        pending_balance:          parseFloat((founder.pending_balance || 0)) + commissionAmt,
        updated_at:               new Date().toISOString(),
      }).eq('id', founder.id);

      recorded++;
    }

    if (!list.has_more) break;
    startingAfter = list.data[list.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  return { recorded, skipped };
}

exports.runReconcilerImpl = runReconcilerImpl;
exports.recordBidPackCommissions = recordBidPackCommissions;

exports.handler = async function() {
  const supabase = getSupabase();
  if (!supabase) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no_database' }) };
  }
  const stripe = getStripe();
  if (!stripe) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no_stripe_key' }) };
  }
  try {
    const result      = await runReconcilerImpl({ supabase, stripe });
    const commResult  = await recordBidPackCommissions({ supabase, stripe }).catch(e => ({ recorded: 0, skipped: 0, error: e.message }));
    console.log('[BidCreditReconciler] Done:', JSON.stringify({ scanned: result.scanned, missing: result.missing_count, commissions: commResult }));
    return { statusCode: 200, body: JSON.stringify({ ...result, commissions: commResult }) };
  } catch (err) {
    console.error('[BidCreditReconciler] Error:', err.message);
    await logAiAction(supabase, {
      module: RECON_MODULE, actionType: 'scan_error', targetId: 'cron',
      decision: { error: err.message }, confidence: 0,
      autoExecuted: false, escalated: true, outcome: 'failed',
      errorDetails: err.message, executionTimeMs: 0
    });
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

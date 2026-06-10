// netlify/functions/founder-payout-monthly-scheduled.js
//
// Runs on the 1st of each month at 14:00 UTC (9am ET).
//
// Three-phase execution:
//   Phase 1 — Maturation sweep: promote founder_commissions rows that have
//             been in 'pending' status for >= 7 days to 'payable'. This is
//             the holding window that lets refund/dispute webhook events void
//             a commission before it becomes payable.
//
//   Phase 2 — Payout: for each active founder with payable commissions, sum
//             the payable amount and initiate payout (Stripe Connect auto,
//             PayPal manual). Only 'payable' rows are included — pending rows
//             (still inside the 7-day window) are carried to next month.
//
//   Phase 3 — Mark paid: after a successful payout row is created, mark the
//             contributing commission rows as 'paid' and update the founder's
//             running totals.
//
// Chris Agrapidis NOTE: payout_email is currently NULL on his profile, which
// means he will appear in the admin email under "Blocked — No Payout Email"
// until his PayPal address is set via the admin portal.
//
// "Within 15 business days" per contract: this cron fires on the 1st, giving
// the admin until ~the 21st calendar day (≈15 business days) to process any
// manual payouts surfaced in the email.

'use strict';

var utils = require('./utils');

var MATURATION_DAYS = 7;

exports.handler = async function(event) {
  var supabase = utils.createSupabaseClient();
  if (!supabase) {
    console.error('[founder-payout-monthly] Supabase not configured');
    return { statusCode: 500 };
  }

  var now = new Date();

  // payout_period = previous calendar month (we are paying out last month's earnings)
  var prevYear  = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  var prevMonth = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth(); // 1-indexed
  var period    = prevYear + '-' + String(prevMonth).padStart(2, '0');

  console.log('[founder-payout-monthly] Running payout for period:', period, '| now:', now.toISOString());

  // ── Phase 1: promote pending → payable ────────────────────────────────────
  // A commission is eligible once it has been pending for >= MATURATION_DAYS.
  // Voided rows are excluded (status != 'pending').
  var matureThreshold = new Date(now.getTime() - MATURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  var promoteRes = await supabase
    .from('founder_commissions')
    .update({ status: 'payable', became_payable_at: now.toISOString(), updated_at: now.toISOString() })
    .eq('status', 'pending')
    .lte('created_at', matureThreshold)
    .select('id');

  if (promoteRes.error) {
    console.error('[founder-payout-monthly] Phase 1 promote failed:', promoteRes.error.message);
    return { statusCode: 500 };
  }

  var promotedCount = (promoteRes.data || []).length;
  console.log('[founder-payout-monthly] Phase 1: promoted', promotedCount, 'commissions to payable');

  // ── Phase 2: collect payable commissions per founder ──────────────────────
  // Fetch all payable rows plus the founder profile in one pass.
  var { data: payableRows, error: payErr } = await supabase
    .from('founder_commissions')
    .select('id, founder_id, commission_amount')
    .eq('status', 'payable');

  if (payErr) {
    console.error('[founder-payout-monthly] Phase 2 query failed:', payErr.message);
    return { statusCode: 500 };
  }

  if (!payableRows || payableRows.length === 0) {
    console.log('[founder-payout-monthly] No payable commissions — nothing to disburse.');
    // Still send admin email summary if there are pending-but-not-yet-mature rows.
    await _sendAdminSummary({ succeeded: [], failed: [], pending_manual: [], missingEmail: [], noPayable: true }, period);
    return { statusCode: 200 };
  }

  // Group commission rows by founder_id
  var byFounder = {};
  for (var row of payableRows) {
    if (!byFounder[row.founder_id]) byFounder[row.founder_id] = { commissionIds: [], total: 0 };
    byFounder[row.founder_id].commissionIds.push(row.id);
    byFounder[row.founder_id].total += parseFloat(row.commission_amount || 0);
  }

  // Load founder profiles for the affected founder IDs
  var founderIds = Object.keys(byFounder);
  var { data: founders, error: fErr } = await supabase
    .from('member_founder_profiles')
    .select('id, full_name, email, pending_balance, total_commissions_paid, payout_method, payout_email, stripe_connect_account_id')
    .eq('status', 'active')
    .in('id', founderIds);

  if (fErr) {
    console.error('[founder-payout-monthly] Failed to load founders:', fErr.message);
    return { statusCode: 500 };
  }

  var eligible     = (founders || []).filter(function(f) { return f.payout_email != null; });
  var missingEmail = (founders || []).filter(function(f) { return f.payout_email == null; });

  var stripe = null;
  try {
    var { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');
    var Stripe = require('stripe');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
  } catch (e) {
    console.error('[founder-payout-monthly] Stripe unavailable:', e.message);
  }

  var results = { succeeded: [], failed: [], pending_manual: [] };

  for (var i = 0; i < eligible.length; i++) {
    var founder = eligible[i];
    var bucket  = byFounder[founder.id];
    if (!bucket) continue; // active but no payable commissions — shouldn't happen given the IN filter

    var gross = Math.round(bucket.total * 100) / 100; // round to cents
    if (gross < 0.50) {
      results.failed.push({ founder_id: founder.id, error: 'Payable balance $' + gross.toFixed(2) + ' below $0.50 minimum' });
      continue;
    }

    // Idempotency: skip if a payout for this period already exists
    var existing = await supabase
      .from('founder_payouts')
      .select('id')
      .eq('founder_id', founder.id)
      .eq('payout_period', period)
      .maybeSingle();
    if (existing.data) {
      console.log('[founder-payout-monthly] Payout for', founder.id, 'period', period, 'already exists — skipping');
      continue;
    }

    var insertRes = await supabase.from('founder_payouts').insert({
      founder_id:     founder.id,
      payout_period:  period,
      amount:         gross,
      payout_method:  founder.payout_method || 'paypal',
      payout_details: { payout_email: founder.payout_email },
      status:         'pending',
      created_at:     now.toISOString(),
    }).select().single();

    if (insertRes.error) {
      console.error('[founder-payout-monthly] Insert failed for', founder.id, ':', insertRes.error.message);
      results.failed.push({ founder_id: founder.id, error: insertRes.error.message });
      continue;
    }

    var payoutRow = insertRes.data;
    var paidOk   = false;

    if (founder.stripe_connect_account_id && stripe) {
      try {
        var transfer = await stripe.transfers.create({
          amount:      Math.round(gross * 100),
          currency:    'usd',
          destination: founder.stripe_connect_account_id,
          metadata:    {
            payout_id:     payoutRow.id,
            payout_period: period,
            founder_id:    founder.id,
            type:          'monthly_founder_payout',
          },
        });

        await supabase.from('founder_payouts').update({
          status:             'completed',
          stripe_transfer_id: transfer.id,
          processed_at:       now.toISOString(),
          payout_type:        'monthly',
          fee_amount:         0,
          net_amount:         gross,
        }).eq('id', payoutRow.id);

        results.succeeded.push({ founder_id: founder.id, amount: gross, transfer_id: transfer.id });
        paidOk = true;
      } catch (stripeErr) {
        await supabase.from('founder_payouts')
          .update({ status: 'failed', notes: stripeErr.message })
          .eq('id', payoutRow.id);
        results.failed.push({ founder_id: founder.id, error: stripeErr.message });
      }
    } else {
      // No Stripe Connect — PayPal or manual; flag for admin
      await supabase.from('founder_payouts')
        .update({ status: 'pending_manual' })
        .eq('id', payoutRow.id);
      results.pending_manual.push({
        founder_id:   founder.id,
        full_name:    founder.full_name,
        amount:       gross,
        payout_email: founder.payout_email,
        method:       founder.payout_method,
      });
      paidOk = true; // queued for manual — mark commissions paid so they don't re-appear
    }

    // ── Phase 3: mark contributing commissions as paid ─────────────────────
    if (paidOk && bucket.commissionIds.length) {
      await supabase.from('founder_commissions')
        .update({ status: 'paid', paid_at: now.toISOString(), updated_at: now.toISOString() })
        .in('id', bucket.commissionIds);

      // Snapshot-then-update to avoid race with incoming commissions
      var snap = await supabase.from('member_founder_profiles')
        .select('pending_balance, total_commissions_paid')
        .eq('id', founder.id)
        .single();
      var prevBal  = parseFloat((snap.data && snap.data.pending_balance)        || 0);
      var prevPaid = parseFloat((snap.data && snap.data.total_commissions_paid)  || 0);

      await supabase.from('member_founder_profiles').update({
        pending_balance:        Math.max(0, parseFloat((prevBal - gross).toFixed(2))),
        total_commissions_paid: parseFloat((prevPaid + gross).toFixed(2)),
        updated_at:             now.toISOString(),
      }).eq('id', founder.id);
    }
  }

  await _sendAdminSummary({ succeeded: results.succeeded, failed: results.failed, pending_manual: results.pending_manual, missingEmail, noPayable: false }, period);

  console.log(
    '[founder-payout-monthly] Done. Promoted:', promotedCount,
    '| Succeeded:', results.succeeded.length,
    '| Manual:', results.pending_manual.length,
    '| Failed:', results.failed.length,
    '| No email:', missingEmail.length,
  );
  return { statusCode: 200 };
};

async function _sendAdminSummary({ succeeded, failed, pending_manual, missingEmail, noPayable }, period) {
  try {
    var { Resend } = require('resend');
    var resend = new Resend(process.env.RESEND_API_KEY);

    var noPayableNote = noPayable
      ? '<p style="color:#6b7280"><em>No commissions reached the 7-day payable threshold this cycle. '
        + 'Any commissions still inside the holding window will be included next month.</em></p>'
      : '';

    var manualHtml = pending_manual.length
      ? '<h3 style="color:#b45309">Requires Manual Action (PayPal)</h3><ul>'
        + pending_manual.map(function(m) {
            return '<li><b>' + m.full_name + '</b> (' + m.founder_id + '): $'
              + m.amount.toFixed(2) + ' → ' + m.payout_email + '</li>';
          }).join('')
        + '</ul>'
      : '';

    var noEmailHtml = missingEmail.length
      ? '<h3 style="color:#dc2626">Blocked — No Payout Email Set</h3><ul>'
        + missingEmail.map(function(f) {
            return '<li><b>' + (f.full_name || f.id) + '</b>: payable commissions exist but payout_email is NULL — set via admin portal</li>';
          }).join('')
        + '</ul>'
      : '';

    var failedHtml = failed.length
      ? '<h3 style="color:#dc2626">Failed</h3><ul>'
        + failed.map(function(f) {
            return '<li>' + f.founder_id + ': ' + f.error + '</li>';
          }).join('')
        + '</ul>'
      : '';

    await resend.emails.send({
      from:    process.env.MCC_FROM_EMAIL || 'noreply@mycarconcierge.com',
      to:      process.env.ADMIN_EMAIL    || 'admin@mycarconcierge.com',
      subject: '[MCC] Monthly founder payout summary — ' + period,
      html:    '<div style="font-family:sans-serif;max-width:600px">'
             + '<h2>Founder Payout Summary: ' + period + '</h2>'
             + noPayableNote
             + '<p><b>Auto-processed (Stripe):</b> ' + succeeded.length + '</p>'
             + manualHtml
             + noEmailHtml
             + failedHtml
             + '</div>',
    });
  } catch (emailErr) {
    console.error('[founder-payout-monthly] Admin email failed:', emailErr.message);
  }
}

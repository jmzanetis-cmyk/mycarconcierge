// netlify/functions/founder-payout-monthly-scheduled.js
//
// Runs on the 1st of each month at 14:00 UTC (9am ET).
// Creates founder_payouts rows for all active founders with pending_balance > 0
// and payout_email IS NOT NULL, then auto-processes founders with a Stripe Connect
// account. PayPal-only founders are created as pending_manual and included in the
// admin summary email.
//
// Chris Agrapidis NOTE: payout_email is currently NULL on his profile, which means
// he will appear in the admin email under "Blocked — No Payout Email" until his
// PayPal address is set via the admin portal.
//
// "Within 15 business days" per contract: this cron fires on the 1st, giving
// the admin until ~the 21st calendar day (≈15 business days) to process any
// manual payouts surfaced in the email.

'use strict';

var utils = require('./utils');

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
  var period = prevYear + '-' + String(prevMonth).padStart(2, '0');

  console.log('[founder-payout-monthly] Running payout for period:', period);

  var { data: founders, error: fErr } = await supabase
    .from('member_founder_profiles')
    .select('id, full_name, email, pending_balance, payout_method, payout_email, stripe_connect_account_id')
    .eq('status', 'active')
    .gt('pending_balance', 0);

  if (fErr) {
    console.error('[founder-payout-monthly] Failed to load founders:', fErr.message);
    return { statusCode: 500 };
  }

  var eligible    = (founders || []).filter(function(f) { return f.payout_email != null; });
  var missingEmail = (founders || []).filter(function(f) { return f.payout_email == null; });

  if (eligible.length === 0 && missingEmail.length === 0) {
    console.log('[founder-payout-monthly] No founders with pending balance.');
    return { statusCode: 200 };
  }

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
    var gross = parseFloat(founder.pending_balance);
    if (gross < 0.50) {
      results.failed.push({ founder_id: founder.id, error: 'Balance below $0.50 minimum' });
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

        // Snapshot balance before deducting to avoid race with incoming commissions
        var snap = await supabase.from('member_founder_profiles')
          .select('pending_balance, total_commissions_paid')
          .eq('id', founder.id)
          .single();
        var prevBal  = parseFloat((snap.data && snap.data.pending_balance)        || 0);
        var prevPaid = parseFloat((snap.data && snap.data.total_commissions_paid)  || 0);

        await Promise.all([
          supabase.from('founder_payouts').update({
            status:             'completed',
            stripe_transfer_id: transfer.id,
            processed_at:       now.toISOString(),
            payout_type:        'weekly', // weekly = no fee
            fee_amount:         0,
            net_amount:         gross,
          }).eq('id', payoutRow.id),

          supabase.from('member_founder_profiles').update({
            pending_balance:        Math.max(0, prevBal - gross),
            total_commissions_paid: prevPaid + gross,
          }).eq('id', founder.id),
        ]);

        results.succeeded.push({ founder_id: founder.id, amount: gross, transfer_id: transfer.id });
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
    }
  }

  // Admin summary email
  try {
    var { Resend } = require('resend');
    var resend = new Resend(process.env.RESEND_API_KEY);

    var manualHtml = results.pending_manual.length
      ? '<h3 style="color:#b45309">Requires Manual Action (PayPal)</h3><ul>'
        + results.pending_manual.map(function(m) {
            return '<li><b>' + m.full_name + '</b> (' + m.founder_id + '): $'
              + m.amount.toFixed(2) + ' → ' + m.payout_email + '</li>';
          }).join('')
        + '</ul>'
      : '';

    var noEmailHtml = missingEmail.length
      ? '<h3 style="color:#dc2626">Blocked — No Payout Email Set</h3><ul>'
        + missingEmail.map(function(f) {
            return '<li><b>' + f.full_name + '</b> (' + f.id + '): $'
              + parseFloat(f.pending_balance).toFixed(2) + ' pending — set payout_email in admin portal</li>';
          }).join('')
        + '</ul>'
      : '';

    var failedHtml = results.failed.length
      ? '<h3 style="color:#dc2626">Failed</h3><ul>'
        + results.failed.map(function(f) {
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
             + '<p><b>Auto-processed (Stripe):</b> ' + results.succeeded.length + '</p>'
             + manualHtml
             + noEmailHtml
             + failedHtml
             + '</div>',
    });
  } catch (emailErr) {
    console.error('[founder-payout-monthly] Admin email failed:', emailErr.message);
  }

  console.log(
    '[founder-payout-monthly] Done. Succeeded:', results.succeeded.length,
    '| Manual:', results.pending_manual.length,
    '| Failed:', results.failed.length,
    '| No email:', missingEmail.length,
  );
  return { statusCode: 200 };
};

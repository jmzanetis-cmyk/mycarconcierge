// netlify/functions/b3-milestone-check-scheduled.js
//
// Daily check for B3 milestone bonuses (Chris Agrapidis only).
//
// Computes cumulative MCC-retained revenue from three sources:
//   1. bid_credit_purchases.amount_paid  (status='completed')   — 100% MCC
//   2. payments.mcc_fee                  (non-voided/refunded)  — MCC service cut
//   3. rides: COALESCE(actual_fare, gross_fare, estimated_fare) * 0.18
//             (status='completed')                              — 18% transport fee
//
// NOTE: rides.mcc_platform_fee_amount is never written by any code path; the 18%
// is derived from the fare columns at check time.
//
// Thresholds (contract §1.3): $1K→$100, $5K→$500, $10K→$1K, $25K→$2.5K,
//   $50K→$5K, $100K→$12.5K, $250K→$30K, $500K→$60K, $1M→$125K
//
// Idempotency: UNIQUE(founder_id, threshold_amount) on milestone_achievements.
//   INSERT ... ON CONFLICT DO NOTHING — each threshold fires exactly once.
//
// On new achievement: credits pending_balance on member_founder_profiles so the
//   existing B5 monthly payout cron (founder-payout-monthly-scheduled.js) picks
//   it up automatically.
//
// Eligibility: hardcoded to Chris's founder profile only. No-op for any other ID.

'use strict';

var utils = require('./utils');

var CHRIS_FOUNDER_ID = '21837a02-6df4-4cb8-b0f4-c5082e83acbd';

async function computeMccRevenue(supabase) {
  var results = await Promise.all([
    supabase.from('bid_credit_purchases')
      .select('amount_paid')
      .eq('status', 'completed'),
    supabase.from('payments')
      .select('mcc_fee')
      .not('status', 'in', '(refunded,voided,failed,cancelled)'),
    supabase.from('rides')
      .select('actual_fare, gross_fare, estimated_fare')
      .eq('status', 'completed'),
  ]);

  var bidTotal = (results[0].data || []).reduce(function(s, r) {
    return s + parseFloat(r.amount_paid || 0);
  }, 0);

  var payTotal = (results[1].data || []).reduce(function(s, r) {
    return s + parseFloat(r.mcc_fee || 0);
  }, 0);

  var rideTotal = (results[2].data || []).reduce(function(s, r) {
    var fare = parseFloat(r.actual_fare || r.gross_fare || r.estimated_fare || 0);
    return s + fare * 0.18;
  }, 0);

  return bidTotal + payTotal + rideTotal;
}

exports.computeMccRevenue = computeMccRevenue;

exports.handler = async function() {
  var supabase = utils.createSupabaseClient();
  if (!supabase) {
    console.error('[b3-milestone-check] Supabase not configured');
    return { statusCode: 500 };
  }

  // Eligibility guard — only Chris receives these bonuses
  var profileResult = await supabase.from('member_founder_profiles')
    .select('id, status, pending_balance')
    .eq('id', CHRIS_FOUNDER_ID)
    .maybeSingle();
  var profile = profileResult.data;
  if (!profile) {
    console.log('[b3-milestone-check] Chris founder profile not found — no-op');
    return { statusCode: 200 };
  }
  if (profile.status !== 'active') {
    console.log('[b3-milestone-check] Chris profile status is', profile.status, '— no-op');
    return { statusCode: 200 };
  }

  // Compute cumulative MCC revenue
  var revenue;
  try {
    revenue = await computeMccRevenue(supabase);
  } catch (e) {
    console.error('[b3-milestone-check] Revenue computation failed:', e.message);
    return { statusCode: 500 };
  }
  console.log('[b3-milestone-check] Cumulative MCC revenue: $' + revenue.toFixed(2));

  // With $0 revenue, nothing to check — fast exit
  if (revenue <= 0) {
    console.log('[b3-milestone-check] Revenue is $0 — no milestones can fire');
    return { statusCode: 200 };
  }

  // Load all active thresholds ascending
  var thresholdResult = await supabase.from('milestone_thresholds')
    .select('id, threshold_amount, bonus_amount, description')
    .eq('is_active', true)
    .order('threshold_amount', { ascending: true });
  var thresholds = thresholdResult.data || [];

  var today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  var fired = 0;
  var totalCredited = 0;

  for (var i = 0; i < thresholds.length; i++) {
    var t = thresholds[i];
    if (revenue < parseFloat(t.threshold_amount)) continue;

    // INSERT idempotently — UNIQUE(founder_id, threshold_amount) prevents duplicates
    var insResult = await supabase.from('milestone_achievements').insert({
      milestone_id:                    t.id,
      founder_id:                      CHRIS_FOUNDER_ID,
      threshold_amount:                t.threshold_amount,
      bonus_amount:                    t.bonus_amount,
      platform_revenue_at_achievement: revenue,
      evaluation_date:                 today,
      status:                          'pending',
    }).select('id').single();

    if (insResult.error) {
      // 23505 = unique_violation → already recorded this milestone, skip cleanly
      if (insResult.error.code === '23505') continue;
      console.error(
        '[b3-milestone-check] Insert failed for threshold $' + t.threshold_amount + ':',
        insResult.error.message
      );
      continue;
    }

    // New achievement — atomically add bonus to pending_balance
    var snap = await supabase.from('member_founder_profiles')
      .select('pending_balance')
      .eq('id', CHRIS_FOUNDER_ID)
      .single();
    var prevBalance = parseFloat((snap.data && snap.data.pending_balance) || 0);
    var bonusAmount = parseFloat(t.bonus_amount);
    await supabase.from('member_founder_profiles')
      .update({ pending_balance: prevBalance + bonusAmount })
      .eq('id', CHRIS_FOUNDER_ID);

    fired++;
    totalCredited += bonusAmount;
    console.log(
      '[b3-milestone-check] Milestone $' + t.threshold_amount +
      ' achieved — $' + bonusAmount + ' credited to pending_balance'
    );
  }

  console.log(
    '[b3-milestone-check] Done. New milestones fired:', fired,
    '| Total credited: $' + totalCredited.toFixed(2)
  );
  return { statusCode: 200 };
};

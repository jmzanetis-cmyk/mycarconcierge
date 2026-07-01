// ============================================================================
// auto-bid-engine-scheduled — hourly auto-bid placement engine
//
// For each open care plan (status='open', bid_closes_at in the future):
//   1. Load all providers with auto-bid enabled
//   2. Batch-load eligibility (verified + not suspended) — mirrors the
//      manual bid gate at plan-bids.js:111-128 (checkBidGate)
//   3. Match by service category overlap
//   4. Skip providers who already have a bid on this plan
//   5. Skip providers already known to be out of credits this run
//   6. Route bid placement through the atomic place_plan_bid RPC — same
//      path as manual bids — so free_trial_bids → bid_credits decrement
//      atomically in a single transaction. Providers who exhaust their
//      credits receive one `auto_bid_out_of_credits` notification per run.
//
// Distance filtering: requires lat/lng on provider profiles. Currently
// skipped — a future iteration can add geocoordinates to profiles and
// filter by max_distance_miles using the haversine formula.
// ============================================================================
'use strict';

const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

exports.handler = async function() {
  const supabase = getSupabase();
  if (!supabase) {
    console.error('[auto-bid-engine] Supabase not configured');
    return { statusCode: 200, body: JSON.stringify({ placed: 0, error: 'no_db' }) };
  }

  // Find care plans currently accepting bids
  const { data: plans, error: planErr } = await supabase
    .from('care_plans')
    .select('id, service_types, value_min, value_max, city, state')
    .eq('status', 'open')
    .gt('bid_closes_at', new Date().toISOString())
    .not('value_min', 'is', null)
    .gt('value_min', 0);

  if (planErr) {
    console.error('[auto-bid-engine] plans query error:', planErr.message);
    return { statusCode: 200, body: JSON.stringify({ placed: 0, error: planErr.message }) };
  }
  if (!plans?.length) {
    console.log('[auto-bid-engine] no open care plans');
    return { statusCode: 200, body: JSON.stringify({ placed: 0, plans: 0 }) };
  }

  // Load all enabled auto-bid settings
  const { data: settings } = await supabase
    .from('provider_auto_bid_settings')
    .select('provider_id, max_bid_percent, max_distance_miles, service_categories')
    .eq('enabled', true);

  if (!settings?.length) {
    console.log('[auto-bid-engine] no providers with auto-bid enabled');
    return { statusCode: 200, body: JSON.stringify({ placed: 0, plans: plans.length }) };
  }

  // Batch-load eligibility per provider. Mirrors checkBidGate in
  // netlify/functions/plan-bids.js:111-128: admins bypass; providers must
  // be role='provider' AND verification_status='verified' AND suspended_at IS NULL.
  const providerIds = settings.map(s => s.provider_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, role, verification_status, suspended_at')
    .in('id', providerIds);
  const eligibility = new Map(
    (profiles || []).map(p => [
      p.id,
      p.role === 'admin' ||
      (p.role === 'provider' && p.verification_status === 'verified' && p.suspended_at === null),
    ])
  );

  // Providers who hit P0001 (no_credits_available) once are skipped for the
  // rest of this run and receive a single low-balance notification below.
  const lowBalanceProviders = new Set();

  let totalPlaced = 0;

  for (const plan of plans) {
    const planCats = (Array.isArray(plan.service_types) ? plan.service_types : [])
      .map(s => s.toLowerCase());

    // Load existing bidders for this plan to avoid duplicates
    const { data: existing } = await supabase
      .from('plan_bids')
      .select('provider_id')
      .eq('care_plan_id', plan.id);
    const alreadyBid = new Set((existing || []).map(b => b.provider_id));

    for (const setting of settings) {
      if (alreadyBid.has(setting.provider_id)) continue;

      // Eligibility + prior-low-balance short-circuits.
      if (!eligibility.get(setting.provider_id)) continue;
      if (lowBalanceProviders.has(setting.provider_id)) continue;

      // Category match: skip if provider has categories set but none overlap
      const provCats = (Array.isArray(setting.service_categories) ? setting.service_categories : [])
        .map(c => c.toLowerCase());
      if (provCats.length > 0 && planCats.length > 0) {
        if (!planCats.some(c => provCats.includes(c))) continue;
      }

      const amount = parseFloat(
        ((plan.value_min * setting.max_bid_percent) / 100).toFixed(2)
      );
      if (amount <= 0) continue;

      // Route through the same atomic RPC manual bids use — decrements
      // free_trial_bids then bid_credits then inserts plan_bids in a
      // single transaction. See supabase/migrations/20260619_plan_bid_rpc.sql.
      const { data: rpcData, error: rpcErr } = await supabase.rpc('place_plan_bid', {
        p_provider_id:  setting.provider_id,
        p_care_plan_id: plan.id,
        p_amount:       amount,
        p_note:         `Auto-bid at ${setting.max_bid_percent}% of estimate`,
      });

      if (rpcErr) {
        const code = rpcErr.code;
        const msg  = rpcErr.message || '';
        if (code === 'P0001' || msg.indexOf('no_credits_available') !== -1) {
          // Out of credits — stop attempting bids for this provider this run.
          lowBalanceProviders.add(setting.provider_id);
          continue;
        }
        if (code === 'P0002' || msg.indexOf('duplicate_bid') !== -1) {
          // Race — another placement beat us (rare given alreadyBid pre-check).
          continue;
        }
        console.error(
          `[auto-bid-engine] place_plan_bid RPC failed plan=${plan.id} provider=${setting.provider_id}:`,
          msg
        );
        continue;
      }

      // The RPC hardcodes is_auto_bid=false (plan_bid_rpc.sql:105). Best-effort
      // post-RPC update to preserve the auto-bid marker — same pattern
      // plan-bids.js:238-250 uses for estimated_duration/availability.
      const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (row?.bid_id) {
        const { error: markErr } = await supabase
          .from('plan_bids').update({ is_auto_bid: true }).eq('id', row.bid_id);
        if (markErr) {
          console.warn(
            `[auto-bid-engine] failed to mark bid ${row.bid_id} as auto-bid:`,
            markErr.message
          );
        }
      }

      alreadyBid.add(setting.provider_id);
      totalPlaced++;
      console.log(
        `[auto-bid-engine] placed $${amount} auto-bid for provider ${setting.provider_id} on plan ${plan.id}`
      );
    }
  }

  // Low-balance notifications: one per provider per run, but only if the
  // provider does not already have an unread `auto_bid_out_of_credits`
  // notification. Idempotent across runs — provider dismisses to re-subscribe.
  let lowBalanceNotified = 0;
  for (const providerId of lowBalanceProviders) {
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', providerId)
      .eq('type', 'auto_bid_out_of_credits')
      .eq('read', false)
      .limit(1)
      .maybeSingle();

    if (existing) continue; // provider already has an unread low-balance nudge

    const { error: notifErr } = await supabase.from('notifications').insert({
      user_id: providerId,
      type:    'auto_bid_out_of_credits',
      title:   'Auto-bid paused — buy more credits to keep bidding',
      message: 'Your auto-bid setting is on but you have no bid credits left. Buy a bid credit pack to resume automatic bids.',
      metadata: { source: 'auto-bid-engine-scheduled' },
    });
    if (notifErr) {
      console.warn(
        `[auto-bid-engine] low-balance notification insert failed for provider ${providerId}:`,
        notifErr.message
      );
      continue;
    }
    lowBalanceNotified++;
  }

  console.log(`[auto-bid-engine] done: ${totalPlaced} bids placed across ${plans.length} plans`);
  return {
    statusCode: 200,
    body: JSON.stringify({
      placed:                totalPlaced,
      plans:                 plans.length,
      low_balance_providers: lowBalanceProviders.size,
      low_balance_notified:  lowBalanceNotified,
    }),
  };
};

// ============================================================================
// auto-bid-engine-scheduled — hourly auto-bid placement engine
//
// For each open care plan (status='open', bid_closes_at in the future):
//   1. Load all providers with auto-bid enabled
//   2. Match by service category overlap
//   3. Skip providers who already have a bid on this plan
//   4. Place a bid at max_bid_percent % of the plan's value_min
//      with is_auto_bid = true
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

      const { error: bidErr } = await supabase.from('plan_bids').insert({
        care_plan_id: plan.id,
        provider_id:  setting.provider_id,
        amount,
        is_auto_bid:  true,
        note:         `Auto-bid at ${setting.max_bid_percent}% of estimate`,
        status:       'pending',
      });

      if (bidErr) {
        if (bidErr.code === '23505') continue; // race — duplicate, skip
        console.error(
          `[auto-bid-engine] bid insert failed plan=${plan.id} provider=${setting.provider_id}:`,
          bidErr.message
        );
        continue;
      }

      alreadyBid.add(setting.provider_id);
      totalPlaced++;
      console.log(
        `[auto-bid-engine] placed $${amount} auto-bid for provider ${setting.provider_id} on plan ${plan.id}`
      );
    }
  }

  console.log(`[auto-bid-engine] done: ${totalPlaced} bids placed across ${plans.length} plans`);
  return { statusCode: 200, body: JSON.stringify({ placed: totalPlaced, plans: plans.length }) };
};

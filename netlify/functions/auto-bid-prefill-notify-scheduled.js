// ============================================================================
// netlify/functions/auto-bid-prefill-notify-scheduled.js
// Phase 4 of the auto-bid redesign — prefill-notify engine.
//
// SCHEDULE: "*/5 * * * *" (registered in netlify.toml). Every 5 minutes it
// scans currently-open care_plans, evaluates each against every provider
// who has ≥1 active rate card item, and — for the ones that pass all gates
// — inserts an auto_bid_prefills row and dispatches a push.
//
// UNRELATED TO auto-bid-engine-scheduled.js:
//   That is the OLD system (currently paused per 4af7eac). This is a
//   parallel new system. Do not consolidate them; the old one will be
//   removed in Phase 7 once this is proven.
//
// ELIGIBILITY IS IMPLICIT VIA RATE CARD:
//   A provider is opted in by having at least one active
//   provider_rate_card_items row. No separate provider_auto_bid_settings
//   / feature flag / toggle. This is the decision for Phase 4; Phase 6
//   may add an explicit toggle.
//
// THE GATES (short-circuit — bail on first failure, same style as the
// old auto-bid engine's loop):
//   1. Verified + non-suspended provider (mirrors checkBidGate at
//      plan-bids.js:111-128; the boards enforce the same).
//   2. Not already prefilled for this (provider, plan) — pre-check.
//      The auto_bid_prefills UNIQUE (provider_id, care_plan_id)
//      constraint is the real backstop against races between overlapping
//      runs.
//   3. isServiceFit(plan, provider effective match_categories) — same
//      _eligibility.js call the boards + bid gate use.
//   4. planWithinRadius(plan, provider.lat, provider.lng, radius) —
//      _distance.js helper. IMPORTANT INVERSION: the helper's default
//      posture is "miles===null → withinRadius:true" (never-block, so
//      legacy providers without coords don't disappear from the boards).
//      This engine must invert that — a push claiming "3.2 mi away"
//      can't be sent if there's no coordinate. So we check miles !== null
//      explicitly BEFORE trusting withinRadius:true. Do not modify the
//      helper — the boards depend on the permissive default.
//   5. matchItem(plan) resolves to exactly one item_key AND that
//      item_key exists in this provider's active rate card. Ambiguous or
//      zero-match plans (per _service_menu.js) never fire — matches the
//      never-guess rule that file already commits to.
//
// COUNTS + LOGGING:
//   Every scheduled function in this codebase logs per-run counts (see
//   auto-bid-engine-scheduled.js, concierge-push-notifier-scheduled.js).
//   Follow suit: log plans_scanned, providers_scanned, prefills_inserted,
//   and a breakdown of skip reasons. Useful for Jordan watching the
//   first real run and for the Phase 7 rate-limit decision.
// ============================================================================
'use strict';

const { createClient } = require('@supabase/supabase-js');
const { isServiceFit, providerCategories } = require('./_eligibility');
const { planWithinRadius } = require('./_distance');
const { matchItem } = require('./_service_menu');
const { dispatchAutoBidPrefill } = require('./notifications-auto-bid-prefill-push');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Optional dry-run entrypoint for verification: pass event = { queryStringParameters: { dry: '1' } }
// to skip the insert + push. Same trick as some of the existing
// scheduled fns' handlers (they can be invoked HTTP-style via the
// Netlify functions URL for manual testing).
function isDryRun(event) {
  if (!event || typeof event !== 'object') return false;
  const qs = event.queryStringParameters || {};
  return qs.dry === '1' || qs.dry === 'true';
}

exports.handler = async function (event) {
  const dryRun = isDryRun(event);
  const started = Date.now();
  const supabase = getSupabase();
  if (!supabase) {
    console.error('[prefill-notify] Supabase not configured');
    return { statusCode: 200, body: JSON.stringify({ error: 'no_db' }) };
  }

  const counts = {
    plans_scanned: 0,
    providers_scanned: 0,
    candidate_pairs: 0,
    prefills_inserted: 0,
    prefills_dry_run: 0,
    pushes_sent: 0,
    pushes_skipped: 0,
    skipped_ineligible: 0,
    skipped_duplicate: 0,
    skipped_no_service_fit: 0,
    skipped_no_geocode: 0,
    skipped_out_of_radius: 0,
    skipped_ambiguous_item: 0,
    skipped_not_on_rate_card: 0,
    skipped_self_bid: 0,
    errors: 0,
  };

  // ── 1. Load open care plans ────────────────────────────────────────────
  const nowIso = new Date().toISOString();
  const { data: plans, error: planErr } = await supabase
    .from('care_plans')
    .select('id, title, service_types, categories, member_id, lat, lng, bid_closes_at, status')
    .eq('status', 'open')
    .or(`bid_closes_at.is.null,bid_closes_at.gt.${nowIso}`);
  if (planErr) {
    console.error('[prefill-notify] care_plans query error:', planErr.message);
    return { statusCode: 200, body: JSON.stringify({ error: planErr.message, ...counts }) };
  }
  counts.plans_scanned = (plans || []).length;
  if (counts.plans_scanned === 0) {
    console.log('[prefill-notify] no open plans');
    return { statusCode: 200, body: JSON.stringify({ ...counts, duration_ms: Date.now() - started }) };
  }

  // ── 2. Load providers with ≥1 active rate card row ────────────────────
  // The rate card query gets us both the opt-in signal AND the price for
  // each item — one round-trip instead of two. Filter to active=true so
  // paused items don't opt a provider in.
  const { data: rateCardRows, error: rcErr } = await supabase
    .from('provider_rate_card_items')
    .select('provider_id, item_key, price_cents, active')
    .eq('active', true);
  if (rcErr) {
    console.error('[prefill-notify] rate card query error:', rcErr.message);
    return { statusCode: 200, body: JSON.stringify({ error: rcErr.message, ...counts }) };
  }
  const activeRateCards = new Map(); // providerId → Map(item_key → price_cents)
  for (const r of rateCardRows || []) {
    if (!activeRateCards.has(r.provider_id)) activeRateCards.set(r.provider_id, new Map());
    activeRateCards.get(r.provider_id).set(r.item_key, r.price_cents);
  }
  const providerIds = [...activeRateCards.keys()];
  counts.providers_scanned = providerIds.length;
  if (providerIds.length === 0) {
    console.log('[prefill-notify] no providers with active rate cards');
    return { statusCode: 200, body: JSON.stringify({ ...counts, duration_ms: Date.now() - started }) };
  }

  // Profiles + match preferences for every rate-carded provider, one query each.
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, role, verification_status, suspended_at, lat, lng')
    .in('id', providerIds);
  const profileById = new Map((profiles || []).map(p => [p.id, p]));

  const { data: prefs } = await supabase
    .from('provider_match_preferences')
    .select('profile_id, match_categories, match_radius_miles')
    .in('profile_id', providerIds);
  const prefsById = new Map((prefs || []).map(p => [p.profile_id, p]));

  // Existing prefills for the (provider × plan) product — the pre-check.
  // The UNIQUE (provider_id, care_plan_id) constraint on auto_bid_prefills
  // is the real backstop; this just saves us from doing pointless work.
  const planIds = plans.map(p => p.id);
  const { data: existingPrefills } = await supabase
    .from('auto_bid_prefills')
    .select('provider_id, care_plan_id')
    .in('care_plan_id', planIds)
    .in('provider_id', providerIds);
  const alreadyPrefilled = new Set(
    (existingPrefills || []).map(r => `${r.provider_id}::${r.care_plan_id}`)
  );

  // Menu label lookup for the push body ("New <label> job…").
  const { data: menuRows } = await supabase
    .from('service_menu_items')
    .select('item_key, label');
  const menuLabelByKey = new Map((menuRows || []).map(m => [m.item_key, m.label]));

  // ── 3. The plan × provider loop ────────────────────────────────────────
  // Same short-circuit style as auto-bid-engine-scheduled.js — every gate
  // is a `continue` on failure, ordered from cheapest to most expensive.
  for (const plan of plans) {
    for (const providerId of providerIds) {
      counts.candidate_pairs++;

      // Self-bid guard: a dual-role account (role=provider + is_also_member)
      // must not prefill on their own care plan. Same guard as the boards
      // (provider-packages.js:171, job-board.js:128).
      if (plan.member_id === providerId) { counts.skipped_self_bid++; continue; }

      // Dedup — pre-check, cheap.
      if (alreadyPrefilled.has(`${providerId}::${plan.id}`)) {
        counts.skipped_duplicate++;
        continue;
      }

      // Provider eligibility (verified + not suspended). Admins bypass —
      // useful for QA runs.
      const profile = profileById.get(providerId);
      if (!profile) { counts.skipped_ineligible++; continue; }
      const isAdmin = profile.role === 'admin';
      if (!isAdmin) {
        if (profile.role !== 'provider') { counts.skipped_ineligible++; continue; }
        if (profile.verification_status !== 'verified') { counts.skipped_ineligible++; continue; }
        if (profile.suspended_at !== null) { counts.skipped_ineligible++; continue; }
      }

      // Service-fit — same gate the boards + bid endpoint use.
      const pref = prefsById.get(providerId);
      const matchCats = (pref && pref.match_categories) || [];
      const effectiveCats = providerCategories(matchCats);
      if (!isAdmin && !isServiceFit(plan, effectiveCats)) {
        counts.skipped_no_service_fit++;
        continue;
      }

      // Distance — STRICT here. planWithinRadius returns miles===null when
      // either the plan or the provider is missing coords; the boards
      // treat that as permissive, but a "3.2 mi away" push can't be sent
      // if there's no coordinate. Explicitly require a numeric distance.
      const radiusMiles = (pref && pref.match_radius_miles) || 25;
      const { withinRadius, miles } = planWithinRadius(plan, profile.lat, profile.lng, radiusMiles);
      if (miles === null) { counts.skipped_no_geocode++; continue; }
      if (!withinRadius) { counts.skipped_out_of_radius++; continue; }

      // Item resolution — matchItem() is strict/never-guess by design.
      // Ambiguous or zero-hit plan → skip. This is the point of Phase 3.
      const itemKey = matchItem(plan);
      if (!itemKey) { counts.skipped_ambiguous_item++; continue; }

      // Provider must actually price this specific item on their active
      // rate card. Otherwise there's no amount to prefill with.
      const rateCard = activeRateCards.get(providerId);
      if (!rateCard || !rateCard.has(itemKey)) {
        counts.skipped_not_on_rate_card++;
        continue;
      }
      const priceCents = rateCard.get(itemKey);

      // ── Passed every gate — insert + push ─────────────────────────────
      if (dryRun) {
        counts.prefills_dry_run++;
        continue;
      }

      const insertRow = {
        provider_id: providerId,
        care_plan_id: plan.id,
        item_key: itemKey,
        prefilled_amount_cents: priceCents,
        status: 'pending',
      };
      const { data: inserted, error: insErr } = await supabase
        .from('auto_bid_prefills')
        .insert(insertRow)
        .select('id, provider_id, care_plan_id, item_key, prefilled_amount_cents')
        .single();

      if (insErr) {
        // UNIQUE violation (23505) is our real dedup backstop — treat as
        // "someone else prefilled between the pre-check and now" and
        // move on quietly rather than logging a spurious error.
        if (insErr.code === '23505') {
          counts.skipped_duplicate++;
          continue;
        }
        counts.errors++;
        console.error('[prefill-notify] insert failed:', insErr.message, { providerId, planId: plan.id });
        continue;
      }
      counts.prefills_inserted++;
      alreadyPrefilled.add(`${providerId}::${plan.id}`);

      // Fire push. Failures are already logged inside the dispatcher;
      // we just tally sent/skipped here.
      try {
        const label = menuLabelByKey.get(itemKey) || itemKey;
        const pushResult = await dispatchAutoBidPrefill(supabase, providerId, inserted, label, miles);
        if (pushResult.sent) counts.pushes_sent++;
        else counts.pushes_skipped++;
      } catch (e) {
        counts.pushes_skipped++;
        console.error('[prefill-notify] push exception:', e.message);
      }
    }
  }

  const duration_ms = Date.now() - started;
  console.log('[prefill-notify]', { ...counts, duration_ms, dry_run: dryRun });
  return { statusCode: 200, body: JSON.stringify({ ...counts, duration_ms, dry_run: dryRun }) };
};

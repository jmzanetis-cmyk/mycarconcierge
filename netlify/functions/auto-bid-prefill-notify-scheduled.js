// ============================================================================
// netlify/functions/auto-bid-prefill-notify-scheduled.js
// Auto-bid matching engine — Phase 4 (notify) + Phase 8 (automatic submit).
//
// SCHEDULE: "*/5 * * * *" (registered in netlify.toml). Every 5 minutes it
// scans currently-open care_plans, evaluates each against every provider
// who has explicitly turned Auto-Bid on (auto_bid_paused=false), and
// splits into three outcomes at the end:
//   - price <= optional cap (or no cap set) → place_plan_bid RPC with
//     p_is_auto_bid=true, real bid + credit spent, prefill 'auto_confirmed'
//   - price > cap → prefill 'pending' (falls back to Phase 5's manual
//     review-and-confirm flow)
//   - RPC returns no-credits → prefill 'pending' + a distinct "no credits"
//     push, so the match is preserved for a top-up + manual confirm
//
// Phase 4 originally built this as pure notify. Phase 8 reshaped it into
// true automatic submission — the outcome branch below is the new part.
// Everything above the outcome branch is unchanged.
//
// UNRELATED TO auto-bid-engine-scheduled.js:
//   That is the OLD system (currently paused per 4af7eac). This is a
//   parallel new system. Do not consolidate them; the old one will be
//   removed in Phase 7 once this is proven.
//
// ELIGIBILITY IS EXPLICIT VIA THE PHASE-8 TOGGLE:
//   A provider participates iff (a) they have ≥1 active
//   provider_rate_card_items row AND (b) their
//   provider_notification_preferences.auto_bid_paused is explicitly
//   false. The DB column defaults to true, so a fresh provider (or one
//   without a prefs row at all) is paused by default. This flipped in
//   Phase 8 from the earlier "implicit via rate card only" contract —
//   the new semantics mean real bids are placed automatically, so an
//   explicit opt-in via the in-app confirmation dialog is required.
//
// THE GATES (short-circuit — bail on first failure, same style as the
// old auto-bid engine's loop):
//   1. Verified + non-suspended provider (mirrors checkBidGate at
//      plan-bids.js:111-128; the boards enforce the same).
//   2. Not already prefilled for this (provider, plan) — pre-check.
//      The auto_bid_prefills UNIQUE (provider_id, care_plan_id)
//      constraint is the real backstop against races between overlapping
//      runs.
//   3. [Phase 7] Daily cap not reached — optional, per-provider,
//      provider_notification_preferences.auto_bid_prefill_daily_cap
//      (null = unlimited, the default). Checked in-memory against a
//      running count seeded from today's (UTC) real auto_bid_prefills
//      rows, so one run can't blow past the cap across many candidate
//      plans. Placed right after the dedup pre-check since it's cheap
//      and most providers have no cap set (the Map only holds providers
//      with a non-null cap, so the check is a no-op for everyone else).
//   4. isServiceFit(plan, provider effective match_categories) — same
//      _eligibility.js call the boards + bid gate use.
//   5. planWithinRadius(plan, provider.lat, provider.lng, radius) —
//      _distance.js helper. IMPORTANT INVERSION: the helper's default
//      posture is "miles===null → withinRadius:true" (never-block, so
//      legacy providers without coords don't disappear from the boards).
//      This engine must invert that — a push claiming "3.2 mi away"
//      can't be sent if there's no coordinate. So we check miles !== null
//      explicitly BEFORE trusting withinRadius:true. Do not modify the
//      helper — the boards depend on the permissive default.
//   6. matchItem(plan) resolves to exactly one item_key AND that
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
    prefills_inserted: 0,             // total prefill rows written (sum of the three outcomes below)
    prefills_auto_submitted: 0,       // Phase 8: real bid placed via place_plan_bid RPC (status='auto_confirmed')
    prefills_over_cap_notify_only: 0, // Phase 8: price > auto_bid_max_price_cents → fell back to review-and-confirm
    skipped_auto_submit_no_credits: 0,// Phase 8: RPC returned P0001, prefill written as 'pending' for manual review after top-up
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
    skipped_daily_cap: 0,
    skipped_auto_bid_paused: 0,       // Phase 8: master pause toggle is on
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

  // ── Phase 7: per-provider daily cap on prefills sent ───────────────────
  // Optional soft cap (provider_notification_preferences.auto_bid_prefill_daily_cap,
  // null = unlimited, the default). Two pieces: the configured cap per
  // provider, and how many this provider has already received today (UTC
  // day boundary — this is a server-side scheduled job with no user
  // timezone context, same convention as driver-api.js's `since` cutoff).
  // A single in-memory Map tracks the running per-provider count for the
  // rest of this run, seeded from today's real count and incremented on
  // every successful insert below, so a provider can't blow past their
  // cap within one run even across many candidate plans.
  // Phase 8: one query for all three per-provider prefs.
  //   - auto_bid_prefill_daily_cap  → optional per-provider cap on notify volume
  //   - auto_bid_paused             → master switch. NB: DB column defaults to
  //                                     true, so a missing row means "paused"
  //                                     (not opted in). Only explicit false
  //                                     unpauses.
  //   - auto_bid_max_price_cents    → optional ceiling. null = no cap, all
  //                                     matches auto-submit. When set, prices
  //                                     over the cap fall back to the
  //                                     review-and-confirm path.
  const { data: notifPrefs } = await supabase
    .from('provider_notification_preferences')
    .select('provider_id, auto_bid_prefill_daily_cap, auto_bid_paused, auto_bid_max_price_cents')
    .in('provider_id', providerIds);
  const dailyCapByProvider = new Map(
    (notifPrefs || [])
      .filter(p => p.auto_bid_prefill_daily_cap !== null && p.auto_bid_prefill_daily_cap !== undefined)
      .map(p => [p.provider_id, p.auto_bid_prefill_daily_cap])
  );
  // Set of providers who have explicitly opted IN (auto_bid_paused=false). A
  // provider with no row, or with the default true, is considered paused —
  // Phase 8 flipped the default to true so nobody is silently auto-submitting.
  const unpausedProviders = new Set(
    (notifPrefs || [])
      .filter(p => p.auto_bid_paused === false)
      .map(p => p.provider_id)
  );
  const maxPriceByProvider = new Map(
    (notifPrefs || [])
      .filter(p => p.auto_bid_max_price_cents !== null && p.auto_bid_max_price_cents !== undefined)
      .map(p => [p.provider_id, p.auto_bid_max_price_cents])
  );

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const dailyCountByProvider = new Map();
  if (dailyCapByProvider.size > 0) {
    const { data: todaysPrefills } = await supabase
      .from('auto_bid_prefills')
      .select('provider_id')
      .in('provider_id', [...dailyCapByProvider.keys()])
      .gte('created_at', todayStart.toISOString());
    for (const row of todaysPrefills || []) {
      dailyCountByProvider.set(row.provider_id, (dailyCountByProvider.get(row.provider_id) || 0) + 1);
    }
  }

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

      // Daily cap — cheap in-memory check, so a capped-out provider skips
      // before any of the profile/service-fit/distance/matching work below.
      // Only providers with a non-null cap are even in this Map; everyone
      // else is unlimited (the default).
      const dailyCap = dailyCapByProvider.get(providerId);
      if (dailyCap !== undefined && (dailyCountByProvider.get(providerId) || 0) >= dailyCap) {
        counts.skipped_daily_cap++;
        continue;
      }

      // Phase 8 master pause toggle. auto_bid_paused defaults to true
      // (Phase 8 flipped this from the earlier notify-only draft's false),
      // so a provider only participates if their row has explicit false.
      // Deliberately NOT bypassed for admins — unlike verification and
      // suspension (system safety gates), pause is the provider's own
      // preference and should always be honored.
      if (!unpausedProviders.has(providerId)) {
        counts.skipped_auto_bid_paused++;
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

      // ── Passed every gate — decide outcome (Phase 8 three-way branch) ─
      // Everything above is unchanged from Phase 4/7. What's new below:
      //   (a) if the provider set a max-price cap and this job exceeds it,
      //       fall back to the pre-Phase-8 review-and-confirm path (prefill
      //       row as 'pending', push with notify_only copy). The provider
      //       can still confirm manually through Phase 5's flow.
      //   (b) otherwise, attempt the auto-submit: call place_plan_bid with
      //       p_is_auto_bid=true. The RPC is the single source of truth
      //       for atomic credit-decrement + plan_bids insert, shared with
      //       Phase 5's manual confirm path — no duplicated credit logic.
      //       Success → prefill row as 'auto_confirmed' linked via plan_bid_id
      //       to the real bid + push with auto_submitted copy.
      //       P0001 no_credits → prefill row as 'pending' (visible/manually
      //       confirmable after top-up) + push with no_credits copy.
      // The auto_bid_prefills UNIQUE (provider_id, care_plan_id) constraint
      // still blocks double-inserts across overlapping runs regardless of
      // which of the three outcomes above ends up writing the row.
      if (dryRun) {
        counts.prefills_dry_run++;
        continue;
      }

      const maxPrice = maxPriceByProvider.get(providerId);
      const overCap = maxPrice !== undefined && priceCents > maxPrice;

      let insertRow;
      let outcomeKind = 'notify_only';  // 'notify_only' | 'auto_submitted' | 'no_credits'
      let placedBidId = null;

      if (overCap) {
        // Over-cap → fall back to notify-only. Prefill row is 'pending' so
        // it shows up in the provider's Auto-Bid Activity as a reviewable
        // entry, exactly like a Phase 4/5 prefill.
        insertRow = {
          provider_id: providerId,
          care_plan_id: plan.id,
          item_key: itemKey,
          prefilled_amount_cents: priceCents,
          status: 'pending',
        };
        counts.prefills_over_cap_notify_only++;
      } else {
        // Attempt real bid submission via the shared RPC.
        const rpc = await supabase.rpc('place_plan_bid', {
          p_provider_id:  providerId,
          p_care_plan_id: plan.id,
          p_amount:       priceCents / 100,   // RPC takes numeric dollars
          p_note:         `Auto-bid from rate card: ${menuLabelByKey.get(itemKey) || itemKey}`,
          p_is_auto_bid:  true,
        });
        if (rpc.error) {
          // P0001 is our "no credits" sentinel — insert 'pending' so the
          // prefill still surfaces in the activity feed and can be
          // manually confirmed once the provider tops up.
          const msg = rpc.error.message || '';
          if (rpc.error.code === 'P0001' || msg.indexOf('no_credits_available') !== -1) {
            counts.skipped_auto_submit_no_credits++;
            insertRow = {
              provider_id: providerId,
              care_plan_id: plan.id,
              item_key: itemKey,
              prefilled_amount_cents: priceCents,
              status: 'pending',
            };
            outcomeKind = 'no_credits';
          } else {
            // Any other RPC failure is a real bug — do NOT insert a prefill
            // (we don't want a phantom row without a matching plan_bid),
            // count the error, and move on.
            counts.errors++;
            console.error('[prefill-notify] place_plan_bid RPC failed:',
              msg, 'code=' + rpc.error.code, { providerId, planId: plan.id });
            continue;
          }
        } else {
          // Success — RPC returns a table; supabase-js gives us the first row.
          const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
          if (!row || !row.bid_id) {
            counts.errors++;
            console.error('[prefill-notify] place_plan_bid returned empty row:', rpc.data);
            continue;
          }
          placedBidId = row.bid_id;
          insertRow = {
            provider_id: providerId,
            care_plan_id: plan.id,
            item_key: itemKey,
            prefilled_amount_cents: priceCents,
            status: 'auto_confirmed',
            plan_bid_id: placedBidId,
            responded_at: new Date().toISOString(),
          };
          counts.prefills_auto_submitted++;
          outcomeKind = 'auto_submitted';
        }
      }

      // Insert the prefill row. UNIQUE (provider_id, care_plan_id) races
      // between overlapping runs still bounce off 23505 and are counted
      // as a duplicate, matching the pre-Phase-8 behavior.
      const { data: inserted, error: insErr } = await supabase
        .from('auto_bid_prefills')
        .insert(insertRow)
        .select('id, provider_id, care_plan_id, item_key, prefilled_amount_cents, status, plan_bid_id')
        .single();
      if (insErr) {
        if (insErr.code === '23505') {
          counts.skipped_duplicate++;
          // NB: if we already placed a bid via the RPC above and the
          // insert then bounced on dedup, the bid still exists in
          // plan_bids and the credit was spent. Log it so it's not
          // silently lost — this is a very narrow race window (another
          // process wrote a prefill row between our alreadyPrefilled
          // pre-check and this insert). In practice the schedule is
          // single-tenant per run, so 0 hits expected in normal ops.
          if (placedBidId) {
            console.warn('[prefill-notify] dedup race — bid placed but prefill row lost:',
              { providerId, planId: plan.id, bidId: placedBidId });
          }
          continue;
        }
        counts.errors++;
        console.error('[prefill-notify] insert failed:', insErr.message, { providerId, planId: plan.id });
        continue;
      }
      counts.prefills_inserted++;
      alreadyPrefilled.add(`${providerId}::${plan.id}`);
      if (dailyCapByProvider.has(providerId)) {
        dailyCountByProvider.set(providerId, (dailyCountByProvider.get(providerId) || 0) + 1);
      }

      // Fire the outcome-specific push. Failures are logged inside the
      // dispatcher; we just tally sent/skipped here.
      try {
        const label = menuLabelByKey.get(itemKey) || itemKey;
        const pushResult = await dispatchAutoBidPrefill(
          supabase, providerId, inserted, label, miles, outcomeKind
        );
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

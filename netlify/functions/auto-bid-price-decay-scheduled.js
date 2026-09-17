// ============================================================================
// netlify/functions/auto-bid-price-decay-scheduled.js
// Auto-Bid price decay engine (2026-09-17).
//
// SCHEDULE: "0 * * * *" (hourly, registered in netlify.toml). Slow-moving
// by design — decay is a slow negotiation, not a 5-minute cadence like the
// matching engine. Runs on the hour so the log stream is easy to read.
//
// WHAT IT DOES:
//   For each is_auto_bid=true, status='pending' plan_bids row whose linked
//   care_plan is still open, look up the provider's rate card row for that
//   item. If min_price_cents is set AND the current bid amount > min AND
//   the plan is contested (≥1 other bidder) AND the last price change was
//   long enough ago, step the bid amount down by a fixed increment,
//   clamped at the floor. That's it — no credit spend, no new plan_bids
//   row, no push notification, just an UPDATE.
//
// LOAD-BEARING GUARDRAIL (see spec):
//   Decay reacts only to a binary "is this job contested" fact and a
//   clock. NEVER to any competitor's bid amount. The competition query
//   below returns nothing but provider_id — no `amount` column is ever
//   selected. The step is a fixed dollar increment (DECAY_STEP_DOLLARS),
//   NEVER sized to how much a competitor undercut by. If a future request
//   asks for that, decline and flag rather than build — it moves this
//   feature from "descending-clock auction on a public fact + clock" into
//   "MCC actively facilitates price coordination between competitors,"
//   which is the wall this design deliberately stays behind.
//
// KNOBS (constants below, tunable without a code review):
//   - DECAY_STEP_DOLLARS = 5      matches Rate Card stepper increment
//   - DECAY_INTERVAL_MS  = 6h     next step earliest 6h after last move
//   - OPEN_WINDOW_CEIL_MS = 5d    stop decaying once a plan has been open
//                                 this long — abandoned jobs shouldn't
//                                 drift indefinitely
//
// INDEPENDENT OF:
//   - Auto-Bid pause toggle (auto_bid_paused) — that gates NEW submissions.
//   - Daily submission cap (auto_bid_prefill_daily_cap) — same, that's for
//     new submissions.
//   Decay only ever adjusts an existing bid the provider previously
//   opted into (by setting min_price_cents on the item's rate card). A
//   provider pausing new auto-submissions shouldn't freeze bids that are
//   already out there — those are already the provider's expressed
//   commitment.
//
// COUNTS + LOGGING: same per-run count style as the matching engine,
// makes ops watching easy.
// ============================================================================
'use strict';

const { createClient } = require('@supabase/supabase-js');

const DECAY_STEP_DOLLARS = 5;
const DECAY_INTERVAL_MS = 6 * 60 * 60 * 1000;       // 6 hours between steps
const OPEN_WINDOW_CEIL_MS = 5 * 24 * 60 * 60 * 1000; // 5 days total

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

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
    console.error('[price-decay] Supabase not configured');
    return { statusCode: 200, body: JSON.stringify({ error: 'no_db' }) };
  }

  const counts = {
    auto_bids_scanned: 0,
    stepped: 0,
    stepped_dry_run: 0,
    skipped_no_min_configured: 0,
    skipped_already_at_min: 0,
    skipped_not_contested: 0,
    skipped_interval_not_elapsed: 0,
    skipped_plan_stale: 0,
    skipped_plan_closed_or_missing: 0,
    skipped_rate_card_missing: 0,
    errors: 0,
  };

  // ── 1. Load pending auto-bids ─────────────────────────────────────────
  // Deliberately do NOT include `amount` from any OTHER bid on the plan.
  // We only need our own bid's amount, plus the care_plan info for the
  // decay-window ceiling and the item_key to look up the rate card floor.
  const nowIso = new Date().toISOString();
  const { data: bids, error: bidErr } = await supabase
    .from('plan_bids')
    .select(`
      id, provider_id, care_plan_id, amount, created_at, last_price_change_at,
      care_plans:care_plan_id (status, bid_closes_at, created_at)
    `)
    .eq('is_auto_bid', true)
    .eq('status', 'pending');
  if (bidErr) {
    console.error('[price-decay] plan_bids query error:', bidErr.message);
    return { statusCode: 200, body: JSON.stringify({ error: bidErr.message, ...counts }) };
  }
  counts.auto_bids_scanned = (bids || []).length;
  if (counts.auto_bids_scanned === 0) {
    console.log('[price-decay] no pending auto-bids');
    return { statusCode: 200, body: JSON.stringify({ ...counts, duration_ms: Date.now() - started, dry_run: dryRun }) };
  }

  // ── 2. Batch-load rate card items via a two-key join ──────────────────
  // The (provider_id, item_key) pair we need to look up isn't on plan_bids
  // directly — it's on the linked auto_bid_prefills row (the one that
  // originated this bid). Fetch prefills for the bid ids first, then
  // rate card items keyed by (provider, item_key).
  const bidIds = (bids || []).map(b => b.id);
  const { data: prefills, error: pfErr } = await supabase
    .from('auto_bid_prefills')
    .select('provider_id, care_plan_id, item_key, plan_bid_id')
    .in('plan_bid_id', bidIds);
  if (pfErr) {
    console.error('[price-decay] auto_bid_prefills query error:', pfErr.message);
    return { statusCode: 200, body: JSON.stringify({ error: pfErr.message, ...counts }) };
  }
  // Map bid.id → item_key so we can size decay against the right rate card row.
  const itemKeyByBid = new Map();
  for (const pf of prefills || []) {
    if (pf.plan_bid_id) itemKeyByBid.set(pf.plan_bid_id, pf.item_key);
  }

  // Batch pull rate card rows for every provider that has an active auto-bid.
  const providerIds = [...new Set((bids || []).map(b => b.provider_id))];
  const { data: rateCards, error: rcErr } = await supabase
    .from('provider_rate_card_items')
    .select('provider_id, item_key, price_cents, min_price_cents, active')
    .in('provider_id', providerIds);
  if (rcErr) {
    console.error('[price-decay] rate card query error:', rcErr.message);
    return { statusCode: 200, body: JSON.stringify({ error: rcErr.message, ...counts }) };
  }
  const rateCardByKey = new Map();
  for (const rc of rateCards || []) {
    rateCardByKey.set(`${rc.provider_id}::${rc.item_key}`, rc);
  }

  // ── 3. Per-bid decision loop ──────────────────────────────────────────
  const nowMs = Date.now();
  for (const bid of bids || []) {
    // Plan status + open-window ceiling.
    const plan = bid.care_plans;
    if (!plan) { counts.skipped_plan_closed_or_missing++; continue; }
    if (plan.status !== 'open') { counts.skipped_plan_closed_or_missing++; continue; }
    if (plan.bid_closes_at && new Date(plan.bid_closes_at).getTime() < nowMs) {
      counts.skipped_plan_closed_or_missing++;
      continue;
    }
    const planCreatedMs = plan.created_at ? new Date(plan.created_at).getTime() : nowMs;
    if (nowMs - planCreatedMs > OPEN_WINDOW_CEIL_MS) {
      counts.skipped_plan_stale++;
      continue;
    }

    // Rate card lookup — we need min_price_cents.
    const itemKey = itemKeyByBid.get(bid.id);
    if (!itemKey) { counts.skipped_rate_card_missing++; continue; }
    const rc = rateCardByKey.get(`${bid.provider_id}::${itemKey}`);
    if (!rc) { counts.skipped_rate_card_missing++; continue; }
    if (rc.min_price_cents == null) { counts.skipped_no_min_configured++; continue; }

    // Already at or below the floor → nothing to do.
    const currentCents = Math.round(Number(bid.amount) * 100);
    if (!Number.isFinite(currentCents) || currentCents <= rc.min_price_cents) {
      counts.skipped_already_at_min++;
      continue;
    }

    // Contested check — existence-only, deliberately does NOT read amount.
    // NB: `select('provider_id')` intentionally omits every other column
    // to keep this query a public-fact yes/no test, per the guardrail.
    const { count: otherBidsCount, error: cErr } = await supabase
      .from('plan_bids')
      .select('provider_id', { count: 'exact', head: true })
      .eq('care_plan_id', bid.care_plan_id)
      .neq('provider_id', bid.provider_id)
      .eq('status', 'pending');
    if (cErr) {
      counts.errors++;
      console.error('[price-decay] contested check error:', cErr.message);
      continue;
    }
    if (!otherBidsCount || otherBidsCount === 0) {
      counts.skipped_not_contested++;
      continue;
    }

    // Interval — earliest step is DECAY_INTERVAL_MS after the last move.
    // Legacy rows with null last_price_change_at fall back to created_at
    // (bid was placed at least that long ago; decay from there).
    const lastMoveMs = bid.last_price_change_at
      ? new Date(bid.last_price_change_at).getTime()
      : (bid.created_at ? new Date(bid.created_at).getTime() : nowMs);
    if (nowMs - lastMoveMs < DECAY_INTERVAL_MS) {
      counts.skipped_interval_not_elapsed++;
      continue;
    }

    // Step. Clamp at the floor so we never undercut a provider's own limit.
    const stepDownCents = DECAY_STEP_DOLLARS * 100;
    const nextCents = Math.max(rc.min_price_cents, currentCents - stepDownCents);
    if (nextCents === currentCents) {
      // Would happen if step + floor collide exactly at current — treat
      // like already-at-min to keep counters clean.
      counts.skipped_already_at_min++;
      continue;
    }

    if (dryRun) {
      counts.stepped_dry_run++;
      continue;
    }

    // Direct UPDATE — same write shape as the manual "Update Bid" PATCH
    // (plan-bids.js:handlePatch). Guarded on status='pending' + is_auto_bid=true
    // so a race with a member accept/reject doesn't undo their action.
    const { error: uErr } = await supabase
      .from('plan_bids')
      .update({ amount: nextCents / 100, last_price_change_at: new Date().toISOString() })
      .eq('id', bid.id)
      .eq('status', 'pending')
      .eq('is_auto_bid', true);
    if (uErr) {
      counts.errors++;
      console.error('[price-decay] update failed:', uErr.message, { bidId: bid.id });
      continue;
    }
    counts.stepped++;
  }

  const duration_ms = Date.now() - started;
  console.log('[price-decay]', { ...counts, duration_ms, dry_run: dryRun });
  return { statusCode: 200, body: JSON.stringify({ ...counts, duration_ms, dry_run: dryRun }) };
};

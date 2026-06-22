// ============================================================================
// netlify/functions/_eligibility.js
// Shared bid-eligibility helpers (Step 1d-3 v1).
//
// IMPORTED BY:
//   - plan-bids.js          — the bid gate (server-side; rejects bids that
//                             don't pass service-fit)
//   - provider-packages.js  — the provider open-jobs board (filters the list
//                             the provider sees)
//
// CRITICAL: both consumers MUST use the same function. Drift between the
// gate and the board produces the worst possible UX — "I see this job on
// my board but get 403 when I click bid", or vice versa. This file is the
// single source of truth.
//
// Underscore prefix signals "not a Netlify handler" — match the convention
// from _concierge-scenarios.js. esbuild bundles it into each consumer at
// build time; no separate function deploys.
// ============================================================================
'use strict';

// 1d-1: map plan.service_types (array of strings, mixed vocab in prod —
// snake_case codes like 'oil_change' AND verbose like 'Oil Change') to the
// 8 match_categories buckets defined by provider_match_preferences (see
// supabase/migrations/20260524_provider_match_preferences.sql). Logic
// mirrors that migration's backfill CASE expression but extends
// maintenance with battery/transmission/engine/diagnostic/alignment/
// coolant/spark/filter/inspection/multi-point/a/c/ac (gaps the original
// SQL classified as 'other'). Priority order: maintenance first, then
// accident_repair, cosmetic, performance, snow_removal, offroad,
// manufacturer_service, fallthrough 'other'. Returns DISTINCT bucket set;
// empty input → empty array.
function serviceTypesToBuckets(types) {
  if (!Array.isArray(types) || types.length === 0) return [];
  const out = new Set();

  // Word-boundary check for the short code 'ac' so 'accident_repair' is
  // not misclassified as maintenance. Treats anything outside [a-z0-9]
  // (including _ / - and spaces) as a token boundary, plus a separate
  // literal check for 'a/c' (which isn't a contiguous 'ac' substring).
  const hasAc = (s) => /(?:^|[^a-z0-9])ac(?:[^a-z0-9]|$)/.test(s) || s.includes('a/c');

  for (const t of types) {
    if (typeof t !== 'string') continue;
    const s = t.toLowerCase();

    if (
      s.includes('oil') || s.includes('brake') || s.includes('tire') ||
      s.includes('tune') || s.includes('fluid') || s.includes('battery') ||
      s.includes('transmission') || s.includes('engine') || s.includes('diagnostic') ||
      s.includes('alignment') || s.includes('coolant') || s.includes('spark') ||
      s.includes('filter') || s.includes('inspection') || s.includes('multi-point') ||
      hasAc(s)
    ) {
      out.add('maintenance');
    } else if (
      s.includes('body') || s.includes('collision') || s.includes('paint') ||
      s.includes('dent') || s.includes('glass') || s.includes('windshield')
    ) {
      out.add('accident_repair');
    } else if (s.includes('detail') || s.includes('wrap') || s.includes('tint')) {
      out.add('cosmetic');
    } else if (
      s.includes('exhaust') || s.includes('suspension') ||
      s.includes('performance') || s.includes('tuning')
    ) {
      out.add('performance');
    } else if (s.includes('snow') || s.includes('plow')) {
      out.add('snow_removal');
    } else if (s.includes('lift') || s.includes('off-road') || s.includes('offroad')) {
      out.add('offroad');
    } else if (
      s.includes('warranty') || s.includes('manufacturer') || s.includes('scheduled')
    ) {
      out.add('manufacturer_service');
    } else {
      out.add('other');
    }
  }
  return Array.from(out);
}

module.exports = { serviceTypesToBuckets };

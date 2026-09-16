// ============================================================================
// netlify/functions/_distance.js
// Shared distance filter — Haversine great-circle, null-safe.
// Phase 1 of the auto-bid redesign (2026-09-16). Sibling to _eligibility.js
// and _taxonomy.js — same "single source of truth for the decision" posture.
//
// IMPORTED BY:
//   - provider-packages.js  — Browse Packages feed
//   - job-board.js          — standalone Job Board feed
//   - (future) the auto-bid prefill-notify scheduled function
//
// WHY IT LIVES HERE, NOT IN THE DB:
//   Consumers already SELECT the plan + provider preferences rows into
//   memory and do their eligibility filter in JS (see _eligibility.isServiceFit).
//   Doing distance the same way keeps everything in one filter pass — no
//   round-trip to a `point<@>point` query, no PostGIS dependency, and the
//   same null-safe posture the rest of the pipeline already commits to.
//   ~10μs per Haversine call in Node, and the boards filter ≤ hundreds of
//   plans at a time — cost is a rounding error.
//
// NEVER-BLOCK:
//   Any missing coordinate (provider or plan) resolves to "unknown, don't
//   filter". Same rule as isServiceFit for plans with no category signal.
//   Reasoning:
//     - Legacy plans/providers may lack coords until the backfill catches
//       them. Filtering them out would silently hide real jobs from real
//       providers with correct addresses whose partner-side hasn't been
//       geocoded yet.
//     - The 1d-1b playbook and the profiles.lat/lng migration both explicitly
//       call out this null-safe rule.
//   The auto-bid prefill-notify engine (Phase 4) will invert this posture
//   inside its own boundary — a "3.2 mi away" push claim can't be made if
//   coords are missing — but the boards keep the permissive default.
//
// The Earth's radius in statute miles matches profiles.lat/lng's precision
// (numeric(10,7)) — sub-mile drift only shows up past the fifth decimal.
// ============================================================================
'use strict';

const EARTH_RADIUS_MILES = 3958.7613;

function toRad(deg) { return (deg * Math.PI) / 180; }

// Great-circle distance in statute miles. Returns null if either coord is
// missing OR non-finite (guards against string "45.6" leaking through from
// legacy rows — Postgres numeric arrives as string in supabase-js, and
// `String("45.6") * 1` = 45.6 but the toRad math on a bare string produces
// NaN silently).
function haversineMiles(lat1, lng1, lat2, lng2) {
  const a = Number(lat1);
  const b = Number(lng1);
  const c = Number(lat2);
  const d = Number(lng2);
  if (![a, b, c, d].every(Number.isFinite)) return null;
  const dA = toRad(c - a);
  const dB = toRad(d - b);
  const s = Math.sin(dA / 2) ** 2 +
            Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(dB / 2) ** 2;
  const gc = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return EARTH_RADIUS_MILES * gc;
}

// The distance decision — parallel to _eligibility.isServiceFit.
// Returns { withinRadius: boolean, miles: number|null } so callers can BOTH
// filter AND render a distance chip on the card with one call. Passing
// providerLat/providerLng directly (rather than a provider object) keeps
// the call sites explicit — they already de-structure lat/lng out of
// profiles at the top of the handler.
//
// `radiusMiles` defaults to 25 to match provider_match_preferences.match_radius_miles's
// own DEFAULT 25 (supabase/migrations/20260524_provider_match_preferences.sql:24)
// — so a provider with a bare preferences row still gets sensible behavior.
function planWithinRadius(plan, providerLat, providerLng, radiusMiles) {
  const miles = haversineMiles(
    providerLat,
    providerLng,
    plan && plan.lat,
    plan && plan.lng
  );
  const r = Number.isFinite(Number(radiusMiles)) && Number(radiusMiles) > 0
    ? Number(radiusMiles)
    : 25;
  // miles === null means unknown → permissive pass (never-block).
  const withinRadius = miles == null ? true : miles <= r;
  return { withinRadius, miles };
}

module.exports = {
  EARTH_RADIUS_MILES,
  haversineMiles,
  planWithinRadius,
};

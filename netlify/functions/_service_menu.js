// ============================================================================
// netlify/functions/_service_menu.js
//
// Pure job → item_key matcher. Sibling to _taxonomy.js and _eligibility.js,
// same "single source of truth for one decision" posture — underscore-
// prefixed (not a handler), require()d into consumers at build time.
//
// USED BY (planned):
//   - Phase 4 notify engine's job → item_key match step. If matchItem()
//     returns a key AND a provider has a provider_rate_card_items row for
//     that key AND passes the existing service-fit + distance filters,
//     the notify engine will fire a "here's a matching job at your posted
//     price" push. No caller yet — this module is Phase 3 groundwork.
//   - The eventual ops query "how many currently-open jobs would fire?"
//     (matchStats).
//
// THE CATALOG THIS MATCHES AGAINST:
//   The 22 item_keys seeded by supabase/migrations/20260921a_service_menu_items.sql
//   (Phase 2). Pull the canonical list from that migration, don't re-derive
//   it here — if the catalog grows, we add a matcher in this file at the
//   same time as the migration adds the row.
//
// THE CRITICAL DIFFERENCE FROM _taxonomy.serviceTypeToCategory():
//   That function always returns a category (falls back to 'other') because
//   every plan needs *some* category for the service-fit filter. This
//   matcher does the opposite — it must be strict, not permissive:
//     - exactly one item_key hits  → return it
//     - zero items hit             → return null (no match)
//     - two+ items hit             → return null (ambiguous)
//   Ambiguous means "not eligible for the prefill-notify shortcut." Those
//   jobs still show up on the normal Job Board — this function only gates
//   the shortcut, it's not the only way a provider sees a job.
//
//   In particular: a plan title matching a category (e.g. "brake job" →
//   maintenance) but no specific item within it MUST return null. Do not
//   default to "the most common item in that category." Same never-guess
//   rule.
//
// WITHIN A FAMILY:
//   - oil_change_conventional vs oil_change_synthetic: only fires when the
//     plan says "synthetic" or "conventional" explicitly. Bare "oil change"
//     → null.
//   - brake_pads_front vs brake_pads_rear vs brake_rotors: only fires when
//     front/rear/rotors is explicit. Bare "brakes"/"brake job" → null.
//   - tire_rotation vs tire_replacement: only fires when rotation OR
//     replacement/new/replace/install is explicit. Bare "tires" → null.
//   - full_detail vs interior_detail vs exterior_detail: only fires when
//     the SIDE is unambiguous. "Interior detail" (no exterior) →
//     interior_detail; "interior + exterior detail" → full_detail; bare
//     "detail" → null.
//   - multi_point_inspection vs inspection_state: bare "inspection" → null;
//     "state/safety/annual/emissions inspection" → inspection_state;
//     "multi-point" → multi_point_inspection. A title mentioning both
//     ("multi-point safety inspection") is ambiguous → null.
//
// SHORT-TOKEN BOUNDARIES:
//   'ac' is the risky short token in this catalog (used by ac_recharge).
//   It appears inside "package", "diagnostic", "accident" etc. The wordIn
//   helper (mirrored from _taxonomy.js) treats anything outside [a-z0-9]
//   as a boundary — same trick used there for 'ev','rv','led','hid'.
// ============================================================================
'use strict';

// Substring check — same as _taxonomy.js's `has` helper.
function hasIn(text, ...substrs) {
  for (const s of substrs) if (text.includes(s)) return true;
  return false;
}

// Boundary-aware short-token check. Anything outside [a-z0-9] is a boundary
// — same regex trick as _taxonomy.js's `word` helper. Guards 'ac' against
// substring hits inside 'package'/'diagnostic'/'accident'.
function wordIn(text, ...tokens) {
  for (const k of tokens) {
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp('(?:^|[^a-z0-9])' + esc + '(?:[^a-z0-9]|$)').test(text)) return true;
  }
  return false;
}

// Per-item matcher. Each returns true iff the normalized lowercase text
// unambiguously indicates that specific item_key. The strictness lives
// inside each matcher — the caller just runs all 22 and checks the size
// of the hit set (0/1/many → null/key/null).
//
// The "why" for each matcher's keyword choices is spelled out inline. If
// you add or edit one, keep the comment.
const MATCHERS = {
  // ─── maintenance (15) ────────────────────────────────────────────────────

  // Requires "synthetic" (any form: synthetic/full synthetic/synth) AND
  // an oil-change context ("oil change" phrase, or "oil" together with
  // "change"/"service"). Bare "oil change" without synthetic/conventional
  // signal deliberately doesn't fire — that's the classic ambiguity case.
  oil_change_synthetic: (t) =>
    hasIn(t, 'synthetic oil', 'full-synthetic', 'full synthetic') ||
    (hasIn(t, 'synthetic') && hasIn(t, 'oil change')),

  oil_change_conventional: (t) =>
    hasIn(t, 'conventional oil') ||
    (hasIn(t, 'conventional') && hasIn(t, 'oil change')),

  // Brakes split three ways. "front brake"/"front pad" → front pads;
  // "rear brake"/"rear pad" → rear pads; anything with "rotor" → rotors.
  // Bare "brakes"/"brake job"/"new brakes" hits none of these → null.
  // Compound cases ("front brake pads and rotors") hit two matchers →
  // null via the ambiguity rule in matchItem.
  brake_pads_front: (t) => hasIn(t, 'front brake', 'front pad', 'brake pads front'),
  brake_pads_rear:  (t) => hasIn(t, 'rear brake', 'rear pad', 'brake pads rear'),
  brake_rotors:     (t) => hasIn(t, 'rotor'),

  // Tire rotation vs replacement. "tires" alone is deliberately ambiguous
  // (rotation? replacement?) → null. "tire" as a bare token also risks
  // false positives inside "entire"/"retire" — hence the explicit phrases.
  tire_rotation: (t) =>
    hasIn(t, 'tire rotation', 'tire rotations', 'rotate tire', 'rotating tire', 'rotate my tire'),
  tire_replacement: (t) =>
    hasIn(t, 'new tire', 'replace tire', 'tire replacement', 'buy tire', 'install tire',
             'set of tires', 'four tires', '4 tires', 'need tires', 'need new tires'),

  // "alignment" is a distinctive enough word to use as a substring match
  // (no risk of hitting "malignant" in a car-plan title).
  alignment_4wheel: (t) => hasIn(t, 'alignment', 'aligned'),

  // Battery replacement fires on explicit replacement phrasing. "Battery
  // pack replacement" (EV-adjacent) will also fire, which is a known
  // false positive — the plan's ev_hybrid category prevents an actual
  // notify to a maintenance-only provider at the service-fit stage, so
  // it doesn't misfire in production.
  battery_replacement: (t) =>
    hasIn(t, 'battery replacement', 'new battery', 'replace battery',
             'battery install', 'dead battery', 'battery died', 'jump start'),

  // AC — 'ac' is the risky short token in this catalog. Only fire when
  // 'recharge' is explicit (with any AC context), or when 'freon' /
  // 'refrigerant' is explicit. "Air conditioning repair" / "AC not
  // working" is deliberately null — those aren't specifically recharge
  // jobs. wordIn guards 'ac' against substring hits inside 'package',
  // 'diagnostic', 'accident'.
  ac_recharge: (t) =>
    hasIn(t, 'freon', 'refrigerant') ||
    (hasIn(t, 'recharge') && (wordIn(t, 'ac') || hasIn(t, 'a/c', 'air conditioning'))),

  coolant_flush: (t) =>
    hasIn(t, 'coolant flush', 'coolant service', 'antifreeze flush', 'antifreeze service',
             'radiator flush') ||
    (hasIn(t, 'coolant') && hasIn(t, 'flush', 'change', 'service')),

  transmission_service: (t) =>
    hasIn(t, 'transmission service', 'transmission flush', 'transmission fluid',
             'trans flush', 'trans fluid', 'transmission oil'),

  // Check-engine diagnostic. Deliberately narrower than "any diagnostic":
  // engine-noise diagnostics, brake diagnostics, AC diagnostics all
  // resolve to null (they map to different work). The catalog is 22
  // items — a match-anything "diagnostic" bucket would false-positive on
  // half of them.
  diagnostic_check_engine: (t) =>
    hasIn(t, 'check engine', 'check-engine', 'engine light', 'engine code',
             'trouble code', 'error code', 'obd', 'obd-ii', 'obd2', 'p0'),

  multi_point_inspection: (t) => hasIn(t, 'multi-point', 'multi point', 'multipoint'),

  // State inspection covers the various state-mandated inspection names.
  // Bare "inspection" doesn't fire (ambiguous with multi-point).
  inspection_state: (t) =>
    hasIn(t, 'state inspection', 'safety inspection', 'emissions inspection',
             'annual inspection', 'dmv inspection', 'yearly inspection', 'nj inspection'),

  // ─── detailing (5) ───────────────────────────────────────────────────────

  // Full detail hits when the plan says "full detail" / "complete detail"
  // OR when interior AND exterior are BOTH mentioned around "detail". The
  // interior_detail / exterior_detail matchers require the OPPOSITE side
  // to be absent, so full_detail is the sole hit for compound titles.
  full_detail: (t) =>
    hasIn(t, 'full detail', 'complete detail', 'full car detail', 'inside and out',
             'inside & out', 'in and out') ||
    (hasIn(t, 'interior') && hasIn(t, 'exterior') && hasIn(t, 'detail')),

  interior_detail: (t) => hasIn(t, 'interior detail') && !hasIn(t, 'exterior'),
  exterior_detail: (t) => hasIn(t, 'exterior detail') && !hasIn(t, 'interior'),

  // 'ceramic' is distinctive enough to substring-match; 'coating' by
  // itself is not (could be paint coating, undercoating, etc).
  ceramic_coating: (t) =>
    hasIn(t, 'ceramic coating', 'ceramic pro', 'ceramic sealant') ||
    (hasIn(t, 'ceramic') && hasIn(t, 'coat')),

  headlight_restoration: (t) =>
    hasIn(t, 'headlight restoration', 'restore headlight', 'restore my headlight',
             'cloudy headlight', 'yellow headlight', 'yellowed headlight',
             'foggy headlight', 'oxidized headlight', 'hazy headlight'),

  // ─── cosmetic (2) ────────────────────────────────────────────────────────

  // Small dent removal / PDR. Explicit dent-removal phrasing plus the PDR
  // acronym (bounded to avoid false positives — 'pdr' inside a longer word
  // would be very unusual, but wordIn is cheap insurance).
  dent_removal_small: (t) =>
    hasIn(t, 'dent removal', 'dent repair', 'paintless dent', 'small dent',
             'minor dent', 'ding removal') ||
    wordIn(t, 'pdr'),

  // Paint touch-up on chips/scratches. Distinct from full accident_repair
  // paint work by scale — "touch up" implies pen/spot-level, not panel.
  paint_touch_up: (t) =>
    hasIn(t, 'touch up', 'touch-up', 'touchup') ||
    hasIn(t, 'paint chip', 'chip repair', 'stone chip', 'rock chip'),
};

// Internal: returns the raw hit set for a plan. matchStats needs the
// distinction between "0 hits" and "≥2 hits" (no_match vs ambiguous), which
// matchItem collapses to a single null. Keep this one function so the two
// public entry points can't drift on the underlying logic.
function _hitSet(plan) {
  if (!plan || typeof plan !== 'object') return [];
  const parts = [];
  if (typeof plan.title === 'string') parts.push(plan.title);
  if (Array.isArray(plan.service_types)) {
    for (const s of plan.service_types) if (typeof s === 'string' && s) parts.push(s);
  }
  const text = parts.join(' ').toLowerCase().trim();
  if (!text) return [];

  const hits = [];
  for (const key of Object.keys(MATCHERS)) {
    if (MATCHERS[key](text)) hits.push(key);
  }
  return hits;
}

// Public. Strict: exactly one hit → the item_key; zero or many → null.
function matchItem(plan) {
  const hits = _hitSet(plan);
  return hits.length === 1 ? hits[0] : null;
}

// Bulk / diagnostic. Not used by any live path yet — this is for Phase 4's
// own verification, and for the eventual ops query "how many currently-open
// jobs would fire the notify engine?". Thin wrapper over _hitSet — no
// duplicated logic to drift.
function matchStats(plans) {
  const out = { matched: 0, ambiguous: 0, no_match: 0, by_item_key: {} };
  if (!Array.isArray(plans)) return out;
  for (const p of plans) {
    const hits = _hitSet(p);
    if (hits.length === 0) {
      out.no_match++;
    } else if (hits.length > 1) {
      out.ambiguous++;
    } else {
      out.matched++;
      const k = hits[0];
      out.by_item_key[k] = (out.by_item_key[k] || 0) + 1;
    }
  }
  return out;
}

// ITEM_KEYS: authoritative list, so consumers (Phase 4 notify engine, tests,
// diagnostics) don't need to keep their own copy. Order matches the
// 20260921a seed. Do not sort — the seed's order is meaningful for the
// diagnostic queries.
const ITEM_KEYS = Object.freeze([
  'oil_change_conventional', 'oil_change_synthetic',
  'brake_pads_front', 'brake_pads_rear', 'brake_rotors',
  'tire_rotation', 'tire_replacement',
  'alignment_4wheel', 'battery_replacement',
  'ac_recharge', 'coolant_flush', 'transmission_service',
  'diagnostic_check_engine', 'multi_point_inspection', 'inspection_state',
  'full_detail', 'interior_detail', 'exterior_detail',
  'ceramic_coating', 'headlight_restoration',
  'dent_removal_small', 'paint_touch_up',
]);

module.exports = { matchItem, matchStats, ITEM_KEYS };

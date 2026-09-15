// ============================================================================
// netlify/functions/_taxonomy.js
// SINGLE SOURCE OF TRUTH for service categories (Phase 2.6.1, 2026-09-16).
//
// Before this module there were three vocabularies:
//   1. the 20-category member form (<select id="p-category"> + the AI helpers)
//   2. care_plans.service_types — one free-text/legacy code per plan
//   3. the 8 provider "match buckets" in provider_match_preferences
// and _eligibility.js bridged (2) → (3) by keyword-sniffing, which silently
// dropped audio / lighting / interior / EV / classic / motorcycle / RV / marine
// work into "other" and broadcast it to every provider.
//
// From here on, the 20 categories below are used everywhere: the member form,
// care_plans.categories, provider_match_preferences.match_categories, the Job
// Board / Browse Packages filters, the bid gate, and the AI prompts.
//
// IMPORTED BY (server): _eligibility.js, provider-match-preferences.js,
//   ai-describe-to-package.js, ai-care-plan.js, agent-matchmaker.js.
// MIRRORED BY (browser): www/mcc-taxonomy.js — the test in
//   __tests__/taxonomy.test.js asserts the two lists are identical, so edit
//   BOTH files together.
//
// Underscore prefix = not a Netlify handler; esbuild bundles it into each
// consumer at build time.
// ============================================================================
'use strict';

// Order matters only for display. Values are the canonical slugs stored in
// care_plans.categories and provider_match_preferences.match_categories.
const CATEGORIES = [
  'maintenance', 'manufacturer_service', 'detailing', 'cosmetic',
  'accident_repair', 'performance', 'audio_electronics', 'lighting',
  'interior', 'offroad', 'ev_hybrid', 'classic_vintage', 'fleet_graphics',
  'premium_protection', 'convertible_specialty', 'motorcycle', 'rv_camper',
  'boat_marine', 'snow_removal', 'other',
];

const CATEGORY_LABELS = {
  maintenance:            'Maintenance & Mechanical',
  manufacturer_service:   'Manufacturer Service Packages',
  detailing:              'Detailing & Cleaning',
  cosmetic:               'Cosmetic & Body',
  accident_repair:        'Accident / Insurance Repair',
  performance:            'Performance & Modifications',
  audio_electronics:      'Audio & Electronics',
  lighting:               'Lighting & Accessories',
  interior:               'Interior & Upholstery',
  offroad:                'Off-Road & Specialty',
  ev_hybrid:              'EV & Hybrid Services',
  classic_vintage:        'Classic & Vintage Cars',
  fleet_graphics:         'Fleet & Commercial Graphics',
  premium_protection:     'Premium Protection (PPF/Coating)',
  convertible_specialty:  'Convertible & Specialty',
  motorcycle:             'Motorcycle Services',
  rv_camper:              'RV & Camper Services',
  boat_marine:            'Boat & Marine Services',
  snow_removal:           'Snow Removal Services',
  other:                  'Other',
};

// Display groups — used by provider onboarding/settings and (2.7) the member
// picker so the non-mechanical trades are visibly first-class.
const CATEGORY_GROUPS = [
  { key: 'mechanical', label: 'Mechanical & Service',
    categories: ['maintenance', 'manufacturer_service', 'performance', 'ev_hybrid', 'offroad', 'classic_vintage'] },
  { key: 'appearance', label: 'Appearance & Protection',
    categories: ['detailing', 'cosmetic', 'accident_repair', 'premium_protection', 'fleet_graphics'] },
  { key: 'specialty', label: 'Electronics, Interior & Specialty',
    categories: ['audio_electronics', 'lighting', 'interior', 'convertible_specialty', 'motorcycle', 'rv_camper', 'boat_marine', 'snow_removal', 'other'] },
];

// One-line hints for the AI prompts (moved here from ai-describe-to-package.js
// so both AI helpers share them).
const CATEGORY_HINTS = {
  maintenance:           'routine mechanical work, oil changes, brakes, tires, engine/transmission issues, check engine light, inspections, A/C',
  manufacturer_service:  'factory-scheduled maintenance, recalls, warranty service',
  detailing:             'washing, waxing, interior cleaning, full detail, paint correction, pre-sale prep',
  cosmetic:              'dents, scratches, paint chips, bumper/body cosmetic repair (non-collision)',
  accident_repair:       'collision damage, insurance claims, structural body work, glass/windshield',
  performance:           'tuning, exhaust, suspension, aftermarket performance parts',
  audio_electronics:     'stereo, speakers, infotainment/CarPlay, dash cams, wiring, electronics installs',
  lighting:              'headlights, taillights, underglow, LED/HID upgrades, lighting repair',
  interior:              'upholstery, seats, carpet, headliner, dash repair/replacement',
  offroad:               'lift kits, off-road tires/suspension, trail prep',
  ev_hybrid:             'EV/hybrid-specific service (battery, charging, drivetrain)',
  classic_vintage:       'restoration or service of classic/vintage vehicles',
  fleet_graphics:        'fleet vehicle wraps, decals, commercial graphics',
  premium_protection:    'PPF, ceramic coating, window tint, paint protection',
  convertible_specialty: 'convertible tops and specialty mechanisms',
  motorcycle:            'motorcycle service or repair',
  rv_camper:             'RV or camper service or repair',
  boat_marine:           'boat or marine vessel service or repair',
  snow_removal:          'snow plowing/removal for a property',
  other:                 "anything that doesn't clearly fit above",
};

function categoryHintsText() {
  return CATEGORIES.map(c => `- ${c}: ${CATEGORY_HINTS[c]}`).join('\n');
}

// ---------------------------------------------------------------------------
// Legacy 8-bucket compatibility (provider_match_preferences before 2.6.1).
// The backfill migration expands stored buckets to explicit categories using
// exactly this map; the runtime keeps it for any row the migration missed.
// ---------------------------------------------------------------------------
const LEGACY_BUCKETS = [
  'maintenance', 'manufacturer_service', 'accident_repair',
  'performance', 'cosmetic', 'offroad', 'snow_removal', 'other',
];

const LEGACY_BUCKET_TO_CATEGORIES = {
  maintenance:          ['maintenance'],
  manufacturer_service: ['manufacturer_service'],
  accident_repair:      ['accident_repair'],
  performance:          ['performance'],
  cosmetic:             ['cosmetic', 'detailing', 'premium_protection', 'fleet_graphics'],
  offroad:              ['offroad'],
  snow_removal:         ['snow_removal'],
  other:                ['other', 'audio_electronics', 'lighting', 'interior', 'ev_hybrid',
                         'classic_vintage', 'convertible_specialty', 'motorcycle', 'rv_camper', 'boat_marine'],
};

const CATEGORY_SET = new Set(CATEGORIES);
function isCategory(x) { return typeof x === 'string' && CATEGORY_SET.has(x); }

// Validate + de-duplicate an array of slugs; unknown values are dropped.
function normalizeCategories(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const c of arr) {
    const s = typeof c === 'string' ? c.trim().toLowerCase() : '';
    if (isCategory(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Keyword classifier for legacy care_plans.service_types values (mixed vocab
// in prod: snake_case codes like 'oil_change' AND verbose like 'Oil Change',
// plus the 20 slugs themselves once members-packages.js writes them).
// Superset of the old _eligibility.serviceTypesToBuckets rules — every string
// the old code sent to 'maintenance'/'accident_repair'/... still goes there,
// and the non-mechanical trades that used to fall through to 'other' now get
// a real category. Priority order is deliberate: exact slug → specialty
// vehicles (they win over the work type) → appearance → electronics →
// mechanical → fallthrough. Mirrored in SQL by
// public.mcc_service_type_to_category() in the 20260920a migration.
// ---------------------------------------------------------------------------
function serviceTypeToCategory(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (CATEGORY_SET.has(s)) return s;

  const has = (...ks) => ks.some(k => s.includes(k));
  // Whole-word match for short tokens that are substrings of common words
  // ('ev' in "every", 'rv' in "service", 'led' in "scheduled", 'hid' in
  // "hidden", 'ac' in "accident"). Anything outside [a-z0-9] is a boundary.
  const word = (...ks) => ks.some(k =>
    new RegExp('(?:^|[^a-z0-9])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:[^a-z0-9]|$)').test(s));
  const hasAc = word('ac') || s.includes('a/c');

  // Specialty vehicles first — "motorcycle oil change" is a motorcycle job.
  if (has('motorcycle', 'scooter') || word('moto'))              return 'motorcycle';
  if (has('camper', 'motorhome') || word('rv'))                  return 'rv_camper';
  if (has('boat', 'marine', 'outboard', 'jet ski', 'jetski'))    return 'boat_marine';
  if (has('classic', 'vintage'))                                 return 'classic_vintage';
  if (has('convertible', 'soft top', 'softtop'))                 return 'convertible_specialty';
  if (has('snow', 'plow'))                                       return 'snow_removal';

  // Appearance & protection. NOTE: the legacy rules sent body/collision/
  // paint/dent/glass/windshield to accident_repair and detail/wrap/tint to
  // the old 'cosmetic' bucket; those assignments are preserved (or map to
  // the categories the backfill expands that bucket into) so providers who
  // set preferences before 2.6.1 keep seeing the same jobs.
  if (has('paint protection', 'ceramic', 'coating', 'tint') || word('ppf'))   return 'premium_protection';
  if (has('fleet', 'decal', 'graphic', 'livery', 'wrap'))                      return 'fleet_graphics';
  if (has('detail', 'wax', 'polish', 'paint correction', 'odor') ||
      word('wash', 'washing'))                                                 return 'detailing';
  if (has('collision', 'accident', 'insurance', 'structural', 'glass',
          'windshield', 'paint') || word('body', 'dent', 'dents', 'dented'))    return 'accident_repair';
  if (has('scratch', 'chip', 'touch up', 'touch-up', 'bumper', 'cosmetic') ||
      word('ding', 'dings'))                                                   return 'cosmetic';

  // Electronics, lighting, interior
  if (has('audio', 'stereo', 'speaker', 'subwoofer', 'amplifier', 'infotainment',
          'carplay', 'android auto', 'dash cam', 'dashcam', 'remote start',
          'alarm', 'backup camera', 'electronics'))                            return 'audio_electronics';
  if (has('headlight', 'taillight', 'tail light', 'underglow', 'bulb') ||
      word('light', 'lights', 'lighting', 'led', 'leds', 'hid'))               return 'lighting';
  if (has('upholster', 'carpet', 'headliner', 'interior') || word('seat', 'seats')) return 'interior';

  // Mechanical & service
  if (has('electric vehicle', 'hybrid', 'charging', 'battery pack', 'high voltage') ||
      word('ev', 'evs'))                                                       return 'ev_hybrid';
  if (has('off-road', 'offroad') || word('lift', 'lifted', 'trail', 'trails'))  return 'offroad';
  if (has('exhaust', 'suspension', 'performance', 'tuning', 'turbo',
          'supercharger', 'intake'))                                           return 'performance';
  if (has('warranty', 'manufacturer', 'scheduled', 'recall', 'dealership'))    return 'manufacturer_service';
  if (has('brake', 'fluid', 'battery', 'transmission', 'engine', 'diagnos',
          'alignment', 'coolant', 'spark', 'filter', 'inspection', 'multi-point',
          'electrical', 'alternator', 'starter', 'radiator', 'belt', 'wiper',
          'repair', 'service', 'maintenance') ||
      word('oil', 'tire', 'tires', 'tyre', 'tyres', 'hose', 'hoses', 'tune') || hasAc) return 'maintenance';

  return 'other';
}

// Legacy array → distinct category array (order of first appearance).
function serviceTypesToCategories(types) {
  if (!Array.isArray(types) || types.length === 0) return [];
  const out = [];
  for (const t of types) {
    const c = serviceTypeToCategory(t);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

// The one function consumers should call. Prefers the explicit
// care_plans.categories column (written by the member form since 2.6.1 and
// by the backfill migration for older rows); falls back to classifying the
// legacy service_types array; empty → [] (which every consumer treats as
// "no service-fit signal → visible to all", unchanged behaviour).
function planCategories(plan) {
  if (!plan) return [];
  const explicit = normalizeCategories(plan.categories);
  if (explicit.length) return explicit;
  return serviceTypesToCategories(plan.service_types);
}

// Provider preference array → effective category set. Rows written before
// 2.6.1 may still hold legacy buckets whose meaning was wider than the
// same-named category ('cosmetic' meant detail/wrap/tint too; 'other' meant
// every unlisted trade). Expand those so no provider silently loses matches.
// Rows written by the widened UI are already explicit and pass through.
function expandProviderCategories(prefs) {
  if (!Array.isArray(prefs)) return [];
  const out = new Set();
  for (const p of prefs) {
    const s = typeof p === 'string' ? p.trim().toLowerCase() : '';
    if (!s) continue;
    if (s === 'cosmetic' || s === 'other') {
      // Ambiguous: legacy bucket or explicit category? If the row already
      // carries any of the bucket's expanded members it was written by the
      // new UI → keep literal. Otherwise treat as legacy and expand.
      const members = LEGACY_BUCKET_TO_CATEGORIES[s];
      const explicitlyNew = prefs.some(q => members.slice(1).includes(String(q).toLowerCase()));
      (explicitlyNew ? [s] : members).forEach(c => out.add(c));
    } else if (isCategory(s)) {
      out.add(s);
    }
  }
  return Array.from(out);
}

function hasCategoryOverlap(planCats, providerCats) {
  if (!planCats.length) return true;            // no signal → visible to all
  if (!providerCats.length) return false;       // provider declared nothing
  const set = new Set(providerCats);
  return planCats.some(c => set.has(c));
}

module.exports = {
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_GROUPS,
  CATEGORY_HINTS,
  categoryHintsText,
  LEGACY_BUCKETS,
  LEGACY_BUCKET_TO_CATEGORIES,
  isCategory,
  normalizeCategories,
  serviceTypeToCategory,
  serviceTypesToCategories,
  planCategories,
  expandProviderCategories,
  hasCategoryOverlap,
};

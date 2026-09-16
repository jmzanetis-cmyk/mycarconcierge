// ============================================================================
// netlify/functions/__tests__/service_menu.test.js — Phase 3
//
// Zero-dependency test (plain `node`). Run from the repo root:
//   node netlify/functions/__tests__/service_menu.test.js
//
// Covers:
//   1. Every one of the 22 item_keys in the Phase 2 catalog has at least one
//      real-looking care_plans title that matches it cleanly.
//   2. Genuinely ambiguous cases (multi-service, bare category, zero
//      overlap) return null — never a "best guess" default.
//   3. Short-token boundaries do not misfire the way _taxonomy.js's own
//      test file checks for. Specifically 'ac' inside package/diagnostic/
//      accident/etc. must not fire ac_recharge without an actual recharge
//      keyword, and 'oil' inside 'coil' / 'tire' inside 'entire' must not
//      fire the corresponding items.
//   4. matchStats returns correct {matched, ambiguous, no_match, by_item_key}
//      counts on a small fixture that exercises all three outcomes.
//   5. ITEM_KEYS mirrors the migration's seeded 22 keys — cheap guard
//      against the file drifting from the catalog.
//
// The test runner is the same t(name, fn)/passed pattern used by
// taxonomy.test.js — grep-able output, no framework dependency.
// ============================================================================
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const menu = require('../_service_menu');
const { matchItem, matchStats, ITEM_KEYS } = menu;

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error(`✗ ${name}\n   ${e.message}`); process.exitCode = 1; return; }
  console.log(`✓ ${name}`);
}

// ─── 1. Every item_key has real-looking titles that match cleanly ─────────
t('every item_key in the Phase 2 catalog has at least one clean-match title', () => {
  // Title style mirrors the Q2 corpus phrasing: verbs at the front ("Rotate
  // my tires"), noun-first fragments ("Squeaking front brakes"), some with
  // vehicle context. Exactly ONE title per item_key must match that key
  // and no other. Multi-title arrays exist for items with a few different
  // phrasings — every title in each array must resolve to the same key.
  const fixtures = {
    oil_change_conventional: [
      'Conventional oil change on my Camry',
      'Need a conventional oil change',
      'Oil change - conventional please',
    ],
    oil_change_synthetic: [
      'Full synthetic oil change',
      'Synthetic oil change overdue',
      'Full-synthetic oil service',
    ],
    brake_pads_front: [
      'Front brake pads replacement',
      'Squeaking front brakes',
      'Replace front pads',
    ],
    brake_pads_rear: [
      'Rear brake pads',
      'Rear pads worn out',
    ],
    brake_rotors: [
      'Warped brake rotors',
      'Need new rotors',
      'Rotor replacement',
    ],
    tire_rotation: [
      'Tire rotation service',
      'Rotate my tires please',
    ],
    tire_replacement: [
      'Need new tires',
      'Replace tires all around',
      'Install four tires',
      'Set of tires needed',
    ],
    alignment_4wheel: [
      '4-wheel alignment',
      'Wheel alignment please',
      'Alignment overdue',
    ],
    battery_replacement: [
      'Battery replacement needed',
      'Dead battery, need a new one',
      'Replace battery',
    ],
    ac_recharge: [
      'A/C recharge please',
      'AC recharge - blowing warm',
      'Freon top-up',
      'Refrigerant recharge',
    ],
    coolant_flush: [
      'Coolant flush overdue',
      'Antifreeze flush and service',
      'Radiator flush',
    ],
    transmission_service: [
      'Transmission service',
      'Trans fluid flush',
      'Transmission flush at 60k',
    ],
    diagnostic_check_engine: [
      'Check engine light is on',
      'Engine light came on',
      'Trouble code P0301',
      'OBD-II scan needed',
    ],
    multi_point_inspection: [
      'Multi-point inspection',
      'Full multipoint inspection',
    ],
    inspection_state: [
      'State inspection',
      'Annual safety inspection',
      'Emissions inspection',
      'NJ inspection due',
    ],
    full_detail: [
      'Full detail inside and out',
      'Complete detail',
      'Full car detail',
    ],
    interior_detail: [
      'Interior detail only',
      'Interior detail — car got dirty',
    ],
    exterior_detail: [
      'Exterior detail only',
      'Exterior detail after winter',
    ],
    ceramic_coating: [
      'Ceramic coating install',
      'Ceramic Pro package',
    ],
    headlight_restoration: [
      'Headlight restoration — cloudy',
      'Yellowed headlights',
      'Foggy headlight restoration',
    ],
    dent_removal_small: [
      'Small dent removal',
      'Paintless dent repair',
      'PDR needed on door',
    ],
    paint_touch_up: [
      'Paint touch-up on bumper',
      'Rock chip repair',
      'Paint chip touch up',
    ],
  };

  // First: the fixture must have an entry for every canonical item_key.
  const fixKeys = Object.keys(fixtures);
  for (const k of ITEM_KEYS) {
    assert.ok(fixKeys.includes(k), `no fixture for item_key ${k}`);
  }

  // Second: each title in each fixture array must resolve to exactly that key.
  // If a title matches multiple items, that's a bug in the matcher OR the
  // fixture — the assertion fails and points at the bad title.
  for (const [key, titles] of Object.entries(fixtures)) {
    for (const title of titles) {
      const got = matchItem({ title });
      assert.strictEqual(got, key,
        `title ${JSON.stringify(title)} should match ${key}, got ${got}`);
    }
  }
});

// ─── 2. Ambiguous / no-match cases return null ──────────────────────────
t('multi-service titles return null', () => {
  assert.strictEqual(matchItem({ title: 'Brakes and oil change' }), null);
  assert.strictEqual(matchItem({ title: 'Ceramic coating and interior detail' }), null);
  assert.strictEqual(matchItem({ title: 'Front brake pads and rotors' }), null);
  assert.strictEqual(matchItem({ title: 'Rear brake pads and rotors' }), null);
});

t('bare category-level titles return null', () => {
  // brake job — pads or rotors? front or rear?
  assert.strictEqual(matchItem({ title: 'Brake job' }), null);
  assert.strictEqual(matchItem({ title: 'New brakes' }), null);
  // bare "oil change" — synthetic or conventional?
  assert.strictEqual(matchItem({ title: 'Oil change' }), null);
  assert.strictEqual(matchItem({ title: 'Regular oil change' }), null);
  // bare "tires" — rotation or replacement?
  assert.strictEqual(matchItem({ title: 'Tires' }), null);
  // bare "detail" — full/interior/exterior?
  assert.strictEqual(matchItem({ title: 'Detail' }), null);
  assert.strictEqual(matchItem({ title: 'Car detail' }), null);
  // bare "inspection" — multi-point or state?
  assert.strictEqual(matchItem({ title: 'Inspection' }), null);
  // multi-point AND state inspection mentioned → ambiguous
  assert.strictEqual(matchItem({ title: 'Multi-point safety inspection' }), null);
});

t('titles with zero overlap with any catalog item return null', () => {
  assert.strictEqual(matchItem({ title: 'Full engine rebuild' }), null);
  assert.strictEqual(matchItem({ title: 'Custom exhaust fabrication' }), null);
  assert.strictEqual(matchItem({ title: 'Something entirely unrelated' }), null);
  assert.strictEqual(matchItem({ title: 'Xylophone tuning' }), null);
});

// ─── 3. Short-token boundaries do not misfire ───────────────────────────
t('short-token boundaries: "ac" inside common words must not fire ac_recharge', () => {
  // 'ac' inside 'package', 'diagnostic', 'accident' — no explicit recharge
  // keyword → matcher must not fire.
  assert.notStrictEqual(matchItem({ title: 'Diagnostic package' }), 'ac_recharge');
  assert.notStrictEqual(matchItem({ title: 'Accident damage repair' }), 'ac_recharge');
  // "Full detail package" would false-fire ac_recharge with a naïve
  // substring; it should resolve to full_detail (single hit).
  assert.strictEqual(matchItem({ title: 'Full detail package' }), 'full_detail');
});

t('short-token boundaries: "oil" inside "coil" must not fire oil_change_*', () => {
  // 'oil' as substring of 'coil' — matcher requires the phrase "oil
  // change" or the compound "synthetic oil" / "conventional oil", so
  // "Ignition coil replacement" should not fire either oil_change_*.
  assert.notStrictEqual(matchItem({ title: 'Ignition coil replacement' }), 'oil_change_conventional');
  assert.notStrictEqual(matchItem({ title: 'Ignition coil replacement' }), 'oil_change_synthetic');
  // Whole match: this shouldn't map to anything in the catalog.
  assert.strictEqual(matchItem({ title: 'Ignition coil replacement' }), null);
});

t('short-token boundaries: "tire" inside "entire" must not fire tire_*', () => {
  // 'tire' as substring of 'entire'. Both tire matchers use explicit
  // phrases, so this should not misfire.
  assert.notStrictEqual(matchItem({ title: 'Entire brake inspection' }), 'tire_rotation');
  assert.notStrictEqual(matchItem({ title: 'Entire brake inspection' }), 'tire_replacement');
});

t('AC-adjacent titles without an actual recharge keyword return null', () => {
  // 'AC not working' isn't specifically a recharge — could be compressor,
  // leak, wiring. The matcher deliberately doesn't guess.
  assert.strictEqual(matchItem({ title: 'AC not working' }), null);
  assert.strictEqual(matchItem({ title: 'A/C repair' }), null);
  assert.strictEqual(matchItem({ title: 'Diagnose AC issue' }), null);
});

t('"AC recharge" and "A/C recharge" both fire ac_recharge cleanly', () => {
  assert.strictEqual(matchItem({ title: 'AC recharge' }), 'ac_recharge');
  assert.strictEqual(matchItem({ title: 'A/C recharge please' }), 'ac_recharge');
  assert.strictEqual(matchItem({ title: 'Air conditioning recharge' }), 'ac_recharge');
});

// ─── 4. matchStats: outcome buckets ─────────────────────────────────────
t('matchStats returns correct counts on a mixed fixture', () => {
  // ambiguous = 2+ matchers hit (the title unambiguously names two catalog
  // items). no_match = zero matchers hit ("oil change" alone matches
  // neither oil_change_synthetic nor oil_change_conventional under the
  // strict design — that's a no_match at the item level, even though a
  // human would call it "ambiguous between two items").
  const plans = [
    { title: 'Full synthetic oil change' },     // matched: oil_change_synthetic
    { title: 'Full synthetic oil change' },     // matched: oil_change_synthetic (dup)
    { title: 'Front brake pads' },              // matched: brake_pads_front
    { title: 'PDR needed' },                    // matched: dent_removal_small
    { title: 'Front brake pads and rotors' },   // ambiguous: pads_front + rotors
    { title: 'Full detail with ceramic coating' }, // ambiguous: full_detail + ceramic_coating
    { title: 'Oil change' },                    // no_match: neither oil matcher fires
    { title: 'Full engine rebuild' },           // no_match
    { title: 'Xylophone tuning' },              // no_match
  ];
  const s = matchStats(plans);
  assert.strictEqual(s.matched, 4, `matched (got ${s.matched})`);
  assert.strictEqual(s.ambiguous, 2, `ambiguous (got ${s.ambiguous})`);
  assert.strictEqual(s.no_match, 3, `no_match (got ${s.no_match})`);
  assert.strictEqual(s.by_item_key.oil_change_synthetic, 2);
  assert.strictEqual(s.by_item_key.brake_pads_front, 1);
  assert.strictEqual(s.by_item_key.dent_removal_small, 1);
});

t('matchStats handles empty / non-array input without throwing', () => {
  assert.deepStrictEqual(matchStats([]), { matched: 0, ambiguous: 0, no_match: 0, by_item_key: {} });
  assert.deepStrictEqual(matchStats(null), { matched: 0, ambiguous: 0, no_match: 0, by_item_key: {} });
  assert.deepStrictEqual(matchStats(undefined), { matched: 0, ambiguous: 0, no_match: 0, by_item_key: {} });
});

// ─── 5. ITEM_KEYS must mirror the seed migration (when present) ─────────
t('ITEM_KEYS mirrors the 22 keys in 20260921a_service_menu_items.sql', () => {
  // This branch was cut off main; the Phase 2 migration lives on a sibling
  // branch (feat/autobid-phase2-rate-card). When the branches are merged
  // back together, the migration will be on disk and this test will
  // verify ITEM_KEYS matches the seed. On the standalone Phase 3 branch,
  // the migration is absent — the check is a no-op (with a console note).
  const migrationPath = path.join(
    __dirname, '../../../supabase/migrations/20260921a_service_menu_items.sql'
  );
  if (!fs.existsSync(migrationPath)) {
    console.log('    (skipped: Phase 2 migration not on this branch)');
    // The catalog length is still checkable from the constant itself.
    assert.strictEqual(ITEM_KEYS.length, 22, 'ITEM_KEYS must have 22 keys');
    return;
  }
  const migration = fs.readFileSync(migrationPath, 'utf8');
  // Match seed rows by their full shape ("('<item_key>', '<category>'...").
  // Earlier version split() on the word VALUES, which also matched the
  // English phrase "current seed values" in the migration header and gave
  // the wrong slice. The full-row pattern won't match anything inside a
  // prose comment.
  const rows = [...migration.matchAll(
    /^\s*\('([a-z0-9_]+)',\s*'(maintenance|detailing|cosmetic)'/gim
  )].map(m => m[1]);
  assert.strictEqual(rows.length, 22, `expected 22 seeded keys, got ${rows.length}`);
  assert.deepStrictEqual([...ITEM_KEYS].sort(), [...rows].sort(), 'ITEM_KEYS and seed drift');
});

// ─── 6. Bad input hygiene ───────────────────────────────────────────────
t('non-string / empty inputs return null', () => {
  assert.strictEqual(matchItem(null), null);
  assert.strictEqual(matchItem(undefined), null);
  assert.strictEqual(matchItem({}), null);
  assert.strictEqual(matchItem({ title: '' }), null);
  assert.strictEqual(matchItem({ title: 123 }), null);
  assert.strictEqual(matchItem({ title: null }), null);
});

t('service_types array contributes to the match', () => {
  // Empty/generic title, but service_types indicates the specific item.
  assert.strictEqual(
    matchItem({ title: 'Vehicle service', service_types: ['synthetic oil change'] }),
    'oil_change_synthetic'
  );
  // service_types with a plain slug that a matcher recognizes.
  assert.strictEqual(
    matchItem({ title: 'Service', service_types: ['multi-point inspection'] }),
    'multi_point_inspection'
  );
});

// ─── 7. Multi-service ambiguity resolution ──────────────────────────────
t('two distinct catalog items in one title → null (never picks one)', () => {
  // Even though PDR and touch-up are related (small cosmetic), they're
  // distinct catalog items → ambiguous.
  assert.strictEqual(matchItem({ title: 'PDR and paint touch-up' }), null);
  // Full detail + ceramic coating.
  assert.strictEqual(matchItem({ title: 'Full detail with ceramic coating' }), null);
  // Rotation + replacement.
  assert.strictEqual(matchItem({ title: 'Tire rotation and new tires' }), null);
});

// ─── 8. Family within-boundary: "alignment after new tires" edge case ───
t('titles that mention two families should NOT resolve to one arbitrarily', () => {
  // "Alignment check after new tires" hits alignment_4wheel AND
  // tire_replacement — two hits → null. This is the correct posture:
  // matcher never guesses "which is the primary work" when both are
  // priced-separately catalog items.
  const r = matchItem({ title: 'Alignment check after new tires' });
  assert.strictEqual(r, null,
    `two-family title should return null (got ${r})`);
});

console.log(`\n${passed} test group(s) passed${process.exitCode ? ', with failures above' : ''}.`);

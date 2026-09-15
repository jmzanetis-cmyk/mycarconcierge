// ============================================================================
// netlify/functions/__tests__/taxonomy.test.js — Phase 2.6.1
//
// Zero-dependency test (plain `node`). Run from the repo root:
//   node netlify/functions/__tests__/taxonomy.test.js
//
// Covers:
//   1. www/mcc-taxonomy.js mirrors _taxonomy.js exactly (CATEGORIES, LABELS,
//      GROUPS) — the browser and server can never disagree on the vocabulary.
//   2. Every one of the 20 categories round-trips: plan.categories → provider
//      preference → isServiceFit true; any other single preference → false.
//   3. Legacy service_types strings still classify the way the old 8-bucket
//      code did for mechanical/collision/etc., AND the trades that used to
//      fall through to 'other' now land in a real category.
//   4. Legacy provider preference rows ('cosmetic', 'other' buckets) still
//      match the jobs they used to match.
//   5. Permissive/fail-closed semantics are unchanged: plan with no signal →
//      visible to all; provider with no categories → no fit.
//   6. Short-token false positives ('ev' in "every", 'rv' in "service",
//      'led' in "scheduled") do not misclassify.
// ============================================================================
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const tax = require('../_taxonomy');
const elig = require('../_eligibility');

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error(`✗ ${name}\n   ${e.message}`); process.exitCode = 1; return; }
  console.log(`✓ ${name}`);
}

// 1. Browser mirror ---------------------------------------------------------
t('www/mcc-taxonomy.js mirrors _taxonomy.js', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../../www/mcc-taxonomy.js'), 'utf8');
  const sandbox = { window: {}, document: { readyState: 'complete', getElementById: () => null, addEventListener() {} } };
  vm.runInNewContext(src, sandbox);
  const b = sandbox.window.MCC_TAXONOMY;
  assert.ok(b, 'window.MCC_TAXONOMY not defined');
  // Compare via JSON: objects from another vm context have different prototypes.
  assert.strictEqual(JSON.stringify(b.CATEGORIES), JSON.stringify(tax.CATEGORIES), 'CATEGORIES differ');
  assert.strictEqual(JSON.stringify(b.LABELS), JSON.stringify(tax.CATEGORY_LABELS), 'LABELS differ');
  assert.strictEqual(JSON.stringify(b.GROUPS), JSON.stringify(tax.CATEGORY_GROUPS), 'GROUPS differ');
});

t('20 categories, no duplicates, every category has label/hint/group', () => {
  assert.strictEqual(tax.CATEGORIES.length, 20);
  assert.strictEqual(new Set(tax.CATEGORIES).size, 20);
  const grouped = tax.CATEGORY_GROUPS.flatMap(g => g.categories);
  assert.deepStrictEqual([...grouped].sort(), [...tax.CATEGORIES].sort(), 'groups must partition the categories');
  for (const c of tax.CATEGORIES) {
    assert.ok(tax.CATEGORY_LABELS[c], `label missing for ${c}`);
    assert.ok(tax.CATEGORY_HINTS[c], `hint missing for ${c}`);
  }
});

// 2. Round trip ----------------------------------------------------------------
t('every category round-trips through isServiceFit', () => {
  for (const c of tax.CATEGORIES) {
    const plan = { categories: [c], service_types: [] };
    assert.strictEqual(elig.isServiceFit(plan, [c]), true, `${c} should fit itself`);
    for (const other of tax.CATEGORIES) {
      if (other === c) continue;
      // 'cosmetic' and 'other' are legacy buckets too; a lone legacy bucket
      // expands, so exclude those two from the strict negative check.
      if (other === 'cosmetic' || other === 'other') continue;
      assert.strictEqual(elig.isServiceFit(plan, [other]), false, `${c} must not fit ${other}`);
    }
  }
});

t('explicit categories win over legacy service_types', () => {
  const plan = { categories: ['audio_electronics'], service_types: ['oil_change'] };
  assert.deepStrictEqual(elig.planCategories(plan), ['audio_electronics']);
  assert.strictEqual(elig.isServiceFit(plan, ['maintenance']), false);
  assert.strictEqual(elig.isServiceFit(plan, ['audio_electronics']), true);
});

// 3. Legacy classifier ----------------------------------------------------------
t('legacy mechanical/collision strings classify as before', () => {
  const cases = {
    oil_change: 'maintenance', 'Oil Change': 'maintenance', brake_service: 'maintenance',
    tire_service: 'maintenance', engine_repair: 'maintenance', transmission: 'maintenance',
    electrical: 'maintenance', inspection: 'maintenance', 'A/C recharge': 'maintenance',
    'AC service': 'maintenance', 'tune-up': 'maintenance', 'Multi-point inspection': 'maintenance',
    body_repair: 'accident_repair', collision: 'accident_repair', 'Paint': 'accident_repair',
    'dent repair': 'accident_repair', windshield: 'accident_repair',
    detailing: 'detailing', 'Full detail': 'detailing',
    exhaust: 'performance', suspension: 'performance', tuning: 'performance',
    'snow plow': 'snow_removal', 'lift kit': 'offroad', warranty: 'manufacturer_service',
  };
  for (const [input, want] of Object.entries(cases)) {
    assert.strictEqual(tax.serviceTypeToCategory(input), want, `${JSON.stringify(input)} → ${want}`);
  }
});

t('trades that used to fall through to other now get a real category', () => {
  const cases = {
    'stereo install': 'audio_electronics', 'CarPlay retrofit': 'audio_electronics',
    'dash cam wiring': 'audio_electronics', 'remote start': 'audio_electronics',
    'headlight restoration': 'lighting', 'LED upgrade': 'lighting', 'underglow': 'lighting',
    'seat upholstery': 'interior', 'headliner sag': 'interior',
    'EV battery check': 'ev_hybrid', 'hybrid service': 'ev_hybrid', 'charging port': 'ev_hybrid',
    'classic car restoration': 'classic_vintage', 'convertible top': 'convertible_specialty',
    'motorcycle oil change': 'motorcycle', 'RV service': 'rv_camper', 'outboard motor': 'boat_marine',
    'window tint': 'premium_protection', 'ceramic coating': 'premium_protection', 'PPF install': 'premium_protection',
    'vehicle wrap': 'fleet_graphics', 'fleet decals': 'fleet_graphics',
    'door ding': 'cosmetic', 'bumper scuff': 'cosmetic', 'paint chip touch up': 'accident_repair',
    'something else entirely': 'other',
  };
  for (const [input, want] of Object.entries(cases)) {
    assert.strictEqual(tax.serviceTypeToCategory(input), want, `${JSON.stringify(input)} → ${want}`);
  }
});

t('a category slug passes through unchanged', () => {
  for (const c of tax.CATEGORIES) assert.strictEqual(tax.serviceTypeToCategory(c), c);
  assert.strictEqual(tax.serviceTypeToCategory('  Detailing '), 'detailing');
});

// 6. Short-token false positives -----------------------------------------------
t('short tokens need word boundaries', () => {
  assert.notStrictEqual(tax.serviceTypeToCategory('every day service'), 'ev_hybrid');
  assert.notStrictEqual(tax.serviceTypeToCategory('scheduled service'), 'lighting');   // 'led' inside 'scheduled'
  assert.strictEqual(tax.serviceTypeToCategory('scheduled service'), 'manufacturer_service');
  assert.notStrictEqual(tax.serviceTypeToCategory('hidden damage'), 'lighting');       // 'hid'
  assert.notStrictEqual(tax.serviceTypeToCategory('nerve-wracking rattle'), 'rv_camper');
  assert.strictEqual(tax.serviceTypeToCategory('accident repair'), 'accident_repair'); // 'ac' inside 'accident'
  assert.strictEqual(tax.serviceTypeToCategory('washer fluid'), 'maintenance');         // 'wash' inside 'washer'
  assert.strictEqual(tax.serviceTypeToCategory('something else entirely'), 'other');    // 'tire' inside 'entirely'
  assert.notStrictEqual(tax.serviceTypeToCategory('student discount'), 'accident_repair'); // 'dent'
  assert.notStrictEqual(tax.serviceTypeToCategory('coding'), 'cosmetic');                // 'ding'
});

// 4. Legacy provider preference rows --------------------------------------------
t('legacy cosmetic bucket still matches detail/wrap/tint jobs', () => {
  const prov = ['cosmetic'];                                    // pre-2.6.1 row
  assert.strictEqual(elig.isServiceFit({ service_types: ['Full detail'] }, prov), true);
  assert.strictEqual(elig.isServiceFit({ service_types: ['vehicle wrap'] }, prov), true);
  assert.strictEqual(elig.isServiceFit({ service_types: ['window tint'] }, prov), true);
  assert.strictEqual(elig.isServiceFit({ categories: ['detailing'] }, prov), true);
  assert.strictEqual(elig.isServiceFit({ categories: ['maintenance'] }, prov), false);
});

t('legacy other bucket still matches the unlisted trades', () => {
  const prov = ['maintenance', 'other'];
  assert.strictEqual(elig.isServiceFit({ service_types: ['stereo install'] }, prov), true);
  assert.strictEqual(elig.isServiceFit({ categories: ['ev_hybrid'] }, prov), true);
  assert.strictEqual(elig.isServiceFit({ categories: ['detailing'] }, prov), false);
});

t('a new-UI row that explicitly picks cosmetic only is NOT expanded', () => {
  // Row carries an expanded member (detailing) → written by the new UI →
  // 'cosmetic' means the category, not the old bucket.
  const prov = ['cosmetic', 'detailing'];
  assert.deepStrictEqual([...elig.providerCategories(prov)].sort(), ['cosmetic', 'detailing']);
  assert.strictEqual(elig.isServiceFit({ categories: ['premium_protection'] }, prov), false);
});

// 5. Semantics ------------------------------------------------------------------
t('plan with no category signal is visible to everyone', () => {
  assert.strictEqual(elig.isServiceFit({ categories: [], service_types: [] }, ['detailing']), true);
  assert.strictEqual(elig.isServiceFit({}, ['detailing']), true);
});

t('provider with no categories never fits a categorised plan', () => {
  assert.strictEqual(elig.isServiceFit({ categories: ['maintenance'] }, []), false);
  assert.strictEqual(elig.isServiceFit({ categories: ['maintenance'] }, null), false);
});

t('unknown category strings are ignored, not matched', () => {
  assert.deepStrictEqual(tax.normalizeCategories(['maintenance', 'bogus', 'MAINTENANCE', 7]), ['maintenance']);
  assert.strictEqual(elig.isServiceFit({ categories: ['bogus'], service_types: ['oil change'] }, ['maintenance']), true,
    'bogus explicit value falls back to service_types');
});

t('serviceTypesToBuckets back-compat alias returns categories', () => {
  assert.deepStrictEqual(elig.serviceTypesToBuckets(['oil_change', 'stereo install', 'oil change']),
    ['maintenance', 'audio_electronics']);
  assert.deepStrictEqual(elig.serviceTypesToBuckets([]), []);
  assert.deepStrictEqual(elig.serviceTypesToBuckets(null), []);
});

// SQL twin sanity: every keyword the SQL function checks should appear in the
// JS classifier source (cheap guard against the two drifting apart).
t('SQL classifier keywords are a subset of the JS classifier', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../../supabase/migrations/20260920a_taxonomy_unification.sql'), 'utf8');
  const js  = fs.readFileSync(path.join(__dirname, '../_taxonomy.js'), 'utf8');
  const likes = [...sql.matchAll(/LIKE '%([^%']+)%'/g)].map(m => m[1]);
  const missing = likes.filter(k => !js.includes(`'${k}'`));
  assert.deepStrictEqual(missing, [], 'keywords in SQL but not JS: ' + missing.join(', '));
});

console.log(`\n${passed} test group(s) passed${process.exitCode ? ', with failures above' : ''}.`);

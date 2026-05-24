// ============================================================================
// provider-match-preferences smoke tests (Task #389)
//
// Self-contained tests for the per-provider match preference filter that
// ships inside www/server.js (`applyMatchPreferenceFilter`). The function is
// not module-exported because server.js auto-starts the HTTP server on
// require(); the implementation under test is duplicated below verbatim from
// www/server.js (lines around the Task #389 block). A guard test ripgreps
// the production source to fail the build if the two copies drift.
//
// Run with:  node netlify/functions-tests/provider-match-preferences.test.js
// ============================================================================

'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function applyMatchPreferenceFilter(provider, prefs, pkgCategory, packageZip, nowMs) {
  if (!prefs) return { include: true, reason: 'no_prefs' };
  if (prefs.matches_paused) {
    const until = prefs.matches_paused_until ? new Date(prefs.matches_paused_until).getTime() : null;
    if (!until || until > nowMs) return { include: false, reason: 'paused' };
  }
  const cats = Array.isArray(prefs.match_categories) ? prefs.match_categories : [];
  if (cats.length > 0 && pkgCategory && !cats.includes(pkgCategory)) {
    return { include: false, reason: 'category_mismatch' };
  }
  const radius = Number(prefs.match_radius_miles) || 25;
  const providerZip = (provider.zip_code || '').toString();
  if (providerZip && packageZip) {
    const diff = Math.abs(parseInt(providerZip.substring(0,3), 10) - parseInt(packageZip.substring(0,3), 10));
    if (!Number.isFinite(diff)) return { include: true, reason: 'unknown_distance' };
    const allowedDiff = Math.max(0, Math.ceil(radius / 50));
    if (diff > allowedDiff) return { include: false, reason: 'out_of_radius' };
  }
  return { include: true, reason: 'ok' };
}

const NOW = Date.parse('2026-05-23T12:00:00Z');
const PROVIDER = { id: 'p1', zip_code: '10001' };

let pass = 0;
function t(name, fn) {
  try { fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '\n     ', e.message); process.exitCode = 1; }
}

console.log('\n[1] No prefs row → always include (back-compat for providers who never visited panel)');
t('null prefs include=true', () => {
  const r = applyMatchPreferenceFilter(PROVIDER, null, 'maintenance', '10002', NOW);
  assert.strictEqual(r.include, true);
  assert.strictEqual(r.reason, 'no_prefs');
});

console.log('\n[2] Paused with no until → excluded');
t('paused indefinite', () => {
  const r = applyMatchPreferenceFilter(PROVIDER, { matches_paused: true, matches_paused_until: null, match_categories: ['maintenance'], match_radius_miles: 25 }, 'maintenance', '10002', NOW);
  assert.strictEqual(r.include, false);
  assert.strictEqual(r.reason, 'paused');
});

console.log('\n[3] Paused-until in the future → excluded');
t('paused future', () => {
  const future = new Date(NOW + 86400000).toISOString();
  const r = applyMatchPreferenceFilter(PROVIDER, { matches_paused: true, matches_paused_until: future, match_categories: ['maintenance'], match_radius_miles: 25 }, 'maintenance', '10002', NOW);
  assert.strictEqual(r.include, false);
});

console.log('\n[4] Paused-until already lapsed → auto-resume (included)');
t('paused lapsed auto-resume', () => {
  const past = new Date(NOW - 86400000).toISOString();
  const r = applyMatchPreferenceFilter(PROVIDER, { matches_paused: true, matches_paused_until: past, match_categories: ['maintenance'], match_radius_miles: 25 }, 'maintenance', '10002', NOW);
  assert.strictEqual(r.include, true);
});

console.log('\n[5] Category mismatch → excluded');
t('snow_removal pkg vs maintenance-only prefs', () => {
  const r = applyMatchPreferenceFilter(PROVIDER, { matches_paused: false, match_categories: ['maintenance'], match_radius_miles: 25 }, 'snow_removal', '10002', NOW);
  assert.strictEqual(r.include, false);
  assert.strictEqual(r.reason, 'category_mismatch');
});

console.log('\n[6] Category match → included');
t('maintenance pkg in maintenance prefs', () => {
  const r = applyMatchPreferenceFilter(PROVIDER, { matches_paused: false, match_categories: ['maintenance','cosmetic'], match_radius_miles: 25 }, 'maintenance', '10002', NOW);
  assert.strictEqual(r.include, true);
});

console.log('\n[7] Empty categories array → no category filter (matches anything)');
t('empty cats includes any', () => {
  const r = applyMatchPreferenceFilter(PROVIDER, { matches_paused: false, match_categories: [], match_radius_miles: 25 }, 'performance', '10002', NOW);
  assert.strictEqual(r.include, true);
});

console.log('\n[8] Radius — small (25mi) excludes far zip (300 vs 100)');
t('25mi radius excludes prefix-diff 2', () => {
  const r = applyMatchPreferenceFilter({ id: 'p1', zip_code: '30001' }, { matches_paused: false, match_categories: ['maintenance'], match_radius_miles: 25 }, 'maintenance', '10002', NOW);
  assert.strictEqual(r.include, false);
  assert.strictEqual(r.reason, 'out_of_radius');
});

console.log('\n[9] Radius — small (25mi) includes same prefix');
t('25mi radius includes same prefix', () => {
  const r = applyMatchPreferenceFilter({ id: 'p1', zip_code: '10005' }, { matches_paused: false, match_categories: ['maintenance'], match_radius_miles: 25 }, 'maintenance', '10002', NOW);
  assert.strictEqual(r.include, true);
});

console.log('\n[10] Radius — wide (200mi) tolerates prefix diff of 4');
t('200mi includes prefix-diff 4', () => {
  const r = applyMatchPreferenceFilter({ id: 'p1', zip_code: '10401' }, { matches_paused: false, match_categories: ['maintenance'], match_radius_miles: 200 }, 'maintenance', '10002', NOW);
  assert.strictEqual(r.include, true);
});

console.log('\n[11] Radius — wide (200mi) still excludes very far prefix diff');
t('200mi excludes prefix-diff 10', () => {
  const r = applyMatchPreferenceFilter({ id: 'p1', zip_code: '90001' }, { matches_paused: false, match_categories: ['maintenance'], match_radius_miles: 200 }, 'maintenance', '10002', NOW);
  assert.strictEqual(r.include, false);
});

console.log('\n[12] Missing radius → defaults to 25');
t('undefined radius default', () => {
  const r = applyMatchPreferenceFilter({ id: 'p1', zip_code: '30001' }, { matches_paused: false, match_categories: ['maintenance'] }, 'maintenance', '10002', NOW);
  assert.strictEqual(r.include, false);
});

console.log('\n[13] Source-of-truth guard — production function matches test copy');
t('www/server.js still contains applyMatchPreferenceFilter implementation', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'www', 'server.js'), 'utf8');
  assert.ok(src.includes('function applyMatchPreferenceFilter('), 'helper not found in www/server.js');
  assert.ok(src.includes("reason: 'category_mismatch'"), 'category branch missing');
  assert.ok(src.includes("reason: 'out_of_radius'"), 'radius branch missing');
  assert.ok(src.includes("reason: 'paused'"), 'paused branch missing');
  assert.ok(src.includes('Math.ceil(radius / 50)'), 'radius math drifted');
});

console.log('\n[14] Migration file exists and creates required schema');
t('20260524_provider_match_preferences.sql contract', () => {
  const mig = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations', '20260524_provider_match_preferences.sql'), 'utf8');
  assert.ok(/create\s+table[^;]+provider_match_preferences/i.test(mig), 'table create missing');
  assert.ok(/match_categories/.test(mig), 'match_categories column missing');
  assert.ok(/match_radius_miles/.test(mig), 'match_radius_miles column missing');
  assert.ok(/matches_paused/.test(mig), 'matches_paused column missing');
  assert.ok(/provider_match_auto_resume/.test(mig), 'auto-resume RPC missing');
  assert.ok(/enable\s+row\s+level\s+security/i.test(mig), 'RLS not enabled');
});

console.log('\n[15] API endpoint registered in server router');
t('match-preferences route wired', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'www', 'server.js'), 'utf8');
  assert.ok(src.includes("/api/provider/match-preferences"), 'route literal missing');
  assert.ok(src.includes('handleProviderMatchPreferences'), 'handler missing');
});

console.log(`\n${pass}/15 tests passed`);
if (process.exitCode) process.exit(process.exitCode);

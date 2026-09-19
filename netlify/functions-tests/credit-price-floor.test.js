// Credit-price floor guard — Phase 1 §1.5 of the provider-subscriptions
// build spec.
//
// The spec's standing rule (v3 top matter, line 13) is a floor of $3.00 per
// bid across every pack, plan, and discounted combination. This test enforces
// that rule against the pack-pricing fixture in lib/bid-packs-fixture.json.
// Subscription plans join the check once Phase 2 ships (subscription_plans
// table + fixture).
//
// **Post-reset (2026-09-19).** The pre-reset 19-pack ladder violated the
// $3.00 floor on 16 of 19 packs. Migration 20260919i deactivated everything
// and installed the five-pack canonical catalog (Single/Starter/Standard/
// Pro/Shop, all ≥ $7.00/bid). This test is now in strict-enforcement mode:
// any active pack whose $/bid drops below $3.00 fails.

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const FLOOR = 3.00;

const fixturePath = path.resolve(__dirname, '..', '..', 'lib', 'bid-packs-fixture.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const activePacks = fixture.packs.filter(p => p.is_active);
if (activePacks.length === 0) {
  console.error('FAIL: fixture has no is_active=true packs — nothing to floor-guard');
  process.exit(1);
}

const rows = activePacks.map(p => {
  const totalCredits = (p.bid_count || 0) + (p.bonus_bids || 0);
  const perBid = p.price / totalCredits;
  return { ...p, totalCredits, perBid };
});
rows.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.price - b.price);

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ok  ' + name); pass++; }
  catch (err) { console.error('  FAIL ' + name + ': ' + err.message); fail++; }
}

console.log('\nActive bid-pack pricing (sorted by sort_order):');
for (const r of rows) {
  console.log('  ' + String(r.name).padEnd(10) +
              '  $' + r.price.toFixed(2).padStart(8) +
              '  /  ' + String(r.totalCredits).padStart(4) + ' credits' +
              '  =  $' + r.perBid.toFixed(2) + '/bid');
}
console.log('\nFloor: $' + FLOOR.toFixed(2) + '/bid\n');

t('every active pack ≥ $' + FLOOR.toFixed(2) + '/bid', () => {
  for (const r of rows) {
    assert.ok(
      r.perBid >= FLOOR,
      `${r.name}: $${r.price.toFixed(2)} / ${r.totalCredits} = $${r.perBid.toFixed(4)}/bid < $${FLOOR.toFixed(2)}`
    );
  }
});

t('every active pack has total_credits > 0', () => {
  for (const r of rows) {
    assert.ok(r.totalCredits > 0, `${r.name} has zero total credits`);
  }
});

t('every active pack price > 0', () => {
  for (const r of rows) {
    assert.ok(r.price > 0, `${r.name} has zero or negative price`);
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

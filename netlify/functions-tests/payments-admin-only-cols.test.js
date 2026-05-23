'use strict';

// Task #271 — Column-level guard on admin-only payment columns.
//
// Tests:
//   Static layer (always runs):
//     1. Migration file exists.
//     2. Migration creates payments_guard_admin_only_columns function.
//     3. Migration creates payments_admin_only_columns trigger.
//     4. Migration guards all four protected columns.
//   Simulation layer (always runs — in-process logic mirror):
//     5. Trusted role (postgres) → allowed even when columns change.
//     6. Admin caller → allowed when columns change.
//     7. Non-admin + no column change → allowed.
//     8. Non-admin + admin_note changed → rejected (42501).
//     9. Non-admin + amount_total changed → rejected.
//    10. Non-admin + amount_mcc_fee changed → rejected.
//    11. Non-admin + refund_amount changed → rejected.
//    12. Non-admin + non-protected column changed → allowed.
//
// Run:  node netlify/functions-tests/payments-admin-only-cols.test.js

const fs   = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  ok ', name); pass++; }
  else       { console.error('  FAIL', name, detail || ''); fail++; }
}

// ── Static layer ────────────────────────────────────────────────────────────

const MIGRATION = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260523_payments_admin_only_columns.sql'
);

console.log('\n=== Static: migration audit ===');

let sql = '';
try {
  sql = fs.readFileSync(MIGRATION, 'utf8');
  ok('migration file exists', true);
} catch {
  ok('migration file exists', false, MIGRATION + ' not found');
}

ok('creates payments_guard_admin_only_columns function',
  sql.includes('payments_guard_admin_only_columns'));
ok('creates payments_admin_only_columns trigger',
  sql.includes('payments_admin_only_columns'));
ok('guards admin_note',     sql.includes('admin_note'));
ok('guards amount_total',   sql.includes('amount_total'));
ok('guards amount_mcc_fee', sql.includes('amount_mcc_fee'));
ok('guards refund_amount',  sql.includes('refund_amount'));
ok('trusted-role bypass present',
  sql.includes("current_user IN ('postgres', 'supabase_admin', 'service_role')"));
ok('uses IS DISTINCT FROM for null-safe comparison',
  sql.includes('IS DISTINCT FROM'));

// ── Simulation layer ─────────────────────────────────────────────────────────
// Mirror the trigger logic in JS so we can unit-test it without a live DB.

console.log('\n=== Simulation: trigger logic ===');

const PROTECTED = ['admin_note', 'amount_total', 'amount_mcc_fee', 'refund_amount'];
const TRUSTED_ROLES = ['postgres', 'supabase_admin', 'service_role'];

function simulateTrigger({ currentUser, isAdmin, oldRow, newRow }) {
  if (TRUSTED_ROLES.includes(currentUser)) return { allowed: true };
  if (isAdmin) return { allowed: true };

  const changed = PROTECTED.some(col => oldRow[col] !== newRow[col]);
  if (changed) {
    return {
      allowed: false,
      errcode: '42501',
      message: 'admin-only column modified'
    };
  }
  return { allowed: true };
}

const base = {
  admin_note:     null,
  amount_total:   100,
  amount_mcc_fee: 10,
  refund_amount:  0,
  status:         'held'
};

// 5. Trusted role — allowed even if protected columns change.
ok('trusted role (postgres) → allowed',
  simulateTrigger({
    currentUser: 'postgres',
    isAdmin: false,
    oldRow: { ...base },
    newRow: { ...base, admin_note: 'changed' }
  }).allowed === true);

// 6. Admin caller — allowed when columns change.
ok('admin caller → allowed',
  simulateTrigger({
    currentUser: 'authenticated',
    isAdmin: true,
    oldRow: { ...base },
    newRow: { ...base, amount_total: 200 }
  }).allowed === true);

// 7. Non-admin + no protected column change → allowed.
ok('non-admin + non-protected change only → allowed',
  simulateTrigger({
    currentUser: 'authenticated',
    isAdmin: false,
    oldRow: { ...base },
    newRow: { ...base, status: 'released' }
  }).allowed === true);

// 8–11. Non-admin + each protected column changed → rejected.
for (const col of PROTECTED) {
  const newRow = { ...base };
  newRow[col] = col === 'admin_note' ? 'hacked' : (base[col] ?? 0) + 999;
  const r = simulateTrigger({
    currentUser: 'authenticated',
    isAdmin: false,
    oldRow: { ...base },
    newRow
  });
  ok(`non-admin changes ${col} → rejected (42501)`,
    r.allowed === false && r.errcode === '42501',
    JSON.stringify(r));
}

// 12. Non-admin + only non-protected column changed → allowed.
ok('non-admin + status change only → allowed',
  simulateTrigger({
    currentUser: 'authenticated',
    isAdmin: false,
    oldRow: { ...base },
    newRow: { ...base, status: 'disputed' }
  }).allowed === true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;

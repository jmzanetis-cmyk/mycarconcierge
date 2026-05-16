'use strict';

// Task #425 (Step 3): Static lockdown of the provider_alerts RLS policy that
// stops Provider A from dismissing Provider B's alerts.
//
// We can't run real Postgres RLS in unit tests without a live database, but
// we CAN guarantee the migration that defines the policy stays correct
// across refactors. Any migration that:
//   - drops "providers_dismiss_own_alerts" without re-creating it, OR
//   - re-creates it without `provider_id = auth.uid()` in BOTH the USING and
//     WITH CHECK clauses,
// will fail this test.
//
// Run:  node netlify/functions-tests/provider-alerts-rls.test.js

const assert = require('assert');
const fs     = require('node:fs');
const path   = require('node:path');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  ok ', name); pass++; }
  else { console.error('  FAIL', name, detail || ''); fail++; }
}

const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();

let lastDef = null;
let lastFile = null;
for (const f of files) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8');
  const re = /CREATE POLICY\s+"providers_dismiss_own_alerts"[\s\S]*?(?=;)/gi;
  const matches = sql.match(re);
  if (matches) {
    lastDef = matches[matches.length - 1];
    lastFile = f;
  }
}

ok('providers_dismiss_own_alerts policy is defined in some migration', !!lastDef, '(expected at least one CREATE POLICY)');
ok('latest definition is in 20260422_bgc_notifications_alerts.sql or later',
   lastFile && lastFile >= '20260422_bgc_notifications_alerts.sql',
   `latest file: ${lastFile}`);
ok('policy targets provider_alerts FOR UPDATE',
   /ON\s+provider_alerts\s+FOR\s+UPDATE/i.test(lastDef || ''),
   lastDef);
ok('USING clause restricts to auth.uid()',
   /USING\s*\(\s*provider_id\s*=\s*auth\.uid\(\)\s*\)/i.test(lastDef || ''),
   lastDef);
ok('WITH CHECK clause restricts to auth.uid()',
   /WITH\s+CHECK\s*\(\s*provider_id\s*=\s*auth\.uid\(\)\s*\)/i.test(lastDef || ''),
   lastDef);

// Belt-and-braces: confirm RLS is enabled on the table somewhere.
let rlsEnabled = false;
for (const f of files) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8');
  if (/ALTER TABLE\s+provider_alerts\s+ENABLE ROW LEVEL SECURITY/i.test(sql)) {
    rlsEnabled = true;
    break;
  }
}
ok('provider_alerts has ENABLE ROW LEVEL SECURITY', rlsEnabled);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

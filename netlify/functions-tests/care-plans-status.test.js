'use strict';

// Task #419 — care_plans.status constraint includes 'completed'.
//
// Static: verify the migration drops the old constraint and recreates it
// with 'completed' in the allowed set.
//
// Run:  node netlify/functions-tests/care-plans-status.test.js

const fs   = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  ok ', name); pass++; }
  else       { console.error('  FAIL', name, detail || ''); fail++; }
}

const MIGRATION = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260523b_care_plans_status_completed.sql'
);

let sql = '';
try {
  sql = fs.readFileSync(MIGRATION, 'utf8');
  ok('migration file exists', true);
} catch {
  ok('migration file exists', false, MIGRATION + ' not found');
}

ok('drops old constraint',        sql.includes('DROP CONSTRAINT IF EXISTS care_plans_status_check'));
ok("adds 'completed' to allowed", sql.includes("'completed'"));
ok('keeps open in allowed',       sql.includes("'open'"));
ok('keeps awarded in allowed',    sql.includes("'awarded'"));
ok('keeps expired in allowed',    sql.includes("'expired'"));
ok('keeps cancelled in allowed',  sql.includes("'cancelled'"));

// Verify agent-fleet-admin.js writes status='completed'
const HANDLER = path.join(__dirname, '..', 'functions', 'agent-fleet-admin.js');
let handlerSql = '';
try { handlerSql = fs.readFileSync(HANDLER, 'utf8'); } catch {}
ok("agent-fleet-admin writes status='completed'",
  /status:\s*['"]completed['"]/.test(handlerSql));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;

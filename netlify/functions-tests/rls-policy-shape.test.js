#!/usr/bin/env node
// Task #470 / #471 lockdown — Guard against RLS-shape regressions in
// supabase/migrations/*.sql.
//
// Rule 1 — in any migration file dated >= 20260918, no CREATE POLICY
//   whose name starts with `service_role_` may use `USING (true)` or
//   `WITH CHECK (true)` without a matching `TO service_role` clause. This
//   is a forward-only guard against the pattern re-entering the folder;
//   older files (notably 20260420_outreach_engine_initial.sql, which has
//   the exact shape) are intentionally not retro-applied because we don't
//   rewrite applied migrations — the historical shape is annotated in
//   place via a SECURITY NOTE at the top of that file, and 20260918a
//   handles the corresponding prod state via DROP POLICY IF EXISTS.
//
// Rule 2 — any migration file whose filename date is >= 20260918 that
//   contains `CREATE TABLE public.<t>` must also contain
//   `ALTER TABLE ... <t> ENABLE ROW LEVEL SECURITY` in the same file.
//   Enforces "new public tables ship RLS-enabled by default" (the state
//   Task #469 confirmed is prod-wide today). Does NOT require a matching
//   CREATE POLICY — RLS-with-no-policies is the intended service-role-
//   only shape for many tables (nine of the twelve Tier-0.5 audit tables,
//   plus all seven outreach tables). Older files (pre-20260918) are not
//   retro-applied because they were captured when prod state was in flux.
//
// Both rules operate as file-shape assertions — no live DB required.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'supabase', 'migrations');
// Both rules apply only to migration files whose filename date is >= this
// cutoff, matching "the day we started codifying live RLS state." Files
// older than this can freely have historical shapes without failing the
// test — modifying applied migrations to make an audit pass would be
// worse than annotating them in place.
const CUTOFF_DATE = '20260918';

let passed = 0;
let failed = 0;

function check(name, ok, detail) {
  if (ok) {
    console.log(`  ok  ${name}`);
    passed++;
  } else {
    console.log(`  FAIL ${name}`);
    if (detail) console.log('       ' + String(detail).split('\n').join('\n       '));
    failed++;
  }
}

// Strip SQL comments so regex matches don't false-positive on commented-out
// examples (like the SECURITY NOTE headers we ship in migrations).
// - Single-line: `-- ...` to end of line.
// - Block:      `/* ... */` (rare in SQL migrations here, but handle it).
function stripSqlComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(line => {
      const idx = line.indexOf('--');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');
}

const allFiles = fs.readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort();

// -----------------------------------------------------------------------------
// Rule 1 — service_role_* CREATE POLICY shape
// -----------------------------------------------------------------------------
const CREATE_POLICY_RE = /CREATE\s+POLICY\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+ON\s+(?:public\.)?([a-zA-Z0-9_"]+)([\s\S]*?);/gi;

const rule1Violations = [];
for (const filename of allFiles) {
  const dateMatch = filename.match(/^(\d{8})/);
  if (!dateMatch || dateMatch[1] < CUTOFF_DATE) continue;
  const filePath = path.join(MIGRATIONS_DIR, filename);
  const contents = stripSqlComments(fs.readFileSync(filePath, 'utf8'));
  let m;
  const re = new RegExp(CREATE_POLICY_RE.source, CREATE_POLICY_RE.flags);
  while ((m = re.exec(contents)) !== null) {
    const [, policyName, tableName, body] = m;
    if (!/^service_role/i.test(policyName)) continue;
    const hasToServiceRole = /\bTO\s+service_role\b/i.test(body);
    const hasTrueUsing = /\bUSING\s*\(\s*true\s*\)/i.test(body);
    const hasTrueWithCheck = /\bWITH\s+CHECK\s*\(\s*true\s*\)/i.test(body);
    if ((hasTrueUsing || hasTrueWithCheck) && !hasToServiceRole) {
      rule1Violations.push(
        `${filename}: CREATE POLICY ${policyName} ON ${tableName} — service_role-named policy with USING (true) / WITH CHECK (true) and no "TO service_role" clause. This would apply to anon+authenticated.`,
      );
    }
  }
}
check(
  `Rule 1: no CREATE POLICY service_role_* with USING (true) / WITH CHECK (true) and no TO service_role in migrations dated >= ${CUTOFF_DATE}`,
  rule1Violations.length === 0,
  rule1Violations.join('\n'),
);

// -----------------------------------------------------------------------------
// Rule 2 — post-cutoff CREATE TABLE requires ENABLE ROW LEVEL SECURITY
// -----------------------------------------------------------------------------
const CREATE_TABLE_RE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi;
function enableRlsRegexFor(tableName) {
  return new RegExp(
    `ALTER\\s+TABLE\\s+(?:public\\.)?${tableName}\\b[\\s\\S]{0,200}?ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
    'i',
  );
}

const rule2Violations = [];
for (const filename of allFiles) {
  const dateMatch = filename.match(/^(\d{8})/);
  if (!dateMatch || dateMatch[1] < CUTOFF_DATE) continue;
  const filePath = path.join(MIGRATIONS_DIR, filename);
  const contents = stripSqlComments(fs.readFileSync(filePath, 'utf8'));
  let m;
  const re = new RegExp(CREATE_TABLE_RE.source, CREATE_TABLE_RE.flags);
  while ((m = re.exec(contents)) !== null) {
    const tableName = m[1];
    if (!enableRlsRegexFor(tableName).test(contents)) {
      rule2Violations.push(
        `${filename}: CREATE TABLE public.${tableName} without a matching "ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY" in the same file.`,
      );
    }
  }
}
check(
  `Rule 2: every CREATE TABLE public.<t> in migrations dated >= ${CUTOFF_DATE} must ENABLE ROW LEVEL SECURITY in the same file`,
  rule2Violations.length === 0,
  rule2Violations.join('\n'),
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

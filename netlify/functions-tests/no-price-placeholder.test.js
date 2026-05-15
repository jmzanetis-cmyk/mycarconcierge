#!/usr/bin/env node
// Task #220 — Guardrail: fail the build if the `$[XX]` price placeholder
// ever returns to the `www/` tree.
//
// Background: Task #163 swept every literal `$[XX]` out of `www/` and
// replaced it with the real $70 background-check price. Without a check,
// a future copy/paste, refactor, or PDF re-import could silently put
// `$[XX]` back into a launch email or marketing page and customers would
// see the literal placeholder.
//
// Implementation: a single `rg --fixed-strings` invocation across `www/`.
// Exits 0 when the placeholder is absent, exits 1 (with the offending
// matches) when it reappears. Wired into the standard test suite by
// living in `netlify/functions-tests/` (auto-discovered by
// `scripts/run-function-tests.sh`, which `npm test` runs).

'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const PLACEHOLDER = '$[XX]';
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SEARCH_DIR = path.join(REPO_ROOT, 'www');

let passed = 0;
let failed = 0;

function check(name, ok, detail) {
  if (ok) {
    console.log(`  ok  ${name}`);
    passed++;
  } else {
    console.log(`  FAIL ${name}`);
    if (detail) console.log(detail);
    failed++;
  }
}

const result = spawnSync(
  'rg',
  ['--fixed-strings', '--no-heading', '--line-number', PLACEHOLDER, SEARCH_DIR],
  { encoding: 'utf8' },
);

if (result.error) {
  console.error(`Could not run ripgrep: ${result.error.message}`);
  process.exit(2);
}

// rg exit codes: 0 = matches found, 1 = no matches, 2 = error.
if (result.status === 2) {
  console.error('ripgrep reported an error:');
  console.error(result.stderr);
  process.exit(2);
}

const matches = result.status === 0 ? result.stdout.trim() : '';

check(
  `no \`${PLACEHOLDER}\` price placeholder anywhere under www/`,
  result.status === 1,
  matches
    ? `\nPlaceholder \`${PLACEHOLDER}\` reappeared in www/. Replace it with the real price (Task #163 used $70 for background checks):\n\n${matches}\n`
    : '',
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

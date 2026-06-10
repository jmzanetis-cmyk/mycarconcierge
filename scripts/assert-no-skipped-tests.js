#!/usr/bin/env node
'use strict';

// Task #395 — Guard for the API fallback-audit specs.
//
// `tests/api-fallback-audit.spec.js` (Task #229) and `tests/survey-api.spec.js`
// (Task #168) both use `test.skip(...)` when their server-side seam secret or
// the per-role test credentials are missing. That's intentional for local
// runs, but if CI ever stops setting those env vars the entire suite would
// "pass" by skipping every assertion — exactly the silent-failure class
// these specs exist to catch. This script parses the Playwright JSON report
// they emit and exits non-zero if ANY test was skipped (or none ran at all),
// so a future maintainer can't accidentally regress the CI contract by
// dropping a secret.
//
// Usage: node scripts/assert-no-skipped-tests.js <playwright-json-report>

const fs = require('fs');
const path = require('path');

const reportPath = process.argv[2];
if (!reportPath) {
  console.error('Usage: assert-no-skipped-tests.js <playwright-json-report>');
  process.exit(2);
}

if (!fs.existsSync(reportPath)) {
  console.error(`Report file not found: ${reportPath}`);
  process.exit(2);
}

let report;
try {
  report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
} catch (err) {
  console.error(`Failed to parse report JSON at ${reportPath}: ${err.message}`);
  process.exit(2);
}

const skipped = [];
const passed = [];
const failed = [];

function walkSuite(suite, trail) {
  const title = suite.title || '';
  const nextTrail = title ? [...trail, title] : trail;
  for (const spec of suite.specs || []) {
    for (const t of spec.tests || []) {
      const result = (t.results && t.results[0]) || {};
      // Playwright test statuses we care about:
      //   passed, failed, timedOut, interrupted, skipped
      const status = result.status || 'unknown';
      const id = `${nextTrail.join(' › ')} › ${spec.title}`;
      if (status === 'skipped') skipped.push(id);
      else if (status === 'passed') passed.push(id);
      else failed.push(`${id} [${status}]`);
    }
  }
  for (const child of suite.suites || []) walkSuite(child, nextTrail);
}

for (const suite of report.suites || []) walkSuite(suite, []);

const total = passed.length + failed.length + skipped.length;

console.log(`\nFallback-audit guard — ${path.basename(reportPath)}`);
console.log(`  passed:  ${passed.length}`);
console.log(`  failed:  ${failed.length}`);
console.log(`  skipped: ${skipped.length}`);
console.log(`  total:   ${total}`);

if (total === 0) {
  console.error('\nFAIL: no tests ran. The fallback-audit specs must execute on every CI run.');
  process.exit(1);
}

if (skipped.length > 0) {
  console.error('\nFAIL: one or more fallback-audit tests were skipped:');
  for (const id of skipped) console.error(`  - ${id}`);
  console.error('\nThese specs are silent-failure regression tests. They auto-skip when');
  console.error('SURVEY_TEST_HOOK_SECRET or the test member/provider/admin credentials');
  console.error('are missing. CI MUST provide all of them so every assertion executes.');
  console.error('See .github/workflows/fallback-audit.yml for the required env vars.');
  process.exit(1);
}

if (failed.length > 0) {
  console.error('\nFAIL: one or more tests failed:');
  for (const id of failed) console.error(`  - ${id}`);
  process.exit(1);
}

console.log('\nOK: all fallback-audit tests executed and passed.');
process.exit(0);

#!/usr/bin/env node
/*
 * Task #433 — Drift guard: keep docs/driver-app-assets/driver-tokens.css in
 * sync with the canonical :root / [data-theme="light"] token blocks in
 * www/shared-styles.css.
 *
 * Parses both files, extracts every `--token: value;` pair out of the
 * :root and [data-theme="light"] blocks of shared-styles.css, and asserts
 * that the same (token, value) pair appears in the corresponding block in
 * driver-tokens.css. Exits non-zero on drift so `npm test` fails the build.
 *
 * Scope: only the two top-level token blocks. Driver-tokens.css is
 * allowed to define extra tokens or extra helper rules beyond shared-styles
 * (form-input / header-theme-toggle convenience styles), but it must not
 * disagree on any token that shared-styles owns.
 *
 * Out of scope (per task brief): refactoring shared-styles.css, syncing
 * the .md guide prose, or checking non-token rules (.btn / .card bodies).
 */

const fs = require('fs');
const path = require('path');

const SHARED = path.join(__dirname, '..', 'www', 'shared-styles.css');
const DRIVER = path.join(__dirname, '..', 'docs', 'driver-app-assets', 'driver-tokens.css');

function readFile(p) {
  if (!fs.existsSync(p)) {
    console.error(`[check-driver-tokens] missing file: ${p}`);
    process.exit(2);
  }
  return fs.readFileSync(p, 'utf8');
}

// Strip /* ... */ comments so commented-out tokens don't get picked up.
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

// Find the first top-level `<selector> { ... }` block whose selector is an
// EXACT match for `selector` (so `[data-theme="light"] .btn-primary` won't
// be mistaken for `[data-theme="light"]`).
function extractBlock(css, selector) {
  const cleaned = stripComments(css);
  const re = new RegExp(`(^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\{`, 'g');
  const match = re.exec(cleaned);
  if (!match) return null;
  const start = re.lastIndex;
  let depth = 1;
  let i = start;
  while (i < cleaned.length && depth > 0) {
    const ch = cleaned[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    i += 1;
  }
  if (depth !== 0) return null;
  return cleaned.slice(start, i - 1);
}

// Normalize a CSS value for comparison: collapse whitespace, drop trailing
// zeros on decimals (`0.40` → `0.4`, `0.10` → `0.1`), lowercase hex.
function normalizeValue(v) {
  let s = v.trim().replace(/\s+/g, ' ');
  // 0.40 -> 0.4, 0.100 -> 0.1, but keep 10 / 100 intact
  s = s.replace(/(\d+\.\d*?)0+(?=\D|$)/g, '$1');
  s = s.replace(/(\d)\.(?=\D|$)/g, '$1');
  // lowercase hex colors
  s = s.replace(/#[0-9a-fA-F]{3,8}\b/g, (m) => m.toLowerCase());
  // collapse spaces inside rgba(...) etc
  s = s.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s*,\s*/g, ', ');
  return s;
}

function parseTokens(block) {
  const tokens = new Map();
  if (!block) return tokens;
  const decl = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = decl.exec(block)) !== null) {
    tokens.set(m[1], normalizeValue(m[2]));
  }
  return tokens;
}

function compare(label, sharedBlock, driverBlock) {
  const sharedTokens = parseTokens(sharedBlock);
  const driverTokens = parseTokens(driverBlock);
  const errors = [];
  for (const [name, sharedVal] of sharedTokens) {
    if (!driverTokens.has(name)) {
      errors.push(`  [${label}] missing token in driver-tokens.css: ${name}: ${sharedVal};`);
      continue;
    }
    const driverVal = driverTokens.get(name);
    if (driverVal !== sharedVal) {
      errors.push(`  [${label}] value drift for ${name}\n    shared-styles: ${sharedVal}\n    driver-tokens: ${driverVal}`);
    }
  }
  return errors;
}

function main() {
  const shared = readFile(SHARED);
  const driver = readFile(DRIVER);

  const blocks = [
    { label: ':root', selector: ':root' },
    { label: '[data-theme="light"]', selector: '\\[data-theme="light"\\]' },
  ];

  const allErrors = [];
  for (const { label, selector } of blocks) {
    const sb = extractBlock(shared, selector);
    const db = extractBlock(driver, selector);
    if (!sb) {
      allErrors.push(`  could not locate ${label} block in www/shared-styles.css`);
      continue;
    }
    if (!db) {
      allErrors.push(`  could not locate ${label} block in docs/driver-app-assets/driver-tokens.css`);
      continue;
    }
    allErrors.push(...compare(label, sb, db));
  }

  if (allErrors.length > 0) {
    console.error('[check-driver-tokens] FAIL — Driver token file is out of sync with www/shared-styles.css:\n');
    for (const e of allErrors) console.error(e);
    console.error('\nFix: update docs/driver-app-assets/driver-tokens.css so the (token, value) pairs above match www/shared-styles.css, then re-run `npm test`.');
    process.exit(1);
  }

  console.log('[check-driver-tokens] OK — driver-tokens.css matches www/shared-styles.css :root + [data-theme="light"] blocks.');
}

main();

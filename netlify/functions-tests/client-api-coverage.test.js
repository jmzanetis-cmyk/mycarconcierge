#!/usr/bin/env node
// ============================================================================
// client-api-coverage.test.js (Task #457)
//
// Complements api-route-parity.test.js (Task #450), which checks the
// dev→prod direction. This file checks the client→handler direction: every
// /api/... URL called from www/*.js and www/*.html must have a handler in
// either www/_redirects (prod) or _dev-only-api-routes.json (dev), or be
// explicitly grandfathered in _broken-client-callers.json.
//
// Catching: next dead caller URL surfaces at commit time, not user-report.
//
// Run:  node netlify/functions-tests/client-api-coverage.test.js
// ============================================================================

'use strict';

const fs   = require('node:fs');
const path = require('node:path');

const ROOT          = path.resolve(__dirname, '..', '..');
const WWW_DIR       = path.join(ROOT, 'www');
const REDIRECTS     = path.join(ROOT, 'www', '_redirects');
const DEV_ONLY_PATH = path.join(__dirname, '_dev-only-api-routes.json');
const ALLOWLIST     = path.join(__dirname, '_broken-client-callers.json');

let passed = 0;
let failed = 0;

function ok(name, cond, detail) {
  if (cond) { console.log(`  ok   ${name}`); passed++; }
  else       { console.error(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

// ── 1. Build redirect-rule matchers ─────────────────────────────────────────
function parseRedirects(src) {
  const rules = [];
  for (const rawLine of src.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const [source] = parts;
    if (!source.startsWith('/api/')) continue;
    const pat = '^' +
      source.replace(/[.+?^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^?#]*') +
      '(?:[?#].*)?$';
    rules.push({ source, re: new RegExp(pat) });
  }
  return rules;
}

function matchesRedirect(rules, url) {
  const probe = url.replace(/:param/g, 'x');
  return rules.some(r => r.re.test(probe));
}

// ── 2. Dev-only route checker ────────────────────────────────────────────────
function buildDevOnlyChecker(json) {
  const exact  = new Set(json.exact  || []);
  const prefix = new Set(json.prefix || []);
  return function matchesDevOnly(url) {
    if (exact.has(url)) return true;
    for (const p of prefix) {
      const base = p.replace(/\/$/, '');
      if (url === base || url === p || url.startsWith(base + '/')) return true;
    }
    return false;
  };
}

// ── 3. URL extraction from client source files ──────────────────────────────
// Regex: quote-char immediately followed by /api/...
// Handles template literals (${...}) and {id} style placeholders.
const EXTRACT_RE = /['`"](\/api\/[A-Za-z0-9_\-/:.${}]+)/g;

function normalizeUrl(raw) {
  let url = raw.split('?')[0]; // strip query string
  url = url.replace(/\${[^}]+}/g, ':param'); // ${expr}
  url = url.replace(/\{[^}]+\}/g,  ':param'); // {id}
  url = url.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ':param'); // :named
  url = url.replace(/\$\{[^}]*$/, '');         // unclosed ${… at end
  url = url.replace(/\/+$/, '') || url;         // strip trailing slash
  return url;
}

function extractUrlsFromFile(filePath) {
  const src    = fs.readFileSync(filePath, 'utf8');
  const relFile = path.relative(ROOT, filePath);
  const results = [];
  const lines  = src.split('\n');

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trimStart();
    // Skip pure comment lines
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) return;

    let m;
    EXTRACT_RE.lastIndex = 0;
    while ((m = EXTRACT_RE.exec(line)) !== null) {
      // Skip if the /api/ path is part of an external URL (e.g. https://api.example.com/api/v1/...)
      const before = line.slice(0, m.index);
      if (/https?:\/\/[^\s'"]*$/.test(before)) continue;

      const url = normalizeUrl(m[1]);
      if (url.length < 6) continue; // skip trivially short matches
      results.push({ url, file: relFile, line: lineIdx + 1 });
    }
  });

  return results;
}

function collectWwwFiles() {
  return fs.readdirSync(WWW_DIR)
    .filter(f =>
      (f.endsWith('.js') || f.endsWith('.html')) &&
      !f.startsWith('stress-test-') &&
      !f.endsWith('.test.js') &&
      !f.endsWith('.spec.js') &&
      f !== 'developers.html'
    )
    .map(f => path.join(WWW_DIR, f));
}

// ── 4. Load fixtures ─────────────────────────────────────────────────────────
const redirectRules  = parseRedirects(fs.readFileSync(REDIRECTS, 'utf8'));
const devOnly        = JSON.parse(fs.readFileSync(DEV_ONLY_PATH, 'utf8'));
const matchesDevOnly = buildDevOnlyChecker(devOnly);
const allowlistData  = JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8'));
const allowedUrls    = new Set((allowlistData.urls || []).map(e => e.url));

// ── 5. Extract all client-called URLs ────────────────────────────────────────
const allCalled = []; // { url, file, line }
for (const f of collectWwwFiles()) {
  allCalled.push(...extractUrlsFromFile(f));
}

// Deduplicate to one representative caller per normalized URL
const byUrl = new Map(); // url → { file, line }
for (const { url, file, line } of allCalled) {
  if (!byUrl.has(url)) byUrl.set(url, { file, line });
}

// ── 6. Tests ─────────────────────────────────────────────────────────────────
console.log('Static counts');
ok('extracted ≥1 /api/ URL from www/ client files', byUrl.size > 0, `got ${byUrl.size}`);
ok('_redirects has ≥1 /api/ rule', redirectRules.length > 0, `got ${redirectRules.length}`);

console.log('Every client /api/ call has a handler or is allowlisted');
const newViolations = [];
for (const [url, { file, line }] of byUrl) {
  if (matchesRedirect(redirectRules, url)) continue;
  if (matchesDevOnly(url)) continue;
  if (allowedUrls.has(url)) continue;
  newViolations.push({ url, file, line });
}

if (newViolations.length > 0) {
  console.error('');
  console.error('NEW unhandled client caller(s) detected. For each URL below, either:');
  console.error('  (a) add a www/_redirects rule pointing to a Netlify function, OR');
  console.error('  (b) add a _dev-only-api-routes.json entry if it is dev-server-only, OR');
  console.error('  (c) add to _broken-client-callers.json with { url, caller, reason, ticket }');
  console.error('');
  for (const { url, file, line } of newViolations) {
    console.error(`  URL \`${url}\` called from \`${file}:${line}\` has no handler`);
  }
  console.error('');
}
ok('no new client callers lack a handler or allowlist entry',
   newViolations.length === 0,
   newViolations.length ? `${newViolations.length} new violation(s) — see above` : '');

// ── 7. Allowlist hygiene: stale entries ──────────────────────────────────────
console.log('Allow-list hygiene');
const staleEntries = (allowlistData.urls || []).filter(e => {
  // An entry is stale if the URL now has a handler (redirect or dev-only)
  if (matchesRedirect(redirectRules, e.url)) return true;
  if (matchesDevOnly(e.url)) return true;
  return false;
});
ok('no stale allowlist entries (URL gained a handler — remove from allow-list)',
   staleEntries.length === 0,
   staleEntries.length
     ? `remove from _broken-client-callers.json: ${staleEntries.map(e => e.url).join(', ')}`
     : '');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

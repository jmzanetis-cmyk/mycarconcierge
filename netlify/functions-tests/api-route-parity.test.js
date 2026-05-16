#!/usr/bin/env node
// ============================================================================
// api-route-parity smoke test (Task #450)
//
// Task #208 deleted the prod shadow-tree of /api handlers; Task #343 ported
// the four /api/survey/* endpoints back into netlify/functions/ after they'd
// silently 404'd in production for weeks. Task #345 added a parity check for
// the /api/survey/* namespace only.
//
// This file generalises that guard to EVERY /api/* namespace. For every
// route declared in www/server.js (`req.url === '/api/...'` or
// `req.url.startsWith('/api/...')`), we assert one of:
//
//   1. www/_redirects has a rule that routes it to a real
//      netlify/functions/<handler>.js file, OR
//   2. It is explicitly listed in _dev-only-api-routes.json as a known
//      dev-only route (grandfathered when this test was first written, with
//      the intention that any NEW dev route added later must either be
//      ported to a prod function OR explicitly added to the allow-list).
//
// We also walk every redirect line and verify its target handler file
// actually exists on disk — that catches the inverse drift (a redirect that
// points to a renamed/deleted function).
//
// Run with:  node netlify/functions-tests/api-route-parity.test.js
// ============================================================================

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SERVER_PATH    = path.join(ROOT, 'www', 'server.js');
const REDIRECTS_PATH = path.join(ROOT, 'www', '_redirects');
const FUNCTIONS_DIR  = path.join(ROOT, 'netlify', 'functions');
const ALLOWLIST_PATH = path.join(__dirname, '_dev-only-api-routes.json');

let passed = 0;
let failed = 0;

function ok(name, cond, detail) {
  if (cond) { console.log(`  ok   ${name}`); passed++; }
  else      { console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

// ── 1. Parse dev routes from www/server.js ──────────────────────────────────
function extractDevRoutes(src) {
  const exact  = new Set();
  const prefix = new Set();
  for (const m of src.matchAll(/req\.url\s*===\s*["']([^"']+)["']/g)) {
    const p = m[1].split('?')[0];
    if (p.startsWith('/api/')) exact.add(p);
  }
  for (const m of src.matchAll(/req\.url\.startsWith\(\s*["']([^"']+)["']/g)) {
    const p = m[1].split('?')[0];
    if (p.startsWith('/api/')) prefix.add(p);
  }
  // The catch-all `/api/` guard at the top of the request pipeline doesn't
  // represent an addressable endpoint.
  prefix.delete('/api/');
  return { exact, prefix };
}

// ── 2. Parse www/_redirects into compiled source regexes + targets ──────────
function extractRedirectRules(src) {
  const rules = [];
  for (const rawLine of src.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const [source, target] = parts;
    if (!source.startsWith('/api/')) continue;
    const re = new RegExp(
      '^' + source.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^?]*') + '$',
    );
    rules.push({ source, target, re });
  }
  return rules;
}

// Does a dev route match at least one redirect rule? For prefix routes we
// also test a synthetic suffix so /api/foo/ matches /api/foo/* rules.
function findMatch(rules, routePath, isPrefix) {
  for (const r of rules) {
    if (r.re.test(routePath)) return r;
    if (isPrefix) {
      const probe = routePath.endsWith('/') ? routePath + 'x' : routePath + '/x';
      if (r.re.test(probe)) return r;
    }
  }
  return null;
}

// Resolve a redirect target to a handler file on disk. Strips the
// `/.netlify/functions/` prefix and the optional `/:splat` (or `/sub-path`)
// suffix; only the top-level function name maps to a file.
function resolveHandlerFile(target) {
  const m = target.match(/^\/\.netlify\/functions\/([A-Za-z0-9_-]+)/);
  if (!m) return null;
  return path.join(FUNCTIONS_DIR, m[1] + '.js');
}

// ── 3. Test execution ───────────────────────────────────────────────────────
const serverSrc    = fs.readFileSync(SERVER_PATH, 'utf8');
const redirectsSrc = fs.readFileSync(REDIRECTS_PATH, 'utf8');
const allowlist    = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
const allowExact   = new Set(allowlist.exact || []);
const allowPrefix  = new Set(allowlist.prefix || []);

const { exact: devExact, prefix: devPrefix } = extractDevRoutes(serverSrc);
const rules = extractRedirectRules(redirectsSrc);

console.log('Static counts');
ok('parsed ≥1 dev exact /api route from server.js',  devExact.size  > 0, `got ${devExact.size}`);
ok('parsed ≥1 dev prefix /api route from server.js', devPrefix.size > 0, `got ${devPrefix.size}`);
ok('parsed ≥1 /api redirect rule from _redirects',   rules.length   > 0, `got ${rules.length}`);

// ── 4. Every redirect target must resolve to a real handler file ────────────
console.log('Every redirect target points to a real handler');
for (const r of rules) {
  const handler = resolveHandlerFile(r.target);
  ok(`${r.source} → ${r.target}`,
     handler !== null && fs.existsSync(handler),
     handler ? `missing file: ${path.relative(ROOT, handler)}` : `unparsable target`);
}

// ── 5. Every dev /api route must be EITHER routed in prod OR allow-listed ──
console.log('Every dev /api route is routed or allow-listed');
const newlyMissingExact  = [];
const newlyMissingPrefix = [];
for (const route of devExact) {
  if (findMatch(rules, route, false)) continue;
  if (allowExact.has(route))          continue;
  newlyMissingExact.push(route);
}
for (const route of devPrefix) {
  if (findMatch(rules, route, true))  continue;
  if (allowPrefix.has(route))         continue;
  newlyMissingPrefix.push(route);
}
ok('no new dev exact routes lack a prod handler or allow-list entry',
   newlyMissingExact.length === 0,
   newlyMissingExact.length
     ? `add a www/_redirects rule or extend _dev-only-api-routes.json for: ${newlyMissingExact.join(', ')}`
     : '');
ok('no new dev prefix routes lack a prod handler or allow-list entry',
   newlyMissingPrefix.length === 0,
   newlyMissingPrefix.length
     ? `add a www/_redirects rule or extend _dev-only-api-routes.json for: ${newlyMissingPrefix.join(', ')}`
     : '');

// ── 6. Allow-list hygiene: stale entries (route no longer in server.js) ────
console.log('Allow-list stays trim');
const staleAllowExact  = [...allowExact ].filter(p => !devExact.has(p));
const staleAllowPrefix = [...allowPrefix].filter(p => !devPrefix.has(p));
ok('no stale exact entries in allow-list (remove if route no longer exists)',
   staleAllowExact.length === 0,
   staleAllowExact.length ? `remove from allow-list: ${staleAllowExact.join(', ')}` : '');
ok('no stale prefix entries in allow-list (remove if route no longer exists)',
   staleAllowPrefix.length === 0,
   staleAllowPrefix.length ? `remove from allow-list: ${staleAllowPrefix.join(', ')}` : '');

// ── 7. Regression pin: the four Task #343 survey handlers MUST stay routed ──
console.log('Regression pin: Task #343 survey handlers stay routed');
for (const slug of ['survey-response','survey-abandoned','survey-area-check','survey-referral-link','survey-profile']) {
  const route   = '/api/survey/' + slug.replace(/^survey-/, '');
  const matched = findMatch(rules, route, false);
  const file    = matched && resolveHandlerFile(matched.target);
  ok(`${route} routes to existing ${slug}.js`,
     matched && matched.target.endsWith('/' + slug) && file && fs.existsSync(file),
     matched ? `target was ${matched.target}` : 'no matching redirect rule');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

#!/usr/bin/env node
// scripts/audit-integrity.js — Phase 0 automated integrity sweep.
// Read-only. No npm deps. See docs/MCC_AUDIT_PLAN.md Phase 0.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const NF = path.join(ROOT, 'netlify', 'functions');
const OUT_DIR = path.join(ROOT, 'docs', 'audit');

// ─── helpers ────────────────────────────────────────────────────────────────
function walk(dir, extRe, skipDirs, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (skipDirs.has(e.name)) continue;
      walk(full, extRe, skipDirs, out);
    } else if (extRe.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}
function rel(p) { return path.relative(ROOT, p); }
function readLines(p) {
  try { return fs.readFileSync(p, 'utf8').split(/\r?\n/); }
  catch { return []; }
}
function unique(arr) { return Array.from(new Set(arr)); }

// ─── Section A — Route Integrity Matrix ─────────────────────────────────────
const wwwFiles = walk(WWW, /\.(html|js)$/i, new Set(['node_modules', '_next', 'assets', 'blog', '.netlify-deploy']));

const API_LITERAL = /['"](\/api\/[^'"?#\s]+)['"]/g;
const API_TEMPLATE = /`(\/api\/[^`\s${}]+)`/g;
const API_TEMPLATE_INTERP = /`(\/api\/[^`]*\$\{[^}]+\})/g;
const FETCH_DYNAMIC = /(?:^|[^.\w])(?:fetch|apiFetch|axios\.\w+)\s*\(\s*([^'"`,)]+)[,)]/g;

const frontendCalls = []; // { path, file, line }
const unresolved = [];    // { file, line, snippet }

for (const f of wwwFiles) {
  const lines = readLines(f);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Strip line comments (best effort — HTML doesn't use // but JS does)
    const codeOnly = line.replace(/\/\/.*$/, '');

    let m;
    API_LITERAL.lastIndex = 0;
    while ((m = API_LITERAL.exec(codeOnly))) {
      frontendCalls.push({ path: m[1], file: rel(f), line: i + 1 });
    }
    API_TEMPLATE.lastIndex = 0;
    while ((m = API_TEMPLATE.exec(codeOnly))) {
      frontendCalls.push({ path: m[1], file: rel(f), line: i + 1 });
    }
    // Template with interpolation starting /api/ — capture literal prefix only
    API_TEMPLATE_INTERP.lastIndex = 0;
    while ((m = API_TEMPLATE_INTERP.exec(codeOnly))) {
      // Capture the literal prefix as a partial path (marker for dynamic segment)
      const prefix = m[1].split('${')[0];
      frontendCalls.push({ path: prefix + '${DYNAMIC}', file: rel(f), line: i + 1, dynamic: true });
    }
    // Dynamic fetch — argument not a fully-literal string
    FETCH_DYNAMIC.lastIndex = 0;
    while ((m = FETCH_DYNAMIC.exec(codeOnly))) {
      const arg = m[1].trim();
      if (!/^['"`]/.test(arg)) {
        // Not a string literal — dynamic URL
        unresolved.push({ file: rel(f), line: i + 1, snippet: line.trim().slice(0, 120) });
      }
    }
  }
}

// Parse _redirects
const redirectsPath = path.join(WWW, '_redirects');
const redirectRules = []; // { source, dest, status, line }
{
  const lines = readLines(redirectsPath);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/#.*$/, '').trim();
    if (!raw) continue;
    const parts = raw.split(/\s+/);
    if (parts.length < 2) continue;
    redirectRules.push({ source: parts[0], dest: parts[1], status: parts[2] || '', line: i + 1 });
  }
}

// Compile source patterns into regex matchers
function ruleToRegex(source) {
  // Convert Netlify glob to regex: * → .* ; :name → [^/]+
  const escaped = source.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const withGlob = escaped.replace(/\*/g, '.*').replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '[^/]+');
  return new RegExp('^' + withGlob + '$');
}
const compiledRules = redirectRules.map(r => ({ ...r, re: ruleToRegex(r.source) }));

// Netlify functions inventory
let functionFiles = [];
try { functionFiles = fs.readdirSync(NF).filter(n => n.endsWith('.js')); }
catch {}
const functionNames = new Set(functionFiles.map(n => n.replace(/\.js$/, '')));

// Which functions are scheduled? (skip from unrouted list)
const scheduledFunctions = new Set();
for (const f of functionFiles) {
  const content = fs.readFileSync(path.join(NF, f), 'utf8');
  if (/exports\.config\s*=\s*\{[^}]*schedule/.test(content) ||
      /['"]@netlify\/functions['"]/.test(content) && /schedule\s*:/.test(content) ||
      /['"]schedule['"]\s*:\s*['"][^'"]+['"]/.test(content)) {
    scheduledFunctions.add(f.replace(/\.js$/, ''));
  }
}

// Best-effort dispatcher sub-path extraction (informational)
const functionSubpaths = {};
for (const f of functionFiles) {
  const content = fs.readFileSync(path.join(NF, f), 'utf8');
  const paths = [];
  // Match: case 'foo': | path === 'foo' | path.startsWith('foo') | if (path === 'foo')
  const patterns = [
    /case\s+['"]([^'"]+)['"]/g,
    /path\s*===\s*['"]([^'"]+)['"]/g,
    /subpath\s*===\s*['"]([^'"]+)['"]/g,
    /path\.startsWith\(['"]([^'"]+)['"]\)/g,
    /event\.path[^,]*['"]([^'"]+)['"]/g,
  ];
  for (const pat of patterns) {
    let m;
    while ((m = pat.exec(content))) paths.push(m[1]);
  }
  if (paths.length) functionSubpaths[f.replace(/\.js$/, '')] = unique(paths);
}

// Find frontend → void
const uniqueFrontendPaths = unique(frontendCalls.filter(c => !c.dynamic).map(c => c.path));
const dynamicFrontendPaths = unique(frontendCalls.filter(c => c.dynamic).map(c => c.path));

function pathMatchesAnyRule(p) {
  // Strip query strings for matching
  const cleaned = p.split('?')[0].split('#')[0];
  return compiledRules.some(r => r.re.test(cleaned));
}

const frontendToVoid = uniqueFrontendPaths
  .filter(p => !pathMatchesAnyRule(p))
  .sort();

// Attach call sites for each void path
const voidWithCallSites = frontendToVoid.map(p => ({
  path: p,
  callers: frontendCalls.filter(c => c.path === p).map(c => `${c.file}:${c.line}`),
}));

// Unrouted functions
const routedFunctions = new Set();
for (const r of redirectRules) {
  const m = r.dest.match(/\/\.netlify\/functions\/([A-Za-z0-9_-]+)/);
  if (m) routedFunctions.add(m[1]);
}
const unroutedFunctions = [...functionNames]
  .filter(n => !routedFunctions.has(n))
  .filter(n => !scheduledFunctions.has(n))
  .filter(n => !n.startsWith('_'))            // _prefixed = shared helpers, not endpoints
  .filter(n => !n.endsWith('-scheduled'))     // -scheduled suffix = cron, not endpoint
  .filter(n => !n.endsWith('-shared'))
  .filter(n => !n.endsWith('-core'))
  .sort();

// Orphan redirects
const orphanRedirects = redirectRules
  .map(r => {
    const m = r.dest.match(/\/\.netlify\/functions\/([A-Za-z0-9_-]+)/);
    if (!m) return null;
    const fnName = m[1];
    if (!functionNames.has(fnName)) {
      return { source: r.source, dest: r.dest, line: r.line, missingFunction: fnName };
    }
    return null;
  })
  .filter(Boolean);

// ─── Section B — Page Wiring Check ──────────────────────────────────────────
const htmlFiles = walk(WWW, /\.html$/i, new Set(['node_modules', '_next', 'assets', 'blog', 'admin']));
// Also grab www/admin/*.html explicitly (small dir)
try {
  fs.readdirSync(path.join(WWW, 'admin')).forEach(n => {
    if (n.endsWith('.html')) htmlFiles.push(path.join(WWW, 'admin', n));
  });
} catch {}

const pageWiring = []; // { file, usesSupabase, hasCDN, hasClient, orderOK, cdnLine, clientLine }
const bareNamespace = []; // { file, line, snippet }

const SB_USE_RE = /\bsupabaseClient\.|\bsupabase\.(auth|from|rpc|storage)\b/;
const CDN_RE = /<script[^>]*src=["'][^"']*@supabase\/supabase-js[^"']*["']/i;
const CLIENT_RE = /<script[^>]*src=["'](?:\.\/)?supabaseclient(?:\.min)?\.js(?:\?[^"']*)?["']/i;
const BARE_RE = /(?<![A-Za-z0-9_])supabase\.(auth|from|rpc|storage)\b/g;

for (const f of htmlFiles) {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split(/\r?\n/);
  if (!SB_USE_RE.test(content)) continue;

  let cdnLine = -1, clientLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (cdnLine < 0 && CDN_RE.test(lines[i])) cdnLine = i + 1;
    if (clientLine < 0 && CLIENT_RE.test(lines[i])) clientLine = i + 1;
  }
  const orderOK = cdnLine > 0 && clientLine > 0 && cdnLine < clientLine;
  const missingCDN = cdnLine < 0;
  const missingClient = clientLine < 0;

  pageWiring.push({
    file: rel(f),
    hasCDN: cdnLine > 0,
    hasClient: clientLine > 0,
    orderOK,
    missingCDN,
    missingClient,
    cdnLine, clientLine,
  });

  // Bare namespace scan
  for (let i = 0; i < lines.length; i++) {
    const codeOnly = lines[i].replace(/\/\/.*$/, '');
    if (/^\s*\*/.test(codeOnly)) continue; // block-comment continuation
    BARE_RE.lastIndex = 0;
    let m;
    while ((m = BARE_RE.exec(codeOnly))) {
      // Guard: not "supabaseClient." (regex already handles via \b + not-preceded), also skip typeof window.supabase
      const before = codeOnly.slice(Math.max(0, m.index - 20), m.index);
      if (/window\./.test(before) || /typeof\s+$/.test(before)) continue;
      bareNamespace.push({ file: rel(f), line: i + 1, snippet: lines[i].trim().slice(0, 140) });
    }
  }
}

// STATIC_ASSETS membership
const staticAssets = [];
{
  const sw = fs.readFileSync(path.join(WWW, 'sw.js'), 'utf8');
  const m = sw.match(/STATIC_ASSETS\s*=\s*\[([\s\S]*?)\]/);
  if (m) {
    const items = m[1].match(/['"]([^'"]+)['"]/g) || [];
    items.forEach(s => staticAssets.push(s.replace(/['"]/g, '')));
  }
}

// ─── Section C — Coherence / Noise Inventory ────────────────────────────────
const NOISE = [
  '/api/config',
  '/api/car-club/notifications',
  '/api/car-club/testimonials',
  '/api/car-club/recommended',
  '/api/clover',
  '/api/pos',
  '/api/bgcheck/status',
  '/api/saas/shop-status',
  '/api/shop/onboarding-status',
  '/api/provider/refunds',
  '/api/concierge',
  '/api/analytics/track',
  '/api/white-label/config',
];
const noiseFindings = NOISE.map(p => {
  const callers = frontendCalls
    .filter(c => c.path === p || c.path.startsWith(p + '/'))
    .map(c => `${c.file}:${c.line}`);
  const hasRedirect = compiledRules.some(r => r.re.test(p));
  const routedTo = redirectRules.find(r => ruleToRegex(r.source).test(p));
  const targetFn = routedTo ? (routedTo.dest.match(/\/\.netlify\/functions\/([A-Za-z0-9_-]+)/) || [])[1] : null;
  const resolves = targetFn ? functionNames.has(targetFn) : false;
  return { path: p, callers: unique(callers), hasRedirect, targetFn, resolves };
});

// Era mismatch
function countRefs(term, roots) {
  const files = [];
  for (const r of roots) {
    const walkAll = walk(r, /\.(js|sql|html)$/i, new Set(['node_modules', 'assets', 'blog']));
    for (const f of walkAll) {
      const content = fs.readFileSync(f, 'utf8');
      const lines = content.split(/\r?\n/);
      const hits = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(term)) hits.push(i + 1);
      }
      if (hits.length) files.push({ file: rel(f), hits: hits.length, lines: hits.slice(0, 5) });
    }
  }
  return files;
}
const eraRoots = [
  path.join(ROOT, 'netlify', 'functions'),
  path.join(ROOT, 'supabase', 'migrations'),
  WWW,
];
const eraMismatch = {
  club_reward_rules: countRefs('club_reward_rules', eraRoots),
  club_rewards: countRefs('club_rewards', eraRoots),
  car_club_redemptions: countRefs('car_club_redemptions', eraRoots),
  club_points_redemptions: countRefs('club_points_redemptions', eraRoots),
};

// Root vs www twins
const rootFiles = new Set(fs.readdirSync(ROOT).filter(n => {
  try { return fs.statSync(path.join(ROOT, n)).isFile(); }
  catch { return false; }
}));
const wwwTopFiles = new Set(fs.readdirSync(WWW).filter(n => {
  try { return fs.statSync(path.join(WWW, n)).isFile(); }
  catch { return false; }
}));
const twins = [];
for (const n of rootFiles) {
  if (wwwTopFiles.has(n) && /\.(js|html|css)$/.test(n)) {
    const rootContent = fs.readFileSync(path.join(ROOT, n), 'utf8');
    const wwwContent = fs.readFileSync(path.join(WWW, n), 'utf8');
    twins.push({
      name: n,
      rootBytes: rootContent.length,
      wwwBytes: wwwContent.length,
      identical: rootContent === wwwContent,
    });
  }
}
// sw.js version drift specifically
const rootSw = (fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/CACHE_NAME\s*=\s*['"]([^'"]+)['"]/) || [])[1];
const wwwSw = (fs.readFileSync(path.join(WWW, 'sw.js'), 'utf8').match(/CACHE_NAME\s*=\s*['"]([^'"]+)['"]/) || [])[1];

// ─── Emit outputs ───────────────────────────────────────────────────────────
fs.mkdirSync(OUT_DIR, { recursive: true });

const raw = {
  meta: {
    generatedAt: new Date().toISOString(),
    wwwFilesScanned: wwwFiles.length,
    functionsInventoried: functionFiles.length,
    redirectRulesParsed: redirectRules.length,
    scheduledFunctions: [...scheduledFunctions],
  },
  sectionA: {
    frontendCallsTotal: frontendCalls.length,
    uniqueLiteralPathsSeen: uniqueFrontendPaths.length,
    dynamicPathPatterns: dynamicFrontendPaths,
    unresolvedFetches: unresolved,
    frontendToVoid: voidWithCallSites,
    unroutedFunctions,
    orphanRedirects,
    functionSubpathsSample: Object.fromEntries(Object.entries(functionSubpaths).slice(0, 20)),
  },
  sectionB: {
    pageWiring,
    bareNamespaceUses: bareNamespace,
    staticAssets,
  },
  sectionC: {
    noiseFindings,
    eraMismatch,
    twins,
    swVersionDrift: { root: rootSw, www: wwwSw, diff: rootSw !== wwwSw },
  },
};
fs.writeFileSync(path.join(OUT_DIR, 'PHASE0_RAW.json'), JSON.stringify(raw, null, 2));
console.log('Raw written:', rel(path.join(OUT_DIR, 'PHASE0_RAW.json')));
console.log('Section A: frontend→void=' + voidWithCallSites.length + ', unroutedFns=' + unroutedFunctions.length + ', orphanRedirects=' + orphanRedirects.length);
console.log('Section B: bareNamespace=' + bareNamespace.length + ', pages with missing wiring=' +
  pageWiring.filter(p => p.missingCDN || p.missingClient || !p.orderOK).length);
console.log('Section C: noise-endpoints-called=' + noiseFindings.filter(n => n.callers.length).length +
  ', twins=' + twins.length + ', sw drift=' + (rootSw !== wwwSw ? rootSw + ' vs ' + wwwSw : 'none'));

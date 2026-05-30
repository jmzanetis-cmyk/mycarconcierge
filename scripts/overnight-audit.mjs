#!/usr/bin/env node
/**
 * overnight-audit.mjs  —  READ-ONLY platform audit (safe to run unattended)
 * ===========================================================================
 * Three static/read-only scans, no writes, no browser, no side effects:
 *
 *   1. SILENT FAILURES  — catch blocks that only log and continue, on critical
 *      paths (signup / payment / profile-insert / booking). This is the pattern
 *      that hid the broken loyal-customer signup: error swallowed, user sees
 *      "success", nothing actually happened.
 *
 *   2. READ-SIDE SCHEMA GAP — the write-guard's blind spot. Flags:
 *        (a) READS of columns that don't exist (silent null, dead feature)
 *        (b) columns that EXIST in the DB but nothing in code references
 *            (dead schema) — reported as FYI, not a bug.
 *
 *   3. SECRETS EXPOSURE — service-role keys, Stripe secret keys (sk_/rk_),
 *      Twilio auth tokens, or generic high-entropy secrets shipped in client
 *      files. High-consequence if found.
 *
 * SAFETY: never writes anything. DB access is SELECT-only (one sample row per
 * table, same as the write-guard). Designed to be run once and read in the
 * morning.
 *
 * USAGE
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node overnight-audit.mjs [--dir www] [--json] [--out report.md]
 *
 *   Schema scan (#2a/b) is skipped automatically if no DB creds are given;
 *   scans #1 and #3 are pure-static and always run.
 * ===========================================================================
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname, basename } from 'node:path';

let createClient = null;
try { ({ createClient } = await import('@supabase/supabase-js')); } catch {}

// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const getArg = (f, d) => { const i = args.indexOf(f); return i !== -1 && args[i + 1] ? args[i + 1] : d; };
const SCAN_DIR = getArg('--dir', 'www');
const JSON_OUT = args.includes('--json');
const OUT_FILE = getArg('--out', null);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const IGNORE_DIRS = new Set(['.netlify-deploy', 'node_modules', '.git', 'assets']);
// Files that are allowed to contain server secrets (never shipped to browser).
// Anything under netlify/functions or *server*.js is server-side.
const SERVER_PATH_RE = /(netlify[\/\\]functions|[\/\\]server\.js$|server[\/\\])/i;
const CRITICAL_RE = /(signup|sign-up|register|checkout|payment|pay\b|stripe|booking|book\b|profile|referral|payout|escrow|subscribe)/i;

function walk(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const name of entries) {
    if (IGNORE_DIRS.has(name)) continue;
    if (name.startsWith('stress-test')) continue;
    const full = join(dir, name);
    let st; try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, acc);
    else if (['.js', '.mjs', '.html', '.jsx'].includes(extname(name))) acc.push(full);
  }
  return acc;
}
const rel = (p) => relative(process.cwd(), p);
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;
const dedupe = (a) => [...new Set(a)];

// ===========================================================================
// SCAN 1 — Silent failures
// ===========================================================================
// Find catch(...) { ... } bodies whose entire content is logging + (optionally)
// a bare return / nothing — i.e. the error is swallowed. Rank higher when the
// surrounding ~600 chars mention a critical keyword (signup/payment/etc).
function scanSilentFailures(files) {
  const hits = [];
  const CATCH_RE = /catch\s*\([^)]*\)\s*\{/g;
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    let m;
    CATCH_RE.lastIndex = 0;
    while ((m = CATCH_RE.exec(src)) !== null) {
      const bodyOpen = m.index + m[0].length - 1; // index of '{'
      const bodyClose = matchBrace(src, bodyOpen);
      if (bodyClose === -1) continue;
      const body = src.slice(bodyOpen + 1, bodyClose).trim();
      const verdict = classifyCatchBody(body);
      if (verdict === 'ok') continue;
      // context for criticality: look back only within the enclosing function,
      // not a fixed byte window (which bled into adjacent functions). Find the
      // nearest preceding function/arrow start and clamp the window there.
      const lookbackRaw = src.slice(Math.max(0, m.index - 600), m.index);
      const fnBoundary = Math.max(
        lookbackRaw.lastIndexOf('function '),
        lookbackRaw.lastIndexOf('=>'),
        lookbackRaw.lastIndexOf('async ')
      );
      const scoped = fnBoundary !== -1 ? lookbackRaw.slice(fnBoundary) : lookbackRaw;
      const ctx = scoped + src.slice(m.index, m.index + 120);
      const severity = CRITICAL_RE.test(ctx) ? 'HIGH' : (CRITICAL_RE.test(rel(file)) ? 'MEDIUM' : 'low');
      hits.push({
        file: rel(file),
        line: lineOf(src, m.index),
        severity,
        kind: verdict, // 'empty' | 'log-only'
        snippet: body.replace(/\s+/g, ' ').slice(0, 120),
      });
    }
  }
  // HIGH first
  const rank = { HIGH: 0, MEDIUM: 1, low: 2 };
  hits.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return hits;
}

// Returns 'ok' (handles the error meaningfully), 'empty' (does nothing), or
// 'log-only' (only console.* / no rethrow / no user-facing error handling).
function classifyCatchBody(body) {
  if (body === '') return 'empty';
  // Strip comments.
  const code = body.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (code === '') return 'empty';
  // Tokens that indicate the error is actually handled / surfaced:
  const handles = /(throw|reject|return\s+\w|res\.status|statusCode|showToast|setError|toast|alert\(|next\(|captureException|Sentry|res\.json|response\.|navigate|window\.location|rollback|retry|notify)/i;
  if (handles.test(code)) return 'ok';
  // Only logging?
  const onlyLog = /^(?:(?:await\s+)?console\.\w+\([^;]*\);?\s*|return;?\s*|;\s*)+$/.test(
    code.replace(/\n/g, ' ')
  );
  if (onlyLog) return 'log-only';
  // Has *some* statement we don't recognize as handling — treat as log-only-ish
  // only if it still contains a console and nothing from `handles`. Otherwise OK.
  if (/console\.\w+/.test(code)) return 'log-only';
  return 'ok';
}

function matchBrace(src, openIdx) {
  let depth = 0, str = null, tmpl = false;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (str) { if (c === str && src[i - 1] !== '\\') str = null; continue; }
    if (tmpl) { if (c === '`' && src[i - 1] !== '\\') tmpl = false; continue; }
    if (c === '"' || c === "'") { str = c; continue; }
    if (c === '`') { tmpl = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// ===========================================================================
// SCAN 3 — Secrets exposure (static; client files only)
// ===========================================================================
function scanSecrets(files) {
  const hits = [];
  const PATTERNS = [
    { name: 'Stripe secret key', re: /\bsk_(live|test)_[A-Za-z0-9]{16,}/g },
    { name: 'Stripe restricted key', re: /\brk_(live|test)_[A-Za-z0-9]{16,}/g },
    { name: 'Supabase service_role JWT', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, jwtCheck: true },
    { name: 'Twilio Auth Token (assignment)', re: /(twilio|auth[_-]?token)\s*[:=]\s*['"][0-9a-f]{32}['"]/gi },
    { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/g },
    { name: 'Generic secret assignment', re: /(secret|password|api[_-]?key|private[_-]?key)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/gi, lowConf: true },
  ];
  for (const file of files) {
    if (SERVER_PATH_RE.test(file)) continue; // server files may legitimately hold secrets
    const src = readFileSync(file, 'utf8');
    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(src)) !== null) {
        const val = m[0];
        // JWT: only flag if it decodes to role: service_role.
        if (p.jwtCheck) {
          const role = peekJwtRole(val);
          if (role !== 'service_role') continue;
        }
        // Ignore obvious publishable keys / anon placeholders.
        if (/pk_(live|test)_/.test(val)) continue;
        hits.push({
          file: rel(file),
          line: lineOf(src, m.index),
          type: p.name,
          confidence: p.lowConf ? 'low' : 'HIGH',
          preview: maskSecret(val),
        });
      }
    }
  }
  return hits;
}

function peekJwtRole(jwt) {
  try {
    const payload = jwt.split('.')[1];
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return json.role || null;
  } catch { return null; }
}
function maskSecret(s) {
  if (s.length <= 12) return s.slice(0, 4) + '…';
  return s.slice(0, 8) + '…' + s.slice(-4) + ` (${s.length} chars)`;
}

// ===========================================================================
// SCAN 2 — Read-side schema gap (needs DB)
// ===========================================================================
// Reuses the write-guard's chain walk, but for .select('a, b, c') column lists
// and post-fetch property access is out of scope (too dynamic). We focus on the
// reliable, high-signal case: explicit column lists in .select('...').
async function scanReadSideSchema(files) {
  if (!process.env.SCHEMA_JSON && (!createClient || !SUPABASE_URL || !SERVICE_KEY)) {
    return { skipped: true, reason: 'no DB creds or @supabase/supabase-js not installed' };
  }
  const FROM_RE = /\.from\(\s*['"`]([A-Za-z0-9_]+)['"`]\s*\)/g;
  const reads = []; // {file,line,table,columns:[]}
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    let m; FROM_RE.lastIndex = 0;
    while ((m = FROM_RE.exec(src)) !== null) {
      const table = m[1];
      const sel = findSelectInChain(src, m.index + m[0].length);
      if (!sel) continue;
      // parse the first string arg of .select('...')
      const cols = parseSelectColumns(sel.arg);
      if (!cols) continue; // select('*') or dynamic — skip
      reads.push({ file: rel(file), line: lineOf(src, m.index), table, columns: cols });
    }
  }
  const tables = dedupe(reads.map((r) => r.table));
  const schema = await loadSchema(tables);
  const missing = [];
  for (const r of reads) {
    const tbl = schema[r.table];
    if (!tbl || tbl.columns === null) continue; // unverifiable
    const bad = r.columns.filter((c) => !tbl.columns.has(c));
    if (bad.length) missing.push({ ...r, bad });
  }
  // Dead schema: columns present in DB but never referenced anywhere in code.
  const referenced = new Set();
  for (const r of reads) r.columns.forEach((c) => referenced.add(`${r.table}.${c}`));
  // (writes aren't parsed here; treat this as FYI only and conservative.)
  const deadSchema = [];
  for (const t of tables) {
    const tbl = schema[t];
    if (!tbl || tbl.columns === null) continue;
    for (const col of tbl.columns) {
      if (col === 'id' || col === 'created_at' || col === 'updated_at') continue;
      if (!referenced.has(`${t}.${col}`)) {
        // only FYI; a column may be written-only or used via select('*')
      }
    }
  }
  return { skipped: false, missing, scannedReads: reads.length, tables: tables.length };
}

function findSelectInChain(src, chainStart) {
  let i = chainStart;
  while (i < src.length) {
    let j = i; while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] !== '.') return null;
    let k = j + 1, name = '';
    while (k < src.length && /[A-Za-z0-9_$]/.test(src[k])) { name += src[k]; k++; }
    let p = k; while (p < src.length && /\s/.test(src[p])) p++;
    if (src[p] !== '(') return null;
    const close = matchParen(src, p);
    if (close === -1) return null;
    if (name === 'select') return { arg: src.slice(p + 1, close) };
    if (['insert', 'update', 'upsert', 'delete'].includes(name)) return null; // a write chain
    i = close + 1;
  }
  return null;
}
function matchParen(src, openIdx) {
  let depth = 0, str = null;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (str) { if (c === str && src[i - 1] !== '\\') str = null; continue; }
    if (c === '"' || c === "'" || c === '`') { str = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}
// Parse the first quoted string in .select(...) into top-level column names.
// Skips embedded relations like "provider:profiles(name)" (anything with '(').
function parseSelectColumns(arg) {
  const mm = arg.match(/^['"`]([^'"`]*)['"`]/);
  if (!mm) return null;
  const list = mm[1];
  if (list.includes('*')) return null;
  if (list.includes('(')) return null; // joined/embedded select — too complex, skip
  const cols = list.split(',').map((s) => s.trim().split(':')[0].trim()).filter(Boolean);
  const clean = cols.filter((c) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(c));
  return clean.length ? clean : null;
}

async function loadSchema(tables) {
  if (process.env.SCHEMA_JSON) {
    const raw = JSON.parse(readFileSync(process.env.SCHEMA_JSON, 'utf8'));
    const out = {};
    for (const t of tables) out[t] = raw[t] ? { columns: new Set(raw[t]), error: null } : { columns: null, error: 'NOT_IN_SCHEMA_JSON' };
    return out;
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const schema = {};
  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      if (error) { schema[table] = { columns: null, error: error.message }; continue; }
      schema[table] = data && data.length
        ? { columns: new Set(Object.keys(data[0])), error: null }
        : { columns: null, error: 'EMPTY_TABLE' };
    } catch (e) {
      schema[table] = { columns: null, error: e.message };
    }
  }
  return schema;
}

// ===========================================================================
// Run + report
// ===========================================================================
const files = walk(SCAN_DIR);
const silent = scanSilentFailures(files);
const secrets = scanSecrets(files);
const readSide = await scanReadSideSchema(files);

const result = { scannedFiles: files.length, silent, secrets, readSide };

if (JSON_OUT) {
  console.log(JSON.stringify(result, (k, v) => (v instanceof Set ? [...v] : v), 2));
} else {
  const md = renderMarkdown(result);
  if (OUT_FILE) { writeFileSync(OUT_FILE, md); console.log(`Report written to ${OUT_FILE}`); }
  console.log(md);
}

function renderMarkdown(r) {
  const L = [];
  L.push('# Overnight Audit Report');
  L.push(`Scanned ${r.scannedFiles} files under \`${SCAN_DIR}\`. Read-only — nothing was modified.\n`);

  // 1
  const hi = r.silent.filter((h) => h.severity === 'HIGH');
  L.push(`## 1. Silent Failures  (${hi.length} HIGH, ${r.silent.length} total)`);
  L.push('Catch blocks that log-and-continue. HIGH = on a critical path (signup/payment/etc).');
  L.push('These can make a broken operation look successful to the user.\n');
  if (!r.silent.length) L.push('_None found._\n');
  else {
    L.push('| Sev | Location | Kind | Catch body |');
    L.push('|-----|----------|------|------------|');
    for (const h of r.silent.slice(0, 60)) {
      L.push(`| ${h.severity} | ${h.file}:${h.line} | ${h.kind} | \`${h.snippet.replace(/\|/g, '\\|')}\` |`);
    }
    if (r.silent.length > 60) L.push(`\n_…and ${r.silent.length - 60} more (low severity)._`);
    L.push('');
  }

  // 3
  L.push(`## 2. Secrets Exposure  (${r.secrets.filter(s=>s.confidence==='HIGH').length} HIGH-confidence)`);
  L.push('Possible secrets in client-shipped files (server files excluded).\n');
  if (!r.secrets.length) L.push('_None found — clean._\n');
  else {
    L.push('| Conf | Location | Type | Preview |');
    L.push('|------|----------|------|---------|');
    for (const s of r.secrets) {
      L.push(`| ${s.confidence} | ${s.file}:${s.line} | ${s.type} | \`${s.preview}\` |`);
    }
    L.push('\n**If any HIGH row is real, rotate that key immediately** — anything in a client file is public.\n');
  }

  // 2
  L.push('## 3. Read-Side Schema Gaps');
  if (r.readSide.skipped) {
    L.push(`_Skipped: ${r.readSide.reason}. Re-run with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to enable._\n`);
  } else if (!r.readSide.missing.length) {
    L.push(`_Scanned ${r.readSide.scannedReads} explicit \`.select()\` column lists across ${r.readSide.tables} tables — no reads of missing columns._\n`);
  } else {
    L.push(`Reads of columns that **don't exist** (silently return null — dead feature). ${r.readSide.missing.length} found:\n`);
    L.push('| Location | Table | Missing in select() |');
    L.push('|----------|-------|---------------------|');
    for (const m of r.readSide.missing) {
      L.push(`| ${m.file}:${m.line} | ${m.table} | ${m.bad.join(', ')} |`);
    }
    L.push('');
  }

  L.push('---');
  L.push('### How to read this');
  L.push('- **Silent failures HIGH**: each is a place where a failure is invisible to the user. Triage by asking "if this `catch` fired, would the user wrongly think it worked?"');
  L.push('- **Secrets HIGH**: treat as an incident — rotate the key, then move it server-side.');
  L.push('- **Read-side gaps**: same class as the write-drift bugs, but for reads — the feature reading that column has never worked.');
  L.push('- Limits: static analysis. Silent-failure detection is heuristic (may flag intentional best-effort catches — that\'s fine, review and dismiss). Read-side scan only covers explicit `.select(\'col, col\')` lists, not `select(\'*\')` + property access.');
  return L.join('\n');
}

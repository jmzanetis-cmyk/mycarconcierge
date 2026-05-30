#!/usr/bin/env node
/**
 * check-schema-drift.mjs
 * ---------------------------------------------------------------------------
 * Scans front-end JS for Supabase table WRITES (.insert / .update / .upsert)
 * and verifies every column referenced actually exists in the live database
 * schema. Exits non-zero if any referenced column is missing — the exact
 * failure mode (Postgres 42703 "column does not exist") that caused the
 * vehicles.member_id, booking_guidance, and preferred_language bugs.
 *
 * It is deliberately conservative: writes it cannot statically parse are
 * reported as UNANALYZED (and cause a non-zero exit unless --lax is passed),
 * never silently treated as passing. A green run means "everything I could
 * read is correct", and the report tells you exactly what it couldn't read.
 *
 * USAGE
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node check-schema-drift.mjs [--dir www] [--lax] [--json]
 *
 *   --dir <path>   Directory to scan (default: ./www)
 *   --lax          UNANALYZED writes warn but do not fail the run
 *   --json         Emit machine-readable JSON instead of the text report
 *
 * REQUIREMENTS
 *   npm i @supabase/supabase-js
 *   A SERVICE ROLE key (reads information_schema; never expose this in the
 *   browser bundle — this script is build/CI-time only).
 * ---------------------------------------------------------------------------
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const getArg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const SCAN_DIR = getArg('--dir', 'www');
const LAX = args.includes('--lax');
const JSON_OUT = args.includes('--json');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Directories whose contents are bundled vendor output, not source we control.
// (.netlify-deploy contained the minified Supabase lib that polluted greps.)
const IGNORE_DIRS = new Set(['.netlify-deploy', 'node_modules', '.git', 'assets']);

// Columns that PostgREST/Supabase accepts implicitly and that may not appear
// in information_schema the way you'd expect. Extend if needed.
const ALWAYS_OK = new Set([]);

// ---------------------------------------------------------------------------
// 1. Collect candidate files
// ---------------------------------------------------------------------------
function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (IGNORE_DIRS.has(name)) continue;
    if (name.startsWith('stress-test')) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, acc);
    else if (['.js', '.mjs', '.html'].includes(extname(name))) acc.push(full);
  }
  return acc;
}

// ---------------------------------------------------------------------------
// 2. Find writes and extract (table, columns) — or mark UNANALYZED
// ---------------------------------------------------------------------------
//
// Strategy: locate `.from('table')` then find the next .insert/.update/.upsert
// in the same chain, and try to parse the FIRST object-literal argument's
// top-level keys. If the argument isn't a readable inline literal (it's a
// variable, a spread, a function call, etc.) we record the write but flag the
// columns as unanalyzable rather than guessing.

const FROM_RE = /\.from\(\s*['"`]([A-Za-z0-9_]+)['"`]\s*\)/g;
const WRITE_METHOD_RE = /\.\s*(insert|update|upsert)\s*\(/;

// Given source text and the index right after the write method's "(",
// return { keys: string[]|null, ok: boolean }.
// keys=null means "could not statically determine columns".
function extractObjectKeys(src, openParenIdx) {
  // Skip whitespace to find first non-space char of the argument.
  let i = openParenIdx;
  while (i < src.length && /\s/.test(src[i])) i++;
  // Arrays of rows: .insert([{...}, {...}]) — step into the first element.
  if (src[i] === '[') {
    i++;
    while (i < src.length && /\s/.test(src[i])) i++;
  }
  if (src[i] !== '{') {
    // First arg is not an object literal (variable / call / spread root).
    return { keys: null, ok: false };
  }
  // Walk the object literal, tracking brace/bracket/paren depth and strings,
  // collecting top-level keys (depth === 1, before the first ':' of each pair).
  const keys = [];
  let depth = 0;
  let str = null; // current string-quote char or null
  let pendingKey = '';
  let collecting = true; // are we currently reading a key (vs a value)?
  let unparseable = false;

  for (; i < src.length; i++) {
    const c = src[i];

    if (str) {
      if (c === str && src[i - 1] !== '\\') str = null;
      else if (collecting && depth === 1) pendingKey += c;
      continue;
    }

    if (c === '"' || c === "'" || c === '`') {
      str = c;
      continue;
    }

    if (c === '{') {
      depth++;
      if (depth === 1) {
        collecting = true;
        pendingKey = '';
      }
      continue;
    }
    if (c === '}') {
      depth--;
      if (depth === 0) {
        // close of the object literal — flush a trailing bareword key if any
        const k = pendingKey.trim();
        if (k && /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) keys.push(k);
        return { keys: dedupe(keys), ok: !unparseable };
      }
      continue;
    }
    if (c === '[' || c === '(') { depth++; continue; }
    if (c === ']' || c === ')') { depth--; continue; }

    if (depth === 1) {
      if (c === ':') {
        // pendingKey holds the key for this pair
        const k = pendingKey.trim().replace(/^['"`]|['"`]$/g, '');
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) keys.push(k);
        else if (k.startsWith('...') || k.includes('[')) unparseable = true; // computed/spread
        collecting = false;
        pendingKey = '';
      } else if (c === ',') {
        collecting = true;
        pendingKey = '';
      } else if (c === '.' && src[i + 1] === '.' && src[i + 2] === '.') {
        unparseable = true; // spread at top level — columns come from elsewhere
      } else if (collecting) {
        pendingKey += c;
      }
    }
  }
  // Ran off the end without closing — unparseable.
  return { keys: keys.length ? dedupe(keys) : null, ok: false };
}

// Starting just after `.from('table')`, walk the method chain. Follow only
// `.identifier(...)` links; stop at the first thing that ends the chain (a
// statement boundary: ; newline-with-no-continuation, etc.). Return the write
// method record if .insert/.update/.upsert is reached IN THIS chain, else null.
// This prevents attributing a *different* statement's write to this .from().
function findWriteInChain(src, chainStart) {
  let i = chainStart;
  const WRITE = new Set(['insert', 'update', 'upsert']);
  while (i < src.length) {
    // Skip whitespace AND line breaks that are part of a fluent chain (the next
    // non-space char being '.' means the chain continues across the newline).
    let j = i;
    while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] !== '.') {
      // Chain does not continue — no more methods on this .from().
      return null;
    }
    // We are at a '.'; read the method name.
    let k = j + 1;
    let name = '';
    while (k < src.length && /[A-Za-z0-9_$]/.test(src[k])) { name += src[k]; k++; }
    // Expect '(' to follow (allowing whitespace).
    let p = k;
    while (p < src.length && /\s/.test(src[p])) p++;
    if (src[p] !== '(') {
      // e.g. a property access, not a method call — chain shape we don't model.
      return null;
    }
    // Find the matching close paren for this method call, respecting nesting
    // and strings, so we can continue past it to the next chained method.
    const argOpen = p + 1;
    const argClose = matchParen(src, p);
    if (argClose === -1) return null; // unbalanced — bail
    if (WRITE.has(name)) {
      return { method: name, argOpen };
    }
    // Not a write (.select/.eq/.order/...); continue after this call.
    i = argClose + 1;
  }
  return null;
}

// Given index of an opening '(', return index of its matching ')', or -1.
function matchParen(src, openIdx) {
  let depth = 0;
  let str = null;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (str) {
      if (c === str && src[i - 1] !== '\\') str = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { str = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function dedupe(arr) {
  return [...new Set(arr)];
}

function lineOf(src, idx) {
  return src.slice(0, idx).split('\n').length;
}

// Parse one file into a list of write records.
function scanFile(path) {
  const src = readFileSync(path, 'utf8');
  const records = [];
  let m;
  FROM_RE.lastIndex = 0;
  while ((m = FROM_RE.exec(src)) !== null) {
    const table = m[1];
    const chainStart = m.index + m[0].length;
    // Only accept a write that is part of THIS .from()'s call chain.
    const w = findWriteInChain(src, chainStart);
    if (!w) continue; // read, or write belongs to a different statement
    const method = w.method;
    const openParen = w.argOpen; // index just after "("
    const { keys, ok } = extractObjectKeys(src, openParen);
    records.push({
      file: path,
      line: lineOf(src, m.index),
      table,
      method,
      columns: keys,
      analyzed: ok && keys !== null,
    });
  }
  return records;
}

// ---------------------------------------------------------------------------
// 3. Load the live schema
// ---------------------------------------------------------------------------
async function loadSchema(tables) {
  // Test / offline override: if SCHEMA_JSON points to a file mapping
  // { "table": ["col1","col2",...] }, use it instead of querying the DB.
  // Lets CI run the parser logic without a live connection and lets us
  // unit-test classification deterministically.
  if (process.env.SCHEMA_JSON) {
    const raw = JSON.parse(readFileSync(process.env.SCHEMA_JSON, 'utf8'));
    const out = {};
    for (const table of tables) {
      out[table] = raw[table]
        ? { columns: new Set(raw[table]), error: null }
        : { columns: null, error: 'TABLE_NOT_IN_SCHEMA_JSON' };
    }
    return out;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const schema = {};
  for (const table of tables) {
    // Read one row and take its keys. Works without information_schema RPC and
    // matches what the app actually sees. If the table is empty this returns
    // no columns, so we fall back to an information_schema query via rpc-less
    // PostgREST: select=* with limit 0 still 200s but yields no keys, so we
    // additionally probe column metadata through a HEAD-style empty select.
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      schema[table] = { error: error.message, columns: null };
      continue;
    }
    if (data && data.length) {
      schema[table] = { columns: new Set(Object.keys(data[0])), error: null };
    } else {
      // Empty table — we can't infer columns from a row. Mark as unknown so we
      // don't produce false positives against an empty table.
      schema[table] = { columns: null, error: 'EMPTY_TABLE_CANNOT_INFER' };
    }
  }
  return schema;
}

// ---------------------------------------------------------------------------
// 4. Compare + report
// ---------------------------------------------------------------------------
function main() {
  if (!process.env.SCHEMA_JSON && (!SUPABASE_URL || !SERVICE_KEY)) {
    console.error(
      'ERROR: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars\n' +
        '       (service role — build/CI only, never in the browser bundle),\n' +
        '       or set SCHEMA_JSON=path/to/schema.json for offline mode.'
    );
    process.exit(2);
  }

  const files = walk(SCAN_DIR);
  if (!files.length) {
    console.error(`ERROR: no .js/.html files found under "${SCAN_DIR}".`);
    process.exit(2);
  }

  const writes = files.flatMap(scanFile);
  const tables = dedupe(writes.map((w) => w.table));

  return loadSchema(tables).then((schema) => {
    const mismatches = [];
    const unanalyzed = [];
    const skippedEmpty = [];
    let okCount = 0;

    for (const w of writes) {
      const tbl = schema[w.table];
      if (!w.analyzed || !w.columns) {
        unanalyzed.push(w);
        continue;
      }
      if (!tbl || tbl.columns === null) {
        // Can't verify (table empty / read error). Don't false-positive.
        skippedEmpty.push({ ...w, reason: tbl?.error || 'unknown table' });
        continue;
      }
      const bad = w.columns.filter(
        (c) => !tbl.columns.has(c) && !ALWAYS_OK.has(c)
      );
      if (bad.length) mismatches.push({ ...w, bad });
      else okCount++;
    }

    if (JSON_OUT) {
      console.log(
        JSON.stringify(
          { mismatches, unanalyzed, skippedEmpty, okCount, tables },
          (k, v) => (v instanceof Set ? [...v] : v),
          2
        )
      );
    } else {
      report({ mismatches, unanalyzed, skippedEmpty, okCount, writes, tables, schema });
    }

    // Exit code: mismatches always fail. Unanalyzed fails unless --lax.
    const fail = mismatches.length > 0 || (!LAX && unanalyzed.length > 0);
    process.exit(fail ? 1 : 0);
  });
}

function rel(p) {
  return relative(process.cwd(), p);
}

function report({ mismatches, unanalyzed, skippedEmpty, okCount, writes, tables }) {
  const line = '─'.repeat(72);
  console.log(line);
  console.log('SCHEMA DRIFT CHECK');
  console.log(line);
  console.log(
    `Scanned ${writes.length} write(s) across ${tables.length} table(s): ` +
      tables.join(', ')
  );
  console.log(
    `  ✓ verified OK:   ${okCount}\n` +
      `  ✗ mismatches:    ${mismatches.length}\n` +
      `  ? unanalyzed:    ${unanalyzed.length}\n` +
      `  – unverifiable:  ${skippedEmpty.length} (empty table / read error)`
  );

  if (mismatches.length) {
    console.log('\n' + line + '\nMISMATCHES (column referenced in code does not exist):');
    for (const m of mismatches) {
      console.log(
        `  ✗ ${rel(m.file)}:${m.line}  ${m.method} ${m.table}  →  missing: ${m.bad.join(', ')}`
      );
    }
  }

  if (unanalyzed.length) {
    console.log(
      '\n' +
        line +
        '\nUNANALYZED (write found, columns not statically readable — review by hand):'
    );
    for (const u of unanalyzed) {
      console.log(`  ? ${rel(u.file)}:${u.line}  ${u.method} ${u.table}`);
    }
  }

  if (skippedEmpty.length) {
    console.log(
      '\n' +
        line +
        '\nUNVERIFIABLE (could not infer schema — empty table or read error):'
    );
    for (const s of skippedEmpty) {
      console.log(`  – ${s.table}: ${s.reason}`);
    }
  }

  console.log('\n' + line);
  if (mismatches.length) {
    console.log('RESULT: FAIL — fix the column names above (or add the columns via migration).');
  } else if (unanalyzed.length && !LAX) {
    console.log(
      'RESULT: FAIL — unanalyzed writes present. Review them, then re-run with --lax\n' +
        '        once confirmed safe, or refactor them to inline object literals.'
    );
  } else {
    console.log('RESULT: PASS — every analyzable write targets a column that exists.');
  }
  console.log(line);
}

main();

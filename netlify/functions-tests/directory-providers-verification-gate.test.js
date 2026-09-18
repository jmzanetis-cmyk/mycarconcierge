'use strict';

// Task #475 — Public provider directory must only list admin-verified
// providers.
//
// Why: the provider portal auto-creates role='provider' rows for any
// signed-in user (providers-core.js / providers.js fallback), and
// directory_opt_in + directory_slug are self-editable columns. Before this
// task, netlify/functions/directory-providers.js filtered on
// directory_opt_in / role / slug / suspended only, so a self-promoted,
// never-verified account could appear in the public directory next to
// vetted shops. verification_status = 'verified' is the platform's real
// trust gate (plan-bids, job-board, auto-bid all key off it), so the
// directory must too.
//
// This test stubs @supabase/supabase-js with a recording query builder,
// invokes the handler for both the listing and the single-profile route,
// and asserts that every query against `profiles` carries
// .eq('verification_status', 'verified').
//
// Run: node netlify/functions-tests/directory-providers-verification-gate.test.js

const path = require('node:path');
const Module = require('node:module');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  ok ', name); pass++; }
  else { console.error('  FAIL', name, detail || ''); fail++; }
}

// ---------- Recording Supabase stub ------------------------------------------
// Every chained call is appended to `calls` for the current table; the chain
// resolves to an empty result so the handler returns early without needing
// review / team / bgc data.
const queries = []; // { table, calls: [[method, ...args]] }

function makeBuilder(table) {
  const q = { table, calls: [] };
  queries.push(q);
  const result = { data: [], error: null, count: 0 };
  const builder = {};
  const chain = (method) => (...args) => { q.calls.push([method, ...args]); return builder; };
  for (const m of ['select', 'eq', 'neq', 'not', 'is', 'in', 'ilike', 'contains', 'order', 'range', 'limit', 'gte', 'lte']) {
    builder[m] = chain(m);
  }
  builder.maybeSingle = () => { q.calls.push(['maybeSingle']); return Promise.resolve({ data: null, error: null }); };
  builder.single      = () => { q.calls.push(['single']);      return Promise.resolve({ data: null, error: null }); };
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

const stubSupabase = {
  createClient: () => ({ from: (table) => makeBuilder(table) }),
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@supabase/supabase-js') return stubSupabase;
  return origLoad.call(this, request, parent, isMain);
};

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'stub';

const fnPath = path.join(__dirname, '..', 'functions', 'directory-providers.js');
const { handler } = require(fnPath);

function hasVerifiedGate(q) {
  return q.calls.some(([m, col, val]) => m === 'eq' && col === 'verification_status' && val === 'verified');
}
function hasRoleProvider(q) {
  return q.calls.some(([m, col, val]) => m === 'eq' && col === 'role' && val === 'provider');
}

(async () => {
  // ---- listing --------------------------------------------------------------
  queries.length = 0;
  const listRes = await handler({ httpMethod: 'GET', path: '/api/directory/providers', queryStringParameters: {} });
  ok('listing handler returns 200 against the stub', listRes.statusCode === 200, listRes.body);
  const listProfileQueries = queries.filter(q => q.table === 'profiles');
  ok('listing issues a profiles query', listProfileQueries.length >= 1);
  ok('listing profiles query still filters role = provider',
     listProfileQueries.every(hasRoleProvider));
  ok('listing profiles query filters verification_status = verified (Task #475)',
     listProfileQueries.every(hasVerifiedGate),
     JSON.stringify(listProfileQueries.map(q => q.calls)));

  // ---- single profile -------------------------------------------------------
  queries.length = 0;
  const oneRes = await handler({ httpMethod: 'GET', path: '/api/directory/providers/some-shop', queryStringParameters: {} });
  ok('profile handler returns 404 for unknown slug against the stub', oneRes.statusCode === 404, oneRes.body);
  const oneProfileQueries = queries.filter(q => q.table === 'profiles');
  ok('profile lookup issues a profiles query', oneProfileQueries.length >= 1);
  ok('profile lookup filters role = provider',
     oneProfileQueries.every(hasRoleProvider));
  ok('profile lookup filters verification_status = verified (Task #475)',
     oneProfileQueries.every(hasVerifiedGate),
     JSON.stringify(oneProfileQueries.map(q => q.calls)));

  // ---- source-level guard so a refactor to a different builder shape still fails loudly
  const src = require('node:fs').readFileSync(fnPath, 'utf8');
  const gateCount = (src.match(/\.eq\('verification_status',\s*'verified'\)/g) || []).length;
  ok('directory-providers.js contains the verification gate on both profiles queries (source check)', gateCount >= 2, `found ${gateCount}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error('FAIL (uncaught)', err); process.exit(1); });

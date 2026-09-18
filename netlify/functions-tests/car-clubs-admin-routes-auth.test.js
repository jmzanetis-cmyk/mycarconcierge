// ============================================================================
// Lockdown regression test for the admin routes on car-clubs.js (Task #472).
//
// Task #472 moved the admin Car Clubs panel's browser writes off the anon
// Supabase client and behind admin-authenticated Netlify routes in
// netlify/functions/car-clubs.js. Those routes must:
//   1. Return 401 with a well-formed error body when the caller has no
//      Authorization header.
//   2. Never take the member-branch path when the URL matches the admin
//      prefix — the member getUser() would otherwise 401 too, but by
//      leaking a different error contract.
//   3. Every /api/admin/car-clubs* route the handler dispatches must be
//      covered by an unauthenticated assertion here. A completeness check
//      scans car-clubs.js for `adminPath === '...'` conditionals and
//      requires each to appear in COVERED_ROUTES.
//
// Run with:  node netlify/functions-tests/car-clubs-admin-routes-auth.test.js
// Exits non-zero on the first assertion failure.
// ============================================================================

'use strict';

const assert = require('assert');
const fs     = require('node:fs');
const path   = require('node:path');

process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';

// ---------------------------------------------------------------------------
// Supabase stub — chainable query mock so the handler doesn't touch the DB.
// ---------------------------------------------------------------------------
function makeSupabaseStub() {
  function makeChain() {
    const emptyResult = { data: [], count: 0, error: null };
    const chain = {};
    const passthrough = ['select','order','range','limit','eq','neq','gt','gte','lt','lte',
      'is','in','or','filter','match','not','contains','overlaps','textSearch',
      'update','delete','upsert'];
    for (const fn of passthrough) chain[fn] = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    chain.single      = () => Promise.resolve({ data: null, error: null });
    chain.insert      = () => Promise.resolve({ data: null, error: null });
    chain.then        = (resolve, reject) => Promise.resolve(emptyResult).then(resolve, reject);
    return chain;
  }
  return {
    from: () => makeChain(),
    auth: {
      getUser: async (token) => {
        if (!token) return { data: { user: null }, error: { message: 'no token' } };
        return { data: { user: { id: 'stub-admin-uid' } }, error: null };
      },
    },
  };
}

// Same trick as admin-routes-auth.test.js — car-clubs.js and its
// _shared/audit dependency resolve @supabase/supabase-js from a nested
// node_modules install. Stub BOTH cache entries so neither reaches a real
// fetch().
const supabasePaths = new Set([
  require.resolve('@supabase/supabase-js'),
  require.resolve('@supabase/supabase-js', { paths: [path.join(__dirname, '..', 'functions')] }),
]);
for (const sp of supabasePaths) {
  require.cache[sp] = {
    id: sp, filename: sp, loaded: true,
    exports: { createClient: () => makeSupabaseStub() },
  };
}

const carClubs = require('../functions/car-clubs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeEvent({ path: p, method = 'GET', headers = {}, body = null }) {
  return {
    path: p,
    httpMethod: method,
    headers: { host: 'stub.local', ...headers },
    queryStringParameters: {},
    body,
  };
}

function parseBody(res) {
  try { return JSON.parse(res.body); } catch { return null; }
}

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL ${name}`);
    console.log('       ' + (e && e.message || String(e)));
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Covered routes — every /api/admin/car-clubs* branch in the handler.
// The completeness check below requires the length of this list to match
// the number of `adminPath === '...'` / adminPath-conditional branches in
// car-clubs.js.
// ---------------------------------------------------------------------------
const SAMPLE_UUID = '11111111-1111-1111-1111-111111111111';

const COVERED_ROUTES = [
  { method: 'GET',   subPath: '',                    label: 'list' },
  { method: 'GET',   subPath: 'eligible-providers',  label: 'eligible-providers' },
  { method: 'POST',  subPath: '',                    label: 'create',  body: JSON.stringify({ name: 'x', provider_id: SAMPLE_UUID }) },
  { method: 'PATCH', subPath: SAMPLE_UUID,           label: 'toggle',  body: JSON.stringify({ is_active: true }) },
];

// ---------------------------------------------------------------------------
// Assertion 1 — unauthenticated request to each route returns 401.
// ---------------------------------------------------------------------------
(async () => {
  for (const r of COVERED_ROUTES) {
    await check(`${r.method} /api/admin/car-clubs${r.subPath ? '/' + r.subPath : ''} — unauthenticated → 401 (${r.label})`, async () => {
      const res = await carClubs.handler(makeEvent({
        path: '/api/admin/car-clubs' + (r.subPath ? '/' + r.subPath : ''),
        method: r.method,
        body: r.body || null,
      }));
      assert.strictEqual(res.statusCode, 401, `expected 401, got ${res.statusCode}: ${res.body}`);
      const body = parseBody(res);
      assert.ok(body && body.error, `expected {error: ...} body, got ${res.body}`);
    });
  }

  // Assertion 2 — completeness: scan car-clubs.js for adminPath conditionals.
  await check('completeness: every /api/admin/car-clubs branch in car-clubs.js is covered by an unauthenticated 401 assertion', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'functions', 'car-clubs.js'), 'utf8');

    // The admin dispatcher structure asserted below (any of these missing means
    // the source diverged from what this test expects):
    assert.ok(
      src.includes('/api/admin/car-clubs'),
      'car-clubs.js is missing the /api/admin/car-clubs prefix detector',
    );
    assert.ok(
      /utils\.authenticateBearerAdmin\(event,\s*sb\)/.test(src),
      'car-clubs.js is missing the utils.authenticateBearerAdmin gate',
    );

    // Count adminPath === '...' branches (list, eligible-providers, create)
    // plus the toggle branch (PATCH + adminPath + !includes('/')). This
    // heuristic runs on the admin dispatch block only, so scope with a slice.
    const adminBlockStart = src.indexOf('/api/admin/car-clubs');
    const adminBlockEnd   = src.indexOf('const auth = await getUser(event, sb);');
    assert.ok(adminBlockStart > -1 && adminBlockEnd > adminBlockStart,
      'admin dispatch block not found in car-clubs.js');
    const adminBlock = src.slice(adminBlockStart, adminBlockEnd);

    const branchMatches = adminBlock.match(/if\s*\(method\s*===\s*'[A-Z]+'[\s\S]*?return\s+handleAdmin/g) || [];
    assert.strictEqual(
      branchMatches.length,
      COVERED_ROUTES.length,
      `car-clubs.js admin dispatcher has ${branchMatches.length} branch(es) but COVERED_ROUTES has ${COVERED_ROUTES.length}. Update COVERED_ROUTES when adding a new admin route.`,
    );
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => {
  console.error('Unhandled test error:', e);
  process.exit(1);
});

// ============================================================================
// Auth tests for the four ADMIN_TEAM_TOKENS functions
// (admin-api-usage, admin-chat-insights, admin-printful, admin-white-label)
//
// All four migrated from x-admin-password / x-admin-token headers to
// Authorization: Bearer <token>, where the token is either:
//   a) an entry in ADMIN_TEAM_TOKENS CSV  → { type: 'team' }
//   b) a Supabase JWT with profiles.role='admin' → { type: 'admin' }
//
// Covers per-function:
//   - No Authorization header → 401
//   - Wrong token (not in team list, not a valid admin JWT) → 401
//   - Valid team token via Bearer → passes auth (200 or other non-401)
//   - Old x-admin-token header (without Bearer) → 401  (header no longer checked)
// ============================================================================

'use strict';

const path = require('path');
const Module = require('module');

let testsRun = 0;
let testsFailed = 0;

function run(name, fn) {
  testsRun++;
  return Promise.resolve().then(fn).then(() => {
    console.log(`  ok   ${name}`);
  }).catch(err => {
    testsFailed++;
    console.error(`  FAIL ${name}\n       ${err.message}`);
  });
}

function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label || 'eq'}: got=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
}

// ── env & module stubs ───────────────────────────────────────────────────────

process.env.SUPABASE_URL              = 'http://stub';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key';
process.env.ADMIN_PASSWORD            = 'old-admin-pw';
process.env.ADMIN_TEAM_TOKENS         = 'team-tok-1,team-tok-2';
process.env.PRINTFUL_API_KEY          = 'pf-stub';
process.env.PRINTFUL_STORE_ID         = '12345';

// Supabase stub — valid admin token → user id 'admin-uid'; 'bad' → null.
function makeSupabaseStub() {
  return {
    auth: {
      async getUser(token) {
        if (token === 'valid-admin-jwt')
          return { data: { user: { id: 'admin-uid', email: 'admin@mcc.com' } }, error: null };
        return { data: { user: null }, error: { message: 'invalid token' } };
      },
    },
    from(table) {
      const b = {
        select() { return b; },
        eq()     { return b; },
        gte()    { return b; },
        order()  { return b; },
        limit()  { return b; },
        then(resolve) { resolve({ data: [], error: null }); },
        async single() {
          if (table === 'profiles') return { data: { role: 'admin' }, error: null };
          return { data: null, error: null };
        },
        async maybeSingle() { return { data: null, error: null }; },
      };
      return b;
    },
  };
}

const origLoad = Module._load;
Module._load = function(request, parent, ...rest) {
  if (request === '@supabase/supabase-js') return { createClient: () => makeSupabaseStub() };
  // Stub fetch for printful so the test doesn't make real HTTP requests.
  return origLoad.call(this, request, parent, ...rest);
};

// Provide a global fetch stub for admin-printful (it calls Printful API after auth).
global.fetch = async (url) => ({
  ok: true,
  json: async () => ({ result: [], data: [] }),
  status: 200,
});

// ── load handlers (after stubs installed) ───────────────────────────────────

const { handler: apiUsageHandler }    = require(path.resolve(__dirname, '../functions/admin-api-usage'));
const { handler: chatHandler }        = require(path.resolve(__dirname, '../functions/admin-chat-insights'));
const { handler: printfulHandler }    = require(path.resolve(__dirname, '../functions/admin-printful'));
const { handler: whiteLabelHandler }  = require(path.resolve(__dirname, '../functions/admin-white-label'));

// ── helpers ──────────────────────────────────────────────────────────────────

function makeEvent(functionPath, overrides = {}) {
  return {
    httpMethod: 'GET',
    path: functionPath,
    headers: {},
    body: null,
    queryStringParameters: {},
    ...overrides,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

async function main() {

  // ── admin-api-usage ──────────────────────────────────────────────────────

  console.log('\n--- admin-api-usage ---');

  await run('no Authorization header → 401', async () => {
    const res = await apiUsageHandler(makeEvent('/api/admin/api-usage'));
    eq(res.statusCode, 401, 'status');
  });

  await run('wrong token → 401', async () => {
    const res = await apiUsageHandler(makeEvent('/api/admin/api-usage', {
      headers: { authorization: 'Bearer not-a-team-token' },
    }));
    eq(res.statusCode, 401, 'status');
  });

  await run('old x-admin-token header (no Bearer) → 401', async () => {
    const res = await apiUsageHandler(makeEvent('/api/admin/api-usage', {
      headers: { 'x-admin-token': 'team-tok-1' },
    }));
    eq(res.statusCode, 401, 'status');
  });

  await run('valid team token via Bearer → not 401', async () => {
    const res = await apiUsageHandler(makeEvent('/api/admin/api-usage', {
      headers: { authorization: 'Bearer team-tok-1' },
    }));
    if (res.statusCode === 401) throw new Error(`got 401 — team token rejected`);
  });

  await run('valid admin JWT via Bearer → not 401', async () => {
    const res = await apiUsageHandler(makeEvent('/api/admin/api-usage', {
      headers: { authorization: 'Bearer valid-admin-jwt' },
    }));
    if (res.statusCode === 401) throw new Error(`got 401 — admin JWT rejected`);
  });

  // ── admin-chat-insights ──────────────────────────────────────────────────

  console.log('\n--- admin-chat-insights ---');

  await run('no Authorization header → 401', async () => {
    const res = await chatHandler(makeEvent('/api/admin/chat-insights'));
    eq(res.statusCode, 401, 'status');
  });

  await run('wrong token → 401', async () => {
    const res = await chatHandler(makeEvent('/api/admin/chat-insights', {
      headers: { authorization: 'Bearer garbage' },
    }));
    eq(res.statusCode, 401, 'status');
  });

  await run('valid team token via Bearer → 200', async () => {
    const res = await chatHandler(makeEvent('/api/admin/chat-insights', {
      headers: { authorization: 'Bearer team-tok-2' },
    }));
    eq(res.statusCode, 200, 'status');
  });

  await run('POST → 405 regardless of auth', async () => {
    const res = await chatHandler(makeEvent('/api/admin/chat-insights', {
      httpMethod: 'POST',
      headers: { authorization: 'Bearer team-tok-1' },
    }));
    eq(res.statusCode, 405, 'status');
  });

  // ── admin-printful ───────────────────────────────────────────────────────

  console.log('\n--- admin-printful ---');

  await run('no Authorization header → 401', async () => {
    const res = await printfulHandler(makeEvent('/api/admin/printful/catalog'));
    eq(res.statusCode, 401, 'status');
  });

  await run('wrong token → 401', async () => {
    const res = await printfulHandler(makeEvent('/api/admin/printful/catalog', {
      headers: { authorization: 'Bearer nope' },
    }));
    eq(res.statusCode, 401, 'status');
  });

  await run('valid team token via Bearer → not 401', async () => {
    const res = await printfulHandler(makeEvent('/api/admin/printful/catalog', {
      headers: { authorization: 'Bearer team-tok-1' },
    }));
    if (res.statusCode === 401) throw new Error(`got 401 — team token rejected`);
  });

  // ── admin-white-label ────────────────────────────────────────────────────

  console.log('\n--- admin-white-label ---');

  await run('no Authorization header → 401', async () => {
    const res = await whiteLabelHandler(makeEvent('/api/admin/white-label/tenants'));
    eq(res.statusCode, 401, 'status');
  });

  await run('wrong token → 401', async () => {
    const res = await whiteLabelHandler(makeEvent('/api/admin/white-label/tenants', {
      headers: { authorization: 'Bearer bad-token' },
    }));
    eq(res.statusCode, 401, 'status');
  });

  await run('valid team token via Bearer → not 401', async () => {
    const res = await whiteLabelHandler(makeEvent('/api/admin/white-label/tenants', {
      headers: { authorization: 'Bearer team-tok-1' },
    }));
    if (res.statusCode === 401) throw new Error(`got 401 — team token rejected`);
  });

  await run('valid admin JWT via Bearer → not 401', async () => {
    const res = await whiteLabelHandler(makeEvent('/api/admin/white-label/tenants', {
      headers: { authorization: 'Bearer valid-admin-jwt' },
    }));
    if (res.statusCode === 401) throw new Error(`got 401 — admin JWT rejected`);
  });

  await run('POST → 405 regardless of auth', async () => {
    const res = await whiteLabelHandler(makeEvent('/api/admin/white-label/tenants', {
      httpMethod: 'POST',
      headers: { authorization: 'Bearer team-tok-1' },
    }));
    eq(res.statusCode, 405, 'status');
  });

  // ── summary ──────────────────────────────────────────────────────────────

  console.log(`\n${testsRun - testsFailed}/${testsRun} passed`);
  if (testsFailed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });

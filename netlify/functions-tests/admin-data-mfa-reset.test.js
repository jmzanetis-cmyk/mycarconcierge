'use strict';

// Regression tests for the POST /api/admin/mfa-reset route in admin-data.js.
//
// Covers:
//   - Auth gate: no token / non-admin → 401
//   - Method gate: GET → 404
//   - Input validation: missing userId, invalid UUID → 400
//   - Step failures: backup_codes fail, profile fail, factor_list fail, factor_delete partial → 500/502
//   - Happy path: zero factors → { success, factorsDeleted: 0 }
//   - Happy path: two factors → { success, factorsDeleted: 2 }
//
// No real DB or Supabase — fully stubbed.
// Run with:  node netlify/functions-tests/admin-data-mfa-reset.test.js

const assert = require('assert');
const path   = require('node:path');

process.env.SUPABASE_URL              = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';

// ---------------------------------------------------------------------------
// Supabase stub
// ---------------------------------------------------------------------------
const stubCfg = {
  isAdmin:          true,
  backupDeleteErr:  null,
  profileUpdateErr: null
};

function makeSupabaseStub() {
  function makeChain(table) {
    const chain = {};
    const passthrough = ['select','order','range','limit','eq','neq','gt','gte','lt','lte',
      'is','in','or','filter','match','not','contains','overlaps','textSearch','upsert','insert'];
    for (const fn of passthrough) chain[fn] = () => chain;

    chain.delete = () => {
      if (table === 'totp_backup_codes') {
        // Must support .eq().eq()... then await — return a chainable thenable.
        const sub = {};
        const eqFn = () => sub;
        sub.eq = eqFn; sub.neq = eqFn; sub.filter = eqFn; sub.match = eqFn;
        sub.then = (resolve, reject) =>
          Promise.resolve({ data: null, error: stubCfg.backupDeleteErr }).then(resolve, reject);
        return sub;
      }
      return chain;
    };

    chain.update = (vals) => {
      if (table === 'profiles') {
        const sub = {};
        const eqFn = () => sub;
        sub.eq = eqFn; sub.neq = eqFn; sub.filter = eqFn; sub.match = eqFn;
        sub.then = (resolve, reject) =>
          Promise.resolve({ data: null, error: stubCfg.profileUpdateErr }).then(resolve, reject);
        return sub;
      }
      return chain;
    };

    chain.single = () => {
      if (table === 'profiles') {
        return Promise.resolve({ data: { role: stubCfg.isAdmin ? 'admin' : 'member' }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    };
    chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    chain.then = (resolve) => Promise.resolve({ data: [], count: 0, error: null }).then(resolve);
    return chain;
  }

  return {
    from: (t) => makeChain(t),
    auth: {
      getUser: async (token) => {
        if (token === 'stub-valid-token') {
          return { data: { user: { id: 'stub-admin-uid' } }, error: null };
        }
        return { data: { user: null }, error: { message: 'Invalid token' } };
      }
    }
  };
}

// Stub both supabase-js resolution paths
const supabasePaths = new Set([
  require.resolve('@supabase/supabase-js'),
  require.resolve('@supabase/supabase-js', { paths: [path.join(__dirname, '..', 'functions')] })
]);
for (const sp of supabasePaths) {
  require.cache[sp] = {
    id: sp, filename: sp, loaded: true,
    exports: { createClient: () => makeSupabaseStub() }
  };
}

// ---------------------------------------------------------------------------
// fetch stub
// ---------------------------------------------------------------------------
const fetchCfg = {
  listOk:      true,
  listFactors: [],   // array of { id, factor_type } to return from GET /factors
  deleteFailIds: []  // factor IDs that should return non-ok on DELETE
};

global.fetch = async function stubFetch(url, opts) {
  const u = String(url);
  const method = (opts && opts.method) || 'GET';

  if (/\/auth\/v1\/admin\/users\/[^/]+\/factors$/.test(u) && method === 'GET') {
    if (!fetchCfg.listOk) {
      return { ok: false, status: 503, json: async () => ({ message: 'upstream error' }) };
    }
    return { ok: true, status: 200, json: async () => fetchCfg.listFactors };
  }

  if (/\/auth\/v1\/admin\/users\/[^/]+\/factors\/[^/]+$/.test(u) && method === 'DELETE') {
    const factorId = u.split('/').pop();
    if (fetchCfg.deleteFailIds.includes(factorId)) {
      return { ok: false, status: 422, json: async () => ({ message: 'delete failed' }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  }

  throw new Error('Unexpected fetch: ' + method + ' ' + u);
};

const { handler } = require('../functions/admin-data');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const VALID_UUID = '11111111-2222-3333-4444-555555555555';

function makeEvent({ method = 'POST', token = 'stub-valid-token', body = null, route = 'mfa-reset' }) {
  const hdrs = { host: 'stub.local' };
  if (token) hdrs['authorization'] = 'Bearer ' + token;
  return {
    path: '/api/admin/' + route,
    httpMethod: method,
    headers: hdrs,
    queryStringParameters: {},
    body: body !== null ? JSON.stringify(body) : null
  };
}

function parseBody(res) {
  try { return JSON.parse(res.body); } catch { return null; }
}

function reset() {
  stubCfg.isAdmin         = true;
  stubCfg.backupDeleteErr  = null;
  stubCfg.profileUpdateErr = null;
  fetchCfg.listOk          = true;
  fetchCfg.listFactors     = [];
  fetchCfg.deleteFailIds   = [];
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function run() {
  let passed = 0, failed = 0;
  const failures = [];

  async function test(label, fn) {
    reset();
    try {
      await fn();
      passed++;
      console.log('  ok  ' + label);
    } catch (err) {
      failed++;
      failures.push(label + ': ' + err.message);
      console.log('  FAIL ' + label + ' — ' + err.message);
    }
  }

  // ── Auth gate ─────────────────────────────────────────────────────────────
  await test('OPTIONS → 200', async () => {
    const res = await handler({ httpMethod: 'OPTIONS', headers: {}, path: '/api/admin/mfa-reset', body: null, queryStringParameters: {} });
    assert.strictEqual(res.statusCode, 200);
  });

  await test('no auth → 401', async () => {
    const res = await handler(makeEvent({ token: null, body: { userId: VALID_UUID } }));
    assert.strictEqual(res.statusCode, 401);
  });

  await test('invalid token → 401', async () => {
    const res = await handler(makeEvent({ token: 'bad-token', body: { userId: VALID_UUID } }));
    assert.strictEqual(res.statusCode, 401);
  });

  await test('non-admin role → 401', async () => {
    stubCfg.isAdmin = false;
    const res = await handler(makeEvent({ body: { userId: VALID_UUID } }));
    assert.strictEqual(res.statusCode, 401);
  });

  // ── Method + route gate ───────────────────────────────────────────────────
  await test('GET mfa-reset → 404', async () => {
    const res = await handler(makeEvent({ method: 'GET', body: null }));
    assert.strictEqual(res.statusCode, 404);
  });

  // ── Input validation ──────────────────────────────────────────────────────
  await test('missing userId → 400', async () => {
    const res = await handler(makeEvent({ body: {} }));
    assert.strictEqual(res.statusCode, 400);
    assert.ok(parseBody(res).error.includes('userId'));
  });

  await test('non-string userId → 400', async () => {
    const res = await handler(makeEvent({ body: { userId: 12345 } }));
    assert.strictEqual(res.statusCode, 400);
  });

  await test('invalid UUID format → 400', async () => {
    const res = await handler(makeEvent({ body: { userId: 'not-a-uuid' } }));
    assert.strictEqual(res.statusCode, 400);
    assert.ok(parseBody(res).error.includes('UUID'));
  });

  await test('invalid JSON body → 400', async () => {
    const event = makeEvent({ body: null });
    event.body = 'not-json';
    const res = await handler(event);
    assert.strictEqual(res.statusCode, 400);
  });

  // ── Step failure: backup codes ────────────────────────────────────────────
  await test('backup codes delete error → 500', async () => {
    stubCfg.backupDeleteErr = { message: 'db error' };
    const res = await handler(makeEvent({ body: { userId: VALID_UUID } }));
    assert.strictEqual(res.statusCode, 500);
    assert.ok(parseBody(res).error.includes('backup'));
  });

  // ── Step failure: profile update ──────────────────────────────────────────
  await test('profile update error → 500', async () => {
    stubCfg.profileUpdateErr = { message: 'db error' };
    const res = await handler(makeEvent({ body: { userId: VALID_UUID } }));
    assert.strictEqual(res.statusCode, 500);
    assert.ok(parseBody(res).error.includes('profile'));
  });

  // ── Step failure: GoTrue factor list ──────────────────────────────────────
  await test('GoTrue factor list fail → 502', async () => {
    fetchCfg.listOk = false;
    const res = await handler(makeEvent({ body: { userId: VALID_UUID } }));
    assert.strictEqual(res.statusCode, 502);
    assert.ok(parseBody(res).error.includes('list'));
  });

  // ── Step failure: factor delete partial ───────────────────────────────────
  await test('factor delete partial fail → 500 with loud message', async () => {
    fetchCfg.listFactors   = [{ id: 'fid-1', factor_type: 'totp' }, { id: 'fid-2', factor_type: 'totp' }];
    fetchCfg.deleteFailIds = ['fid-1'];
    const res = await handler(makeEvent({ body: { userId: VALID_UUID } }));
    assert.strictEqual(res.statusCode, 500);
    const body = parseBody(res);
    assert.ok(body.error.includes('factor'), 'error mentions factors');
    assert.ok(body.error.includes('retry'), 'error mentions retry');
  });

  // ── Happy path: no enrolled factors ──────────────────────────────────────
  await test('no enrolled factors → 200 { success, factorsDeleted: 0 }', async () => {
    fetchCfg.listFactors = [];
    const res = await handler(makeEvent({ body: { userId: VALID_UUID } }));
    assert.strictEqual(res.statusCode, 200);
    const body = parseBody(res);
    assert.ok(body.success, 'success flag');
    assert.strictEqual(body.factorsDeleted, 0);
  });

  // ── Happy path: two TOTP factors ─────────────────────────────────────────
  await test('two TOTP factors → 200 { success, factorsDeleted: 2 }', async () => {
    fetchCfg.listFactors = [
      { id: 'fid-a', factor_type: 'totp' },
      { id: 'fid-b', factor_type: 'totp' }
    ];
    const res = await handler(makeEvent({ body: { userId: VALID_UUID } }));
    assert.strictEqual(res.statusCode, 200);
    const body = parseBody(res);
    assert.ok(body.success, 'success flag');
    assert.strictEqual(body.factorsDeleted, 2);
    assert.strictEqual(body.userId, VALID_UUID);
  });

  // ── Non-TOTP factors are ignored ─────────────────────────────────────────
  await test('non-TOTP factors not deleted → factorsDeleted: 1', async () => {
    fetchCfg.listFactors = [
      { id: 'fid-totp', factor_type: 'totp' },
      { id: 'fid-phone', factor_type: 'phone' }
    ];
    const res = await handler(makeEvent({ body: { userId: VALID_UUID } }));
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(parseBody(res).factorsDeleted, 1);
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});

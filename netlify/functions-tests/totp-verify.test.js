'use strict';

const crypto = require('node:crypto');

function hashBackupCode(plaintext) {
  return crypto.createHash('sha256')
    .update(plaintext.replace(/-/g, '').toUpperCase())
    .digest('hex');
}

// Regression tests for netlify/functions/totp-verify.js
//
// Covers:
//   - Auth gate: no/invalid/missing-Bearer token → 401
//   - Method gate: GET → 405
//   - Input validation: missing factorId, bad code formats → 400
//   - Rate-limit gate: locked record → 429
//   - GoTrue challenge failure → proxied error status
//   - GoTrue verify failure → proxied error status
//   - Happy path → 200 { success: true }, profiles.two_factor_verified_at written
//
// No real DB or Supabase auth — fully stubbed.
//
// Run with:  node netlify/functions-tests/totp-verify.test.js

'use strict';

const assert = require('assert');
const path   = require('node:path');

process.env.SUPABASE_URL              = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';

// ---------------------------------------------------------------------------
// Supabase stub
// ---------------------------------------------------------------------------
const stubConfig = { rateLimitRecord: null, backupCodeRecord: null };

function makeSupabaseStub() {
  let profilesUpdateCalled = false;
  let backupCodeMarkedUsed = false;

  function makeChain(table) {
    const emptyResult = { data: [], count: 0, error: null };
    const chain = {};
    const passthrough = ['select', 'order', 'range', 'limit', 'eq', 'neq', 'gt',
      'gte', 'lt', 'lte', 'is', 'in', 'or', 'filter', 'match', 'not', 'contains',
      'overlaps', 'textSearch', 'delete', 'upsert'];
    for (const fn of passthrough) chain[fn] = () => chain;
    chain.update = (vals) => {
      if (table === 'profiles' && vals.two_factor_verified_at) profilesUpdateCalled = true;
      if (table === 'totp_backup_codes' && vals.used_at) backupCodeMarkedUsed = true;
      return chain;
    };
    chain.maybeSingle = () => {
      if (table === 'totp_backup_codes') {
        return Promise.resolve({ data: stubConfig.backupCodeRecord, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    };
    chain.single = () => {
      if (table === 'two_factor_rate_limits') {
        return Promise.resolve({ data: stubConfig.rateLimitRecord, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    };
    chain.insert = () => Promise.resolve({ data: null, error: null });
    chain.then = (resolve, reject) => Promise.resolve(emptyResult).then(resolve, reject);
    return chain;
  }

  const stub = {
    from: (t) => makeChain(t),
    auth: {
      getUser: async (token) => {
        if (token === 'stub-valid-token') {
          return { data: { user: { id: 'stub-user-id' } }, error: null };
        }
        return { data: { user: null }, error: { message: 'Invalid token' } };
      }
    },
    _profilesUpdateCalled: () => profilesUpdateCalled,
    _backupCodeMarkedUsed: () => backupCodeMarkedUsed
  };
  return stub;
}

// Stash the last stub instance so tests can inspect side effects.
let lastStub;
const supabasePaths = new Set([
  require.resolve('@supabase/supabase-js'),
  require.resolve('@supabase/supabase-js', { paths: [path.join(__dirname, '..', 'functions')] })
]);
for (const sp of supabasePaths) {
  require.cache[sp] = {
    id: sp, filename: sp, loaded: true,
    exports: {
      createClient: () => {
        lastStub = makeSupabaseStub();
        return lastStub;
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Fetch stub
// ---------------------------------------------------------------------------
const fetchConfig = { challengeFail: false, verifyFail: false };

global.fetch = async function stubFetch(url) {
  const u = String(url);
  if (/\/auth\/v1\/factors\/[^/]+\/challenge/.test(u)) {
    if (fetchConfig.challengeFail) {
      return { ok: false, status: 422, json: async () => ({ message: 'Factor not found' }) };
    }
    return { ok: true, status: 200, json: async () => ({ id: 'stub-challenge-id' }) };
  }
  if (/\/auth\/v1\/factors\/[^/]+\/verify/.test(u)) {
    if (fetchConfig.verifyFail) {
      return { ok: false, status: 422, json: async () => ({ message: 'Invalid TOTP code' }) };
    }
    return { ok: true, status: 200, json: async () => ({ access_token: 'new-aal2-token' }) };
  }
  throw new Error('Unexpected fetch: ' + u);
};

const { handler } = require('../functions/totp-verify');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeEvent({ method = 'POST', token = null, body = null }) {
  const hdrs = { host: 'stub.local' };
  if (token) hdrs['authorization'] = 'Bearer ' + token;
  return {
    path: '/api/2fa/totp/verify',
    httpMethod: method,
    headers: hdrs,
    queryStringParameters: {},
    body: body !== null ? JSON.stringify(body) : null
  };
}

function parseBody(res) {
  try { return JSON.parse(res.body); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function run() {
  let passed = 0;
  let failed = 0;
  const failures = [];

  async function test(label, fn) {
    fetchConfig.challengeFail = false;
    fetchConfig.verifyFail    = false;
    stubConfig.rateLimitRecord  = null;
    stubConfig.backupCodeRecord = null;
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
    const res = await handler({ httpMethod: 'OPTIONS', headers: {}, path: '/api/2fa/totp/verify', body: null, queryStringParameters: {} });
    assert.strictEqual(res.statusCode, 200);
  });

  await test('GET → 405', async () => {
    const res = await handler(makeEvent({ method: 'GET', token: 'stub-valid-token' }));
    assert.strictEqual(res.statusCode, 405);
  });

  await test('no auth header → 401', async () => {
    const res = await handler(makeEvent({ token: null, body: { factorId: 'fid', code: '123456' } }));
    assert.strictEqual(res.statusCode, 401);
  });

  await test('invalid token → 401', async () => {
    const res = await handler(makeEvent({ token: 'bad-token', body: { factorId: 'fid', code: '123456' } }));
    assert.strictEqual(res.statusCode, 401);
  });

  await test('missing Bearer prefix → 401', async () => {
    const res = await handler({
      path: '/api/2fa/totp/verify', httpMethod: 'POST',
      headers: { authorization: 'stub-valid-token' },
      queryStringParameters: {}, body: JSON.stringify({ factorId: 'fid', code: '123456' })
    });
    assert.strictEqual(res.statusCode, 401);
  });

  // ── Input validation ──────────────────────────────────────────────────────
  await test('missing factorId → 400', async () => {
    const res = await handler(makeEvent({ token: 'stub-valid-token', body: { code: '123456' } }));
    assert.strictEqual(res.statusCode, 400);
    assert.ok(parseBody(res).error.includes('factorId'));
  });

  await test('missing code → 400', async () => {
    const res = await handler(makeEvent({ token: 'stub-valid-token', body: { factorId: 'fid' } }));
    assert.strictEqual(res.statusCode, 400);
    assert.ok(parseBody(res).error.includes('6 digits'));
  });

  await test('5-digit code → 400', async () => {
    const res = await handler(makeEvent({ token: 'stub-valid-token', body: { factorId: 'fid', code: '12345' } }));
    assert.strictEqual(res.statusCode, 400);
  });

  await test('alpha code → 400', async () => {
    const res = await handler(makeEvent({ token: 'stub-valid-token', body: { factorId: 'fid', code: 'abcdef' } }));
    assert.strictEqual(res.statusCode, 400);
  });

  await test('invalid JSON body → 400 (missing factorId)', async () => {
    const res = await handler({
      path: '/api/2fa/totp/verify', httpMethod: 'POST',
      headers: { authorization: 'Bearer stub-valid-token' },
      queryStringParameters: {}, body: 'not-json'
    });
    assert.strictEqual(res.statusCode, 400);
  });

  // ── Rate-limit gate ───────────────────────────────────────────────────────
  await test('locked rate-limit → 429', async () => {
    stubConfig.rateLimitRecord = {
      user_id: 'stub-user-id', action_type: 'totp_verify',
      attempt_count: 5,
      locked_until: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      first_attempt_at: new Date().toISOString()
    };
    const res = await handler(makeEvent({ token: 'stub-valid-token', body: { factorId: 'fid', code: '123456' } }));
    assert.strictEqual(res.statusCode, 429);
    assert.ok(parseBody(res).error, 'error message present');
  });

  // ── GoTrue proxy errors ───────────────────────────────────────────────────
  await test('challenge failure proxied → 422', async () => {
    fetchConfig.challengeFail = true;
    const res = await handler(makeEvent({ token: 'stub-valid-token', body: { factorId: 'fid', code: '123456' } }));
    assert.strictEqual(res.statusCode, 422);
    assert.ok(parseBody(res).error, 'error message forwarded');
  });

  await test('verify failure proxied → 422', async () => {
    fetchConfig.verifyFail = true;
    const res = await handler(makeEvent({ token: 'stub-valid-token', body: { factorId: 'fid', code: '000000' } }));
    assert.strictEqual(res.statusCode, 422);
    assert.ok(parseBody(res).error, 'error message forwarded');
  });

  // ── Happy path ────────────────────────────────────────────────────────────
  await test('valid code → 200 { success: true }', async () => {
    const res = await handler(makeEvent({ token: 'stub-valid-token', body: { factorId: 'stub-factor-id', code: '123456' } }));
    assert.strictEqual(res.statusCode, 200);
    const body = parseBody(res);
    assert.ok(body.success, 'success flag');
  });

  await test('success writes two_factor_verified_at to profiles', async () => {
    await handler(makeEvent({ token: 'stub-valid-token', body: { factorId: 'stub-factor-id', code: '123456' } }));
    assert.ok(lastStub._profilesUpdateCalled(), 'profiles.update called with two_factor_verified_at');
  });

  // ── Backup code path ─────────────────────────────────────────────────────
  const VALID_BC = 'ABCD-EF23';

  await test('backup code: valid → 200 { success: true }', async () => {
    stubConfig.backupCodeRecord = { id: 1, code_hash: hashBackupCode(VALID_BC), used_at: null };
    const res = await handler(makeEvent({ token: 'stub-valid-token', body: { factorId: 'fid', code: VALID_BC } }));
    assert.strictEqual(res.statusCode, 200);
    assert.ok(parseBody(res).success, 'success flag');
  });

  await test('backup code: marks used_at on success', async () => {
    stubConfig.backupCodeRecord = { id: 1, code_hash: hashBackupCode(VALID_BC), used_at: null };
    await handler(makeEvent({ token: 'stub-valid-token', body: { factorId: 'fid', code: VALID_BC } }));
    assert.ok(lastStub._backupCodeMarkedUsed(), 'used_at written');
  });

  await test('backup code: already used → 422', async () => {
    stubConfig.backupCodeRecord = { id: 1, code_hash: hashBackupCode(VALID_BC), used_at: new Date().toISOString() };
    const res = await handler(makeEvent({ token: 'stub-valid-token', body: { factorId: 'fid', code: VALID_BC } }));
    assert.strictEqual(res.statusCode, 422);
    assert.ok(parseBody(res).error.includes('already used'));
  });

  await test('backup code: not found → 422', async () => {
    stubConfig.backupCodeRecord = null;
    const res = await handler(makeEvent({ token: 'stub-valid-token', body: { factorId: 'fid', code: VALID_BC } }));
    assert.strictEqual(res.statusCode, 422);
    assert.ok(parseBody(res).error.includes('Invalid'));
  });

  await test('backup code: lowercase input accepted (normalised)', async () => {
    stubConfig.backupCodeRecord = { id: 1, code_hash: hashBackupCode(VALID_BC), used_at: null };
    const res = await handler(makeEvent({ token: 'stub-valid-token', body: { factorId: 'fid', code: VALID_BC.toLowerCase() } }));
    assert.strictEqual(res.statusCode, 200);
  });

  await test('backup code: GoTrue NOT called (no fetch side-effect)', async () => {
    stubConfig.backupCodeRecord = { id: 1, code_hash: hashBackupCode(VALID_BC), used_at: null };
    let fetchCalled = false;
    const origFetch = global.fetch;
    global.fetch = async () => { fetchCalled = true; return { ok: true, status: 200, json: async () => ({}) }; };
    await handler(makeEvent({ token: 'stub-valid-token', body: { factorId: 'fid', code: VALID_BC } }));
    global.fetch = origFetch;
    assert.ok(!fetchCalled, 'GoTrue fetch not invoked for backup code path');
  });

  await test('backup code: invalid format → 400', async () => {
    const res = await handler(makeEvent({ token: 'stub-valid-token', body: { factorId: 'fid', code: 'NOTABACKUPCODE' } }));
    assert.strictEqual(res.statusCode, 400);
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

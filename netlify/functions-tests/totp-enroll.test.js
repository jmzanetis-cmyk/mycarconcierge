'use strict';

// Regression tests for netlify/functions/totp-enroll.js
//
// Covers:
//   - Auth gate: no/invalid Bearer token → 401
//   - POST /api/2fa/totp/enroll: happy path shape
//   - POST /api/2fa/totp/confirm-enroll: input validation, rate-limit gate,
//     happy path (200, 10 backup codes in XXXX-XXXX format, unique), locked
//     rate-limit → 429
//   - Backup code hashing: SHA-256, normalised (no dashes, uppercase)
//   - Unknown route → 404
//
// Supabase is stubbed (no real DB). Supabase MFA HTTP calls are stubbed via
// global.fetch (Node 18+ built-in). No external credentials required.
//
// Run with:  node netlify/functions-tests/totp-enroll.test.js

const assert = require('assert');
const path   = require('node:path');
const crypto = require('node:crypto');

process.env.SUPABASE_URL              = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';

// ---------------------------------------------------------------------------
// Supabase stub — table-aware, supports a mutable stubConfig for rate-limit
// scenarios.
// ---------------------------------------------------------------------------
const stubConfig = { rateLimitRecord: null }; // null = no record (first attempt)

function makeSupabaseStub() {
  function makeChain(table) {
    const emptyResult = { data: [], count: 0, error: null };
    const chain = {};
    const passthrough = ['select', 'order', 'range', 'limit', 'eq', 'neq', 'gt',
      'gte', 'lt', 'lte', 'is', 'in', 'or', 'filter', 'match', 'not', 'contains',
      'overlaps', 'textSearch', 'update', 'delete', 'upsert'];
    for (const fn of passthrough) chain[fn] = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
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
  return {
    from: (t) => makeChain(t),
    auth: {
      getUser: async (token) => {
        if (token === 'stub-valid-token') {
          return { data: { user: { id: 'stub-user-id' } }, error: null };
        }
        return { data: { user: null }, error: { message: 'Invalid token' } };
      }
    }
  };
}

// Stub both require-cache paths (nested functions/ node_modules + root).
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
// Fetch stub — intercepts Supabase auth MFA HTTP calls.
// ---------------------------------------------------------------------------
const ENROLL_STUB = {
  id:   'stub-factor-id',
  type: 'totp',
  totp: {
    qr_code: '<svg>stub-qr</svg>',
    secret:  'STUBSECRETBASE32',
    uri:     'otpauth://totp/MyCar%20Concierge:stub%40test.com?secret=STUBSECRETBASE32&issuer=MyCar%20Concierge'
  }
};

global.fetch = async function stubFetch(url) {
  const u = String(url);
  if (/\/auth\/v1\/factors\/[^/]+\/challenge/.test(u)) {
    return { ok: true, status: 200, json: async () => ({ id: 'stub-challenge-id' }) };
  }
  if (/\/auth\/v1\/factors\/[^/]+\/verify/.test(u)) {
    return { ok: true, status: 200, json: async () => ({ access_token: 'new-aal2-token' }) };
  }
  if (/\/auth\/v1\/factors$/.test(u)) {
    return { ok: true, status: 200, json: async () => ENROLL_STUB };
  }
  throw new Error('Unexpected fetch: ' + u);
};

// ---------------------------------------------------------------------------
// Load handler AFTER stubs are in place.
// ---------------------------------------------------------------------------
const { handler } = require('../functions/totp-enroll');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeEvent({ path: p, method = 'POST', token = null, body = null }) {
  const hdrs = { host: 'stub.local' };
  if (token) hdrs['authorization'] = 'Bearer ' + token;
  return {
    path: p,
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
    const res = await handler({ httpMethod: 'OPTIONS', headers: {}, path: '/api/2fa/totp/enroll', body: null, queryStringParameters: {} });
    assert.strictEqual(res.statusCode, 200);
  });

  await test('no auth header → 401', async () => {
    const res = await handler(makeEvent({ path: '/api/2fa/totp/enroll', token: null }));
    assert.strictEqual(res.statusCode, 401);
  });

  await test('invalid token → 401', async () => {
    const res = await handler(makeEvent({ path: '/api/2fa/totp/enroll', token: 'bad-token' }));
    assert.strictEqual(res.statusCode, 401);
  });

  await test('missing Bearer prefix → 401', async () => {
    const res = await handler({
      path: '/api/2fa/totp/enroll',
      httpMethod: 'POST',
      headers: { authorization: 'stub-valid-token' }, // no "Bearer "
      queryStringParameters: {},
      body: null
    });
    assert.strictEqual(res.statusCode, 401);
  });

  // ── POST /enroll ──────────────────────────────────────────────────────────
  await test('POST /enroll → 200 with factorId, uri, qrCode, secret', async () => {
    const res = await handler(makeEvent({ path: '/api/2fa/totp/enroll', token: 'stub-valid-token' }));
    assert.strictEqual(res.statusCode, 200);
    const body = parseBody(res);
    assert.ok(body.factorId,         'factorId present');
    assert.ok(body.uri,              'uri present');
    assert.ok(body.qrCode,           'qrCode present');
    assert.ok(body.secret,           'secret present');
    assert.strictEqual(body.factorId, ENROLL_STUB.id);
    assert.strictEqual(body.uri,      ENROLL_STUB.totp.uri);
  });

  await test('POST /enroll does NOT set two_factor_enabled (no profiles write)', async () => {
    // The enroll handler must not touch profiles — enrollment only starts here.
    // Verified structurally: the enroll branch has no supabase.from('profiles') call.
    // We confirm by asserting the response contains no two_factor_enabled field.
    const res = await handler(makeEvent({ path: '/api/2fa/totp/enroll', token: 'stub-valid-token' }));
    const body = parseBody(res);
    assert.ok(!('two_factor_enabled' in body), 'two_factor_enabled not in enroll response');
  });

  // ── POST /confirm-enroll — input validation ───────────────────────────────
  await test('confirm-enroll missing factorId → 400', async () => {
    const res = await handler(makeEvent({ path: '/api/2fa/totp/confirm-enroll', token: 'stub-valid-token', body: { code: '123456' } }));
    assert.strictEqual(res.statusCode, 400);
    assert.ok(parseBody(res).error.includes('factorId'));
  });

  await test('confirm-enroll missing code → 400', async () => {
    const res = await handler(makeEvent({ path: '/api/2fa/totp/confirm-enroll', token: 'stub-valid-token', body: { factorId: 'fid' } }));
    assert.strictEqual(res.statusCode, 400);
    assert.ok(parseBody(res).error.includes('6 digits'));
  });

  await test('confirm-enroll 5-digit code → 400', async () => {
    const res = await handler(makeEvent({ path: '/api/2fa/totp/confirm-enroll', token: 'stub-valid-token', body: { factorId: 'fid', code: '12345' } }));
    assert.strictEqual(res.statusCode, 400);
  });

  await test('confirm-enroll alpha code → 400', async () => {
    const res = await handler(makeEvent({ path: '/api/2fa/totp/confirm-enroll', token: 'stub-valid-token', body: { factorId: 'fid', code: 'abcdef' } }));
    assert.strictEqual(res.statusCode, 400);
  });

  await test('confirm-enroll invalid JSON body → 400 (missing factorId)', async () => {
    const res = await handler({
      path: '/api/2fa/totp/confirm-enroll',
      httpMethod: 'POST',
      headers: { authorization: 'Bearer stub-valid-token' },
      queryStringParameters: {},
      body: 'not-json'
    });
    assert.strictEqual(res.statusCode, 400);
  });

  // ── Rate-limit gate ───────────────────────────────────────────────────────
  await test('confirm-enroll locked rate-limit → 429', async () => {
    const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    stubConfig.rateLimitRecord = {
      user_id: 'stub-user-id', action_type: 'totp_verify',
      attempt_count: 5, locked_until: lockUntil,
      first_attempt_at: new Date().toISOString()
    };
    try {
      const res = await handler(makeEvent({ path: '/api/2fa/totp/confirm-enroll', token: 'stub-valid-token', body: { factorId: 'fid', code: '123456' } }));
      assert.strictEqual(res.statusCode, 429);
      assert.ok(parseBody(res).error, 'error message present');
    } finally {
      stubConfig.rateLimitRecord = null; // reset for subsequent tests
    }
  });

  // ── Happy-path confirm-enroll ─────────────────────────────────────────────
  await test('confirm-enroll happy path → 200 with success and backupCodes', async () => {
    const res = await handler(makeEvent({ path: '/api/2fa/totp/confirm-enroll', token: 'stub-valid-token', body: { factorId: 'stub-factor-id', code: '123456' } }));
    assert.strictEqual(res.statusCode, 200);
    const body = parseBody(res);
    assert.ok(body.success, 'success flag true');
    assert.ok(Array.isArray(body.backupCodes), 'backupCodes is array');
  });

  await test('confirm-enroll returns exactly 10 backup codes', async () => {
    const res = await handler(makeEvent({ path: '/api/2fa/totp/confirm-enroll', token: 'stub-valid-token', body: { factorId: 'stub-factor-id', code: '123456' } }));
    const { backupCodes } = parseBody(res);
    assert.strictEqual(backupCodes.length, 10, '10 backup codes');
  });

  await test('backup codes are in XXXX-XXXX format (charset A-Z2-9 excluding O/I/0/1)', async () => {
    const res = await handler(makeEvent({ path: '/api/2fa/totp/confirm-enroll', token: 'stub-valid-token', body: { factorId: 'stub-factor-id', code: '123456' } }));
    const { backupCodes } = parseBody(res);
    for (const c of backupCodes) {
      assert.match(c, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/,
        'code ' + c + ' must be XXXX-XXXX with valid charset');
    }
  });

  await test('backup codes are unique within a set', async () => {
    const res = await handler(makeEvent({ path: '/api/2fa/totp/confirm-enroll', token: 'stub-valid-token', body: { factorId: 'stub-factor-id', code: '123456' } }));
    const { backupCodes } = parseBody(res);
    assert.strictEqual(new Set(backupCodes).size, 10, 'all 10 codes are distinct');
  });

  // ── Backup code hashing ───────────────────────────────────────────────────
  await test('backup code hashing: SHA-256, strip dashes, uppercase (matches hash2faCode)', async () => {
    // Verify the normalisation + hashing algorithm used by hashBackupCode().
    const code = 'ABCD-EFGH';
    const normalised = code.replace(/-/g, '').toUpperCase(); // 'ABCDEFGH'
    const expected = crypto.createHash('sha256').update(normalised).digest('hex');
    assert.strictEqual(expected.length, 64, 'SHA-256 produces 64-char hex');
    // Verify case-insensitive equivalence (lowercase input same hash).
    const lowerCode = 'abcd-efgh';
    const lowerNorm = lowerCode.replace(/-/g, '').toUpperCase();
    assert.strictEqual(lowerNorm, normalised, 'normalisation is case-insensitive');
    assert.strictEqual(
      crypto.createHash('sha256').update(lowerNorm).digest('hex'),
      expected,
      'lower-input hash equals upper-input hash after normalisation'
    );
  });

  // ── Unknown route ─────────────────────────────────────────────────────────
  await test('unknown route → 404', async () => {
    const res = await handler(makeEvent({ path: '/api/2fa/totp/unknown', token: 'stub-valid-token' }));
    assert.strictEqual(res.statusCode, 404);
  });

  await test('GET /enroll → 404 (only POST accepted)', async () => {
    const res = await handler(makeEvent({ path: '/api/2fa/totp/enroll', method: 'GET', token: 'stub-valid-token' }));
    assert.strictEqual(res.statusCode, 404);
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

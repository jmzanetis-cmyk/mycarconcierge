// ============================================================================
// Task #242 — Regression test for the Facebook data-deletion callback's
// signed_request verification.
//
// The POST /api/auth/facebook/data-deletion endpoint is the only thing
// standing between a forged Facebook payload and an irreversible
// account-deletion cascade. This test locks down the four signature/parser
// failure modes documented in the task:
//
//   1. Wrong secret               -> 400 "Invalid signed_request signature"
//   2. Malformed payload          -> 400 "Malformed signed_request" / "...signature" / "...payload"
//   3. Missing signed_request     -> 400 "Missing signed_request"
//   4. Correctly signed payload   -> 200 { url, confirmation_code } and an
//      for a non-existent user_id    fb_data_deletion_requests row inserted
//                                    with status = 'not_found'
//
// The handler runs in-process; Supabase is fully stubbed so the test does
// not touch a real database (cleanup is therefore automatic — nothing is
// ever written to Postgres).
//
// Run with:  node netlify/functions-tests/facebook-data-deletion.test.js
// Exits non-zero on the first assertion failure.
// ============================================================================

'use strict';

const assert = require('node:assert');
const crypto = require('node:crypto');
const path   = require('node:path');

// ---------------------------------------------------------------------------
// Env setup — must happen before requiring the handler so utils.js sees them.
// ---------------------------------------------------------------------------

const APP_SECRET = 'task242-test-facebook-app-secret';
process.env.FACEBOOK_APP_SECRET = APP_SECRET;
process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';
process.env.PUBLIC_BASE_URL = 'https://test.mycarconcierge.com';

// ---------------------------------------------------------------------------
// Supabase stub. We only need to:
//   - return { data: null } for the profiles lookup (so the handler falls
//     through the identity scan path),
//   - return an empty user list for auth.admin.listUsers (so the user is
//     never matched and we hit the 'not_found' branch),
//   - capture .from('fb_data_deletion_requests').insert(...) so the test
//     can assert what status the handler tried to record.
// ---------------------------------------------------------------------------

const captured = { inserts: [] };

function makeSupabaseStub() {
  const profilesQuery = {
    select: () => profilesQuery,
    eq: () => profilesQuery,
    maybeSingle: () => Promise.resolve({ data: null, error: null })
  };

  function fbDeletionTable() {
    const q = {
      insert(row) {
        captured.inserts.push(row);
        return {
          select: () => ({
            single: () => Promise.resolve({
              data: { id: 'stub-row-id-' + captured.inserts.length },
              error: null
            })
          })
        };
      },
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) })
    };
    return q;
  }

  return {
    from(table) {
      if (table === 'profiles') return profilesQuery;
      if (table === 'fb_data_deletion_requests') return fbDeletionTable();
      // Anything else — chainable no-op.
      const noop = {};
      const passthrough = ['select','eq','update','delete','insert','order','limit','in','is'];
      for (const fn of passthrough) noop[fn] = () => noop;
      noop.maybeSingle = () => Promise.resolve({ data: null, error: null });
      noop.single = () => Promise.resolve({ data: null, error: null });
      noop.then = (resolve) => Promise.resolve({ data: [], error: null }).then(resolve);
      return noop;
    },
    auth: {
      admin: {
        // Empty page -> handler concludes user does not exist.
        listUsers: () => Promise.resolve({ data: { users: [] }, error: null })
      }
    }
  };
}

// netlify/functions/ has its own nested node_modules with a separate copy of
// @supabase/supabase-js (see admin-routes-auth.test.js for the explanation).
// Stub BOTH require-cache entries so utils.createSupabaseClient() resolves to
// our stub regardless of which copy node finds first.
const supabasePaths = new Set([
  require.resolve('@supabase/supabase-js'),
  require.resolve('@supabase/supabase-js', { paths: [path.join(__dirname, '..', 'functions')] })
]);
for (const sp of supabasePaths) {
  require.cache[sp] = {
    id: sp,
    filename: sp,
    loaded: true,
    exports: { createClient: () => makeSupabaseStub() }
  };
}

// account-deletion-core is only invoked when a real user matches; in this
// test no user is matched so the cascade never runs. Stub it anyway as a
// belt-and-braces guard against accidental cascade runs.
const corePath = require.resolve('../functions/account-deletion-core.js');
require.cache[corePath] = {
  id: corePath,
  filename: corePath,
  loaded: true,
  exports: {
    performAccountDeletion: () => {
      throw new Error('account-deletion cascade must NEVER run in this test');
    }
  }
};

const handler = require('../functions/facebook-data-deletion.js').handler;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function base64UrlEncode(buf) {
  return Buffer.from(buf).toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function signRequest(payloadObj, secret) {
  const payload = base64UrlEncode(JSON.stringify(payloadObj));
  const sig = crypto.createHmac('sha256', secret).update(payload).digest();
  return base64UrlEncode(sig) + '.' + payload;
}

function postEvent(body, contentType) {
  return {
    httpMethod: 'POST',
    headers: { 'content-type': contentType || 'application/json' },
    queryStringParameters: {},
    body: typeof body === 'string' ? body : JSON.stringify(body)
  };
}

function parseBody(res) {
  try { return JSON.parse(res.body); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let pass = 0;
let fail = 0;

async function test(name, fn) {
  captured.inserts.length = 0;
  try {
    await fn();
    pass += 1;
    console.log('PASS  ' + name);
  } catch (e) {
    fail += 1;
    console.error('FAIL  ' + name);
    console.error('       ' + (e.stack || e.message));
  }
}

(async function run() {
  // ------------------------------------------------------------------
  // Case 1: Forged signature — payload signed with the WRONG secret.
  // ------------------------------------------------------------------
  await test('rejects payload signed with wrong secret', async () => {
    const forged = signRequest(
      { user_id: '1234567890', algorithm: 'HMAC-SHA256', issued_at: 1700000000 },
      'this-is-the-wrong-secret'
    );
    const res = await handler(postEvent({ signed_request: forged }));
    assert.strictEqual(res.statusCode, 400, 'expected 400, got ' + res.statusCode);
    assert.deepStrictEqual(parseBody(res), { error: 'Invalid signed_request signature' });
    assert.strictEqual(captured.inserts.length, 0, 'must not insert any deletion row for a forged signature');
  });

  // ------------------------------------------------------------------
  // Case 2: Malformed payload — three sub-cases that each must reject.
  // ------------------------------------------------------------------
  await test('rejects malformed signed_request (no dot separator)', async () => {
    const res = await handler(postEvent({ signed_request: 'no-dot-here-at-all' }));
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(parseBody(res), { error: 'Malformed signed_request' });
    assert.strictEqual(captured.inserts.length, 0);
  });

  await test('rejects malformed signed_request (too many dots)', async () => {
    const res = await handler(postEvent({ signed_request: 'a.b.c' }));
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(parseBody(res), { error: 'Malformed signed_request' });
    assert.strictEqual(captured.inserts.length, 0);
  });

  await test('rejects malformed signed_request (signature contains non-base64 chars)', async () => {
    // '!!!!' is outside the base64url alphabet. Buffer.from is lenient and
    // returns an empty buffer, so this hits the length-mismatch branch and
    // surfaces as 'Invalid signed_request signature'. Locks down the
    // "garbage signature" attack vector explicitly.
    const payload = base64UrlEncode(JSON.stringify({
      user_id: '1', algorithm: 'HMAC-SHA256', issued_at: 1
    }));
    const res = await handler(postEvent({ signed_request: '!!!!.' + payload }));
    assert.strictEqual(res.statusCode, 400);
    // Buffer.from is lenient with non-base64 input — '!!!!' decodes to an
    // empty buffer rather than throwing, so it deterministically lands on
    // the length-mismatch branch ("Invalid signed_request signature").
    assert.deepStrictEqual(parseBody(res), { error: 'Invalid signed_request signature' });
    assert.strictEqual(captured.inserts.length, 0);
  });

  await test('rejects malformed signed_request (signature passes base64 but length wrong)', async () => {
    // 'AAAA' decodes to 3 bytes — the HMAC-SHA256 expected length is 32, so
    // the timing-safe compare path rejects it as an invalid signature
    // (NOT as malformed) because the base64 itself decoded fine. This locks
    // down the length-mismatch branch in parseSignedRequest.
    const payload = base64UrlEncode(JSON.stringify({
      user_id: '1', algorithm: 'HMAC-SHA256', issued_at: 1
    }));
    const res = await handler(postEvent({ signed_request: 'AAAA.' + payload }));
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(parseBody(res), { error: 'Invalid signed_request signature' });
    assert.strictEqual(captured.inserts.length, 0);
  });

  await test('rejects malformed signed_request (correctly signed but payload is not valid JSON)', async () => {
    // Signature math passes, but the payload base64 doesn't decode to JSON.
    // Locks down the 'Malformed signed_request payload' branch.
    const payload = base64UrlEncode('this-is-not-json');
    const sig = crypto.createHmac('sha256', APP_SECRET).update(payload).digest();
    const res = await handler(postEvent({ signed_request: base64UrlEncode(sig) + '.' + payload }));
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(parseBody(res), { error: 'Malformed signed_request payload' });
    assert.strictEqual(captured.inserts.length, 0);
  });

  // ------------------------------------------------------------------
  // Case 3: Missing signed_request entirely.
  // ------------------------------------------------------------------
  await test('rejects request with missing signed_request body field', async () => {
    const res = await handler(postEvent({}));
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(parseBody(res), { error: 'Missing signed_request' });
    assert.strictEqual(captured.inserts.length, 0);
  });

  await test('rejects request with empty body', async () => {
    const res = await handler(postEvent('', 'application/x-www-form-urlencoded'));
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(parseBody(res), { error: 'Missing signed_request' });
    assert.strictEqual(captured.inserts.length, 0);
  });

  // ------------------------------------------------------------------
  // Case 4: Correctly signed payload for a user_id that matches no MCC user.
  // ------------------------------------------------------------------
  await test('accepts correctly signed payload for non-existent user_id and records not_found', async () => {
    const fbUserId = '999999999999999';
    const valid = signRequest(
      { user_id: fbUserId, algorithm: 'HMAC-SHA256', issued_at: 1700000000 },
      APP_SECRET
    );
    const res = await handler(postEvent({ signed_request: valid }));
    assert.strictEqual(res.statusCode, 200, 'expected 200, got ' + res.statusCode + ' body=' + res.body);
    const body = parseBody(res);
    assert.ok(body && typeof body.url === 'string', 'response missing url');
    assert.ok(body.url.startsWith('https://test.mycarconcierge.com/data-deletion-status.html?code='),
      'url must point at the configured PUBLIC_BASE_URL status page, got: ' + body.url);
    assert.ok(/^[0-9a-f]{16}$/.test(body.confirmation_code),
      'confirmation_code must be 16 hex chars, got: ' + body.confirmation_code);
    assert.ok(body.url.endsWith('?code=' + body.confirmation_code),
      'url must embed the same confirmation_code returned in the body');

    assert.strictEqual(captured.inserts.length, 1, 'expected exactly one fb_data_deletion_requests insert');
    const row = captured.inserts[0];
    assert.strictEqual(row.status, 'not_found',
      "row.status must be 'not_found' when no MCC user matches; got: " + row.status);
    assert.strictEqual(row.facebook_user_id, fbUserId);
    assert.strictEqual(row.user_id, null, 'row.user_id must be null when no MCC user matches');
    assert.strictEqual(row.confirmation_code, body.confirmation_code,
      'persisted confirmation_code must match the one returned to Facebook');
    assert.ok(row.completed_at, 'not_found rows should be marked completed_at immediately');
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) process.exit(1);
})();

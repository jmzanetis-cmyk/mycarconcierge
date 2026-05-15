// ────────────────────────────────────────────────────────────────────────────
// Task #372 — BGC live-mode smoke tests
//
// In-process tests for:
//   * netlify/functions/initiate-background-check.js
//   * netlify/functions/background-check-webhook.js
//   * netlify/functions/bgc-decrypt-token.js
//   * netlify/functions/bgc-admin.js
//   * netlify/functions/bgc-config.js
//
// Coverage:
//   1. webhook signature verify rejects bad sig / accepts good sig.
//   2. webhook normaliseStatus maps A/P/C + flagged correctly.
//   3. initiate-background-check rejects unauthenticated request (401).
//   4. initiate-background-check uses mock when BGC_LIVE_MODE != 'true'.
//   5. initiate-background-check live mode requires email + API key.
//   6. bgc-config returns widget base + source token (no secrets).
//   7. bgc-decrypt-token rejects missing token (400) and missing private key (500).
//   8. bgc-admin rejects without auth.
//
// No live BGC creds are used — every BGC HTTP call is stubbed via global.fetch.
// Per task spec the suite skips the live-network checks when creds are missing
// (which is always in CI / dev).
//
// Run:  node netlify/functions-tests/bgc-live.test.js
// ────────────────────────────────────────────────────────────────────────────

'use strict';

const assert = require('assert');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';
process.env.SUPABASE_ANON_KEY = 'stub-anon-key';
process.env.BGC_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.ADMIN_PASSWORD = 'test-admin-pw';

let dbState = {};
let lastInsert = null;
let lastUpsert = null;
let currentAuthUserId = null;
let currentAuthUserRole = null;

function makeChain(table) {
  const chain = {
    _table: table,
    _filters: {},
    select() { return chain; },
    eq(c, v) { chain._filters[c] = v; return chain; },
    in() { return chain; }, gt() { return chain; },
    neq() { return chain; }, is() { return chain; }, not() { return chain; },
    order() { return chain; }, limit() { return chain; },
    maybeSingle() {
      const fn = dbState[`${table}.maybeSingle`];
      return Promise.resolve(fn ? fn(chain._filters) : { data: null, error: null });
    },
    single() {
      const fn = dbState[`${table}.single`];
      return Promise.resolve(fn ? fn(chain._filters) : { data: null, error: null });
    },
    insert(rows) {
      lastInsert = { table, rows };
      return {
        select() { return { single() {
          const fn = dbState[`${table}.insertSingle`];
          return Promise.resolve(fn ? fn(rows) : { data: { id: 'mock-row' }, error: null });
        }}; }
      };
    },
    upsert(row) { lastUpsert = { table, row }; return Promise.resolve({ data: row, error: null }); },
    update() { return chain; },
    then(resolve) { return Promise.resolve({ data: null, error: null }).then(resolve); },
  };
  return chain;
}

const stubSupabase = {
  from: (table) => makeChain(table),
  auth: {
    getUser: async (token) => {
      if (!token || token === 'invalid') return { data: { user: null }, error: { message: 'invalid' } };
      return { data: { user: { id: currentAuthUserId || 'caller-uid' } }, error: null };
    }
  },
  rpc: async () => ({ data: null, error: null })
};

require.cache[require.resolve(path.join('..', 'functions', 'utils.js'))] = {
  exports: { createSupabaseClient: () => stubSupabase }
};

function fresh(modPath) {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── Test 1: webhook signature verify ────────────────────────────────────────
test('webhook rejects request with no signature', async () => {
  const mod = fresh('../functions/background-check-webhook.js');
  const resp = await mod.handler({
    httpMethod: 'POST', body: JSON.stringify({ report_key: 'rk_1', status: 'A' }), headers: {}
  });
  assert.strictEqual(resp.statusCode, 401);
});

test('webhook accepts valid signature, normalises A → pending', async () => {
  const mod = fresh('../functions/background-check-webhook.js');
  const body = JSON.stringify({ report_key: 'rk_1', status: 'A' });
  const sig = crypto.createHmac('sha256', 'test-webhook-secret').update(body).digest('hex');
  // Stub: update returns no row → returns 200 with unknown_report.
  dbState['employee_background_checks.maybeSingle'] = () => ({ data: null, error: null });
  const resp = await mod.handler({ httpMethod: 'POST', body, headers: { 'x-signature': sig } });
  assert.strictEqual(resp.statusCode, 200);
  const parsed = JSON.parse(resp.body);
  assert.strictEqual(parsed.received, true);
});

test('normaliseStatus: BGC letter codes', () => {
  const mod = fresh('../functions/background-check-webhook.js');
  assert.strictEqual(mod._normaliseStatus('A', false), 'pending');
  assert.strictEqual(mod._normaliseStatus('P', false), 'pending');
  assert.strictEqual(mod._normaliseStatus('C', false), 'clear');
  assert.strictEqual(mod._normaliseStatus('C', true), 'consider');
  assert.strictEqual(mod._normaliseStatus('clear', false), 'clear');
  assert.strictEqual(mod._normaliseStatus('garbage', false), 'failed');
});

// ── Test 2: initiate auth + mock path ───────────────────────────────────────
test('initiate rejects request without auth → 401', async () => {
  delete process.env.BGC_LIVE_MODE;
  const mod = fresh('../functions/initiate-background-check.js');
  const resp = await mod.handler({
    httpMethod: 'POST', body: JSON.stringify({ employeeId: 'emp1' }), headers: {}
  });
  assert.strictEqual(resp.statusCode, 401);
});

test('initiate uses mock when BGC_LIVE_MODE not set', async () => {
  delete process.env.BGC_LIVE_MODE;
  currentAuthUserId = 'provider-uid';
  dbState['provider_employees.maybeSingle'] = () => ({
    data: { id: 'emp1', provider_id: 'provider-uid', email: 'e@e.com' }, error: null
  });
  dbState['profiles.maybeSingle'] = () => ({ data: { role: 'provider' }, error: null });
  dbState['employee_background_checks.insertSingle'] = () => ({ data: { id: 'bgc1' }, error: null });
  const mod = fresh('../functions/initiate-background-check.js');
  const resp = await mod.handler({
    httpMethod: 'POST',
    body: JSON.stringify({ employeeId: 'emp1' }),
    headers: { authorization: 'Bearer good' }
  });
  assert.strictEqual(resp.statusCode, 200, 'body: ' + resp.body);
  const parsed = JSON.parse(resp.body);
  assert.strictEqual(parsed.mocked, true);
  assert.strictEqual(parsed.mode, 'mock');
  assert.ok(String(parsed.reportId).startsWith('mock_'));
});

test('initiate live mode requires employee email', async () => {
  process.env.BGC_LIVE_MODE = 'true';
  currentAuthUserId = 'provider-uid';
  dbState['provider_employees.maybeSingle'] = () => ({
    data: { id: 'emp1', provider_id: 'provider-uid', email: null }, error: null
  });
  dbState['profiles.maybeSingle'] = () => ({ data: { role: 'provider' }, error: null });
  const mod = fresh('../functions/initiate-background-check.js');
  const resp = await mod.handler({
    httpMethod: 'POST',
    body: JSON.stringify({ employeeId: 'emp1' }),
    headers: { authorization: 'Bearer good' }
  });
  assert.strictEqual(resp.statusCode, 400);
  assert.strictEqual(JSON.parse(resp.body).error, 'employee_email_required_for_live');
});

test('initiate live mode requires API key (sub-account or platform)', async () => {
  process.env.BGC_LIVE_MODE = 'true';
  delete process.env.BGC_API_TOKEN;
  currentAuthUserId = 'provider-uid';
  dbState['provider_employees.maybeSingle'] = () => ({
    data: { id: 'emp1', provider_id: 'provider-uid', email: 'e@e.com' }, error: null
  });
  dbState['profiles.maybeSingle'] = () => ({ data: { role: 'provider' }, error: null });
  dbState['provider_background_check_accounts.maybeSingle'] = () => ({ data: null, error: null });
  const mod = fresh('../functions/initiate-background-check.js');
  const resp = await mod.handler({
    httpMethod: 'POST',
    body: JSON.stringify({ employeeId: 'emp1' }),
    headers: { authorization: 'Bearer good' }
  });
  assert.strictEqual(resp.statusCode, 400);
  assert.strictEqual(JSON.parse(resp.body).error, 'bgc_not_configured');
});

test('initiate live mode posts to /orders/new and stores invite URL', async () => {
  process.env.BGC_LIVE_MODE = 'true';
  process.env.BGC_API_TOKEN = 'platform-token';
  currentAuthUserId = 'provider-uid';
  dbState['provider_employees.maybeSingle'] = () => ({
    data: { id: 'emp1', provider_id: 'provider-uid', email: 'e@e.com' }, error: null
  });
  dbState['profiles.maybeSingle'] = () => ({ data: { role: 'provider' }, error: null });
  dbState['provider_background_check_accounts.maybeSingle'] = () => ({ data: null, error: null });
  dbState['employee_background_checks.insertSingle'] = () => ({ data: { id: 'bgc1' }, error: null });

  let capturedUrl = null;
  let capturedBody = null;
  global.fetch = async (url, opts) => {
    capturedUrl = url; capturedBody = JSON.parse(opts.body);
    return {
      ok: true, status: 200,
      text: async () => JSON.stringify({
        applicants: [{ report_key: 'rk_live_xyz', applicant_invite_url: 'https://bgc/invite/abc' }]
      })
    };
  };
  const mod = fresh('../functions/initiate-background-check.js');
  const resp = await mod.handler({
    httpMethod: 'POST',
    body: JSON.stringify({ employeeId: 'emp1' }),
    headers: { authorization: 'Bearer good' }
  });
  assert.strictEqual(resp.statusCode, 200, 'body: ' + resp.body);
  const parsed = JSON.parse(resp.body);
  assert.strictEqual(parsed.reportId, 'rk_live_xyz');
  assert.strictEqual(parsed.applicantInviteUrl, 'https://bgc/invite/abc');
  assert.strictEqual(parsed.mode, 'live_platform');
  assert.ok(capturedUrl.includes('/orders/new'));
  assert.ok(capturedUrl.includes('api_token=platform-token'));
  assert.strictEqual(capturedBody.report_sku, 'HIRE1');
  assert.strictEqual(capturedBody.applicant_emails[0], 'e@e.com');
  assert.strictEqual(capturedBody.terms_agree, 'Y');
  assert.ok(!('ssn' in capturedBody), 'must NOT send SSN');
  assert.ok(!('dob' in capturedBody), 'must NOT send DOB');
  assert.strictEqual(lastInsert.table, 'employee_background_checks');
  assert.strictEqual(lastInsert.rows.applicant_invite_url, 'https://bgc/invite/abc');
});

// ── Test 3: bgc-config ──────────────────────────────────────────────────────
test('bgc-config returns widget base + source token (no secrets)', async () => {
  process.env.BGC_SOURCE_TOKEN = 'src_test';
  process.env.BGC_API_BASE = 'https://sandbox.backgroundchecks.com/api';
  const mod = fresh('../functions/bgc-config.js');
  const resp = await mod.handler({ httpMethod: 'GET', headers: {} });
  assert.strictEqual(resp.statusCode, 200);
  const parsed = JSON.parse(resp.body);
  assert.strictEqual(parsed.widget_base, 'https://sandbox.backgroundchecks.com');
  assert.strictEqual(parsed.source_token, 'src_test');
  assert.ok(!('private_key' in parsed));
  assert.ok(!('api_token' in parsed));
});

// ── Test 4: bgc-decrypt-token ───────────────────────────────────────────────
test('decrypt-token rejects missing token', async () => {
  const mod = fresh('../functions/bgc-decrypt-token.js');
  const resp = await mod.handler({ httpMethod: 'POST', body: '{}', headers: { authorization: 'Bearer good' } });
  assert.strictEqual(resp.statusCode, 400);
});

test('decrypt-token rejects when private key not configured', async () => {
  delete process.env.BGC_PRIVATE_KEY;
  const mod = fresh('../functions/bgc-decrypt-token.js');
  const resp = await mod.handler({
    httpMethod: 'POST', body: JSON.stringify({ token: 'abc' }), headers: { authorization: 'Bearer good' }
  });
  assert.strictEqual(resp.statusCode, 500);
  assert.strictEqual(JSON.parse(resp.body).error, 'bgc_private_key_missing');
});

test('decrypt-token: only providers may enroll', async () => {
  process.env.BGC_PRIVATE_KEY = 'pk';
  process.env.BGC_API_TOKEN = 'platform';
  currentAuthUserId = 'caller-uid';
  dbState['profiles.maybeSingle'] = () => ({ data: { role: 'member' }, error: null });
  const mod = fresh('../functions/bgc-decrypt-token.js');
  const resp = await mod.handler({
    httpMethod: 'POST', body: JSON.stringify({ token: 'abc' }), headers: { authorization: 'Bearer good' }
  });
  assert.strictEqual(resp.statusCode, 403);
});

test('decrypt-token: success path stores api_key + flips live_mode', async () => {
  process.env.BGC_PRIVATE_KEY = 'pk';
  process.env.BGC_API_TOKEN = 'platform';
  process.env.BGC_SOURCE_TOKEN = 'src1';
  currentAuthUserId = 'provider-uid';
  dbState['profiles.maybeSingle'] = () => ({ data: { role: 'provider' }, error: null });
  global.fetch = async () => ({
    ok: true, status: 200,
    // BGC returns api_key + bgchecks_account_id; both must persist.
    text: async () => JSON.stringify({ api_key: 'newly_decrypted_key', bgchecks_account_id: 'BGC-ACCT-42' })
  });
  lastUpsert = null;
  const mod = fresh('../functions/bgc-decrypt-token.js');
  const resp = await mod.handler({
    httpMethod: 'POST', body: JSON.stringify({ token: 'enc' }), headers: { authorization: 'Bearer good' }
  });
  assert.strictEqual(resp.statusCode, 200, 'body: ' + resp.body);
  const parsed = JSON.parse(resp.body);
  assert.strictEqual(parsed.live, true);
  assert.ok(!('api_key' in parsed), 'must not leak api_key to client');
  assert.strictEqual(lastUpsert.table, 'provider_background_check_accounts');
  assert.strictEqual(lastUpsert.row.bgchecks_api_key, 'newly_decrypted_key');
  assert.strictEqual(lastUpsert.row.live_mode, true);
  assert.strictEqual(lastUpsert.row.source_token, 'src1');
  assert.strictEqual(lastUpsert.row.bgchecks_account_id, 'BGC-ACCT-42',
    'Step 5 — must persist bgchecks_account_id when BGC returns one');
});

// ── Test 6: end-to-end live initiate → webhook → clear round-trip ──────────
// Fully exercises the live happy path with stubbed BGC HTTP. Asserts that:
//   1. initiate posts to /orders/new and stores invite URL + report_key.
//   2. webhook with status='C' (no flag) normalises to 'clear'.
//   3. webhook with flagged_for_end_user_review:true normalises to 'consider'.
// This is the contract the production pipeline depends on, regardless of
// whether sandbox creds are available.
test('end-to-end: initiate → webhook(C) → clear; webhook(C+flag) → consider', async () => {
  process.env.BGC_LIVE_MODE = 'true';
  process.env.BGC_API_TOKEN = 'platform-token';
  currentAuthUserId = 'provider-uid';
  dbState['provider_employees.maybeSingle'] = () => ({
    data: { id: 'emp-e2e', provider_id: 'provider-uid', email: 'roundtrip@e.com' }, error: null
  });
  dbState['profiles.maybeSingle'] = () => ({ data: { role: 'provider' }, error: null });
  dbState['provider_background_check_accounts.maybeSingle'] = () => ({ data: null, error: null });
  dbState['employee_background_checks.insertSingle'] = () => ({ data: { id: 'bgc-e2e' }, error: null });

  // Stub BGC /orders/new
  global.fetch = async () => ({
    ok: true, status: 200,
    text: async () => JSON.stringify({
      applicants: [{ report_key: 'rk_e2e', applicant_invite_url: 'https://bgc/invite/e2e' }]
    })
  });
  const initiate = fresh('../functions/initiate-background-check.js');
  const initResp = await initiate.handler({
    httpMethod: 'POST',
    body: JSON.stringify({ employeeId: 'emp-e2e' }),
    headers: { authorization: 'Bearer good' }
  });
  assert.strictEqual(initResp.statusCode, 200, 'initiate body: ' + initResp.body);
  const initBody = JSON.parse(initResp.body);
  assert.strictEqual(initBody.reportId, 'rk_e2e');
  assert.strictEqual(initBody.mode, 'live_platform');

  // Now drive the webhook in for the same report_key. Stub the lookup so
  // the webhook finds our row and runs the full normalise path.
  dbState['employee_background_checks.maybeSingle'] = () => ({
    data: { id: 'bgc-e2e', employee_id: 'emp-e2e', provider_id: 'provider-uid', is_current: true },
    error: null
  });
  const webhook = fresh('../functions/background-check-webhook.js');
  // 1) Plain C → clear
  const bodyClear = JSON.stringify({ report_key: 'rk_e2e', status: 'C' });
  const sigClear = crypto.createHmac('sha256', 'test-webhook-secret').update(bodyClear).digest('hex');
  const respClear = await webhook.handler({
    httpMethod: 'POST', body: bodyClear, headers: { 'x-signature': sigClear }
  });
  assert.strictEqual(respClear.statusCode, 200, 'webhook clear body: ' + respClear.body);
  assert.strictEqual(webhook._normaliseStatus('C', false), 'clear');

  // 2) C + flag → consider (the human-review path)
  const bodyFlag = JSON.stringify({ report_key: 'rk_e2e', status: 'C', flagged_for_end_user_review: true });
  const sigFlag = crypto.createHmac('sha256', 'test-webhook-secret').update(bodyFlag).digest('hex');
  const respFlag = await webhook.handler({
    httpMethod: 'POST', body: bodyFlag, headers: { 'x-signature': sigFlag }
  });
  assert.strictEqual(respFlag.statusCode, 200);
  assert.strictEqual(webhook._normaliseStatus('C', true), 'consider');
});

// ── Test 5: bgc-admin auth ──────────────────────────────────────────────────
test('bgc-admin rejects without auth', async () => {
  const mod = fresh('../functions/bgc-admin.js');
  const resp = await mod.handler({ httpMethod: 'GET', headers: {} });
  assert.strictEqual(resp.statusCode, 401);
});

test('bgc-admin accepts x-admin-password', async () => {
  dbState = {}; // clear
  const mod = fresh('../functions/bgc-admin.js');
  const resp = await mod.handler({ httpMethod: 'GET', headers: { 'x-admin-password': 'test-admin-pw' } });
  assert.strictEqual(resp.statusCode, 200);
  const parsed = JSON.parse(resp.body);
  assert.ok(Array.isArray(parsed.providers));
  assert.strictEqual(typeof parsed.live_mode_global, 'boolean');
});

// ── Optional live-sandbox happy path ───────────────────────────────────────
// Per Task #372 spec, when real BGC sandbox creds are present we exercise
// the actual order → invite-URL round-trip against BGC and assert that
// (a) we get a 2xx with a report_key + applicant_invite_url, and (b) the
// payload we sent contained NO SSN/DOB. When creds are absent (the default
// in CI / dev) we skip cleanly with a one-line note.
//
// Opt in by setting all four:
//   BGC_LIVE_TEST=1
//   BGC_API_BASE=https://sandbox.backgroundchecks.com/api
//   BGC_API_TOKEN=<sandbox token>
//   BGC_LIVE_TEST_EMAIL=<applicant email>  (the address BGC will spam with the invite)
test('live sandbox happy path (skipped when creds missing)', async () => {
  if (process.env.BGC_LIVE_TEST !== '1' || !process.env.BGC_API_TOKEN || !process.env.BGC_LIVE_TEST_EMAIL) {
    console.log('     (skipped — set BGC_LIVE_TEST=1 + BGC_API_TOKEN + BGC_LIVE_TEST_EMAIL to run)');
    return;
  }
  // Restore real fetch (earlier tests stubbed it).
  delete global.fetch;
  const fetchFn = globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('global fetch not available — Node 18+ required for live test');
  }
  const base = process.env.BGC_API_BASE || 'https://sandbox.backgroundchecks.com/api';
  const url = `${base}/orders/new?api_token=${encodeURIComponent(process.env.BGC_API_TOKEN)}`;
  const sentBody = {
    report_sku: process.env.BGC_DEFAULT_REPORT_SKU || 'HIRE1',
    order_quantity: 1,
    applicant_emails: [process.env.BGC_LIVE_TEST_EMAIL],
    terms_agree: 'Y'
  };
  // Confirm payload has no PII before the call goes out.
  assert.ok(!('ssn' in sentBody) && !('dob' in sentBody), 'live test payload must contain no PII');
  const resp = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accepts': 'application/json' },
    body: JSON.stringify(sentBody)
  });
  const text = await resp.text();
  assert.ok(resp.ok, 'sandbox /orders/new should 2xx; got ' + resp.status + ' / ' + text);
  const parsed = JSON.parse(text);
  const applicant = (parsed.applicants || [])[0];
  assert.ok(applicant && applicant.report_key, 'sandbox should return a report_key');
  assert.ok(applicant.applicant_invite_url, 'sandbox should return an applicant_invite_url');
  console.log('     live report_key=' + applicant.report_key);
});

// ── Runner ─────────────────────────────────────────────────────────────────
(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      pass++;
    } catch (e) {
      console.log(`  ✗ ${name}\n      ${e.message}`);
      fail++;
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
})();

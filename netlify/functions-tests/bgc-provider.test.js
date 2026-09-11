// ============================================================================
// Tests for the provider-facing "Background Checks" tab backend, built
// 2026-09-11: bgc-provider-status.js, bgc-provider-report-url.js,
// bgc-provider-initiate.js.
//
// Context: www/providers.js and www/providers-settings.js have had a
// fully-built "Background Checks" tab (modal, dashboard card, team list,
// report viewer) that called a route family -- /api/bgcheck/* -- with no
// handler anywhere, for as long as this repo's history shows. Separately,
// providers-settings.js's initiate call *did* point at a live route,
// /api/provider/initiate-background-check, but that's Task #372's
// employee_background_checks system (a different, employee-only feature
// backing the public compliance badges in provider-bgc-compliance.js) --
// it required a provider_employees.id and 400'd on every provider-self
// check. These three files are the real backend for the "Background
// Checks" tab: they read/write provider_background_checks (confirmed with
// Jordan 2026-09-11: Checkr was retired for BackgroundChecks.com, operated
// by ClearChecks), which has always supported both subject_type='provider'
// (self) and subject_type='employee' (a team_members row).
//
// Stubs utils.createSupabaseClient the same way
// netlify/functions-tests/survey-endpoints.test.js does; a small
// chainable mock supports select/eq/order/insert + maybeSingle/single/await.
//
// Run with: node netlify/functions-tests/bgc-provider.test.js
// ============================================================================

'use strict';

const assert = require('assert');

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL ${name}`);
    console.log('       ' + String((err && err.stack) || err).split('\n').join('\n       '));
    failed++;
  }
}

process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';

const utils = require('../functions/utils');

// ---------------------------------------------------------------------------
// Chainable Supabase stub: .from(table) -> { select, eq, order, insert,
// maybeSingle, single, then } dispatching to a per-table impl keyed by
// terminal call (maybeSingle / single / list-via-await).
// ---------------------------------------------------------------------------
let supabaseImpl = null;
let authImpl = null;

function makeChain(table) {
  const ops = (supabaseImpl && supabaseImpl[table]) || {};
  const filters = {};
  let pendingOp = null;
  let pendingPayload = null;
  const chain = {
    select() { return chain; },
    eq(col, val) { filters[col] = val; return chain; },
    order() { return chain; },
    insert(rows) { pendingOp = 'insert'; pendingPayload = rows; return chain; },
    maybeSingle() {
      const fn = ops.maybeSingle;
      return Promise.resolve(fn ? fn(filters) : { data: null, error: null });
    },
    single() {
      const fn = ops.single;
      return Promise.resolve(fn ? fn(filters, pendingOp, pendingPayload) : { data: null, error: null });
    },
    then(resolve, reject) {
      const fn = ops.list;
      const result = fn ? fn(filters) : { data: [], error: null };
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return chain;
}

const supabaseStub = {
  from(table) { return makeChain(table); },
  auth: { getUser: async (token) => (authImpl ? authImpl(token) : { data: { user: null }, error: { message: 'no auth stub' } }) },
};

utils.createSupabaseClient = function () {
  return supabaseImpl === null ? null : supabaseStub;
};

function freshHandler(name) {
  const modPath = require.resolve('../functions/' + name);
  delete require.cache[modPath];
  return require(modPath).handler;
}

function authEvent(method, path, body, token) {
  const headers = {};
  if (token !== null) headers.authorization = 'Bearer ' + (token || 'tok-caller');
  return {
    httpMethod: method,
    path: path,
    headers: headers,
    body: body ? JSON.stringify(body) : undefined,
  };
}

const CALLER = { id: 'caller-1' };

function defaultAuth() {
  return async (token) => {
    if (token === 'tok-caller') return { data: { user: CALLER }, error: null };
    return { data: { user: null }, error: { message: 'invalid' } };
  };
}

// ===========================================================================
// bgc-provider-status.js
// ===========================================================================

async function testStatus() {
  console.log('bgc-provider-status');

  await check('happy path: splits rows into providerCheck vs employeeChecks', async () => {
    authImpl = defaultAuth();
    supabaseImpl = {
      profiles: { maybeSingle: () => ({ data: null, error: null }) },
      provider_background_checks: {
        list: () => ({
          data: [
            { id: 'r1', subject_type: 'provider', status: 'pending', created_at: '2026-09-10T00:00:00Z' },
            { id: 'r2', subject_type: 'employee', employee_id: 'tm-1', status: 'pending', created_at: '2026-09-09T00:00:00Z' },
          ],
          error: null,
        }),
      },
      provider_background_check_accounts: { maybeSingle: () => ({ data: null, error: null }) },
    };
    const handler = freshHandler('bgc-provider-status');
    const res = await handler(authEvent('GET', '/api/provider/bgc/status/caller-1'));
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.providerCheck.id, 'r1');
    assert.strictEqual(body.employeeChecks.length, 1);
    assert.strictEqual(body.employeeChecks[0].id, 'r2');
  });

  await check('team-member delegate (profiles.team_provider_id) can view their provider', async () => {
    authImpl = defaultAuth();
    supabaseImpl = {
      profiles: { maybeSingle: () => ({ data: { team_provider_id: 'owner-9' }, error: null }) },
      provider_background_checks: { list: () => ({ data: [], error: null }) },
      provider_background_check_accounts: { maybeSingle: () => ({ data: null, error: null }) },
    };
    const handler = freshHandler('bgc-provider-status');
    const res = await handler(authEvent('GET', '/api/provider/bgc/status/owner-9'));
    assert.strictEqual(res.statusCode, 200);
  });

  await check('requesting a different provider id than self/delegate returns 403', async () => {
    authImpl = defaultAuth();
    supabaseImpl = {
      profiles: { maybeSingle: () => ({ data: null, error: null }) },
      provider_background_checks: { list: () => ({ data: [], error: null }) },
    };
    const handler = freshHandler('bgc-provider-status');
    const res = await handler(authEvent('GET', '/api/provider/bgc/status/someone-else'));
    assert.strictEqual(res.statusCode, 403);
  });

  await check('no Authorization header returns 401', async () => {
    authImpl = defaultAuth();
    supabaseImpl = { provider_background_checks: { list: () => ({ data: [], error: null }) } };
    const handler = freshHandler('bgc-provider-status');
    const res = await handler(authEvent('GET', '/api/provider/bgc/status/caller-1', null, null));
    assert.strictEqual(res.statusCode, 401);
  });

  await check('apiConfigured true when a sub-account is enrolled (no platform token)', async () => {
    authImpl = defaultAuth();
    delete process.env.BGC_API_TOKEN;
    supabaseImpl = {
      profiles: { maybeSingle: () => ({ data: null, error: null }) },
      provider_background_checks: { list: () => ({ data: [], error: null }) },
      provider_background_check_accounts: { maybeSingle: () => ({ data: { bgchecks_account_id: 'acct_1' }, error: null }) },
    };
    const handler = freshHandler('bgc-provider-status');
    const res = await handler(authEvent('GET', '/api/provider/bgc/status/caller-1'));
    const body = JSON.parse(res.body);
    assert.strictEqual(body.apiConfigured, true);
  });
}

// ===========================================================================
// bgc-provider-report-url.js
// ===========================================================================

async function testReportUrl() {
  console.log('bgc-provider-report-url');
  const CHECK_ID = '11111111-1111-4111-8111-111111111111';

  await check('prefers report_widget_url over report_url', async () => {
    authImpl = defaultAuth();
    supabaseImpl = {
      profiles: { maybeSingle: () => ({ data: null, error: null }) },
      provider_background_checks: {
        maybeSingle: () => ({ data: { id: CHECK_ID, provider_id: 'caller-1', report_url: 'https://x/r', report_widget_url: 'https://x/widget' }, error: null }),
      },
    };
    const handler = freshHandler('bgc-provider-report-url');
    const res = await handler(authEvent('GET', '/api/provider/bgc/report-url/' + CHECK_ID));
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(JSON.parse(res.body).reportUrl, 'https://x/widget');
  });

  await check('mock-mode check (no report url yet) returns reportUrl: null', async () => {
    authImpl = defaultAuth();
    supabaseImpl = {
      profiles: { maybeSingle: () => ({ data: null, error: null }) },
      provider_background_checks: {
        maybeSingle: () => ({ data: { id: CHECK_ID, provider_id: 'caller-1', report_url: null, report_widget_url: null }, error: null }),
      },
    };
    const handler = freshHandler('bgc-provider-report-url');
    const res = await handler(authEvent('GET', '/api/provider/bgc/report-url/' + CHECK_ID));
    assert.strictEqual(JSON.parse(res.body).reportUrl, null);
  });

  await check('a check owned by a different provider returns 404', async () => {
    authImpl = defaultAuth();
    supabaseImpl = {
      profiles: { maybeSingle: () => ({ data: null, error: null }) },
      provider_background_checks: {
        maybeSingle: () => ({ data: { id: CHECK_ID, provider_id: 'someone-else', report_url: null, report_widget_url: null }, error: null }),
      },
    };
    const handler = freshHandler('bgc-provider-report-url');
    const res = await handler(authEvent('GET', '/api/provider/bgc/report-url/' + CHECK_ID));
    assert.strictEqual(res.statusCode, 404);
  });

  await check('invalid uuid in path returns 400', async () => {
    authImpl = defaultAuth();
    supabaseImpl = { provider_background_checks: {} };
    const handler = freshHandler('bgc-provider-report-url');
    const res = await handler(authEvent('GET', '/api/provider/bgc/report-url/not-a-uuid'));
    assert.strictEqual(res.statusCode, 400);
  });

  await check('no Authorization header returns 401', async () => {
    authImpl = defaultAuth();
    supabaseImpl = { provider_background_checks: {} };
    const handler = freshHandler('bgc-provider-report-url');
    const res = await handler(authEvent('GET', '/api/provider/bgc/report-url/' + CHECK_ID, null, null));
    assert.strictEqual(res.statusCode, 401);
  });
}

// ===========================================================================
// bgc-provider-initiate.js
// ===========================================================================

async function testInitiate() {
  console.log('bgc-provider-initiate');

  await check('mock mode, provider-self check: inserts subject_type=provider, mocked:true', async () => {
    delete process.env.BGC_LIVE_MODE;
    authImpl = defaultAuth();
    let insertedRow = null;
    supabaseImpl = {
      profiles: { maybeSingle: () => ({ data: null, error: null }) },
      provider_background_checks: {
        single: (filters, op, payload) => { insertedRow = payload; return { data: { id: 'chk-1', status: 'pending' }, error: null }; },
      },
    };
    const handler = freshHandler('bgc-provider-initiate');
    const res = await handler(authEvent('POST', '/api/provider/bgc/initiate', {
      providerId: 'caller-1', subjectType: 'provider', email: 'me@x.com', firstName: 'Jo', lastName: 'Rdan', state: 'FL',
    }));
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.mocked, true);
    assert.strictEqual(body.apiConfigured, false);
    assert.strictEqual(body.applicantUrl, null);
    assert.strictEqual(insertedRow.subject_type, 'provider');
    assert.strictEqual(insertedRow.employee_id, null);
    assert.strictEqual(insertedRow.provider_id, 'caller-1');
    assert.ok(String(insertedRow.external_order_id).startsWith('mock_'));
  });

  await check('mock mode, employee check: validates team_members ownership and inserts employee_id', async () => {
    delete process.env.BGC_LIVE_MODE;
    authImpl = defaultAuth();
    let insertedRow = null;
    supabaseImpl = {
      profiles: { maybeSingle: () => ({ data: null, error: null }) },
      team_members: { maybeSingle: () => ({ data: { id: 'tm-1', provider_id: 'caller-1' }, error: null }) },
      provider_background_checks: {
        single: (filters, op, payload) => { insertedRow = payload; return { data: { id: 'chk-2', status: 'pending' }, error: null }; },
      },
    };
    const handler = freshHandler('bgc-provider-initiate');
    const res = await handler(authEvent('POST', '/api/provider/bgc/initiate', {
      providerId: 'caller-1', subjectType: 'employee', employeeId: 'tm-1', email: 'em@x.com', firstName: 'Em', lastName: 'Ployee',
    }));
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(insertedRow.subject_type, 'employee');
    assert.strictEqual(insertedRow.employee_id, 'tm-1');
  });

  await check('employee check without employeeId returns 400', async () => {
    authImpl = defaultAuth();
    supabaseImpl = { profiles: { maybeSingle: () => ({ data: null, error: null }) } };
    const handler = freshHandler('bgc-provider-initiate');
    const res = await handler(authEvent('POST', '/api/provider/bgc/initiate', {
      subjectType: 'employee', email: 'em@x.com', firstName: 'Em', lastName: 'Ployee',
    }));
    assert.strictEqual(res.statusCode, 400);
  });

  await check('employeeId not owned by this provider returns 404', async () => {
    authImpl = defaultAuth();
    supabaseImpl = {
      profiles: { maybeSingle: () => ({ data: null, error: null }) },
      team_members: { maybeSingle: () => ({ data: null, error: null }) },
    };
    const handler = freshHandler('bgc-provider-initiate');
    const res = await handler(authEvent('POST', '/api/provider/bgc/initiate', {
      subjectType: 'employee', employeeId: 'not-mine', email: 'em@x.com', firstName: 'Em', lastName: 'Ployee',
    }));
    assert.strictEqual(res.statusCode, 404);
  });

  await check('providerId in body naming a different provider returns 403', async () => {
    authImpl = defaultAuth();
    supabaseImpl = { profiles: { maybeSingle: () => ({ data: null, error: null }) } };
    const handler = freshHandler('bgc-provider-initiate');
    const res = await handler(authEvent('POST', '/api/provider/bgc/initiate', {
      providerId: 'not-caller', email: 'me@x.com', firstName: 'Jo', lastName: 'Rdan',
    }));
    assert.strictEqual(res.statusCode, 403);
  });

  await check('missing email/firstName/lastName returns 400', async () => {
    authImpl = defaultAuth();
    supabaseImpl = { profiles: { maybeSingle: () => ({ data: null, error: null }) } };
    const handler = freshHandler('bgc-provider-initiate');
    const res = await handler(authEvent('POST', '/api/provider/bgc/initiate', { email: 'me@x.com' }));
    assert.strictEqual(res.statusCode, 400);
  });

  await check('no Authorization header returns 401', async () => {
    authImpl = defaultAuth();
    supabaseImpl = {};
    const handler = freshHandler('bgc-provider-initiate');
    const res = await handler(authEvent('POST', '/api/provider/bgc/initiate', { email: 'me@x.com' }, null));
    assert.strictEqual(res.statusCode, 401);
  });

  await check('live mode: orders a real report and returns applicantUrl + apiConfigured:true', async () => {
    process.env.BGC_LIVE_MODE = 'true';
    process.env.BGC_API_TOKEN = 'platform-token';
    authImpl = defaultAuth();
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      assert.ok(String(url).includes('/orders/new'));
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ applicants: [{ report_key: 'rk_123', applicant_invite_url: 'https://bgc.example/invite/rk_123' }] }),
      };
    };
    let insertedRow = null;
    supabaseImpl = {
      profiles: { maybeSingle: () => ({ data: null, error: null }) },
      provider_background_check_accounts: { maybeSingle: () => ({ data: null, error: null }) },
      provider_background_checks: {
        single: (filters, op, payload) => { insertedRow = payload; return { data: { id: 'chk-3', status: 'pending' }, error: null }; },
      },
    };
    try {
      const handler = freshHandler('bgc-provider-initiate');
      const res = await handler(authEvent('POST', '/api/provider/bgc/initiate', {
        providerId: 'caller-1', subjectType: 'provider', email: 'me@x.com', firstName: 'Jo', lastName: 'Rdan',
      }));
      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.mocked, false);
      assert.strictEqual(body.apiConfigured, true);
      assert.strictEqual(body.applicantUrl, 'https://bgc.example/invite/rk_123');
      assert.strictEqual(body.mode, 'live_platform');
      assert.strictEqual(insertedRow.external_order_id, 'rk_123');
    } finally {
      global.fetch = originalFetch;
      delete process.env.BGC_LIVE_MODE;
      delete process.env.BGC_API_TOKEN;
    }
  });
}

// ---------------------------------------------------------------------------

(async () => {
  await testStatus();
  await testReportUrl();
  await testInitiate();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();

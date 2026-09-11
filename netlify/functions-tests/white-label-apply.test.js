// ============================================================================
// Tests for white-label-apply.js -- the self-serve "apply for tenancy" flow
// (2026-09-11). Pure unit tests with in-memory Supabase + Stripe stubs.
//
// Run with: node netlify/functions-tests/white-label-apply.test.js
// ============================================================================

'use strict';

const assert = require('assert');
const path = require('path');
const Module = require('module');

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
process.env.STRIPE_SECRET_KEY = 'sk_stub';
process.env.URL = 'https://stub.mycarconcierge.com';

// ── stub the 'stripe' require (white-label-apply.js calls require('stripe')
// directly, same pattern as stripe-webhook-events.test.js) ─────────────────
const origLoad = Module._load;
let currentStripe = {};
Module._load = function(request, parent, ...rest) {
  if (request === 'stripe') return () => currentStripe;
  return origLoad.call(this, request, parent, ...rest);
};

const utils = require('../functions/utils');

// ── chainable Supabase stub, same shape as white-label-tenant.test.js's ────
let supabaseImpl = null;
let authImpl = null;

function makeChain(table) {
  const ops = (supabaseImpl && supabaseImpl[table]) || {};
  const filters = {};
  let selectOpts = null;
  let pendingOp = null;
  let pendingPayload = null;
  const chain = {
    select(cols, opts) { selectOpts = opts || null; return chain; },
    eq(col, val) { filters[col] = val; return chain; },
    neq(col, val) { filters['neq_' + col] = val; return chain; },
    order() { return chain; },
    limit() { return chain; },
    insert(rows) { pendingOp = 'insert'; pendingPayload = rows; return chain; },
    update(rows) { pendingOp = 'update'; pendingPayload = rows; return chain; },
    maybeSingle() {
      if (pendingOp === 'insert' && ops.insert) return Promise.resolve(ops.insert(filters, pendingPayload));
      if (pendingOp === 'update' && ops.update) return Promise.resolve(ops.update(filters, pendingPayload));
      const fn = ops.maybeSingle;
      return Promise.resolve(fn ? fn(filters) : { data: null, error: null });
    },
    single() {
      if (pendingOp === 'insert' && ops.insert) return Promise.resolve(ops.insert(filters, pendingPayload));
      if (pendingOp === 'update' && ops.update) return Promise.resolve(ops.update(filters, pendingPayload));
      const fn = ops.single;
      return Promise.resolve(fn ? fn(filters) : { data: null, error: null });
    },
    then(resolve, reject) {
      let result;
      if (pendingOp === 'insert' && ops.insert) result = ops.insert(filters, pendingPayload);
      else if (pendingOp === 'update' && ops.update) result = ops.update(filters, pendingPayload);
      else { const fn = ops.list; result = fn ? fn(filters) : { data: [], error: null }; }
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return chain;
}

const supabaseStub = {
  from(table) { return makeChain(table); },
  auth: { getUser: async (token) => (authImpl ? authImpl(token) : { data: { user: null }, error: { message: 'no auth stub' } }) },
};

utils.createSupabaseClient = function () { return supabaseImpl === null ? null : supabaseStub; };

function freshHandler() {
  const modPath = require.resolve('../functions/white-label-apply');
  delete require.cache[modPath];
  return require(modPath).handler;
}

function authEvent(method, body, token, extra) {
  extra = extra || {};
  const headers = Object.assign({}, extra.headers || {});
  if (token !== null && token !== undefined) headers.authorization = 'Bearer ' + token;
  return Object.assign({
    httpMethod: method,
    headers: headers,
    queryStringParameters: extra.query || null,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }, extra.rest || {});
}

function defaultAuth(user) {
  return async (token) => {
    if (token === 'tok-caller') return { data: { user: user || { id: 'caller-1', email: 'caller@test.com' } }, error: null };
    return { data: { user: null }, error: { message: 'invalid' } };
  };
}

function freshApplication(overrides) {
  return Object.assign({
    id: 'app-1',
    user_id: 'caller-1',
    business_name: 'Acme Co',
    subdomain: 'acme',
    plan: 'starter',
    billing: 'monthly',
    status: 'pending_payment',
  }, overrides || {});
}

async function testAll() {
  const handler = freshHandler();

  await check('OPTIONS -> 200 regardless of auth', async () => {
    const res = await handler({ httpMethod: 'OPTIONS', headers: {} });
    assert.strictEqual(res.statusCode, 200);
  });

  // ── GET check_subdomain ──────────────────────────────────────────────────
  await check('GET check_subdomain: available -> { available: true }', async () => {
    supabaseImpl = { white_label_tenants: { maybeSingle: () => ({ data: null, error: null }) } };
    authImpl = null;
    const res = await handler(authEvent('GET', undefined, null, { query: { check_subdomain: 'newbiz' } }));
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.available, true);
  });

  await check('GET check_subdomain: already taken -> { available: false }', async () => {
    supabaseImpl = { white_label_tenants: { maybeSingle: () => ({ data: { id: 'tenant-1' }, error: null }) } };
    const res = await handler(authEvent('GET', undefined, null, { query: { check_subdomain: 'acme' } }));
    const body = JSON.parse(res.body);
    assert.strictEqual(body.available, false);
    assert.ok(/already taken/i.test(body.reason));
  });

  await check('GET check_subdomain: invalid format -> { available: false }, no DB query', async () => {
    supabaseImpl = { white_label_tenants: { maybeSingle: () => { throw new Error('should not query DB for invalid input'); } } };
    const res = await handler(authEvent('GET', undefined, null, { query: { check_subdomain: 'Not Valid!' } }));
    const body = JSON.parse(res.body);
    assert.strictEqual(body.available, false);
  });

  await check('GET check_subdomain: reserved word -> { available: false, reason mentions reserved }', async () => {
    supabaseImpl = { white_label_tenants: {} };
    const res = await handler(authEvent('GET', undefined, null, { query: { check_subdomain: 'admin' } }));
    const body = JSON.parse(res.body);
    assert.strictEqual(body.available, false);
    assert.ok(/reserved/i.test(body.reason));
  });

  // ── GET application_id ───────────────────────────────────────────────────
  await check('GET application_id: no auth -> 401', async () => {
    supabaseImpl = {};
    authImpl = null;
    const res = await handler(authEvent('GET', undefined, null, { query: { application_id: 'app-1' } }));
    assert.strictEqual(res.statusCode, 401);
  });

  await check('GET application_id: owner can view their own application', async () => {
    supabaseImpl = { white_label_applications: { maybeSingle: () => ({ data: freshApplication(), error: null }) } };
    authImpl = defaultAuth({ id: 'caller-1' });
    const res = await handler(authEvent('GET', undefined, 'tok-caller', { query: { application_id: 'app-1' } }));
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.application.id, 'app-1');
  });

  await check('GET application_id: not found -> 404', async () => {
    supabaseImpl = { white_label_applications: { maybeSingle: () => ({ data: null, error: null }) } };
    authImpl = defaultAuth({ id: 'caller-1' });
    const res = await handler(authEvent('GET', undefined, 'tok-caller', { query: { application_id: 'nope' } }));
    assert.strictEqual(res.statusCode, 404);
  });

  await check('GET application_id: different non-admin caller -> 403', async () => {
    supabaseImpl = {
      white_label_applications: { maybeSingle: () => ({ data: freshApplication({ user_id: 'someone-else' }), error: null }) },
      profiles: { maybeSingle: () => ({ data: { role: 'member' }, error: null }) },
    };
    authImpl = defaultAuth({ id: 'caller-1' });
    const res = await handler(authEvent('GET', undefined, 'tok-caller', { query: { application_id: 'app-1' } }));
    assert.strictEqual(res.statusCode, 403);
  });

  await check('GET application_id: admin can view someone else\'s application', async () => {
    supabaseImpl = {
      white_label_applications: { maybeSingle: () => ({ data: freshApplication({ user_id: 'someone-else' }), error: null }) },
      profiles: { maybeSingle: () => ({ data: { role: 'admin' }, error: null }) },
    };
    authImpl = defaultAuth({ id: 'admin-1' });
    const res = await handler(authEvent('GET', undefined, 'tok-caller', { query: { application_id: 'app-1' } }));
    assert.strictEqual(res.statusCode, 200);
  });

  await check('GET with neither check_subdomain nor application_id -> 400', async () => {
    supabaseImpl = {};
    const res = await handler(authEvent('GET', undefined, null, { query: {} }));
    assert.strictEqual(res.statusCode, 400);
  });

  // ── POST (create application + Stripe checkout) ──────────────────────────
  await check('POST: no auth -> 401', async () => {
    supabaseImpl = {};
    authImpl = null;
    const res = await handler(authEvent('POST', { business_name: 'Acme', subdomain: 'acme', plan: 'starter' }, null));
    assert.strictEqual(res.statusCode, 401);
  });

  await check('POST: missing business_name -> 400', async () => {
    supabaseImpl = {};
    authImpl = defaultAuth();
    const res = await handler(authEvent('POST', { subdomain: 'acme', plan: 'starter' }, 'tok-caller'));
    assert.strictEqual(res.statusCode, 400);
  });

  await check('POST: invalid subdomain -> 400', async () => {
    supabaseImpl = {};
    authImpl = defaultAuth();
    const res = await handler(authEvent('POST', { business_name: 'Acme', subdomain: 'A!', plan: 'starter' }, 'tok-caller'));
    assert.strictEqual(res.statusCode, 400);
  });

  await check('POST: invalid plan -> 400', async () => {
    supabaseImpl = {};
    authImpl = defaultAuth();
    const res = await handler(authEvent('POST', { business_name: 'Acme', subdomain: 'acme', plan: 'ultra' }, 'tok-caller'));
    assert.strictEqual(res.statusCode, 400);
  });

  await check('POST: subdomain already taken by an existing tenant -> 409', async () => {
    supabaseImpl = { white_label_tenants: { maybeSingle: () => ({ data: { id: 'tenant-1' }, error: null }) } };
    authImpl = defaultAuth();
    const res = await handler(authEvent('POST', { business_name: 'Acme', subdomain: 'acme', plan: 'starter' }, 'tok-caller'));
    assert.strictEqual(res.statusCode, 409);
  });

  await check('POST: plan not found in saas_plans -> 404', async () => {
    supabaseImpl = {
      white_label_tenants: { maybeSingle: () => ({ data: null, error: null }) },
      saas_plans: { single: () => ({ data: null, error: null }) },
    };
    authImpl = defaultAuth();
    const res = await handler(authEvent('POST', { business_name: 'Acme', subdomain: 'freshbiz', plan: 'starter' }, 'tok-caller'));
    assert.strictEqual(res.statusCode, 404);
  });

  await check('POST: plan exists but has no stripe_price_id -> 400 (contact us)', async () => {
    supabaseImpl = {
      white_label_tenants: { maybeSingle: () => ({ data: null, error: null }) },
      saas_plans: { single: () => ({ data: { stripe_price_id: null, stripe_price_id_annual: null }, error: null }) },
    };
    authImpl = defaultAuth();
    const res = await handler(authEvent('POST', { business_name: 'Acme', subdomain: 'freshbiz', plan: 'starter' }, 'tok-caller'));
    assert.strictEqual(res.statusCode, 400);
  });

  await check('POST: happy path -- creates application, checkout session, returns url', async () => {
    let insertedApplication = null;
    let updatedSessionId = null;
    let checkoutArgs = null;
    supabaseImpl = {
      white_label_tenants: { maybeSingle: () => ({ data: null, error: null }) },
      saas_plans: { single: () => ({ data: { stripe_price_id: 'price_monthly_starter', stripe_price_id_annual: 'price_annual_starter' }, error: null }) },
      profiles: {
        single: () => ({ data: { stripe_customer_id: 'cus_existing', email: 'caller@test.com', full_name: 'Caller One' }, error: null }),
      },
      white_label_applications: {
        insert: (filters, payload) => { insertedApplication = payload; return { data: Object.assign({ id: 'app-new' }, payload), error: null }; },
        update: (filters, payload) => { updatedSessionId = payload.stripe_session_id; return { data: null, error: null }; },
      },
    };
    authImpl = defaultAuth();
    currentStripe = {
      checkout: { sessions: { create: async (args) => { checkoutArgs = args; return { id: 'cs_test_123', url: 'https://checkout.stripe.com/cs_test_123' }; } } },
      customers: { create: async () => ({ id: 'cus_new' }) },
    };
    const res = await handler(authEvent('POST', { business_name: 'Acme Co', subdomain: 'acme', support_email: 'help@acme.com', plan: 'starter', billing: 'monthly' }, 'tok-caller'));
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.url, 'https://checkout.stripe.com/cs_test_123');
    assert.strictEqual(body.application_id, 'app-new');
    assert.strictEqual(insertedApplication.status, 'pending_payment');
    assert.strictEqual(insertedApplication.subdomain, 'acme');
    assert.strictEqual(checkoutArgs.customer, 'cus_existing'); // reused existing stripe_customer_id, didn't create a new one
    assert.strictEqual(checkoutArgs.line_items[0].price, 'price_monthly_starter');
    assert.strictEqual(checkoutArgs.metadata.product, 'white_label');
    assert.strictEqual(checkoutArgs.metadata.application_id, 'app-new');
    assert.strictEqual(checkoutArgs.subscription_data.metadata.application_id, 'app-new');
    assert.strictEqual(updatedSessionId, 'cs_test_123');
  });

  await check('POST: annual billing selects the annual price id', async () => {
    let checkoutArgs = null;
    supabaseImpl = {
      white_label_tenants: { maybeSingle: () => ({ data: null, error: null }) },
      saas_plans: { single: () => ({ data: { stripe_price_id: 'price_monthly', stripe_price_id_annual: 'price_annual' }, error: null }) },
      profiles: { single: () => ({ data: { stripe_customer_id: 'cus_1' }, error: null }) },
      white_label_applications: {
        insert: (filters, payload) => ({ data: Object.assign({ id: 'app-annual' }, payload), error: null }),
        update: () => ({ data: null, error: null }),
      },
    };
    authImpl = defaultAuth();
    currentStripe = { checkout: { sessions: { create: async (args) => { checkoutArgs = args; return { id: 'cs_annual', url: 'https://checkout.stripe.com/cs_annual' }; } } }, customers: { create: async () => ({ id: 'cus_new' }) } };
    const res = await handler(authEvent('POST', { business_name: 'Acme', subdomain: 'annualbiz', plan: 'pro', billing: 'annual' }, 'tok-caller'));
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(checkoutArgs.line_items[0].price, 'price_annual');
  });

  await check('POST: Stripe session creation throws -> application marked failed, 500 returned', async () => {
    let failedUpdate = null;
    supabaseImpl = {
      white_label_tenants: { maybeSingle: () => ({ data: null, error: null }) },
      saas_plans: { single: () => ({ data: { stripe_price_id: 'price_x' }, error: null }) },
      profiles: { single: () => ({ data: { stripe_customer_id: 'cus_1' }, error: null }) },
      white_label_applications: {
        insert: (filters, payload) => ({ data: Object.assign({ id: 'app-fail' }, payload), error: null }),
        update: (filters, payload) => { failedUpdate = payload; return { data: null, error: null }; },
      },
    };
    authImpl = defaultAuth();
    currentStripe = { checkout: { sessions: { create: async () => { throw new Error('Stripe down'); } } }, customers: { create: async () => ({ id: 'cus_new' }) } };
    const res = await handler(authEvent('POST', { business_name: 'Acme', subdomain: 'failbiz', plan: 'starter' }, 'tok-caller'));
    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(failedUpdate.status, 'failed');
  });
}

(async () => {
  await testAll();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();

// ===========================================================================
// Tests for the tenant/white-label backend recovered from www/server.js git
// history (server.js's dev routes were removed and never ported to Netlify
// functions) -- 2026-09-11 broken-client-caller cleanup:
//
//   GET  /api/white-label/config          -- white-label-config.js
//   POST /api/white-label/tenant/join     -- white-label-join.js
//   GET    /api/tenant/me                 -- tenant-portal.js
//   GET    /api/tenant/roster             -- tenant-portal.js
//   DELETE /api/tenant/roster/:userId     -- tenant-portal.js
//   GET    /api/tenant/analytics          -- tenant-portal.js
//   GET/POST /api/tenant/loyalty-config   -- tenant-portal.js
//   GET/POST /api/tenant/approval-workflow -- tenant-portal.js
//
// Stubs utils.createSupabaseClient with a chainable mock supporting
// select/eq/neq/in/is/order/limit/insert/update/delete + maybeSingle/
// single/await (list or count, depending on select() opts).
//
// Run with: node netlify/functions-tests/white-label-tenant.test.js
// ===========================================================================

'use strict';

const assert = require('assert');
const crypto = require('node:crypto');

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
process.env.ADMIN_PASSWORD = 'test-admin-secret';

const utils = require('../functions/utils');

// ---------------------------------------------------------------------------
// Chainable Supabase stub, extended from misc-broken-routes.test.js's version
// with in()/is()/delete() and count-vs-list dispatch (select(cols, opts) with
// opts.count routes a bare await to ops.count(filters) instead of ops.list).
// insert()/update() followed by .single()/.maybeSingle() (not just a bare
// await) also correctly dispatch to ops.insert/ops.update.
// ---------------------------------------------------------------------------
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
    in(col, vals) { filters['in_' + col] = vals; return chain; },
    is(col, val) { filters['is_' + col] = val; return chain; },
    order() { return chain; },
    limit() { return chain; },
    insert(rows) { pendingOp = 'insert'; pendingPayload = rows; return chain; },
    update(rows) { pendingOp = 'update'; pendingPayload = rows; return chain; },
    delete() { pendingOp = 'delete'; return chain; },
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
      if (pendingOp === 'insert' && ops.insert) {
        result = ops.insert(filters, pendingPayload);
      } else if (pendingOp === 'update' && ops.update) {
        result = ops.update(filters, pendingPayload);
      } else if (pendingOp === 'delete' && ops.delete) {
        result = ops.delete(filters);
      } else if (selectOpts && selectOpts.count && ops.count) {
        result = ops.count(filters);
      } else {
        const fn = ops.list;
        result = fn ? fn(filters) : { data: [], error: null };
      }
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

function authEvent(method, body, token, extra) {
  extra = extra || {};
  const headers = Object.assign({}, extra.headers || {});
  if (token !== null) headers.authorization = 'Bearer ' + (token || 'tok-caller');
  return Object.assign({
    httpMethod: method,
    path: extra.path,
    headers: headers,
    queryStringParameters: extra.query || null,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function defaultAuth(user) {
  return async (token) => {
    if (token === 'tok-caller') return { data: { user: user || { id: 'caller-1' } }, error: null };
    return { data: { user: null }, error: { message: 'invalid' } };
  };
}

// ===========================================================================
// white-label-config.js
// ===========================================================================
async function testWhiteLabelConfig() {
  const handler = freshHandler('white-label-config');

  await check('white-label/config: no matching host -> tenant null, is_white_label false', async () => {
    supabaseImpl = {
      white_label_tenants: { maybeSingle: () => ({ data: null, error: null }) },
    };
    authImpl = null;
    const res = await handler({ httpMethod: 'GET', headers: { host: 'app.mycarconcierge.com' }, queryStringParameters: null });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.tenant, null);
    assert.strictEqual(body.is_white_label, false);
  });

  await check('white-label/config: resolves via MCC subdomain', async () => {
    supabaseImpl = {
      white_label_tenants: {
        maybeSingle: (filters) => {
          assert.strictEqual(filters.subdomain, 'acme');
          return { data: { id: 'tenant-1', brand_name: 'Acme Co', plan: 'pro' }, error: null };
        },
      },
    };
    const res = await handler({ httpMethod: 'GET', headers: { 'x-forwarded-host': 'acme.mycarconcierge.com' }, queryStringParameters: null });
    const body = JSON.parse(res.body);
    assert.strictEqual(body.is_white_label, true);
    assert.strictEqual(body.tenant.id, 'tenant-1');
    assert.strictEqual(res.headers['Cache-Control'], 'public, max-age=60');
  });

  await check('white-label/config: resolves via custom domain', async () => {
    supabaseImpl = {
      white_label_tenants: {
        maybeSingle: (filters) => {
          assert.strictEqual(filters.domain, 'service.acmecars.com');
          return { data: { id: 'tenant-2', brand_name: 'Acme Cars' }, error: null };
        },
      },
    };
    const res = await handler({ httpMethod: 'GET', headers: { host: 'service.acmecars.com' }, queryStringParameters: null });
    const body = JSON.parse(res.body);
    assert.strictEqual(body.tenant.id, 'tenant-2');
  });

  await check('white-label/config: www and bare mycarconcierge.com never resolve a subdomain tenant', async () => {
    supabaseImpl = { white_label_tenants: { maybeSingle: () => { throw new Error('should not query'); } } };
    const res = await handler({ httpMethod: 'GET', headers: { host: 'www.mycarconcierge.com' }, queryStringParameters: null });
    const body = JSON.parse(res.body);
    assert.strictEqual(body.tenant, null);
  });

  await check('white-label/config: preview_domain without x-admin-token -> 401', async () => {
    supabaseImpl = { white_label_tenants: {} };
    const res = await handler({ httpMethod: 'GET', headers: {}, queryStringParameters: { preview_domain: 'acmecars.com' } });
    assert.strictEqual(res.statusCode, 401);
  });

  await check('white-label/config: preview_domain with correct x-admin-token succeeds, no-store', async () => {
    supabaseImpl = {
      white_label_tenants: { maybeSingle: () => ({ data: { id: 'tenant-3' }, error: null }) },
    };
    const res = await handler({ httpMethod: 'GET', headers: { 'x-admin-token': 'test-admin-secret' }, queryStringParameters: { preview_domain: 'acmecars.com' } });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['Cache-Control'], 'no-store');
  });

  await check('white-label/config: authenticated caller on resolved tenant mints domain_join_token', async () => {
    supabaseImpl = {
      white_label_tenants: { maybeSingle: () => ({ data: { id: 'tenant-4' }, error: null }) },
    };
    authImpl = defaultAuth({ id: 'user-9' });
    const res = await handler({ httpMethod: 'GET', headers: { host: 'service.acmecars.com', authorization: 'Bearer tok-caller' }, queryStringParameters: null });
    const body = JSON.parse(res.body);
    assert.ok(body.domain_join_token, 'expected a domain_join_token');
    const decoded = JSON.parse(Buffer.from(body.domain_join_token, 'base64url').toString('utf8'));
    assert.strictEqual(decoded.tenant_id, 'tenant-4');
    assert.strictEqual(decoded.user_id, 'user-9');
    assert.strictEqual(res.headers['Cache-Control'], 'no-store');
  });

  await check('white-label/config: DB error never 5xx -- falls back to tenant null', async () => {
    supabaseImpl = { white_label_tenants: { maybeSingle: () => { throw new Error('db down'); } } };
    const res = await handler({ httpMethod: 'GET', headers: { host: 'service.acmecars.com' }, queryStringParameters: null });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.tenant, null);
  });

  await check('white-label/config: POST -> 405', async () => {
    const res = await handler({ httpMethod: 'POST', headers: {} });
    assert.strictEqual(res.statusCode, 405);
  });
}

// ===========================================================================
// white-label-join.js
// ===========================================================================
async function testWhiteLabelJoin() {
  // NOTE: white-label-join.js keeps its join-rate-limit bucket as module-level
  // state (joinRateBuckets), so every test below gets its OWN fresh handler
  // (freshHandler clears the require cache, re-running the module top-level
  // and creating a new empty Map) -- otherwise tests would silently share a
  // rate-limit counter and later tests would flake into 429s. The one
  // exception is the "rate limited" test itself, which deliberately reuses a
  // single handler across its loop of repeated calls.

  function mintDomainToken(tenantId, userId, expOffsetMs) {
    const exp = Date.now() + (expOffsetMs === undefined ? 10 * 60 * 1000 : expOffsetMs);
    const sig = crypto.createHmac('sha256', 'test-admin-secret').update(tenantId + ':' + userId + ':' + exp).digest('hex');
    return Buffer.from(JSON.stringify({ tenant_id: tenantId, user_id: userId, exp, sig })).toString('base64url');
  }

  function mintInviteToken(tenantId, joinTokenSecret, expiresOffsetMs) {
    const expires_at = Date.now() + (expiresOffsetMs === undefined ? 60 * 60 * 1000 : expiresOffsetMs);
    const sig = crypto.createHmac('sha256', joinTokenSecret).update(tenantId + ':' + expires_at).digest('hex');
    return Buffer.from(JSON.stringify({ tenant_id: tenantId, expires_at, sig })).toString('base64url');
  }

  await check('join: no auth -> 401', async () => {
    const handler = freshHandler('white-label-join');
    const res = await handler(authEvent('POST', {}, null));
    assert.strictEqual(res.statusCode, 401);
  });

  await check('join: no token identifying tenant -> 400', async () => {
    const handler = freshHandler('white-label-join');
    supabaseImpl = {};
    authImpl = defaultAuth();
    const res = await handler(authEvent('POST', {}, 'tok-caller'));
    assert.strictEqual(res.statusCode, 400);
  });

  await check('join: valid domain_join_token, new member -> inserts with server-derived role, ignores client role', async () => {
    const handler = freshHandler('white-label-join');
    const token = mintDomainToken('tenant-1', 'caller-1');
    supabaseImpl = {
      white_label_tenants: { maybeSingle: () => ({ data: { id: 'tenant-1', max_members: 500, max_providers: 50 }, error: null }) },
      profiles: { maybeSingle: () => ({ data: { role: 'member' }, error: null }) },
      white_label_tenant_users: {
        count: () => ({ count: 3, error: null }),
        maybeSingle: () => ({ data: null, error: null }), // no existing membership
        insert: (filters, payload) => {
          assert.strictEqual(payload.role, 'member'); // client never sent a role, and couldn't have overridden it
          return { data: Object.assign({ id: 'membership-1' }, payload), error: null };
        },
      },
    };
    authImpl = defaultAuth({ id: 'caller-1' });
    const res = await handler(authEvent('POST', { domain_join_token: token, role: 'owner' }, 'tok-caller'));
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.membership.role, 'member');
  });

  await check('join: provider profile role -> server-derives provider role', async () => {
    const handler = freshHandler('white-label-join');
    const token = mintDomainToken('tenant-1', 'caller-1');
    supabaseImpl = {
      white_label_tenants: { maybeSingle: () => ({ data: { id: 'tenant-1', max_members: 500, max_providers: 50 }, error: null }) },
      profiles: { maybeSingle: () => ({ data: { role: 'pending_provider' }, error: null }) },
      white_label_tenant_users: {
        count: () => ({ count: 0, error: null }),
        maybeSingle: () => ({ data: null, error: null }),
        insert: (filters, payload) => ({ data: Object.assign({ id: 'membership-2' }, payload), error: null }),
      },
    };
    authImpl = defaultAuth({ id: 'caller-1' });
    const res = await handler(authEvent('POST', { domain_join_token: token }, 'tok-caller'));
    const body = JSON.parse(res.body);
    assert.strictEqual(body.membership.role, 'provider');
  });

  await check('join: domain_join_token for a different user_id -> 400', async () => {
    const handler = freshHandler('white-label-join');
    const token = mintDomainToken('tenant-1', 'someone-else');
    supabaseImpl = {};
    authImpl = defaultAuth({ id: 'caller-1' });
    const res = await handler(authEvent('POST', { domain_join_token: token }, 'tok-caller'));
    assert.strictEqual(res.statusCode, 400);
  });

  await check('join: expired domain_join_token -> 400', async () => {
    const handler = freshHandler('white-label-join');
    const token = mintDomainToken('tenant-1', 'caller-1', -1000);
    supabaseImpl = {};
    authImpl = defaultAuth({ id: 'caller-1' });
    const res = await handler(authEvent('POST', { domain_join_token: token }, 'tok-caller'));
    assert.strictEqual(res.statusCode, 400);
  });

  await check('join: seat limit reached -> 402', async () => {
    const handler = freshHandler('white-label-join');
    const token = mintDomainToken('tenant-1', 'caller-1');
    supabaseImpl = {
      white_label_tenants: { maybeSingle: () => ({ data: { id: 'tenant-1', max_members: 2, max_providers: 50 }, error: null }) },
      profiles: { maybeSingle: () => ({ data: { role: 'member' }, error: null }) },
      white_label_tenant_users: { count: () => ({ count: 2, error: null }) },
    };
    authImpl = defaultAuth({ id: 'caller-1' });
    const res = await handler(authEvent('POST', { domain_join_token: token }, 'tok-caller'));
    assert.strictEqual(res.statusCode, 402);
  });

  await check('join: unlimited seats (-1) skips the seat count check entirely', async () => {
    const handler = freshHandler('white-label-join');
    const token = mintDomainToken('tenant-1', 'caller-1');
    let countCalled = false;
    supabaseImpl = {
      white_label_tenants: { maybeSingle: () => ({ data: { id: 'tenant-1', max_members: -1, max_providers: -1 }, error: null }) },
      profiles: { maybeSingle: () => ({ data: { role: 'member' }, error: null }) },
      white_label_tenant_users: {
        count: () => { countCalled = true; return { count: 999, error: null }; },
        maybeSingle: () => ({ data: null, error: null }),
        insert: (filters, payload) => ({ data: Object.assign({ id: 'm' }, payload), error: null }),
      },
    };
    authImpl = defaultAuth({ id: 'caller-1' });
    const res = await handler(authEvent('POST', { domain_join_token: token }, 'tok-caller'));
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(countCalled, false);
  });

  await check('join: already a member -> short-circuits with already_member true, never downgrades role', async () => {
    const handler = freshHandler('white-label-join');
    const token = mintDomainToken('tenant-1', 'caller-1');
    supabaseImpl = {
      white_label_tenants: { maybeSingle: () => ({ data: { id: 'tenant-1', max_members: 500, max_providers: 50 }, error: null }) },
      profiles: { maybeSingle: () => ({ data: { role: 'member' }, error: null }) },
      white_label_tenant_users: {
        count: () => ({ count: 1, error: null }),
        maybeSingle: () => ({ data: { id: 'existing-membership', role: 'admin' }, error: null }),
        insert: () => { throw new Error('should not insert when already a member'); },
      },
    };
    authImpl = defaultAuth({ id: 'caller-1' });
    const res = await handler(authEvent('POST', { domain_join_token: token }, 'tok-caller'));
    const body = JSON.parse(res.body);
    assert.strictEqual(body.already_member, true);
    assert.strictEqual(body.membership.role, 'admin');
  });

  await check('join: valid invite_token signed with tenant.join_token succeeds', async () => {
    const handler = freshHandler('white-label-join');
    const inviteToken = mintInviteToken('tenant-5', 'tenants-own-join-secret');
    supabaseImpl = {
      white_label_tenants: { maybeSingle: () => ({ data: { id: 'tenant-5', join_token: 'tenants-own-join-secret', max_members: 500, max_providers: 50 }, error: null }) },
      profiles: { maybeSingle: () => ({ data: { role: 'member' }, error: null }) },
      white_label_tenant_users: {
        count: () => ({ count: 0, error: null }),
        maybeSingle: () => ({ data: null, error: null }),
        insert: (filters, payload) => ({ data: Object.assign({ id: 'm' }, payload), error: null }),
      },
    };
    authImpl = defaultAuth({ id: 'caller-1' });
    const res = await handler(authEvent('POST', { invite_token: inviteToken }, 'tok-caller'));
    assert.strictEqual(res.statusCode, 200);
  });

  await check('join: invite_token signed with the wrong secret -> 400', async () => {
    const handler = freshHandler('white-label-join');
    const inviteToken = mintInviteToken('tenant-5', 'wrong-secret');
    supabaseImpl = {
      white_label_tenants: { maybeSingle: () => ({ data: { id: 'tenant-5', join_token: 'tenants-own-join-secret' }, error: null }) },
    };
    authImpl = defaultAuth({ id: 'caller-1' });
    const res = await handler(authEvent('POST', { invite_token: inviteToken }, 'tok-caller'));
    assert.strictEqual(res.statusCode, 400);
  });

  await check('join: admin fallback (tenant_id + x-admin-token) works without any token', async () => {
    const handler = freshHandler('white-label-join');
    supabaseImpl = {
      white_label_tenants: { maybeSingle: () => ({ data: { id: 'tenant-9', max_members: 500, max_providers: 50 }, error: null }) },
      profiles: { maybeSingle: () => ({ data: { role: 'member' }, error: null }) },
      white_label_tenant_users: {
        count: () => ({ count: 0, error: null }),
        maybeSingle: () => ({ data: null, error: null }),
        insert: (filters, payload) => ({ data: Object.assign({ id: 'm' }, payload), error: null }),
      },
    };
    authImpl = defaultAuth({ id: 'caller-1' });
    const res = await handler(authEvent('POST', { tenant_id: 'tenant-9' }, 'tok-caller', { headers: { 'x-admin-token': 'test-admin-secret' } }));
    assert.strictEqual(res.statusCode, 200);
  });

  await check('join: rate limited after 10 attempts in an hour -> 429', async () => {
    const handler = freshHandler('white-label-join'); // one handler reused deliberately -- this test needs the shared rate-limit Map
    const token = mintDomainToken('tenant-1', 'rate-user');
    supabaseImpl = {
      white_label_tenants: { maybeSingle: () => ({ data: { id: 'tenant-1', max_members: 500, max_providers: 50 }, error: null }) },
      profiles: { maybeSingle: () => ({ data: { role: 'member' }, error: null }) },
      white_label_tenant_users: {
        count: () => ({ count: 0, error: null }),
        maybeSingle: () => ({ data: { id: 'already', role: 'member' }, error: null }),
      },
    };
    authImpl = async (t) => (t === 'tok-rate' ? { data: { user: { id: 'rate-user' } }, error: null } : { data: { user: null }, error: { message: 'invalid' } });
    let lastStatus;
    for (let i = 0; i < 11; i++) {
      const res = await handler(authEvent('POST', { domain_join_token: mintDomainToken('tenant-1', 'rate-user') }, 'tok-rate'));
      lastStatus = res.statusCode;
    }
    assert.strictEqual(lastStatus, 429);
  });

  await check('join: GET -> 405', async () => {
    const handler = freshHandler('white-label-join');
    const res = await handler({ httpMethod: 'GET', headers: {} });
    assert.strictEqual(res.statusCode, 405);
  });
}

// ===========================================================================
// tenant-portal.js
// ===========================================================================
async function testTenantPortal() {
  const handler = freshHandler('tenant-portal');

  function membershipStub(tenantId, role) {
    return {
      list: () => ({ data: tenantId ? [{ tenant_id: tenantId, role: role || 'owner' }] : [], error: null }),
    };
  }

  await check('tenant-portal: no auth -> 401', async () => {
    const res = await handler({ httpMethod: 'GET', path: '/api/tenant/me', headers: {} });
    assert.strictEqual(res.statusCode, 401);
  });

  await check('tenant-portal: unknown path -> 404', async () => {
    supabaseImpl = { white_label_tenant_users: membershipStub(null) };
    authImpl = defaultAuth();
    const res = await handler(authEvent('GET', undefined, 'tok-caller', { path: '/api/tenant/nonsense' }));
    assert.strictEqual(res.statusCode, 404);
  });

  await check('/me: no tenant for user -> 404', async () => {
    supabaseImpl = {
      white_label_tenant_users: membershipStub(null),
      white_label_tenants: { maybeSingle: () => ({ data: null, error: null }) },
    };
    authImpl = defaultAuth();
    const res = await handler(authEvent('GET', undefined, 'tok-caller', { path: '/api/tenant/me' }));
    assert.strictEqual(res.statusCode, 404);
  });

  await check('/me: happy path returns tenant, usage, plan_features, user_role', async () => {
    supabaseImpl = {
      white_label_tenant_users: {
        list: (filters) => (filters.in_role ? { data: [{ tenant_id: 'tenant-1', role: 'owner' }], error: null } : { count: 0, error: null }),
        count: () => ({ count: 4, error: null }),
      },
      white_label_tenants: {
        single: () => ({ data: { id: 'tenant-1', plan: 'pro', max_members: 500, max_providers: 50 }, error: null }),
      },
    };
    authImpl = defaultAuth({ id: 'owner-1' });
    const res = await handler(authEvent('GET', undefined, 'tok-caller', { path: '/api/tenant/me' }));
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.tenant.id, 'tenant-1');
    assert.strictEqual(body.usage.members.current, 4);
    assert.strictEqual(body.plan_features.analytics, true); // pro tier
    assert.strictEqual(body.user_role, 'owner');
  });

  await check('/me: falls back to owner_user_id when no membership row exists', async () => {
    supabaseImpl = {
      white_label_tenant_users: {
        list: () => ({ data: [], error: null }),
        count: () => ({ count: 0, error: null }),
      },
      white_label_tenants: {
        maybeSingle: () => ({ data: { id: 'tenant-legacy' }, error: null }),
        single: () => ({ data: { id: 'tenant-legacy', plan: 'starter', max_members: 500, max_providers: 50 }, error: null }),
      },
    };
    authImpl = defaultAuth({ id: 'legacy-owner' });
    const res = await handler(authEvent('GET', undefined, 'tok-caller', { path: '/api/tenant/me' }));
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.tenant.id, 'tenant-legacy');
    assert.strictEqual(body.user_role, 'owner');
  });

  await check('/roster: lists roster enriched with profile display names', async () => {
    supabaseImpl = {
      white_label_tenant_users: {
        list: (filters) => (filters.in_role
          ? { data: [{ tenant_id: 'tenant-1', role: 'owner' }], error: null }
          : { data: [{ id: 'r1', user_id: 'u1', role: 'member', joined_at: '2026-01-01' }], error: null }),
      },
      profiles: { list: () => ({ data: [{ id: 'u1', full_name: 'Jane Doe', email: 'jane@example.com' }], error: null }) },
    };
    authImpl = defaultAuth({ id: 'owner-1' });
    const res = await handler(authEvent('GET', undefined, 'tok-caller', { path: '/api/tenant/roster' }));
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.roster.length, 1);
    assert.strictEqual(body.roster[0].display_name, 'Jane Doe');
  });

  await check('/roster: non-admin caller -> 403', async () => {
    supabaseImpl = {
      white_label_tenant_users: { list: () => ({ data: [], error: null }) },
      white_label_tenants: { maybeSingle: () => ({ data: null, error: null }) },
    };
    authImpl = defaultAuth({ id: 'nobody' });
    const res = await handler(authEvent('GET', undefined, 'tok-caller', { path: '/api/tenant/roster' }));
    assert.strictEqual(res.statusCode, 403);
  });

  await check('DELETE /roster/:userId: owner cannot remove self -> 400', async () => {
    supabaseImpl = {
      white_label_tenant_users: { list: () => ({ data: [{ tenant_id: 'tenant-1', role: 'owner' }], error: null }) },
    };
    authImpl = defaultAuth({ id: 'owner-1' });
    const res = await handler(authEvent('DELETE', undefined, 'tok-caller', { path: '/api/tenant/roster/owner-1' }));
    assert.strictEqual(res.statusCode, 400);
  });

  await check('DELETE /roster/:userId: admin cannot remove another admin -> 403', async () => {
    supabaseImpl = {
      white_label_tenant_users: {
        list: () => ({ data: [{ tenant_id: 'tenant-1', role: 'admin' }], error: null }),
        maybeSingle: () => ({ data: { role: 'admin' }, error: null }),
      },
    };
    authImpl = defaultAuth({ id: 'admin-1' });
    const res = await handler(authEvent('DELETE', undefined, 'tok-caller', { path: '/api/tenant/roster/target-admin' }));
    assert.strictEqual(res.statusCode, 403);
  });

  await check('DELETE /roster/:userId: owner removes a member, nulls profiles.tenant_id when their last tenant', async () => {
    let profileNulled = false;
    supabaseImpl = {
      white_label_tenant_users: {
        list: (filters) => (filters.in_role ? { data: [{ tenant_id: 'tenant-1', role: 'owner' }], error: null } : { data: null, error: null }),
        // Distinguish the two maybeSingle() lookups in handleRosterDelete by
        // their filters: the target-role check filters on tenant_id+user_id,
        // while the "any remaining tenant?" check filters on user_id alone.
        maybeSingle: (filters) => (filters.tenant_id !== undefined ? { data: { role: 'member' }, error: null } : { data: null, error: null }),
        delete: () => ({ error: null }),
      },
      profiles: {
        update: (filters, payload) => { profileNulled = payload.tenant_id === null; return { error: null }; },
      },
    };
    authImpl = defaultAuth({ id: 'owner-1' });
    const res = await handler(authEvent('DELETE', undefined, 'tok-caller', { path: '/api/tenant/roster/target-member' }));
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(profileNulled, true);
  });

  await check('/analytics: schema-gap fields zeroed, active_providers real', async () => {
    supabaseImpl = {
      white_label_tenant_users: {
        list: () => ({ data: [{ tenant_id: 'tenant-1', role: 'owner' }], error: null }),
        count: () => ({ count: 7, error: null }),
      },
    };
    authImpl = defaultAuth({ id: 'owner-1' });
    const res = await handler(authEvent('GET', undefined, 'tok-caller', { path: '/api/tenant/analytics' }));
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.metrics.total_service_requests, 0);
    assert.strictEqual(body.metrics.total_bids, 0);
    assert.strictEqual(body.metrics.total_page_views, 0);
    assert.strictEqual(body.metrics.active_providers, 7);
  });

  await check('/loyalty-config GET: returns defaults when unset', async () => {
    supabaseImpl = {
      white_label_tenant_users: { list: () => ({ data: [{ tenant_id: 'tenant-1', role: 'owner' }], error: null }) },
      white_label_tenants: { maybeSingle: () => ({ data: { features: {} }, error: null }) },
    };
    authImpl = defaultAuth({ id: 'owner-1' });
    const res = await handler(authEvent('GET', undefined, 'tok-caller', { path: '/api/tenant/loyalty-config' }));
    const body = JSON.parse(res.body);
    assert.strictEqual(body.loyalty_program.enabled, false);
    assert.strictEqual(body.loyalty_program.punch_card_goal, 10);
  });

  await check('/loyalty-config POST: merges into features, preserves other keys', async () => {
    let savedFeatures = null;
    supabaseImpl = {
      white_label_tenant_users: { list: () => ({ data: [{ tenant_id: 'tenant-1', role: 'owner' }], error: null }) },
      white_label_tenants: {
        maybeSingle: () => ({ data: { features: { approval_workflow: { require_provider_approval: true } } }, error: null }),
        update: (filters, payload) => { savedFeatures = payload.features; return { error: null }; },
      },
    };
    authImpl = defaultAuth({ id: 'owner-1' });
    const res = await handler(authEvent('POST', { enabled: true, punch_card_goal: 5, reward_description: 'Free wash' }, 'tok-caller', { path: '/api/tenant/loyalty-config' }));
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(savedFeatures.loyalty_program.enabled, true);
    assert.strictEqual(savedFeatures.loyalty_program.punch_card_goal, 5);
    assert.strictEqual(savedFeatures.approval_workflow.require_provider_approval, true); // preserved
  });

  await check('/loyalty-config: tenant owner WITHOUT a membership row can still manage it (consistency fix)', async () => {
    supabaseImpl = {
      white_label_tenant_users: { list: () => ({ data: [], error: null }) },
      white_label_tenants: {
        maybeSingle: (filters) => (filters.owner_user_id
          ? { data: { id: 'tenant-legacy' }, error: null }
          : { data: { features: {} }, error: null }),
      },
    };
    authImpl = defaultAuth({ id: 'legacy-owner' });
    const res = await handler(authEvent('GET', undefined, 'tok-caller', { path: '/api/tenant/loyalty-config' }));
    assert.strictEqual(res.statusCode, 200);
  });

  await check('/approval-workflow GET: returns defaults when unset', async () => {
    supabaseImpl = {
      white_label_tenant_users: { list: () => ({ data: [{ tenant_id: 'tenant-1', role: 'owner' }], error: null }) },
      white_label_tenants: { maybeSingle: () => ({ data: { features: {} }, error: null }) },
    };
    authImpl = defaultAuth({ id: 'owner-1' });
    const res = await handler(authEvent('GET', undefined, 'tok-caller', { path: '/api/tenant/approval-workflow' }));
    const body = JSON.parse(res.body);
    assert.strictEqual(body.approval_workflow.auto_approve_verified, true);
  });

  await check('/approval-workflow POST: saves settings', async () => {
    let saved = null;
    supabaseImpl = {
      white_label_tenant_users: { list: () => ({ data: [{ tenant_id: 'tenant-1', role: 'owner' }], error: null }) },
      white_label_tenants: {
        maybeSingle: () => ({ data: { features: {} }, error: null }),
        update: (filters, payload) => { saved = payload.features.approval_workflow; return { error: null }; },
      },
    };
    authImpl = defaultAuth({ id: 'owner-1' });
    const res = await handler(authEvent('POST', { require_provider_approval: true, require_member_approval: true, auto_approve_verified: false }, 'tok-caller', { path: '/api/tenant/approval-workflow' }));
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(saved.require_provider_approval, true);
    assert.strictEqual(saved.auto_approve_verified, false);
  });

  await check('OPTIONS -> optionsResponse regardless of auth', async () => {
    const res = await handler({ httpMethod: 'OPTIONS', headers: {} });
    assert.strictEqual(res.statusCode, 200);
  });
}

(async () => {
  await testWhiteLabelConfig();
  await testWhiteLabelJoin();
  await testTenantPortal();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();

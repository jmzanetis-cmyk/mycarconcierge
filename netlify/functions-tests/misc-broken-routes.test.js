// ===========================================================================
// Tests for 3 of the "genuinely broken" /api/* routes recovered from
// www/server.js git history (server.js's dev route was removed and never
// ported to a Netlify function) -- 2026-09-11 broken-client-caller cleanup:
//
//   GET  /api/founder/campaign-stats     -- founder-campaign-stats.js
//   POST /api/provider/profile/publish   -- provider-profile-publish.js
//   POST /api/shop/book                  -- shop-book.js
//
// Stubs utils.createSupabaseClient the same way
// netlify/functions-tests/bgc-provider.test.js does; a small chainable mock
// supports select/eq/neq/order/limit/insert/update + maybeSingle/single/await.
//
// Run with: node netlify/functions-tests/misc-broken-routes.test.js
// ===========================================================================

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
// Chainable Supabase stub: .from(table) -> { select, eq, neq, order, limit,
// insert, update, maybeSingle, single, then } dispatching to a per-table impl
// keyed by terminal call (maybeSingle / single / list-via-await, where a bare
// await after insert()/update() routes to ops.insert/ops.update, and a bare
// await with no pending write routes to ops.list).
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
    neq(col, val) { filters['neq_' + col] = val; return chain; },
    order() { return chain; },
    limit() { return chain; },
    insert(rows) { pendingOp = 'insert'; pendingPayload = rows; return chain; },
    update(rows) { pendingOp = 'update'; pendingPayload = rows; return chain; },
    maybeSingle() {
      const fn = ops.maybeSingle;
      return Promise.resolve(fn ? fn(filters) : { data: null, error: null });
    },
    single() {
      const fn = ops.single;
      return Promise.resolve(fn ? fn(filters) : { data: null, error: null });
    },
    then(resolve, reject) {
      let result;
      if (pendingOp === 'insert' && ops.insert) {
        result = ops.insert(filters, pendingPayload);
      } else if (pendingOp === 'update' && ops.update) {
        result = ops.update(filters, pendingPayload);
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

function authEvent(method, body, token, extraHeaders) {
  const headers = Object.assign({}, extraHeaders || {});
  if (token !== null) headers.authorization = 'Bearer ' + (token || 'tok-caller');
  return {
    httpMethod: method,
    headers: headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
}

function defaultAuth(user) {
  return async (token) => {
    if (token === 'tok-caller') return { data: { user: user || { id: 'caller-1' } }, error: null };
    return { data: { user: null }, error: { message: 'invalid' } };
  };
}

// ===========================================================================
// founder-campaign-stats.js
// ===========================================================================

const SAMPLE_NEXT_DATA_HTML = '<script id="__NEXT_DATA__" type="application/json">' + JSON.stringify({
  props: { pageProps: { campaign: {
    amount_raised: 125000,
    num_investors: 42,
    maximum_goal: 500000,
    valuation: 8000000,
    deadline_date: new Date(Date.now() + 10 * 86400000).toISOString(),
  } } },
}) + '</script>';

async function testFounderCampaignStats() {
  console.log('founder-campaign-stats');

  await check('no Authorization header returns 401', async () => {
    authImpl = defaultAuth();
    supabaseImpl = {};
    const handler = freshHandler('founder-campaign-stats');
    const res = await handler(authEvent('GET', undefined, null));
    assert.strictEqual(res.statusCode, 401);
  });

  await check('non-admin with no active founder profile returns 403', async () => {
    authImpl = defaultAuth({ id: 'caller-1' });
    supabaseImpl = { member_founder_profiles: { maybeSingle: () => ({ data: null, error: null }) } };
    const handler = freshHandler('founder-campaign-stats');
    const res = await handler(authEvent('GET', undefined));
    assert.strictEqual(res.statusCode, 403);
  });

  await check('admin user bypasses founder-profile check and returns scraped stats', async () => {
    authImpl = defaultAuth({ id: 'admin-1', app_metadata: { role: 'admin' } });
    supabaseImpl = {};
    const originalFetch = global.fetch;
    global.fetch = async () => ({ text: async () => SAMPLE_NEXT_DATA_HTML });
    try {
      const handler = freshHandler('founder-campaign-stats');
      const res = await handler(authEvent('GET', undefined));
      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.raised, 125000);
      assert.strictEqual(body.investors, 42);
      assert.strictEqual(body.live, true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await check('active founder (non-admin) returns scraped stats', async () => {
    authImpl = defaultAuth({ id: 'caller-1' });
    supabaseImpl = { member_founder_profiles: { maybeSingle: () => ({ data: { id: 'fp-1' }, error: null }) } };
    const originalFetch = global.fetch;
    global.fetch = async () => ({ text: async () => SAMPLE_NEXT_DATA_HTML });
    try {
      const handler = freshHandler('founder-campaign-stats');
      const res = await handler(authEvent('GET', undefined));
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(JSON.parse(res.body).investors, 42);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await check('30-min cache reused across calls on the same warm instance', async () => {
    authImpl = defaultAuth({ id: 'admin-1', app_metadata: { role: 'admin' } });
    supabaseImpl = {};
    let fetchCalls = 0;
    const originalFetch = global.fetch;
    global.fetch = async () => { fetchCalls++; return { text: async () => SAMPLE_NEXT_DATA_HTML }; };
    try {
      const handler = freshHandler('founder-campaign-stats');
      await handler(authEvent('GET', undefined));
      await handler(authEvent('GET', undefined));
      assert.strictEqual(fetchCalls, 1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await check('scrape failure falls back gracefully, still 200', async () => {
    authImpl = defaultAuth({ id: 'admin-1', app_metadata: { role: 'admin' } });
    supabaseImpl = {};
    const originalFetch = global.fetch;
    global.fetch = async () => { throw new Error('network down'); };
    try {
      const handler = freshHandler('founder-campaign-stats');
      const res = await handler(authEvent('GET', undefined));
      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.live, false);
      assert.strictEqual(body.error, true);
    } finally {
      global.fetch = originalFetch;
    }
  });
}

// ===========================================================================
// provider-profile-publish.js
// ===========================================================================

async function testProviderProfilePublish() {
  console.log('provider-profile-publish');

  await check('opt in with business_name and no existing slug creates one', async () => {
    authImpl = defaultAuth();
    let capturedUpdate = null;
    supabaseImpl = {
      profiles: {
        single: () => ({ data: { id: 'caller-1', role: 'provider', business_name: 'Bob The Builder', directory_slug: null, directory_opt_in: false }, error: null }),
        list: () => ({ data: [], error: null }),
        update: (filters, payload) => { capturedUpdate = payload; return { error: null }; },
      },
    };
    const handler = freshHandler('provider-profile-publish');
    const res = await handler(authEvent('POST', { opt_in: true }));
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.directory_opt_in, true);
    assert.strictEqual(body.directory_slug, 'bob-the-builder');
    assert.strictEqual(body.profile_url, '/p/bob-the-builder');
    assert.strictEqual(capturedUpdate.directory_slug, 'bob-the-builder');
    assert.strictEqual(capturedUpdate.directory_opt_in, true);
  });

  await check('slug collision appends a random suffix', async () => {
    authImpl = defaultAuth();
    supabaseImpl = {
      profiles: {
        single: () => ({ data: { id: 'caller-1', role: 'provider', business_name: 'Bob The Builder', directory_slug: null, directory_opt_in: false }, error: null }),
        list: () => ({ data: [{ id: 'someone-else' }], error: null }),
        update: () => ({ error: null }),
      },
    };
    const handler = freshHandler('provider-profile-publish');
    const res = await handler(authEvent('POST', { opt_in: true }));
    const body = JSON.parse(res.body);
    assert.ok(body.directory_slug.startsWith('bob-the-builder-'));
    assert.notStrictEqual(body.directory_slug, 'bob-the-builder');
  });

  await check('opting out does not touch an already-assigned slug', async () => {
    authImpl = defaultAuth();
    let capturedUpdate = null;
    supabaseImpl = {
      profiles: {
        single: () => ({ data: { id: 'caller-1', role: 'provider', business_name: 'Bob', directory_slug: 'bob-existing', directory_opt_in: true }, error: null }),
        update: (filters, payload) => { capturedUpdate = payload; return { error: null }; },
      },
    };
    const handler = freshHandler('provider-profile-publish');
    const res = await handler(authEvent('POST', { opt_in: false }));
    const body = JSON.parse(res.body);
    assert.strictEqual(body.directory_opt_in, false);
    assert.strictEqual(body.directory_slug, 'bob-existing');
    assert.strictEqual(capturedUpdate.directory_slug, undefined);
  });

  await check('non-provider role returns 403', async () => {
    authImpl = defaultAuth();
    supabaseImpl = { profiles: { single: () => ({ data: { id: 'caller-1', role: 'member' }, error: null }) } };
    const handler = freshHandler('provider-profile-publish');
    const res = await handler(authEvent('POST', { opt_in: true }));
    assert.strictEqual(res.statusCode, 403);
  });

  await check('no Authorization header returns 401', async () => {
    authImpl = defaultAuth();
    supabaseImpl = {};
    const handler = freshHandler('provider-profile-publish');
    const res = await handler(authEvent('POST', { opt_in: true }, null));
    assert.strictEqual(res.statusCode, 401);
  });

  await check('invalid JSON body returns 400', async () => {
    authImpl = defaultAuth();
    supabaseImpl = {};
    const handler = freshHandler('provider-profile-publish');
    const event = { httpMethod: 'POST', headers: { authorization: 'Bearer tok-caller' }, body: '{not json' };
    const res = await handler(event);
    assert.strictEqual(res.statusCode, 400);
  });

  await check('GET is not allowed', async () => {
    authImpl = defaultAuth();
    supabaseImpl = {};
    const handler = freshHandler('provider-profile-publish');
    const res = await handler(authEvent('GET', undefined));
    assert.strictEqual(res.statusCode, 405);
  });
}

// ===========================================================================
// shop-book.js
// ===========================================================================

function bookingBody(overrides) {
  return Object.assign({
    slug: 'joes-garage',
    name: 'Jane Smith',
    phone: '555-0100',
    vehicle: '2019 Toyota Camry',
    service: 'oil_change',
    details: 'Check engine light on',
    source: 'widget',
  }, overrides || {});
}

function publicEvent(method, body) {
  return { httpMethod: method, headers: {}, body: body !== undefined ? JSON.stringify(body) : undefined };
}

async function testShopBook() {
  console.log('shop-book');

  await check('resolves provider by slug, writes shop_booking_requests + maintenance_packages', async () => {
    let bookingRow = null;
    let packageRow = null;
    supabaseImpl = {
      profiles: { single: (filters) => (filters.directory_slug === 'joes-garage' ? { data: { id: 'prov-1' }, error: null } : { data: null, error: null }) },
      shop_booking_requests: { insert: (filters, payload) => { bookingRow = payload; return { error: null }; } },
      maintenance_packages: { insert: (filters, payload) => { packageRow = payload; return { error: null }; } },
    };
    const handler = freshHandler('shop-book');
    const res = await handler(publicEvent('POST', bookingBody()));
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(JSON.parse(res.body).success, true);
    assert.strictEqual(bookingRow.provider_id, 'prov-1');
    assert.strictEqual(bookingRow.provider_slug, 'joes-garage');
    assert.strictEqual(packageRow.provider_id, 'prov-1');
    assert.ok(packageRow.title.includes('Walk-in Request'));
    assert.ok(packageRow.description.includes('Jane Smith'));
  });

  await check('resolves provider_id -> backfills provider_slug', async () => {
    let bookingRow = null;
    supabaseImpl = {
      profiles: { single: (filters) => (filters.id === 'prov-2' ? { data: { directory_slug: 'other-slug' }, error: null } : { data: null, error: null }) },
      shop_booking_requests: { insert: (filters, payload) => { bookingRow = payload; return { error: null }; } },
      maintenance_packages: { insert: () => ({ error: null }) },
    };
    const handler = freshHandler('shop-book');
    const res = await handler(publicEvent('POST', bookingBody({ slug: undefined, provider_id: 'prov-2' })));
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(bookingRow.provider_slug, 'other-slug');
  });

  await check('missing required fields returns 400', async () => {
    supabaseImpl = {};
    const handler = freshHandler('shop-book');
    const res = await handler(publicEvent('POST', bookingBody({ vehicle: '' })));
    assert.strictEqual(res.statusCode, 400);
  });

  await check('provider not found for slug/id returns 400', async () => {
    supabaseImpl = { profiles: { single: () => ({ data: null, error: null }) } };
    const handler = freshHandler('shop-book');
    const res = await handler(publicEvent('POST', bookingBody()));
    assert.strictEqual(res.statusCode, 400);
  });

  await check('shop_booking_requests insert error is non-fatal; still bridges + succeeds', async () => {
    let packageRow = null;
    supabaseImpl = {
      profiles: { single: () => ({ data: { id: 'prov-1' }, error: null }) },
      shop_booking_requests: { insert: () => ({ error: { message: 'boom' } }) },
      maintenance_packages: { insert: (filters, payload) => { packageRow = payload; return { error: null }; } },
    };
    const handler = freshHandler('shop-book');
    const res = await handler(publicEvent('POST', bookingBody()));
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(JSON.parse(res.body).success, true);
    assert.ok(packageRow);
  });

  await check('rate limited returns 429', async () => {
    supabaseImpl = {};
    const originalRateLimit = utils.publicRateLimit;
    utils.publicRateLimit = () => ({ allowed: false, retryAfterMs: 5000 });
    try {
      const handler = freshHandler('shop-book');
      const res = await handler(publicEvent('POST', bookingBody()));
      assert.strictEqual(res.statusCode, 429);
    } finally {
      utils.publicRateLimit = originalRateLimit;
    }
  });

  await check('GET is not allowed', async () => {
    supabaseImpl = {};
    const handler = freshHandler('shop-book');
    const res = await handler(publicEvent('GET', undefined));
    assert.strictEqual(res.statusCode, 405);
  });
}

// ---------------------------------------------------------------------------

(async () => {
  await testFounderCampaignStats();
  await testProviderProfilePublish();
  await testShopBook();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();

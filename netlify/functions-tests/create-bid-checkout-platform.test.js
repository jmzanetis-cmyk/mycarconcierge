// create-bid-checkout — platform:'native' return-URL guard.
//
// Web callers land on /providers.html?purchase=success|cancelled — that
// path requires an authed Supabase session in the browser. Native
// callers hit Stripe Checkout in SFSafariViewController, which has no
// session with providers.html; the same URLs would force a re-login
// there. The platform:'native' body flag routes the checkout session's
// success_url and cancel_url to static /purchase-complete.html and
// /purchase-cancelled.html pages that need no auth.
//
// The web path must be untouched. This test proves both directions.

'use strict';
const assert = require('assert');
const path = require('path');
const Module = require('module');

process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';
process.env.SUPABASE_ANON_KEY = 'stub-anon-key';
process.env.STRIPE_SECRET_KEY = 'sk_test_stub';

let lastCheckoutParams = null;

const stripeFactory = function () {
  return {
    checkout: {
      sessions: {
        create: async (params) => {
          lastCheckoutParams = params;
          return { id: 'cs_test_stub', url: 'https://stripe.test/cs_test_stub' };
        },
      },
    },
  };
};
const stripeStub = function () { return stripeFactory(); };
stripeStub.default = stripeStub;

const fnDir = path.resolve(__dirname, '../functions');
const fnRequire = Module.createRequire(fnDir + '/_anchor.js');
for (const r of [require, fnRequire]) {
  try {
    const p = r.resolve('stripe');
    require.cache[p] = { id: p, filename: p, loaded: true, exports: stripeStub };
  } catch (_) { /* fine */ }
}

function makeSupabaseStub(authedUserId) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: authedUserId } }, error: null }),
    },
    from(table) {
      if (table === 'profiles') {
        return {
          select() { return this; }, eq() { return this; },
          single: async () => ({ data: { role: 'provider' }, error: null }),
        };
      }
      if (table === 'bid_packs') {
        return {
          select() { return this; }, eq() { return this; },
          single: async () => ({
            data: { id: 'pack-1', name: 'Starter', price: 10, bid_count: 10, bonus_bids: 0, is_active: true },
            error: null,
          }),
        };
      }
      if (table === 'provider_subscriptions') {
        return {
          select() { return this; }, eq() { return this; },
          in() { return this; }, limit() { return this; },
          maybeSingle: async () => ({ data: null, error: null }),
        };
      }
      // Audit / activity tables — insert-only, no-op stubs so the money-path
      // audit hook's write doesn't spam CRITICAL logs during the test run.
      if (table === 'admin_audit_log' || table === 'ai_action_log') {
        return { insert: async () => ({ data: null, error: null }) };
      }
      throw new Error('unexpected table ' + table);
    },
  };
}

const AUTHED_ID = '11111111-1111-4111-a111-111111111111';
const PACK_ID   = '33333333-3333-4333-a333-333333333333';

function makeEvent(body) {
  return {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer stub-jwt' },
    body: JSON.stringify(body),
  };
}

async function invokeHandler(supabaseStub, eventBody) {
  lastCheckoutParams = null;
  const utils = require('../functions/utils');
  const origCreate = utils.createSupabaseClient;
  utils.createSupabaseClient = () => supabaseStub;
  try {
    delete require.cache[require.resolve('../functions/create-bid-checkout')];
    const { handler } = require('../functions/create-bid-checkout');
    return await handler(makeEvent(eventBody));
  } finally {
    utils.createSupabaseClient = origCreate;
  }
}

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log('  ✓ ' + name); passed++; }
  catch (err) { console.error('  ✗ ' + name + '\n     ' + (err.stack || err.message)); failed++; }
}

(async () => {
  console.log('create-bid-checkout-platform.test.js\n');

  await check('platform:"native" → success_url points to /purchase-complete.html', async () => {
    const sb = makeSupabaseStub(AUTHED_ID);
    const res = await invokeHandler(sb, {
      packId: PACK_ID, providerId: AUTHED_ID, platform: 'native',
    });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(lastCheckoutParams, 'Stripe was called');
    assert.ok(/\/purchase-complete\.html/.test(lastCheckoutParams.success_url),
      'success_url must be purchase-complete.html, got: ' + lastCheckoutParams.success_url);
    assert.ok(/kind=pack/.test(lastCheckoutParams.success_url),
      'success_url must carry kind=pack');
    assert.ok(new RegExp('pack=' + PACK_ID).test(lastCheckoutParams.success_url),
      'success_url must include pack id');
  });

  await check('platform:"native" → cancel_url points to /purchase-cancelled.html', async () => {
    const sb = makeSupabaseStub(AUTHED_ID);
    const res = await invokeHandler(sb, {
      packId: PACK_ID, providerId: AUTHED_ID, platform: 'native',
    });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(/\/purchase-cancelled\.html/.test(lastCheckoutParams.cancel_url),
      'cancel_url must be purchase-cancelled.html, got: ' + lastCheckoutParams.cancel_url);
    assert.ok(/kind=pack/.test(lastCheckoutParams.cancel_url));
  });

  await check('platform:"native" → metadata.platform is "native"', async () => {
    const sb = makeSupabaseStub(AUTHED_ID);
    await invokeHandler(sb, { packId: PACK_ID, providerId: AUTHED_ID, platform: 'native' });
    assert.strictEqual(lastCheckoutParams.metadata.platform, 'native');
  });

  await check('platform omitted (web caller) → success_url points to /providers.html (unchanged)', async () => {
    const sb = makeSupabaseStub(AUTHED_ID);
    const res = await invokeHandler(sb, { packId: PACK_ID, providerId: AUTHED_ID });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(/\/providers\.html\?purchase=success/.test(lastCheckoutParams.success_url),
      'web success_url must be unchanged');
    assert.ok(/\/providers\.html\?purchase=cancelled/.test(lastCheckoutParams.cancel_url),
      'web cancel_url must be unchanged');
    assert.strictEqual(lastCheckoutParams.metadata.platform, 'web');
  });

  await check('platform:"web" explicit → same as omitted', async () => {
    const sb = makeSupabaseStub(AUTHED_ID);
    await invokeHandler(sb, { packId: PACK_ID, providerId: AUTHED_ID, platform: 'web' });
    assert.ok(/\/providers\.html\?purchase=success/.test(lastCheckoutParams.success_url));
  });

  await check('platform:"native" does not weaken IDOR guard (mismatched providerId still 400)', async () => {
    const sb = makeSupabaseStub(AUTHED_ID);
    const res = await invokeHandler(sb, {
      packId: PACK_ID, providerId: '22222222-2222-4222-a222-222222222222', platform: 'native',
    });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(lastCheckoutParams, null, 'Stripe must NOT be called on IDOR');
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
})();

// ============================================================================
// create-bid-checkout ownership tests (audit item #4 — bid-credit IDOR fix)
//
// Proves the identity invariant: bid credits can ONLY land on the
// authenticated purchaser's account. A body-supplied providerId that doesn't
// match the authed user.id MUST be rejected (400) so the Stripe metadata
// (which the webhook trusts verbatim) can never be poisoned with another
// provider's UUID.
//
// Covers BOTH the web (Stripe Checkout) and mobile (PaymentIntent) endpoints,
// since both shared the same vulnerability and both got the same fix.
//
// Run via:  node netlify/functions-tests/create-bid-checkout-ownership.test.js
// ============================================================================

'use strict';

const assert = require('assert');
const path = require('path');
const Module = require('module');

process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';
process.env.SUPABASE_ANON_KEY = 'stub-anon-key';
process.env.STRIPE_SECRET_KEY = 'sk_test_stub';

// ---------------------------------------------------------------------------
// Stripe stub — captures the metadata passed to checkout.sessions.create /
// paymentIntents.create so we can assert what provider_id ends up there.
// ---------------------------------------------------------------------------
let lastCheckoutMetadata = null;
let lastPaymentIntentMetadata = null;

const stripeFactory = function () {
  return {
    checkout: {
      sessions: {
        create: async (params) => {
          lastCheckoutMetadata = params.metadata;
          return { id: 'cs_test_stub', url: 'https://stripe.test/cs_test_stub' };
        },
      },
    },
    paymentIntents: {
      create: async (params) => {
        lastPaymentIntentMetadata = params.metadata;
        return { id: 'pi_test_stub', status: 'succeeded' };
      },
    },
  };
};
// `new Stripe(key, opts)` and `require('stripe')(key, opts)` both work
const stripeStub = function (key, opts) { return stripeFactory(); };
stripeStub.default = stripeStub;
// Stripe resolves to TWO different paths in this monorepo: root node_modules
// (pnpm-flattened) and netlify/functions/node_modules. Functions resolve to
// the latter; tests resolve to the former. Stub both so whichever path the
// handler picks is intercepted.
const fnDir = path.resolve(__dirname, '../functions');
const fnRequire = Module.createRequire(fnDir + '/_anchor.js');
for (const r of [require, fnRequire]) {
  try {
    const p = r.resolve('stripe');
    require.cache[p] = { id: p, filename: p, loaded: true, exports: stripeStub };
  } catch (_) { /* not present at that resolver, fine */ }
}

// ---------------------------------------------------------------------------
// Supabase stub via utils.createSupabaseClient monkey-patch.
// ---------------------------------------------------------------------------
function makeSupabaseStub({ authedUserId, profileRole = 'provider', packExists = true }) {
  return {
    auth: {
      getUser: async () => {
        if (!authedUserId) return { data: { user: null }, error: { message: 'bad token' } };
        return { data: { user: { id: authedUserId } }, error: null };
      },
    },
    from(table) {
      if (table === 'profiles') {
        return {
          select() { return this; },
          eq() { return this; },
          single: async () => {
            if (!profileRole) return { data: null, error: { message: 'not found' } };
            return { data: { role: profileRole }, error: null };
          },
          maybeSingle: async () => ({ data: { bid_credits: 5 }, error: null }),
          update() { return { eq: async () => ({ data: null, error: null }) }; },
        };
      }
      if (table === 'bid_packs') {
        return {
          select() { return this; },
          eq() { return this; },
          single: async () => {
            if (!packExists) return { data: null, error: { message: 'no pack' } };
            return {
              data: {
                id: 'pack-1', name: 'Starter', price: 10,
                bid_count: 10, bonus_bids: 0, is_active: true,
              },
              error: null,
            };
          },
        };
      }
      if (table === 'bid_credit_purchases') {
        return {
          select() { return this; },
          eq() { return this; },
          limit() { return this; },
          maybeSingle: async () => ({ data: null, error: null }),
          insert: async () => ({ data: null, error: null }),
        };
      }
      throw new Error('unexpected table ' + table);
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const AUTHED_ID = '11111111-1111-4111-a111-111111111111';
const VICTIM_ID = '22222222-2222-4222-a222-222222222222';
const PACK_ID   = '33333333-3333-4333-a333-333333333333';

function makeEvent(body) {
  return {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer stub-jwt' },
    body: JSON.stringify(body),
  };
}
function parse(res) { try { return JSON.parse(res.body); } catch { return null; } }

async function invokeHandler(handlerPath, supabaseStub, eventBody) {
  // Reset captures
  lastCheckoutMetadata = null;
  lastPaymentIntentMetadata = null;

  const utilsPath = require.resolve('../functions/utils');
  const utils = require('../functions/utils');
  const origCreate = utils.createSupabaseClient;
  utils.createSupabaseClient = () => supabaseStub;

  try {
    delete require.cache[require.resolve(handlerPath)];
    const { handler } = require(handlerPath);
    return await handler(makeEvent(eventBody));
  } finally {
    utils.createSupabaseClient = origCreate;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
let passed = 0, failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log('  ✓ ' + name);
    passed++;
  } catch (err) {
    console.error('  ✗ ' + name + '\n     ' + (err.stack || err.message));
    failed++;
  }
}

(async () => {
  console.log('create-bid-checkout-ownership.test.js\n');

  // ─── WEB: create-bid-checkout.js ────────────────────────────────────────
  console.log('— web (Stripe Checkout redirect)');

  await check('happy path: authed provider buys own credits → 200 + metadata.provider_id is authed id', async () => {
    const sb = makeSupabaseStub({ authedUserId: AUTHED_ID });
    const res = await invokeHandler('../functions/create-bid-checkout', sb, {
      packId: PACK_ID, providerId: AUTHED_ID,
    });
    assert.strictEqual(res.statusCode, 200, 'expected 200');
    assert.strictEqual(lastCheckoutMetadata.provider_id, AUTHED_ID,
      'metadata must carry the authed id, not the body id');
  });

  await check('IDOR attempt: body providerId differs from authed id → 400 (mismatch)', async () => {
    const sb = makeSupabaseStub({ authedUserId: AUTHED_ID });
    const res = await invokeHandler('../functions/create-bid-checkout', sb, {
      packId: PACK_ID, providerId: VICTIM_ID,
    });
    assert.strictEqual(res.statusCode, 400, 'must reject the mismatch');
    assert.strictEqual(lastCheckoutMetadata, null,
      'Stripe checkout must NOT be created when identity mismatches');
    const body = parse(res);
    assert.ok(/mismatch/i.test(body.error || ''),
      'error message should signal the identity mismatch');
  });

  await check('no body providerId at all: falls back to authed id → 200 + metadata.provider_id is authed id', async () => {
    const sb = makeSupabaseStub({ authedUserId: AUTHED_ID });
    const res = await invokeHandler('../functions/create-bid-checkout', sb, {
      packId: PACK_ID, // providerId omitted entirely — should be permitted post-fix
    });
    assert.strictEqual(res.statusCode, 200, 'expected 200 when body omits providerId');
    assert.strictEqual(lastCheckoutMetadata.provider_id, AUTHED_ID);
  });

  await check('non-provider caller (role=member) → 403', async () => {
    const sb = makeSupabaseStub({ authedUserId: AUTHED_ID, profileRole: 'member' });
    const res = await invokeHandler('../functions/create-bid-checkout', sb, {
      packId: PACK_ID, providerId: AUTHED_ID,
    });
    assert.strictEqual(res.statusCode, 403, 'non-providers cannot buy bid credits');
    assert.strictEqual(lastCheckoutMetadata, null);
  });

  // ─── MOBILE: create-bid-checkout-mobile.js ──────────────────────────────
  console.log('\n— mobile (PaymentIntent direct-grant)');

  await check('happy path: authed provider buys own credits → 200 + PI metadata.provider_id is authed id', async () => {
    const sb = makeSupabaseStub({ authedUserId: AUTHED_ID });
    const res = await invokeHandler('../functions/create-bid-checkout-mobile', sb, {
      packId: PACK_ID, providerId: AUTHED_ID, paymentMethodId: 'pm_test', walletType: 'apple_pay',
    });
    assert.strictEqual(res.statusCode, 200, 'expected 200');
    assert.strictEqual(lastPaymentIntentMetadata.provider_id, AUTHED_ID,
      'PaymentIntent metadata must carry the authed id');
  });

  await check('IDOR attempt: body providerId differs from authed id → 400 (mismatch)', async () => {
    const sb = makeSupabaseStub({ authedUserId: AUTHED_ID });
    const res = await invokeHandler('../functions/create-bid-checkout-mobile', sb, {
      packId: PACK_ID, providerId: VICTIM_ID, paymentMethodId: 'pm_test', walletType: 'apple_pay',
    });
    assert.strictEqual(res.statusCode, 400, 'must reject the mismatch');
    assert.strictEqual(lastPaymentIntentMetadata, null,
      'Stripe PI must NOT be created (and credits must NOT be granted) on mismatch');
    const body = parse(res);
    assert.ok(/mismatch/i.test(body.error || ''),
      'error message should signal the identity mismatch');
  });

  await check('non-provider caller (role=member) → 403', async () => {
    const sb = makeSupabaseStub({ authedUserId: AUTHED_ID, profileRole: 'member' });
    const res = await invokeHandler('../functions/create-bid-checkout-mobile', sb, {
      packId: PACK_ID, providerId: AUTHED_ID, paymentMethodId: 'pm_test', walletType: 'apple_pay',
    });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(lastPaymentIntentMetadata, null);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(err => {
  console.error('Test threw:', err);
  process.exit(1);
});

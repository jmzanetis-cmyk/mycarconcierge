// provider-plan-checkout — checkout copy guard.
//
// Stripe hard-codes the "Free for 730 days · Then $X starting …" trial
// header from trial_period_days and we can't reword it. The clarifying
// language lives in custom_text.submit / custom_text.after_submit and
// subscription_data.description. Both custom_text messages are capped at
// 1200 characters by Stripe; this test proves both are non-empty, on the
// created checkout session, and within the cap.

'use strict';
const assert = require('assert');
const path = require('path');
const Module = require('module');

process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';
process.env.SUPABASE_ANON_KEY = 'stub-anon-key';
process.env.STRIPE_SECRET_KEY = 'sk_test_stub';
process.env.FEATURE_PROVIDER_PLANS = 'true';

let lastSessionParams = null;

const stripeFactory = function () {
  return {
    customers: {
      list: async () => ({ data: [] }),
      create: async () => ({ id: 'cus_stub' }),
    },
    checkout: {
      sessions: {
        create: async (params) => {
          lastSessionParams = params;
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

// @supabase/supabase-js stub
const supabaseFactory = {
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: '11111111-1111-4111-a111-111111111111' } },
        error: null,
      }),
    },
    from(table) {
      if (table === 'profiles') {
        return {
          select() { return this; }, eq() { return this; },
          maybeSingle: async () => ({
            data: {
              id: '11111111-1111-4111-a111-111111111111',
              email: 'testprovider@test.com',
              role: 'provider',
              business_name: 'Test Auto Shop',
              full_name: null,
            },
            error: null,
          }),
        };
      }
      if (table === 'subscription_plans') {
        return {
          select() { return this; }, eq() { return this; },
          maybeSingle: async () => ({
            data: {
              plan_key: 'starter',
              name: 'Starter',
              credits_per_month: 10,
              stripe_price_monthly_test: 'price_test_stub',
              is_active: true,
            },
            error: null,
          }),
        };
      }
      if (table === 'provider_subscriptions') {
        return {
          select() { return this; }, eq() { return this; },
          not() { return this; },
          maybeSingle: async () => ({ data: null, error: null }),
        };
      }
      throw new Error('unexpected table ' + table);
    },
  }),
};

// Intercept @supabase/supabase-js require
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@supabase/supabase-js') return supabaseFactory;
  return origLoad.call(this, request, parent, isMain);
};

function makeEvent(body) {
  return {
    httpMethod: 'POST',
    headers: {
      authorization: 'Bearer stub-jwt',
      host: 'www.mycarconcierge.com',
      'x-forwarded-proto': 'https',
    },
    body: JSON.stringify(body),
  };
}

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); console.log('  ✓ ' + name); passed++; }
  catch (err) { console.error('  ✗ ' + name + '\n     ' + (err.stack || err.message)); failed++; }
}

(async () => {
  console.log('provider-plan-checkout-copy.test.js\n');

  delete require.cache[require.resolve('../functions/provider-plan-checkout')];
  const { handler } = require('../functions/provider-plan-checkout');

  await check('checkout.sessions.create receives custom_text.submit.message', async () => {
    lastSessionParams = null;
    const res = await handler(makeEvent({ plan_key: 'starter' }));
    assert.strictEqual(res.statusCode, 200);
    assert.ok(lastSessionParams, 'Stripe was called');
    assert.ok(lastSessionParams.custom_text, 'custom_text present');
    assert.ok(lastSessionParams.custom_text.submit, 'custom_text.submit present');
    const msg = lastSessionParams.custom_text.submit.message;
    assert.ok(typeof msg === 'string' && msg.length > 0, 'submit.message non-empty');
  });

  await check('checkout.sessions.create receives custom_text.after_submit.message', async () => {
    assert.ok(lastSessionParams.custom_text.after_submit, 'custom_text.after_submit present');
    const msg = lastSessionParams.custom_text.after_submit.message;
    assert.ok(typeof msg === 'string' && msg.length > 0, 'after_submit.message non-empty');
  });

  await check('both custom_text messages are ≤ 1200 chars (Stripe cap)', async () => {
    const s = lastSessionParams.custom_text.submit.message;
    const a = lastSessionParams.custom_text.after_submit.message;
    assert.ok(s.length <= 1200, 'submit.message ' + s.length + ' > 1200');
    assert.ok(a.length <= 1200, 'after_submit.message ' + a.length + ' > 1200');
  });

  await check('subscription_data.description names the plan and explains the trial gate', async () => {
    const desc = lastSessionParams.subscription_data && lastSessionParams.subscription_data.description;
    assert.ok(typeof desc === 'string' && desc.length > 0, 'subscription_data.description present');
    assert.ok(/MCC/.test(desc), 'description contains "MCC"');
    assert.ok(/first accepted bid/i.test(desc), 'description references first accepted bid');
  });

  await check('custom_text.submit explains 730-day Stripe ceiling', async () => {
    const s = lastSessionParams.custom_text.submit.message;
    assert.ok(/730/.test(s), 'submit.message references 730 to explain the Stripe-rendered header');
  });

  await check('payment_method_types restricted to card + link (off-session-safe for renewal)', async () => {
    const pmt = lastSessionParams.payment_method_types;
    assert.ok(Array.isArray(pmt), 'payment_method_types present as array');
    assert.deepStrictEqual([...pmt].sort(), ['card', 'link'],
      'must be exactly ["card","link"] — Klarna/Cash App/bank-debit cannot renew off-session up to 730d later');
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
})();

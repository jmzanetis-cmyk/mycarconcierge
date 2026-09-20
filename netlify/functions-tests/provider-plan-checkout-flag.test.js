// FEATURE_PROVIDER_PLANS gate — server-side.
//
// The Plans card on providers.html is behind a client-side flag read
// from /api/config, but the endpoints must independently 403 when the
// flag is off so a raw curl cannot bypass the UI hide (defense in
// depth). This test invokes the checkout + portal handlers directly
// with the flag unset and asserts:
//   1. Both return 403 { error: 'plans_disabled' }.
//   2. The Stripe stub is never called (short-circuit occurs before
//      any Stripe SDK access).
//   3. The Supabase stub is never called either.
//
// When Jordan sets FEATURE_PROVIDER_PLANS=true on Deploy Previews +
// Branch deploys, this test remains a regression guard against
// accidentally removing the check.

'use strict';
const assert = require('assert');
const Module = require('module');

// ── Track calls into stubs ──────────────────────────────────────────
const stripeCalls = [];
const stripeFactory = function () {
  return new Proxy({}, {
    get() {
      stripeCalls.push('accessed');
      return () => { stripeCalls.push('called'); return Promise.resolve({}); };
    },
  });
};

const supabaseCalls = [];
const supabaseFactory = {
  createClient: function () {
    supabaseCalls.push('createClient');
    return new Proxy({}, {
      get() {
        supabaseCalls.push('accessed');
        return () => { supabaseCalls.push('called'); return Promise.resolve({ data: null, error: null }); };
      },
    });
  },
};

// Intercept both requires at Module._load time.
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'stripe') return stripeFactory;
  if (request === '@supabase/supabase-js') return supabaseFactory;
  return origLoad.call(this, request, parent, isMain);
};

// Env: STRIPE_SECRET_KEY + SUPABASE_URL/KEY are set so the getStripe/
// getSupabase factory calls don't short-circuit-to-500 (would mask the
// 403 we want to observe). FEATURE_PROVIDER_PLANS is explicitly unset.
process.env.STRIPE_SECRET_KEY   = 'sk_test_stub_for_unit_test';
process.env.SUPABASE_URL        = 'http://stub';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';
delete process.env.FEATURE_PROVIDER_PLANS;

const checkout = require('../functions/provider-plan-checkout');
const portal   = require('../functions/provider-plan-portal');

let pass = 0, fail = 0;
async function t(name, fn) {
  stripeCalls.length = 0;
  supabaseCalls.length = 0;
  try { await fn(); console.log('  ok  ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + ': ' + e.stack); fail++; }
}

function mkEvent(method) {
  return {
    httpMethod: method || 'POST',
    headers: { authorization: 'Bearer any-token-not-inspected' },
    body: JSON.stringify({ plan_key: 'starter' }),
  };
}

(async () => {

await t('checkout: flag unset → 403 plans_disabled, Stripe never called', async () => {
  const res = await checkout.handler(mkEvent('POST'));
  assert.strictEqual(res.statusCode, 403);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.error, 'plans_disabled');
  assert.strictEqual(stripeCalls.length, 0, 'stripe stub not accessed');
  assert.strictEqual(supabaseCalls.length, 0, 'supabase stub not accessed');
});

await t('checkout: flag = "false" → 403 plans_disabled', async () => {
  process.env.FEATURE_PROVIDER_PLANS = 'false';
  try {
    const res = await checkout.handler(mkEvent('POST'));
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(JSON.parse(res.body).error, 'plans_disabled');
    assert.strictEqual(stripeCalls.length, 0);
  } finally {
    delete process.env.FEATURE_PROVIDER_PLANS;
  }
});

await t('checkout: flag = "1" → 403 (only literal "true" enables)', async () => {
  process.env.FEATURE_PROVIDER_PLANS = '1';
  try {
    const res = await checkout.handler(mkEvent('POST'));
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(JSON.parse(res.body).error, 'plans_disabled');
  } finally {
    delete process.env.FEATURE_PROVIDER_PLANS;
  }
});

await t('portal: flag unset → 403 plans_disabled, Stripe never called', async () => {
  const res = await portal.handler(mkEvent('POST'));
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(JSON.parse(res.body).error, 'plans_disabled');
  assert.strictEqual(stripeCalls.length, 0);
  assert.strictEqual(supabaseCalls.length, 0);
});

await t('checkout: OPTIONS still returns 204 regardless of flag (CORS preflight)', async () => {
  const res = await checkout.handler(mkEvent('OPTIONS'));
  assert.strictEqual(res.statusCode, 204);
});

await t('portal: OPTIONS still returns 204 regardless of flag', async () => {
  const res = await portal.handler(mkEvent('OPTIONS'));
  assert.strictEqual(res.statusCode, 204);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
})();

// stripe-mode.js classifier — the single source of truth for whether a
// Stripe secret key runs against live or test mode. Restricted keys
// (rk_live_/rk_test_) count as their family's mode, same as full-perm
// (sk_live_/sk_test_) — every call site that used to check
// startsWith('sk_live_') would misclassify rk_live_ as test.

'use strict';
const assert = require('assert');
const { isLiveKey, isTestKey } = require('../../lib/stripe-mode');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ok  ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + ': ' + e.message); fail++; }
}

t('sk_live_ → live',   () => { assert.strictEqual(isLiveKey('sk_live_abc123'), true);  assert.strictEqual(isTestKey('sk_live_abc123'), false); });
t('rk_live_ → live',   () => { assert.strictEqual(isLiveKey('rk_live_xyz'),    true);  assert.strictEqual(isTestKey('rk_live_xyz'),    false); });
t('sk_test_ → test',   () => { assert.strictEqual(isLiveKey('sk_test_foo'),    false); assert.strictEqual(isTestKey('sk_test_foo'),    true);  });
t('rk_test_ → test',   () => { assert.strictEqual(isLiveKey('rk_test_bar'),    false); assert.strictEqual(isTestKey('rk_test_bar'),    true);  });
t('empty string → neither', () => { assert.strictEqual(isLiveKey(''), false); assert.strictEqual(isTestKey(''), false); });
t('null → neither',    () => { assert.strictEqual(isLiveKey(null), false); assert.strictEqual(isTestKey(null), false); });
t('undefined → neither', () => { assert.strictEqual(isLiveKey(undefined), false); assert.strictEqual(isTestKey(undefined), false); });
t('random string → neither', () => { assert.strictEqual(isLiveKey('bogus_key_123'), false); assert.strictEqual(isTestKey('bogus_key_123'), false); });
t('pk_live_ (publishable, wrong scope) → neither', () => {
  // Publishable keys share the live/test family word but are not secret
  // keys. Not our problem to route them — but they must not be classified
  // as live/test secret material.
  assert.strictEqual(isLiveKey('pk_live_1'), false);
  assert.strictEqual(isTestKey('pk_test_1'), false);
});
t('sk_live_ prefix is case-sensitive', () => {
  assert.strictEqual(isLiveKey('SK_LIVE_abc'), false);
  assert.strictEqual(isLiveKey('Sk_Live_abc'), false);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);

// ============================================================================
// stripe-mode.js — shared helpers for classifying a Stripe secret key
//
// The production Netlify env variable STRIPE_SECRET_KEY holds an rk_live_
// (restricted live) key, not sk_live_. Several call sites derived mode
// with startsWith('sk_live_') and consequently thought production was
// running in test mode. That misread cascaded into:
//   • /api/config.stripe_livemode reporting false on prod
//   • admin-provider-plans-bootstrap writing to *_test columns instead
//     of the LIVE columns on production
//   • provider-plan-checkout picking the wrong Stripe price column
//   • stripe-webhook logging livemode_expected=false for real live events
//
// The recognized live prefixes are `sk_live_` (secret full-permission)
// and `rk_live_` (restricted live). Everything else — sk_test_, rk_test_,
// nothing — is test. This module is the single source of truth for that
// classification.
//
// Bootstrap has an additional authoritative cross-check via
// stripe.balance.retrieve().livemode — the Stripe API itself is the
// ultimate arbiter and picks up any weird future key-prefix change we
// haven't seen yet. If the prefix and balance.livemode disagree, trust
// balance.livemode and log a warning so we notice.
// ============================================================================

'use strict';

const LIVE_PREFIX = /^(sk|rk)_live_/;
const TEST_PREFIX = /^(sk|rk)_test_/;

function isLiveKey(key) {
  return typeof key === 'string' && LIVE_PREFIX.test(key);
}

function isTestKey(key) {
  return typeof key === 'string' && TEST_PREFIX.test(key);
}

// Convenience for env-based callers.
function isLiveFromEnv() {
  return isLiveKey(process.env.STRIPE_SECRET_KEY || '');
}

module.exports = { isLiveKey, isTestKey, isLiveFromEnv };

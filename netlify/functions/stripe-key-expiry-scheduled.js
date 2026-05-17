// ============================================================================
// MCC Stripe Key Expiry Reminder — Scheduled Function (Task #246)
//
// SUPERSEDED by Task #353: this file is now a thin shim retained only for
// ad-hoc manual invocation (curl against the legacy function URL) and for
// any code that still imports the internal `_runChecker` / `_computeStatus`
// helpers. It is NO LONGER scheduled — netlify.toml's cron entry now
// targets `api-key-expiry-scheduled` directly, which loops every secret in
// lib/api-key-expiry-config.js (including the Stripe entry, which
// intentionally reuses the same setting key and ai_action_log module name
// for backward compatibility, so the existing alert history carries over).
//
// `exports.handler` delegates to the full generalized handler, so a manual
// invocation of this URL behaves identically to invoking the new function.
// The Stripe-only `_runChecker` re-export is preserved so any legacy
// caller / test that imported it keeps operating on the Stripe entry only.
// ============================================================================

const generalized = require('./api-key-expiry-scheduled');
const { findKeyConfig } = require('../../lib/api-key-expiry-config');

const STRIPE_KEY_ID = 'stripe_secret_key';
const stripeCfg = findKeyConfig(STRIPE_KEY_ID);

exports.handler = generalized.handler;

// Stripe-only checker preserved for legacy callers (e.g. the original admin
// endpoint shim and any test that imported `_runChecker`).
exports._runChecker = function(supabase) {
  return generalized._runChecker(supabase, { onlyKeyId: STRIPE_KEY_ID });
};
exports._computeStatus = generalized._computeStatus;
exports._SETTINGS_KEY = stripeCfg ? stripeCfg.setting_key : 'stripe_key_expiry_date';
exports._MODULE = stripeCfg ? stripeCfg.module : 'stripe_key_expiry';

// ============================================================================
// MCC Stripe Key Expiry — Admin Endpoint (Task #246)
//
// SUPERSEDED by Task #353: this file is now a thin shim that delegates to
// the generalized multi-key admin endpoint in api-key-expiry-admin.js.
//
// The legacy URL `/api/admin/stripe-key-expiry[*]` keeps working because
// the generalized handler detects the legacy path prefix and returns the
// Task #246 narrow Stripe-only response shape so any older client (or a
// bookmarked admin link) continues to behave identically.
// ============================================================================

const generalized = require('./api-key-expiry-admin');

exports.handler = generalized.handler;

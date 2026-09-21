// ============================================================================
// plan-terms-version.js — single source of truth for the MCC Terms of Service
// version that provider plans reference.
//
// Bumped when www/terms.html §7 changes in a way we'd want counsel-grade
// proof of. The webhook stamps this on provider_subscriptions.terms_version
// at checkout.session.completed. Never delete row-level history; a change
// here means new signups accept the new version while existing subs stay
// bound to their original version.
// ============================================================================

'use strict';

const TERMS_VERSION = '2026-09-21';
const TERMS_URL     = 'https://www.mycarconcierge.com/terms.html';

module.exports = { TERMS_VERSION, TERMS_URL };

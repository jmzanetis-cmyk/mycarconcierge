// ============================================================================
// /api/config — narrow public config for the browser.
//
// Currently returns only the Google Places API key. Google's Places
// JavaScript API is designed to run in the browser with a public key, so
// exposing it here is expected — the key must be locked down in Google
// Cloud Console via HTTP referrer restrictions (www.mycarconcierge.com,
// *.netlify.app for drafts, plus the Capacitor origins for iOS/Android).
// Without those restrictions, anyone reading this response can bill your
// quota.
//
// Intentionally narrow: we do NOT proxy siteUrl / appName / supportEmail
// through here. The only live browser caller today is
// onboarding-provider.html's places-autocomplete init; mcc-config.js was
// stubbed to skip this endpoint back in Audit Batch 2 (2026-07-16).
//
// This replaces a route that lived only in the local-dev server.js at
// repo root, which returned 404 in production and killed address
// autocomplete on the onboarding location step (fix/places-config-404).
// ============================================================================

var utils = require('./utils');
var { isLiveKey } = require('../../lib/stripe-mode');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return utils.optionsResponse();
  }
  if (event.httpMethod !== 'GET') {
    return utils.errorResponse(405, 'Method not allowed');
  }

  return utils.successResponse({
    googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY || null,
    // Feature flags. Read server-side so a flip in Netlify's env panel
    // takes effect without a redeploy of client bundles. The browser
    // reads these via fetch('/api/config') at page-load.
    features: {
      // FEATURE_PROVIDER_PLANS gates the Phase 2 provider-subscription
      // Plans card on providers.html. When 'true', the card renders and
      // /api/provider/plan-checkout + /api/provider/plan-portal accept
      // calls. When unset/false (production default), the card is hidden
      // and both endpoints return 403 plans_disabled. Webhooks stay live
      // regardless — if a subscription somehow exists it must be honored.
      providerPlans: process.env.FEATURE_PROVIDER_PLANS === 'true',
    },
    // Stripe mode — surfaced so the browser can pick the right
    // stripe_price_monthly / stripe_price_monthly_test column when
    // rendering the Plans card. Key material is NEVER sent, only the
    // sk_live_ prefix inference.
    stripe_livemode: isLiveKey(process.env.STRIPE_SECRET_KEY || ''),
  });
};

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

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return utils.optionsResponse();
  }
  if (event.httpMethod !== 'GET') {
    return utils.errorResponse(405, 'Method not allowed');
  }

  return utils.successResponse({
    googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY || null
  });
};

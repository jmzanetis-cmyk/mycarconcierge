(function() {
  // ==========================================================================
  // API base URL — Netlify + local dev use relative URLs (same origin).
  // Native apps (Capacitor/Ionic) use the absolute production URL because
  // there is no server origin in a webview context.
  // ==========================================================================

  const isNativeApp = typeof window.Capacitor !== 'undefined' ||
                      window.location.protocol === 'capacitor:' ||
                      window.location.protocol === 'ionic:' ||
                      window.location.protocol === 'file:';

  const apiBaseUrl = isNativeApp ? 'https://www.mycarconcierge.com' : '';

  // When the app runs from bundled assets (no server.url), bare /api/* paths
  // would resolve to https://localhost/api/* — a dead end. Intercept them early
  // and prepend the absolute production URL. Only active on native; web callers
  // hit the same origin and need no rewrite.
  if (isNativeApp && apiBaseUrl) {
    var _nativeFetch = window.fetch;
    window.fetch = function(resource, init) {
      if (typeof resource === 'string' &&
          resource.length > 5 &&
          resource.slice(0, 5) === '/api/') {
        resource = apiBaseUrl + resource;
      }
      return _nativeFetch.call(this, resource, init);
    };
  }

  // ==========================================================================
  // TODO: server.js routes that still need Netlify function equivalents.
  //
  // These routes were served by the Replit Express server and have no
  // Netlify function or _redirects entry yet. They will 404 on production
  // until each is migrated to a Netlify function + _redirects rule.
  //
  // Priority order (admin portal impact):
  //   1. GET  /api/auth/check-access           — admin auth gate (blocks entire portal)
  //   2. GET  /api/admin/stats/overview        — dashboard overview tile
  //   3. GET  /api/admin/stats/revenue         — revenue chart
  //   4. GET  /api/admin/stats/users           — user stats tile
  //   5. GET  /api/admin/stats/orders          — orders stats tile
  //   6. GET  /api/admin/providers             — providers list tab
  //   7. GET  /api/admin/members               — members list tab
  //   8. GET  /api/admin/packages              — packages list tab
  //   9. GET  /api/admin/refunds               — refunds list tab
  //  10. POST /api/admin/refunds/:id/process   — refund processing
  //  11. GET  /api/admin/agreements            — agreements list tab
  //  12. GET  /api/admin/agreements/:id/pdf    — agreement PDF download
  //
  // Routes already working via _redirects → Netlify functions:
  //   /api/admin/agent-fleet/*       → agent-fleet-admin
  //   /api/admin/ai-ops/*            → ai-ops-admin
  //   /api/admin/driver-payouts*     → driver-payouts-admin
  //   /api/admin/provider-actions/*  → provider-admin
  //   /api/admin/provider-application/* → provider-application-review
  //   /api/admin/bgc/providers       → bgc-admin
  //   /api/admin/api-key-expiry*     → api-key-expiry-admin
  // ==========================================================================

  const defaultConfig = {
    siteUrl: 'https://mycarconcierge.com',
    siteUrlWww: 'https://www.mycarconcierge.com',
    appName: 'My Car Concierge',
    supportEmail: 'support@mycarconcierge.com',
    apiBaseUrl: apiBaseUrl,
    // TNC permit not yet obtained. Set true only after permit is in hand.
    RIDESHARE_ENABLED: false,
    // false = request-only ("submit a request, our team follows up");
    // true  = live dispatch, driver assignment, and tracking map. Enable after licensing.
    PICKUP_DISPATCH_ENABLED: false,
    // Driver launch fundraising — update these to reflect live Wefunder numbers.
    WEFUNDER_URL: 'https://wefunder.com/mycarconcierge',
    DRIVER_FUND_GOAL: 60000,
    DRIVER_FUND_RAISED: 0,
    // Manual donor count — update when Stripe shows new completed donations.
    DRIVER_FUND_DONOR_COUNT: 0,
    // Milestones are funded in order: first $25K → licensing, next $18K → insurance, etc.
    // JS computes per-milestone raised amounts from DRIVER_FUND_RAISED automatically.
    // Email addresses exempt from mandatory 2FA (e.g. App Store reviewer accounts)
    mandatory2faExemptEmails: [
      'jm.zanetis@gmail.com',
      'demo@mycarconcierge.com',
      'reviewer-member@mycarconcierge.com',
      'reviewer-provider@mycarconcierge.com',
    ],
    // Master switch — set to true only after enrollment is proven working end-to-end
    mandatory2faEnabled: false,
    // Unified Wallet — requires counsel sign-off before flipping true
    FEATURE_WALLET: false,
    // Driver Cancellation Policy — requires counsel sign-off before flipping true
    FEATURE_CANCELLATION_POLICY: false,
    // Multi-Vehicle Support for drivers — ship alongside cancellation policy
    FEATURE_MULTI_VEHICLE: false,
    DRIVER_FUND_MILESTONES: [
      { name: 'TNC Licensing & Legal', goal: 25000, description: 'Covers state permits and transportation attorney fees so we can legally operate' },
      { name: 'Commercial Auto Insurance', goal: 18000, description: 'Year 1 hired & non-owned auto policy with $1.5M liability coverage' },
      { name: 'Driver Onboarding & Training', goal: 10000, description: 'Background checks, training content, and certification program for our first drivers' },
      { name: 'Marketing & Launch', goal: 7000, description: 'Driver recruitment, provider outreach, and launch campaign' }
    ]
  };

  window.MCC_CONFIG = defaultConfig;

  // Audit Batch 2 (2026-07-16): /api/config endpoint not built; the fetch
  // always failed and the catch branch above set defaults anyway. Skip
  // the network round-trip and dispatch immediately with defaults —
  // eliminates the console 404 and shaves ~100ms off page load. Reinstate
  // when /api/config is actually implemented (Phase 6 decision).
  window.dispatchEvent(new CustomEvent('mcc-config-loaded', { detail: window.MCC_CONFIG }));
})();

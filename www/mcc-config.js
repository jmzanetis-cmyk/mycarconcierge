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
    RIDESHARE_ENABLED: false
  };

  window.MCC_CONFIG = defaultConfig;

  const configUrl = apiBaseUrl ? `${apiBaseUrl}/api/config` : '/api/config';

  fetch(configUrl)
    .then(function(response) {
      if (response.ok) return response.json();
      throw new Error('Config fetch failed');
    })
    .then(function(config) {
      window.MCC_CONFIG = Object.assign({}, defaultConfig, config, { apiBaseUrl: apiBaseUrl });
      window.dispatchEvent(new CustomEvent('mcc-config-loaded', { detail: window.MCC_CONFIG }));
    })
    .catch(function(error) {
      console.log('Using default config:', error.message);
      window.dispatchEvent(new CustomEvent('mcc-config-loaded', { detail: window.MCC_CONFIG }));
    });
})();

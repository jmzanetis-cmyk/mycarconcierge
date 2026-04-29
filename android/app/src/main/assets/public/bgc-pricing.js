// MCC Background Check pricing — single source of truth.
//
// The JS surfaces (bgc-onboarding.js, provider-onboarding.js) read the
// price from window.MCC_BGC_PRICING.display at runtime. The same value
// is also baked as a literal into static HTML files that cannot run JS:
//
//   www/email-templates/bgc-launch-provider.html
//   www/email-templates/bgc-launch-provider-es.html
//   www/marketing/providers.html        (EN + ES sections)
//
// When the price changes, update this file AND those HTML files.
// Current value: $70 per employee per year (finalized 2026-04-29).
(function (root) {
  'use strict';
  root.MCC_BGC_PRICING = Object.freeze({
    display: '$70'
  });
})(typeof window !== 'undefined' ? window : this);

// MCC Background Check pricing — browser-side accessor.
//
// >>> GENERATED FILE — DO NOT EDIT BY HAND <<<
// Regenerate via: npm run generate:bgc-pricing
//
// THE source of truth is lib/bgc-pricing.json. This file is produced by
// scripts/generate-bgc-pricing.js so the browser display value can never
// drift from the server-side value used by the email send pipeline. A
// drift-guard test (netlify/functions-tests/bgc-pricing-sync.test.js)
// fails CI if this file is edited by hand without re-running the generator.
//
// Marketing/onboarding pages render `<span data-bgc-price>$70</span>` —
// the literal acts as a no-JS fallback; this script overwrites it on
// load so the displayed value is always whatever `display` below holds.
// Pages that need the price in JS read `window.MCC_BGC_PRICING.display`.
(function (root) {
  'use strict';
  root.MCC_BGC_PRICING = Object.freeze({
    display: "$70"
  });

  function fillPriceTags() {
    if (typeof document === 'undefined') return;
    var price = root.MCC_BGC_PRICING.display;
    var nodes = document.querySelectorAll('[data-bgc-price]');
    for (var i = 0; i < nodes.length; i++) {
      // Optional `data-bgc-price-suffix` lets a single price span carry
      // surrounding copy like "/employee" without baking it into the literal.
      var suffix = nodes[i].getAttribute('data-bgc-price-suffix') || '';
      nodes[i].textContent = price + suffix;
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fillPriceTags, { once: true });
    } else {
      fillPriceTags();
    }
  }
})(typeof window !== 'undefined' ? window : this);

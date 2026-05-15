#!/usr/bin/env node
// Regenerate www/bgc-pricing.js from lib/bgc-pricing.json.
//
// lib/bgc-pricing.json is THE single source of truth for the per-employee
// BGC price. www/bgc-pricing.js (the browser-side twin) is a generated
// artifact — do not edit it by hand. After updating the JSON, run:
//
//   npm run generate:bgc-pricing
//
// The companion drift-guard test (netlify/functions-tests/bgc-pricing-sync.test.js)
// re-runs this generator into a buffer and fails if the on-disk
// www/bgc-pricing.js doesn't match, so CI catches anyone who edits the
// generated file directly or forgets to regenerate after a JSON bump.

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(REPO_ROOT, 'lib', 'bgc-pricing.json');
const OUT_PATH = path.join(REPO_ROOT, 'www', 'bgc-pricing.js');

function build(displayLiteral) {
  // JSON.stringify gives us a safely escaped JS string literal.
  const safe = JSON.stringify(displayLiteral);
  return `// MCC Background Check pricing — browser-side accessor.
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
// Marketing/onboarding pages render \`<span data-bgc-price>$70</span>\` —
// the literal acts as a no-JS fallback; this script overwrites it on
// load so the displayed value is always whatever \`display\` below holds.
// Pages that need the price in JS read \`window.MCC_BGC_PRICING.display\`.
(function (root) {
  'use strict';
  root.MCC_BGC_PRICING = Object.freeze({
    display: ${safe}
  });

  function fillPriceTags() {
    if (typeof document === 'undefined') return;
    var price = root.MCC_BGC_PRICING.display;
    var nodes = document.querySelectorAll('[data-bgc-price]');
    for (var i = 0; i < nodes.length; i++) {
      // Optional \`data-bgc-price-suffix\` lets a single price span carry
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
`;
}

function main() {
  const raw = fs.readFileSync(JSON_PATH, 'utf8');
  const data = JSON.parse(raw);
  if (typeof data.display !== 'string' || !data.display) {
    throw new Error(`lib/bgc-pricing.json must define a non-empty "display" string (got ${JSON.stringify(data.display)}).`);
  }
  const out = build(data.display);
  fs.writeFileSync(OUT_PATH, out);
  console.log(`Wrote ${path.relative(REPO_ROOT, OUT_PATH)} (display=${JSON.stringify(data.display)}).`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('generate-bgc-pricing failed:', err.message);
    process.exit(1);
  }
}

module.exports = { build };

// MCC Background Check pricing — Node-side accessor.
//
// The literal price lives in lib/bgc-pricing.json (THE single source of
// truth). This module just re-exports it for the email send pipeline
// (scripts/send-bgc-launch-broadcast.js renders {{bgc_price}} from
// BGC_PRICE_DISPLAY). The browser twin www/bgc-pricing.js is generated
// from the same JSON by scripts/generate-bgc-pricing.js, and a drift
// guard test (netlify/functions-tests/bgc-pricing-sync.test.js) fails
// CI if the two ever disagree.
//
// To change the price: edit lib/bgc-pricing.json, then run
//   npm run generate:bgc-pricing
// and commit both files.
'use strict';

const pricing = require('./bgc-pricing.json');

const BGC_PRICE_DISPLAY = pricing.display;

if (typeof BGC_PRICE_DISPLAY !== 'string' || !BGC_PRICE_DISPLAY) {
  throw new Error('lib/bgc-pricing.json is missing a non-empty "display" string.');
}

module.exports = { BGC_PRICE_DISPLAY };

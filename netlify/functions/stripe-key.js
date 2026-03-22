var utils = require('./utils');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return utils.optionsResponse();
  }

  if (event.httpMethod !== 'GET') {
    return utils.errorResponse(405, 'Method not allowed');
  }

  return utils.successResponse({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null
  });
};

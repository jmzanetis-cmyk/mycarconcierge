var utils = require('./utils');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return utils.optionsResponse();
  }

  if (event.httpMethod !== 'GET') {
    return utils.errorResponse(405, 'Method not allowed');
  }

  const params = event.queryStringParameters || {};
  const errorCode = params.error;
  const errorDescription = params.error_description;

  if (errorCode) {
    console.warn('[StripeConnect] OAuth callback error:', errorCode, errorDescription);
    const encoded = encodeURIComponent(errorDescription || errorCode);
    return {
      statusCode: 302,
      headers: {
        'Location': `https://mycarconcierge.com/founder-dashboard.html?stripe=error&reason=${encoded}`,
        'Access-Control-Allow-Origin': '*'
      },
      body: ''
    };
  }

  const stateParam = params.state;
  const code = params.code;

  if (!code && !stateParam) {
    return {
      statusCode: 302,
      headers: {
        'Location': 'https://mycarconcierge.com/founder-dashboard.html?stripe=error&reason=missing_params',
        'Access-Control-Allow-Origin': '*'
      },
      body: ''
    };
  }

  return {
    statusCode: 302,
    headers: {
      'Location': 'https://mycarconcierge.com/founder-dashboard.html?stripe=success',
      'Access-Control-Allow-Origin': '*'
    },
    body: ''
  };
};

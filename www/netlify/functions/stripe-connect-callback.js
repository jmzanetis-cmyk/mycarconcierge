var utils = require('./utils');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return utils.optionsResponse();
  }

  if (event.httpMethod !== 'GET') {
    return utils.errorResponse(405, 'Method not allowed');
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

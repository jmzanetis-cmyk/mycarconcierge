var crypto = require('crypto');

var headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

var UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(str) {
  return UUID_REGEX.test(str);
}

var GUEST_TOKEN_SECRET = process.env.ADMIN_PASSWORD ?
  crypto.createHash('sha256').update('mcc-guest-split-' + process.env.ADMIN_PASSWORD).digest('hex') :
  'mcc-guest-token-fallback-dev';

function generateGuestToken(participantId) {
  return crypto.createHmac('sha256', GUEST_TOKEN_SECRET).update(participantId).digest('hex').substring(0, 32);
}

function verifyGuestToken(participantId, token) {
  if (!token || token.length !== 32) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(generateGuestToken(participantId), 'utf8'));
  } catch (e) {
    return false;
  }
}

function extractPathParam(eventPath) {
  var parts = eventPath.split('/');
  return parts[parts.length - 1];
}

function createSupabaseClient() {
  var createClient = require('@supabase/supabase-js').createClient;
  var supabaseUrl = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return null;
  }
  return createClient(supabaseUrl, serviceKey);
}

function errorResponse(statusCode, message) {
  return {
    statusCode: statusCode,
    headers: headers,
    body: JSON.stringify({ error: message })
  };
}

function successResponse(data) {
  return {
    statusCode: 200,
    headers: headers,
    body: JSON.stringify(data)
  };
}

function optionsResponse() {
  return { statusCode: 200, headers: headers, body: '' };
}

module.exports = {
  headers: headers,
  isValidUUID: isValidUUID,
  generateGuestToken: generateGuestToken,
  verifyGuestToken: verifyGuestToken,
  extractPathParam: extractPathParam,
  createSupabaseClient: createSupabaseClient,
  errorResponse: errorResponse,
  successResponse: successResponse,
  optionsResponse: optionsResponse
};

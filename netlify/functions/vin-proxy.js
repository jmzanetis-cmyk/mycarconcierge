// GET /api/vin-proxy?vin=<17-char VIN>
//
// Thin proxy to the public NHTSA decodevin endpoint to avoid CORS.
// Returns the raw NHTSA JSON { Results: [{Variable, Value, ...}] }.

'use strict';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function resp(status, body) {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return resp(200, {});
  if (event.httpMethod !== 'GET') return resp(405, { error: 'Method not allowed' });

  const vin = (event.queryStringParameters?.vin || '').trim().toUpperCase();
  if (!vin || vin.length !== 17) {
    return resp(400, { error: 'VIN must be exactly 17 characters' });
  }

  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${encodeURIComponent(vin)}?format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      return resp(502, { error: `NHTSA returned ${res.status}` });
    }
    const data = await res.json();
    return resp(200, data);
  } catch (err) {
    console.error('[vin-proxy]', err.message);
    return resp(502, { error: 'NHTSA lookup failed' });
  }
};

// netlify/functions/admin-printful.js
//
// Proxies Printful API requests for the Merch Manager admin section.
//
// Routes (all via /api/admin/printful/*):
//   GET  /catalog                — list Printful product catalog
//   GET  /catalog/:id            — single catalog product
//   GET  /products               — store products
//   GET  /products/:id           — single store product
//   POST /products               — create store product
//   POST /products/bulk          — bulk create
//   GET  /store-products         — alias for /products
//   POST /mockup                 — generate mockup
//
// Requires PRINTFUL_API_KEY env var.
// Auth: x-admin-password or x-admin-token

'use strict';

const utils = require('./utils');

const PRINTFUL_BASE = 'https://api.printful.com';

function parsePath(event) {
  return (event.path || '')
    .replace(/^\/?\.netlify\/functions\/admin-printful\/?/, '')
    .replace(/^\/api\/admin\/printful\/?/, '')
    .replace(/^\/+|\/+$/g, '');
}

function checkAuth(event) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const incomingPw = (event.headers['x-admin-password'] || event.headers['X-Admin-Password'] || '').trim();
  const incomingTk = (event.headers['x-admin-token']    || event.headers['X-Admin-Token']    || '').trim();
  const teamTokens = (process.env.ADMIN_TEAM_TOKENS || '').split(',').map(t => t.trim()).filter(Boolean);
  return (adminPassword && incomingPw === adminPassword)
      || (incomingTk && teamTokens.includes(incomingTk));
}

async function printfulRequest(method, endpoint, body) {
  const apiKey = process.env.PRINTFUL_API_KEY;
  if (!apiKey) throw Object.assign(new Error('PRINTFUL_API_KEY not configured'), { statusCode: 503 });

  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'X-PF-Store-Id': process.env.PRINTFUL_STORE_ID || ''
    }
  };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);

  const res  = await fetch(`${PRINTFUL_BASE}${endpoint}`, opts);
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json?.error?.message || `Printful ${res.status}`), { statusCode: res.status });
  return json;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (!checkAuth(event)) return utils.errorResponse(401, 'Unauthorized');

  if (!process.env.PRINTFUL_API_KEY) {
    return utils.errorResponse(503, 'Printful integration not configured — set PRINTFUL_API_KEY in environment variables');
  }

  const path   = parsePath(event);
  const method = event.httpMethod;
  let body = null;
  if (event.body) { try { body = JSON.parse(event.body); } catch { return utils.errorResponse(400, 'Invalid JSON'); } }

  try {
    // catalog
    if (method === 'GET' && path === 'catalog') {
      const data = await printfulRequest('GET', '/v2/catalog-products?limit=100');
      return utils.successResponse({ products: data.result || data.data || [] });
    }
    const catalogIdMatch = path.match(/^catalog\/(\d+)$/);
    if (method === 'GET' && catalogIdMatch) {
      const data = await printfulRequest('GET', `/v2/catalog-products/${catalogIdMatch[1]}`);
      return utils.successResponse({ product: data.result || data.data });
    }

    // store products
    if (method === 'GET' && (path === 'products' || path === 'store-products')) {
      const data = await printfulRequest('GET', '/store/products?limit=100');
      return utils.successResponse({ products: data.result || [] });
    }
    const productIdMatch = path.match(/^products\/(\d+)$/);
    if (method === 'GET' && productIdMatch) {
      const data = await printfulRequest('GET', `/store/products/${productIdMatch[1]}`);
      return utils.successResponse({ product: data.result });
    }
    if (method === 'POST' && path === 'products' && body) {
      const data = await printfulRequest('POST', '/store/products', body);
      return utils.successResponse({ product: data.result });
    }
    if (method === 'POST' && path === 'products/bulk' && body) {
      const results = [];
      for (const item of (Array.isArray(body) ? body : [body])) {
        const data = await printfulRequest('POST', '/store/products', item);
        results.push(data.result);
      }
      return utils.successResponse({ products: results });
    }

    // mockup
    if (method === 'POST' && path === 'mockup' && body) {
      const { product_id, variant_ids, files } = body;
      if (!product_id) return utils.errorResponse(400, 'product_id required');
      const data = await printfulRequest('POST', `/mockup-generator/create-task/${product_id}`, { variant_ids, files });
      return utils.successResponse({ task: data.result });
    }

    return utils.errorResponse(404, 'Not found');
  } catch (e) {
    return utils.errorResponse(e.statusCode || 500, e.message);
  }
};

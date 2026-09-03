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
// Auth: Authorization: Bearer <supabase_token|team_token>

'use strict';

const utils = require('./utils');

const PRINTFUL_BASE = 'https://api.printful.com';

function parsePath(event) {
  return (event.path || '')
    .replace(/^\/?\.netlify\/functions\/admin-printful\/?/, '')
    .replace(/^\/api\/admin\/printful\/?/, '')
    .replace(/^\/+|\/+$/g, '');
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

  const supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  // Tries the existing ADMIN_TEAM_TOKENS / full-admin check first (unchanged,
  // still covers whatever automation already relies on it — see
  // netlify/functions-tests/admin-team-functions.test.js). Falls back to a
  // Team Login team member whose role has 'merch-manager' in
  // lib/admin-role-permissions.js (2026-09-03 — see
  // utils.authenticateAdminSection).
  const caller = (await utils.authenticateBearerAdminOrTeam(event, supabase))
    || (await utils.authenticateAdminSection(event, supabase, 'merch-manager'));
  if (!caller) return utils.errorResponse(401, 'Unauthorized');

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
    // Task: admin-portal audit — this handler used to forward the frontend's
    // {name, variantIds, retailPrice, designUrl, designPosition} body straight
    // to Printful's /store/products, which actually expects a
    // {sync_product, sync_variants} shape — every create silently sent the
    // wrong payload. server.js:2972 (handleCreatePrintfulProduct) already had
    // the correct working transform; ported here rather than reinvented.
    if (method === 'POST' && path === 'products' && body) {
      const { name, variantIds, retailPrice, designUrl, designPosition } = body;
      if (!name || !Array.isArray(variantIds) || variantIds.length === 0) {
        return utils.errorResponse(400, 'Missing required fields: name, variantIds');
      }
      const fileSpec = designUrl ? [{ type: designPosition || 'front', url: designUrl }] : [];
      const syncVariants = variantIds.map(vid => ({
        variant_id: vid,
        retail_price: retailPrice || '29.99',
        files: fileSpec
      }));
      const data = await printfulRequest('POST', '/store/products', {
        sync_product: { name, thumbnail: designUrl || null },
        sync_variants: syncVariants
      });
      return utils.successResponse({
        product: {
          id: data.result.id,
          externalId: data.result.external_id,
          name: data.result.name,
          variants: data.result.sync_variants?.length || 0
        }
      });
    }

    // Task: admin-portal audit — this used to treat the whole request body
    // (a wrapper object, not an array) as a single Printful item, and
    // returned {products: results} instead of the {results, summary} shape
    // admin.js:10990 actually reads. Ported the working loop from
    // server.js:3049 (handleBulkCreatePrintfulProducts).
    if (method === 'POST' && path === 'products/bulk' && body) {
      const { name, designUrl, retailPrice, products } = body;
      if (!name || !Array.isArray(products) || products.length === 0) {
        return utils.errorResponse(400, 'Missing required fields: name, products array');
      }
      const results = [];
      for (const productSpec of products) {
        const { catalogProductId, variantIds, productName } = productSpec || {};
        if (!catalogProductId || !Array.isArray(variantIds) || variantIds.length === 0) {
          results.push({ catalogProductId, success: false, error: 'Missing catalogProductId or variantIds' });
          continue;
        }
        const fileSpec = designUrl ? [{ type: 'front', url: designUrl }] : [];
        const syncVariants = variantIds.map(vid => ({
          variant_id: vid,
          retail_price: retailPrice || '29.99',
          files: fileSpec
        }));
        const fullProductName = productName || name;
        try {
          const data = await printfulRequest('POST', '/store/products', {
            sync_product: { name: fullProductName, thumbnail: designUrl || null },
            sync_variants: syncVariants
          });
          results.push({
            catalogProductId,
            success: true,
            product: {
              id: data.result.id,
              externalId: data.result.external_id,
              name: data.result.name,
              variants: data.result.sync_variants?.length || 0
            }
          });
        } catch (e) {
          results.push({ catalogProductId, success: false, error: e.message });
        }
      }
      const succeeded = results.filter(r => r.success).length;
      return utils.successResponse({
        results,
        summary: { total: results.length, succeeded, failed: results.length - succeeded }
      });
    }

    // Task: admin-portal audit — DELETE was never implemented at all (fell
    // through to 404); deleteStoreProduct() in admin.js always failed.
    // Ported from server.js:3164 (handleDeletePrintfulProduct).
    const deleteIdMatch = path.match(/^products\/(\d+)$/);
    if (method === 'DELETE' && deleteIdMatch) {
      try {
        await printfulRequest('DELETE', `/store/products/${deleteIdMatch[1]}`);
      } catch (e) {
        // Printful 404s on an already-deleted product — treat as success,
        // matching server.js's original behavior.
        if (e.statusCode !== 404) throw e;
      }
      return utils.successResponse({ success: true });
    }

    // Task: admin-portal audit — this used to accept snake_case
    // {product_id, variant_ids, files} and just return the raw create-task
    // response as {task}, while admin.js:10561 sends camelCase
    // {productId, variantIds, designUrl} and reads data.mockupUrl. Beyond
    // the field mismatch, Printful's mockup generator is async — a task has
    // to be created, then polled until it completes — which this handler
    // never did. Ported the full create + poll flow from
    // server.js:3250 (handlePrintfulMockup) so the frontend actually gets a
    // finished mockup image, not just a pending task.
    if (method === 'POST' && path === 'mockup' && body) {
      const { productId, variantIds, designUrl } = body;
      if (!productId || !Array.isArray(variantIds) || variantIds.length === 0 || !designUrl) {
        return utils.errorResponse(400, 'Missing required fields: productId, variantIds, designUrl');
      }

      const mockupPayload = {
        variant_ids: variantIds.slice(0, 1),
        format: 'jpg',
        files: [{
          placement: 'front',
          image_url: designUrl,
          position: { area_width: 1800, area_height: 2400, width: 1200, height: 1200, top: 300, left: 300 }
        }]
      };

      const createData = await printfulRequest('POST', `/mockup-generator/create-task/${productId}`, mockupPayload);
      const taskKey = createData.result?.task_key;
      if (!taskKey) throw Object.assign(new Error('Failed to create mockup task'), { statusCode: 502 });

      await new Promise(resolve => setTimeout(resolve, 2500));

      let mockupUrl = null;
      let attempts = 0;
      const maxAttempts = 6; // kept short vs. server.js's 10 — Netlify sync functions have a hard wall-clock limit
      while (!mockupUrl && attempts < maxAttempts) {
        attempts++;
        const resultData = await printfulRequest('GET', `/mockup-generator/task?task_key=${taskKey}`);
        if (resultData.result?.status === 'completed' && resultData.result?.mockups?.length > 0) {
          mockupUrl = resultData.result.mockups[0].mockup_url;
          break;
        } else if (resultData.result?.status === 'failed') {
          throw Object.assign(new Error('Mockup generation failed: ' + (resultData.result.error || 'Unknown error')), { statusCode: 502 });
        }
        if (attempts < maxAttempts) await new Promise(resolve => setTimeout(resolve, 1200));
      }

      if (!mockupUrl) {
        // Still pending after our polling budget — surface a clear, distinct
        // error rather than a generic timeout so the frontend can tell the
        // admin to retry rather than assume something is broken.
        throw Object.assign(new Error('Mockup is still generating — please try again in a few seconds'), { statusCode: 202 });
      }

      return utils.successResponse({ success: true, mockupUrl, taskKey });
    }

    return utils.errorResponse(404, 'Not found');
  } catch (e) {
    return utils.errorResponse(e.statusCode || 500, e.message);
  }
};

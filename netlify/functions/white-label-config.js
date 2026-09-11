// netlify/functions/white-label-config.js
//
// GET /api/white-label/config (alias: GET /api/tenant/config)
//
// Public, unauthenticated by default. Resolves which white-label tenant (if
// any) owns the requesting domain/subdomain and returns their branding so
// www/white-label-client.js can skin the page. Previously dead-called --
// server.js's dev route was removed and never ported. Ported near-verbatim
// from the pre-deletion www/server.js history (git show 5587e05:www/server.js).
//
// Two lookup paths:
//   - MCC-managed subdomain (X-Forwarded-Host ending in mycarconcierge.com):
//     extract the subdomain and match white_label_tenants.subdomain.
//   - Custom domain (any other X-Forwarded-Host / Host): match
//     white_label_tenants.domain exactly. The DB match is the trust anchor,
//     so a spoofed header just fails to resolve a tenant -- it can't be used
//     to impersonate one.
//
// ?preview_domain=<domain> lets the admin panel preview a tenant's branding
// without owning the domain; gated by the x-admin-token header.
//
// When a real end-user (Bearer token) hits a resolved tenant domain, this
// mints a short-lived domain_join_token so the client can silently call
// POST /api/white-label/tenant/join and attach the user to that tenant.
'use strict';

var crypto = require('node:crypto');
var utils = require('./utils');

var MCC_BASE_DOMAIN = 'mycarconcierge.com';
var WL_COLS = 'id, brand_name, logo_url, favicon_url, primary_color, accent_color, bg_color, custom_css, plan';
var DOMAIN_JOIN_TOKEN_TTL_MS = 10 * 60 * 1000;

function getDomainJoinSecret() {
  return process.env.ADMIN_PASSWORD || 'wl-domain-secret';
}

function mintDomainJoinToken(tenantId, userId) {
  var exp = Date.now() + DOMAIN_JOIN_TOKEN_TTL_MS;
  var sig = crypto.createHmac('sha256', getDomainJoinSecret()).update(tenantId + ':' + userId + ':' + exp).digest('hex');
  var payload = { tenant_id: tenantId, user_id: userId, exp: exp, sig: sig };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function resolveHostCandidates(event) {
  var h = event.headers || {};
  var xfHost = h['x-forwarded-host'] || h['X-Forwarded-Host'];
  var host = h['host'] || h['Host'];
  var result = { subdomain: null, customDomains: [] };

  function isManagedHost(hostname) {
    return hostname === MCC_BASE_DOMAIN || (hostname && hostname.slice(-(MCC_BASE_DOMAIN.length + 1)) === '.' + MCC_BASE_DOMAIN);
  }
  function isSkippable(hostname) {
    if (!hostname) return true;
    var h2 = hostname.toLowerCase();
    return h2.indexOf('localhost') !== -1 || h2.indexOf('replit') !== -1;
  }

  if (xfHost && isManagedHost(xfHost.split(':')[0])) {
    var bare = xfHost.split(':')[0];
    var sub = bare.slice(0, bare.length - MCC_BASE_DOMAIN.length - 1);
    if (sub && sub !== 'www' && sub !== 'mycarconcierge' && !isSkippable(bare)) {
      result.subdomain = sub;
    }
    return result;
  }

  [xfHost, host].forEach(function (raw) {
    if (!raw) return;
    var bare = raw.split(':')[0];
    if (bare.indexOf(MCC_BASE_DOMAIN) === -1 && !isSkippable(bare) && result.customDomains.indexOf(bare) === -1) {
      result.customDomains.push(bare);
    }
  });
  return result;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'GET') return utils.errorResponse(405, 'Method not allowed');

  try {
    var qs = event.queryStringParameters || {};
    var previewDomain = qs.preview_domain;

    if (previewDomain) {
      var adminToken = (event.headers || {})['x-admin-token'] || (event.headers || {})['X-Admin-Token'];
      if (!adminToken || !process.env.ADMIN_PASSWORD || adminToken !== process.env.ADMIN_PASSWORD) {
        return utils.errorResponse(401, 'Unauthorized');
      }
    }

    var supabase = utils.createSupabaseClient();
    if (!supabase) {
      return { statusCode: 200, headers: utils.headers, body: JSON.stringify({ tenant: null, is_white_label: false }) };
    }

    var tenant = null;
    if (previewDomain) {
      var pRes = await supabase.from('white_label_tenants').select(WL_COLS).eq('domain', previewDomain).eq('status', 'active').maybeSingle();
      tenant = pRes.data || null;
    } else {
      var candidates = resolveHostCandidates(event);
      if (candidates.subdomain) {
        var sRes = await supabase.from('white_label_tenants').select(WL_COLS).eq('subdomain', candidates.subdomain).eq('status', 'active').maybeSingle();
        tenant = sRes.data || null;
      } else {
        for (var i = 0; i < candidates.customDomains.length && !tenant; i++) {
          var dRes = await supabase.from('white_label_tenants').select(WL_COLS).eq('domain', candidates.customDomains[i]).eq('status', 'active').maybeSingle();
          tenant = dRes.data || null;
        }
      }
    }

    var domainJoinToken = null;
    if (tenant && !previewDomain) {
      var authHeader = (event.headers || {})['authorization'] || (event.headers || {})['Authorization'];
      var token = authHeader ? String(authHeader).replace(/^Bearer\s+/i, '').trim() : null;
      if (token) {
        try {
          var authRes = await supabase.auth.getUser(token);
          if (!authRes.error && authRes.data && authRes.data.user) {
            domainJoinToken = mintDomainJoinToken(tenant.id, authRes.data.user.id);
          }
        } catch (e) { /* no-op: an auth hiccup here just means no auto-join token this request */ }
      }
    }

    var cacheControl = (previewDomain || domainJoinToken) ? 'no-store' : 'public, max-age=60';
    return {
      statusCode: 200,
      headers: Object.assign({}, utils.headers, { 'Cache-Control': cacheControl }),
      body: JSON.stringify({ tenant: tenant || null, is_white_label: !!tenant, domain_join_token: domainJoinToken })
    };
  } catch (err) {
    console.error('[white-label-config]', err.message);
    // Never 5xx here -- www/white-label-client.js runs on every page load and
    // must no-op safely when tenant resolution fails for any reason.
    return { statusCode: 200, headers: utils.headers, body: JSON.stringify({ tenant: null, is_white_label: false }) };
  }
};

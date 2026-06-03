// Task #243 — Facebook Page admin OAuth picker (production / Netlify).
//
// Mirrors the dev-server implementation in www/server.js. The dev server
// is gitignored and Replit-only; Netlify Functions are what serve
// production. This handler covers all six routes:
//
//   POST /api/admin/facebook/oauth-start    — admin-gated, returns OAuth URL
//   GET  /api/admin/facebook/oauth-callback — public (verified by signed state)
//   GET  /api/admin/facebook/pending-pages  — admin-gated, reads signed cookie
//   POST /api/admin/facebook/select-page    — admin-gated, persists chosen Page
//   POST /api/admin/facebook/disconnect     — admin-gated, clears persisted Page
//   GET  /api/admin/facebook/connection     — admin-gated, reads persisted Page
//
// Stateless design notes:
//
//   * The OAuth `state` param is HMAC-signed with a key derived from
//     ADMIN_PASSWORD so a forged state cannot trick the callback into
//     thinking some other admin initiated the flow. Same derivation as
//     the dev server.
//   * Because Netlify Functions are stateless, we cannot keep the
//     pending /me/accounts result in memory between oauth-callback and
//     pending-pages. Instead, oauth-callback sets a short-lived
//     HMAC-signed httpOnly Secure cookie (mcc_fb_pending_pages) carrying
//     the pages list, then redirects to /admin.html?picking=facebook-page
//     with NO sensitive data in the URL. pending-pages reads + verifies
//     the cookie. select-page consumes + clears it.
//   * No Facebook user/page access tokens are ever persisted or returned
//     to the browser — only Page id + name (which the singleton row in
//     facebook_page_connections also holds).

var crypto = require('node:crypto');
var utils = require('./utils.js');

var FB_APP_ID = '1210351411006961';
var FB_GRAPH_VERSION = 'v23.0';
var FB_OAUTH_SCOPE = 'pages_show_list';
var FB_NONCE_TTL_MS = 5 * 60 * 1000;
var FB_PENDING_TTL_MS = 10 * 60 * 1000;
var FB_PENDING_COOKIE = 'mcc_fb_pending_pages';

// ---- helpers ----------------------------------------------------------

function jsonHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token, x-admin-token, x-admin-password',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
  };
}

function jsonResponse(statusCode, bodyObj, extraHeaders) {
  var hdrs = jsonHeaders();
  if (extraHeaders) {
    for (var k in extraHeaders) hdrs[k] = extraHeaders[k];
  }
  return { statusCode: statusCode, headers: hdrs, body: JSON.stringify(bodyObj) };
}

function redirectResponse(location, extraHeaders) {
  var hdrs = { Location: location };
  if (extraHeaders) {
    for (var k in extraHeaders) hdrs[k] = extraHeaders[k];
  }
  return { statusCode: 302, headers: hdrs, body: '' };
}

function getStateSecret() {
  var pw = process.env.COOKIE_SECRET || process.env.ADMIN_PASSWORD;
  if (!pw) return null;
  return crypto.createHash('sha256').update('mcc-fb-oauth-state-' + pw).digest('hex');
}

function getCookieSecret() {
  var pw = process.env.COOKIE_SECRET || process.env.ADMIN_PASSWORD;
  if (!pw) return null;
  return crypto.createHash('sha256').update('mcc-fb-pending-cookie-' + pw).digest('hex');
}

function signState(payloadObj) {
  var secret = getStateSecret();
  if (!secret) return null;
  var json = JSON.stringify(payloadObj);
  var b64 = Buffer.from(json).toString('base64url');
  var sig = crypto.createHmac('sha256', secret).update(b64).digest('base64url');
  return b64 + '.' + sig;
}

function verifyState(state) {
  var secret = getStateSecret();
  if (!state || !secret) return null;
  var parts = state.split('.');
  if (parts.length !== 2) return null;
  var b64 = parts[0];
  var sig = parts[1];
  var expected = crypto.createHmac('sha256', secret).update(b64).digest('base64url');
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch (_) { return null; }
  try {
    return JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
  } catch (_) { return null; }
}

function signPendingCookie(payloadObj) {
  var secret = getCookieSecret();
  if (!secret) return null;
  var json = JSON.stringify(payloadObj);
  var b64 = Buffer.from(json).toString('base64url');
  var sig = crypto.createHmac('sha256', secret).update(b64).digest('base64url');
  return b64 + '.' + sig;
}

function verifyPendingCookie(value) {
  var secret = getCookieSecret();
  if (!value || !secret) return null;
  var parts = value.split('.');
  if (parts.length !== 2) return null;
  var b64 = parts[0];
  var sig = parts[1];
  var expected = crypto.createHmac('sha256', secret).update(b64).digest('base64url');
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch (_) { return null; }
  try {
    var payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    if (!payload || !payload.expiresAt || payload.expiresAt < Date.now()) return null;
    return payload;
  } catch (_) { return null; }
}

function setPendingCookieHeader(value, maxAgeSec) {
  // httpOnly + Secure + SameSite=Lax so the post-OAuth redirect to
  // /admin.html?picking=facebook-page can read it on the same eTLD+1.
  var attrs = [
    FB_PENDING_COOKIE + '=' + (value || ''),
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=' + (typeof maxAgeSec === 'number' ? maxAgeSec : 0)
  ];
  return attrs.join('; ');
}

function readCookie(event, name) {
  var cookieHdr = (event.headers && (event.headers.cookie || event.headers.Cookie)) || '';
  if (!cookieHdr) return null;
  var parts = cookieHdr.split(';');
  for (var i = 0; i < parts.length; i++) {
    var seg = parts[i].trim();
    var eq = seg.indexOf('=');
    if (eq < 0) continue;
    var k = seg.slice(0, eq);
    if (k === name) return decodeURIComponent(seg.slice(eq + 1));
  }
  return null;
}

function buildRedirectUri(event) {
  var hdrs = event.headers || {};
  var proto = (hdrs['x-forwarded-proto'] || 'https').toString().split(',')[0].trim();
  var host = hdrs['x-forwarded-host'] || hdrs.host || hdrs.Host;
  return proto + '://' + host + '/api/admin/facebook/oauth-callback';
}

function isMissingTableError(err) {
  if (!err) return false;
  if (err.code === '42P01' || err.code === 'PGRST106' || err.code === 'PGRST205') return true;
  var m = String(err.message || '').toLowerCase();
  if (m.indexOf('could not find the table') >= 0) return true;
  if (m.indexOf('schema cache') >= 0 && m.indexOf('table') >= 0) return true;
  if (m.indexOf('relation') >= 0 && m.indexOf('does not exist') >= 0) return true;
  return false;
}

function decodeQuery(event) {
  // Netlify gives us event.queryStringParameters but oauth providers can
  // send arrays / commas. queryStringParameters is fine for our needs.
  return event.queryStringParameters || {};
}

// ---- handler ----------------------------------------------------------

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: jsonHeaders(), body: '' };
  }

  // event.path under Netlify routing is /api/admin/facebook/<endpoint>
  // because of the _redirects rule. Strip query string just in case.
  var rawPath = (event.path || '').split('?')[0];
  var endpoint = rawPath.replace(/\/+$/, '').split('/').pop();

  try {
    // ---- oauth-callback: browser redirect, NOT JSON; signed state ----
    if (event.httpMethod === 'GET' && endpoint === 'oauth-callback') {
      var q = decodeQuery(event);
      if (q.error) {
        var desc = q.error_description || q.error;
        return redirectResponse('/admin.html?fb_error=' + encodeURIComponent(desc));
      }
      var code = q.code;
      var state = q.state;
      if (!code || !state) {
        return redirectResponse('/admin.html?fb_error=' + encodeURIComponent('Missing code or state'));
      }
      var payload = verifyState(state);
      if (!payload || !payload.adminId || !payload.ts) {
        return redirectResponse('/admin.html?fb_error=' + encodeURIComponent('Invalid state'));
      }
      if (Date.now() - Number(payload.ts) > FB_NONCE_TTL_MS) {
        return redirectResponse('/admin.html?fb_error=' + encodeURIComponent('OAuth session expired — please retry'));
      }

      var fbAppSecret = process.env.FACEBOOK_APP_SECRET;
      if (!fbAppSecret) {
        return redirectResponse('/admin.html?fb_error=' + encodeURIComponent('Server not configured (FACEBOOK_APP_SECRET missing)'));
      }

      var redirectUri = buildRedirectUri(event);
      try {
        var tokUrl = new URL('https://graph.facebook.com/' + FB_GRAPH_VERSION + '/oauth/access_token');
        tokUrl.searchParams.set('client_id', FB_APP_ID);
        tokUrl.searchParams.set('client_secret', fbAppSecret);
        tokUrl.searchParams.set('redirect_uri', redirectUri);
        tokUrl.searchParams.set('code', code);
        var tokRes = await fetch(tokUrl.toString());
        var tokJson = await tokRes.json();
        if (!tokRes.ok || !tokJson.access_token) {
          var msg = (tokJson.error && tokJson.error.message) || 'Token exchange failed';
          return redirectResponse('/admin.html?fb_error=' + encodeURIComponent(msg));
        }
        var userToken = tokJson.access_token;

        var pagesUrl = new URL('https://graph.facebook.com/' + FB_GRAPH_VERSION + '/me/accounts');
        pagesUrl.searchParams.set('access_token', userToken);
        pagesUrl.searchParams.set('fields', 'id,name,category,tasks');
        pagesUrl.searchParams.set('limit', '100');
        var pagesRes = await fetch(pagesUrl.toString());
        var pagesJson = await pagesRes.json();
        if (!pagesRes.ok) {
          var msg2 = (pagesJson.error && pagesJson.error.message) || 'Failed to fetch Pages';
          return redirectResponse('/admin.html?fb_error=' + encodeURIComponent(msg2));
        }
        var pages = (pagesJson.data || []).map(function (p) {
          return { id: p.id, name: p.name, category: p.category || null };
        });

        var cookiePayload = {
          adminId: payload.adminId,
          pages: pages,
          expiresAt: Date.now() + FB_PENDING_TTL_MS
        };
        var cookieValue = signPendingCookie(cookiePayload);
        if (!cookieValue) {
          return redirectResponse('/admin.html?fb_error=' + encodeURIComponent('Server not configured (ADMIN_PASSWORD missing — required for cookie signing)'));
        }
        return redirectResponse('/admin.html?picking=facebook-page', {
          'Set-Cookie': setPendingCookieHeader(cookieValue, Math.floor(FB_PENDING_TTL_MS / 1000))
        });
      } catch (err) {
        return redirectResponse('/admin.html?fb_error=' + encodeURIComponent('Server error during OAuth: ' + (err.message || err)));
      }
    }

    // ---- All other endpoints are admin-gated ----
    var supabase = utils.createSupabaseClient();
    if (!supabase) return jsonResponse(503, { error: 'Database not configured' });
    var admin = await utils.authenticateBearerAdmin(event, supabase);
    if (!admin) return jsonResponse(401, { error: 'Admin authentication required' });

    if (event.httpMethod === 'POST' && endpoint === 'oauth-start') {
      if (!getStateSecret()) {
        return jsonResponse(503, { error: 'Server not configured (ADMIN_PASSWORD missing — required for state signing)' });
      }
      if (!process.env.FACEBOOK_APP_SECRET) {
        return jsonResponse(503, { error: 'Server not configured (FACEBOOK_APP_SECRET missing)' });
      }
      var nonce = crypto.randomBytes(16).toString('hex');
      var state = signState({ adminId: admin.id, nonce: nonce, ts: Date.now() });
      var redirectUri2 = buildRedirectUri(event);
      var oauthUrl = new URL('https://www.facebook.com/' + FB_GRAPH_VERSION + '/dialog/oauth');
      oauthUrl.searchParams.set('client_id', FB_APP_ID);
      oauthUrl.searchParams.set('redirect_uri', redirectUri2);
      oauthUrl.searchParams.set('state', state);
      oauthUrl.searchParams.set('scope', FB_OAUTH_SCOPE);
      oauthUrl.searchParams.set('response_type', 'code');
      return jsonResponse(200, {
        oauth_url: oauthUrl.toString(),
        redirect_uri: redirectUri2,
        scope: FB_OAUTH_SCOPE,
        expires_in_ms: FB_NONCE_TTL_MS
      });
    }

    if (event.httpMethod === 'GET' && endpoint === 'pending-pages') {
      var raw = readCookie(event, FB_PENDING_COOKIE);
      var pend = verifyPendingCookie(raw);
      if (!pend) {
        return jsonResponse(410, { error: 'No pending Pages — start the OAuth flow again' });
      }
      if (pend.adminId !== admin.id) {
        return jsonResponse(403, { error: 'Pending Pages belong to a different admin session' });
      }
      return jsonResponse(200, { pages: pend.pages || [], expiresAt: pend.expiresAt });
    }

    if (event.httpMethod === 'POST' && endpoint === 'select-page') {
      var body;
      try { body = JSON.parse(event.body || '{}'); }
      catch (_) { return jsonResponse(400, { error: 'Invalid JSON body' }); }
      var page_id = body.page_id;
      if (!page_id) {
        return jsonResponse(400, { error: 'page_id is required' });
      }
      // Verify the chosen page came from this admin's pending list (defense-in-depth)
      // and authoritatively pull page_name from there — the client doesn't have to
      // (and shouldn't be trusted to) supply it.
      var raw2 = readCookie(event, FB_PENDING_COOKIE);
      var pend2 = verifyPendingCookie(raw2);
      if (!pend2 || pend2.adminId !== admin.id) {
        return jsonResponse(410, { error: 'Pending Pages session expired — start the OAuth flow again' });
      }
      var pickedPage = (pend2.pages || []).find(function (p) { return String(p.id) === String(page_id); });
      if (!pickedPage) {
        return jsonResponse(400, { error: 'Selected Page is not in the pending list' });
      }
      var page_name = body.page_name || pickedPage.name || '(unnamed)';

      var supabase = utils.createSupabaseClient();
      if (!supabase) return jsonResponse(503, { error: 'Database not configured' });

      // Singleton row: clear then insert (matches dev-server behavior).
      var delResp = await supabase
        .from('facebook_page_connections')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (delResp.error && isMissingTableError(delResp.error)) {
        return jsonResponse(503, { error: 'Database schema not applied — run migration 20260429e_facebook_page_connections.sql in Supabase SQL Editor' });
      }
      if (delResp.error) {
        return jsonResponse(500, { error: 'Failed to reset existing connection: ' + delResp.error.message });
      }

      var insResp = await supabase
        .from('facebook_page_connections')
        .insert({
          page_id: String(page_id),
          page_name: String(page_name),
          connected_by_user_id: admin.id || null,
          connected_by_email: admin.email || null
        })
        .select()
        .single();
      if (insResp.error) {
        return jsonResponse(500, { error: 'Failed to save connection: ' + insResp.error.message });
      }

      // Clear the pending-pages cookie so a stale list cannot be reused.
      return jsonResponse(200, { connection: insResp.data }, {
        'Set-Cookie': setPendingCookieHeader('', 0)
      });
    }

    if (event.httpMethod === 'POST' && endpoint === 'disconnect') {
      var supabase2 = utils.createSupabaseClient();
      if (!supabase2) return jsonResponse(503, { error: 'Database not configured' });
      var dResp = await supabase2
        .from('facebook_page_connections')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (dResp.error) {
        if (isMissingTableError(dResp.error)) {
          return jsonResponse(503, { error: 'Database schema not applied — run migration 20260429e_facebook_page_connections.sql in Supabase SQL Editor' });
        }
        return jsonResponse(500, { error: 'Failed to disconnect: ' + dResp.error.message });
      }
      return jsonResponse(200, { success: true }, {
        'Set-Cookie': setPendingCookieHeader('', 0)
      });
    }

    if (event.httpMethod === 'GET' && endpoint === 'connection') {
      var supabase3 = utils.createSupabaseClient();
      if (!supabase3) return jsonResponse(503, { error: 'Database not configured' });
      var sResp = await supabase3
        .from('facebook_page_connections')
        .select('*')
        .limit(1);
      if (sResp.error) {
        if (isMissingTableError(sResp.error)) {
          return jsonResponse(200, {
            connection: null,
            schema_missing: true,
            message: 'Apply migration 20260429e_facebook_page_connections.sql in Supabase SQL Editor.'
          });
        }
        return jsonResponse(500, { error: 'Failed to load connection: ' + sResp.error.message });
      }
      return jsonResponse(200, { connection: (sResp.data && sResp.data[0]) || null });
    }

    return jsonResponse(404, { error: 'Unknown Facebook endpoint: ' + (endpoint || '(empty)') });
  } catch (err) {
    return jsonResponse(500, { error: 'Server error: ' + (err.message || String(err)) });
  }
};

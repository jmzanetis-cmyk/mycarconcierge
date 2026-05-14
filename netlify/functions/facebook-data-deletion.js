// Task #186 — Facebook account-deletion callback (production handler)
//
// Facebook pings POST <fn URL> when a user removes the My Car Concierge app
// from their Facebook account. We:
//   1. Verify the signed_request payload using FACEBOOK_APP_SECRET.
//   2. Look up the matching MCC user by Facebook user_id.
//   3. Run the same account-deletion cascade we use in-app — implemented
//      once in ./account-deletion-core.js and shared with www/server.js.
//   4. Respond { url, confirmation_code } per Facebook's spec so the user can
//      track progress at /data-deletion-status.html?code=<confirmation_code>.
//
// This function also serves GET requests as a status lookup so the static
// data-deletion-status.html page can fetch it from the same Netlify origin
// without needing a separate function. The status route is matched on the
// presence of the `code` query parameter.

var crypto = require('crypto');
var utils = require('./utils.js');
var core = require('./account-deletion-core.js');

function base64UrlDecode(str) {
  var pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replaceAll('-', '+').replaceAll('_', '/') + pad, 'base64');
}

function parseSignedRequest(signedRequest, appSecret) {
  if (!signedRequest || typeof signedRequest !== 'string') {
    throw new Error('Missing signed_request');
  }
  var parts = signedRequest.split('.');
  if (parts.length !== 2) throw new Error('Malformed signed_request');
  var encodedSig = parts[0];
  var payload = parts[1];
  var expected = crypto.createHmac('sha256', appSecret).update(payload).digest();
  var provided;
  try {
    provided = base64UrlDecode(encodedSig);
  } catch (e) {
    throw new Error('Malformed signed_request signature');
  }
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    throw new Error('Invalid signed_request signature');
  }
  var parsed;
  try {
    parsed = JSON.parse(base64UrlDecode(payload).toString('utf8'));
  } catch (e) {
    throw new Error('Malformed signed_request payload');
  }
  if (!parsed || parsed.algorithm !== 'HMAC-SHA256') {
    throw new Error('Unexpected signed_request algorithm');
  }
  return parsed;
}

function parseBody(event) {
  var body = event.body || '';
  if (event.isBase64Encoded) {
    body = Buffer.from(body, 'base64').toString('utf8');
  }
  var ct = ((event.headers && (event.headers['content-type'] || event.headers['Content-Type'])) || '').toLowerCase();
  if (ct.indexOf('application/json') !== -1) {
    try { return body ? JSON.parse(body) : {}; } catch (e) { throw new Error('Invalid JSON body'); }
  }
  var params = new URLSearchParams(body);
  var obj = {};
  params.forEach(function (v, k) { obj[k] = v; });
  return obj;
}

// Returns the matching user from a single page of auth.admin.listUsers, or
// null when no row in the page links the given facebook_user_id.
function _findFacebookMatchInPage(users, facebookUserId) {
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    var idents = Array.isArray(u.identities) ? u.identities : [];
    for (var j = 0; j < idents.length; j++) {
      var ident = idents[j];
      if (ident.provider === 'facebook' && (ident.provider_id === facebookUserId || ident.id === facebookUserId)) {
        return u;
      }
    }
  }
  return null;
}

async function _scanIdentitiesForFacebookId(supabase, facebookUserId) {
  var page = 1;
  var perPage = 200;
  while (page <= 50) {
    var listed = await supabase.auth.admin.listUsers({ page: page, perPage: perPage });
    if (listed.error) {
      console.error('[facebook-data-deletion] listUsers error:', listed.error);
      return null;
    }
    var users = (listed.data && listed.data.users) || [];
    var matched = _findFacebookMatchInPage(users, facebookUserId);
    if (matched) {
      await supabase.from('profiles').update({ facebook_user_id: facebookUserId }).eq('id', matched.id);
      return { id: matched.id, email: matched.email, facebook_user_id: facebookUserId };
    }
    if (users.length < perPage) return null;
    page += 1;
  }
  return null;
}

async function lookupUserByFacebookId(supabase, facebookUserId) {
  var existing = await supabase
    .from('profiles')
    .select('id, email, facebook_user_id')
    .eq('facebook_user_id', facebookUserId)
    .maybeSingle();
  if (existing && existing.data && existing.data.id) return existing.data;

  try {
    return await _scanIdentitiesForFacebookId(supabase, facebookUserId);
  } catch (e) {
    console.error('[facebook-data-deletion] identity scan exception:', e);
    return null;
  }
}

async function handleStatusLookup(supabase, code) {
  // confirmation_code is generated as crypto.randomBytes(8).toString('hex'),
  // so it must be exactly 16 hex chars. Reject anything else up-front so we
  // never run an arbitrary string against the database.
  var CONFIRMATION_CODE_RE = /^[0-9a-f]{16}$/;
  var normalized = String(code || '').trim().toLowerCase();
  if (!normalized || !CONFIRMATION_CODE_RE.test(normalized)) {
    return utils.successResponse({ status: 'not_found' });
  }
  var res = await supabase
    .from('fb_data_deletion_requests')
    .select('status, confirmation_code, created_at, completed_at')
    .eq('confirmation_code', normalized)
    .maybeSingle();
  if (res.error) {
    console.error('[facebook-data-deletion] status lookup error:', res.error);
    return utils.errorResponse(500, 'Lookup failed');
  }
  if (!res.data) return utils.successResponse({ status: 'not_found' });
  return utils.successResponse({
    status: res.data.status,
    confirmation_code: res.data.confirmation_code,
    created_at: res.data.created_at,
    completed_at: res.data.completed_at
  });
}

// Parses + verifies the signed_request and returns either a structured error
// response (statusCode/error) or { facebookUserId } on success.
function _parseDeletionRequest(event, appSecret) {
  var body;
  try {
    body = parseBody(event);
  } catch (e) {
    return { error: utils.errorResponse(400, e.message) };
  }

  var payload;
  try {
    payload = parseSignedRequest(body.signed_request, appSecret);
  } catch (e) {
    console.warn('[facebook-data-deletion] signed_request rejected:', e.message);
    return { error: utils.errorResponse(400, e.message) };
  }

  var facebookUserId = String(payload.user_id || '').trim();
  if (!facebookUserId) {
    return { error: utils.errorResponse(400, 'signed_request missing user_id') };
  }
  return { facebookUserId: facebookUserId };
}

// Run the deletion cascade for a matched user and persist the final status.
async function _runDeletionCascade(supabase, matchedUser, requestRowId, confirmationCode) {
  var result = await core.performAccountDeletion({
    supabase: supabase,
    serviceSupabase: supabase,
    userId: matchedUser.id,
    userEmail: matchedUser.email,
    requestId: 'fb-' + confirmationCode,
    source: 'facebook_callback',
    sendEmail: null
  });
  var update = result && result.success
    ? { status: 'completed', completed_at: new Date().toISOString(), error_message: null }
    : { status: 'error', completed_at: new Date().toISOString(), error_message: ((result && result.error) || 'Unknown error').slice(0, 500) };
  try {
    await supabase
      .from('fb_data_deletion_requests')
      .update(update)
      .eq('id', requestRowId);
  } catch (e2) {
    console.error('[facebook-data-deletion] failed to record final status:', e2);
  }
}

async function _handleDeletionPost(event, supabase) {
  var appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appSecret) {
    console.error('[facebook-data-deletion] FACEBOOK_APP_SECRET is not configured');
    return utils.errorResponse(500, 'Facebook integration not configured');
  }

  var parsed = _parseDeletionRequest(event, appSecret);
  if (parsed.error) return parsed.error;
  var facebookUserId = parsed.facebookUserId;

  var confirmationCode = crypto.randomBytes(8).toString('hex');
  var matchedUser = await lookupUserByFacebookId(supabase, facebookUserId);

  var insertRes = await supabase
    .from('fb_data_deletion_requests')
    .insert({
      confirmation_code: confirmationCode,
      facebook_user_id: facebookUserId,
      user_id: matchedUser ? matchedUser.id : null,
      status: matchedUser ? 'pending' : 'not_found',
      completed_at: matchedUser ? null : new Date().toISOString()
    })
    .select('id')
    .single();
  if (insertRes.error || !insertRes.data) {
    console.error('[facebook-data-deletion] insert failed:', insertRes.error);
    return utils.errorResponse(500, 'Failed to record deletion request');
  }

  var baseUrl = process.env.PUBLIC_BASE_URL || 'https://mycarconcierge.com';
  var statusUrl = baseUrl.replace(/\/+$/, '') + '/data-deletion-status.html?code=' + confirmationCode;

  if (matchedUser) {
    await _runDeletionCascade(supabase, matchedUser, insertRes.data.id, confirmationCode);
  } else {
    console.log('[facebook-data-deletion] no matching MCC user for facebook_user_id=' + facebookUserId);
  }

  return utils.successResponse({ url: statusUrl, confirmation_code: confirmationCode });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();

  var supabase = utils.createSupabaseClient();
  if (!supabase) {
    return utils.errorResponse(500, 'Database not configured');
  }

  if (event.httpMethod === 'GET') {
    var qs = event.queryStringParameters || {};
    return await handleStatusLookup(supabase, (qs.code || '').trim());
  }

  if (event.httpMethod !== 'POST') {
    return utils.errorResponse(405, 'Method Not Allowed');
  }

  return await _handleDeletionPost(event, supabase);
};

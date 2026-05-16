// ============================================================================
// MCC — Bid Accepted Push (Task #257)
//
// Production endpoint for the legacy member-side acceptBid() path in
// www/members-packages.js (~L2388) and members-packages.js (~L2471). Those
// pages POST to /api/notifications/bid-accepted-push to fire a winner push
// to the accepted provider's mobile devices.
//
// Dev (`www/server.js`) already serves this route and dispatches via
// sendFCMPushNotification. In production, the route had no Netlify handler
// and silently 404'd (the client wraps the fetch in `.catch(() => {})`),
// so member-driven awards never reached the provider's phone. The
// admin-driven Matchmaker path (Task #197) handles its own pushes inside
// netlify/functions/agent-fleet-admin.js — this file restores parity for
// the member-driven path by mirroring those same FCM v1 helpers, scoped
// down to a single recipient + the `bid_accepted` opt-out check.
//
// Auth: Supabase JWT (member's bearer token from the browser session).
// Body: { provider_id, bid_id }
//   (Task #351: package_title / bid_amount in the body are now ignored —
//    the handler reads them authoritatively from bids.price and
//    maintenance_packages.title using the same lookup it already does for
//    authz, so the member can no longer inject misleading wording into
//    the provider's push payload.)
// Response: { ok: true, sent, success, failure, reason? }
//
// Always returns 200 on a valid request even if FCM is not configured /
// no tokens / opted-out, so the caller can stay best-effort. Hard 4xx
// is reserved for genuine bad input (auth failure, missing/invalid body).
// ============================================================================

const utils = require('./utils');

let _fcmAccessToken = null;
let _fcmAccessTokenExpiry = 0;

async function getFCMAccessToken() {
  const now = Date.now();
  if (_fcmAccessToken && _fcmAccessTokenExpiry > now + 60000) return _fcmAccessToken;

  const saJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!saJson) throw new Error('FCM_SERVICE_ACCOUNT_JSON not set');

  let sa;
  try { sa = JSON.parse(saJson); }
  catch { throw new Error('FCM_SERVICE_ACCOUNT_JSON is not valid JSON'); }

  const crypto = require('node:crypto');
  const iat = Math.floor(now / 1000);
  const exp = iat + 3600;
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat, exp,
    scope: 'https://www.googleapis.com/auth/firebase.messaging'
  })).toString('base64url');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(sa.private_key).toString('base64url');
  const jwt = `${header}.${payload}.${signature}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    }).toString()
  });
  const tokenData = await resp.json();
  if (!resp.ok || !tokenData.access_token) {
    throw new Error('FCM OAuth failed: ' + (tokenData.error_description || tokenData.error || resp.status));
  }
  _fcmAccessToken = tokenData.access_token;
  _fcmAccessTokenExpiry = now + (tokenData.expires_in || 3600) * 1000;
  return _fcmAccessToken;
}

async function sendFCMv1Message(token, title, body, data, projectId) {
  const accessToken = await getFCMAccessToken();
  const message = {
    message: {
      token,
      notification: { title, body },
      data: Object.fromEntries(Object.entries({ ...(data || {}), title, body }).map(([k, v]) => [k, String(v)])),
      android: { priority: 'HIGH' },
      apns:    { payload: { aps: { sound: 'default', 'content-available': 1 } } }
    }
  };
  const resp = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message)
  });
  let respBody = null;
  try { respBody = await resp.json(); } catch { respBody = null; }
  return { status: resp.status, body: respBody };
}

// Mirror www/server.js#checkUserPushPreference for the bid_accepted category:
// providers can opt out via provider_notification_preferences.push_bid_accepted.
// Best-effort: any DB blip / missing row defaults to ALLOWED so transient
// outages can't silently drop legitimate awards.
async function isBidAcceptedAllowed(supabase, providerId) {
  try {
    const { data: pref } = await supabase
      .from('provider_notification_preferences')
      .select('push_bid_accepted')
      .eq('provider_id', providerId)
      .maybeSingle();
    if (pref && pref.push_bid_accepted === false) return false;
  } catch { /* fall through, default allow */ }
  return true;
}

async function dispatchBidAcceptedPush(supabase, providerId, packageTitle, bidAmount) {
  if (!process.env.FCM_SERVICE_ACCOUNT_JSON) {
    return { sent: false, reason: 'not_configured', success: 0, failure: 0 };
  }
  const allowed = await isBidAcceptedAllowed(supabase, providerId);
  if (!allowed) return { sent: false, reason: 'push_disabled_by_user', success: 0, failure: 0 };

  let tokenRows = [];
  try {
    const { data, error } = await supabase
      .from('device_push_tokens')
      .select('token, member_id, platform')
      .eq('member_id', providerId)
      .eq('active', true);
    if (error) return { sent: false, reason: 'token_lookup_error:' + error.message, success: 0, failure: 0 };
    tokenRows = data || [];
  } catch (e) {
    return { sent: false, reason: 'token_lookup_exception:' + e.message, success: 0, failure: 0 };
  }
  if (tokenRows.length === 0) return { sent: false, reason: 'no_tokens', success: 0, failure: 0 };

  let projectId;
  try { projectId = JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON).project_id; }
  catch { return { sent: false, reason: 'invalid_service_account', success: 0, failure: 0 }; }

  const title = 'Your Bid Was Accepted!';
  const amt = Number(bidAmount);
  const body = (isFinite(amt) && packageTitle)
    ? `$${amt.toFixed(2)} bid on "${packageTitle}" accepted — get in touch with the member to schedule work.`
    : 'A member accepted your bid. Log in to view details.';

  const stale = [];
  let success = 0, failure = 0;
  let lastErrCode = null;
  let oauthFailed = false;

  await Promise.all(tokenRows.map(async (row) => {
    try {
      const result = await sendFCMv1Message(row.token, title, body, { section: 'bids' }, projectId);
      if (result.status === 200) {
        success++;
      } else {
        failure++;
        const detailErrCode = result.body?.error?.details?.[0]?.errorCode;
        const topStatus     = result.body?.error?.status;
        lastErrCode = detailErrCode || topStatus || `http_${result.status}`;
        if (detailErrCode === 'UNREGISTERED' || topStatus === 'NOT_FOUND') stale.push(row.token);
        console.warn(`[bid-accepted-push] FCM v1 failed (${row.platform}): ${lastErrCode}`);
      }
    } catch (err) {
      failure++;
      if (/FCM OAuth|FCM_SERVICE_ACCOUNT_JSON/.test(err.message)) oauthFailed = true;
      lastErrCode = lastErrCode || 'send_exception';
      console.error('[bid-accepted-push] send error:', err.message);
    }
  }));

  if (stale.length > 0) {
    try {
      await supabase.from('device_push_tokens').update({ active: false }).in('token', stale);
    } catch (e) {
      console.error('[bid-accepted-push] failed to deactivate stale tokens:', e.message);
    }
  }

  if (success === 0 && failure > 0) {
    const reason = oauthFailed ? 'oauth_failed' : (lastErrCode ? `send_failed:${lastErrCode}` : 'send_failed');
    return { sent: false, reason, success, failure };
  }
  return { sent: success > 0, success, failure };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'POST') return utils.errorResponse(405, 'Method not allowed');

  const authHeader = event.headers['authorization'] || event.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return utils.errorResponse(401, 'Authentication required');
  }
  const token = authHeader.slice(7);
  const supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  const authResult = await supabase.auth.getUser(token);
  if (authResult.error || !authResult.data.user) {
    return utils.errorResponse(401, 'Invalid or expired token');
  }

  let parsed;
  try { parsed = JSON.parse(event.body || '{}'); }
  catch { return utils.errorResponse(400, 'Invalid JSON'); }

  const providerId = parsed.provider_id;
  const bidId = parsed.bid_id;
  if (!providerId || !utils.isValidUUID(providerId)) {
    return utils.errorResponse(400, 'Valid provider_id required');
  }
  if (!bidId || !utils.isValidUUID(bidId)) {
    return utils.errorResponse(400, 'Valid bid_id required');
  }

  // Authorization gate (Task #257 hardening): verify the caller is the
  // member who owns the package this bid belongs to, the bid is actually
  // accepted, and bid.provider_id matches the requested provider. Without
  // this, any authenticated user could trigger high-priority push spam at
  // arbitrary providers (with partly attacker-controlled message content
  // via package_title / bid_amount).
  const callerId = authResult.data.user.id;
  let bidRow;
  try {
    const { data, error } = await supabase
      .from('bids')
      .select('id, provider_id, status, package_id, price, maintenance_packages!inner(member_id, title)')
      .eq('id', bidId)
      .maybeSingle();
    if (error) return utils.errorResponse(500, 'Bid lookup failed');
    bidRow = data;
  } catch {
    return utils.errorResponse(500, 'Bid lookup failed');
  }
  if (!bidRow) return utils.errorResponse(404, 'Bid not found');
  if (bidRow.provider_id !== providerId) {
    return utils.errorResponse(403, 'provider_id does not match bid');
  }
  if (bidRow.status !== 'accepted') {
    return utils.errorResponse(409, 'Bid is not in accepted state');
  }
  const memberId = bidRow.maintenance_packages?.member_id;
  if (!memberId || memberId !== callerId) {
    return utils.errorResponse(403, 'Only the package owner can trigger this push');
  }

  // Task #351: wording comes from the DB row we already fetched for authz,
  // never from the request body. The client may still send package_title /
  // bid_amount for back-compat, but they are now advisory and ignored.
  const dbPackageTitle = bidRow.maintenance_packages?.title || null;
  const dbBidAmount    = bidRow.price;

  const result = await dispatchBidAcceptedPush(
    supabase,
    providerId,
    dbPackageTitle,
    dbBidAmount
  );

  return utils.successResponse({ ok: true, ...result });
};

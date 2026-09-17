// ============================================================================
// netlify/functions/notifications-auto-bid-prefill-push.js
// Phase 4 of the auto-bid redesign.
//
// PURPOSE:
//   Dispatch a push to a provider when the prefill-notify engine
//   (auto-bid-prefill-notify-scheduled.js) inserts a new auto_bid_prefills
//   row. Pure server-side helper — no HTTP handler. The only caller today
//   is the scheduled function, in-process; there's no member-driven web
//   flow that needs an /api/... endpoint for this.
//
// PATTERN:
//   Mirrors notifications-bid-accepted-push.js structurally. Reuses that
//   file's exported getFCMAccessToken / sendFCMv1Message so we don't
//   reimplement FCM v1 OAuth. Once a third caller shows up, both helpers
//   are the obvious candidates to extract into `_shared/fcm.js`.
//
// PREFERENCES:
//   provider_notification_preferences.push_auto_bid_prefill (added by the
//   20260921c migration, mirrors push_bid_accepted's shape). Opt-out
//   tolerant the same way concierge-push-notifier-scheduled.js treats
//   push_appointment_reminder: any DB blip or missing row → ALLOWED, so
//   a transient outage can't silently drop legitimate notifies. Explicit
//   false → skip.
//
// DEEP LINK — INTERIM:
//   Phase 5 (the dedicated review/confirm screen) doesn't exist yet, so
//   push data carries section:'browse' + care_plan_id, deep-linking the
//   provider to the Job Board scoped to that plan. Providers see the job
//   card with the "$X bid" hint from the item_key + price they already
//   published on their rate card. Swap to section:'auto_bid_prefills'
//   once Phase 5 ships — one line, marked with a TODO below.
// ============================================================================
'use strict';

// Reuse the FCM v1 auth + send helpers from the existing bid-accepted push.
// Same OAuth token gets cached across calls when both handlers run in the
// same warm Netlify container.
const { getFCMAccessToken, sendFCMv1Message } = require('./notifications-bid-accepted-push.js');

// Opt-out check for the push_auto_bid_prefill category. Fails ALLOWED on
// any error — see concierge-push-notifier-scheduled.js:253-259 for the
// same posture on push_appointment_reminder.
async function isAutoBidPrefillAllowed(supabase, providerId) {
  try {
    const { data } = await supabase
      .from('provider_notification_preferences')
      .select('push_auto_bid_prefill')
      .eq('provider_id', providerId)
      .maybeSingle();
    if (data && data.push_auto_bid_prefill === false) return false;
  } catch { /* fall through → allow */ }
  return true;
}

// Format the body message. Distance rounds to one decimal (matches how
// the boards render distance chips); price prints as a plain dollar
// figure (no cents — a rate card is round-number pricing).
//
// Kind selects the copy variant added in Phase 8:
//   - 'notify_only'    — original review-and-confirm push (was the only
//                         variant pre-Phase 8). Fires when auto-bid is
//                         paused, or when the job's price exceeds the
//                         provider's auto_bid_max_price_cents cap.
//   - 'auto_submitted' — Phase 8 automatic-submission success. The bid
//                         is real, credit was already spent — this is
//                         informational, not a call to action.
//   - 'no_credits'     — Phase 8 automatic-submission blocked because
//                         the provider had no credits. Prefill saved as
//                         'pending' so it can still be reviewed/confirmed
//                         once they top up.
function _formatBody(kind, itemLabel, distanceMiles, priceCents) {
  const dollars = Math.round((priceCents || 0) / 100);
  const miles = typeof distanceMiles === 'number' && isFinite(distanceMiles)
    ? distanceMiles.toFixed(1).replace(/\.0$/, '')
    : '?';
  const label = itemLabel || 'matching';
  if (kind === 'auto_submitted') {
    return `We auto-bid $${dollars} on a ${label} job ${miles} mi away.`;
  }
  if (kind === 'no_credits') {
    return `Match found for a ${label} job ${miles} mi away, but you're out of bid credits — top up or review manually.`;
  }
  return `New ${label} job ${miles} mi away — review your $${dollars} bid.`;
}

function _formatTitle(kind) {
  if (kind === 'auto_submitted') return 'Bid placed';
  if (kind === 'no_credits') return 'Match — no credits';
  return 'New matching job';
}

// Dispatch. Returns { sent, success, failure, reason? } — same shape as
// dispatchBidAcceptedPush so future callers have a consistent API.
//
// Arguments:
//   supabase       — service-role client from the caller
//   providerId     — profiles.id / auth.users.id
//   prefill        — { id, care_plan_id, item_key, prefilled_amount_cents,
//                      plan_bid_id? } from the row we just wrote/updated
//   itemLabel      — service_menu_items.label (caller looked it up already)
//   distanceMiles  — from planWithinRadius (never null at the notify stage)
//   kind           — 'notify_only' | 'auto_submitted' | 'no_credits'
//                    (default 'notify_only' for backward compat)
async function dispatchAutoBidPrefill(supabase, providerId, prefill, itemLabel, distanceMiles, kind = 'notify_only') {
  if (!process.env.FCM_SERVICE_ACCOUNT_JSON) {
    return { sent: false, reason: 'not_configured', success: 0, failure: 0 };
  }
  if (!prefill || !prefill.care_plan_id) {
    return { sent: false, reason: 'invalid_prefill', success: 0, failure: 0 };
  }
  const allowed = await isAutoBidPrefillAllowed(supabase, providerId);
  if (!allowed) return { sent: false, reason: 'push_disabled_by_user', success: 0, failure: 0 };

  // Provider device tokens. device_push_tokens.member_id also carries
  // provider ids (single tokens table across both roles).
  let tokenRows = [];
  try {
    const { data, error } = await supabase
      .from('device_push_tokens')
      .select('token, platform')
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

  const title = _formatTitle(kind);
  const body = _formatBody(kind, itemLabel, distanceMiles, prefill.prefilled_amount_cents);

  // Phase 5 shipped: deep-link straight to the review/confirm card via
  // the shared handleNotificationDeepLink() convention in
  // www/members-push.js (section + entity_id drives window.showSection()
  // plus an entity-specific opener — see the 'auto_bid_prefills' branch
  // added there, which calls window.openAutoBidPrefill(entity_id)).
  const payloadData = {
    section: 'auto_bid_prefills',
    entity_id: prefill.id,
    care_plan_id: prefill.care_plan_id,
    item_key: prefill.item_key,
    prefilled_amount_cents: String(prefill.prefilled_amount_cents),
    kind,
  };
  if (prefill.plan_bid_id) payloadData.plan_bid_id = prefill.plan_bid_id;

  const stale = [];
  let success = 0, failure = 0;
  let lastErrCode = null;
  let oauthFailed = false;

  await Promise.all(tokenRows.map(async (row) => {
    try {
      const result = await sendFCMv1Message(row.token, title, body, payloadData, projectId);
      if (result.status === 200) {
        success++;
      } else {
        failure++;
        const detailErrCode = result.body && result.body.error && result.body.error.details
          && result.body.error.details[0] && result.body.error.details[0].errorCode;
        const topStatus = result.body && result.body.error && result.body.error.status;
        lastErrCode = detailErrCode || topStatus || `http_${result.status}`;
        if (detailErrCode === 'UNREGISTERED' || topStatus === 'NOT_FOUND') stale.push(row.token);
        console.warn(`[auto-bid-prefill-push] FCM v1 failed (${row.platform}): ${lastErrCode}`);
      }
    } catch (err) {
      failure++;
      if (/FCM OAuth|FCM_SERVICE_ACCOUNT_JSON/.test(err.message)) oauthFailed = true;
      lastErrCode = lastErrCode || 'send_exception';
      console.error('[auto-bid-prefill-push] send error:', err.message);
    }
  }));

  if (stale.length > 0) {
    try {
      await supabase.from('device_push_tokens').update({ active: false }).in('token', stale);
    } catch (e) {
      console.error('[auto-bid-prefill-push] failed to deactivate stale tokens:', e.message);
    }
  }

  if (success === 0 && failure > 0) {
    const reason = oauthFailed ? 'oauth_failed' : (lastErrCode ? `send_failed:${lastErrCode}` : 'send_failed');
    return { sent: false, reason, success, failure };
  }
  return { sent: success > 0, success, failure };
}

module.exports = {
  dispatchAutoBidPrefill,
  isAutoBidPrefillAllowed,
  _formatBody, // exported for the test — internal helper otherwise
};

// ============================================================================
// auto-bid-daily-cap — get/set the calling provider's own daily cap on
// auto-bid prefill notifications.
//
//   GET   /api/auto-bid-daily-cap — { daily_cap: number|null }
//   PATCH /api/auto-bid-daily-cap — { daily_cap: number|null }
//
// Phase 7 of the auto-bid redesign (2026-09-16). Small and separate from
// auto-bid-ledger.js on purpose — that endpoint is read-only by design (see
// its own header comment); this is the one write path for
// provider_notification_preferences.auto_bid_prefill_daily_cap (added by
// migration 20260921d). Read by
// auto-bid-prefill-notify-scheduled.js's cap gate.
//
// NOTE ON THE BROADER provider_notification_preferences ENDPOINT:
//   www/providers-settings.js already calls
//   `/api/provider/:id/notification-preferences` for the push toggles
//   (loadProviderPushPreferences / saveProviderPushPreferences), but no
//   matching redirect or handler exists in this codebase today — that
//   call 404s in production and fails silently (the caller already
//   treats a non-ok response as a soft no-op). That's a pre-existing gap,
//   unrelated to the auto-bid redesign; not fixed here to keep this
//   change scoped to what Phase 7 actually needs. A future pass wiring up
//   that endpoint for real should probably fold auto_bid_prefill_daily_cap
//   into it and retire this file — noted so it isn't a surprise.
//
// Auth: Bearer JWT (provider's own session token), same pattern as
// auto-bid-prefill.js / auto-bid-ledger.js. Upserts on PATCH (a provider
// may not have a provider_notification_preferences row yet) scoped to
// provider_id = user.id — never a value from the request body.
// ============================================================================
'use strict';

const utils = require('./utils');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function jsonResp(code, data) {
  return { statusCode: code, headers: CORS_HEADERS, body: JSON.stringify(data) };
}

function getBearerToken(event) {
  const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

// null = unlimited (the default). Otherwise must be a positive integer —
// matches the DB CHECK constraint in 20260921d exactly, so a value that
// would fail the DB write is rejected here first with a clear error
// instead of surfacing as an opaque 500 from a constraint violation.
function validateDailyCap(value) {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return { ok: false };
  }
  return { ok: true, value };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return jsonResp(200, {});

  const supabase = utils.createSupabaseClient();
  if (!supabase) return jsonResp(500, { error: 'server_misconfigured' });

  const token = getBearerToken(event);
  if (!token) return jsonResp(401, { error: 'authentication_required' });
  const authResult = await supabase.auth.getUser(token);
  if (authResult.error || !authResult.data || !authResult.data.user) {
    return jsonResp(401, { error: 'invalid_token' });
  }
  const user = authResult.data.user;

  if (event.httpMethod === 'GET') {
    const { data, error } = await supabase
      .from('provider_notification_preferences')
      .select('auto_bid_prefill_daily_cap')
      .eq('provider_id', user.id)
      .maybeSingle();
    if (error) return jsonResp(500, { error: 'daily_cap_query_failed' });
    return jsonResp(200, { daily_cap: data ? data.auto_bid_prefill_daily_cap : null });
  }

  if (event.httpMethod === 'PATCH') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return jsonResp(400, { error: 'invalid_json' }); }

    if (!('daily_cap' in body)) return jsonResp(400, { error: 'daily_cap_required' });
    const validated = validateDailyCap(body.daily_cap);
    if (!validated.ok) {
      return jsonResp(400, { error: 'invalid_daily_cap', detail: 'must be null (unlimited) or a positive integer' });
    }

    const { error } = await supabase
      .from('provider_notification_preferences')
      .upsert(
        { provider_id: user.id, auto_bid_prefill_daily_cap: validated.value },
        { onConflict: 'provider_id' }
      );
    if (error) return jsonResp(500, { error: 'daily_cap_save_failed' });
    return jsonResp(200, { daily_cap: validated.value });
  }

  return jsonResp(405, { error: 'method_not_allowed' });
};

// Exported for the mock test — pure function, no DB/auth involved.
exports._validateDailyCap = validateDailyCap;

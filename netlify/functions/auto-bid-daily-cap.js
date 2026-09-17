// ============================================================================
// auto-bid-daily-cap — get/set the calling provider's own auto-bid prefs
// on provider_notification_preferences.
//
//   GET   /api/auto-bid-daily-cap → {
//           daily_cap: number|null,
//           auto_bid_paused: boolean,
//           auto_bid_max_price_cents: number|null,
//         }
//   PATCH /api/auto-bid-daily-cap ← any subset of the above
//                                → 200 with the resulting canonical shape
//
// Phase 7 (2026-09-16) added the daily_cap field. Phase 8 (2026-09-17)
// added auto_bid_paused AND then reshaped it into a true "automatic
// submission" toggle rather than a notify-only pause — same column, new
// semantics — plus auto_bid_max_price_cents as an optional ceiling for
// what will auto-submit vs fall back to the review-and-confirm path.
//
// All three fields live on the same row keyed by provider_id. PATCH
// accepts any subset (nothing supplied → 400 no_fields), so the UI can
// save just the toggle, just the cap, or all three atomically in a single
// round-trip (used by the "turn Auto-Bid on" confirmation dialog, which
// stores the toggle + optional cap in one PATCH).
//
// NOTE ON THE BROADER provider_notification_preferences ENDPOINT:
//   www/providers-settings.js already calls
//   `/api/provider/:id/notification-preferences` for the push toggles
//   (loadProviderPushPreferences / saveProviderPushPreferences), but no
//   matching redirect or handler exists in this codebase today — that
//   call 404s in production and fails silently (the caller already
//   treats a non-ok response as a soft no-op). Pre-existing gap,
//   unrelated to the auto-bid redesign; not fixed here. A future pass
//   wiring up that endpoint should fold the three auto_bid_* fields
//   in and retire this file.
//
// Auth: Bearer JWT (provider's own session token), same pattern as
// auto-bid-prefill.js / auto-bid-ledger.js. Upserts scoped to
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

// null = unlimited. Otherwise a positive integer — matches the CHECK
// constraint in 20260921d so the DB rejection surfaces client-side with a
// clear error instead of an opaque 500.
function validateDailyCap(value) {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return { ok: false };
  return { ok: true, value };
}

// Strict boolean — reject null, "true", 1. Column is NOT NULL DEFAULT true;
// omit from PATCH body to leave the current value untouched.
function validatePaused(value) {
  if (typeof value !== 'boolean') return { ok: false };
  return { ok: true, value };
}

// Same shape as daily_cap: null = no cap, positive integer otherwise.
// Value is stored in cents; the UI collects it in dollars and multiplies
// (a $500 cap on a $200 job auto-submits; a $500 cap on a $600 job falls
// back to the review-and-confirm path).
function validateMaxPriceCents(value) {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return { ok: false };
  return { ok: true, value };
}

function toRow(data) {
  return {
    daily_cap: data ? data.auto_bid_prefill_daily_cap : null,
    // NB: the DB column defaults to true (paused). A missing row also
    // reads as paused so a fresh provider is opted OUT of auto-submit
    // until they explicitly go through the confirmation dialog. This
    // matches the on-DB default and keeps the UI + engine consistent.
    auto_bid_paused: data ? !!data.auto_bid_paused : true,
    auto_bid_max_price_cents: data ? data.auto_bid_max_price_cents : null,
  };
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
      .select('auto_bid_prefill_daily_cap, auto_bid_paused, auto_bid_max_price_cents')
      .eq('provider_id', user.id)
      .maybeSingle();
    if (error) return jsonResp(500, { error: 'query_failed' });
    return jsonResp(200, toRow(data));
  }

  if (event.httpMethod === 'PATCH') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return jsonResp(400, { error: 'invalid_json' }); }

    const hasDailyCap = 'daily_cap' in body;
    const hasPaused = 'auto_bid_paused' in body;
    const hasMaxPrice = 'auto_bid_max_price_cents' in body;
    if (!hasDailyCap && !hasPaused && !hasMaxPrice) {
      return jsonResp(400, { error: 'no_fields', detail: 'PATCH must include daily_cap, auto_bid_paused, or auto_bid_max_price_cents' });
    }

    const updates = { provider_id: user.id };
    if (hasDailyCap) {
      const v = validateDailyCap(body.daily_cap);
      if (!v.ok) return jsonResp(400, { error: 'invalid_daily_cap', detail: 'must be null (unlimited) or a positive integer' });
      updates.auto_bid_prefill_daily_cap = v.value;
    }
    if (hasPaused) {
      const v = validatePaused(body.auto_bid_paused);
      if (!v.ok) return jsonResp(400, { error: 'invalid_auto_bid_paused', detail: 'must be a boolean' });
      updates.auto_bid_paused = v.value;
    }
    if (hasMaxPrice) {
      const v = validateMaxPriceCents(body.auto_bid_max_price_cents);
      if (!v.ok) return jsonResp(400, { error: 'invalid_auto_bid_max_price_cents', detail: 'must be null (no cap) or a positive integer in cents' });
      updates.auto_bid_max_price_cents = v.value;
    }

    // Upsert-then-read: return the canonical resulting row so the UI's
    // optimistic-update reconciliation matches a fresh GET without a
    // second round-trip.
    const { error: upErr } = await supabase
      .from('provider_notification_preferences')
      .upsert(updates, { onConflict: 'provider_id' });
    if (upErr) return jsonResp(500, { error: 'save_failed' });

    const { data, error } = await supabase
      .from('provider_notification_preferences')
      .select('auto_bid_prefill_daily_cap, auto_bid_paused, auto_bid_max_price_cents')
      .eq('provider_id', user.id)
      .maybeSingle();
    if (error) return jsonResp(500, { error: 'post_save_query_failed' });
    return jsonResp(200, toRow(data));
  }

  return jsonResp(405, { error: 'method_not_allowed' });
};

// Exported for mock tests — pure functions, no DB/auth involved.
exports._validateDailyCap = validateDailyCap;
exports._validatePaused = validatePaused;
exports._validateMaxPriceCents = validateMaxPriceCents;

// ============================================================================
// netlify/functions/provider-rate-card.js
// Provider's own rate card CRUD — Phase 2 of the auto-bid redesign.
//
// ENDPOINTS (all provider-scoped via Bearer JWT; user_id always from token):
//   GET    /api/provider/rate-card              — caller's full rate card
//                                                 (joined with service_menu_items
//                                                 for label + category)
//   POST   /api/provider/rate-card              — upsert one item
//                                                 (aliases: PUT — same handler)
//   DELETE /api/provider/rate-card?item_key=... — remove one item by key
//
// AUTH: Bearer JWT, role='provider' (admins may test but this is a provider
// workflow). Suspension does NOT gate the rate card — even a suspended
// provider should be able to see/edit their own price list.
//
// VALIDATION (POST/PUT):
//   - item_key must exist in service_menu_items AND be active
//   - price_cents must be a positive integer (rejects strings, decimals, 0)
//   - price_type ∈ {'fixed','starting_at'} (defaults to 'fixed' if omitted)
//   - conditions is optional string, trimmed, max 500 chars, empty→null
//   - active is optional boolean, defaults true
//
// The price_cents validator explicitly rejects floats and stringified numbers
// with fractional parts — this codebase has been bitten by Postgres numeric
// arriving as strings in supabase-js (see netlify/functions/_distance.js's
// Number.isFinite guards, which handle the same class of edge cases in the
// Haversine helper).
//
// RESPONSE SHAPES:
//   GET  → { items: [ { id, item_key, category, label, price_cents,
//                       price_type, conditions, active, created_at,
//                       updated_at, sort_order }, ... ] }
//   POST → { item: {...same shape as one GET row...} }
//   DEL  → { removed: true }
//
// Pattern B (utils.createSupabaseClient, CORS_HEADERS const, jsonResp helper,
// lowercase sentinel errors). Mirrors provider-packages.js + job-board.js.
// ============================================================================
'use strict';

const utils = require('./utils');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

const ALLOWED_PRICE_TYPES = new Set(['fixed', 'starting_at']);

function jsonResp(code, data) {
  return { statusCode: code, headers: CORS_HEADERS, body: JSON.stringify(data) };
}

function getBearerToken(event) {
  const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function parseBody(event) {
  if (!event.body) return {};
  try { return JSON.parse(event.body); } catch { return null; }
}

// Positive-integer coercion that rejects strings-with-fractional-parts,
// booleans coerced to 0/1, and non-finite numeric string values. Mirrors
// the defensive posture in _distance.js: assume upstream may hand us junk
// (client bug, mis-typed form field, numeric-as-string from supabase-js).
function coercePriceCents(v) {
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v <= 0) return null;
    return v;
  }
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '' || !/^\d+$/.test(trimmed)) return null;
    const n = Number(trimmed);
    if (!Number.isSafeInteger(n) || n <= 0) return null;
    return n;
  }
  return null;
}

// Look up the caller's profile + verify they're a provider (or admin, for
// testing). Mirrors provider-packages.js:checkBidGate but relaxed:
// verification_status does NOT gate the rate card (a provider who hasn't
// yet been verified can still prepare their price list), and suspension
// doesn't either (a suspended provider should still be able to see what
// they've saved).
async function loadCaller(supabase, event) {
  const token = getBearerToken(event);
  if (!token) return { error: jsonResp(401, { error: 'authentication_required' }) };
  const authRes = await supabase.auth.getUser(token);
  if (authRes.error || !authRes.data || !authRes.data.user) {
    return { error: jsonResp(401, { error: 'invalid_token' }) };
  }
  const user = authRes.data.user;

  const profileRes = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profileRes.error || !profileRes.data) {
    return { error: jsonResp(403, { error: 'profile_not_found' }) };
  }
  if (profileRes.data.role !== 'provider' && profileRes.data.role !== 'admin') {
    return { error: jsonResp(403, { error: 'not_a_provider' }) };
  }
  return { user, profile: profileRes.data };
}

// Join projection used by GET (list) and POST/PUT (single). Kept as one
// helper so the two endpoints stay in lockstep on shape.
async function projectItem(supabase, providerId, itemKey) {
  const { data, error } = await supabase
    .from('provider_rate_card_items')
    .select(`
      id, provider_id, item_key, price_cents, min_price_cents,
      price_type, conditions, active,
      created_at, updated_at,
      menu:item_key ( category, label, sort_order )
    `)
    .eq('provider_id', providerId)
    .eq('item_key', itemKey)
    .maybeSingle();
  if (error) return { error };
  if (!data) return { data: null };
  return {
    data: {
      id: data.id,
      item_key: data.item_key,
      category: data.menu && data.menu.category,
      label: data.menu && data.menu.label,
      sort_order: data.menu && data.menu.sort_order,
      price_cents: data.price_cents,
      min_price_cents: data.min_price_cents,
      price_type: data.price_type,
      conditions: data.conditions,
      active: data.active,
      created_at: data.created_at,
      updated_at: data.updated_at,
    },
  };
}

// ---- GET ------------------------------------------------------------------
async function handleGet(supabase, user) {
  const { data, error } = await supabase
    .from('provider_rate_card_items')
    .select(`
      id, item_key, price_cents, min_price_cents,
      price_type, conditions, active,
      created_at, updated_at,
      menu:item_key ( category, label, sort_order )
    `)
    .eq('provider_id', user.id);

  if (error) {
    console.error('[provider-rate-card] GET select failed:', error.message);
    return jsonResp(500, { error: 'fetch_failed' });
  }
  const items = (data || []).map(r => ({
    id: r.id,
    item_key: r.item_key,
    category: r.menu && r.menu.category,
    label: r.menu && r.menu.label,
    sort_order: r.menu && r.menu.sort_order,
    price_cents: r.price_cents,
    min_price_cents: r.min_price_cents,
    price_type: r.price_type,
    conditions: r.conditions,
    active: r.active,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
  // Client-side stable sort by (category sort implied by menu.sort_order,
  // then price_cents ascending as a secondary — matches how a member reads
  // a menu top-to-bottom).
  items.sort((a, b) => {
    const soA = Number.isFinite(a.sort_order) ? a.sort_order : 999;
    const soB = Number.isFinite(b.sort_order) ? b.sort_order : 999;
    if (soA !== soB) return soA - soB;
    return (a.price_cents || 0) - (b.price_cents || 0);
  });
  return jsonResp(200, { items });
}

// ---- POST / PUT (upsert one item) -----------------------------------------
async function handleUpsert(supabase, user, body) {
  if (body === null) return jsonResp(400, { error: 'invalid_json' });

  const errors = [];
  const itemKey = typeof body.item_key === 'string' ? body.item_key.trim() : '';
  if (!itemKey || itemKey.length > 100) errors.push('item_key required');

  const priceCents = coercePriceCents(body.price_cents);
  if (priceCents === null) errors.push('price_cents (positive integer) required');

  const priceType = typeof body.price_type === 'string' && body.price_type
    ? body.price_type.trim().toLowerCase()
    : 'fixed';
  if (!ALLOWED_PRICE_TYPES.has(priceType)) {
    errors.push('price_type must be fixed or starting_at');
  }

  let conditions = null;
  if (body.conditions != null) {
    if (typeof body.conditions !== 'string') errors.push('conditions must be a string');
    else {
      const t = body.conditions.trim();
      if (t.length > 500) errors.push('conditions (≤500 chars)');
      else conditions = t.length === 0 ? null : t;
    }
  }

  let active = true;
  if (body.active != null) {
    if (typeof body.active !== 'boolean') errors.push('active must be a boolean');
    else active = body.active;
  }

  // Auto-Bid decay floor (2026-09-17). null / omitted / empty means the
  // caller isn't configuring decay for this item — persists as null. Must
  // be a positive integer <= price_cents when set; the CHECK constraint on
  // the column enforces the same rule, so this validator catches a bad
  // value before the DB write with a clear error sentinel instead of a 500.
  let minPriceCents = null;
  if (body.min_price_cents !== undefined && body.min_price_cents !== null) {
    const m = coercePriceCents(body.min_price_cents);
    if (m === null) errors.push('min_price_cents (positive integer, or null to clear)');
    else if (priceCents !== null && m > priceCents) {
      errors.push('min_price_cents must be <= price_cents');
    } else {
      minPriceCents = m;
    }
  }

  if (errors.length) return jsonResp(400, { error: 'validation_failed', details: errors });

  // Validate item_key against the menu — must exist and be active. This
  // catches typos client-side wouldn't (e.g. renamed items) and enforces
  // the "closed vocabulary" contract the notify engine will depend on.
  const menuRes = await supabase
    .from('service_menu_items')
    .select('item_key, category, label, sort_order, active')
    .eq('item_key', itemKey)
    .maybeSingle();
  if (menuRes.error) {
    console.error('[provider-rate-card] menu lookup failed:', menuRes.error.message);
    return jsonResp(500, { error: 'fetch_failed' });
  }
  if (!menuRes.data) return jsonResp(400, { error: 'unknown_item_key' });
  if (!menuRes.data.active) return jsonResp(400, { error: 'item_inactive' });

  const upsertRow = {
    provider_id: user.id,
    item_key: itemKey,
    price_cents: priceCents,
    price_type: priceType,
    conditions,
    active,
    min_price_cents: minPriceCents,
  };
  const { error: upErr } = await supabase
    .from('provider_rate_card_items')
    .upsert(upsertRow, { onConflict: 'provider_id,item_key' });
  if (upErr) {
    console.error('[provider-rate-card] upsert failed:', upErr.message);
    return jsonResp(500, { error: 'save_failed' });
  }

  const projected = await projectItem(supabase, user.id, itemKey);
  if (projected.error) {
    console.error('[provider-rate-card] post-upsert projection failed:', projected.error.message);
    return jsonResp(500, { error: 'fetch_failed' });
  }
  return jsonResp(200, { item: projected.data });
}

// ---- DELETE ---------------------------------------------------------------
async function handleDelete(supabase, user, event) {
  const qs = event.queryStringParameters || {};
  const bodyKey = (() => {
    try { return event.body ? (JSON.parse(event.body).item_key || null) : null; }
    catch { return null; }
  })();
  const itemKey = (typeof qs.item_key === 'string' && qs.item_key.trim())
    || (typeof bodyKey === 'string' && bodyKey.trim())
    || '';
  if (!itemKey) return jsonResp(400, { error: 'item_key required' });

  const { error, count } = await supabase
    .from('provider_rate_card_items')
    .delete({ count: 'exact' })
    .eq('provider_id', user.id)
    .eq('item_key', itemKey);
  if (error) {
    console.error('[provider-rate-card] delete failed:', error.message);
    return jsonResp(500, { error: 'delete_failed' });
  }
  return jsonResp(200, { removed: (count || 0) > 0 });
}

// ---- entrypoint -----------------------------------------------------------
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const supabase = utils.createSupabaseClient();
  if (!supabase) return jsonResp(500, { error: 'server_misconfigured' });

  const caller = await loadCaller(supabase, event);
  if (caller.error) return caller.error;

  if (event.httpMethod === 'GET')    return handleGet(supabase, caller.user);
  if (event.httpMethod === 'POST' ||
      event.httpMethod === 'PUT')    return handleUpsert(supabase, caller.user, parseBody(event));
  if (event.httpMethod === 'DELETE') return handleDelete(supabase, caller.user, event);

  return jsonResp(405, { error: 'method_not_allowed' });
};

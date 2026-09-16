// ============================================================================
// netlify/functions/service-menu.js
// GET /api/service-menu — the MCC-maintained catalog of priceable line items.
//
// PURPOSE: Feeds the Rate Card picker in Provider Settings, and (Phase 3+)
// the notify engine's job → item_key match step. This is intentionally an
// endpoint rather than a raw supabaseClient read so we can:
//   - filter to active=true server-side (an inactive/retired item shouldn't
//     appear in the picker but must still resolve on old rate_card rows)
//   - group by category (the UI renders one card per category)
//   - guarantee a stable shape as the catalog grows past the initial 22 rows
//
// AUTH: none. service_menu_items has anon+authenticated SELECT RLS, and the
// list is small + deterministic — no privacy or rate-shape concern. Any
// caller can hit /api/service-menu; the response is identical for everyone.
//
// SHAPE:
//   {
//     categories: [
//       { slug:'maintenance', label:'Maintenance & Mechanical', group:'mechanical',
//         items: [ { item_key, label, sort_order }, ... ] },
//       ...
//     ]
//   }
//
// Pattern B (utils.createSupabaseClient, CORS_HEADERS const, jsonResp helper)
// — mirrors provider-packages.js + job-board.js.
// ============================================================================
'use strict';

const utils = require('./utils');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function jsonResp(code, data) {
  return { statusCode: code, headers: CORS_HEADERS, body: JSON.stringify(data) };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return jsonResp(405, { error: 'method_not_allowed' });
  }

  const supabase = utils.createSupabaseClient();
  if (!supabase) return jsonResp(500, { error: 'server_misconfigured' });

  // Pull categories + items in parallel. service_categories from
  // 20260920a supplies the label/group; service_menu_items from 20260921a
  // supplies the priceable rows.
  const [catsRes, itemsRes] = await Promise.all([
    supabase.from('service_categories')
      .select('slug, label, grp, sort_order')
      .order('sort_order', { ascending: true }),
    supabase.from('service_menu_items')
      .select('item_key, category, label, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true }),
  ]);

  if (catsRes.error) {
    console.error('[service-menu] categories select failed:', catsRes.error.message);
    return jsonResp(500, { error: 'fetch_failed' });
  }
  if (itemsRes.error) {
    console.error('[service-menu] items select failed:', itemsRes.error.message);
    return jsonResp(500, { error: 'fetch_failed' });
  }

  // Bucket items under their category. Categories with no items in the
  // current seed still appear in the payload with items:[] so the UI can
  // render "no items priceable yet" hints without needing a second call.
  const byCategory = new Map();
  for (const it of itemsRes.data || []) {
    if (!byCategory.has(it.category)) byCategory.set(it.category, []);
    byCategory.get(it.category).push({
      item_key: it.item_key,
      label: it.label,
      sort_order: it.sort_order,
    });
  }

  const categories = (catsRes.data || []).map(c => ({
    slug: c.slug,
    label: c.label,
    group: c.grp,
    sort_order: c.sort_order,
    items: byCategory.get(c.slug) || [],
  }));

  return jsonResp(200, { categories });
};

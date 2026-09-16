// ============================================================================
// auto-bid — provider auto-bid settings API
//
//   GET  /api/auto-bid/settings — read provider's auto-bid config
//   POST /api/auto-bid/settings — upsert auto-bid config
//
// Auth: Bearer JWT (provider's own session token).
// The auto-bid engine (auto-bid-engine-scheduled.js) reads enabled providers
// hourly and places bids on open care plans that match their preferences.
// ============================================================================
'use strict';

const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function json(code, data) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
    body: JSON.stringify(data),
  };
}

function getBearerToken(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

async function authenticate(event, supabase) {
  const token = getBearerToken(event);
  if (!token) return { error: json(401, { error: 'Bearer token required' }) };
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { error: json(401, { error: 'Invalid or expired token' }) };
  return { user: data.user };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  const supabase = getSupabase();
  if (!supabase) return json(500, { error: 'Database not configured' });

  const { user, error: authErr } = await authenticate(event, supabase);
  if (authErr) return authErr;

  if (event.httpMethod === 'GET') {
    const { data } = await supabase
      .from('provider_auto_bid_settings')
      .select('enabled, max_bid_percent, max_distance_miles, service_categories')
      .eq('provider_id', user.id)
      .maybeSingle();

    return json(200, {
      auto_bid_enabled:            data?.enabled            ?? false,
      auto_bid_percent_of_estimate: data?.max_bid_percent   ?? 85,
      auto_bid_max_distance_miles:  data?.max_distance_miles ?? 25,
      auto_bid_service_types:       data?.service_categories ?? [],
    });
  }

  if (event.httpMethod === 'POST') {
    // PAUSED 2026-09-15 — the scheduled auto-bid engine is disabled in
    // netlify.toml and the provider-facing panel is hidden behind
    // window.MCC_CONFIG?.autoBidEnabled. This POST is preserved (not
    // deleted) so the future instant-notify-with-prefilled-bid redesign
    // can restore write behavior without a re-plumb. Any straggler client
    // that still hits this endpoint (cached JS, admin curl, etc.) gets a
    // clear 403 sentinel instead of silently mutating a paused feature.
    //
    // The upsert body below stays intact under the return — the redesign
    // will either resurrect it or replace it in a subsequent branch.
    //
    // NOTE 2026-09-16 — re-landed after db4ccdc turned out to be an
    // orphan (never merged). Fix branch: fix/repause-auto-bid-engine.
    return json(403, { error: 'auto_bid_paused' });
    /* eslint-disable no-unreachable */
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch {}

    const enabled = !!body.auto_bid_enabled;
    const pct  = Math.min(120, Math.max(50, parseInt(body.auto_bid_percent_of_estimate, 10) || 85));
    const dist = Math.min(500, Math.max(1,   parseInt(body.auto_bid_max_distance_miles, 10) || 25));
    const cats = Array.isArray(body.auto_bid_service_types) ? body.auto_bid_service_types : [];

    const { error } = await supabase
      .from('provider_auto_bid_settings')
      .upsert({
        provider_id:        user.id,
        enabled,
        max_bid_percent:    pct,
        max_distance_miles: dist,
        service_categories: cats,
        updated_at:         new Date().toISOString(),
      }, { onConflict: 'provider_id' });

    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
    /* eslint-enable no-unreachable */
  }

  return json(405, { error: 'Method not allowed' });
};

// ─────────────────────────────────────────────────────────────────────────────
// Task #372 — BGC sub-account onboarding (Step 5)
//
// Provider completes the BGC ClearChecksWidget registration form (in
// www/bgc-enroll-account.html). The widget calls onSuccess with an
// encrypted token. The browser POSTs that token to this function with the
// provider's Supabase JWT. We:
//   1. Verify the caller and load their profile.
//   2. Call BGC `POST /token/decrypt` with the platform's RSA private key
//      (BGC_PRIVATE_KEY) to get the customer's API key.
//   3. Upsert provider_background_check_accounts with the API key + flag
//      the provider as live_mode=TRUE so admin sees the change.
//
// The decrypted API key is treated as a secret: never returned to the
// browser, never logged. The caller only gets `{ live: true }` on success.
// ─────────────────────────────────────────────────────────────────────────────

const { createSupabaseClient } = require('./utils');

const BGC_API_BASE = process.env.BGC_API_BASE || 'https://app.backgroundchecks.com/api';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

async function resolveCaller(supabase, authHeader) {
  if (!authHeader) return null;
  const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const encryptedToken = body && body.token;
  if (!encryptedToken || typeof encryptedToken !== 'string') {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'token_required' }) };
  }

  const privateKey = process.env.BGC_PRIVATE_KEY;
  if (!privateKey) {
    console.error('[BGC decrypt] BGC_PRIVATE_KEY not configured');
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'bgc_private_key_missing' }) };
  }

  const supabase = createSupabaseClient();
  if (!supabase) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'db_unavailable' }) };
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const caller = await resolveCaller(supabase, authHeader);
  if (!caller) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // Confirm the caller is a provider — we only let providers enroll their
  // own BGC sub-account. Admin-on-behalf-of would need a different endpoint.
  const { data: prof } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .maybeSingle();
  if (!prof || (prof.role !== 'provider' && prof.role !== 'pending_provider')) {
    return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'forbidden' }) };
  }

  // Call BGC /token/decrypt with the platform's private key. Per BGC docs
  // the API token is a query-param.
  const platformToken = process.env.BGC_API_TOKEN;
  if (!platformToken) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'bgc_platform_token_missing' }) };
  }

  let apiKey;
  let bgcAccountId = null;
  try {
    const resp = await fetch(`${BGC_API_BASE}/token/decrypt?api_token=${encodeURIComponent(platformToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accepts': 'application/json' },
      body: JSON.stringify({ token: encryptedToken, private_key: privateKey })
    });
    const text = await resp.text();
    let parsed;
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
    if (!resp.ok) {
      console.error('[BGC decrypt] upstream error', resp.status, JSON.stringify(parsed));
      return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: 'bgc_decrypt_failed', upstream_status: resp.status }) };
    }
    apiKey = parsed && parsed.api_key;
    if (!apiKey) {
      console.error('[BGC decrypt] response missing api_key');
      return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: 'bgc_decrypt_no_api_key' }) };
    }
    // BGC's /token/decrypt response also surfaces the human-readable
    // account number (sometimes `account_id`, sometimes `bgchecks_account_id`,
    // sometimes nested under `account.id`). Persist whichever shape we get
    // so the existing `bgchecks_account_id` invariant on
    // provider_background_check_accounts stays satisfied without forcing
    // ops to look it up manually.
    var accountId = (parsed && (parsed.bgchecks_account_id || parsed.account_id))
      || (parsed && parsed.account && parsed.account.id)
      || null;
    // Stash on outer scope for the upsert below.
    bgcAccountId = accountId;
  } catch (e) {
    console.error('[BGC decrypt] fetch threw', e.message);
    return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: 'bgc_unreachable' }) };
  }

  // Upsert into provider_background_check_accounts. We persist the
  // source_token used so ops can audit which platform credential the
  // sub-account is linked to (rotation), and the human-readable
  // bgchecks_account_id when BGC returned one (Step 5 requirement —
  // existing rows already created during the legacy mock-mode opt-in
  // already carry this column, so we only update when we have a value).
  const sourceToken = process.env.BGC_SOURCE_TOKEN || null;
  const upsertRow = {
    provider_id: caller.id,
    bgchecks_api_key: apiKey,
    live_mode: true,
    source_token: sourceToken,
    updated_at: new Date().toISOString()
  };
  if (bgcAccountId) upsertRow.bgchecks_account_id = String(bgcAccountId);
  const { error: upErr } = await supabase
    .from('provider_background_check_accounts')
    .upsert(upsertRow, { onConflict: 'provider_id' });

  if (upErr) {
    console.error('[BGC decrypt] DB upsert failed', upErr.message);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'db_upsert_failed' }) };
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ success: true, live: true })
  };
};

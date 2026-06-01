'use strict';

// POST   /api/developer/keys          — generate a new API key
// GET    /api/developer/keys          — list caller's keys
// DELETE /api/developer/keys/:id      — revoke a key
// GET    /api/developer/usage         — usage summary
//
// Auth: Bearer JWT.  Subscription gate (ai_api product) enforced on POST only —
// a key you already generated keeps working even if your subscription lapses;
// you just can't create new ones.
//
// Raw keys are never stored.  We store a SHA-256 hash + display prefix.
// The raw key is returned once, on creation, and never again.

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function authenticate(event, supabase) {
  const auth = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!auth.startsWith('Bearer ')) return null;
  const { data, error } = await supabase.auth.getUser(auth.slice(7));
  return error || !data?.user ? null : data.user;
}

async function getActiveSub(supabase, userId) {
  const { data } = await supabase
    .from('saas_subscriptions')
    .select('plan, status')
    .eq('user_id', userId)
    .eq('product', 'ai_api')
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

// calls_limit per plan tier (calls/month ceiling encoded at key-creation time)
const PLAN_LIMITS = { starter: 1000, pro: 10000, business: -1 };
const MAX_KEYS_PER_USER = 5;

function parsePath(event) {
  return (event.path || '')
    .replace(/^\/?\.netlify\/functions\/developer-api\/?/, '')
    .replace(/^\/api\/developer\/?/, '')
    .replace(/^\/+|\/+$/, '');
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' } };
  }

  const supabase = getServiceClient();
  if (!supabase) return json(500, { error: 'Server configuration error' });

  const user = await authenticate(event, supabase);
  if (!user) return json(401, { error: 'Authentication required' });

  const path   = parsePath(event);
  const method = event.httpMethod;

  // ── GET /api/developer/usage ─────────────────────────────────────────────
  if (method === 'GET' && path === 'usage') {
    const { data: keys } = await supabase
      .from('developer_api_keys')
      .select('calls_made')
      .eq('user_id', user.id)
      .eq('status', 'active');

    const totalCalls = (keys || []).reduce((s, k) => s + (k.calls_made || 0), 0);
    const now = new Date();

    return json(200, {
      month: now.toISOString().slice(0, 7),
      total_calls_this_month: totalCalls,
      calls_today: 0, // per-day tracking requires a separate log table
    });
  }

  // ── GET /api/developer/keys ──────────────────────────────────────────────
  if (method === 'GET' && path === 'keys') {
    const { data: keys, error } = await supabase
      .from('developer_api_keys')
      .select('id, name, key_prefix, plan, calls_made, calls_limit, last_used_at, created_at, status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) return json(500, { error: error.message });
    return json(200, { keys: keys || [] });
  }

  // ── POST /api/developer/keys ─────────────────────────────────────────────
  if (method === 'POST' && path === 'keys') {
    const sub = await getActiveSub(supabase, user.id);
    if (!sub) {
      return json(402, { error: 'An active AI API subscription is required to generate API keys.' });
    }

    const { count } = await supabase
      .from('developer_api_keys')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'active');

    if ((count || 0) >= MAX_KEYS_PER_USER) {
      return json(409, { error: `Maximum of ${MAX_KEYS_PER_USER} active API keys reached. Revoke an existing key first.` });
    }

    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }
    const name = ((body.name || '').trim().slice(0, 100)) || 'My API Key';

    const rawKey    = 'mcc_' + crypto.randomBytes(28).toString('hex');
    const keyHash   = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 12) + '...';
    const callsLimit = PLAN_LIMITS[sub.plan] ?? PLAN_LIMITS.starter;

    const { data: key, error } = await supabase
      .from('developer_api_keys')
      .insert({ user_id: user.id, name, key_hash: keyHash, key_prefix: keyPrefix, plan: sub.plan, calls_limit: callsLimit })
      .select('id, name, key_prefix, plan, calls_made, calls_limit, created_at')
      .single();

    if (error) return json(500, { error: error.message });
    return json(201, { key: { ...key, raw_key: rawKey } });
  }

  // ── DELETE /api/developer/keys/:id ───────────────────────────────────────
  const revokeMatch = path.match(/^keys\/([0-9a-f-]{36})$/);
  if (method === 'DELETE' && revokeMatch) {
    const keyId = revokeMatch[1];
    const { data, error } = await supabase
      .from('developer_api_keys')
      .update({ status: 'revoked' })
      .eq('id', keyId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .select('id')
      .single();

    if (error || !data) return json(404, { error: 'Key not found or already revoked.' });
    return json(200, { revoked: true });
  }

  return json(404, { error: 'Not found' });
};

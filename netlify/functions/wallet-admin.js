// Admin wallet management — cash credits and bonus grants.
//
// POST /api/admin/wallet/:ownerId/credit — add cash credit (load_cash entry)
//   Body: { amount_cents, owner_type?, note? }
//
// POST /api/admin/wallet/:ownerId/bonus — grant bonus lot (load_bonus + lot)
//   Body: { amount_cents, owner_type?, expires_days?, note? }
//
// Auth: Authorization: Bearer <ADMIN_PASSWORD>
// Feature gate: FEATURE_WALLET must be 'true'.
'use strict';

const { createClient } = require('@supabase/supabase-js');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function sb() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

function json(status, body) {
  return { statusCode: status, headers: HEADERS, body: JSON.stringify(body) };
}

function parseOwnerId(event) {
  const path = (event.path || '').split('?')[0];
  const m = path.match(/\/wallet\/([0-9a-f-]{36})/i);
  return m ? m[1] : null;
}

function isCredit(event) { return (event.path || '').endsWith('/credit'); }
function isBonus(event)  { return (event.path || '').endsWith('/bonus'); }

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  if (process.env.FEATURE_WALLET !== 'true') return json(404, { error: 'Wallet feature not enabled' });

  const authHeader = event.headers['authorization'] || event.headers['Authorization'];
  const adminPw = process.env.ADMIN_PASSWORD;
  if (!adminPw || !authHeader || authHeader !== `Bearer ${adminPw}`) {
    return json(401, { error: 'Admin authentication required' });
  }

  const ownerId = parseOwnerId(event);
  if (!ownerId) return json(400, { error: 'Missing owner ID in path' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const { amount_cents, owner_type = 'member', note, expires_days = 180 } = body;
  if (!Number.isInteger(amount_cents) || amount_cents <= 0) {
    return json(400, { error: 'amount_cents must be a positive integer' });
  }
  if (!['member', 'driver', 'provider'].includes(owner_type)) {
    return json(400, { error: 'Invalid owner_type' });
  }

  const supabase = sb();

  if (isCredit(event)) {
    const { data, error } = await supabase.rpc('wallet_load', {
      p_owner_id:    ownerId,
      p_owner_type:  owner_type,
      p_cash_cents:  amount_cents,
      p_bonus_cents: 0,
      p_description: note || 'Admin cash credit',
    });
    if (error) return json(500, { error: error.message });
    return json(200, { success: true, balances: data?.[0] ?? null });
  }

  if (isBonus(event)) {
    const expiresAt = new Date(Date.now() + expires_days * 86400 * 1000).toISOString();
    const { data, error } = await supabase.rpc('wallet_load', {
      p_owner_id:    ownerId,
      p_owner_type:  owner_type,
      p_cash_cents:  0,
      p_bonus_cents: amount_cents,
      p_description: note || `Admin bonus grant (expires ${expiresAt.slice(0, 10)})`,
    });
    if (error) return json(500, { error: error.message });
    return json(200, { success: true, balances: data?.[0] ?? null });
  }

  return json(404, { error: 'Unknown wallet admin action' });
};

// ============================================================================
// wallet-bonus-expiry-scheduled — expires wallet bonus lots past their 180-day TTL
// Schedule: nightly at 02:30 UTC (netlify.toml)
// ============================================================================
'use strict';

const { createClient } = require('@supabase/supabase-js');

function getSvc() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

exports.handler = async function() {
  if (process.env.FEATURE_WALLET !== 'true') {
    console.log('[wallet-bonus-expiry] FEATURE_WALLET is off — skipping');
    return { statusCode: 200 };
  }

  const svc = getSvc();
  if (!svc) {
    console.error('[wallet-bonus-expiry] missing Supabase credentials');
    return { statusCode: 500 };
  }

  const { error } = await svc.rpc('expire_wallet_bonus_lots');
  if (error) {
    console.error('[wallet-bonus-expiry] RPC error:', error.message);
    return { statusCode: 500 };
  }

  console.log('[wallet-bonus-expiry] expired bonus lots successfully');
  return { statusCode: 200 };
};

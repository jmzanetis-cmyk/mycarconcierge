// ============================================================================
// wallet-member — member wallet balance, load, and auto-reload settings
// FEATURE_WALLET default OFF: returns 404 { code: 'WALLET_DISABLED' } when off.
//
// Routes (via _redirects → /.netlify/functions/wallet-member/:splat):
//   GET  /api/wallet/balance          — member's current balances
//   POST /api/wallet/load             — preload cash + optional bonus
//   GET  /api/wallet/settings         — read auto-reload configuration
//   PUT  /api/wallet/settings         — update auto-reload configuration
// ============================================================================
'use strict';

const { createClient } = require('@supabase/supabase-js');
const { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return require('stripe')(key, { apiVersion: STRIPE_API_VERSION });
}

function getSvc() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
};

function resp(status, body) {
  return { statusCode: status, headers: cors, body: JSON.stringify(body) };
}

async function getUser(event, svc) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  return user ?? null;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };

  if (process.env.FEATURE_WALLET !== 'true') {
    return resp(404, { code: 'WALLET_DISABLED', error: 'Wallet feature is not yet enabled.' });
  }

  const svc = getSvc();
  if (!svc) return resp(500, { error: 'Server configuration error' });

  const user = await getUser(event, svc);
  if (!user) return resp(401, { error: 'Authentication required' });

  const path = (event.path || '').replace(/^.*\/wallet-member\/?/, '').replace(/^\/?api\/wallet\/?/, '');
  const method = event.httpMethod;

  // ── GET /balance ──────────────────────────────────────────────────────────
  if (method === 'GET' && path === 'balance') {
    const { data: wallet } = await svc
      .from('wallet_accounts')
      .select('cash_balance_cents, bonus_balance_cents, auto_reload_enabled, auto_reload_threshold_cents, auto_reload_amount_cents')
      .eq('owner_id', user.id)
      .eq('owner_type', 'member')
      .maybeSingle();

    if (!wallet) {
      return resp(200, { cash_balance_cents: 0, bonus_balance_cents: 0, total_cents: 0 });
    }

    return resp(200, {
      cash_balance_cents:          wallet.cash_balance_cents,
      bonus_balance_cents:         wallet.bonus_balance_cents,
      total_cents:                 wallet.cash_balance_cents + wallet.bonus_balance_cents,
      auto_reload_enabled:         wallet.auto_reload_enabled,
      auto_reload_threshold_cents: wallet.auto_reload_threshold_cents,
      auto_reload_amount_cents:    wallet.auto_reload_amount_cents,
    });
  }

  // ── POST /load ────────────────────────────────────────────────────────────
  if (method === 'POST' && path === 'load') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }

    const { amount_cents, payment_method_id } = body;
    if (!amount_cents || typeof amount_cents !== 'number' || amount_cents < 100) {
      return resp(400, { error: 'amount_cents must be at least 100 (≥ $1.00)' });
    }
    if (!payment_method_id) {
      return resp(400, { error: 'payment_method_id required' });
    }

    // Determine bonus: >= $25 load earns 10% bonus (matching spec default; config-tunable later)
    const BONUS_THRESHOLD_CENTS = 2500;
    const BONUS_RATE = 0.10;
    const bonus_cents = amount_cents >= BONUS_THRESHOLD_CENTS
      ? Math.round(amount_cents * BONUS_RATE) : 0;

    // Get or create Stripe customer
    const { data: profile } = await svc
      .from('profiles')
      .select('stripe_customer_id, email')
      .eq('id', user.id)
      .single();

    let customerId = profile?.stripe_customer_id;
    const stripe = getStripe();
    if (!stripe) return resp(500, { error: 'Payment service unavailable' });

    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    profile?.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await svc.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    // Charge the load amount
    let pi;
    try {
      pi = await stripe.paymentIntents.create({
        amount:         amount_cents,
        currency:       'usd',
        customer:       customerId,
        payment_method: payment_method_id,
        confirm:        true,
        off_session:    false, // member is present for wallet loads
        description:    `MCC Wallet top-up — $${(amount_cents / 100).toFixed(2)}`,
        metadata:       { user_id: user.id, type: 'wallet_load', bonus_cents },
      }, { idempotencyKey: `wallet_load_${user.id}_${amount_cents}_${payment_method_id}` });
    } catch (stripeErr) {
      return resp(402, { error: 'Payment failed: ' + stripeErr.message });
    }

    if (pi.status !== 'succeeded') {
      return resp(402, { error: 'Payment not confirmed — status: ' + pi.status });
    }

    // Credit the wallet via RPC
    const { data: newBalances, error: walletErr } = await svc.rpc('wallet_load', {
      p_owner_id:              user.id,
      p_owner_type:            'member',
      p_cash_cents:            amount_cents,
      p_bonus_cents:           bonus_cents,
      p_stripe_payment_intent: pi.id,
      p_description:           `Wallet top-up $${(amount_cents / 100).toFixed(2)}`,
    });

    if (walletErr) {
      // Stripe charge succeeded but wallet credit failed — log for manual reconciliation
      console.error('[wallet-member] wallet_load RPC failed after charge', {
        userId: user.id, pi: pi.id, error: walletErr.message,
      });
      return resp(500, { error: 'Wallet credit failed — payment was taken. Please contact support.' });
    }

    return resp(200, {
      success:                true,
      cash_loaded_cents:      amount_cents,
      bonus_granted_cents:    bonus_cents,
      cash_balance_cents:     newBalances?.[0]?.cash_balance_cents ?? 0,
      bonus_balance_cents:    newBalances?.[0]?.bonus_balance_cents ?? 0,
      stripe_payment_intent:  pi.id,
    });
  }

  // ── GET /settings ─────────────────────────────────────────────────────────
  if (method === 'GET' && path === 'settings') {
    const { data: wallet } = await svc
      .from('wallet_accounts')
      .select('auto_reload_enabled, auto_reload_threshold_cents, auto_reload_amount_cents')
      .eq('owner_id', user.id)
      .eq('owner_type', 'member')
      .maybeSingle();

    return resp(200, {
      auto_reload_enabled:         wallet?.auto_reload_enabled         ?? false,
      auto_reload_threshold_cents: wallet?.auto_reload_threshold_cents ?? null,
      auto_reload_amount_cents:    wallet?.auto_reload_amount_cents    ?? null,
    });
  }

  // ── PUT /settings ─────────────────────────────────────────────────────────
  if (method === 'PUT' && path === 'settings') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }

    const updates = {};
    if (typeof body.auto_reload_enabled === 'boolean')
      updates.auto_reload_enabled = body.auto_reload_enabled;
    if (Number.isInteger(body.auto_reload_threshold_cents) && body.auto_reload_threshold_cents >= 0)
      updates.auto_reload_threshold_cents = body.auto_reload_threshold_cents;
    if (Number.isInteger(body.auto_reload_amount_cents) && body.auto_reload_amount_cents >= 0)
      updates.auto_reload_amount_cents = body.auto_reload_amount_cents;

    if (Object.keys(updates).length === 0) {
      return resp(400, { error: 'No valid fields provided. Allowed: auto_reload_enabled, auto_reload_threshold_cents, auto_reload_amount_cents' });
    }

    updates.updated_at = new Date().toISOString();

    const { error: updateErr } = await svc
      .from('wallet_accounts')
      .update(updates)
      .eq('owner_id', user.id)
      .eq('owner_type', 'member');

    if (updateErr) {
      return resp(500, { error: 'Failed to update settings' });
    }

    return resp(200, { success: true, updated: updates });
  }

  return resp(404, { error: 'Not found' });
};

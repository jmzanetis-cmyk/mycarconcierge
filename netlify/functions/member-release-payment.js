// ============================================================================
// member-release-payment — member confirms job done and releases held payment
//
// POST /api/payment/release
//   Body: { packageId }
//   Auth: member JWT
//
// 1. Finds the payments row for this package (must be member's own).
// 2. Captures the Stripe PaymentIntent (releases the held funds to MCC).
// 3. Calls the member_release_payment RPC to mark payments.status = 'released'.
// ============================================================================
'use strict';

const { createClient } = require('@supabase/supabase-js');
const { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return require('stripe')(key, { apiVersion: STRIPE_API_VERSION });
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function resp(status, body) {
  return { statusCode: status, headers: corsHeaders, body: JSON.stringify(body) };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return resp(405, { error: 'Method not allowed' });

  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return resp(401, { error: 'Authentication required' });

  const supabase = getSupabase();
  if (!supabase) return resp(500, { error: 'Server configuration error' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return resp(401, { error: 'Invalid or expired token' });

  let parsed;
  try { parsed = JSON.parse(event.body || '{}'); } catch { return resp(400, { error: 'Invalid JSON' }); }

  const { packageId } = parsed;
  if (!packageId) return resp(400, { error: 'packageId required' });

  // Fetch the payment row — must belong to this member
  const { data: payment, error: pmtErr } = await supabase
    .from('payments')
    .select('id, package_id, member_id, stripe_payment_intent_id, stripe_payment_intent, stripe_payment_id, status')
    .eq('package_id', packageId)
    .maybeSingle();

  if (pmtErr || !payment) return resp(404, { error: 'Payment record not found' });
  if (payment.member_id && payment.member_id !== user.id) return resp(403, { error: 'Forbidden' });
  if (payment.status === 'released') return resp(200, { success: true, already_released: true });

  // Resolve PI id from whichever column is populated
  const piId = payment.stripe_payment_intent_id || payment.stripe_payment_intent || payment.stripe_payment_id;
  if (!piId) {
    // No Stripe PI — fall through to just mark released (legacy/offline payments)
    await supabase.rpc('member_release_payment', { p_package_id: packageId });
    return resp(200, { success: true, stripe_captured: false });
  }

  const stripe = getStripe();
  if (!stripe) return resp(500, { error: 'Payment service unavailable' });

  // Capture the held funds
  try {
    await stripe.paymentIntents.capture(piId);
  } catch (captureErr) {
    // 'already_captured' is not a real error — the PI may have been captured by webhook
    if (captureErr?.code !== 'payment_intent_unexpected_state') {
      console.error('[member-release-payment] Stripe capture error:', captureErr.message);
      return resp(402, { error: 'Payment capture failed: ' + captureErr.message });
    }
  }

  // Mark released in DB
  await supabase.rpc('member_release_payment', { p_package_id: packageId });

  return resp(200, { success: true, stripe_captured: true });
};

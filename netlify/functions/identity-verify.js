// ============================================================================
// identity-verify — Stripe Identity KYC session management
//
// Routes (mounted under /api/identity/* via _redirects):
//   POST /api/identity/session   — create a Stripe VerificationSession for the
//                                  current user and return client_secret
//   GET  /api/identity/status    — return the user's current identity_verified
//                                  status and session state
//
// Webhook events (fired by stripe-webhook.js, NOT this file):
//   identity.verification_session.verified        → identity_verified = true
//   identity.verification_session.requires_input  → log / notify
//
// Env: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

function getBearerToken(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function stripPrefix(p) {
  return (p || '')
    .replace(/^\/?\.netlify\/functions\/identity-verify\/?/, '')
    .replace(/^\/?api\/identity\/?/, '')
    .replace(/^\/+/, '');
}

async function authenticate(event, supabase) {
  const token = getBearerToken(event);
  if (!token) return { error: jsonResponse(401, { error: 'Missing bearer token' }) };
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: jsonResponse(401, { error: 'Invalid token' }) };
  return { user };
}

// ---------------------------------------------------------------------------
// POST /api/identity/session — create or retrieve a VerificationSession
// ---------------------------------------------------------------------------
async function handleCreateSession(event, supabase) {
  const auth = await authenticate(event, supabase);
  if (auth.error) return auth.error;
  const { user } = auth;

  const stripe = getStripe();
  if (!stripe) return jsonResponse(500, { error: 'Payment service unavailable' });

  // If already verified, no need to create a new session
  const { data: profile } = await supabase.from('profiles')
    .select('identity_verified, stripe_identity_session_id, full_name, email')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.identity_verified) {
    return jsonResponse(200, { already_verified: true });
  }

  // Create a new Stripe VerificationSession
  const session = await stripe.identity.verificationSessions.create({
    type: 'document',
    metadata: { user_id: user.id },
    options: {
      document: {
        // Accept driver's license, passport, or ID card
        allowed_types: ['driving_license', 'passport', 'id_card'],
        require_matching_selfie: true,
      },
    },
  });

  // Persist the session id so the webhook can correlate it back to the user
  await supabase.from('profiles')
    .update({
      stripe_identity_session_id: session.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  return jsonResponse(200, { client_secret: session.client_secret, session_id: session.id });
}

// ---------------------------------------------------------------------------
// GET /api/identity/status — current KYC status for the user
// ---------------------------------------------------------------------------
async function handleGetStatus(event, supabase) {
  const auth = await authenticate(event, supabase);
  if (auth.error) return auth.error;
  const { user } = auth;

  const { data: profile } = await supabase.from('profiles')
    .select('identity_verified, stripe_identity_session_id, identity_verified_at')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) return jsonResponse(404, { error: 'Profile not found' });

  // Optionally fetch live session status from Stripe for the current session
  let session_status = null;
  if (profile.stripe_identity_session_id && !profile.identity_verified) {
    const stripe = getStripe();
    if (stripe) {
      try {
        const sess = await stripe.identity.verificationSessions.retrieve(
          profile.stripe_identity_session_id
        );
        session_status = sess.status; // 'requires_input' | 'processing' | 'verified' | 'canceled'
      } catch (e) {
        console.warn('[identity-verify] could not retrieve session:', e.message);
      }
    }
  }

  return jsonResponse(200, {
    identity_verified:    profile.identity_verified,
    identity_verified_at: profile.identity_verified_at,
    session_status,
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return jsonResponse(200, {});
  }

  const supabase = getSupabase();
  if (!supabase) return jsonResponse(500, { error: 'Database not configured' });

  const path   = stripPrefix(event.path);
  const method = event.httpMethod;

  if (method === 'POST' && path === 'session') {
    return handleCreateSession(event, supabase);
  }
  if (method === 'GET' && path === 'status') {
    return handleGetStatus(event, supabase);
  }

  return jsonResponse(404, { error: 'Not found' });
};

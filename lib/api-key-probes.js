// ============================================================================
// MCC API Key Live Probes (Task #458)
//
// Each probe function receives the raw env-var value for the key and returns:
//   { working: true }              — key accepted by the upstream API
//   { working: null, reason }      — key type can't be probed (skip silently)
// Or throws an Error with a human-readable message when the key is rejected.
//
// Probes are intentionally the cheapest possible API call: list endpoints,
// metadata fetches, empty-body requests — nothing that mutates state or
// costs significant compute. The Anthropic probe uses GET /v1/models (no
// token spend). Stripe uses balance.retrieve (read-only).
// ============================================================================

'use strict';

const STRIPE_API_VERSION = require('./stripe-api-version');

// ── helpers ─────────────────────────────────────────────────────────────────

async function httpGet(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (res.ok) return res;
  const text = await res.text().catch(() => '');
  throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
}

// ── probe implementations ───────────────────────────────────────────────────

async function probeStripeSecretKey(envVal) {
  const Stripe = require('stripe');
  const stripe = new Stripe(envVal, { apiVersion: STRIPE_API_VERSION });
  await stripe.balance.retrieve();
  return { working: true };
}

async function probeTwilioAuthToken(envVal) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  if (!accountSid) return { working: null, reason: 'TWILIO_ACCOUNT_SID not set' };
  await httpGet(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
    { Authorization: 'Basic ' + Buffer.from(`${accountSid}:${envVal}`).toString('base64') }
  );
  return { working: true };
}

async function probeResendApiKey(envVal) {
  // GET /domains is the lightest authenticated endpoint
  await httpGet('https://api.resend.com/domains', { Authorization: `Bearer ${envVal}` });
  return { working: true };
}

async function probeAnthropicApiKey(envVal) {
  // GET /v1/models — no token spend, just authentication check
  await httpGet('https://api.anthropic.com/v1/models', {
    'x-api-key': envVal,
    'anthropic-version': '2023-06-01'
  });
  return { working: true };
}

async function probeGeminiApiKey(envVal) {
  await httpGet(`https://generativelanguage.googleapis.com/v1beta/models?key=${envVal}`);
  return { working: true };
}

async function probeGoogleVisionApiKey(envVal) {
  // POST with empty requests array — API accepts the key and returns 200
  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${envVal}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [] })
  });
  // 200 = key accepted; 400 = key accepted but request invalid (also fine)
  if (res.ok || res.status === 400) return { working: true };
  const text = await res.text().catch(() => '');
  throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
}

async function probeHubspotToken(envVal) {
  // GET /crm/v3/owners?limit=1 — lightweight, works with private-app tokens
  await httpGet('https://api.hubapi.com/crm/v3/owners?limit=1', {
    Authorization: `Bearer ${envVal}`
  });
  return { working: true };
}

async function probeGithubToken(envVal) {
  await httpGet('https://api.github.com/user', {
    Authorization: `Bearer ${envVal}`,
    'User-Agent': 'MCC-API-Monitor/1.0'
  });
  return { working: true };
}

async function probeBgcApiToken(envVal) {
  const base = process.env.BGC_API_BASE || 'https://app.backgroundchecks.com/api';
  // Hit the account profile endpoint with bearer auth
  const res = await fetch(`${base}/v1/account`, {
    headers: { Authorization: `Bearer ${envVal}` }
  });
  if (res.ok) return { working: true };
  // Some BGC endpoints use X-API-Key header
  const res2 = await fetch(`${base}/v1/account`, {
    headers: { 'X-API-Key': envVal }
  });
  if (res2.ok) return { working: true };
  throw new Error(`HTTP ${res2.status}`);
}

// ── probe registry ───────────────────────────────────────────────────────────

const PROBES = {
  stripe_secret_key:    probeStripeSecretKey,
  stripe_webhook_secret: () => ({ working: null, reason: 'signing secret — not probeable via API' }),
  resend_api_key:       probeResendApiKey,
  twilio_auth_token:    probeTwilioAuthToken,
  anthropic_api_key:    probeAnthropicApiKey,
  gemini_api_key:       probeGeminiApiKey,
  google_vision_api_key: probeGoogleVisionApiKey,
  hubspot_token:        probeHubspotToken,
  github_token:         probeGithubToken,
  facebook_app_secret:  () => ({ working: null, reason: 'signing secret — not probeable via API' }),
  bgc_api_token:        probeBgcApiToken
};

/**
 * Run the live probe for keyConfig.
 * Returns { working: true|null, reason?, error? }.
 */
async function runProbe(keyConfig) {
  const probeFn = PROBES[keyConfig.id];
  if (!probeFn) return { working: null, reason: 'no probe defined' };

  const envVal = process.env[keyConfig.env_var];
  if (!envVal) return { working: null, reason: 'env var not set' };

  try {
    return await probeFn(envVal);
  } catch (err) {
    return { working: false, error: err.message };
  }
}

module.exports = { runProbe, PROBES };

// ============================================================================
// MCC API Key Expiry Tracker — Configuration (Task #353)
//
// Generalization of the Task #246 Stripe-only expiry reminder. Each entry
// here is a critical platform secret that can expire or be rotated by its
// provider; when any of them silently dies, an entire feature surface goes
// dark with no warning. The scheduled function in
// `netlify/functions/api-key-expiry-scheduled.js` loops over this array and
// applies the same 3-day / 1-day / 0-day reminder ladder + idempotency model
// the Stripe-only path used.
//
// Each entry:
//   id           — stable identifier (used in ai_action_log.target_id and as
//                  the key in admin UI rendering)
//   label        — short human label for emails + admin pill
//   env_var      — the Netlify env-var name the admin must rotate
//   setting_key  — ai_ops_settings row key holding the YYYY-MM-DD expiry
//                  date (the row's updated_at gates idempotency)
//   module       — ai_action_log.module value (idempotency scope)
//   feature      — one-sentence "what breaks if this expires" description,
//                  inlined in alert emails so the admin instantly knows the
//                  blast radius before deciding how urgent the rotation is.
//   rotation_steps — ordered list of plain-language steps the admin runs
//                  after rotating; mirrored in replit.md and shown in-app.
//
// Backward compat: the Stripe entry intentionally reuses the Task #246
// setting_key 'stripe_key_expiry_date' and module 'stripe_key_expiry' so
// the existing row, alert history, and any in-flight alert cooldowns
// transfer cleanly with no data migration.
// ============================================================================

const TRACKED_KEYS = [
  {
    id: 'stripe_secret_key',
    label: 'Stripe Secret Key',
    env_var: 'STRIPE_SECRET_KEY',
    setting_key: 'stripe_key_expiry_date',
    module: 'stripe_key_expiry',
    feature: 'Every payment flow (bid pack checkouts, merch, split-pay, instant Connect payouts, webhook signature verification) breaks until you rotate the key.',
    rotation_steps: [
      'Rotate the secret key in the Stripe dashboard.',
      'Update STRIPE_SECRET_KEY in the Netlify environment.',
      'Open admin → Payments → API Keys and update the expiry date so the next reminder cycle resets.'
    ]
  },
  {
    id: 'stripe_webhook_secret',
    label: 'Stripe Webhook Signing Secret',
    env_var: 'STRIPE_WEBHOOK_SECRET',
    setting_key: 'api_key_expiry__stripe_webhook_secret',
    module: 'api_key_expiry__stripe_webhook_secret',
    feature: 'Stripe webhook signature verification fails, which blocks bid-pack credits, completion lifecycle transitions, and refund acknowledgements until you rotate the secret.',
    rotation_steps: [
      'Roll the webhook signing secret in Stripe → Developers → Webhooks.',
      'Update STRIPE_WEBHOOK_SECRET in the Netlify environment.',
      'Update the expiry date in admin → Payments → API Keys.'
    ]
  },
  {
    id: 'resend_api_key',
    label: 'Resend API Key',
    env_var: 'RESEND_API_KEY',
    setting_key: 'api_key_expiry__resend_api_key',
    module: 'api_key_expiry__resend_api_key',
    feature: 'All transactional + marketing email goes dark (admin alerts, password resets, the daily digest, the very alert you would expect to warn you about this) until you rotate the key.',
    rotation_steps: [
      'Generate a new API key in Resend.',
      'Update RESEND_API_KEY in the Netlify environment.',
      'Update the expiry date in admin → Payments → API Keys.'
    ]
  },
  {
    id: 'twilio_auth_token',
    label: 'Twilio Auth Token',
    env_var: 'TWILIO_AUTH_TOKEN',
    setting_key: 'api_key_expiry__twilio_auth_token',
    module: 'api_key_expiry__twilio_auth_token',
    feature: 'Every SMS surface (appointment reminders, driver OTP login, bid-accepted texts, reminder retries) and Twilio Verify both stop working until you rotate the token.',
    rotation_steps: [
      'Rotate the primary auth token in the Twilio console.',
      'Update TWILIO_AUTH_TOKEN in the Netlify environment.',
      'Update the expiry date in admin → Payments → API Keys.'
    ]
  },
  {
    id: 'anthropic_api_key',
    label: 'Anthropic (Claude) API Key',
    env_var: 'ANTHROPIC_API_KEY',
    setting_key: 'api_key_expiry__anthropic_api_key',
    module: 'api_key_expiry__anthropic_api_key',
    feature: 'AI Helpdesk, AI bid analysis, AI fair-price estimator, dispute resolution, the marketing hub, and the entire AI Ops agent fleet all fall back to error strings until you rotate the key.',
    rotation_steps: [
      'Issue a new key in the Anthropic console.',
      'Update ANTHROPIC_API_KEY in the Netlify environment.',
      'Update the expiry date in admin → Payments → API Keys.'
    ]
  },
  {
    id: 'gemini_api_key',
    label: 'Google Gemini API Key',
    env_var: 'GEMINI_API_KEY',
    setting_key: 'api_key_expiry__gemini_api_key',
    module: 'api_key_expiry__gemini_api_key',
    feature: 'Gemini-backed AI helpers (Dream Car Finder, secondary AI fallbacks) start returning errors until you rotate the key.',
    rotation_steps: [
      'Generate a new key in Google AI Studio.',
      'Update GEMINI_API_KEY in the Netlify environment.',
      'Update the expiry date in admin → Payments → API Keys.'
    ]
  },
  {
    id: 'google_vision_api_key',
    label: 'Google Vision API Key',
    env_var: 'GOOGLE_VISION_API_KEY',
    setting_key: 'api_key_expiry__google_vision_api_key',
    module: 'api_key_expiry__google_vision_api_key',
    feature: 'Insurance-card OCR and any other Vision-powered document scan silently fails until you rotate the key.',
    rotation_steps: [
      'Generate a new key in Google Cloud → APIs & Services → Credentials.',
      'Update GOOGLE_VISION_API_KEY in the Netlify environment.',
      'Update the expiry date in admin → Payments → API Keys.'
    ]
  },
  {
    id: 'hubspot_token',
    label: 'HubSpot Access Token',
    env_var: 'HUBSPOT_ACCESS_TOKEN',
    setting_key: 'api_key_expiry__hubspot_token',
    module: 'api_key_expiry__hubspot_token',
    feature: 'Outbound CRM sync (contacts, lead lifecycle stages, marketing automation triggers) stops mirroring to HubSpot until you rotate the token.',
    rotation_steps: [
      'Rotate the private app token in HubSpot → Settings → Integrations.',
      'Update HUBSPOT_ACCESS_TOKEN in the Netlify environment.',
      'Update the expiry date in admin → Payments → API Keys.'
    ]
  },
  {
    id: 'github_token',
    label: 'GitHub Personal Access Token',
    env_var: 'GITHUB_TOKEN',
    setting_key: 'api_key_expiry__github_token',
    module: 'api_key_expiry__github_token',
    feature: 'Any automation that pushes commits, opens PRs, or reads issue state on behalf of the platform starts 401-ing until you rotate the PAT.',
    rotation_steps: [
      'Generate a new fine-grained PAT in GitHub → Settings → Developer settings.',
      'Update GITHUB_TOKEN in the Netlify environment.',
      'Update the expiry date in admin → Payments → API Keys.'
    ]
  },
  {
    id: 'facebook_app_secret',
    label: 'Facebook App Secret',
    env_var: 'FACEBOOK_APP_SECRET',
    setting_key: 'api_key_expiry__facebook_app_secret',
    module: 'api_key_expiry__facebook_app_secret',
    feature: 'Admin Facebook page connection OAuth + Conversions API server-side events both stop verifying until you rotate the secret.',
    rotation_steps: [
      'Reset the app secret in Meta for Developers → App → Settings.',
      'Update FACEBOOK_APP_SECRET in the Netlify environment.',
      'Update the expiry date in admin → Payments → API Keys.'
    ]
  },
  {
    id: 'bgc_api_token',
    label: 'BackgroundChecks.com API Token',
    env_var: 'BGC_API_TOKEN',
    setting_key: 'api_key_expiry__bgc_api_token',
    module: 'api_key_expiry__bgc_api_token',
    feature: 'Voluntary employee background checks (platform-fallback path) stop being placeable until you rotate the API token.',
    rotation_steps: [
      'Issue a new API token in the BackgroundChecks.com dashboard.',
      'Update BGC_API_TOKEN in the Netlify environment.',
      'Update the expiry date in admin → Payments → API Keys.'
    ]
  }
];

function findKeyConfig(id) {
  return TRACKED_KEYS.find(k => k.id === id) || null;
}

module.exports = { TRACKED_KEYS, findKeyConfig };

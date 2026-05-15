// ─────────────────────────────────────────────────────────────────────────────
// Task #372 — Public BGC widget config endpoint
//
// GET /api/provider/bgc/config
//   Returns the BackgroundChecks.com widget host + the platform's source
//   token so the enrollment page can load the correct registration widget
//   (sandbox vs prod) without leaking the API token or private key.
//
// No auth required: source_token is an opaque platform identifier that BGC
// uses to associate the resulting customer account with our reseller
// account. It cannot be used to authenticate API calls (those require the
// api_token), so it is safe to send to the browser.
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

function deriveWidgetBase() {
  if (process.env.BGC_PUBLIC_FORM_BASE) return process.env.BGC_PUBLIC_FORM_BASE.replace(/\/$/, '');
  // Mirror BGC_API_BASE host. e.g. https://app.backgroundchecks.com/api → https://app.backgroundchecks.com
  const base = process.env.BGC_API_BASE || 'https://app.backgroundchecks.com/api';
  try {
    const u = new URL(base);
    return `${u.protocol}//${u.host}`;
  } catch {
    return 'https://app.backgroundchecks.com';
  }
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      widget_base: deriveWidgetBase(),
      source_token: process.env.BGC_SOURCE_TOKEN || '',
      live_mode: String(process.env.BGC_LIVE_MODE || '').toLowerCase() === 'true'
    })
  };
};

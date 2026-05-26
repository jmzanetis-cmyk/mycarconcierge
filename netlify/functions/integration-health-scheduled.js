// integration-health-scheduled.js
//
// Daily smoke check for third-party integration API keys:
//   - INSTANTLY_API_KEY   — GET /api/v2/accounts (list, no side-effects)
//   - GOOGLE_MAPS_API_KEY — geocode "1600 Amphitheatre Pkwy, Mountain View, CA"
//   - APOLLO_API_KEY      — GET /api/v1/auth/health
//
// On failure: sends admin alert email + logs to ai_action_log.
// Schedule: 04:15 UTC daily (staggered 15 min after anthropic-health).
// On-demand: POST with x-admin-password header.

'use strict';

let { getSupabase, authorizeAgentInvocation, jsonResponse } = require('./agent-fleet-runtime');

let MCC_APP_URL = process.env.MCC_APP_URL || 'https://mycarconcierge.com';

// ---------------------------------------------------------------------------
// Individual probe functions — each returns:
//   { integration, ok: true, latency_ms }
//   { integration, ok: false, status, code, message, latency_ms }
// Never throws.
// ---------------------------------------------------------------------------

async function probeInstantly() {
  let integration = 'instantly';
  let apiKey = process.env.INSTANTLY_API_KEY;
  if (!apiKey) {
    return { integration, ok: false, status: 0, code: 'no_api_key', message: 'INSTANTLY_API_KEY not set', latency_ms: 0 };
  }
  let start = Date.now();
  try {
    let r = await fetch('https://api.instantly.ai/api/v2/accounts?limit=1', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' }
    });
    let latency_ms = Date.now() - start;
    if (r.ok || r.status === 200) {
      return { integration, ok: true, status: r.status, latency_ms };
    }
    let body = '';
    try { body = await r.text(); } catch (_) {}
    return { integration, ok: false, status: r.status, code: 'http_' + r.status, message: body.slice(0, 300), latency_ms };
  } catch (err) {
    return { integration, ok: false, status: 0, code: 'network_error', message: err.message.slice(0, 300), latency_ms: Date.now() - start };
  }
}

async function probeGoogleMaps() {
  let integration = 'google_maps';
  let apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { integration, ok: false, status: 0, code: 'no_api_key', message: 'GOOGLE_MAPS_API_KEY not set', latency_ms: 0 };
  }
  let start = Date.now();
  try {
    let url = 'https://maps.googleapis.com/maps/api/geocode/json?address=1600+Amphitheatre+Pkwy+Mountain+View+CA&key=' + encodeURIComponent(apiKey);
    let r = await fetch(url);
    let latency_ms = Date.now() - start;
    if (!r.ok) {
      return { integration, ok: false, status: r.status, code: 'http_' + r.status, message: 'HTTP ' + r.status, latency_ms };
    }
    let data = await r.json();
    // Google returns 200 even for errors; check the status field in the body
    if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
      return { integration, ok: true, status: 200, latency_ms };
    }
    return {
      integration, ok: false, status: 200,
      code: data.status || 'api_error',
      message: data.error_message || data.status || 'Unknown Google Maps error',
      latency_ms
    };
  } catch (err) {
    return { integration, ok: false, status: 0, code: 'network_error', message: err.message.slice(0, 300), latency_ms: Date.now() - start };
  }
}

async function probeApollo() {
  let integration = 'apollo';
  let apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    return { integration, ok: false, status: 0, code: 'no_api_key', message: 'APOLLO_API_KEY not set', latency_ms: 0 };
  }
  let start = Date.now();
  try {
    // /api/v1/auth/health validates the key with no credit consumption
    let r = await fetch('https://api.apollo.io/api/v1/auth/health', {
      method: 'GET',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' }
    });
    let latency_ms = Date.now() - start;
    let body = '';
    try { body = await r.text(); } catch (_) {}
    if (r.ok || r.status === 200) {
      return { integration, ok: true, status: r.status, latency_ms };
    }
    let code = 'http_' + r.status;
    if (r.status === 401 || r.status === 403) code = 'auth_error';
    if (r.status === 402 || r.status === 429) code = 'credits_exhausted';
    return { integration, ok: false, status: r.status, code, message: body.slice(0, 300), latency_ms };
  } catch (err) {
    return { integration, ok: false, status: 0, code: 'network_error', message: err.message.slice(0, 300), latency_ms: Date.now() - start };
  }
}

// ---------------------------------------------------------------------------
// runHealthCheck: probe all integrations in parallel.
// ---------------------------------------------------------------------------
async function runHealthCheck() {
  let results = await Promise.all([probeInstantly(), probeGoogleMaps(), probeApollo()]);
  let failed = results.filter(function (r) { return !r.ok; });
  return {
    ok: failed.length === 0,
    results,
    failed,
    failure_count: failed.length,
    total: results.length,
    checked_at: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// logToAiActionLog
// ---------------------------------------------------------------------------
async function logToAiActionLog(supabase, summary, triggeredBy) {
  if (!supabase) return;
  try {
    await supabase.from('ai_action_log').insert({
      module: 'integration_health',
      action_type: 'integration_smoke_check',
      target_id: null,
      decision: summary.ok ? 'all_integrations_alive' : 'integrations_failing',
      confidence: 1.0,
      auto_executed: true,
      escalated: !summary.ok,
      outcome: summary.ok ? 'passed' : 'failed',
      error_details: summary.ok ? null : { failed: summary.failed, triggered_by: triggeredBy },
      execution_time_ms: summary.results.reduce(function (acc, r) { return acc + (r.latency_ms || 0); }, 0),
      created_at: new Date().toISOString()
    });
  } catch (e) {
    console.warn('[integration-health] ai_action_log insert failed:', e.message);
  }
}

// ---------------------------------------------------------------------------
// sendFailureEmail
// ---------------------------------------------------------------------------
async function sendFailureEmail(summary) {
  let apiKey    = process.env.RESEND_API_KEY;
  let toEmail   = process.env.ADMIN_EMAIL || process.env.MCC_FROM_EMAIL;
  let fromEmail = process.env.MCC_FROM_EMAIL || 'no-reply@mycarconcierge.com';
  if (!apiKey || !toEmail) return { sent: false, reason: 'email_not_configured' };

  let rows = summary.failed.map(function (f) {
    return '<tr>'
      + '<td style="padding:6px 12px 6px 0;font-family:monospace;">' + f.integration + '</td>'
      + '<td style="padding:6px 0;"><strong>' + (f.status || '—') + '</strong></td>'
      + '<td style="padding:6px 12px;font-family:monospace;color:#c0392b;">' + (f.code || '—') + '</td>'
      + '<td style="padding:6px 0;color:#666;">' + (f.message || '—') + '</td>'
      + '</tr>';
  }).join('');

  let count = summary.failure_count;
  let subject = '[MCC] Integration health check FAILED (' + count + '/' + summary.total + ' integration' + (count === 1 ? '' : 's') + ')';

  let codeGuide = [
    '<li><code>no_api_key</code>: environment variable is missing — add it in the Netlify dashboard under Site Settings → Environment Variables.</li>',
    '<li><code>auth_error</code> (401/403): key has been revoked or rotated — regenerate in the provider dashboard and update the env var.</li>',
    '<li><code>credits_exhausted</code> (402/429): Apollo or Instantly credits depleted — top up the account.</li>',
    '<li><code>REQUEST_DENIED</code> / Google Maps error: key may be missing the Geocoding API or has billing disabled.</li>',
    '<li><code>network_error</code>: transient connectivity issue — re-run before making changes.</li>',
    '<li>To re-run on demand: <code>curl -X POST -H "x-admin-password: $ADMIN_PASSWORD" ' + MCC_APP_URL + '/.netlify/functions/integration-health-scheduled</code></li>'
  ].join('');

  let html =
    '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;color:#222;">'
    + '<h2 style="color:#c0392b;margin:0 0 12px;">Integration health check failed</h2>'
    + '<p style="margin:0 0 16px;">One or more third-party API keys failed validation. Dependent features (outreach, geocoding, lead sync) may be silently failing for users right now.</p>'
    + '<table style="border-collapse:collapse;font-size:13px;width:100%;margin:16px 0;">'
    + '<thead><tr style="text-align:left;color:#666;border-bottom:1px solid #eee;">'
    + '<th style="padding:6px 12px 6px 0;">Integration</th>'
    + '<th style="padding:6px 0;">HTTP</th>'
    + '<th style="padding:6px 12px;">Code</th>'
    + '<th style="padding:6px 0;">Message</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table>'
    + '<h3 style="margin:18px 0 8px;font-size:14px;">Triage</h3>'
    + '<ol style="font-size:13px;line-height:1.6;color:#333;">' + codeGuide + '</ol>'
    + '<p style="font-size:12px;color:#888;margin-top:24px;">Checked at ' + summary.checked_at + '. Source: <code>netlify/functions/integration-health-scheduled.js</code>.</p>'
    + '</div>';

  let textLines = ['Integration health check failed', '', 'Failed integrations:'];
  summary.failed.forEach(function (f) {
    textLines.push('  ' + f.integration + '  status=' + f.status + '  code=' + f.code + '  ' + f.message);
  });
  textLines.push('', 'Checked at: ' + summary.checked_at);

  try {
    let r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        from: 'My Car Concierge Ops <' + fromEmail + '>',
        to: [toEmail],
        subject,
        html,
        text: textLines.join('\n')
      })
    });
    if (!r.ok) {
      let txt = await r.text().catch(function () { return ''; });
      return { sent: false, reason: 'resend_error', error: 'Resend ' + r.status + ': ' + txt.slice(0, 200) };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: 'resend_exception', error: e.message };
  }
}

// ---------------------------------------------------------------------------
// handler
// ---------------------------------------------------------------------------
exports.handler = async function (event) {
  let auth = authorizeAgentInvocation(event);
  if (!auth) return jsonResponse(401, { error: 'unauthorized' });

  let summary = await runHealthCheck();
  let supabase = getSupabase();
  await logToAiActionLog(supabase, summary, auth);

  let emailResult = { sent: false, reason: 'all_integrations_passed' };
  if (!summary.ok) {
    emailResult = await sendFailureEmail(summary);
  }

  return jsonResponse(summary.ok ? 200 : 500, {
    triggered_by: auth,
    summary,
    email: emailResult
  });
};

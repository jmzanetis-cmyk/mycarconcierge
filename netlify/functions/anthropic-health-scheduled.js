// ============================================================================
// Task #217 — Anthropic model availability smoke check
//
// Runs once a day off-hours (cron in netlify.toml). For each Claude model in
// active production use, sends a 1-token request. If any model returns an
// error consistent with deprecation/retirement (`model_not_found`,
// `invalid_request_error`, etc.), we surface the failure two ways:
//   1. Log a row to `ai_action_log` so the AI Ops dashboard shows it.
//   2. Send an admin email via Resend mirroring the gatekeeper-smoke path
//      (RESEND_API_KEY, ADMIN_EMAIL || MCC_FROM_EMAIL).
//
// Background: we lost five production features for an extended period when a
// retired Haiku model started returning errors and silently fell back to
// error strings. There was no automated alarm — detection took a user
// complaint. This check exists so the next deprecation is caught within 24h
// instead of "whenever someone notices".
//
// Auth: same model as agent-orchestrator / gatekeeper-smoke — scheduled
// invocations OR admin-password header. Anonymous HTTP callers are rejected.
//
// On-demand triggering: POST with x-admin-password header to run immediately
// (useful from the AI Ops admin page or for verifying a model swap).
// ============================================================================

let Anthropic = require('@anthropic-ai/sdk');
let {
  getSupabase, authorizeAgentInvocation, jsonResponse
} = require('./agent-fleet-runtime');

// ---------------------------------------------------------------------------
// MODELS_IN_USE: every Claude model literal currently referenced from a
// production code path (server.js + non-test netlify functions). When a model
// is added or rotated in those call sites, add or remove it here too. This
// list is intentionally inline rather than imported from a shared config —
// see Task #217 plan, the optional shared-config refactor was deferred.
// Verified 2026-04-29 by:
//   rg "claude-(sonnet|opus|haiku|3-5)-[0-9a-z-]+" --type js \
//     -g '!node_modules' -g '!android' -g '!www-ios' -g '!tests' -o | sort -u
// ---------------------------------------------------------------------------
let MODELS_IN_USE = [
  'claude-sonnet-4-5',
  'claude-sonnet-4-20250514',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-5',
  'claude-opus-4-7'
];

let MCC_APP_URL = process.env.MCC_APP_URL || 'https://mycarconcierge.com';

// ---------------------------------------------------------------------------
// probeModel: minimal `messages.create` call. We don't care about the answer,
// only whether the API accepts the model name. Returns:
//   { model, ok: true,  status: 200, latency_ms }
//   { model, ok: false, status, code, message, latency_ms }
// Never throws — failures are returned as data so the caller can aggregate.
// ---------------------------------------------------------------------------
async function probeModel(client, model) {
  let startedAt = Date.now();
  try {
    let resp = await client.messages.create({
      model: model,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }]
    });
    return {
      model: model,
      ok: true,
      status: 200,
      response_id: resp?.id ? resp.id : null,
      latency_ms: Date.now() - startedAt
    };
  } catch (err) {
    let status   = (err?.status)  || (err?.response && err.response.status) || 0;
    let code     = (err?.error && err.error.error && err.error.error.type)
                || (err?.code)
                || (err?.type)
                || 'unknown';
    let message  = (err?.error && err.error.error && err.error.error.message)
                || (err?.message)
                || String(err);
    return {
      model: model,
      ok: false,
      status: status,
      code: code,
      message: String(message).slice(0, 500),
      latency_ms: Date.now() - startedAt
    };
  }
}

// ---------------------------------------------------------------------------
// runHealthCheck: probe every model in MODELS_IN_USE in parallel, aggregate.
// ---------------------------------------------------------------------------
async function runHealthCheck() {
  let apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: 'no_api_key',
      results: [],
      failed: MODELS_IN_USE.map(function (m) {
        return { model: m, ok: false, status: 0, code: 'no_api_key', message: 'ANTHROPIC_API_KEY not set' };
      }),
      checked_at: new Date().toISOString()
    };
  }
  let client = new Anthropic({ apiKey: apiKey });
  let results = await Promise.all(MODELS_IN_USE.map(function (m) {
    return probeModel(client, m);
  }));
  let failed = results.filter(function (r) { return !r.ok; });
  return {
    ok: failed.length === 0,
    results: results,
    failed: failed,
    failure_count: failed.length,
    total: results.length,
    checked_at: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// logToAiActionLog: best-effort persistence so the admin dashboard sees this
// run alongside other agent activity. Mirrors the shape used by other
// scheduled functions (payment-tracker, daily-digest, etc.).
// ---------------------------------------------------------------------------
async function logToAiActionLog(supabase, summary, triggeredBy) {
  if (!supabase) return;
  try {
    await supabase.from('ai_action_log').insert({
      module: 'anthropic_health',
      action_type: 'model_smoke_check',
      target_id: null,
      decision: summary.ok ? 'all_models_alive' : 'models_failing',
      confidence: 1.0,
      auto_executed: true,
      escalated: !summary.ok,
      outcome: summary.ok ? 'passed' : 'failed',
      error_details: summary.ok ? null : {
        failed: summary.failed,
        triggered_by: triggeredBy
      },
      execution_time_ms: summary.results.reduce(function (acc, r) {
        return acc + (r.latency_ms || 0);
      }, 0),
      created_at: new Date().toISOString()
    });
  } catch (e) {
    // Never let logging crash the health run; the email is the backup signal.
    console.warn('[anthropic-health] ai_action_log insert failed:', e.message);
  }
}

// ---------------------------------------------------------------------------
// sendFailureEmail: mirrors gatekeeper-smoke's sendSmokeFailureEmail. Best-
// effort Resend call; never throws. Returns a tag describing what happened.
// ---------------------------------------------------------------------------
async function sendFailureEmail(summary) {
  let apiKey    = process.env.RESEND_API_KEY;
  let toEmail   = process.env.ADMIN_EMAIL || process.env.MCC_FROM_EMAIL;
  let fromEmail = process.env.MCC_FROM_EMAIL || 'no-reply@mycarconcierge.com';
  if (!apiKey || !toEmail) return { sent: false, reason: 'email_not_configured' };

  let rows = summary.failed.map(function (f) {
    return '<tr>'
      + '<td style="padding:6px 12px 6px 0;font-family:monospace;">' + f.model + '</td>'
      + '<td style="padding:6px 0;"><strong>' + (f.status || '—') + '</strong></td>'
      + '<td style="padding:6px 12px;font-family:monospace;color:#c0392b;">' + (f.code || '—') + '</td>'
      + '<td style="padding:6px 0;color:#666;">' + (f.message || '—') + '</td>'
      + '</tr>';
  }).join('');

  let subject = '[MCC] Anthropic model smoke FAILED ('
    + summary.failure_count + '/' + summary.total + ' model'
    + (summary.failure_count === 1 ? '' : 's') + ')';

  let html =
    '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;color:#222;">'
    + '<h2 style="color:#c0392b;margin:0 0 12px;">Anthropic model smoke check failed</h2>'
    + '<p style="margin:0 0 16px;">One or more Claude models referenced in production code returned an error from the daily 1-token probe. AI features that use these models may be silently failing for users right now.</p>'
    + '<table style="border-collapse:collapse;font-size:13px;width:100%;margin:16px 0;">'
    + '<thead><tr style="text-align:left;color:#666;border-bottom:1px solid #eee;">'
    + '<th style="padding:6px 12px 6px 0;">Model</th>'
    + '<th style="padding:6px 0;">HTTP</th>'
    + '<th style="padding:6px 12px;">Code</th>'
    + '<th style="padding:6px 0;">Message</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table>'
    + '<h3 style="margin:18px 0 8px;font-size:14px;">Triage</h3>'
    + '<ol style="font-size:13px;line-height:1.6;color:#333;">'
    + '<li>If the code is <code>model_not_found</code> or <code>invalid_request_error</code>: the model has been deprecated or renamed. Find the failing model name in <code>www/server.js</code> and <code>netlify/functions/*.js</code> with ripgrep and swap to its replacement.</li>'
    + '<li>If the code is <code>authentication_error</code>: <code>ANTHROPIC_API_KEY</code> may have been rotated or revoked.</li>'
    + '<li>If the code is <code>rate_limit_error</code>: this is transient — re-run the check in a few minutes before changing anything.</li>'
    + '<li>After fixing, re-run on demand: <code>curl -X POST -H "x-admin-password: $ADMIN_PASSWORD" ' + MCC_APP_URL + '/.netlify/functions/anthropic-health-scheduled</code></li>'
    + '<li>Update <code>MODELS_IN_USE</code> in <code>netlify/functions/anthropic-health-scheduled.js</code> to match the new set.</li>'
    + '</ol>'
    + '<p style="font-size:12px;color:#888;margin-top:24px;">Checked at ' + summary.checked_at + '. Source: <code>netlify/functions/anthropic-health-scheduled.js</code>.</p>'
    + '</div>';

  let textLines = ['Anthropic model smoke check failed', '', 'Failed models:'];
  summary.failed.forEach(function (f) {
    textLines.push('  ' + f.model + '  status=' + f.status + '  code=' + f.code + '  ' + f.message);
  });
  textLines.push('', 'Checked at: ' + summary.checked_at);

  try {
    let r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        from: 'My Car Concierge Ops <' + fromEmail + '>',
        to: [toEmail],
        subject: subject,
        html: html,
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
// handler: standard Netlify function entry point.
// ---------------------------------------------------------------------------
exports.handler = async function (event) {
  let auth = authorizeAgentInvocation(event);
  if (!auth) {
    return jsonResponse(401, { error: 'unauthorized' });
  }

  let summary = await runHealthCheck();
  let supabase = getSupabase();
  await logToAiActionLog(supabase, summary, auth);

  let emailResult = { sent: false, reason: 'all_models_passed' };
  if (!summary.ok) {
    emailResult = await sendFailureEmail(summary);
  }

  return jsonResponse(summary.ok ? 200 : 500, {
    triggered_by: auth,
    summary: summary,
    email: emailResult
  });
};

// Exposed for ad-hoc tests / future shared-config refactor.
exports._probeModel    = probeModel;
exports._runHealthCheck = runHealthCheck;
exports._MODELS_IN_USE = MODELS_IN_USE;

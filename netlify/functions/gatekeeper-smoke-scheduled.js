// ============================================================================
// Task #161 — Gatekeeper smoke scheduled function
//
// Runs the Gatekeeper smoke test once a day off-hours (cron in netlify.toml).
// Catches silent breakage of the trigger → bus → orchestrator → handler → DB
// pipeline within 24h instead of "whenever someone notices the queue is empty".
//
// On every run we:
//   1. Invoke the shared smoke engine (gatekeeper-smoke-core.js) against
//      MCC_APP_URL (defaults to https://mycarconcierge.com).
//   2. Persist the structured result into agent_smoke_runs so the admin UI
//      can show "smoke last passed N hours ago" without parsing logs.
//   3. On failure, send an admin email mirroring the spend-cap alert path
//      (Resend, ADMIN_EMAIL, MCC_FROM_EMAIL).
//
// The runner is also reachable via admin POST for on-demand smokes (see the
// "Run smoke now" button in /admin/agent-fleet.html) — same engine, same
// persistence, but triggered_by='admin' and no email on success.
//
// Auth: same model as agent-orchestrator.js — scheduled invocations OR
// admin-password header. Anonymous HTTP callers are rejected.
// ============================================================================

const {
  getSupabase, authorizeAgentInvocation, jsonResponse
} = require('./agent-fleet-runtime');
const { runGatekeeperSmoke } = require('./gatekeeper-smoke-core');

const MCC_APP_URL = process.env.MCC_APP_URL || 'https://mycarconcierge.com';

// ---------------------------------------------------------------------------
// sendSmokeFailureEmail — mirrors agent-fleet-runtime#sendSpendAlertEmail.
// Best-effort Resend call; records success/failure on the agent_smoke_runs
// row but never throws (the row is the source of truth either way).
// ---------------------------------------------------------------------------
async function sendSmokeFailureEmail(supabase, run) {
  if (!run) return { sent: false, reason: 'no_run' };

  const apiKey   = process.env.RESEND_API_KEY;
  const toEmail  = process.env.ADMIN_EMAIL || process.env.MCC_FROM_EMAIL;
  const fromEmail = process.env.MCC_FROM_EMAIL || 'no-reply@mycarconcierge.com';
  if (!apiKey || !toEmail) return { sent: false, reason: 'email_not_configured' };

  const adminUrl = `${MCC_APP_URL}/admin/agent-fleet.html`;
  const failedChecks = Array.isArray(run.failed_checks) ? run.failed_checks : [];

  const eventsRows = (run.summary?.events || []).map(e => `
    <tr>
      <td style="padding:4px 12px 4px 0;color:#666;">${e.event_type}</td>
      <td style="padding:4px 0;"><strong>${e.status || '—'}</strong></td>
      <td style="padding:4px 12px;">${e.recommendation || '—'}</td>
      <td style="padding:4px 0;color:#666;">${e.action_id ? '#' + e.action_id : '—'}</td>
    </tr>`).join('');

  const subject = `[MCC Agent Fleet] Gatekeeper smoke FAILED (${failedChecks.length} check${failedChecks.length === 1 ? '' : 's'})`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#222;">
      <h2 style="color:#c0392b;margin:0 0 12px;">Gatekeeper smoke test failed</h2>
      <p style="margin:0 0 16px;">The daily Gatekeeper smoke against <strong>${MCC_APP_URL}</strong> did not produce a clean proposal for every synthetic event. Provider applications may be silently piling up un-reviewed.</p>
      <table style="border-collapse:collapse;margin:16px 0;font-size:14px;">
        <tr><td style="padding:6px 16px 6px 0;color:#666;">Run started</td><td style="padding:6px 0;"><strong>${run.started_at}</strong></td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#666;">Run finished</td><td style="padding:6px 0;"><strong>${run.finished_at}</strong></td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#666;">Duration</td><td style="padding:6px 0;"><strong>${(run.duration_ms / 1000).toFixed(1)}s</strong></td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#666;">Failure count</td><td style="padding:6px 0;"><strong>${run.failure_count}</strong></td></tr>
      </table>
      <h3 style="margin:18px 0 8px;font-size:14px;">Failed checks</h3>
      <pre style="background:#f7f7f9;padding:10px;border-radius:6px;font-size:12px;white-space:pre-wrap;">${failedChecks.join('\n') || '(none recorded)'}</pre>
      <h3 style="margin:18px 0 8px;font-size:14px;">Per-event outcome</h3>
      <table style="border-collapse:collapse;font-size:13px;width:100%;">
        <thead><tr style="text-align:left;color:#666;">
          <th style="padding:4px 12px 4px 0;">Event</th><th>Status</th><th style="padding:4px 12px;">Rec</th><th>Action</th>
        </tr></thead>
        <tbody>${eventsRows || '<tr><td colspan="4" style="padding:8px 0;color:#999;">no events recorded</td></tr>'}</tbody>
      </table>
      <p style="margin:24px 0;">
        <a href="${adminUrl}" style="display:inline-block;background:#b8942d;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Open Agent Fleet console →</a>
      </p>
      <p style="font-size:12px;color:#888;margin-top:24px;">First places to check: the <code>provider_applied</code>/<code>provider_flagged</code>/<code>provider_bgc_completed</code> DB triggers in the <em>provider_applications</em> &amp; <em>employee_background_checks</em> schemas, the orchestrator function logs, and the ANTHROPIC_API_KEY rotation status.</p>
    </div>`;
  const textBody = [
    `Gatekeeper smoke test failed against ${MCC_APP_URL}`,
    ``,
    `Started:  ${run.started_at}`,
    `Finished: ${run.finished_at}`,
    `Duration: ${(run.duration_ms / 1000).toFixed(1)}s`,
    `Failures: ${run.failure_count}`,
    ``,
    `Failed checks:`,
    ...failedChecks.map(f => `  - ${f}`),
    ``,
    `Per-event outcome:`,
    ...(run.summary?.events || []).map(e => `  - ${e.event_type} → ${e.status || '—'} (${e.recommendation || 'no rec'}, action ${e.action_id || '—'})`),
    ``,
    `Open the console: ${adminUrl}`
  ].join('\n');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to: toEmail, subject, html, text: textBody })
    });
    if (!r.ok) {
      const txt = await r.text();
      const errMsg = `Resend ${r.status}: ${txt.slice(0, 200)}`;
      try {
        await supabase.from('agent_smoke_runs')
          .update({ alert_email_error: errMsg })
          .eq('id', run.id);
      } catch (_) { /* swallow */ }
      return { sent: false, reason: 'resend_error', error: errMsg };
    }
    try {
      await supabase.from('agent_smoke_runs')
        .update({ alert_email_sent: true, alert_email_error: null })
        .eq('id', run.id);
    } catch (_) { /* swallow */ }
    return { sent: true };
  } catch (e) {
    console.error('[smoke-scheduled] alert email crashed:', e.message);
    try {
      await supabase.from('agent_smoke_runs')
        .update({ alert_email_error: e.message.slice(0, 200) })
        .eq('id', run.id);
    } catch (_) { /* swallow */ }
    return { sent: false, reason: 'exception', error: e.message };
  }
}

// ---------------------------------------------------------------------------
// sendSmokeFailureSms — pages the admin's phone via Twilio when the daily
// smoke fails. Mirrors the Twilio call shape used elsewhere (daily-digest,
// bgc-send-reminders, ai-ops-admin). Best-effort: records sent/error on the
// agent_smoke_runs row but never throws.
// ---------------------------------------------------------------------------
async function sendSmokeFailureSms(supabase, run) {
  if (!run) return { sent: false, reason: 'no_run' };

  const sid     = process.env.TWILIO_ACCOUNT_SID;
  const token   = process.env.TWILIO_AUTH_TOKEN;
  const from    = process.env.TWILIO_PHONE_NUMBER;
  const toPhone = process.env.ADMIN_PHONE_NUMBER;
  if (!sid || !token || !from || !toPhone) {
    return { sent: false, reason: 'sms_not_configured' };
  }

  const failedChecks = Array.isArray(run.failed_checks) ? run.failed_checks : [];
  const summary = `MCC Gatekeeper smoke FAILED: ${run.failure_count} check${run.failure_count === 1 ? '' : 's'}${failedChecks[0] ? ` (${failedChecks[0]})` : ''}`;
  const adminUrl = `${MCC_APP_URL}/admin/agent-fleet.html`;
  const body = `${summary}\n${adminUrl}`;

  try {
    const clean = String(toPhone).replaceAll(/\D/g, '');
    const to = clean.startsWith('1') ? `+${clean}` : `+1${clean}`;
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const form = new URLSearchParams({ To: to, From: from, Body: body });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    if (!r.ok) {
      const txt = await r.text();
      const errMsg = `Twilio ${r.status}: ${txt.slice(0, 200)}`;
      try {
        await supabase.from('agent_smoke_runs')
          .update({ alert_sms_error: errMsg })
          .eq('id', run.id);
      } catch (_) { /* swallow */ }
      return { sent: false, reason: 'twilio_error', error: errMsg };
    }
    try {
      await supabase.from('agent_smoke_runs')
        .update({ alert_sms_sent: true, alert_sms_error: null })
        .eq('id', run.id);
    } catch (_) { /* swallow */ }
    return { sent: true };
  } catch (e) {
    console.error('[smoke-scheduled] alert sms crashed:', e.message);
    try {
      await supabase.from('agent_smoke_runs')
        .update({ alert_sms_error: e.message.slice(0, 200) })
        .eq('id', run.id);
    } catch (_) { /* swallow */ }
    return { sent: false, reason: 'exception', error: e.message };
  }
}

// ---------------------------------------------------------------------------
// persistRun — write the result row first, then attempt the alert email so
// the row's id is available for update. Returns the inserted row.
// ---------------------------------------------------------------------------
async function persistRun(supabase, result, triggeredBy) {
  const status = result.summary?.runner_exception
    ? 'error'
    : (result.ok ? 'passed' : 'failed');

  const insert = {
    agent_slug: 'gatekeeper',
    status,
    triggered_by: triggeredBy,
    started_at: result.started_at,
    finished_at: result.finished_at,
    duration_ms: result.duration_ms,
    failure_count: result.failure_count,
    failed_checks: result.failed_checks || [],
    summary: result.summary || {}
  };

  const { data, error } = await supabase
    .from('agent_smoke_runs')
    .insert(insert)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[smoke-scheduled] persist failed:', error.message);
    return null;
  }
  return data;
}

exports.handler = async function(event) {
  if (event && event.httpMethod === 'OPTIONS') return jsonResponse(200, { ok: true });

  const auth = authorizeAgentInvocation(event || {});
  if (!auth) return jsonResponse(401, { error: 'Unauthorized' });

  const supabase = getSupabase();
  if (!supabase) {
    console.error('[smoke-scheduled] supabase unavailable');
    return jsonResponse(500, { error: 'db_unavailable' });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error('[smoke-scheduled] ADMIN_PASSWORD not configured');
    return jsonResponse(500, { error: 'admin_password_not_configured' });
  }

  const triggeredBy = auth === 'admin' ? 'admin' : 'scheduled';
  const log = {
    pass: msg => console.log('[smoke-scheduled] PASS:', msg),
    fail: msg => console.error('[smoke-scheduled] FAIL:', msg),
    info: msg => console.log('[smoke-scheduled] INFO:', msg)
  };

  let result;
  try {
    result = await runGatekeeperSmoke({
      supabase,
      siteUrl: MCC_APP_URL,
      adminPassword,
      log
    });
  } catch (e) {
    // runGatekeeperSmoke is supposed to be no-throw, but belt-and-braces:
    console.error('[smoke-scheduled] runner crash:', e.stack || e.message);
    result = {
      ok: false,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: 0,
      failure_count: 1,
      failed_checks: [`runner_crash: ${e.message}`],
      summary: { runner_exception: e.message, site_url: MCC_APP_URL }
    };
  }

  const row = await persistRun(supabase, result, triggeredBy);

  let email = { sent: false, reason: 'not_attempted' };
  let sms   = { sent: false, reason: 'not_attempted' };
  if (!result.ok && row) {
    [email, sms] = await Promise.all([
      sendSmokeFailureEmail(supabase, row),
      sendSmokeFailureSms(supabase, row)
    ]);
  }

  return jsonResponse(200, {
    ok: result.ok,
    run_id: row?.id || null,
    status: row?.status || (result.ok ? 'passed' : 'failed'),
    triggered_by: triggeredBy,
    failure_count: result.failure_count,
    failed_checks: result.failed_checks,
    duration_ms: result.duration_ms,
    email,
    sms
  });
};

module.exports.sendSmokeFailureEmail = sendSmokeFailureEmail;
module.exports.sendSmokeFailureSms = sendSmokeFailureSms;
module.exports.persistRun = persistRun;

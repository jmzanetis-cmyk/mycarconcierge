// ============================================================================
// Task #206 — Shared persistence + alert-email helpers for agent smoke runs.
//
// Extracted from gatekeeper-smoke-scheduled.js so each per-agent scheduled
// function (gatekeeper / matchmaker / treasurer) only has to wire up its own
// agent slug, event types, and the friendly copy for the alert email.
// ============================================================================

const MCC_APP_URL = process.env.MCC_APP_URL || 'https://mycarconcierge.com';

// --------------------------------------------------------------------------
// persistRun — write the run row first so its id is available for the
// follow-up alert-email update. Returns the inserted row (or null on insert
// failure).
// --------------------------------------------------------------------------
async function persistRun(supabase, agentSlug, result, triggeredBy) {
  const status = result.summary?.runner_exception
    ? 'error'
    : (result.ok ? 'passed' : 'failed');

  const insert = {
    agent_slug: agentSlug,
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
    console.error(`[smoke-scheduled:${agentSlug}] persist failed:`, error.message);
    return null;
  }
  return data;
}

// --------------------------------------------------------------------------
// sendSmokeFailureEmail — best-effort Resend call. Mirrors the spend-cap
// alert path. Records success/failure on the agent_smoke_runs row but never
// throws — the row is the source of truth either way.
//
// `agentLabel` and `failureCopy` let each agent's scheduled wrapper give the
// admin a context-appropriate subject line and intro paragraph (e.g.
// "Provider applications may be silently piling up un-reviewed.").
// --------------------------------------------------------------------------
async function sendSmokeFailureEmail(supabase, run, { agentLabel, failureCopy, debugHint }) {
  if (!run) return { sent: false, reason: 'no_run' };

  const apiKey   = process.env.RESEND_API_KEY;
  const toEmail  = process.env.ADMIN_EMAIL || process.env.MCC_FROM_EMAIL;
  const fromEmail = process.env.MCC_FROM_EMAIL || 'no-reply@mycarconcierge.com';
  if (!apiKey || !toEmail) return { sent: false, reason: 'email_not_configured' };

  const adminUrl = `${MCC_APP_URL}/admin/agent-fleet.html`;
  const failedChecks = Array.isArray(run.failed_checks) ? run.failed_checks : [];
  const slug = run.agent_slug || agentLabel;

  const eventsRows = (run.summary?.events || []).map(e => `
    <tr>
      <td style="padding:4px 12px 4px 0;color:#666;">${e.event_type}</td>
      <td style="padding:4px 0;"><strong>${e.status || '—'}</strong></td>
      <td style="padding:4px 12px;">${e.recommendation || '—'}</td>
      <td style="padding:4px 0;color:#666;">${e.action_id ? '#' + e.action_id : '—'}</td>
    </tr>`).join('');

  const subject = `[MCC Agent Fleet] ${agentLabel} smoke FAILED (${failedChecks.length} check${failedChecks.length === 1 ? '' : 's'})`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#222;">
      <h2 style="color:#c0392b;margin:0 0 12px;">${agentLabel} smoke test failed</h2>
      <p style="margin:0 0 16px;">The daily ${agentLabel} smoke against <strong>${MCC_APP_URL}</strong> did not produce a clean proposal for every synthetic event. ${failureCopy}</p>
      <table style="border-collapse:collapse;margin:16px 0;font-size:14px;">
        <tr><td style="padding:6px 16px 6px 0;color:#666;">Agent</td><td style="padding:6px 0;"><strong>${slug}</strong></td></tr>
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
      <p style="font-size:12px;color:#888;margin-top:24px;">${debugHint}</p>
    </div>`;
  const textBody = [
    `${agentLabel} smoke test failed against ${MCC_APP_URL}`,
    ``,
    `Agent:    ${slug}`,
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
    console.error(`[smoke-scheduled:${slug}] alert email crashed:`, e.message);
    try {
      await supabase.from('agent_smoke_runs')
        .update({ alert_email_error: e.message.slice(0, 200) })
        .eq('id', run.id);
    } catch (_) { /* swallow */ }
    return { sent: false, reason: 'exception', error: e.message };
  }
}

// --------------------------------------------------------------------------
// sendSmokeFailureSms — pages the admin's phone via Twilio when the daily
// smoke fails. Mirrors the Twilio call shape used elsewhere (daily-digest,
// bgc-send-reminders, ai-ops-admin). Best-effort: records sent/error on the
// agent_smoke_runs row but never throws.
// --------------------------------------------------------------------------
async function sendSmokeFailureSms(supabase, run, { agentLabel } = {}) {
  if (!run) return { sent: false, reason: 'no_run' };

  const sid     = process.env.TWILIO_ACCOUNT_SID;
  const token   = process.env.TWILIO_AUTH_TOKEN;
  const from    = process.env.TWILIO_PHONE_NUMBER;
  const toPhone = process.env.ADMIN_PHONE_NUMBER;
  if (!sid || !token || !from || !toPhone) {
    return { sent: false, reason: 'sms_not_configured' };
  }

  const slug = run.agent_slug || agentLabel || 'agent';
  const label = agentLabel || slug;
  const failedChecks = Array.isArray(run.failed_checks) ? run.failed_checks : [];
  const summary = `MCC ${label} smoke FAILED: ${run.failure_count} check${run.failure_count === 1 ? '' : 's'}${failedChecks[0] ? ` (${failedChecks[0]})` : ''}`;
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
    console.error(`[smoke-scheduled:${slug}] alert sms crashed:`, e.message);
    try {
      await supabase.from('agent_smoke_runs')
        .update({ alert_sms_error: e.message.slice(0, 200) })
        .eq('id', run.id);
    } catch (_) { /* swallow */ }
    return { sent: false, reason: 'exception', error: e.message };
  }
}

module.exports = { persistRun, sendSmokeFailureEmail, sendSmokeFailureSms, MCC_APP_URL };

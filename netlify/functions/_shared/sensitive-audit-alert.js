// ============================================================================
// Sensitive audit alert helper (Task #427)
//
// Sends an admin notification (email via Resend + optional Slack webhook)
// when a sensitive admin action is performed. Both channels are best-effort —
// failures are logged but never thrown so they cannot roll back the action.
//
// Required env vars:
//   RESEND_API_KEY            — Resend API key for email delivery
//   ADMIN_NOTIFICATION_EMAIL  — recipient (falls back to ADMIN_EMAIL)
//   MCC_FROM_EMAIL            — sender address
//
// Optional env vars:
//   ADMIN_SLACK_WEBHOOK_URL   — Slack incoming-webhook URL; omit to skip Slack
//
// Usage:
//   const { notifySensitiveAuditAction } = require('./_shared/sensitive-audit-alert');
//   await notifySensitiveAuditAction({
//     action:      'suspend_provider',
//     target:      'Acme Automotive (uuid)',
//     reason:      'Repeated no-shows',
//     performedBy: 'admin',
//     metadata:    { provider_count: 1 }   // optional extra context
//   });
// ============================================================================

'use strict';

const { Resend } = require('resend');

const SENSITIVE_LABELS = {
  suspend_provider:              'Provider Suspended',
  autosuspend_low_rated:         'Provider Auto-Suspended (low rating)',
  activate_provider:             'Provider Activated',
  approve_provider_application:  'Provider Application Approved',
  reject_provider_application:   'Provider Application Rejected',
  delete_provider:               'Provider Deleted',
  role_change:                   'User Role Changed'
};

function getAdminEmail() {
  return process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL || '';
}

function buildEmailHtml({ action, target, reason, performedBy, metadata, ts }) {
  const label = SENSITIVE_LABELS[action] || action;
  const metaRows = metadata && Object.keys(metadata).length
    ? Object.entries(metadata)
        .map(([k, v]) => `<tr><td style="padding:3px 8px;color:#94a3b8;font-size:12px;">${k}</td><td style="padding:3px 8px;color:#e2e8f0;font-size:12px;">${String(v)}</td></tr>`)
        .join('')
    : '';
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;color:#e2e8f0;margin:0;padding:24px;">
  <div style="max-width:520px;margin:0 auto;">
    <div style="background:#1e293b;border-left:4px solid #f59e0b;border-radius:8px;padding:20px;">
      <div style="font-size:16px;font-weight:700;color:#f1f5f9;margin-bottom:10px;">🔐 Sensitive Admin Action: ${label}</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
        <tr><td style="padding:3px 8px;color:#94a3b8;font-size:12px;">Target</td><td style="padding:3px 8px;color:#e2e8f0;font-size:12px;">${String(target || '—')}</td></tr>
        ${reason ? `<tr><td style="padding:3px 8px;color:#94a3b8;font-size:12px;">Reason</td><td style="padding:3px 8px;color:#e2e8f0;font-size:12px;">${String(reason)}</td></tr>` : ''}
        <tr><td style="padding:3px 8px;color:#94a3b8;font-size:12px;">Performed by</td><td style="padding:3px 8px;color:#e2e8f0;font-size:12px;">${String(performedBy || 'admin')}</td></tr>
        <tr><td style="padding:3px 8px;color:#94a3b8;font-size:12px;">Timestamp</td><td style="padding:3px 8px;color:#e2e8f0;font-size:12px;">${ts}</td></tr>
        ${metaRows}
      </table>
      <div style="margin-top:14px;text-align:center;">
        <a href="https://mycarconcierge.com/admin.html#audit" style="display:inline-block;background:linear-gradient(135deg,#c9a84c,#b8942d);color:#0f1117;font-weight:700;font-size:13px;text-decoration:none;padding:10px 22px;border-radius:6px;">View Audit Log →</a>
      </div>
    </div>
    <div style="margin-top:12px;font-size:11px;color:#475569;text-align:center;">My Car Concierge · Admin audit alerts</div>
  </div>
</body></html>`;
}

function buildSlackPayload({ action, target, reason, performedBy, ts }) {
  const label = SENSITIVE_LABELS[action] || action;
  const lines = [
    `*🔐 Sensitive Admin Action: ${label}*`,
    `• Target: ${target || '—'}`,
    reason ? `• Reason: ${reason}` : null,
    `• By: ${performedBy || 'admin'}`,
    `• At: ${ts}`
  ].filter(Boolean).join('\n');
  return JSON.stringify({ text: lines });
}

/**
 * Fire-and-forget admin notification for a sensitive audit action.
 * Never throws — all failures are console-logged only.
 */
async function notifySensitiveAuditAction({ action, target, reason, performedBy, metadata } = {}) {
  const ts = new Date().toISOString();
  const adminEmail = getAdminEmail();
  const fromEmail  = process.env.MCC_FROM_EMAIL || 'no-reply@mycarconcierge.com';
  const slackUrl   = process.env.ADMIN_SLACK_WEBHOOK_URL || '';
  const label      = SENSITIVE_LABELS[action] || action;
  const subject    = `[MCC Admin] Sensitive action: ${label}`;

  const results = await Promise.allSettled([
    // Email channel
    (async () => {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey || !adminEmail) return;
      const resend = new Resend(apiKey);
      const result = await resend.emails.send({
        from: `My Car Concierge <${fromEmail}>`,
        to: [adminEmail],
        subject,
        html: buildEmailHtml({ action, target, reason, performedBy, metadata, ts })
      });
      if (result.error) throw new Error(result.error.message);
    })(),
    // Slack channel
    (async () => {
      if (!slackUrl) return;
      const res = await fetch(slackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: buildSlackPayload({ action, target, reason, performedBy, ts })
      });
      if (!res.ok) throw new Error(`Slack webhook HTTP ${res.status}`);
    })()
  ]);

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const channel = i === 0 ? 'email' : 'slack';
      console.warn(`[sensitive-audit-alert] ${channel} notification failed:`, r.reason?.message || r.reason);
    }
  });
}

module.exports = { notifySensitiveAuditAction };

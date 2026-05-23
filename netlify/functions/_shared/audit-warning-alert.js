'use strict';

// Shared helper: send a one-time admin email when an audit-trail DB write
// fails AFTER Stripe has already moved money. The write failure is surfaced
// via `audit_warning` in the HTTP response so the admin UI can show a
// recovery banner, but if the admin navigates away (or the action was
// agent-driven), they'd miss it without this email.
//
// Rate-limited to 1 email per action_id per 24 h via ai_action_log dedup.
// Never throws — a failure here must not mask the original audit_warning.

const { Resend } = require('resend');

const MCC_APP_URL = process.env.MCC_APP_URL || 'https://mycarconcierge.com';

async function maybeSendAuditWarningAlert({ supabase, action_id, slug, db_error }) {
  if (!supabase || action_id == null) return;

  const actionIdStr = String(action_id);

  // Dedup: skip if we already sent an alert for this action in the last 24 h.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const { data: existing } = await supabase
      .from('ai_action_log')
      .select('id')
      .eq('module', 'audit_warning')
      .eq('action_type', 'alert')
      .eq('outcome', 'sent')
      .gte('created_at', since)
      .limit(20);
    if ((existing || []).some(r => {
      let dec = r.decision;
      if (typeof dec === 'string') { try { dec = JSON.parse(dec); } catch { dec = {}; } }
      return dec && String(dec.action_id) === actionIdStr;
    })) return;
  } catch { /* if dedup query fails, send anyway */ }

  const adminTo  = process.env.ADMIN_EMAIL || process.env.ADMIN_NOTIFICATION_EMAIL;
  const from     = process.env.RESEND_FROM_EMAIL || process.env.MCC_FROM_EMAIL || 'noreply@mycarconcierge.com';
  const subject  = `[MCC Admin] Audit-trail write failed — action ${actionIdStr}`;
  const deepLink = `${MCC_APP_URL}/admin/agent-fleet-detail.html?slug=${encodeURIComponent(slug || '')}&action=${encodeURIComponent(actionIdStr)}`;

  let outcome = 'failed';
  try {
    if (adminTo && process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const html = [
        `<p>The audit-trail DB write for action <strong>${actionIdStr}</strong>`,
        ` (agent: <strong>${slug || 'unknown'}</strong>) failed after Stripe already moved money.</p>`,
        `<p><strong>DB error:</strong> ${String(db_error || '').replace(/</g, '&lt;')}</p>`,
        `<p>The Stripe idempotency keys are intact — re-clicking Apply will not double-charge,`,
        ` but the review-queue row may still show as pending until you reconcile.</p>`,
        `<p><a href="${deepLink}">View action ${actionIdStr} →</a></p>`
      ].join('');
      await resend.emails.send({ from, to: adminTo, subject, html });
      outcome = 'sent';
    }
  } catch (e) {
    console.error('[audit-warning-alert] email send failed:', e.message);
  }

  try {
    await supabase.from('ai_action_log').insert({
      module: 'audit_warning',
      action_type: 'alert',
      outcome,
      escalated: true,
      decision: { action_id: actionIdStr, slug: slug || null, db_error: String(db_error || '') },
      reasoning: subject
    });
  } catch (e) {
    console.error('[audit-warning-alert] log insert failed:', e.message);
  }
}

module.exports = { maybeSendAuditWarningAlert };

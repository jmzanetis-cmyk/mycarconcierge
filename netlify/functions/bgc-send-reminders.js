// ─────────────────────────────────────────────────────────────────────────────
// Task #113 — Daily BGC reminder + expired-notification engine
//
// Scheduled at 13:00 UTC (~9am ET) — registered in netlify.toml.
//
// Responsibilities:
//   1. For each threshold (60 / 30 / 14 / 7 days), find current clear checks
//      expiring in that window and (if no prior notification of that type)
//      send a reminder email + create or escalate a `bgc_expiring` alert.
//   2. Find checks already past expires_at that haven't received an
//      "expired" notification yet → send the expired email + create a
//      critical `bgc_expired` alert. If the provider's badge just dropped
//      below 90 %, also create a one-time `compliance_lost` alert.
//
// Idempotent: re-running the same day produces zero new emails or alerts.
// Status-flipping (clear → expired) is handled by bgc-expiration-sweep at
// 06:00 UTC; we rely on those rows being already flipped by the time we
// run, but we tolerate the case where they aren't (we just won't send the
// expired email until the next day).
// ─────────────────────────────────────────────────────────────────────────────

const { Resend } = require('resend');
const { createSupabaseClient } = require('./utils');

const APP_URL    = process.env.MCC_APP_URL || 'https://mycarconcierge.com';
const FROM_EMAIL = process.env.MCC_FROM_EMAIL || 'My Car Concierge <noreply@mycarconcierge.com>';

const THRESHOLDS = [
  { days: 60, type: 'reminder_60', severity: 'info' },
  { days: 30, type: 'reminder_30', severity: 'warning' },
  { days: 14, type: 'reminder_14', severity: 'critical' },
  { days:  7, type: 'reminder_7',  severity: 'critical' }
];

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }); }
  catch { return iso; }
}

// ─── Email rendering ────────────────────────────────────────────────────────
function reminderEmail({ providerName, employeeName, days, expiresAt, renewUrl }) {
  const urgency = days <= 7  ? 'URGENT — '
               : days <= 14 ? 'Action required — '
               : '';
  const subject = `${urgency}Background check for ${employeeName} expires in ${days} days`;
  const intro = days <= 7
    ? `<strong style="color:#c0392b;">Your team member's background check expires in ${days} days.</strong> Falling out of compliance will remove your MCC Verified badge.`
    : days <= 14
      ? `Your team member's background check expires in ${days} days. Renew now to keep your MCC Verified badge.`
      : `Heads up — a background check on your team will expire in ${days} days.`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#222;">
      <h2 style="color:#1e3a5f;">Background Check Expiring</h2>
      <p>Hi ${escapeHtml(providerName || 'there')},</p>
      <p>${intro}</p>
      <table style="margin:20px 0;border-collapse:collapse;">
        <tr><td style="padding:6px 12px 6px 0;color:#666;">Employee:</td><td style="padding:6px 0;"><strong>${escapeHtml(employeeName)}</strong></td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#666;">Expires:</td><td style="padding:6px 0;"><strong>${escapeHtml(fmtDate(expiresAt))}</strong></td></tr>
      </table>
      <p style="margin:24px 0;">
        <a href="${renewUrl}" style="display:inline-block;background:#b8942d;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Renew background check →</a>
      </p>
      <p style="font-size:0.85rem;color:#888;">My Car Concierge — Your complete auto ownership platform</p>
    </div>`;
  return { subject, html };
}

function expiredEmail({ providerName, employeeName, expiresAt, renewUrl, badgeLost }) {
  const subject = badgeLost
    ? `MCC Verified badge removed — ${employeeName}'s background check expired`
    : `Background check for ${employeeName} has expired`;
  const lostBadgeBlock = badgeLost
    ? `<p style="background:#fdecea;border-left:4px solid #c0392b;padding:12px 16px;margin:16px 0;">
         <strong>Your MCC Verified badge has been removed.</strong>
         Renew this background check to bring your team back above 90% coverage and reinstate the badge.
       </p>`
    : '';
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#222;">
      <h2 style="color:#c0392b;">Background Check Expired</h2>
      <p>Hi ${escapeHtml(providerName || 'there')},</p>
      <p>The background check for <strong>${escapeHtml(employeeName)}</strong> expired on <strong>${escapeHtml(fmtDate(expiresAt))}</strong>.</p>
      ${lostBadgeBlock}
      <p style="margin:24px 0;">
        <a href="${renewUrl}" style="display:inline-block;background:#b8942d;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Renew now →</a>
      </p>
      <p style="font-size:0.85rem;color:#888;">My Car Concierge — Your complete auto ownership platform</p>
    </div>`;
  return { subject, html };
}

// ─── Alerts upsert ──────────────────────────────────────────────────────────
async function upsertAlert(supabase, row) {
  // Look for an existing open alert for this employee + check + alert_type.
  let q = supabase
    .from('provider_alerts')
    .select('id, severity')
    .eq('provider_id', row.provider_id)
    .eq('alert_type', row.alert_type)
    .is('resolved_at', null);
  if (row.employee_id)   q = q.eq('employee_id',   row.employee_id);
  if (row.bgc_check_id)  q = q.eq('bgc_check_id',  row.bgc_check_id);

  const { data: existing } = await q.maybeSingle();
  if (existing) {
    await supabase
      .from('provider_alerts')
      .update({
        severity:   row.severity,
        title:      row.title,
        body:       row.body,
        action_url: row.action_url,
        is_dismissed: false,        // re-surface if previously dismissed but still applicable
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id);
    return existing.id;
  }
  const { data: ins } = await supabase
    .from('provider_alerts')
    .insert(row)
    .select('id')
    .single();
  return ins?.id;
}

async function alreadySent(supabase, employeeId, type, checkId) {
  const { data } = await supabase
    .from('bgc_notifications')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('notification_type', type)
    .eq('bgc_check_id', checkId)
    .maybeSingle();
  return !!data;
}

async function logSent(supabase, employeeId, type, checkId, emailTo) {
  // Use insert; the unique constraint protects us against any race.
  await supabase.from('bgc_notifications').insert({
    employee_id: employeeId,
    notification_type: type,
    bgc_check_id: checkId,
    email_to: emailTo
  }).then(() => {}, () => {}); // swallow unique-violation race
}

// ─── Main handler ───────────────────────────────────────────────────────────
exports.handler = async function() {
  const supabase = createSupabaseClient();
  if (!supabase) {
    console.error('[BGC reminders] Supabase unavailable');
    return { statusCode: 500, body: 'db_unavailable' };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const resend = apiKey ? new Resend(apiKey) : null;
  if (!resend) {
    console.warn('[BGC reminders] RESEND_API_KEY not set — running in dry-run mode (alerts only, no emails)');
  }

  let emailsSent = 0;
  let alertsCreated = 0;
  const renewUrl = `${APP_URL}/providers.html#compliance`;

  // ── Helper: load provider + employee context for a check row ──────────
  async function loadCtx(check) {
    const { data: emp } = await supabase
      .from('provider_employees')
      .select('id, first_name, last_name, email, provider_id')
      .eq('id', check.employee_id)
      .maybeSingle();
    if (!emp) return null;
    const { data: prof } = await supabase
      .from('profiles')
      .select('id, business_name, full_name, email, bgc_badge_verified')
      .eq('id', emp.provider_id)
      .maybeSingle();
    if (!prof || !prof.email) return null;
    return { emp, prof };
  }

  async function sendEmail(to, subject, html) {
    if (!resend) return null;
    try {
      const r = await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
      emailsSent++;
      return r;
    } catch (e) {
      console.error('[BGC reminders] Resend send failed:', e.message);
      return null;
    }
  }

  // ── 1) Reminder thresholds ─────────────────────────────────────────────
  for (const t of THRESHOLDS) {
    const lo = new Date(); lo.setDate(lo.getDate() + t.days);     lo.setHours(0,0,0,0);
    const hi = new Date(lo); hi.setDate(hi.getDate() + 1);

    const { data: checks, error } = await supabase
      .from('employee_background_checks')
      .select('id, employee_id, provider_id, expires_at, status, is_current')
      .eq('status', 'clear')
      .eq('is_current', true)
      .gte('expires_at', lo.toISOString())
      .lt('expires_at',  hi.toISOString());

    if (error) { console.error('[BGC reminders] threshold query failed:', error.message); continue; }

    for (const c of (checks || [])) {
      if (await alreadySent(supabase, c.employee_id, t.type, c.id)) continue;
      const ctx = await loadCtx(c);
      if (!ctx) continue;

      const employeeName = `${ctx.emp.first_name} ${ctx.emp.last_name}`;
      const providerName = ctx.prof.business_name || ctx.prof.full_name || 'there';
      const { subject, html } = reminderEmail({
        providerName, employeeName, days: t.days, expiresAt: c.expires_at, renewUrl
      });

      await sendEmail(ctx.prof.email, subject, html);
      await logSent(supabase, c.employee_id, t.type, c.id, ctx.prof.email);

      await upsertAlert(supabase, {
        provider_id:  ctx.prof.id,
        employee_id:  c.employee_id,
        bgc_check_id: c.id,
        alert_type:   'bgc_expiring',
        severity:     t.severity,
        title:        `${employeeName}'s background check expires in ${t.days} days`,
        body:         `Renew before ${fmtDate(c.expires_at)} to keep your MCC Verified badge.`,
        action_url:   renewUrl,
        auto_resolve_on: 'new_clear_check'
      });
      alertsCreated++;
    }
  }

  // ── 2) Expired processing ──────────────────────────────────────────────
  const { data: expiredChecks } = await supabase
    .from('employee_background_checks')
    .select('id, employee_id, provider_id, expires_at, status, is_current')
    .eq('status', 'expired')
    .eq('is_current', true);

  for (const c of (expiredChecks || [])) {
    if (await alreadySent(supabase, c.employee_id, 'expired', c.id)) continue;
    const ctx = await loadCtx(c);
    if (!ctx) continue;

    const badgeLost = ctx.prof.bgc_badge_verified === false;
    const employeeName = `${ctx.emp.first_name} ${ctx.emp.last_name}`;
    const providerName = ctx.prof.business_name || ctx.prof.full_name || 'there';
    const { subject, html } = expiredEmail({
      providerName, employeeName, expiresAt: c.expires_at, renewUrl, badgeLost
    });

    await sendEmail(ctx.prof.email, subject, html);
    await logSent(supabase, c.employee_id, 'expired', c.id, ctx.prof.email);

    await upsertAlert(supabase, {
      provider_id:  ctx.prof.id,
      employee_id:  c.employee_id,
      bgc_check_id: c.id,
      alert_type:   'bgc_expired',
      severity:     'critical',
      title:        `${employeeName}'s background check has expired`,
      body:         `Compliance for this employee is paused until a new clear check is recorded.`,
      action_url:   renewUrl,
      auto_resolve_on: 'new_clear_check'
    });
    alertsCreated++;

    if (badgeLost) {
      // One-time per-provider alert when the badge crosses below 90 %.
      // We dedupe by checking for an existing OPEN compliance_lost alert.
      const { data: existing } = await supabase
        .from('provider_alerts')
        .select('id')
        .eq('provider_id', ctx.prof.id)
        .eq('alert_type', 'compliance_lost')
        .is('resolved_at', null)
        .maybeSingle();
      if (!existing) {
        await supabase.from('provider_alerts').insert({
          provider_id: ctx.prof.id,
          alert_type: 'compliance_lost',
          severity: 'critical',
          title: 'Your MCC Verified badge has been removed',
          body: 'Background-check coverage dropped below 90%. Renew expired checks to reinstate the badge.',
          action_url: renewUrl,
          auto_resolve_on: 'badge_restored'
        });
        alertsCreated++;
      }
    }
  }

  console.log('[BGC reminders] sent', emailsSent, 'emails;', alertsCreated, 'alerts created/escalated');
  return {
    statusCode: 200,
    body: JSON.stringify({ emailsSent, alertsCreated })
  };
};

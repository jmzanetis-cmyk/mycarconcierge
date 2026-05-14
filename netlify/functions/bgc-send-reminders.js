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

// Each threshold maps to a column on provider_notification_prefs. The four
// original thresholds default to ON (so existing providers see no change);
// the new 1-day final-nudge defaults to OFF and is opt-in (Task #159).
//
// Task #201: each threshold also has a sibling SMS column. SMS is strictly
// opt-in for every threshold (defaultSms: false) — we never want to send a
// text without an explicit per-threshold flip. The dedupe row for an SMS
// send uses a `_sms` suffix so re-running the cron the same day cannot
// double-text even if email also went out.
const THRESHOLDS = [
  { days: 60, type: 'reminder_60', smsType: 'reminder_60_sms', severity: 'info',     prefCol: 'bgc_reminder_60', prefColSms: 'bgc_reminder_60_sms', defaultOn: true,  defaultSms: false },
  { days: 30, type: 'reminder_30', smsType: 'reminder_30_sms', severity: 'warning',  prefCol: 'bgc_reminder_30', prefColSms: 'bgc_reminder_30_sms', defaultOn: true,  defaultSms: false },
  { days: 14, type: 'reminder_14', smsType: 'reminder_14_sms', severity: 'critical', prefCol: 'bgc_reminder_14', prefColSms: 'bgc_reminder_14_sms', defaultOn: true,  defaultSms: false },
  { days:  7, type: 'reminder_7',  smsType: 'reminder_7_sms',  severity: 'critical', prefCol: 'bgc_reminder_7',  prefColSms: 'bgc_reminder_7_sms',  defaultOn: true,  defaultSms: false },
  { days:  1, type: 'reminder_1',  smsType: 'reminder_1_sms',  severity: 'critical', prefCol: 'bgc_reminder_1',  prefColSms: 'bgc_reminder_1_sms',  defaultOn: false, defaultSms: false }
];

// ─── Twilio SMS helper (Task #201) ──────────────────────────────────────────
// Mirrors the small inline helper used by daily-digest-scheduled.js — kept
// local so this function stays a single drop-in file. Returns true on a
// successful Twilio 2xx, false otherwise (so callers can decide whether to
// write the dedupe row). If TWILIO_* env vars are unset we silently no-op
// and return false, matching the existing "dry run when creds missing"
// behaviour for emails.
async function sendSms(toPhone, body) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from || !toPhone) return false;
  try {
    const clean = String(toPhone).replaceAll(/\D/g, '');
    if (clean.length < 10) return false;
    const to = clean.startsWith('1') ? `+${clean}` : `+1${clean}`;
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const form = new URLSearchParams({ To: to, From: from, Body: body });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method:  'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    form.toString()
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.error('[BGC reminders] Twilio non-2xx:', r.status, txt.slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[BGC reminders] Twilio send threw:', e.message);
    return false;
  }
}

function reminderSmsBody({ employeeName, days, expiresAt, renewUrl }) {
  const dayWord = days === 1 ? 'day' : 'days';
  const urgency = days <= 1
    ? 'URGENT'
    : days <= 7
      ? 'Action required'
      : 'Heads up';
  return `MCC: ${urgency} — ${employeeName}'s background check expires in ${days} ${dayWord} (${fmtDate(expiresAt)}). Renew: ${renewUrl}`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll('\'', '&#39;');
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
  // Grammatical "1 day" vs "N days" — matters now that we support a
  // 1-day final-nudge reminder (Task #159).
  const dayWord = days === 1 ? 'day' : 'days';
  const subject = `${urgency}Background check for ${employeeName} expires in ${days} ${dayWord}`;
  const intro = days <= 7
    ? `<strong style="color:#c0392b;">Your team member's background check expires in ${days} ${dayWord}.</strong> Falling out of compliance will remove your MCC Verified badge.`
    : days <= 14
      ? `Your team member's background check expires in ${days} ${dayWord}. Renew now to keep your MCC Verified badge.`
      : `Heads up — a background check on your team will expire in ${days} ${dayWord}.`;
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
  let smsSent = 0;
  let alertsCreated = 0;
  const renewUrl = `${APP_URL}/providers.html#compliance`;

  // ── Per-provider preferences cache (Task #159 / extended Task #201) ────
  // We look up provider_notification_prefs lazily per provider_id and cache
  // the result for the lifetime of this run. Missing rows fall back to the
  // hard-coded defaults (all four legacy thresholds ON, 1-day OFF, every
  // SMS toggle OFF), which matches the behaviour from before each
  // preferences shipment.
  const prefsCache = new Map();
  async function loadPrefs(providerId) {
    if (prefsCache.has(providerId)) return prefsCache.get(providerId);
    let data = null;
    try {
      const res = await supabase
        .from('provider_notification_prefs')
        .select('bgc_reminder_60,bgc_reminder_30,bgc_reminder_14,bgc_reminder_7,bgc_reminder_1,'
              + 'bgc_reminder_60_sms,bgc_reminder_30_sms,bgc_reminder_14_sms,bgc_reminder_7_sms,bgc_reminder_1_sms,'
              + 'sms_phone')
        .eq('provider_id', providerId)
        .maybeSingle();
      data = res.data || null;
      // If the table (or the new SMS columns) don't exist yet (deployment-
      // ordering edge case where this function ships before the migration),
      // fall through to defaults so the cron keeps working instead of
      // throwing.
      if (res.error) console.warn('[BGC reminders] prefs lookup soft-failed:', res.error.message);
    } catch (e) {
      console.warn('[BGC reminders] prefs lookup threw, falling back to defaults:', e.message);
    }
    const prefs = { sms_phone: data ? (data.sms_phone || null) : null };
    for (const t of THRESHOLDS) {
      // Treat NULL / missing row as the default. Only an explicit `false`
      // mutes a threshold.
      const vEmail = data ? data[t.prefCol]    : null;
      const vSms   = data ? data[t.prefColSms] : null;
      prefs[t.prefCol]    = vEmail === null || vEmail === undefined ? t.defaultOn  : !!vEmail;
      prefs[t.prefColSms] = vSms   === null || vSms   === undefined ? t.defaultSms : !!vSms;
    }
    prefsCache.set(providerId, prefs);
    return prefs;
  }

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
      .select('id, business_name, full_name, email, phone, bgc_badge_verified')
      .eq('id', emp.provider_id)
      .maybeSingle();
    // We need a profile row to know who to notify, but we no longer hard-
    // require an email here: Task #201 lets a provider rely on SMS only,
    // so a missing email shouldn't block SMS delivery or alert creation.
    // Each downstream channel checks for its own destination (email vs
    // phone) before sending, and the expired-email path explicitly skips
    // the email send when prof.email is absent.
    if (!prof) return null;
    return { emp, prof };
  }

  // Returns true ONLY when the email is confirmed sent (so the caller knows
  // it is safe to write the dedupe row). In dry-run mode (no Resend key) we
  // also return true so alerts still get created during local testing —
  // duplicate emails are impossible because no email was sent.
  async function sendEmail(to, subject, html) {
    if (!resend) return true;
    try {
      const r = await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
      if (r?.error) {
        console.error('[BGC reminders] Resend returned error:', r.error.message || r.error);
        return false;
      }
      emailsSent++;
      return true;
    } catch (e) {
      console.error('[BGC reminders] Resend send threw:', e.message);
      return false;
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
      const ctx = await loadCtx(c);
      if (!ctx) continue;

      // Task #159: Respect provider notification preferences. A provider may
      // have muted this threshold (e.g. the 60-day early heads-up). Task
      // #201 added a parallel SMS opt-in per threshold. Task #202 extended
      // the mute to also suppress the in-portal `bgc_expiring` alert when
      // BOTH channels for the threshold are off, so the toggle is the
      // single, comprehensive volume knob providers expect. The bgc_expired
      // / compliance_lost paths below are unaffected and never user-mutable.
      const prefs = await loadPrefs(ctx.prof.id);
      const emailEnabled = !!prefs[t.prefCol];
      const smsEnabled   = !!prefs[t.prefColSms];

      const employeeName = `${ctx.emp.first_name} ${ctx.emp.last_name}`;
      const providerName = ctx.prof.business_name || ctx.prof.full_name || 'there';

      // Each channel is gated on its OWN dedupe row so the two are fully
      // independent: an already-sent email never blocks an SMS retry, and
      // a failed-and-not-deduped SMS doesn't force the email to re-send.
      // This matters most when (a) email was sent yesterday but SMS failed
      // (Twilio outage / bad creds), or (b) the provider toggled SMS on
      // *after* an email had already gone out for this check.
      if (emailEnabled && ctx.prof.email && !(await alreadySent(supabase, c.employee_id, t.type, c.id))) {
        const { subject, html } = reminderEmail({
          providerName, employeeName, days: t.days, expiresAt: c.expires_at, renewUrl
        });

        const ok = await sendEmail(ctx.prof.email, subject, html);
        if (ok) {
          await logSent(supabase, c.employee_id, t.type, c.id, ctx.prof.email);
        }
        // On email failure, skip the dedupe write so we retry tomorrow.
        // Still surface the alert below so the provider sees urgency.
      }

      // Task #201: SMS fan-out. Same independent-dedupe pattern as above.
      // Phone resolution falls back to the profile phone when the
      // provider hasn't set an explicit override — keeping the UI
      // promise ("re-uses the existing provider phone when present")
      // true on the sending side too. Missing-phone short-circuits
      // before the dedupe write so a later phone update can still send.
      if (smsEnabled) {
        const phone = (prefs.sms_phone && prefs.sms_phone.trim()) || ctx.prof.phone || null;
        if (phone && !(await alreadySent(supabase, c.employee_id, t.smsType, c.id))) {
          const body = reminderSmsBody({
            employeeName, days: t.days, expiresAt: c.expires_at, renewUrl
          });
          const okSms = await sendSms(phone, body);
          if (okSms) {
            smsSent++;
            await logSent(supabase, c.employee_id, t.smsType, c.id, phone);
          }
          // On failure (or dry-run with no Twilio creds), do NOT write
          // the dedupe row so tomorrow's run gets another chance.
        }
      }

      // Task #202: only surface the in-portal `bgc_expiring` alert when the
      // provider hasn't fully muted this threshold. If both email and SMS
      // are off for the threshold (e.g. provider opted out of every 60-day
      // signal), the alert is suppressed too — the toggle is the single
      // volume knob.
      if (emailEnabled || smsEnabled) {
        await upsertAlert(supabase, {
          provider_id:  ctx.prof.id,
          employee_id:  c.employee_id,
          bgc_check_id: c.id,
          alert_type:   'bgc_expiring',
          severity:     t.severity,
          title:        `${employeeName}'s background check expires in ${t.days} ${t.days === 1 ? 'day' : 'days'}`,
          body:         `Renew before ${fmtDate(c.expires_at)} to keep your MCC Verified badge.`,
          action_url:   renewUrl,
          auto_resolve_on: 'new_clear_check'
        });
        alertsCreated++;
      }
    }
  }

  // ── 2) Expired processing ──────────────────────────────────────────────
  const { data: expiredChecks } = await supabase
    .from('employee_background_checks')
    .select('id, employee_id, provider_id, expires_at, status, is_current')
    .eq('status', 'expired')
    .eq('is_current', true);

  for (const c of (expiredChecks || [])) {
    const ctx = await loadCtx(c);
    if (!ctx) continue;

    const badgeLost = ctx.prof.bgc_badge_verified === false;
    const employeeName = `${ctx.emp.first_name} ${ctx.emp.last_name}`;
    const providerName = ctx.prof.business_name || ctx.prof.full_name || 'there';

    // Email send is gated on (a) an address being on file and (b) we
    // haven't already deduped this expiry — this path was never user-
    // mutable so there is no preference flag to consult. The alert
    // upsert below still runs even when there is no email to send,
    // because the in-portal banner is the primary surface.
    if (ctx.prof.email && !(await alreadySent(supabase, c.employee_id, 'expired', c.id))) {
      const { subject, html } = expiredEmail({
        providerName, employeeName, expiresAt: c.expires_at, renewUrl, badgeLost
      });
      const okExp = await sendEmail(ctx.prof.email, subject, html);
      if (okExp) {
        await logSent(supabase, c.employee_id, 'expired', c.id, ctx.prof.email);
      }
    }

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

  console.log('[BGC reminders] sent', emailsSent, 'emails;', smsSent, 'SMS;', alertsCreated, 'alerts created/escalated');
  return {
    statusCode: 200,
    body: JSON.stringify({ emailsSent, smsSent, alertsCreated })
  };
};

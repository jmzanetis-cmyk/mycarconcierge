// ============================================================================
// MCC Stripe Key Expiry Reminder — Scheduled Function (Task #246)
//
// Daily job that compares "now" to the configured Stripe secret-key expiry
// date and sends an email alert to the admin notification address at the
// 3-day, 1-day, and 0-day (expired) thresholds.
//
// Storage:
//   ai_ops_settings row with key='stripe_key_expiry_date' (value YYYY-MM-DD).
//   The settings row's updated_at acts as the "reset point" for idempotency.
//
// Idempotency:
//   For each threshold action_type ('alert_3d' | 'alert_1d' | 'alert_expired'),
//   the alert is only sent if no ai_action_log row exists with
//   module='stripe_key_expiry', action_type=X, created_at >= settings.updated_at.
//   When the admin updates the expiry date the settings row's updated_at
//   advances, which automatically resets the alert state for the next cycle.
//
// Schedule wired in netlify.toml (`0 12 * * *`).
// ============================================================================

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const ADMIN_EMAIL = process.env.STRIPE_KEY_EXPIRY_ADMIN_EMAIL
  || process.env.ADMIN_NOTIFICATION_EMAIL
  || process.env.ADMIN_EMAIL
  || 'jm.zanetis@gmail.com';
const SETTINGS_KEY = 'stripe_key_expiry_date';
const MODULE = 'stripe_key_expiry';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function getResend() {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

async function logAction(supabase, actionType, decision, { escalated = false, outcome = 'logged' } = {}) {
  try {
    await supabase.from('ai_action_log').insert({
      module: MODULE,
      action_type: actionType,
      target_id: 'stripe_secret_key',
      decision,
      confidence: 1.0,
      auto_executed: false,
      escalated,
      outcome,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[StripeKeyExpiry] logAction error:', err.message);
  }
}

async function loadExpirySetting(supabase) {
  const { data, error } = await supabase
    .from('ai_ops_settings')
    .select('key,value,updated_at')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();
  if (error) throw new Error(`loadExpirySetting query failed: ${error.message}`);
  return data || null;
}

async function alreadyAlerted(supabase, actionType, sinceIso) {
  // A threshold counts as "alerted" only when a prior attempt actually sent
  // the email (outcome='sent'). Failed attempts (Resend transient error,
  // missing API key, etc.) must NOT block the next scheduled run from
  // retrying — otherwise a single transient failure permanently suppresses
  // the alert until the admin updates the date.
  const { data, error } = await supabase
    .from('ai_action_log')
    .select('id')
    .eq('module', MODULE)
    .eq('action_type', actionType)
    .eq('outcome', 'sent')
    .gte('created_at', sinceIso)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`alreadyAlerted query failed: ${error.message}`);
  return !!data;
}

function computeStatus(expiryDateStr) {
  // Calendar-day delta in UTC: expiry-date midnight minus today's midnight.
  // 0 = expires today, 1 = tomorrow, -1 = expired yesterday.
  const expiryUtc = Date.UTC(
    Number(expiryDateStr.slice(0, 4)),
    Number(expiryDateStr.slice(5, 7)) - 1,
    Number(expiryDateStr.slice(8, 10))
  );
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysUntil = Math.round((expiryUtc - todayUtc) / 86400000);
  let level = 'healthy';
  if (daysUntil <= 0) level = 'expired';
  else if (daysUntil <= 1) level = 'critical';
  else if (daysUntil <= 3) level = 'warning';
  return { daysUntil, level };
}

function buildEmailHtml({ daysUntil, expiryDateStr, threshold }) {
  const headline = threshold === 'alert_expired'
    ? '🚨 Stripe secret key has EXPIRED'
    : threshold === 'alert_1d'
    ? '⚠️ Stripe secret key expires in 1 day'
    : '⚠️ Stripe secret key expires in 3 days';
  const subhead = threshold === 'alert_expired'
    ? 'Every payment flow (bid pack checkouts, merch, split-pay, instant Connect payouts, webhook signature verification) is broken until you rotate the key.'
    : 'Rotate the key now to avoid breaking every payment flow on the platform when it expires.';
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;color:#e2e8f0;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="background:#1e293b;border-left:4px solid ${threshold === 'alert_expired' ? '#ef4444' : threshold === 'alert_1d' ? '#ef4444' : '#f59e0b'};border-radius:8px;padding:24px;">
      <div style="font-size:18px;font-weight:700;color:#f1f5f9;margin-bottom:12px;">${headline}</div>
      <div style="font-size:14px;line-height:1.6;color:#cbd5e1;margin-bottom:16px;">${subhead}</div>
      <div style="background:#0f1117;border-radius:6px;padding:14px 16px;font-size:13px;color:#94a3b8;margin-bottom:16px;">
        <div>Expiry date: <strong style="color:#f1f5f9;">${expiryDateStr}</strong></div>
        <div>Days remaining: <strong style="color:#f1f5f9;">${daysUntil}</strong></div>
      </div>
      <div style="font-size:13px;line-height:1.6;color:#94a3b8;">
        After rotating the key:
        <ol style="margin:8px 0 0 18px;padding:0;">
          <li>Update <code>STRIPE_SECRET_KEY</code> in the Netlify environment.</li>
          <li>Open the admin dashboard → Payments and update the expiry date so the next reminder cycle resets.</li>
        </ol>
      </div>
      <div style="margin-top:20px;text-align:center;">
        <a href="https://mycarconcierge.com/admin.html#payments" style="display:inline-block;background:linear-gradient(135deg,#c9a84c,#b8942d);color:#0f1117;font-weight:700;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:6px;">Open Payments Section →</a>
      </div>
    </div>
    <div style="margin-top:16px;font-size:11px;color:#475569;text-align:center;">My Car Concierge · Stripe key expiry monitor</div>
  </div>
</body></html>`;
}

async function sendAlertEmail({ daysUntil, expiryDateStr, threshold }) {
  const resend = getResend();
  if (!resend) return { sent: false, reason: 'no_resend' };
  const subject = threshold === 'alert_expired'
    ? `🚨 Stripe key EXPIRED (${expiryDateStr}) — rotate now`
    : threshold === 'alert_1d'
    ? `⚠️ Stripe key expires in 1 day (${expiryDateStr})`
    : `⚠️ Stripe key expires in 3 days (${expiryDateStr})`;
  try {
    const result = await resend.emails.send({
      from: 'My Car Concierge <no-reply@mycarconcierge.com>',
      to: [ADMIN_EMAIL],
      subject,
      html: buildEmailHtml({ daysUntil, expiryDateStr, threshold })
    });
    if (result.error) {
      console.error('[StripeKeyExpiry] Resend error:', result.error);
      return { sent: false, reason: result.error.message || 'resend_error' };
    }
    return { sent: true };
  } catch (err) {
    console.error('[StripeKeyExpiry] Email send failed:', err.message);
    return { sent: false, reason: err.message };
  }
}

async function runChecker(supabase) {
  const t0 = Date.now();

  const setting = await loadExpirySetting(supabase);
  if (!setting || !setting.value) {
    await logAction(supabase, 'check', { reason: 'no_expiry_configured' }, { outcome: 'skipped' });
    return { success: true, skipped: true, reason: 'no_expiry_configured', execution_time_ms: Date.now() - t0 };
  }

  const expiryDateStr = String(setting.value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDateStr)) {
    await logAction(supabase, 'check', { reason: 'invalid_expiry_format', value: expiryDateStr }, { outcome: 'skipped', escalated: true });
    return { success: false, error: 'invalid_expiry_format', value: expiryDateStr };
  }

  const { daysUntil, level } = computeStatus(expiryDateStr);
  // Alerts created before this point belong to a previous expiry cycle.
  const sinceIso = setting.updated_at || new Date(0).toISOString();

  const alertsSent = [];
  const thresholds = [
    { actionType: 'alert_3d',      condition: daysUntil <= 3 },
    { actionType: 'alert_1d',      condition: daysUntil <= 1 },
    { actionType: 'alert_expired', condition: daysUntil <= 0 }
  ];

  for (const { actionType, condition } of thresholds) {
    if (!condition) continue;
    if (await alreadyAlerted(supabase, actionType, sinceIso)) continue;
    const result = await sendAlertEmail({ daysUntil, expiryDateStr, threshold: actionType });
    await logAction(supabase, actionType, {
      expiry_date: expiryDateStr,
      days_until: daysUntil,
      level,
      email_sent: result.sent,
      email_reason: result.reason || null
    }, { escalated: true, outcome: result.sent ? 'sent' : 'failed' });
    alertsSent.push({ threshold: actionType, email_sent: result.sent });
  }

  await logAction(supabase, 'check', {
    expiry_date: expiryDateStr,
    days_until: daysUntil,
    level,
    alerts_sent_this_run: alertsSent.length
  });

  return {
    success: true,
    expiry_date: expiryDateStr,
    days_until: daysUntil,
    level,
    alerts_sent_this_run: alertsSent,
    execution_time_ms: Date.now() - t0
  };
}

exports.handler = async function() {
  console.log('[StripeKeyExpiry] Scheduled run at', new Date().toISOString());
  const supabase = getSupabase();
  if (!supabase) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no_database' }) };
  }
  try {
    const result = await runChecker(supabase);
    console.log('[StripeKeyExpiry] Done:', JSON.stringify(result));
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    console.error('[StripeKeyExpiry] Error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

// Exported for the dev-server mirror in www/server.js.
exports._runChecker = runChecker;
exports._computeStatus = computeStatus;
exports._SETTINGS_KEY = SETTINGS_KEY;
exports._MODULE = MODULE;

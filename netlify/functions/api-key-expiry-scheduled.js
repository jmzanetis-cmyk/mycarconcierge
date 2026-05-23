// ============================================================================
// MCC API Key Expiry Reminder — Scheduled Function (Task #353)
//
// Generalization of the Task #246 Stripe-only reminder. Daily job that
// loops over every entry in lib/api-key-expiry-config.js, compares "now"
// to the configured expiry date (one ai_ops_settings row per tracked
// key), and sends an email alert to the admin notification address at the
// 3-day / 1-day / 0-day thresholds — the same idempotency model the
// Stripe-only path used.
//
// Backward compat: the Stripe entry in TRACKED_KEYS reuses
// setting_key 'stripe_key_expiry_date' + module 'stripe_key_expiry', so
// any in-flight Task #246 alert state (the row itself + ai_action_log
// history) transfers without migration.
//
// Schedule wired in netlify.toml (`0 12 * * *`). The original
// stripe-key-expiry-scheduled cron entry is kept as a thin shim that
// delegates here so the Netlify deploy is safe even if the cron list lags.
// ============================================================================

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { TRACKED_KEYS } = require('../../lib/api-key-expiry-config');

const ADMIN_EMAIL = process.env.STRIPE_KEY_EXPIRY_ADMIN_EMAIL
  || process.env.ADMIN_NOTIFICATION_EMAIL
  || process.env.ADMIN_EMAIL
  || '';
const FROM_EMAIL = process.env.MCC_FROM_EMAIL || 'no-reply@mycarconcierge.com';

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

async function logAction(supabase, keyConfig, actionType, decision, { escalated = false, outcome = 'logged' } = {}) {
  try {
    await supabase.from('ai_action_log').insert({
      module: keyConfig.module,
      action_type: actionType,
      target_id: keyConfig.id,
      decision,
      confidence: 1.0,
      auto_executed: false,
      escalated,
      outcome,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error(`[ApiKeyExpiry:${keyConfig.id}] logAction error:`, err.message);
  }
}

async function loadExpirySetting(supabase, keyConfig) {
  const { data, error } = await supabase
    .from('ai_ops_settings')
    .select('key,value,updated_at')
    .eq('key', keyConfig.setting_key)
    .maybeSingle();
  if (error) throw new Error(`loadExpirySetting query failed for ${keyConfig.id}: ${error.message}`);
  return data || null;
}

async function alreadyAlerted(supabase, keyConfig, actionType, expiryDateStr) {
  // A threshold counts as "alerted" when a prior attempt actually sent the
  // email (outcome='sent') OR when a later, more-severe threshold fired and
  // marked this lower one as superseded (outcome='superseded'). Failed
  // attempts (Resend transient error, missing API key, etc.) must NOT block
  // the next scheduled run from retrying — otherwise a single transient
  // failure permanently suppresses the alert until the admin updates the
  // date.
  //
  // The "cycle" is identified by the expiry date string itself (stored in
  // decision.expiry_date), NOT by a timestamp window. Using a timestamp
  // window was fragile: ai_ops_settings.updated_at can land on the same
  // millisecond as a just-inserted alert's created_at (especially on a
  // single test machine), which broke either same-cycle dedup (with `gt`)
  // or cross-cycle reset (with `gte`). Comparing the date string is
  // exact and survives any clock-precision edge case: a fresh cycle
  // begins the moment the admin saves a different expiry value.
  const { data, error } = await supabase
    .from('ai_action_log')
    .select('id,decision,created_at')
    .eq('module', keyConfig.module)
    .eq('action_type', actionType)
    .in('outcome', ['sent', 'superseded'])
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(`alreadyAlerted query failed for ${keyConfig.id}: ${error.message}`);
  return (data || []).some(row => {
    const dec = row.decision || {};
    return dec.expiry_date === expiryDateStr;
  });
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

function buildEmailHtml(keyConfig, { daysUntil, expiryDateStr, threshold }) {
  const headline = threshold === 'alert_expired'
    ? `🚨 ${keyConfig.label} has EXPIRED`
    : threshold === 'alert_1d'
    ? `⚠️ ${keyConfig.label} expires in 1 day`
    : `⚠️ ${keyConfig.label} expires in 3 days`;
  const subhead = threshold === 'alert_expired'
    ? keyConfig.feature
    : `Rotate the key now to avoid breaking that surface. ${keyConfig.feature}`;
  const rotationListHtml = keyConfig.rotation_steps
    .map(s => `<li>${s}</li>`)
    .join('');
  const accent = threshold === 'alert_expired' || threshold === 'alert_1d' ? '#ef4444' : '#f59e0b';
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;color:#e2e8f0;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="background:#1e293b;border-left:4px solid ${accent};border-radius:8px;padding:24px;">
      <div style="font-size:18px;font-weight:700;color:#f1f5f9;margin-bottom:12px;">${headline}</div>
      <div style="font-size:14px;line-height:1.6;color:#cbd5e1;margin-bottom:16px;">${subhead}</div>
      <div style="background:#0f1117;border-radius:6px;padding:14px 16px;font-size:13px;color:#94a3b8;margin-bottom:16px;">
        <div>Key: <strong style="color:#f1f5f9;">${keyConfig.label}</strong> (env var <code>${keyConfig.env_var}</code>)</div>
        <div>Expiry date: <strong style="color:#f1f5f9;">${expiryDateStr}</strong></div>
        <div>Days remaining: <strong style="color:#f1f5f9;">${daysUntil}</strong></div>
      </div>
      <div style="font-size:13px;line-height:1.6;color:#94a3b8;">
        Rotation procedure:
        <ol style="margin:8px 0 0 18px;padding:0;">${rotationListHtml}</ol>
      </div>
      <div style="margin-top:20px;text-align:center;">
        <a href="https://mycarconcierge.com/admin.html#payments" style="display:inline-block;background:linear-gradient(135deg,#c9a84c,#b8942d);color:#0f1117;font-weight:700;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:6px;">Open API Keys Panel →</a>
      </div>
    </div>
    <div style="margin-top:16px;font-size:11px;color:#475569;text-align:center;">My Car Concierge · API key expiry monitor</div>
  </div>
</body></html>`;
}

async function sendAlertEmail(keyConfig, { daysUntil, expiryDateStr, threshold }) {
  const resend = getResend();
  if (!resend) return { sent: false, reason: 'no_resend' };
  if (!ADMIN_EMAIL) {
    console.error('[ApiKeyExpiry] No admin recipient configured. Set ADMIN_NOTIFICATION_EMAIL or ADMIN_EMAIL.');
    return { sent: false, reason: 'no_admin_email' };
  }
  const subject = threshold === 'alert_expired'
    ? `🚨 ${keyConfig.label} EXPIRED (${expiryDateStr}) — rotate now`
    : threshold === 'alert_1d'
    ? `⚠️ ${keyConfig.label} expires in 1 day (${expiryDateStr})`
    : `⚠️ ${keyConfig.label} expires in 3 days (${expiryDateStr})`;
  try {
    const result = await resend.emails.send({
      from: `My Car Concierge <${FROM_EMAIL}>`,
      to: [ADMIN_EMAIL],
      subject,
      html: buildEmailHtml(keyConfig, { daysUntil, expiryDateStr, threshold })
    });
    if (result.error) {
      console.error(`[ApiKeyExpiry:${keyConfig.id}] Resend error:`, result.error);
      return { sent: false, reason: result.error.message || 'resend_error' };
    }
    return { sent: true };
  } catch (err) {
    console.error(`[ApiKeyExpiry:${keyConfig.id}] Email send failed:`, err.message);
    return { sent: false, reason: err.message };
  }
}

async function checkOneKey(supabase, keyConfig) {
  const setting = await loadExpirySetting(supabase, keyConfig);
  if (!setting || !setting.value) {
    await logAction(supabase, keyConfig, 'check', { reason: 'no_expiry_configured' }, { outcome: 'skipped' });
    return { key_id: keyConfig.id, skipped: true, reason: 'no_expiry_configured' };
  }

  const expiryDateStr = String(setting.value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDateStr)) {
    await logAction(supabase, keyConfig, 'check', { reason: 'invalid_expiry_format', value: expiryDateStr }, { outcome: 'skipped', escalated: true });
    return { key_id: keyConfig.id, error: 'invalid_expiry_format', value: expiryDateStr };
  }

  const { daysUntil, level } = computeStatus(expiryDateStr);

  // Pick only the single most-severe threshold whose condition is true.
  // Lower-severity thresholds get marked 'superseded' so they don't fire on
  // a later run (alreadyAlerted treats 'superseded' the same as 'sent').
  // This prevents the "first-eligible run sends 3 emails at once" bug — if
  // the very first scheduled run after admin sets a date already finds the
  // key expired, we send only the expired email, not the 3d + 1d + expired
  // chain. The ladder still resets on date change because alreadyAlerted
  // matches against decision.expiry_date — a new expiry value is a fresh
  // cycle and prior cycles' rows don't block it.
  const ladder = [
    { actionType: 'alert_3d',      condition: daysUntil <= 3 },
    { actionType: 'alert_1d',      condition: daysUntil <= 1 },
    { actionType: 'alert_expired', condition: daysUntil <= 0 }
  ];
  const eligible = ladder.filter(t => t.condition);
  const fireIdx = eligible.length - 1; // most-severe applicable threshold

  const alertsSent = [];
  for (let i = 0; i < eligible.length; i++) {
    const { actionType } = eligible[i];
    if (await alreadyAlerted(supabase, keyConfig, actionType, expiryDateStr)) continue;
    if (i < fireIdx) {
      // Supersede: log so a later run won't re-fire this lower threshold,
      // but don't actually send an email.
      await logAction(supabase, keyConfig, actionType, {
        key_id: keyConfig.id,
        expiry_date: expiryDateStr,
        days_until: daysUntil,
        level,
        superseded_by: eligible[fireIdx].actionType,
        reason: 'higher_severity_threshold_already_applies'
      }, { escalated: false, outcome: 'superseded' });
      alertsSent.push({ threshold: actionType, email_sent: false, superseded: true });
      continue;
    }
    const result = await sendAlertEmail(keyConfig, { daysUntil, expiryDateStr, threshold: actionType });
    await logAction(supabase, keyConfig, actionType, {
      key_id: keyConfig.id,
      expiry_date: expiryDateStr,
      days_until: daysUntil,
      level,
      email_sent: result.sent,
      email_reason: result.reason || null
    }, { escalated: true, outcome: result.sent ? 'sent' : 'failed' });
    alertsSent.push({ threshold: actionType, email_sent: result.sent });
  }

  await logAction(supabase, keyConfig, 'check', {
    key_id: keyConfig.id,
    expiry_date: expiryDateStr,
    days_until: daysUntil,
    level,
    alerts_sent_this_run: alertsSent.length
  });

  return {
    key_id: keyConfig.id,
    expiry_date: expiryDateStr,
    days_until: daysUntil,
    level,
    alerts_sent_this_run: alertsSent
  };
}

async function runChecker(supabase, { onlyKeyId } = {}) {
  const t0 = Date.now();
  const targets = onlyKeyId
    ? TRACKED_KEYS.filter(k => k.id === onlyKeyId)
    : TRACKED_KEYS;
  const results = [];
  for (const keyConfig of targets) {
    try {
      results.push(await checkOneKey(supabase, keyConfig));
    } catch (err) {
      console.error(`[ApiKeyExpiry:${keyConfig.id}] checkOneKey failed:`, err.message);
      results.push({ key_id: keyConfig.id, error: err.message });
    }
  }
  return {
    success: true,
    keys_checked: results.length,
    results,
    execution_time_ms: Date.now() - t0
  };
}

exports.handler = async function() {
  console.log('[ApiKeyExpiry] Scheduled run at', new Date().toISOString());
  const supabase = getSupabase();
  if (!supabase) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no_database' }) };
  }
  try {
    const result = await runChecker(supabase);
    console.log('[ApiKeyExpiry] Done:', JSON.stringify(result));
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    console.error('[ApiKeyExpiry] Error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

// Shared with the admin endpoint + dev mirror + tests.
exports._runChecker = runChecker;
exports._checkOneKey = checkOneKey;
exports._computeStatus = computeStatus;
exports._TRACKED_KEYS = TRACKED_KEYS;

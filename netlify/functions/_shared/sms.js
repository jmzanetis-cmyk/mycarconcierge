// ============================================================================
// MCC — Shared SMS sender with TCPA STOP / sms_opt_out enforcement
// Task #429 (follow-up to Task #425).
//
// Why this exists:
//   Task #425 added the `profiles.sms_opt_out` flag and the
//   twilio-sms-inbound.js handler that flips it when a user replies STOP.
//   The dev-server SMS path (www/server.js#sendSmsNotification) checks
//   the flag before every send. But several Netlify Functions had their
//   own inline `sendSms()` helpers that called Twilio directly without
//   ever consulting the flag — so an opted-out user could still receive
//   SMS in production. Centralising the send here guarantees the check
//   runs once and identically in every code path.
//
// What it does:
//   - Looks up profiles.sms_opt_out by `userId` (when known) AND by
//     normalized phone (to catch admin-alert / outreach-lead paths where
//     the recipient may not be the authenticated user but their phone
//     still matches an opted-out profile).
//   - Refuses to send when either lookup returns sms_opt_out=true.
//   - **Fails closed on DB errors** — the lookup throwing is treated as
//     "do not send", matching the dev-server semantics (line 7014 of
//     www/server.js: "refusing send (fail-closed for TCPA)"). Better to
//     drop a transient message than violate TCPA.
//   - Returns a consistent `{ sent, reason, sid? }` shape so callers
//     can branch on `sms_opt_out` / `not_configured` / `twilio_error`.
//
// What's NOT covered:
//   - Twilio Verify (OTP) flows like driver-api.js. OTP is a
//     transactional auth message exempt from STOP under TCPA / CTIA
//     short-code guidelines.
//   - Pure push (FCM) paths like notifications-bid-accepted-push.js.
// ============================================================================

const SMS_API_URL = (sid) =>
  `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

/**
 * Normalize a US/CA phone to E.164 (+1XXXXXXXXXX). Returns null if the
 * cleaned number is too short to be valid. Matches the normalization
 * used by twilio-sms-inbound.js so the lookup matches the row written
 * by the STOP handler.
 */
function normalizePhone(raw) {
  if (!raw) return null;
  const clean = String(raw).replaceAll(/\D/g, '');
  if (clean.length < 10) return null;
  if (clean.length === 10) return `+1${clean}`;
  if (clean.startsWith('1') && clean.length === 11) return `+${clean}`;
  // Already E.164-ish (e.g. +44…) — pass through with leading +
  return raw.startsWith('+') ? raw : `+${clean}`;
}

/**
 * Returns true if the recipient has opted out via STOP.
 * Fail-closed: on any DB error, returns true (caller will skip the send).
 *
 * - When `userId` is set, checks profiles.id = userId.
 * - When `phone` is set, also checks profiles.phone = normalized(phone)
 *   so admin-alert / outreach-lead paths that don't have a profile id
 *   still honor STOP if the number happens to belong to an opted-out
 *   user.
 */
async function isOptedOut({ supabase, userId, phone }) {
  if (!supabase) return false; // No client wired up — let caller's existing dry-run logic kick in
  try {
    if (userId) {
      const { data, error } = await supabase
        .from('profiles')
        .select('sms_opt_out')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      if (data && data.sms_opt_out === true) return true;
    }
    const e164 = normalizePhone(phone);
    if (e164) {
      // Match against the stored phone in any reasonable format. We try
      // the E.164 form first (what twilio-sms-inbound writes), then a
      // bare-digits fallback for older rows.
      const { data, error } = await supabase
        .from('profiles')
        .select('id, sms_opt_out')
        .or(`phone.eq.${e164},phone.eq.${e164.replace(/^\+1/, '')}`)
        .eq('sms_opt_out', true)
        .limit(1);
      if (error) throw error;
      if (Array.isArray(data) && data.length > 0) return true;
    }
    return false;
  } catch (err) {
    console.error('[sms_opt_out] lookup failed — refusing send (fail-closed for TCPA):', err.message);
    return true;
  }
}

/**
 * Send an SMS via Twilio's Messages API, gated on the recipient's
 * sms_opt_out flag. Returns `{ sent, reason, sid? }`.
 *
 * Reasons:
 *   - 'sms_opt_out'      — recipient (by id or phone) has texted STOP
 *   - 'not_configured'   — TWILIO_* env vars missing
 *   - 'invalid_phone'    — toPhone failed normalization
 *   - 'twilio_error:NNN' — Twilio returned a non-2xx
 *   - 'exception'        — fetch threw
 */
async function sendSms({ supabase, toPhone, body, userId = null, env = process.env }) {
  if (await isOptedOut({ supabase, userId, phone: toPhone })) {
    return { sent: false, reason: 'sms_opt_out' };
  }

  const sid   = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  const from  = env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) return { sent: false, reason: 'not_configured' };

  const to = normalizePhone(toPhone);
  if (!to) return { sent: false, reason: 'invalid_phone' };

  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const form = new URLSearchParams({ To: to, From: from, Body: body });
    const r = await fetch(SMS_API_URL(sid), {
      method:  'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    form.toString()
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.error('[sms] Twilio non-2xx:', r.status, txt.slice(0, 200));
      return { sent: false, reason: `twilio_error:${r.status}` };
    }
    let data = {};
    try { data = await r.json(); } catch {}
    return { sent: true, sid: data.sid || null };
  } catch (e) {
    console.error('[sms] send threw:', e.message);
    return { sent: false, reason: 'exception', error: e.message };
  }
}

module.exports = { sendSms, isOptedOut, normalizePhone };

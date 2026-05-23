'use strict';

const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const STOP_KEYWORDS  = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const START_KEYWORDS = new Set(['START', 'UNSTOP', 'YES']);
const HELP_KEYWORDS  = new Set(['HELP', 'INFO']);

const STOP_REPLY  = 'You have been unsubscribed from My Car Concierge SMS. No further messages will be sent. Reply START to resubscribe.';
const START_REPLY = 'You have been resubscribed to My Car Concierge SMS alerts. Reply STOP to unsubscribe at any time. Msg & data rates may apply.';
const HELP_REPLY  = 'My Car Concierge: appointment & bid alerts. Reply STOP to unsubscribe, START to resubscribe. Support: support@mycarconcierge.com. Msg & data rates may apply.';

function twiml(message) {
  const safe = String(message || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
  return { statusCode: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' }, body };
}

function badRequest(reason) {
  return { statusCode: 403, headers: { 'Content-Type': 'text/plain' }, body: reason || 'forbidden' };
}

function parseForm(body) {
  const out = {};
  if (!body) return out;
  const pairs = body.split('&');
  for (const p of pairs) {
    if (!p) continue;
    const eq = p.indexOf('=');
    const k = decodeURIComponent((eq === -1 ? p : p.slice(0, eq)).replaceAll('+', ' '));
    const v = decodeURIComponent((eq === -1 ? '' : p.slice(eq + 1)).replaceAll('+', ' '));
    out[k] = v;
  }
  return out;
}

// Twilio request signature validation per
// https://www.twilio.com/docs/usage/webhooks/webhooks-security
function validateTwilioSignature(authToken, signature, url, params) {
  if (!authToken || !signature) return false;
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const k of sortedKeys) data += k + (params[k] == null ? '' : params[k]);
  const expected = crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function normalizeKeyword(body) {
  return String(body || '').trim().toUpperCase().replaceAll(/[^A-Z]/g, '');
}

function normalizePhone(p) {
  if (!p) return null;
  const digits = String(p).replace(/\D/g, '');
  if (!digits) return null;
  return digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
}

async function recordAndApply(supabase, { phoneE164, keyword, action, twilioSid, rawBody }) {
  if (!supabase) return { matched: 0, error: 'no_db' };
  let matched = 0;
  try {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, phone')
      .not('phone', 'is', null);
    const matches = (profiles || []).filter(p => normalizePhone(p.phone) === phoneE164);
    if (matches.length > 0) {
      const ids = matches.map(p => p.id);
      const update = action === 'opt_out'
        ? { sms_opt_out: true,  sms_opt_out_at: new Date().toISOString() }
        : { sms_opt_out: false, sms_opt_out_at: null };
      const { error } = await supabase.from('profiles').update(update).in('id', ids);
      if (error) return { matched: 0, error: error.message };
      matched = ids.length;
    }

    // Per Task #425 spec (Step 4) also clear provider_notification_prefs SMS
    // flags for any provider whose `sms_phone` matches the inbound number, so
    // STOP turns off SMS reminders even where the recipient profile isn't the
    // texting account (provider/employee mismatch). On opt-in we just clear
    // the deny-list; the provider has to re-enable each reminder explicitly.
    try {
      const { data: prefs } = await supabase
        .from('provider_notification_prefs')
        .select('provider_id, sms_phone')
        .not('sms_phone', 'is', null);
      const prefMatches = (prefs || []).filter(p => normalizePhone(p.sms_phone) === phoneE164);
      if (prefMatches.length > 0) {
        const providerIds = prefMatches.map(p => p.provider_id);
        const prefUpdate = action === 'opt_out'
          ? {
              bgc_reminder_60_sms: false,
              bgc_reminder_30_sms: false,
              bgc_reminder_14_sms: false,
              bgc_reminder_7_sms:  false,
              bgc_reminder_1_sms:  false,
              sms_phone: null
            }
          : {}; // opt-in does NOT auto-re-enable opt-in-only SMS flags
        if (action === 'opt_out') {
          const { error: pErr } = await supabase
            .from('provider_notification_prefs')
            .update(prefUpdate)
            .in('provider_id', providerIds);
          if (pErr) console.warn(`[twilio-sms-inbound] provider_notification_prefs update warning: ${pErr.message}`);
        }
      }
    } catch (e) {
      console.warn(`[twilio-sms-inbound] provider_notification_prefs update threw: ${e.message}`);
    }
    await supabase.from('sms_opt_out_log').insert({
      phone_e164: phoneE164,
      keyword,
      action,
      matched_profile_id: matches[0]?.id || null,
      twilio_message_sid: twilioSid || null,
      raw_body: rawBody ? String(rawBody).slice(0, 500) : null
    });
    return { matched };
  } catch (e) {
    return { matched: 0, error: e.message };
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { Allow: 'POST' }, body: 'method not allowed' };
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const params = parseForm(event.body || '');
  const signature = event.headers['x-twilio-signature'] || event.headers['X-Twilio-Signature'];

  // Twilio signs the EXACT public URL it called. Behind the Netlify redirect
  // (`/api/twilio/sms-inbound` -> `/.netlify/functions/twilio-sms-inbound`)
  // event.rawPath / event.path are unreliable. In production, set
  // TWILIO_INBOUND_PUBLIC_URL to the literal URL configured in the Twilio
  // console (e.g. https://www.mycarconcierge.com/api/twilio/sms-inbound) so
  // signature validation matches the bytes Twilio actually signed. The
  // x-forwarded-* fallback is best-effort for dev/staging only.
  const publicUrl = process.env.TWILIO_INBOUND_PUBLIC_URL
    || (event.headers['x-forwarded-proto'] && event.headers['x-forwarded-host']
          ? `${event.headers['x-forwarded-proto']}://${event.headers['x-forwarded-host']}${event.rawPath || event.path || ''}`
          : null);

  if (process.env.TWILIO_SIGNATURE_REQUIRED !== 'false') {
    if (!authToken || !publicUrl || !validateTwilioSignature(authToken, signature, publicUrl, params)) {
      console.warn(`[twilio-sms-inbound] signature validation failed (url=${publicUrl || 'unknown'}, signaturePresent=${!!signature}, tokenSet=${!!authToken}). If this is a real Twilio call, set TWILIO_INBOUND_PUBLIC_URL to match the URL configured in the Twilio console.`);
      return badRequest('invalid signature');
    }
  }

  const fromPhone = normalizePhone(params.From);
  const rawBody   = params.Body || '';
  const keyword   = normalizeKeyword(rawBody);
  const twilioSid = params.MessageSid || null;

  if (!fromPhone) return twiml('');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } }) : null;

  if (STOP_KEYWORDS.has(keyword)) {
    const r = await recordAndApply(supabase, { phoneE164: fromPhone, keyword, action: 'opt_out', twilioSid, rawBody });
    console.log(`[twilio-sms-inbound] STOP from ${fromPhone} keyword=${keyword} matched=${r.matched} err=${r.error || '-'}`);
    return twiml(STOP_REPLY);
  }

  if (START_KEYWORDS.has(keyword)) {
    const r = await recordAndApply(supabase, { phoneE164: fromPhone, keyword, action: 'opt_in', twilioSid, rawBody });
    console.log(`[twilio-sms-inbound] START from ${fromPhone} keyword=${keyword} matched=${r.matched} err=${r.error || '-'}`);
    return twiml(START_REPLY);
  }

  if (HELP_KEYWORDS.has(keyword)) return twiml(HELP_REPLY);

  return twiml('');
};

exports.STOP_KEYWORDS = STOP_KEYWORDS;
exports.START_KEYWORDS = START_KEYWORDS;
exports.HELP_KEYWORDS = HELP_KEYWORDS;
exports._test = { validateTwilioSignature, normalizeKeyword, normalizePhone, parseForm };

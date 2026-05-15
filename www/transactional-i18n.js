// ============================================================================
// Task #340 — Per-recipient language for transactional emails.
//
// Background:
//   Task #210 wired profiles.preferred_language into the BGC launch
//   broadcast so Spanish-speaking customers got the -es template. The
//   per-event transactional emails dispatched from www/server.js (welcome,
//   agreement-signed, payout, magic link, dispute notices, etc.) still
//   always sent English copy regardless of the saved preference.
//
// This module exposes the small contract used by every transactional
// dispatcher so they all honor the saved preference the same way:
//
//   pickLanguage(profile)
//     → 'es' when profile.preferred_language === 'es', else 'en'.
//       Identical semantics to scripts/send-bgc-launch-broadcast.js
//       so an audit of the launch broadcast and the live transactional
//       path can't drift.
//
//   resolveLanguageByUserId(supabase, userId)
//     → looks up profiles.preferred_language by id and returns 'es'/'en'.
//       Returns 'en' on any error or missing row.
//
//   resolveLanguageByEmail(supabase, email)
//     → same lookup by lowered email. Used by the dispatchers that only
//       know the recipient address (e.g. the agreement-signed email).
//
//   tx(dict, lang, vars)
//     → render a translated string from a {en, es} dictionary with
//       {{token}} interpolation. Falls back to the English string when
//       the requested language isn't in the dict, matching the launch
//       broadcast's "missing → English" rule.
//
//   STRINGS
//     → registry of translated strings used by the dispatchers below.
//       Adding a new email is just appending a new key here and reading
//       it from the dispatcher with `tx(STRINGS.welcome_subject, lang)`.
//
// ============================================================================

'use strict';

function pickLanguage(profile) {
  const pref = String((profile && profile.preferred_language) || '').toLowerCase();
  return pref === 'es' ? 'es' : 'en';
}

async function resolveLanguageByUserId(supabase, userId) {
  if (!supabase || !userId) return 'en';
  try {
    const { data } = await supabase
      .from('profiles')
      .select('preferred_language')
      .eq('id', userId)
      .maybeSingle();
    return pickLanguage(data || {});
  } catch {
    return 'en';
  }
}

async function resolveLanguageByEmail(supabase, email) {
  if (!supabase || !email) return 'en';
  try {
    const { data } = await supabase
      .from('profiles')
      .select('preferred_language')
      .eq('email', String(email).toLowerCase())
      .maybeSingle();
    return pickLanguage(data || {});
  } catch {
    return 'en';
  }
}

function tx(dict, lang, vars) {
  if (!dict) return '';
  const raw = (dict[lang] != null ? dict[lang] : dict.en) || '';
  if (!vars) return raw;
  return String(raw).replaceAll(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_, k) => {
    const v = vars[k];
    return v == null ? '' : String(v);
  });
}

// ----------------------------------------------------------------------------
// Translation registry. Keep keys grouped by email so it's easy to spot which
// strings a dispatcher needs to localize. New emails should add a block here
// rather than inlining Spanish strings at the call site.
// ----------------------------------------------------------------------------
const STRINGS = {
  // Welcome email (signup) — sendWelcomeEmail() in www/server.js.
  welcome_subject_member: {
    en: 'Welcome to My Car Concierge!',
    es: '¡Bienvenido a My Car Concierge!'
  },
  welcome_subject_provider: {
    en: 'Welcome to My Car Concierge - Provider Account Activated!',
    es: '¡Bienvenido a My Car Concierge — cuenta de proveedor activada!'
  },
  welcome_heading: {
    en: 'Welcome to My Car Concierge, {{name}}!',
    es: '¡Bienvenido a My Car Concierge, {{name}}!'
  },

  // Agreement-signed confirmation — sendAgreementConfirmationEmail().
  agreement_subject: {
    en: 'Your {{title}} Has Been Signed',
    es: 'Tu {{title}} ha sido firmado'
  },
  agreement_heading: {
    en: 'Agreement Signed Successfully',
    es: 'Acuerdo firmado correctamente'
  },
  agreement_body: {
    en: 'Thank you, {{name}}. Your {{title}} has been successfully signed and recorded.',
    es: 'Gracias, {{name}}. Tu {{title}} se ha firmado y registrado correctamente.'
  },
  agreement_label_type: {
    en: 'Agreement Type:',
    es: 'Tipo de acuerdo:'
  },
  agreement_label_signed: {
    en: 'Signed On:',
    es: 'Firmado el:'
  },
  agreement_label_ref: {
    en: 'Reference ID:',
    es: 'ID de referencia:'
  },
  agreement_footer: {
    en: 'A copy of your signed agreement is stored securely in your account. You can access it anytime from your dashboard.',
    es: 'Guardamos una copia de tu acuerdo firmado de forma segura en tu cuenta. Puedes acceder a ella en cualquier momento desde tu panel.'
  },
  agreement_cta: {
    en: 'Go to Dashboard',
    es: 'Ir al panel'
  },

  // Founder payout — sendPayoutNotificationEmail().
  payout_subject: {
    en: 'Your My Car Concierge payout has been processed',
    es: 'Tu pago de My Car Concierge ha sido procesado'
  },
  payout_heading: {
    en: 'Payout Processed',
    es: 'Pago procesado'
  },
  payout_body: {
    en: 'Hi {{name}}, your founder payout of {{amount}} via {{method}} has been processed on {{date}}. Reference: {{ref}}.',
    es: 'Hola {{name}}, tu pago de fundador por {{amount}} mediante {{method}} se procesó el {{date}}. Referencia: {{ref}}.'
  }
};

module.exports = {
  pickLanguage,
  resolveLanguageByUserId,
  resolveLanguageByEmail,
  tx,
  STRINGS
};

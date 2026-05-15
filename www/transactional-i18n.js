// Task #340 — Per-recipient language for transactional emails sent from
// www/server.js. Mirrors pickLanguage() from
// scripts/send-bgc-launch-broadcast.js so the launch broadcast and the
// per-event dispatchers can never drift.

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

const STRINGS = {
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
  agreement_label_type:   { en: 'Agreement Type:', es: 'Tipo de acuerdo:' },
  agreement_label_signed: { en: 'Signed On:',      es: 'Firmado el:' },
  agreement_label_ref:    { en: 'Reference ID:',   es: 'ID de referencia:' },
  agreement_footer: {
    en: 'A copy of your signed agreement is stored securely in your account. You can access it anytime from your dashboard.',
    es: 'Guardamos una copia de tu acuerdo firmado de forma segura en tu cuenta. Puedes acceder a ella en cualquier momento desde tu panel.'
  },
  agreement_cta: { en: 'Go to Dashboard', es: 'Ir al panel' },

  payout_subject: {
    en: 'Your My Car Concierge payout has been processed',
    es: 'Tu pago de My Car Concierge ha sido procesado'
  },
  payout_heading: { en: 'Payout Processed', es: 'Pago procesado' },
  payout_body: {
    en: 'Hi {{name}}, your founder payout of {{amount}} via {{method}} has been processed on {{date}}. Reference: {{ref}}.',
    es: 'Hola {{name}}, tu pago de fundador por {{amount}} mediante {{method}} se procesó el {{date}}. Referencia: {{ref}}.'
  },

  // Split-payment invite (sent on additional-work and standard share flows).
  split_invite_subject: {
    en: "You've been invited to split a payment - My Car Concierge",
    es: 'Te invitaron a dividir un pago — My Car Concierge'
  },
  // Refund processed notification (member-facing).
  refund_subject: {
    en: 'Refund Processed - My Car Concierge',
    es: 'Reembolso procesado — My Car Concierge'
  },
  // Account deletion confirmation.
  account_deleted_subject: {
    en: 'Your My Car Concierge Account Has Been Deleted',
    es: 'Tu cuenta de My Car Concierge ha sido eliminada'
  }
};

module.exports = {
  pickLanguage,
  resolveLanguageByUserId,
  resolveLanguageByEmail,
  tx,
  STRINGS
};

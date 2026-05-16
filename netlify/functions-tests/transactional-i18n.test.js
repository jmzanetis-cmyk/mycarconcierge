// Smoke tests for www/transactional-i18n.js (Task #340).
// Run: node netlify/functions-tests/transactional-i18n.test.js

'use strict';

const a = require('node:assert');
const {
  pickLanguage,
  resolveLanguageByUserId,
  resolveLanguageByEmail,
  tx,
  STRINGS
} = require('../../www/transactional-i18n.js');

let passed = 0;
function t(name, fn) {
  try { fn(); console.log('  ok  ' + name); passed++; }
  catch (e) { console.error('  FAIL ' + name + '\n    ' + (e.stack || e.message)); process.exitCode = 1; }
}
async function ta(name, fn) {
  try { await fn(); console.log('  ok  ' + name); passed++; }
  catch (e) { console.error('  FAIL ' + name + '\n    ' + (e.stack || e.message)); process.exitCode = 1; }
}

console.log('pickLanguage');
t("'es' → es", () => a.strictEqual(pickLanguage({ preferred_language: 'es' }), 'es'));
t("'ES' → es (case-insensitive)", () => a.strictEqual(pickLanguage({ preferred_language: 'ES' }), 'es'));
t("'fr' → en (unsupported falls back)", () => a.strictEqual(pickLanguage({ preferred_language: 'fr' }), 'en'));
t('empty profile → en', () => a.strictEqual(pickLanguage({}), 'en'));
t('null profile → en', () => a.strictEqual(pickLanguage(null), 'en'));
t('undefined profile → en', () => a.strictEqual(pickLanguage(undefined), 'en'));

console.log('tx()');
t('returns es when present', () =>
  a.strictEqual(tx(STRINGS.welcome_subject_member, 'es'), '¡Bienvenido a My Car Concierge!'));
t('returns en when present', () =>
  a.strictEqual(tx(STRINGS.welcome_subject_member, 'en'), 'Welcome to My Car Concierge!'));
t('falls back to en for unknown lang', () =>
  a.strictEqual(tx(STRINGS.welcome_subject_member, 'fr'), 'Welcome to My Car Concierge!'));
t('interpolates {{vars}}', () =>
  a.strictEqual(tx(STRINGS.welcome_heading, 'es', { name: 'Ana' }), '¡Bienvenido a My Car Concierge, Ana!'));
t('blanks unknown {{vars}}', () =>
  a.strictEqual(tx({ en: 'Hello {{name}}!' }, 'en', {}), 'Hello !'));
t('null dict → empty string', () => a.strictEqual(tx(null, 'en'), ''));
t('all required high-traffic keys exist with es', () => {
  for (const k of ['welcome_subject_member','welcome_subject_provider','welcome_heading',
                   'agreement_subject','agreement_heading','agreement_body',
                   'payout_subject','payout_heading','payout_body',
                   'split_invite_subject','refund_subject','account_deleted_subject']) {
    a.ok(STRINGS[k] && STRINGS[k].en && STRINGS[k].es, 'missing key or es variant: ' + k);
  }
});

console.log('resolveLanguageByUserId');
const fakeSb = (rows) => ({
  from() { return this; },
  select() { return this; },
  eq(_col, val) { this._val = val; return this; },
  async maybeSingle() { return { data: rows[this._val] || null }; }
});
ta('returns es for matching profile', async () => {
  const sb = fakeSb({ 'u-1': { preferred_language: 'es' } });
  a.strictEqual(await resolveLanguageByUserId(sb, 'u-1'), 'es');
});
ta('returns en when profile missing', async () => {
  a.strictEqual(await resolveLanguageByUserId(fakeSb({}), 'u-x'), 'en');
});
ta('returns en when supabase null', async () => {
  a.strictEqual(await resolveLanguageByUserId(null, 'u-1'), 'en');
});
ta('returns en when userId missing', async () => {
  a.strictEqual(await resolveLanguageByUserId(fakeSb({}), null), 'en');
});
ta('returns en when supabase throws', async () => {
  const sb = { from() { throw new Error('boom'); } };
  a.strictEqual(await resolveLanguageByUserId(sb, 'u-1'), 'en');
});

console.log('resolveLanguageByEmail');
ta('lowercases the email lookup', async () => {
  const sb = fakeSb({ 'jane@x.com': { preferred_language: 'es' } });
  a.strictEqual(await resolveLanguageByEmail(sb, 'JANE@x.com'), 'es');
});
ta('returns en when not found', async () => {
  a.strictEqual(await resolveLanguageByEmail(fakeSb({}), 'nobody@x.com'), 'en');
});

(async () => {
  // give the async ta() runs time to settle
  await new Promise(r => setTimeout(r, 50));
  console.log(`\n${passed} test(s) passed.`);
})();

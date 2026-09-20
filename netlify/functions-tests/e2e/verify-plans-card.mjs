// ============================================================================
// verify-plans-card.mjs — headless visual check for the provider Plans card.
//
// Reruns against the current draft (feat/provider-plans preview) or against
// production (post-merge) to confirm:
//
//   1. #provider-plans-card exists and its computed display is not 'none'
//   2. it shows Starter/$89 and Standard/$199
//   3. the existing bid-packs / credits section is still on the page
//   4. window.__featureProviderPlans === true (i.e. flag on)
//
// Also useful in the reverse orientation: run against production before
// FEATURE_PROVIDER_PLANS is flipped and expect the card hidden — that path
// is out of scope here but the assertions are shaped so a card-hidden run
// fails on (1) and (4) as a positive signal.
//
// ── Requirements ────────────────────────────────────────────────────────────
// Reads .env at the repo root and expects:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// Service role is used ONLY to mint a magic-link OTP for the target test
// provider (never printed). The OTP is exchanged server-side via the anon
// client for a real session, and the session payload is injected into the
// browser's localStorage before navigation — this bypasses Supabase's
// Additional Redirect URLs allowlist without touching auth config.
//
// Playwright chromium is required. On a fresh machine, run:
//   npx playwright install chromium
// This downloads the browser to ~/Library/Caches/ms-playwright — no
// lockfile change beyond the (already-committed) playwright dep.
//
// ── Security ────────────────────────────────────────────────────────────────
// The script writes ONLY:
//   • docs/specs/evidence/provider-plans-card-draft.png (on pass)
//   • docs/specs/evidence/provider-plans-card-draft-FAIL.png (on fail)
// It NEVER writes or logs the magic link, the OTP, the access/refresh
// tokens, or the raw session payload. Screenshots are safe to commit;
// stdout is safe to paste into a PR. If you extend this file, keep it
// that way — do not console.log(actionLink / otp / session / anything
// containing 'token').
//
// ── Config ──────────────────────────────────────────────────────────────────
// DRAFT is the target URL. Update when the draft alias changes. TARGET_EMAIL
// is a synthetic provider (Test Auto Shop) — never a real user. If the test
// user ever gets a real subscription, replace the target with a fresh
// throwaway or the "Manage plan" button variant will show instead of
// "Start trial" and the content assertions will need adjusting.
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT  = path.resolve(path.dirname(__filename), '..', '..', '..');

// Update this when the draft alias rotates. Set via env DRAFT_URL to
// point at another deploy without editing the file.
const DRAFT        = process.env.DRAFT_URL || 'https://provider-plans--deft-capybara-078770.netlify.app';
const TARGET_EMAIL = 'testprovider@test.com';
const TARGET_ID    = '0bb98854-8aa8-41f7-816b-d06785167194';
const SHOT_PATH    = path.join(REPO_ROOT, 'docs/specs/evidence/provider-plans-card-draft.png');
const FAIL_PATH    = path.join(REPO_ROOT, 'docs/specs/evidence/provider-plans-card-draft-FAIL.png');

function fail(msg) {
  console.log(JSON.stringify({ ok: false, error: msg }));
  process.exit(1);
}

// Manual .env parse (this file can be invoked from anywhere in the tree).
const envRaw = fs.readFileSync(path.join(REPO_ROOT, '.env'), 'utf8');
for (const line of envRaw.split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) {
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const url     = process.env.SUPABASE_URL;
const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!url || !svcKey || !anonKey) fail('SUPABASE_URL / SERVICE_ROLE / ANON key missing from .env');

const PROJECT_REF = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1];
if (!PROJECT_REF) fail('could not extract project ref from SUPABASE_URL');

// Step 1: mint OTP via service role. Never log the OTP or link.
const svc = createClient(url, svcKey, { auth: { persistSession: false } });
const { data: linkData, error: linkErr } = await svc.auth.admin.generateLink({
  type: 'magiclink',
  email: TARGET_EMAIL,
});
if (linkErr) fail('generateLink failed: ' + linkErr.message);
const otp = linkData?.properties?.email_otp;
if (!otp) fail('no email_otp on generateLink response');

// Step 2: exchange OTP for a real session via anon client.
const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
  email: TARGET_EMAIL,
  token: otp,
  type: 'email',
});
if (verifyErr) fail('verifyOtp failed: ' + verifyErr.message);
if (!verified?.session) fail('verifyOtp returned no session');

const sessionPayload = {
  access_token:  verified.session.access_token,
  refresh_token: verified.session.refresh_token,
  expires_in:    verified.session.expires_in,
  expires_at:    verified.session.expires_at,
  token_type:    verified.session.token_type || 'bearer',
  user:          verified.user,
};
const accessTokenForSignOut = verified.session.access_token; // used at cleanup only

// Step 3: launch Playwright, inject the session into localStorage BEFORE
// any page script runs.
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 2400 } });
const storageKey = `sb-${PROJECT_REF}-auth-token`;
await context.addInitScript(({ key, val }) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
}, { key: storageKey, val: sessionPayload });

const page = await context.newPage();
const consoleErrors = [];
page.on('console',   (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

try {
  // Hash routing on providers.html — # is the section switcher.
  await page.goto(DRAFT + '/providers.html#subscription', { waitUntil: 'domcontentloaded', timeout: 60000 });
} catch (e) {
  await browser.close();
  fail('page.goto failed: ' + e.message);
}

if (/login\.html/.test(page.url())) {
  await page.screenshot({ path: FAIL_PATH, fullPage: true });
  await browser.close();
  fail('bounced to login.html — session inject failed');
}

// Wait for loadProviderPlans() to finish rendering. The client code
// now waits for supabase-js hydration internally, so a single wait
// should suffice — but if the first fire lost the hydrate race the
// onAuthStateChange listener will re-render.
try {
  await page.waitForSelector('#provider-plans-card', { state: 'attached', timeout: 30000 });
  await page.waitForFunction(
    () => {
      const grid = document.getElementById('provider-plans-grid');
      if (!grid) return false;
      const html = grid.innerHTML || '';
      return html.trim().length > 0 && !/No plans available yet/i.test(html);
    },
    { timeout: 30000 }
  );
  // Section routing on providers.html: sections are shown/hidden by
  // showSection(id) in providers-core.js. The URL hash doesn't
  // auto-fire the switcher, and a plain click on the nav item can
  // race the click handler's registration on cold load. Call
  // showSection directly instead.
  await page.evaluate(() => {
    if (typeof window.showSection === 'function') {
      window.showSection('subscription');
    }
  });
  await page.waitForTimeout(500);
  const card = await page.$('#provider-plans-card');
  if (card) {
    try { await card.scrollIntoViewIfNeeded({ timeout: 3000 }); } catch (_) {}
  }
} catch (e) {
  await page.screenshot({ path: FAIL_PATH, fullPage: true });
  await browser.close();
  fail('plans card did not render real plans: ' + e.message +
       ' | console errors: ' + JSON.stringify(consoleErrors.slice(0, 5)));
}

const assertions = await page.evaluate(() => {
  const results = {};

  // (1) card exists + display !== 'none'
  const card = document.getElementById('provider-plans-card');
  results.card_visible = {
    pass: !!card && getComputedStyle(card).display !== 'none',
    display: card ? getComputedStyle(card).display : null,
  };

  // (2) Starter/$89/Standard/$199 present
  const cardText = card ? card.innerText : '';
  results.plans_content = {
    pass: /Starter/i.test(cardText) && /\$89/.test(cardText) &&
          /Standard/i.test(cardText) && /\$199/.test(cardText),
    has_starter:  /Starter/i.test(cardText),
    has_89:       /\$89/.test(cardText),
    has_standard: /Standard/i.test(cardText),
    has_199:      /\$199/.test(cardText),
  };

  // (3) existing bid-packs / credits section still present
  const packsGrid = document.getElementById('bid-packs-grid') ||
                    document.getElementById('bid-pack-grid') ||
                    document.querySelector('[data-bid-packs]');
  const creditsEl = document.getElementById('current-bid-credits') ||
                    document.getElementById('bid-credits-balance') ||
                    document.getElementById('credit-balance') ||
                    document.querySelector('[data-credit-balance]');
  results.bid_packs_still_present = {
    pass: !!packsGrid || !!creditsEl,
    packs_grid:   packsGrid ? (packsGrid.id || packsGrid.tagName) : null,
    credits_elem: creditsEl ? (creditsEl.id || creditsEl.tagName) : null,
  };

  // (4) window.__featureProviderPlans === true
  results.flag_true = {
    pass: window.__featureProviderPlans === true,
    value: window.__featureProviderPlans,
  };

  return results;
});

fs.mkdirSync(path.dirname(SHOT_PATH), { recursive: true });
await page.screenshot({ path: SHOT_PATH, fullPage: true });

await browser.close();

// Step 5: sign the throwaway session out. admin.signOut(jwt, 'global')
// revokes every session for the user's refresh token family.
let signOutStatus;
try {
  const { error: soErr } = await svc.auth.admin.signOut(accessTokenForSignOut, 'global');
  signOutStatus = soErr ? ('error:' + soErr.message) : 'ok';
} catch (e) {
  signOutStatus = 'error:' + e.message;
}

const allPass = Object.values(assertions).every(a => a.pass);
console.log(JSON.stringify({
  ok: allPass,
  assertions,
  screenshot: path.relative(REPO_ROOT, SHOT_PATH),
  sign_out_status: signOutStatus,
  console_errors_count: consoleErrors.length,
}, null, 2));
process.exit(allPass ? 0 : 2);

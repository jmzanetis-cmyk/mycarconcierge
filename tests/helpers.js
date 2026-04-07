'use strict';

const { createClient } = require('@supabase/supabase-js');

const BASE_URL = 'http://localhost:5000';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const TEST_MEMBER_EMAIL = process.env.MEMBER_TEST_EMAIL || 'testmember@mcc-test.com';
const TEST_MEMBER_PASS = process.env.MEMBER_TEST_PASSWORD || 'TestPass123!';
const TEST_PROVIDER_EMAIL = process.env.PROVIDER_TEST_EMAIL || 'testprovider_a@mcc-test.com';
const TEST_PROVIDER_PASS = process.env.PROVIDER_TEST_PASSWORD || 'TestPass123!';
const TEST_ADMIN_EMAIL = 'testadmin@mcc-test.com';
const TEST_ADMIN_PASS = 'TestAdminPass123!';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jm.zanetis@gmail.com';

function getSupabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function loginViaUI(page, email, password, portalType = 'member') {
  await page.goto(`${BASE_URL}/login.html`);
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#login-btn').click();
  await page.waitForTimeout(3000);

  const specificPortal = page.locator(`#portal-${portalType}`);
  if (await specificPortal.count() > 0 && await specificPortal.isVisible({ timeout: 2000 }).catch(() => false)) {
    await specificPortal.click({ force: true });
    await page.waitForTimeout(2000);
  } else {
    const portalByText = page.locator('.portal-option')
      .filter({ hasText: new RegExp(portalType === 'provider' ? 'Provider' : 'Member', 'i') }).first();
    if (await portalByText.count() > 0 && await portalByText.isVisible({ timeout: 1000 }).catch(() => false)) {
      await portalByText.click({ force: true });
      await page.waitForTimeout(2000);
    }
  }

  await page.waitForURL(/members\.html|providers\.html|dashboard/, { timeout: 15000 });
  return page;
}

async function dismissOverlays(page) {
  await page.evaluate(() => {
    document.querySelectorAll(
      '#provider-onboarding-overlay, [id*="onboarding-overlay"], [class*="onboarding-overlay"]'
    ).forEach(el => { el.style.display = 'none'; });
  });
}

async function navigateToSection(page, sectionName) {
  await dismissOverlays(page);
  const nav = page.locator(`[data-section="${sectionName}"]`).first();
  if (await nav.count() > 0) {
    await nav.click({ force: true });
    await page.waitForTimeout(1500);
  }
}

async function getAdminBrowserSession() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_SERVICE_KEY },
    body: JSON.stringify({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASS })
  });
  if (!res.ok) throw new Error(`Admin sign-in failed: ${res.status}`);
  return res.json();
}

async function injectAdminSession(page) {
  const session = await getAdminBrowserSession();
  const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const storageVal = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in || 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: session.user
  });
  await page.addInitScript(([key, val]) => { localStorage.setItem(key, val); }, [storageKey, storageVal]);
  return session;
}

module.exports = {
  BASE_URL,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  ADMIN_PASSWORD,
  TEST_MEMBER_EMAIL,
  TEST_MEMBER_PASS,
  TEST_PROVIDER_EMAIL,
  TEST_PROVIDER_PASS,
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASS,
  ADMIN_EMAIL,
  getSupabaseAdmin,
  loginViaUI,
  dismissOverlays,
  navigateToSection,
  getAdminBrowserSession,
  injectAdminSession
};

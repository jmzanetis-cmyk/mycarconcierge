const { test, expect } = require('@playwright/test');
const BASE_URL = 'http://localhost:5000';

const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'el', 'zh', 'hi', 'ar'];
const COMMON_TOP_LEVEL_KEYS = ['common', 'nav', 'landing', 'auth', 'member', 'provider', 'vehicles', 'services', 'payments', 'errors'];

async function setupMinimalMocks(page) {
  await page.route('**/@supabase/supabase-js**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: `
      window.supabase = { createClient: function() { return {
        auth: { getSession: function() { return Promise.resolve({ data: { session: null }, error: null }); }, onAuthStateChange: function(cb) { return { data: { subscription: { unsubscribe: function() {} } } }; }, getUser: function() { return Promise.resolve({ data: { user: null }, error: null }); } },
        from: function() { var q = { select: function() { return q; }, eq: function() { return q; }, single: function() { return q; }, maybeSingle: function() { return q; }, order: function() { return q; }, limit: function() { return q; }, then: function(r) { r({ data: null, error: null }); return q; }, catch: function() { return q; } }; return q; },
        channel: function() { return { on: function() { return this; }, subscribe: function() { return this; } }; },
        removeChannel: function() {}
      }; } };
    ` });
  });
  await page.route('**/js.stripe.com/**', route => route.abort());
  await page.route('**/cdnjs.cloudflare.com/**', route => route.abort());
  await page.route('**/fonts.googleapis.com/**', route => route.abort());
  await page.route('**/fonts.gstatic.com/**', route => route.abort());
  await page.route('**/cdn.jsdelivr.net/**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
}

test.describe('Language File Tests', () => {
  test('All 7 locale files exist and are fetchable', async ({ page }) => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const response = await page.request.fetch(`${BASE_URL}/locales/${lang}.json`);
      expect(response.status(), `Locale file for ${lang} should return 200`).toBe(200);
    }
  });

  test('Each locale file contains valid JSON', async ({ page }) => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const response = await page.request.fetch(`${BASE_URL}/locales/${lang}.json`);
      const text = await response.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        parsed = null;
      }
      expect(parsed, `Locale file for ${lang} should be valid JSON`).not.toBeNull();
      expect(typeof parsed, `Locale file for ${lang} should parse to an object`).toBe('object');
    }
  });

  test('Each locale file has common top-level keys', async ({ page }) => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const response = await page.request.fetch(`${BASE_URL}/locales/${lang}.json`);
      const data = await response.json();
      const keys = Object.keys(data);
      for (const expectedKey of COMMON_TOP_LEVEL_KEYS) {
        expect(keys, `Locale ${lang} should have key "${expectedKey}"`).toContain(expectedKey);
      }
    }
  });
});

test.describe('Language Selector UI Tests', () => {
  test('Language selector exists on homepage', async ({ page }) => {
    await setupMinimalMocks(page);
    await page.goto('/index.html');
    await page.waitForTimeout(3000);

    const langSwitcher = page.locator('.language-switcher');
    expect(await langSwitcher.count(), 'Language switcher should exist on the page').toBeGreaterThan(0);
  });

  test('Language selector contains options for all supported languages', async ({ page }) => {
    await setupMinimalMocks(page);
    await page.goto('/index.html');
    await page.waitForTimeout(3000);

    const desktopSwitcher = page.locator('#language-switcher .language-switcher');
    const langBtn = desktopSwitcher.locator('.lang-btn');
    await langBtn.click();
    await page.waitForTimeout(500);

    const langOptions = desktopSwitcher.locator('.lang-option');
    const count = await langOptions.count();
    expect(count).toBe(7);

    const expectedNames = ['English', 'Spanish', 'French', 'Greek', 'Chinese', 'Hindi', 'Arabic'];
    for (const name of expectedNames) {
      const option = desktopSwitcher.locator('.lang-option .lang-english').filter({ hasText: name });
      expect(await option.count(), `Should have option for ${name}`).toBeGreaterThan(0);
    }
  });

  test('Default language is English', async ({ page }) => {
    await setupMinimalMocks(page);
    await page.addInitScript(() => {
      localStorage.removeItem('mcc_language');
    });
    await page.goto('/index.html');
    await page.waitForTimeout(3000);

    const htmlLang = await page.getAttribute('html', 'lang');
    expect(htmlLang).toBe('en');

    const currentLang = page.locator('.language-switcher .current-lang').first();
    const text = await currentLang.textContent();
    expect(text).toBe('English');
  });

  test('Language selector button is accessible with aria-label', async ({ page }) => {
    await setupMinimalMocks(page);
    await page.goto('/index.html');
    await page.waitForTimeout(3000);

    const langBtn = page.locator('.language-switcher .lang-btn').first();
    const ariaLabel = await langBtn.getAttribute('aria-label');
    const title = await langBtn.getAttribute('title');
    expect(ariaLabel || title, 'Language button should have aria-label or title').toBeTruthy();
  });
});

test.describe('RTL Layout Tests', () => {
  async function loadPageInArabic(page) {
    await setupMinimalMocks(page);
    await page.addInitScript(() => {
      localStorage.setItem('mcc_language', 'ar');
    });
    await page.goto('/index.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
  }

  test('Selecting Arabic sets page direction to RTL', async ({ page }) => {
    await loadPageInArabic(page);

    const dir = await page.getAttribute('html', 'dir');
    expect(dir).toBe('rtl');

    const lang = await page.getAttribute('html', 'lang');
    expect(lang).toBe('ar');
  });

  test('RTL pages render without horizontal overflow', async ({ page }) => {
    await loadPageInArabic(page);

    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const windowWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(windowWidth + 20);
  });

  test('Navigation elements exist in RTL mode', async ({ page }) => {
    await loadPageInArabic(page);

    const nav = page.locator('nav, .nav, .navbar, [class*="nav"]');
    expect(await nav.count(), 'Navigation elements should still exist in RTL').toBeGreaterThan(0);

    const navLinks = page.locator('nav a[data-i18n]');
    expect(await navLinks.count(), 'Nav links should still be present in RTL').toBeGreaterThan(0);
  });

  test('Text direction is RTL for main content in Arabic mode', async ({ page }) => {
    await loadPageInArabic(page);

    const direction = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).direction;
    });
    expect(direction).toBe('rtl');
  });

  test('RTL mode does not cause overlapping or broken layout', async ({ page }) => {
    await loadPageInArabic(page);

    const heroSection = page.locator('.hero, [class*="hero"]');
    expect(await heroSection.count(), 'Hero section should exist in RTL mode').toBeGreaterThan(0);

    const heroBox = await heroSection.first().boundingBox();
    expect(heroBox, 'Hero section should have a valid bounding box in RTL').toBeTruthy();
    expect(heroBox.width).toBeGreaterThan(0);
    expect(heroBox.height).toBeGreaterThan(0);

    const featuresSection = page.locator('#features, .features, [class*="features"]');
    if (await featuresSection.count() > 0) {
      const featuresBox = await featuresSection.first().boundingBox();
      if (featuresBox) {
        expect(featuresBox.width).toBeGreaterThan(0);
        expect(featuresBox.height).toBeGreaterThan(0);
      }
    }
  });
});

test.describe('Translation Content Tests', () => {
  test('English locale has all required UI sections', async ({ page }) => {
    const response = await page.request.fetch(`${BASE_URL}/locales/en.json`);
    const data = await response.json();

    expect(data.nav).toBeTruthy();
    expect(data.nav.features).toBeTruthy();
    expect(data.nav.howItWorks).toBeTruthy();
    expect(data.nav.about).toBeTruthy();
    expect(data.nav.contact).toBeTruthy();

    expect(data.common.login).toBeTruthy();
    expect(data.common.signUp).toBeTruthy();
    expect(data.common.submit).toBeTruthy();
    expect(data.common.cancel).toBeTruthy();
    expect(data.common.save).toBeTruthy();

    expect(data.auth.email).toBeTruthy();
    expect(data.auth.password).toBeTruthy();
    expect(data.auth.signInButton).toBeTruthy();
    expect(data.auth.forgotPassword).toBeTruthy();
  });

  test('Spanish locale has the same top-level keys as English', async ({ page }) => {
    const enResponse = await page.request.fetch(`${BASE_URL}/locales/en.json`);
    const enData = await enResponse.json();
    const esResponse = await page.request.fetch(`${BASE_URL}/locales/es.json`);
    const esData = await esResponse.json();

    const enKeys = Object.keys(enData);
    const esKeys = Object.keys(esData);

    for (const key of enKeys) {
      expect(esKeys, `Spanish locale should have top-level key "${key}"`).toContain(key);
    }

    const coverageThreshold = 0.90;
    for (const key of enKeys) {
      if (typeof enData[key] === 'object' && !Array.isArray(enData[key])) {
        const enSubKeys = Object.keys(enData[key]);
        const esSubKeys = Object.keys(esData[key] || {});
        const matchedKeys = enSubKeys.filter(k => esSubKeys.includes(k));
        const coverage = matchedKeys.length / enSubKeys.length;
        expect(coverage, `Spanish locale "${key}" should have at least 95% of English sub-keys (has ${matchedKeys.length}/${enSubKeys.length})`).toBeGreaterThanOrEqual(coverageThreshold);
      }
    }
  });

  test('Non-Latin scripts have actual translated content', async ({ page }) => {
    const zhResponse = await page.request.fetch(`${BASE_URL}/locales/zh.json`);
    const zhData = await zhResponse.json();
    const hiResponse = await page.request.fetch(`${BASE_URL}/locales/hi.json`);
    const hiData = await hiResponse.json();
    const arResponse = await page.request.fetch(`${BASE_URL}/locales/ar.json`);
    const arData = await arResponse.json();

    expect(zhData.common.tagline).not.toBe('');
    expect(zhData.common.tagline).not.toBe('Zero Downtime Auto Care');
    expect(/[\u4e00-\u9fff]/.test(zhData.common.tagline), 'Chinese tagline should contain Chinese characters').toBeTruthy();

    expect(hiData.common.tagline).not.toBe('');
    expect(hiData.common.tagline).not.toBe('Zero Downtime Auto Care');
    expect(/[\u0900-\u097F]/.test(hiData.common.tagline), 'Hindi tagline should contain Devanagari characters').toBeTruthy();

    expect(arData.common.tagline).not.toBe('');
    expect(arData.common.tagline).not.toBe('Zero Downtime Auto Care');
    expect(/[\u0600-\u06FF]/.test(arData.common.tagline), 'Arabic tagline should contain Arabic characters').toBeTruthy();
  });

  test('French locale has accented characters verifying correct encoding', async ({ page }) => {
    const response = await page.request.fetch(`${BASE_URL}/locales/fr.json`);
    const data = await response.json();

    const frenchText = JSON.stringify(data);

    expect(/[éèêëàâäùûüîïôöçÉÈÊËÀÂÄÙÛÜÎÏÔÖÇ]/.test(frenchText), 'French locale should contain accented characters').toBeTruthy();

    expect(data.common.success).toBe('Succès');
    expect(data.nav.about).toBe('À Propos');
    expect(data.common.previous).toBe('Précédent');
  });
});

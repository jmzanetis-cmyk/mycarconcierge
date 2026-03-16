const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:5000';

test.describe('Network Failure During Page Load', () => {
  test('Homepage loads and has a service worker registration script', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    const htmlContent = await page.content();
    const hasSWRegistration = htmlContent.includes('serviceWorker') || htmlContent.includes('pwa-init');
    expect(hasSWRegistration).toBeTruthy();
  });

  test('When Supabase API is blocked, pages still render basic HTML structure', async ({ page }) => {
    await page.route('**/*supabase*', route => route.abort());
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    const html = page.locator('html');
    await expect(html).toBeVisible();
    const header = page.locator('header');
    await expect(header).toBeVisible();
    const main = page.locator('main');
    await expect(main).toBeVisible();
  });

  test('When all external JS CDNs are blocked, the core HTML page still loads', async ({ page }) => {
    await page.route('**/cdn.jsdelivr.net/**', route => route.abort());
    await page.route('**/cdnjs.cloudflare.com/**', route => route.abort());
    await page.route('**/unpkg.com/**', route => route.abort());
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    const title = await page.title();
    expect(title).toContain('My Car Concierge');
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('Blocking network requests to Stripe CDN does not crash the page', async ({ page }) => {
    await page.route('**/js.stripe.com/**', route => route.abort());
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    const title = await page.title();
    expect(title).toContain('My Car Concierge');
    const header = page.locator('header');
    await expect(header).toBeVisible();
  });
});

test.describe('Loading State UI Tests', () => {
  test('Dashboard pages contain skeleton or loading CSS classes', async ({ page }) => {
    await page.route('**/*supabase*', route => route.abort());
    await page.goto(`${BASE_URL}/members.html`, { waitUntil: 'domcontentloaded' });
    const htmlContent = await page.content();
    const hasLoadingIndicators =
      htmlContent.includes('skeleton') ||
      htmlContent.includes('loading') ||
      htmlContent.includes('spinner') ||
      htmlContent.includes('placeholder');
    expect(hasLoadingIndicators).toBeTruthy();
  });

  test('Login page renders immediately without external data dependencies', async ({ page }) => {
    await page.route('**/*supabase*', route => route.abort());
    await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();
  });

  test('Homepage hero section is visible without waiting for API calls', async ({ page }) => {
    await page.route('**/*supabase*', route => route.abort());
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    const hero = page.locator('.hero');
    await expect(hero).toBeVisible();
  });

  test('Contact page form is accessible regardless of API status', async ({ page }) => {
    await page.route('**/*supabase*', route => route.abort());
    await page.goto(`${BASE_URL}/contact.html`, { waitUntil: 'domcontentloaded' });
    const form = page.locator('.contact-form, form');
    await expect(form.first()).toBeVisible();
    const inputs = page.locator('.contact-form input, form input');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('Service Worker Tests', () => {
  test('Service worker file exists at /sw.js and returns valid JavaScript', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/sw.js`);
    expect(response.status()).toBe(200);
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('javascript');
    const body = await response.text();
    expect(body.length).toBeGreaterThan(0);
  });

  test('Service worker file includes caching strategy code', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/sw.js`);
    const body = await response.text();
    expect(body).toContain('cache');
    expect(body).toContain('fetch');
  });

  test('Manifest.json exists and has required PWA fields', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/manifest.json`);
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    expect(manifest.name).toBeTruthy();
    expect(manifest.icons).toBeTruthy();
    expect(manifest.icons.length).toBeGreaterThan(0);
    expect(manifest.start_url).toBeTruthy();
  });
});

test.describe('Graceful Degradation Tests', () => {
  test('If API returns 500, the page does not show raw error to user', async ({ page }) => {
    await page.route('**/*supabase*', route => {
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Internal Server Error"}' });
    });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Internal Server Error');
  });

  test('Forms remain interactive even if API is unreachable', async ({ page }) => {
    await page.route('**/*supabase*', route => route.abort());
    await page.goto(`${BASE_URL}/contact.html`, { waitUntil: 'domcontentloaded' });
    const inputs = page.locator('.contact-form input, form input');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const isDisabled = await input.isDisabled();
      expect(isDisabled).toBe(false);
    }
  });

  test('Navigation links work even without API connectivity', async ({ page }) => {
    await page.route('**/*supabase*', route => route.abort());
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    const navLinks = page.locator('header nav a[href]');
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const href = await navLinks.nth(i).getAttribute('href');
      expect(href).toBeTruthy();
    }
  });

  test('Theme toggle works without any API calls', async ({ page }) => {
    await page.route('**/*supabase*', route => route.abort());
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    const initialTheme = await page.locator('html').getAttribute('data-theme');
    const themeToggle = page.locator('.header-theme-toggle').first();
    await themeToggle.click();
    const newTheme = await page.locator('html').getAttribute('data-theme');
    expect(newTheme).not.toBe(initialTheme);
  });

  test('Language selector exists and is interactive without API dependency', async ({ page }) => {
    await page.route('**/*supabase*', route => route.abort());
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    const langSwitcher = page.locator('#language-switcher, #mobile-language-switcher');
    const count = await langSwitcher.count();
    expect(count).toBeGreaterThan(0);
    const firstSwitcher = langSwitcher.first();
    await expect(firstSwitcher).toBeAttached();
  });
});

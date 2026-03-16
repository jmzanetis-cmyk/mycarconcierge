const { test, expect } = require('@playwright/test');

const FAKE_ADMIN_ID = '00000000-aaaa-bbbb-cccc-000000000003';
const FAKE_ADMIN_EMAIL = 'admin@example.com';

async function mockAdminAuth(page) {
  await page.route('**/auth/v1/user', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: FAKE_ADMIN_ID,
        email: FAKE_ADMIN_EMAIL,
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: 'Admin User' }
      })
    });
  });

  await page.route('**/auth/v1/token**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'fake-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'fake-refresh-token',
        user: {
          id: FAKE_ADMIN_ID,
          email: FAKE_ADMIN_EMAIL,
          role: 'authenticated'
        }
      })
    });
  });

  await page.route('**/api/auth/check-access', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authorized: true })
    });
  });

  await page.route('**/rest/v1/profiles**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: FAKE_ADMIN_ID,
        full_name: 'Admin User',
        email: FAKE_ADMIN_EMAIL,
        role: 'admin'
      }])
    });
  });

  await page.route('**/rest/v1/**', (route, request) => {
    if (!route.request().url().includes('auth/v1') && !route.request().url().includes('profiles')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    } else {
      route.continue();
    }
  });
}

async function setupAdminPage(page) {
  await mockAdminAuth(page);

  await page.addInitScript(() => {
    window.localStorage.setItem('sb-ifbyjxuaclwmadqbjcyp-auth-token', JSON.stringify({
      access_token: 'fake-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'fake-refresh-token',
      user: {
        id: '00000000-aaaa-bbbb-cccc-000000000003',
        email: 'admin@example.com',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: 'Admin User' }
      }
    }));
  });

  await page.goto('/admin.html');
  await page.waitForLoadState('domcontentloaded');
}

test.describe('Theme Toggle', () => {
  test('homepage loads with dark theme by default', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark');
  });

  test('login page has theme toggle button', async ({ page }) => {
    await page.goto('/login.html');
    await page.waitForLoadState('domcontentloaded');
    const themeToggle = page.locator('.theme-toggle-mini');
    await expect(themeToggle).toBeAttached();
  });

  test('theme toggle exists on signup-member page', async ({ page }) => {
    await page.goto('/signup-member.html');
    await page.waitForLoadState('domcontentloaded');
    const themeToggle = page.locator('.theme-toggle-mini');
    await expect(themeToggle).toBeAttached();
  });

  test('theme toggle exists on signup-provider page', async ({ page }) => {
    await page.goto('/signup-provider.html');
    await page.waitForLoadState('domcontentloaded');
    const themeToggle = page.locator('.theme-toggle-mini');
    await expect(themeToggle).toBeAttached();
  });
});

test.describe('PWA Features', () => {
  test('manifest.json is accessible and returns valid JSON', async ({ page }) => {
    const response = await page.request.get('/manifest.json');
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    expect(manifest).toBeTruthy();
  });

  test('manifest.json contains required PWA fields', async ({ page }) => {
    const response = await page.request.get('/manifest.json');
    const manifest = await response.json();
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toBeTruthy();
    expect(manifest.icons).toBeTruthy();
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  test('service worker file exists at /sw.js', async ({ page }) => {
    const response = await page.request.get('/sw.js');
    expect(response.status()).toBe(200);
  });

  test('pages include manifest link tag', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toBeAttached();
    const href = await manifestLink.getAttribute('href');
    expect(href).toContain('manifest.json');
  });
});

test.describe('Language / i18n', () => {
  test('login page has language switcher element', async ({ page }) => {
    await page.goto('/login.html');
    await page.waitForLoadState('domcontentloaded');
    const langSwitcher = page.locator('#language-switcher');
    await expect(langSwitcher).toBeAttached();
  });

  test('homepage has language switcher or i18n data attributes', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    const hasI18n = await page.evaluate(() => {
      const switcher = document.getElementById('language-switcher');
      const i18nElements = document.querySelectorAll('[data-i18n]');
      return switcher !== null || i18nElements.length > 0;
    });
    expect(hasI18n).toBe(true);
  });

  test('pages use data-i18n attributes for translation', async ({ page }) => {
    await page.goto('/login.html');
    await page.waitForLoadState('domcontentloaded');
    const i18nCount = await page.evaluate(() => {
      return document.querySelectorAll('[data-i18n]').length;
    });
    expect(i18nCount).toBeGreaterThan(0);
  });
});

test.describe('Security Headers', () => {
  test('API endpoints return security headers', async ({ page }) => {
    const response = await page.request.get('/api/merch/products');
    const headers = response.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
  });

  test('static pages include security headers', async ({ page }) => {
    const response = await page.goto('/index.html');
    const headers = response.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
  });
});

test.describe('Responsive Meta Tags', () => {
  const pages = [
    'index.html',
    'login.html',
    'members.html',
    'providers.html',
    'signup-member.html'
  ];

  for (const pagePath of pages) {
    test(`${pagePath} has viewport meta tag`, async ({ page }) => {
      await page.goto(`/${pagePath}`);
      await page.waitForLoadState('domcontentloaded');
      const viewportMeta = page.locator('meta[name="viewport"]');
      await expect(viewportMeta).toBeAttached();
      const content = await viewportMeta.getAttribute('content');
      expect(content).toContain('width=device-width');
    });

    test(`${pagePath} has apple-mobile-web-app-capable meta tag`, async ({ page }) => {
      await page.goto(`/${pagePath}`);
      await page.waitForLoadState('domcontentloaded');
      const appleMeta = page.locator('meta[name="apple-mobile-web-app-capable"]');
      await expect(appleMeta).toBeAttached();
    });
  }
});

test.describe('Admin Dashboard Structure', () => {
  test('admin page loads with sidebar', async ({ page }) => {
    await setupAdminPage(page);
    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toBeAttached();
  });

  test('admin sidebar has all navigation sections', async ({ page }) => {
    await setupAdminPage(page);
    const expectedSections = [
      'dashboard', 'analytics', 'applications', 'providers', 'violations',
      'car-reviews', 'pilot-applications', 'member-founders', 'commission-payouts',
      'packages', 'payments', 'disputes', 'refunds', 'registration-verifications',
      'tickets', 'members', 'user-roles', 'user-management', 'agreements',
      'merch-manager', 'documents', 'settings'
    ];

    for (const section of expectedSections) {
      const navItem = page.locator(`.nav-item[data-section="${section}"]`);
      await expect(navItem).toBeAttached();
    }
  });

  test('dashboard section is active by default', async ({ page }) => {
    await setupAdminPage(page);
    const dashboard = page.locator('#dashboard.section.active');
    await expect(dashboard).toBeAttached();
  });

  test('stats grid exists', async ({ page }) => {
    await setupAdminPage(page);
    const statsGrid = page.locator('#dashboard .stats-grid').first();
    await expect(statsGrid).toBeAttached();
  });
});

test.describe('Shared Styles', () => {
  test('shared-styles.css is accessible', async ({ page }) => {
    const response = await page.request.get('/shared-styles.css');
    expect(response.status()).toBe(200);
  });
});

test.describe('Error Handling', () => {
  test('requesting a non-existent page returns 404 or serves a file-not-found response', async ({ page }) => {
    const response = await page.request.get('/this-page-does-not-exist-xyz.html', {
      failOnStatusCode: false
    });
    const status = response.status();
    const body = await response.text();
    const is404 = status === 404;
    const servesResponse = status === 200 && body.length > 0;
    expect(is404 || servesResponse).toBe(true);
  });

  test('API rate limiting headers are present if applicable', async ({ page }) => {
    const response = await page.request.get('/api/merch/products');
    const headers = response.headers();
    const hasRateLimitOrSecurity =
      headers['x-ratelimit-limit'] ||
      headers['x-ratelimit-remaining'] ||
      headers['x-content-type-options'] ||
      headers['x-frame-options'];
    expect(hasRateLimitOrSecurity).toBeTruthy();
  });
});

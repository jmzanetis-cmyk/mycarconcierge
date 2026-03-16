const { test, expect } = require('@playwright/test');

const FAKE_PROVIDER_ID = '00000000-aaaa-bbbb-cccc-000000000002';
const FAKE_EMAIL = 'provider@example.com';

async function mockProviderAuth(page) {
  await page.route('**/auth/v1/user', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: FAKE_PROVIDER_ID,
        email: FAKE_EMAIL,
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: 'Test Provider' }
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
          id: FAKE_PROVIDER_ID,
          email: FAKE_EMAIL,
          role: 'authenticated'
        }
      })
    });
  });

  await page.route('**/rest/v1/profiles**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: FAKE_PROVIDER_ID,
        full_name: 'Test Provider',
        email: FAKE_EMAIL,
        role: 'provider',
        zip_code: '10001',
        phone: '5559876543',
        business_name: 'Test Auto Shop',
        service_radius: 25
      }])
    });
  });

  await page.route('**/rest/v1/provider_applications**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: '1',
        status: 'approved',
        user_id: FAKE_PROVIDER_ID
      }])
    });
  });

  await page.route('**/rest/v1/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/api/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authorized: true, verified: true, connected: false, status: 'clear' })
    });
  });
}

async function setupProviderPage(page) {
  await mockProviderAuth(page);

  await page.addInitScript(() => {
    window.localStorage.setItem('sb-ifbyjxuaclwmadqbjcyp-auth-token', JSON.stringify({
      access_token: 'fake-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'fake-refresh-token',
      user: {
        id: '00000000-aaaa-bbbb-cccc-000000000002',
        email: 'provider@example.com',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: 'Test Provider' }
      }
    }));
  });

  await page.goto('/providers.html');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
}

test.describe('Provider Dashboard - Structure and Layout', () => {
  test('page loads with correct title and sidebar', async ({ page }) => {
    await setupProviderPage(page);

    await expect(page).toHaveTitle('Provider Portal – My Car Concierge');
    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toBeAttached();
    const brandIcon = page.locator('.sidebar-brand-icon');
    await expect(brandIcon).toBeAttached();
    const themeToggle = page.locator('#theme-toggle-btn');
    await expect(themeToggle).toBeAttached();
  });

  test('overview nav item is active by default', async ({ page }) => {
    await setupProviderPage(page);

    const overviewNav = page.locator('.nav-item[data-section="overview"]');
    await expect(overviewNav).toBeAttached();
    await expect(overviewNav).toHaveClass(/active/);
  });

  test('all key nav sections exist in page HTML', async ({ page }) => {
    await setupProviderPage(page);

    const sections = [
      'overview', 'subscription', 'browse', 'bids', 'jobs',
      'refund-requests', 'emergencies', 'fleet-services',
      'customer-queue', 'earnings', 'earnings-analytics',
      'reviews', 'performance', 'analytics', 'messages',
      'notifications', 'profile', 'team', 'background-checks',
      'refer-providers', 'loyalty-network'
    ];

    const pageContent = await page.content();
    for (const section of sections) {
      expect(pageContent).toContain(`data-section="${section}"`);
    }
  });
});

test.describe('Provider Dashboard - Sections', () => {
  test('overview section is active and key sections exist', async ({ page }) => {
    await setupProviderPage(page);

    const overview = page.locator('#overview');
    await expect(overview).toBeAttached();
    await expect(overview).toHaveClass(/active/);

    const pageContent = await page.content();
    const sectionIds = ['browse', 'bids', 'jobs', 'earnings', 'profile'];
    for (const id of sectionIds) {
      expect(pageContent).toContain(`id="${id}"`);
    }
  });
});

test.describe('Provider Dashboard - Provider-Specific Elements', () => {
  test('provider badges exist', async ({ page }) => {
    await setupProviderPage(page);

    const openCount = page.locator('#open-count');
    await expect(openCount).toBeAttached();
    const refundCount = page.locator('#refund-count');
    await expect(refundCount).toBeAttached();
    const emergencyCount = page.locator('#emergency-count');
    await expect(emergencyCount).toBeAttached();
  });
});

test.describe('Provider Dashboard - Sidebar Footer', () => {
  test('sidebar footer exists with logout button', async ({ page }) => {
    await setupProviderPage(page);

    const sidebarFooter = page.locator('.sidebar-footer');
    await expect(sidebarFooter).toBeAttached();

    const pageContent = await page.content();
    expect(pageContent).toContain('Log Out');
  });
});

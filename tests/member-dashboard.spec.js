const { test, expect } = require('@playwright/test');

const FAKE_USER_ID = '00000000-aaaa-bbbb-cccc-000000000001';
const FAKE_EMAIL = 'testuser@example.com';

async function mockSupabaseAuth(page) {
  await page.route('**/auth/v1/user', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: FAKE_USER_ID,
        email: FAKE_EMAIL,
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: 'Test User' }
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
          id: FAKE_USER_ID,
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
        id: FAKE_USER_ID,
        full_name: 'Test User',
        email: FAKE_EMAIL,
        role: 'member',
        zip_code: '10001',
        phone: '5551234567'
      }])
    });
  });

  await page.route('**/rest/v1/vehicles**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/rest/v1/maintenance_packages**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/rest/v1/service_reminders**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/rest/v1/upsell_requests**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/rest/v1/service_history**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/rest/v1/destination_services**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/rest/v1/recommendations**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/rest/v1/notifications**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/rest/v1/payments**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/rest/v1/split_participants**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/rest/v1/tos_acceptance**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: '1', accepted_at: new Date().toISOString() }])
    });
  });

  await page.route('**/rest/v1/**', (route, request) => {
    if (!route.request().url().includes('auth/v1')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    } else {
      route.continue();
    }
  });

  await page.route('**/api/auth/check-access', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authorized: true })
    });
  });
}

async function setupMembersPage(page) {
  await mockSupabaseAuth(page);

  await page.addInitScript(() => {
    window.localStorage.setItem('sb-ifbyjxuaclwmadqbjcyp-auth-token', JSON.stringify({
      access_token: 'fake-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'fake-refresh-token',
      user: {
        id: '00000000-aaaa-bbbb-cccc-000000000001',
        email: 'testuser@example.com',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: 'Test User' }
      }
    }));
  });

  await page.goto('/members.html');
  await page.waitForLoadState('networkidle');
}

test.describe('Dashboard Structure', () => {
  test('page loads with title "My Garage – My Car Concierge"', async ({ page }) => {
    await setupMembersPage(page);
    await expect(page).toHaveTitle('My Garage – My Car Concierge');
  });

  test('sidebar exists (#sidebar)', async ({ page }) => {
    await setupMembersPage(page);
    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toBeAttached();
  });

  test('sidebar brand/logo exists (.sidebar-brand-icon)', async ({ page }) => {
    await setupMembersPage(page);
    const brandIcon = page.locator('.sidebar-brand-icon');
    await expect(brandIcon).toBeAttached();
  });

  test('theme toggle button exists (#theme-toggle-btn)', async ({ page }) => {
    await setupMembersPage(page);
    const themeToggle = page.locator('#theme-toggle-btn');
    await expect(themeToggle).toBeAttached();
  });

  test('language switcher exists (#language-switcher)', async ({ page }) => {
    await setupMembersPage(page);
    const langSwitcher = page.locator('#language-switcher');
    await expect(langSwitcher).toBeAttached();
  });
});

test.describe('Navigation Items', () => {
  test('overview nav item exists and is active by default', async ({ page }) => {
    await setupMembersPage(page);
    const overviewNav = page.locator('.nav-item[data-section="overview"]');
    await expect(overviewNav).toBeAttached();
    const isActive = await overviewNav.evaluate(el => el.classList.contains('active'));
    expect(isActive).toBe(true);
  });

  test('all navigation sections exist as nav items', async ({ page }) => {
    await setupMembersPage(page);
    const allSections = [
      'overview', 'vehicles', 'my-next-car', 'dream-car-finder', 'maintenance-schedule',
      'learn', 'household', 'fleet', 'reminders', 'referrals', 'packages', 'shop',
      'order-history', 'cost-estimator', 'upsells', 'messages', 'history',
      'spending-analytics', 'fuel-tracker', 'insurance', 'emergency',
      'notifications', 'settings', 'qr-checkin'
    ];
    for (const sectionId of allSections) {
      const navItem = page.locator(`.nav-item[data-section="${sectionId}"]`);
      await expect(navItem).toBeAttached();
    }
  });
});

test.describe('Sections', () => {
  test('overview section (#overview) is visible by default', async ({ page }) => {
    await setupMembersPage(page);
    const overview = page.locator('#overview');
    await expect(overview).toBeVisible();
  });

  test('overview section has class "active"', async ({ page }) => {
    await setupMembersPage(page);
    const overview = page.locator('#overview');
    await expect(overview).toBeAttached();
    const hasActive = await overview.evaluate(el => el.classList.contains('active'));
    expect(hasActive).toBe(true);
  });

  test('other sections exist but are not visible: vehicles', async ({ page }) => {
    await setupMembersPage(page);
    const section = page.locator('#vehicles');
    await expect(section).toBeAttached();
    await expect(section).not.toBeVisible();
  });

  test('other sections exist but are not visible: packages', async ({ page }) => {
    await setupMembersPage(page);
    const section = page.locator('#packages');
    await expect(section).toBeAttached();
    await expect(section).not.toBeVisible();
  });

  test('other sections exist but are not visible: settings', async ({ page }) => {
    await setupMembersPage(page);
    const section = page.locator('#settings');
    await expect(section).toBeAttached();
    await expect(section).not.toBeVisible();
  });

  test('other sections exist but are not visible: notifications', async ({ page }) => {
    await setupMembersPage(page);
    const section = page.locator('#notifications');
    await expect(section).toBeAttached();
    await expect(section).not.toBeVisible();
  });

  test('other sections exist but are not visible: shop', async ({ page }) => {
    await setupMembersPage(page);
    const section = page.locator('#shop');
    await expect(section).toBeAttached();
    await expect(section).not.toBeVisible();
  });
});

test.describe('Job Creation Form (within packages section)', () => {
  test('packages section exists (#packages)', async ({ page }) => {
    await setupMembersPage(page);
    const packages = page.locator('#packages');
    await expect(packages).toBeAttached();
  });
});

test.describe('Overview Stats', () => {
  test('overview section contains stat cards (.stat-card)', async ({ page }) => {
    await setupMembersPage(page);
    const statCards = page.locator('#overview .stat-card');
    const count = await statCards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Sidebar Footer', () => {
  test('sidebar footer exists (.sidebar-footer)', async ({ page }) => {
    await setupMembersPage(page);
    const footer = page.locator('.sidebar-footer');
    await expect(footer).toBeAttached();
  });

  test('contains sign out functionality', async ({ page }) => {
    await setupMembersPage(page);
    const logoutBtn = page.locator('.sidebar-footer button:has-text("Log Out"), .sidebar-footer button:has-text("Sign Out"), .sidebar-footer [onclick*="logout"]');
    await expect(logoutBtn.first()).toBeAttached();
  });
});

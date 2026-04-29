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

  await page.route('**/auth/v1/session', route => {
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
}

async function setupCarClubProviderPage(page, { clubExists = false } = {}) {
  await mockProviderAuth(page);

  if (clubExists) {
    await page.route('**/api/car-club/my-club', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          club: {
            id: 'club-001',
            provider_id: FAKE_PROVIDER_ID,
            name: 'Test Auto Rewards',
            description: 'Loyalty rewards for our best customers',
            welcome_message: 'Welcome to our club!',
            is_active: true,
            provider_suspended: false,
            created_at: '2026-01-15T00:00:00Z',
            reward_rules: [],
            member_count: 5
          }
        })
      });
    });
  } else {
    await page.route('**/api/car-club/my-club', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ club: null })
      });
    });
  }

  await page.route('**/api/car-club/reward-templates', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ templates: [] })
    });
  });

  await page.route('**/api/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authorized: true, verified: true, connected: false, status: 'clear' })
    });
  });

  await page.addInitScript(() => {
    globalThis.localStorage.setItem('sb-ifbyjxuaclwmadqbjcyp-auth-token', JSON.stringify({
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

  await page.goto('/car-club-provider.html');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
}

async function setupCarClubMemberPage(page) {
  await mockProviderAuth(page);

  await page.route('**/api/car-club/browse', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        clubs: [{
          id: 'club-001',
          provider_id: 'provider-001',
          name: 'Best Auto Rewards',
          description: 'Great loyalty program',
          member_count: 12,
          reward_count: 2
        }]
      })
    });
  });

  await page.route('**/api/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authorized: true, verified: true, connected: false, status: 'clear' })
    });
  });

  await page.addInitScript(() => {
    globalThis.localStorage.setItem('sb-ifbyjxuaclwmadqbjcyp-auth-token', JSON.stringify({
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

  await page.goto('/car-club-member.html');
  await page.waitForLoadState('domcontentloaded');
}

async function setupProviderDashboard(page) {
  await mockProviderAuth(page);

  await page.route('**/api/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authorized: true, verified: true, connected: false, status: 'clear' })
    });
  });

  await page.addInitScript(() => {
    globalThis.localStorage.setItem('sb-ifbyjxuaclwmadqbjcyp-auth-token', JSON.stringify({
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

  await page.goto('/providers.html', { waitUntil: 'networkidle' });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
}

test.describe('Car Club Provider Page - No Club Exists', () => {
  test('page loads without redirecting to login', async ({ page }) => {
    await setupCarClubProviderPage(page, { clubExists: false });

    await expect(page).toHaveTitle('Car Club Management – My Car Concierge');
    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toBeAttached();
  });

  test('shows Create Car Club form when no club exists', async ({ page }) => {
    await setupCarClubProviderPage(page, { clubExists: false });

    const createSection = page.locator('#setup-create');
    await expect(createSection).toBeAttached();
    const pageContent = await page.content();
    expect(pageContent).toContain('Create Your Car Club');
    expect(pageContent).toContain('create-name');
    expect(pageContent).toContain('create-description');
    expect(pageContent).toContain('create-btn');
  });

  test('has proper nav sidebar with all sections', async ({ page }) => {
    await setupCarClubProviderPage(page, { clubExists: false });

    const pageContent = await page.content();
    expect(pageContent).toContain('Club Setup');
    expect(pageContent).toContain('Reward Rules');
    expect(pageContent).toContain('Members');
    expect(pageContent).toContain('Activity Log');
    expect(pageContent).toContain('Free Bids');
  });

  test('theme toggle button exists', async ({ page }) => {
    await setupCarClubProviderPage(page, { clubExists: false });

    const themeToggle = page.locator('.theme-toggle-btn');
    await expect(themeToggle).toBeAttached();
    const pageContent = await page.content();
    expect(pageContent).toContain('Toggle Theme');
  });
});

test.describe('Car Club Provider Page - Club Exists', () => {
  test('shows club management UI when club exists', async ({ page }) => {
    await setupCarClubProviderPage(page, { clubExists: true });

    const editSection = page.locator('#setup-edit');
    await expect(editSection).toBeAttached();
    const pageContent = await page.content();
    expect(pageContent).toContain('Club Settings');
    expect(pageContent).toContain('edit-name');
    expect(pageContent).toContain('edit-description');
    expect(pageContent).toContain('save-btn');
  });

  test('page title is correct', async ({ page }) => {
    await setupCarClubProviderPage(page, { clubExists: true });

    await expect(page).toHaveTitle('Car Club Management – My Car Concierge');
  });
});

test.describe('Car Club Member Page', () => {
  test('page loads and has correct title', async ({ page }) => {
    await setupCarClubMemberPage(page);

    await expect(page).toHaveTitle('Car Club – My Car Concierge');
  });

  test('page loads and shows available clubs section', async ({ page }) => {
    await setupCarClubMemberPage(page);

    const pageContent = await page.content();
    expect(pageContent).toContain('Car Club');
  });
});

test.describe('Car Club API - Authentication Required', () => {
  test('GET /api/car-club/reward-templates returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/car-club/reward-templates');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('GET /api/car-club/my-club returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/car-club/my-club');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('POST /api/car-club/create returns 401 without auth', async ({ request }) => {
    const response = await request.post('/api/car-club/create', {
      data: { name: 'Test Club' }
    });
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });
});

test.describe('Car Club in Provider Dashboard', () => {
  test('providers.html contains Car Club nav markup', async ({ request }) => {
    const response = await request.get('/providers.html');
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('data-section="car-club"');
    expect(html).toContain('Car Club');
  });

  test('providers.html contains Car Club dashboard card', async ({ request }) => {
    const response = await request.get('/providers.html');
    const html = await response.text();
    expect(html).toContain('car-club-dashboard-card');
    expect(html).toContain('car-club-card-content');
  });

  test('providers.html contains Launch Car Club link', async ({ request }) => {
    const response = await request.get('/providers.html');
    const html = await response.text();
    expect(html).toContain('Launch Car Club');
    expect(html).toContain('car-club-provider.html');
  });
});

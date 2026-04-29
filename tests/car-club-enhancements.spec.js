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
            logo_url: 'https://example.com/test-logo.png',
            created_at: '2026-01-15T00:00:00Z',
            reward_rules: [{
              id: 'rule-001',
              club_id: 'club-001',
              template_id: 'tmpl-001',
              name: 'Oil Change Punch Card',
              description: 'Get 10 punches for a free oil change',
              parameters: { punches_required: 10, reward_description: 'Free oil change' },
              is_active: true,
              valid_until: '2026-12-31T23:59:59Z',
              template_slug: 'punch_card',
              template_icon: '🛢️'
            }],
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

  await page.route('**/api/car-club/leaderboard', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ leaderboard: [] })
    });
  });

  await page.route('**/api/car-club/promotions', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ promotions: [] })
    });
  });

  await page.route('**/api/car-club/analytics', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ analytics: {} })
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

  await page.route('**/api/car-club/my-clubs', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clubs: [] })
    });
  });

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
          logo_url: 'https://example.com/club-logo.png',
          member_count: 12,
          reward_count: 2
        }]
      })
    });
  });

  await page.route('**/api/car-club/testimonials**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ testimonials: [], average_rating: 0, count: 0 })
    });
  });

  await page.route('**/api/car-club/recommended', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clubs: [] })
    });
  });

  await page.route('**/api/car-club/active-promotions**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ promotions: [] })
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

  await page.goto('/car-club-member.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const currentUrl = page.url();
  if (currentUrl.includes('login') || currentUrl.includes('members.html')) {
    await page.route('**/*', route => route.continue());
    await page.goto('/car-club-member.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
  }
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

test.describe('How It Works Guide - Provider', () => {
  test('how-it-works toggle button exists on provider page', async ({ page }) => {
    await setupCarClubProviderPage(page, { clubExists: true });
    const toggle = page.locator('.how-it-works-toggle');
    await expect(toggle).toBeAttached();
  });

  test('clicking toggle reveals guide content', async ({ page }) => {
    await setupCarClubProviderPage(page, { clubExists: true });
    await page.waitForTimeout(1000);
    const toggle = page.locator('.how-it-works-toggle');
    await toggle.click();
    const body = page.locator('#howItWorksBody');
    await expect(body).toHaveClass(/open/);
  });

  test('guide contains provider key sections', async ({ page }) => {
    await setupCarClubProviderPage(page, { clubExists: true });
    await page.waitForTimeout(1000);
    await page.locator('.how-it-works-toggle').click();
    const content = await page.content();
    expect(content).toContain('How Your Club Works');
    expect(content).toContain('Setting Up Rewards');
    expect(content).toContain('What Members See');
    expect(content).toContain('Tips for Success');
  });
});

test.describe('How It Works Guide - Member', () => {
  test('member page HTML contains how-it-works guide markup', async ({ request }) => {
    const response = await request.get('/car-club-member.html');
    const html = await response.text();
    expect(html).toContain('how-it-works-toggle');
    expect(html).toContain('howItWorksBody');
    expect(html).toContain('toggleHowItWorks');
  });

  test('member guide contains key sections in HTML', async ({ request }) => {
    const response = await request.get('/car-club-member.html');
    const html = await response.text();
    expect(html).toContain('How to Join');
    expect(html).toContain('Earning Punches');
    expect(html).toContain('Tracking Progress');
    expect(html).toContain('Redeeming Rewards');
  });
});

test.describe('Club Branding (Logo)', () => {
  test('logo URL input field exists in provider club setup', async ({ page }) => {
    await setupCarClubProviderPage(page, { clubExists: true });
    await page.waitForTimeout(1000);
    const logoInput = page.locator('#edit-logo-url');
    await expect(logoInput).toBeAttached();
  });

  test('logo preview appears when club has logo_url', async ({ page }) => {
    await setupCarClubProviderPage(page, { clubExists: true });
    await page.waitForTimeout(1000);
    const logoPreview = page.locator('#logo-preview');
    await expect(logoPreview).toBeAttached();
  });

  test('member page browse markup supports logo display', async ({ request }) => {
    const response = await request.get('/car-club-member.html');
    const html = await response.text();
    expect(html).toContain('logo_url');
  });
});

test.describe('Reward Progress Notifications', () => {
  test('GET /api/car-club/notifications returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/car-club/notifications');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('notification section exists in member page HTML', async ({ request }) => {
    const response = await request.get('/car-club-member.html');
    const html = await response.text();
    expect(html).toContain('section-notifications');
    expect(html).toContain('notif-content');
  });
});

test.describe('Club Stats Card on Provider Dashboard', () => {
  test('providers.html contains car-club-dashboard-card element', async ({ request }) => {
    const response = await request.get('/providers.html');
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('car-club-dashboard-card');
  });

  test('providers.html contains car-club-card-content div', async ({ request }) => {
    const response = await request.get('/providers.html');
    const html = await response.text();
    expect(html).toContain('car-club-card-content');
  });
});

test.describe('Member Testimonials', () => {
  test('GET /api/car-club/testimonials?club_id=test returns 200', async ({ request }) => {
    const response = await request.get('/api/car-club/testimonials?club_id=test');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.testimonials)).toBeTruthy();
  });

  test('POST /api/car-club/testimonials returns 401 without auth', async ({ request }) => {
    const response = await request.post('/api/car-club/testimonials', {
      data: { club_id: 'test', rating: 5, text: 'Great club' }
    });
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('member page browse view has testimonial elements in markup', async ({ request }) => {
    const response = await request.get('/car-club-member.html');
    const html = await response.text();
    expect(html).toContain('testimonial');
  });
});

test.describe('Reward Expiration', () => {
  test('reward modal contains expiration date input', async ({ page }) => {
    await setupCarClubProviderPage(page, { clubExists: true });
    await page.waitForTimeout(1000);
    const expirationInput = page.locator('#reward-expiration');
    await expect(expirationInput).toBeAttached();
  });

  test('provider page markup supports valid_until field', async ({ request }) => {
    const response = await request.get('/car-club-provider.html');
    const html = await response.text();
    expect(html).toContain('reward-expiration');
    expect(html).toContain('Expiration');
  });
});

test.describe('Club Leaderboard', () => {
  test('provider sidebar contains Leaderboard nav item', async ({ page }) => {
    await setupCarClubProviderPage(page, { clubExists: true });
    const content = await page.content();
    expect(content).toContain('Leaderboard');
  });

  test('section-leaderboard element exists', async ({ page }) => {
    await setupCarClubProviderPage(page, { clubExists: true });
    const section = page.locator('#section-leaderboard');
    await expect(section).toBeAttached();
  });

  test('GET /api/car-club/leaderboard returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/car-club/leaderboard');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('clicking leaderboard nav shows leaderboard section', async ({ page }) => {
    await setupCarClubProviderPage(page, { clubExists: true });
    await page.waitForTimeout(1000);
    const navItems = page.locator('.nav-item');
    await navItems.nth(5).click();
    const section = page.locator('#section-leaderboard');
    await expect(section).toHaveClass(/active/);
  });
});

test.describe('Special Promotions', () => {
  test('provider sidebar contains Promotions nav item', async ({ page }) => {
    await setupCarClubProviderPage(page, { clubExists: true });
    const content = await page.content();
    expect(content).toContain('Promotions');
  });

  test('section-promotions element exists', async ({ page }) => {
    await setupCarClubProviderPage(page, { clubExists: true });
    const section = page.locator('#section-promotions');
    await expect(section).toBeAttached();
  });

  test('GET /api/car-club/promotions returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/car-club/promotions');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('POST /api/car-club/promotions returns 401 without auth', async ({ request }) => {
    const response = await request.post('/api/car-club/promotions', {
      data: { name: 'Test Promo' }
    });
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('GET /api/car-club/active-promotions returns 200', async ({ request }) => {
    const response = await request.get('/api/car-club/active-promotions?club_id=nonexistent');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.promotions)).toBeTruthy();
  });

  test('clicking promotions nav shows promotions section', async ({ page }) => {
    await setupCarClubProviderPage(page, { clubExists: true });
    await page.waitForTimeout(1000);
    const navItems = page.locator('.nav-item');
    await navItems.nth(6).click();
    const section = page.locator('#section-promotions');
    await expect(section).toHaveClass(/active/);
  });
});

test.describe('Cross-Club Discovery', () => {
  test('GET /api/car-club/recommended returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/car-club/recommended');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('member page HTML has recommended section markup', async ({ request }) => {
    const response = await request.get('/car-club-member.html');
    const html = await response.text();
    expect(html).toContain('recommended');
    expect(html).toContain('loadBrowse');
  });
});

test.describe('Analytics Dashboard', () => {
  test('provider sidebar contains Analytics nav item', async ({ page }) => {
    await setupCarClubProviderPage(page, { clubExists: true });
    const content = await page.content();
    expect(content).toContain('Analytics');
  });

  test('section-analytics element exists', async ({ page }) => {
    await setupCarClubProviderPage(page, { clubExists: true });
    const section = page.locator('#section-analytics');
    await expect(section).toBeAttached();
  });

  test('GET /api/car-club/analytics returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/car-club/analytics');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('clicking analytics nav shows analytics section', async ({ page }) => {
    await setupCarClubProviderPage(page, { clubExists: true });
    await page.waitForTimeout(1000);
    const navItems = page.locator('.nav-item');
    await navItems.nth(7).click();
    const section = page.locator('#section-analytics');
    await expect(section).toHaveClass(/active/);
  });
});

test.describe('API Endpoint Smoke Tests - Auth Required', () => {
  test('GET /api/car-club/leaderboard returns 401', async ({ request }) => {
    const response = await request.get('/api/car-club/leaderboard');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('GET /api/car-club/analytics returns 401', async ({ request }) => {
    const response = await request.get('/api/car-club/analytics');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('GET /api/car-club/promotions returns 401', async ({ request }) => {
    const response = await request.get('/api/car-club/promotions');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('POST /api/car-club/promotions returns 401', async ({ request }) => {
    const response = await request.post('/api/car-club/promotions', {
      data: { name: 'Test' }
    });
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('GET /api/car-club/recommended returns 401', async ({ request }) => {
    const response = await request.get('/api/car-club/recommended');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('POST /api/car-club/testimonials returns 401', async ({ request }) => {
    const response = await request.post('/api/car-club/testimonials', {
      data: { club_id: 'test', rating: 5 }
    });
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('GET /api/car-club/my-testimonials returns 401', async ({ request }) => {
    const response = await request.get('/api/car-club/my-testimonials');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });
});

test.describe('API Endpoint Smoke Tests - Public Endpoints', () => {
  test('GET /api/car-club/browse returns 200', async ({ request }) => {
    const response = await request.get('/api/car-club/browse');
    expect(response.status()).toBe(200);
  });

  test('GET /api/car-club/testimonials?club_id=nonexistent returns 200 with empty array', async ({ request }) => {
    const response = await request.get('/api/car-club/testimonials?club_id=nonexistent');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.testimonials)).toBeTruthy();
    expect(body.testimonials.length).toBe(0);
  });

  test('GET /api/car-club/active-promotions?club_id=nonexistent returns 200 with empty array', async ({ request }) => {
    const response = await request.get('/api/car-club/active-promotions?club_id=nonexistent');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.promotions)).toBeTruthy();
    expect(body.promotions.length).toBe(0);
  });
});

test.describe('Navigation Tests - Provider', () => {
  test('provider page has all 10 nav items', async ({ page }) => {
    await setupCarClubProviderPage(page, { clubExists: true });
    const navItems = page.locator('.nav-item');
    await expect(navItems).toHaveCount(10);
    const content = await page.content();
    expect(content).toContain('Club Setup');
    expect(content).toContain('Reward Rules');
    expect(content).toContain('Members');
    expect(content).toContain('Activity Log');
    expect(content).toContain('Free Bids');
    expect(content).toContain('Leaderboard');
    expect(content).toContain('Promotions');
    expect(content).toContain('Store');
    expect(content).toContain('Orders');
    expect(content).toContain('Analytics');
  });
});

test.describe('Navigation Tests - Member', () => {
  test('member page HTML has all 7 nav items', async ({ request }) => {
    const response = await request.get('/car-club-member.html');
    const html = await response.text();
    expect(html).toContain('My Clubs');
    expect(html).toContain('Browse Clubs');
    expect(html).toContain('My Rewards');
    expect(html).toContain('Activity');
    expect(html).toContain('Notifications');
    expect(html).toContain('Club Stores');
    expect(html).toContain('My Orders');
    const navItemCount = (html.match(/class="nav-item/g) || []).length;
    expect(navItemCount).toBe(7);
  });
});

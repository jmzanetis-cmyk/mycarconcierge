const { test, expect } = require('@playwright/test');

const MOCK_VERIFIED_PROVIDER = {
  business_name: 'Test Verified Auto',
  city: 'Chicago',
  state: 'IL',
  description: 'Certified shop with background verification',
  services: ['maintenance'],
  certifications: ['ASE'],
  slug: 'test-verified-auto',
  avatar_url: null,
  years_in_business: 8,
  emergency_enabled: false,
  avg_rating: '4.9',
  review_count: 25,
  background_verified: true,
  background_check_status: 'cleared'
};

const MOCK_PENDING_PROVIDER = {
  business_name: 'Test Pending Auto',
  city: 'Chicago',
  state: 'IL',
  description: 'Shop with pending background check',
  services: ['detailing'],
  certifications: [],
  slug: 'test-pending-auto',
  avatar_url: null,
  years_in_business: 2,
  emergency_enabled: false,
  avg_rating: '4.2',
  review_count: 5,
  background_verified: false,
  background_check_status: 'pending'
};

const MOCK_NO_CHECK_PROVIDER = {
  business_name: 'No Check Auto',
  city: 'Denver',
  state: 'CO',
  description: 'No background check data',
  services: ['maintenance'],
  certifications: [],
  slug: 'no-check-auto',
  avatar_url: null,
  years_in_business: 1,
  emergency_enabled: false,
  avg_rating: null,
  review_count: 0,
  background_verified: false,
  background_check_status: null
};

function mockDirectoryList(providers) {
  return JSON.stringify({
    providers,
    total: providers.length,
    page: 1,
    limit: 24
  });
}

function mockSingleProvider(provider) {
  return JSON.stringify({
    ...provider,
    completed_jobs: 100,
    reviews: [],
    gallery: [],
    member_since: '2024-01-01T00:00:00Z',
    is_24_seven: false,
    can_tow: false
  });
}

test.describe('Background Check Badge — CSS Classes', () => {
  test('shared-styles.css contains .bgc-badge-verified class', async ({ request }) => {
    const res = await request.get('/shared-styles.css');
    expect(res.status()).toBe(200);
    const css = await res.text();
    expect(css).toContain('.bgc-badge-verified');
  });

  test('shared-styles.css contains .bgc-badge-pending class', async ({ request }) => {
    const res = await request.get('/shared-styles.css');
    const css = await res.text();
    expect(css).toContain('.bgc-badge-pending');
  });

  test('shared-styles.css contains .bgc-badge-lg modifier class', async ({ request }) => {
    const res = await request.get('/shared-styles.css');
    const css = await res.text();
    expect(css).toContain('.bgc-badge-lg');
  });

  test('.bgc-badge-verified svg uses stroke: currentColor !important', async ({ request }) => {
    const res = await request.get('/shared-styles.css');
    const css = await res.text();
    expect(css).toContain('.bgc-badge-verified svg');
    expect(css).toContain('stroke: currentColor !important');
  });

  test('.bgc-badge-pending svg rule exists', async ({ request }) => {
    const res = await request.get('/shared-styles.css');
    const css = await res.text();
    expect(css).toContain('.bgc-badge-pending svg');
  });

  test('light theme overrides exist for both badge types', async ({ request }) => {
    const res = await request.get('/shared-styles.css');
    const css = await res.text();
    expect(css).toContain('[data-theme="light"] .bgc-badge-verified');
    expect(css).toContain('[data-theme="light"] .bgc-badge-pending');
  });
});

test.describe('Background Check Badge — Directory API', () => {
  test('GET /api/directory/providers includes background_verified and background_check_status', async ({ request }) => {
    const res = await request.get('/api/directory/providers');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('providers');
    expect(Array.isArray(body.providers)).toBe(true);
    for (const p of body.providers) {
      expect(p).toHaveProperty('background_verified');
      expect(p).toHaveProperty('background_check_status');
      expect(typeof p.background_verified).toBe('boolean');
    }
  });

  test('background_verified is true only for cleared/clear/eligible statuses', async ({ request }) => {
    const res = await request.get('/api/directory/providers');
    const body = await res.json();
    for (const p of (body.providers || [])) {
      if (p.background_verified) {
        expect(['cleared', 'clear', 'eligible']).toContain(p.background_check_status);
      }
      if (!p.background_check_status || !['cleared', 'clear', 'eligible'].includes(p.background_check_status)) {
        expect(p.background_verified).toBe(false);
      }
    }
  });
});

test.describe('Background Check Badge — Page Source Verification', () => {
  test('providers-directory.html contains badge rendering logic', async ({ request }) => {
    const res = await request.get('/providers-directory.html');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('bgc-badge-verified');
    expect(html).toContain('bgc-badge-pending');
    expect(html).toContain('Background Verified');
    expect(html).toContain('Check Pending');
    expect(html).toContain('p.background_verified');
  });

  test('providers-directory.html uses shield SVG for verified badge', async ({ request }) => {
    const res = await request.get('/providers-directory.html');
    const html = await res.text();
    expect(html).toContain('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z');
  });

  test('providers-directory.html uses clock SVG for pending badge', async ({ request }) => {
    const res = await request.get('/providers-directory.html');
    const html = await res.text();
    expect(html).toContain('M12 6v6l4 2');
  });

  test('p.html contains badge rendering logic with bgc-badge-lg', async ({ request }) => {
    const res = await request.get('/p.html');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('bgc-badge-verified');
    expect(html).toContain('bgc-badge-pending');
    expect(html).toContain('bgc-badge-lg');
    expect(html).toContain('Background Verified');
    expect(html).toContain('Check Pending');
  });

  test('car-club-member.html contains badge rendering logic', async ({ request }) => {
    const res = await request.get('/car-club-member.html');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('bgc-badge-verified');
    expect(html).toContain('bgc-badge-pending');
    expect(html).toContain('Background Verified');
    expect(html).toContain('Check Pending');
    expect(html).toContain('background_verified');
    expect(html).toContain('background_check_status');
  });

  test('car-club-member.html has badge in browse clubs rendering', async ({ request }) => {
    const res = await request.get('/car-club-member.html');
    const html = await res.text();
    const browseHasBadge = html.includes('club.background_verified') &&
                           html.includes('bgc-badge-verified') &&
                           html.includes('bgc-badge-pending');
    expect(browseHasBadge).toBe(true);
  });

  test('car-club-member.html has badge in my-clubs and recommended rendering', async ({ request }) => {
    const res = await request.get('/car-club-member.html');
    const html = await res.text();
    const bgcVerifiedCount = (html.match(/bgc-badge-verified/g) || []).length;
    const bgcPendingCount = (html.match(/bgc-badge-pending/g) || []).length;
    expect(bgcVerifiedCount).toBeGreaterThanOrEqual(3);
    expect(bgcPendingCount).toBeGreaterThanOrEqual(3);
  });

  test('car-club-member.html uses shield SVG for verified and clock SVG for pending', async ({ request }) => {
    const res = await request.get('/car-club-member.html');
    const html = await res.text();
    expect(html).toContain('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z');
    expect(html).toContain('M12 6v6l4 2');
  });
});

test.describe('Background Check Badge — Directory Page Rendering', () => {
  test('verified and pending badges render on directory page with mock data', async ({ page }) => {
    const apiResponse = page.waitForResponse(resp =>
      resp.url().includes('/api/directory/providers') && !resp.url().includes('/api/directory/providers/')
    );

    await page.route('**/api/directory/providers**', route => {
      const url = route.request().url();
      if (url.includes('/api/directory/providers/')) return route.continue();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: mockDirectoryList([MOCK_VERIFIED_PROVIDER, MOCK_PENDING_PROVIDER])
      });
    });

    await page.goto('/providers-directory.html');
    await apiResponse;

    const verifiedBadge = page.locator('.bgc-badge-verified');
    const pendingBadge = page.locator('.bgc-badge-pending');

    await expect(verifiedBadge.first()).toBeAttached({ timeout: 8000 });
    await expect(pendingBadge.first()).toBeAttached({ timeout: 5000 });

    const verifiedText = await verifiedBadge.first().textContent();
    expect(verifiedText.trim()).toContain('Background Verified');

    const pendingText = await pendingBadge.first().textContent();
    expect(pendingText.trim()).toContain('Check Pending');
  });

  test('verified badge contains SVG element', async ({ page }) => {
    await page.route('**/api/directory/providers**', route => {
      const url = route.request().url();
      if (url.includes('/api/directory/providers/')) return route.continue();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: mockDirectoryList([MOCK_VERIFIED_PROVIDER])
      });
    });

    await page.goto('/providers-directory.html');
    await page.waitForLoadState('domcontentloaded');

    const svg = page.locator('.bgc-badge-verified svg');
    await expect(svg.first()).toBeAttached({ timeout: 8000 });
  });

  test('no badge shown when background_check_status is null', async ({ page }) => {
    await page.route('**/api/directory/providers**', route => {
      const url = route.request().url();
      if (url.includes('/api/directory/providers/')) return route.continue();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: mockDirectoryList([MOCK_NO_CHECK_PROVIDER])
      });
    });

    await page.goto('/providers-directory.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    expect(await page.locator('.bgc-badge-verified').count()).toBe(0);
    expect(await page.locator('.bgc-badge-pending').count()).toBe(0);
  });
});

test.describe('Background Check Badge — Single Provider Page (p.html)', () => {
  test('verified badge with bgc-badge-lg renders on p.html', async ({ page }) => {
    await page.route(/\/api\/directory\/providers\//, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: mockSingleProvider(MOCK_VERIFIED_PROVIDER)
      });
    });

    await page.goto('/p/test-verified-auto');
    await page.waitForLoadState('domcontentloaded');

    const badge = page.locator('.bgc-badge-verified');
    await expect(badge.first()).toBeAttached({ timeout: 10000 });
    const text = await badge.first().textContent();
    expect(text.trim()).toContain('Background Verified');
    const hasLg = await badge.first().evaluate(el => el.classList.contains('bgc-badge-lg'));
    expect(hasLg).toBe(true);
  });

  test('pending badge with bgc-badge-lg renders on p.html', async ({ page }) => {
    await page.route(/\/api\/directory\/providers\//, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: mockSingleProvider(MOCK_PENDING_PROVIDER)
      });
    });

    await page.goto('/p/test-pending-auto');
    await page.waitForLoadState('domcontentloaded');

    const badge = page.locator('.bgc-badge-pending');
    await expect(badge.first()).toBeAttached({ timeout: 10000 });
    const text = await badge.first().textContent();
    expect(text.trim()).toContain('Check Pending');
    const hasLg = await badge.first().evaluate(el => el.classList.contains('bgc-badge-lg'));
    expect(hasLg).toBe(true);
  });

  test('no badge on p.html when background check status is null', async ({ page }) => {
    await page.route(/\/api\/directory\/providers\//, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: mockSingleProvider(MOCK_NO_CHECK_PROVIDER)
      });
    });

    await page.goto('/p/no-check-auto');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    expect(await page.locator('.bgc-badge-verified').count()).toBe(0);
    expect(await page.locator('.bgc-badge-pending').count()).toBe(0);
  });
});

test.describe('Background Check Badge — Theme Rendering', () => {
  test('verified badge visible in dark theme on directory page', async ({ page }) => {
    await page.route('**/api/directory/providers**', route => {
      const url = route.request().url();
      if (url.includes('/api/directory/providers/')) return route.continue();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: mockDirectoryList([MOCK_VERIFIED_PROVIDER])
      });
    });

    await page.goto('/providers-directory.html');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));

    const badge = page.locator('.bgc-badge-verified');
    await expect(badge.first()).toBeAttached({ timeout: 8000 });
    expect(await badge.first().isVisible()).toBe(true);
  });

  test('verified badge visible in light theme on directory page', async ({ page }) => {
    await page.route('**/api/directory/providers**', route => {
      const url = route.request().url();
      if (url.includes('/api/directory/providers/')) return route.continue();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: mockDirectoryList([MOCK_VERIFIED_PROVIDER])
      });
    });

    await page.goto('/providers-directory.html');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));

    const badge = page.locator('.bgc-badge-verified');
    await expect(badge.first()).toBeAttached({ timeout: 8000 });
    expect(await badge.first().isVisible()).toBe(true);
  });

  test('verified badge visible in both themes on p.html', async ({ page }) => {
    await page.route(/\/api\/directory\/providers\//, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: mockSingleProvider(MOCK_VERIFIED_PROVIDER)
      });
    });

    await page.goto('/p/test-verified-auto');
    await page.waitForLoadState('domcontentloaded');

    const badge = page.locator('.bgc-badge-verified');
    await expect(badge.first()).toBeAttached({ timeout: 10000 });

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    expect(await badge.first().isVisible()).toBe(true);

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    expect(await badge.first().isVisible()).toBe(true);
  });
});

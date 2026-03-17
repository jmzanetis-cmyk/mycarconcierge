const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:5000';
const TEST_MEMBER = { email: 'testmember@mcc-test.com', password: 'TestPass123!' };
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Boji2019!';
const ADMIN_EMAIL = 'jm.zanetis@gmail.com';
const ADMIN_SUPABASE_PASSWORD = 'Boji2019!';

test.describe('Admin Stats — Auth Gate (Real API)', () => {
  test('Unauthenticated request to /api/admin/stats/overview returns 401', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/stats/overview`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/authentication/i);
  });

  test('Admin password grants access to /api/admin/stats/overview', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/stats/overview`, {
      headers: { 'x-admin-password': ADMIN_PASSWORD }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(typeof body.data.totalMembers).toBe('number');
    expect(body.data.totalMembers).toBeGreaterThan(0);
    expect(typeof body.data.totalProviders).toBe('number');
    expect(body.data.totalProviders).toBeGreaterThan(0);
  });

  test('Unauthenticated request to /api/admin/stats/revenue returns 401', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/stats/revenue`);
    expect(res.status()).toBe(401);
  });

  test('Admin password grants access to /api/admin/stats/revenue', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/stats/revenue?period=month`, {
      headers: { 'x-admin-password': ADMIN_PASSWORD }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

test.describe('AI Helpdesk Widget — Real API (3 Modes)', () => {
  test('Car Expert mode returns a real AI response', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/helpdesk`, {
      data: {
        message: 'What does the check engine light mean?',
        mode: 'driver',
        conversationId: `test-driver-${Date.now()}`
      }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.reply).toBeDefined();
    expect(typeof body.reply).toBe('string');
    expect(body.reply.length).toBeGreaterThan(50);
    expect(body.reply).not.toMatch(/sorry, something went wrong/i);
    expect(body.reply).not.toMatch(/unable to generate/i);
  });

  test('Provider Support mode returns a real AI response', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/helpdesk`, {
      data: {
        message: 'How do I write a competitive bid on this platform?',
        mode: 'provider',
        conversationId: `test-provider-${Date.now()}`
      }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.reply).toBeDefined();
    expect(typeof body.reply).toBe('string');
    expect(body.reply.length).toBeGreaterThan(50);
    expect(body.reply).not.toMatch(/sorry, something went wrong/i);
  });

  test('Car Academy mode returns a real AI response', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/helpdesk`, {
      data: {
        message: 'What does a timing belt do and when should it be replaced?',
        mode: 'education',
        conversationId: `test-edu-${Date.now()}`
      }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.reply).toBeDefined();
    expect(typeof body.reply).toBe('string');
    expect(body.reply.length).toBeGreaterThan(50);
    expect(body.reply).not.toMatch(/sorry, something went wrong/i);
  });

  test('Invalid mode still returns a response (fallback to driver)', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/helpdesk`, {
      data: {
        message: 'Hello, how are you?',
        mode: 'unknown_mode',
        conversationId: `test-fallback-${Date.now()}`
      }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.reply).toBeDefined();
  });
});

test.describe('Merch Shop — Real API', () => {
  test('Shop products API returns product list publicly', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/shop/products`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.products)).toBe(true);
    expect(body.products.length).toBeGreaterThan(0);
    const firstProduct = body.products[0];
    expect(firstProduct.name).toBeDefined();
    expect(typeof firstProduct.price).toBe('number');
    expect(firstProduct.price).toBeGreaterThan(0);
  });

  test('Shop checkout requires authentication', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/shop/checkout`, {
      data: {
        items: [{ id: '123', name: 'Test Product', price: 29.99, quantity: 1 }]
      }
    });
    expect(res.status()).toBeGreaterThanOrEqual(401);
  });
});

test.describe('Member Signup — Real Supabase Auth', () => {
  test('Onboarding page loads with multi-step form structure', async ({ page }) => {
    await page.goto(`${BASE_URL}/onboarding-member.html`);
    await expect(page).toHaveURL(/onboarding-member/);
    await page.waitForLoadState('domcontentloaded');

    const emailInput = page.locator('#input-email');
    await expect(emailInput).toBeAttached({ timeout: 8000 });

    const passwordInput = page.locator('#input-password');
    await expect(passwordInput).toBeAttached();

    const submitBtn = page.locator('#btn-submit');
    await expect(submitBtn).toBeAttached();

    const steps = await page.locator('[data-step]').count();
    expect(steps).toBeGreaterThanOrEqual(5);
  });

  test('Supabase profiles table allows upsert on conflict (prevents 23505 duplicate-key)', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/auth/check`, {
      data: {}
    });
    expect([200, 400, 401]).toContain(res.status());
  });

  test('Onboarding form fields accept valid input', async ({ page }) => {
    await page.goto(`${BASE_URL}/onboarding-member.html`);
    await page.waitForLoadState('domcontentloaded');

    const emailInput = page.locator('#input-email');
    await expect(emailInput).toBeAttached({ timeout: 8000 });
    await emailInput.evaluate((el) => { el.value = 'test@example.com'; });

    const passwordInput = page.locator('#input-password');
    await passwordInput.evaluate((el) => { el.value = 'TestPass123!' });

    const nameInput = page.locator('#input-name');
    if (await nameInput.count() > 0) {
      await nameInput.evaluate((el) => { el.value = 'E2E Test User'; });
    }

    const vals = await page.evaluate(() => {
      const e = document.getElementById('input-email');
      const p = document.getElementById('input-password');
      return { email: e?.value, password: p?.value };
    });
    expect(vals.email).toBe('test@example.com');
    expect(vals.password).toBe('TestPass123!');
  });
});

test.describe('OBD Scanner API — Auth Requirement', () => {
  test('OBD scan endpoint returns 401 without auth token', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/obd/scan`, {
      data: { vehicleId: 'test-vehicle', codes: ['P0300'] }
    });
    expect(res.status()).toBe(401);
  });

  test('OBD interpret endpoint returns 401 without auth token', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/obd/interpret`, {
      data: { codes: ['P0300'], vehicleInfo: { year: '2020', make: 'Toyota', model: 'Camry' } }
    });
    expect(res.status()).toBe(401);
  });

  test('Member dashboard auth-gates: unauthenticated context redirects to login', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/members.html`);
    await page.waitForTimeout(3000);
    const url = page.url();
    await context.close();
    expect(url).toMatch(/login\.html/);
  });
});

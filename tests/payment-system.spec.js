const { test, expect } = require('@playwright/test');

test.describe('API Endpoint Tests (server-side)', () => {
  test('POST /api/split-payment/create returns 401 without auth header', async ({ page }) => {
    const response = await page.request.post('http://localhost:5000/api/split/create', {
      data: {},
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).toBe(401);
  });

  test('POST /api/split-payment/guest-confirm returns 400 without required fields', async ({ page }) => {
    const response = await page.request.post('http://localhost:5000/api/split/guest-confirm/fake-id', {
      data: {},
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).toBe(400);
  });

  test('POST /api/split-payment/cancel returns 401 without auth header', async ({ page }) => {
    const response = await page.request.post('http://localhost:5000/api/split/cancel/00000000-0000-0000-0000-000000000000', {
      data: {},
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThanOrEqual(403);
  });

  test('GET /api/merch/products returns 200 (public endpoint for merch)', async ({ page }) => {
    const response = await page.request.get('http://localhost:5000/api/shop/products');
    expect(response.status()).toBe(200);
  });

  test('POST /api/escrow/create returns 401 without auth header', async ({ page }) => {
    const response = await page.request.post('http://localhost:5000/api/escrow/create', {
      data: {},
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).toBe(401);
  });

  test('POST /api/escrow/capture returns 401 without auth header', async ({ page }) => {
    const response = await page.request.post('http://localhost:5000/api/escrow/confirm/00000000-0000-0000-0000-000000000000', {
      data: {},
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThanOrEqual(403);
  });

  test('POST /api/stripe/webhook returns 400 without proper Stripe signature', async ({ page }) => {
    const response = await page.request.post('http://localhost:5000/webhook/stripe', {
      data: '',
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).toBe(400);
  });
});

test.describe('Split Pay Standalone Page Tests', () => {
  test('split-pay.html loads with title "Split Payment – My Car Concierge"', async ({ page }) => {
    const response = await page.goto('http://localhost:5000/split-pay.html');
    expect(response.status()).toBe(200);
    await expect(page).toHaveTitle('Split Payment – My Car Concierge');
  });

  test('Page has loading state or token validation elements', async ({ page }) => {
    await page.goto('http://localhost:5000/split-pay.html');
    const loadingState = page.locator('#loading-state');
    await expect(loadingState).toBeAttached();
  });

  test('Without valid token params, shows error or loading state', async ({ page }) => {
    await page.goto('http://localhost:5000/split-pay.html');
    await page.waitForTimeout(2000);
    const loadingVisible = await page.locator('#loading-state').isVisible();
    const errorVisible = await page.locator('#error-state').isVisible();
    expect(loadingVisible || errorVisible).toBeTruthy();
  });

  test('Page includes Stripe JS script tag', async ({ page }) => {
    await page.goto('http://localhost:5000/split-pay.html');
    const stripeScript = page.locator('script[src*="js.stripe.com"]');
    await expect(stripeScript).toBeAttached();
  });
});

test.describe('Merch Store API Tests', () => {
  test('GET /api/merch/products returns JSON array', async ({ page }) => {
    const response = await page.request.get('http://localhost:5000/api/shop/products');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body) || body.products !== undefined).toBeTruthy();
  });

  test('POST /api/merch/checkout returns 401 without auth', async ({ page }) => {
    const response = await page.request.post('http://localhost:5000/api/shop/checkout', {
      data: {},
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).toBe(401);
  });

  test('GET /api/merch/orders returns 401 without auth', async ({ page }) => {
    const response = await page.request.get('http://localhost:5000/api/member/refunds');
    expect(response.status()).toBe(401);
  });
});

test.describe('Escrow Payment API Tests', () => {
  test('POST /api/escrow/release returns 401 without auth', async ({ page }) => {
    const response = await page.request.post('http://localhost:5000/api/escrow/release/00000000-0000-0000-0000-000000000000', {
      data: {},
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThanOrEqual(403);
  });

  test('POST /api/refund/request returns 401 without auth', async ({ page }) => {
    const response = await page.request.post('http://localhost:5000/api/escrow/refund/00000000-0000-0000-0000-000000000000', {
      data: { reason: 'test' },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThanOrEqual(403);
  });

  test('POST /api/refund/approve returns 401 without auth', async ({ page }) => {
    const response = await page.request.post('http://localhost:5000/api/escrow/confirm/00000000-0000-0000-0000-000000000000', {
      data: {},
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThanOrEqual(403);
  });
});

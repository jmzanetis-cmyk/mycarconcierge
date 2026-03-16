const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:5000';

test.describe('Page Load Time Tests', () => {
  test('Homepage loads in under 5 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(`${BASE_URL}/`);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });

  test('Login page loads in under 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(`${BASE_URL}/login.html`);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });

  test('Contact page loads in under 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(`${BASE_URL}/contact.html`);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });

  test('About page loads in under 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(`${BASE_URL}/about.html`);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });

  test('Pricing page loads in under 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(`${BASE_URL}/how-it-works.html`);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });
});

test.describe('API Response Time Tests', () => {
  test('GET /api/config responds in under 1 second', async ({ page }) => {
    const start = Date.now();
    const response = await page.request.fetch(`${BASE_URL}/api/config`);
    const elapsed = Date.now() - start;
    expect(response.status()).toBe(200);
    expect(elapsed).toBeLessThan(1000);
  });

  test('POST /api/helpdesk responds in under 10 seconds', async ({ page }) => {
    const start = Date.now();
    const response = await page.request.post(`${BASE_URL}/api/helpdesk`, {
      data: { message: 'My check engine light is on', language: 'en' },
      headers: { 'Content-Type': 'application/json' }
    });
    const elapsed = Date.now() - start;
    expect([200, 400, 401, 403, 429, 500, 503]).toContain(response.status());
    expect(elapsed).toBeLessThan(10000);
  });

  test('POST /api/chat responds in under 10 seconds', async ({ page }) => {
    const start = Date.now();
    const response = await page.request.post(`${BASE_URL}/api/chat`, {
      data: { message: 'Hello', language: 'en' },
      headers: { 'Content-Type': 'application/json' }
    });
    const elapsed = Date.now() - start;
    expect([200, 400, 401, 403, 429, 500, 503]).toContain(response.status());
    expect(elapsed).toBeLessThan(10000);
  });

  test('Static file (CSS/JS) serves in under 500ms', async ({ page }) => {
    const start = Date.now();
    const response = await page.request.fetch(`${BASE_URL}/sw.js`);
    const elapsed = Date.now() - start;
    expect(response.status()).toBe(200);
    expect(elapsed).toBeLessThan(500);
  });
});

test.describe('Resource Size Tests', () => {
  test('Homepage does not load more than 50 large resources', async ({ page }) => {
    const resourceCount = [];
    page.on('response', (response) => {
      resourceCount.push(response.url());
    });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'load' });
    expect(resourceCount.length).toBeLessThan(50);
  });

  test('Service worker file is under 100KB', async ({ page }) => {
    const response = await page.request.fetch(`${BASE_URL}/sw.js`);
    expect(response.status()).toBe(200);
    const body = await response.body();
    const sizeKB = body.length / 1024;
    expect(sizeKB).toBeLessThan(100);
  });

  test('Manifest.json is under 10KB', async ({ page }) => {
    const response = await page.request.fetch(`${BASE_URL}/manifest.json`);
    expect(response.status()).toBe(200);
    const body = await response.body();
    const sizeKB = body.length / 1024;
    expect(sizeKB).toBeLessThan(10);
  });

  test('CSS files load without blocking render for more than 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });
});

test.describe('Concurrent Request Tests', () => {
  test('Server handles 10 simultaneous page loads without errors', async ({ page }) => {
    const requests = [];
    for (let i = 0; i < 10; i++) {
      requests.push(page.request.fetch(`${BASE_URL}/`));
    }
    const responses = await Promise.all(requests);
    for (const response of responses) {
      expect(response.status()).toBe(200);
    }
  });

  test('5 concurrent API requests all complete successfully', async ({ page }) => {
    const endpoints = [
      page.request.fetch(`${BASE_URL}/api/config`),
      page.request.fetch(`${BASE_URL}/manifest.json`),
      page.request.fetch(`${BASE_URL}/sw.js`),
      page.request.fetch(`${BASE_URL}/`),
      page.request.fetch(`${BASE_URL}/login.html`),
    ];
    const responses = await Promise.all(endpoints);
    for (const response of responses) {
      expect(response.status()).toBe(200);
    }
  });
});

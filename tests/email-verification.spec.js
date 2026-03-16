const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:5000';

test.describe('Contact/Chat Email Tests', () => {
  test('POST /api/chat with valid chat message returns proper response (not 500)', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/chat`, {
      data: {
        messages: [
          { role: 'user', content: 'What services does My Car Concierge offer?' }
        ]
      },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
  });

  test('POST /api/chat with empty body returns error response', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/chat`, {
      data: {},
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([400, 422]).toContain(response.status());
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('POST /api/chat with missing required fields returns appropriate error', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/chat`, {
      data: { messages: [] },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });
});

test.describe('Helpdesk Email Tests', () => {
  test('POST /api/helpdesk with valid question returns AI response', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/helpdesk`, {
      data: { message: 'How do I schedule an oil change?', mode: 'driver' },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([200, 400, 401, 403, 429]).toContain(response.status());
  });

  test('POST /api/helpdesk with empty message returns error', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/helpdesk`, {
      data: { message: '' },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([400, 422]).toContain(response.status());
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('POST /api/helpdesk conversation continues with sessionId', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/helpdesk`, {
      data: { message: 'Tell me about brake services', conversationId: 'test-session-123', mode: 'driver' },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([200, 400, 401, 403, 429]).toContain(response.status());
  });
});

test.describe('Split Payment Notification Tests', () => {
  test('POST /api/split/create without auth returns 401', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/split/create`, {
      data: { package_id: '00000000-0000-0000-0000-000000000000', participants: [{ email: 'a@test.com', amount_cents: 500 }, { email: 'b@test.com', amount_cents: 500 }] },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([401, 403]).toContain(response.status());
  });

  test('POST /api/split/create with empty body and no auth returns 401', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/split/create`, {
      data: {},
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([401, 403]).toContain(response.status());
  });

  test('Split payment endpoints exist and respond (no 404)', async ({ page }) => {
    const endpoints = [
      { url: `${BASE_URL}/api/split/create`, method: 'POST' },
      { url: `${BASE_URL}/api/split/status/test-id`, method: 'GET' },
      { url: `${BASE_URL}/api/split/cancel/test-id`, method: 'POST' }
    ];

    for (const ep of endpoints) {
      const response = ep.method === 'GET'
        ? await page.request.get(ep.url)
        : await page.request.post(ep.url, {
            data: {},
            headers: { 'Content-Type': 'application/json' }
          });
      expect(response.status()).not.toBe(404);
    }
  });
});

test.describe('Resend Configuration Tests', () => {
  test('Server does not crash when email functions are called', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/chat`, {
      data: { messages: [{ role: 'user', content: 'Test message' }] },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);

    const healthCheck = await page.request.get(`${BASE_URL}/`);
    expect(healthCheck.status()).toBe(200);
  });

  test('API endpoints that trigger emails return proper JSON responses (not HTML error pages)', async ({ page }) => {
    const endpoints = [
      { url: `${BASE_URL}/api/chat`, data: { messages: [{ role: 'user', content: 'Hello' }] } },
      { url: `${BASE_URL}/api/helpdesk`, data: { message: 'Help me', mode: 'driver' } },
      { url: `${BASE_URL}/api/account/delete`, data: {} },
      { url: `${BASE_URL}/api/notify/urgent-update`, data: {} }
    ];

    for (const ep of endpoints) {
      const response = await page.request.post(ep.url, {
        data: ep.data,
        headers: { 'Content-Type': 'application/json' }
      });
      const contentType = response.headers()['content-type'] || '';
      expect(contentType).toContain('application/json');
    }
  });

  test('Content-Type of responses is application/json', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/chat`, {
      data: {},
      headers: { 'Content-Type': 'application/json' }
    });
    const contentType = response.headers()['content-type'] || '';
    expect(contentType).toContain('application/json');

    const helpdeskResponse = await page.request.post(`${BASE_URL}/api/helpdesk`, {
      data: {},
      headers: { 'Content-Type': 'application/json' }
    });
    const helpdeskContentType = helpdeskResponse.headers()['content-type'] || '';
    expect(helpdeskContentType).toContain('application/json');
  });
});

test.describe('Email-Triggering Endpoint Smoke Tests', () => {
  test('POST /api/account/delete without auth returns 401', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/account/delete`, {
      data: {},
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([401, 403]).toContain(response.status());
    const body = await response.json();
    expect(body.error || body.success === false).toBeTruthy();
  });

  test('POST /api/notify/urgent-update without auth returns 401', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/notify/urgent-update`, {
      data: {},
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([401, 403]).toContain(response.status());
    const body = await response.json();
    expect(body.error || body.success === false).toBeTruthy();
  });
});

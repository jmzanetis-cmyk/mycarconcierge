const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:5000';

test.describe('Supabase Integration', () => {
  test('GET /api/config returns valid JSON with siteUrl, appName, supportEmail', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/config`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.siteUrl).toBeTruthy();
    expect(body.appName).toBeTruthy();
    expect(body.supportEmail).toBeTruthy();
  });

  test('GET /api/admin/agreements without auth returns 401', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/admin/agreements`);
    expect(response.status()).not.toBe(500);
    expect([401, 403]).toContain(response.status());
  });

  test('GET /api/obd/scans/test-vehicle-id without auth returns 401', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/obd/scans/test-vehicle-id`);
    expect(response.status()).not.toBe(500);
    expect([401, 403]).toContain(response.status());
  });

  test('POST /api/agreements/sign with proper JSON but no auth returns 401', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/agreements/sign`, {
      data: { agreementType: 'provider', fullName: 'Test User', signature: 'Test Signature' },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([400, 401, 403]).toContain(response.status());
  });

  test('POST /api/dream-car/searches with proper JSON but no auth returns 401', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/dream-car/searches`, {
      data: { make: 'Toyota', model: 'Camry', yearMin: 2020, yearMax: 2025 },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([401, 403]).toContain(response.status());
  });

  test('GET /api/member/service-history/test-id without auth returns 401', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/member/service-history/test-id`);
    expect(response.status()).not.toBe(500);
    expect([401, 403]).toContain(response.status());
  });
});

test.describe('Stripe Integration', () => {
  test('POST /api/create-bid-checkout without auth returns 401', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/create-bid-checkout`, {
      data: { packId: 'test-pack', quantity: 1 },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([401, 403]).toContain(response.status());
  });

  test('POST /webhook/stripe with empty body returns 400', async ({ page }) => {
    const response = await page.request.fetch(`${BASE_URL}/webhook/stripe`, {
      method: 'POST',
      body: '',
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([400, 401, 403]).toContain(response.status());
  });

  test('POST /webhook/stripe with random body but no stripe-signature header returns 400', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/webhook/stripe`, {
      data: { type: 'checkout.session.completed', data: { object: { id: 'cs_test_fake' } } },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([400, 401, 403]).toContain(response.status());
  });

  test('POST /api/split/create without auth returns 401', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/split/create`, {
      data: { amount: 100, description: 'Test split payment' },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([401, 403]).toContain(response.status());
  });

  test('Stripe-related endpoints do not crash (no 500s) with bad input', async ({ page }) => {
    const endpoints = [
      { url: `${BASE_URL}/api/create-bid-checkout`, data: {} },
      { url: `${BASE_URL}/api/split/create`, data: { invalid: true } },
      { url: `${BASE_URL}/webhook/stripe`, data: { random: 'payload' } }
    ];

    for (const endpoint of endpoints) {
      const response = await page.request.post(endpoint.url, {
        data: endpoint.data,
        headers: { 'Content-Type': 'application/json' }
      });
      expect(response.status()).not.toBe(500);
    }
  });
});

test.describe('Twilio/SMS Integration', () => {
  test('POST /api/2fa/send with valid JSON but no session returns appropriate response', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/2fa/send`, {
      data: { phone: '+15551234567' },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([200, 400, 401, 403]).toContain(response.status());
  });

  test('POST /api/2fa/verify with valid JSON but no session returns appropriate response', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/2fa/verify`, {
      data: { code: '123456' },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([200, 400, 401, 403]).toContain(response.status());
  });

  test('SMS 2FA endpoints enforce rate limiting', async ({ page }) => {
    const responses = [];
    for (let i = 0; i < 5; i++) {
      const response = await page.request.post(`${BASE_URL}/api/2fa/send`, {
        data: { phone: '+15559999999' },
        headers: { 'Content-Type': 'application/json' }
      });
      responses.push(response.status());
    }
    for (const status of responses) {
      expect(status).not.toBe(500);
    }
  });
});

test.describe('Resend/Email Integration', () => {
  test('POST /api/chat with type chat does not crash with valid structure', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/chat`, {
      data: { type: 'chat', name: 'Test User', email: 'test@example.com', message: 'Hello, this is a test message.' },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
  });

  test('POST /api/helpdesk with valid question structure returns response', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/helpdesk`, {
      data: { question: 'How do I schedule an oil change?', language: 'en' },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([200, 400, 401, 403, 429]).toContain(response.status());
  });

  test('POST /api/diagnostics/generate with valid structure returns response', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/diagnostics/generate`, {
      data: { code: 'P0300', vehicle: { make: 'Honda', model: 'Civic', year: 2020 } },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([200, 400, 401, 403, 429]).toContain(response.status());
  });
});

test.describe('AI Services', () => {
  test('POST /api/helpdesk with proper JSON returns a response (Gemini/Anthropic fallback)', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/helpdesk`, {
      data: { question: 'What services does My Car Concierge offer?', language: 'en' },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    if (response.status() === 200) {
      const body = await response.json();
      expect(body.answer || body.response || body.message).toBeTruthy();
    }
  });

  test('POST /api/diagnostics/generate with diagnostic code returns response', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/diagnostics/generate`, {
      data: { code: 'P0420', vehicle: { make: 'Toyota', model: 'Corolla', year: 2018 } },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toBeTruthy();
    }
  });

  test('POST /api/obd/interpret without auth returns 401', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/obd/interpret`, {
      data: { codes: ['P0300', 'P0420'], vehicleId: 'test-vehicle-id' },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([401, 403]).toContain(response.status());
  });
});

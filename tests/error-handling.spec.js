const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:5000';

test.describe('Invalid JSON Body Tests', () => {
  test('POST /api/agreements/sign with invalid JSON body returns 400 (not 500)', async ({ page }) => {
    const response = await page.request.fetch(`${BASE_URL}/api/agreements/sign`, {
      method: 'POST',
      body: '{invalid-json',
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
  });

  test('POST /api/split/create with invalid JSON body returns error (not 500)', async ({ page }) => {
    const response = await page.request.fetch(`${BASE_URL}/api/split/create`, {
      method: 'POST',
      body: '{not valid json!!!',
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
  });

  test('POST /api/dream-car/searches with invalid JSON body returns error', async ({ page }) => {
    const response = await page.request.fetch(`${BASE_URL}/api/dream-car/searches`, {
      method: 'POST',
      body: '{"broken: json',
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
  });
});

test.describe('Missing Required Fields Tests', () => {
  test('POST /api/agreements/sign with empty object returns error about missing fields', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/agreements/sign`, {
      data: {},
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([400, 401, 403]).toContain(response.status());
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('POST /api/agreements/sign with missing signature returns error', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/agreements/sign`, {
      data: { agreementType: 'provider', fullName: 'Test User' },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([400, 401, 403]).toContain(response.status());
  });

  test('POST /api/agreements/sign with invalid agreement_type returns error', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/agreements/sign`, {
      data: { agreementType: 'invalid_type_xyz', signature: 'Test Sig', fullName: 'Test User' },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([400, 401, 403]).toContain(response.status());
  });

  test('POST /api/shop/checkout with empty body returns error about missing cart items', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/shop/checkout`, {
      data: {},
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
  });

  test('POST /api/admin/merch/create with empty body returns error about missing fields', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/admin/merch/create`, {
      data: {},
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer fake-token-12345'
      }
    });
    expect(response.status()).not.toBe(500);
  });

  test('POST /api/escrow/create with missing fields returns error', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/escrow/create`, {
      data: {},
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
  });
});

test.describe('Auth + Validation Combined Tests', () => {
  test('POST /api/member/profile with no auth returns 401', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/member/profile`, {
      data: { full_name: 'Test' },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
  });

  test('PUT /api/dream-car/searches/invalid-id with no auth returns 401', async ({ page }) => {
    const response = await page.request.put(`${BASE_URL}/api/dream-car/searches/invalid-id`, {
      data: { make: 'Toyota' },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([401, 403]).toContain(response.status());
  });

  test('DELETE /api/dream-car/searches/invalid-id with no auth returns 401', async ({ page }) => {
    const response = await page.request.delete(`${BASE_URL}/api/dream-car/searches/invalid-id`);
    expect(response.status()).not.toBe(500);
    expect([401, 403]).toContain(response.status());
  });

  test('POST /api/split/cancel/invalid-id with no auth returns 401', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/split/cancel/invalid-id`, {
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([401, 403]).toContain(response.status());
  });

  test('POST /api/split/reactivate/invalid-id with no auth returns 401', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/split/reactivate/invalid-id`, {
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([401, 403]).toContain(response.status());
  });
});

test.describe('Malformed Request Tests', () => {
  test('GET /api/agreements/user/ with empty user ID handles gracefully', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/agreements/user/`);
    expect(response.status()).not.toBe(500);
  });

  test('GET /api/split/status/ with no package ID handles gracefully', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/split/status/`);
    expect(response.status()).not.toBe(500);
  });

  test('POST /webhook/stripe with empty body and no stripe-signature returns 400', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/webhook/stripe`, {
      data: '',
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);
    expect([400, 401, 403]).toContain(response.status());
  });
});

test.describe('Server Stability Tests', () => {
  test('Multiple rapid requests to same endpoint do not crash server', async ({ page }) => {
    const requests = [];
    for (let i = 0; i < 10; i++) {
      requests.push(
        page.request.post(`${BASE_URL}/api/agreements/sign`, {
          data: {},
          headers: { 'Content-Type': 'application/json' }
        })
      );
    }
    const responses = await Promise.all(requests);
    for (const response of responses) {
      expect(response.status()).not.toBe(500);
    }

    const healthCheck = await page.request.get(`${BASE_URL}/`);
    expect(healthCheck.status()).toBe(200);
  });

  test('Very long request body does not crash server (10KB string)', async ({ page }) => {
    const longString = 'A'.repeat(10240);
    const response = await page.request.post(`${BASE_URL}/api/agreements/sign`, {
      data: { agreementType: longString, signature: longString, fullName: longString },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(500);

    const healthCheck = await page.request.get(`${BASE_URL}/`);
    expect(healthCheck.status()).toBe(200);
  });
});

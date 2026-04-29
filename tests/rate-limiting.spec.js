const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:5000';

test.describe('Rate Limit Header Tests', () => {
  test('API responses include X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/chat`, {
      data: { message: 'hello' },
      headers: { 'Content-Type': 'application/json' }
    });
    const headers = response.headers();
    expect(headers['x-ratelimit-limit']).toBeDefined();
    expect(headers['x-ratelimit-remaining']).toBeDefined();
    expect(headers['x-ratelimit-reset']).toBeDefined();
  });

  test('X-RateLimit-Remaining decreases with successive requests', async ({ page }) => {
    const response1 = await page.request.post(`${BASE_URL}/api/helpdesk`, {
      data: { message: 'test1' },
      headers: { 'Content-Type': 'application/json' }
    });
    const remaining1 = Number.parseInt(response1.headers()['x-ratelimit-remaining'], 10);

    const response2 = await page.request.post(`${BASE_URL}/api/helpdesk`, {
      data: { message: 'test2' },
      headers: { 'Content-Type': 'application/json' }
    });
    const remaining2 = Number.parseInt(response2.headers()['x-ratelimit-remaining'], 10);

    expect(remaining2).toBeLessThan(remaining1);
  });

  test('rate limit headers contain valid numeric values', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/agreements/sign`, {
      data: {},
      headers: { 'Content-Type': 'application/json' }
    });
    const headers = response.headers();
    const limit = Number.parseInt(headers['x-ratelimit-limit'], 10);
    const remaining = Number.parseInt(headers['x-ratelimit-remaining'], 10);
    const reset = Number.parseInt(headers['x-ratelimit-reset'], 10);

    expect(limit).toBeGreaterThan(0);
    expect(remaining).toBeGreaterThanOrEqual(0);
    expect(reset).toBeGreaterThan(0);
    expect(Number.isInteger(limit)).toBe(true);
    expect(Number.isInteger(remaining)).toBe(true);
    expect(Number.isInteger(reset)).toBe(true);
  });

  test('X-RateLimit-Limit matches the configured limit for the endpoint', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/chat`, {
      data: { message: 'test' },
      headers: { 'Content-Type': 'application/json' }
    });
    const limit = Number.parseInt(response.headers()['x-ratelimit-limit'], 10);
    expect(limit).toBe(30);
  });
});

test.describe('Admin Verify Rate Limit Tests', () => {
  test('sending 6 rapid requests to /api/verify-admin-password triggers 429', async ({ page }) => {
    let got429 = false;
    for (let i = 0; i < 6; i++) {
      const response = await page.request.post(`${BASE_URL}/api/verify-admin-password`, {
        data: { password: 'wrong-password' },
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.status() === 429) {
        got429 = true;
        break;
      }
    }
    expect(got429).toBe(true);
  });

  test('429 response includes Retry-After header', async ({ page }) => {
    let retryAfterHeader = null;
    for (let i = 0; i < 6; i++) {
      const response = await page.request.post(`${BASE_URL}/api/verify-admin-password`, {
        data: { password: 'wrong-password' },
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.status() === 429) {
        retryAfterHeader = response.headers()['retry-after'];
        break;
      }
    }
    expect(retryAfterHeader).toBeDefined();
    expect(Number.parseInt(retryAfterHeader, 10)).toBeGreaterThan(0);
  });

  test('429 response body has error message about rate limiting', async ({ page }) => {
    let errorBody = null;
    for (let i = 0; i < 6; i++) {
      const response = await page.request.post(`${BASE_URL}/api/verify-admin-password`, {
        data: { password: 'wrong-password' },
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.status() === 429) {
        errorBody = await response.json();
        break;
      }
    }
    expect(errorBody).not.toBeNull();
    expect(errorBody.error).toBe('Too many requests');
    expect(errorBody.message).toContain('Rate limit exceeded');
  });

  test('429 response body includes retryAfter field', async ({ page }) => {
    let errorBody = null;
    for (let i = 0; i < 6; i++) {
      const response = await page.request.post(`${BASE_URL}/api/verify-admin-password`, {
        data: { password: 'wrong-password' },
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.status() === 429) {
        errorBody = await response.json();
        break;
      }
    }
    expect(errorBody).not.toBeNull();
    expect(typeof errorBody.retryAfter).toBe('number');
    expect(errorBody.retryAfter).toBeGreaterThan(0);
  });
});

test.describe('Public Endpoint Rate Limit Tests', () => {
  test('POST /api/helpdesk does not return 429 on first few requests', async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      const response = await page.request.post(`${BASE_URL}/api/helpdesk`, {
        data: { message: `helpdesk test ${i}` },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(response.status()).not.toBe(429);
    }
  });

  test('POST /api/chat responds with rate limit headers', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/chat`, {
      data: { message: 'chat test' },
      headers: { 'Content-Type': 'application/json' }
    });
    const headers = response.headers();
    expect(headers['x-ratelimit-limit']).toBeDefined();
    expect(headers['x-ratelimit-remaining']).toBeDefined();
    expect(headers['x-ratelimit-reset']).toBeDefined();
  });

  test('POST /api/helpdesk has correct public rate limit of 30', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/helpdesk`, {
      data: { message: 'test' },
      headers: { 'Content-Type': 'application/json' }
    });
    const limit = Number.parseInt(response.headers()['x-ratelimit-limit'], 10);
    expect(limit).toBe(30);
  });
});

test.describe('API Auth Rate Limit Tests', () => {
  test('POST /api/agreements/sign includes rate limit headers', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/agreements/sign`, {
      data: { agreementType: 'provider', fullName: 'Test', signature: 'Test' },
      headers: { 'Content-Type': 'application/json' }
    });
    const headers = response.headers();
    expect(headers['x-ratelimit-limit']).toBeDefined();
    expect(headers['x-ratelimit-remaining']).toBeDefined();
    expect(headers['x-ratelimit-reset']).toBeDefined();
  });

  test('high-limit endpoint (100/min) does not trigger 429 on small batch of requests', async ({ page }) => {
    const responses = [];
    for (let i = 0; i < 5; i++) {
      const response = await page.request.post(`${BASE_URL}/api/agreements/sign`, {
        data: {},
        headers: { 'Content-Type': 'application/json' }
      });
      responses.push(response);
    }
    for (const response of responses) {
      expect(response.status()).not.toBe(429);
    }
  });

  test('POST /api/agreements/sign has correct apiAuth rate limit of 100', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/agreements/sign`, {
      data: {},
      headers: { 'Content-Type': 'application/json' }
    });
    const limit = Number.parseInt(response.headers()['x-ratelimit-limit'], 10);
    expect(limit).toBe(100);
  });
});

test.describe('Recovery Tests', () => {
  test('after hitting rate limit, Retry-After value is reasonable (< 60 seconds)', async ({ page }) => {
    let retryAfter = null;
    for (let i = 0; i < 6; i++) {
      const response = await page.request.post(`${BASE_URL}/api/verify-admin-password`, {
        data: { password: 'wrong' },
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.status() === 429) {
        retryAfter = Number.parseInt(response.headers()['retry-after'], 10);
        break;
      }
    }
    expect(retryAfter).not.toBeNull();
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  test('rate limited responses are valid JSON with error field', async ({ page }) => {
    let body = null;
    for (let i = 0; i < 6; i++) {
      const response = await page.request.post(`${BASE_URL}/api/verify-admin-password`, {
        data: { password: 'wrong' },
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.status() === 429) {
        const text = await response.text();
        body = JSON.parse(text);
        break;
      }
    }
    expect(body).not.toBeNull();
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('retryAfter');
    expect(body).toHaveProperty('message');
  });
});

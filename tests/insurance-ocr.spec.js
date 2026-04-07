'use strict';

const { test, expect } = require('@playwright/test');
const {
  BASE_URL, SUPABASE_SERVICE_KEY,
  TEST_MEMBER_EMAIL, TEST_MEMBER_PASS,
  getSupabaseAdmin, loginViaUI
} = require('./helpers');

test.describe('Insurance Card OCR — API extraction and review UI rendering', () => {
  test.skip(!SUPABASE_SERVICE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY');

  test('/api/insurance/extract — rejects unauthenticated requests', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/insurance/extract`, {
      data: { imageUrl: 'https://example.com/fake.jpg' }
    });
    expect(res.status()).toBeGreaterThanOrEqual(401);
  });

  test('/api/insurance/extract — rejects private/localhost URLs (SSRF guard)', async ({ request }) => {
    const sb = getSupabaseAdmin();
    const { data: authData } = await sb.auth.signInWithPassword({ email: TEST_MEMBER_EMAIL, password: TEST_MEMBER_PASS });
    const token = authData?.session?.access_token;
    test.skip(!token, 'Could not authenticate test member');

    const ssrfCases = [
      { url: 'http://127.0.0.1/etc/passwd', label: 'IPv4 loopback HTTP' },
      { url: 'https://[::1]/secret', label: 'IPv6 loopback literal' },
      { url: 'https://[fe80::1]/secret', label: 'IPv6 link-local literal' },
      { url: 'https://192.168.1.1/secret', label: 'RFC1918 private IPv4 literal' },
      { url: 'https://169.254.169.254/latest/meta-data/', label: 'AWS/GCP metadata IP' }
    ];

    for (const { url, label } of ssrfCases) {
      const res = await request.post(`${BASE_URL}/api/insurance/extract`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { imageUrl: url }
      });
      const body = await res.json().catch(() => ({}));
      expect(res.status(), `SSRF case "${label}" must return 400`).toBe(400);
      expect(body.success, `SSRF case "${label}" must have success:false`).toBe(false);
      expect(body.error, `SSRF case "${label}" must return error message`).toMatch(/invalid|disallowed/i);
    }
  });

  test('/api/insurance/extract — returns 200 with correct extracted field shape', async ({ request }) => {
    const sb = getSupabaseAdmin();
    const { data: authData } = await sb.auth.signInWithPassword({ email: TEST_MEMBER_EMAIL, password: TEST_MEMBER_PASS });
    const token = authData?.session?.access_token;
    test.skip(!token, 'Could not authenticate test member');

    const res = await request.post(`${BASE_URL}/api/insurance/extract`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { imageUrl: 'https://httpbin.org/image/png' },
      timeout: 40000
    });

    const body = await res.json().catch(() => null);

    if (res.status() === 500 && body?.error === 'OCR service not configured') {
      test.skip(true, 'GOOGLE_VISION_API_KEY not configured in this environment');
      return;
    }

    expect(res.status()).toBe(200);
    expect(body.success).toBe(true);
    expect(typeof body.extracted).toBe('object');
    expect('insurerName' in body.extracted).toBe(true);
    expect('policyNumber' in body.extracted).toBe(true);
    expect('expirationDate' in body.extracted).toBe(true);
    expect(typeof body.rawText).toBe('string');
  });

  test('Insurance card review UI: member triggers OCR flow and review form renders with extracted fields', async ({ page }) => {
    const FAKE_PUBLIC_URL = 'https://fake-supabase.co/storage/v1/object/public/insurance-documents/test.png';

    await loginViaUI(page, TEST_MEMBER_EMAIL, TEST_MEMBER_PASS, 'member');
    await page.waitForTimeout(2000);

    await page.route('**/api/insurance/extract', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          extracted: {
            insurerName: 'Test State Farm',
            policyNumber: 'POL-TEST-12345',
            expirationDate: '12/31/2026'
          }
        })
      });
    });

    await page.evaluate((fakeUrl) => {
      if (window.supabaseClient?.storage) {
        const originalFrom = window.supabaseClient.storage.from.bind(window.supabaseClient.storage);
        window.supabaseClient.storage.from = (bucket) => {
          if (bucket === 'insurance-documents') {
            return {
              upload: async () => ({ data: { path: 'test/insurance_test.png' }, error: null }),
              getPublicUrl: () => ({ data: { publicUrl: fakeUrl }, error: null })
            };
          }
          return originalFrom(bucket);
        };
      }
    }, FAKE_PUBLIC_URL);

    await page.evaluate(() => {
      if (typeof openInsuranceDocumentModal === 'function') {
        openInsuranceDocumentModal();
      } else {
        const btn = document.querySelector('[onclick*="openInsuranceDocumentModal"]');
        if (btn) btn.click();
      }
    });
    await page.waitForTimeout(1500);

    const statusContainer = page.locator('#insurance-extraction-status');
    await expect(statusContainer, '#insurance-extraction-status must exist in members.html').toBeAttached({ timeout: 8000 });

    await page.evaluate(() => {
      const fileInput = document.getElementById('insurance-file-input');
      if (fileInput) {
        const pngBytes = new Uint8Array([
          137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,
          0,0,0,1,0,0,0,1,8,2,0,0,0,144,119,83,222,0,0,0,
          12,73,68,65,84,8,215,99,248,15,0,0,1,1,0,5,24,213,
          78,0,0,0,0,73,69,78,68,174,66,96,130
        ]);
        const file = new File([pngBytes], 'insurance_test.png', { type: 'image/png' });
        const dt = new DataTransfer();
        dt.items.add(file);
        Object.defineProperty(fileInput, 'files', { value: dt.files, configurable: true });
      }
      const extractArea = document.getElementById('insurance-extract-area');
      if (extractArea) extractArea.style.display = 'block';
    });

    const extractBtn = page.locator('#insurance-extract-btn');
    await expect(extractBtn, '#insurance-extract-btn must be present').toBeAttached({ timeout: 5000 });
    await extractBtn.click({ force: true });
    await page.waitForTimeout(3000);

    const isVisible = await page.evaluate(() => {
      const el = document.getElementById('insurance-extraction-status');
      return el && el.style.display !== 'none' && el.style.display !== '';
    });
    expect(isVisible, '#insurance-extraction-status must be visible after OCR flow').toBe(true);

    const providerInput = page.locator('#ins-review-provider');
    const policyInput = page.locator('#ins-review-policy');
    const expiryInput = page.locator('#ins-review-expiration');
    const confirmBtn = page.locator('#ins-review-confirm');

    await expect(providerInput, '#ins-review-provider must exist').toBeAttached({ timeout: 5000 });
    await expect(policyInput, '#ins-review-policy must exist').toBeAttached({ timeout: 5000 });
    await expect(expiryInput, '#ins-review-expiration must exist').toBeAttached({ timeout: 5000 });
    await expect(confirmBtn, '#ins-review-confirm must exist').toBeAttached({ timeout: 5000 });

    expect(await providerInput.inputValue(), '#ins-review-provider pre-filled from OCR').toBe('Test State Farm');
    expect(await policyInput.inputValue(), '#ins-review-policy pre-filled from OCR').toBe('POL-TEST-12345');
    expect(await expiryInput.inputValue(), '#ins-review-expiration pre-filled from OCR').toBe('12/31/2026');
    console.log('[Insurance review UI] All fields verified — Provider: Test State Farm | Policy: POL-TEST-12345 | Expiry: 12/31/2026');
  });
});

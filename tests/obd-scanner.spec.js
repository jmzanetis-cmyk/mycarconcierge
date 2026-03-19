'use strict';

const { test, expect } = require('@playwright/test');
const {
  BASE_URL, SUPABASE_SERVICE_KEY,
  TEST_MEMBER_EMAIL, TEST_MEMBER_PASS,
  getSupabaseAdmin
} = require('./helpers');

test.describe('OBD Diagnostic Scanner', () => {
  test('OBD scan API: 401 without auth token', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/obd/scan`, {
      data: { codes: ['P0300'] }
    });
    expect(res.status()).toBe(401);
  });

  test('OBD scan API: authenticated request returns meaningful response', async ({ request }) => {
    test.skip(!SUPABASE_SERVICE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY');
    const sb = getSupabaseAdmin();
    const { data } = await sb.auth.signInWithPassword({ email: TEST_MEMBER_EMAIL, password: TEST_MEMBER_PASS });
    const token = data?.session?.access_token;
    expect(token).toBeTruthy();

    const res = await request.post(`${BASE_URL}/api/obd/scan`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { codes: ['P0300'], vehicleInfo: { year: '2019', make: 'Honda', model: 'Civic' } }
    });
    expect([200, 400]).toContain(res.status());
    const body = await res.json();
    if (res.status() === 200) {
      expect(body.diagnosis || body.codes || body.explanation || body.success).toBeTruthy();
    }
  });

  test('OBD interpret API: AI returns severity, cost estimate, and code explanation', async ({ request }) => {
    test.skip(!SUPABASE_SERVICE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY');
    const sb = getSupabaseAdmin();
    const { data } = await sb.auth.signInWithPassword({ email: TEST_MEMBER_EMAIL, password: TEST_MEMBER_PASS });
    const token = data?.session?.access_token;
    expect(token).toBeTruthy();

    const res = await request.post(`${BASE_URL}/api/obd/interpret`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { codes: ['P0300'], vehicleInfo: '2019 Honda Civic' }
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(['low', 'medium', 'high', 'critical']).toContain(body.severity);
    expect(Array.isArray(body.codes)).toBe(true);
    expect(body.codes).toContain('P0300');

    const interp = body.interpretation;
    expect(interp).toBeTruthy();
    expect(['low', 'medium', 'high', 'critical']).toContain(interp.overall_severity);

    expect(Array.isArray(interp.codes_explained)).toBe(true);
    expect(interp.codes_explained.length).toBeGreaterThan(0);
    const codeEntry = interp.codes_explained[0];
    expect(codeEntry.code || codeEntry.meaning).toBeTruthy();
    expect(['low', 'medium', 'high', 'critical']).toContain(codeEntry.severity);

    const explanation = interp.summary || interp.explanation || interp.likely_causes;
    expect(explanation).toBeTruthy();

    expect(interp.estimated_cost).toBeTruthy();
    expect(typeof interp.estimated_cost.min).toBe('number');
    expect(typeof interp.estimated_cost.max).toBe('number');
    expect(interp.estimated_cost.max).toBeGreaterThanOrEqual(interp.estimated_cost.min);
  });

  test('Unauthenticated visit to members.html redirects to login', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/members.html`);
    await page.waitForTimeout(3000);
    expect(page.url()).toMatch(/login\.html/);
    await context.close();
  });
});

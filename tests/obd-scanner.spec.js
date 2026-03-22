'use strict';

const { test, expect } = require('@playwright/test');
const {
  BASE_URL, SUPABASE_SERVICE_KEY,
  TEST_MEMBER_EMAIL, TEST_MEMBER_PASS,
  getSupabaseAdmin, loginViaUI, navigateToSection
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
    expect(token, 'Member sign-in must return an access token').toBeTruthy();

    const res = await request.post(`${BASE_URL}/api/obd/scan`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { codes: ['P0300'], vehicleInfo: { year: '2019', make: 'Honda', model: 'Civic' } }
    });
    expect([200, 400]).toContain(res.status());
    const body = await res.json();
    if (res.status() === 200) {
      expect(body.diagnosis || body.codes || body.explanation || body.success, 'Response must contain a diagnosis field').toBeTruthy();
    }
  });

  test('OBD interpret API: AI returns severity, cost estimate, and code explanation', async ({ request }) => {
    test.skip(!SUPABASE_SERVICE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY');
    const sb = getSupabaseAdmin();
    const { data } = await sb.auth.signInWithPassword({ email: TEST_MEMBER_EMAIL, password: TEST_MEMBER_PASS });
    const token = data?.session?.access_token;
    expect(token, 'Member sign-in must return an access token').toBeTruthy();

    const res = await request.post(`${BASE_URL}/api/obd/interpret`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { codes: ['P0300'], vehicleInfo: '2019 Honda Civic' }
    });
    expect(res.status(), 'OBD interpret endpoint must return 200').toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(['low', 'medium', 'high', 'critical'], 'Top-level severity must be a valid enum').toContain(body.severity);
    expect(Array.isArray(body.codes)).toBe(true);
    expect(body.codes).toContain('P0300');

    const interp = body.interpretation;
    expect(interp, 'interpretation object must be present').toBeTruthy();
    expect(['low', 'medium', 'high', 'critical']).toContain(interp.overall_severity);
    expect(Array.isArray(interp.codes_explained)).toBe(true);
    expect(interp.codes_explained.length).toBeGreaterThan(0);

    const codeEntry = interp.codes_explained[0];
    expect(codeEntry.code || codeEntry.meaning, 'Code entry must have code or meaning').toBeTruthy();
    expect(['low', 'medium', 'high', 'critical']).toContain(codeEntry.severity);

    const explanation = interp.summary || interp.explanation || interp.likely_causes;
    expect(explanation, 'Interpretation must include a summary or explanation').toBeTruthy();

    expect(interp.estimated_cost, 'Cost estimate object must be present').toBeTruthy();
    expect(typeof interp.estimated_cost.min).toBe('number');
    expect(typeof interp.estimated_cost.max).toBe('number');
    expect(interp.estimated_cost.max, 'Cost max must be >= min').toBeGreaterThanOrEqual(interp.estimated_cost.min);
  });

  test('OBD scanner UI: member opens modal, enters code, submits, and sees AI severity + cost results', async ({ page }) => {
    test.skip(!SUPABASE_SERVICE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY');
    test.setTimeout(60000);

    await loginViaUI(page, TEST_MEMBER_EMAIL, TEST_MEMBER_PASS, 'member');
    await navigateToSection(page, 'vehicles');
    await page.waitForTimeout(1500);

    // Find the OBD scanner button on a vehicle card — requires member to have at least one vehicle
    const obdBtn = page.locator('button[onclick*="openOBDScanner"]').first();
    const hasVehicleBtn = await obdBtn.count() > 0;
    if (!hasVehicleBtn) {
      test.skip(true, 'Test member has no vehicles with OBD button — add a vehicle to enable this test');
    }

    await obdBtn.scrollIntoViewIfNeeded();
    await obdBtn.click({ force: true });

    // OBD scanner modal has no inline display:none so CSS .modal-backdrop.active controls visibility
    const obdModal = page.locator('#obd-scanner-modal');
    await expect(obdModal, 'OBD scanner modal must open after clicking scanner button').toBeVisible({ timeout: 5000 });

    // Fill the diagnostic code input — real keyboard interaction
    const codesInput = page.locator('#obd-codes-input');
    await expect(codesInput, 'Codes input must be visible inside the modal').toBeVisible({ timeout: 3000 });
    await codesInput.click();
    await codesInput.fill('P0420');

    // Submit — click the real "Analyze Codes" button
    const analyzeBtn = page.locator('#obd-submit-btn');
    await expect(analyzeBtn, 'Analyze Codes button must be visible').toBeVisible({ timeout: 3000 });
    await analyzeBtn.click();

    // Wait for results modal — AI call takes up to 20s
    const resultsModal = page.locator('#obd-results-modal');
    await expect(resultsModal, 'OBD results modal must open after AI analysis').toBeVisible({ timeout: 25000 });

    // Assert rendered AI output contains severity and cost information
    const resultsBody = page.locator('#obd-results-body');
    const resultsText = await resultsBody.textContent({ timeout: 5000 });
    expect(resultsText, 'Results body must contain AI-rendered output').toBeTruthy();
    expect(resultsText.length, 'AI output must be substantive (>100 chars)').toBeGreaterThan(100);

    expect(/low|medium|high|critical|severity/i.test(resultsText), 'Rendered results must include a severity rating').toBe(true);
    expect(/\$|estimate|cost|repair/i.test(resultsText), 'Rendered results must include a cost estimate').toBe(true);
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

const { test } = require('@playwright/test');
const BASE_URL = 'http://localhost:5000';
const TEST_MEMBER_EMAIL = 'testmember@mcc-test.com';
const TEST_MEMBER_PASS = 'TestPass123!';

test('debug: check viewPackage accessibility after login', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('CONSOLE ERR:', msg.text().substring(0, 200));
  });
  
  // Login first
  await page.goto(`${BASE_URL}/index.html`);
  await page.waitForTimeout(500);
  
  const emailInput = page.locator('#email, [name="email"], [type="email"]').first();
  const passInput = page.locator('#password, [name="password"], [type="password"]').first();
  
  if (await emailInput.count() > 0) {
    await emailInput.fill(TEST_MEMBER_EMAIL);
    await passInput.fill(TEST_MEMBER_PASS);
    const submitBtn = page.locator('button[type="submit"], #login-btn, .login-btn').first();
    if (await submitBtn.count() > 0) await submitBtn.click();
  }
  
  await page.waitForTimeout(3000);
  await page.goto(`${BASE_URL}/members.html`);
  await page.waitForTimeout(3000);
  
  const result = await page.evaluate(() => ({
    viewPackage: typeof window.viewPackage,
    openPackageModal: typeof window.openPackageModal,
    submitInsuranceExtraction: typeof window.submitInsuranceExtraction,
    showInsuranceReviewUI: typeof window.showInsuranceReviewUI,
    errors: window._pageErrors || [],
  }));
  
  console.log('Window functions:', JSON.stringify(result, null, 2));
  console.log('Page errors:', JSON.stringify(errors));
});

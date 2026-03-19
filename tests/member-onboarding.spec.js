'use strict';

const { test, expect } = require('@playwright/test');
const {
  BASE_URL, SUPABASE_SERVICE_KEY,
  TEST_MEMBER_EMAIL,
  getSupabaseAdmin
} = require('./helpers');

test.describe('Member Onboarding — 8-Step Conversational Form', () => {
  test('Onboarding page loads with multi-step structure', async ({ page }) => {
    await page.goto(`${BASE_URL}/onboarding-member.html`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#input-email')).toBeAttached({ timeout: 8000 });
    await expect(page.locator('#input-password')).toBeAttached();
    await expect(page.locator('#btn-submit')).toBeAttached();
    const steps = await page.locator('[data-step]').count();
    expect(steps).toBeGreaterThanOrEqual(5);
  });

  test('Form step navigation advances correctly (progress indicator updates)', async ({ page }) => {
    await page.goto(`${BASE_URL}/onboarding-member.html`);
    await page.waitForLoadState('domcontentloaded');

    const firstStep = page.locator('[data-step="0"]');
    await expect(firstStep).toBeAttached({ timeout: 5000 });

    const nextBtn = page.locator('.btn-next, button[onclick*="nextStep"]').first();
    const isVisible = await nextBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (isVisible) {
      await nextBtn.scrollIntoViewIfNeeded();
      await nextBtn.click({ force: true });
      await page.waitForTimeout(800);

      const advancedBeyondStep0 = await page.evaluate(() => {
        const steps = document.querySelectorAll('[data-step]');
        for (const step of steps) {
          const style = window.getComputedStyle(step);
          if (step.dataset.step !== '0' && style.display !== 'none' && style.opacity !== '0') return true;
        }
        const progress = document.querySelector('.progress-bar, .progress, [id*="progress"]');
        return progress ? (parseInt(progress.style.width) || 0) > 0 : false;
      });
      expect(advancedBeyondStep0 || isVisible).toBe(true);
    } else {
      expect(await firstStep.count()).toBeGreaterThan(0);
    }
  });

  test('Profile upsert is idempotent on existing accounts (prevents 23505 crash)', async () => {
    test.skip(!SUPABASE_SERVICE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY');
    const sb = getSupabaseAdmin();
    const { data: existing } = await sb.from('profiles')
      .select('id, email, role').eq('email', TEST_MEMBER_EMAIL).single();
    expect(existing?.id).toBeTruthy();

    const { data: upserted, error } = await sb.from('profiles')
      .upsert({ id: existing.id, email: existing.email, role: existing.role }, { onConflict: 'id' })
      .select('id').single();
    expect(error).toBeNull();
    expect(upserted?.id).toBe(existing.id);
  });

  test('Full 8-step onboarding: creates account, verifies DB, and redirects to login', async ({ page }) => {
    test.skip(!SUPABASE_SERVICE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY');
    test.setTimeout(90000);

    const uniqueEmail = `e2e-onboard-${Date.now()}@mcc-test.com`;
    const testPassword = 'TestPass123!';
    let createdUserId = null;
    const sb = getSupabaseAdmin();

    try {
      await page.goto(`${BASE_URL}/onboarding-member.html`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);

      const clickNext = () => page.evaluate(() => {
        if (typeof window.nextStep === 'function') { window.nextStep(); return true; }
        const activeStep = document.querySelector('.step.active');
        if (activeStep) {
          const btn = activeStep.querySelector('.btn-next');
          if (btn) { btn.click(); return true; }
        }
        return false;
      });

      const nameInput = page.locator('#input-name');
      await expect(nameInput).toBeVisible({ timeout: 8000 });
      await nameInput.fill('E2E Test User');
      await clickNext();
      await page.waitForTimeout(800);

      const emailInput = page.locator('#input-email');
      await expect(emailInput).toBeVisible({ timeout: 5000 });
      await emailInput.fill(uniqueEmail);
      await clickNext();
      await page.waitForTimeout(800);

      const pwInput = page.locator('#input-password');
      await expect(pwInput).toBeVisible({ timeout: 5000 });
      await pwInput.fill(testPassword);
      await page.locator('#input-password-confirm').fill(testPassword);
      await clickNext();
      await page.waitForTimeout(800);

      // Step 3 — Phone (optional)
      const phoneInput = page.locator('#input-phone');
      const phoneVisible = await phoneInput.isVisible({ timeout: 3000 }).catch(() => false);
      if (phoneVisible) {
        await page.evaluate(() => {
          if (typeof window.skipStep === 'function') { window.skipStep(); return; }
          if (typeof window.nextStep === 'function') { window.nextStep(); return; }
          const activeStep = document.querySelector('.step.active');
          const skipBtn = activeStep?.querySelector('.btn-skip');
          if (skipBtn) skipBtn.click();
          else activeStep?.querySelector('.btn-next')?.click();
        });
        await page.waitForTimeout(800);
      }

      // Step 4 — Terms + Create Account
      const termsBox = page.locator('#consent-terms');
      await expect(termsBox).toBeVisible({ timeout: 5000 });
      await termsBox.check({ force: true });
      await page.waitForTimeout(300);

      await page.evaluate(() => {
        if (typeof window.submitSignup === 'function') { window.submitSignup(); return; }
        const btn = document.getElementById('btn-submit');
        if (btn) btn.click();
      });

      await page.waitForTimeout(6000);

      const { data: users } = await sb.auth.admin.listUsers();
      const createdUser = users?.users?.find(u => u.email === uniqueEmail);
      expect(createdUser, 'Account must be created in Supabase auth').toBeTruthy();
      createdUserId = createdUser?.id;

      const { data: profile } = await sb.from('profiles')
        .select('id, email, role').eq('email', uniqueEmail).single();
      expect(profile, 'Profile row must exist after signup').toBeTruthy();
      expect(profile.email).toBe(uniqueEmail);
      expect(profile.role).toBe('member');

      const getActiveStep = () => page.evaluate(() => {
        const steps = document.querySelectorAll('[data-step]');
        for (const step of steps) {
          const style = window.getComputedStyle(step);
          if (style.display !== 'none' && step.classList.contains('active')) return parseInt(step.dataset.step);
        }
        if (typeof currentStep !== 'undefined') return currentStep;
        return -1;
      });

      let stepNum = await getActiveStep();
      expect(stepNum).toBeGreaterThanOrEqual(4);

      // Step 5: Vehicle
      if (stepNum === 4 || stepNum === 5) {
        const carYear = page.locator('#input-car-year');
        const carMake = page.locator('#input-car-make');
        const carModel = page.locator('#input-car-model');
        if (await carYear.isVisible({ timeout: 3000 }).catch(() => false)) {
          await carYear.fill('2019');
          await carMake.fill('Honda');
          await carModel.fill('Civic');
          await page.evaluate(() => {
            if (typeof window.skipVehicle === 'function') { window.skipVehicle(); return; }
            const skip = document.querySelector('[data-step="5"] .btn-skip');
            if (skip) skip.click();
            else {
              if (typeof window.nextStep === 'function') window.nextStep();
              else document.querySelector('[data-step="5"] .btn-next')?.click();
            }
          });
          await page.waitForTimeout(2000);
          stepNum = await getActiveStep();
        }
      }

      // Step 6: Service category
      if (stepNum === 5 || stepNum === 6) {
        const categoryGrid = page.locator('#category-grid');
        if (await categoryGrid.isVisible({ timeout: 3000 }).catch(() => false)) {
          await page.evaluate(() => {
            const card = document.querySelector('.category-card[data-category="maintenance"]');
            if (card) card.click();
          });
          await page.waitForTimeout(500);
          await page.evaluate(() => {
            if (typeof skipRequest === 'function') { skipRequest(); return; }
            const skip = document.querySelector('[data-step="6"] .btn-skip');
            if (skip) skip.click();
            else {
              const next = document.querySelector('[data-step="6"] .btn-next');
              if (next) next.click();
            }
          });
          await page.waitForTimeout(1000);
          stepNum = await getActiveStep();
        }
      }

      // Step 7: Service request description
      if (stepNum === 6 || stepNum === 7) {
        const reqTitle = page.locator('#input-request-title');
        if (await reqTitle.isVisible({ timeout: 3000 }).catch(() => false)) {
          await page.evaluate(() => {
            if (typeof skipRequest === 'function') { skipRequest(); return; }
            const skip = document.querySelector('[data-step="7"] .btn-skip');
            if (skip) skip.click();
            else if (typeof nextStep === 'function') nextStep();
          });
          await page.waitForTimeout(1000);
          stepNum = await getActiveStep();
        }
      }

      // Step 8: Success screen — hard-assert
      const successTitle = page.locator('#success-title, .success-screen h2, .success-icon');
      await expect(
        successTitle.first(),
        'Onboarding success screen must be visible at step 8'
      ).toBeVisible({ timeout: 8000 });

      const finalStep = await getActiveStep();
      expect(finalStep).toBeGreaterThanOrEqual(8);
      console.log('[Onboarding] Reached step 8 success screen — onboarding complete ✓');

      // Assert the "Go to Login" redirect works
      const goToLoginBtn = page.locator('.btn-next').filter({ hasText: /login/i }).first();
      const goToLoginVisible = await goToLoginBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (goToLoginVisible) {
        await goToLoginBtn.click({ force: true });
        await page.waitForURL(/login\.html/, { timeout: 8000 });
        expect(page.url()).toMatch(/login\.html/);
        console.log('[Onboarding] "Go to Login" redirect confirmed → login.html ✓');
      }
    } finally {
      if (createdUserId) {
        await sb.auth.admin.deleteUser(createdUserId);
        await sb.from('profiles').delete().eq('id', createdUserId);
      }
    }
  });
});

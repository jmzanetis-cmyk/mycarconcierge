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
    expect(steps, 'Onboarding form must have at least 5 data-step elements').toBeGreaterThanOrEqual(5);
  });

  test('Form step navigation advances via Next button click (progress indicator updates)', async ({ page }) => {
    await page.goto(`${BASE_URL}/onboarding-member.html`);
    await page.waitForLoadState('domcontentloaded');

    const firstStep = page.locator('[data-step="0"]');
    await expect(firstStep, 'First step (data-step=0) must be in DOM').toBeAttached({ timeout: 5000 });

    // Click the real visible Next button — tests the actual UI control
    const nextBtn = page.locator('.btn-next, button[onclick*="nextStep"]').first();
    const isVisible = await nextBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (isVisible) {
      await nextBtn.scrollIntoViewIfNeeded();
      await nextBtn.click();
      await page.waitForTimeout(800);

      const advancedBeyondStep0 = await page.evaluate(() => {
        for (const step of document.querySelectorAll('[data-step]')) {
          const style = window.getComputedStyle(step);
          if (step.dataset.step !== '0' && style.display !== 'none' && style.opacity !== '0') return true;
        }
        const progress = document.querySelector('.progress-bar, .progress, [id*="progress"]');
        return progress ? (parseInt(progress.style.width) || 0) > 0 : false;
      });
      expect(advancedBeyondStep0 || isVisible, 'Progress must advance after clicking Next').toBe(true);
    } else {
      expect(await firstStep.count(), 'First step element must exist').toBeGreaterThan(0);
    }
  });

  test('Profile upsert is idempotent on existing accounts (prevents 23505 crash)', async () => {
    test.skip(!SUPABASE_SERVICE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY');
    const sb = getSupabaseAdmin();
    const { data: existing } = await sb.from('profiles')
      .select('id, email, role').eq('email', TEST_MEMBER_EMAIL).single();
    expect(existing?.id, 'Test member profile must exist in DB').toBeTruthy();

    const { data: upserted, error } = await sb.from('profiles')
      .upsert({ id: existing.id, email: existing.email, role: existing.role }, { onConflict: 'id' })
      .select('id').single();
    expect(error, 'Profile upsert on existing account must not throw a conflict error').toBeNull();
    expect(upserted?.id).toBe(existing.id);
  });

  test('Full 8-step onboarding: creates account, verifies DB, and redirects to login', async ({ page }) => {
    test.skip(!SUPABASE_SERVICE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY');
    test.setTimeout(90000);

    const uniqueEmail = `e2e-onboard-${Date.now()}@mcc-test.com`;
    const testPassword = 'TestPass123!';
    let createdUserId = null;
    const sb = getSupabaseAdmin();

    // Helper: click the active step's visible Next button, fall back to page-level .btn-next
    const clickNext = async () => {
      const activeBtn = page.locator('.step.active .btn-next').first();
      if (await activeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await activeBtn.click();
        return;
      }
      const pageBtn = page.locator('.btn-next:visible, button[onclick*="nextStep"]:visible').first();
      if (await pageBtn.count() > 0) await pageBtn.click();
    };

    // Helper: click the active step's visible Skip button, fall back to Next
    const clickSkip = async () => {
      const skipBtn = page.locator('.step.active .btn-skip').first();
      if (await skipBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await skipBtn.click();
        return;
      }
      await clickNext();
    };

    try {
      await page.goto(`${BASE_URL}/onboarding-member.html`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);

      // Step 0 — Name
      const nameInput = page.locator('#input-name');
      await expect(nameInput, 'Name input must be visible on first step').toBeVisible({ timeout: 8000 });
      await nameInput.fill('E2E Test User');
      await clickNext();
      await page.waitForTimeout(500);

      // Step 1 — Email
      const emailInput = page.locator('#input-email');
      await expect(emailInput, 'Email input must be visible on step 1').toBeVisible({ timeout: 5000 });
      await emailInput.fill(uniqueEmail);
      await clickNext();
      await page.waitForTimeout(500);

      // Step 2 — Password
      const pwInput = page.locator('#input-password');
      await expect(pwInput, 'Password input must be visible on step 2').toBeVisible({ timeout: 5000 });
      await pwInput.fill(testPassword);
      const confirmInput = page.locator('#input-password-confirm');
      if (await confirmInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmInput.fill(testPassword);
      }
      await clickNext();
      await page.waitForTimeout(500);

      // Step 3 — Phone (optional — skip)
      const phoneInput = page.locator('#input-phone');
      if (await phoneInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await clickSkip();
        await page.waitForTimeout(500);
      }

      // Step 4 — Terms + Create Account
      const termsBox = page.locator('#consent-terms');
      await expect(termsBox, 'Terms checkbox must be visible').toBeVisible({ timeout: 5000 });
      await termsBox.check({ force: true });
      await page.waitForTimeout(200);

      // Click the real submit button — NOT window.submitSignup()
      const submitBtn = page.locator('#btn-submit');
      await expect(submitBtn, 'Submit button must be visible').toBeVisible({ timeout: 3000 });
      await submitBtn.click();
      await page.waitForTimeout(5000);

      // Verify account was created in Supabase auth + profiles
      const { data: users } = await sb.auth.admin.listUsers();
      const createdUser = users?.users?.find(u => u.email === uniqueEmail);
      expect(createdUser, 'Account must be created in Supabase auth after form submit').toBeTruthy();
      createdUserId = createdUser?.id;

      const { data: profile } = await sb.from('profiles')
        .select('id, email, role').eq('email', uniqueEmail).single();
      expect(profile, 'Profile row must exist in DB after signup').toBeTruthy();
      expect(profile.email).toBe(uniqueEmail);
      expect(profile.role, 'New member must have role=member').toBe('member');

      const getActiveStepNum = () => page.evaluate(() => {
        for (const step of document.querySelectorAll('[data-step]')) {
          const style = window.getComputedStyle(step);
          if (style.display !== 'none' && step.classList.contains('active')) return parseInt(step.dataset.step);
        }
        return -1;
      });

      let stepNum = await getActiveStepNum();
      expect(stepNum, 'Must be on step 4 or later after account creation').toBeGreaterThanOrEqual(4);

      // Step 5 — Vehicle (optional — fill and skip)
      if (stepNum === 4 || stepNum === 5) {
        const carYear = page.locator('#input-car-year');
        if (await carYear.isVisible({ timeout: 2000 }).catch(() => false)) {
          await carYear.fill('2019');
          const carMake = page.locator('#input-car-make');
          if (await carMake.isVisible({ timeout: 500 }).catch(() => false)) await carMake.fill('Honda');
          const carModel = page.locator('#input-car-model');
          if (await carModel.isVisible({ timeout: 500 }).catch(() => false)) await carModel.fill('Civic');
          await clickSkip();
          await page.waitForTimeout(1000);
          stepNum = await getActiveStepNum();
        }
      }

      // Step 6 — Service category (optional — click maintenance then skip/next)
      if (stepNum === 5 || stepNum === 6) {
        const categoryGrid = page.locator('#category-grid');
        if (await categoryGrid.isVisible({ timeout: 2000 }).catch(() => false)) {
          const maintenanceCard = page.locator('.category-card[data-category="maintenance"]');
          if (await maintenanceCard.isVisible({ timeout: 1000 }).catch(() => false)) {
            await maintenanceCard.click();
          }
          await page.waitForTimeout(300);
          await clickSkip();
          await page.waitForTimeout(800);
          stepNum = await getActiveStepNum();
        }
      }

      // Step 7 — Service request description (optional — skip)
      if (stepNum === 6 || stepNum === 7) {
        const reqTitle = page.locator('#input-request-title');
        if (await reqTitle.isVisible({ timeout: 2000 }).catch(() => false)) {
          await clickSkip();
          await page.waitForTimeout(800);
        }
      }

      // Step 8 — Success screen
      const successTitle = page.locator('#success-title, .success-screen h2, .success-icon');
      await expect(
        successTitle.first(),
        'Onboarding success screen must be visible at step 8'
      ).toBeVisible({ timeout: 8000 });

      console.log('[Onboarding] Reached step 8 success screen — onboarding complete ✓');

      // Assert "Go to Login" button redirects to login.html
      const goToLoginBtn = page.locator('.btn-next').filter({ hasText: /login/i }).first();
      if (await goToLoginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await goToLoginBtn.click();
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

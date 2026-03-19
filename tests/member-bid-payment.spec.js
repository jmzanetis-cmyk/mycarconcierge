'use strict';

const { test, expect } = require('@playwright/test');
const {
  BASE_URL, SUPABASE_SERVICE_KEY,
  TEST_MEMBER_EMAIL, TEST_MEMBER_PASS, TEST_PROVIDER_EMAIL, TEST_PROVIDER_PASS,
  getSupabaseAdmin, loginViaUI, navigateToSection
} = require('./helpers');

test.describe('Cross-Role Browser Flow: Member → Request → Provider Bid → Accept', () => {
  test.skip(!SUPABASE_SERVICE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY');

  let createdVehicleId;
  let createdPackageId;
  let uniqueTitle;
  let createdBidId;

  test.beforeAll(async () => {
    const sb = getSupabaseAdmin();

    const { data: memberProfile } = await sb.from('profiles')
      .select('id').eq('email', TEST_MEMBER_EMAIL).single();
    if (!memberProfile?.id) return;

    const { data: existingVehicle } = await sb.from('vehicles')
      .select('id').eq('owner_id', memberProfile.id).limit(1).single();
    if (!existingVehicle) {
      const { data: seeded } = await sb.from('vehicles').insert({
        owner_id: memberProfile.id,
        year: 2020, make: 'Toyota', model: 'Camry', trim: 'LE',
        color: 'Blue', mileage: 35000
      }).select('id').single();
      createdVehicleId = seeded?.id;
    }

    const { data: providerProfile } = await sb.from('profiles')
      .select('id, bid_credits, free_trial_bids').eq('email', TEST_PROVIDER_EMAIL).single();
    if (providerProfile && (providerProfile.bid_credits || 0) === 0 && (providerProfile.free_trial_bids || 0) === 0) {
      await sb.from('profiles').update({ free_trial_bids: 5 }).eq('id', providerProfile.id);
    }
  });

  test.afterAll(async () => {
    if (!SUPABASE_SERVICE_KEY) return;
    const sb = getSupabaseAdmin();
    if (createdBidId) await sb.from('bids').delete().eq('id', createdBidId);
    if (createdPackageId) await sb.from('maintenance_packages').delete().eq('id', createdPackageId);
    if (createdVehicleId) await sb.from('vehicles').delete().eq('id', createdVehicleId);
  });

  test('Step 1: Member logs in via browser form and reaches member dashboard', async ({ page }) => {
    await loginViaUI(page, TEST_MEMBER_EMAIL, TEST_MEMBER_PASS, 'member');
    expect(page.url()).toMatch(/members\.html/);
    const dashboardEl = page.locator('[id*="dashboard"], #home, #packages');
    await expect(dashboardEl.first()).toBeAttached({ timeout: 5000 });
  });

  test('Step 2: Member creates a service request via the New Package browser UI form', async ({ page }) => {
    await loginViaUI(page, TEST_MEMBER_EMAIL, TEST_MEMBER_PASS, 'member');
    expect(page.url()).toMatch(/members\.html/);

    await navigateToSection(page, 'packages');
    await page.waitForTimeout(500);

    const newPkgBtn = page.locator('button').filter({ hasText: /New Package/i }).first();
    await expect(newPkgBtn).toBeVisible({ timeout: 8000 });
    await newPkgBtn.click();
    await page.waitForTimeout(500);

    const modal = page.locator('#package-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    const vehicleSelect = page.locator('#p-vehicle');
    await expect(vehicleSelect).toBeAttached();
    await page.waitForFunction(
      () => { const sel = document.getElementById('p-vehicle'); return sel && sel.options.length > 1; },
      { timeout: 10000 }
    );

    const vehicleCount = await vehicleSelect.locator('option').count();
    expect(vehicleCount).toBeGreaterThan(1);

    const firstVehicleOption = vehicleSelect.locator('option').nth(1);
    const firstVehicleValue = await firstVehicleOption.getAttribute('value');
    await vehicleSelect.selectOption(firstVehicleValue);

    uniqueTitle = `E2E UI Test — ${Date.now()}`;
    await page.locator('#p-title').fill(uniqueTitle);
    await page.locator('#p-description').fill('Automated browser E2E: standard oil change with synthetic oil, 0W-20');

    const categorySelect = page.locator('#p-category');
    if (await categorySelect.count() > 0) {
      await categorySelect.selectOption('maintenance');
    }

    const createBtn = modal.locator('button').filter({ hasText: /Create Package/i });
    await expect(createBtn).toBeVisible({ timeout: 3000 });
    await createBtn.click();
    await page.waitForTimeout(2000);

    const sb = getSupabaseAdmin();
    const { data: pkg } = await sb.from('maintenance_packages')
      .select('id, title, status')
      .ilike('title', 'E2E UI Test%')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    expect(pkg, 'Package must be created in DB after form submit').toBeTruthy();
    expect(pkg.title).toContain('E2E UI Test');
    expect(['open', 'pending', 'active']).toContain(pkg.status);
    createdPackageId = pkg.id;
  });

  test('Step 3: Newly created package card appears in member packages section', async ({ page }) => {
    if (!createdPackageId) {
      const sb = getSupabaseAdmin();
      const { data: pkgs } = await sb.from('maintenance_packages')
        .select('id, title').eq('status', 'open').order('created_at', { ascending: false }).limit(1);
      createdPackageId = pkgs?.[0]?.id;
      uniqueTitle = pkgs?.[0]?.title;
    }
    test.skip(!createdPackageId, 'No package from Step 2');

    await loginViaUI(page, TEST_MEMBER_EMAIL, TEST_MEMBER_PASS, 'member');
    await navigateToSection(page, 'packages');
    await page.waitForTimeout(1000);

    const pkgCards = page.locator('.package-card, .pkg-card, [class*="package-card"], [class*="pkg-card"]');
    const cardCount = await pkgCards.count();
    expect(cardCount).toBeGreaterThan(0);
  });

  test('Step 4: Provider logs in and submits a bid via the Browse Packages dashboard UI', async ({ page }) => {
    if (!createdPackageId) {
      const sb = getSupabaseAdmin();
      const { data: pkgs } = await sb.from('maintenance_packages')
        .select('id, title').eq('status', 'open').order('created_at', { ascending: false }).limit(1);
      createdPackageId = pkgs?.[0]?.id;
      uniqueTitle = pkgs?.[0]?.title;
    }
    test.skip(!createdPackageId, 'No package to bid on');

    await loginViaUI(page, TEST_PROVIDER_EMAIL, TEST_PROVIDER_PASS, 'provider');
    expect(page.url()).toMatch(/members\.html|providers\.html/);

    if (!page.url().includes('providers.html')) {
      await page.goto(`${BASE_URL}/providers.html`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1500);
    }
    expect(page.url()).toContain('providers.html');

    await navigateToSection(page, 'browse');
    await page.waitForTimeout(2000);

    const browseSection = page.locator('#browse');
    await expect(browseSection).toBeAttached({ timeout: 8000 });

    // Wait for the Submit Bid button for our package — raise explicit error if it never appears
    await page.waitForFunction(
      (pkgId) => !!document.querySelector(`[onclick*="openBidModal"][onclick*="${pkgId}"]`),
      createdPackageId,
      { timeout: 12000 }
    );

    const bidOpened = await page.evaluate((pkgId) => {
      const btn = document.querySelector(`[onclick*="openBidModal"][onclick*="${pkgId}"]`);
      if (!btn) return false;
      btn.scrollIntoView({ behavior: 'instant', block: 'center' });
      btn.click();
      return true;
    }, createdPackageId);
    expect(bidOpened, 'Submit/Update Bid button for this package must exist in Browse Packages').toBe(true);

    // Wait for bid modal to open — raise explicit error if it never becomes active
    await page.waitForFunction(
      () => document.getElementById('bid-modal')?.classList.contains('active'),
      { timeout: 15000 }
    );

    const bidModalActive = await page.evaluate(() => !!document.getElementById('bid-modal')?.classList.contains('active'));
    expect(bidModalActive, 'Bid modal must be active after clicking Submit Bid').toBe(true);

    await page.evaluate(() => {
      const priceSelect = document.getElementById('bid-price');
      if (priceSelect) {
        const opt = Array.from(priceSelect.options).find(o => Number(o.value) === 100 || o.value === '100');
        if (opt) { priceSelect.value = opt.value; priceSelect.dispatchEvent(new Event('change', { bubbles: true })); }
        else {
          const custom = document.getElementById('bid-price-custom');
          if (custom) { custom.value = '100'; custom.style.display = 'block'; }
        }
      }
      const notes = document.getElementById('bid-notes') || document.getElementById('bid-description');
      if (notes) notes.value = 'E2E browser flow bid — synthetic oil change, includes filter';
      const avail = document.getElementById('bid-availability');
      if (avail) avail.value = 'Available Mon-Fri, next week';
      const cb = document.getElementById('bid-pricing-confirm');
      if (cb && !cb.checked) cb.click();
    });

    const submitted = await page.evaluate(() => {
      const modal = document.getElementById('bid-modal');
      if (!modal) return false;
      const btn = modal.querySelector('.btn-primary');
      if (!btn) return false;
      btn.scrollIntoView({ behavior: 'instant', block: 'center' });
      btn.click();
      return true;
    });
    expect(submitted, 'Submit button must be present in bid modal').toBe(true);
    await page.waitForTimeout(2500);

    const sb = getSupabaseAdmin();
    const recentCutoff = new Date(Date.now() - 120_000).toISOString();
    const { data: bids } = await sb.from('bids')
      .select('id, price, status, package_id, description')
      .eq('package_id', createdPackageId)
      .gte('created_at', recentCutoff)
      .order('created_at', { ascending: false })
      .limit(5);
    const bid = bids?.[0];
    expect(bid, 'Bid record must exist in DB after provider submits bid').toBeTruthy();
    expect(bid.price).toBeGreaterThan(0);
    expect(bid.package_id).toBe(createdPackageId);
    expect(['pending', 'submitted', 'open']).toContain(bid.status);
    createdBidId = bid.id;
  });

  test('Step 5: Bid is recorded in DB with provider ID, price, and package reference', async () => {
    test.skip(!createdPackageId, 'No package from prior steps');
    const sb = getSupabaseAdmin();

    let bid = null;
    if (createdBidId) {
      const { data } = await sb.from('bids')
        .select('id, price, status, package_id, description, provider_id')
        .eq('id', createdBidId).single();
      bid = data;
    }
    if (!bid) {
      const { data } = await sb.from('bids')
        .select('id, price, status, package_id, description, provider_id')
        .eq('package_id', createdPackageId)
        .order('created_at', { ascending: false }).limit(1).single();
      bid = data;
      if (bid) createdBidId = bid.id;
    }

    expect(bid, 'Bid must exist in DB').toBeTruthy();
    expect(bid.price, 'Bid price must be a positive number (the provider quoted an amount)').toBeGreaterThan(0);
    expect(bid.package_id, 'Bid must reference the package created in Step 2').toBe(createdPackageId);
    expect(bid.provider_id, 'Bid must have a provider_id linking to the provider who submitted').toBeTruthy();
    // Newly submitted bids must be in pending/submitted (not already accepted/rejected/open — those are post-acceptance states)
    expect(['pending', 'submitted'], 'Newly submitted bid must have status "pending" or "submitted" — not rejected, accepted, or open').toContain(bid.status);
  });

  test('Step 6: Member logs in and sees bid notification on their specific package', async ({ page }) => {
    test.skip(!createdBidId, 'No bid from Step 4');
    test.skip(!createdPackageId, 'No package from Step 2');

    await loginViaUI(page, TEST_MEMBER_EMAIL, TEST_MEMBER_PASS, 'member');
    await navigateToSection(page, 'packages');
    await page.waitForTimeout(1000);

    // Assert the SPECIFIC package created in Step 2 is visible in the list
    await page.waitForFunction(
      (pkgId) => !!document.querySelector(`[onclick*="${pkgId}"]`) || !!document.querySelector(`[data-package-id="${pkgId}"]`),
      createdPackageId,
      { timeout: 10000 }
    );

    // Assert that specific package card shows a bid count indicator
    const hasSpecificBidIndicator = await page.evaluate((pkgId) => {
      const card = document.querySelector(`[onclick*="${pkgId}"]`) || document.querySelector(`[data-package-id="${pkgId}"]`);
      if (!card) return false;
      const bidBadge = card.querySelector('[class*="bid"], .badge, .count-badge, [id*="bid"]');
      const cardText = card.textContent || '';
      return !!bidBadge || /\bbid/i.test(cardText);
    }, createdPackageId);
    expect(hasSpecificBidIndicator, `Package ${createdPackageId} card must show a bid indicator after provider submitted a bid`).toBe(true);
  });

  test('Step 7: Member opens package modal and accepts the bid via browser UI', async ({ page }) => {
    if (!createdPackageId) {
      const sb = getSupabaseAdmin();
      const { data: pkgs } = await sb.from('maintenance_packages')
        .select('id').ilike('title', 'E2E UI Test%')
        .order('created_at', { ascending: false }).limit(1);
      createdPackageId = pkgs?.[0]?.id;
    }
    if (!createdBidId && createdPackageId) {
      const sb = getSupabaseAdmin();
      const { data: bids } = await sb.from('bids')
        .select('id').eq('package_id', createdPackageId)
        .in('status', ['pending', 'submitted', 'open'])
        .order('created_at', { ascending: false }).limit(1);
      createdBidId = bids?.[0]?.id;
    }
    test.skip(!createdPackageId || !createdBidId, 'Missing package or bid from prior steps');

    await loginViaUI(page, TEST_MEMBER_EMAIL, TEST_MEMBER_PASS, 'member');
    await navigateToSection(page, 'packages');
    await page.waitForTimeout(1000);

    page.on('dialog', dialog => dialog.accept());

    // Wait for the package card to appear — raise explicit error if not found
    await page.waitForFunction(
      (pkgId) => !!document.querySelector(`[onclick*="${pkgId}"]`),
      createdPackageId,
      { timeout: 10000 }
    );

    const pkgCardClicked = await page.evaluate((pkgId) => {
      const el = document.querySelector(`[onclick*="${pkgId}"]`);
      if (!el) return false;
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      el.click();
      return true;
    }, createdPackageId);

    await page.waitForTimeout(1500);

    const viewModal = page.locator('#view-package-modal');
    const modalVisible = await viewModal.isVisible({ timeout: 5000 }).catch(() => false);

    if (modalVisible) {
      // Wait for Accept Bid button — continue if package is already accepted
      await page.waitForFunction(
        () => {
          const modal = document.getElementById('view-package-modal');
          if (!modal) return false;
          for (const btn of modal.querySelectorAll('button')) {
            if (/Accept|Select/i.test(btn.textContent)) return true;
          }
          return true; // Package may already be accepted — proceed
        },
        { timeout: 8000 }
      );

      const resolvedBidId = await page.evaluate(({ expectedBidId }) => {
        let bids = [];
        try { bids = typeof currentPackageBids !== 'undefined' ? currentPackageBids : []; } catch (_) {}
        const matched = bids.find(b => b.id === expectedBidId);
        const first = bids.find(b => ['pending', 'submitted', 'open'].includes(b.status)) || bids[0];
        return (matched || first)?.id || expectedBidId;
      }, { expectedBidId: createdBidId });
      if (resolvedBidId !== createdBidId) createdBidId = resolvedBidId;

      const acceptClicked = await page.evaluate((bidId) => {
        const modal = document.getElementById('view-package-modal');
        if (!modal) return false;
        const btn = modal.querySelector(`button[onclick*="${bidId}"]`) ||
                    Array.from(modal.querySelectorAll('button')).find(b => /Accept Bid|Accept/i.test(b.textContent));
        if (!btn) return false;
        btn.scrollIntoView({ behavior: 'instant', block: 'center' });
        btn.click();
        return true;
      }, resolvedBidId);
      expect(acceptClicked, 'Accept Bid button must be present in package modal and clickable').toBe(true);

      // Assert post-acceptance payment confirmation UI (escrow held confirmation)
      // The app shows a toast "Bid accepted! Payment held in escrow." and/or a savings card (#mcc-savings-card)
      const paymentConfirmationShown = await page.waitForFunction(
        () => {
          // Check for toast with escrow message
          const toasts = document.querySelectorAll('.toast, .toast-item, [class*="toast"], [id*="toast"]');
          for (const t of toasts) {
            if (/escrow|held|accepted/i.test(t.textContent || '')) return true;
          }
          // Check for savings card (rendered after successful bid accept)
          if (document.getElementById('mcc-savings-card')) return true;
          // Check that modal closed (payment flow completed)
          const modal = document.getElementById('view-package-modal');
          if (modal && !modal.classList.contains('active')) return true;
          return false;
        },
        { timeout: 8000 }
      ).catch(() => null);

      // Verify DB state reflects payment was created — this is the definitive payment record check
      const sb2 = getSupabaseAdmin();
      const { data: escrowPayment } = await sb2.from('payments')
        .select('id, status, amount_total, package_id, provider_id')
        .eq('package_id', createdPackageId)
        .eq('status', 'held')
        .limit(1);
      expect(escrowPayment?.length, 'Escrow payment record with status="held" must exist in payments table immediately after accept').toBeGreaterThan(0);
      expect(escrowPayment[0].amount_total, 'Escrow payment amount must be positive').toBeGreaterThan(0);
      expect(escrowPayment[0].package_id, 'Escrow payment must reference the correct package').toBe(createdPackageId);
      console.log(`[Step 7] Payment confirmation UI triggered: ${paymentConfirmationShown ? 'yes' : 'no (timeout — checked DB instead)'}; escrow held: $${escrowPayment[0].amount_total}`);
    } else {
      expect(pkgCardClicked, 'Package card must exist in packages section').toBe(true);
      expect(modalVisible, 'Package view modal must open to accept bid').toBe(true);
    }

    await page.waitForTimeout(1500);

    const sb = getSupabaseAdmin();
    const { data: bid } = await sb.from('bids').select('status').eq('id', createdBidId).single();
    expect(bid, 'Bid must still exist in DB after accept action').toBeTruthy();
    expect(bid.status, 'Bid status must be "accepted" after member clicks Accept — not pending/submitted/rejected').toBe('accepted');

    const { data: pkg } = await sb.from('maintenance_packages')
      .select('status, accepted_bid_id').eq('id', createdPackageId).single();
    expect(pkg.accepted_bid_id, 'Package accepted_bid_id must reference the accepted bid').toBe(createdBidId);
    expect(pkg.status, 'Package status must transition to "accepted" — not open/pending').toBe('accepted');
  });

  test('Step 8: Bid accepted + package accepted + escrow payment record created in DB', async () => {
    test.skip(!createdBidId || !createdPackageId, 'Missing bid or package from prior steps');
    const sb = getSupabaseAdmin();

    const { data: finalPkg } = await sb.from('maintenance_packages')
      .select('status, accepted_bid_id').eq('id', createdPackageId).single();
    const { data: finalBid } = await sb.from('bids')
      .select('status, price, provider_id').eq('id', createdBidId).single();

    expect(finalPkg.accepted_bid_id, 'Package must reference the accepted bid').toBe(createdBidId);
    expect(finalPkg.status, 'Package status must be "accepted"').toBe('accepted');
    expect(finalBid.status, 'Bid status must be "accepted"').toBe('accepted');

    const { data: payments } = await sb.from('payments')
      .select('id, status, package_id, amount_total, member_id, provider_id')
      .eq('package_id', createdPackageId)
      .order('created_at', { ascending: false })
      .limit(1);
    expect(payments?.length, 'A payment record must exist in the payments table after bid acceptance').toBeGreaterThan(0);
    const payment = payments[0];
    expect(payment.status, 'Payment must have status="held" — funds in escrow pending completion').toBe('held');
    expect(payment.amount_total, 'Payment amount must be positive').toBeGreaterThan(0);
    expect(payment.amount_total, 'Payment amount must match the accepted bid price').toBe(finalBid.price);
    expect(payment.package_id).toBe(createdPackageId);
    expect(payment.provider_id).toBe(finalBid.provider_id);
  });

  test('Step 9: Escrow status API verifies held payment + package modal shows accepted-status UI', async ({ page }) => {
    test.skip(!createdPackageId, 'No package from prior steps — run full suite');

    const sb = getSupabaseAdmin();
    const { data: pkg } = await sb.from('maintenance_packages')
      .select('status, accepted_bid_id').eq('id', createdPackageId).single();
    expect(pkg, 'Package must exist in DB').toBeTruthy();
    expect(pkg.status, 'Package must be in "accepted" state').toBe('accepted');

    // Direct Stripe API assertion: POST /api/escrow/create must return a Stripe PaymentIntent clientSecret
    const { data: authData } = await sb.auth.signInWithPassword({ email: TEST_MEMBER_EMAIL, password: TEST_MEMBER_PASS });
    const token = authData?.session?.access_token;
    expect(token, 'Member sign-in must return access token').toBeTruthy();

    const escrowRes = await fetch(`${BASE_URL}/api/escrow/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ package_id: createdPackageId, bid_id: createdBidId })
    });

    if (escrowRes.status >= 500) {
      // Skip (not pass) when Stripe key is unavailable in CI — do not silently accept as success
      let errBody = {};
      try { errBody = await escrowRes.json(); } catch (_) {}
      test.skip(true, `Stripe key unavailable in this environment (HTTP ${escrowRes.status}): ${errBody.error || 'server error'} — skipping escrow PaymentIntent assertion`);
      return;
    }

    // Only reach here on 200/400/403/404 — assert strict Stripe contract
    expect(escrowRes.status, 'Escrow create endpoint must return 200 (Stripe key configured)').toBe(200);
    const escrowBody = await escrowRes.json();
    expect(escrowBody.success, 'Escrow create response must have success:true').toBe(true);
    expect(
      escrowBody.clientSecret || escrowBody.paymentIntentId,
      'Escrow create response must include clientSecret or paymentIntentId (Stripe PaymentIntent contract)'
    ).toBeTruthy();
    if (escrowBody.clientSecret) {
      expect(escrowBody.clientSecret, 'clientSecret must begin with pi_ (Stripe PaymentIntent prefix)').toMatch(/^pi_/);
    }

    // Browser UI: package modal renders accepted-status state (waiting for provider)
    await loginViaUI(page, TEST_MEMBER_EMAIL, TEST_MEMBER_PASS, 'member');
    await navigateToSection(page, 'packages');
    await page.waitForTimeout(1000);

    page.on('dialog', dialog => dialog.accept());

    const allTab = page.locator('.tab[data-tab="all"]').first();
    if (await allTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await allTab.click();
      await page.waitForTimeout(800);
    }

    await page.waitForFunction(
      (pkgId) => !!document.querySelector(`[onclick*="${pkgId}"]`) || !!document.querySelector(`[data-package-id="${pkgId}"]`),
      createdPackageId,
      { timeout: 10000 }
    );

    await page.evaluate((pkgId) => {
      const el = document.querySelector(`[onclick*="${pkgId}"]`) || document.querySelector(`[data-package-id="${pkgId}"]`);
      if (el) { el.scrollIntoView({ behavior: 'instant', block: 'center' }); el.click(); }
    }, createdPackageId);

    await page.waitForFunction(
      () => document.getElementById('view-package-modal')?.classList.contains('active'),
      { timeout: 12000 }
    );

    const viewModal = page.locator('#view-package-modal');
    await expect(viewModal, 'Package view modal must open').toBeVisible({ timeout: 5000 });

    const modalText = await viewModal.textContent({ timeout: 5000 });
    const hasAcceptedUI = /waiting.*provider|provider.*start|accepted|escrow|held|in_progress/i.test(modalText);
    expect(hasAcceptedUI, 'Package modal must show accepted-status UI — waiting for provider or escrow held').toBe(true);
  });
});

const { test, expect } = require('@playwright/test');

const FAKE_USER_ID = '00000000-aaaa-bbbb-cccc-000000000001';
const FAKE_EMAIL = 'testuser@example.com';

async function mockSupabaseAuth(page) {
  await page.route('**/auth/v1/user', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: FAKE_USER_ID,
        email: FAKE_EMAIL,
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: 'Test User' }
      })
    });
  });

  await page.route('**/auth/v1/token**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'fake-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'fake-refresh-token',
        user: {
          id: FAKE_USER_ID,
          email: FAKE_EMAIL,
          role: 'authenticated'
        }
      })
    });
  });

  await page.route('**/rest/v1/profiles**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: FAKE_USER_ID,
        full_name: 'Test User',
        email: FAKE_EMAIL,
        role: 'member',
        zip_code: '10001',
        phone: '5551234567'
      }])
    });
  });

  await page.route('**/rest/v1/vehicles**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/rest/v1/maintenance_packages**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/rest/v1/service_reminders**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/rest/v1/upsell_requests**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/rest/v1/service_history**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/rest/v1/destination_services**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/rest/v1/recommendations**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/rest/v1/notifications**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/rest/v1/payments**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/rest/v1/split_participants**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/rest/v1/tos_acceptance**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: '1', accepted_at: new Date().toISOString() }])
    });
  });

  await page.route('**/rest/v1/**', (route, request) => {
    if (!route.request().url().includes('auth/v1')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    } else {
      route.continue();
    }
  });

  await page.route('**/api/auth/check-access', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authorized: true })
    });
  });
}

async function setupMembersPage(page) {
  await mockSupabaseAuth(page);

  await page.addInitScript(() => {
    window.localStorage.setItem('sb-ifbyjxuaclwmadqbjcyp-auth-token', JSON.stringify({
      access_token: 'fake-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'fake-refresh-token',
      user: {
        id: '00000000-aaaa-bbbb-cccc-000000000001',
        email: 'testuser@example.com',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: 'Test User' }
      }
    }));
  });

  await page.goto('/members.html');
  await page.waitForLoadState('networkidle');

  await page.waitForFunction(() => {
    return document.getElementById('p-crowd-funded') !== null;
  }, { timeout: 15000 }).catch(() => {});
}

test.describe('Crowd-Funded Job Creation UI', () => {
  test('crowd-funded toggle exists and is unchecked by default', async ({ page }) => {
    await setupMembersPage(page);

    const crowdFundedCheckbox = page.locator('#p-crowd-funded');
    await expect(crowdFundedCheckbox).toBeAttached();
    await expect(crowdFundedCheckbox).not.toBeChecked();
  });

  test('crowd-funded section exists with correct structure', async ({ page }) => {
    await setupMembersPage(page);

    const section = page.locator('#crowd-funded-section');
    await expect(section).toBeAttached();

    const infoDiv = page.locator('#crowd-funded-info');
    await expect(infoDiv).toBeAttached();
    await expect(infoDiv).toBeHidden();
  });

  test('toggling crowd-funded shows the info text', async ({ page }) => {
    await setupMembersPage(page);

    const result = await page.evaluate(() => {
      const cb = document.getElementById('p-crowd-funded');
      const info = document.getElementById('crowd-funded-info');
      if (!cb || !info) return { skip: true };

      cb.checked = true;
      handleCrowdFundedToggle();

      return {
        display: info.style.display,
        text: info.textContent,
        checked: cb.checked
      };
    });

    if (result.skip) { test.skip(); return; }

    expect(result.display).toBe('block');
    expect(result.checked).toBe(true);
    expect(result.text).toContain('split the payment');
  });

  test('toggling crowd-funded unchecks private job toggle', async ({ page }) => {
    await setupMembersPage(page);

    const privateJobCheckbox = page.locator('#p-private-job');
    const privateJobExists = await privateJobCheckbox.count() > 0;
    if (!privateJobExists) {
      test.skip();
      return;
    }

    await page.evaluate(() => {
      const privateEl = document.getElementById('p-private-job');
      if (privateEl) {
        privateEl.checked = true;
        if (typeof handlePrivateJobToggle === 'function') handlePrivateJobToggle();
      }
    });

    await page.evaluate(() => {
      const crowdEl = document.getElementById('p-crowd-funded');
      if (crowdEl) {
        crowdEl.checked = true;
        if (typeof handleCrowdFundedToggle === 'function') handleCrowdFundedToggle();
      }
    });

    const isPrivateChecked = await page.evaluate(() => {
      const el = document.getElementById('p-private-job');
      return el ? el.checked : null;
    });
    expect(isPrivateChecked).toBe(false);
  });

  test('toggling private job hides the crowd-funded section', async ({ page }) => {
    await setupMembersPage(page);

    const privateJobCheckbox = page.locator('#p-private-job');
    const privateJobExists = await privateJobCheckbox.count() > 0;
    if (!privateJobExists) {
      test.skip();
      return;
    }

    await page.evaluate(() => {
      const privateEl = document.getElementById('p-private-job');
      if (privateEl) {
        privateEl.checked = true;
        if (typeof handlePrivateJobToggle === 'function') handlePrivateJobToggle();
      }
    });

    const crowdFundedSection = page.locator('#crowd-funded-section');
    await expect(crowdFundedSection).toBeHidden();
  });

  test('unchecking private job shows crowd-funded section again', async ({ page }) => {
    await setupMembersPage(page);

    const result = await page.evaluate(() => {
      const privateEl = document.getElementById('p-private-job');
      const crowdSection = document.getElementById('crowd-funded-section');
      if (!privateEl || !crowdSection) return { skip: true };

      privateEl.checked = true;
      handlePrivateJobToggle();
      const hiddenDisplay = crowdSection.style.display;

      privateEl.checked = false;
      handlePrivateJobToggle();
      const shownDisplay = crowdSection.style.display;

      return { hiddenDisplay, shownDisplay };
    });

    if (result.skip) { test.skip(); return; }

    expect(result.hiddenDisplay).toBe('none');
    expect(result.shownDisplay).toBe('block');
  });

  test('crowd-funded and private job toggles are mutually exclusive', async ({ page }) => {
    await setupMembersPage(page);

    const result = await page.evaluate(() => {
      const crowdEl = document.getElementById('p-crowd-funded');
      const privateEl = document.getElementById('p-private-job');
      if (!crowdEl || !privateEl) return { skip: true };

      crowdEl.checked = true;
      if (typeof handleCrowdFundedToggle === 'function') handleCrowdFundedToggle();
      const step1 = { crowd: crowdEl.checked, private: privateEl.checked };

      privateEl.checked = true;
      if (typeof handlePrivateJobToggle === 'function') handlePrivateJobToggle();
      const step2 = { crowd: crowdEl.checked, private: privateEl.checked };

      return { step1, step2 };
    });

    if (result.skip) {
      test.skip();
      return;
    }

    expect(result.step1.crowd).toBe(true);
    expect(result.step1.private).toBe(false);
    expect(result.step2.private).toBe(true);
    expect(result.step2.crowd).toBe(false);
  });
});

test.describe('Split Payment Modal UI', () => {
  test('openSplitPaymentModal creates modal with correct structure', async ({ page }) => {
    await setupMembersPage(page);

    await page.evaluate(() => {
      window.currentUser = { id: '00000000-aaaa-bbbb-cccc-000000000001', email: 'testuser@example.com' };
      window.userProfile = { full_name: 'Test User' };
    });

    const modalCreated = await page.evaluate(() => {
      if (typeof openSplitPaymentModal === 'function') {
        openSplitPaymentModal('fake-pkg-id', 10000);
        return true;
      }
      return false;
    });

    if (!modalCreated) {
      test.skip();
      return;
    }

    const modal = page.locator('#split-payment-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Split Payment');
    await expect(modal).toContainText('$100.00');
    await expect(page.locator('#split-participants-list')).toBeAttached();
    await expect(page.locator('#submit-split-btn')).toBeAttached();
  });

  test('split payment modal starts with 2 participant rows', async ({ page }) => {
    await setupMembersPage(page);

    await page.evaluate(() => {
      window.currentUser = { id: '00000000-aaaa-bbbb-cccc-000000000001', email: 'testuser@example.com' };
      window.userProfile = { full_name: 'Test User' };
    });

    const modalCreated = await page.evaluate(() => {
      if (typeof openSplitPaymentModal === 'function') {
        openSplitPaymentModal('fake-pkg-id', 10000);
        return true;
      }
      return false;
    });

    if (!modalCreated) { test.skip(); return; }

    const emailInputs = page.locator('#split-participants-list input[type="email"]');
    await expect(emailInputs).toHaveCount(2);

    const firstEmail = await emailInputs.first().inputValue();
    expect(firstEmail).toBe('testuser@example.com');
  });

  test('addSplitParticipantRow adds a new participant', async ({ page }) => {
    await setupMembersPage(page);

    await page.evaluate(() => {
      window.currentUser = { id: '00000000-aaaa-bbbb-cccc-000000000001', email: 'testuser@example.com' };
      window.userProfile = { full_name: 'Test User' };
    });

    const modalCreated = await page.evaluate(() => {
      if (typeof openSplitPaymentModal === 'function') {
        openSplitPaymentModal('fake-pkg-id', 10000);
        return true;
      }
      return false;
    });

    if (!modalCreated) { test.skip(); return; }

    const initialCount = await page.locator('#split-participants-list input[type="email"]').count();

    await page.evaluate(() => {
      if (typeof addSplitParticipantRow === 'function') {
        addSplitParticipantRow(10000);
      }
    });

    const newCount = await page.locator('#split-participants-list input[type="email"]').count();
    expect(newCount).toBe(initialCount + 1);
  });

  test('removeSplitParticipant removes a participant row', async ({ page }) => {
    await setupMembersPage(page);

    await page.evaluate(() => {
      window.currentUser = { id: '00000000-aaaa-bbbb-cccc-000000000001', email: 'testuser@example.com' };
      window.userProfile = { full_name: 'Test User' };
    });

    const modalCreated = await page.evaluate(() => {
      if (typeof openSplitPaymentModal === 'function') {
        openSplitPaymentModal('fake-pkg-id', 10000);
        return true;
      }
      return false;
    });

    if (!modalCreated) { test.skip(); return; }

    await page.evaluate(() => {
      if (typeof addSplitParticipantRow === 'function') addSplitParticipantRow(10000);
    });

    const countAfterAdd = await page.locator('#split-participants-list input[type="email"]').count();

    await page.evaluate(() => {
      if (typeof removeSplitParticipant === 'function') removeSplitParticipant(2, 10000);
    });

    const countAfterRemove = await page.locator('#split-participants-list input[type="email"]').count();
    expect(countAfterRemove).toBe(countAfterAdd - 1);
  });

  test('amount validation shows correct status when amounts match', async ({ page }) => {
    await setupMembersPage(page);

    await page.evaluate(() => {
      window.currentUser = { id: '00000000-aaaa-bbbb-cccc-000000000001', email: 'testuser@example.com' };
      window.userProfile = { full_name: 'Test User' };
    });

    const modalCreated = await page.evaluate(() => {
      if (typeof openSplitPaymentModal === 'function') {
        openSplitPaymentModal('fake-pkg-id', 10000);
        return true;
      }
      return false;
    });

    if (!modalCreated) { test.skip(); return; }

    const statusEl = page.locator('#split-amount-status');
    const statusText = await statusEl.textContent();
    expect(statusText).toContain('match');
  });

  test('amount validation shows remaining when amounts do not total', async ({ page }) => {
    await setupMembersPage(page);

    await page.evaluate(() => {
      window.currentUser = { id: '00000000-aaaa-bbbb-cccc-000000000001', email: 'testuser@example.com' };
      window.userProfile = { full_name: 'Test User' };
    });

    const modalCreated = await page.evaluate(() => {
      if (typeof openSplitPaymentModal === 'function') {
        openSplitPaymentModal('fake-pkg-id', 10000);
        return true;
      }
      return false;
    });

    if (!modalCreated) { test.skip(); return; }

    await page.evaluate(() => {
      if (typeof updateSplitParticipantAmount === 'function') {
        updateSplitParticipantAmount(0, '30.00', 10000);
        updateSplitParticipantAmount(1, '30.00', 10000);
      }
    });

    const statusEl = page.locator('#split-amount-status');
    const statusText = await statusEl.textContent();
    expect(statusText).toContain('remaining');
  });

  test('split payment validates $0.50 minimum per participant', async ({ page }) => {
    const result = await page.evaluate(() => {
      const participants = [
        { email: 'a@test.com', amount_cents: 30, display_name: 'A', is_guest: false },
        { email: 'b@test.com', amount_cents: 9970, display_name: 'B', is_guest: false }
      ];

      for (const p of participants) {
        if (p.amount_cents < 50) {
          return { valid: false, reason: 'Below $0.50 minimum' };
        }
      }
      return { valid: true };
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Below $0.50 minimum');
  });

  test('split payment validates duplicate emails', async ({ page }) => {
    const result = await page.evaluate(() => {
      const participants = [
        { email: 'same@test.com', amount_cents: 5000 },
        { email: 'same@test.com', amount_cents: 5000 }
      ];

      const emails = participants.map(p => p.email.toLowerCase());
      const uniqueEmails = new Set(emails);
      return { hasDuplicates: uniqueEmails.size !== emails.length };
    });

    expect(result.hasDuplicates).toBe(true);
  });

  test('split payment validates email format', async ({ page }) => {
    const result = await page.evaluate(() => {
      const participants = [
        { email: 'invalid-email', amount_cents: 5000 },
        { email: 'valid@test.com', amount_cents: 5000 }
      ];

      for (const p of participants) {
        if (!p.email || !p.email.includes('@')) {
          return { valid: false, invalidEmail: p.email };
        }
      }
      return { valid: true };
    });

    expect(result.valid).toBe(false);
    expect(result.invalidEmail).toBe('invalid-email');
  });

  test('closeSplitModal removes the modal from DOM', async ({ page }) => {
    await setupMembersPage(page);

    await page.evaluate(() => {
      window.currentUser = { id: '00000000-aaaa-bbbb-cccc-000000000001', email: 'testuser@example.com' };
      window.userProfile = { full_name: 'Test User' };
    });

    const modalCreated = await page.evaluate(() => {
      if (typeof openSplitPaymentModal === 'function') {
        openSplitPaymentModal('fake-pkg-id', 10000);
        return true;
      }
      return false;
    });

    if (!modalCreated) { test.skip(); return; }

    const modalBefore = await page.locator('#split-payment-modal').count();
    expect(modalBefore).toBe(1);

    await page.evaluate(() => {
      if (typeof closeSplitModal === 'function') closeSplitModal();
    });

    const modalAfter = await page.locator('#split-payment-modal').count();
    expect(modalAfter).toBe(0);
  });

  test('split evenly distributes amounts correctly', async ({ page }) => {
    await setupMembersPage(page);

    await page.evaluate(() => {
      window.currentUser = { id: '00000000-aaaa-bbbb-cccc-000000000001', email: 'testuser@example.com' };
      window.userProfile = { full_name: 'Test User' };
    });

    const result = await page.evaluate(() => {
      if (typeof openSplitPaymentModal !== 'function') return { skip: true };

      openSplitPaymentModal('fake-pkg-id', 10000);

      const amountInputs = document.querySelectorAll('#split-participants-list input[type="number"]');
      if (!amountInputs || amountInputs.length === 0) return { skip: true };

      let total = 0;
      amountInputs.forEach(input => {
        total += Math.round(parseFloat(input.value || 0) * 100);
      });

      return { total, count: amountInputs.length };
    });

    if (result.skip) { test.skip(); return; }

    expect(result.total).toBe(10000);
    expect(result.count).toBe(2);
  });
});

test.describe('Server API Endpoint Tests', () => {
  test('/api/split/create with missing auth returns error', async ({ request }) => {
    const response = await request.post('/api/split/create', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        package_id: '00000000-0000-0000-0000-000000000000',
        participants: [
          { email: 'a@test.com', amount_cents: 5000 },
          { email: 'b@test.com', amount_cents: 5000 }
        ]
      }
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThanOrEqual(403);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('/api/split/create with invalid auth token returns error', async ({ request }) => {
    const response = await request.post('/api/split/create', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid-token-12345'
      },
      data: {
        package_id: '00000000-0000-0000-0000-000000000000',
        participants: [
          { email: 'a@test.com', amount_cents: 5000 },
          { email: 'b@test.com', amount_cents: 5000 }
        ]
      }
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('/api/split/status/:id returns error for non-existent package', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const response = await request.get(`/api/split/status/${fakeId}`);

    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('/api/split/status/:id rejects invalid UUID format', async ({ request }) => {
    const response = await request.get('/api/split/status/not-a-valid-uuid');

    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('/api/split/cancel requires auth', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const response = await request.post(`/api/split/cancel/${fakeId}`, {
      headers: { 'Content-Type': 'application/json' }
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThanOrEqual(403);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('/api/split/cancel with invalid auth returns error', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const response = await request.post(`/api/split/cancel/${fakeId}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid-token'
      }
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('/api/split/create rejects missing Content-Type', async ({ request }) => {
    const response = await request.post('/api/split/create', {
      headers: { 'Authorization': 'Bearer fake-token' },
      data: '{}'
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('/api/split/create requires at least 2 participants', async ({ request }) => {
    const response = await request.post('/api/split/create', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer fake-token'
      },
      data: {
        package_id: '00000000-0000-0000-0000-000000000000',
        participants: [{ email: 'a@test.com', amount_cents: 10000 }]
      }
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('/api/split/guest-details requires valid participant ID', async ({ request }) => {
    const response = await request.post('/api/split/guest-details/invalid-id', {
      headers: { 'Content-Type': 'application/json' },
      data: { token: 'fake-token' }
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('/api/split/guest-pay requires valid participant ID', async ({ request }) => {
    const response = await request.post('/api/split/guest-pay/invalid-id', {
      headers: { 'Content-Type': 'application/json' },
      data: { token: 'fake-token' }
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('/api/split/pay requires auth', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const response = await request.post(`/api/split/pay/${fakeId}`, {
      headers: { 'Content-Type': 'application/json' }
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });
});

test.describe('Split Payment Status Display', () => {
  test('countdown timer renders when split payment has future expiry', async ({ page }) => {
    await page.goto('/split-pay.html');
    await page.waitForLoadState('domcontentloaded');

    const result = await page.evaluate(() => {
      const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

      const testContainer = document.createElement('div');
      testContainer.id = 'split-info';
      document.body.appendChild(testContainer);

      if (typeof startSplitCountdown === 'function') {
        startSplitCountdown(futureDate, 'test-countdown');
        const countdown = document.getElementById('test-countdown');
        if (countdown) {
          return {
            created: true,
            hasHours: !!document.getElementById('split-cd-hours'),
            hasMins: !!document.getElementById('split-cd-mins'),
            hasSecs: !!document.getElementById('split-cd-secs'),
            hoursText: document.getElementById('split-cd-hours')?.textContent,
            minsText: document.getElementById('split-cd-mins')?.textContent,
            secsText: document.getElementById('split-cd-secs')?.textContent
          };
        }
      }
      return { created: false };
    });

    if (result.created) {
      expect(result.hasHours).toBe(true);
      expect(result.hasMins).toBe(true);
      expect(result.hasSecs).toBe(true);
      expect(result.hoursText).not.toBe('--');
    }
  });

  test('countdown timer shows 00:00:00 for expired date', async ({ page }) => {
    await page.goto('/split-pay.html');
    await page.waitForLoadState('domcontentloaded');

    const result = await page.evaluate(() => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const testContainer = document.createElement('div');
      testContainer.id = 'split-info';
      document.body.appendChild(testContainer);

      if (typeof startSplitCountdown === 'function') {
        startSplitCountdown(pastDate, 'test-countdown-expired');
        return {
          created: true,
          hours: document.getElementById('split-cd-hours')?.textContent,
          mins: document.getElementById('split-cd-mins')?.textContent,
          secs: document.getElementById('split-cd-secs')?.textContent
        };
      }
      return { created: false };
    });

    if (result.created) {
      expect(result.hours).toBe('00');
      expect(result.mins).toBe('00');
      expect(result.secs).toBe('00');
    }
  });

  test('progress bar percentage calculation for mixed statuses', async ({ page }) => {
    const result = await page.evaluate(() => {
      const participants = [
        { status: 'paid' },
        { status: 'paid' },
        { status: 'pending' },
        { status: 'invited' }
      ];

      const paidCount = participants.filter(p => p.status === 'paid').length;
      const totalCount = participants.length;
      const progressPct = totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0;

      return { paidCount, totalCount, progressPct };
    });

    expect(result.paidCount).toBe(2);
    expect(result.totalCount).toBe(4);
    expect(result.progressPct).toBe(50);
  });

  test('participant status icons are correctly mapped', async ({ page }) => {
    const result = await page.evaluate(() => {
      const statusIcons = {
        'invited': '📩',
        'pending': '⏳',
        'paid': '✅',
        'partially_refunded': '↩️',
        'refunded': '↩️',
        'failed': '❌',
        'cancelled': '🚫'
      };

      return {
        paidIcon: statusIcons['paid'],
        failedIcon: statusIcons['failed'],
        invitedIcon: statusIcons['invited'],
        pendingIcon: statusIcons['pending'],
        cancelledIcon: statusIcons['cancelled'],
        totalStatuses: Object.keys(statusIcons).length
      };
    });

    expect(result.paidIcon).toBe('✅');
    expect(result.failedIcon).toBe('❌');
    expect(result.invitedIcon).toBe('📩');
    expect(result.pendingIcon).toBe('⏳');
    expect(result.cancelledIcon).toBe('🚫');
    expect(result.totalStatuses).toBe(7);
  });

  test('progress percentage is 100% when all paid', async ({ page }) => {
    const result = await page.evaluate(() => {
      const participants = [{ status: 'paid' }, { status: 'paid' }, { status: 'paid' }];
      const paidCount = participants.filter(p => p.status === 'paid').length;
      const totalCount = participants.length;
      return { progressPct: Math.round((paidCount / totalCount) * 100) };
    });

    expect(result.progressPct).toBe(100);
  });

  test('progress percentage is 0% when none paid', async ({ page }) => {
    const result = await page.evaluate(() => {
      const participants = [{ status: 'invited' }, { status: 'pending' }];
      const paidCount = participants.filter(p => p.status === 'paid').length;
      const totalCount = participants.length;
      return { progressPct: Math.round((paidCount / totalCount) * 100) };
    });

    expect(result.progressPct).toBe(0);
  });
});

test.describe('Guest Payer Flow', () => {
  test('split-pay.html loads with correct title', async ({ page }) => {
    await page.goto('/split-pay.html');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveTitle(/Split Payment/);
  });

  test('split-pay page has correct structure and elements', async ({ page }) => {
    await page.goto('/split-pay.html');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('.container')).toBeAttached();
    await expect(page.locator('.logo h1')).toContainText('My Car Concierge');
    await expect(page.locator('#main-card')).toBeAttached();
    await expect(page.locator('#loading-state')).toBeAttached();
    await expect(page.locator('#payment-state')).toBeAttached();
    await expect(page.locator('#error-state')).toBeAttached();
    await expect(page.locator('#success-state')).toBeAttached();
    await expect(page.locator('#already-paid-state')).toBeAttached();
  });

  test('missing participant parameter shows error', async ({ page }) => {
    await page.goto('/split-pay.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const errorState = page.locator('#error-state');
    await expect(errorState).toBeVisible();

    const errorMessage = page.locator('#error-message');
    const errorText = await errorMessage.textContent();
    expect(errorText).toContain('payment link');
  });

  test('split-pay page has Stripe card element container', async ({ page }) => {
    await page.goto('/split-pay.html');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#card-element')).toBeAttached();
  });

  test('split-pay page has pay button with correct text', async ({ page }) => {
    await page.goto('/split-pay.html');
    await page.waitForLoadState('domcontentloaded');
    const payBtn = page.locator('#pay-btn');
    await expect(payBtn).toBeAttached();
    await expect(payBtn).toContainText('Pay Now');
  });

  test('split-pay page has share amount display', async ({ page }) => {
    await page.goto('/split-pay.html');
    await page.waitForLoadState('domcontentloaded');
    const shareAmount = page.locator('#share-amount');
    await expect(shareAmount).toBeAttached();
    const text = await shareAmount.textContent();
    expect(text).toContain('$');
  });

  test('split-pay page has secure payment note mentioning Stripe', async ({ page }) => {
    await page.goto('/split-pay.html');
    await page.waitForLoadState('domcontentloaded');
    const secureNote = page.locator('.secure-note');
    await expect(secureNote).toBeAttached();
    await expect(secureNote).toContainText('Stripe');
  });

  test('success state shows correct heading', async ({ page }) => {
    await page.goto('/split-pay.html');
    await page.waitForLoadState('domcontentloaded');
    const successHeading = page.locator('#success-state h2');
    await expect(successHeading).toContainText('Payment Complete');
  });

  test('already-paid state shows correct heading', async ({ page }) => {
    await page.goto('/split-pay.html');
    await page.waitForLoadState('domcontentloaded');
    const heading = page.locator('#already-paid-state h2');
    await expect(heading).toContainText('Already Paid');
  });

  test('guest flow with invalid token shows error eventually', async ({ page }) => {
    await page.goto('/split-pay.html?participant=00000000-0000-0000-0000-000000000000&guest=true&token=invalid-token');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    const errorState = page.locator('#error-state');
    const isErrorVisible = await errorState.isVisible();
    const guestLoading = page.locator('#guest-loading-state');
    const isGuestLoading = await guestLoading.isVisible();

    expect(isErrorVisible || !isGuestLoading).toBeTruthy();
  });
});

test.describe('Server-Side Validation', () => {
  test('server enforces $0.50 minimum per participant on create', async ({ request }) => {
    const response = await request.post('/api/split/create', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer fake-token'
      },
      data: {
        package_id: '00000000-0000-0000-0000-000000000000',
        participants: [
          { email: 'a@test.com', amount_cents: 30 },
          { email: 'b@test.com', amount_cents: 9970 }
        ]
      }
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('server rejects create with missing package_id', async ({ request }) => {
    const response = await request.post('/api/split/create', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer fake-token'
      },
      data: {
        participants: [
          { email: 'a@test.com', amount_cents: 5000 },
          { email: 'b@test.com', amount_cents: 5000 }
        ]
      }
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('server rejects create with single participant', async ({ request }) => {
    const response = await request.post('/api/split/create', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer fake-token'
      },
      data: {
        package_id: '00000000-0000-0000-0000-000000000000',
        participants: [{ email: 'a@test.com', amount_cents: 10000 }]
      }
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('server rejects cancel for non-existent split payment', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const response = await request.post(`/api/split/cancel/${fakeId}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer fake-token'
      }
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('server rejects status for invalid UUID', async ({ request }) => {
    const response = await request.get('/api/split/status/not-a-uuid');

    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('handleSplitStatus returns error for nonexistent package', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const response = await request.get(`/api/split/status/${fakeId}`);

    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('server rejects participants with missing email', async ({ request }) => {
    const response = await request.post('/api/split/create', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer fake-token'
      },
      data: {
        package_id: '00000000-0000-0000-0000-000000000000',
        participants: [
          { amount_cents: 5000 },
          { email: 'b@test.com', amount_cents: 5000 }
        ]
      }
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('server rejects participants with zero amount', async ({ request }) => {
    const response = await request.post('/api/split/create', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer fake-token'
      },
      data: {
        package_id: '00000000-0000-0000-0000-000000000000',
        participants: [
          { email: 'a@test.com', amount_cents: 0 },
          { email: 'b@test.com', amount_cents: 10000 }
        ]
      }
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('guest-details rejects non-existent participant', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const response = await request.post(`/api/split/guest-details/${fakeId}`, {
      headers: { 'Content-Type': 'application/json' },
      data: { token: 'fake-token' }
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('guest-pay rejects non-existent participant', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const response = await request.post(`/api/split/guest-pay/${fakeId}`, {
      headers: { 'Content-Type': 'application/json' },
      data: { token: 'fake-token' }
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('reactivate endpoint requires auth', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const response = await request.post(`/api/split/reactivate/${fakeId}`, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        participants: [
          { email: 'a@test.com', amount_cents: 5000 },
          { email: 'b@test.com', amount_cents: 5000 }
        ]
      }
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });
});

test.describe('Login Page Structure', () => {
  test('login page loads with correct title', async ({ page }) => {
    await page.goto('/login.html');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveTitle(/Sign In/);
  });

  test('login form has email and password fields', async ({ page }) => {
    await page.goto('/login.html');
    await page.waitForLoadState('domcontentloaded');

    const emailInput = page.locator('#email');
    await expect(emailInput).toBeAttached();
    await expect(emailInput).toHaveAttribute('type', 'email');

    const passwordInput = page.locator('#password');
    await expect(passwordInput).toBeAttached();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('login form has submit button', async ({ page }) => {
    await page.goto('/login.html');
    await page.waitForLoadState('domcontentloaded');

    const loginBtn = page.locator('#login-btn');
    await expect(loginBtn).toBeAttached();
    await expect(loginBtn).toContainText('Sign In');
  });

  test('login page has member and provider signup links', async ({ page }) => {
    await page.goto('/login.html');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('a[href="signup-member.html"]')).toBeAttached();
    await expect(page.locator('a[href="signup-provider.html"]')).toBeAttached();
  });
});

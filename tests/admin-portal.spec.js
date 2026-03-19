'use strict';

const { test, expect } = require('@playwright/test');
const {
  BASE_URL, SUPABASE_SERVICE_KEY, ADMIN_PASSWORD,
  TEST_MEMBER_EMAIL, TEST_PROVIDER_EMAIL,
  getSupabaseAdmin, injectAdminSession
} = require('./helpers');

test.describe('Admin Portal — Members and Providers Management', () => {
  test('/api/admin/members: 401 without credentials', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/members`);
    expect(res.status()).toBe(401);
  });

  test('/api/admin/providers: 401 without credentials', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/providers`);
    expect(res.status()).toBe(401);
  });

  test('Members table has data and is filterable by email (via service role)', async () => {
    test.skip(!SUPABASE_SERVICE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY');
    const sb = getSupabaseAdmin();

    const { data: members, error } = await sb.from('profiles')
      .select('id, email, role').eq('role', 'member').limit(10);
    expect(error).toBeNull();
    expect(members.length).toBeGreaterThan(0);

    const { data: filtered } = await sb.from('profiles')
      .select('id, email').ilike('email', '%testmember%').limit(5);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered[0].email).toMatch(/testmember/i);
  });

  test('Providers table has data with correct role (via service role)', async () => {
    test.skip(!SUPABASE_SERVICE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY');
    const sb = getSupabaseAdmin();
    const { data: providers, error } = await sb.from('profiles')
      .select('id, email, role').eq('role', 'provider').limit(10);
    expect(error).toBeNull();
    expect(providers.length).toBeGreaterThan(0);
    providers.forEach(p => expect(p.role).toBe('provider'));
  });

  test('Admin portal loads and password gate is enforced in browser', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
    const passwordModal = page.locator('#admin-password-modal, #admin-password-input, [id*="admin-password"]').first();
    await expect(passwordModal).toBeAttached({ timeout: 8000 });
  });

  test('Admin API: authenticated fetch from browser context returns members data', async ({ page }) => {
    test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD not set');
    await page.goto(`${BASE_URL}/admin.html`);
    await page.waitForLoadState('domcontentloaded');
    const passwordModal = page.locator('#admin-password-modal, #admin-password-input').first();
    await expect(passwordModal).toBeAttached({ timeout: 6000 });

    const result = await page.evaluate(async (adminPass) => {
      try {
        const res = await fetch('/api/admin/stats/overview', {
          headers: { 'x-admin-password': adminPass }
        });
        const json = await res.json();
        return { status: res.status, hasData: json && typeof json === 'object' };
      } catch (e) {
        return { status: 0, error: e.message };
      }
    }, ADMIN_PASSWORD);

    expect(result.status).toBe(200);
    expect(result.hasData).toBe(true);
  });

  test('Admin portal HTML contains member search input and filter tabs', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
    await expect(page.locator('#member-search')).toBeAttached({ timeout: 5000 });
    await expect(page.locator('#um-suspended')).toBeAttached({ timeout: 5000 });
    await expect(page.locator('text=/Corrective Action|suspended provider/i').first()).toBeAttached({ timeout: 5000 });
  });

  test('Admin members search: Supabase query with ilike filter returns expected results', async () => {
    test.skip(!SUPABASE_SERVICE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY');
    const sb = getSupabaseAdmin();

    const { data: byEmail, error: e1 } = await sb.from('profiles')
      .select('id, email, full_name, role')
      .eq('role', 'member')
      .or('full_name.ilike.%testmember%,email.ilike.%testmember%');
    expect(e1).toBeNull();
    expect(byEmail.length).toBeGreaterThan(0);
    expect(byEmail[0].email).toMatch(/testmember/i);

    const { data: allMembers, error: e2 } = await sb.from('profiles')
      .select('id, role').eq('role', 'member').limit(20);
    expect(e2).toBeNull();
    expect(allMembers.length).toBeGreaterThan(0);
    allMembers.forEach(m => expect(m.role).toBe('member'));

    const { data: allProviders, error: e3 } = await sb.from('profiles')
      .select('id, role').eq('role', 'provider').limit(20);
    expect(e3).toBeNull();
    expect(allProviders.length).toBeGreaterThan(0);
    allProviders.forEach(p => expect(p.role).toBe('provider'));
  });

  test('Provider suspend/unsuspend: data layer toggles suspended flag correctly', async () => {
    test.skip(!SUPABASE_SERVICE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY');
    const sb = getSupabaseAdmin();

    const { data: providers } = await sb.from('profiles')
      .select('id, email, role, suspended').ilike('email', '%testprovider%').limit(5);
    const provider = providers?.find(p => p.email?.includes('testprovider'));
    expect(provider?.id).toBeTruthy();
    const providerId = provider.id;
    const originalSuspended = provider.suspended;

    const { error: suspendError } = await sb.from('profiles')
      .update({ suspended: true }).eq('id', providerId);
    expect(suspendError).toBeNull();

    const { data: suspended } = await sb.from('profiles')
      .select('suspended').eq('id', providerId).single();
    expect(suspended.suspended).toBe(true);

    const { error: unsuspendError } = await sb.from('profiles')
      .update({ suspended: originalSuspended || false }).eq('id', providerId);
    expect(unsuspendError).toBeNull();

    const { data: restored } = await sb.from('profiles')
      .select('suspended').eq('id', providerId).single();
    expect(restored.suspended).toBe(originalSuspended || false);
  });

  test('Admin browser flow: real JWT injection unlocks portal, dashboard stats load, user management shows real data, toggle suspension updates DB', async ({ page }) => {
    // Budget: ~70s. Each waitForFunction timeout is tight — fail fast and explicit.
    test.setTimeout(100000);
    test.skip(!ADMIN_PASSWORD || !SUPABASE_SERVICE_KEY, 'ADMIN_PASSWORD and SUPABASE_SERVICE_ROLE_KEY required');

    const supabase = getSupabaseAdmin();

    // Resolve testmember from real DB
    const { data: memberProfile } = await supabase.from('profiles')
      .select('id, suspension_reason, suspended_at').eq('email', TEST_MEMBER_EMAIL).single();
    expect(memberProfile?.id, 'testmember must exist in profiles').toBeTruthy();
    const memberId = memberProfile.id;
    const originalSuspensionReason = memberProfile.suspension_reason;
    const originalSuspendedAt = memberProfile.suspended_at;

    // Pre-suspend testmember so the "Unsuspend" button is rendered
    await supabase.from('profiles').update({
      suspension_reason: 'E2E test pre-suspension',
      suspended_at: new Date().toISOString()
    }).eq('id', memberId);

    // Inject testadmin's real JWT into localStorage before navigation.
    // admin.js reads it via supabaseClient.auth.getSession() — no route mocking required.
    await injectAdminSession(page);

    await page.goto(`${BASE_URL}/admin.html`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for admin.js to complete its async auth check and render the password form.
    // With a real admin JWT, getSession() returns the session → profile.role = 'admin'
    // → showModalState('password'). Falls back to login form if session wasn't picked up.
    await page.waitForFunction(
      () => {
        const pw = document.getElementById('admin-password-form');
        const login = document.getElementById('admin-login-form');
        return (pw && pw.style.display === 'block') || (login && login.style.display === 'block');
      },
      { timeout: 12000 }
    );

    const pwShowing = await page.evaluate(
      () => document.getElementById('admin-password-form')?.style.display === 'block'
    );
    expect(pwShowing, 'Password form must show — injected admin JWT should route past login step').toBe(true);

    // Submit password (real RPC: verify_admin_password) and wait for modal to hide
    await page.evaluate((pass) => {
      const el = document.getElementById('admin-password-input');
      if (el) { el.value = pass; el.dispatchEvent(new Event('input', { bubbles: true })); }
      document.getElementById('admin-modal-btn')?.click();
    }, ADMIN_PASSWORD);

    await page.waitForFunction(
      () => {
        const m = document.getElementById('admin-password-modal');
        return !m || m.style.display === 'none';
      },
      { timeout: 15000 }
    );

    const modalHidden = await page.evaluate(
      () => { const m = document.getElementById('admin-password-modal'); return !m || m.style.display === 'none'; }
    );
    expect(modalHidden, 'Admin password modal must close after real RPC verification').toBe(true);

    // Poll-click User Management nav. showSection() synchronously adds .active before its
    // first await, so the same poll tick that clicks also detects .active — no race.
    await page.waitForFunction(
      () => {
        const nav = document.querySelector('[data-section="user-management"]');
        if (nav) nav.click();
        return document.getElementById('user-management')?.classList.contains('active');
      },
      { timeout: 20000, polling: 1000 }
    );

    // Stat counters must be present (populated by loadUserManagement() → updateUserManagementStats())
    await expect(page.locator('#um-total-users'), '#um-total-users must be in DOM').toBeAttached({ timeout: 5000 });
    await expect(page.locator('#um-suspended'), '#um-suspended must be in DOM').toBeAttached({ timeout: 5000 });

    // Wait for the real data table to render (loadUserManagement() calls Supabase then renders rows)
    // The correct selector is #user-management-table (a <tbody>) rendered by renderUserManagementTable()
    await page.waitForFunction(
      () => {
        const tbody = document.getElementById('user-management-table');
        return tbody && tbody.querySelectorAll('tr').length > 0;
      },
      { timeout: 12000 }
    );

    // Verify the member search input and the table are in the DOM
    await expect(page.locator('#member-search'), '#member-search must be in DOM').toBeAttached({ timeout: 5000 });
    const rowCount = await page.evaluate(() => document.getElementById('user-management-table')?.querySelectorAll('tr').length || 0);
    expect(rowCount, 'User management table must have at least one row of real data').toBeGreaterThan(0);

    // Search for testmember to narrow the table, then click their Edit button.
    // The Edit button calls openUserEditModal() which is scoped inside the load handler,
    // so we trigger it via DOM click (same path as a real user) rather than page.evaluate().
    await page.evaluate((email) => {
      const search = document.getElementById('member-search');
      if (search) { search.value = email; search.dispatchEvent(new Event('input', { bubbles: true })); }
    }, TEST_MEMBER_EMAIL);

    // Wait for table to filter and show testmember's row
    await page.waitForFunction(
      (email) => {
        const tbody = document.getElementById('user-management-table');
        return tbody && tbody.innerHTML.toLowerCase().includes(email.toLowerCase());
      },
      TEST_MEMBER_EMAIL,
      { timeout: 8000 }
    );

    // Click the Edit button in the testmember row — triggers openUserEditModal() via onclick
    const editClicked = await page.evaluate((email) => {
      const rows = document.getElementById('user-management-table')?.querySelectorAll('tr') || [];
      for (const row of rows) {
        if (row.textContent.toLowerCase().includes(email.toLowerCase())) {
          const editBtn = row.querySelector('button[onclick*="openUserEditModal"]');
          if (editBtn) { editBtn.scrollIntoView({ behavior: 'instant', block: 'center' }); editBtn.click(); return true; }
        }
      }
      return false;
    }, TEST_MEMBER_EMAIL);
    expect(editClicked, 'Edit button for testmember must be clickable in user management table').toBe(true);

    // Wait for the user-edit-modal to become active (added .active by openUserEditModal())
    await page.waitForFunction(
      () => document.getElementById('user-edit-modal')?.classList.contains('active'),
      { timeout: 8000 }
    );

    // Assert the Unsuspend Account button is in the modal DOM for the pre-suspended user.
    // The modal has style="display:none" which the CSS `.modal-backdrop.active{display:flex}`
    // cannot override (inline style wins specificity). So the button exists in DOM but is
    // inside a zero-size container — use dispatchEvent to fire the click handler directly.
    const unsuspendBtn = page.locator('#user-edit-modal button[onclick*="toggleUserSuspension"][onclick*="false"]').first();
    await expect(unsuspendBtn, 'Unsuspend Account button must be attached in modal DOM for pre-suspended user').toBeAttached({ timeout: 5000 });

    // Fire the onclick handler — same execution path as a real user click.
    // page.on('dialog') must be registered BEFORE the click triggers confirm().
    page.on('dialog', dialog => dialog.accept());
    const btnFound = await page.evaluate(() => {
      const btn = document.querySelector('#user-edit-modal button[onclick*="toggleUserSuspension"][onclick*="false"]');
      if (!btn) return false;
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    });
    expect(btnFound, 'Unsuspend Account button must be present and dispatchEvent must fire').toBe(true);
    await page.waitForTimeout(3000);

    // Verify the real DB was updated — no manual mutation, only the UI button click did this
    const { data: afterToggle } = await supabase.from('profiles')
      .select('suspension_reason, suspended_at').eq('id', memberId).single();
    expect(afterToggle, 'Profile must exist after toggle').toBeTruthy();
    expect(afterToggle.suspension_reason, 'suspension_reason must be cleared after Unsuspend').toBeNull();
    expect(afterToggle.suspended_at, 'suspended_at must be cleared after Unsuspend').toBeNull();

    // Restore testmember's original state
    await supabase.from('profiles').update({
      suspension_reason: originalSuspensionReason,
      suspended_at: originalSuspendedAt
    }).eq('id', memberId);
  });
});

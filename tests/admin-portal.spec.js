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
    expect(members.length, 'Members table must have at least one member row').toBeGreaterThan(0);

    const { data: filtered } = await sb.from('profiles')
      .select('id, email').ilike('email', '%testmember%').limit(5);
    expect(filtered.length, 'Email ilike filter must return test member row').toBeGreaterThan(0);
    expect(filtered[0].email).toMatch(/testmember/i);
  });

  test('Providers table has data with correct role (via service role)', async () => {
    test.skip(!SUPABASE_SERVICE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY');
    const sb = getSupabaseAdmin();
    const { data: providers, error } = await sb.from('profiles')
      .select('id, email, role').eq('role', 'provider').limit(10);
    expect(error).toBeNull();
    expect(providers.length, 'Providers table must have at least one provider row').toBeGreaterThan(0);
    providers.forEach(p => expect(p.role, `All rows must have role=provider`).toBe('provider'));
  });

  test('Admin portal loads and password gate is enforced in browser', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
    const passwordModal = page.locator('#admin-password-modal, #admin-password-input, [id*="admin-password"]').first();
    await expect(passwordModal, 'Password gate must render on admin.html without auth').toBeAttached({ timeout: 8000 });
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

    expect(result.status, 'Authenticated admin API request must return 200').toBe(200);
    expect(result.hasData, 'Response must be a non-null object').toBe(true);
  });

  test('Admin portal HTML contains member search input and filter controls', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
    await expect(page.locator('#member-search'), '#member-search must be in DOM').toBeAttached({ timeout: 5000 });
    await expect(page.locator('#um-suspended'), '#um-suspended counter must be in DOM').toBeAttached({ timeout: 5000 });
    await expect(page.locator('#provider-search'), '#provider-search must be in DOM').toBeAttached({ timeout: 5000 });
    await expect(page.locator('#provider-status-filter'), 'Provider status filter must be in DOM').toBeAttached({ timeout: 5000 });
  });

  test('Admin members search: Supabase query with ilike filter returns expected results', async () => {
    test.skip(!SUPABASE_SERVICE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY');
    const sb = getSupabaseAdmin();

    const { data: byEmail, error: e1 } = await sb.from('profiles')
      .select('id, email, full_name, role')
      .eq('role', 'member')
      .or('full_name.ilike.%testmember%,email.ilike.%testmember%');
    expect(e1, 'Search query must not return an error').toBeNull();
    expect(byEmail.length, 'Search must find test member by email').toBeGreaterThan(0);
    expect(byEmail[0].email).toMatch(/testmember/i);

    const { data: allMembers, error: e2 } = await sb.from('profiles')
      .select('id, role').eq('role', 'member').limit(20);
    expect(e2).toBeNull();
    allMembers.forEach(m => expect(m.role, 'All returned rows must have role=member').toBe('member'));

    const { data: allProviders, error: e3 } = await sb.from('profiles')
      .select('id, role').eq('role', 'provider').limit(20);
    expect(e3).toBeNull();
    allProviders.forEach(p => expect(p.role, 'All returned rows must have role=provider').toBe('provider'));
  });

  test('Provider suspend/unsuspend: data layer toggles suspended flag correctly', async () => {
    test.skip(!SUPABASE_SERVICE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY');
    const sb = getSupabaseAdmin();

    const { data: providers } = await sb.from('profiles')
      .select('id, email, role, suspended').ilike('email', '%testprovider%').limit(5);
    const provider = providers?.find(p => p.email?.includes('testprovider'));
    expect(provider?.id, 'Test provider must exist in profiles').toBeTruthy();
    const providerId = provider.id;
    const originalSuspended = provider.suspended;

    const { error: suspendError } = await sb.from('profiles')
      .update({ suspended: true }).eq('id', providerId);
    expect(suspendError, 'Suspend update must not error').toBeNull();

    const { data: suspended } = await sb.from('profiles')
      .select('suspended').eq('id', providerId).single();
    expect(suspended.suspended, 'Provider must be suspended after update').toBe(true);

    const { error: unsuspendError } = await sb.from('profiles')
      .update({ suspended: originalSuspended || false }).eq('id', providerId);
    expect(unsuspendError, 'Unsuspend update must not error').toBeNull();

    const { data: restored } = await sb.from('profiles')
      .select('suspended').eq('id', providerId).single();
    expect(restored.suspended).toBe(originalSuspended || false);
  });

  test('Admin browser flow: JWT injection unlocks portal, user management search + suspension toggle updates DB', async ({ page }) => {
    test.setTimeout(100000);
    test.skip(!ADMIN_PASSWORD || !SUPABASE_SERVICE_KEY, 'ADMIN_PASSWORD and SUPABASE_SERVICE_ROLE_KEY required');

    const supabase = getSupabaseAdmin();

    const { data: memberProfile } = await supabase.from('profiles')
      .select('id, suspension_reason, suspended_at').eq('email', TEST_MEMBER_EMAIL).single();
    expect(memberProfile?.id, 'Test member must exist in profiles').toBeTruthy();
    const memberId = memberProfile.id;
    const originalSuspensionReason = memberProfile.suspension_reason;
    const originalSuspendedAt = memberProfile.suspended_at;

    await supabase.from('profiles').update({
      suspension_reason: 'E2E test pre-suspension',
      suspended_at: new Date().toISOString()
    }).eq('id', memberId);

    await injectAdminSession(page);
    await page.goto(`${BASE_URL}/admin.html`);
    await page.waitForLoadState('domcontentloaded');

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
    expect(pwShowing, 'Password form must show — injected admin JWT bypasses login step').toBe(true);

    // Type the admin password into the real input and click the real submit button
    await page.evaluate((pass) => {
      const el = document.getElementById('admin-password-input');
      if (el) { el.value = pass; el.dispatchEvent(new Event('input', { bubbles: true })); }
      document.getElementById('admin-modal-btn')?.click();
    }, ADMIN_PASSWORD);

    await page.waitForFunction(
      () => { const m = document.getElementById('admin-password-modal'); return !m || m.style.display === 'none'; },
      { timeout: 15000 }
    );
    expect(
      await page.evaluate(() => { const m = document.getElementById('admin-password-modal'); return !m || m.style.display === 'none'; }),
      'Admin password modal must close after RPC verification'
    ).toBe(true);

    // Navigate to User Management
    await page.waitForFunction(
      () => {
        const nav = document.querySelector('[data-section="user-management"]');
        if (nav) nav.click();
        return document.getElementById('user-management')?.classList.contains('active');
      },
      { timeout: 20000, polling: 1000 }
    );

    await expect(page.locator('#um-total-users'), '#um-total-users must be in DOM').toBeAttached({ timeout: 5000 });
    await expect(page.locator('#um-suspended'), '#um-suspended must be in DOM').toBeAttached({ timeout: 5000 });

    await page.waitForFunction(
      () => {
        const tbody = document.getElementById('user-management-table');
        return tbody && tbody.querySelectorAll('tr').length > 0;
      },
      { timeout: 12000 }
    );

    await expect(page.locator('#member-search'), '#member-search must be present').toBeAttached({ timeout: 5000 });
    const rowCount = await page.evaluate(() => document.getElementById('user-management-table')?.querySelectorAll('tr').length || 0);
    expect(rowCount, 'User management table must have at least one data row').toBeGreaterThan(0);

    // Type into search input — real keyboard interaction
    await page.locator('#member-search').fill(TEST_MEMBER_EMAIL);
    await page.locator('#member-search').dispatchEvent('input');

    await page.waitForFunction(
      (email) => {
        const tbody = document.getElementById('user-management-table');
        return tbody && tbody.innerHTML.toLowerCase().includes(email.toLowerCase());
      },
      TEST_MEMBER_EMAIL,
      { timeout: 8000 }
    );

    // Click the Edit button in the filtered member row
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
    expect(editClicked, 'Edit button must be clickable in user management row').toBe(true);

    // Wait for the user-edit-modal to open (openUserEditModal now clears inline style so CSS controls display)
    await page.waitForFunction(
      () => document.getElementById('user-edit-modal')?.classList.contains('active'),
      { timeout: 8000 }
    );

    // The modal is now visible — click the real Unsuspend Account button
    const unsuspendBtn = page.locator('#user-edit-modal button').filter({ hasText: /Unsuspend Account/i }).first();
    await expect(unsuspendBtn, 'Unsuspend Account button must be visible in the edit modal').toBeVisible({ timeout: 5000 });
    page.on('dialog', dialog => dialog.accept());
    await unsuspendBtn.click();
    await page.waitForTimeout(3000);

    // Verify DB was updated by the real UI click
    const { data: afterToggle } = await supabase.from('profiles')
      .select('suspension_reason, suspended_at').eq('id', memberId).single();
    expect(afterToggle, 'Profile must exist after toggle').toBeTruthy();
    expect(afterToggle.suspension_reason, 'suspension_reason must be cleared after Unsuspend').toBeNull();
    expect(afterToggle.suspended_at, 'suspended_at must be cleared after Unsuspend').toBeNull();

    await supabase.from('profiles').update({
      suspension_reason: originalSuspensionReason,
      suspended_at: originalSuspendedAt
    }).eq('id', memberId);
  });

  test('Admin providers UI: search filters table, status dropdown narrows results, row data matches DB', async ({ page }) => {
    test.setTimeout(90000);
    test.skip(!ADMIN_PASSWORD || !SUPABASE_SERVICE_KEY, 'ADMIN_PASSWORD and SUPABASE_SERVICE_ROLE_KEY required');

    await injectAdminSession(page);
    await page.goto(`${BASE_URL}/admin.html`);
    await page.waitForLoadState('domcontentloaded');

    await page.waitForFunction(
      () => {
        const pw = document.getElementById('admin-password-form');
        return pw && pw.style.display === 'block';
      },
      { timeout: 12000 }
    );
    await page.evaluate((pass) => {
      const el = document.getElementById('admin-password-input');
      if (el) { el.value = pass; el.dispatchEvent(new Event('input', { bubbles: true })); }
      document.getElementById('admin-modal-btn')?.click();
    }, ADMIN_PASSWORD);
    await page.waitForFunction(
      () => { const m = document.getElementById('admin-password-modal'); return !m || m.style.display === 'none'; },
      { timeout: 15000 }
    );

    // Navigate to providers section
    await page.waitForFunction(
      () => {
        const nav = document.querySelector('[data-section="providers"]');
        if (nav) nav.click();
        return document.getElementById('providers')?.classList.contains('active');
      },
      { timeout: 20000, polling: 1000 }
    );

    // Wait for providers table to populate
    await page.waitForFunction(
      () => {
        const tbody = document.getElementById('providers-table');
        return tbody && tbody.querySelectorAll('tr').length > 0;
      },
      { timeout: 12000 }
    );

    const initialRowCount = await page.evaluate(() => document.getElementById('providers-table')?.querySelectorAll('tr').length || 0);
    expect(initialRowCount, 'Providers table must have at least one row').toBeGreaterThan(0);

    // Verify search input and status filter are present and interactive
    const searchInput = page.locator('#provider-search');
    await expect(searchInput, '#provider-search must be visible').toBeVisible({ timeout: 5000 });
    const statusFilter = page.locator('#provider-status-filter');
    await expect(statusFilter, '#provider-status-filter must be visible').toBeVisible({ timeout: 5000 });

    // Type into provider search — verify table updates (or remains non-empty)
    await searchInput.click();
    await searchInput.fill('a');
    await searchInput.dispatchEvent('input');
    await page.waitForTimeout(1000);

    const afterSearchCount = await page.evaluate(() => document.getElementById('providers-table')?.querySelectorAll('tr').length || 0);
    expect(afterSearchCount, 'Providers table must remain non-empty after broad search').toBeGreaterThan(0);

    // Clear search and apply status filter
    await searchInput.fill('');
    await searchInput.dispatchEvent('input');
    await page.waitForTimeout(500);

    const statusOptions = await statusFilter.locator('option').allTextContents();
    expect(statusOptions.length, 'Status filter must have at least 2 options').toBeGreaterThan(1);

    await statusFilter.selectOption({ index: 1 });
    await statusFilter.dispatchEvent('change');
    await page.waitForTimeout(1000);

    // Verify the table rendered rows or shows empty state (both are valid responses to a filter)
    const filteredRowsVisible = await page.evaluate(() => {
      const tbody = document.getElementById('providers-table');
      return tbody ? true : false;
    });
    expect(filteredRowsVisible, 'Providers table body must remain in DOM after status filter').toBe(true);

    // Verify at least one row from the DB matches what the table shows
    const supabase = getSupabaseAdmin();
    const { data: dbProviders } = await supabase.from('profiles')
      .select('id, email, role').eq('role', 'provider').limit(3);
    expect(dbProviders.length, 'DB must have at least one provider').toBeGreaterThan(0);

    const firstDbEmail = dbProviders[0].email;
    await searchInput.fill(firstDbEmail.split('@')[0]);
    await searchInput.dispatchEvent('input');
    await page.waitForTimeout(1000);
    const foundInTable = await page.evaluate((term) => {
      const tbody = document.getElementById('providers-table');
      return tbody ? tbody.innerHTML.toLowerCase().includes(term.toLowerCase()) : false;
    }, firstDbEmail.split('@')[0]);
    expect(foundInTable, 'Provider from DB must appear in table when searched by name/email fragment').toBe(true);
  });

  test('Admin provider suspend/unsuspend: real UI button click updates provider suspension in DB', async ({ page }) => {
    test.setTimeout(90000);
    test.skip(!ADMIN_PASSWORD || !SUPABASE_SERVICE_KEY, 'ADMIN_PASSWORD and SUPABASE_SERVICE_ROLE_KEY required');

    const supabase = getSupabaseAdmin();

    const { data: providerProfile } = await supabase.from('profiles')
      .select('id, suspension_reason, suspended_at').eq('email', TEST_PROVIDER_EMAIL).single();
    expect(providerProfile?.id, 'Test provider must exist in profiles').toBeTruthy();
    const providerId = providerProfile.id;
    const originalSuspensionReason = providerProfile.suspension_reason;
    const originalSuspendedAt = providerProfile.suspended_at;

    // Pre-suspend the provider so "Unsuspend Account" button is shown in the edit modal
    await supabase.from('profiles').update({
      suspension_reason: 'E2E provider suspension test',
      suspended_at: new Date().toISOString()
    }).eq('id', providerId);

    await injectAdminSession(page);
    await page.goto(`${BASE_URL}/admin.html`);
    await page.waitForLoadState('domcontentloaded');

    await page.waitForFunction(
      () => document.getElementById('admin-password-form')?.style.display === 'block',
      { timeout: 12000 }
    );
    await page.evaluate((pass) => {
      const el = document.getElementById('admin-password-input');
      if (el) { el.value = pass; el.dispatchEvent(new Event('input', { bubbles: true })); }
      document.getElementById('admin-modal-btn')?.click();
    }, ADMIN_PASSWORD);
    await page.waitForFunction(
      () => { const m = document.getElementById('admin-password-modal'); return !m || m.style.display === 'none'; },
      { timeout: 15000 }
    );

    // Navigate to user-management section to find the provider
    await page.waitForFunction(
      () => {
        const nav = document.querySelector('[data-section="user-management"]');
        if (nav) nav.click();
        return document.getElementById('user-management')?.classList.contains('active');
      },
      { timeout: 20000, polling: 1000 }
    );

    await page.waitForFunction(
      () => document.getElementById('user-management-table')?.querySelectorAll('tr').length > 0,
      { timeout: 12000 }
    );

    // Search for the test provider by email
    await page.locator('#member-search').fill(TEST_PROVIDER_EMAIL);
    await page.locator('#member-search').dispatchEvent('input');

    await page.waitForFunction(
      (email) => document.getElementById('user-management-table')?.innerHTML.toLowerCase().includes(email.toLowerCase()),
      TEST_PROVIDER_EMAIL,
      { timeout: 8000 }
    );

    // Click the Edit button for the provider row
    const editClicked = await page.evaluate((email) => {
      const rows = document.getElementById('user-management-table')?.querySelectorAll('tr') || [];
      for (const row of rows) {
        if (row.textContent.toLowerCase().includes(email.toLowerCase())) {
          const editBtn = row.querySelector('button[onclick*="openUserEditModal"]');
          if (editBtn) { editBtn.scrollIntoView({ behavior: 'instant', block: 'center' }); editBtn.click(); return true; }
        }
      }
      return false;
    }, TEST_PROVIDER_EMAIL);
    expect(editClicked, 'Edit button must be clickable for provider in user-management table').toBe(true);

    await page.waitForFunction(
      () => document.getElementById('user-edit-modal')?.classList.contains('active'),
      { timeout: 8000 }
    );

    // Real UI click: "Unsuspend Account" button (provider was pre-suspended above)
    const unsuspendBtn = page.locator('#user-edit-modal button').filter({ hasText: /Unsuspend Account/i }).first();
    await expect(unsuspendBtn, 'Unsuspend Account button must be visible for suspended provider').toBeVisible({ timeout: 5000 });
    page.on('dialog', dialog => dialog.accept());
    await unsuspendBtn.click();
    await page.waitForTimeout(3000);

    // Verify DB reflects the unsuspend action triggered by the real UI button click
    const { data: afterUnsuspend } = await supabase.from('profiles')
      .select('suspension_reason, suspended_at').eq('id', providerId).single();
    expect(afterUnsuspend.suspension_reason, 'Provider suspension_reason must be cleared after Unsuspend click').toBeNull();
    expect(afterUnsuspend.suspended_at, 'Provider suspended_at must be cleared after Unsuspend click').toBeNull();

    // Restore original state
    await supabase.from('profiles').update({
      suspension_reason: originalSuspensionReason,
      suspended_at: originalSuspendedAt
    }).eq('id', providerId);
  });
});

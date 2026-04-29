const { test, expect } = require('@playwright/test');

const FAKE_ADMIN_ID = '00000000-aaaa-bbbb-cccc-000000000099';
const FAKE_ADMIN_EMAIL = 'admin@example.com';
const FAKE_MEMBER_ID = '00000000-aaaa-bbbb-cccc-000000000001';
const FAKE_MEMBER_EMAIL = 'testuser@example.com';
const FAKE_PROVIDER_ID = '00000000-aaaa-bbbb-cccc-000000000002';
const FAKE_PROVIDER_EMAIL = 'provider@example.com';

function createAdminMockJs() {
  const userId = FAKE_ADMIN_ID;
  const email = FAKE_ADMIN_EMAIL;

  return `
    (function() {
      var noopChannel = { on: function() { return this; }, subscribe: function() { return this; }, unsubscribe: function() {} };
      var fakeUser = {
        id: '${userId}',
        email: '${email}',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: 'Admin User' }
      };
      var fakeSession = {
        access_token: 'fake-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'fake-refresh-token',
        user: fakeUser
      };
      var profileData = {
        id: '${userId}',
        full_name: 'Admin User',
        email: '${email}',
        role: 'admin',
        status: 'approved',
        tos_accepted: true
      };

      var mockClient = {
        auth: {
          getSession: function() { return Promise.resolve({ data: { session: fakeSession }, error: null }); },
          getUser: function() { return Promise.resolve({ data: { user: fakeUser }, error: null }); },
          onAuthStateChange: function(cb) {
            setTimeout(function() { cb('SIGNED_IN', fakeSession); }, 10);
            return { data: { subscription: { unsubscribe: function() {} } } };
          },
          signInWithPassword: function() { return Promise.resolve({ data: { session: fakeSession, user: fakeUser }, error: null }); },
          signOut: function() { return Promise.resolve({ error: null }); },
          signUp: function() { return Promise.resolve({ data: null, error: null }); },
          resetPasswordForEmail: function() { return Promise.resolve({ data: null, error: null }); }
        },
        from: function(table) {
          var _table = table;
          var _isSingle = false;
          var _countMode = null;
          var _headMode = false;
          var q = {
            select: function(cols, opts) {
              if (opts && opts.count) _countMode = opts.count;
              if (opts && opts.head) _headMode = true;
              return q;
            },
            insert: function(data) {
              return {
                select: function() {
                  return {
                    single: function() { return Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error: null }); }
                  };
                },
                then: function(resolve) { resolve({ data: data, error: null }); return q; }
              };
            },
            update: function() { return q; },
            delete: function() { return q; },
            eq: function() { return q; },
            neq: function() { return q; },
            in: function() { return q; },
            gt: function() { return q; },
            gte: function() { return q; },
            lt: function() { return q; },
            lte: function() { return q; },
            like: function() { return q; },
            ilike: function() { return q; },
            is: function() { return q; },
            not: function() { return q; },
            or: function() { return q; },
            contains: function() { return q; },
            filter: function() { return q; },
            order: function() { return q; },
            limit: function() { return q; },
            range: function() { return q; },
            single: function() { _isSingle = true; return q; },
            maybeSingle: function() { _isSingle = true; return q; },
            then: function(resolve) {
              var result;
              if (_table === 'profiles') {
                if (_countMode && _headMode) {
                  result = { data: null, error: null, count: 5 };
                } else if (_isSingle) {
                  result = { data: profileData, error: null };
                } else {
                  result = { data: [profileData], error: null, count: 1 };
                }
              } else if (_table === 'provider_applications') {
                if (_countMode && _headMode) {
                  result = { data: null, error: null, count: 3 };
                } else {
                  result = { data: [], error: null, count: 0 };
                }
              } else if (_table === 'disputes') {
                result = { data: null, error: null, count: 2 };
              } else if (_table === 'helpdesk_tickets') {
                result = { data: null, error: null, count: 1 };
              } else if (_table === 'violation_reports') {
                result = { data: null, error: null, count: 0 };
              } else if (_table === 'completed_activity_reviews') {
                result = { data: null, error: null, count: 0 };
              } else if (_table === 'pilot_applications') {
                result = { data: null, error: null, count: 0 };
              } else if (_table === 'member_founder_applications') {
                result = { data: null, error: null, count: 0 };
              } else if (_table === 'founder_payouts') {
                result = { data: null, error: null, count: 0 };
              } else if (_table === 'registration_verifications') {
                result = { data: null, error: null, count: 0 };
              } else {
                if (_isSingle) {
                  result = { data: null, error: null };
                } else {
                  result = { data: [], error: null, count: 0 };
                }
              }
              resolve(result);
              return q;
            },
            catch: function() { return q; }
          };
          return q;
        },
        channel: function() { return noopChannel; },
        removeChannel: function() {},
        rpc: function(fnName) {
          if (fnName === 'verify_admin_password') {
            return Promise.resolve({ data: true, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        storage: { from: function() { return { upload: function() { return Promise.resolve({ data: null, error: null }); }, getPublicUrl: function() { return { data: { publicUrl: '' } }; } }; } },
        functions: { invoke: function() { return Promise.resolve({ data: null, error: null }); } }
      };
      window.supabase = { createClient: function() { return mockClient; } };
    })();
  `;
}

function createMemberMockJs() {
  const userId = FAKE_MEMBER_ID;
  const email = FAKE_MEMBER_EMAIL;

  return `
    (function() {
      var noopChannel = { on: function() { return this; }, subscribe: function() { return this; }, unsubscribe: function() {} };
      var fakeUser = {
        id: '${userId}',
        email: '${email}',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: 'Test User' }
      };
      var fakeSession = {
        access_token: 'fake-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'fake-refresh-token',
        user: fakeUser
      };
      var profileData = {
        id: '${userId}',
        full_name: 'Test User',
        email: '${email}',
        role: 'member',
        zip_code: '10001',
        phone: '5551234567',
        status: 'approved',
        tos_accepted: true,
        referral_code: 'TESTREF123'
      };

      var mockClient = {
        auth: {
          getSession: function() { return Promise.resolve({ data: { session: fakeSession }, error: null }); },
          getUser: function() { return Promise.resolve({ data: { user: fakeUser }, error: null }); },
          onAuthStateChange: function(cb) {
            setTimeout(function() { cb('SIGNED_IN', fakeSession); }, 10);
            return { data: { subscription: { unsubscribe: function() {} } } };
          },
          signInWithPassword: function() { return Promise.resolve({ data: { session: fakeSession, user: fakeUser }, error: null }); },
          signOut: function() { return Promise.resolve({ error: null }); },
          signUp: function() { return Promise.resolve({ data: null, error: null }); },
          resetPasswordForEmail: function() { return Promise.resolve({ data: null, error: null }); }
        },
        from: function(table) {
          var _table = table;
          var _isSingle = false;
          var _countMode = null;
          var _headMode = false;
          var q = {
            select: function(cols, opts) {
              if (opts && opts.count) _countMode = opts.count;
              if (opts && opts.head) _headMode = true;
              return q;
            },
            insert: function(data) {
              return {
                select: function() {
                  return {
                    single: function() { return Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error: null }); }
                  };
                },
                then: function(resolve) { resolve({ data: data, error: null }); return q; }
              };
            },
            update: function() { return q; },
            delete: function() { return q; },
            eq: function() { return q; },
            neq: function() { return q; },
            in: function() { return q; },
            gt: function() { return q; },
            gte: function() { return q; },
            lt: function() { return q; },
            lte: function() { return q; },
            like: function() { return q; },
            ilike: function() { return q; },
            is: function() { return q; },
            not: function() { return q; },
            or: function() { return q; },
            contains: function() { return q; },
            filter: function() { return q; },
            order: function() { return q; },
            limit: function() { return q; },
            range: function() { return q; },
            single: function() { _isSingle = true; return q; },
            maybeSingle: function() { _isSingle = true; return q; },
            then: function(resolve) {
              var result;
              if (_table === 'profiles') {
                if (_countMode && _headMode) {
                  result = { data: null, error: null, count: 4 };
                } else if (_isSingle) {
                  result = { data: profileData, error: null };
                } else {
                  result = { data: [profileData], error: null, count: 1 };
                }
              } else if (_table === 'vehicles') {
                result = { data: [], error: null };
              } else if (_table === 'maintenance_packages') {
                result = { data: [], error: null };
              } else if (_table === 'bids') {
                result = { data: [], error: null };
              } else if (_table === 'tos_acceptance') {
                if (_isSingle) {
                  result = { data: { id: '1', accepted_at: new Date().toISOString() }, error: null };
                } else {
                  result = { data: [{ id: '1', accepted_at: new Date().toISOString() }], error: null, count: 1 };
                }
              } else if (_table === 'reminders') {
                result = { data: [], error: null };
              } else if (_table === 'notifications') {
                result = { data: [], error: null };
              } else {
                if (_isSingle) {
                  result = { data: null, error: null };
                } else {
                  result = { data: [], error: null, count: 0 };
                }
              }
              resolve(result);
              return q;
            },
            catch: function() { return q; }
          };
          return q;
        },
        channel: function() { return noopChannel; },
        removeChannel: function() {},
        rpc: function() { return Promise.resolve({ data: null, error: null }); },
        storage: { from: function() { return { upload: function() { return Promise.resolve({ data: null, error: null }); }, getPublicUrl: function() { return { data: { publicUrl: '' } }; } }; } },
        functions: { invoke: function() { return Promise.resolve({ data: null, error: null }); } }
      };
      window.supabase = { createClient: function() { return mockClient; } };
    })();
  `;
}

function createProviderMockJs() {
  const userId = FAKE_PROVIDER_ID;
  const email = FAKE_PROVIDER_EMAIL;

  return `
    (function() {
      var noopChannel = { on: function() { return this; }, subscribe: function() { return this; }, unsubscribe: function() {} };
      var fakeUser = {
        id: '${userId}',
        email: '${email}',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: 'Test Provider' }
      };
      var fakeSession = {
        access_token: 'fake-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'fake-refresh-token',
        user: fakeUser
      };
      var profileData = {
        id: '${userId}',
        full_name: 'Test Provider',
        email: '${email}',
        role: 'provider',
        zip_code: '10001',
        phone: '5559876543',
        business_name: 'Test Auto Shop',
        service_radius: 25,
        bid_credits: 10,
        free_trial_bids: 5,
        status: 'approved',
        tos_accepted: true,
        referral_code: 'PROVREF456'
      };

      var mockClient = {
        auth: {
          getSession: function() { return Promise.resolve({ data: { session: fakeSession }, error: null }); },
          getUser: function() { return Promise.resolve({ data: { user: fakeUser }, error: null }); },
          onAuthStateChange: function(cb) {
            setTimeout(function() { cb('SIGNED_IN', fakeSession); }, 10);
            return { data: { subscription: { unsubscribe: function() {} } } };
          },
          signInWithPassword: function() { return Promise.resolve({ data: { session: fakeSession, user: fakeUser }, error: null }); },
          signOut: function() { return Promise.resolve({ error: null }); },
          signUp: function() { return Promise.resolve({ data: null, error: null }); },
          resetPasswordForEmail: function() { return Promise.resolve({ data: null, error: null }); }
        },
        from: function(table) {
          var _table = table;
          var _isSingle = false;
          var _countMode = null;
          var _headMode = false;
          var q = {
            select: function(cols, opts) {
              if (opts && opts.count) _countMode = opts.count;
              if (opts && opts.head) _headMode = true;
              return q;
            },
            insert: function(data) {
              return {
                select: function() {
                  return {
                    single: function() { return Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error: null }); }
                  };
                },
                then: function(resolve) { resolve({ data: data, error: null }); return q; }
              };
            },
            update: function() { return q; },
            delete: function() { return q; },
            eq: function() { return q; },
            neq: function() { return q; },
            in: function() { return q; },
            gt: function() { return q; },
            gte: function() { return q; },
            lt: function() { return q; },
            lte: function() { return q; },
            like: function() { return q; },
            ilike: function() { return q; },
            is: function() { return q; },
            not: function() { return q; },
            or: function() { return q; },
            contains: function() { return q; },
            filter: function() { return q; },
            order: function() { return q; },
            limit: function() { return q; },
            range: function() { return q; },
            single: function() { _isSingle = true; return q; },
            maybeSingle: function() { _isSingle = true; return q; },
            then: function(resolve) {
              var result;
              if (_table === 'profiles') {
                if (_isSingle) {
                  result = { data: profileData, error: null };
                } else {
                  result = { data: [profileData], error: null, count: 1 };
                }
              } else if (_table === 'provider_applications') {
                result = { data: [{ id: '1', status: 'approved', user_id: '${userId}' }], error: null, count: 1 };
              } else if (_table === 'tos_acceptance') {
                if (_isSingle) {
                  result = { data: { id: '1', accepted_at: new Date().toISOString() }, error: null };
                } else {
                  result = { data: [{ id: '1', accepted_at: new Date().toISOString() }], error: null, count: 1 };
                }
              } else if (_table === 'bids') {
                result = { data: [], error: null };
              } else if (_table === 'reviews') {
                result = { data: [], error: null, count: 0 };
              } else {
                if (_isSingle) {
                  result = { data: null, error: null };
                } else {
                  result = { data: [], error: null, count: 0 };
                }
              }
              resolve(result);
              return q;
            },
            catch: function() { return q; }
          };
          return q;
        },
        channel: function() { return noopChannel; },
        removeChannel: function() {},
        rpc: function() { return Promise.resolve({ data: null, error: null }); },
        storage: { from: function() { return { upload: function() { return Promise.resolve({ data: null, error: null }); }, getPublicUrl: function() { return { data: { publicUrl: '' } }; } }; } },
        functions: { invoke: function() { return Promise.resolve({ data: null, error: null }); } }
      };
      window.supabase = { createClient: function() { return mockClient; } };
    })();
  `;
}

async function setupCdnMocks(page, mockJs) {
  await page.route('**/@supabase/supabase-js**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: mockJs });
  });
  await page.route('**/js.stripe.com/**', route => route.abort());
  await page.route('**/cdnjs.cloudflare.com/**', route => route.abort());
  await page.route('**/fonts.googleapis.com/**', route => route.abort());
  await page.route('**/fonts.gstatic.com/**', route => route.abort());
  await page.route('**/cdn.jsdelivr.net/npm/chart.js**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.Chart = function(ctx, config) { this.destroy = function() {}; }; window.Chart.register = function() {};'
    });
  });
  await page.route('**/cdn.jsdelivr.net/npm/qrcode**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
  await page.route('**/cdn.jsdelivr.net/npm/qr-creator**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.QrCreator = { render: function() {} };' });
  });
}

async function addAuthToken(page, userId, email, name) {
  await page.addInitScript(({ userId, email, name }) => {
    globalThis.localStorage.setItem('sb-ifbyjxuaclwmadqbjcyp-auth-token', JSON.stringify({
      access_token: 'fake-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'fake-refresh-token',
      user: {
        id: userId,
        email: email,
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: name || 'Test User' }
      }
    }));
  }, { userId, email, name });
}

async function addFunctionStubs(page) {
  await page.addInitScript(() => {
    var noop = function() {};
    var asyncNoop = function() { return Promise.resolve(); };
    globalThis.vehicleRecalls = {};
    globalThis.vehicleRegistrationStatus = {};
    globalThis.checkActiveEmergency = asyncNoop;
    globalThis.updateVehicleSelects = noop;
    globalThis.loadAllVehicleRecalls = noop;
    globalThis.loadDestinationServices = asyncNoop;
    globalThis.loadRecommendations = asyncNoop;
    globalThis.loadServiceHistory = asyncNoop;
    globalThis.loadConversations = asyncNoop;
    globalThis.loadNotifications = asyncNoop;
    globalThis.loadNotificationPreferences = asyncNoop;
    globalThis.loadUpsellRequests = asyncNoop;
    globalThis.setupEventListeners = noop;
    globalThis.setupRealtimeSubscriptions = noop;
    globalThis.renderRecentActivity = noop;
    globalThis.renderPackages = noop;
    globalThis.renderReminders = noop;
    globalThis.loadPackagePaymentStatuses = asyncNoop;
    globalThis.getDismissedReminderIds = function() { return []; };
    globalThis.getSnoozedReminderIds = function() { return []; };
    globalThis.showToast = noop;
    globalThis.escapeHtml = function(text) {
      if (!text) return '';
      return String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
    };
  });
}

async function setupApiMocks(page) {
  await page.route('**/api/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authorized: true, verified: true, connected: false, status: 'clear', success: true, enabled: false })
    });
  });
}

async function setupProviderApiMocks(page) {
  await page.route('**/api/**', route => {
    const url = route.request().url();
    if (url.includes('/api/provider/packages')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ packages: [] })
      });
    } else if (url.includes('/api/member/') && url.includes('/referral-code')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, referral_code: 'TESTREF123' })
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authorized: true, verified: true, connected: false, status: 'clear', success: true, enabled: false })
      });
    }
  });
}

async function setupMemberApiMocks(page) {
  await page.route('**/api/**', route => {
    const url = route.request().url();
    if (url.includes('/api/member/') && url.includes('/referral-code')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, referral_code: 'TESTREF123' })
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authorized: true, verified: true, connected: false, status: 'clear', success: true, enabled: false })
      });
    }
  });
}

async function setupAdminPage(page) {
  const mockJs = createAdminMockJs();
  await setupCdnMocks(page, mockJs);
  await setupApiMocks(page);
  await addAuthToken(page, FAKE_ADMIN_ID, FAKE_ADMIN_EMAIL, 'Admin User');

  await page.goto('/admin.html');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  const passwordModal = page.locator('#admin-password-modal');
  const isVisible = await passwordModal.isVisible().catch(() => false);
  if (isVisible) {
    await page.fill('#admin-password-input', 'admin123');
    await page.click('#admin-modal-btn');
    await page.waitForTimeout(1500);
  }
}

test.describe('Admin Dashboard', () => {
  test('Admin dashboard loads with all navigation sections', async ({ page }) => {
    await setupAdminPage(page);

    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toBeAttached({ timeout: 10000 });

    const expectedSections = ['dashboard', 'analytics', 'providers', 'packages', 'commission-payouts', 'members'];
    for (const section of expectedSections) {
      const navItem = page.locator(`.nav-item[data-section="${section}"]`);
      await expect(navItem).toBeAttached({ timeout: 5000 });
    }

    const dashboardSection = page.locator('#dashboard');
    await expect(dashboardSection).toHaveClass(/active/, { timeout: 5000 });

    const dashboardNavItem = page.locator('.nav-item[data-section="dashboard"]');
    await expect(dashboardNavItem).toHaveClass(/active/, { timeout: 5000 });
  });

  test('Admin user management section exists', async ({ page }) => {
    await setupAdminPage(page);

    await page.evaluate(() => {
      if (typeof showSection === 'function') showSection('members');
    });
    await page.waitForTimeout(1000);

    const membersSection = page.locator('#members');
    await expect(membersSection).toHaveClass(/active/, { timeout: 5000 });

    const membersTable = page.locator('#members-table');
    await expect(membersTable).toBeAttached();

    const tableHeaders = page.locator('#members th');
    const headerCount = await tableHeaders.count();
    expect(headerCount).toBeGreaterThanOrEqual(4);

    const searchInput = page.locator('#member-search');
    await expect(searchInput).toBeAttached();

    const filterSelect = page.locator('#member-type-filter');
    await expect(filterSelect).toBeAttached();
  });

  test('Admin provider management section exists', async ({ page }) => {
    await setupAdminPage(page);

    await page.evaluate(() => {
      if (typeof showSection === 'function') showSection('providers');
    });
    await page.waitForTimeout(1000);

    const providersSection = page.locator('#providers');
    await expect(providersSection).toHaveClass(/active/, { timeout: 5000 });

    const providerStatusFilter = page.locator('#provider-status-filter');
    await expect(providerStatusFilter).toBeAttached();

    const filterOptions = await providerStatusFilter.locator('option').allTextContents();
    expect(filterOptions.some(opt => opt.toLowerCase().includes('active'))).toBeTruthy();
    expect(filterOptions.some(opt => opt.toLowerCase().includes('suspended'))).toBeTruthy();

    const bulkSuspendBtn = page.locator('button:has-text("Suspend")');
    await expect(bulkSuspendBtn).toBeAttached();

    const bulkActivateBtn = page.locator('button:has-text("Activate")');
    await expect(bulkActivateBtn).toBeAttached();
  });

  test('Admin API endpoints require authentication', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');

    const providersResult = await page.evaluate(async () => {
      const res = await fetch('/api/admin/providers');
      return { status: res.status };
    });
    expect([401, 403]).toContain(providersResult.status);

    const membersResult = await page.evaluate(async () => {
      const res = await fetch('/api/admin/members');
      return { status: res.status };
    });
    expect([401, 403]).toContain(membersResult.status);

    const packagesResult = await page.evaluate(async () => {
      const res = await fetch('/api/admin/packages');
      return { status: res.status };
    });
    expect([401, 403]).toContain(packagesResult.status);
  });
});

test.describe('Referral System', () => {
  test('Member referral section exists on dashboard', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupMemberApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL, 'Test User');
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const referralNavItem = page.locator('.nav-item[data-section="referrals"]');
    await expect(referralNavItem).toBeAttached({ timeout: 5000 });

    await page.evaluate(() => {
      if (typeof showSection === 'function') showSection('referrals');
    });
    await page.waitForTimeout(1500);

    const referralsSection = page.locator('#referrals');
    await expect(referralsSection).toBeAttached();

    const referralCodeDisplay = page.locator('#referral-code-display');
    await expect(referralCodeDisplay).toBeAttached();
  });

  test('Provider referral section exists', async ({ page }) => {
    const mockJs = createProviderMockJs();
    await setupCdnMocks(page, mockJs);
    await setupProviderApiMocks(page);
    await addAuthToken(page, FAKE_PROVIDER_ID, FAKE_PROVIDER_EMAIL, 'Test Provider');
    await addFunctionStubs(page);

    await page.goto('/providers.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const referralNavItem = page.locator('.nav-item[data-section="refer-providers"]');
    await expect(referralNavItem).toBeAttached({ timeout: 5000 });

    await page.evaluate(() => {
      if (typeof showSection === 'function') showSection('refer-providers');
    });
    await page.waitForTimeout(1500);

    const referProviderSection = page.locator('#refer-providers');
    await expect(referProviderSection).toBeAttached();

    const providerReferralCode = page.locator('#provider-referral-code');
    await expect(providerReferralCode).toBeAttached();

    const referralContent = page.locator('#referral-content');
    await expect(referralContent).toBeAttached();
  });

  test('Referral API endpoints require authentication', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');

    const applyResult = await page.evaluate(async () => {
      const res = await fetch('/api/referral/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referral_code: 'TESTCODE' })
      });
      return { status: res.status };
    });
    expect([401, 403]).toContain(applyResult.status);

    const completeResult = await page.evaluate(async () => {
      const res = await fetch('/api/referral/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referral_id: 'test-id' })
      });
      return { status: res.status };
    });
    expect([401, 403]).toContain(completeResult.status);
  });
});

test.describe('Email Services', () => {
  test('Email service endpoints require authentication', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');

    const welcomeEmailResult = await page.evaluate(async () => {
      const res = await fetch('/api/email/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: 'test-user' })
      });
      return { status: res.status };
    });
    expect([401, 403]).toContain(welcomeEmailResult.status);

    const founderEmailResult = await page.evaluate(async () => {
      const res = await fetch('/api/email/founder-approved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ founder_id: 'test-founder' })
      });
      return { status: res.status };
    });
    expect([401, 403]).toContain(founderEmailResult.status);
  });

  test('Admin email trigger endpoints require authentication', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');

    const maintenanceRemindersResult = await page.evaluate(async () => {
      const res = await fetch('/api/admin/trigger-maintenance-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      return { status: res.status };
    });
    expect([401, 403]).toContain(maintenanceRemindersResult.status);

    const bulkWelcomeResult = await page.evaluate(async () => {
      const res = await fetch('/api/admin/send-bulk-welcome-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      return { status: res.status };
    });
    expect([401, 403]).toContain(bulkWelcomeResult.status);
  });
});

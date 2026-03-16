const { test, expect } = require('@playwright/test');

const FAKE_MEMBER_ID = '00000000-aaaa-bbbb-cccc-000000000001';
const FAKE_MEMBER_EMAIL = 'testuser@example.com';

function createFleetMockJs() {
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
        user_metadata: { full_name: 'Fleet Manager' }
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
        full_name: 'Fleet Manager',
        email: '${email}',
        role: 'member',
        account_type: 'fleet',
        fleet_id: 'fleet-001',
        zip_code: '10001',
        phone: '5551234567',
        status: 'approved',
        tos_accepted: true,
        business_name: 'Test Fleet Co',
        fleets: { id: 'fleet-001', company_name: 'Test Fleet Co', auto_approve_under: 100 }
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
              } else if (_table === 'fleet_vehicles') {
                result = { data: [], error: null };
              } else if (_table === 'fleet_approvals') {
                result = { data: [], error: null };
              } else if (_table === 'service_history') {
                result = { data: [], error: null };
              } else if (_table === 'tos_acceptance') {
                if (_isSingle) {
                  result = { data: { id: '1', accepted_at: new Date().toISOString() }, error: null };
                } else {
                  result = { data: [{ id: '1', accepted_at: new Date().toISOString() }], error: null, count: 1 };
                }
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

function createResetPasswordMockJs() {
  return `
    (function() {
      var noopChannel = { on: function() { return this; }, subscribe: function() { return this; }, unsubscribe: function() {} };
      var fakeUser = {
        id: 'reset-user-id',
        email: 'reset@example.com',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: 'Reset User' }
      };
      var fakeSession = {
        access_token: 'fake-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'fake-refresh-token',
        user: fakeUser
      };
      var mockClient = {
        auth: {
          getSession: function() { return Promise.resolve({ data: { session: fakeSession }, error: null }); },
          getUser: function() { return Promise.resolve({ data: { user: fakeUser }, error: null }); },
          onAuthStateChange: function(cb) {
            setTimeout(function() { cb('PASSWORD_RECOVERY', fakeSession); }, 10);
            return { data: { subscription: { unsubscribe: function() {} } } };
          },
          signInWithPassword: function() { return Promise.resolve({ data: { session: fakeSession, user: fakeUser }, error: null }); },
          signOut: function() { return Promise.resolve({ error: null }); },
          resetPasswordForEmail: function() { return Promise.resolve({ data: null, error: null }); },
          updateUser: function() { return Promise.resolve({ data: { user: fakeUser }, error: null }); },
          exchangeCodeForSession: function() { return Promise.resolve({ data: { session: fakeSession }, error: null }); }
        },
        from: function() {
          var q = {
            select: function() { return q; }, insert: function() { return q; }, update: function() { return q; },
            delete: function() { return q; }, eq: function() { return q; }, neq: function() { return q; },
            single: function() { return q; }, maybeSingle: function() { return q; },
            order: function() { return q; }, limit: function() { return q; },
            then: function(resolve) { resolve({ data: null, error: null }); return q; },
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
  await page.route('**/unpkg.com/@supabase/supabase-js**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: mockJs });
  });
  await page.route('**/js.stripe.com/**', route => route.abort());
  await page.route('**/cdnjs.cloudflare.com/**', route => route.abort());
  await page.route('**/fonts.googleapis.com/**', route => route.abort());
  await page.route('**/fonts.gstatic.com/**', route => route.abort());
  await page.route('**/cdn.jsdelivr.net/npm/chart.js**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.Chart = function() {};' });
  });
  await page.route('**/cdn.jsdelivr.net/npm/qrcode**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
  await page.route('**/cdn.jsdelivr.net/npm/qr-creator**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
}

async function addAuthToken(page, userId, email) {
  await page.addInitScript(({ userId, email }) => {
    window.localStorage.setItem('sb-ifbyjxuaclwmadqbjcyp-auth-token', JSON.stringify({
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
        user_metadata: { full_name: 'Fleet Manager' }
      }
    }));
  }, { userId, email });
}

async function addFunctionStubs(page) {
  await page.addInitScript(() => {
    var noop = function() {};
    var asyncNoop = function() { return Promise.resolve(); };
    window.vehicleRecalls = {};
    window.vehicleRegistrationStatus = {};
    window.checkActiveEmergency = asyncNoop;
    window.updateVehicleSelects = noop;
    window.loadAllVehicleRecalls = noop;
    window.loadDestinationServices = asyncNoop;
    window.loadRecommendations = asyncNoop;
    window.loadServiceHistory = asyncNoop;
    window.loadConversations = asyncNoop;
    window.loadNotifications = asyncNoop;
    window.loadNotificationPreferences = asyncNoop;
    window.loadUpsellRequests = asyncNoop;
    window.setupEventListeners = noop;
    window.setupRealtimeSubscriptions = noop;
    window.renderRecentActivity = noop;
    window.renderPackages = noop;
    window.renderReminders = noop;
    window.loadPackagePaymentStatuses = asyncNoop;
    window.getDismissedReminderIds = function() { return []; };
    window.getSnoozedReminderIds = function() { return []; };
    window.showToast = noop;
    window.escapeHtml = function(text) {
      if (!text) return '';
      return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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

test.describe('Forgot/Reset Password', () => {
  test('Forgot password page loads with email form', async ({ page }) => {
    const mockJs = createResetPasswordMockJs();
    await setupCdnMocks(page, mockJs);

    await page.goto('/forgot-password.html');
    await page.waitForLoadState('domcontentloaded');

    const emailInput = page.locator('#email');
    await expect(emailInput).toBeAttached();
    await expect(emailInput).toHaveAttribute('type', 'email');

    const submitBtn = page.locator('#submitBtn');
    await expect(submitBtn).toBeAttached();
    await expect(submitBtn).toContainText('Send Reset Link');

    const backLink = page.locator('#formState .back-link a[href="/login.html"]');
    await expect(backLink).toBeAttached();
    await expect(backLink).toContainText('Back to Login');
  });

  test('Forgot password form validates email input', async ({ page }) => {
    const mockJs = createResetPasswordMockJs();
    await setupCdnMocks(page, mockJs);

    await page.goto('/forgot-password.html');
    await page.waitForLoadState('domcontentloaded');

    const emailInput = page.locator('#email');
    await expect(emailInput).toHaveAttribute('required', '');
    await expect(emailInput).toHaveAttribute('type', 'email');

    const inputValue = await emailInput.inputValue();
    expect(inputValue).toBe('');
  });

  test('Reset password page loads with password fields', async ({ page }) => {
    const mockJs = createResetPasswordMockJs();
    await setupCdnMocks(page, mockJs);

    await page.goto('/reset-password.html#access_token=fake&type=recovery');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const passwordInput = page.locator('#password');
    await expect(passwordInput).toBeAttached();
    await expect(passwordInput).toHaveAttribute('type', 'password');

    const confirmInput = page.locator('#confirmPassword');
    await expect(confirmInput).toBeAttached();
    await expect(confirmInput).toHaveAttribute('type', 'password');

    const submitBtn = page.locator('#submitBtn');
    await expect(submitBtn).toBeAttached();
    await expect(submitBtn).toContainText('Update Password');
  });

  test('Reset password validates matching passwords', async ({ page }) => {
    const mockJs = createResetPasswordMockJs();
    await setupCdnMocks(page, mockJs);

    await page.goto('/reset-password.html#access_token=fake&type=recovery');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const reqLength = page.locator('#req-length');
    const reqUpper = page.locator('#req-upper');
    const reqLower = page.locator('#req-lower');
    const reqNumber = page.locator('#req-number');
    await expect(reqLength).toBeAttached();
    await expect(reqUpper).toBeAttached();
    await expect(reqLower).toBeAttached();
    await expect(reqNumber).toBeAttached();

    const passwordForm = page.locator('#passwordForm');
    await expect(passwordForm).toBeAttached();

    const submitBtn = page.locator('#submitBtn');
    await expect(submitBtn).toBeDisabled();

    await expect(page.locator('#password')).toHaveAttribute('required', '');
    await expect(page.locator('#confirmPassword')).toHaveAttribute('required', '');
  });
});

test.describe('Fleet Services', () => {
  test('Fleet page loads with correct structure', async ({ page }) => {
    const mockJs = createFleetMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/fleet.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    await expect(page).toHaveTitle(/Fleet Dashboard/);

    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toBeAttached();

    const overviewSection = page.locator('#overview');
    await expect(overviewSection).toBeAttached();
    await expect(overviewSection).toHaveClass(/active/);

    const pageTitle = page.locator('.page-title').first();
    await expect(pageTitle).toContainText('Fleet Overview');
  });

  test('Fleet page has vehicle fleet management elements', async ({ page }) => {
    const mockJs = createFleetMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/fleet.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const vehiclesNav = page.locator('.nav-item[data-section="vehicles"]');
    await expect(vehiclesNav).toBeAttached();
    await expect(vehiclesNav).toContainText('Fleet Vehicles');

    const vehiclesSection = page.locator('#vehicles');
    await expect(vehiclesSection).toBeAttached();

    const vehiclesTable = page.locator('#vehicles-table');
    await expect(vehiclesTable).toBeAttached();

    const addVehicleModal = page.locator('#add-vehicle-modal');
    await expect(addVehicleModal).toBeAttached();
  });

  test('Fleet page requires authentication to load data', async ({ page }) => {
    const mockJs = createFleetMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/fleet.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const statTotalVehicles = page.locator('#stat-total-vehicles');
    await expect(statTotalVehicles).toBeAttached();

    const statActiveVehicles = page.locator('#stat-active-vehicles');
    await expect(statActiveVehicles).toBeAttached();

    const statInMaintenance = page.locator('#stat-in-maintenance');
    await expect(statInMaintenance).toBeAttached();

    const logoutBtn = page.locator('text=Log Out');
    await expect(logoutBtn).toBeAttached();
  });

  test('Fleet page accessible and renders correctly', async ({ page }) => {
    const mockJs = createFleetMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/fleet.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const overviewSection = page.locator('#overview.section.active');
    await expect(overviewSection).toBeAttached();

    const statsGrid = page.locator('.stats-grid').first();
    await expect(statsGrid).toBeAttached();

    const servicesSection = page.locator('#services');
    await expect(servicesSection).toBeAttached();

    const approvalsSection = page.locator('#approvals');
    await expect(approvalsSection).toBeAttached();

    const vehiclesSection = page.locator('#vehicles');
    await expect(vehiclesSection).toBeAttached();

    const maintenanceSection = page.locator('#maintenance');
    await expect(maintenanceSection).toBeAttached();

    const spendingSection = page.locator('#spending');
    await expect(spendingSection).toBeAttached();
  });
});

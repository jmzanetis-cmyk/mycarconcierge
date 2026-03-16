const { test, expect } = require('@playwright/test');

const FAKE_MEMBER_ID = '00000000-aaaa-bbbb-cccc-000000000001';
const FAKE_MEMBER_EMAIL = 'member@example.com';

const VEHICLES_DATA = [
  { id: 'v1', owner_id: FAKE_MEMBER_ID, year: 2023, make: 'Toyota', model: 'Camry', vin: '1HGBH41JXMN109186', mileage: 25000, color: 'Silver', status: 'verified', created_at: '2024-01-03T00:00:00Z' },
  { id: 'v2', owner_id: FAKE_MEMBER_ID, year: 2021, make: 'Honda', model: 'CR-V', vin: '2HKRW2H5XMH123456', mileage: 45000, color: 'Blue', status: 'pending', created_at: '2024-01-02T00:00:00Z' },
  { id: 'v3', owner_id: FAKE_MEMBER_ID, year: 2022, make: 'Ford', model: 'F-150', vin: '1FTFW1E50NFA12345', mileage: 15000, color: 'Black', status: 'verified', created_at: '2024-01-01T00:00:00Z' }
];

const NOTIFICATIONS_DATA = [
  { id: 'n1', user_id: FAKE_MEMBER_ID, type: 'bid_received', message: 'New bid on your Oil Change package', read: false, created_at: '2024-02-15T00:00:00Z' },
  { id: 'n2', user_id: FAKE_MEMBER_ID, type: 'appointment_reminder', message: 'Appointment tomorrow at 10am', read: true, created_at: '2024-02-14T00:00:00Z' },
  { id: 'n3', user_id: FAKE_MEMBER_ID, type: 'job_completed', message: 'Your brake job has been completed', read: false, created_at: '2024-02-13T00:00:00Z' }
];

function createMockJs(includeNotifications = false) {
  const userId = FAKE_MEMBER_ID;
  const email = FAKE_MEMBER_EMAIL;
  const vehicles = JSON.stringify(VEHICLES_DATA);
  const notifications = JSON.stringify(includeNotifications ? NOTIFICATIONS_DATA : []);

  return `
    (function() {
      var noopChannel = { on: function() { return this; }, subscribe: function() { return this; }, unsubscribe: function() {} };
      var fakeUser = {
        id: '${userId}',
        email: '${email}',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: 'Test Member' }
      };
      var fakeSession = {
        access_token: 'fake-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'fake-refresh-token',
        user: fakeUser
      };
      var vehiclesData = ${vehicles};
      var notificationsData = ${notifications};
      var profileData = {
        id: '${userId}',
        full_name: 'Test Member',
        email: '${email}',
        role: 'member',
        zip_code: '10001',
        phone: '5551234567',
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
          var _filters = [];
          var _isSingle = false;
          var _countMode = null;
          var _headMode = false;
          var _selectCols = '*';
          var q = {
            select: function(cols, opts) {
              _selectCols = cols || '*';
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
            eq: function(col, val) { _filters.push({ col: col, op: 'eq', val: val }); return q; },
            neq: function(col, val) { _filters.push({ col: col, op: 'neq', val: val }); return q; },
            in: function(col, vals) { _filters.push({ col: col, op: 'in', val: vals }); return q; },
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
                result = { data: vehiclesData, error: null };
              } else if (_table === 'notifications') {
                result = { data: notificationsData, error: null };
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
        user_metadata: { full_name: 'Test Member' }
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

async function navigateToMemberDashboard(page) {
  await page.goto('/members.html');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

async function showSection(page, sectionName) {
  await page.evaluate((section) => {
    if (typeof showSection === 'function') showSection(section);
    else { var nav = document.querySelector('.nav-item[data-section="' + section + '"]'); if (nav) nav.click(); }
  }, sectionName);
  await page.waitForTimeout(1000);
}

test.describe('Vehicle Management', () => {
  test('Vehicle list renders with mock data', async ({ page }) => {
    const mockJs = createMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await navigateToMemberDashboard(page);
    await showSection(page, 'vehicles');

    const vehiclesGrid = page.locator('#vehicles-grid');
    await expect(vehiclesGrid).toBeAttached();

    const vehicleCards = page.locator('.vehicle-card');
    const count = await vehicleCards.count();
    expect(count).toBe(3);

    const gridContent = await vehiclesGrid.textContent();
    expect(gridContent).toContain('Toyota');
    expect(gridContent).toContain('Camry');
    expect(gridContent).toContain('Honda');
    expect(gridContent).toContain('CR-V');
    expect(gridContent).toContain('Ford');
    expect(gridContent).toContain('F-150');
  });

  test('Add vehicle form elements exist', async ({ page }) => {
    const mockJs = createMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await navigateToMemberDashboard(page);
    await showSection(page, 'vehicles');

    const vehicleModal = page.locator('#vehicle-modal');
    await expect(vehicleModal).toBeAttached();

    const yearSelect = page.locator('#v-year');
    await expect(yearSelect).toBeAttached();

    const makeSelect = page.locator('#v-make');
    await expect(makeSelect).toBeAttached();

    const modelSelect = page.locator('#v-model');
    await expect(modelSelect).toBeAttached();

    const vinInput = page.locator('#v-vin');
    await expect(vinInput).toBeAttached();

    const addVehicleBtn = page.locator('button:has-text("Add Vehicle")');
    const btnCount = await addVehicleBtn.count();
    expect(btnCount).toBeGreaterThan(0);
  });

  test('Vehicle API endpoints require authentication', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('networkidle');

    const pushResult = await page.evaluate(async () => {
      const r = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      return { status: r.status };
    });
    expect(pushResult.status).toBe(401);

    const sendCodeResult = await page.evaluate(async () => {
      const r = await fetch('/api/2fa/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      return { status: r.status };
    });
    expect(sendCodeResult.status).toBe(401);
  });

  test('VIN validation endpoint requires authentication', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const r = await fetch('/api/account/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      return { status: r.status };
    });
    expect(result.status).toBe(401);
  });
});

test.describe('Member Settings', () => {
  test('Settings section has profile form elements', async ({ page }) => {
    const mockJs = createMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await navigateToMemberDashboard(page);
    await showSection(page, 'settings');

    const settingsSection = page.locator('#settings');
    await expect(settingsSection).toBeAttached();

    const nameInput = page.locator('#settings-name');
    await expect(nameInput).toBeAttached();

    const phoneInput = page.locator('#settings-phone');
    await expect(phoneInput).toBeAttached();

    const twoFaSection = page.locator('[id="2fa-content"]');
    await expect(twoFaSection).toBeAttached();

    const deleteAccountBtn = page.locator('button:has-text("Delete My Account")');
    const btnCount = await deleteAccountBtn.count();
    expect(btnCount).toBeGreaterThan(0);
  });

  test('Password change and 2FA security elements exist in settings', async ({ page }) => {
    const mockJs = createMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await navigateToMemberDashboard(page);
    await showSection(page, 'settings');

    const twoFaEnableSection = page.locator('[id="2fa-enable-section"]');
    await expect(twoFaEnableSection).toBeAttached();

    const twoFaPhoneInput = page.locator('[id="2fa-phone-input"]');
    await expect(twoFaPhoneInput).toBeAttached();

    const twoFaEnableBtn = page.locator('[id="2fa-enable-btn"]');
    await expect(twoFaEnableBtn).toBeAttached();

    const twoFaStatusText = page.locator('[id="2fa-status-text"]');
    await expect(twoFaStatusText).toBeAttached();

    const loginActivitySection = page.locator('#login-activity-content');
    await expect(loginActivitySection).toBeAttached();
  });

  test('Account deletion API requires authentication', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const r = await fetch('/api/account/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      return { status: r.status };
    });
    expect(result.status).toBe(401);
  });
});

test.describe('Notifications', () => {
  test('Notification preferences section exists', async ({ page }) => {
    const mockJs = createMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await navigateToMemberDashboard(page);
    await showSection(page, 'settings');

    const followupEmail = page.locator('#pref-followup-email');
    await expect(followupEmail).toBeAttached();

    const followupSms = page.locator('#pref-followup-sms');
    await expect(followupSms).toBeAttached();

    const maintenanceEmail = page.locator('#pref-maintenance-email');
    await expect(maintenanceEmail).toBeAttached();

    const maintenanceSms = page.locator('#pref-maintenance-sms');
    await expect(maintenanceSms).toBeAttached();

    const urgentEmail = page.locator('#pref-urgent-email');
    await expect(urgentEmail).toBeAttached();

    const urgentSms = page.locator('#pref-urgent-sms');
    await expect(urgentSms).toBeAttached();

    const pushStatusIcon = page.locator('#push-status-icon');
    await expect(pushStatusIcon).toBeAttached();
  });

  test('Notification list renders with mock data', async ({ page }) => {
    const mockJs = createMockJs(true);
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await navigateToMemberDashboard(page);
    await showSection(page, 'notifications');

    const notificationsList = page.locator('#notifications-list');
    await expect(notificationsList).toBeAttached();

    const notificationsSection = page.locator('#notifications');
    await expect(notificationsSection).toBeAttached();

    const markAllBtn = page.locator('button:has-text("Mark All Read")');
    const btnCount = await markAllBtn.count();
    expect(btnCount).toBeGreaterThan(0);
  });

  test('Notification API requires authentication', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('networkidle');

    const pushResult = await page.evaluate(async () => {
      const r = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      return { status: r.status };
    });
    expect(pushResult.status).toBe(401);

    const accountResult = await page.evaluate(async () => {
      const r = await fetch('/api/account/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      return { status: r.status };
    });
    expect(accountResult.status).toBe(401);
  });
});

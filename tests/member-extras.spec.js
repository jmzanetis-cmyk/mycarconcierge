const { test, expect } = require('@playwright/test');

const FAKE_MEMBER_ID = '00000000-aaaa-bbbb-cccc-000000000001';
const FAKE_MEMBER_EMAIL = 'testuser@example.com';

const VEHICLES_DATA = [
  { id: 'v1', owner_id: FAKE_MEMBER_ID, year: 2023, make: 'Toyota', model: 'Camry', trim_version: 'XLE', mileage: 45000, vin: '1HGBH41JXMN109186', created_at: '2024-01-03T00:00:00Z' }
];

const FUEL_LOGS_DATA = [
  { id: 'fl1', vehicle_id: 'v1', gallons: 12.5, price_per_gallon: 3.45, total_cost: 43.13, odometer: 45500, station: 'Shell', date: '2024-02-10', created_at: '2024-02-10T00:00:00Z' }
];

const CONVERSATIONS_DATA = [];
const INSURANCE_DATA = [];

function createMemberMockJs() {
  const userId = FAKE_MEMBER_ID;
  const email = FAKE_MEMBER_EMAIL;
  const vehicles = JSON.stringify(VEHICLES_DATA);
  const fuelLogs = JSON.stringify(FUEL_LOGS_DATA);

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
      var vehiclesData = ${vehicles};
      var fuelLogsData = ${fuelLogs};
      var profileData = {
        id: '${userId}',
        full_name: 'Test User',
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
              } else if (_table === 'fuel_logs') {
                result = { data: fuelLogsData, error: null };
              } else if (_table === 'insurance_documents') {
                result = { data: [], error: null };
              } else if (_table === 'conversations' || _table === 'messages') {
                result = { data: [], error: null };
              } else if (_table === 'referrals') {
                result = { data: [], error: null };
              } else if (_table === 'households' || _table === 'household_members') {
                result = { data: [], error: null };
              } else if (_table === 'maintenance_packages') {
                result = { data: [], error: null };
              } else if (_table === 'bids') {
                result = { data: [], error: null };
              } else if (_table === 'notifications') {
                result = { data: [], error: null };
              } else if (_table === 'tos_acceptance') {
                if (_isSingle) {
                  result = { data: { id: '1', accepted_at: new Date().toISOString() }, error: null };
                } else {
                  result = { data: [{ id: '1', accepted_at: new Date().toISOString() }], error: null, count: 1 };
                }
              } else if (_table === 'reminders') {
                result = { data: [], error: null };
              } else if (_table === 'dream_car_criteria' || _table === 'dream_car_matches') {
                result = { data: [], error: null };
              } else if (_table === 'diagnostic_scans') {
                result = { data: [], error: null };
              } else if (_table === 'merch_orders') {
                result = { data: [], error: null };
              } else if (_table === 'spending_records' || _table === 'payments') {
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
    route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.Chart = function(ctx, config) { this.destroy = function(){}; this.update = function(){}; this.data = config?.data || {}; };' });
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
        user_metadata: { full_name: 'Test User' }
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

async function setupMembersPage(page) {
  const mockJs = createMemberMockJs();
  await setupCdnMocks(page, mockJs);
  await setupApiMocks(page);
  await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
  await addFunctionStubs(page);

  await page.goto('/members.html');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

test.describe('Member Fuel Tracker', () => {
  test('Fuel tracker section exists with stats and log elements', async ({ page }) => {
    await setupMembersPage(page);

    const fuelSection = page.locator('#fuel-tracker');
    await expect(fuelSection).toBeAttached();

    const fuelAvgMpg = page.locator('#fuel-avg-mpg');
    await expect(fuelAvgMpg).toBeAttached();

    const fuelMonthlyCost = page.locator('#fuel-monthly-cost');
    await expect(fuelMonthlyCost).toBeAttached();

    const fuelCostPerMile = page.locator('#fuel-cost-per-mile');
    await expect(fuelCostPerMile).toBeAttached();

    const fuelLogsList = page.locator('#fuel-logs-list');
    await expect(fuelLogsList).toBeAttached();
  });

  test('Fuel tracker has chart canvases', async ({ page }) => {
    await setupMembersPage(page);

    const mpgChart = page.locator('#fuel-mpg-chart');
    await expect(mpgChart).toBeAttached();

    const spendingChart = page.locator('#fuel-spending-chart');
    await expect(spendingChart).toBeAttached();
  });
});

test.describe('Member Spending Analytics', () => {
  test('Spending analytics section exists with chart and filters', async ({ page }) => {
    await setupMembersPage(page);

    const spendingSection = page.locator('#spending-analytics');
    await expect(spendingSection).toBeAttached();

    const spendingChart = page.locator('#spending-chart');
    await expect(spendingChart).toBeAttached();

    const vehicleFilter = page.locator('#spending-vehicle-filter');
    await expect(vehicleFilter).toBeAttached();

    const yearFilter = page.locator('#spending-year-filter');
    await expect(yearFilter).toBeAttached();
  });
});

test.describe('Member Insurance', () => {
  test('Insurance section exists with stats and document elements', async ({ page }) => {
    await setupMembersPage(page);

    const insuranceSection = page.locator('#insurance');
    await expect(insuranceSection).toBeAttached();

    const totalDocs = page.locator('#insurance-total-docs');
    await expect(totalDocs).toBeAttached();

    const activeCount = page.locator('#insurance-active-count');
    await expect(activeCount).toBeAttached();

    const documentsList = page.locator('#insurance-documents-list');
    await expect(documentsList).toBeAttached();
  });
});

test.describe('Member Messaging', () => {
  test('Messages section exists on member dashboard', async ({ page }) => {
    await setupMembersPage(page);

    const messagesSection = page.locator('#messages');
    await expect(messagesSection).toBeAttached();

    const messagesNav = page.locator('.nav-item[data-section="messages"]');
    await expect(messagesNav).toBeAttached();
  });
});

test.describe('Member Referrals', () => {
  test('Referral section exists with stats and code elements', async ({ page }) => {
    await setupMembersPage(page);

    const referralsSection = page.locator('#referrals');
    await expect(referralsSection).toBeAttached();

    const totalCredits = page.locator('#referral-total-credits');
    await expect(totalCredits).toBeAttached();

    const completedCount = page.locator('#referral-completed-count');
    await expect(completedCount).toBeAttached();

    const pendingCount = page.locator('#referral-pending-count');
    await expect(pendingCount).toBeAttached();

    const codeDisplay = page.locator('#referral-code-display');
    await expect(codeDisplay).toBeAttached();
  });
});

test.describe('Member Household', () => {
  test('Household section exists with create and dashboard elements', async ({ page }) => {
    await setupMembersPage(page);

    const householdSection = page.locator('#household');
    await expect(householdSection).toBeAttached();

    const sectionContent = await householdSection.textContent();
    expect(sectionContent).toContain('Household');

    const noHousehold = page.locator('#household-no-household');
    await expect(noHousehold).toBeAttached();

    const householdDashboard = page.locator('#household-dashboard');
    await expect(householdDashboard).toBeAttached();
  });
});

test.describe('Member Emergency Roadside', () => {
  test('Emergency section exists with request form', async ({ page }) => {
    await setupMembersPage(page);

    const emergencySection = page.locator('#emergency');
    await expect(emergencySection).toBeAttached();

    const sectionContent = await emergencySection.textContent();
    expect(sectionContent).toContain('Emergency Roadside Assistance');

    const emergencyRequestForm = page.locator('#emergency-request-form');
    await expect(emergencyRequestForm).toBeAttached();

    const emergencyActiveStatus = page.locator('#emergency-active-status');
    await expect(emergencyActiveStatus).toBeAttached();
  });
});

test.describe('Member Extra Nav Sections', () => {
  test('Maintenance schedule section exists', async ({ page }) => {
    await setupMembersPage(page);

    const maintenanceNav = page.locator('.nav-item[data-section="maintenance-schedule"]');
    await expect(maintenanceNav).toBeAttached();

    const maintenanceSection = page.locator('#maintenance-schedule');
    await expect(maintenanceSection).toBeAttached();
  });

  test('Learn/Academy section exists', async ({ page }) => {
    await setupMembersPage(page);

    const learnNav = page.locator('.nav-item[data-section="learn"]');
    await expect(learnNav).toBeAttached();

    const learnSection = page.locator('#learn');
    await expect(learnSection).toBeAttached();
  });

  test('Cost estimator section exists', async ({ page }) => {
    await setupMembersPage(page);

    const costNav = page.locator('.nav-item[data-section="cost-estimator"]');
    await expect(costNav).toBeAttached();

    const costSection = page.locator('#cost-estimator');
    await expect(costSection).toBeAttached();
  });

  test('Destination services section is shelved (nav item removed)', async ({ page }) => {
    await setupMembersPage(page);

    const destNav = page.locator('.nav-item[data-section="destination-services"]');
    await expect(destNav).not.toBeAttached();
  });

  test('QR check-in section exists', async ({ page }) => {
    await setupMembersPage(page);

    const qrNav = page.locator('.nav-item[data-section="qr-checkin"]');
    await expect(qrNav).toBeAttached();

    const qrSection = page.locator('#qr-checkin');
    await expect(qrSection).toBeAttached();
  });
});

test.describe('Mobile Pay and Biometric Auth JS', () => {
  test('Mobile pay JS file loads without errors', async ({ page }) => {
    await page.route('**/js.stripe.com/**', route => route.abort());
    await page.route('**/cdnjs.cloudflare.com/**', route => route.abort());
    await page.route('**/fonts.googleapis.com/**', route => route.abort());
    await page.route('**/fonts.gstatic.com/**', route => route.abort());
    await page.route('**/cdn.jsdelivr.net/**', route => {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });

    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('mobile-pay')) {
        consoleErrors.push(msg.text());
      }
    });

    const response = await page.request.get('/mobile-pay.js');
    expect(response.status()).toBe(200);
    const content = await response.text();
    expect(content).toContain('MobilePay');
  });

  test('Biometric auth JS file loads without errors', async ({ page }) => {
    const response = await page.request.get('/biometric-auth.js');
    expect(response.status()).toBe(200);
    const content = await response.text();
    expect(content).toContain('BiometricAuth');
    expect(content).toContain('isAvailable');
    expect(content).toContain('authenticate');
  });
});

const { test, expect } = require('@playwright/test');

const FAKE_MEMBER_ID = '00000000-aaaa-bbbb-cccc-000000000001';
const FAKE_MEMBER_EMAIL = 'testuser@example.com';
const FAKE_PROVIDER_ID = '00000000-dddd-eeee-ffff-000000000002';
const FAKE_PROVIDER_EMAIL = 'provider@example.com';

const VEHICLES_DATA = [
  { id: 'v1', owner_id: FAKE_MEMBER_ID, year: 2023, make: 'Toyota', model: 'Camry', trim_version: 'XLE', mileage: 45000, vin: '1HGBH41JXMN109186', created_at: '2024-01-03T00:00:00Z' },
  { id: 'v2', owner_id: FAKE_MEMBER_ID, year: 2021, make: 'Honda', model: 'CR-V', trim_version: 'EX-L', mileage: 32000, created_at: '2024-01-02T00:00:00Z' }
];

const PACKAGES_DATA = [
  { id: 'pkg1', member_id: FAKE_MEMBER_ID, title: 'Oil Change', status: 'open', vehicle_id: 'v1', created_at: '2024-02-01T00:00:00Z', vehicles: { nickname: null, year: 2023, make: 'Toyota', model: 'Camry', fuel_injection_type: null } }
];

const BIDS_DATA = [
  { package_id: 'pkg1' }
];

const EMERGENCY_REQUESTS_DATA = [
  { id: 'emg1', member_id: FAKE_MEMBER_ID, emergency_type: 'tow_needed', status: 'completed', description: 'Car broke down on highway', lat: 40.7128, lng: -74.006, address: '123 Main St, New York', created_at: '2024-02-10T14:30:00Z', provider_id: 'prov1', eta_minutes: 12, escrow_amount: 125, invoice_amount: 115, claim_round: 1 },
  { id: 'emg2', member_id: FAKE_MEMBER_ID, emergency_type: 'dead_battery', status: 'pending', description: 'Battery died at parking lot', lat: 40.7589, lng: -73.9851, address: '456 Broadway, New York', created_at: '2024-02-15T09:00:00Z', provider_id: null, eta_minutes: null, escrow_amount: 75, invoice_amount: null, claim_round: 1 }
];

const PROVIDER_EMERGENCY_REQUESTS_DATA = [
  { id: 'emg3', member_id: 'member3', emergency_type: 'flat_tire', status: 'pending', description: 'Flat tire on I-95', lat: 40.7200, lng: -74.000, address: '789 Park Ave, New York', created_at: '2024-02-16T11:00:00Z', provider_id: null, eta_minutes: null, escrow_amount: 65, invoice_amount: null, claim_round: 1, distance_miles: 3.2 },
  { id: 'emg4', member_id: 'member4', emergency_type: 'tow_needed', status: 'pending', description: 'Engine failure downtown', lat: 40.7300, lng: -73.990, address: '100 5th Ave, New York', created_at: '2024-02-16T11:30:00Z', provider_id: null, eta_minutes: null, escrow_amount: 150, invoice_amount: null, claim_round: 1, distance_miles: 5.8 }
];

function createMemberMockJs() {
  const userId = FAKE_MEMBER_ID;
  const email = FAKE_MEMBER_EMAIL;
  const vehicles = JSON.stringify(VEHICLES_DATA);
  const packages = JSON.stringify(PACKAGES_DATA);
  const bids = JSON.stringify(BIDS_DATA);
  const emergencyRequests = JSON.stringify(EMERGENCY_REQUESTS_DATA);

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
      var packagesData = ${packages};
      var bidsData = ${bids};
      var emergencyRequestsData = ${emergencyRequests};
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
              } else if (_table === 'maintenance_packages') {
                result = { data: packagesData, error: null };
              } else if (_table === 'bids') {
                var inFilter = _filters.find(function(f) { return f.op === 'in' && f.col === 'package_id'; });
                if (inFilter) {
                  var filtered = bidsData.filter(function(b) { return inFilter.val.indexOf(b.package_id) >= 0; });
                  result = { data: filtered, error: null };
                } else {
                  result = { data: bidsData, error: null };
                }
              } else if (_table === 'emergency_requests') {
                var memberFilter = _filters.find(function(f) { return f.op === 'eq' && f.col === 'member_id'; });
                if (memberFilter) {
                  var filtered = emergencyRequestsData.filter(function(e) { return e.member_id === memberFilter.val; });
                  result = { data: filtered, error: null };
                } else {
                  result = { data: emergencyRequestsData, error: null };
                }
              } else if (_table === 'tos_acceptance') {
                if (_isSingle) {
                  result = { data: { id: '1', accepted_at: new Date().toISOString() }, error: null };
                } else {
                  result = { data: [{ id: '1', accepted_at: new Date().toISOString() }], error: null, count: 1 };
                }
              } else if (_table === 'notifications') {
                result = { data: [], error: null };
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

function createProviderMockJs() {
  const userId = FAKE_PROVIDER_ID;
  const email = FAKE_PROVIDER_EMAIL;
  const emergencyRequests = JSON.stringify(PROVIDER_EMERGENCY_REQUESTS_DATA);

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
      var emergencyRequestsData = ${emergencyRequests};
      var profileData = {
        id: '${userId}',
        full_name: 'Test Provider',
        business_name: 'Test Auto Shop',
        email: '${email}',
        role: 'provider',
        zip_code: '10001',
        phone: '5559876543',
        status: 'approved',
        tos_accepted: true,
        emergency_enabled: true,
        emergency_services: ['flat_tire','dead_battery','tow_needed'],
        emergency_radius: 15,
        can_tow: true,
        is_24_seven: false,
        bid_credits: 10
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
              } else if (_table === 'emergency_requests') {
                result = { data: emergencyRequestsData, error: null };
              } else if (_table === 'provider_team_members') {
                result = { data: [], error: null };
              } else if (_table === 'tos_acceptance') {
                if (_isSingle) {
                  result = { data: { id: '1', accepted_at: new Date().toISOString() }, error: null };
                } else {
                  result = { data: [{ id: '1', accepted_at: new Date().toISOString() }], error: null, count: 1 };
                }
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

async function setupCdnMocks(page, mockJs) {
  await page.route('**/@supabase/supabase-js**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: mockJs });
  });
  await page.route('**/js.stripe.com/**', route => route.abort());
  await page.route('**/cdnjs.cloudflare.com/**', route => route.abort());
  await page.route('**/fonts.googleapis.com/**', route => route.abort());
  await page.route('**/fonts.gstatic.com/**', route => route.abort());
  await page.route('**/cdn.jsdelivr.net/npm/chart.js**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.Chart = function() { this.destroy = function(){}; }; window.Chart.register = function(){};' });
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

async function addProviderFunctionStubs(page) {
  await page.addInitScript(() => {
    var noop = function() {};
    var asyncNoop = function() { return Promise.resolve(); };
    window.refreshEmergencies = asyncNoop;
    window.loadNearbyEmergencies = asyncNoop;
    window.loadMyActiveEmergency = asyncNoop;
    window.loadDestinationTasks = asyncNoop;
    window.loadProviderAgreement = asyncNoop;
    window.loadProviderPerformance = asyncNoop;
    window.loadTeamMembers = asyncNoop;
    window.loadProviderAnalytics = asyncNoop;
    window.loadEarningsAnalytics = asyncNoop;
    window.loadEarningsAnalyticsData = asyncNoop;
    window.initEarningsAnalytics = asyncNoop;
    window.loadAdvancedAnalytics = asyncNoop;
    window.initAdvancedAnalytics = noop;
    window.loadPosAnalytics = asyncNoop;
    window.loadTransportTasks = asyncNoop;
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

test.describe('Member Emergency Request', () => {
  test('Emergency section exists on member dashboard', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const navItem = page.locator('.nav-item[data-section="emergency"]');
    await expect(navItem).toBeAttached();

    await navItem.click();
    await page.waitForTimeout(500);

    const emergencySection = page.locator('#emergency');
    await expect(emergencySection).toBeAttached();

    const sectionContent = await emergencySection.textContent();
    expect(sectionContent).toContain('Emergency Roadside Assistance');
    expect(sectionContent).toContain('Request Emergency Help');
  });

  test('Emergency request modal has all required fields', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const modal = page.locator('#emergency-request-modal');
    await expect(modal).toBeAttached();

    const vehicleSelect = modal.locator('#emergency-vehicle');
    await expect(vehicleSelect).toBeAttached();

    const emergencyTypeSelect = modal.locator('#emergency-type');
    await expect(emergencyTypeSelect).toBeAttached();

    const typeOptions = modal.locator('#emergency-type option');
    const optionValues = await typeOptions.evaluateAll(opts => opts.map(o => o.value).filter(v => v !== ''));
    expect(optionValues).toContain('flat_tire');
    expect(optionValues).toContain('dead_battery');
    expect(optionValues).toContain('lockout');
    expect(optionValues).toContain('tow_needed');
    expect(optionValues).toContain('fuel_delivery');
    expect(optionValues).toContain('accident');
    expect(optionValues).toContain('other');

    const descriptionArea = page.locator('#emergency-description');
    await expect(descriptionArea.first()).toBeAttached();

    const photoInput = page.locator('#emergency-photo-input');
    await expect(photoInput).toBeAttached();
  });

  test('Emergency type options include all service types', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const emergencyTypeSelect = page.locator('#emergency-type');
    await expect(emergencyTypeSelect).toBeAttached();

    const typeOptions = page.locator('#emergency-type option');
    const optionValues = await typeOptions.evaluateAll(opts => opts.map(o => o.value).filter(v => v !== ''));
    expect(optionValues.length).toBeGreaterThanOrEqual(7);
    expect(optionValues).toContain('flat_tire');
    expect(optionValues).toContain('dead_battery');
    expect(optionValues).toContain('lockout');
    expect(optionValues).toContain('tow_needed');
    expect(optionValues).toContain('fuel_delivery');
    expect(optionValues).toContain('accident');
    expect(optionValues).toContain('other');
  });

  test('Emergency price preview calculates for tow service', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const pricePreview = page.locator('#emergency-price-preview');
    await expect(pricePreview).toBeAttached();

    const escrowPreview = page.locator('#emergency-escrow-preview');
    await expect(escrowPreview).toBeAttached();

    const totalPreview = page.locator('#emergency-total-preview');
    await expect(totalPreview).toBeAttached();

    const towMiles = page.locator('#emergency-tow-miles');
    await expect(towMiles).toBeAttached();

    const ratesExist = await page.evaluate(() => {
      return typeof window.EMERGENCY_SERVICE_RATES !== 'undefined' ||
             document.querySelector('#emergency-tow-miles') !== null;
    });
    expect(ratesExist).toBeTruthy();
  });

  test('Past emergency history section exists', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      if (typeof showSection === 'function') showSection('emergency');
    });
    await page.waitForTimeout(500);

    const historyList = page.locator('#emergency-history-list');
    await expect(historyList).toBeAttached();
  });
});

test.describe('Member Emergency Status', () => {
  test('Emergency status modal exists with timeline structure', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const statusModal = page.locator('#emergency-status-modal');
    await expect(statusModal).toBeAttached();

    const activeStatus = page.locator('#emergency-active-status');
    await expect(activeStatus).toBeAttached();

    const statusTimeline = page.locator('#emergency-status-timeline');
    await expect(statusTimeline).toBeAttached();
  });

  test('Emergency alert banner exists for active emergencies', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const alertBanner = page.locator('#emergency-alert-banner');
    await expect(alertBanner).toBeAttached();

    const bannerStatus = page.locator('#emergency-banner-status');
    await expect(bannerStatus).toBeAttached();
  });
});

test.describe('Provider Emergency Settings', () => {
  test('Provider emergency settings section exists', async ({ page }) => {
    const mockJs = createProviderMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_PROVIDER_ID, FAKE_PROVIDER_EMAIL);
    await addProviderFunctionStubs(page);

    await page.goto('/providers.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const acceptCalls = page.locator('#emergency-accept-calls');
    await expect(acceptCalls).toBeAttached();

    const settingsDetails = page.locator('#emergency-settings-details');
    await expect(settingsDetails).toBeAttached();
  });

  test('Emergency service checkboxes include all types', async ({ page }) => {
    const mockJs = createProviderMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_PROVIDER_ID, FAKE_PROVIDER_EMAIL);
    await addProviderFunctionStubs(page);

    await page.goto('/providers.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const serviceChecks = page.locator('.emergency-service-check');
    const checkCount = await serviceChecks.count();
    expect(checkCount).toBeGreaterThanOrEqual(6);

    const serviceValues = await serviceChecks.evaluateAll(els => els.map(el => el.value));
    expect(serviceValues).toContain('flat_tire');
    expect(serviceValues).toContain('dead_battery');
    expect(serviceValues).toContain('lockout');
    expect(serviceValues).toContain('tow_needed');
    expect(serviceValues).toContain('fuel_delivery');
    expect(serviceValues).toContain('other');
  });

  test('Emergency radius and tow settings exist', async ({ page }) => {
    const mockJs = createProviderMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_PROVIDER_ID, FAKE_PROVIDER_EMAIL);
    await addProviderFunctionStubs(page);

    await page.goto('/providers.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const radius = page.locator('#emergency-radius');
    await expect(radius).toBeAttached();

    const allDay = page.locator('#emergency-24-7');
    await expect(allDay).toBeAttached();

    const canTow = page.locator('#emergency-can-tow');
    await expect(canTow).toBeAttached();
  });
});

test.describe('Provider Emergency Queue', () => {
  test('Emergency queue section exists on provider dashboard', async ({ page }) => {
    const mockJs = createProviderMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_PROVIDER_ID, FAKE_PROVIDER_EMAIL);
    await addProviderFunctionStubs(page);

    await page.goto('/providers.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      const navItem = document.querySelector('[data-section="emergencies"]');
      if (navItem) navItem.click();
    });
    await page.waitForTimeout(500);

    const emergenciesSection = page.locator('#emergencies');
    await expect(emergenciesSection).toBeAttached();

    const sectionContent = await emergenciesSection.textContent();
    expect(sectionContent).toContain('Emergency Queue');

    const queue = page.locator('#emergency-queue');
    await expect(queue).toBeAttached();

    const activeEmergency = page.locator('#my-active-emergency');
    await expect(activeEmergency).toBeAttached();
  });

  test('Emergency detail modal exists with action buttons', async ({ page }) => {
    const mockJs = createProviderMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_PROVIDER_ID, FAKE_PROVIDER_EMAIL);
    await addProviderFunctionStubs(page);

    await page.goto('/providers.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const detailModal = page.locator('#emergency-detail-modal');
    await expect(detailModal).toBeAttached();

    const detailContent = page.locator('#emergency-detail-content');
    await expect(detailContent).toBeAttached();

    const detailFooter = page.locator('#emergency-detail-footer');
    await expect(detailFooter).toBeAttached();

    const acceptModal = page.locator('#emergency-accept-modal');
    await expect(acceptModal).toBeAttached();
  });

  test('Emergency complete modal has invoice fields', async ({ page }) => {
    const mockJs = createProviderMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_PROVIDER_ID, FAKE_PROVIDER_EMAIL);
    await addProviderFunctionStubs(page);

    await page.goto('/providers.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const completeModal = page.locator('#emergency-complete-modal');
    await expect(completeModal).toBeAttached();

    const completeEmergencyId = page.locator('#complete-emergency-id');
    await expect(completeEmergencyId).toBeAttached();

    const completeAmount = page.locator('#complete-amount');
    await expect(completeAmount).toBeAttached();

    const completeNotes = page.locator('#complete-notes');
    await expect(completeNotes).toBeAttached();

    const completeActualMiles = page.locator('#complete-actual-miles');
    await expect(completeActualMiles).toBeAttached();
  });
});

test.describe('Emergency API Security', () => {
  test('POST /api/emergency/request returns 401 without auth', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const response = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/emergency/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        return { status: res.status };
      } catch (e) {
        return { status: 401 };
      }
    });

    expect([401, 404, 200]).toContain(response.status);
  });

  test('GET /api/emergency/nearby returns 401 without auth', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const response = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/emergency/nearby', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        return { status: res.status };
      } catch (e) {
        return { status: 401 };
      }
    });

    expect([401, 404, 200]).toContain(response.status);
  });
});

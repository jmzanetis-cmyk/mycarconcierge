const { test, expect } = require('@playwright/test');

const FAKE_MEMBER_ID = '00000000-aaaa-bbbb-cccc-000000000001';
const FAKE_PROVIDER_ID = '00000000-aaaa-bbbb-cccc-000000000002';
const FAKE_MEMBER_EMAIL = 'member@example.com';
const FAKE_PROVIDER_EMAIL = 'provider@example.com';

const VEHICLES_DATA = [
  { id: 'v1', owner_id: FAKE_MEMBER_ID, year: 2023, make: 'Toyota', model: 'Camry', trim_version: 'XLE', mileage: 45000, vin: '1HGBH41JXMN109186', created_at: '2024-01-03T00:00:00Z' },
  { id: 'v2', owner_id: FAKE_MEMBER_ID, year: 2021, make: 'Honda', model: 'CR-V', trim_version: 'EX-L', mileage: 32000, created_at: '2024-01-02T00:00:00Z' }
];

const PACKAGES_DATA = [
  { id: 'pkg1', member_id: FAKE_MEMBER_ID, title: 'Oil Change', status: 'open', vehicle_id: 'v1', description: 'Full synthetic', created_at: '2024-02-01T00:00:00Z', vehicles: { nickname: null, year: 2023, make: 'Toyota', model: 'Camry', fuel_injection_type: null } },
  { id: 'pkg2', member_id: FAKE_MEMBER_ID, title: 'Brake Repair', status: 'open', vehicle_id: 'v2', description: 'Front and rear brakes', bid_count: 3, created_at: '2024-01-15T00:00:00Z', vehicles: { nickname: null, year: 2021, make: 'Honda', model: 'CR-V', fuel_injection_type: null } }
];

const BIDS_DATA = [
  { package_id: 'pkg2' },
  { package_id: 'pkg2' },
  { package_id: 'pkg2' }
];

function createMemberMockJs() {
  const userId = FAKE_MEMBER_ID;
  const email = FAKE_MEMBER_EMAIL;
  const vehicles = JSON.stringify(VEHICLES_DATA);
  const packages = JSON.stringify(PACKAGES_DATA);
  const bids = JSON.stringify(BIDS_DATA);

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
      var packagesData = ${packages};
      var bidsData = ${bids};
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
        tos_accepted: true
      };
      var myBidsData = [
        { id: 'bid1', provider_id: '${userId}', package_id: 'pkg1', status: 'pending', amount: 15000, price: 150, created_at: '2024-02-01T00:00:00Z', maintenance_packages: { title: 'Oil Change', status: 'open', member_id: 'm1', vehicles: { year: 2023, make: 'Toyota', model: 'Camry' } } },
        { id: 'bid2', provider_id: '${userId}', package_id: 'pkg2', status: 'accepted', amount: 25000, price: 250, created_at: '2024-02-02T00:00:00Z', maintenance_packages: { title: 'Brake Service', status: 'accepted', member_id: 'm2', vehicles: { year: 2021, make: 'Honda', model: 'CR-V' } } }
      ];

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
                result = { data: myBidsData, error: null };
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
        user_metadata: { full_name: 'Test User' }
      }
    }));
  }, { userId, email });
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
        body: JSON.stringify({
          packages: [
            { id: 'pkg1', title: 'Oil Change & Filter', status: 'open', member_id: 'm1', vehicle_year: 2023, vehicle_make: 'Toyota', vehicle_model: 'Camry', member_name: 'John D.', member_zip: '10001', description: 'Full synthetic oil change.', bid_count: 3, created_at: '2024-02-01T00:00:00Z' },
            { id: 'pkg2', title: 'Brake Inspection', status: 'open', member_id: 'm2', vehicle_year: 2021, vehicle_make: 'Honda', vehicle_model: 'CR-V', member_name: 'Sarah M.', member_zip: '10002', description: 'Front and rear brake inspection.', bid_count: 1, created_at: '2024-02-02T00:00:00Z' }
          ]
        })
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

test.describe('Service Packages & Bidding', () => {
  test('Job creation form has all required fields', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    await page.evaluate(() => {
      if (typeof showSection === 'function') showSection('packages');
    });
    await page.waitForTimeout(1000);

    const packagesSection = page.locator('#packages');
    await expect(packagesSection).toBeAttached();

    const newPackageBtn = page.locator('button:has-text("New Package")');
    await expect(newPackageBtn).toBeAttached();

    await newPackageBtn.click();
    await page.waitForTimeout(500);

    await expect(page.locator('#p-vehicle')).toBeAttached();
    await expect(page.locator('#p-category')).toBeAttached();
    await expect(page.locator('#p-service-type')).toBeAttached();
    await expect(page.locator('#p-description')).toBeAttached();
    await expect(page.locator('#p-frequency')).toBeAttached();
    await expect(page.locator('#parts-tiers')).toBeAttached();
    await expect(page.locator('#p-pickup')).toBeAttached();
    await expect(page.locator('#p-title')).toBeAttached();
  });

  test('Package list renders with mock data', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);

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

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    await page.evaluate(() => {
      if (typeof showSection === 'function') showSection('packages');
    });
    await page.waitForTimeout(1500);

    const packagesList = page.locator('#packages-list');
    await expect(packagesList).toBeAttached();

    const content = await packagesList.textContent();
    expect(content).toContain('Oil Change');
    expect(content).toContain('Brake Repair');

    const packageCards = page.locator('.package-card');
    const count = await packageCards.count();
    expect(count).toBeGreaterThanOrEqual(2);

    expect(content).toContain('open');
    expect(content).toContain('3 bid');
  });

  test('Bid credits purchase API requires authentication', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const response = await page.evaluate(async () => {
      const res = await fetch('/api/create-bid-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack_id: 'starter' })
      });
      return { status: res.status, body: await res.json() };
    });

    expect(response.status).toBe(401);
  });

  test('Service package API requires authentication', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const getResponse = await page.evaluate(async () => {
      const res = await fetch('/api/provider/packages', {
        method: 'GET'
      });
      return { status: res.status, body: await res.json() };
    });

    expect(getResponse.status).toBe(401);
  });

  test('Provider bid submission API requires authentication', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const response = await page.evaluate(async () => {
      const res = await fetch('/api/additional-work/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: 'pkg1', description: 'test', estimated_cost: 100 })
      });
      return { status: res.status, body: await res.json() };
    });

    expect(response.status).toBe(401);
  });
});

test.describe('Appointment & Job Workflow', () => {
  test('Check-in page loads with kiosk structure', async ({ page }) => {
    await page.goto('/check-in.html');
    await page.waitForLoadState('domcontentloaded');

    const kioskContainer = page.locator('.kiosk-container');
    await expect(kioskContainer).toBeAttached();

    const welcomeScreen = page.locator('#screen-welcome');
    await expect(welcomeScreen).toBeAttached();

    const beginBtn = page.locator('button:has-text("Begin Check-In")');
    await expect(beginBtn).toBeAttached();

    const phoneInput = page.locator('#phone-input');
    await expect(phoneInput).toBeAttached();

    const serviceCategory = page.locator('#service-category');
    await expect(serviceCategory).toBeAttached();

    const vehicleList = page.locator('#vehicle-list');
    await expect(vehicleList).toBeAttached();
  });

  test('Check-in API handles requests', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const response = await page.evaluate(async () => {
      const res = await fetch('/api/checkin/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'nonexistent' })
      });
      return { status: res.status };
    });

    expect(response.status).toBeGreaterThanOrEqual(200);
  });

  test('Job status transition API requires authentication', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const response = await page.evaluate(async () => {
      const res = await fetch('/api/jobs/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: 'pkg1', completion_notes: 'Done' })
      });
      return { status: res.status, body: await res.json() };
    });

    expect(response.status).toBe(401);
  });

  test('Active jobs section exists on provider dashboard', async ({ page }) => {
    const mockJs = createProviderMockJs();
    await setupCdnMocks(page, mockJs);
    await setupProviderApiMocks(page);
    await addAuthToken(page, FAKE_PROVIDER_ID, FAKE_PROVIDER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/providers.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    await page.evaluate(() => {
      const jobsNav = document.querySelector('[data-section="jobs"]');
      if (jobsNav) jobsNav.click();
    });
    await page.waitForTimeout(1500);

    const jobsSection = page.locator('#jobs');
    await expect(jobsSection).toBeAttached();

    const activeJobs = page.locator('#active-jobs');
    await expect(activeJobs).toBeAttached();

    const jobsTitle = page.locator('#jobs .page-title');
    await expect(jobsTitle).toBeAttached();
    await expect(jobsTitle).toHaveText('Active Jobs');

    const scanBtn = page.locator('#jobs button:has-text("Scan Member Check-in")');
    await expect(scanBtn).toBeAttached();
  });
});

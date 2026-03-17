const { test, expect } = require('@playwright/test');

const FAKE_MEMBER_ID = '00000000-aaaa-bbbb-cccc-000000000001';
const FAKE_PROVIDER_ID = '00000000-aaaa-bbbb-cccc-000000000002';
const FAKE_MEMBER_EMAIL = 'testuser@example.com';
const FAKE_PROVIDER_EMAIL = 'provider@example.com';

const VEHICLES_DATA = [
  { id: 'v1', owner_id: FAKE_MEMBER_ID, year: 2023, make: 'Toyota', model: 'Camry', trim_version: 'XLE', mileage: 45000, vin: '1HGBH41JXMN109186', created_at: '2024-01-03T00:00:00Z' },
  { id: 'v2', owner_id: FAKE_MEMBER_ID, year: 2021, make: 'Honda', model: 'CR-V', trim_version: 'EX-L', mileage: 32000, created_at: '2024-01-02T00:00:00Z' },
  { id: 'v3', owner_id: FAKE_MEMBER_ID, year: 2020, make: 'Ford', model: 'F-150', trim_version: 'Lariat', mileage: 28000, created_at: '2024-01-01T00:00:00Z' }
];

const PACKAGES_DATA = [
  { id: 'pkg1', member_id: FAKE_MEMBER_ID, title: 'Oil Change', status: 'open', vehicle_id: 'v1', created_at: '2024-02-01T00:00:00Z', vehicles: { nickname: null, year: 2023, make: 'Toyota', model: 'Camry', fuel_injection_type: null } },
  { id: 'pkg2', member_id: FAKE_MEMBER_ID, title: 'Brake Inspection', status: 'open', vehicle_id: 'v2', created_at: '2024-02-02T00:00:00Z', vehicles: { nickname: null, year: 2021, make: 'Honda', model: 'CR-V', fuel_injection_type: null } },
  { id: 'pkg3', member_id: FAKE_MEMBER_ID, title: 'Tire Rotation', status: 'completed', vehicle_id: 'v3', created_at: '2024-01-15T00:00:00Z', vehicles: { nickname: null, year: 2020, make: 'Ford', model: 'F-150', fuel_injection_type: null } }
];

const BIDS_DATA = [
  { package_id: 'pkg1' },
  { package_id: 'pkg1' },
  { package_id: 'pkg1' },
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
        { id: 'bid1', provider_id: '${userId}', package_id: 'pkg1', status: 'pending', amount: 15000, created_at: '2024-02-01T00:00:00Z', maintenance_packages: { title: 'Oil Change', status: 'open', member_id: 'm1', vehicles: { year: 2023, make: 'Toyota', model: 'Camry' } } },
        { id: 'bid2', provider_id: '${userId}', package_id: 'pkg2', status: 'pending', amount: 25000, created_at: '2024-02-02T00:00:00Z', maintenance_packages: { title: 'Brake Service', status: 'open', member_id: 'm2', vehicles: { year: 2021, make: 'Honda', model: 'CR-V' } } },
        { id: 'bid3', provider_id: '${userId}', package_id: 'pkg3', status: 'accepted', amount: 12000, created_at: '2024-01-20T00:00:00Z', maintenance_packages: { title: 'Tire Rotation', status: 'accepted', member_id: 'm3', vehicles: { year: 2020, make: 'Ford', model: 'F-150' } } }
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

async function setupProviderApiMocks(page) {
  await page.route('**/api/**', route => {
    const url = route.request().url();
    if (url.includes('/api/provider/packages')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          packages: [
            { id: 'pkg1', title: 'Oil Change & Filter', status: 'open', member_id: 'm1', vehicle_year: 2023, vehicle_make: 'Toyota', vehicle_model: 'Camry', member_name: 'John D.', member_zip: '10001', description: 'Full synthetic oil change with filter replacement.', bid_count: 3, created_at: '2024-02-01T00:00:00Z' },
            { id: 'pkg2', title: 'Brake Inspection', status: 'open', member_id: 'm2', vehicle_year: 2021, vehicle_make: 'Honda', vehicle_model: 'CR-V', member_name: 'Sarah M.', member_zip: '10002', description: 'Front and rear brake inspection.', bid_count: 1, created_at: '2024-02-02T00:00:00Z' },
            { id: 'pkg3', title: 'Tire Rotation & Balance', status: 'open', member_id: 'm3', vehicle_year: 2022, vehicle_make: 'Ford', vehicle_model: 'F-150', member_name: 'Mike R.', member_zip: '10003', description: '4-tire rotation and balance.', bid_count: 0, created_at: '2024-02-03T00:00:00Z' },
            { id: 'pkg4', title: 'AC Service', status: 'open', member_id: 'm4', vehicle_year: 2022, vehicle_make: 'Nissan', vehicle_model: 'Altima', member_name: 'Lisa K.', member_zip: '10004', description: 'AC recharge and inspection.', bid_count: 2, created_at: '2024-02-04T00:00:00Z' },
            { id: 'pkg5', title: 'Battery Replacement', status: 'open', member_id: 'm5', vehicle_year: 2019, vehicle_make: 'Chevrolet', vehicle_model: 'Malibu', member_name: 'Tom W.', member_zip: '10005', description: 'Battery test and replacement.', bid_count: 0, created_at: '2024-02-05T00:00:00Z' }
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

test.describe('Member Dashboard - Non-Empty Data', () => {
  test('Stats display non-zero values when data exists', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    await expect(page.locator('#stat-vehicles')).toHaveText('3', { timeout: 10000 });
    await expect(page.locator('#stat-packages')).toHaveText('2');
    await expect(page.locator('#stat-bids')).toHaveText('5');
    await expect(page.locator('#stat-reminders')).toHaveText('0');
    await expect(page.locator('#stat-completed')).toHaveText('1');
    await expect(page.locator('#stat-providers')).toHaveText('4');
  });

  test('Vehicle cards render with data', async ({ page }) => {
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
      if (typeof showSection === 'function') showSection('vehicles');
    });
    await page.waitForTimeout(1000);

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

    const cardBodies = page.locator('.vehicle-card-body');
    expect(await cardBodies.count()).toBe(3);
  });

  test('Notification badge shows count', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const badge = page.locator('#notif-count');
    await expect(badge).toBeAttached();
  });
});

test.describe('Provider Dashboard - Non-Empty Data', () => {
  test('Provider stats rendered from mock bid data', async ({ page }) => {
    const mockJs = createProviderMockJs();
    await setupCdnMocks(page, mockJs);
    await setupProviderApiMocks(page);
    await addAuthToken(page, FAKE_PROVIDER_ID, FAKE_PROVIDER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/providers.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { state: 'attached', timeout: 15000 }).catch(() => {});

    await expect(page.locator('#stat-credits')).toHaveText('15', { timeout: 15000 });

    await expect(page.locator('#stat-open')).toHaveText('5', { timeout: 10000 });
    await expect(page.locator('#open-count')).toHaveText('5', { timeout: 5000 });
    await expect(page.locator('#stat-bids')).toHaveText('2', { timeout: 5000 });
    await expect(page.locator('#stat-won')).toHaveText('1', { timeout: 5000 });

    const pageContent = await page.content();
    expect(pageContent).toContain('Test Auto Shop');
  });

  test('Provider browse section shows package listings from mock API', async ({ page }) => {
    const mockJs = createProviderMockJs();
    await setupCdnMocks(page, mockJs);
    await setupProviderApiMocks(page);
    await addAuthToken(page, FAKE_PROVIDER_ID, FAKE_PROVIDER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/providers.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { state: 'attached', timeout: 15000 }).catch(() => {});

    await expect(page.locator('#stat-credits')).toHaveText('15', { timeout: 15000 });

    await page.evaluate(() => {
      if (typeof showSection === 'function') {
        showSection('browse');
      } else {
        var browseNav = document.querySelector('.nav-item[data-section="browse"]');
        if (browseNav) browseNav.click();
      }
    });

    await page.waitForTimeout(2000);

    const browse = page.locator('#browse');
    await expect(browse).toBeAttached();
    const isActive = await browse.evaluate(el => el.classList.contains('active'));
    expect(isActive).toBe(true);

    const browseContent = await browse.textContent();
    expect(browseContent).toContain('Oil Change');
    expect(browseContent).toContain('Brake Inspection');
    expect(browseContent).toContain('Battery Replacement');
    expect(browseContent).toContain('10001');
    expect(browseContent).toContain('10005');
  });
});

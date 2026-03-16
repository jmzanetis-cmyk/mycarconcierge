const { test, expect } = require('@playwright/test');

const FAKE_MEMBER_ID = '00000000-aaaa-bbbb-cccc-000000000001';
const FAKE_MEMBER_EMAIL = 'testuser@example.com';

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

const DREAM_CAR_SEARCHES = [
  { id: 'dcs1', member_id: FAKE_MEMBER_ID, search_name: 'Family SUV', make: 'Toyota', model: 'Highlander', year_min: 2020, year_max: 2024, price_min: 25000, price_max: 45000, is_active: true, notify_email: true, notify_sms: false, notify_frequency: 'daily', created_at: '2024-01-15T00:00:00Z' },
  { id: 'dcs2', member_id: FAKE_MEMBER_ID, search_name: 'Sports Car Dream', make: 'BMW', model: 'M3', year_min: 2021, year_max: 2025, price_min: 50000, price_max: 80000, is_active: false, notify_email: true, notify_sms: true, notify_frequency: 'weekly', created_at: '2024-02-01T00:00:00Z' }
];

const DREAM_CAR_MATCHES = [
  { id: 'dcm1', search_id: 'dcs1', title: '2022 Toyota Highlander XLE', price: 35999, mileage: 28000, location: 'New York, NY', source_url: 'https://example.com/listing1', image_url: 'https://example.com/img1.jpg', is_seen: false, is_saved: true, is_dismissed: false, match_score: 92, created_at: '2024-02-10T00:00:00Z' },
  { id: 'dcm2', search_id: 'dcs1', title: '2023 Toyota Highlander Limited', price: 42500, mileage: 15000, location: 'Los Angeles, CA', source_url: 'https://example.com/listing2', image_url: 'https://example.com/img2.jpg', is_seen: true, is_saved: false, is_dismissed: false, match_score: 87, created_at: '2024-02-12T00:00:00Z' }
];

const PROSPECT_VEHICLES_DATA = [
  { id: 'pv1', member_id: FAKE_MEMBER_ID, year: 2023, make: 'Toyota', model: 'Camry', trim: 'XLE', body_style: 'sedan', engine: '2.5L 4-cyl', fuel_type: 'gasoline', mileage: 15000, price: 28000, ext_color: 'Silver', int_color: 'Black', status: 'interested', notes: 'Great value', created_at: '2024-02-01T00:00:00Z' },
  { id: 'pv2', member_id: FAKE_MEMBER_ID, year: 2024, make: 'Honda', model: 'CR-V', trim: 'Sport', body_style: 'suv', engine: '1.5L Turbo', fuel_type: 'gasoline', mileage: 5000, price: 35000, ext_color: 'Blue', int_color: 'Gray', status: 'test_drive', notes: 'Scheduled for next week', created_at: '2024-01-15T00:00:00Z' }
];

function createMemberMockJs(includeDreamCarData = false) {
  const userId = FAKE_MEMBER_ID;
  const email = FAKE_MEMBER_EMAIL;
  const vehicles = JSON.stringify(VEHICLES_DATA);
  const packages = JSON.stringify(PACKAGES_DATA);
  const bids = JSON.stringify(BIDS_DATA);
  const dreamCarSearches = JSON.stringify(DREAM_CAR_SEARCHES);
  const dreamCarMatches = JSON.stringify(DREAM_CAR_MATCHES);
  const prospectVehicles = JSON.stringify(PROSPECT_VEHICLES_DATA);

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
      var dreamCarSearchesData = ${dreamCarSearches};
      var dreamCarMatchesData = ${dreamCarMatches};
      var prospectVehiclesData = ${prospectVehicles};
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
              } else if (_table === 'dream_car_searches') {
                ${includeDreamCarData ? `result = { data: dreamCarSearchesData, error: null };` : `result = { data: [], error: null };`}
              } else if (_table === 'dream_car_matches') {
                ${includeDreamCarData ? `result = { data: dreamCarMatchesData, error: null };` : `result = { data: [], error: null };`}
              } else if (_table === 'prospect_vehicles') {
                ${includeDreamCarData ? `result = { data: prospectVehiclesData, error: null };` : `result = { data: [], error: null };`}
              } else if (_table === 'dream_car_criteria') {
                result = { data: [], error: null };
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

test.describe('Dream Car Finder Section', () => {
  test('Dream Car Finder section exists on member dashboard', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const navItem = page.locator('.nav-item[data-section="dream-car-finder"]');
    await expect(navItem).toBeAttached();

    await navItem.click();
    await page.waitForTimeout(1000);

    const dreamCarSection = page.locator('#dream-car-finder');
    await expect(dreamCarSection).toBeAttached();

    const sectionContent = await dreamCarSection.textContent();
    expect(sectionContent).toContain('Dream Car Finder');
  });

  test('Dream Car search list renders with mock data', async ({ page }) => {
    const mockJs = createMemberMockJs(true);
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const navItem = page.locator('.nav-item[data-section="dream-car-finder"]');
    await navItem.click();
    await page.waitForTimeout(500);

    await page.evaluate(async () => {
      if (typeof window.loadDreamCarFinderSection === 'function') {
        await window.loadDreamCarFinderSection();
      }
    });
    await page.waitForTimeout(500);

    const searchesList = page.locator('#dream-car-searches-list');
    await expect(searchesList).toBeAttached();

    const sectionContent = await page.locator('#dream-car-finder').textContent();
    expect(sectionContent).toContain('Family SUV');
    expect(sectionContent).toContain('Sports Car Dream');
  });

  test('Dream Car matches list and search elements exist', async ({ page }) => {
    const mockJs = createMemberMockJs(true);
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      if (typeof showSection === 'function') showSection('dream-car-finder');
    });
    await page.waitForTimeout(1000);

    const matchesList = page.locator('#dream-car-matches-list');
    await expect(matchesList).toBeAttached();

    const searchesList = page.locator('#dream-car-searches-list');
    await expect(searchesList).toBeAttached();

    const sectionContent = await page.locator('#dream-car-finder').textContent();
    expect(sectionContent).toContain('Recent Matches');
    expect(sectionContent).toContain('Active Searches');
  });

  test('AI Search tab exists in My Next Car section', async ({ page }) => {
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
      if (typeof showSection === 'function') showSection('my-next-car');
    });
    await page.waitForTimeout(1000);

    const aiSearchTab = page.locator('[data-prospect-tab="ai-search"]');
    await expect(aiSearchTab).toBeAttached();
  });
});

test.describe('My Next Car Section', () => {
  test('My Next Car section loads with tabs', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const navItem = page.locator('.nav-item[data-section="my-next-car"]');
    await navItem.click();
    await page.waitForTimeout(1000);

    const myNextCarSection = page.locator('#my-next-car');
    await expect(myNextCarSection).toBeAttached();

    const sectionContent = await myNextCarSection.textContent();
    expect(sectionContent).toContain('Prospects');
    expect(sectionContent).toContain('Compare');
    expect(sectionContent).toContain('Preferences');
    expect(sectionContent).toContain('AI Search');
  });

  test('Add Prospect Vehicle modal has all form fields', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const addProspectModal = page.locator('#add-prospect-modal');
    await expect(addProspectModal).toBeAttached();

    await expect(page.locator('#prospect-year')).toBeAttached();
    await expect(page.locator('#prospect-make')).toBeAttached();
    await expect(page.locator('#prospect-model')).toBeAttached();
    await expect(page.locator('#prospect-trim')).toBeAttached();
    await expect(page.locator('#prospect-body-style')).toBeAttached();
    await expect(page.locator('#prospect-engine')).toBeAttached();
    await expect(page.locator('#prospect-fuel-type')).toBeAttached();
    await expect(page.locator('#prospect-mileage')).toBeAttached();
    await expect(page.locator('#prospect-price')).toBeAttached();
    await expect(page.locator('#prospect-ext-color')).toBeAttached();
    await expect(page.locator('#prospect-int-color')).toBeAttached();
  });

  test('VIN lookup input exists for prospect vehicles', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const vinLookup = page.locator('#prospect-vin-lookup');
    await expect(vinLookup).toBeAttached();
  });

  test('Prospect filter dropdown has all options', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const prospectFilter = page.locator('#prospect-filter');
    await expect(prospectFilter).toBeAttached();

    const options = await prospectFilter.locator('option').allTextContents();
    expect(options).toContain('All Prospects');
    expect(options).toContain('Considering');
    expect(options).toContain('Test Driven');
    expect(options).toContain('Offer Made');
    expect(options).toContain('Purchased');
  });

  test('Compare tab exists for vehicle comparison', async ({ page }) => {
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
      if (typeof showSection === 'function') showSection('my-next-car');
    });
    await page.waitForTimeout(500);

    const compareTabBtn = page.locator('[data-prospect-tab="compare"]');
    await expect(compareTabBtn).toBeAttached();
    await compareTabBtn.click();
    await page.waitForTimeout(500);

    const compareTab = page.locator('#compare-tab');
    await expect(compareTab).toBeAttached();
    await expect(compareTab).toBeVisible();
  });
});

test.describe('Dream Car Notification Preferences', () => {
  test('Dream Car notification toggle exists in notification preferences', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const pushDreamCar = page.locator('#push-dream-car');
    await expect(pushDreamCar).toBeAttached();
  });
});

test.describe('API Security', () => {
  test('POST /api/dream-car/searches returns 401 without auth', async ({ page }) => {
    const response = await page.request.post('/api/dream-car/searches', {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ make: 'Toyota', model: 'Highlander', yearMin: 2020, yearMax: 2024, priceMax: 45000 })
    });
    expect(response.status()).toBe(401);
  });

  test('GET /api/dream-car/searches returns 401 without auth', async ({ page }) => {
    const response = await page.request.get('/api/dream-car/searches');
    expect(response.status()).toBe(401);
  });

  test('DELETE /api/dream-car/searches/:id returns 401 without auth', async ({ page }) => {
    const response = await page.request.delete('/api/dream-car/searches/test-id');
    expect(response.status()).toBe(401);
  });

  test('POST /api/dream-car/run-search/:id returns 401 without auth', async ({ page }) => {
    const response = await page.request.post('/api/dream-car/run-search/test-id', {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({})
    });
    expect(response.status()).toBe(401);
  });
});

test.describe('My Next Car Prospects', () => {
  test('My Next Car prospects grid exists', async ({ page }) => {
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
      if (typeof showSection === 'function') showSection('my-next-car');
    });
    await page.waitForTimeout(500);

    const prospectsGrid = page.locator('#prospects-grid');
    await expect(prospectsGrid).toBeAttached();
  });
});

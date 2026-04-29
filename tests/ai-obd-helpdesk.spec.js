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

const DIAGNOSTIC_SCANS_DATA = [
  { id: 'scan1', vehicle_id: 'v1', codes: ['P0300', 'P0171'], notes: 'Engine misfiring', source: 'manual', status: 'interpreted', ai_interpretation: 'P0300: Random misfire detected. P0171: System too lean.', created_at: '2024-02-10T00:00:00Z' },
  { id: 'scan2', vehicle_id: 'v1', codes: ['P0420'], notes: 'Check engine light on', source: 'manual', status: 'pending', ai_interpretation: null, created_at: '2024-02-08T00:00:00Z' }
];

function createMemberMockJs(includeDiagnosticScans = false) {
  const userId = FAKE_MEMBER_ID;
  const email = FAKE_MEMBER_EMAIL;
  const vehicles = JSON.stringify(VEHICLES_DATA);
  const packages = JSON.stringify(PACKAGES_DATA);
  const bids = JSON.stringify(BIDS_DATA);
  const diagnosticScans = JSON.stringify(DIAGNOSTIC_SCANS_DATA);

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
      var diagnosticScansData = ${diagnosticScans};
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
              } else if (_table === 'diagnostic_scans') {
                ${includeDiagnosticScans ? `
                var vehicleFilter = _filters.find(function(f) { return f.op === 'eq' && f.col === 'vehicle_id'; });
                if (vehicleFilter) {
                  var filtered = diagnosticScansData.filter(function(s) { return s.vehicle_id === vehicleFilter.val; });
                  result = { data: filtered, error: null };
                } else {
                  result = { data: diagnosticScansData, error: null };
                }
                ` : `result = { data: [], error: null };`}
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
              } else if (_table === 'dream_car_criteria' || _table === 'dream_car_matches') {
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

test.describe('OBD Diagnostic Scanner', () => {
  test('OBD scanner modal exists with input elements', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const obdModal = page.locator('#obd-scanner-modal');
    await expect(obdModal).toBeAttached();

    const obdCodesInput = page.locator('#obd-codes-input');
    await expect(obdCodesInput).toBeAttached();

    const obdSubmitBtn = page.locator('#obd-submit-btn');
    await expect(obdSubmitBtn).toBeAttached();

    const obdNotesField = page.locator('#obd-notes');
    await expect(obdNotesField).toBeAttached();
  });

  test('OBD scan API requires authentication', async ({ page }) => {
    const response = await page.request.post('/api/obd/scan', {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        vehicleId: 'v1',
        codes: ['P0300'],
        notes: 'Test scan'
      })
    });

    expect(response.status()).toBe(401);
  });

  test('OBD results modal exists for displaying scan results', async ({ page }) => {
    const mockJs = createMemberMockJs(true);
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const obdResultsModal = page.locator('#obd-results-modal');
    await expect(obdResultsModal).toBeAttached();

    const obdResultsBody = page.locator('#obd-results-body');
    await expect(obdResultsBody).toBeAttached();
  });
});

test.describe('AI Helpdesk Widget', () => {
  test('Helpdesk widget initializes on index page', async ({ page }) => {
    await page.route('**/js.stripe.com/**', route => route.abort());
    await page.route('**/cdnjs.cloudflare.com/**', route => route.abort());
    await page.route('**/fonts.googleapis.com/**', route => route.abort());
    await page.route('**/fonts.gstatic.com/**', route => route.abort());
    await page.route('**/cdn.jsdelivr.net/**', route => {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });

    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const helpdeskWidget = page.locator('#helpdesk-widget');
    await expect(helpdeskWidget).toBeAttached({ timeout: 5000 });

    const toggleButton = page.locator('#helpdesk-widget .chat-widget-toggle');
    await expect(toggleButton).toBeAttached();

    const chatPanel = page.locator('#helpdesk-widget .chat-widget-panel');
    await expect(chatPanel).toBeAttached();
  });

  test('AI chat and helpdesk APIs accept unauthenticated requests', async ({ page }) => {
    const chatResponse = await page.request.post('/api/chat', {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello' }]
      })
    });

    expect(chatResponse.status()).not.toBe(401);

    const helpdeskResponse = await page.request.post('/api/helpdesk', {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        message: 'Hello',
        conversationId: 'test-conv-1',
        mode: 'driver'
      })
    });

    expect(helpdeskResponse.status()).not.toBe(401);
  });

  test('Helpdesk widget has input and send functionality', async ({ page }) => {
    await page.route('**/js.stripe.com/**', route => route.abort());
    await page.route('**/cdnjs.cloudflare.com/**', route => route.abort());
    await page.route('**/fonts.googleapis.com/**', route => route.abort());
    await page.route('**/fonts.gstatic.com/**', route => route.abort());
    await page.route('**/cdn.jsdelivr.net/**', route => {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });

    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const toggleButton = page.locator('#helpdesk-widget .chat-widget-toggle');
    await expect(toggleButton).toBeAttached({ timeout: 5000 });

    await toggleButton.click();
    await page.waitForTimeout(500);

    const chatInput = page.locator('#helpdesk-widget .chat-widget-input');
    await expect(chatInput).toBeVisible();

    const sendButton = page.locator('#helpdesk-widget .chat-widget-send');
    await expect(sendButton).toBeVisible();

    const messagesContainer = page.locator('#helpdesk-widget .chat-widget-messages');
    await expect(messagesContainer).toBeVisible();
  });
});

test.describe('Dream Car Finder', () => {
  test('Dream Car Finder section exists on member dashboard', async ({ page }) => {
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
      if (typeof showSection === 'function') showSection('dream-car-finder');
    });
    await page.waitForTimeout(1000);

    const dreamCarSection = page.locator('#dream-car-finder');
    await expect(dreamCarSection).toBeAttached();

    const sectionContent = await dreamCarSection.textContent();
    expect(sectionContent).toContain('Dream Car Finder');

    const searchesList = page.locator('#dream-car-searches-list');
    await expect(searchesList).toBeAttached();

    const matchesList = page.locator('#dream-car-matches-list');
    await expect(matchesList).toBeAttached();
  });

  test('Dream Car Finder API requires authentication', async ({ page }) => {
    const response = await page.request.post('/api/dream-car/searches', {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        make: 'Toyota',
        model: 'Camry',
        yearMin: 2020,
        yearMax: 2025,
        priceMax: 35000
      })
    });

    expect(response.status()).toBe(401);
  });
});

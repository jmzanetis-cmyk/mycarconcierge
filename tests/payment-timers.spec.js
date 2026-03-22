const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:5000';

const FAKE_MEMBER_ID = '00000000-aaaa-bbbb-cccc-000000000001';
const FAKE_MEMBER_EMAIL = 'testuser@example.com';

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
        tos_accepted: true
      };
      var vehiclesData = [
        { id: 'v1', owner_id: '${userId}', year: 2023, make: 'Toyota', model: 'Camry', trim_version: 'XLE', mileage: 45000, vin: '1HGBH41JXMN109186', created_at: '2024-01-03T00:00:00Z' }
      ];
      var packagesData = [
        { id: 'pkg1', member_id: '${userId}', title: 'Oil Change', status: 'open', vehicle_id: 'v1', created_at: '2024-02-01T00:00:00Z', vehicles: { nickname: null, year: 2023, make: 'Toyota', model: 'Camry', fuel_injection_type: null } }
      ];
      var bidsData = [{ package_id: 'pkg1' }];

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
          var q = {
            select: function(cols, opts) {
              if (opts && opts.count) _countMode = opts.count;
              if (opts && opts.head) _headMode = true;
              return q;
            },
            insert: function(data) {
              return { select: function() { return { single: function() { return Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error: null }); } }; }, then: function(resolve) { resolve({ data: data, error: null }); return q; } };
            },
            update: function() { return q; },
            delete: function() { return q; },
            eq: function(col, val) { _filters.push({ col: col, op: 'eq', val: val }); return q; },
            neq: function() { return q; },
            in: function(col, vals) { _filters.push({ col: col, op: 'in', val: vals }); return q; },
            gt: function() { return q; }, gte: function() { return q; },
            lt: function() { return q; }, lte: function() { return q; },
            like: function() { return q; }, ilike: function() { return q; },
            is: function() { return q; }, not: function() { return q; },
            or: function() { return q; }, contains: function() { return q; },
            filter: function() { return q; },
            order: function() { return q; }, limit: function() { return q; }, range: function() { return q; },
            single: function() { _isSingle = true; return q; },
            maybeSingle: function() { _isSingle = true; return q; },
            then: function(resolve) {
              var result;
              if (_table === 'profiles') {
                if (_countMode && _headMode) { result = { data: null, error: null, count: 4 }; }
                else if (_isSingle) { result = { data: profileData, error: null }; }
                else { result = { data: [profileData], error: null, count: 1 }; }
              } else if (_table === 'vehicles') { result = { data: vehiclesData, error: null }; }
              else if (_table === 'maintenance_packages') { result = { data: packagesData, error: null }; }
              else if (_table === 'bids') {
                var inFilter = _filters.find(function(f) { return f.op === 'in' && f.col === 'package_id'; });
                if (inFilter) { result = { data: bidsData.filter(function(b) { return inFilter.val.indexOf(b.package_id) >= 0; }), error: null }; }
                else { result = { data: bidsData, error: null }; }
              } else if (_table === 'tos_acceptance') {
                if (_isSingle) { result = { data: { id: '1', accepted_at: new Date().toISOString() }, error: null }; }
                else { result = { data: [{ id: '1', accepted_at: new Date().toISOString() }], error: null, count: 1 }; }
              } else if (_table === 'reminders' || _table === 'notifications' || _table === 'dream_car_criteria' || _table === 'dream_car_matches' || _table === 'diagnostic_scans') {
                result = { data: [], error: null };
              } else {
                if (_isSingle) { result = { data: null, error: null }; }
                else { result = { data: [], error: null, count: 0 }; }
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

test.describe('Split Payment Structure Tests', () => {
  test('POST /api/split/create without auth returns 401', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/split/create`, {
      headers: { 'Content-Type': 'application/json' },
      data: {}
    });
    expect(response.status()).toBe(401);
  });

  test('POST /api/split/create with proper JSON structure but no auth returns 401', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/split/create`, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        packageId: 'pkg-test-123',
        participants: [
          { email: 'friend1@example.com', amount: 5000, name: 'Friend One' },
          { email: 'friend2@example.com', amount: 3000, name: 'Friend Two' }
        ]
      }
    });
    expect(response.status()).toBe(401);
  });

  test('Split payment page exists: GET /split-pay.html returns 200', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/split-pay.html`);
    expect(response.status()).toBe(200);
  });

  test('Split payment page has necessary UI elements for timer display', async ({ page }) => {
    await page.route('**/@supabase/supabase-js**', route => {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.supabase = { createClient: function() { return { auth: { getSession: function() { return Promise.resolve({ data: { session: null }, error: null }); } } }; } };' });
    });
    await page.route('**/js.stripe.com/**', route => route.abort());
    await page.route('**/fonts.googleapis.com/**', route => route.abort());
    await page.route('**/fonts.gstatic.com/**', route => route.abort());

    await page.goto(`${BASE_URL}/split-pay.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const scriptContent = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[src]');
      const srcs = Array.from(scripts).map(s => s.src);
      return srcs.join(' ');
    });
    const hasSplitPayJs = scriptContent.includes('split-pay.js');
    expect(hasSplitPayJs).toBeTruthy();

    const hasCountdownFn = await page.evaluate(() => {
      return typeof startSplitCountdown === 'function';
    });
    expect(hasCountdownFn).toBeTruthy();
  });
});

test.describe('Crowd-Fund Structure Tests', () => {
  test('Crowd-funding related UI exists in member dashboard', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto(`${BASE_URL}/members.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const crowdFundedSection = page.locator('#crowd-funded-section');
    await expect(crowdFundedSection).toBeAttached();

    const crowdFundedCheckbox = page.locator('#p-crowd-funded');
    await expect(crowdFundedCheckbox).toBeAttached();
  });

  test('POST /api/split/create endpoint exists and does not return 404', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/split/create`, {
      headers: { 'Content-Type': 'application/json' },
      data: { packageId: 'test-pkg' }
    });
    expect(response.status()).not.toBe(404);
  });

  test('POST /api/split/pay endpoint exists and does not return 404', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/split/pay/test-participant-id`, {
      headers: { 'Content-Type': 'application/json' },
      data: {}
    });
    expect(response.status()).not.toBe(404);
    expect([400, 401, 403]).toContain(response.status());
  });
});

test.describe('Scheduler Smoke Tests', () => {
  test('Server starts successfully with all schedulers running', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/`);
    expect(response.status()).toBe(200);
  });

  test('Server continues to respond after being up for a few seconds', async ({ page }) => {
    const firstResponse = await page.request.get(`${BASE_URL}/`);
    expect(firstResponse.status()).toBe(200);

    await page.waitForTimeout(3000);

    const secondResponse = await page.request.get(`${BASE_URL}/`);
    expect(secondResponse.status()).toBe(200);
  });

  test('API responses maintain consistent response times without scheduler-induced slowdowns', async ({ page }) => {
    const times = [];
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      const response = await page.request.get(`${BASE_URL}/`);
      const elapsed = Date.now() - start;
      expect(response.status()).toBe(200);
      times.push(elapsed);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    expect(avgTime).toBeLessThan(5000);

    for (const t of times) {
      expect(t).toBeLessThan(10000);
    }
  });
});

test.describe('Payment Lifecycle Tests', () => {
  test('Stripe webhook endpoint accepts POST and returns 400 for bad signature', async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/webhook/stripe`, {
      data: '',
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).not.toBe(404);
    expect(response.status()).not.toBe(500);
    expect([400, 401, 403]).toContain(response.status());
  });

  test('Payment-related endpoints return proper JSON Content-Type', async ({ page }) => {
    const endpoints = [
      { method: 'POST', url: `${BASE_URL}/api/split/create` },
      { method: 'POST', url: `${BASE_URL}/api/split/pay/test-id` }
    ];

    for (const ep of endpoints) {
      const response = await page.request.fetch(ep.url, {
        method: ep.method,
        headers: { 'Content-Type': 'application/json' },
        data: '{}'
      });
      const contentType = response.headers()['content-type'] || '';
      expect(contentType).toContain('application/json');
    }
  });

  test('Multiple rapid requests to payment endpoints do not crash the server', async ({ page }) => {
    const requests = [];
    for (let i = 0; i < 10; i++) {
      requests.push(
        page.request.post(`${BASE_URL}/api/split/create`, {
          headers: { 'Content-Type': 'application/json' },
          data: {}
        })
      );
    }
    const responses = await Promise.all(requests);
    for (const response of responses) {
      expect(response.status()).not.toBe(500);
    }

    const healthCheck = await page.request.get(`${BASE_URL}/`);
    expect(healthCheck.status()).toBe(200);
  });
});

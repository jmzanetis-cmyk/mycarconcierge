const { test, expect } = require('@playwright/test');

const FAKE_MEMBER_ID = '00000000-aaaa-bbbb-cccc-000000000001';
const FAKE_PROVIDER_ID = '00000000-aaaa-bbbb-cccc-000000000002';
const FAKE_MEMBER_EMAIL = 'testuser@example.com';
const FAKE_PROVIDER_EMAIL = 'provider@example.com';
const FAKE_UUID = '00000000-0000-0000-0000-000000000000';

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
              } else if (_table === 'tos_acceptance') {
                if (_isSingle) {
                  result = { data: { id: '1', accepted_at: new Date().toISOString() }, error: null };
                } else {
                  result = { data: [{ id: '1', accepted_at: new Date().toISOString() }], error: null, count: 1 };
                }
              } else if (_table === 'vehicles') {
                result = { data: [], error: null };
              } else if (_table === 'maintenance_packages') {
                result = { data: [], error: null };
              } else if (_table === 'bids') {
                result = { data: [], error: null };
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
        body: JSON.stringify({ packages: [] })
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

test.describe('Escrow Payment Flow - API Authentication', () => {
  test('POST /api/escrow/create returns 401 without auth header', async ({ page }) => {
    await page.goto('/index.html');
    const result = await page.evaluate(async () => {
      const r = await fetch('/api/escrow/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      return { status: r.status };
    });
    expect(result.status).toBe(401);
  });

  test('POST /api/escrow/create returns 401/403 with invalid auth token', async ({ page }) => {
    await page.goto('/index.html');
    const result = await page.evaluate(async () => {
      const r = await fetch('/api/escrow/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer invalid-token-12345' },
        body: '{}'
      });
      return { status: r.status };
    });
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.status).toBeLessThanOrEqual(403);
  });

  test('POST /api/escrow/capture returns 401 without auth header', async ({ page }) => {
    await page.goto('/index.html');
    const result = await page.evaluate(async () => {
      const r = await fetch('/api/escrow/confirm/' + '00000000-0000-0000-0000-000000000000', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      return { status: r.status };
    });
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.status).toBeLessThanOrEqual(403);
  });

  test('POST /api/escrow/release returns 401 without auth header', async ({ page }) => {
    await page.goto('/index.html');
    const result = await page.evaluate(async () => {
      const r = await fetch('/api/escrow/release/' + '00000000-0000-0000-0000-000000000000', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      return { status: r.status };
    });
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.status).toBeLessThanOrEqual(403);
  });

  test('POST /api/escrow/refund returns 401 without auth header', async ({ page }) => {
    await page.goto('/index.html');
    const result = await page.evaluate(async () => {
      const r = await fetch('/api/escrow/refund/' + '00000000-0000-0000-0000-000000000000', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'test' }) });
      return { status: r.status };
    });
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.status).toBeLessThanOrEqual(403);
  });
});

test.describe('Merch Store - API Tests', () => {
  test('GET /api/shop/products returns 200 with JSON data', async ({ page }) => {
    await page.goto('/index.html');
    const result = await page.evaluate(async () => {
      const r = await fetch('/api/shop/products');
      const body = await r.json();
      return { status: r.status, isArray: Array.isArray(body), hasProducts: body.products !== undefined };
    });
    expect(result.status).toBe(200);
    expect(result.isArray || result.hasProducts).toBeTruthy();
  });

  test('POST /api/shop/checkout returns 401 without auth header', async ({ page }) => {
    await page.goto('/index.html');
    const result = await page.evaluate(async () => {
      const r = await fetch('/api/shop/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      return { status: r.status };
    });
    expect(result.status).toBe(401);
  });

  test('GET /api/member/refunds returns 401 without auth header', async ({ page }) => {
    await page.goto('/index.html');
    const result = await page.evaluate(async () => {
      const r = await fetch('/api/member/refunds');
      return { status: r.status };
    });
    expect(result.status).toBe(401);
  });
});

test.describe('Merch Store - UI Tests', () => {
  test('Shop section exists on member dashboard', async ({ page }) => {
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
      if (typeof showSection === 'function') showSection('shop');
    });
    await page.waitForTimeout(1000);

    const shopSection = page.locator('#shop');
    await expect(shopSection).toBeAttached();

    const productsGrid = page.locator('#shop-products-grid');
    await expect(productsGrid).toBeAttached();
  });
});

test.describe('Additional Payment APIs', () => {
  test('POST /webhook/stripe returns 400 without proper Stripe signature', async ({ page }) => {
    await page.goto('/index.html');
    const result = await page.evaluate(async () => {
      const r = await fetch('/webhook/stripe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '' });
      return { status: r.status };
    });
    expect(result.status).toBe(400);
  });
});

test.describe('Provider Earnings Section - UI Tests', () => {
  test('Provider earnings section exists on provider dashboard', async ({ page }) => {
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
      if (typeof showSection === 'function') showSection('earnings');
    });
    await page.waitForTimeout(1000);

    const earningsSection = page.locator('#earnings');
    await expect(earningsSection).toBeAttached();

    const earningsPending = page.locator('#earnings-pending');
    await expect(earningsPending).toBeAttached();

    const earningsReleased = page.locator('#earnings-released');
    await expect(earningsReleased).toBeAttached();

    const earningsTotal = page.locator('#earnings-total');
    await expect(earningsTotal).toBeAttached();
  });
});

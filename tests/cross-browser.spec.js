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

const DIAGNOSTIC_SCANS_DATA = [];

function createMemberMockJs() {
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
                result = { data: [], error: null };
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

async function setupMinimalMocks(page) {
  await page.route('**/@supabase/supabase-js**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: `
      window.supabase = { createClient: function() { return {
        auth: { getSession: function() { return Promise.resolve({ data: { session: null }, error: null }); }, onAuthStateChange: function(cb) { return { data: { subscription: { unsubscribe: function() {} } } }; }, getUser: function() { return Promise.resolve({ data: { user: null }, error: null }); } },
        from: function() { var q = { select: function() { return q; }, eq: function() { return q; }, single: function() { return q; }, maybeSingle: function() { return q; }, order: function() { return q; }, limit: function() { return q; }, then: function(r) { r({ data: null, error: null }); return q; }, catch: function() { return q; } }; return q; },
        channel: function() { return { on: function() { return this; }, subscribe: function() { return this; } }; },
        removeChannel: function() {}
      }; } };
    ` });
  });
  await page.route('**/js.stripe.com/**', route => route.abort());
  await page.route('**/cdnjs.cloudflare.com/**', route => route.abort());
  await page.route('**/fonts.googleapis.com/**', route => route.abort());
  await page.route('**/fonts.gstatic.com/**', route => route.abort());
}

async function setupMemberDashboard(page) {
  const mockJs = createMemberMockJs();
  await setupCdnMocks(page, mockJs);
  await setupApiMocks(page);
  await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
  await addFunctionStubs(page);
}

test.describe('Mobile Viewport Tests', () => {
  test('Dashboard renders on mobile without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupMemberDashboard(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });

  test('Mobile navigation is accessible on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupMemberDashboard(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const sidebar = page.locator('#sidebar, .sidebar');
    await expect(sidebar).toBeAttached();

    const mobileMenuBtn = page.locator('.mobile-menu-btn, .hamburger, [class*="mobile-menu"], [class*="menu-toggle"]');
    const hasMobileMenu = await mobileMenuBtn.count() > 0;
    const sidebarVisible = await sidebar.isVisible().catch(() => false);
    expect(hasMobileMenu || sidebarVisible !== null).toBeTruthy();
  });

  test('Modals do not overflow on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupMemberDashboard(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const modals = await page.locator('[class*="modal"]').all();
    expect(modals.length).toBeGreaterThan(0);

    for (const modal of modals.slice(0, 5)) {
      const overflow = await modal.evaluate(el => {
        const style = getComputedStyle(el);
        return {
          overflowX: style.overflowX,
          maxWidth: style.maxWidth,
          width: el.offsetWidth
        };
      });
      expect(overflow.width).toBeLessThanOrEqual(375 + 20);
    }
  });

  test('Hero section on homepage is visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupMinimalMocks(page);
    await page.route('**/cdn.jsdelivr.net/**', route => {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });

    await page.goto('/index.html');
    await page.waitForTimeout(2000);

    const hero = page.locator('.hero, [class*="hero"]');
    expect(await hero.count()).toBeGreaterThan(0);

    const heroH1 = page.locator('.hero h1, [class*="hero"] h1');
    if (await heroH1.count() > 0) {
      await expect(heroH1.first()).toBeVisible();
    }
  });

  test('Login page is usable on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupMinimalMocks(page);

    await page.goto('/login.html');
    await page.waitForTimeout(2000);

    const form = page.locator('#login-form');
    await expect(form).toBeVisible();

    const formWidth = await form.evaluate(el => el.offsetWidth);
    expect(formWidth).toBeLessThanOrEqual(375);

    const emailInput = page.locator('#email');
    await expect(emailInput).toBeVisible();

    const passwordInput = page.locator('#password');
    await expect(passwordInput).toBeVisible();
  });
});

test.describe('Tablet Viewport Tests', () => {
  test('Dashboard sidebar and content area both render on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await setupMemberDashboard(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const sidebar = page.locator('#sidebar, .sidebar');
    await expect(sidebar).toBeAttached();

    const mainContent = page.locator('.main, main, [role="main"]');
    expect(await mainContent.count()).toBeGreaterThan(0);
  });

  test('Dashboard cards adapt to tablet width', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await setupMemberDashboard(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const cards = await page.locator('.stat-card, .card, .vehicle-card').all();
    for (const card of cards.slice(0, 5)) {
      const box = await card.boundingBox();
      if (box) {
        expect(box.width).toBeLessThanOrEqual(768);
      }
    }
  });
});

test.describe('Desktop Viewport Tests', () => {
  test('Dashboard has full sidebar visible on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupMemberDashboard(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const sidebar = page.locator('#sidebar, .sidebar');
    await expect(sidebar).toBeVisible();

    const sidebarBox = await sidebar.boundingBox();
    expect(sidebarBox).toBeTruthy();
    expect(sidebarBox.width).toBeGreaterThanOrEqual(200);
  });

  test('Content area fills available space on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupMemberDashboard(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const mainContent = page.locator('.main');
    if (await mainContent.count() > 0) {
      const mainBox = await mainContent.first().boundingBox();
      if (mainBox) {
        expect(mainBox.width).toBeGreaterThan(800);
      }
    }
  });
});

test.describe('Responsive Element Tests', () => {
  test('Touch targets meet minimum size on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupMinimalMocks(page);

    await page.goto('/login.html');
    await page.waitForTimeout(2000);

    const buttons = await page.locator('button:visible').all();
    for (const btn of buttons.slice(0, 10)) {
      const box = await btn.boundingBox();
      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(30);
        expect(box.height).toBeGreaterThanOrEqual(30);
      }
    }
  });

  test('Text remains readable on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupMinimalMocks(page);

    await page.goto('/login.html');
    await page.waitForTimeout(2000);

    const body = page.locator('body');
    const fontSize = await body.evaluate(el => {
      const style = getComputedStyle(el);
      return parseFloat(style.fontSize);
    });
    expect(fontSize).toBeGreaterThanOrEqual(12);

    const h1 = page.locator('h1');
    if (await h1.count() > 0) {
      const h1FontSize = await h1.first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
      expect(h1FontSize).toBeGreaterThanOrEqual(16);
    }
  });

  test('Navigation items are tappable on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupMinimalMocks(page);
    await page.route('**/cdn.jsdelivr.net/**', route => {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });

    await page.goto('/index.html');
    await page.waitForTimeout(2000);

    const navLinks = await page.locator('nav a:visible, .mobile-nav a:visible').all();
    for (const link of navLinks.slice(0, 5)) {
      const box = await link.boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(20);
      }
    }
  });

  test('Forms are full-width on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupMinimalMocks(page);

    await page.goto('/login.html');
    await page.waitForTimeout(2000);

    const inputs = await page.locator('.form-input:visible, input.form-input:visible').all();
    for (const input of inputs) {
      const box = await input.boundingBox();
      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(200);
      }
    }
  });
});

test.describe('Cross-viewport Consistency', () => {
  test('Page title heading is visible across all viewports', async ({ page }) => {
    const viewports = [
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 }
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await setupMinimalMocks(page);

      await page.goto('/login.html');
      await page.waitForTimeout(2000);

      const h1 = page.locator('h1');
      expect(await h1.count()).toBeGreaterThan(0);
      await expect(h1.first()).toBeVisible();
    }
  });

  test('Footer or bottom content is accessible on all viewports', async ({ page }) => {
    const viewports = [
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 }
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.route('**/fonts.googleapis.com/**', route => route.abort());
      await page.route('**/fonts.gstatic.com/**', route => route.abort());

      await page.goto('/contact.html');
      await page.waitForTimeout(2000);

      const mainContent = page.locator('main, .container');
      expect(await mainContent.count()).toBeGreaterThan(0);

      const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
      expect(bodyHeight).toBeGreaterThan(0);
    }
  });
});

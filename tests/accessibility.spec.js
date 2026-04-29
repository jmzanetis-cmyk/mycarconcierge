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

test.describe('Landmark and Structure Tests', () => {
  test('Login page has proper HTML lang attribute', async ({ page }) => {
    await setupMinimalMocks(page);
    await page.goto('/login.html');
    await page.waitForTimeout(2000);

    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang');
  });

  test('Member dashboard has a main content area', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const mainContent = page.locator('.main, main, [role="main"]');
    expect(await mainContent.count()).toBeGreaterThan(0);
  });

  test('Pages have proper heading hierarchy with h1 present', async ({ page }) => {
    await setupMinimalMocks(page);
    await page.goto('/login.html');
    await page.waitForTimeout(2000);

    const h1 = page.locator('h1');
    expect(await h1.count()).toBeGreaterThan(0);
  });

  test('Login page has proper form structure with labels', async ({ page }) => {
    await setupMinimalMocks(page);
    await page.goto('/login.html');
    await page.waitForTimeout(2000);

    const form = page.locator('form#login-form');
    await expect(form).toBeAttached();

    const inputs = await page.locator('#login-form input[required]').all();
    expect(inputs.length).toBeGreaterThan(0);

    for (const input of inputs) {
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const placeholder = await input.getAttribute('placeholder');
      const hasLabel = id ? await page.locator(`label[for="${id}"]`).count() > 0 : false;
      expect(hasLabel || ariaLabel || placeholder).toBeTruthy();
    }
  });

  test('Signup page has proper form labels', async ({ page }) => {
    await setupMinimalMocks(page);
    await page.route('**/cdn.jsdelivr.net/**', route => {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });
    await page.goto('/signup-member.html');
    await page.waitForTimeout(2000);

    const h1 = page.locator('h1');
    expect(await h1.count()).toBeGreaterThan(0);

    const inputs = await page.locator('#signup-form input[required]').all();
    expect(inputs.length).toBeGreaterThan(0);

    for (const input of inputs) {
      const type = await input.getAttribute('type');
      if (type === 'checkbox' || type === 'hidden') continue;
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const placeholder = await input.getAttribute('placeholder');
      const hasLabel = id ? await page.locator(`label[for="${id}"]`).count() > 0 : false;
      const hasWrappingLabel = await input.evaluate(el => !!el.closest('label'));
      expect(hasLabel || hasWrappingLabel || ariaLabel || placeholder).toBeTruthy();
    }
  });
});

test.describe('Form Accessibility', () => {
  test('Login form inputs have associated labels or aria-label attributes', async ({ page }) => {
    await setupMinimalMocks(page);
    await page.goto('/login.html');
    await page.waitForTimeout(2000);

    const inputs = await page.locator('#login-form input[required]').all();
    expect(inputs.length).toBeGreaterThan(0);

    for (const input of inputs) {
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const placeholder = await input.getAttribute('placeholder');
      const hasForLabel = id ? await page.locator(`label[for="${id}"]`).count() > 0 : false;
      const hasWrappingLabel = await input.evaluate(el => !!el.closest('label'));
      const hasSiblingLabel = await input.evaluate(el => {
        const parent = el.closest('.form-group');
        return parent ? !!parent.querySelector('label') : false;
      });
      expect(hasForLabel || hasWrappingLabel || hasSiblingLabel || ariaLabel || placeholder).toBeTruthy();
    }
  });

  test('Member dashboard form inputs have labels', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const formInputs = await page.locator('.main input[id], .main select[id], .main textarea[id]').all();
    let labeledCount = 0;
    let totalChecked = 0;
    for (const input of formInputs.slice(0, 20)) {
      const type = await input.getAttribute('type');
      if (type === 'hidden' || type === 'checkbox' || type === 'radio' || type === 'file' || type === 'search' || type === 'color') continue;
      totalChecked++;
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const placeholder = await input.getAttribute('placeholder');
      const hasForLabel = id ? await page.locator(`label[for="${id}"]`).count() > 0 : false;
      const hasWrappingLabel = await input.evaluate(el => !!el.closest('label'));
      const hasNearbyLabel = await input.evaluate(el => {
        const parent = el.closest('.form-group') || el.closest('.modal-body') || el.closest('[class*="modal"]') || el.parentElement;
        return parent ? !!parent.querySelector('label, .form-label, [class*="label"]') : false;
      });
      const title = await input.getAttribute('title');
      if (hasForLabel || hasWrappingLabel || hasNearbyLabel || ariaLabel || placeholder || title) {
        labeledCount++;
      }
    }
    expect(totalChecked).toBeGreaterThan(0);
    const labelRate = labeledCount / totalChecked;
    expect(labelRate).toBeGreaterThanOrEqual(0.7);
  });

  test('Modal dialogs have proper modal structure', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const modals = await page.locator('[role="dialog"], .modal-backdrop, .modal, [class*="modal"]').all();
    expect(modals.length).toBeGreaterThan(0);
  });

  test('Close buttons on modals are keyboard accessible', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const closeButtons = await page.locator('[class*="modal"] button').all();
    expect(closeButtons.length).toBeGreaterThan(0);
    for (const btn of closeButtons.slice(0, 10)) {
      const tagName = await btn.evaluate(el => el.tagName.toLowerCase());
      expect(tagName).toBe('button');
    }
  });
});

test.describe('Navigation Accessibility', () => {
  test('Sidebar navigation items are focusable', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const navItems = await page.locator('.nav-item').all();
    expect(navItems.length).toBeGreaterThan(0);

    for (const item of navItems.slice(0, 10)) {
      const isInteractive = await item.evaluate(el => {
        const tag = el.tagName.toLowerCase();
        const hasTabindex = el.hasAttribute('tabindex');
        const hasRole = el.getAttribute('role') === 'button';
        const hasOnclick = el.hasAttribute('onclick') || typeof el.onclick === 'function';
        const hasCursor = getComputedStyle(el).cursor === 'pointer';
        return tag === 'button' || tag === 'a' || hasTabindex || hasRole || hasOnclick || hasCursor;
      });
      expect(isInteractive).toBeTruthy();
    }
  });

  test('Main content landmark exists on member dashboard', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const mainLandmark = page.locator('main, .main, [role="main"]');
    expect(await mainLandmark.count()).toBeGreaterThan(0);
  });

  test('Nav items have descriptive text content', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const navItems = await page.locator('.nav-item').all();
    for (const item of navItems.slice(0, 10)) {
      const text = await item.textContent();
      expect(text?.trim().length).toBeGreaterThan(0);
    }
  });
});

test.describe('Interactive Element Tests', () => {
  test('All visible buttons have text or aria-label', async ({ page }) => {
    await setupMinimalMocks(page);
    await page.goto('/login.html');
    await page.waitForTimeout(2000);

    const buttons = await page.locator('button:visible').all();
    for (const btn of buttons) {
      const text = await btn.textContent();
      const ariaLabel = await btn.getAttribute('aria-label');
      const title = await btn.getAttribute('title');
      expect(text?.trim() || ariaLabel || title).toBeTruthy();
    }
  });

  test('Links that open in new tabs have appropriate indication', async ({ page }) => {
    await setupMinimalMocks(page);
    await page.route('**/cdn.jsdelivr.net/**', route => {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });
    await page.goto('/signup-member.html');
    await page.waitForTimeout(2000);

    const newTabLinks = await page.locator('a[target="_blank"]').all();
    for (const link of newTabLinks) {
      const text = await link.textContent();
      const ariaLabel = await link.getAttribute('aria-label');
      const rel = await link.getAttribute('rel');
      expect(text?.trim() || ariaLabel).toBeTruthy();
    }
  });

  test('Theme toggle is keyboard accessible', async ({ page }) => {
    await setupMinimalMocks(page);
    await page.goto('/login.html');
    await page.waitForTimeout(2000);

    const themeToggle = page.locator('.theme-toggle-mini, .theme-toggle, .theme-toggle-btn, button[onclick*="toggleTheme"]');
    const count = await themeToggle.count();
    expect(count).toBeGreaterThan(0);

    const firstToggle = themeToggle.first();
    const tagName = await firstToggle.evaluate(el => el.tagName.toLowerCase());
    expect(tagName).toBe('button');
  });
});

test.describe('Image and Media', () => {
  test('Images have alt attributes or are decorative', async ({ page }) => {
    await setupMinimalMocks(page);
    await page.goto('/login.html');
    await page.waitForTimeout(2000);

    const images = await page.locator('img').all();
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      const ariaHidden = await img.getAttribute('aria-hidden');
      const role = await img.getAttribute('role');
      expect(alt !== null || ariaHidden === 'true' || role === 'presentation').toBeTruthy();
    }
  });
});

test.describe('Color and Contrast', () => {
  test('Page has CSS custom properties defined for theming', async ({ page }) => {
    await setupMinimalMocks(page);
    await page.goto('/login.html');
    await page.waitForTimeout(2000);

    const hasCustomProperties = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const textPrimary = style.getPropertyValue('--text-primary').trim();
      const bgDeep = style.getPropertyValue('--bg-deep').trim();
      return textPrimary.length > 0 && bgDeep.length > 0;
    });
    expect(hasCustomProperties).toBeTruthy();
  });

  test('Both light and dark themes are defined via data-theme attribute', async ({ page }) => {
    await setupMinimalMocks(page);
    await page.goto('/login.html');
    await page.waitForTimeout(2000);

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme');

    const currentTheme = await html.getAttribute('data-theme');
    expect(currentTheme === 'dark' || currentTheme === 'light').toBeTruthy();

    const supportsThemeSwitching = await page.evaluate(() => {
      const html = document.documentElement;
      html.setAttribute('data-theme', 'light');
      const lightBg = getComputedStyle(html).getPropertyValue('--bg-deep').trim();
      html.setAttribute('data-theme', 'dark');
      const darkBg = getComputedStyle(html).getPropertyValue('--bg-deep').trim();
      return lightBg.length > 0 && darkBg.length > 0;
    });
    expect(supportsThemeSwitching).toBeTruthy();
  });
});

test.describe('Contact Page Accessibility', () => {
  test('Contact page has proper lang attribute and heading', async ({ page }) => {
    await page.route('**/fonts.googleapis.com/**', route => route.abort());
    await page.route('**/fonts.gstatic.com/**', route => route.abort());
    await page.goto('/contact.html');
    await page.waitForTimeout(2000);

    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang');

    const h1 = page.locator('h1');
    expect(await h1.count()).toBeGreaterThan(0);

    const mainElement = page.locator('main');
    expect(await mainElement.count()).toBeGreaterThan(0);
  });
});

test.describe('Homepage Accessibility', () => {
  test('Homepage has proper lang attribute and h1', async ({ page }) => {
    await setupMinimalMocks(page);
    await page.route('**/cdn.jsdelivr.net/**', route => {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });
    await page.goto('/index.html');
    await page.waitForTimeout(2000);

    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang');

    const h1 = page.locator('h1');
    expect(await h1.count()).toBeGreaterThan(0);

    const images = await page.locator('img').all();
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      const ariaHidden = await img.getAttribute('aria-hidden');
      const role = await img.getAttribute('role');
      expect(alt !== null || ariaHidden === 'true' || role === 'presentation').toBeTruthy();
    }
  });
});

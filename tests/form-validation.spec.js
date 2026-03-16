const { test, expect } = require('@playwright/test');

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
      var vehiclesData = [
        { id: 'v1', owner_id: '${userId}', year: 2023, make: 'Toyota', model: 'Camry', trim_version: 'XLE', mileage: 45000, vin: '1HGBH41JXMN109186', created_at: '2024-01-03T00:00:00Z' }
      ];
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
                select: function() { return { single: function() { return Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error: null }); } }; },
                then: function(resolve) { resolve({ data: data, error: null }); return q; }
              };
            },
            update: function() { return q; },
            delete: function() { return q; },
            eq: function() { return q; }, neq: function() { return q; },
            in: function() { return q; },
            gt: function() { return q; }, gte: function() { return q; },
            lt: function() { return q; }, lte: function() { return q; },
            like: function() { return q; }, ilike: function() { return q; },
            is: function() { return q; }, not: function() { return q; },
            or: function() { return q; }, contains: function() { return q; },
            filter: function() { return q; }, order: function() { return q; },
            limit: function() { return q; }, range: function() { return q; },
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
              } else if (_table === 'tos_acceptance') {
                if (_isSingle) {
                  result = { data: { id: '1', accepted_at: new Date().toISOString() }, error: null };
                } else {
                  result = { data: [{ id: '1', accepted_at: new Date().toISOString() }], error: null, count: 1 };
                }
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

async function setupSimpleCdnMocks(page) {
  const simpleMock = `
    window.supabase = { createClient: function() { return {
      auth: { getSession: function() { return Promise.resolve({ data: { session: null }, error: null }); }, getUser: function() { return Promise.resolve({ data: { user: null }, error: null }); }, onAuthStateChange: function() { return { data: { subscription: { unsubscribe: function() {} } } }; } },
      from: function() { var q = { select: function() { return q; }, eq: function() { return q; }, single: function() { return q; }, maybeSingle: function() { return q; }, insert: function() { return q; }, update: function() { return q; }, delete: function() { return q; }, neq: function() { return q; }, gt: function() { return q; }, lt: function() { return q; }, gte: function() { return q; }, lte: function() { return q; }, like: function() { return q; }, ilike: function() { return q; }, in: function() { return q; }, order: function() { return q; }, limit: function() { return q; }, range: function() { return q; }, filter: function() { return q; }, or: function() { return q; }, not: function() { return q; }, is: function() { return q; }, contains: function() { return q; }, then: function(r) { r({ data: null, error: null }); return q; }, catch: function() { return q; } }; return q; },
      channel: function() { return { on: function() { return this; }, subscribe: function() { return this; } }; },
      removeChannel: function() {}
    }; } };
  `;
  await page.route('**/@supabase/supabase-js**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: simpleMock });
  });
  await page.route('**/unpkg.com/@supabase/**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: simpleMock });
  });
  await page.route('**/js.stripe.com/**', route => route.abort());
  await page.route('**/cdnjs.cloudflare.com/**', route => route.abort());
  await page.route('**/fonts.googleapis.com/**', route => route.abort());
  await page.route('**/fonts.gstatic.com/**', route => route.abort());
  await page.route('**/cdn.jsdelivr.net/**', route => {
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

test.describe('Login Form Validation', () => {
  test('Login form has HTML5 required attributes on email and password fields', async ({ page }) => {
    await setupSimpleCdnMocks(page);

    await page.goto('/login.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const emailInput = page.locator('#email');
    await expect(emailInput).toHaveAttribute('required', '');

    const passwordInput = page.locator('#password');
    await expect(passwordInput).toHaveAttribute('required', '');
  });

  test('Email input has type="email" for browser validation', async ({ page }) => {
    await setupSimpleCdnMocks(page);

    await page.goto('/login.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const emailInput = page.locator('#email');
    await expect(emailInput).toHaveAttribute('type', 'email');
  });
});

test.describe('Signup Form Validation', () => {
  test('Signup page has required fields for name, email, password', async ({ page }) => {
    await setupSimpleCdnMocks(page);

    await page.goto('/signup-member.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const nameInput = page.locator('#name');
    await expect(nameInput).toHaveAttribute('required', '');

    const emailInput = page.locator('#email');
    await expect(emailInput).toHaveAttribute('required', '');

    const passwordInput = page.locator('#password');
    await expect(passwordInput).toHaveAttribute('required', '');
  });

  test('Signup page has password field with minimum length requirements', async ({ page }) => {
    await setupSimpleCdnMocks(page);

    await page.goto('/signup-member.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const passwordInput = page.locator('#password');
    await expect(passwordInput).toHaveAttribute('minlength', '6');
  });
});

test.describe('Vehicle Form Validation', () => {
  test('Add vehicle form has year, make, model select fields', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const yearSelect = page.locator('#v-year');
    await expect(yearSelect).toBeAttached();

    const makeSelect = page.locator('#v-make');
    await expect(makeSelect).toBeAttached();

    const modelSelect = page.locator('#v-model');
    await expect(modelSelect).toBeAttached();
  });

  test('VIN input has maxlength="17" attribute', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const vinInput = page.locator('#v-vin');
    await expect(vinInput).toBeAttached();
    await expect(vinInput).toHaveAttribute('maxlength', '17');
  });
});

test.describe('Contact/Support Form', () => {
  test('Contact page has required fields for email, subject, message', async ({ page }) => {
    await page.route('**/fonts.googleapis.com/**', route => route.abort());
    await page.route('**/fonts.gstatic.com/**', route => route.abort());

    await page.goto('/contact.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const emailInput = page.locator('#email');
    await expect(emailInput).toHaveAttribute('required', '');

    const subjectSelect = page.locator('#subject');
    await expect(subjectSelect).toHaveAttribute('required', '');

    const messageTextarea = page.locator('#message');
    await expect(messageTextarea).toHaveAttribute('required', '');
  });

  test('Contact email field has type="email"', async ({ page }) => {
    await page.route('**/fonts.googleapis.com/**', route => route.abort());
    await page.route('**/fonts.gstatic.com/**', route => route.abort());

    await page.goto('/contact.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const emailInput = page.locator('#email');
    await expect(emailInput).toHaveAttribute('type', 'email');
  });
});

test.describe('Profile Settings Validation', () => {
  test('Member settings phone field exists with proper input type', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const phoneInput = page.locator('#settings-phone');
    await expect(phoneInput).toBeAttached();
    await expect(phoneInput).toHaveAttribute('type', 'tel');
  });

  test('Member settings zip code field exists', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const zipInput = page.locator('#settings-zip');
    await expect(zipInput).toBeAttached();
    await expect(zipInput).toHaveAttribute('maxlength', '10');
  });
});

test.describe('Prospect Vehicle Form', () => {
  test('Add prospect form has required fields (year, make, model)', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const prospectYear = page.locator('#prospect-year');
    await expect(prospectYear).toBeAttached();
    await expect(prospectYear).toHaveAttribute('required', '');

    const prospectMake = page.locator('#prospect-make');
    await expect(prospectMake).toBeAttached();
    await expect(prospectMake).toHaveAttribute('required', '');

    const prospectModel = page.locator('#prospect-model');
    await expect(prospectModel).toBeAttached();
    await expect(prospectModel).toHaveAttribute('required', '');
  });

  test('Prospect year field has min/max attributes', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const prospectYear = page.locator('#prospect-year');
    await expect(prospectYear).toBeAttached();
    await expect(prospectYear).toHaveAttribute('min', '1900');
    await expect(prospectYear).toHaveAttribute('max', '2030');
  });
});

test.describe('Emergency Form', () => {
  test('Emergency request modal has required emergency type select', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const emergencyTypeSelect = page.locator('#emergency-type');
    await expect(emergencyTypeSelect).toBeAttached();
    await expect(emergencyTypeSelect).toHaveAttribute('required', '');
  });
});

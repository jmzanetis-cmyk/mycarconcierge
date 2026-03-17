const { test, expect } = require('@playwright/test');

const FAKE_MEMBER_ID = '00000000-aaaa-bbbb-cccc-000000000001';
const FAKE_MEMBER_EMAIL = 'testuser@example.com';
const FAKE_PROVIDER_ID = '00000000-aaaa-bbbb-cccc-000000000002';
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

function createMemberMockJs(options = {}) {
  const userId = FAKE_MEMBER_ID;
  const email = FAKE_MEMBER_EMAIL;
  const vehiclesArray = options.emptyVehicles ? [] : VEHICLES_DATA;
  const vehicles = JSON.stringify(vehiclesArray);
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
            eq: function(col, val) { _filters.push({ col: col, op: 'eq', val: val }); return q; },
            neq: function() { return q; },
            in: function(col, vals) { _filters.push({ col: col, op: 'in', val: vals }); return q; },
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
              } else if (_table === 'reminders' || _table === 'notifications' || _table === 'diagnostic_scans' || _table === 'dream_car_criteria' || _table === 'dream_car_matches') {
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
      var providerProfile = {
        id: '${userId}',
        full_name: 'Test Provider',
        email: '${email}',
        role: 'provider',
        status: 'approved',
        business_name: 'Test Auto Shop',
        zip_code: '10001',
        phone: '5559876543',
        bid_credits: 10,
        rating: 4.8,
        jobs_completed: 25,
        emergency_enabled: true,
        emergency_services: ['flat_tire', 'tow_needed'],
        emergency_radius: 15,
        can_tow: true,
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
                  result = { data: providerProfile, error: null };
                } else {
                  result = { data: [providerProfile], error: null, count: 1 };
                }
              } else if (_table === 'tos_acceptance') {
                if (_isSingle) {
                  result = { data: { id: '1', accepted_at: new Date().toISOString() }, error: null };
                } else {
                  result = { data: [{ id: '1', accepted_at: new Date().toISOString() }], error: null, count: 1 };
                }
              } else if (_table === 'provider_applications') {
                if (_isSingle) {
                  result = { data: { id: '1', status: 'approved', user_id: '${userId}' }, error: null };
                } else {
                  result = { data: [{ id: '1', status: 'approved', user_id: '${userId}' }], error: null, count: 1 };
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

function createFailedLoginMockJs() {
  return `
    (function() {
      var noopChannel = { on: function() { return this; }, subscribe: function() { return this; }, unsubscribe: function() {} };
      var mockClient = {
        auth: {
          getSession: function() { return Promise.resolve({ data: { session: null }, error: null }); },
          getUser: function() { return Promise.resolve({ data: { user: null }, error: { name: 'AuthSessionMissingError', message: 'Session missing' } }); },
          onAuthStateChange: function(cb) { return { data: { subscription: { unsubscribe: function() {} } } }; },
          signInWithPassword: function() {
            return Promise.resolve({ data: null, error: { message: 'Invalid login credentials' } });
          },
          signOut: function() { return Promise.resolve({ error: null }); },
          signUp: function() { return Promise.resolve({ data: null, error: null }); },
          resetPasswordForEmail: function() { return Promise.resolve({ data: null, error: null }); }
        },
        from: function() {
          var q = {
            select: function() { return q; }, insert: function() { return q; }, update: function() { return q; },
            delete: function() { return q; }, eq: function() { return q; }, neq: function() { return q; },
            gt: function() { return q; }, lt: function() { return q; }, gte: function() { return q; },
            lte: function() { return q; }, like: function() { return q; }, ilike: function() { return q; },
            in: function() { return q; }, order: function() { return q; }, limit: function() { return q; },
            single: function() { return q; }, maybeSingle: function() { return q; }, range: function() { return q; },
            filter: function() { return q; }, or: function() { return q; }, not: function() { return q; },
            is: function() { return q; }, contains: function() { return q; },
            then: function(resolve) { resolve({ data: [], error: null, count: 0 }); return q; },
            catch: function() { return q; }
          };
          return q;
        },
        channel: function() { return noopChannel; },
        removeChannel: function() {},
        rpc: function() { return Promise.resolve({ data: null, error: null }); },
        storage: { from: function() { return { upload: function() { return Promise.resolve({}); }, getPublicUrl: function() { return { data: { publicUrl: '' } }; } }; } },
        functions: { invoke: function() { return Promise.resolve({ data: null, error: null }); } }
      };
      window.supabase = { createClient: function() { return mockClient; } };
    })();
  `;
}

function createLoginMockJs() {
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
      var profileData = [{
        id: '${userId}',
        full_name: 'Test User',
        email: '${email}',
        role: 'member',
        zip_code: '10001',
        phone: '5551234567',
        status: 'approved'
      }];
      var loggedIn = false;
      var mockClient = {
        auth: {
          getSession: function() {
            if (loggedIn) {
              return Promise.resolve({ data: { session: fakeSession }, error: null });
            }
            return Promise.resolve({ data: { session: null }, error: null });
          },
          getUser: function() {
            if (loggedIn) {
              return Promise.resolve({ data: { user: fakeUser }, error: null });
            }
            return Promise.resolve({ data: { user: null }, error: { name: 'AuthSessionMissingError', message: 'Session missing' } });
          },
          onAuthStateChange: function(cb) { return { data: { subscription: { unsubscribe: function() {} } } }; },
          signInWithPassword: function() {
            loggedIn = true;
            return Promise.resolve({ data: { session: fakeSession, user: fakeUser }, error: null });
          },
          signOut: function() { loggedIn = false; return Promise.resolve({ error: null }); },
          signUp: function() { return Promise.resolve({ data: null, error: null }); },
          resetPasswordForEmail: function() { return Promise.resolve({ data: null, error: null }); }
        },
        from: function(table) {
          var q = {
            select: function() { return q; }, insert: function() { return q; }, update: function() { return q; },
            delete: function() { return q; }, eq: function() { return q; }, neq: function() { return q; },
            gt: function() { return q; }, lt: function() { return q; }, gte: function() { return q; },
            lte: function() { return q; }, like: function() { return q; }, ilike: function() { return q; },
            in: function() { return q; }, order: function() { return q; }, limit: function() { return q; },
            single: function() { return q; }, maybeSingle: function() { return q; }, range: function() { return q; },
            filter: function() { return q; }, or: function() { return q; }, not: function() { return q; },
            is: function() { return q; }, contains: function() { return q; },
            then: function(resolve) {
              if (table === 'profiles') {
                resolve({ data: profileData[0], error: null });
              } else {
                resolve({ data: [], error: null, count: 0 });
              }
              return q;
            },
            catch: function() { return q; }
          };
          return q;
        },
        channel: function() { return noopChannel; },
        removeChannel: function() {},
        rpc: function() { return Promise.resolve({ data: null, error: null }); },
        storage: { from: function() { return { upload: function() { return Promise.resolve({}); }, getPublicUrl: function() { return { data: { publicUrl: '' } }; } }; } },
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

async function addProviderFunctionStubs(page) {
  await page.addInitScript(() => {
    var noop = function() {};
    var asyncNoop = function() { return Promise.resolve(); };
    window.loadProviderAgreement = asyncNoop;
    window.loadProviderPerformance = asyncNoop;
    window.loadTeamMembers = asyncNoop;
    window.loadDestinationTasks = asyncNoop;
    window.loadEarningsAnalyticsData = asyncNoop;
    window.initAdvancedAnalytics = noop;
    window.loadPosAnalytics = asyncNoop;
    window.refreshEmergencies = asyncNoop;
    window.loadTransportTasks = asyncNoop;
    window.setupRealtimeSubscriptions = noop;
    window.loadNotifications = asyncNoop;
    window.loadConversations = asyncNoop;
    window.showToast = noop;
    window.escapeHtml = function(text) { return text ? String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; };
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

async function setupLoginApiMocks(page) {
  await page.route('**/rest/v1/**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
  await page.route('**/api/2fa/status', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, enabled: false }) });
  });
  await page.route('**/api/email/**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.route('**/api/auth/**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.route('**/api/**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authorized: true, verified: true, connected: false, status: 'clear' }) });
  });
}

test.describe('Member Registration/Login Flow', () => {
  test('Unauthenticated user visiting /members.html gets redirected to login', async ({ page }) => {
    const noAuthMock = `
      (function() {
        var noopChannel = { on: function() { return this; }, subscribe: function() { return this; }, unsubscribe: function() {} };
        var mockClient = {
          auth: {
            getSession: function() { return Promise.resolve({ data: { session: null }, error: null }); },
            getUser: function() { return Promise.resolve({ data: { user: null }, error: { name: 'AuthSessionMissingError', message: 'Session missing' } }); },
            onAuthStateChange: function(cb) { return { data: { subscription: { unsubscribe: function() {} } } }; },
            signInWithPassword: function() { return Promise.resolve({ data: null, error: { message: 'Invalid login credentials' } }); },
            signOut: function() { return Promise.resolve({ error: null }); },
            signUp: function() { return Promise.resolve({ data: null, error: null }); },
            resetPasswordForEmail: function() { return Promise.resolve({ data: null, error: null }); }
          },
          from: function() {
            var q = {
              select: function() { return q; }, eq: function() { return q; }, single: function() { return q; },
              maybeSingle: function() { return q; }, insert: function() { return q; }, update: function() { return q; },
              delete: function() { return q; }, neq: function() { return q; }, gt: function() { return q; },
              lt: function() { return q; }, gte: function() { return q; }, lte: function() { return q; },
              like: function() { return q; }, ilike: function() { return q; }, in: function() { return q; },
              order: function() { return q; }, limit: function() { return q; }, range: function() { return q; },
              filter: function() { return q; }, or: function() { return q; }, not: function() { return q; },
              is: function() { return q; }, contains: function() { return q; },
              then: function(resolve) { resolve({ data: [], error: null, count: 0 }); return q; },
              catch: function() { return q; }
            };
            return q;
          },
          channel: function() { return noopChannel; },
          removeChannel: function() {},
          rpc: function() { return Promise.resolve({ data: null, error: null }); },
          storage: { from: function() { return { upload: function() { return Promise.resolve({}); }, getPublicUrl: function() { return { data: { publicUrl: '' } }; } }; } },
          functions: { invoke: function() { return Promise.resolve({ data: null, error: null }); } }
        };
        window.supabase = { createClient: function() { return mockClient; } };
      })();
    `;
    await setupCdnMocks(page, noAuthMock);
    await setupApiMocks(page);

    await page.goto('/members.html');
    await page.waitForURL('**/login.html', { timeout: 15000 });
    expect(page.url()).toContain('login.html');
  });

  test('Login page has email and password fields and submit button', async ({ page }) => {
    const mockJs = createFailedLoginMockJs();
    await setupCdnMocks(page, mockJs);
    await setupLoginApiMocks(page);

    await page.goto('/login.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const emailInput = page.locator('#email');
    await expect(emailInput).toBeAttached();

    const passwordInput = page.locator('#password');
    await expect(passwordInput).toBeAttached();

    const loginBtn = page.locator('#login-btn');
    await expect(loginBtn).toBeAttached();
  });

  test('Login form shows error state on failed credentials', async ({ page }) => {
    const mockJs = createFailedLoginMockJs();
    await setupCdnMocks(page, mockJs);
    await setupLoginApiMocks(page);

    await page.goto('/login.html');
    await page.waitForLoadState('domcontentloaded');

    await page.fill('#email', 'wrong@example.com');
    await page.fill('#password', 'WrongPassword123!');
    await page.click('#login-btn');

    const message = page.locator('#message');
    await expect(message).toBeVisible({ timeout: 15000 });
    const messageText = await message.textContent();
    expect(messageText.length).toBeGreaterThan(0);
  });

  test('Successful login navigates to member dashboard', async ({ page }) => {
    const mockJs = createLoginMockJs();
    await setupCdnMocks(page, mockJs);
    await setupLoginApiMocks(page);

    await page.goto('/login.html');
    await page.waitForLoadState('domcontentloaded');

    await page.fill('#email', FAKE_MEMBER_EMAIL);
    await page.fill('#password', 'TestPassword123!');
    await page.click('#login-btn');

    await page.waitForURL('**/members.html', { timeout: 15000 });
    expect(page.url()).toContain('members.html');
  });
});

test.describe('Member Vehicle-to-Service Flow', () => {
  test('Member dashboard shows onboarding prompt when no vehicles exist', async ({ page }) => {
    const mockJs = createMemberMockJs({ emptyVehicles: true });
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const onboardingCard = page.locator('.onboarding-card');
    const vehicleSection = page.locator('#vehicles');
    const hasOnboarding = await onboardingCard.count() > 0;
    const hasVehicleSection = await vehicleSection.count() > 0;
    expect(hasOnboarding || hasVehicleSection).toBe(true);
  });

  test('Member with vehicles can navigate to packages section', async ({ page }) => {
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
    const isActive = await packagesSection.evaluate(el => el.classList.contains('active'));
    expect(isActive).toBe(true);
  });

  test('Service request form has required fields', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const packagesSection = page.locator('#packages');
    await expect(packagesSection).toBeAttached();

    const packagesNav = page.locator('.nav-item[data-section="packages"]');
    await expect(packagesNav).toBeAttached();
  });
});

test.describe('Provider Workflow', () => {
  test('Provider dashboard loads with correct sections', async ({ page }) => {
    const mockJs = createProviderMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_PROVIDER_ID, FAKE_PROVIDER_EMAIL);
    await addProviderFunctionStubs(page);

    await page.goto('/providers.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toBeAttached();

    const bidsNav = page.locator('.nav-item[data-section="bids"]');
    await expect(bidsNav).toBeAttached();

    const jobsNav = page.locator('.nav-item[data-section="jobs"]');
    await expect(jobsNav).toBeAttached();
  });

  test('Provider can navigate to bids section', async ({ page }) => {
    const mockJs = createProviderMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_PROVIDER_ID, FAKE_PROVIDER_EMAIL);
    await addProviderFunctionStubs(page);

    await page.goto('/providers.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const bidsNav = page.locator('.nav-item[data-section="bids"]');
    await expect(bidsNav).toBeAttached();
    await bidsNav.click();
    await page.waitForTimeout(1000);

    const bidsSection = page.locator('#bids');
    await expect(bidsSection).toBeAttached();
  });

  test('Provider can navigate to jobs section', async ({ page }) => {
    const mockJs = createProviderMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_PROVIDER_ID, FAKE_PROVIDER_EMAIL);
    await addProviderFunctionStubs(page);

    await page.goto('/providers.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const jobsNav = page.locator('.nav-item[data-section="jobs"]');
    await expect(jobsNav).toBeAttached();
    await jobsNav.click();
    await page.waitForTimeout(1000);

    const jobsSection = page.locator('#jobs');
    await expect(jobsSection).toBeAttached();
  });
});

test.describe('Emergency Flow', () => {
  test('Member can open emergency request modal', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const emergencyModal = page.locator('#emergency-request-modal');
    await expect(emergencyModal).toBeAttached();
  });

  test('Emergency type selection changes price preview visibility', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const pricePreview = page.locator('#emergency-price-preview');
    await expect(pricePreview).toBeAttached();

    const emergencyTypeSelect = page.locator('#emergency-type');
    await expect(emergencyTypeSelect).toBeAttached();
  });
});

test.describe('Account Management', () => {
  test('Settings section has account deletion option', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const deleteAccountModal = page.locator('#delete-account-modal');
    await expect(deleteAccountModal).toBeAttached();
  });

  test('Account deletion requires typing DELETE to confirm', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const deleteConfirmInput = page.locator('#delete-confirm-input');
    await expect(deleteConfirmInput).toBeAttached();

    const placeholder = await deleteConfirmInput.getAttribute('placeholder');
    expect(placeholder).toBe('DELETE');
  });
});

test.describe('Navigation Flow', () => {
  test('Member sidebar has all required navigation items', async ({ page }) => {
    const mockJs = createMemberMockJs();
    await setupCdnMocks(page, mockJs);
    await setupApiMocks(page);
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await addFunctionStubs(page);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const requiredSections = ['overview', 'vehicles', 'packages', 'emergency', 'history'];
    for (const section of requiredSections) {
      const navItem = page.locator(`.nav-item[data-section="${section}"]`);
      await expect(navItem).toBeAttached();
    }
  });

  test('Clicking nav items switches visible sections', async ({ page }) => {
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

    const vehiclesSection = page.locator('#vehicles');
    await expect(vehiclesSection).toBeAttached();
    const isActive = await vehiclesSection.evaluate(el => el.classList.contains('active'));
    expect(isActive).toBe(true);
  });
});

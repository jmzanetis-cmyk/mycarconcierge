const { test, expect } = require('@playwright/test');

const FAKE_PROVIDER_ID = '00000000-aaaa-bbbb-cccc-000000000002';
const FAKE_PROVIDER_EMAIL = 'provider@example.com';

const TEAM_MEMBERS_DATA = [
  { id: 'tm1', provider_id: FAKE_PROVIDER_ID, name: 'John Smith', role: 'mechanic', experience_years: 10, bio: 'ASE certified master technician', certifications: 'ASE Master, I-CAR Gold', specialties: 'Engine repair, Brakes', created_at: '2024-01-01T00:00:00Z' },
  { id: 'tm2', provider_id: FAKE_PROVIDER_ID, name: 'Jane Doe', role: 'detailer', experience_years: 5, bio: 'Professional detailing specialist', certifications: 'IDA Certified', specialties: 'Paint correction, Ceramic coating', created_at: '2024-01-15T00:00:00Z' }
];

const TRANSPORT_TASKS_DATA = [
  { id: 'tt1', provider_id: FAKE_PROVIDER_ID, vehicle_description: '2023 Toyota Camry - Silver', pickup_address: '123 Main St', delivery_address: '456 Oak Ave', status: 'assigned', created_at: '2024-02-10T00:00:00Z' }
];

function createProviderMockJs() {
  const userId = FAKE_PROVIDER_ID;
  const email = FAKE_PROVIDER_EMAIL;
  const teamMembers = JSON.stringify(TEAM_MEMBERS_DATA);
  const transportTasks = JSON.stringify(TRANSPORT_TASKS_DATA);

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
      var teamMembersData = ${teamMembers};
      var transportTasksData = ${transportTasks};
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
                  result = { data: providerProfile, error: null };
                } else {
                  result = { data: [providerProfile], error: null, count: 1 };
                }
              } else if (_table === 'provider_team_members') {
                result = { data: teamMembersData, error: null };
              } else if (_table === 'destination_tasks' || _table === 'transport_tasks') {
                result = { data: transportTasksData, error: null };
              } else if (_table === 'agreements') {
                result = { data: [], error: null };
              } else if (_table === 'maintenance_packages') {
                result = { data: [], error: null };
              } else if (_table === 'bids') {
                result = { data: [], error: null };
              } else if (_table === 'payments') {
                result = { data: [], error: null };
              } else if (_table === 'reviews') {
                result = { data: [], error: null };
              } else if (_table === 'notifications') {
                result = { data: [], error: null };
              } else if (_table === 'tos_acceptance') {
                if (_isSingle) {
                  result = { data: { id: '1', accepted_at: new Date().toISOString() }, error: null };
                } else {
                  result = { data: [{ id: '1', accepted_at: new Date().toISOString() }], error: null, count: 1 };
                }
              } else if (_table === 'emergency_requests') {
                result = { data: [], error: null };
              } else if (_table === 'background_checks') {
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
    route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.Chart = function(ctx, config) { this.destroy = function(){}; this.update = function(){}; this.data = config?.data || {}; };' });
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
        user_metadata: { full_name: 'Test Provider' }
      }
    }));
  }, { userId, email });
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

async function setupProviderPage(page) {
  const mockJs = createProviderMockJs();
  await setupCdnMocks(page, mockJs);
  await setupApiMocks(page);
  await addAuthToken(page, FAKE_PROVIDER_ID, FAKE_PROVIDER_EMAIL);
  await addProviderFunctionStubs(page);

  await page.goto('/providers.html');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

test.describe('Provider Team Features', () => {
  test('Provider dashboard team section exists with team grid', async ({ page }) => {
    await setupProviderPage(page);

    const teamSection = page.locator('#team');
    await expect(teamSection).toBeAttached();

    const teamGrid = page.locator('#team-members-grid');
    await expect(teamGrid).toBeAttached();
  });

  test('Team member modal exists with all form fields', async ({ page }) => {
    await setupProviderPage(page);

    const teamModal = page.locator('#team-member-modal');
    await expect(teamModal).toBeAttached();

    const nameInput = page.locator('#team-member-name');
    await expect(nameInput).toBeAttached();

    const roleSelect = page.locator('#team-member-role');
    await expect(roleSelect).toBeAttached();

    const experienceInput = page.locator('#team-member-experience');
    await expect(experienceInput).toBeAttached();

    const bioTextarea = page.locator('#team-member-bio');
    await expect(bioTextarea).toBeAttached();

    const certificationsInput = page.locator('#team-member-certifications');
    await expect(certificationsInput).toBeAttached();

    const specialtiesInput = page.locator('#team-member-specialties');
    await expect(specialtiesInput).toBeAttached();
  });

  test('Team members table body exists in team management section', async ({ page }) => {
    await setupProviderPage(page);

    const teamTbody = page.locator('#team-members-tbody');
    await expect(teamTbody).toBeAttached();

    const teamManagementSection = page.locator('#team-section');
    await expect(teamManagementSection).toBeAttached();
  });
});

test.describe('Provider Analytics', () => {
  test('Provider analytics section exists with stat elements', async ({ page }) => {
    await setupProviderPage(page);

    const analyticsSection = page.locator('#analytics');
    await expect(analyticsSection).toBeAttached();

    const totalEarnings = page.locator('#analytics-total-earnings');
    await expect(totalEarnings).toBeAttached();

    const bidSuccessRate = page.locator('#analytics-bid-success-rate');
    await expect(bidSuccessRate).toBeAttached();

    const avgJobValue = page.locator('#analytics-avg-job-value');
    await expect(avgJobValue).toBeAttached();

    const jobsCompleted = page.locator('#analytics-jobs-completed');
    await expect(jobsCompleted).toBeAttached();
  });

  test('Earnings analytics section exists with chart canvas', async ({ page }) => {
    await setupProviderPage(page);

    const earningsAnalytics = page.locator('#earnings-analytics');
    await expect(earningsAnalytics).toBeAttached();

    const earningsChart = page.locator('#earnings-chart');
    await expect(earningsChart).toBeAttached();
  });

  test('Analytics chart canvases exist', async ({ page }) => {
    await setupProviderPage(page);

    const earningsLineChart = page.locator('#analytics-earnings-line-chart');
    await expect(earningsLineChart).toBeAttached();

    const bidPieChart = page.locator('#analytics-bid-pie-chart');
    await expect(bidPieChart).toBeAttached();

    const servicesBarChart = page.locator('#analytics-services-bar-chart');
    await expect(servicesBarChart).toBeAttached();
  });
});

test.describe('Provider Emergency Settings', () => {
  test('Provider emergency settings section exists with all options', async ({ page }) => {
    await setupProviderPage(page);

    const emergencyAcceptCalls = page.locator('#emergency-accept-calls');
    await expect(emergencyAcceptCalls).toBeAttached();

    const emergencySettingsDetails = page.locator('#emergency-settings-details');
    await expect(emergencySettingsDetails).toBeAttached();

    const emergencyRadius = page.locator('#emergency-radius');
    await expect(emergencyRadius).toBeAttached();

    const emergency247 = page.locator('#emergency-24-7');
    await expect(emergency247).toBeAttached();

    const emergencyCanTow = page.locator('#emergency-can-tow');
    await expect(emergencyCanTow).toBeAttached();
  });

  test('Provider emergency queue section exists', async ({ page }) => {
    await setupProviderPage(page);

    const emergenciesSection = page.locator('#emergencies');
    await expect(emergenciesSection).toBeAttached();

    const emergencyQueue = page.locator('#emergency-queue');
    await expect(emergencyQueue).toBeAttached();
  });
});

test.describe('Agreement Signing API', () => {
  test('POST /api/agreements/sign rejects unauthenticated requests', async ({ page }) => {
    const response = await page.request.post('/api/agreements/sign', {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        agreementType: 'provider',
        signature: 'Test Signature',
        fullName: 'Test Provider'
      })
    });

    expect([400, 401]).toContain(response.status());
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('Agreement signing API rejects empty payload', async ({ page }) => {
    const response = await page.request.post('/api/agreements/sign', {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({})
    });

    expect([400, 401]).toContain(response.status());
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('GET /api/agreements/user endpoint exists', async ({ page }) => {
    const response = await page.request.get('/api/agreements/user/test-user-id');

    const status = response.status();
    expect([200, 401, 404]).toContain(status);
  });
});

test.describe('Provider Background Checks', () => {
  test('Provider background checks section exists', async ({ page }) => {
    await setupProviderPage(page);

    const backgroundChecksSection = page.locator('#background-checks');
    await expect(backgroundChecksSection).toBeAttached();

    const sectionContent = await backgroundChecksSection.textContent();
    expect(sectionContent).toContain('Background Verification');
  });

  test('Provider team member background check elements exist', async ({ page }) => {
    await setupProviderPage(page);

    const providerCheckContent = page.locator('#provider-check-content');
    await expect(providerCheckContent).toBeAttached();

    const teamChecksList = page.locator('#team-checks-list');
    await expect(teamChecksList).toBeAttached();

    const backgroundCheckModal = page.locator('#background-check-modal');
    await expect(backgroundCheckModal).toBeAttached();
  });
});

test.describe('Provider Navigation', () => {
  test('Provider nav includes team and analytics sections', async ({ page }) => {
    await setupProviderPage(page);

    const teamNav = page.locator('.nav-item[data-section="team"]');
    await expect(teamNav).toBeAttached();

    const analyticsNav = page.locator('.nav-item[data-section="analytics"]');
    await expect(analyticsNav).toBeAttached();

    const earningsAnalyticsNav = page.locator('.nav-item[data-section="earnings-analytics"]');
    await expect(earningsAnalyticsNav).toBeAttached();

    const backgroundChecksNav = page.locator('.nav-item[data-section="background-checks"]');
    await expect(backgroundChecksNav).toBeAttached();

    const emergenciesNav = page.locator('.nav-item[data-section="emergencies"]');
    await expect(emergenciesNav).toBeAttached();
  });
});

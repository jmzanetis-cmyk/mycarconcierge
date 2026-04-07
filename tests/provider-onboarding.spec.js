const { test, expect } = require('@playwright/test');

const FAKE_PROVIDER_ID = '00000000-aaaa-bbbb-cccc-000000000002';
const FAKE_PROVIDER_EMAIL = 'provider@example.com';
const FAKE_ADMIN_ID = '00000000-aaaa-bbbb-cccc-000000000099';
const FAKE_ADMIN_EMAIL = 'admin@example.com';

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
              } else if (_table === 'emergency_requests') {
                result = { data: [], error: null };
              } else if (_table === 'provider_team_members') {
                result = { data: [], error: null };
              } else if (_table === 'agreements') {
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

function createAdminMockJs() {
  const userId = FAKE_ADMIN_ID;
  const email = FAKE_ADMIN_EMAIL;

  return `
    (function() {
      var noopChannel = { on: function() { return this; }, subscribe: function() { return this; }, unsubscribe: function() {} };
      var fakeUser = {
        id: '${userId}',
        email: '${email}',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: 'Admin User' }
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
        full_name: 'Admin User',
        email: '${email}',
        role: 'admin',
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
                  result = { data: null, error: null, count: 5 };
                } else if (_isSingle) {
                  result = { data: profileData, error: null };
                } else {
                  result = { data: [profileData], error: null, count: 1 };
                }
              } else if (_table === 'provider_applications') {
                if (_countMode && _headMode) {
                  result = { data: null, error: null, count: 3 };
                } else {
                  result = { data: [
                    { id: 'app1', user_id: 'u1', business_name: 'Quick Fix Auto', status: 'pending', created_at: '2024-01-15T00:00:00Z' },
                    { id: 'app2', user_id: 'u2', business_name: 'Pro Detailing', status: 'approved', created_at: '2024-01-10T00:00:00Z' }
                  ], error: null, count: 2 };
                }
              } else if (_table === 'disputes') {
                result = { data: null, error: null, count: 2 };
              } else if (_table === 'helpdesk_tickets') {
                result = { data: null, error: null, count: 1 };
              } else if (_table === 'violation_reports') {
                result = { data: null, error: null, count: 0 };
              } else if (_table === 'completed_activity_reviews') {
                result = { data: null, error: null, count: 0 };
              } else if (_table === 'pilot_applications') {
                result = { data: null, error: null, count: 0 };
              } else if (_table === 'member_founder_applications') {
                result = { data: null, error: null, count: 0 };
              } else if (_table === 'founder_payouts') {
                result = { data: null, error: null, count: 0 };
              } else if (_table === 'registration_verifications') {
                result = { data: null, error: null, count: 0 };
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
        rpc: function(fnName) {
          if (fnName === 'verify_admin_password') {
            return Promise.resolve({ data: true, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
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

async function addAdminFunctionStubs(page) {
  await page.addInitScript(() => {
    var noop = function() {};
    var asyncNoop = function() { return Promise.resolve(); };
    window.showToast = noop;
    window.escapeHtml = function(text) { return text ? String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; };
    window.loadDashboardStats = asyncNoop;
    window.loadApplications = asyncNoop;
    window.loadProviders = asyncNoop;
    window.setupRealtimeSubscriptions = noop;
    window.loadNotifications = asyncNoop;
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

async function setupAdminPage(page) {
  const mockJs = createAdminMockJs();
  await setupCdnMocks(page, mockJs);
  await setupApiMocks(page);
  await addAuthToken(page, FAKE_ADMIN_ID, FAKE_ADMIN_EMAIL);
  await addAdminFunctionStubs(page);

  await page.goto('/admin.html');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

test.describe('Provider Application Flow', () => {
  test('Provider signup page exists with registration form', async ({ page }) => {
    await page.route('**/@supabase/supabase-js**', route => {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: createProviderMockJs() });
    });
    await page.route('**/js.stripe.com/**', route => route.abort());
    await page.route('**/cdnjs.cloudflare.com/**', route => route.abort());
    await page.route('**/fonts.googleapis.com/**', route => route.abort());
    await page.route('**/fonts.gstatic.com/**', route => route.abort());
    await page.route('**/cdn.jsdelivr.net/**', route => {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });

    await page.goto('/signup-provider.html');
    await page.waitForLoadState('domcontentloaded');

    const pageContent = await page.content();
    expect(pageContent).toContain('provider');
  });

  test('Application form has required business fields', async ({ page }) => {
    await page.route('**/@supabase/supabase-js**', route => {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: createProviderMockJs() });
    });
    await page.route('**/js.stripe.com/**', route => route.abort());
    await page.route('**/cdnjs.cloudflare.com/**', route => route.abort());
    await page.route('**/fonts.googleapis.com/**', route => route.abort());
    await page.route('**/fonts.gstatic.com/**', route => route.abort());
    await page.route('**/cdn.jsdelivr.net/**', route => {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });

    await page.goto('/signup-provider.html');
    await page.waitForLoadState('domcontentloaded');

    const businessName = page.locator('#business-name');
    await expect(businessName).toBeAttached();

    const serviceArea = page.locator('#service-area');
    await expect(serviceArea).toBeAttached();

    const uploadLicense = page.locator('#upload-license');
    await expect(uploadLicense).toBeAttached();

    const uploadInsurance = page.locator('#upload-insurance');
    await expect(uploadInsurance).toBeAttached();
  });

  test('Provider signup includes services checkboxes and agreement section', async ({ page }) => {
    await page.route('**/@supabase/supabase-js**', route => {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: createProviderMockJs() });
    });
    await page.route('**/js.stripe.com/**', route => route.abort());
    await page.route('**/cdnjs.cloudflare.com/**', route => route.abort());
    await page.route('**/fonts.googleapis.com/**', route => route.abort());
    await page.route('**/fonts.gstatic.com/**', route => route.abort());
    await page.route('**/cdn.jsdelivr.net/**', route => {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });

    await page.goto('/signup-provider.html');
    await page.waitForLoadState('domcontentloaded');

    const servicesCheckboxes = page.locator('#services-checkboxes');
    await expect(servicesCheckboxes).toBeAttached();

    const pageContent = await page.content();
    expect(pageContent).toContain('agree');
  });

  test('Provider signup page has file upload sections for license and insurance', async ({ page }) => {
    await page.route('**/@supabase/supabase-js**', route => {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: createProviderMockJs() });
    });
    await page.route('**/js.stripe.com/**', route => route.abort());
    await page.route('**/cdnjs.cloudflare.com/**', route => route.abort());
    await page.route('**/fonts.googleapis.com/**', route => route.abort());
    await page.route('**/fonts.gstatic.com/**', route => route.abort());
    await page.route('**/cdn.jsdelivr.net/**', route => {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });

    await page.goto('/signup-provider.html');
    await page.waitForLoadState('domcontentloaded');

    const filesLicense = page.locator('#files-license');
    await expect(filesLicense).toBeAttached();

    const filesInsurance = page.locator('#files-insurance');
    await expect(filesInsurance).toBeAttached();

    const pageContent = await page.content();
    expect(pageContent).toContain('business license');
    expect(pageContent).toContain('insurance');
  });

  test('Provider dashboard page exists and loads for authenticated provider', async ({ page }) => {
    await setupProviderPage(page);

    const overview = page.locator('#overview');
    await expect(overview).toBeAttached();
  });
});

test.describe('Provider Dashboard Structure', () => {
  test('Provider dashboard has job queue sections with bids and browse', async ({ page }) => {
    await setupProviderPage(page);

    const browseSection = page.locator('#browse');
    await expect(browseSection).toBeAttached();

    const bidsSection = page.locator('#bids');
    await expect(bidsSection).toBeAttached();

    const jobsSection = page.locator('#jobs');
    await expect(jobsSection).toBeAttached();

    const browseNav = page.locator('.nav-item[data-section="browse"]');
    await expect(browseNav).toBeAttached();

    const bidsNav = page.locator('.nav-item[data-section="bids"]');
    await expect(bidsNav).toBeAttached();
  });

  test('Provider dashboard has earnings and analytics sections', async ({ page }) => {
    await setupProviderPage(page);

    const earningsSection = page.locator('#earnings');
    await expect(earningsSection).toBeAttached();

    const earningsAnalytics = page.locator('#earnings-analytics');
    await expect(earningsAnalytics).toBeAttached();

    const analyticsSection = page.locator('#analytics');
    await expect(analyticsSection).toBeAttached();

    const earningsNav = page.locator('.nav-item[data-section="earnings"]');
    await expect(earningsNav).toBeAttached();

    const analyticsNav = page.locator('.nav-item[data-section="analytics"]');
    await expect(analyticsNav).toBeAttached();
  });

  test('Provider dashboard has profile/settings section', async ({ page }) => {
    await setupProviderPage(page);

    const profileSection = page.locator('#profile');
    await expect(profileSection).toBeAttached();

    const profileNav = page.locator('.nav-item[data-section="profile"]');
    await expect(profileNav).toBeAttached();
  });

  test('Provider dashboard has team management section', async ({ page }) => {
    await setupProviderPage(page);

    const teamSection = page.locator('#team');
    await expect(teamSection).toBeAttached();

    const teamNav = page.locator('.nav-item[data-section="team"]');
    await expect(teamNav).toBeAttached();

    const backgroundChecks = page.locator('#background-checks');
    await expect(backgroundChecks).toBeAttached();
  });
});

test.describe('Provider-Member Interaction', () => {
  test('Provider can view available service requests in browse section', async ({ page }) => {
    await setupProviderPage(page);

    const browseSection = page.locator('#browse');
    await expect(browseSection).toBeAttached();

    const browseCreditsBar = page.locator('#browse-credits-bar');
    await expect(browseCreditsBar).toBeAttached();

    const browseCreditsCount = page.locator('#browse-credits-count');
    await expect(browseCreditsCount).toBeAttached();
  });

  test('Provider has bid submission elements and active jobs section', async ({ page }) => {
    await setupProviderPage(page);

    const myBids = page.locator('#my-bids');
    await expect(myBids).toBeAttached();

    const activeJobs = page.locator('#active-jobs');
    await expect(activeJobs).toBeAttached();

    const statBids = page.locator('#stat-bids');
    await expect(statBids).toBeAttached();
  });

  test('Provider has messaging and notifications sections', async ({ page }) => {
    await setupProviderPage(page);

    const messagesSection = page.locator('#messages');
    await expect(messagesSection).toBeAttached();

    const messagesNav = page.locator('.nav-item[data-section="messages"]');
    await expect(messagesNav).toBeAttached();

    const notificationsSection = page.locator('#notifications');
    await expect(notificationsSection).toBeAttached();

    const notificationsNav = page.locator('.nav-item[data-section="notifications"]');
    await expect(notificationsNav).toBeAttached();
  });
});

test.describe('Admin Provider Management', () => {
  test('Admin dashboard has provider management navigation section', async ({ page }) => {
    await setupAdminPage(page);

    const applicationsNav = page.locator('.nav-item[data-section="applications"]');
    await expect(applicationsNav).toBeAttached();

    const providersNav = page.locator('.nav-item[data-section="providers"]');
    await expect(providersNav).toBeAttached();

    const pageContent = await page.content();
    expect(pageContent).toContain('Provider Management');
  });

  test('Admin can view provider applications section', async ({ page }) => {
    await setupAdminPage(page);

    const applicationsSection = page.locator('#applications');
    await expect(applicationsSection).toBeAttached();

    const applicationsTable = page.locator('#applications-table');
    await expect(applicationsTable).toBeAttached();

    const pageContent = await applicationsSection.innerHTML();
    expect(pageContent).toContain('Provider Applications');
  });

  test('Admin has provider verification and approval controls', async ({ page }) => {
    await setupAdminPage(page);

    const applicationsSection = page.locator('#applications');
    await expect(applicationsSection).toBeAttached();

    const approvedTab = applicationsSection.locator('.tab[data-filter="approved"]');
    await expect(approvedTab).toBeAttached();

    const pendingAppsStatLabel = page.locator('text=Pending Applications');
    await expect(pendingAppsStatLabel).toBeAttached();
  });

  test('Admin has provider suspension and status controls', async ({ page }) => {
    await setupAdminPage(page);

    const providersSection = page.locator('#providers');
    await expect(providersSection).toBeAttached();

    const statusFilter = page.locator('#provider-status-filter');
    await expect(statusFilter).toBeAttached();

    const providersTable = page.locator('#providers-table');
    await expect(providersTable).toBeAttached();

    const pageContent = await providersSection.innerHTML();
    expect(pageContent).toContain('Suspend');
  });
});

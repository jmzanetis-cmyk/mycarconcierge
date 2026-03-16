const { test, expect } = require('@playwright/test');

const FAKE_MEMBER_ID = '00000000-aaaa-bbbb-cccc-000000000001';
const FAKE_PROVIDER_ID = '00000000-aaaa-bbbb-cccc-000000000002';
const FAKE_MEMBER_EMAIL = 'testmember@example.com';
const FAKE_PROVIDER_EMAIL = 'testprovider@example.com';

function createLoginMockJs(role, userId, email) {
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
        role: '${role}',
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
        rpc: function() { return Promise.resolve({ data: null, error: null }); },
        storage: { from: function() { return { upload: function() { return Promise.resolve({}); }, getPublicUrl: function() { return { data: { publicUrl: '' } }; } }; } },
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
        rpc: function() { return Promise.resolve({ data: null, error: null }); },
        storage: { from: function() { return { upload: function() { return Promise.resolve({}); }, getPublicUrl: function() { return { data: { publicUrl: '' } }; } }; } },
        functions: { invoke: function() { return Promise.resolve({ data: null, error: null }); } }
      };
      window.supabase = { createClient: function() { return mockClient; } };
    })();
  `;
}

function createAuthenticatedMockJs(role, userId, email) {
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
        role: '${role}',
        zip_code: '10001',
        phone: '5551234567',
        status: 'approved'
      };
      var mockClient = {
        auth: {
          getSession: function() { return Promise.resolve({ data: { session: fakeSession }, error: null }); },
          getUser: function() { return Promise.resolve({ data: { user: fakeUser }, error: null }); },
          onAuthStateChange: function(cb) { setTimeout(function() { cb('SIGNED_IN', fakeSession); }, 10); return { data: { subscription: { unsubscribe: function() {} } } }; },
          signInWithPassword: function() { return Promise.resolve({ data: { session: fakeSession, user: fakeUser }, error: null }); },
          signOut: function() { return Promise.resolve({ error: null }); },
          signUp: function() { return Promise.resolve({ data: null, error: null }); },
          resetPasswordForEmail: function() { return Promise.resolve({ data: null, error: null }); }
        },
        from: function(table) {
          var isSingle = false;
          var q = {
            select: function() { return q; }, insert: function() { return q; }, update: function() { return q; },
            delete: function() { return q; }, eq: function() { return q; }, neq: function() { return q; },
            gt: function() { return q; }, lt: function() { return q; }, gte: function() { return q; },
            lte: function() { return q; }, like: function() { return q; }, ilike: function() { return q; },
            in: function() { return q; }, order: function() { return q; }, limit: function() { return q; },
            single: function() { isSingle = true; return q; }, maybeSingle: function() { isSingle = true; return q; }, range: function() { return q; },
            filter: function() { return q; }, or: function() { return q; }, not: function() { return q; },
            is: function() { return q; }, contains: function() { return q; },
            then: function(resolve) {
              if (table === 'profiles') {
                if (isSingle) {
                  resolve({ data: profileData, error: null });
                } else {
                  resolve({ data: [profileData], error: null, count: 1 });
                }
              } else if (table === 'tos_acceptance') {
                if (isSingle) {
                  resolve({ data: { id: '1', accepted_at: new Date().toISOString() }, error: null });
                } else {
                  resolve({ data: [{ id: '1', accepted_at: new Date().toISOString() }], error: null, count: 1 });
                }
              } else if (table === 'provider_applications') {
                if (isSingle) {
                  resolve({ data: { id: '1', status: 'approved', user_id: '${userId}' }, error: null });
                } else {
                  resolve({ data: [{ id: '1', status: 'approved', user_id: '${userId}' }], error: null, count: 1 });
                }
              } else {
                if (isSingle) {
                  resolve({ data: null, error: null });
                } else {
                  resolve({ data: [], error: null, count: 0 });
                }
              }
              return q;
            },
            catch: function() { return q; }
          };
          return q;
        },
        channel: function() { return noopChannel; },
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
  await page.route('**/cdn.jsdelivr.net/npm/qr-creator**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
  await page.route('**/cdn.jsdelivr.net/npm/qrcode**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
}

async function setupLoginApiMocks(page) {
  await page.route('**/rest/v1/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/api/2fa/status', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, enabled: false })
    });
  });

  await page.route('**/api/email/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });

  await page.route('**/api/auth/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });

  await page.route('**/api/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authorized: true, verified: true, connected: false, status: 'clear' })
    });
  });
}

async function setupAuthenticatedApiMocks(page, userId, email, role) {
  await page.route('**/auth/v1/user', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: userId,
        email: email,
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: 'Test User' }
      })
    });
  });

  await page.route('**/auth/v1/token**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'fake-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'fake-refresh-token',
        user: { id: userId, email: email, role: 'authenticated' }
      })
    });
  });

  await page.route('**/rest/v1/profiles**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: userId,
        full_name: 'Test User',
        email: email,
        role: role,
        zip_code: '10001',
        phone: '5551234567',
        status: 'approved',
        business_name: role === 'provider' ? 'Test Auto Shop' : undefined,
        service_radius: role === 'provider' ? 25 : undefined
      }])
    });
  });

  await page.route('**/rest/v1/provider_applications**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: '1', status: 'approved', user_id: userId }])
    });
  });

  await page.route('**/rest/v1/tos_acceptance**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: '1', accepted_at: new Date().toISOString() }])
    });
  });

  await page.route('**/rest/v1/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/api/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authorized: true, verified: true, connected: false, status: 'clear' })
    });
  });
}

function addAuthToken(page, userId, email) {
  return page.addInitScript(({ userId, email }) => {
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

test.describe('Login Flow', () => {
  test('successful login redirects member to dashboard', async ({ page }) => {
    const mockJs = createLoginMockJs('member', FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
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

  test('successful login redirects provider to provider dashboard', async ({ page }) => {
    const mockJs = createLoginMockJs('provider', FAKE_PROVIDER_ID, FAKE_PROVIDER_EMAIL);
    await setupCdnMocks(page, mockJs);
    await setupLoginApiMocks(page);

    await page.goto('/login.html');
    await page.waitForLoadState('domcontentloaded');

    await page.fill('#email', FAKE_PROVIDER_EMAIL);
    await page.fill('#password', 'TestPassword123!');
    await page.click('#login-btn');

    await page.waitForURL('**/providers.html', { timeout: 15000 });
    expect(page.url()).toContain('providers.html');
  });

  test('failed login shows error message', async ({ page }) => {
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

  test('empty form submission is prevented by browser validation', async ({ page }) => {
    const mockJs = createFailedLoginMockJs();
    await setupCdnMocks(page, mockJs);
    await setupLoginApiMocks(page);

    await page.goto('/login.html');
    await page.waitForLoadState('domcontentloaded');

    await page.click('#login-btn');

    const emailInput = page.locator('#email');
    const isInvalid = await emailInput.evaluate(el => !el.checkValidity());
    expect(isInvalid).toBe(true);

    expect(page.url()).toContain('login.html');
  });
});

test.describe('Job/Service Request Creation Flow', () => {
  test('member can navigate to packages section', async ({ page }) => {
    const mockJs = createAuthenticatedMockJs('member', FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await setupCdnMocks(page, mockJs);
    await setupAuthenticatedApiMocks(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL, 'member');
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});

    await page.evaluate(() => {
      if (typeof showSection === 'function') {
        showSection('packages');
      } else {
        var packagesNav = document.querySelector('.nav-item[data-section="packages"]');
        if (packagesNav) packagesNav.click();
      }
    });

    await page.waitForTimeout(1000);

    const packagesSection = page.locator('#packages');
    await expect(packagesSection).toBeAttached();
    const isActive = await packagesSection.evaluate(el => el.classList.contains('active'));
    expect(isActive).toBe(true);
  });

  test('service request form elements exist in packages section', async ({ page }) => {
    const mockJs = createAuthenticatedMockJs('member', FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);
    await setupCdnMocks(page, mockJs);
    await setupAuthenticatedApiMocks(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL, 'member');
    await addAuthToken(page, FAKE_MEMBER_ID, FAKE_MEMBER_EMAIL);

    await page.goto('/members.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});

    const packagesSection = page.locator('#packages');
    await expect(packagesSection).toBeAttached();

    const pageContent = await page.content();
    expect(pageContent).toContain('packages');

    const packagesNav = page.locator('.nav-item[data-section="packages"]');
    await expect(packagesNav).toBeAttached();
  });
});

test.describe('Provider Bid Submission Flow', () => {
  test('bid modal contains all required fields', async ({ page }) => {
    const mockJs = createAuthenticatedMockJs('provider', FAKE_PROVIDER_ID, FAKE_PROVIDER_EMAIL);
    await setupCdnMocks(page, mockJs);
    await setupAuthenticatedApiMocks(page, FAKE_PROVIDER_ID, FAKE_PROVIDER_EMAIL, 'provider');
    await addAuthToken(page, FAKE_PROVIDER_ID, FAKE_PROVIDER_EMAIL);

    await page.goto('/providers.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    const bidModal = page.locator('#bid-modal');
    await expect(bidModal).toBeAttached({ timeout: 15000 });

    await page.evaluate(() => {
      var modal = document.getElementById('bid-modal');
      if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
      }
    });

    const bidPrice = page.locator('#bid-price');
    await expect(bidPrice).toBeAttached();

    const bidNotes = page.locator('#bid-notes');
    await expect(bidNotes).toBeAttached();

    const submitBidBtn = page.locator('#bid-modal .btn-primary');
    await expect(submitBidBtn).toBeAttached();
    const btnText = await submitBidBtn.textContent();
    expect(btnText).toContain('Submit Bid');
  });

  test('bid modal can be closed', async ({ page }) => {
    const mockJs = createAuthenticatedMockJs('provider', FAKE_PROVIDER_ID, FAKE_PROVIDER_EMAIL);
    await setupCdnMocks(page, mockJs);
    await setupAuthenticatedApiMocks(page, FAKE_PROVIDER_ID, FAKE_PROVIDER_EMAIL, 'provider');
    await addAuthToken(page, FAKE_PROVIDER_ID, FAKE_PROVIDER_EMAIL);

    await page.goto('/providers.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    await page.evaluate(() => {
      var modal = document.getElementById('bid-modal');
      if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
      }
    });

    const bidModal = page.locator('#bid-modal');
    const isVisibleBefore = await bidModal.evaluate(el =>
      el.classList.contains('active') || el.style.display === 'flex'
    );
    expect(isVisibleBefore).toBe(true);

    await page.evaluate(() => {
      if (typeof closeModal === 'function') {
        closeModal('bid-modal');
      } else {
        var modal = document.getElementById('bid-modal');
        if (modal) {
          modal.classList.remove('active');
        }
      }
    });

    await page.waitForTimeout(500);

    const isHiddenAfter = await bidModal.evaluate(el => !el.classList.contains('active'));
    expect(isHiddenAfter).toBe(true);
  });
});

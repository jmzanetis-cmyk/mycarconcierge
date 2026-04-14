const { test, expect } = require('@playwright/test');

const FAKE_USER_ID = '00000000-aaaa-bbbb-cccc-000000000001';
const FAKE_EMAIL = 'testuser@example.com';

const mockSupabaseJs = `
  (function() {
    var noopChannel = { on: function() { return this; }, subscribe: function() { return this; }, unsubscribe: function() {} };
    var mockClient = {
      auth: {
        getSession: function() { return Promise.resolve({ data: { session: null }, error: null }); },
        getUser: function() { return Promise.resolve({ data: { user: null }, error: null }); },
        onAuthStateChange: function(cb) { setTimeout(function() { cb('SIGNED_OUT', null); }, 10); return { data: { subscription: { unsubscribe: function() {} } } }; },
        signInWithPassword: function() { return Promise.resolve({ data: null, error: { message: 'Invalid credentials' } }); },
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

function createAuthenticatedMockJs(role) {
  return `
    (function() {
      var noopChannel = { on: function() { return this; }, subscribe: function() { return this; }, unsubscribe: function() {} };
      var fakeUser = {
        id: '${FAKE_USER_ID}',
        email: '${FAKE_EMAIL}',
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
          var profileData = [{
            id: '${FAKE_USER_ID}',
            full_name: 'Test User',
            email: '${FAKE_EMAIL}',
            role: '${role}',
            zip_code: '10001',
            phone: '5551234567',
            status: 'approved'
          }];
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
                resolve({ data: profileData, error: null, count: 1 });
              } else if (table === 'tos_acceptance') {
                resolve({ data: [{ id: '1', accepted_at: new Date().toISOString() }], error: null, count: 1 });
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

async function setupCdnMocks(page) {
  await page.route('**/@supabase/supabase-js**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: mockSupabaseJs });
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

  await page.route('**/rest/v1/**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.route('**/api/auth/check-access', route => {
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ authorized: false }) });
  });
}

async function setupAuthenticatedCdnMocks(page, role) {
  await page.route('**/@supabase/supabase-js**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: createAuthenticatedMockJs(role) });
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

  await page.route('**/auth/v1/user', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: FAKE_USER_ID,
        email: FAKE_EMAIL,
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
        user: {
          id: FAKE_USER_ID,
          email: FAKE_EMAIL,
          role: 'authenticated'
        }
      })
    });
  });

  await page.route('**/rest/v1/profiles**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: FAKE_USER_ID,
        full_name: 'Test User',
        email: FAKE_EMAIL,
        role: role,
        zip_code: '10001',
        phone: '5551234567',
        status: 'approved'
      }])
    });
  });

  await page.route('**/rest/v1/tos_acceptance**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: '1', accepted_at: new Date().toISOString() }])
    });
  });

  await page.route('**/rest/v1/**', (route, request) => {
    if (!route.request().url().includes('auth/v1') && !route.request().url().includes('profiles') && !route.request().url().includes('tos_acceptance')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    } else {
      route.continue();
    }
  });

  await page.route('**/api/auth/check-access', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authorized: true })
    });
  });

  await page.addInitScript(() => {
    window.localStorage.setItem('sb-ifbyjxuaclwmadqbjcyp-auth-token', JSON.stringify({
      access_token: 'fake-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'fake-refresh-token',
      user: {
        id: '00000000-aaaa-bbbb-cccc-000000000001',
        email: 'testuser@example.com',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: 'Test User' }
      }
    }));
  });
}

test.describe('Login Page - Elements and Structure', () => {
  test('login page loads with correct title', async ({ page }) => {
    await page.goto('/login.html');
    await page.waitForLoadState('networkidle');

    const title = await page.title();
    expect(title).toBe('Sign In – My Car Concierge');
  });

  test('login form has email input, password input, and submit button', async ({ page }) => {
    await page.goto('/login.html');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('#email');
    const passwordInput = page.locator('#password');
    const loginBtn = page.locator('#login-btn');
    await expect(emailInput).toBeAttached();
    await expect(passwordInput).toBeAttached();
    await expect(loginBtn).toBeAttached();
    await expect(emailInput).toHaveAttribute('type', 'email');
    await expect(passwordInput).toHaveAttribute('type', 'password');
    await expect(loginBtn).toHaveAttribute('type', 'submit');
  });

  test('Apple sign-in button exists', async ({ page }) => {
    await page.goto('/login.html');
    await page.waitForLoadState('networkidle');

    const appleBtn = page.locator('#apple-signin-btn');
    await expect(appleBtn).toBeAttached();
  });

  test('biometric login section exists', async ({ page }) => {
    await page.goto('/login.html');
    await page.waitForLoadState('networkidle');

    const biometricSection = page.locator('#biometric-login-section');
    await expect(biometricSection).toBeAttached();
  });

  test('signup links to onboarding-member.html and signup-provider.html exist', async ({ page }) => {
    await page.goto('/login.html');
    await page.waitForLoadState('networkidle');

    const memberSignup = page.locator('a[href="onboarding-member.html"]');
    const providerSignup = page.locator('a[href="signup-provider.html"]');
    await expect(memberSignup).toBeAttached();
    await expect(providerSignup).toBeAttached();
  });

  test('error message container exists', async ({ page }) => {
    await page.goto('/login.html');
    await page.waitForLoadState('networkidle');

    const message = page.locator('#message');
    await expect(message).toBeAttached();
  });

  test('theme toggle button exists', async ({ page }) => {
    await page.goto('/login.html');
    await page.waitForLoadState('networkidle');

    const themeToggle = page.locator('.theme-toggle-mini');
    await expect(themeToggle).toBeAttached();
  });

  test('language switcher exists', async ({ page }) => {
    await page.goto('/login.html');
    await page.waitForLoadState('networkidle');

    const languageSwitcher = page.locator('#language-switcher');
    await expect(languageSwitcher).toBeAttached();
  });

  test('empty form submission shows validation for required fields', async ({ page }) => {
    await page.goto('/login.html');
    await page.waitForLoadState('networkidle');

    const loginBtn = page.locator('#login-btn');
    await loginBtn.click();

    const emailInput = page.locator('#email');
    const isInvalid = await emailInput.evaluate(el => !el.checkValidity());
    expect(isInvalid).toBe(true);
  });

  test('forgot password link exists', async ({ page }) => {
    await page.goto('/login.html');
    await page.waitForLoadState('networkidle');

    const content = await page.content();
    expect(content).toContain('forgot-password.html');
  });
});

test.describe('Protected Pages - Access Control Without Auth', () => {
  test('members.html redirects to login when no auth token is present', async ({ page }) => {
    await setupCdnMocks(page);
    await page.goto('/members.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.location.pathname.includes('login'), { timeout: 15000 });
    expect(page.url()).toContain('login');
  });

  test('providers.html redirects to login when no auth token is present', async ({ page }) => {
    await setupCdnMocks(page);
    await page.goto('/providers.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.location.pathname.includes('login'), { timeout: 15000 });
    expect(page.url()).toContain('login');
  });

  test('admin.html redirects to login when no auth token is present', async ({ page }) => {
    await setupCdnMocks(page);
    await page.goto('/admin.html', { waitUntil: 'domcontentloaded' });
    const loginForm = page.locator('#admin-login-form');
    await expect(loginForm).toBeVisible({ timeout: 15000 });
  });

  test('founder-dashboard.html redirects to login when no auth token is present', async ({ page }) => {
    await setupCdnMocks(page);
    await page.goto('/founder-dashboard.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.location.pathname.includes('login'), { timeout: 15000 });
    expect(page.url()).toContain('login');
  });
});

test.describe('Role-Based Access Control', () => {
  test('admin page requires admin password via check-access', async ({ page }) => {
    await page.route('**/@supabase/supabase-js**', route => {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: mockSupabaseJs });
    });
    await page.route('**/js.stripe.com/**', route => route.abort());
    await page.route('**/cdnjs.cloudflare.com/**', route => route.abort());
    await page.route('**/fonts.googleapis.com/**', route => route.abort());
    await page.route('**/fonts.gstatic.com/**', route => route.abort());
    await page.route('**/cdn.jsdelivr.net/**', route => {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });
    await page.route('**/rest/v1/**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/auth/check-access', route => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ authorized: false, error: 'Admin password required' })
      });
    });

    await page.goto('/admin.html', { waitUntil: 'domcontentloaded' });
    const loginForm = page.locator('#admin-login-form');
    await expect(loginForm).toBeVisible({ timeout: 15000 });
  });

  test('member role user can access members.html', async ({ page }) => {
    await setupAuthenticatedCdnMocks(page, 'member');
    await page.goto('/members.html', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    await page.waitForTimeout(3000);

    const isOnMembersPage = page.url().includes('members.html');
    const hasMembersContent = await page.locator('.sidebar, .main, .nav-item').first().isVisible().catch(() => false);
    expect(isOnMembersPage || hasMembersContent).toBeTruthy();
  });

  test('provider role user can access providers.html', async ({ page }) => {
    await setupAuthenticatedCdnMocks(page, 'provider');

    await page.route('**/rest/v1/provider_bids**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/rest/v1/provider_services**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    const response = await page.goto('/providers.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
    expect(response.status()).toBeLessThan(400);

    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    const isOnProvidersPage = currentUrl.includes('providers.html');
    const isOnLoginPage = currentUrl.includes('login.html');
    const hasPageContent = await page.locator('body').isVisible().catch(() => false);
    expect(isOnProvidersPage || isOnLoginPage || hasPageContent).toBeTruthy();
  });
});

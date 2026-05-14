// Task #318 — Facebook signup, provider track.
//
// Mirrors tests/facebook-signin.spec.js (member-side lockdown from Task
// #286) for the provider sign-up surfaces added by Task #318:
//
//   - www/signup-provider.html (legacy multi-step form)
//   - www/onboarding-provider.html (conversational survey)
//   - www/login.js's PGRST116 branch when mcc_signup_intent='provider'
//
// All three need to work together: the FB button on either provider
// page sets mcc_signup_intent='provider', kicks off Supabase OAuth,
// and the callback (whether handled by login.html or
// onboarding-provider.html?source=facebook) must create a profiles row
// with role='pending_provider' (NOT 'member') and route the user into
// the provider survey, not the member onboarding flow. A regression
// in any of those three would silently funnel would-be providers into
// the member experience — exactly the kind of leak this spec guards.
//
// Same in-page Supabase stub strategy as the member spec so nothing
// reaches facebook.com or the live Supabase project.

const { test, expect } = require('@playwright/test');

const STUB_INIT = `
(() => {
  let _client = null;
  window.__fbCalls = { signInWithOAuth: [], updates: [], inserts: [], signUp: 0 };
  window.__fbStubUser = null;
  window.__fbExistingProfile = null;
  Object.defineProperty(window, 'supabaseClient', {
    configurable: true,
    get() { return _client; },
    set(v) {
      _client = v;
      try {
        if (v && v.auth) {
          v.auth.signInWithOAuth = async (opts) => {
            window.__fbCalls.signInWithOAuth.push(opts);
            return { data: { provider: opts && opts.provider, url: 'https://stub/oauth' }, error: null };
          };
          v.auth.getUser = async () => ({ data: { user: window.__fbStubUser }, error: null });
          v.auth.getSession = async () => ({ data: { session: window.__fbStubUser ? { user: window.__fbStubUser, access_token: 'stub' } : null }, error: null });
          v.auth.signUp = async () => { window.__fbCalls.signUp += 1; return { data: { user: null }, error: { message: 'signUp should not be called for OAuth users' } }; };
        }
        if (v && typeof v.from === 'function') {
          v.from = (table) => {
            const isProfiles = table === 'profiles';
            return {
              select: () => ({
                eq: () => ({
                  single: async () => isProfiles && window.__fbExistingProfile
                    ? { data: window.__fbExistingProfile, error: null }
                    : isProfiles
                      ? { data: null, error: { code: 'PGRST116' } }
                      : { data: null, error: null },
                  maybeSingle: async () => ({ data: isProfiles ? (window.__fbExistingProfile || null) : null, error: null })
                })
              }),
              insert: (row) => {
                window.__fbCalls.inserts.push({ table, row });
                const p = Promise.resolve({ data: null, error: null });
                p.select = () => ({ single: async () => ({ data: { ...row }, error: null }) });
                return p;
              },
              update: (row) => ({ eq: async (col, val) => { window.__fbCalls.updates.push({ table, row, eq: { col, val } }); return { data: null, error: null }; } })
            };
          };
        }
        if (v && typeof v.rpc === 'function') {
          v.rpc = async () => ({ data: null, error: null });
        }
      } catch (e) { console.error('[fb-stub] patch failed', e); }
    }
  });
})();
`;

async function waitForSupabase(page) {
  await page.waitForFunction(() => !!(window.supabaseClient && window.supabaseClient.auth), null, { timeout: 10000 });
}

test.describe('Facebook signup — provider track (Task #318)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(STUB_INIT);
    page.on('pageerror', err => console.error('[page error]', err.message));
  });

  test('signup-provider.html: FB button is visible and triggers signInWithOAuth back to /login.html?oauth=facebook with provider intent stored', async ({ page }) => {
    await page.goto('/signup-provider.html');
    const btn = page.locator('#facebook-signup-btn');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText(/continue with facebook/i);
    await waitForSupabase(page);
    await btn.click();
    const call = await page.waitForFunction(() => window.__fbCalls.signInWithOAuth[0] || null, null, { timeout: 5000 });
    const opts = await call.jsonValue();
    expect(opts.provider).toBe('facebook');
    // The legacy form delegates the callback to login.html, which then
    // honors mcc_signup_intent and forwards to onboarding-provider.html.
    expect(opts.options.redirectTo).toMatch(/\/login\.html\?oauth=facebook$/);
    expect(opts.options.scopes).toBe('email,public_profile');
    // Critical: the intent flag is what tells login.js to create a
    // pending_provider profile instead of the default 'member'.
    const intent = await page.evaluate(() => localStorage.getItem('mcc_signup_intent'));
    expect(intent).toBe('provider');
  });

  test('onboarding-provider.html: FB signup button triggers signInWithOAuth pointing back to ?source=facebook with provider intent stored', async ({ page }) => {
    await page.goto('/onboarding-provider.html');
    const btn = page.locator('#facebook-signup-btn');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText(/continue with facebook/i);
    await waitForSupabase(page);
    await btn.click();
    const call = await page.waitForFunction(() => window.__fbCalls.signInWithOAuth[0] || null, null, { timeout: 5000 });
    const opts = await call.jsonValue();
    expect(opts.provider).toBe('facebook');
    expect(opts.options.redirectTo).toMatch(/\/onboarding-provider\.html\?source=facebook$/);
    expect(opts.options.scopes).toBe('email,public_profile');
    const intent = await page.evaluate(() => localStorage.getItem('mcc_signup_intent'));
    expect(intent).toBe('provider');
  });

  test('login.html?oauth=facebook with provider intent: brand-new FB user → INSERT pending_provider profile + redirect to onboarding-provider.html?source=facebook', async ({ page }) => {
    await page.addInitScript(() => {
      // Provider intent stored before the OAuth round-trip is what
      // distinguishes this from the member-track variant.
      try { localStorage.setItem('mcc_signup_intent', 'provider'); } catch (_e) { /* ignore */ }
      window.__fbStubUser = {
        id: 'cccccccc-dddd-eeee-ffff-000000000000',
        email: 'newprovider@example.com',
        user_metadata: { full_name: 'New Provider User' }
      };
      window.__fbExistingProfile = null;
    });
    await page.goto('/login.html?oauth=facebook');
    await page.waitForURL(/\/onboarding-provider\.html\?source=facebook/, { timeout: 10000 });
    const inserted = await page.evaluate(() => window.__fbCalls.inserts.find(i => i.table === 'profiles'));
    expect(inserted).toBeTruthy();
    expect(inserted.row.id).toBe('cccccccc-dddd-eeee-ffff-000000000000');
    expect(inserted.row.email).toBe('newprovider@example.com');
    // The whole point of Task #318: the role MUST be pending_provider,
    // not 'member'. A regression here silently demotes brand-new
    // provider signups into the member experience.
    expect(inserted.row.role).toBe('pending_provider');
    expect(inserted.row.is_also_member).toBe(true);
    expect(inserted.row.full_name).toBe('New Provider User');
    // Intent flag should be cleared after consumption so a later member
    // signup from the same browser doesn't get mis-routed.
    const intentAfter = await page.evaluate(() => localStorage.getItem('mcc_signup_intent'));
    expect(intentAfter).toBeNull();
  });

  test('onboarding-provider.html?source=facebook: brand-new user → INSERT pending_provider profile + jump past name/email/password to phone step', async ({ page }) => {
    await page.addInitScript(() => {
      window.__fbStubUser = {
        id: '22222222-3333-4444-5555-666666666666',
        email: 'pat.fb@example.com',
        user_metadata: { full_name: 'Pat Provider' }
      };
      window.__fbExistingProfile = null;
    });
    await page.goto('/onboarding-provider.html?source=facebook');
    // maybeStartFromOAuth polls getUser up to 20×150ms; give it room.
    const phoneInput = page.locator('#input-phone');
    await expect(phoneInput).toBeVisible({ timeout: 8000 });
    // Name should have been pre-filled from user_metadata.full_name.
    await expect(page.locator('#input-contact-name')).toHaveValue('Pat Provider');
    // The OAuth-user branch must INSERT a profile row with the
    // pending_provider role when none exists. Without this guard a
    // future regression that swaps the role back to 'member' would go
    // unnoticed because the survey would still appear to work.
    await expect.poll(async () =>
      page.evaluate(() => window.__fbCalls.inserts.find(i => i.table === 'profiles') || null)
    ).not.toBeNull();
    const inserted = await page.evaluate(() => window.__fbCalls.inserts.find(i => i.table === 'profiles').row);
    expect(inserted.id).toBe('22222222-3333-4444-5555-666666666666');
    expect(inserted.email).toBe('pat.fb@example.com');
    expect(inserted.role).toBe('pending_provider');
    expect(inserted.is_also_member).toBe(true);
    expect(inserted.full_name).toBe('Pat Provider');
    // auth.signUp must NEVER fire in the OAuth flow — that would try
    // to re-create the already-existing user and fail.
    const signUpCount = await page.evaluate(() => window.__fbCalls.signUp);
    expect(signUpCount).toBe(0);
  });

  test('onboarding-provider.html?source=facebook: returning provider with phone set → straight to providers.html', async ({ page }) => {
    await page.addInitScript(() => {
      window.__fbStubUser = {
        id: '33333333-4444-5555-6666-777777777777',
        email: 'returning.provider@example.com',
        user_metadata: { full_name: 'Returning Provider' }
      };
      // Existing fully-onboarded provider — should bypass the survey.
      window.__fbExistingProfile = {
        id: '33333333-4444-5555-6666-777777777777',
        role: 'provider',
        phone: '5125550100'
      };
    });
    await page.goto('/onboarding-provider.html?source=facebook');
    await page.waitForURL(/\/providers\.html(\?|$)/, { timeout: 10000 });
    const inserts = await page.evaluate(() => window.__fbCalls.inserts.filter(i => i.table === 'profiles').length);
    expect(inserts).toBe(0);
  });
});

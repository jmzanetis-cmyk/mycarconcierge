// Task #326 — Apple Sign In, provider track.
//
// Mirrors tests/facebook-signin-provider.spec.js (Task #318 lockdown)
// for the Apple Sign In surfaces added by Task #326:
//
//   - www/signup-provider.html (legacy multi-step form)
//   - www/onboarding-provider.html (conversational survey)
//   - www/login.js's PGRST116 branch when mcc_signup_intent='provider'
//     and ?oauth=apple
//
// iOS App Store guidelines require Apple Sign In parity wherever
// Facebook (or any other social login) is offered, so any regression
// here would block App Review. The test guards three things:
//
//   1) Both provider surfaces render an Apple button that triggers
//      Supabase OAuth with provider='apple' and the right redirectTo.
//   2) The OAuth callback creates a profiles row with
//      role='pending_provider' (NOT 'member'). A regression that
//      silently demotes Apple signups to the member experience is
//      exactly what this spec catches.
//   3) The mcc_signup_intent='provider' flag is cleared after
//      consumption so a later member signup from the same browser
//      isn't mis-routed.
//
// Same in-page Supabase stub strategy as facebook-signin-provider.spec
// so nothing reaches appleid.apple.com or the live Supabase project.

const { test, expect } = require('@playwright/test');

const STUB_INIT = `
(() => {
  let _client = null;
  window.__appleCalls = { signInWithOAuth: [], updates: [], inserts: [], signUp: 0 };
  window.__appleStubUser = null;
  window.__appleExistingProfile = null;
  Object.defineProperty(window, 'supabaseClient', {
    configurable: true,
    get() { return _client; },
    set(v) {
      _client = v;
      try {
        if (v && v.auth) {
          v.auth.signInWithOAuth = async (opts) => {
            window.__appleCalls.signInWithOAuth.push(opts);
            return { data: { provider: opts && opts.provider, url: 'https://stub/oauth' }, error: null };
          };
          v.auth.getUser = async () => ({ data: { user: window.__appleStubUser }, error: null });
          v.auth.getSession = async () => ({ data: { session: window.__appleStubUser ? { user: window.__appleStubUser, access_token: 'stub' } : null }, error: null });
          v.auth.signUp = async () => { window.__appleCalls.signUp += 1; return { data: { user: null }, error: { message: 'signUp should not be called for OAuth users' } }; };
        }
        if (v && typeof v.from === 'function') {
          v.from = (table) => {
            const isProfiles = table === 'profiles';
            const chainResult = (terminalData) => {
              const obj = {};
              const passThrough = () => obj;
              ['eq', 'is', 'neq', 'in', 'order', 'limit', 'gte', 'lte', 'gt', 'lt', 'match', 'or', 'filter'].forEach(m => { obj[m] = passThrough; });
              obj.single = async () => terminalData;
              obj.maybeSingle = async () => ({ data: terminalData.data, error: null });
              obj.then = (resolve) => resolve(terminalData);
              return obj;
            };
            const profilesTerminal = window.__appleExistingProfile
              ? { data: window.__appleExistingProfile, error: null }
              : { data: null, error: { code: 'PGRST116' } };
            const otherTerminal = { data: null, error: null };
            return {
              select: () => chainResult(isProfiles ? profilesTerminal : otherTerminal),
              insert: (row) => {
                window.__appleCalls.inserts.push({ table, row });
                const p = Promise.resolve({ data: null, error: null });
                p.select = () => ({ single: async () => ({ data: { ...row }, error: null }) });
                return p;
              },
              update: (row) => ({ eq: async (col, val) => { window.__appleCalls.updates.push({ table, row, eq: { col, val } }); return { data: null, error: null }; } })
            };
          };
        }
        if (v && typeof v.rpc === 'function') {
          v.rpc = async () => ({ data: null, error: null });
        }
      } catch (e) { console.error('[apple-stub] patch failed', e); }
    }
  });
})();
`;

async function waitForSupabase(page) {
  await page.waitForFunction(() => !!(globalThis.supabaseClient && globalThis.supabaseClient.auth), null, { timeout: 10000 });
}

test.describe('Apple Sign In — provider track (Task #326)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(STUB_INIT);
    page.on('pageerror', err => console.error('[page error]', err.message));
  });

  test('signup-provider.html: Apple button is visible and triggers signInWithOAuth back to /login.html?oauth=apple with provider intent stored', async ({ page }) => {
    await page.goto('/signup-provider.html');
    const btn = page.locator('#apple-signup-btn');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText(/sign in with apple/i);
    await waitForSupabase(page);
    await btn.click();
    const call = await page.waitForFunction(() => globalThis.__appleCalls.signInWithOAuth[0] || null, null, { timeout: 5000 });
    const opts = await call.jsonValue();
    expect(opts.provider).toBe('apple');
    // The legacy form delegates the callback to login.html, which then
    // honors mcc_signup_intent and forwards to onboarding-provider.html.
    expect(opts.options.redirectTo).toMatch(/\/login\.html\?oauth=apple$/);
    expect(opts.options.scopes).toBe('name email');
    // Critical: the intent flag is what tells login.js to create a
    // pending_provider profile instead of the default 'member'.
    const intent = await page.evaluate(() => localStorage.getItem('mcc_signup_intent'));
    expect(intent).toBe('provider');
  });

  test('onboarding-provider.html: Apple signup button triggers signInWithOAuth pointing back to ?source=apple with provider intent stored', async ({ page }) => {
    await page.goto('/onboarding-provider.html');
    const btn = page.locator('#apple-signup-btn');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText(/sign in with apple/i);
    await waitForSupabase(page);
    await btn.click();
    const call = await page.waitForFunction(() => globalThis.__appleCalls.signInWithOAuth[0] || null, null, { timeout: 5000 });
    const opts = await call.jsonValue();
    expect(opts.provider).toBe('apple');
    expect(opts.options.redirectTo).toMatch(/\/onboarding-provider\.html\?source=apple$/);
    expect(opts.options.scopes).toBe('name email');
    const intent = await page.evaluate(() => localStorage.getItem('mcc_signup_intent'));
    expect(intent).toBe('provider');
  });

  test('login.html?oauth=apple with provider intent: brand-new Apple user → INSERT pending_provider profile + redirect to onboarding-provider.html?source=apple', async ({ page }) => {
    // Same seed-marker pattern as the Facebook spec: stub user/profile
    // bindings re-run on the redirected document (we want them there
    // too), but the intent must NOT be re-seeded after consumption so
    // we can assert login.js cleared it.
    await page.addInitScript(() => {
      globalThis.__appleStubUser = {
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        email: 'newprovider.apple@example.com',
        user_metadata: { full_name: 'New Apple Provider' }
      };
      globalThis.__appleExistingProfile = null;
      try {
        if (!localStorage.getItem('mcc_intent_seeded_p326')) {
          localStorage.setItem('mcc_signup_intent', 'provider');
          localStorage.setItem('mcc_intent_seeded_p326', '1');
        }
      } catch (_e) { /* ignore */ }
    });
    await page.goto('/login.html?oauth=apple');
    await page.waitForURL(/\/onboarding-provider\.html\?source=apple/, { timeout: 10000 });
    const inserted = await page.evaluate(() => globalThis.__appleCalls.inserts.find(i => i.table === 'profiles'));
    expect(inserted).toBeTruthy();
    expect(inserted.row.id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(inserted.row.email).toBe('newprovider.apple@example.com');
    // The whole point of Task #326: the role MUST be pending_provider,
    // not 'member'. A regression here silently demotes brand-new Apple
    // provider signups into the member experience.
    expect(inserted.row.role).toBe('pending_provider');
    expect(inserted.row.is_also_member).toBe(true);
    expect(inserted.row.full_name).toBe('New Apple Provider');
    // Intent flag must be cleared after consumption so a later member
    // signup from the same browser isn't mis-routed.
    const intentAfter = await page.evaluate(() => localStorage.getItem('mcc_signup_intent'));
    expect(intentAfter).toBeNull();
  });

  test('onboarding-provider.html?source=apple: brand-new user → INSERT pending_provider profile + jump past name/email/password to phone step', async ({ page }) => {
    await page.addInitScript(() => {
      globalThis.__appleStubUser = {
        id: '44444444-5555-6666-7777-888888888888',
        email: 'pat.apple@example.com',
        user_metadata: { full_name: 'Pat Apple Provider' }
      };
      globalThis.__appleExistingProfile = null;
    });
    await page.goto('/onboarding-provider.html?source=apple');
    // maybeStartFromOAuth polls getUser up to 20×150ms; give it room.
    const phoneInput = page.locator('#input-phone');
    await expect(phoneInput).toBeVisible({ timeout: 8000 });
    // Name should have been pre-filled from user_metadata.full_name.
    await expect(page.locator('#input-contact-name')).toHaveValue('Pat Apple Provider');
    // The OAuth-user branch must INSERT a profile row with the
    // pending_provider role when none exists. Without this guard a
    // future regression that swaps the role back to 'member' would go
    // unnoticed because the survey would still appear to work.
    await expect.poll(async () =>
      page.evaluate(() => globalThis.__appleCalls.inserts.find(i => i.table === 'profiles') || null)
    ).not.toBeNull();
    const inserted = await page.evaluate(() => globalThis.__appleCalls.inserts.find(i => i.table === 'profiles').row);
    expect(inserted.id).toBe('44444444-5555-6666-7777-888888888888');
    expect(inserted.email).toBe('pat.apple@example.com');
    expect(inserted.role).toBe('pending_provider');
    expect(inserted.is_also_member).toBe(true);
    expect(inserted.full_name).toBe('Pat Apple Provider');
    // auth.signUp must NEVER fire in the OAuth flow — that would try
    // to re-create the already-existing user and fail.
    const signUpCount = await page.evaluate(() => globalThis.__appleCalls.signUp);
    expect(signUpCount).toBe(0);
  });

  test('onboarding-provider.html?source=apple: returning provider with phone set → straight to providers.html', async ({ page }) => {
    await page.addInitScript(() => {
      globalThis.__appleStubUser = {
        id: '55555555-6666-7777-8888-999999999999',
        email: 'returning.apple@example.com',
        user_metadata: { full_name: 'Returning Apple Provider' }
      };
      globalThis.__appleExistingProfile = {
        id: '55555555-6666-7777-8888-999999999999',
        role: 'provider',
        phone: '5125550101'
      };
    });
    await page.goto('/onboarding-provider.html?source=apple');
    await page.waitForURL(/\/providers\.html(\?|$)/, { timeout: 10000 });
    const inserts = await page.evaluate(() => globalThis.__appleCalls.inserts.filter(i => i.table === 'profiles').length);
    expect(inserts).toBe(0);
  });
});

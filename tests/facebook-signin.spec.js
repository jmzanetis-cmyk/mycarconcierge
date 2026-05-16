// Task #286 — Facebook sign-in lockdown.
//
// Covers Task #183's "Continue with Facebook" buttons and the OAuth-aware
// fork of the onboarding survey. None of this is exercised by other
// suites, so a regression in the OAuth call shape, the
// `?oauth=facebook` / `?source=facebook` redirect handling, or the
// "skip name/email/password and UPDATE the profile row" branch of
// onboarding-member.html's submitSignup would slip through silently.
//
// All tests stub the Supabase client in-page so nothing reaches
// facebook.com or the live Supabase project. The dev-server-served
// pages (www/login.html with www/login.js, and www/onboarding-member.html
// — www/signup-member.html is just a redirect to the latter) are the
// only Facebook surfaces a real production user touches, so those are
// what we lock down.

const { test, expect } = require('@playwright/test');

// ----------------------------------------------------------------------
// Init script: intercept window.supabaseClient assignment so we can
// monkey-patch the auth client BEFORE any page-level handler grabs it.
// supabaseclient.js does `window.supabaseClient = supabase.createClient(...)`
// inside an interval; we wrap that setter to inject our stubs every time
// it fires. The page-level wiring is unchanged — only the underlying
// methods we care about are swapped.
// ----------------------------------------------------------------------
const STUB_INIT = `
(() => {
  let _client = null;
  window.__fbCalls = { signInWithOAuth: [], updates: [], inserts: [], signUp: 0 };
  window.__fbStubUser = null; // set per-test before navigation when needed
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
              // login.js calls .insert(row).select(...).single(); onboarding-member.html
              // calls .insert(row) directly (await). Return a thenable that supports both.
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
  await page.waitForFunction(() => !!(globalThis.supabaseClient && globalThis.supabaseClient.auth), null, { timeout: 10000 });
}

test.describe('Facebook sign-in (Task #183, locked down by Task #286)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(STUB_INIT);
    page.on('pageerror', err => console.error('[page error]', err.message));
  });

  test('login.html: FB button is visible and triggers signInWithOAuth with the right shape', async ({ page }) => {
    await page.goto('/login.html');
    const btn = page.locator('#facebook-signin-btn');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText(/continue with facebook/i);
    await waitForSupabase(page);
    await btn.click();
    const call = await page.waitForFunction(() => globalThis.__fbCalls.signInWithOAuth[0] || null, null, { timeout: 5000 });
    const opts = await call.jsonValue();
    expect(opts.provider).toBe('facebook');
    expect(opts.options.redirectTo).toMatch(/\/login\.html\?oauth=facebook$/);
    expect(opts.options.scopes).toBe('email,public_profile');
  });

  test('onboarding-member.html: FB signup button triggers signInWithOAuth pointing back to ?source=facebook', async ({ page }) => {
    await page.goto('/onboarding-member.html');
    const btn = page.locator('#facebook-signup-btn');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText(/continue with facebook/i);
    await waitForSupabase(page);
    await btn.click();
    const call = await page.waitForFunction(() => globalThis.__fbCalls.signInWithOAuth[0] || null, null, { timeout: 5000 });
    const opts = await call.jsonValue();
    expect(opts.provider).toBe('facebook');
    expect(opts.options.redirectTo).toMatch(/\/onboarding-member\.html\?source=facebook$/);
    expect(opts.options.scopes).toBe('email,public_profile');
  });

  test('signup-member.html: redirects to onboarding-member.html (where the FB button now lives)', async ({ page }) => {
    // www/signup-member.html is a 12-line redirect to the conversational
    // onboarding survey, which carries the FB button. The redirect itself
    // is what makes the signup-member URL still functional after Task #183
    // moved the FB button onto the survey page.
    await page.goto('/signup-member.html');
    await page.waitForURL(/\/onboarding-member\.html/, { timeout: 5000 });
    await expect(page.locator('#facebook-signup-btn')).toBeVisible();
  });

  test('login.html?oauth=facebook: brand-new FB user → INSERT profile + redirect to onboarding-member.html?source=facebook', async ({ page }) => {
    await page.addInitScript(() => {
      globalThis.__fbStubUser = {
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        email: 'newfb@example.com',
        user_metadata: { full_name: 'New FB User' }
      };
      globalThis.__fbExistingProfile = null; // PGRST116 → triggers profile insert + the FB-survey fork.
    });
    await page.goto('/login.html?oauth=facebook');
    // handleUserRedirect must (a) insert a profiles row for the new OAuth
    // user and (b) forward FB signups specifically to the onboarding survey.
    await page.waitForURL(/\/onboarding-member\.html\?source=facebook/, { timeout: 10000 });
    const inserted = await page.evaluate(() => globalThis.__fbCalls.inserts.find(i => i.table === 'profiles'));
    expect(inserted).toBeTruthy();
    expect(inserted.row.id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(inserted.row.email).toBe('newfb@example.com');
    expect(inserted.row.role).toBe('member');
    expect(inserted.row.full_name).toBe('New FB User');
  });

  test('login.html?oauth=facebook: returning member → straight to members.html, no insert, no signUp', async ({ page }) => {
    await page.addInitScript(() => {
      globalThis.__fbStubUser = {
        id: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
        email: 'returning@example.com',
        user_metadata: { full_name: 'Returning Member' }
      };
      // Existing profile → handleUserRedirect must skip the FB-survey fork.
      globalThis.__fbExistingProfile = { role: 'member', is_also_member: false, is_also_provider: false };
    });
    await page.goto('/login.html?oauth=facebook');
    await page.waitForURL(/\/members\.html(\?|$)/, { timeout: 10000 });
    const inserts = await page.evaluate(() => globalThis.__fbCalls.inserts.filter(i => i.table === 'profiles').length);
    const signUps = await page.evaluate(() => globalThis.__fbCalls.signUp);
    expect(inserts).toBe(0);
    expect(signUps).toBe(0);
  });

  test('onboarding-member.html?source=facebook: pre-fills name from user_metadata and starts at the phone step', async ({ page }) => {
    await page.addInitScript(() => {
      globalThis.__fbStubUser = {
        id: '11111111-2222-3333-4444-555555555555',
        email: 'jane.fb@example.com',
        user_metadata: { full_name: 'Jane Facebook' }
      };
      // No existing profile row yet — maybeStartFromOAuth will see PGRST116
      // and INSERT one. (Task #183's "this page redirects directly back here
      // so no other page has had a chance to insert the profile row" branch.)
      globalThis.__fbExistingProfile = null;
    });
    await page.goto('/onboarding-member.html?source=facebook');
    // maybeStartFromOAuth polls getUser up to 20×150ms; give it room.
    const phoneInput = page.locator('#input-phone');
    await expect(phoneInput).toBeVisible({ timeout: 8000 });
    // Name should have been pre-filled from user_metadata.full_name.
    await expect(page.locator('#input-name')).toHaveValue('Jane Facebook');
    // The OAuth-user branch must INSERT a profile row when none exists.
    await expect.poll(async () =>
      page.evaluate(() => globalThis.__fbCalls.inserts.find(i => i.table === 'profiles') || null)
    ).not.toBeNull();
    const inserted = await page.evaluate(() => globalThis.__fbCalls.inserts.find(i => i.table === 'profiles').row);
    expect(inserted.id).toBe('11111111-2222-3333-4444-555555555555');
    expect(inserted.email).toBe('jane.fb@example.com');
    expect(inserted.role).toBe('member');
    expect(inserted.full_name).toBe('Jane Facebook');
  });

  test('onboarding-member.html?source=facebook submitSignup: UPDATEs the profile row, never calls auth.signUp', async ({ page }) => {
    await page.addInitScript(() => {
      globalThis.__fbStubUser = {
        id: '11111111-2222-3333-4444-555555555555',
        email: 'jane.fb@example.com',
        user_metadata: { full_name: 'Jane Facebook' }
      };
      // Pretend a profile row already exists (no phone yet) so we don't
      // hit the "returning member" bounce-to-/members.html branch.
      globalThis.__fbExistingProfile = { id: '11111111-2222-3333-4444-555555555555', phone: null };
    });
    await page.goto('/onboarding-member.html?source=facebook');
    const phoneInput = page.locator('#input-phone');
    await expect(phoneInput).toBeVisible({ timeout: 8000 });

    // Fill phone, walk forward through any intermediate steps until the
    // submit button on the final review/consent step is visible. The
    // survey's Next button id is `btn-next` in the public flow.
    await phoneInput.fill('5125559999');
    // Walk forward through any intermediate steps. Continue buttons live
    // inside the active .step container and share the .btn-next class;
    // the submit step's button has id="btn-submit". Cap at 6 hops so a
    // future regression that breaks the step machine fails fast instead
    // of infinite-looping the test.
    for (let i = 0; i < 6; i++) {
      if (await page.locator('.step.active #btn-submit').isVisible().catch(() => false)) break;
      const next = page.locator('.step.active .btn-next').first();
      if (!(await next.isVisible().catch(() => false))) break;
      await next.click();
      await page.waitForTimeout(150);
    }

    // The submit step (data-step=4) requires the terms checkbox.
    const terms = page.locator('.step.active #consent-terms');
    await expect(terms).toBeVisible({ timeout: 5000 });
    await terms.check();

    const submitBtn = page.locator('#btn-submit');
    await expect(submitBtn).toBeVisible({ timeout: 5000 });
    await submitBtn.click();

    // The OAuth branch must UPDATE the profile row and must NOT call
    // auth.signUp (which would re-create a duplicate user).
    await expect.poll(async () =>
      page.evaluate(() => globalThis.__fbCalls.updates.find(u => u.table === 'profiles') || null),
      { timeout: 5000 }
    ).not.toBeNull();
    const upd = await page.evaluate(() => globalThis.__fbCalls.updates.find(u => u.table === 'profiles'));
    expect(upd.eq).toEqual({ col: 'id', val: '11111111-2222-3333-4444-555555555555' });
    expect(upd.row.phone).toBe('5125559999');
    const signUpCount = await page.evaluate(() => globalThis.__fbCalls.signUp);
    expect(signUpCount).toBe(0);
  });
});

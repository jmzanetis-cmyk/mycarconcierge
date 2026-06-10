'use strict';

// Regression tests for Task #229 — API fallback audit.
//
// Background: Task #168 hardened the survey routes so a generic DB
// error no longer returned 200/empty. Task #229 swept the rest of
// `www/server.js` for the same anti-pattern and tightened six
// high-risk handlers (saas-status, shop onboarding-status,
// founder campaign-link-stats, marketplace-visibility,
// shop walkin-search, white-label tenant). These tests pin the
// post-fix response shape: a benign 200 only on `42P01` (table
// missing — also `42703` / `PGRST204` for the visibility column case),
// a 500 with `{error, code, detail}` on every other Postgres code.
//
// Uses the generalised `maybeWrapSupabaseForApiTest` seam in
// www/server.js. Hard-gated on:
//   * NODE_ENV !== 'production'
//   * SURVEY_TEST_HOOK_SECRET env var on the SERVER process
//   * Matching `x-test-supabase-secret` header on each request
//   * `x-test-supabase-table-error: <table>:<code>` header to inject
//
// Tests auto-skip when the seam secret or the relevant test
// credentials aren't set, so CI without those vars stays green.

const { test, expect } = require('@playwright/test');
const {
  BASE_URL,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  TEST_MEMBER_EMAIL,
  TEST_MEMBER_PASS,
  TEST_PROVIDER_EMAIL,
  TEST_PROVIDER_PASS,
} = require('./helpers');

const TEST_HOOK_SECRET = process.env.SURVEY_TEST_HOOK_SECRET || '';

async function signInPassword(email, password) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !email || !password) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_SERVICE_KEY },
      body: JSON.stringify({ email, password })
    });
    if (!r.ok) return null;
    return r.json();
  } catch (_) {
    return null;
  }
}

function seamHeaders(auth, tableErrors) {
  return {
    Authorization: `Bearer ${auth.access_token}`,
    'x-test-supabase-secret': TEST_HOOK_SECRET,
    'x-test-supabase-table-error': tableErrors,
  };
}

test.describe('API fallback audit (Task #229)', () => {
  let providerAuth = null;
  let memberAuth = null;

  test.beforeAll(async () => {
    providerAuth = await signInPassword(TEST_PROVIDER_EMAIL, TEST_PROVIDER_PASS);
    memberAuth = await signInPassword(TEST_MEMBER_EMAIL, TEST_MEMBER_PASS);
  });

  // ============================================================
  // GET /api/saas/shop-status
  // ============================================================

  test('GET /api/saas/shop-status — RLS denial (42501) → 500 with code+detail (no silent plan:none)', async ({ request }) => {
    test.skip(!TEST_HOOK_SECRET || !providerAuth, 'seam secret or provider creds missing');
    const res = await request.get(`${BASE_URL}/api/saas/shop-status`, {
      headers: seamHeaders(providerAuth, 'saas_subscriptions:42501'),
    });
    expect(res.status()).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(body.code).toBe('42501');
    expect(body.detail).toMatch(/saas_subscriptions/);
    expect(body.plan).toBeUndefined();
  });

  test('GET /api/saas/shop-status — table-missing (42P01) → 200 fallback:true', async ({ request }) => {
    test.skip(!TEST_HOOK_SECRET || !providerAuth, 'seam secret or provider creds missing');
    const res = await request.get(`${BASE_URL}/api/saas/shop-status`, {
      headers: seamHeaders(providerAuth, 'saas_subscriptions:42P01'),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.plan).toBe('none');
    expect(body.fallback).toBe(true);
    expect(body.reason).toMatch(/not migrated/);
  });

  // ============================================================
  // GET /api/shop/onboarding-status
  // ============================================================

  test('GET /api/shop/onboarding-status — column-missing (42703) → 500 (no silent empty checklist)', async ({ request }) => {
    test.skip(!TEST_HOOK_SECRET || !providerAuth, 'seam secret or provider creds missing');
    const res = await request.get(`${BASE_URL}/api/shop/onboarding-status`, {
      headers: seamHeaders(providerAuth, 'profiles:42703'),
    });
    expect(res.status()).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('42703');
    expect(body.error).toMatch(/onboarding/i);
  });

  test('GET /api/shop/onboarding-status — table-missing (42P01) → 200 with fallback:true', async ({ request }) => {
    test.skip(!TEST_HOOK_SECRET || !providerAuth, 'seam secret or provider creds missing');
    const res = await request.get(`${BASE_URL}/api/shop/onboarding-status`, {
      headers: seamHeaders(providerAuth, 'profiles:42P01'),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.steps).toBeDefined();
    expect(body.fallback).toBe(true);
  });

  // ============================================================
  // GET /api/provider/marketplace-visibility
  // ============================================================

  test('GET /api/provider/marketplace-visibility — RLS denial (42501) → 500 (no silent re-listing)', async ({ request }) => {
    test.skip(!TEST_HOOK_SECRET || !providerAuth, 'seam secret or provider creds missing');
    const res = await request.get(`${BASE_URL}/api/provider/marketplace-visibility`, {
      headers: seamHeaders(providerAuth, 'profiles:42501'),
    });
    expect(res.status()).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('42501');
  });

  test('GET /api/provider/marketplace-visibility — column-missing (42703) → 200 legacy default with fallback:true', async ({ request }) => {
    test.skip(!TEST_HOOK_SECRET || !providerAuth, 'seam secret or provider creds missing');
    const res = await request.get(`${BASE_URL}/api/provider/marketplace-visibility`, {
      headers: seamHeaders(providerAuth, 'profiles:42703'),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.marketplace_visible).toBe(true);
    expect(body.fallback).toBe(true);
  });

  // ============================================================
  // GET /api/shop/walkin-search
  // ============================================================

  test('GET /api/shop/walkin-search — RLS denial (42501) → 500 (no silent found:false)', async ({ request }) => {
    test.skip(!TEST_HOOK_SECRET || !providerAuth, 'seam secret or provider creds missing');
    const res = await request.get(`${BASE_URL}/api/shop/walkin-search?phone=5550000000`, {
      headers: seamHeaders(providerAuth, 'walkin_customers:42501'),
    });
    expect(res.status()).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('42501');
  });

  test('GET /api/shop/walkin-search — table-missing (42P01) → 200 fallback', async ({ request }) => {
    test.skip(!TEST_HOOK_SECRET || !providerAuth, 'seam secret or provider creds missing');
    const res = await request.get(`${BASE_URL}/api/shop/walkin-search?phone=5550000000`, {
      headers: seamHeaders(providerAuth, 'walkin_customers:42P01'),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.found).toBe(false);
    expect(body.fallback).toBe(true);
  });

  // ============================================================
  // GET /api/founder/campaign-link-stats
  // ============================================================

  test('GET /api/founder/campaign-link-stats — RLS denial → 500 (no silent zeros)', async ({ request }) => {
    test.skip(!TEST_HOOK_SECRET || !memberAuth, 'seam secret or member creds missing');
    const res = await request.get(`${BASE_URL}/api/founder/campaign-link-stats`, {
      headers: seamHeaders(memberAuth, 'member_founder_profiles:42501'),
    });
    // The seam fires synchronously inside the try block on the first
    // supabase.from('member_founder_profiles') call — before the
    // founder-row 403 branch can run — so we always land in the
    // tightened catch and must surface a 500 with the injected code.
    expect(res.status()).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('42501');
    expect(body.error).toBeTruthy();
    expect(body.total_clicks).toBeUndefined();
  });

  test('GET /api/founder/campaign-link-stats — table-missing (42P01) → 200 zeros with fallback:true', async ({ request }) => {
    test.skip(!TEST_HOOK_SECRET || !memberAuth, 'seam secret or member creds missing');
    const res = await request.get(`${BASE_URL}/api/founder/campaign-link-stats`, {
      headers: seamHeaders(memberAuth, 'member_founder_profiles:42P01'),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.total_clicks).toBe(0);
    expect(body.fallback).toBe(true);
  });

  // ============================================================
  // GET /api/white-label/tenant
  // ============================================================

  test('GET /api/white-label/tenant — RLS denial → 500 with no-store (no silent vanilla branding)', async ({ request }) => {
    test.skip(!TEST_HOOK_SECRET, 'seam secret missing');
    // X-Forwarded-Host is read first by the handler and feeds into the
    // _customCandidates list; setting it to a non-MCC, non-local
    // hostname guarantees the supabase.from('white_label_tenants')
    // call (and therefore the seam) fires deterministically.
    const res = await request.get(`${BASE_URL}/api/white-label/tenant`, {
      headers: {
        'x-test-supabase-secret': TEST_HOOK_SECRET,
        'x-test-supabase-table-error': 'white_label_tenants:42501',
        'x-forwarded-host': 'example-tenant.com',
      },
    });
    expect(res.status()).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('42501');
    expect(body.error).toBeTruthy();
    expect(body.is_white_label).toBeUndefined();
    expect(res.headers()['cache-control']).toMatch(/no-store/);
  });

  test('GET /api/white-label/tenant — table-missing (42P01) → 200 null tenant fallback:true', async ({ request }) => {
    test.skip(!TEST_HOOK_SECRET, 'seam secret missing');
    const res = await request.get(`${BASE_URL}/api/white-label/tenant`, {
      headers: {
        'x-test-supabase-secret': TEST_HOOK_SECRET,
        'x-test-supabase-table-error': 'white_label_tenants:42P01',
        'x-forwarded-host': 'example-tenant.com',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.is_white_label).toBe(false);
    expect(body.tenant).toBeNull();
    expect(body.fallback).toBe(true);
    expect(body.reason).toMatch(/not migrated/);
  });
});

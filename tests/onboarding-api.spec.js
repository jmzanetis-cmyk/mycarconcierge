'use strict';

// Regression tests for the member-onboarding API error paths (Task #228).
//
// Background: Task #166 traced an admin-page-empty bug to overly-broad
// fallbacks in POST /api/member/survey and GET /api/admin/survey-analytics
// that silently swallowed real database errors. Task #168 tightened those
// survey routes. Task #228 found two sibling routes — GET /api/member/onboarding
// and POST /api/member/onboarding/step — using the same dangerous pattern:
//
//   if (err.code === '42P01' || err.message.includes('does not exist')) {
//     // return 200 with empty/fallback payload
//   }
//
// The `message.includes('does not exist')` branch swallowed every
// "column X does not exist" (42703 / PGRST204), RLS denial (42501), and
// any other Postgres error whose message happened to contain that phrase.
// These tests pin down the exact response shape for every error mode so a
// future "graceful fallback" cannot reintroduce the silent-failure regression.
//
// The error-injection tests rely on a server-side test seam in
// www/server.js (search for `maybeWrapSupabaseForApiTest`) which is
// hard-gated on:
//   * NODE_ENV !== 'production'
//   * SURVEY_TEST_HOOK_SECRET env var set on the SERVER process
//   * Matching `x-test-supabase-secret` header on the request
//
// To run the full suite locally:
//   SURVEY_TEST_HOOK_SECRET=local-test-secret \
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   npx playwright test tests/onboarding-api.spec.js
//
// Tests that need the seam are auto-skipped when the secret is missing.

const { test, expect } = require('@playwright/test');
const {
  BASE_URL,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  TEST_MEMBER_EMAIL,
  TEST_MEMBER_PASS,
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

test.describe('Onboarding API regression (Task #228)', () => {
  let memberAuth = null;

  test.beforeAll(async () => {
    memberAuth = await signInPassword(TEST_MEMBER_EMAIL, TEST_MEMBER_PASS);
  });

  // ============================================================
  // GET /api/member/onboarding
  // ============================================================

  test('GET /api/member/onboarding — 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/member/onboarding`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('GET /api/member/onboarding — valid auth, healthy schema → 200 with checklist shape', async ({ request }) => {
    test.skip(!memberAuth, 'TEST_MEMBER_EMAIL/TEST_MEMBER_PASSWORD not valid in this environment');

    const res = await request.get(`${BASE_URL}/api/member/onboarding`, {
      headers: { 'Authorization': `Bearer ${memberAuth.access_token}` }
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    // Healthy-schema path must NOT report an error key
    expect(body.error).toBeUndefined();
    expect(body.code).toBeUndefined();
    expect(body.checklist).toBeTruthy();
    expect(typeof body.checklist).toBe('object');
    // The unified payload always exposes both member + provider keys
    expect(body.checklist).toHaveProperty('account_created');
    expect(body.checklist).toHaveProperty('profile_completed');
    expect(body.checklist).toHaveProperty('provider_profile');
  });

  test('GET /api/member/onboarding — missing table (42P01) → 200 with empty checklist (intentional benign path)', async ({ request }) => {
    test.skip(!memberAuth, 'TEST_MEMBER credentials not valid');
    test.skip(!TEST_HOOK_SECRET, 'SURVEY_TEST_HOOK_SECRET not set on server/test env');

    const res = await request.get(`${BASE_URL}/api/member/onboarding`, {
      headers: {
        'Authorization': `Bearer ${memberAuth.access_token}`,
        'x-test-supabase-secret': TEST_HOOK_SECRET,
        'x-test-supabase-onboarding-error': '42P01'
      }
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.error).toBeUndefined();
    expect(body.code).toBeUndefined();
    expect(body.checklist).toBeTruthy();
    expect(body.checklist.account_created).toBe(true);
    expect(body.checklist.profile_completed).toBe(false);
    expect(body.checklist.vehicle_added).toBe(false);
    expect(body.survey_completed).toBe(false);
  });

  test('GET /api/member/onboarding — missing column (42703) → 500 with code+detail (NOT silent fallback)', async ({ request }) => {
    test.skip(!memberAuth, 'TEST_MEMBER credentials not valid');
    test.skip(!TEST_HOOK_SECRET, 'SURVEY_TEST_HOOK_SECRET not set on server/test env');

    const res = await request.get(`${BASE_URL}/api/member/onboarding`, {
      headers: {
        'Authorization': `Bearer ${memberAuth.access_token}`,
        'x-test-supabase-secret': TEST_HOOK_SECRET,
        'x-test-supabase-onboarding-error': '42703'
      }
    });

    expect(res.status()).toBe(500);
    const body = await res.json();
    // Critical regression assertions: must NOT mask the failure as success
    // or as the empty/benign 200 fallback that 42P01 returns.
    expect(body.checklist).toBeUndefined();
    expect(body.survey_completed).toBeUndefined();
    // Must surface the underlying Postgres code and detail so on-call sees it.
    expect(body.error).toBeTruthy();
    expect(body.code).toBe('42703');
    expect(body.detail).toBeTruthy();
    expect(typeof body.detail).toBe('string');
  });

  test('GET /api/member/onboarding — RLS denial (42501) → 500 with code+detail (NOT silent fallback)', async ({ request }) => {
    test.skip(!memberAuth, 'TEST_MEMBER credentials not valid');
    test.skip(!TEST_HOOK_SECRET, 'SURVEY_TEST_HOOK_SECRET not set on server/test env');

    // 42501 = insufficient_privilege — the message does NOT contain the
    // phrase "does not exist", so the broken substring branch wouldn't
    // have caught it either; this case primarily guards the new
    // "surface code+detail on every non-42P01 error" contract.
    const res = await request.get(`${BASE_URL}/api/member/onboarding`, {
      headers: {
        'Authorization': `Bearer ${memberAuth.access_token}`,
        'x-test-supabase-secret': TEST_HOOK_SECRET,
        'x-test-supabase-onboarding-error': '42501'
      }
    });

    expect(res.status()).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(body.code).toBe('42501');
    expect(body.detail).toBeTruthy();
    expect(body.checklist).toBeUndefined();
  });

  // ============================================================
  // POST /api/member/onboarding/step
  // ============================================================

  test('POST /api/member/onboarding/step — 401 without auth', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/member/onboarding/step`, {
      headers: { 'Content-Type': 'application/json' },
      data: { step: 'welcome_shown', value: true }
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('POST /api/member/onboarding/step — missing step field → 400', async ({ request }) => {
    test.skip(!memberAuth, 'TEST_MEMBER credentials not valid');
    const res = await request.post(`${BASE_URL}/api/member/onboarding/step`, {
      headers: {
        'Authorization': `Bearer ${memberAuth.access_token}`,
        'Content-Type': 'application/json'
      },
      data: {}
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('POST /api/member/onboarding/step — valid body, healthy schema → 200 ok:true', async ({ request }) => {
    test.skip(!memberAuth, 'TEST_MEMBER credentials not valid');
    const res = await request.post(`${BASE_URL}/api/member/onboarding/step`, {
      headers: {
        'Authorization': `Bearer ${memberAuth.access_token}`,
        'Content-Type': 'application/json'
      },
      data: { step: 'welcome_shown', value: true }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // Healthy-schema path must NOT advertise the fallback flag.
    expect(body.fallback).toBeUndefined();
  });

  test('POST /api/member/onboarding/step — missing table (42P01) → 200 ok:true, fallback:true (intentional benign path)', async ({ request }) => {
    test.skip(!memberAuth, 'TEST_MEMBER credentials not valid');
    test.skip(!TEST_HOOK_SECRET, 'SURVEY_TEST_HOOK_SECRET not set on server/test env');

    const res = await request.post(`${BASE_URL}/api/member/onboarding/step`, {
      headers: {
        'Authorization': `Bearer ${memberAuth.access_token}`,
        'Content-Type': 'application/json',
        'x-test-supabase-secret': TEST_HOOK_SECRET,
        'x-test-supabase-onboarding-error': '42P01'
      },
      data: { step: 'welcome_shown', value: true }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.fallback).toBe(true);
  });

  test('POST /api/member/onboarding/step — missing column (42703) → 500 with code+detail (NOT silent ok:true)', async ({ request }) => {
    test.skip(!memberAuth, 'TEST_MEMBER credentials not valid');
    test.skip(!TEST_HOOK_SECRET, 'SURVEY_TEST_HOOK_SECRET not set on server/test env');

    const res = await request.post(`${BASE_URL}/api/member/onboarding/step`, {
      headers: {
        'Authorization': `Bearer ${memberAuth.access_token}`,
        'Content-Type': 'application/json',
        'x-test-supabase-secret': TEST_HOOK_SECRET,
        'x-test-supabase-onboarding-error': '42703'
      },
      data: { step: 'welcome_shown', value: true }
    });
    expect(res.status()).toBe(500);
    const body = await res.json();
    // Critical regression assertions: must NOT mask as success or the
    // 42P01 benign-fallback shape.
    expect(body.ok).toBeUndefined();
    expect(body.fallback).toBeUndefined();
    expect(body.error).toBeTruthy();
    expect(body.code).toBe('42703');
    expect(body.detail).toBeTruthy();
  });

  test('POST /api/member/onboarding/step — RLS denial (42501) → 500 with code+detail (NOT silent ok:true)', async ({ request }) => {
    test.skip(!memberAuth, 'TEST_MEMBER credentials not valid');
    test.skip(!TEST_HOOK_SECRET, 'SURVEY_TEST_HOOK_SECRET not set on server/test env');

    const res = await request.post(`${BASE_URL}/api/member/onboarding/step`, {
      headers: {
        'Authorization': `Bearer ${memberAuth.access_token}`,
        'Content-Type': 'application/json',
        'x-test-supabase-secret': TEST_HOOK_SECRET,
        'x-test-supabase-onboarding-error': '42501'
      },
      data: { step: 'welcome_shown', value: true }
    });
    expect(res.status()).toBe(500);
    const body = await res.json();
    expect(body.ok).toBeUndefined();
    expect(body.fallback).toBeUndefined();
    expect(body.error).toBeTruthy();
    expect(body.code).toBe('42501');
    expect(body.detail).toBeTruthy();
  });
});

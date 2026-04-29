'use strict';

// Regression tests for the member-survey API error paths (Task #168).
//
// Background: Task #166 traced an admin-page-empty bug to overly-broad
// fallbacks in POST /api/member/survey and GET /api/admin/survey-analytics
// that swallowed real database errors silently. The fix tightened the
// fallback to ONLY trigger on Postgres `42P01` (relation does not exist)
// for inserts and on the column-missing signals (`42703`, `PGRST204`,
// "schema cache") for the analytics select. These tests pin down the
// exact response shape for every error mode so a future "graceful
// fallback" cannot reintroduce the silent-failure regression.
//
// The error-injection tests rely on a server-side test seam in
// www/server.js (search for `maybeWrapSupabaseForSurveyTest`) which is
// hard-gated on:
//   * NODE_ENV !== 'production'
//   * SURVEY_TEST_HOOK_SECRET env var set on the SERVER process
//   * Matching `x-test-supabase-secret` header on the request
//
// To run the full suite locally:
//   SURVEY_TEST_HOOK_SECRET=local-test-secret \
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   npx playwright test tests/survey-api.spec.js
//
// Tests that need the seam are auto-skipped when the secret is missing.

const { test, expect } = require('@playwright/test');
const {
  BASE_URL,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  TEST_MEMBER_EMAIL,
  TEST_MEMBER_PASS,
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASS,
  getSupabaseAdmin,
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

const VALID_SURVEY_BODY = {
  provider_discovery: 'word_of_mouth',
  provider_satisfaction: 'somewhat_satisfied',
  service_frequency: 'twice_a_year',
  top_priority: 'trust',
  vehicle_count: '1'
};

test.describe('Survey API regression (Task #168)', () => {
  let memberAuth = null;
  let adminAuth = null;

  test.beforeAll(async () => {
    memberAuth = await signInPassword(TEST_MEMBER_EMAIL, TEST_MEMBER_PASS);
    adminAuth = await signInPassword(TEST_ADMIN_EMAIL, TEST_ADMIN_PASS);
  });

  test.afterEach(async () => {
    // Clean up any survey row tied to the member test user so each test
    // starts from a known-empty state for that user.
    if (memberAuth?.user?.id && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const supabase = getSupabaseAdmin();
      await supabase
        .from('survey_responses')
        .delete()
        .eq('user_id', memberAuth.user.id)
        .then(() => null, () => null);
    }
  });

  // ============================================================
  // POST /api/member/survey
  // ============================================================

  test('POST /api/member/survey — valid body, healthy schema → 200 ok:true and a row is inserted', async ({ request }) => {
    test.skip(!memberAuth, 'TEST_MEMBER_EMAIL/TEST_MEMBER_PASSWORD not valid in this environment');

    const supabase = getSupabaseAdmin();
    // Pre-clean to guarantee idempotency
    await supabase.from('survey_responses').delete().eq('user_id', memberAuth.user.id);

    const res = await request.post(`${BASE_URL}/api/member/survey`, {
      headers: {
        'Authorization': `Bearer ${memberAuth.access_token}`,
        'Content-Type': 'application/json',
        'x-forwarded-for': '203.0.113.10'
      },
      data: VALID_SURVEY_BODY,
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // Healthy-schema path must NOT report a fallback
    expect(body.fallback).toBeUndefined();

    // Confirm the row actually landed in the table
    const { data: rows } = await supabase
      .from('survey_responses')
      .select('id, user_id, top_priority, provider_discovery')
      .eq('user_id', memberAuth.user.id);
    expect(rows && rows.length).toBeGreaterThan(0);
    expect(rows[0].top_priority).toBe('trust');
    expect(rows[0].provider_discovery).toBe('word_of_mouth');
  });

  test('POST /api/member/survey — missing column (42703) → 500 with code+detail (NOT silent fallback)', async ({ request }) => {
    test.skip(!memberAuth, 'TEST_MEMBER credentials not valid');
    test.skip(!TEST_HOOK_SECRET, 'SURVEY_TEST_HOOK_SECRET not set on server/test env');

    const res = await request.post(`${BASE_URL}/api/member/survey`, {
      headers: {
        'Authorization': `Bearer ${memberAuth.access_token}`,
        'Content-Type': 'application/json',
        'x-forwarded-for': '203.0.113.11',
        'x-test-supabase-secret': TEST_HOOK_SECRET,
        'x-test-supabase-survey-insert-error': '42703'
      },
      data: VALID_SURVEY_BODY,
    });

    expect(res.status()).toBe(500);
    const body = await res.json();
    // Critical regression assertions: must NOT mask the failure as success.
    expect(body.ok).toBeUndefined();
    expect(body.fallback).toBeUndefined();
    // Must surface the underlying Postgres code and detail so on-call sees it.
    expect(body.error).toBeTruthy();
    expect(body.code).toBe('42703');
    expect(body.detail).toBeTruthy();
    expect(typeof body.detail).toBe('string');
  });

  test('POST /api/member/survey — missing table (42P01) → 200 fallback:true (intentional benign path)', async ({ request }) => {
    test.skip(!memberAuth, 'TEST_MEMBER credentials not valid');
    test.skip(!TEST_HOOK_SECRET, 'SURVEY_TEST_HOOK_SECRET not set on server/test env');

    const res = await request.post(`${BASE_URL}/api/member/survey`, {
      headers: {
        'Authorization': `Bearer ${memberAuth.access_token}`,
        'Content-Type': 'application/json',
        'x-forwarded-for': '203.0.113.12',
        'x-test-supabase-secret': TEST_HOOK_SECRET,
        'x-test-supabase-survey-insert-error': '42P01'
      },
      data: VALID_SURVEY_BODY,
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.fallback).toBe(true);
    expect(body.reason).toBeTruthy();
    expect(String(body.reason)).toMatch(/migrat|table/i);
  });

  // ============================================================
  // GET /api/admin/survey-analytics
  // ============================================================

  test('GET /api/admin/survey-analytics — 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/survey-analytics`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('GET /api/admin/survey-analytics — 403 for non-admin user', async ({ request }) => {
    test.skip(!memberAuth, 'TEST_MEMBER credentials not valid');

    const res = await request.get(`${BASE_URL}/api/admin/survey-analytics`, {
      headers: { 'Authorization': `Bearer ${memberAuth.access_token}` },
    });

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(String(body.error)).toMatch(/admin/i);
  });

  test('GET /api/admin/survey-analytics — missing column (42703) → 200 schema_pending:true with empty buckets', async ({ request }) => {
    test.skip(!adminAuth, 'TEST_ADMIN credentials not valid');
    test.skip(!TEST_HOOK_SECRET, 'SURVEY_TEST_HOOK_SECRET not set on server/test env');

    const res = await request.get(`${BASE_URL}/api/admin/survey-analytics`, {
      headers: {
        'Authorization': `Bearer ${adminAuth.access_token}`,
        'x-test-supabase-secret': TEST_HOOK_SECRET,
        'x-test-supabase-survey-select-error': '42703'
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.schema_pending).toBe(true);
    // Bucket aggregations must be empty when select short-circuits.
    expect(body.by_provider_discovery).toEqual({});
    expect(body.by_top_priority).toEqual({});
    expect(body.by_provider_satisfaction).toEqual({});
    // Must NOT mask as a real DB error (no `error`/`code` keys mixed in)
    expect(body.error).toBeUndefined();
    expect(body.code).toBeUndefined();
  });

  test('GET /api/admin/survey-analytics — unrelated DB error (e.g. 42501) → 500 with code+detail (NOT silent empty)', async ({ request }) => {
    test.skip(!adminAuth, 'TEST_ADMIN credentials not valid');
    test.skip(!TEST_HOOK_SECRET, 'SURVEY_TEST_HOOK_SECRET not set on server/test env');

    // 42501 = insufficient_privilege — clearly not a "schema not migrated"
    // signal. The handler must surface it as a real failure, not pretend
    // the page is just empty.
    const res = await request.get(`${BASE_URL}/api/admin/survey-analytics`, {
      headers: {
        'Authorization': `Bearer ${adminAuth.access_token}`,
        'x-test-supabase-secret': TEST_HOOK_SECRET,
        'x-test-supabase-survey-count-error': '42501'
      },
    });

    expect(res.status()).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(body.code).toBe('42501');
    expect(body.detail).toBeTruthy();
    // Must NOT silently report schema_pending or empty buckets for a
    // genuine database failure.
    expect(body.schema_pending).toBeUndefined();
    expect(body.by_provider_discovery).toBeUndefined();
  });
});

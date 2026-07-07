#!/usr/bin/env node
/**
 * docs/scripts/smoke-test-backend-loop.mjs
 *
 * Backend integration test for the Car Club §6a punch/redeem loop.
 *
 * Exercises the full loop against the dummy provider's throwaway club via
 * direct API calls (no browser). Validates:
 *   1. JOIN            — member joins the club
 *   2. PUNCH ×10       — provider awards 10 punches; ledger sums to 10
 *   3. REDEEM          — member redeems reward; voucher issued; ledger nets to 0
 *   4. VALIDATE #1     — provider fulfills the voucher
 *   5. VALIDATE #2     — provider tries to reuse the SAME voucher → REJECTED
 *
 * Auth: uses admin.generateLink({ type: 'magiclink' }) + verifyOtp({
 * token_hash }) to mint access tokens for the two test accounts. No passwords
 * required — only SUPABASE_SERVICE_ROLE_KEY. Matches the pattern used in
 * scripts/rls-cross-user-test.mjs.
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 * Optional:
 *   API_BASE_URL   (default: https://www.mycarconcierge.com)
 *
 * Run:
 *   SUPABASE_SERVICE_ROLE_KEY=<...> node docs/scripts/smoke-test-backend-loop.mjs
 *
 * After a successful run, the club is left with test data:
 *   1 club_memberships row, 11 club_points_ledger rows (10 punches + 1 redeem
 *   deduction), 1 club_points_redemptions row (status=fulfilled).
 * Run docs/scripts/reset-smoke-test-data.sql with v_club_id swapped to the
 * dummy-club id (7e80ef61-...) before re-running.
 *
 * Endpoint contracts verified against netlify/functions/car-clubs.js
 * (2026-07-07):
 *   POST /api/car-clubs/join             body { club_id }
 *     → 200 { success: true }  or  409 already-member
 *   POST /api/car-clubs/punch            body { club_id, qr_token }
 *     → 200 { success: true, ledger_id, member_id }
 *     Provider auth: caller must own the club. Member resolution: profiles
 *     .qr_code_token first, then profiles.id fallback if token matches the
 *     UUID regex. Using MEMBER_UID as qr_token hits the fallback (deterministic
 *     — does not depend on any qr_code_token being set on Jordan's profile).
 *   POST /api/car-clubs/redeem           body { club_id, reward_id }
 *     → 200 { success: true, voucher_code }
 *     Delegates to redeem_reward_for_member RPC (20260706a). Advisory-xact-lock
 *     + FOR UPDATE + membership/balance guards; ledger deduction is the LAST
 *     write (voucher-first write ordering).
 *   POST /api/car-clubs/validate-voucher body { voucher_code }
 *     → 200 { success: true, redemption }  or  404 invalid/already-used
 *     Atomic UPDATE ... WHERE status='issued' RETURNING — race-safe reuse
 *     rejection lives entirely in the WHERE clause. Second concurrent
 *     validate for the same code finds no row, returns 404. See car-clubs.js
 *     :703-787 for the full contract and race analysis.
 */

import { createClient } from '@supabase/supabase-js';

// ── env & config ─────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY     = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE_URL = process.env.API_BASE_URL || 'https://www.mycarconcierge.com';

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('Required env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
  console.error('Optional: API_BASE_URL (default https://www.mycarconcierge.com)');
  process.exit(2);
}

// Staged state — dummy provider club by default. All six can be overridden
// via env vars (SMOKE_CLUB_ID, SMOKE_REWARD_ID, SMOKE_PROVIDER_EMAIL,
// SMOKE_PROVIDER_UID, SMOKE_MEMBER_EMAIL, SMOKE_MEMBER_UID) so the same
// harness can exercise a different provider's club (e.g. Chris's real
// pilot club) without touching this file.
const CLUB_ID        = process.env.SMOKE_CLUB_ID        || '7e80ef61-8740-431f-aab2-6ff4fd10739b';
const REWARD_ID      = process.env.SMOKE_REWARD_ID      || '2090adf5-b370-4bc3-8e35-8653c94e5eda';
const PROVIDER_EMAIL = process.env.SMOKE_PROVIDER_EMAIL || 'testprovider@test.com';
const PROVIDER_UID   = process.env.SMOKE_PROVIDER_UID   || '0bb98854-8aa8-41f7-816b-d06785167194';
const MEMBER_EMAIL   = process.env.SMOKE_MEMBER_EMAIL   || 'jm.zanetis@gmail.com';
const MEMBER_UID     = process.env.SMOKE_MEMBER_UID     || '8ea2bc19-16c7-4af2-8d4d-551434a53ec7';
// qr_token for the punch step. Using MEMBER_UID directly means the punch
// endpoint hits the profiles.id fallback (car-clubs.js:440-443), which does
// not depend on any qr_code_token being set on Jordan's profile.
const MEMBER_QR_TOKEN = MEMBER_UID;

const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ── auth helpers ─────────────────────────────────────────────────────────────

async function mintTokenFor(email) {
  const { data, error } = await svc.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw new Error(`generateLink(${email}): ${error.message}`);
  const hashedToken = data?.properties?.hashed_token;
  if (!hashedToken) throw new Error(`generateLink(${email}): response missing properties.hashed_token`);
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: verified, error: vErr } = await anon.auth.verifyOtp({
    token_hash: hashedToken,
    type: 'magiclink',
  });
  if (vErr) throw new Error(`verifyOtp(${email}): ${vErr.message}`);
  const token = verified?.session?.access_token;
  if (!token) throw new Error(`verifyOtp(${email}): no access_token returned`);
  return token;
}

async function apiCall(method, path, token, body) {
  const url = `${API_BASE_URL}${path}`;
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };
  if (body != null) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  let jsonBody = null;
  try { jsonBody = await res.json(); } catch { jsonBody = null; }
  return { status: res.status, body: jsonBody };
}

// ── test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function step(num, label, method, path, sampleBody, fn) {
  const bodyStr = sampleBody ? `  body=${JSON.stringify(sampleBody)}` : '';
  console.log(`\n── Step ${num}: ${label}`);
  console.log(`   → ${method} ${path}${bodyStr}`);
  try {
    await fn();
    passed++;
    console.log(`   ✓ PASS`);
  } catch (e) {
    failed++;
    console.log(`   ✗ FAIL: ${e.message}`);
    throw e; // hard-stop on first failure per spec
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  Car Club backend integration test — §6a punch/redeem loop');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  API_BASE_URL = ${API_BASE_URL}`);
  console.log(`  SUPABASE_URL = ${SUPABASE_URL}`);
  console.log(`  club_id      = ${CLUB_ID}`);
  console.log(`  reward_id    = ${REWARD_ID}`);
  console.log(`  provider     = ${PROVIDER_EMAIL}  (${PROVIDER_UID})`);
  console.log(`  member       = ${MEMBER_EMAIL}  (${MEMBER_UID})`);

  console.log('\n── Minting access tokens (admin.generateLink → verifyOtp)…');
  const memberToken   = await mintTokenFor(MEMBER_EMAIL);
  const providerToken = await mintTokenFor(PROVIDER_EMAIL);
  console.log('   ✓ both tokens minted (values redacted)');

  // Step 1: JOIN ─────────────────────────────────────────────────────────────
  await step(
    1, 'JOIN — member joins club',
    'POST', '/api/car-clubs/join', { club_id: CLUB_ID },
    async () => {
      const r = await apiCall('POST', '/api/car-clubs/join', memberToken, { club_id: CLUB_ID });
      console.log(`   ← ${r.status}  ${JSON.stringify(r.body)}`);
      assert(r.status === 200, `expected 200, got ${r.status}`);
      assert(r.body?.success === true, 'expected body.success === true');

      const { data: m } = await svc.from('club_memberships')
        .select('id, is_active')
        .eq('club_id', CLUB_ID)
        .eq('member_id', MEMBER_UID)
        .maybeSingle();
      assert(m, 'membership row not found via service-role check');
      assert(m.is_active === true, `expected is_active=true, got ${m.is_active}`);
      console.log(`   ← membership id=${m.id} is_active=true`);
    }
  );

  // Step 2: PUNCH ×10 ───────────────────────────────────────────────────────
  await step(
    2, 'PUNCH ×10 — provider awards 10 punches',
    'POST', '/api/car-clubs/punch', { club_id: CLUB_ID, qr_token: '<MEMBER_UID>' },
    async () => {
      for (let i = 1; i <= 10; i++) {
        const r = await apiCall('POST', '/api/car-clubs/punch', providerToken, {
          club_id: CLUB_ID,
          qr_token: MEMBER_QR_TOKEN,
        });
        if (r.status !== 200 || r.body?.success !== true) {
          throw new Error(`punch ${i}/10 failed: ${r.status} ${JSON.stringify(r.body)}`);
        }
      }
      console.log('   ← 10× POST /punch all returned 200 success:true');

      const { data: ledger } = await svc.from('club_points_ledger')
        .select('delta_points')
        .eq('club_id', CLUB_ID)
        .eq('member_id', MEMBER_UID);
      const sum = (ledger || []).reduce((acc, row) => acc + row.delta_points, 0);
      console.log(`   ← ledger SUM(delta_points) = ${sum}  (${(ledger || []).length} rows)`);
      assert(sum === 10, `expected balance 10, got ${sum}`);
    }
  );

  // Step 3: REDEEM ──────────────────────────────────────────────────────────
  let capturedVoucher = null;
  await step(
    3, 'REDEEM — member redeems reward',
    'POST', '/api/car-clubs/redeem', { club_id: CLUB_ID, reward_id: REWARD_ID },
    async () => {
      const r = await apiCall('POST', '/api/car-clubs/redeem', memberToken, {
        club_id: CLUB_ID,
        reward_id: REWARD_ID,
      });
      console.log(`   ← ${r.status}  ${JSON.stringify(r.body)}`);
      assert(r.status === 200, `expected 200, got ${r.status}`);
      assert(r.body?.success === true, 'expected body.success === true');
      assert(typeof r.body?.voucher_code === 'string' && r.body.voucher_code.length > 0,
        'expected non-empty voucher_code');
      capturedVoucher = r.body.voucher_code;

      const { data: red } = await svc.from('club_points_redemptions')
        .select('id, status, voucher_code, point_cost, member_id, club_id')
        .eq('voucher_code', capturedVoucher)
        .maybeSingle();
      assert(red, 'redemption row not found via service-role check');
      assert(red.status === 'issued', `expected redemption status='issued', got '${red.status}'`);
      assert(red.point_cost === 10, `expected point_cost=10, got ${red.point_cost}`);
      assert(red.member_id === MEMBER_UID, 'redemption member_id mismatch');
      assert(red.club_id === CLUB_ID, 'redemption club_id mismatch');
      console.log(`   ← redemption id=${red.id} status=issued point_cost=10`);

      const { data: ledger } = await svc.from('club_points_ledger')
        .select('delta_points')
        .eq('club_id', CLUB_ID)
        .eq('member_id', MEMBER_UID);
      const sum = (ledger || []).reduce((acc, row) => acc + row.delta_points, 0);
      console.log(`   ← post-redeem ledger SUM(delta_points) = ${sum}  (${(ledger || []).length} rows)`);
      assert(sum === 0, `expected balance 0 after 10 earned + 10 spent, got ${sum}`);
    }
  );

  // Step 4: VALIDATE #1 (fulfill) ───────────────────────────────────────────
  await step(
    4, 'VALIDATE #1 — provider validates voucher',
    'POST', '/api/car-clubs/validate-voucher', { voucher_code: '<captured>' },
    async () => {
      const r = await apiCall('POST', '/api/car-clubs/validate-voucher', providerToken, {
        voucher_code: capturedVoucher,
      });
      console.log(`   ← ${r.status}  ${JSON.stringify(r.body)}`);
      assert(r.status === 200, `expected 200, got ${r.status}`);
      assert(r.body?.success === true, 'expected body.success === true');
      assert(r.body?.redemption?.voucher_code === capturedVoucher,
        'redemption.voucher_code in response should equal captured voucher');

      const { data: red } = await svc.from('club_points_redemptions')
        .select('status, fulfilled_at')
        .eq('voucher_code', capturedVoucher)
        .maybeSingle();
      assert(red.status === 'fulfilled', `expected status='fulfilled', got '${red.status}'`);
      assert(red.fulfilled_at != null, 'fulfilled_at should be non-null');
      console.log(`   ← redemption row status=fulfilled fulfilled_at=${red.fulfilled_at}`);
    }
  );

  // Step 5: VALIDATE #2 (reuse rejected) ────────────────────────────────────
  await step(
    5, 'VALIDATE #2 — reuse REJECTED (atomic guarantee)',
    'POST', '/api/car-clubs/validate-voucher', { voucher_code: '<captured>' },
    async () => {
      const r = await apiCall('POST', '/api/car-clubs/validate-voucher', providerToken, {
        voucher_code: capturedVoucher,
      });
      console.log(`   ← ${r.status}  ${JSON.stringify(r.body)}`);
      assert(r.status === 404,
        `expected 404 (reuse rejected), got ${r.status}. A 500 or 200 here means the atomic reuse guarantee is broken.`);
      assert(typeof r.body?.error === 'string' && /invalid|already/i.test(r.body.error),
        `expected reuse-rejection error, got: ${JSON.stringify(r.body)}`);

      const { data: red } = await svc.from('club_points_redemptions')
        .select('status')
        .eq('voucher_code', capturedVoucher)
        .maybeSingle();
      assert(red?.status === 'fulfilled',
        `redemption row should still be fulfilled (not double-flipped or cancelled), got '${red?.status}'`);
      console.log('   ← redemption row still status=fulfilled — no double-flip');
    }
  );
}

// ── entrypoint ───────────────────────────────────────────────────────────────

main()
  .then(() => {
    console.log('\n════════════════════════════════════════════════════════════');
    console.log(`  ${passed}/5 passed  ·  ${failed} failed`);
    console.log('  Test data left in place:');
    console.log('    1 club_memberships row (active)');
    console.log('    11 club_points_ledger rows (10 punches + 1 redeem deduction)');
    console.log('    1 club_points_redemptions row (status=fulfilled)');
    console.log('  BEFORE RE-RUNNING: run docs/scripts/reset-smoke-test-data.sql with');
    console.log(`  v_club_id = '${CLUB_ID}' to restore 0/0/0.`);
    console.log('════════════════════════════════════════════════════════════');
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error(`\n─── FATAL: ${e.message}`);
    console.log('\n════════════════════════════════════════════════════════════');
    console.log(`  ${passed}/5 passed · stopped on first failure`);
    console.log('  Partial test data may be present — run reset harness before re-run.');
    console.log(`  reset: docs/scripts/reset-smoke-test-data.sql with v_club_id = '${CLUB_ID}'`);
    console.log('════════════════════════════════════════════════════════════');
    process.exit(1);
  });

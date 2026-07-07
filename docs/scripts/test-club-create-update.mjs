#!/usr/bin/env node
/**
 * docs/scripts/test-club-create-update.mjs
 *
 * Integration test for the /create and /update Car Club handlers added to
 * netlify/functions/car-clubs.js this session (commit 9604bd9). Exercises:
 *
 *   1. CREATE SUCCESS         — provider A creates a club owned by A
 *   2. UPDATE SELF SUCCESS    — provider A edits the club they just created
 *   3. CROSS-PROVIDER REJECT  — provider A tries to edit Chris's real club;
 *                                MUST 404 and MUST leave Chris's row unchanged
 *   4. EDGE CASES             — 6 validation assertions (empty name,
 *                                whitespace name, non-hex theme, CSS-inject
 *                                theme, no-id update, non-http logo)
 *
 * The cross-provider case is the whole point of shipping this test: it proves
 * that a provider CANNOT edit a club they don't own, live against prod.
 *
 * Auth (same pattern as smoke-test-backend-loop.mjs f2cb4a0):
 * admin.generateLink({ type: 'magiclink' }) → verifyOtp({ token_hash })
 * mints an access_token per test account. No passwords required.
 *
 * Required env (source from .env; NEVER pass SUPABASE_SERVICE_ROLE_KEY inline):
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 * Optional overrides (defaults documented per constant below):
 *   API_BASE_URL         — default https://www.mycarconcierge.com
 *   SMOKE_PROVIDER_EMAIL — default testprovider@test.com
 *   SMOKE_PROVIDER_UID   — default 0bb98854-8aa8-41f7-816b-d06785167194
 *   SMOKE_CHRIS_CLUB_ID  — default fee6de4f-de82-4c73-8097-5392007302d1
 *   SMOKE_CHRIS_CLUB_NAME — default "Alpha Auto Body Rewards" (used to
 *                            assert the cross-provider case did NOT rewrite
 *                            Chris's name).
 *
 * Run:
 *   set -a && . ./.env && set +a && node docs/scripts/test-club-create-update.mjs
 *
 * Post-run cleanup:
 *   Any club created under provider A is left behind (test data). The script
 *   prints the created club ids at the end for you to DELETE / reset. It does
 *   NOT auto-delete — the reset harness pattern lives in
 *   docs/scripts/reset-smoke-test-data.sql (for club membership/activity) but
 *   deleting the car_clubs row itself is deliberately manual.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = process.env.SUPABASE_URL;
const ANON_KEY          = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE_URL      = process.env.API_BASE_URL || 'https://www.mycarconcierge.com';
const PROVIDER_EMAIL    = process.env.SMOKE_PROVIDER_EMAIL || 'testprovider@test.com';
const PROVIDER_UID      = process.env.SMOKE_PROVIDER_UID   || '0bb98854-8aa8-41f7-816b-d06785167194';
const CHRIS_CLUB_ID     = process.env.SMOKE_CHRIS_CLUB_ID  || 'fee6de4f-de82-4c73-8097-5392007302d1';
const CHRIS_CLUB_NAME   = process.env.SMOKE_CHRIS_CLUB_NAME || 'Alpha Auto Body Rewards';

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('Required env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
  console.error('Source from .env — do not pass SUPABASE_SERVICE_ROLE_KEY inline.');
  process.exit(2);
}

const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ── auth mint (verbatim shape from smoke-test-backend-loop.mjs) ──────────────

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

// ── harness ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const createdClubIds = [];

function assert(cond, msg) { if (!cond) throw new Error(msg); }

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
    throw e; // hard-stop on first failure
  }
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  Car Club create/update integration test');
  console.log('  (ownership-gate cross-provider assertion is Step 3)');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  API_BASE_URL     = ${API_BASE_URL}`);
  console.log(`  SUPABASE_URL     = ${SUPABASE_URL}`);
  console.log(`  provider A       = ${PROVIDER_EMAIL}  (${PROVIDER_UID})`);
  console.log(`  cross-provider   = Chris's club ${CHRIS_CLUB_ID}`);
  console.log(`  expected Chris name = "${CHRIS_CLUB_NAME}" (must stay unchanged)`);

  console.log('\n── Minting access token for provider A…');
  const providerToken = await mintTokenFor(PROVIDER_EMAIL);
  console.log('   ✓ token minted (value redacted)');

  // Snapshot Chris's row BEFORE anything — used at the end of Step 3 to
  // prove nothing on his club changed.
  const { data: chrisBefore } = await svc.from('car_clubs')
    .select('id, name, description, is_active, updated_at')
    .eq('id', CHRIS_CLUB_ID)
    .maybeSingle();
  if (!chrisBefore) {
    console.error(`\n✗ Chris's club ${CHRIS_CLUB_ID} not found — SMOKE_CHRIS_CLUB_ID misconfigured?`);
    process.exit(2);
  }
  console.log(`\n── Snapshot of Chris's club BEFORE test: name="${chrisBefore.name}" updated_at=${chrisBefore.updated_at}`);

  // Step 1: CREATE SUCCESS ─────────────────────────────────────────────────
  let createdClubId = null;
  await step(
    1, 'CREATE SUCCESS — provider A creates a club owned by A',
    'POST', '/api/car-club/create',
    { name: 'Alt Test Club', description: 'integration test', theme_color: '#123abc' },
    async () => {
      const r = await apiCall('POST', '/api/car-club/create', providerToken, {
        name: 'Alt Test Club',
        description: 'integration test',
        theme_color: '#123abc',
      });
      console.log(`   ← ${r.status}  ${JSON.stringify(r.body)}`);
      assert(r.status === 201, `expected 201, got ${r.status}`);
      assert(r.body?.club?.id, 'expected body.club.id');
      createdClubId = r.body.club.id;
      createdClubIds.push(createdClubId);

      // Server-side verify via service role.
      const { data: row } = await svc.from('car_clubs')
        .select('id, provider_id, name, theme_color, punch_card_enabled, is_active')
        .eq('id', createdClubId).maybeSingle();
      assert(row, 'created club row missing under service-role SELECT');
      assert(row.provider_id === PROVIDER_UID, `provider_id ${row.provider_id} !== ${PROVIDER_UID}`);
      assert(row.name === 'Alt Test Club', `name '${row.name}' !== 'Alt Test Club'`);
      assert(row.theme_color === '#123abc', `theme_color '${row.theme_color}' !== '#123abc'`);
      assert(row.punch_card_enabled === true, `punch_card_enabled ${row.punch_card_enabled} !== true`);
      assert(row.is_active === true, `is_active ${row.is_active} !== true (default)`);
      console.log(`   ← DB verify: provider_id=${row.provider_id} name="${row.name}" theme=${row.theme_color} punch=${row.punch_card_enabled} active=${row.is_active}`);
    }
  );

  // Step 2: UPDATE SELF SUCCESS ────────────────────────────────────────────
  await step(
    2, 'UPDATE SELF SUCCESS — provider A edits their own new club',
    'PUT', '/api/car-club/update',
    { id: '<newly-created>', name: 'Renamed Club', is_active: false },
    async () => {
      const r = await apiCall('PUT', '/api/car-club/update', providerToken, {
        id: createdClubId,
        name: 'Renamed Club',
        is_active: false,
      });
      console.log(`   ← ${r.status}  ${JSON.stringify(r.body)}`);
      assert(r.status === 200, `expected 200, got ${r.status}`);
      assert(r.body?.club?.id === createdClubId, 'response body.club.id mismatch');

      const { data: row } = await svc.from('car_clubs')
        .select('name, is_active')
        .eq('id', createdClubId).maybeSingle();
      assert(row.name === 'Renamed Club', `name '${row.name}' !== 'Renamed Club'`);
      assert(row.is_active === false, `is_active ${row.is_active} !== false`);
      console.log(`   ← DB verify: name="${row.name}" is_active=${row.is_active}`);
    }
  );

  // Step 3: CROSS-PROVIDER REJECT (the critical one) ───────────────────────
  await step(
    3, 'CROSS-PROVIDER REJECT — provider A tries to edit Chris\'s club',
    'PUT', '/api/car-club/update',
    { id: CHRIS_CLUB_ID, name: 'HAXED' },
    async () => {
      const r = await apiCall('PUT', '/api/car-club/update', providerToken, {
        id: CHRIS_CLUB_ID,
        name: 'HAXED',
      });
      console.log(`   ← ${r.status}  ${JSON.stringify(r.body)}`);
      assert(r.status === 404,
        `expected 404 (info-leak-safe collapsed rejection), got ${r.status}. ` +
        `A 200 here means the ownership gate is broken — provider A wrote to Chris's club.`);
      assert(typeof r.body?.error === 'string' && /not found/i.test(r.body.error),
        `expected "Club not found" style error, got: ${JSON.stringify(r.body)}`);

      // THE assertion: Chris's row must be byte-identical (except the
      // updated_at column, which the handler bumps on a real update — we
      // verify it did NOT bump).
      const { data: chrisAfter } = await svc.from('car_clubs')
        .select('id, name, description, is_active, updated_at')
        .eq('id', CHRIS_CLUB_ID).maybeSingle();
      assert(chrisAfter, 'Chris\'s club disappeared during test — investigate immediately');
      assert(chrisAfter.name === chrisBefore.name,
        `Chris's club name CHANGED from "${chrisBefore.name}" to "${chrisAfter.name}" — OWNERSHIP GATE FAILED`);
      assert(chrisAfter.name === CHRIS_CLUB_NAME,
        `Chris's club name is "${chrisAfter.name}", expected "${CHRIS_CLUB_NAME}" — external drift or wrong id`);
      assert(chrisAfter.updated_at === chrisBefore.updated_at,
        `Chris's updated_at changed from ${chrisBefore.updated_at} to ${chrisAfter.updated_at} — write bled through`);
      assert(chrisAfter.description === chrisBefore.description, 'Chris description changed');
      assert(chrisAfter.is_active === chrisBefore.is_active, 'Chris is_active changed');
      console.log(`   ← Chris's row UNCHANGED (name="${chrisAfter.name}", updated_at=${chrisAfter.updated_at})`);
    }
  );

  // Step 4: EDGE CASES ────────────────────────────────────────────────────
  const edges = [
    {
      label: '4a. CREATE name="" → 400',
      method: 'POST', path: '/api/car-club/create',
      body: { name: '' },
      expectStatus: 400, expectMsgLike: /name is required/i,
    },
    {
      label: '4b. CREATE name="   " (whitespace only) → 400',
      method: 'POST', path: '/api/car-club/create',
      body: { name: '   ' },
      expectStatus: 400, expectMsgLike: /name is required/i,
    },
    {
      label: '4c. CREATE theme_color="red" → 400 (not hex)',
      method: 'POST', path: '/api/car-club/create',
      body: { name: 'Edge', theme_color: 'red' },
      expectStatus: 400, expectMsgLike: /theme_color/i,
    },
    {
      label: '4d. CREATE theme_color="#FF0000; background:url(x)" → 400 (CSS-inject defense)',
      method: 'POST', path: '/api/car-club/create',
      body: { name: 'Edge', theme_color: '#FF0000; background:url(x)' },
      expectStatus: 400, expectMsgLike: /theme_color/i,
    },
    {
      label: '4e. UPDATE with no id → 400',
      method: 'PUT', path: '/api/car-club/update',
      body: { name: 'no id here' },
      expectStatus: 400, expectMsgLike: /id required/i,
    },
    {
      label: '4f. CREATE logo_url="javascript:alert(1)" → 400 (not http/https)',
      method: 'POST', path: '/api/car-club/create',
      body: { name: 'Edge', logo_url: 'javascript:alert(1)' },
      expectStatus: 400, expectMsgLike: /logo_url/i,
    },
  ];

  for (const [i, ec] of edges.entries()) {
    await step(
      4 + i * 0.01, ec.label,   // 4.0, 4.01, ... just for numbering vibe
      ec.method, ec.path, ec.body,
      async () => {
        const r = await apiCall(ec.method, ec.path, providerToken, ec.body);
        console.log(`   ← ${r.status}  ${JSON.stringify(r.body)}`);
        assert(r.status === ec.expectStatus,
          `expected ${ec.expectStatus}, got ${r.status}`);
        assert(typeof r.body?.error === 'string' && ec.expectMsgLike.test(r.body.error),
          `expected error matching ${ec.expectMsgLike}, got: ${JSON.stringify(r.body)}`);

        // Belt-and-suspenders for 4a-d & 4f: a CREATE that returned 400
        // must NOT have written a row. Confirm no orphan matches.
        if (ec.method === 'POST') {
          const { count } = await svc.from('car_clubs')
            .select('id', { count: 'exact', head: true })
            .eq('provider_id', PROVIDER_UID)
            .eq('name', typeof ec.body.name === 'string' ? ec.body.name.trim() : '');
          if (typeof ec.body.name === 'string' && ec.body.name.trim() === 'Edge') {
            // 'Edge' would have been created if the theme/logo validation
            // failed AFTER the insert; verify no such row exists.
            assert(count === 0, `edge-case CREATE unexpectedly wrote a row (count=${count})`);
          }
        }
      }
    );
  }
}

const TOTAL = 3 + 6; // 3 main cases + 6 edge cases

main()
  .then(() => {
    console.log('\n════════════════════════════════════════════════════════════');
    console.log(`  ${passed}/${TOTAL} passed  ·  ${failed} failed`);
    if (createdClubIds.length > 0) {
      console.log('\n  Test data created (needs cleanup):');
      for (const id of createdClubIds) {
        console.log(`    car_clubs.id = ${id}   (owned by ${PROVIDER_UID})`);
      }
      console.log('  Also check for a stale dummy club 7e80ef61-... from the earlier');
      console.log('  smoke-test-backend-loop run if you haven\'t reset it.');
      console.log('  Cleanup (paste into Studio, one per new club):');
      for (const id of createdClubIds) {
        console.log(`    DELETE FROM car_clubs WHERE id = '${id}' AND provider_id = '${PROVIDER_UID}';`);
      }
    }
    console.log('════════════════════════════════════════════════════════════');
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error(`\n─── FATAL: ${e.message}`);
    console.log('\n════════════════════════════════════════════════════════════');
    console.log(`  ${passed}/${TOTAL} passed · stopped on first failure`);
    if (createdClubIds.length > 0) {
      console.log('\n  Partial test data created — needs cleanup:');
      for (const id of createdClubIds) {
        console.log(`    car_clubs.id = ${id}`);
      }
    }
    console.log('════════════════════════════════════════════════════════════');
    process.exit(1);
  });

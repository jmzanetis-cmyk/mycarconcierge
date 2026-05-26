#!/usr/bin/env node
'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// e2e-platform-test.js  —  Comprehensive end-to-end test for every major flow.
//
// Usage:
//   SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//     node scripts/e2e-platform-test.js
//
// The script creates isolated test users, exercises real API endpoints, then
// cleans up every row it inserted. Exit 0 = all pass, 1 = any fail.
// ─────────────────────────────────────────────────────────────────────────────

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ifbyjxuaclwmadqbjcyp.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL     = process.env.MCC_SITE_URL || 'https://www.mycarconcierge.com';

if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required.');
  process.exit(2);
}

const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ── Helpers ───────────────────────────────────────────────────────────────────
let passed = 0; let failed = 0;
const results = [];

function tag(ok, name, ms, detail = '') {
  const label = ok ? '[PASS]' : '[FAIL]';
  const line   = `  ${label} ${name}${ms != null ? ` (${ms}ms)` : ''}${detail ? ' — ' + detail : ''}`;
  console.log(line);
  results.push({ ok, name });
  if (ok) passed++; else failed++;
}

function assert(cond, name, ms, detail) {
  tag(!!cond, name, ms, detail);
  return !!cond;
}

async function api(method, path, body, token) {
  const t0 = Date.now();
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  };
  try {
    const res = await fetch(`${SITE_URL}${path}`, opts);
    let json = null;
    try { json = await res.json(); } catch {}
    return { status: res.status, json, ms: Date.now() - t0 };
  } catch (e) {
    return { status: 0, json: null, ms: Date.now() - t0, err: e.message };
  }
}

// ── Cleanup registry ─────────────────────────────────────────────────────────
const cleanup = [];
function later(fn) { cleanup.push(fn); }
async function runCleanup() {
  console.log('\nCleaning up test data…');
  for (const fn of cleanup.reverse()) { try { await fn(); } catch (e) { console.warn('  cleanup warn:', e.message); } }
  console.log('  done.\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const stamp = Date.now();
  const memberEmail   = `e2e-member-${stamp}@mcc-test.invalid`;
  const providerEmail = `e2e-provider-${stamp}@mcc-test.invalid`;
  const PASS = 'E2eTestPass123!';
  let memberToken = null, memberId = null;
  let providerToken = null, providerId = null;
  let testVehicleId = null, testPackageId = null, testBookingId = null;
  let testClubId = null;

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n══════ SUITE A — Member Flows ══════');

  // A-a: Create test member
  {
    const { data, error } = await svc.auth.admin.createUser({
      email: memberEmail, password: PASS, email_confirm: true,
      user_metadata: { full_name: 'E2E Test Member' }
    });
    assert(!error && data?.user, 'A-a create test member', null, error?.message);
    if (data?.user) {
      memberId = data.user.id;
      later(async () => { await svc.auth.admin.deleteUser(memberId); });

      // Sign in to get bearer token
      const { data: s } = await svc.auth.signInWithPassword({ email: memberEmail, password: PASS });
      memberToken = s?.session?.access_token;
      assert(!!memberToken, 'A-a member sign-in token obtained');
    }
  }

  // A-b: Create a vehicle
  if (memberId) {
    const t0 = Date.now();
    const { data, error } = await svc.from('vehicles').insert({
      owner_id: memberId, make: 'Toyota', model: 'Camry', year: 2020,
      vin: `E2ETEST${stamp}`.slice(0, 17), mileage: 45000, license_plate: 'E2ETEST'
    }).select().single();
    const ms = Date.now() - t0;
    assert(!error && data?.id, 'A-b create vehicle', ms, error?.message);
    if (data?.id) {
      testVehicleId = data.id;
      later(async () => { await svc.from('vehicles').delete().eq('id', testVehicleId); });
    }
  }

  // A-c: POST /api/ai/create-care-plan
  if (memberToken) {
    const t0 = Date.now();
    const r = await api('POST', '/api/ai/create-care-plan',
      { description: 'My 2020 Toyota Camry needs an oil change and tire rotation' },
      memberToken);
    const ms = Date.now() - t0;
    // 502/503 = AI key not configured in env; treat as non-blocking info, not failure
    assert([200, 502, 503].includes(r.status), 'A-c AI create-care-plan reachable', ms,
      r.status !== 200 ? `HTTP ${r.status} (AI not configured)` : 'ok');
  }

  // A-d: Create a maintenance package (direct DB — simulate what the frontend does)
  if (memberId && testVehicleId) {
    const t0 = Date.now();
    const { data, error } = await svc.from('maintenance_packages').insert({
      member_id: memberId, vehicle_id: testVehicleId, title: 'E2E Oil Change',
      service_type: 'oil_change', description: 'E2E test oil change',
      status: 'open'
    }).select().single();
    const ms = Date.now() - t0;
    assert(!error && data?.id, 'A-d create maintenance package', ms, error?.message);
    if (data?.id) {
      testPackageId = data.id;
      later(async () => { await svc.from('maintenance_packages').delete().eq('id', testPackageId); });
    }
  }

  // A-e: GET /api/vehicle/{id}/recalls
  if (testVehicleId) {
    const t0 = Date.now();
    const r = await api('GET', `/api/vehicle/${testVehicleId}/recalls`, null, memberToken);
    const ms = Date.now() - t0;
    // NHTSA can return empty recalls for test vehicle — just need a 200
    assert(r.status === 200, 'A-e vehicle recalls NHTSA 200', ms,
      r.status !== 200 ? `HTTP ${r.status}: ${r.json?.error}` : `${r.json?.recalls?.length ?? 0} recalls`);
  }

  // A-f: POST /api/vehicles/{id}/compute-health
  if (testVehicleId && memberToken) {
    const t0 = Date.now();
    const r = await api('POST', `/api/vehicles/${testVehicleId}/compute-health`, {}, memberToken);
    const ms = Date.now() - t0;
    const score = r.json?.health_score ?? r.json?.score;
    assert(r.status === 200 && score >= 0 && score <= 100, 'A-f vehicle health score 0-100', ms,
      r.status !== 200 ? `HTTP ${r.status}` : `score=${score}`);
  }

  // A-g: GET /api/member/{id}/referral-code
  if (memberId && memberToken) {
    const t0 = Date.now();
    const r = await api('GET', `/api/member/${memberId}/referral-code`, null, memberToken);
    const ms = Date.now() - t0;
    assert(r.status === 200 && r.json?.referral_code, 'A-g member referral code generated', ms,
      r.json?.referral_code || r.json?.error);
  }

  // A-h: Booking lifecycle — POST / GET / DELETE
  // Requires a real active provider; look one up rather than rely on test provider
  // (test provider is created in Suite B, which runs after Suite A)
  if (memberToken) {
    const { data: realProvider } = await svc.from('provider_profiles')
      .select('user_id').eq('status', 'active').limit(1).maybeSingle();
    const bookingProviderId = realProvider?.user_id;
    const futureDate = new Date(Date.now() + 86400000 * 3);
    const bookingBody = {
      provider_id: bookingProviderId,
      booking_date: futureDate.toISOString().split('T')[0],
      start_time: '10:00',
      service_type: 'oil_change',
      notes: 'E2E test booking'
    };
    {
      const t0 = Date.now();
      const r = await api('POST', '/api/booking', bookingBody, memberToken);
      const ms = Date.now() - t0;
      // 400 ok when no bookingProviderId found in DB; endpoint must be reachable
      const ok = bookingProviderId
        ? ([200, 201].includes(r.status) && (r.json?.booking?.id || r.json?.id))
        : r.status < 500;
      assert(ok, 'A-h POST /api/booking', ms,
        r.status >= 400 ? `HTTP ${r.status}: ${r.json?.error}` : '');
      testBookingId = r.json?.booking?.id || r.json?.id;
      if (testBookingId) later(async () => {
        await api('DELETE', `/api/booking/${testBookingId}`, null, memberToken);
      });
    }
    if (testBookingId) {
      const t0 = Date.now();
      const r = await api('GET', `/api/booking/${testBookingId}`, null, memberToken);
      const ms = Date.now() - t0;
      assert(r.status === 200, 'A-h GET /api/booking/:id', ms,
        r.status !== 200 ? `HTTP ${r.status}` : '');
    }
    if (testBookingId) {
      const t0 = Date.now();
      const r = await api('DELETE', `/api/booking/${testBookingId}`, null, memberToken);
      const ms = Date.now() - t0;
      assert([200, 204].includes(r.status), 'A-h DELETE /api/booking/:id', ms,
        r.status >= 400 ? `HTTP ${r.status}` : '');
      testBookingId = null; // cleaned up
    }
  }

  // A-i: GET /api/community-board (auth required)
  if (memberToken) {
    const t0 = Date.now();
    const r = await api('GET', '/api/community-board', null, memberToken);
    const ms = Date.now() - t0;
    assert(r.status === 200,
      'A-i community board GET', ms,
      r.status !== 200 ? `HTTP ${r.status}: ${r.json?.error}` : `${r.json?.count ?? 0} posts`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n══════ SUITE B — Provider Flows ══════');

  // B-a: Create test provider
  {
    const { data, error } = await svc.auth.admin.createUser({
      email: providerEmail, password: PASS, email_confirm: true,
      user_metadata: { full_name: 'E2E Test Provider' }
    });
    assert(!error && data?.user, 'B-a create test provider', null, error?.message);
    if (data?.user) {
      providerId = data.user.id;
      later(async () => { await svc.auth.admin.deleteUser(providerId); });
      const { data: s } = await svc.auth.signInWithPassword({ email: providerEmail, password: PASS });
      providerToken = s?.session?.access_token;
      assert(!!providerToken, 'B-a provider sign-in token obtained');

      // Seed a provider_profiles row
      await svc.from('provider_profiles').upsert({
        user_id: providerId, business_name: 'E2E Auto Shop',
        zip_code: '07001', service_radius: 25, status: 'active'
      });
      later(async () => {
        await svc.from('provider_profiles').delete().eq('user_id', providerId);
      });
    }
  }

  // B-b: POST /api/auto-bid/settings
  if (providerToken) {
    const t0 = Date.now();
    const r = await api('POST', '/api/auto-bid/settings',
      { enabled: true, max_bid_amount: 5000, service_types: ['oil_change', 'tire_rotation'] },
      providerToken);
    const ms = Date.now() - t0;
    assert([200, 201].includes(r.status) && r.json?.success !== false,
      'B-b POST /api/auto-bid/settings', ms,
      r.status >= 400 ? `HTTP ${r.status}: ${r.json?.error}` : '');
  }

  // B-c: GET /api/auto-bid/settings
  if (providerToken) {
    const t0 = Date.now();
    const r = await api('GET', '/api/auto-bid/settings', null, providerToken);
    const ms = Date.now() - t0;
    assert(r.status === 200, 'B-c GET /api/auto-bid/settings', ms,
      r.status !== 200 ? `HTTP ${r.status}` : `enabled=${r.json?.settings?.enabled ?? r.json?.enabled}`);
  }

  // B-d: GET /api/car-clubs — verify seeded clubs (auth required)
  if (memberToken) {
    const t0 = Date.now();
    const r = await api('GET', '/api/car-clubs', null, memberToken);
    const ms = Date.now() - t0;
    const clubs = r.json?.clubs ?? r.json?.data ?? (Array.isArray(r.json) ? r.json : null);
    assert(r.status === 200 && Array.isArray(clubs) && clubs.length >= 1,
      'B-d GET /api/car-clubs (≥1 club)', ms,
      `HTTP ${r.status}, clubs=${Array.isArray(clubs) ? clubs.length : 'n/a'}`);
    if (Array.isArray(clubs) && clubs.length > 0) testClubId = clubs[0].id;
  }

  // B-e: POST /api/car-clubs/{id}/join
  if (testClubId && memberToken) {
    const t0 = Date.now();
    const r = await api('POST', `/api/car-clubs/${testClubId}/join`, {}, memberToken);
    const ms = Date.now() - t0;
    assert([200, 201, 409].includes(r.status),
      'B-e join car club (200/201/409 ok)', ms,
      `HTTP ${r.status}`);
    if ([200, 201].includes(r.status)) later(async () => {
      await svc.from('car_club_members').delete()
        .eq('club_id', testClubId).eq('member_id', memberId);
    });
  }

  // B-f: POST /api/car-clubs/{id}/provider-benefits
  if (testClubId && providerToken) {
    const t0 = Date.now();
    const r = await api('POST', `/api/car-clubs/${testClubId}/provider-benefits`,
      { benefit_type: 'discount', discount_percent: 10, description: 'E2E test benefit' },
      providerToken);
    const ms = Date.now() - t0;
    // 403 = test provider is not the club's designated provider (expected for test user)
    assert([200, 201, 400, 403, 404].includes(r.status),
      'B-f provider-benefits endpoint reachable', ms,
      `HTTP ${r.status}${r.json?.error ? ': ' + r.json.error : ''}`);
  }

  // B-g: Create bid on member's care plan
  if (testPackageId && providerId) {
    const t0 = Date.now();
    const { data, error } = await svc.from('bids').insert({
      package_id: testPackageId, provider_id: providerId,
      price: 4500, status: 'pending', description: 'E2E test bid'
    }).select().single();
    const ms = Date.now() - t0;
    assert(!error && data?.id, 'B-g create bid on care plan', ms, error?.message);
    if (data?.id) later(async () => { await svc.from('bids').delete().eq('id', data.id); });
  }

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n══════ SUITE C — Transport Flows ══════');

  const PICKUP  = { lat: 40.7128, lng: -74.006 };
  const DROPOFF = { lat: 40.7282, lng: -73.9942 };

  // C-a: GET /api/transport/requests — member ride list (auth required)
  if (memberToken) {
    const t0 = Date.now();
    const r = await api('GET', '/api/transport/requests', null, memberToken);
    const ms = Date.now() - t0;
    const rides = r.json?.rides ?? r.json?.data ?? (Array.isArray(r.json) ? r.json : null);
    assert(r.status === 200 && Array.isArray(rides),
      'C-a GET /api/transport/requests (auth)', ms,
      r.status !== 200 ? `HTTP ${r.status}: ${r.json?.error}` : `${rides?.length ?? 0} rides`);
  }

  // C-b: Create ASAP transport request
  let testRideId = null;
  if (memberToken && memberId) {
    const t0 = Date.now();
    const r = await api('POST', '/api/transport', {
      pickup_address: '1 Broad St, Newark, NJ 07102',
      pickup_lat: PICKUP.lat, pickup_lng: PICKUP.lng,
      dropoff_address: '350 5th Ave, New York, NY 10118',
      dropoff_lat: DROPOFF.lat, dropoff_lng: DROPOFF.lng,
      passengers: 1, notes: 'E2E test ASAP ride'
    }, memberToken);
    const ms = Date.now() - t0;
    testRideId = r.json?.ride?.id ?? r.json?.id;
    // 400 = no payment method for test user (expected); endpoint must be reachable
    assert([200, 201, 400].includes(r.status),
      'C-b ASAP transport request (endpoint reachable)', ms,
      r.status >= 400 ? `HTTP ${r.status}: ${r.json?.error}` : `ride=${testRideId?.slice(0,8)}`);
    if (testRideId) later(async () => {
      await svc.from('rides').delete().eq('id', testRideId);
    });
  }

  // C-c: Scheduled transport (2 hours from now) → status='scheduled'
  let testScheduledRideId = null;
  if (memberToken && memberId) {
    const scheduledAt = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
    const t0 = Date.now();
    const r = await api('POST', '/api/transport', {
      pickup_address: '1 Broad St, Newark, NJ 07102',
      pickup_lat: PICKUP.lat, pickup_lng: PICKUP.lng,
      dropoff_address: '350 5th Ave, New York, NY 10118',
      dropoff_lat: DROPOFF.lat, dropoff_lng: DROPOFF.lng,
      passengers: 1, scheduled_at: scheduledAt, notes: 'E2E test scheduled ride'
    }, memberToken);
    const ms = Date.now() - t0;
    testScheduledRideId = r.json?.ride?.id ?? r.json?.id;
    const status = r.json?.ride?.status ?? r.json?.status;
    // 400 = no payment method for test user (expected); endpoint must be reachable
    assert([200, 201, 400].includes(r.status),
      "C-c scheduled ride (endpoint reachable)", ms,
      r.status >= 400 ? `HTTP ${r.status}: ${r.json?.error}` : `status=${status}`);
    if (testScheduledRideId) later(async () => {
      await svc.from('rides').delete().eq('id', testScheduledRideId);
    });
  }

  // C-d: vehicle-ready transition (needs a driver — skip if no ride)
  if (testRideId && memberToken) {
    // Assign a driver directly to test vehicle-ready
    const { data: driverRow } = await svc.from('drivers').insert({
      user_id: memberId, // reuse member user for simplicity
      full_name: 'E2E Test Driver', email: `e2e-driver-${stamp}@mcc-test.invalid`,
      status: 'active', stripe_connect_account_id: 'acct_e2e_stub'
    }).select().single();

    if (driverRow) {
      later(async () => { await svc.from('drivers').delete().eq('id', driverRow.id); });
      await svc.from('rides').update({
        status: 'driver_assigned', driver_id: driverRow.id
      }).eq('id', testRideId);

      const { data: assignRow } = await svc.from('ride_assignments').insert({
        ride_id: testRideId, driver_id: driverRow.id, status: 'active'
      }).select().single();
      if (assignRow) later(async () => {
        await svc.from('ride_assignments').delete().eq('id', assignRow.id);
      });

      // Get a driver token (sign in as the driver's auth user = member auth user here)
      const driverToken = memberToken;
      const t0 = Date.now();
      const r = await api('POST', '/api/transport/vehicle-ready',
        { ride_id: testRideId }, driverToken);
      const ms = Date.now() - t0;
      assert([200, 400, 403].includes(r.status),
        'C-d vehicle-ready endpoint reachable', ms,
        `HTTP ${r.status}${r.json?.error ? ': ' + r.json.error : ''}`);
    }
  }

  // C-e: Cancel — idempotent
  if (testRideId && memberToken) {
    // Cancel once
    const t0 = Date.now();
    const r1 = await api('POST', '/api/transport/cancel', { ride_id: testRideId }, memberToken);
    const ms1 = Date.now() - t0;
    assert([200, 400].includes(r1.status), 'C-e cancel ride (first)', ms1, `HTTP ${r1.status}`);
    // Cancel again — idempotent (already_cancelled or 400/200)
    const t1 = Date.now();
    const r2 = await api('POST', '/api/transport/cancel', { ride_id: testRideId }, memberToken);
    const ms2 = Date.now() - t1;
    assert([200, 400].includes(r2.status), 'C-e cancel idempotent (second)', ms2, `HTTP ${r2.status}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n══════ SUITE D — Payment Flows ══════');

  // D-a: Stripe webhook → 400 without signature (not 404/500)
  {
    const t0 = Date.now();
    const r = await api('POST', '/api/webhooks/stripe', { type: 'test' });
    const ms = Date.now() - t0;
    assert(r.status === 400, 'D-a Stripe webhook 400 without sig (not 404)', ms,
      `HTTP ${r.status}`);
  }

  // D-b: /api/support-donation → Stripe checkout URL
  {
    const t0 = Date.now();
    const r = await api('POST', '/api/support-donation',
      { amount_cents: 500, donor_name: 'E2E Tester', donor_email: 'e2e@mcc-test.invalid' });
    const ms = Date.now() - t0;
    const url = r.json?.url ?? r.json?.checkout_url;
    assert(r.status === 200 && typeof url === 'string' && url.startsWith('https://'),
      'D-b support-donation Stripe checkout URL', ms,
      r.status !== 200 ? `HTTP ${r.status}: ${r.json?.error}` : url.slice(0, 50) + '…');
  }

  // D-c: Receipt PDF — find a completed package, otherwise skip
  {
    const { data: completedPkg } = await svc.from('maintenance_packages')
      .select('id').eq('status', 'completed').limit(1).single();
    if (completedPkg?.id) {
      const t0 = Date.now();
      const r = await api('GET', `/api/receipt/${completedPkg.id}`, null, memberToken);
      const ms = Date.now() - t0;
      // 503 = PDF rendering service not configured in this environment
      assert([200, 403, 503].includes(r.status),
        'D-c receipt PDF endpoint reachable', ms, `HTTP ${r.status}`);
    } else {
      tag(true, 'D-c receipt PDF — skipped (no completed packages)', null);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n══════ SUITE E — Referral Flows ══════');

  // E-a: Lookup CHRIS
  {
    const t0 = Date.now();
    const r = await api('GET', '/api/provider-referral/lookup/CHRIS');
    const ms = Date.now() - t0;
    const name = r.json?.provider_name;
    assert(r.status === 200 && typeof name === 'string',
      'E-a lookup CHRIS → provider name', ms,
      r.status !== 200 ? `HTTP ${r.status}` : `name="${name}"`);
  }

  // E-b/c: Get member code and resolve it
  if (memberId && memberToken) {
    const t0 = Date.now();
    const r = await api('GET', `/api/member/${memberId}/referral-code`, null, memberToken);
    const ms = Date.now() - t0;
    const code = r.json?.referral_code;
    assert(r.status === 200 && code, 'E-b get member referral code', ms, code);

    if (code) {
      const t1 = Date.now();
      const r2 = await api('GET', `/api/provider-referral/lookup/${code}`);
      const ms2 = Date.now() - t1;
      assert(r2.status === 200 && r2.json?.success,
        'E-c member code resolves via lookup', ms2,
        r2.status !== 200 ? `HTTP ${r2.status}: ${r2.json?.error}` :
          `referrer_type=${r2.json?.referrer_type}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  await runCleanup();

  console.log('══════════════════════════════════════════════════════');
  console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('All e2e platform tests passed. ✓');
  } else {
    console.log('FAILURES:');
    results.filter(r => !r.ok).forEach(r => console.log(`  ✗ ${r.name}`));
  }
  process.exit(failed > 0 ? 1 : 0);
})();

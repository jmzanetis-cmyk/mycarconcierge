#!/usr/bin/env node
'use strict';

// ────────────────────────────────────────────────────────────────────────────
// Transport lifecycle integration test
//
// Exercises the full member → driver ride lifecycle end-to-end against a real
// Supabase project. Stripe and external calls are stubbed so no real charges
// occur.
//
// Usage:
//   SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//     node scripts/test-transport-lifecycle.js
//
// Exit codes:  0 = all passed  |  1 = test failure(s)  |  2 = fatal setup error
// ────────────────────────────────────────────────────────────────────────────

const path   = require('path');
const Module = require('module');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

// Real service-role client for seeding, assertions, and cleanup.
const svc = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// ── Module stubs (set up BEFORE requiring any function files) ─────────────────
// Maps synthetic bearer token → user id so auth.getUser resolves locally.
const callerIdMap = {};

function makeInstrumentedClient(url, key, opts) {
  const real = createClient(url, key, opts);
  real.auth.getUser = async (token) => {
    const id = callerIdMap[token];
    if (!id) return { data: { user: null }, error: { message: 'stub: unknown token' } };
    return { data: { user: { id } }, error: null };
  };
  return real;
}

const origLoad = Module._load;
Module._load = function(request, parent, ...rest) {
  if (request === '@supabase/supabase-js') return { createClient: makeInstrumentedClient };
  if (request === 'stripe') {
    return () => ({
      customers:      { retrieve: async () => ({ invoice_settings: { default_payment_method: 'pm_stub' } }) },
      paymentMethods: { list: async () => ({ data: [{ id: 'pm_stub' }] }) },
      paymentIntents: {
        create:  async (o) => ({ id: `pi_stub_${Date.now()}`, status: 'requires_capture', ...o }),
        capture: async (id) => ({ id, status: 'succeeded' }),
      },
      transfers: { create: async (o) => ({ id: `tr_stub_${Date.now()}`, ...o }) },
    });
  }
  return origLoad.call(this, request, parent, ...rest);
};

process.env.SUPABASE_URL              = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_KEY;
process.env.STRIPE_SECRET_KEY         = 'sk_stub';

const transportHandler = require(path.resolve(__dirname, '../netlify/functions/transport-request')).handler;
const driverHandler     = require(path.resolve(__dirname, '../netlify/functions/driver-api')).handler;

// ── Harness ───────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];

async function test(name, fn) {
  try   { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    ${err.message}`); failed++; failures.push(name); }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

async function safeDelete(query) {
  try { await query; } catch { /* non-fatal */ }
}

// ── Event builders ────────────────────────────────────────────────────────────
let seedMemberId, seedDriverProfileId;

function memberEvent(method, subpath, body) {
  const token = `tok_member_${seedMemberId}`;
  callerIdMap[token] = seedMemberId;
  return {
    httpMethod: method,
    path: subpath ? `/api/transport/${subpath}` : '/api/transport',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : null,
    queryStringParameters: {},
  };
}

function driverEvent(method, subpath, body) {
  const token = `tok_driver_${seedDriverProfileId}`;
  callerIdMap[token] = seedDriverProfileId;
  return {
    httpMethod: method,
    path: `/api/driver/v1/${subpath}`,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : null,
    queryStringParameters: {},
  };
}

// ── Seed / cleanup ────────────────────────────────────────────────────────────
const TEST_TAG = '__transport_lifecycle_test__';
let seedDriverRowId = null;
const createdRideIds = [];

async function preclean() {
  async function sd(q) { try { await q; } catch {} }
  try {
    const { data: listData } = await svc.auth.admin.listUsers({ perPage: 1000 });
    const testUsers = (listData?.users || []).filter(u => u.email?.includes(TEST_TAG));
    for (const u of testUsers) {
      const { data: rides } = await svc.from('rides').select('id').eq('member_id', u.id);
      for (const r of (rides || [])) {
        await sd(svc.from('ride_ratings').delete().eq('ride_id', r.id));
        await sd(svc.from('driver_assignments').delete().eq('ride_id', r.id));
        await sd(svc.from('rides').delete().eq('id', r.id));
      }
      await sd(svc.from('drivers').delete().eq('profile_id', u.id));
      await sd(svc.from('profiles').delete().eq('id', u.id));
      await svc.auth.admin.deleteUser(u.id).catch(() => {});
    }
  } catch (e) { console.warn('  preclean warning:', e.message); }
}

async function seed() {
  const { data: mData, error: mErr } = await svc.auth.admin.createUser({
    email: `${TEST_TAG}member@test.invalid`, password: 'TestPass123!', email_confirm: true,
  });
  if (mErr || !mData?.user?.id) throw new Error('member auth create: ' + mErr?.message);
  seedMemberId = mData.user.id;
  await svc.from('profiles').upsert({ id: seedMemberId, email: `${TEST_TAG}member@test.invalid`, role: 'member', full_name: 'Lifecycle Test Member', stripe_customer_id: 'cus_stub' });

  const { data: dData, error: dErr } = await svc.auth.admin.createUser({
    email: `${TEST_TAG}driver@test.invalid`, password: 'TestPass123!', email_confirm: true,
  });
  if (dErr || !dData?.user?.id) throw new Error('driver auth create: ' + dErr?.message);
  seedDriverProfileId = dData.user.id;
  await svc.from('profiles').upsert({ id: seedDriverProfileId, email: `${TEST_TAG}driver@test.invalid`, role: 'provider', full_name: 'Lifecycle Test Driver' });

  const { data: drRow, error: drErr } = await svc.from('drivers').insert({
    profile_id: seedDriverProfileId, full_name: 'Lifecycle Test Driver',
    email: `${TEST_TAG}driver@test.invalid`, phone: '+19990000001',
    status: 'active', stripe_connect_account_id: 'acct_stub',
    stripe_payouts_enabled: true, vehicle_class: ['sedan'],
  }).select('id').single();
  if (drErr || !drRow) throw new Error('driver row insert: ' + drErr?.message);
  seedDriverRowId = drRow.id;

  console.log(`  member=${seedMemberId.slice(0,8)} driver_profile=${seedDriverProfileId.slice(0,8)} driver_row=${seedDriverRowId.slice(0,8)}`);
}

async function cleanup() {
  for (const id of createdRideIds) {
    await safeDelete(svc.from('ride_ratings').delete().eq('ride_id', id));
    await safeDelete(svc.from('driver_assignments').delete().eq('ride_id', id));
    await safeDelete(svc.from('rides').delete().eq('id', id));
  }
  if (seedDriverRowId)     await safeDelete(svc.from('drivers').delete().eq('id', seedDriverRowId));
  if (seedMemberId)        { await safeDelete(svc.from('profiles').delete().eq('id', seedMemberId)); await svc.auth.admin.deleteUser(seedMemberId).catch(() => {}); }
  if (seedDriverProfileId) { await safeDelete(svc.from('profiles').delete().eq('id', seedDriverProfileId)); await svc.auth.admin.deleteUser(seedDriverProfileId).catch(() => {}); }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function rideStatus(rideId) {
  const { data } = await svc.from('rides').select('status, completed_at, cancelled_at').eq('id', rideId).single();
  return data;
}

// Create ride via member API (starts as 'requested')
async function createRide() {
  const resp = await transportHandler(memberEvent('POST', '', {
    pickup_address: '123 Test St, Newark, NJ', pickup_lat: 40.7357, pickup_lng: -74.1724,
    dropoff_address: '456 End Ave, Newark, NJ', dropoff_lat: 40.7282, dropoff_lng: -74.1646,
    estimated_distance_miles: 3, is_asap: true,
  }));
  assert(resp.statusCode === 201, `createRide expected 201, got ${resp.statusCode}: ${resp.body}`);
  const body = JSON.parse(resp.body);
  assert(body.ride?.id, 'response missing ride.id');
  createdRideIds.push(body.ride.id);
  return body.ride.id;
}

// Dispatch: advance ride to driver_assigned and create a pending assignment.
// Simulates admin/dispatch system — no Netlify function owns this step yet.
async function dispatchRide(rideId) {
  // requested → driver_assigned (allowed by trigger after migration)
  const { error: stErr } = await svc.from('rides').update({ status: 'driver_assigned' }).eq('id', rideId);
  assert(!stErr, `dispatch status update: ${stErr?.message}`);

  const { data: a, error: aErr } = await svc.from('driver_assignments').insert({
    driver_id: seedDriverRowId, ride_id: rideId, status: 'pending', role: 'primary',
  }).select('id').single();
  assert(!aErr && a?.id, `driver_assignments insert: ${aErr?.message}`);
  return a.id;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Transport lifecycle integration test');
  console.log(`Supabase: ${SUPABASE_URL.replace(/^https?:\/\//, '').slice(0, 42)}…`);
  console.log('');

  await preclean();
  console.log('Seeding test data…');
  try { await seed(); } catch (err) {
    console.error('Seed failed:', err.message);
    await cleanup().catch(() => {});
    process.exit(2);
  }
  console.log('');

  try {
    // ── 1. Member creates ride ────────────────────────────────────────────
    console.log('1. Member ride creation');
    let rideId;

    await test('member creates ride via API → status=requested, fare=$35', async () => {
      rideId = await createRide();
      const ride = await rideStatus(rideId);
      assert(ride.status === 'requested', `expected requested, got ${ride.status}`);
      const { data: r } = await svc.from('rides').select('estimated_fare, member_id').eq('id', rideId).single();
      assert(r.estimated_fare === 35, `expected fare=35, got ${r.estimated_fare}`);
      assert(r.member_id === seedMemberId, 'member_id mismatch');
    });

    await test('duplicate request without address → 400', async () => {
      const resp = await transportHandler(memberEvent('POST', '', { dropoff_address: 'somewhere' }));
      assert(resp.statusCode === 400, `expected 400, got ${resp.statusCode}`);
    });

    // ── 2. Full driver lifecycle ──────────────────────────────────────────
    console.log('');
    console.log('2. Full driver lifecycle');
    let assignmentId;

    await test('dispatch assigns driver → requested→driver_assigned, assignment created', async () => {
      assignmentId = await dispatchRide(rideId);
      assert((await rideStatus(rideId)).status === 'driver_assigned', 'status not driver_assigned');
    });

    await test('driver accepts → status=driver_accepted', async () => {
      const resp = await driverHandler(driverEvent('POST', `transport-rides/${assignmentId}/accept`, {}));
      assert(resp.statusCode === 200, `expected 200, got ${resp.statusCode}: ${resp.body}`);
      assert((await rideStatus(rideId)).status === 'driver_accepted', 'status not driver_accepted');
    });

    // ── 3. Idempotency (accept only — must test while assignment is 'accepted') ──
    console.log('');
    console.log('3. Idempotency');

    await test('accept is idempotent (already_accepted=true on repeat)', async () => {
      const resp = await driverHandler(driverEvent('POST', `transport-rides/${assignmentId}/accept`, {}));
      assert(resp.statusCode === 200, `expected 200, got ${resp.statusCode}`);
      assert(JSON.parse(resp.body).already_accepted === true, 'expected already_accepted=true');
    });

    await test('driver goes en-route → status=driver_en_route', async () => {
      const resp = await driverHandler(driverEvent('POST', `transport-rides/${assignmentId}/en-route`, {}));
      assert(resp.statusCode === 200, `expected 200, got ${resp.statusCode}: ${resp.body}`);
      assert((await rideStatus(rideId)).status === 'driver_en_route', 'status not driver_en_route');
    });

    await test('driver arrives → status=driver_arrived', async () => {
      const resp = await driverHandler(driverEvent('POST', `transport-rides/${assignmentId}/arrive`, {}));
      assert(resp.statusCode === 200, `expected 200, got ${resp.statusCode}: ${resp.body}`);
      assert((await rideStatus(rideId)).status === 'driver_arrived', 'status not driver_arrived');
    });

    await test('driver starts ride → status=in_progress', async () => {
      const resp = await driverHandler(driverEvent('POST', `transport-rides/${assignmentId}/start`, {}));
      assert(resp.statusCode === 200, `expected 200, got ${resp.statusCode}: ${resp.body}`);
      assert((await rideStatus(rideId)).status === 'in_progress', 'status not in_progress');
    });

    await test('driver completes ride → status=completed, completed_at set', async () => {
      const resp = await driverHandler(driverEvent('POST', `transport-rides/${assignmentId}/complete`, {}));
      assert(resp.statusCode === 200, `expected 200, got ${resp.statusCode}: ${resp.body}`);
      const r = await rideStatus(rideId);
      assert(r.status === 'completed', `status not completed, got ${r.status}`);
      assert(r.completed_at, 'completed_at not set');
    });

    // complete idempotency tested after full lifecycle (assignment is 'completed')
    await test('complete is idempotent (already_completed=true on repeat)', async () => {
      const resp = await driverHandler(driverEvent('POST', `transport-rides/${assignmentId}/complete`, {}));
      assert(resp.statusCode === 200, `expected 200, got ${resp.statusCode}`);
      assert(JSON.parse(resp.body).already_completed === true, 'expected already_completed=true');
    });

    // ── 4. Rating ─────────────────────────────────────────────────────────
    console.log('');
    console.log('4. Rating');

    await test('member rates driver → ride_ratings row inserted with stars=5', async () => {
      const resp = await transportHandler(memberEvent('POST', 'rate', {
        ride_id: rideId, driver_id: seedDriverRowId, stars: 5, comment: 'Smooth test ride',
      }));
      assert(resp.statusCode === 201, `expected 201, got ${resp.statusCode}: ${resp.body}`);
      const { data: rating } = await svc.from('ride_ratings')
        .select('stars').eq('ride_id', rideId).eq('rater_id', seedMemberId).maybeSingle();
      assert(rating?.stars === 5, `expected stars=5, got ${rating?.stars}`);
    });

    // ── 5. Cancellation ───────────────────────────────────────────────────
    console.log('');
    console.log('5. Cancellation');

    await test('member cancels a requested ride → status=cancelled_member', async () => {
      const cancelRideId = await createRide();
      const resp = await transportHandler(memberEvent('POST', 'cancel', { ride_id: cancelRideId }));
      assert(resp.statusCode === 200, `expected 200, got ${resp.statusCode}: ${resp.body}`);
      assert((await rideStatus(cancelRideId)).status === 'cancelled_member', 'status not cancelled_member');
    });

    await test('cannot cancel an already-completed ride → 400', async () => {
      const resp = await transportHandler(memberEvent('POST', 'cancel', { ride_id: rideId }));
      assert(resp.statusCode === 400, `expected 400, got ${resp.statusCode}`);
    });

    // ── 6. Auth guards ────────────────────────────────────────────────────
    console.log('');
    console.log('6. Auth guards');

    await test('missing bearer token → 401', async () => {
      const resp = await transportHandler({
        httpMethod: 'POST', path: '/api/transport',
        headers: {}, body: JSON.stringify({ pickup_address: 'x', dropoff_address: 'y' }),
        queryStringParameters: {},
      });
      assert(resp.statusCode === 401, `expected 401, got ${resp.statusCode}`);
    });

    await test('driver accept without Stripe Connect → 400 NO_STRIPE_CONNECT', async () => {
      // Fresh auth user for the no-connect driver
      const { data: ncData, error: ncAuthErr } = await svc.auth.admin.createUser({
        email: `${TEST_TAG}noconnect@test.invalid`, password: 'TestPass123!', email_confirm: true,
      });
      assert(!ncAuthErr && ncData?.user?.id, 'no-connect auth create: ' + ncAuthErr?.message);
      const ncProfileId = ncData.user.id;

      await svc.from('profiles').upsert({ id: ncProfileId, email: `${TEST_TAG}noconnect@test.invalid`, role: 'provider', full_name: 'No Connect' });
      const { data: ncDriver, error: ncDrvErr } = await svc.from('drivers').insert({
        profile_id: ncProfileId, full_name: 'No Connect', email: `${TEST_TAG}noconnect@test.invalid`,
        phone: '+19990000002', status: 'active', stripe_connect_account_id: null,
        stripe_payouts_enabled: false, vehicle_class: ['sedan'],
      }).select('id').single();
      assert(!ncDrvErr && ncDriver, 'no-connect driver insert: ' + ncDrvErr?.message);

      // Create a valid ride via the member API, then create a bare assignment for ncDriver.
      // The Connect check fires before any assignment-status check, so ride status doesn't matter.
      const ncRideId = await createRide();
      const { data: ncRide } = await svc.from('rides').select('id').eq('id', ncRideId).single();
      assert(ncRide, 'no-connect ride lookup failed');

      const { data: ncAssign, error: ncAssignErr } = await svc.from('driver_assignments').insert({
        driver_id: ncDriver.id, ride_id: ncRideId, status: 'pending', role: 'primary',
      }).select('id').single();
      assert(!ncAssignErr && ncAssign, 'no-connect assignment insert: ' + ncAssignErr?.message);

      callerIdMap[`tok_driver_${ncProfileId}`] = ncProfileId;
      const resp = await driverHandler({
        httpMethod: 'POST', path: `/api/driver/v1/transport-rides/${ncAssign.id}/accept`,
        headers: { authorization: `Bearer tok_driver_${ncProfileId}`, 'content-type': 'application/json' },
        body: '{}', queryStringParameters: {},
      });

      // Cleanup inline (before assert so it always runs)
      await safeDelete(svc.from('driver_assignments').delete().eq('id', ncAssign.id));
      await safeDelete(svc.from('drivers').delete().eq('id', ncDriver.id));
      await safeDelete(svc.from('profiles').delete().eq('id', ncProfileId));
      await svc.auth.admin.deleteUser(ncProfileId).catch(() => {});

      assert(resp.statusCode === 400, `expected 400, got ${resp.statusCode}: ${resp.body}`);
      assert(JSON.parse(resp.body).error?.code === 'NO_STRIPE_CONNECT', `expected NO_STRIPE_CONNECT, got: ${resp.body}`);
    });

    // ── 7. State-machine guards ───────────────────────────────────────────
    console.log('');
    console.log('7. State-machine guards');

    await test('out-of-order driver transition (arrive on completed assignment) → 409', async () => {
      const resp = await driverHandler(driverEvent('POST', `transport-rides/${assignmentId}/arrive`, {}));
      assert(resp.statusCode === 409, `expected 409, got ${resp.statusCode}: ${resp.body}`);
    });

    await test("cancel another member's ride → 403", async () => {
      const { data: m2, error: m2Err } = await svc.auth.admin.createUser({
        email: `${TEST_TAG}member2@test.invalid`, password: 'TestPass123!', email_confirm: true,
      });
      assert(!m2Err && m2?.user?.id, 'member2 create: ' + m2Err?.message);
      const m2Id = m2.user.id;
      await svc.from('profiles').upsert({ id: m2Id, email: `${TEST_TAG}member2@test.invalid`, role: 'member', full_name: 'Test Member 2' });
      callerIdMap[`tok_member_${m2Id}`] = m2Id;

      const resp = await transportHandler({
        httpMethod: 'POST', path: '/api/transport/cancel',
        headers: { authorization: `Bearer tok_member_${m2Id}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ride_id: rideId }), queryStringParameters: {},
      });

      await safeDelete(svc.from('profiles').delete().eq('id', m2Id));
      await svc.auth.admin.deleteUser(m2Id).catch(() => {});

      assert(resp.statusCode === 403, `expected 403, got ${resp.statusCode}: ${resp.body}`);
    });

  } finally {
    console.log('');
    console.log('Cleaning up test data…');
    await cleanup().catch(e => console.warn('  cleanup warning:', e.message));
  }

  console.log('');
  console.log('─'.repeat(50));
  console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.error('\nFailed:');
    for (const name of failures) console.error(`  ✗ ${name}`);
    process.exit(1);
  }
  console.log('All transport lifecycle tests passed.');
}

main().catch(err => { console.error('Fatal:', err.stack || err.message); process.exit(2); });

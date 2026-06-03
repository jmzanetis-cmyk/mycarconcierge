#!/usr/bin/env node
/**
 * scripts/rls-cross-user-test.mjs
 *
 * RLS cross-user isolation smoke test.
 *
 * Creates temporary test users (member-A, member-B, provider), seeds data
 * owned by member-A, then asserts via the PostgREST layer that:
 *   - anon cannot read any of it
 *   - member-B cannot read any of it
 *   - an unapproved provider cannot read member-A's private rows
 *   - each party CAN read rows they legitimately own
 *
 * Covers: vehicles, maintenance_packages, notifications, bids, messages,
 *         payments, profiles, concierge_jobs, custody_handoffs
 *
 * All test data is deleted (including the auth users) in the finally block.
 * Safe to run against production — creates clearly-tagged transient rows.
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ANON_KEY
 *
 * Run:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... \
 *     node scripts/rls-cross-user-test.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY     = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error('Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY');
  process.exit(2);
}

const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ── test harness ──────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
const failures = [];

async function run(label, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓  ${label}`);
  } catch (e) {
    failed++;
    failures.push({ label, reason: e.message });
    console.error(`  ✗  ${label}`);
    console.error(`       ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ── fixture identifiers ───────────────────────────────────────────────────────

const TS  = Date.now();
const TAG = `rls-iso-${TS}`;

const MEMBER_A_EMAIL = `member-a-${TAG}@test.invalid`;
const MEMBER_B_EMAIL = `member-b-${TAG}@test.invalid`;
const PROVIDER_EMAIL = `provider-${TAG}@test.invalid`;
const TEST_PASS      = `RlsIso!${TS}`;

let memberAId, memberBId, providerId;
const createdUserIds = [];
// Deletion queue — newest first (unshift on insert) gives FK-safe delete order.
const toDelete = [];

// ── client helpers ────────────────────────────────────────────────────────────

function asUser(accessToken) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function asAnon() {
  return createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
}

async function signIn(email) {
  const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: TEST_PASS });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return data.session.access_token;
}

// ── fixture helpers ───────────────────────────────────────────────────────────

async function createTestUser(email) {
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: TEST_PASS,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  createdUserIds.push(data.user.id);
  return data.user.id;
}

async function svcInsert(table, row) {
  const { data, error } = await svc.from(table).insert(row).select('id').single();
  if (error) throw new Error(`seed ${table}: ${error.message}`);
  toDelete.unshift({ table, id: data.id });
  return data.id;
}

// ── setup ─────────────────────────────────────────────────────────────────────

async function setup() {
  console.log('\nCreating test users…');

  memberAId  = await createTestUser(MEMBER_A_EMAIL);
  memberBId  = await createTestUser(MEMBER_B_EMAIL);
  providerId = await createTestUser(PROVIDER_EMAIL);

  for (const [id, email, role] of [
    [memberAId,  MEMBER_A_EMAIL, 'member'],
    [memberBId,  MEMBER_B_EMAIL, 'member'],
    [providerId, PROVIDER_EMAIL, 'provider'],
  ]) {
    const { error } = await svc
      .from('profiles')
      .upsert({ id, email, full_name: `Test ${role} ${TAG}`, role }, { onConflict: 'id' });
    if (error) throw new Error(`upsert profile(${email}): ${error.message}`);
  }

  console.log('Seeding member-A data…');

  // Vehicle
  const vehicleId = await svcInsert('vehicles', {
    owner_id: memberAId,
    make: 'RLS-Test', model: 'Isolation', year: 2020,
  });

  // Maintenance package (open — activates mp_select_open_provider for approved providers)
  const packageId = await svcInsert('maintenance_packages', {
    member_id: memberAId,
    title: `RLS Test Package ${TAG}`,
    status: 'open',
    frequency: 'one_time',
  });

  // Notification
  const notifId = await svcInsert('notifications', {
    user_id: memberAId,
    type: 'system',
    title: `RLS Test Notif ${TAG}`,
    message: 'isolation test',
  });

  // Bid from provider on member-A's package (pending — bid NOT accepted)
  const bidId = await svcInsert('bids', {
    package_id: packageId,
    provider_id: providerId,
    price: 99.00,
  });

  // Message from member-A to provider
  const msgId = await svcInsert('messages', {
    package_id: packageId,
    sender_id:    memberAId,
    recipient_id: providerId,
    content: `RLS test message ${TAG}`,
  });

  // Payment (held, member-A paid provider via service)
  const paymentId = await svcInsert('payments', {
    package_id:   packageId,
    member_id:    memberAId,
    provider_id:  providerId,
    bid_id:       bidId,
    amount_total: 99.00,
    status: 'held',
  });

  // Concierge job (member-A + provider, no driver yet).
  // package_id must be set so the bid_accepted_create_concierge_job trigger's
  // ON CONFLICT (package_id) clause updates this row in-place when we accept
  // the bid in the positive-test section, instead of inserting a second job
  // that would be missing from toDelete and block teardown.
  const jobId = await svcInsert('concierge_jobs', {
    member_id:   memberAId,
    provider_id: providerId,
    package_id:  packageId,
    tier: 1, scenario: 1,
    status: 'draft',
    total_price_cents: 0,
  });

  // Custody handoff on that job (member→provider leg, no driver involved)
  const handoffId = await svcInsert('custody_handoffs', {
    job_id: jobId,
    sequence: 1,
    leg: 'member_to_provider',
    releasing_party_id:   memberAId,
    releasing_party_role: 'member',
    receiving_party_id:   providerId,
    receiving_party_role: 'provider',
  });

  console.log(`  member-A:  ${memberAId}`);
  console.log(`  member-B:  ${memberBId}`);
  console.log(`  provider:  ${providerId}`);
  console.log(`  vehicle:   ${vehicleId}`);
  console.log(`  package:   ${packageId}`);
  console.log(`  notif:     ${notifId}`);
  console.log(`  bid:       ${bidId}`);
  console.log(`  message:   ${msgId}`);
  console.log(`  payment:   ${paymentId}`);
  console.log(`  job:       ${jobId}`);
  console.log(`  handoff:   ${handoffId}`);

  return { vehicleId, packageId, notifId, bidId, msgId, paymentId, jobId, handoffId };
}

// ── teardown ──────────────────────────────────────────────────────────────────

async function teardown() {
  console.log('\nTearing down…');
  // NULL out maintenance_packages.accepted_bid_id before deleting bids,
  // otherwise the FK (fk_accepted_bid) blocks bid deletion.
  for (const { table, id } of toDelete) {
    if (table === 'bids') {
      await svc.from('maintenance_packages').update({ accepted_bid_id: null }).eq('accepted_bid_id', id);
    }
  }
  for (const { table, id } of toDelete) {
    const { error } = await svc.from(table).delete().eq('id', id);
    if (error) console.warn(`  warn: cleanup ${table}/${id}: ${error.message}`);
  }
  for (const uid of createdUserIds) {
    await svc.from('profiles').delete().eq('id', uid);
    const { error } = await svc.auth.admin.deleteUser(uid);
    if (error) console.warn(`  warn: deleteUser ${uid}: ${error.message}`);
  }
  console.log('  done.');
}

// ── test helpers ──────────────────────────────────────────────────────────────

async function assertBlocked(label, client, table, id) {
  await run(label, async () => {
    const { data, error } = await client.from(table).select('id').eq('id', id);
    if (error) return; // PostgREST error = RLS blocked = pass
    assert(!data || data.length === 0,
      `${table}/${id} returned ${data.length} row(s) — expected 0 (blocked)`);
  });
}

async function assertReadable(label, client, table, id) {
  await run(label, async () => {
    const { data, error } = await client.from(table).select('id').eq('id', id);
    assert(!error, `unexpected error: ${error?.message}`);
    assert(data && data.length === 1,
      `expected 1 row for ${table}/${id}, got ${data?.length ?? 'null'}`);
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────

async function runTests(ids) {
  const { vehicleId, packageId, notifId, bidId, msgId, paymentId, jobId, handoffId } = ids;

  const [memberAToken, memberBToken, providerToken] = await Promise.all([
    signIn(MEMBER_A_EMAIL),
    signIn(MEMBER_B_EMAIL),
    signIn(PROVIDER_EMAIL),
  ]);

  const memberA  = asUser(memberAToken);
  const memberB  = asUser(memberBToken);
  const provider = asUser(providerToken);
  const anon     = asAnon();

  // ── Anon ──────────────────────────────────────────────────────────────────
  console.log('\n--- anon: cannot read any member-A data ---');
  await assertBlocked('anon → vehicles',             anon, 'vehicles',             vehicleId);
  await assertBlocked('anon → maintenance_packages', anon, 'maintenance_packages', packageId);
  await assertBlocked('anon → notifications',        anon, 'notifications',        notifId);
  await assertBlocked('anon → bids',                 anon, 'bids',                 bidId);
  await assertBlocked('anon → messages',             anon, 'messages',             msgId);
  await assertBlocked('anon → payments',             anon, 'payments',             paymentId);
  await assertBlocked('anon → profiles',             anon, 'profiles',             memberAId);
  await assertBlocked('anon → concierge_jobs',       anon, 'concierge_jobs',       jobId);
  await assertBlocked('anon → custody_handoffs',     anon, 'custody_handoffs',     handoffId);

  // ── Member-B cannot read member-A's data ──────────────────────────────────
  console.log('\n--- member-B: cannot read member-A data ---');
  await assertBlocked('member-B → vehicles',                memberB, 'vehicles',             vehicleId);
  await assertBlocked('member-B → maintenance_packages',    memberB, 'maintenance_packages', packageId);
  await assertBlocked('member-B → notifications',           memberB, 'notifications',        notifId);
  await assertBlocked('member-B → bids on A\'s package',   memberB, 'bids',                 bidId);
  await assertBlocked('member-B → messages A↔provider',    memberB, 'messages',             msgId);
  await assertBlocked('member-B → payments',                memberB, 'payments',             paymentId);
  // profiles: no accepted bid between B and A, so counterparty policy doesn't apply
  await assertBlocked('member-B → profile-A (no shared job)', memberB, 'profiles',          memberAId);
  await assertBlocked('member-B → concierge_jobs',          memberB, 'concierge_jobs',       jobId);
  await assertBlocked('member-B → custody_handoffs',        memberB, 'custody_handoffs',     handoffId);

  // ── Provider (unapproved, bid still pending) ──────────────────────────────
  console.log('\n--- provider (unapproved, bid pending): isolation ---');
  // packages: mp_select_open_provider requires approved provider_application — not present here
  await assertBlocked('provider → maintenance_packages (no approved app)', provider, 'maintenance_packages', packageId);
  await assertBlocked('provider → notifications',    provider, 'notifications', notifId);
  await assertBlocked('provider → vehicles',         provider, 'vehicles',      vehicleId);
  await assertBlocked('provider → payments',         provider, 'payments',      paymentId);
  // profiles: counterparty policy requires accepted bid; bid is still pending
  await assertBlocked('provider → profile-A (bid pending)', provider, 'profiles', memberAId);
  // concierge_jobs: only member + driver policy exists; provider reads via service_role endpoint
  await assertBlocked('provider → concierge_jobs (no direct policy)', provider, 'concierge_jobs', jobId);

  // Accept the bid via service_role before the positive section.
  // Isolation tests above rely on the bid being pending; the positive tests
  // for provider-readable payments require an accepted bid (per the new policy).
  await svc.from('bids').update({ status: 'accepted' }).eq('id', bidId);
  await svc.from('maintenance_packages').update({ accepted_bid_id: bidId, status: 'accepted' }).eq('id', packageId);

  // ── Positive: each party can see their own data ───────────────────────────
  console.log('\n--- positive: own-data access ---');
  await assertReadable('member-A → own vehicle',               memberA, 'vehicles',             vehicleId);
  await assertReadable('member-A → own package',               memberA, 'maintenance_packages', packageId);
  await assertReadable('member-A → own notification',          memberA, 'notifications',        notifId);
  await assertReadable('member-A → bid on own package',        memberA, 'bids',                 bidId);
  await assertReadable('member-A → own message (sent)',        memberA, 'messages',             msgId);
  await assertReadable('member-A → own payment',               memberA, 'payments',             paymentId);
  await assertReadable('member-A → own profile',               memberA, 'profiles',             memberAId);
  await assertReadable('member-A → own concierge_job',         memberA, 'concierge_jobs',       jobId);
  await assertReadable('member-A → own custody_handoff',       memberA, 'custody_handoffs',     handoffId);

  // Provider reads rows they legitimately own
  await assertReadable('provider → own bid',                   provider, 'bids',     bidId);
  await assertReadable('provider → received message',          provider, 'messages', msgId);
  await assertReadable('provider → payment (as provider)',     provider, 'payments', paymentId);
  // Provider is a party to the handoff (receiving_party_id = providerId)
  await assertReadable('provider → custody_handoff (is party)', provider, 'custody_handoffs', handoffId);

  // Member-B can see their OWN profile but not A's
  await assertReadable('member-B → own profile',               memberB, 'profiles', memberBId);
}

// ── main ──────────────────────────────────────────────────────────────────────

let ids;
try {
  ids = await setup();
  await runTests(ids);
} catch (e) {
  console.error('\nFatal error:', e.message);
  failed++;
} finally {
  await teardown();
}

const total = passed + failed;
console.log(`\n${total} tests: ${passed} passed, ${failed} failed`);

if (failures.length) {
  console.log('\nFailures:');
  for (const { label, reason } of failures) {
    console.log(`  ✗  ${label}`);
    console.log(`       ${reason}`);
  }
}

process.exit(failed > 0 ? 1 : 0);

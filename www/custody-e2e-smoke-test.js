#!/usr/bin/env node
'use strict';

// custody-e2e-smoke-test.js
//
// The Phase 2 go-live gate: drives the FULL custody chain cycle against the
// REAL deployed production API (https://www.mycarconcierge.com/api/custody/*),
// using two real Supabase auth accounts from the existing sim-account pool
// (the same @mcc-sim.test pool the car-club stress-test scripts already use),
// with the custody_chain_enabled flag scoped to just those two test accounts
// (never flipped globally). Not a load test — a single, careful walk through
// both the accept path and the dispute path, verifying real HTTP responses
// AND real DB state after each step, then cleaning up its own test data.
//
// Requires SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment
// (loaded from .env by the caller) and MCC_APP_URL for the API base.
//
// Usage: node custody-e2e-smoke-test.js
//
// Exit code 0 = every check passed. Non-zero = at least one failed (see
// output for which). Cleans up its own test rows in a finally block
// regardless of outcome; does NOT remove the sim accounts from
// custody_chain_enabled.test_users (mirrors the Car Club pilot pattern —
// leaving the sim pool custody-enabled is harmless and keeps it usable for
// future runs of this same script).

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ifbyjxuaclwmadqbjcyp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = (process.env.MCC_APP_URL || 'https://www.mycarconcierge.com').replace(/\/+$/, '');

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const SIM_DOMAIN = '@mcc-sim.test';
const SIM_PASSWORD = 'SimPass123!';
const TAG = 'CUSTODY_E2E_SMOKE_TEST ' + new Date().toISOString();

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

let failures = 0;
function check(label, cond, extra) {
  const line = (cond ? 'PASS' : 'FAIL') + ' — ' + label + (extra ? '  (' + extra + ')' : '');
  console.log(line);
  if (!cond) failures++;
  return cond;
}

async function getSession(email) {
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: SIM_PASSWORD });
  if (error || !data || !data.session) return null;
  return { token: data.session.access_token, userId: data.user.id, email };
}

async function api(path, token, body) {
  const method = body === undefined ? 'GET' : 'POST';
  const res = await fetch(API_BASE + path, {
    method,
    headers: Object.assign(
      { 'Content-Type': 'application/json' },
      token ? { Authorization: 'Bearer ' + token } : {}
    ),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* non-JSON response */ }
  return { status: res.status, ok: res.ok, body: json };
}

// GoTrue's admin listUsers endpoint ("Database error finding users", 500)
// has been flaky on this project regardless of page size — perPage:10 both
// succeeded (standalone) and failed twice in a row (through this script) on
// 2026-09-09, with no clear correlation to perPage. So this isn't a clean
// "oversized page" story; it looks like an intermittent upstream issue, and
// the practical mitigation is retrying past it, not tuning a page size.
const LIST_USERS_PAGE_SIZE = 10;
const LIST_USERS_MAX_PAGES = 20; // safety cap so a pagination bug can't loop forever

async function withRetry(fn, label, attempts, delayMs) {
  attempts = attempts || 4;
  delayMs = delayMs || 2000;
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      console.log('  [' + label + '] attempt ' + i + '/' + attempts + ' failed: ' + (e && e.message || e) + (i < attempts ? ' — retrying in ' + delayMs + 'ms' : ''));
      if (i < attempts) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

// GoTrue's admin listUsers endpoint ("Database error finding users", 500) is
// confirmed BROKEN on this project as of 2026-09-09 — not flaky/transient:
// it failed 4/4 retry attempts with backoff, at multiple page sizes (10, 50,
// 1000). Rather than keep depending on a broken endpoint, this accepts the
// member/provider account explicitly via env vars (get them with SQL —
// SELECT id, email FROM auth.users WHERE email LIKE 'sim-member-%@mcc-sim.test'
// LIMIT 1; — same for sim-provider-%), and only falls back to the
// listUsers-based auto-discovery if those aren't provided, in case the
// endpoint recovers later.
async function pickSimAccounts() {
  const envMember   = { id: process.env.CUSTODY_TEST_MEMBER_ID,   email: process.env.CUSTODY_TEST_MEMBER_EMAIL };
  const envProvider = { id: process.env.CUSTODY_TEST_PROVIDER_ID, email: process.env.CUSTODY_TEST_PROVIDER_EMAIL };
  if (envMember.id && envMember.email && envProvider.id && envProvider.email) {
    console.log('  using member/provider accounts from CUSTODY_TEST_* env vars (skipping listUsers)');
    return { member: envMember, provider: envProvider };
  }

  const allUsers = [];
  let page = 1;
  for (; page <= LIST_USERS_MAX_PAGES; page++) {
    const { data, error } = await withRetry(
      () => supabaseAdmin.auth.admin.listUsers({ page, perPage: LIST_USERS_PAGE_SIZE }),
      'listUsers page ' + page
    );
    if (error) throw error;
    const users = (data && data.users) || [];
    allUsers.push(...users);
    if (!data || !data.nextPage || users.length === 0) break;
  }
  console.log('  fetched ' + allUsers.length + ' total users across ' + page + ' page(s) of ' + LIST_USERS_PAGE_SIZE);

  const simUsers = allUsers.filter(u => u.email && u.email.endsWith(SIM_DOMAIN));
  const member = simUsers.find(u => u.email.startsWith('sim-member-'));
  const provider = simUsers.find(u => u.email.startsWith('sim-provider-'));
  if (!member || !provider) {
    throw new Error('Could not find a sim-member-*/sim-provider-* account in the existing @mcc-sim.test pool. Run simulate-platform.js (or whatever seeded the Car Club sim pool) first.');
  }
  return { member, provider };
}

async function ensureCustodyFlagForTestUsers(userIds) {
  const existing = await supabaseAdmin
    .from('platform_settings')
    .select('setting_value')
    .eq('setting_key', 'custody_chain_enabled')
    .single();

  const currentVal = (existing.data && existing.data.setting_value) || { enabled: false, test_users: [] };
  const wasGloballyEnabled = currentVal.enabled === true;
  const users = Array.isArray(currentVal.test_users) ? currentVal.test_users.slice() : [];
  let changed = false;
  for (const id of userIds) {
    if (!users.includes(id)) { users.push(id); changed = true; }
  }
  if (changed) {
    const newVal = Object.assign({}, currentVal, { test_users: users });
    // NOTE: platform_settings.updated_by is a uuid column referencing a real
    // admin user (see netlify/functions/admin-data.js, admin-founders.js,
    // server.js — all pass a real user.id there). This script has no real
    // admin user acting, so we deliberately omit updated_by rather than
    // fabricate a UUID or pass a descriptive string (which previously threw
    // 22P02 "invalid input syntax for type uuid"). Omitting the key leaves
    // the column untouched, which is safe either way.
    const upd = await supabaseAdmin
      .from('platform_settings')
      .update({ setting_value: newVal, updated_at: new Date().toISOString() })
      .eq('setting_key', 'custody_chain_enabled');
    if (upd.error) throw upd.error;
  }
  return { wasGloballyEnabled, alreadyHadTestUsers: !changed };
}

async function createTestJob(memberId, providerId) {
  const ins = await supabaseAdmin.from('concierge_jobs').insert({
    member_id: memberId,
    provider_id: providerId,
    tier: 1,
    scenario: 1,
    status: 'scheduled',
    notes: TAG
  }).select().single();
  if (ins.error) throw ins.error;
  return ins.data;
}

async function main() {
  console.log('=== Custody chain E2E smoke test — ' + API_BASE + ' ===\n');

  console.log('--- setup ---');
  const { member, provider } = await pickSimAccounts();
  console.log('  member:   ' + member.email + '  (' + member.id + ')');
  console.log('  provider: ' + provider.email + '  (' + provider.id + ')');

  const flagInfo = await ensureCustodyFlagForTestUsers([member.id, provider.id]);
  check('custody_chain_enabled is NOT globally enabled (scoped to test accounts only)', !flagInfo.wasGloballyEnabled);
  console.log('  custody_chain_enabled.test_users now includes both sim accounts' +
    (flagInfo.alreadyHadTestUsers ? ' (already did)' : ' (added)'));

  const memberSession = await getSession(member.email);
  const providerSession = await getSession(provider.email);
  check('member sim account authenticated', !!memberSession);
  check('provider sim account authenticated', !!providerSession);
  if (!memberSession || !providerSession) {
    throw new Error('Could not authenticate sim accounts — aborting before creating any test data.');
  }

  const job = await createTestJob(member.id, provider.id);
  console.log('  test concierge_job: ' + job.id + '  (tagged: "' + TAG + '")\n');

  const createdHandoffIds = [];
  let cleanupPermanentNote = '';

  try {
    // ── Cycle 1: member drop-off, provider ACCEPTS ──────────────────────────
    console.log('--- cycle 1: member_to_provider drop-off, provider accepts ---');

    const create1 = await api('/api/custody/handoffs', memberSession.token, {
      job_id: job.id,
      leg: 'member_to_provider',
      releasing_party_role: 'member',
      receiving_party_id: provider.id,
      receiving_party_role: 'provider'
    });
    check('POST /handoffs (member creates member_to_provider) → 200', create1.status === 200, 'got ' + create1.status);
    const handoff1Id = create1.body && create1.body.handoff && create1.body.handoff.id;
    check('handoff 1 created with status=pending', create1.body && create1.body.handoff && create1.body.handoff.status === 'pending');
    if (handoff1Id) createdHandoffIds.push(handoff1Id);

    const release1 = await api('/api/custody/handoffs/' + handoff1Id + '/release', memberSession.token, { lat: 30.2672, lng: -97.7431 });
    check('POST /handoffs/:id/release (member releases) → 200', release1.status === 200, 'got ' + release1.status);
    check('release response status=awaiting_receiver', release1.body && release1.body.status === 'awaiting_receiver');

    // Negative check: the RELEASING party (member) should not be able to accept their own handoff.
    const selfAccept = await api('/api/custody/handoffs/' + handoff1Id + '/accept', memberSession.token, { notes: 'should be rejected' });
    check('member cannot accept their own released handoff → 403', selfAccept.status === 403, 'got ' + selfAccept.status);

    const accept1 = await api('/api/custody/handoffs/' + handoff1Id + '/accept', providerSession.token, { notes: 'looks good, e2e smoke test' });
    check('POST /handoffs/:id/accept (provider accepts) → 200', accept1.status === 200, 'got ' + accept1.status);
    check('accept response status=accepted', accept1.body && accept1.body.status === 'accepted');

    const h1Row = await supabaseAdmin.from('custody_handoffs').select('*').eq('id', handoff1Id).single();
    check('DB: handoff 1 status=accepted', h1Row.data && h1Row.data.status === 'accepted');
    check('DB: handoff 1 received_at is set', h1Row.data && !!h1Row.data.received_at);

    const at1 = await supabaseAdmin.from('custody_attestations').select('*').eq('handoff_id', handoff1Id).order('created_at');
    const at1HasBoth = at1.data && at1.data.length === 2;
    check('DB: 2 attestations for handoff 1 (release + accept)', at1HasBoth, 'got ' + (at1.data ? at1.data.length : 'error'));
    check('DB: attestation types are [release, accept]', at1HasBoth && at1.data[0].type === 'release' && at1.data[1].type === 'accept');
    check('DB: accept attestation party_role=provider, condition_ok=true', at1HasBoth && at1.data[1].party_role === 'provider' && at1.data[1].condition_ok === true);

    console.log('');

    // ── Cycle 2: provider return, member DISPUTES ───────────────────────────
    console.log('--- cycle 2: provider_to_member return, member disputes ---');

    const create2 = await api('/api/custody/handoffs', providerSession.token, {
      job_id: job.id,
      leg: 'provider_to_member',
      releasing_party_role: 'provider',
      receiving_party_id: member.id,
      receiving_party_role: 'member'
    });
    check('POST /handoffs (provider creates provider_to_member) → 200', create2.status === 200, 'got ' + create2.status);
    const handoff2Id = create2.body && create2.body.handoff && create2.body.handoff.id;
    check('handoff 2 sequence=2 (after handoff 1)', create2.body && create2.body.handoff && create2.body.handoff.sequence === 2);
    if (handoff2Id) createdHandoffIds.push(handoff2Id);

    const release2 = await api('/api/custody/handoffs/' + handoff2Id + '/release', providerSession.token, {});
    check('POST /handoffs/:id/release (provider releases) → 200', release2.status === 200, 'got ' + release2.status);

    const dispute2 = await api('/api/custody/handoffs/' + handoff2Id + '/dispute', memberSession.token, {
      type: 'new_damage',
      description: 'e2e smoke test — scratch on rear bumper found at return'
    });
    check('POST /handoffs/:id/dispute (member disputes) → 200', dispute2.status === 200, 'got ' + dispute2.status);
    check('dispute response status=disputed with a dispute_id', dispute2.body && dispute2.body.status === 'disputed' && !!dispute2.body.dispute_id);

    const h2Row = await supabaseAdmin.from('custody_handoffs').select('*').eq('id', handoff2Id).single();
    check('DB: handoff 2 status=disputed', h2Row.data && h2Row.data.status === 'disputed');

    const disputeRow = await supabaseAdmin.from('custody_disputes').select('*').eq('handoff_id', handoff2Id).single();
    check('DB: dispute row created with type=new_damage', disputeRow.data && disputeRow.data.type === 'new_damage');
    check('DB: dispute correctly implicates the releasing party (provider)', disputeRow.data && disputeRow.data.implicated_party_id === provider.id && disputeRow.data.implicated_role === 'provider');
    check('DB: dispute raised_by is the member', disputeRow.data && disputeRow.data.raised_by === member.id);

    console.log('');

    // ── Full-chain read, as the UI would render it ──────────────────────────
    console.log('--- GET /jobs/:jobId (full chain, as the member/provider UI renders it) ---');
    const chain = await api('/api/custody/jobs/' + job.id, memberSession.token);
    check('GET /jobs/:jobId → 200', chain.status === 200, 'got ' + chain.status);
    check('chain response includes both handoffs', chain.body && Array.isArray(chain.body.handoffs) && chain.body.handoffs.length === 2, 'got ' + (chain.body && chain.body.handoffs ? chain.body.handoffs.length : 'n/a'));

    console.log('');

  } finally {
    console.log('--- cleanup ---');

    // custody_attestations and custody_photos are INTENTIONALLY append-only
    // ("the legal spine" — see 20260528_custody_chain_base_schema.sql,
    // section 7: IMMUTABILITY TRIGGERS). Any DELETE/UPDATE on them, direct
    // or cascaded, raises a custom exception (default SQLSTATE P0001). That
    // is correct, working-as-designed behavior for a real damage-liability
    // audit trail — not a bug in this script — but it means those rows,
    // and anything that would need to cascade-delete through them, can
    // never be cleaned up by a normal DELETE. We detect that specific
    // condition and report it as an informational note rather than an
    // error, and we still attempt every delete (rather than hardcoding
    // "skip attestations/handoffs/job" here) so cleanup automatically
    // starts fully succeeding again if the schema ever changes.
    const isAppendOnlyBlock = (err) =>
      !!err && (err.code === 'P0001' || /append-only/i.test(err.message || ''));

    const permanentlyRetained = [];

    if (createdHandoffIds.length) {
      const dd = await supabaseAdmin.from('custody_disputes').delete().in('handoff_id', createdHandoffIds);
      if (dd.error) {
        console.log('  custody_disputes: delete FAILED unexpectedly: ' + JSON.stringify(dd.error));
      } else {
        console.log('  deleted custody_disputes for ' + createdHandoffIds.length + ' test handoff(s)');
      }

      const da = await supabaseAdmin.from('custody_attestations').delete().in('handoff_id', createdHandoffIds);
      if (da.error && isAppendOnlyBlock(da.error)) {
        permanentlyRetained.push('custody_attestations');
      } else if (da.error) {
        console.log('  custody_attestations: delete FAILED unexpectedly: ' + JSON.stringify(da.error));
      } else {
        console.log('  deleted custody_attestations for ' + createdHandoffIds.length + ' test handoff(s)');
      }

      const dh = await supabaseAdmin.from('custody_handoffs').delete().in('id', createdHandoffIds);
      if (dh.error && isAppendOnlyBlock(dh.error)) {
        permanentlyRetained.push('custody_handoffs');
      } else if (dh.error) {
        console.log('  custody_handoffs: delete FAILED unexpectedly: ' + JSON.stringify(dh.error));
      } else {
        console.log('  deleted ' + createdHandoffIds.length + ' test custody_handoffs');
      }
    }

    const dj = await supabaseAdmin.from('concierge_jobs').delete().eq('id', job.id);
    if (dj.error && isAppendOnlyBlock(dj.error)) {
      permanentlyRetained.push('concierge_jobs');
    } else if (dj.error) {
      console.log('  concierge_jobs: delete FAILED unexpectedly: ' + JSON.stringify(dj.error));
    } else {
      console.log('  deleted test concierge_job ' + job.id);
    }

    if (permanentlyRetained.length) {
      cleanupPermanentNote =
        'NOTE (expected, not an error): ' + permanentlyRetained.join(', ') + ' could not be deleted. ' +
        'custody_attestations/custody_photos are intentionally append-only by design, which also blocks ' +
        'cascade-deleting their parent handoff/job rows. This run permanently left 1 tagged concierge_job, ' +
        'up to 2 custody_handoffs, and their attestations in production — harmless (sim accounts only), ' +
        'identifiable by notes = "' + TAG + '". Every future run of this script will do the same; there is ' +
        'no way to fully self-clean given the current schema.';
      console.log('  ' + cleanupPermanentNote);
    }

    console.log('  left custody_chain_enabled.test_users as-is (still includes the 2 sim accounts — harmless, matches the Car Club pilot pattern)');
  }

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  if (cleanupPermanentNote) {
    console.log('(cleanup left permanent test rows by design — see NOTE above)');
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => {
  console.error('THREW:', e && e.stack || e);
  process.exit(1);
});

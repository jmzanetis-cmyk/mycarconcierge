#!/usr/bin/env node
'use strict';

// custody-manual-walkthrough-setup.js
//
// One-time setup for a HUMAN-DRIVEN walkthrough of the custody chain UI —
// the one thing custody-e2e-smoke-test.js could NOT verify, since that
// script calls the API directly via fetch() and never touches the actual
// member/provider app screens, the photo-capture flow, or the new
// provider-side accept/dispute modal.
//
// This script does exactly two things against REAL production, then exits.
// It performs NO custody actions itself — every handoff/release/accept/
// dispute/photo-upload step is meant to be done by a real person clicking
// through the real app afterward.
//
//   1. Ensures custody_chain_enabled is scoped to the two sim test accounts
//      (idempotent — safe to re-run; reuses the same logic already verified
//      in custody-e2e-smoke-test.js, including the fix for the updated_by
//      uuid-column bug found during that work).
//   2. Inserts ONE fresh concierge_jobs row tagged for this walkthrough
//      (distinct tag from the automated smoke test's, so the two are easy
//      to tell apart later), then prints the job id and both logins.
//
// Requires SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment
// (loaded from .env). Member/provider ids default to the same sim accounts
// already used by custody-e2e-smoke-test.js's last run (Supabase's Auth
// admin listUsers endpoint is currently broken on this project — see that
// script's comments — so this defaults to known-good ids rather than
// trying that endpoint at all). Override with CUSTODY_TEST_MEMBER_ID /
// CUSTODY_TEST_MEMBER_EMAIL / CUSTODY_TEST_PROVIDER_ID /
// CUSTODY_TEST_PROVIDER_EMAIL if you want different accounts.
//
// Usage: node custody-manual-walkthrough-setup.js
//
// NOTE ON CLEANUP: like the automated smoke test, the concierge_jobs row
// this creates can never be fully deleted once a real handoff/attestation
// exists against it — custody_attestations/custody_photos are intentionally
// append-only ("the legal spine"). That's expected and matches the call
// already made about the automated test's leftover rows: leave it in
// place, tagged, sim-account-only, harmless.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ifbyjxuaclwmadqbjcyp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = (process.env.MCC_APP_URL || 'https://www.mycarconcierge.com').replace(/\/+$/, '');

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in environment (.env).');
  process.exit(1);
}

const SIM_PASSWORD = 'SimPass123!';
const TAG = 'CUSTODY_MANUAL_WALKTHROUGH ' + new Date().toISOString();

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Known-good sim accounts from the last verified custody-e2e-smoke-test.js
// run against this production project (2026-09-09). Override via env vars
// if you want to use different accounts.
const member = {
  id: process.env.CUSTODY_TEST_MEMBER_ID || '004bb648-c963-497c-8f87-3f7a8da19358',
  email: process.env.CUSTODY_TEST_MEMBER_EMAIL || 'sim-member-0003@mcc-sim.test'
};
const provider = {
  id: process.env.CUSTODY_TEST_PROVIDER_ID || 'ee513b04-53e7-4591-9ba9-62ac25955aa5',
  email: process.env.CUSTODY_TEST_PROVIDER_EMAIL || 'sim-provider-02@mcc-sim.test'
};

// Verbatim from custody-e2e-smoke-test.js (already verified there, including
// the fix for the platform_settings.updated_by uuid-column bug — that column
// references a real admin user, so we deliberately omit it here too rather
// than fabricate a value).
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
    const upd = await supabaseAdmin
      .from('platform_settings')
      .update({ setting_value: newVal, updated_at: new Date().toISOString() })
      .eq('setting_key', 'custody_chain_enabled');
    if (upd.error) throw upd.error;
  }
  return { wasGloballyEnabled, alreadyHadTestUsers: !changed };
}

async function createWalkthroughJob(memberId, providerId) {
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
  console.log('=== Custody chain manual-walkthrough setup — ' + APP_URL + ' ===\n');

  const flagInfo = await ensureCustodyFlagForTestUsers([member.id, provider.id]);
  console.log('custody_chain_enabled: ' + (flagInfo.wasGloballyEnabled ? 'ALREADY GLOBALLY ON' : 'off globally (as expected)')
    + ', test_users ' + (flagInfo.alreadyHadTestUsers ? 'already included both sim accounts' : 'now includes both sim accounts (added)'));

  const job = await createWalkthroughJob(member.id, provider.id);

  console.log('\nJob ready: ' + job.id + '  (tagged: "' + TAG + '")');
  console.log('\nOpen two browser windows (one normal, one incognito) at ' + APP_URL + ' and sign in:');
  console.log('  MEMBER:   ' + member.email + '  /  ' + SIM_PASSWORD);
  console.log('  PROVIDER: ' + provider.email + '  /  ' + SIM_PASSWORD);
  console.log('\nThen, on this job, walk through by hand:');
  console.log('  1. As the member: release the vehicle to the provider (member_to_provider),');
  console.log('     including actually capturing/uploading photos through the real angle-by-angle UI.');
  console.log('  2. As the provider: open the accept/dispute modal and accept the handoff.');
  console.log('  3. Check the handoff timeline renders correctly on both sides.');
  console.log('  4. Optionally, do the return leg (provider releases, member disputes) to also');
  console.log('     exercise the dispute half of the same new provider-side modal.');
  console.log('\nNote: this job\'s rows (and any attestations/photos created against it) cannot be');
  console.log('fully deleted afterward — custody_attestations/custody_photos are intentionally');
  console.log('append-only. That\'s expected; leave them in place (tagged, sim-account-only, harmless),');
  console.log('same call already made for the automated smoke test\'s leftover rows.');

  process.exit(0);
}

main().catch(e => {
  console.error('THREW:', e && e.stack || e);
  process.exit(1);
});

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
// v2 (2026-09-09): the first version of this script inserted a raw
// concierge_jobs row directly (package_id = NULL), same as the automated
// smoke test. Discovered live, while actually trying to drive the browser
// through the real app, that this is NOT reachable through the real member
// UI at all: `startCustodyPickup(packageId)`/`startCustodyReturn(packageId)`
// in members-extras.js only ever look up
// `concierge_jobs.eq('package_id', packageId)`, and that packageId only
// ever comes from a package the member sees under "Active Packages" — a
// job with no package_id has no click-path to it anywhere in the app.
// (custody-e2e-smoke-test.js's API-only run never hit this because it
// calls /api/custody/handoffs directly with a job_id it already has.)
//
// Fixed by going through the REAL, already-shipped "accept a private job"
// code path instead of fabricating a package by guesswork — mirrors
// `acceptPrivateJob()` in providers.js (www/providers.js ~line 4088)
// exactly: insert a `bids` row at status='accepted' with price 0 (no
// Stripe involved anywhere in that real code path — confirmed by reading
// it), which fires the already-live `bid_accepted_create_concierge_job`
// trigger (20260529_option_b_concierge_jobs_package_bridge.sql) that
// creates the concierge_jobs row WITH package_id set, exactly like a real
// accepted job. Ensures a vehicle exists first (maintenance_packages
// requires vehicle_id — mirrors the vehicle insert shape from the existing
// www/seed-test-data.js).
//
// This script does exactly these things against REAL production, then
// exits. It performs NO custody actions itself — every handoff/release/
// accept/dispute/photo-upload step is meant to be done by a real person
// clicking through the real app afterward.
//
//   1. Ensures custody_chain_enabled is scoped to the two sim test accounts
//      (idempotent — safe to re-run; reuses the same logic already verified
//      in custody-e2e-smoke-test.js, including the fix for the updated_by
//      uuid-column bug found during that work).
//   2. Ensures the sim member has at least one vehicle (creates one if not).
//   3. Creates a maintenance_packages row (status 'open'), then a bids row
//      at status 'accepted' for the sim provider (mirrors acceptPrivateJob),
//      then flips the package to 'in_progress' with accepted_bid_id set
//      (mirrors the same real code path) — same as a real member/provider
//      would produce, so it shows up under "Active Packages" in the UI.
//   4. Reads back the concierge_jobs row the trigger created (by
//      package_id) to confirm it exists and has the right package_id
//      before printing anything, then prints the job id and both logins.
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
// place, tagged, sim-account-only, harmless. The vehicle row is reusable
// and harmless to leave regardless.

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

// Mirrors www/seed-test-data.js's vehicle insert shape. Reuses an existing
// vehicle if the member already has one (harmless either way, and this
// script is safe to re-run).
async function ensureVehicle(memberId) {
  const existing = await supabaseAdmin.from('vehicles').select('id, year, make, model').eq('owner_id', memberId).limit(1);
  if (existing.error) throw existing.error;
  if (existing.data && existing.data.length) return { vehicle: existing.data[0], created: false };

  const ins = await supabaseAdmin.from('vehicles').insert({
    owner_id: memberId,
    year: 2022,
    make: 'Toyota',
    model: 'Camry'
  }).select().single();
  if (ins.error) throw ins.error;
  return { vehicle: ins.data, created: true };
}

// Mirrors providers.js's acceptPrivateJob() (www/providers.js ~line 4088)
// exactly — the real, already-shipped "provider accepts a job directly, no
// bidding war" code path. No Stripe/payment code anywhere in that function
// (confirmed by reading it), so this is financially inert: price 0, no
// PaymentIntent, no card. Inserting the bid at status='accepted' fires the
// real bid_accepted_create_concierge_job trigger, which creates the
// concierge_jobs row (with package_id correctly set) exactly like a real
// accepted job would.
async function createWalkthroughPackageAndJob(memberId, providerId, vehicleId) {
  // Look up the member's own zip_code so the package isn't seeded with a
  // fabricated one (mirrors what a real "post a request" flow would use).
  const profile = await supabaseAdmin.from('profiles').select('zip_code').eq('id', memberId).single();
  const memberZip = (profile.data && profile.data.zip_code) || '60601';

  const pkgIns = await supabaseAdmin.from('maintenance_packages').insert({
    member_id: memberId,
    vehicle_id: vehicleId,
    title: TAG,
    description: 'Manual custody-chain UI walkthrough test package — safe to ignore/leave.',
    status: 'open',
    member_zip: memberZip
  }).select().single();
  if (pkgIns.error) throw pkgIns.error;
  const pkg = pkgIns.data;

  const bidIns = await supabaseAdmin.from('bids').insert({
    package_id: pkg.id,
    provider_id: providerId,
    price: 0,
    description: TAG + ' — accepted directly for UI walkthrough (mirrors acceptPrivateJob, no bidding/payment involved)',
    status: 'accepted',
    provider_alias: null,
    business_name: null,
    years_in_business: null,
    services_offered: null,
    brand_specializations: null,
    license_verified: null,
    insurance_verified: null,
    certifications_verified: null
  }).select().single();
  if (bidIns.error) throw bidIns.error;
  const bid = bidIns.data;

  // Mirrors acceptPrivateJob()'s own follow-up package update exactly.
  const pkgUpd = await supabaseAdmin.from('maintenance_packages')
    .update({ status: 'in_progress', accepted_bid_id: bid.id })
    .eq('id', pkg.id);
  if (pkgUpd.error) throw pkgUpd.error;

  // Confirm the trigger actually did its job before telling the human
  // anything is ready — don't just assume.
  const jobRow = await supabaseAdmin.from('concierge_jobs').select('*').eq('package_id', pkg.id).single();
  if (jobRow.error || !jobRow.data) {
    throw new Error('bid_accepted_create_concierge_job trigger did not create a concierge_jobs row for package '
      + pkg.id + (jobRow.error ? ' — ' + jobRow.error.message : ' (no error, but no row found)'));
  }

  return { package: pkg, bid, job: jobRow.data };
}

async function main() {
  console.log('=== Custody chain manual-walkthrough setup — ' + APP_URL + ' ===\n');

  const flagInfo = await ensureCustodyFlagForTestUsers([member.id, provider.id]);
  console.log('custody_chain_enabled: ' + (flagInfo.wasGloballyEnabled ? 'ALREADY GLOBALLY ON' : 'off globally (as expected)')
    + ', test_users ' + (flagInfo.alreadyHadTestUsers ? 'already included both sim accounts' : 'now includes both sim accounts (added)'));

  const vehicleInfo = await ensureVehicle(member.id);
  console.log('vehicle: ' + (vehicleInfo.created ? 'created' : 'reused existing') + ' — '
    + vehicleInfo.vehicle.year + ' ' + vehicleInfo.vehicle.make + ' ' + vehicleInfo.vehicle.model + '  (' + vehicleInfo.vehicle.id + ')');

  const result = await createWalkthroughPackageAndJob(member.id, provider.id, vehicleInfo.vehicle.id);

  console.log('\nPackage ' + result.package.id + ' -> accepted bid ' + result.bid.id + ' -> job ' + result.job.id);
  console.log('Confirmed: concierge_jobs.package_id = ' + result.job.package_id + ' (matches — the real "Active Packages" UI path will find this job)');
  console.log('\nJob ready: ' + result.job.id + '  (tagged: "' + TAG + '")');
  console.log('\nOpen two browser windows (one normal, one incognito) at ' + APP_URL + ' and sign in:');
  console.log('  MEMBER:   ' + member.email + '  /  ' + SIM_PASSWORD);
  console.log('  PROVIDER: ' + provider.email + '  /  ' + SIM_PASSWORD);
  console.log('\nFind the job:');
  console.log('  MEMBER:   My Garage -> "Active Packages" -> the package titled "' + TAG + '"');
  console.log('  PROVIDER: My Jobs (already accepted, not Open Packages) -> same title');
  console.log('\nThen walk through by hand:');
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

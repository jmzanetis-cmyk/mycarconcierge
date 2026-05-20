#!/usr/bin/env node
// scripts/seed-app-store-reviewer.js
//
// Creates (or re-idempotently updates) the two App Store reviewer accounts in
// production Supabase, then seeds enough data for Apple's reviewer to exercise
// the full member+provider flow.
//
// Usage:
//   REVIEWER_PASSWORD=$(openssl rand -base64 16)
//   echo "$REVIEWER_PASSWORD"  # save this to App Store Connect before running
//   SUPABASE_SERVICE_ROLE_KEY=<key> REVIEWER_PASSWORD="$REVIEWER_PASSWORD" \
//     node scripts/seed-app-store-reviewer.js
//
// Safe to re-run: existing accounts are updated (not duplicated); existing
// vehicles/care_plans/bids are only inserted when absent.

'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ifbyjxuaclwmadqbjcyp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is required.');
  process.exit(1);
}

const REVIEWER_PASSWORD = process.env.REVIEWER_PASSWORD;
if (!REVIEWER_PASSWORD) {
  console.error('ERROR: REVIEWER_PASSWORD env var is required.');
  console.error('');
  console.error('Generate a strong password and save it before running:');
  console.error('  REVIEWER_PASSWORD=$(openssl rand -base64 16)');
  console.error('  echo "$REVIEWER_PASSWORD"  # save this to App Store Connect');
  console.error('  node scripts/seed-app-store-reviewer.js');
  console.error('');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const MEMBER_EMAIL   = 'reviewer-member@mycarconcierge.com';
const PROVIDER_EMAIL = 'reviewer-provider@mycarconcierge.com';

// ---------------------------------------------------------------------------
// Helper: upsert an auth user. Returns the user's UUID.
// ---------------------------------------------------------------------------
async function upsertAuthUser(email, password) {
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existing = users.find(u => u.email === email);

  if (existing) {
    await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true
    });
    console.log(`  [auth] updated existing user: ${email} (${existing.id})`);
    return existing.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (error) throw new Error(`auth.admin.createUser(${email}): ${error.message}`);
  console.log(`  [auth] created user: ${email} (${data.user.id})`);
  return data.user.id;
}

// ---------------------------------------------------------------------------
// Helper: upsert the profiles row (created automatically by DB trigger on
// auth.users insert, so the row already exists — we just update it).
// ---------------------------------------------------------------------------
async function upsertProfile(userId, email, fields) {
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, email, ...fields }, { onConflict: 'id' });
  if (error) throw new Error(`profiles upsert (${email}): ${error.message}`);
  console.log(`  [profile] role=${fields.role}${fields.is_also_member ? ' + is_also_member' : ''}`);
}

// ---------------------------------------------------------------------------
// Helper: insert a vehicle for the member if one with the same year/make/model
// doesn't already exist.
// ---------------------------------------------------------------------------
async function ensureVehicle(ownerId) {
  const { data: existing } = await supabase
    .from('vehicles')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('year', 2022)
    .eq('make', 'Toyota')
    .eq('model', 'Camry')
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`  [vehicle] already exists (${existing[0].id})`);
    return existing[0].id;
  }

  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      owner_id: ownerId,
      year: 2022,
      make: 'Toyota',
      model: 'Camry',
      trim: 'SE',
      color: 'Silver',
      nickname: 'My Camry',
      mileage: 34200,
      health_score: 78
    })
    .select('id')
    .single();
  if (error) throw new Error(`vehicles insert: ${error.message}`);
  console.log(`  [vehicle] created 2022 Toyota Camry (${data.id})`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Helper: ensure an open care plan exists for the member. Returns the id.
// Re-uses any existing open plan to stay idempotent.
// ---------------------------------------------------------------------------
async function ensureCarePlan(memberId) {
  const { data: existing } = await supabase
    .from('care_plans')
    .select('id')
    .eq('member_id', memberId)
    .eq('status', 'open')
    .ilike('title', '%Reviewer%')
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`  [care_plan] already exists (${existing[0].id})`);
    return existing[0].id;
  }

  const { data, error } = await supabase
    .from('care_plans')
    .insert({
      member_id: memberId,
      title: 'Reviewer — Oil Change & Brake Inspection',
      description: 'App Store reviewer demo request. Full synthetic oil change and brake pad inspection for a 2022 Toyota Camry.',
      services: [{ name: 'Oil Change' }, { name: 'Brake Inspection' }],
      service_types: ['oil_change', 'brake_service'],
      value_min: 80.00,
      value_max: 220.00,
      city: 'Los Angeles',
      state: 'CA',
      zip_code: '90001',
      status: 'open'
    })
    .select('id')
    .single();
  if (error) throw new Error(`care_plans insert: ${error.message}`);
  console.log(`  [care_plan] created (${data.id})`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Helper: ensure a pending bid from the provider exists on the care plan.
// ---------------------------------------------------------------------------
async function ensureBid(carePlanId, providerId) {
  const { data: existing } = await supabase
    .from('plan_bids')
    .select('id')
    .eq('care_plan_id', carePlanId)
    .eq('provider_id', providerId)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`  [plan_bid] already exists (${existing[0].id})`);
    return existing[0].id;
  }

  const { data, error } = await supabase
    .from('plan_bids')
    .insert({
      care_plan_id: carePlanId,
      provider_id: providerId,
      amount: 149.00,
      note: 'Full synthetic oil change (5W-30) + brake pad thickness check and report. Work completed same day.',
      is_auto_bid: false,
      status: 'pending'
    })
    .select('id')
    .single();
  if (error) throw new Error(`plan_bids insert: ${error.message}`);
  console.log(`  [plan_bid] created $149.00 bid (${data.id})`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Helper: upsert a provider_stats row. Rating data lives in provider_stats,
// not on profiles (profiles.avg_rating does not exist in the schema).
// Best-effort: warns on error rather than throwing, matching the pattern in
// provider-application-review.js and provider-admin.js.
// ---------------------------------------------------------------------------
async function ensureProviderStats(providerId) {
  const { error } = await supabase
    .from('provider_stats')
    .upsert({ provider_id: providerId, average_rating: 4.9 }, { onConflict: 'provider_id' });
  if (error) console.warn(`  [provider_stats] upsert warning: ${error.message}`);
  else console.log('  [provider_stats] upserted (average_rating=4.9)');
}

// ---------------------------------------------------------------------------
// Helper: ensure provider_applications row exists (approved) for the provider.
// ---------------------------------------------------------------------------
async function ensureProviderApplication(providerId) {
  const { data: existing } = await supabase
    .from('provider_applications')
    .select('id')
    .eq('user_id', providerId)
    .limit(1);

  if (existing && existing.length > 0) {
    await supabase
      .from('provider_applications')
      .update({ status: 'approved', services_offered: ['Oil Change', 'Brake Service', 'Tire Rotation'] })
      .eq('user_id', providerId);
    console.log(`  [provider_application] updated to approved`);
    return;
  }

  const { error } = await supabase
    .from('provider_applications')
    .insert({
      user_id: providerId,
      business_name: 'Reviewer Auto Works',
      phone: '3105550199',
      city: 'Los Angeles',
      state: 'CA',
      services_offered: ['Oil Change', 'Brake Service', 'Tire Rotation'],
      status: 'approved'
    });
  if (error) throw new Error(`provider_applications insert: ${error.message}`);
  console.log(`  [provider_application] created (approved)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== App Store Reviewer Seed ===\n');

  // --- Member account ---
  console.log(`[1/3] Member account: ${MEMBER_EMAIL}`);
  const memberId = await upsertAuthUser(MEMBER_EMAIL, REVIEWER_PASSWORD);
  await upsertProfile(memberId, MEMBER_EMAIL, {
    role: 'member',
    full_name: 'Apple Reviewer',
    phone: '3105550198',
    city: 'Los Angeles',
    state: 'CA',
    zip_code: '90001'
  });
  await ensureVehicle(memberId);
  const carePlanId = await ensureCarePlan(memberId);

  // --- Provider account ---
  console.log(`\n[2/3] Provider account: ${PROVIDER_EMAIL}`);
  const providerId = await upsertAuthUser(PROVIDER_EMAIL, REVIEWER_PASSWORD);
  await upsertProfile(providerId, PROVIDER_EMAIL, {
    role: 'provider',
    is_also_member: true,
    full_name: 'Reviewer Provider',
    business_name: 'Reviewer Auto Works',
    phone: '3105550199',
    city: 'Los Angeles',
    state: 'CA',
    zip_code: '90001',
    bid_credits: 10,
    free_trial_bids: 5,
    application_status: 'approved'
  });
  await ensureProviderStats(providerId);
  await ensureProviderApplication(providerId);

  // --- Seed bid from provider on member's care plan ---
  console.log('\n[3/3] Cross-account bid');
  await ensureBid(carePlanId, providerId);

  // --- Summary ---
  console.log('\n=== Done ===');
  console.log(`  Member email:   ${MEMBER_EMAIL}`);
  console.log(`  Provider email: ${PROVIDER_EMAIL}`);
  console.log('  Password:       (value of REVIEWER_PASSWORD — save to App Store Connect)');
  console.log('\n  Enter both sets of credentials in App Store Connect →');
  console.log('  App Review Information → Sign-In Information.');
  console.log('  Do NOT commit the password to git.\n');
}

main().catch(err => {
  console.error('\nSeed failed:', err.message);
  process.exit(1);
});

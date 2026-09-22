// ============================================================================
// seed-appreview-demo.js — App Review demo fixtures for Report + Block
//
// Purpose: App Review (Guideline 1.2 / 2.1) needs to SEE the content-reporting
// and user-blocking mechanisms work. Those controls live in the member<->provider
// chat, so this seeds ONE real conversation on the demo account against a
// dedicated test counterparty. After running it, sign in as the demo account,
// open Messages, tap the conversation, and both "Report abuse" and
// "Block provider" are exercisable.
//
// It is idempotent: safe to run repeatedly. It reuses the counterparty, vehicle,
// package, and message thread if they already exist rather than duplicating them.
// It creates NOTHING on the demo account except one package + one thread.
//
// Run (Node 18+; repo already has @supabase/supabase-js at the root):
//   cd ~/mycarconcierge
//   node --env-file=.env seed-appreview-demo.js
// (.env must contain SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY — it already does.)
// ============================================================================

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_EMAIL   = process.env.DEMO_EMAIL || 'demo@mycarconcierge.com';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with: node --env-file=.env seed-appreview-demo.js');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// The demo counterparty (a provider). Internal test login only — never shown to
// Apple; the reviewer uses the demo account and simply reports/blocks this party.
const COUNTERPARTY = {
  email: 'demo.counterparty@mcc-test.com',
  password: 'DemoCounterparty!2026',
  profile: {
    role: 'provider',
    full_name: 'Sam Rivera',
    business_name: 'Roadside Rescue Auto',
    phone: '5557778888',
    city: 'Chicago',
    state: 'IL',
    free_trial_bids: 3,
    bid_credits: 0,
    is_also_member: false,
  },
};
const PROVIDER_ALIAS = COUNTERPARTY.profile.business_name;
const PKG_TITLE = 'Front Brake Pads & Rotors';

async function findUserIdByEmail(email) {
  // Paginate auth.users (listUsers is paged at 50 by default).
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = (data?.users || []).find(u => (u.email || '').toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (!data || !data.users || data.users.length < 200) return null;
    page += 1;
  }
}

async function upsertCounterparty() {
  let userId = await findUserIdByEmail(COUNTERPARTY.email);
  if (userId) {
    console.log(`  Counterparty exists: ${COUNTERPARTY.email} (${userId})`);
    await supabase.auth.admin.updateUserById(userId, {
      password: COUNTERPARTY.password,
      email_confirm: true,
    });
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: COUNTERPARTY.email,
      password: COUNTERPARTY.password,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser failed: ${error.message}`);
    userId = data.user.id;
    console.log(`  Counterparty created: ${COUNTERPARTY.email} (${userId})`);
  }
  const { error: pErr } = await supabase
    .from('profiles')
    .upsert({ id: userId, email: COUNTERPARTY.email, ...COUNTERPARTY.profile }, { onConflict: 'id' });
  if (pErr) console.error('  Counterparty profile upsert error:', pErr.message);
  else console.log('  Counterparty profile upserted (role=provider)');
  return userId;
}

async function ensureDemoVehicle(demoId) {
  const { data: vehicles } = await supabase
    .from('vehicles').select('id').eq('owner_id', demoId).limit(1);
  if (vehicles && vehicles.length) return vehicles[0].id;
  const { data: v, error } = await supabase
    .from('vehicles')
    .insert({ owner_id: demoId, year: 2020, make: 'Honda', model: 'CR-V', health_score: 100 })
    .select('id').single();
  if (error) throw new Error(`vehicle insert failed: ${error.message}`);
  console.log(`  Demo vehicle created: ${v.id}`);
  return v.id;
}

async function ensurePackage(demoId, vehicleId) {
  const { data: existing } = await supabase
    .from('maintenance_packages').select('id')
    .eq('member_id', demoId).eq('title', PKG_TITLE).limit(1);
  if (existing && existing.length) {
    console.log(`  Package exists: ${existing[0].id}`);
    return existing[0].id;
  }
  const { data: pkg, error } = await supabase
    .from('maintenance_packages')
    .insert({
      member_id: demoId,
      vehicle_id: vehicleId,
      title: PKG_TITLE,
      description: 'Front brake pads and rotors replacement; slight squeal when braking.',
      status: 'open',
      member_zip: '60601',
    })
    .select('id').single();
  if (error) throw new Error(`package insert failed: ${error.message}`);
  console.log(`  Package created: ${pkg.id}`);
  return pkg.id;
}

async function ensureThread(demoId, providerId, packageId) {
  const { data: existing } = await supabase
    .from('messages').select('id').eq('package_id', packageId).limit(1);
  if (existing && existing.length) {
    console.log('  Message thread already present — leaving as is.');
    return;
  }
  const now = Date.now();
  const at = (minsAgo) => new Date(now - minsAgo * 60000).toISOString();
  // provider_alias is set only on provider-authored rows (matches the app's
  // denormalization at send time) so the conversation shows "Roadside Rescue Auto."
  const rows = [
    // Schema note (2026-09-14): messages has `read boolean`, not `read_at timestamp`.
    // Two earlier rows are read, the most recent is unread so the header badge shows.
    { sender_id: providerId, recipient_id: demoId, package_id: packageId,
      content: `Hi! Thanks for the details on the front brakes. I can take a look this week.`,
      provider_alias: PROVIDER_ALIAS, created_at: at(30), read: true },
    { sender_id: demoId, recipient_id: providerId, package_id: packageId,
      content: `Great — what would the timing look like?`,
      provider_alias: null, created_at: at(25), read: true },
    { sender_id: providerId, recipient_id: demoId, package_id: packageId,
      content: `I can do Thursday morning. I'll bring the pads and rotors with me.`,
      provider_alias: PROVIDER_ALIAS, created_at: at(3), read: false },
  ];
  const { error } = await supabase.from('messages').insert(rows);
  if (error) throw new Error(`messages insert failed: ${error.message}`);
  console.log(`  Seeded ${rows.length} messages (last one unread → badge shows).`);
}

// Add a pending bid on the existing open "Front Brake Pads & Rotors" package
// so the bid-comparison view isn't empty when a reviewer opens it. From the
// counterparty provider, price + description matched to a realistic quote.
async function ensurePendingBidOnPackage(providerId, packageId) {
  const { data: existing } = await supabase
    .from('bids').select('id')
    .eq('package_id', packageId).eq('provider_id', providerId).limit(1);
  if (existing && existing.length) {
    console.log(`  Pending bid on Front Brake package exists: ${existing[0].id}`);
    return existing[0].id;
  }
  const { data: bid, error } = await supabase.from('bids').insert({
    package_id: packageId,
    provider_id: providerId,
    price: 220,
    description: 'OEM ceramic pads + Brembo rotors, 12-month warranty. Two-hour turnaround.',
    estimated_duration: '2 hours',
    warranty_info: '12 months / 12,000 miles',
    status: 'pending',
    business_name: COUNTERPARTY.profile.business_name,
    provider_alias: COUNTERPARTY.profile.business_name,
  }).select('id').single();
  if (error) throw new Error(`pending bid insert failed: ${error.message}`);
  console.log(`  Pending bid created: ${bid.id} ($220 from ${COUNTERPARTY.profile.business_name})`);
  return bid.id;
}

// Add an accepted maintenance_package with an accepted bid so the reviewer's
// "In Progress" view has a coherent, non-SMOKE-test entry. Second package for
// the demo member (first is the open "Front Brake Pads & Rotors").
async function ensureAcceptedPackage(demoId, providerId, vehicleId) {
  const TITLE = 'Wiper blades + cabin air filter';
  const { data: existing } = await supabase
    .from('maintenance_packages').select('id, accepted_bid_id')
    .eq('member_id', demoId).eq('title', TITLE).limit(1);
  let pkgId;
  if (existing && existing.length) {
    pkgId = existing[0].id;
    if (existing[0].accepted_bid_id) {
      console.log(`  Accepted package exists: ${pkgId}`);
      return pkgId;
    }
  } else {
    const { data: pkg, error } = await supabase.from('maintenance_packages').insert({
      member_id: demoId,
      vehicle_id: vehicleId,
      title: TITLE,
      description: 'Both front wiper blades streaking; would like the cabin air filter changed too.',
      status: 'accepted',
      member_zip: '60601',
    }).select('id').single();
    if (error) throw new Error(`accepted package insert failed: ${error.message}`);
    pkgId = pkg.id;
  }
  const { data: bid, error: bidErr } = await supabase.from('bids').insert({
    package_id: pkgId,
    provider_id: providerId,
    price: 85,
    description: 'Bosch ICON wipers + OEM cabin filter, installed at your driveway.',
    estimated_duration: '30 minutes',
    warranty_info: '12 months on wiper blades',
    status: 'accepted',
    business_name: COUNTERPARTY.profile.business_name,
    provider_alias: COUNTERPARTY.profile.business_name,
  }).select('id').single();
  if (bidErr) throw new Error(`accepted bid insert failed: ${bidErr.message}`);
  const { error: updErr } = await supabase
    .from('maintenance_packages')
    .update({ accepted_bid_id: bid.id })
    .eq('id', pkgId);
  if (updErr) throw new Error(`accepted package update failed: ${updErr.message}`);
  console.log(`  Accepted package: ${pkgId} (bid ${bid.id}, $85)`);
  return pkgId;
}

// Add a completed care_plan + accepted plan_bid + care_plan_completions row
// with member/provider name snapshots (h+i pattern) so the "Past jobs" view
// has a real record and the identity snapshots that survive deletion.
async function ensureCompletedCarePlan(demoId, providerId) {
  const TITLE = '60,000-mile Service';
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

  const { data: existing } = await supabase
    .from('care_plans').select('id, status')
    .eq('member_id', demoId).eq('title', TITLE).limit(1);
  let planId;
  if (existing && existing.length) {
    planId = existing[0].id;
  } else {
    const { data: plan, error } = await supabase.from('care_plans').insert({
      member_id: demoId,
      title: TITLE,
      description: 'Manufacturer 60k service — plugs, air filter, coolant flush, brake fluid, inspection.',
      status: 'completed',
      payment_status: 'captured',
      categories: ['maintenance'],
      services: [
        { name: 'Spark plug replacement' },
        { name: 'Air filter replacement' },
        { name: 'Coolant flush' },
        { name: 'Brake fluid flush' },
      ],
      state: 'IL',
      value_min: 350, value_max: 450,
      credit_applied_cents: 0,
      created_at: daysAgo(9), updated_at: daysAgo(6),
    }).select('id').single();
    if (error) throw new Error(`care_plan insert failed: ${error.message}`);
    planId = plan.id;
    console.log(`  Completed care plan created: ${planId}`);
  }

  let bidId;
  const { data: existingBid } = await supabase.from('plan_bids')
    .select('id').eq('care_plan_id', planId).eq('provider_id', providerId).limit(1);
  if (existingBid && existingBid.length) {
    bidId = existingBid[0].id;
  } else {
    const { data: bid, error: bidErr } = await supabase.from('plan_bids').insert({
      care_plan_id: planId,
      provider_id: providerId,
      amount: 380,
      status: 'accepted',
      note: 'Full manufacturer 60k service; plugs, coolant, brake fluid, and multi-point inspection.',
      created_at: daysAgo(8), updated_at: daysAgo(8),
    }).select('id').single();
    if (bidErr) throw new Error(`plan_bid insert failed: ${bidErr.message}`);
    bidId = bid.id;
  }

  const { data: existingComp } = await supabase.from('care_plan_completions')
    .select('id').eq('care_plan_id', planId).limit(1);
  if (existingComp && existingComp.length) {
    console.log(`  Completion already exists: ${existingComp[0].id}`);
    return planId;
  }
  const { data: comp, error: cErr } = await supabase.from('care_plan_completions').insert({
    care_plan_id: planId,
    member_id: demoId,
    provider_id: providerId,
    accepted_bid_id: bidId,
    bid_amount: 380,
    actual_paid_amount: 380,
    payment_method: 'card',
    status: 'completed',
    completion_notes: 'Full 60k-mile service completed. Multi-point inspection returned all-green.',
    // Snapshot columns from h+i — populated at completion so the demo record
    // shows the identity pair even after either party deletes their account.
    member_name_snapshot: 'MCC Demo',
    provider_business_name_snapshot: COUNTERPARTY.profile.business_name,
    completed_at: daysAgo(6),
    metadata: { source: 'seed-appreview-demo' },
    created_at: daysAgo(6), updated_at: daysAgo(6),
  }).select('id').single();
  if (cErr) throw new Error(`completion insert failed: ${cErr.message}`);
  console.log(`  Completion row: ${comp.id} ($380, snapshots written)`);
  return planId;
}

// Add a published provider review from the demo member about the counterparty.
// NOTE (2026-09-22): providers-core.js:906 `loadMyReviews` currently reads from
// a non-existent `reviews` table (should be `provider_reviews`), so this row
// won't render in the "My Reviews" tab until that query is fixed. The row is
// inserted anyway so it's already in place when the query fix ships. Uses
// package_id=null; the fallback in providers-core.js:961 renders 'Service' as
// the label.
async function ensureProviderReview(providerId, demoId) {
  const { data: existing } = await supabase
    .from('provider_reviews').select('id')
    .eq('provider_id', providerId).eq('member_id', demoId).limit(1);
  if (existing && existing.length) {
    console.log(`  Provider review exists: ${existing[0].id}`);
    return existing[0].id;
  }
  const { data: rev, error } = await supabase.from('provider_reviews').insert({
    provider_id: providerId,
    member_id: demoId,
    package_id: null,
    rating: 5,
    overall_rating: 5.0,
    review_text: 'Fast, honest work. Explained everything before touching anything and finished right on time. Would use again for the next service.',
    status: 'published',
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  }).select('id').single();
  if (error) throw new Error(`review insert failed: ${error.message}`);
  console.log(`  Provider review created: ${rev.id} (5★ from MCC Demo about ${COUNTERPARTY.profile.business_name})`);
  return rev.id;
}

async function main() {
  console.log('Seeding App Review demo conversation (Report + Block)...\n');

  const demoId = await findUserIdByEmail(DEMO_EMAIL);
  if (!demoId) {
    console.error(`\nDemo account not found: ${DEMO_EMAIL}. Confirm it exists in Supabase Auth, or set DEMO_EMAIL in .env.`);
    process.exit(1);
  }
  console.log(`  Demo account: ${DEMO_EMAIL} (${demoId})`);

  const providerId = await upsertCounterparty();
  const vehicleId  = await ensureDemoVehicle(demoId);
  const packageId  = await ensurePackage(demoId, vehicleId);
  await ensureThread(demoId, providerId, packageId);

  // Enrichment (2026-09-22) — populate a feature-rich state so an App Review
  // login sees bids to compare, an in-progress job, and a completed record.
  await ensurePendingBidOnPackage(providerId, packageId);
  await ensureAcceptedPackage(demoId, providerId, vehicleId);
  await ensureCompletedCarePlan(demoId, providerId);
  await ensureProviderReview(providerId, demoId);

  console.log('\nDone. To demo:');
  console.log(`  1. Sign in as the demo account (${DEMO_EMAIL}) → Member Portal.`);
  console.log('  2. Tap the Messages icon in the header → open the "' + PKG_TITLE + '" conversation.');
  console.log('  3. In the conversation, use "Report abuse" and "Block provider".');
  console.log('  4. Open the "' + PKG_TITLE + '" package → see the pending bid card + "Report" ghost button.');
  console.log('  5. Care Plans / Services → "60,000-mile Service" shows a completed job with the provider identity snapshot.');
  console.log('\n  (Counterparty login, if you want to see the other side: ' +
    COUNTERPARTY.email + ' / ' + COUNTERPARTY.password + ')');
}

main().catch(err => {
  console.error('\nSeed failed:', err.message);
  process.exit(1);
});

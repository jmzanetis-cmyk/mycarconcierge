const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ifbyjxuaclwmadqbjcyp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const TEST_ACCOUNTS = [
  {
    email: 'testmember@mcc-test.com',
    password: 'TestPass123!',
    profile: {
      role: 'member',
      full_name: 'Test Member',
      phone: '5551110001',
      city: 'Chicago',
      state: 'IL',
      zip_code: '60601'
    },
    vehicle: { year: 2021, make: 'Toyota', model: 'Camry', health_score: 100 }
  },
  {
    email: 'testprovider_a@mcc-test.com',
    password: 'TestPass123!',
    profile: {
      role: 'provider',
      full_name: 'Provider Alpha',
      business_name: 'Alpha Auto Works',
      phone: '5552220001',
      city: 'Chicago',
      state: 'IL',
      free_trial_bids: 3,
      bid_credits: 0,
      is_also_member: true
    },
    services: ['Oil Change', 'Brakes']
  },
  {
    email: 'testprovider_b@mcc-test.com',
    password: 'TestPass123!',
    profile: {
      role: 'provider',
      full_name: 'Provider Bravo',
      business_name: 'Bravo Garage',
      phone: '5553330001',
      city: 'Chicago',
      state: 'IL',
      free_trial_bids: 3,
      bid_credits: 0,
      is_also_member: true
    },
    services: ['Oil Change', 'Brakes']
  }
];

async function upsertUser(account) {
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existing = existingUsers?.users?.find(u => u.email === account.email);

  let userId;
  if (existing) {
    userId = existing.id;
    console.log(`  User exists: ${account.email} (${userId})`);
    await supabase.auth.admin.updateUserById(userId, {
      password: account.password,
      email_confirm: true
    });
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true
    });
    if (error) throw new Error(`Failed to create user ${account.email}: ${error.message}`);
    userId = data.user.id;
    console.log(`  Created user: ${account.email} (${userId})`);
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: userId, email: account.email, ...account.profile }, { onConflict: 'id' });
  if (profileError) console.error(`  Profile upsert error for ${account.email}:`, profileError.message);
  else console.log(`  Profile upserted: role=${account.profile.role}`);

  if (account.vehicle) {
    const { data: existingVehicles } = await supabase
      .from('vehicles')
      .select('id')
      .eq('owner_id', userId)
      .eq('year', account.vehicle.year)
      .eq('make', account.vehicle.make)
      .eq('model', account.vehicle.model);

    if (existingVehicles && existingVehicles.length > 0) {
      console.log(`  Vehicle exists: ${account.vehicle.year} ${account.vehicle.make} ${account.vehicle.model}`);
    } else {
      const { error: vErr } = await supabase.from('vehicles').insert({
        owner_id: userId,
        ...account.vehicle
      });
      if (vErr) console.error(`  Vehicle insert error:`, vErr.message);
      else console.log(`  Vehicle added: ${account.vehicle.year} ${account.vehicle.make} ${account.vehicle.model}`);
    }
  }

  if (account.services && account.services.length > 0) {
    const { data: existingApp } = await supabase
      .from('provider_applications')
      .select('id')
      .eq('user_id', userId)
      .limit(1);
    if (existingApp && existingApp.length > 0) {
      const { error: svcErr } = await supabase
        .from('provider_applications')
        .update({ services_offered: account.services, status: 'approved' })
        .eq('user_id', userId);
      if (svcErr) console.error(`  Provider application update error:`, svcErr.message);
      else console.log(`  Provider services updated: ${account.services.join(', ')}`);
    } else {
      const { error: svcErr } = await supabase
        .from('provider_applications')
        .insert({
          user_id: userId,
          business_name: account.profile.business_name,
          phone: account.profile.phone,
          city: account.profile.city,
          state: account.profile.state,
          services_offered: account.services,
          status: 'approved'
        });
      if (svcErr) console.error(`  Provider application insert error:`, svcErr.message);
      else console.log(`  Provider services set: ${account.services.join(', ')}`);
    }
  }

  return userId;
}

async function cleanupOldTestData() {
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const testEmails = TEST_ACCOUNTS.map(a => a.email);
  const testUserIds = existingUsers?.users
    ?.filter(u => testEmails.includes(u.email))
    ?.map(u => u.id) || [];

  if (testUserIds.length > 0) {
    await supabase.from('bids').delete().in('provider_id', testUserIds);
    await supabase.from('payments').delete().in('member_id', testUserIds);

    const { data: pkgs } = await supabase
      .from('maintenance_packages')
      .select('id')
      .in('member_id', testUserIds);
    const pkgIds = (pkgs || []).map(p => p.id);
    if (pkgIds.length > 0) {
      await supabase.from('bids').delete().in('package_id', pkgIds);
      await supabase.from('payments').delete().in('package_id', pkgIds);
    }
    await supabase.from('maintenance_packages').delete().in('member_id', testUserIds);

    console.log('  Cleaned up old test bids, packages, and payments');
  }
}

async function main() {
  console.log('Seeding My Car Concierge test data...\n');

  console.log('Cleaning up old test data...');
  await cleanupOldTestData();

  for (const account of TEST_ACCOUNTS) {
    console.log(`\nProcessing: ${account.email}`);
    await upsertUser(account);
  }

  const { data: member } = await supabase.from('profiles').select('id').eq('email', 'testmember@mcc-test.com').single();
  const { data: vehicle } = await supabase.from('vehicles').select('id').eq('owner_id', member.id).limit(1).single();

  if (member && vehicle) {
    const { data: pkg, error: pkgErr } = await supabase.from('maintenance_packages').insert({
      member_id: member.id,
      vehicle_id: vehicle.id,
      title: 'E2E Test Oil Change',
      description: 'Full synthetic oil change for testing',
      status: 'open',
      member_zip: '60601'
    }).select().single();
    if (pkgErr) console.error('\nPackage creation error:', pkgErr.message);
    else console.log(`\nTest package created: ${pkg.id} (${pkg.title})`);
  }

  console.log('\nSeed complete! Test accounts ready:');
  console.log('  Member:     testmember@mcc-test.com / TestPass123!');
  console.log('  Provider A: testprovider_a@mcc-test.com / TestPass123!');
  console.log('  Provider B: testprovider_b@mcc-test.com / TestPass123!');
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});

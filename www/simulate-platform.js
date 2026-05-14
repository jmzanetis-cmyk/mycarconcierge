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

const SIM_DOMAIN = '@mcc-sim.test';
const SIM_PASSWORD = 'SimPass123!';

const args = process.argv.slice(2);
function flag(name) { return args.includes(`--${name}`); }
function param(name, def) {
  const f = args.find(a => a.startsWith(`--${name}=`));
  return f ? Number.parseInt(f.split('=')[1], 10) : def;
}

const CONFIG = {
  members: param('members', 500),
  providers: param('providers', 50),
  jobsPerMember: param('jobs-per-member', 3),
  bidsPerJob: param('bids-per-job', 3),
  acceptRate: 0.3,
  completeRate: 0.5,
  authBatchSize: 20,
  insertBatchSize: 200,
};

const VEHICLES = [
  { make: 'Honda', model: 'Civic', year: 2020 },
  { make: 'Toyota', model: 'Camry', year: 2021 },
  { make: 'Nissan', model: 'Altima', year: 2019 },
  { make: 'Hyundai', model: 'Sonata', year: 2020 },
  { make: 'Kia', model: 'Optima', year: 2021 },
  { make: 'Volkswagen', model: 'Jetta', year: 2020 },
  { make: 'BMW', model: '3 Series', year: 2019 },
  { make: 'Audi', model: 'A4', year: 2021 },
  { make: 'Mercedes-Benz', model: 'C-Class', year: 2020 },
  { make: 'Lexus', model: 'IS', year: 2021 },
  { make: 'Ford', model: 'F-150', year: 2022 },
  { make: 'Chevrolet', model: 'Silverado', year: 2021 },
  { make: 'Jeep', model: 'Wrangler', year: 2020 },
  { make: 'Mazda', model: 'CX-5', year: 2021 },
  { make: 'Subaru', model: 'Outback', year: 2020 },
  { make: 'GMC', model: 'Sierra', year: 2022 },
  { make: 'Ram', model: '1500', year: 2021 },
  { make: 'Toyota', model: 'RAV4', year: 2022 },
  { make: 'Volvo', model: 'XC60', year: 2020 },
  { make: 'Tesla', model: 'Model 3', year: 2022 },
  { make: 'Honda', model: 'Accord', year: 2021 },
  { make: 'Toyota', model: 'Tacoma', year: 2020 },
  { make: 'Dodge', model: 'Charger', year: 2021 },
  { make: 'Chevrolet', model: 'Equinox', year: 2022 },
  { make: 'Ford', model: 'Explorer', year: 2021 },
  { make: 'Kia', model: 'Telluride', year: 2022 },
  { make: 'Hyundai', model: 'Tucson', year: 2021 },
  { make: 'Nissan', model: 'Rogue', year: 2022 },
  { make: 'Subaru', model: 'Forester', year: 2020 },
  { make: 'Lexus', model: 'RX', year: 2021 },
];

const SERVICE_TYPES = [
  { name: 'Oil Change', minPrice: 45, maxPrice: 120 },
  { name: 'Brake Service', minPrice: 180, maxPrice: 600 },
  { name: 'Tire Rotation', minPrice: 30, maxPrice: 80 },
  { name: 'Battery Replacement', minPrice: 100, maxPrice: 350 },
  { name: 'A/C Service', minPrice: 120, maxPrice: 500 },
  { name: 'Transmission Service', minPrice: 200, maxPrice: 800 },
  { name: 'Engine Diagnostics', minPrice: 90, maxPrice: 250 },
  { name: 'Detailing', minPrice: 120, maxPrice: 500 },
  { name: 'Windshield Replacement', minPrice: 200, maxPrice: 600 },
  { name: 'Multi-Point Inspection', minPrice: 50, maxPrice: 150 },
  { name: 'Coolant Flush', minPrice: 80, maxPrice: 200 },
  { name: 'Alignment', minPrice: 70, maxPrice: 200 },
  { name: 'Suspension Repair', minPrice: 300, maxPrice: 1200 },
  { name: 'Spark Plugs', minPrice: 80, maxPrice: 300 },
  { name: 'Air Filter', minPrice: 25, maxPrice: 80 },
];

const LOCATIONS = [
  { city: 'Chicago', state: 'IL', zip: '60601' },
  { city: 'New York', state: 'NY', zip: '10001' },
  { city: 'Los Angeles', state: 'CA', zip: '90001' },
  { city: 'Houston', state: 'TX', zip: '77001' },
  { city: 'Phoenix', state: 'AZ', zip: '85001' },
  { city: 'Philadelphia', state: 'PA', zip: '19101' },
  { city: 'San Antonio', state: 'TX', zip: '78201' },
  { city: 'San Diego', state: 'CA', zip: '92101' },
  { city: 'Dallas', state: 'TX', zip: '75201' },
  { city: 'Denver', state: 'CO', zip: '80201' },
  { city: 'Seattle', state: 'WA', zip: '98101' },
  { city: 'Atlanta', state: 'GA', zip: '30301' },
  { city: 'Miami', state: 'FL', zip: '33101' },
  { city: 'Nashville', state: 'TN', zip: '37201' },
  { city: 'Austin', state: 'TX', zip: '78701' },
  { city: 'Portland', state: 'OR', zip: '97201' },
  { city: 'Boston', state: 'MA', zip: '02101' },
  { city: 'Detroit', state: 'MI', zip: '48201' },
  { city: 'Minneapolis', state: 'MN', zip: '55401' },
  { city: 'Las Vegas', state: 'NV', zip: '89101' },
];

const FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
  'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Christopher', 'Karen', 'Charles', 'Lisa', 'Daniel', 'Nancy',
  'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley',
  'Steven', 'Kimberly', 'Andrew', 'Emily', 'Paul', 'Donna', 'Joshua', 'Michelle',
  'Carlos', 'Maria', 'Luis', 'Ana', 'Wei', 'Mei', 'Raj', 'Priya', 'Ahmed', 'Fatima',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
  'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Chen', 'Kim', 'Patel', 'Singh', 'Wang', 'Zhang', 'Ali', 'Rivera', 'Cooper', 'Bailey',
];

const BUSINESS_PREFIXES = [
  'Premier', 'Elite', 'Express', 'Pro', 'Precision', 'Quality', 'Superior', 'Metro',
  'City', 'Ace', 'First', 'Top', 'Prime', 'Gold', 'Diamond', 'Platinum', 'Apex',
  'Summit', 'Peak', 'Royal', 'Classic', 'Modern', 'Advanced', 'Ultimate', 'Champion',
];

const BUSINESS_SUFFIXES = [
  'Auto Works', 'Garage', 'Auto Care', 'Motor Shop', 'Auto Service', 'Car Care',
  'Automotive', 'Repair Shop', 'Auto Clinic', 'Service Center', 'Mechanic Shop',
  'Auto Lab', 'Auto Pros', 'Car Works', 'Auto Masters', 'Auto Hub',
];

const REVIEW_COMMENTS = [
  'Great service, very professional!',
  'Got the job done quickly and at a fair price.',
  'Excellent work, highly recommend.',
  'Very knowledgeable and friendly staff.',
  'Good communication throughout the process.',
  'Went above and beyond what was expected.',
  'Fair pricing and quality work.',
  'Would definitely use again.',
  'Solid work, no complaints.',
  'Very thorough and honest assessment.',
  'Quick turnaround, quality parts used.',
  'Impressed with the attention to detail.',
  'Reliable and trustworthy service.',
  'Explained everything clearly before starting.',
  'Completed on time and under budget.',
  'Clean facility and professional team.',
  'Best mechanic I have found in the area.',
  'Transparent pricing with no surprises.',
  'Took great care of my vehicle.',
  'Five star experience from start to finish.',
];

const PACKAGE_DESCRIPTIONS = [
  'Needs attention soon, looking for quality work at a fair price.',
  'Looking for a reliable shop to handle this service.',
  'Routine maintenance, prefer OEM parts if possible.',
  'Would like to get this taken care of this week.',
  'Recently noticed an issue, need a professional opinion.',
  'Scheduled maintenance per manufacturer recommendations.',
  'Looking for competitive pricing on this service.',
  'Want quality work with a warranty included.',
  'Need this done as soon as possible.',
  'Regular upkeep to keep my vehicle running smoothly.',
  'Dealership quoted too high, looking for alternatives.',
  'Previous mechanic retired, need a new trusted shop.',
  'Want to make sure everything is in good shape before a road trip.',
  'Check engine light came on, need diagnostics.',
  'Time for a tune-up, want thorough service.',
];

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[rand(0, arr.length - 1)]; }
function pickN(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}
function weightedPick(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
function padNum(n, len) { return String(n).padStart(len, '0'); }

function elapsed(start) {
  const s = ((Date.now() - start) / 1000).toFixed(1);
  return `${s}s`;
}

async function batchProcess(items, batchSize, fn) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(fn));
  }
}

async function bulkInsert(table, rows, batchSize = CONFIG.insertBatchSize, upsertKey = null) {
  let inserted = 0;
  const allResults = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    let query;
    if (upsertKey) {
      query = supabase.from(table).upsert(batch, { onConflict: upsertKey }).select('id');
    } else {
      query = supabase.from(table).insert(batch).select('id');
    }
    const { data, error } = await query;
    if (error) throw new Error(`Bulk insert into ${table} failed at row ${i}: ${error.message}`);
    inserted += batch.length;
    if (data) allResults.push(...data);
  }
  return allResults;
}

async function findSimUsers() {
  const allSimUsers = [];
  let page = 1;
  while (true) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    const users = data?.users || [];
    if (users.length === 0) break;
    allSimUsers.push(...users.filter(u => u.email && u.email.endsWith(SIM_DOMAIN)));
    if (users.length < 1000) break;
    page++;
  }
  return allSimUsers;
}

async function cleanup(simUsers) {
  if (!simUsers || simUsers.length === 0) {
    console.log('  No simulation data found to clean up.');
    return;
  }

  const ids = simUsers.map(u => u.id);
  console.log(`  Found ${ids.length} sim users to clean up...`);

  if (ids.length > 50 && !flag('force')) {
    console.log(`  WARNING: About to delete ${ids.length} users. Use --force to skip this check.`);
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(r => rl.question('  Continue? (y/N): ', r));
    rl.close();
    if (answer.toLowerCase() !== 'y') {
      console.log('  Aborted.');
      process.exit(0);
    }
  }

  const memberPkgs = await batchSelect('maintenance_packages', 'id', 'member_id', ids);
  const pkgIds = memberPkgs.map(p => p.id);

  if (pkgIds.length > 0) {
    for (let i = 0; i < pkgIds.length; i += 100) {
      const batch = pkgIds.slice(i, i + 100);
      await supabase.from('provider_reviews').delete().in('package_id', batch);
      await supabase.from('bids').delete().in('package_id', batch);
    }
    console.log(`  Deleted bids/reviews for ${pkgIds.length} packages`);
  }

  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    await supabase.from('bids').delete().in('provider_id', batch);
    await supabase.from('provider_reviews').delete().in('provider_id', batch);
    await supabase.from('provider_reviews').delete().in('member_id', batch);
    await supabase.from('provider_stats').delete().in('provider_id', batch);
    await supabase.from('maintenance_packages').delete().in('member_id', batch);
    await supabase.from('vehicles').delete().in('owner_id', batch);
    await supabase.from('provider_applications').delete().in('user_id', batch);
    await supabase.from('profiles').delete().in('id', batch);
  }
  console.log(`  Deleted profiles, vehicles, packages, applications`);

  let deleted = 0;
  for (let i = 0; i < simUsers.length; i += CONFIG.authBatchSize) {
    const batch = simUsers.slice(i, i + CONFIG.authBatchSize);
    await Promise.all(batch.map(async (u) => {
      const { error } = await supabase.auth.admin.deleteUser(u.id);
      if (error) console.error(`  Failed to delete auth user ${u.email}: ${error.message}`);
      else deleted++;
    }));
    process.stdout.write(`  Deleted ${deleted}/${simUsers.length} auth users\r`);
  }
  console.log(`  Deleted ${deleted}/${simUsers.length} auth users                `);
}

async function batchCount(table, column, ids, batchSize = 100) {
  let total = 0;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const { count } = await supabase.from(table).select('id', { count: 'exact', head: true }).in(column, batch);
    total += (count || 0);
  }
  return total;
}

async function batchSelect(table, columns, filterCol, ids, batchSize = 100) {
  const results = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const { data } = await supabase.from(table).select(columns).in(filterCol, batch);
    if (data) results.push(...data);
  }
  return results;
}

async function report() {
  const simUsers = await findSimUsers();
  const memberIds = [];
  const providerIds = [];

  for (const u of simUsers) {
    if (u.email.startsWith('sim-member-')) memberIds.push(u.id);
    else if (u.email.startsWith('sim-provider-')) providerIds.push(u.id);
  }

  let pkgCount = 0, bidCount = 0, vehicleCount = 0, reviewCount = 0;
  let statusCounts = {};

  if (memberIds.length > 0) {
    vehicleCount = await batchCount('vehicles', 'owner_id', memberIds);
    const pkgs = await batchSelect('maintenance_packages', 'id, status', 'member_id', memberIds);
    pkgCount = pkgs.length;
    statusCounts = pkgs.reduce((acc, p) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc; }, {});
    const pkgIds = pkgs.map(p => p.id);
    if (pkgIds.length > 0) {
      bidCount = await batchCount('bids', 'package_id', pkgIds);
      reviewCount = await batchCount('provider_reviews', 'package_id', pkgIds);
    }
  }

  console.log('\n=== Simulation Data Report ===');
  console.log(`  Members:    ${memberIds.length}`);
  console.log(`  Providers:  ${providerIds.length}`);
  console.log(`  Vehicles:   ${vehicleCount}`);
  console.log(`  Packages:   ${pkgCount}`);
  console.log(`  Bids:       ${bidCount}`);
  console.log(`  Reviews:    ${reviewCount}`);
  console.log(`  Statuses:   ${JSON.stringify(statusCounts)}`);
  console.log('==============================\n');
}

async function createAuthUser(email) {
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existing = (existingUsers?.users || []).find(u => u.email === email);
  if (existing) return existing.id;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: SIM_PASSWORD,
    email_confirm: true
  });
  if (error) throw new Error(`Failed to create ${email}: ${error.message}`);
  return data.user.id;
}

async function createAuthUsersBatch(emails) {
  const results = [];
  for (let i = 0; i < emails.length; i += CONFIG.authBatchSize) {
    const batch = emails.slice(i, i + CONFIG.authBatchSize);
    const batchResults = await Promise.all(
      batch.map(async (email) => {
        try {
          const { data, error } = await supabase.auth.admin.createUser({
            email,
            password: SIM_PASSWORD,
            email_confirm: true
          });
          if (error) {
            if (error.message.includes('already been registered') || error.message.includes('already exists')) {
              const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1 });
              const allSimUsers = await findSimUsersLazy();
              const found = allSimUsers.find(u => u.email === email);
              return found ? { email, id: found.id } : null;
            }
            console.error(`  Error creating ${email}: ${error.message}`);
            return null;
          }
          return { email, id: data.user.id };
        } catch (err) {
          console.error(`  Exception creating ${email}: ${err.message}`);
          return null;
        }
      })
    );
    results.push(...batchResults.filter(Boolean));
    process.stdout.write(`  Created ${results.length}/${emails.length} auth users\r`);
  }
  console.log(`  Created ${results.length}/${emails.length} auth users              `);
  return results;
}

let _cachedSimUsers = null;
async function findSimUsersLazy() {
  if (!_cachedSimUsers) {
    _cachedSimUsers = await findSimUsers();
  }
  return _cachedSimUsers;
}

async function main() {
  const totalStart = Date.now();

  if (flag('report')) {
    await report();
    return;
  }

  if (flag('dry-run')) {
    const totalJobs = CONFIG.members * CONFIG.jobsPerMember;
    const totalBids = totalJobs * CONFIG.bidsPerJob;
    const accepted = Math.round(totalJobs * CONFIG.acceptRate);
    const completed = Math.round(accepted * CONFIG.completeRate);
    console.log('\n=== Dry Run — What Would Be Created ===');
    console.log(`  Members:    ${CONFIG.members}`);
    console.log(`  Providers:  ${CONFIG.providers}`);
    console.log(`  Vehicles:   ~${CONFIG.members * 2} (1-2 per member)`);
    console.log(`  Packages:   ~${totalJobs}`);
    console.log(`  Bids:       ~${totalBids}`);
    console.log(`  Accepted:   ~${accepted}`);
    console.log(`  Completed:  ~${completed}`);
    console.log(`  Reviews:    ~${completed}`);
    console.log('========================================\n');
    return;
  }

  console.log('\n====================================================');
  console.log('  My Car Concierge — Platform Load Simulation');
  console.log('====================================================');
  console.log(`  Members: ${CONFIG.members} | Providers: ${CONFIG.providers}`);
  console.log(`  Jobs/member: ${CONFIG.jobsPerMember} | Bids/job: ${CONFIG.bidsPerJob}`);
  console.log('====================================================\n');

  console.log('[Phase 0/9] Cleaning up previous simulation data...');
  let phaseStart = Date.now();
  const existingSimUsers = await findSimUsers();
  _cachedSimUsers = null;
  await cleanup(existingSimUsers);
  console.log(`  Done (${elapsed(phaseStart)})\n`);

  if (flag('clean')) {
    console.log('Cleanup complete. Exiting (--clean mode).\n');
    return;
  }

  console.log(`[Phase 1/9] Creating ${CONFIG.providers} providers...`);
  phaseStart = Date.now();
  const providerEmails = [];
  for (let i = 1; i <= CONFIG.providers; i++) {
    providerEmails.push(`sim-provider-${padNum(i, 2)}${SIM_DOMAIN}`);
  }
  const providerAuthResults = await createAuthUsersBatch(providerEmails);
  const providerProfiles = providerAuthResults.map((r, i) => {
    const loc = pick(LOCATIONS);
    const services = pickN(SERVICE_TYPES.map(s => s.name), rand(2, 5));
    return {
      id: r.id,
      email: r.email,
      role: 'provider',
      full_name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      business_name: `${pick(BUSINESS_PREFIXES)} ${pick(BUSINESS_SUFFIXES)}`,
      phone: `555${padNum(i + 1, 3)}${padNum(rand(1000, 9999), 4)}`,
      city: loc.city,
      state: loc.state,
      zip_code: loc.zip,
      bid_credits: 150,
      free_trial_bids: 0,
      is_also_member: true,
      services_offered: services,
    };
  });
  await bulkInsert('profiles', providerProfiles, CONFIG.insertBatchSize, 'id');
  const providerApps = providerProfiles.map(p => ({
    user_id: p.id,
    business_name: p.business_name,
    phone: p.phone,
    city: p.city,
    state: p.state,
    services_offered: p.services_offered,
    status: 'approved',
  }));
  await bulkInsert('provider_applications', providerApps);
  console.log(`  Done — ${providerProfiles.length} providers (${elapsed(phaseStart)})\n`);

  console.log(`[Phase 2/9] Creating ${CONFIG.members} members...`);
  phaseStart = Date.now();
  const memberEmails = [];
  for (let i = 1; i <= CONFIG.members; i++) {
    memberEmails.push(`sim-member-${padNum(i, 4)}${SIM_DOMAIN}`);
  }
  const memberAuthResults = await createAuthUsersBatch(memberEmails);
  const memberProfiles = memberAuthResults.map((r, i) => {
    const loc = pick(LOCATIONS);
    return {
      id: r.id,
      email: r.email,
      role: 'member',
      full_name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      phone: `555${padNum(800 + i, 3)}${padNum(rand(1000, 9999), 4)}`,
      city: loc.city,
      state: loc.state,
      zip_code: loc.zip,
    };
  });
  await bulkInsert('profiles', memberProfiles, CONFIG.insertBatchSize, 'id');
  console.log(`  Done — ${memberProfiles.length} members (${elapsed(phaseStart)})\n`);

  console.log('[Phase 3/9] Creating vehicles...');
  phaseStart = Date.now();
  const vehicleRows = [];
  const memberVehicleMap = {};
  for (const m of memberProfiles) {
    const numVehicles = rand(1, 3);
    memberVehicleMap[m.id] = [];
    const chosen = pickN(VEHICLES, numVehicles);
    for (const v of chosen) {
      vehicleRows.push({
        owner_id: m.id,
        year: v.year,
        make: v.make,
        model: v.model,
        mileage: rand(5000, 120000),
        health_score: rand(60, 100),
      });
    }
  }
  const vehicleResults = await bulkInsert('vehicles', vehicleRows);
  for (let i = 0; i < vehicleRows.length; i++) {
    const ownerId = vehicleRows[i].owner_id;
    if (vehicleResults[i]?.id && memberVehicleMap[ownerId]) {
      memberVehicleMap[ownerId].push(vehicleResults[i].id);
    }
  }
  console.log(`  Done — ${vehicleRows.length} vehicles (${elapsed(phaseStart)})\n`);

  console.log('[Phase 4/9] Creating maintenance packages (jobs)...');
  phaseStart = Date.now();
  const packageRows = [];
  for (const m of memberProfiles) {
    const numJobs = rand(Math.max(1, CONFIG.jobsPerMember - 1), CONFIG.jobsPerMember + 1);
    const vids = memberVehicleMap[m.id] || [];
    if (vids.length === 0) continue;
    for (let j = 0; j < numJobs; j++) {
      const svc = pick(SERVICE_TYPES);
      const urgency = weightedPick(['critical', 'recommended', 'optional'], [10, 60, 30]);
      packageRows.push({
        member_id: m.id,
        vehicle_id: pick(vids),
        title: `${svc.name} — ${pick(VEHICLES).year} ${pick(VEHICLES).make}`,
        description: pick(PACKAGE_DESCRIPTIONS),
        service_type: svc.name,
        urgency,
        status: 'open',
        member_zip: m.zip_code,
      });
    }
  }
  const packageResults = await bulkInsert('maintenance_packages', packageRows);
  console.log(`  Done — ${packageRows.length} packages (${elapsed(phaseStart)})\n`);

  console.log('[Phase 5/9] Creating bids...');
  phaseStart = Date.now();
  const bidRows = [];
  const packageServiceMap = {};
  for (let i = 0; i < packageRows.length; i++) {
    const pkgId = packageResults[i]?.id;
    if (!pkgId) continue;
    packageServiceMap[pkgId] = packageRows[i].service_type;

    const svcInfo = SERVICE_TYPES.find(s => s.name === packageRows[i].service_type) || SERVICE_TYPES[0];
    const eligibleProviders = providerProfiles.filter(p =>
      (p.services_offered || []).includes(packageRows[i].service_type)
    );
    const allProviders = eligibleProviders.length > 0 ? eligibleProviders : providerProfiles;
    const minBids = Math.max(2, CONFIG.bidsPerJob - 1);
    const maxBids = CONFIG.bidsPerJob + 3;
    const numBids = Math.min(rand(minBids, maxBids), allProviders.length);
    const bidders = pickN(allProviders, numBids);

    for (const prov of bidders) {
      const price = rand(svcInfo.minPrice, svcInfo.maxPrice);
      bidRows.push({
        package_id: pkgId,
        provider_id: prov.id,
        price: price,
        description: `Professional ${svcInfo.name.toLowerCase()} service. Includes parts and labor with quality guarantee.`,
        estimated_time: `${rand(1, 8)} hours`,
        warranty_info: pick(['30-day warranty', '60-day warranty', '90-day warranty', '6-month warranty', '1-year warranty']),
        status: 'pending',
      });
    }
  }
  const bidResults = await bulkInsert('bids', bidRows);
  console.log(`  Done — ${bidRows.length} bids (${elapsed(phaseStart)})\n`);

  console.log('[Phase 6/9] Accepting bids (~30% of packages)...');
  phaseStart = Date.now();
  const pkgIdList = packageResults.map(p => p.id).filter(Boolean);
  const numToAccept = Math.round(pkgIdList.length * CONFIG.acceptRate);
  const toAccept = pickN(pkgIdList, numToAccept);
  let acceptedCount = 0;

  const bidsByPackage = {};
  for (let i = 0; i < bidRows.length; i++) {
    const bid = bidRows[i];
    const bidId = bidResults[i]?.id;
    if (!bidId) continue;
    if (!bidsByPackage[bid.package_id]) bidsByPackage[bid.package_id] = [];
    bidsByPackage[bid.package_id].push({ ...bid, id: bidId });
  }

  const acceptedWinners = {};

  for (let i = 0; i < toAccept.length; i += 50) {
    const batch = toAccept.slice(i, i + 50);
    await Promise.all(batch.map(async (pkgId) => {
      const bids = bidsByPackage[pkgId];
      if (!bids || bids.length === 0) return;
      const winner = pick(bids);
      acceptedWinners[pkgId] = winner;
      const loserIds = bids.filter(b => b.id !== winner.id).map(b => b.id);

      await supabase.from('bids').update({ status: 'accepted' }).eq('id', winner.id);
      if (loserIds.length > 0) {
        await supabase.from('bids').update({ status: 'rejected' }).in('id', loserIds);
      }
      await supabase.from('maintenance_packages')
        .update({ status: 'accepted', accepted_bid_id: winner.id })
        .eq('id', pkgId);
      acceptedCount++;
    }));
    process.stdout.write(`  Accepted ${Math.min(i + 50, toAccept.length)}/${toAccept.length}\r`);
  }
  console.log(`  Done — ${acceptedCount} packages accepted (${elapsed(phaseStart)})       \n`);

  console.log('[Phase 7/9] Completing jobs (~50% of accepted)...');
  phaseStart = Date.now();
  const numToComplete = Math.round(toAccept.length * CONFIG.completeRate);
  const toComplete = pickN(toAccept, numToComplete);
  let completedCount = 0;

  for (let i = 0; i < toComplete.length; i += 50) {
    const batch = toComplete.slice(i, i + 50);
    await Promise.all(batch.map(async (pkgId) => {
      await supabase.from('maintenance_packages')
        .update({ status: 'completed', member_confirmed_at: new Date().toISOString() })
        .eq('id', pkgId);
      completedCount++;
    }));
    process.stdout.write(`  Completed ${Math.min(i + 50, toComplete.length)}/${toComplete.length}\r`);
  }
  console.log(`  Done — ${completedCount} packages completed (${elapsed(phaseStart)})       \n`);

  console.log('[Phase 8/9] Adding provider reviews...');
  phaseStart = Date.now();
  const reviewRows = [];
  for (const pkgId of toComplete) {
    const winner = acceptedWinners[pkgId];
    if (!winner) continue;
    const pkg = packageRows[pkgIdList.indexOf(pkgId)];
    if (!pkg) continue;

    reviewRows.push({
      provider_id: winner.provider_id,
      member_id: pkg.member_id,
      package_id: pkgId,
      rating: rand(3, 5),
      review_text: pick(REVIEW_COMMENTS),
    });
  }
  let reviewsInserted = 0;
  if (reviewRows.length > 0) {
    try {
      await bulkInsert('provider_reviews', reviewRows);
      reviewsInserted = reviewRows.length;
    } catch (err) {
      console.log(`  Bulk review insert failed (${err.message}), falling back to individual inserts...`);
      for (const row of reviewRows) {
        const { error } = await supabase.from('provider_reviews').insert(row);
        if (!error) reviewsInserted++;
      }
      if (reviewsInserted === 0) {
        console.log(`  WARNING: Reviews could not be inserted (likely a database trigger issue).`);
        console.log(`  All other simulation data was created successfully.`);
      }
    }
  }
  console.log(`  Done — ${reviewsInserted}/${reviewRows.length} reviews (${elapsed(phaseStart)})\n`);

  console.log('[Phase 9/9] Upserting provider stats...');
  phaseStart = Date.now();
  const providerReviewCounts = {};
  for (const row of reviewRows) {
    if (!providerReviewCounts[row.provider_id]) {
      providerReviewCounts[row.provider_id] = { total: 0, sum: 0 };
    }
    providerReviewCounts[row.provider_id].total++;
    providerReviewCounts[row.provider_id].sum += row.rating;
  }
  const statsRows = Object.entries(providerReviewCounts).map(([providerId, counts]) => ({
    provider_id: providerId,
    total_reviews: counts.total,
    suspended: false,
  }));
  let statsUpserted = 0;
  if (statsRows.length > 0) {
    try {
      await bulkInsert('provider_stats', statsRows, CONFIG.insertBatchSize, 'provider_id');
      statsUpserted = statsRows.length;
    } catch (err) {
      console.log(`  Bulk stats upsert failed, falling back to individual upserts...`);
      for (const row of statsRows) {
        const { error } = await supabase.from('provider_stats').upsert(row, { onConflict: 'provider_id' });
        if (!error) statsUpserted++;
      }
    }
  }
  console.log(`  Done — ${statsUpserted} provider stats updated (${elapsed(phaseStart)})\n`);

  const totalTime = elapsed(totalStart);
  console.log('====================================================');
  console.log('  SIMULATION COMPLETE');
  console.log('====================================================');
  console.log(`  Members created:     ${memberProfiles.length}`);
  console.log(`  Providers created:   ${providerProfiles.length}`);
  console.log(`  Vehicles created:    ${vehicleRows.length}`);
  console.log(`  Packages created:    ${packageRows.length}`);
  console.log(`  Bids placed:         ${bidRows.length}`);
  console.log(`  Packages accepted:   ${acceptedCount}`);
  console.log(`  Packages completed:  ${completedCount}`);
  console.log(`  Reviews added:       ${reviewsInserted}`);
  console.log(`  Provider stats:      ${statsUpserted}`);
  console.log(`  Total runtime:       ${totalTime}`);
  console.log('====================================================\n');
}

main().catch(err => {
  console.error('\nSimulation failed:', err);
  process.exit(1);
});

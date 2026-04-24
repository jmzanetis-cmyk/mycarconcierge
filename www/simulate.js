#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const SIM_PREFIX = 'SIM-';
const SIM_EMAIL_DOMAIN = 'sim-mcc.test';
const SIM_RUN_ID = Date.now().toString(36);

const log = (msg) => console.log(`[SIM ${SIM_RUN_ID}] ${msg}`);
const logErr = (msg, err) => console.error(`[SIM ${SIM_RUN_ID}] ERROR: ${msg}`, err?.message || err);

const REALISTIC_MEMBERS = [
  { first: 'Sarah', last: 'Mitchell', city: 'Miami', state: 'FL', zip: '33101' },
  { first: 'James', last: 'Rodriguez', city: 'Tampa', state: 'FL', zip: '33602' },
  { first: 'Emily', last: 'Chen', city: 'Orlando', state: 'FL', zip: '32801' },
  { first: 'Michael', last: 'Thompson', city: 'Jacksonville', state: 'FL', zip: '32202' },
  { first: 'Olivia', last: 'Williams', city: 'Fort Lauderdale', state: 'FL', zip: '33301' },
  { first: 'David', last: 'Martinez', city: 'St. Petersburg', state: 'FL', zip: '33701' },
  { first: 'Jessica', last: 'Anderson', city: 'Boca Raton', state: 'FL', zip: '33431' },
  { first: 'Robert', last: 'Taylor', city: 'Naples', state: 'FL', zip: '34102' }
];

const REALISTIC_PROVIDERS = [
  { biz: 'Precision Auto Care', first: 'Carlos', last: 'Gomez', city: 'Miami', state: 'FL', zip: '33130', specialties: ['oil_change', 'brake_service', 'engine_repair'] },
  { biz: 'Sunshine Motors', first: 'Derek', last: 'Johnson', city: 'Tampa', state: 'FL', zip: '33609', specialties: ['oil_change', 'tire_service', 'ac_service'] },
  { biz: 'Gulf Coast Auto Works', first: 'Maria', last: 'Santos', city: 'Orlando', state: 'FL', zip: '32803', specialties: ['engine_repair', 'transmission', 'diagnostics'] },
  { biz: 'All-Pro Mechanics', first: 'Kevin', last: 'Wright', city: 'Fort Lauderdale', state: 'FL', zip: '33311', specialties: ['brake_service', 'suspension', 'alignment'] },
  { biz: 'Express Lube & Tire', first: 'Anthony', last: 'Harris', city: 'Jacksonville', state: 'FL', zip: '32207', specialties: ['oil_change', 'tire_service', 'fluid_service'] }
];

const VEHICLES = [
  { year: 2022, make: 'Toyota', model: 'Camry', trim: 'SE', color: 'Silver', mileage: 28500 },
  { year: 2021, make: 'Honda', model: 'Civic', trim: 'Sport', color: 'Blue', mileage: 35200 },
  { year: 2023, make: 'Tesla', model: 'Model 3', trim: 'Long Range', color: 'White', mileage: 12800 },
  { year: 2020, make: 'Ford', model: 'F-150', trim: 'XLT', color: 'Black', mileage: 52100 },
  { year: 2019, make: 'BMW', model: '330i', trim: 'M Sport', color: 'Alpine White', mileage: 45700 },
  { year: 2022, make: 'Hyundai', model: 'Tucson', trim: 'SEL', color: 'Red', mileage: 19400 },
  { year: 2021, make: 'Chevrolet', model: 'Silverado', trim: '1500 LT', color: 'Gray', mileage: 41000 },
  { year: 2023, make: 'Lexus', model: 'RX 350', trim: 'Premium', color: 'Obsidian', mileage: 8900 },
  { year: 2020, make: 'Jeep', model: 'Wrangler', trim: 'Sahara', color: 'Green', mileage: 38600 },
  { year: 2022, make: 'Mercedes-Benz', model: 'C300', trim: '4MATIC', color: 'Polar White', mileage: 22100 }
];

const SERVICE_REQUESTS = [
  { title: 'Full Synthetic Oil Change', category: 'oil_change', service_type: 'Oil Change', desc: 'Need a full synthetic oil change with filter replacement. Using Mobil 1 or equivalent.', freq: 'quarterly', parts: 'oem' },
  { title: 'Brake Pad Replacement - Front', category: 'brake_service', service_type: 'Brake Service', desc: 'Front brake pads are worn. Hearing slight squeaking. Need inspection and pad replacement.', freq: 'one_time', parts: 'oem' },
  { title: 'Tire Rotation & Balance', category: 'tire_service', service_type: 'Tire Service', desc: 'Routine tire rotation and balancing. All four tires. Check tread depth and pressure.', freq: 'biannual', parts: 'standard' },
  { title: 'AC System Recharge', category: 'ac_service', service_type: 'AC/Heating', desc: 'AC not blowing cold enough. Likely needs refrigerant recharge and leak inspection.', freq: 'one_time', parts: 'standard' },
  { title: 'Check Engine Light Diagnosis', category: 'diagnostics', service_type: 'Diagnostics', desc: 'Check engine light came on yesterday. Need full OBD-II scan and diagnosis. No noticeable performance issues yet.', freq: 'one_time', parts: 'standard' },
  { title: '60,000 Mile Service', category: 'routine_maintenance', service_type: 'Maintenance Package', desc: 'Full 60K mile service including fluids, filters, spark plugs, and comprehensive inspection.', freq: 'one_time', parts: 'oem' },
  { title: 'Transmission Fluid Exchange', category: 'fluid_service', service_type: 'Fluid Service', desc: 'Need complete transmission fluid exchange. Vehicle has 50K miles on original fluid.', freq: 'one_time', parts: 'oem' },
  { title: 'Battery Replacement', category: 'electrical', service_type: 'Electrical', desc: 'Battery is 4 years old and showing weak cranking. Need replacement with appropriate CCA rating.', freq: 'one_time', parts: 'standard' },
  { title: 'Suspension Inspection & Repair', category: 'suspension', service_type: 'Suspension', desc: 'Vehicle pulling to the right and hearing clunking over bumps. Need full suspension inspection.', freq: 'one_time', parts: 'oem' },
  { title: 'Pre-Purchase Vehicle Inspection', category: 'other', service_type: 'Inspection', desc: 'Buying a used car and need a thorough pre-purchase inspection. Full mechanical, electrical, and body check.', freq: 'one_time', parts: 'standard' }
];

const BID_NOTES = [
  "I can get this done same day. We use only top-quality parts and stand behind our work with a 12-month warranty.",
  "We specialize in this type of service. Free multi-point inspection included with every job.",
  "Quick turnaround time, usually 2-3 hours. We'll send photos of any issues found during the service.",
  "Competitive pricing with no hidden fees. ASE-certified technicians. Free shuttle service available.",
  "We can accommodate your schedule. Loaner vehicle available if the job takes longer than expected."
];

const REVIEW_TITLES = [
  "Excellent work, highly recommend!",
  "Great service, fair pricing",
  "Professional and thorough",
  "Very satisfied with the results",
  "Good experience overall",
  "Solid work, will return",
  "Went above and beyond",
  "Quick and efficient service",
  "Honest and reliable mechanics",
  "Top-notch auto care"
];

const REVIEW_TEXTS = [
  "They took great care of my car. Explained everything clearly and finished on time. Will definitely be coming back for future services.",
  "Fair pricing and excellent communication throughout the process. They even noticed an issue I didn't know about and fixed it at no extra charge.",
  "The team was professional from start to finish. My car runs like new. Highly recommend their services to anyone in the area.",
  "Very impressed with the quality of work. They sent me updates and photos during the service. Transparent and trustworthy.",
  "Easy to work with and very knowledgeable. They answered all my questions and provided a detailed explanation of the work performed.",
  "Great attention to detail. The shop was clean and organized. Staff was friendly and didn't try to upsell unnecessary services.",
  "Dropped off my car in the morning and it was ready by afternoon. The ride home was noticeably smoother. Thank you!",
  "Reasonable prices for the quality of service provided. They used OEM parts as requested and the warranty gives me peace of mind.",
  "I've been to several shops in the area and this is by far the best. Honest mechanics who actually care about their customers.",
  "Excellent turnaround time and kept me informed every step of the way. The final bill matched the estimate exactly. No surprises."
];

function randomEl(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomBetween(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomPrice(base, variance) { return Math.round((base + (Math.random() * variance * 2 - variance)) * 100) / 100; }
function uuid() { return crypto.randomUUID(); }
function simEmail(first, last) { return `${SIM_PREFIX}${first.toLowerCase()}.${last.toLowerCase()}@${SIM_EMAIL_DOMAIN}`; }

function pastDate(daysAgo, hoursVariance = 12) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(d.getHours() - randomBetween(0, hoursVariance));
  return d.toISOString();
}

async function createSimUser(email, password) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (error) {
    if (error.message?.includes('already been registered')) {
      const { data: existing } = await supabase.from('profiles').select('id').eq('email', email).single();
      if (existing) return existing.id;
      const { data: { users } } = await supabase.auth.admin.listUsers();
      const found = users?.find(u => u.email === email);
      if (found) return found.id;
    }
    throw error;
  }
  return data.user.id;
}

async function createMembers() {
  log('Creating member accounts...');
  const members = [];
  for (const m of REALISTIC_MEMBERS) {
    try {
      const email = simEmail(m.first, m.last);
      const userId = await createSimUser(email, 'SimPass123!');
      const profile = {
        id: userId,
        email,
        full_name: `${m.first} ${m.last}`,
        role: 'member',
        city: m.city,
        state: m.state,
        zip_code: m.zip,
        phone: `+1555${randomBetween(1000000, 9999999)}`,
        created_at: pastDate(randomBetween(30, 180))
      };
      const { error } = await supabase.from('profiles').upsert(profile);
      if (error) throw error;
      members.push({ ...profile, _meta: m });
      log(`  Member: ${m.first} ${m.last} (${email})`);
    } catch (err) {
      logErr(`Failed to create member ${m.first} ${m.last}`, err);
    }
  }
  return members;
}

async function createProviders() {
  log('Creating provider accounts...');
  const providers = [];
  for (const p of REALISTIC_PROVIDERS) {
    try {
      const email = simEmail(p.first, p.last);
      const userId = await createSimUser(email, 'SimPass123!');
      const profile = {
        id: userId,
        email,
        full_name: `${p.first} ${p.last}`,
        business_name: `${SIM_PREFIX}${p.biz}`,
        role: 'provider',
        city: p.city,
        state: p.state,
        zip_code: p.zip,
        phone: `+1555${randomBetween(1000000, 9999999)}`,
        bid_credits: 50,
        free_trial_bids: 10,
        created_at: pastDate(randomBetween(60, 365))
      };
      const { error } = await supabase.from('profiles').upsert(profile);
      if (error) throw error;
      await supabase.from('provider_stats').upsert({ provider_id: userId }, { onConflict: 'provider_id' });
      providers.push({ ...profile, _meta: p });
      log(`  Provider: ${p.biz} - ${p.first} ${p.last} (${email})`);
    } catch (err) {
      logErr(`Failed to create provider ${p.biz}`, err);
    }
  }
  return providers;
}

async function createVehicles(members) {
  log('Adding vehicles to member accounts...');
  const vehicles = [];
  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    const numVehicles = randomBetween(1, 2);
    for (let v = 0; v < numVehicles; v++) {
      const vehicleTemplate = VEHICLES[(i * 2 + v) % VEHICLES.length];
      try {
        const vehicleData = {
          owner_id: member.id,
          make: vehicleTemplate.make,
          model: vehicleTemplate.model,
          year: vehicleTemplate.year,
          trim: vehicleTemplate.trim,
          color: vehicleTemplate.color,
          mileage: vehicleTemplate.mileage + randomBetween(0, 5000),
          nickname: `${SIM_PREFIX}${member._meta.first}'s ${vehicleTemplate.model}`,
          health_score: randomBetween(70, 100),
          created_at: pastDate(randomBetween(7, 90))
        };
        const { data, error } = await supabase.from('vehicles').insert(vehicleData).select().single();
        if (error) throw error;
        vehicles.push({ ...data, _ownerId: member.id, _ownerName: member.full_name });
        log(`  Vehicle: ${vehicleTemplate.year} ${vehicleTemplate.make} ${vehicleTemplate.model} → ${member.full_name}`);
      } catch (err) {
        logErr(`Failed to add vehicle for ${member.full_name}`, err);
      }
    }
  }
  return vehicles;
}

async function createServiceRequests(members, vehicles) {
  log('Creating service requests (maintenance packages)...');
  const packages = [];
  const memberVehicleMap = {};
  for (const v of vehicles) {
    if (!memberVehicleMap[v._ownerId]) memberVehicleMap[v._ownerId] = [];
    memberVehicleMap[v._ownerId].push(v);
  }

  for (const member of members) {
    const memberVehicles = memberVehicleMap[member.id] || [];
    if (!memberVehicles.length) continue;
    const numRequests = randomBetween(1, 3);
    const usedRequests = new Set();

    for (let r = 0; r < numRequests; r++) {
      let reqIdx;
      do { reqIdx = randomBetween(0, SERVICE_REQUESTS.length - 1); } while (usedRequests.has(reqIdx) && usedRequests.size < SERVICE_REQUESTS.length);
      usedRequests.add(reqIdx);
      const req = SERVICE_REQUESTS[reqIdx];
      const vehicle = randomEl(memberVehicles);

      try {
        const packageData = {
          member_id: member.id,
          vehicle_id: vehicle.id,
          title: `${SIM_PREFIX}${req.title}`,
          description: `[SIM] ${req.desc}\n\nVehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}\nCategory: ${req.category}\nParts: ${req.parts}`,
          service_type: req.service_type,
          member_zip: member.zip_code,
          status: 'open',
          crowd_funded: false,
          created_at: pastDate(randomBetween(3, 30))
        };
        const { data, error } = await supabase.from('maintenance_packages').insert(packageData).select().single();
        if (error) throw error;
        packages.push({ ...data, _member: member, _vehicle: vehicle, _reqTemplate: req });
        log(`  Package: "${req.title}" for ${vehicle.year} ${vehicle.make} ${vehicle.model} (${member.full_name})`);
      } catch (err) {
        logErr(`Failed to create package for ${member.full_name}`, err);
      }
    }
  }
  return packages;
}

async function createBids(packages, providers) {
  log('Providers submitting bids...');
  const bids = [];
  const basePrices = {
    'oil_change': 75, 'brake_service': 350, 'tire_service': 80, 'ac_service': 180,
    'diagnostics': 120, 'routine_maintenance': 500, 'fluid_service': 200,
    'electrical': 180, 'suspension': 450, 'other': 200
  };

  for (const pkg of packages) {
    const numBidders = randomBetween(2, Math.min(4, providers.length));
    const shuffled = [...providers].sort(() => Math.random() - 0.5);
    const bidders = shuffled.slice(0, numBidders);

    for (const provider of bidders) {
      const basePrice = basePrices[pkg._reqTemplate?.category] || 200;
      const price = randomPrice(basePrice, basePrice * 0.3);
      const duration = randomEl(['1 hour', '2-3 hours', 'Half day', 'Full day', '1-2 days']);

      try {
        const bidData = {
          package_id: pkg.id,
          provider_id: provider.id,
          price: price,
          status: 'pending',
          created_at: new Date(new Date(pkg.created_at).getTime() + randomBetween(1, 48) * 3600000).toISOString()
        };
        const { data, error } = await supabase.from('bids').insert(bidData).select().single();
        if (error) throw error;
        bids.push({ ...data, _provider: provider, _package: pkg });
        log(`  Bid: $${price.toFixed(2)} by ${provider.business_name} on "${pkg.title}"`);
      } catch (err) {
        logErr(`Failed to create bid for ${provider.business_name}`, err);
      }
    }
  }
  return bids;
}

async function acceptBidsAndProgress(packages, bids) {
  log('Members accepting bids and progressing jobs...');
  const acceptedJobs = [];
  const packageBidMap = {};
  for (const b of bids) {
    if (!packageBidMap[b.package_id]) packageBidMap[b.package_id] = [];
    packageBidMap[b.package_id].push(b);
  }

  const packagesToAccept = packages.slice(0, Math.ceil(packages.length * 0.7));

  for (const pkg of packagesToAccept) {
    const pkgBids = packageBidMap[pkg.id];
    if (!pkgBids || pkgBids.length === 0) continue;

    pkgBids.sort((a, b) => a.price - b.price);
    const acceptIdx = Math.random() < 0.6 ? 0 : randomBetween(0, Math.min(1, pkgBids.length - 1));
    const winningBid = pkgBids[acceptIdx];

    try {
      const { error: bidErr } = await supabase.from('bids').update({
        status: 'accepted'
      }).eq('id', winningBid.id);
      if (bidErr) throw bidErr;

      for (const otherBid of pkgBids) {
        if (otherBid.id !== winningBid.id) {
          await supabase.from('bids').update({ status: 'rejected' }).eq('id', otherBid.id);
        }
      }

      const jobStatus = randomEl(['accepted', 'in_progress', 'completed', 'completed', 'completed']);

      const { error: pkgErr } = await supabase.from('maintenance_packages').update({
        status: jobStatus,
        accepted_bid_id: winningBid.id
      }).eq('id', pkg.id);
      if (pkgErr) throw pkgErr;

      acceptedJobs.push({
        package: pkg,
        bid: winningBid,
        provider: winningBid._provider,
        status: jobStatus
      });

      log(`  Accepted: "${pkg.title}" → ${winningBid._provider.business_name} ($${winningBid.price.toFixed(2)}) [${jobStatus}]`);
    } catch (err) {
      logErr(`Failed to accept bid for "${pkg.title}"`, err);
    }
  }
  return acceptedJobs;
}

async function createPaymentRecords(acceptedJobs) {
  log('Creating payment records for completed jobs...');
  const payments = [];
  const completedJobs = acceptedJobs.filter(j => j.status === 'completed');

  for (const job of completedJobs) {
    try {
      const paymentData = {
        package_id: job.package.id,
        member_id: job.package.member_id,
        provider_id: job.bid.provider_id,
        amount_total: job.bid.price,
        status: 'completed',
        stripe_payment_intent_id: `pi_sim_${SIM_RUN_ID}_${uuid().slice(0, 8)}`,
        created_at: pastDate(randomBetween(1, 14))
      };
      const { data, error } = await supabase.from('payments').insert(paymentData).select().single();
      if (error) throw error;
      payments.push({ ...data, _job: job });
      log(`  Payment: $${job.bid.price.toFixed(2)} for "${job.package.title}"`);
    } catch (err) {
      logErr(`Failed to create payment for "${job.package.title}"`, err);
    }
  }
  return payments;
}

async function createReviews(acceptedJobs) {
  log('Members leaving reviews for completed jobs...');
  const reviews = [];
  const completedJobs = acceptedJobs.filter(j => j.status === 'completed');
  const reviewableJobs = completedJobs.slice(0, Math.ceil(completedJobs.length * 0.8));

  for (const job of reviewableJobs) {
    const overall = randomBetween(3, 5);
    const quality = Math.min(5, Math.max(1, overall + randomBetween(-1, 1)));
    const communication = Math.min(5, Math.max(1, overall + randomBetween(-1, 1)));
    const timeliness = Math.min(5, Math.max(1, overall + randomBetween(-1, 1)));
    const value = Math.min(5, Math.max(1, overall + randomBetween(-1, 1)));

    try {
      const reviewData = {
        provider_id: job.bid.provider_id,
        member_id: job.package.member_id,
        package_id: job.package.id,
        rating: overall,
        review_text: `${randomEl(REVIEW_TITLES)} - ${randomEl(REVIEW_TEXTS)} (Quality: ${quality}/5, Communication: ${communication}/5, Timeliness: ${timeliness}/5, Value: ${value}/5)`,
        status: 'published',
        complaint_reason: overall <= 3 ? randomEl(['incomplete_work', 'damage_caused', 'unprofessional', 'no_show']) : null,
        created_at: pastDate(randomBetween(0, 10))
      };
      const { data, error } = await supabase.from('provider_reviews').insert(reviewData).select().single();
      if (error) throw error;
      reviews.push(data);
      log(`  Review: ${overall}/5 stars for ${job.provider.business_name} by ${job.package._member.full_name}`);
    } catch (err) {
      logErr(`Failed to create review for ${job.provider.business_name}`, err);
    }
  }

  log(`  Total reviews created: ${reviews.length}`);
  return reviews;
}

async function createNotifications(members, providers, acceptedJobs) {
  log('Creating notification records...');
  let count = 0;

  for (const job of acceptedJobs) {
    try {
      await supabase.from('notifications').insert({
        user_id: job.package.member_id,
        type: 'bid_received',
        title: 'New Bid Received',
        message: `${job.provider.business_name} submitted a bid of $${job.bid.price.toFixed(2)} for "${job.package.title}"`,
        read: Math.random() > 0.3,
        created_at: job.bid.created_at
      });
      count++;

      await supabase.from('notifications').insert({
        user_id: job.bid.provider_id,
        type: 'bid_accepted',
        title: 'Bid Accepted!',
        message: `Your bid for "${job.package.title}" has been accepted. Contact the member to schedule the service.`,
        read: Math.random() > 0.5,
        created_at: new Date().toISOString()
      });
      count++;

      if (job.status === 'completed') {
        await supabase.from('notifications').insert({
          user_id: job.package.member_id,
          type: 'job_completed',
          title: 'Service Completed',
          message: `${job.provider.business_name} has completed the service for "${job.package.title}". Please leave a review!`,
          read: Math.random() > 0.4,
          created_at: pastDate(randomBetween(0, 5))
        });
        count++;
      }
    } catch (err) {
      logErr(`Failed to create notification`, err);
    }
  }
  log(`  Created ${count} notifications`);
}

const OBD_CODES = [
  { code: 'P0300', desc: 'Random/Multiple Cylinder Misfire Detected' },
  { code: 'P0171', desc: 'System Too Lean (Bank 1)' },
  { code: 'P0420', desc: 'Catalyst System Efficiency Below Threshold' },
  { code: 'P0128', desc: 'Coolant Thermostat Below Regulating Temperature' },
  { code: 'P0455', desc: 'Evaporative Emission System Leak Detected (Large Leak)' },
  { code: 'P0401', desc: 'Exhaust Gas Recirculation Flow Insufficient' },
  { code: 'P0442', desc: 'Evaporative Emission System Leak Detected (Small Leak)' },
  { code: 'P0340', desc: 'Camshaft Position Sensor Circuit Malfunction' },
  { code: 'P0562', desc: 'System Voltage Low' },
  { code: 'P0700', desc: 'Transmission Control System Malfunction' },
  { code: 'P0301', desc: 'Cylinder 1 Misfire Detected' },
  { code: 'P0174', desc: 'System Too Lean (Bank 2)' },
  { code: 'P0113', desc: 'Intake Air Temperature Sensor High Input' },
  { code: 'P0505', desc: 'Idle Air Control System Malfunction' },
  { code: 'P0131', desc: 'O2 Sensor Circuit Low Voltage (Bank 1, Sensor 1)' }
];

const DREAM_CAR_SEARCHES = [
  { name: 'Family SUV Under $40k', makes: ['Toyota', 'Honda', 'Hyundai'], styles: ['suv'], minYear: 2021, maxPrice: 40000, maxMileage: 50000, features: ['backup_camera', 'apple_carplay', 'third_row'] },
  { name: 'Sporty Sedan', makes: ['BMW', 'Mercedes-Benz', 'Audi'], styles: ['sedan'], minYear: 2020, maxPrice: 55000, maxMileage: 40000, features: ['leather_seats', 'sunroof', 'sport_package'] },
  { name: 'Electric Daily Driver', makes: ['Tesla', 'Hyundai', 'Chevrolet'], styles: ['sedan', 'suv'], minYear: 2022, maxPrice: 50000, maxMileage: 30000, features: ['electric', 'autopilot', 'fast_charging'] },
  { name: 'Truck for Towing', makes: ['Ford', 'Chevrolet', 'Ram'], styles: ['truck'], minYear: 2020, maxPrice: 60000, maxMileage: 60000, features: ['tow_package', 'four_wheel_drive', 'bed_liner'] },
  { name: 'Luxury Under $35k', makes: ['Lexus', 'Acura', 'Genesis'], styles: ['sedan', 'suv'], minYear: 2019, maxPrice: 35000, maxMileage: 55000, features: ['leather_seats', 'heated_seats', 'premium_audio'] },
  { name: 'Fuel Efficient Commuter', makes: ['Toyota', 'Honda', 'Mazda'], styles: ['sedan', 'hatchback'], minYear: 2021, maxPrice: 28000, maxMileage: 40000, features: ['bluetooth', 'backup_camera', 'lane_assist'] }
];

const DREAM_CAR_MATCHES = [
  { year: 2022, make: 'Toyota', model: 'Highlander XLE', price: 36500, mileage: 28000, color: 'Celestial Silver', dealer: 'AutoNation Toyota', location: 'Miami, FL' },
  { year: 2023, make: 'Honda', model: 'CR-V EX-L', price: 34200, mileage: 15000, color: 'Crystal Black', dealer: 'Hendrick Honda', location: 'Tampa, FL' },
  { year: 2021, make: 'BMW', model: '330i M Sport', price: 38900, mileage: 32000, color: 'Alpine White', dealer: 'Fields BMW', location: 'Orlando, FL' },
  { year: 2023, make: 'Tesla', model: 'Model 3 Long Range', price: 42000, mileage: 8500, color: 'Pearl White', dealer: 'Tesla Direct', location: 'Fort Lauderdale, FL' },
  { year: 2022, make: 'Ford', model: 'F-150 XLT SuperCrew', price: 45800, mileage: 25000, color: 'Antimatter Blue', dealer: 'AutoNation Ford', location: 'Jacksonville, FL' },
  { year: 2021, make: 'Lexus', model: 'ES 350 Premium', price: 33500, mileage: 35000, color: 'Eminent White Pearl', dealer: 'Lexus of Coral Gables', location: 'Coral Gables, FL' },
  { year: 2022, make: 'Hyundai', model: 'Tucson SEL AWD', price: 29800, mileage: 22000, color: 'Amazon Gray', dealer: "Rick Case Hyundai", location: 'Davie, FL' },
  { year: 2023, make: 'Chevrolet', model: 'Bolt EUV Premier', price: 28500, mileage: 12000, color: 'Silver Flare', dealer: 'Bomnin Chevrolet', location: 'Homestead, FL' }
];

const TEAM_MEMBERS_DATA = [
  { name: 'Marcus Johnson', role: 'Lead Technician', bio: 'ASE Master Certified with 15 years experience in engine diagnostics and repair.', years: 15, certs: ['ASE Master', 'Toyota TechStream'], specs: ['engine_repair', 'diagnostics'] },
  { name: 'Lisa Nguyen', role: 'Service Advisor', bio: 'Customer-focused professional ensuring smooth communication between clients and technicians.', years: 8, certs: ['ASE C1'], specs: ['customer_service', 'scheduling'] },
  { name: 'Tony Ramirez', role: 'Brake & Suspension Specialist', bio: 'Expert in brake systems, suspension, and alignment with factory training from multiple OEMs.', years: 12, certs: ['ASE A5', 'Hunter Alignment'], specs: ['brake_service', 'suspension', 'alignment'] },
  { name: 'Chris Palmer', role: 'Tire Technician', bio: 'Fast and precise tire service including mounting, balancing, and TPMS programming.', years: 5, certs: ['TIA Certified'], specs: ['tire_service'] },
  { name: 'Angela Washington', role: 'Electrical Specialist', bio: 'Specializes in modern vehicle electrical systems, wiring, and computer diagnostics.', years: 10, certs: ['ASE A6', 'ASE L1'], specs: ['electrical', 'diagnostics'] },
  { name: 'Jake Morrison', role: 'Oil & Lube Tech', bio: 'Efficient and detail-oriented. Handles oil changes, fluid services, and preventive maintenance.', years: 3, certs: ['ASE A1'], specs: ['oil_change', 'fluid_service'] }
];

const MAINTENANCE_REMINDER_TYPES = [
  'Oil Change', 'Tire Rotation', 'Brake Inspection', 'Air Filter Replacement',
  'Coolant Flush', 'Transmission Service', 'Spark Plug Replacement',
  'Battery Check', 'Alignment Check', 'Cabin Filter Replacement'
];

function futureDate(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0];
}

async function createFounderReferrals(members, providers) {
  log('Creating founder referral & commission records...');
  let referralCount = 0;
  let commissionCount = 0;
  const founderProfileIds = [];

  const founders = members.slice(0, 3);
  let providerIdx = 0;
  let memberIdx = 4;

  for (const founder of founders) {
    try {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const code = 'SIM-MF' + Array.from({length: 6}, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');

      const { data: mfp, error: mfpErr } = await supabase.from('member_founder_profiles').insert({
        user_id: founder.id,
        full_name: founder.full_name,
        email: founder.email,
        referral_code: code,
        status: 'active',
        total_provider_referrals: 0,
        total_member_referrals: 0,
        total_commissions_earned: 0,
        total_commissions_paid: 0,
        pending_balance: 0
      }).select().single();

      if (mfpErr) { logErr(`Failed to create founder profile for ${founder.full_name}`, mfpErr); continue; }
      founderProfileIds.push(mfp.id);
      log(`  Founder profile: ${founder.full_name} (${code})`);

      const referredProviders = providers.slice(providerIdx, providerIdx + 2);
      providerIdx += 2;
      for (const provider of referredProviders) {
        try {
          await supabase.from('founder_referrals').insert({
            founder_id: mfp.id,
            referral_code: code,
            referred_type: 'provider',
            referred_name: provider.full_name,
            referred_email: provider.email,
            status: 'active',
            created_at: pastDate(randomBetween(30, 120))
          });
          referralCount++;
          log(`  Referral: ${founder.full_name} → ${provider.full_name} (provider)`);
        } catch (err) {
          logErr(`Failed to create referral for ${founder.full_name}`, err);
        }
      }

      if (memberIdx < members.length) {
        const referred = members[memberIdx];
        memberIdx++;
        try {
          await supabase.from('founder_referrals').insert({
            founder_id: mfp.id,
            referral_code: code,
            referred_type: 'member',
            referred_name: referred.full_name,
            referred_email: referred.email,
            status: 'active',
            created_at: pastDate(randomBetween(15, 90))
          });
          referralCount++;
          log(`  Referral: ${founder.full_name} → ${referred.full_name} (member)`);
        } catch (err) {
          logErr(`Failed to create member referral for ${founder.full_name}`, err);
        }
      }

      const numCommissions = randomBetween(2, 4);
      for (let c = 0; c < numCommissions; c++) {
        try {
          const purchaseAmount = randomEl([29.99, 49.99, 99.99, 149.99]);
          const commissionRate = 0.90;
          const commissionAmount = Math.round(purchaseAmount * commissionRate * 100) / 100;

          await supabase.from('founder_commissions').insert({
            founder_id: mfp.id,
            referred_provider_id: randomEl(providers).id,
            purchase_amount: purchaseAmount,
            original_amount: purchaseAmount,
            commission_rate: commissionRate,
            commission_amount: commissionAmount,
            transaction_id: `txn_sim_${SIM_RUN_ID}_${uuid().slice(0, 8)}_${c}`,
            status: randomEl(['pending', 'paid', 'paid']),
            commission_type: 'bid_pack',
            created_at: pastDate(randomBetween(5, 60))
          });
          commissionCount++;
        } catch (err) {
          logErr(`Failed to create commission for ${founder.full_name}`, err);
        }
      }
      log(`  Commissions for ${founder.full_name}: ${numCommissions}`);
    } catch (err) {
      logErr(`Failed to set up founder ${founder.full_name}`, err);
    }
  }

  log(`  Total referrals: ${referralCount}, commissions: ${commissionCount}`);
  return { referralCount, commissionCount, founderProfileIds };
}

async function createExpandedNotifications(members, providers, acceptedJobs, vehicles) {
  log('Creating expanded notification records...');
  let count = 0;

  const NOTIFICATION_TYPES = [
    { type: 'welcome', title: 'Welcome to My Car Concierge!', msg: 'Your account is all set. Start by adding your vehicle to get quotes from top providers.' },
    { type: 'vehicle_added', title: 'Vehicle Added Successfully', msg: (v) => `Your ${v.year} ${v.make} ${v.model} has been added to your garage.` },
    { type: 'bid_received', title: 'New Bid Received', msg: (j) => `${j.provider.business_name} submitted a bid of $${j.bid.price.toFixed(2)} for "${j.package.title}"` },
    { type: 'bid_accepted', title: 'Bid Accepted!', msg: (j) => `Your bid for "${j.package.title}" has been accepted. Contact the member to schedule.` },
    { type: 'job_started', title: 'Service In Progress', msg: (j) => `${j.provider.business_name} has started working on "${j.package.title}".` },
    { type: 'job_completed', title: 'Service Completed', msg: (j) => `${j.provider.business_name} has completed "${j.package.title}". Please leave a review!` },
    { type: 'payment_released', title: 'Payment Released', msg: (j) => `Payment of $${j.bid.price.toFixed(2)} has been released for "${j.package.title}".` },
    { type: 'review_posted', title: 'New Review Received', msg: (j) => `You received a new review for "${j.package.title}". Check your dashboard!` },
    { type: 'maintenance_reminder', title: 'Maintenance Due Soon', msg: (v) => `Your ${v.year} ${v.make} ${v.model} is due for an oil change. Schedule service today!` },
    { type: 'appointment_reminder', title: 'Upcoming Appointment', msg: 'You have a service appointment tomorrow at 9:00 AM. Don\'t forget to drop off your vehicle!' }
  ];

  for (const member of members) {
    try {
      await supabase.from('notifications').insert({
        user_id: member.id, type: 'welcome', title: NOTIFICATION_TYPES[0].title,
        message: NOTIFICATION_TYPES[0].msg, read: true, created_at: member.created_at
      });
      count++;
    } catch (err) { logErr('Failed to create welcome notification', err); }
  }

  for (const v of vehicles) {
    try {
      await supabase.from('notifications').insert({
        user_id: v._ownerId, type: 'vehicle_added', title: 'Vehicle Added Successfully',
        message: `Your ${v.year} ${v.make} ${v.model} has been added to your garage.`,
        read: true, created_at: v.created_at
      });
      count++;
    } catch (err) { logErr('Failed to create vehicle notification', err); }
  }

  for (const job of acceptedJobs) {
    try {
      await supabase.from('notifications').insert({
        user_id: job.package.member_id, type: 'bid_received', title: 'New Bid Received',
        message: `${job.provider.business_name} submitted a bid of $${job.bid.price.toFixed(2)} for "${job.package.title}"`,
        read: Math.random() > 0.3, created_at: job.bid.created_at
      });
      count++;

      await supabase.from('notifications').insert({
        user_id: job.bid.provider_id, type: 'bid_accepted', title: 'Bid Accepted!',
        message: `Your bid for "${job.package.title}" has been accepted.`,
        read: Math.random() > 0.5, created_at: pastDate(randomBetween(1, 20))
      });
      count++;

      if (['in_progress', 'completed'].includes(job.status)) {
        await supabase.from('notifications').insert({
          user_id: job.package.member_id, type: 'job_started', title: 'Service In Progress',
          message: `${job.provider.business_name} has started working on "${job.package.title}".`,
          read: Math.random() > 0.4, created_at: pastDate(randomBetween(1, 15))
        });
        count++;
      }

      if (job.status === 'completed') {
        await supabase.from('notifications').insert({
          user_id: job.package.member_id, type: 'job_completed', title: 'Service Completed',
          message: `${job.provider.business_name} has completed "${job.package.title}". Please leave a review!`,
          read: Math.random() > 0.4, created_at: pastDate(randomBetween(0, 10))
        });
        count++;

        await supabase.from('notifications').insert({
          user_id: job.bid.provider_id, type: 'payment_released', title: 'Payment Released',
          message: `Payment of $${job.bid.price.toFixed(2)} has been released for "${job.package.title}".`,
          read: Math.random() > 0.3, created_at: pastDate(randomBetween(0, 10))
        });
        count++;

        await supabase.from('notifications').insert({
          user_id: job.bid.provider_id, type: 'review_posted', title: 'New Review Received',
          message: `You received a new review for "${job.package.title}". Check your dashboard!`,
          read: Math.random() > 0.6, created_at: pastDate(randomBetween(0, 7))
        });
        count++;
      }
    } catch (err) { logErr('Failed to create job notification', err); }
  }

  for (const v of vehicles.slice(0, 4)) {
    try {
      await supabase.from('notifications').insert({
        user_id: v._ownerId, type: 'maintenance_reminder', title: 'Maintenance Due Soon',
        message: `Your ${v.year} ${v.make} ${v.model} is due for scheduled maintenance. Book a service today!`,
        read: false, created_at: pastDate(randomBetween(0, 3))
      });
      count++;
    } catch (err) { logErr('Failed to create maintenance reminder notification', err); }
  }

  for (const member of members.slice(0, 3)) {
    try {
      await supabase.from('notifications').insert({
        user_id: member.id, type: 'appointment_reminder', title: 'Upcoming Appointment',
        message: 'You have a service appointment tomorrow at 9:00 AM. Don\'t forget to drop off your vehicle!',
        read: false, created_at: pastDate(0)
      });
      count++;
    } catch (err) { logErr('Failed to create appointment notification', err); }
  }

  log(`  Created ${count} notifications (expanded)`);
  return count;
}

async function createDiagnosticScans(members, vehicles) {
  log('Creating OBD diagnostic scan records...');
  let scanCount = 0;

  const memberVehicles = {};
  for (const v of vehicles) {
    if (!memberVehicles[v._ownerId]) memberVehicles[v._ownerId] = [];
    memberVehicles[v._ownerId].push(v);
  }

  const scanMembers = members.slice(0, 5);
  for (const member of scanMembers) {
    const mvehicles = memberVehicles[member.id] || [];
    if (!mvehicles.length) continue;
    const vehicle = mvehicles[0];

    const numScans = randomBetween(1, 3);
    for (let s = 0; s < numScans; s++) {
      const numCodes = randomBetween(1, 3);
      const codes = [];
      const usedIdx = new Set();
      for (let c = 0; c < numCodes; c++) {
        let idx;
        do { idx = randomBetween(0, OBD_CODES.length - 1); } while (usedIdx.has(idx));
        usedIdx.add(idx);
        codes.push(OBD_CODES[idx].code);
      }

      try {
        await supabase.from('diagnostic_scans').insert({
          vehicle_id: vehicle.id,
          user_id: member.id,
          codes: codes,
          raw_input: codes.join(', '),
          source: randomEl(['manual', 'photo_ocr', 'manual']),
          notes: `[SIM] Scanned at ${randomEl(['AutoZone', 'O\'Reilly Auto Parts', 'FIXD device', 'home garage'])}. ${randomEl(['Check engine light on', 'Routine diagnostic check', 'After recent repair', 'Pre-trip inspection'])}`,
          created_at: pastDate(randomBetween(1, 45))
        });
        scanCount++;
        log(`  Scan: ${codes.join(', ')} for ${vehicle.year} ${vehicle.make} ${vehicle.model} (${member.full_name})`);
      } catch (err) {
        logErr(`Failed to create diagnostic scan for ${member.full_name}`, err);
      }
    }
  }

  log(`  Total diagnostic scans: ${scanCount}`);
  return scanCount;
}

async function createDreamCarSearches(members) {
  log('Creating Dream Car Finder searches & matches...');
  let searchCount = 0;
  let matchCount = 0;

  const searchMembers = members.slice(0, 4);
  for (let i = 0; i < searchMembers.length; i++) {
    const member = searchMembers[i];
    const searchTemplate = DREAM_CAR_SEARCHES[i % DREAM_CAR_SEARCHES.length];

    try {
      const { data: search, error } = await supabase.from('dream_car_searches').insert({
        user_id: member.id,
        search_name: `${SIM_PREFIX}${searchTemplate.name}`,
        min_year: searchTemplate.minYear,
        max_price: searchTemplate.maxPrice,
        max_mileage: searchTemplate.maxMileage,
        preferred_makes: searchTemplate.makes,
        body_styles: searchTemplate.styles,
        must_have_features: searchTemplate.features,
        zip_code: member.zip_code,
        max_distance_miles: randomEl([25, 50, 100]),
        search_frequency: randomEl(['daily', 'weekly']),
        notify_email: true,
        notify_sms: false,
        is_active: true,
        created_at: pastDate(randomBetween(5, 30))
      }).select().single();

      if (error) throw error;
      searchCount++;
      log(`  Search: "${searchTemplate.name}" by ${member.full_name}`);

      const numMatches = randomBetween(1, 3);
      const usedMatches = new Set();
      for (let m = 0; m < numMatches; m++) {
        let matchIdx;
        do { matchIdx = randomBetween(0, DREAM_CAR_MATCHES.length - 1); } while (usedMatches.has(matchIdx));
        usedMatches.add(matchIdx);
        const matchTemplate = DREAM_CAR_MATCHES[matchIdx];

        try {
          await supabase.from('dream_car_matches').insert({
            search_id: search.id,
            match_score: randomBetween(72, 98),
            vehicle_title: `${matchTemplate.year} ${matchTemplate.make} ${matchTemplate.model}`,
            price: matchTemplate.price,
            mileage: matchTemplate.mileage,
            exterior_color: matchTemplate.color,
            dealer_name: matchTemplate.dealer,
            location: matchTemplate.location,
            listing_url: `https://example.com/listing/${uuid().slice(0, 8)}`,
            is_saved: Math.random() > 0.5,
            is_dismissed: false,
            created_at: pastDate(randomBetween(1, 15))
          });
          matchCount++;
        } catch (err) {
          logErr(`Failed to create dream car match`, err);
        }
      }
    } catch (err) {
      logErr(`Failed to create dream car search for ${member.full_name}`, err);
    }
  }

  log(`  Dream Car searches: ${searchCount}, matches: ${matchCount}`);
  return { searchCount, matchCount };
}

async function createTeamMembers(providers) {
  log('Creating provider team members...');
  let teamCount = 0;

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    const numMembers = randomBetween(1, 3);
    const shuffledTeam = [...TEAM_MEMBERS_DATA].sort(() => Math.random() - 0.5);
    const teamSlice = shuffledTeam.slice(0, numMembers);

    for (const tm of teamSlice) {
      try {
        await supabase.from('team_members').insert({
          provider_id: provider.id,
          name: `${SIM_PREFIX}${tm.name}`,
          role: tm.role,
          bio: `[SIM] ${tm.bio}`,
          years_experience: tm.years,
          certifications: tm.certs,
          specialties: tm.specs,
          is_active: true,
          created_at: pastDate(randomBetween(10, 90))
        });
        teamCount++;
        log(`  Team: ${tm.name} (${tm.role}) → ${provider.business_name}`);
      } catch (err) {
        logErr(`Failed to create team member ${tm.name}`, err);
      }
    }
  }

  log(`  Total team members: ${teamCount}`);
  return teamCount;
}

async function createMaintenanceReminders(members, vehicles) {
  log('Creating maintenance reminders...');
  let reminderCount = 0;

  const memberVehicles = {};
  for (const v of vehicles) {
    if (!memberVehicles[v._ownerId]) memberVehicles[v._ownerId] = [];
    memberVehicles[v._ownerId].push(v);
  }

  for (const member of members) {
    const mvehicles = memberVehicles[member.id] || [];
    if (!mvehicles.length) continue;

    const numReminders = randomBetween(1, 2);
    const usedTypes = new Set();

    for (let r = 0; r < numReminders; r++) {
      let reminderType;
      do { reminderType = randomEl(MAINTENANCE_REMINDER_TYPES); } while (usedTypes.has(reminderType) && usedTypes.size < MAINTENANCE_REMINDER_TYPES.length);
      usedTypes.add(reminderType);

      const vehicle = randomEl(mvehicles);
      const daysAhead = randomBetween(3, 60);

      try {
        await supabase.from('maintenance_reminders').insert({
          member_id: member.id,
          vehicle_id: vehicle.id,
          reminder_type: reminderType,
          reminder_date: futureDate(daysAhead),
          notes: `[SIM] Scheduled ${reminderType.toLowerCase()} for ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
          status: 'pending',
          vehicle_info: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
          customer_name: member.full_name,
          created_at: pastDate(randomBetween(1, 14))
        });
        reminderCount++;
        log(`  Reminder: ${reminderType} in ${daysAhead}d for ${vehicle.year} ${vehicle.make} ${vehicle.model} (${member.full_name})`);
      } catch (err) {
        logErr(`Failed to create reminder for ${member.full_name}`, err);
      }
    }
  }

  log(`  Total reminders: ${reminderCount}`);
  return reminderCount;
}

// =====================================================
// ADMIN PORTAL & PLATFORM CONNECTIVITY SIMULATION
// =====================================================

async function createProviderApplications(providers) {
  log('Creating provider application records (admin portal)...');
  let appCount = 0;

  const serviceTypes = [
    ['Oil Change', 'Tire Rotation', 'Brake Service'],
    ['Engine Diagnostics', 'Transmission Repair', 'Electrical Systems'],
    ['Auto Detailing', 'Paint Protection', 'Ceramic Coating'],
    ['Collision Repair', 'Dent Removal', 'Paint Touch-up'],
    ['AC Repair', 'Heating System', 'Climate Control']
  ];

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    try {
      const status = i < 3 ? 'approved' : (i === 3 ? 'rejected' : 'pending');
      const insertData = {
        user_id: provider.id,
        business_name: `${SIM_PREFIX}${provider.full_name} Auto`,
        business_type: randomEl(['independent_shop', 'franchise', 'mobile_mechanic', 'dealership']),
        phone: `555-${String(100 + i).padStart(3, '0')}-${String(1000 + i * 111).slice(0, 4)}`,
        city: randomEl(['Miami', 'Tampa', 'Orlando', 'Jacksonville', 'Fort Lauderdale']),
        state: 'FL',
        services_offered: serviceTypes[i] || serviceTypes[0],
        years_in_business: randomBetween(2, 25),
        status: status,
        created_at: pastDate(randomBetween(30, 180))
      };

      if (status === 'approved') {
        insertData.reviewed_at = pastDate(randomBetween(5, 29));
        insertData.admin_notes = `SIM: Application reviewed and approved. All credentials verified.`;
        insertData.license_verified = true;
        insertData.insurance_verified = true;
      } else if (status === 'rejected') {
        insertData.reviewed_at = pastDate(randomBetween(5, 29));
        insertData.rejection_reason = 'SIM: Incomplete documentation - missing insurance certificate';
        insertData.admin_notes = 'SIM: Applicant notified to resubmit with valid insurance.';
      }

      const { error } = await supabase.from('provider_applications').insert(insertData);
      if (error) { logErr(`Failed to create application for ${provider.full_name}`, error); continue; }
      appCount++;
      log(`  Application: ${provider.full_name} → ${status}`);
    } catch (err) {
      logErr(`Failed to create application for ${provider.full_name}`, err);
    }
  }

  log(`  Total applications: ${appCount}`);
  return appCount;
}

async function simulateAdminBidCredits(providers) {
  log('Simulating admin bid credit adjustments...');
  let adjustCount = 0;

  for (const provider of providers) {
    try {
      const credits = randomBetween(10, 75);
      const { error } = await supabase.from('profiles')
        .update({ bid_credits: credits })
        .eq('id', provider.id);
      if (error) { logErr(`Failed to set credits for ${provider.full_name}`, error); continue; }
      adjustCount++;
      log(`  Credits: ${provider.full_name} → ${credits} bid credits`);
    } catch (err) {
      logErr(`Failed to adjust credits for ${provider.full_name}`, err);
    }
  }

  log(`  Total credit adjustments: ${adjustCount}`);
  return adjustCount;
}

async function simulateAdminSuspension(providers) {
  log('Simulating admin suspension workflow...');
  let suspendCount = 0;
  let liftCount = 0;

  if (providers.length < 2) { log('  Not enough providers for suspension sim'); return { suspendCount, liftCount }; }

  const targetProvider = providers[providers.length - 1];
  try {
    const { error: suspErr } = await supabase.from('provider_stats')
      .update({
        suspended: true,
        suspended_reason: 'SIM: Admin-triggered suspension for testing - low rating pattern detected',
        suspended_at: new Date().toISOString()
      })
      .eq('provider_id', targetProvider.id);

    if (!suspErr) {
      suspendCount++;
      log(`  Suspended: ${targetProvider.full_name} (admin action)`);

      await supabase.from('notifications').insert({
        user_id: targetProvider.id,
        type: 'suspension',
        title: 'Account Suspended',
        message: 'SIM: Your account has been suspended for review. Please contact support.',
        link: '/provider-dashboard.html?tab=ratings',
        created_at: new Date().toISOString()
      });

      const { error: liftErr } = await supabase.from('provider_stats')
        .update({
          suspended: false,
          suspended_reason: null,
          suspended_at: null,
          suspension_lifted_at: new Date().toISOString(),
          suspension_lifted_by: 'admin_sim'
        })
        .eq('provider_id', targetProvider.id);

      if (!liftErr) {
        liftCount++;
        log(`  Lifted: ${targetProvider.full_name} suspension lifted by admin`);

        await supabase.from('notifications').insert({
          user_id: targetProvider.id,
          type: 'suspension_lifted',
          title: 'Suspension Lifted',
          message: 'SIM: Your account suspension has been lifted. You may resume bidding.',
          link: '/provider-dashboard.html',
          created_at: new Date().toISOString()
        });
      }
    } else {
      logErr(`Failed to suspend ${targetProvider.full_name}`, suspErr);
    }
  } catch (err) {
    logErr(`Suspension workflow failed for ${targetProvider.full_name}`, err);
  }

  log(`  Suspensions: ${suspendCount}, Lifted: ${liftCount}`);
  return { suspendCount, liftCount };
}

async function createEscrowPayments(acceptedJobs) {
  log('Creating escrow payment lifecycle records...');
  let escrowCount = 0;
  let refundCount = 0;

  const completedJobs = acceptedJobs.filter(j => j.status === 'completed');
  if (completedJobs.length === 0) { log('  No completed jobs for escrow simulation'); return { escrowCount, refundCount }; }

  for (let i = 0; i < completedJobs.length; i++) {
    const job = completedJobs[i];
    try {
      const amount = parseFloat(job.bid.price || randomBetween(100, 500));
      const isRefund = i === completedJobs.length - 1;

      const escrowData = {
        package_id: job.package.id,
        member_id: job.package.member_id,
        provider_id: job.provider.id,
        amount: amount,
        stripe_payment_intent_id: `pi_sim_${SIM_RUN_ID}_${uuid().slice(0, 8)}`,
        status: isRefund ? 'refunded' : 'captured',
        created_at: pastDate(randomBetween(1, 30))
      };

      const { error } = await supabase.from('escrow_payments').insert(escrowData);
      if (error) { logErr(`Failed to create escrow for job ${job.package.id}`, error); continue; }
      escrowCount++;
      log(`  Escrow: $${amount.toFixed(2)} → ${isRefund ? 'REFUNDED' : 'CAPTURED'} (${job.provider.business_name})`);

      if (isRefund) {
        const { error: refErr } = await supabase.from('refunds').insert({
          package_id: job.package.id,
          amount_cents: Math.round(amount * 100),
          refund_type: 'full',
          reason: 'SIM: Service not completed to satisfaction - customer requested refund',
          status: 'processed',
          requested_by: job.package.member_id,
          approved_by: job.provider.id,
          created_at: new Date().toISOString()
        });
        if (!refErr) {
          refundCount++;
          log(`  Refund: $${amount.toFixed(2)} processed`);
        } else {
          logErr(`Failed to create refund record`, refErr);
        }
      }
    } catch (err) {
      logErr(`Escrow creation failed`, err);
    }
  }

  log(`  Total escrow payments: ${escrowCount}, Refunds: ${refundCount}`);
  return { escrowCount, refundCount };
}

async function createServiceAppointments(acceptedJobs) {
  log('Creating service appointment records...');
  let appointmentCount = 0;
  let checkinCount = 0;

  for (const job of acceptedJobs) {
    try {
      const daysFromNow = randomBetween(-10, 15);
      const proposedDate = new Date();
      proposedDate.setDate(proposedDate.getDate() + daysFromNow);
      const isConfirmed = daysFromNow < 0 || Math.random() > 0.4;
      const isPast = daysFromNow < 0;
      const timeStart = randomEl(['09:00', '10:00', '11:00', '13:00', '14:00', '15:00']);
      const hourNum = parseInt(timeStart.split(':')[0]);
      const timeEnd = `${String(hourNum + 2).padStart(2, '0')}:00`;

      const insertData = {
        package_id: job.package.id,
        provider_id: job.provider.id,
        member_id: job.package.member_id,
        proposed_date: proposedDate.toISOString().split('T')[0],
        proposed_time_start: timeStart,
        proposed_time_end: timeEnd,
        proposed_by: randomEl(['provider', 'member']),
        status: isConfirmed ? 'confirmed' : 'pending',
        created_at: pastDate(randomBetween(1, 20))
      };

      if (isConfirmed) {
        insertData.confirmed_date = insertData.proposed_date;
        insertData.confirmed_time_start = timeStart;
        insertData.confirmed_time_end = timeEnd;
        insertData.confirmed_at = pastDate(randomBetween(1, 15));
      }

      const { error } = await supabase.from('service_appointments').insert(insertData);
      if (error) { logErr(`Failed to create appointment for ${job.provider.business_name}`, error); continue; }
      appointmentCount++;
      log(`  Appointment: ${job.package.title || 'Service'} @ ${job.provider.business_name} → ${isConfirmed ? 'confirmed' : 'pending'}`);

      if (isPast && isConfirmed && Math.random() > 0.3) {
        await supabase.from('maintenance_packages')
          .update({
            checkin_at: proposedDate.toISOString(),
            checkin_method: 'qr_scan'
          })
          .eq('id', job.package.id);
        checkinCount++;
        log(`  QR Check-in: checked in via QR scan for ${job.package.title || 'service'}`);
      }
    } catch (err) {
      logErr(`Appointment creation failed`, err);
    }
  }

  log(`  Total appointments: ${appointmentCount}, QR check-ins: ${checkinCount}`);
  return { appointmentCount, checkinCount };
}

async function verifyPlatformConnectivity(members, providers, acceptedJobs) {
  log('=== PLATFORM CONNECTIVITY VERIFICATION ===');
  let passed = 0;
  let failed = 0;

  const check = async (name, fn) => {
    try {
      const result = await fn();
      if (result) {
        passed++;
        log(`  ✓ ${name}`);
      } else {
        failed++;
        log(`  ✗ ${name} - FAILED`);
      }
    } catch (err) {
      failed++;
      log(`  ✗ ${name} - ERROR: ${err.message}`);
    }
  };

  await check('Provider profiles have correct role', async () => {
    const { data } = await supabase.from('profiles').select('role').in('id', providers.map(p => p.id));
    return data && data.every(p => p.role === 'provider');
  });

  await check('Member profiles have correct role', async () => {
    const { data } = await supabase.from('profiles').select('role').in('id', members.map(m => m.id));
    return data && data.every(p => p.role === 'member');
  });

  await check('Provider stats exist for all providers', async () => {
    const { data } = await supabase.from('provider_stats').select('provider_id').in('provider_id', providers.map(p => p.id));
    return data && data.length === providers.length;
  });

  await check('All vehicles linked to valid members', async () => {
    const { data } = await supabase.from('vehicles').select('owner_id').like('nickname', `${SIM_PREFIX}%`);
    const memberIds = new Set(members.map(m => m.id));
    return data && data.every(v => memberIds.has(v.owner_id));
  });

  await check('Bids reference valid packages and providers', async () => {
    const { data } = await supabase.from('bids').select('provider_id, package_id').in('provider_id', providers.map(p => p.id));
    return data && data.length > 0;
  });

  await check('Accepted jobs have matching bid records', async () => {
    const acceptedPkgIds = acceptedJobs.map(j => j.package.id);
    if (acceptedPkgIds.length === 0) return true;
    const { data } = await supabase.from('maintenance_packages').select('id, accepted_bid_id').in('id', acceptedPkgIds);
    return data && data.filter(p => p.accepted_bid_id).length > 0;
  });

  await check('Notifications delivered to sim users', async () => {
    const allIds = [...members.map(m => m.id), ...providers.map(p => p.id)];
    const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).in('user_id', allIds);
    return count > 0;
  });

  await check('Founder profiles link to valid members', async () => {
    const { data } = await supabase.from('member_founder_profiles').select('user_id').in('user_id', members.map(m => m.id));
    return data && data.length > 0;
  });

  await check('Commissions link to valid founder profiles', async () => {
    const { data: profiles } = await supabase.from('member_founder_profiles').select('id').in('user_id', members.map(m => m.id));
    if (!profiles || profiles.length === 0) return false;
    const { data: comms } = await supabase.from('founder_commissions').select('id').in('founder_id', profiles.map(p => p.id));
    return comms && comms.length > 0;
  });

  await check('Provider applications match provider profiles', async () => {
    const { data } = await supabase.from('provider_applications').select('user_id, status').in('user_id', providers.map(p => p.id));
    return data && data.length > 0;
  });

  await check('Escrow payments reference valid packages', async () => {
    const { data } = await supabase.from('escrow_payments').select('id, package_id').in('member_id', members.map(m => m.id));
    return data && data.length > 0;
  });

  await check('Reviews link to valid providers and members', async () => {
    const { data } = await supabase.from('provider_reviews').select('id').in('provider_id', providers.map(p => p.id));
    return data && data.length > 0;
  });

  await check('Diagnostic scans link to valid vehicles', async () => {
    const { data: vehicles } = await supabase.from('vehicles').select('id').in('owner_id', members.map(m => m.id));
    if (!vehicles || vehicles.length === 0) return false;
    const { data: scans } = await supabase.from('diagnostic_scans').select('id').in('vehicle_id', vehicles.map(v => v.id));
    return scans && scans.length > 0;
  });

  await check('Bid credits set on provider profiles', async () => {
    const { data } = await supabase.from('profiles').select('bid_credits').in('id', providers.map(p => p.id));
    return data && data.some(p => p.bid_credits > 0);
  });

  await check('Service appointments reference valid jobs', async () => {
    const pkgIds = acceptedJobs.map(j => j.package.id);
    if (pkgIds.length === 0) return true;
    const { data } = await supabase.from('service_appointments').select('id').in('package_id', pkgIds);
    return data && data.length > 0;
  });

  log('');
  log(`  Connectivity Results: ${passed} passed, ${failed} failed out of ${passed + failed} checks`);
  return { passed, failed };
}

async function runSimulation() {
  log('=== MY CAR CONCIERGE - ACTIVITY SIMULATION ===');
  log(`Run ID: ${SIM_RUN_ID}`);
  log('');

  const members = await createMembers();
  if (members.length === 0) { logErr('No members created, aborting'); return; }

  const providers = await createProviders();
  if (providers.length === 0) { logErr('No providers created, aborting'); return; }

  const vehicles = await createVehicles(members);
  if (vehicles.length === 0) { logErr('No vehicles created, aborting'); return; }

  const packages = await createServiceRequests(members, vehicles);
  if (packages.length === 0) { logErr('No packages created, aborting'); return; }

  const bids = await createBids(packages, providers);

  const acceptedJobs = await acceptBidsAndProgress(packages, bids);

  const payments = await createPaymentRecords(acceptedJobs);

  const reviews = await createReviews(acceptedJobs);

  const { referralCount, commissionCount, founderProfileIds } = await createFounderReferrals(members, providers);

  const notifCount = await createExpandedNotifications(members, providers, acceptedJobs, vehicles);

  const scanCount = await createDiagnosticScans(members, vehicles);

  const { searchCount, matchCount } = await createDreamCarSearches(members);

  const teamCount = await createTeamMembers(providers);

  const reminderCount = await createMaintenanceReminders(members, vehicles);

  // --- Admin Portal & Platform Connectivity ---
  const appCount = await createProviderApplications(providers);

  const creditAdjustments = await simulateAdminBidCredits(providers);

  const { suspendCount, liftCount } = await simulateAdminSuspension(providers);

  const { escrowCount, refundCount } = await createEscrowPayments(acceptedJobs);

  const { appointmentCount, checkinCount } = await createServiceAppointments(acceptedJobs);

  const { passed, failed } = await verifyPlatformConnectivity(members, providers, acceptedJobs);

  log('');
  log('=== SIMULATION SUMMARY ===');
  log('--- Core Flow ---');
  log(`  Members created:       ${members.length}`);
  log(`  Providers created:     ${providers.length}`);
  log(`  Vehicles added:        ${vehicles.length}`);
  log(`  Service requests:      ${packages.length}`);
  log(`  Bids submitted:        ${bids.length}`);
  log(`  Jobs accepted:         ${acceptedJobs.length}`);
  log(`  Jobs completed:        ${acceptedJobs.filter(j => j.status === 'completed').length}`);
  log(`  Payments recorded:     ${payments.length}`);
  log(`  Reviews submitted:     ${reviews.length}`);
  log('--- Features ---');
  log(`  Founder referrals:     ${referralCount}`);
  log(`  Founder commissions:   ${commissionCount}`);
  log(`  Notifications:         ${notifCount}`);
  log(`  OBD diagnostic scans:  ${scanCount}`);
  log(`  Dream Car searches:    ${searchCount}`);
  log(`  Dream Car matches:     ${matchCount}`);
  log(`  Team members:          ${teamCount}`);
  log(`  Maint. reminders:      ${reminderCount}`);
  log('--- Admin Portal ---');
  log(`  Provider applications: ${appCount}`);
  log(`  Bid credit adjustments:${creditAdjustments}`);
  log(`  Suspensions triggered: ${suspendCount}`);
  log(`  Suspensions lifted:    ${liftCount}`);
  log(`  Escrow payments:       ${escrowCount}`);
  log(`  Refunds processed:     ${refundCount}`);
  log(`  Appointments:          ${appointmentCount}`);
  log(`  QR check-ins:          ${checkinCount}`);
  log('--- Platform Connectivity ---');
  log(`  Checks passed:         ${passed}`);
  log(`  Checks failed:         ${failed}`);
  log('');
  log('All simulation accounts use password: SimPass123!');
  log(`All simulation data prefixed with: ${SIM_PREFIX}`);
  log(`Email domain: ${SIM_EMAIL_DOMAIN}`);
  log('=== SIMULATION COMPLETE ===');
}

async function cleanupSimulation() {
  log('=== CLEANING UP SIMULATION DATA ===');

  const { data: simProfiles } = await supabase.from('profiles')
    .select('id, email, role')
    .like('email', `%@${SIM_EMAIL_DOMAIN}`);

  if (!simProfiles || simProfiles.length === 0) {
    log('No simulation data found.');
    return;
  }

  const simUserIds = simProfiles.map(p => p.id);
  log(`Found ${simProfiles.length} simulation accounts to clean up`);

  const { data: simPackages } = await supabase.from('maintenance_packages').select('id').in('member_id', simUserIds);
  const simPackageIds = (simPackages || []).map(p => p.id);
  log(`  Found ${simPackageIds.length} simulation packages`);

  const deleteFrom = async (table, col, ids) => {
    if (!ids.length) return;
    const { error, count } = await supabase.from(table).delete({ count: 'exact' }).in(col, ids);
    if (error) logErr(`Failed to clean ${table}.${col}`, error);
    else log(`  Deleted from ${table}: ${count || 0} rows`);
  };

  await deleteFrom('service_appointments', 'member_id', simUserIds);
  await deleteFrom('service_appointments', 'provider_id', simUserIds);
  if (simPackageIds.length > 0) {
    await deleteFrom('refunds', 'package_id', simPackageIds);
    await deleteFrom('escrow_payments', 'package_id', simPackageIds);
  }
  await deleteFrom('provider_applications', 'user_id', simUserIds);
  await deleteFrom('notifications', 'user_id', simUserIds);
  await deleteFrom('provider_reviews', 'member_id', simUserIds);
  await deleteFrom('provider_reviews', 'provider_id', simUserIds);
  await deleteFrom('payments', 'member_id', simUserIds);
  await deleteFrom('payments', 'provider_id', simUserIds);
  const { data: simFounderProfiles } = await supabase.from('member_founder_profiles').select('id').in('user_id', simUserIds);
  const simFounderIds = (simFounderProfiles || []).map(f => f.id);
  if (simFounderIds.length > 0) {
    await deleteFrom('founder_commissions', 'founder_id', simFounderIds);
    await deleteFrom('founder_referrals', 'founder_id', simFounderIds);
    await deleteFrom('member_founder_profiles', 'id', simFounderIds);
  }
  const { data: simSearches } = await supabase.from('dream_car_searches').select('id').in('user_id', simUserIds);
  const simSearchIds = (simSearches || []).map(s => s.id);
  if (simSearchIds.length > 0) {
    await deleteFrom('dream_car_matches', 'search_id', simSearchIds);
  }
  await deleteFrom('dream_car_searches', 'user_id', simUserIds);
  await deleteFrom('team_members', 'provider_id', simUserIds);
  await deleteFrom('maintenance_reminders', 'member_id', simUserIds);

  const { data: simVehicles } = await supabase.from('vehicles').select('id').in('owner_id', simUserIds);
  const simVehicleIds = (simVehicles || []).map(v => v.id);
  if (simVehicleIds.length > 0) {
    await deleteFrom('diagnostic_scans', 'vehicle_id', simVehicleIds);
  }

  try {
    await supabase.from('maintenance_packages').update({ accepted_bid_id: null }).in('member_id', simUserIds);
    log('  Cleared accepted_bid_id references');
  } catch (err) {}

  if (simPackageIds.length > 0) {
    await deleteFrom('bids', 'package_id', simPackageIds);
  }
  await deleteFrom('bids', 'provider_id', simUserIds);
  await deleteFrom('maintenance_packages', 'member_id', simUserIds);
  await deleteFrom('vehicles', 'owner_id', simUserIds);
  await deleteFrom('provider_stats', 'provider_id', simUserIds);

  const { error: profileErr } = await supabase.from('profiles').delete().in('id', simUserIds);
  if (profileErr) logErr('Failed to clean profiles', profileErr);
  else log(`  Deleted ${simProfiles.length} simulation profiles`);

  for (const profile of simProfiles) {
    try {
      await supabase.auth.admin.deleteUser(profile.id);
      log(`  Deleted auth user: ${profile.email}`);
    } catch (err) {
      logErr(`Failed to delete auth user ${profile.email}`, err);
    }
  }

  log('=== CLEANUP COMPLETE ===');
}

const command = process.argv[2];
if (command === 'cleanup') {
  cleanupSimulation().catch(err => { logErr('Cleanup failed', err); process.exit(1); });
} else if (command === 'run' || !command) {
  runSimulation().catch(err => { logErr('Simulation failed', err); process.exit(1); });
} else {
  console.log('Usage: node simulate.js [run|cleanup]');
  console.log('  run     - Run the activity simulation (default)');
  console.log('  cleanup - Remove all simulation data');
}

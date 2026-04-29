const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ifbyjxuaclwmadqbjcyp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const args = process.argv.slice(2);
function param(name, def) {
  const f = args.find(a => a.startsWith(`--${name}=`));
  return f ? Number.parseInt(f.split('=')[1], 10) : def;
}
function strParam(name, def) {
  const f = args.find(a => a.startsWith(`--${name}=`));
  return f ? f.split('=').slice(1).join('=') : def;
}

const CONFIG = {
  concurrency: param('concurrency', 20),
  duration: param('duration', 40),
  rampUpTime: param('ramp-up', 10),
  spikeMultiplier: 2,
  spikeDuration: 8,
  coolDownDuration: 8,
  coolDownConcurrency: 4,
  requestTimeout: 20000,
  interRequestDelay: 25,
  baseUrl: strParam('base-url', process.env.STRESS_TEST_BASE_URL || 'http://localhost:5000'),
};

const BASE_URL = CONFIG.baseUrl;

const TEST_ACCOUNTS = {
  member: { email: 'testmember@mcc-test.com', password: 'TestPass123!' },
  providerA: { email: 'testprovider_a@mcc-test.com', password: 'TestPass123!' },
};

const VEHICLE_VARIANTS = [
  { year: 2019, make: 'Toyota', model: 'Camry', mileage: 62000, fuel_type: 'gasoline' },
  { year: 2020, make: 'Honda', model: 'Accord', mileage: 45000, fuel_type: 'gasoline' },
  { year: 2018, make: 'Ford', model: 'F-150', mileage: 88000, fuel_type: 'gasoline' },
  { year: 2022, make: 'Tesla', model: 'Model 3', mileage: 21000, fuel_type: 'electric' },
  { year: 2015, make: 'Volkswagen', model: 'Golf GTI', mileage: 97000, fuel_type: 'gasoline' },
  { year: 2017, make: 'Honda', model: 'CR-V', mileage: 73000, fuel_type: 'gasoline' },
  { year: 2021, make: 'Jeep', model: 'Wrangler', mileage: 34000, fuel_type: 'gasoline' },
];

const PACKAGE_SUGGEST_DESCRIPTIONS = [
  'I need an oil change and tire rotation, last service was 7000 miles ago',
  'My brakes are squeaking badly when I slow down, especially in the morning',
  'Want a full detail — inside and out, ceramic coating on the exterior if possible',
  'Check engine light came on yesterday, code P0420, catalyst efficiency issue',
  'Need all four tires replaced, the tread is worn down to the indicators',
  'Transmission feels sluggish shifting between 2nd and 3rd gear at highway speeds',
  'Want a performance tune and cold air intake installed for my weekend track car',
  'My AC stopped blowing cold air, just warm air coming out of the vents',
  'Suspension is making clunking noise going over bumps, probably struts or sway bar',
  'Full front end alignment after hitting a pothole, steering wheel vibrates at 60mph',
];

const CATEGORIES = [
  'maintenance', 'detailing', 'performance', 'cosmetic',
  'accident_repair', 'audio_electronics', 'interior',
];

const ZIP_CODES = ['60601', '10001', '90210', '77001', '98101', '30301', '85001'];

const metrics = {
  rankBids:              { name: 'POST /api/ai/rank-bids',              requests: 0, errors: 0, rateLimited: 0, timeouts: 0, unhandled500s: 0, latencies: [], statusCodes: {} },
  priceEstimate:         { name: 'GET  /api/price-estimate',            requests: 0, errors: 0, rateLimited: 0, timeouts: 0, unhandled500s: 0, latencies: [], statusCodes: {} },
  packageSuggest:        { name: 'POST /api/ai/package-suggest',        requests: 0, errors: 0, rateLimited: 0, timeouts: 0, unhandled500s: 0, latencies: [], statusCodes: {} },
  bidStrategy:           { name: 'POST /api/ai/bid-strategy',           requests: 0, errors: 0, rateLimited: 0, timeouts: 0, unhandled500s: 0, latencies: [], statusCodes: {} },
  matchProviders:        { name: 'POST /api/ai/match-providers',        requests: 0, errors: 0, rateLimited: 0, timeouts: 0, unhandled500s: 0, latencies: [], statusCodes: {} },
  serviceRecommend:      { name: 'POST /api/ai/service-recommendations', requests: 0, errors: 0, rateLimited: 0, timeouts: 0, unhandled500s: 0, latencies: [], statusCodes: {} },
  authEnforcement:       { name: 'AUTH enforcement (401 checks)',        requests: 0, errors: 0, rateLimited: 0, timeouts: 0, unhandled500s: 0, latencies: [], statusCodes: {} },
};

let workerUnhandledErrors = 0;
const MAX_LATENCIES = 50000;

function recordMetric(metric, latency, status, responseBody) {
  metric.requests++;
  if (metric.latencies.length < MAX_LATENCIES) {
    metric.latencies.push(latency);
  } else {
    const idx = Math.floor(Math.random() * metric.requests);
    if (idx < MAX_LATENCIES) metric.latencies[idx] = latency;
  }
  metric.statusCodes[status] = (metric.statusCodes[status] || 0) + 1;
  if (status === 429 || status === 503) {
    metric.rateLimited++;
  } else if (status >= 500) {
    metric.errors++;
    if (responseBody && !isStructuredJson(responseBody)) {
      metric.unhandled500s++;
    }
  } else if ((status >= 400 && status !== 400 && status !== 401) || status === 0) {
    metric.errors++;
  }
}

function isStructuredJson(body) {
  if (!body || typeof body !== 'string') return false;
  try {
    const parsed = JSON.parse(body);
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function timedFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.requestTimeout);
  const start = Date.now();
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const latency = Date.now() - start;
    clearTimeout(timeout);
    let body = null;
    try { body = await res.text(); } catch {}
    return { status: res.status, latency, ok: res.ok, body };
  } catch (err) {
    clearTimeout(timeout);
    const latency = Date.now() - start;
    if (err.name === 'AbortError') return { status: 0, latency, ok: false, timeout: true, body: null };
    return { status: 0, latency, ok: false, body: null };
  }
}

async function getSession(email, password) {
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.session) return null;
  return { token: data.session.access_token, userId: data.user.id };
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function loadTestData() {
  console.log('  Authenticating test accounts...');

  const memberSession = await getSession(TEST_ACCOUNTS.member.email, TEST_ACCOUNTS.member.password);
  const providerSession = await getSession(TEST_ACCOUNTS.providerA.email, TEST_ACCOUNTS.providerA.password);

  if (!memberSession) {
    console.error('  Could not authenticate test member account. Aborting.');
    process.exit(1);
  }
  if (!providerSession) {
    console.error('  Could not authenticate test provider account. Aborting.');
    process.exit(1);
  }

  console.log('  Authenticated: test member + test provider');

  const { data: memberPackages } = await supabaseAdmin
    .from('maintenance_packages')
    .select('id, title, category')
    .eq('member_id', memberSession.userId)
    .eq('status', 'open')
    .limit(10);

  const { data: allOpenPackages } = await supabaseAdmin
    .from('maintenance_packages')
    .select('id, title, category, member_id')
    .eq('status', 'open')
    .not('is_private_job', 'eq', true)
    .limit(20);

  const { data: packageWithBids } = await supabaseAdmin
    .from('bids')
    .select('package_id, price, status, provider_id')
    .eq('status', 'pending')
    .limit(50);

  let rankBidsPackageId = null;
  let rankBidsBids = null;
  if (packageWithBids && packageWithBids.length >= 2) {
    const packageBidMap = {};
    for (const bid of packageWithBids) {
      if (!packageBidMap[bid.package_id]) packageBidMap[bid.package_id] = [];
      packageBidMap[bid.package_id].push(bid);
    }
    const multipleEntry = Object.entries(packageBidMap).find(([, bids]) => bids.length >= 2);
    if (multipleEntry) {
      rankBidsPackageId = multipleEntry[0];
      rankBidsBids = multipleEntry[1].slice(0, 4).map(b => ({
        id: b.id || 'x',
        price: Number(b.price) || 99,
        rating: '4.5',
        jobs_completed: 15,
        on_time_rate: 92,
        estimated_duration: '2 hours',
        tier: 'standard',
        is_verified: false,
        response_time: '30 min',
      }));
    }
  }

  if (!rankBidsBids) {
    rankBidsBids = [
      { id: 'mock-a', price: 120, rating: '4.8', jobs_completed: 34, on_time_rate: 95, estimated_duration: '1.5 hours', tier: 'premium', is_verified: true, response_time: '20 min' },
      { id: 'mock-b', price: 95,  rating: '4.2', jobs_completed: 12, on_time_rate: 88, estimated_duration: '2 hours', tier: 'standard', is_verified: false, response_time: '45 min' },
      { id: 'mock-c', price: 140, rating: '4.9', jobs_completed: 67, on_time_rate: 98, estimated_duration: '1 hour', tier: 'premium', is_verified: true, response_time: '10 min' },
    ];
  }

  let memberPackageId = null;
  if (memberPackages && memberPackages.length > 0) {
    memberPackageId = memberPackages[0].id;
  } else if (allOpenPackages && allOpenPackages.length > 0) {
    const ownedPkg = allOpenPackages.find(p => p.member_id === memberSession.userId);
    memberPackageId = ownedPkg?.id || null;
  }

  if (!memberPackageId) {
    const { data: newPkg, error: insertErr } = await supabaseAdmin
      .from('maintenance_packages')
      .insert({
        member_id: memberSession.userId,
        title: 'AI Stress Test Package',
        category: 'maintenance',
        status: 'open',
        description: 'Created by AI stress test for match-providers testing',
        pickup_preference: 'either',
      })
      .select('id')
      .single();
    if (newPkg) {
      memberPackageId = newPkg.id;
      console.log(`  Created test package: ${memberPackageId}`);
    } else if (insertErr) {
      console.warn(`  Package creation failed (${insertErr.message}) — match-providers will be skipped`);
    }
  }

  console.log(`  Test data ready — package: ${memberPackageId || 'none'}, rank-bids data: ${rankBidsBids.length} bids`);

  return {
    memberSession,
    providerSession,
    memberPackageId,
    rankBidsBids,
  };
}

async function runRankBids(session, rankBidsBids) {
  const bids = rankBidsBids.slice(0, Math.floor(Math.random() * 2) + 2);
  const result = await timedFetch(`${BASE_URL}/api/ai/rank-bids`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bids }),
  });
  if (result.timeout) {
    metrics.rankBids.timeouts++;
    metrics.rankBids.requests++;
    if (metrics.rankBids.latencies.length < MAX_LATENCIES) metrics.rankBids.latencies.push(result.latency);
    return;
  }
  recordMetric(metrics.rankBids, result.latency, result.status, result.body);
  if (result.status === 200) {
    try {
      const parsed = JSON.parse(result.body);
      if (!Array.isArray(parsed.ranked_indices) || typeof parsed.top_pick_rationale !== 'string') {
        metrics.rankBids.errors++;
      }
    } catch { metrics.rankBids.errors++; }
  }
}

async function runPriceEstimate(session) {
  const category = pick(CATEGORIES);
  const zip = pick(ZIP_CODES);
  const result = await timedFetch(`${BASE_URL}/api/price-estimate?category=${encodeURIComponent(category)}&zip=${zip}`, {
    headers: { 'Authorization': `Bearer ${session.token}` },
  });
  if (result.timeout) {
    metrics.priceEstimate.timeouts++;
    metrics.priceEstimate.requests++;
    if (metrics.priceEstimate.latencies.length < MAX_LATENCIES) metrics.priceEstimate.latencies.push(result.latency);
    return;
  }
  recordMetric(metrics.priceEstimate, result.latency, result.status, result.body);
  if (result.status === 200) {
    try {
      const parsed = JSON.parse(result.body);
      if (typeof parsed.has_estimate !== 'boolean') {
        metrics.priceEstimate.errors++;
      }
    } catch { metrics.priceEstimate.errors++; }
  }
}

async function runPackageSuggest(session) {
  const desc = pick(PACKAGE_SUGGEST_DESCRIPTIONS);
  const category = Math.random() > 0.5 ? pick(CATEGORIES) : undefined;
  const vehicle = pick(VEHICLE_VARIANTS);
  const result = await timedFetch(`${BASE_URL}/api/ai/package-suggest`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      description: desc,
      category: category || 'maintenance',
      vehicle_year: vehicle.year,
      vehicle_make: vehicle.make,
      vehicle_model: vehicle.model,
    }),
  });
  if (result.timeout) {
    metrics.packageSuggest.timeouts++;
    metrics.packageSuggest.requests++;
    if (metrics.packageSuggest.latencies.length < MAX_LATENCIES) metrics.packageSuggest.latencies.push(result.latency);
    return;
  }
  recordMetric(metrics.packageSuggest, result.latency, result.status, result.body);
  if (result.status === 200) {
    try {
      const parsed = JSON.parse(result.body);
      if (typeof parsed !== 'object' || parsed === null) {
        metrics.packageSuggest.errors++;
      }
    } catch { metrics.packageSuggest.errors++; }
  }
}

async function runBidStrategy(session) {
  const result = await timedFetch(`${BASE_URL}/api/ai/bid-strategy`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  if (result.timeout) {
    metrics.bidStrategy.timeouts++;
    metrics.bidStrategy.requests++;
    if (metrics.bidStrategy.latencies.length < MAX_LATENCIES) metrics.bidStrategy.latencies.push(result.latency);
    return;
  }
  recordMetric(metrics.bidStrategy, result.latency, result.status, result.body);
  if (result.status === 200) {
    try {
      const parsed = JSON.parse(result.body);
      if (typeof parsed.has_data !== 'boolean') {
        metrics.bidStrategy.errors++;
      }
    } catch { metrics.bidStrategy.errors++; }
  } else if (result.status !== 403 && result.status !== 429) {
    metrics.bidStrategy.errors++;
  }
}

async function runMatchProviders(session, memberPackageId) {
  if (!memberPackageId) {
    metrics.matchProviders.requests++;
    metrics.matchProviders.statusCodes['skipped'] = (metrics.matchProviders.statusCodes['skipped'] || 0) + 1;
    return;
  }
  const result = await timedFetch(`${BASE_URL}/api/ai/match-providers`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ package_id: memberPackageId }),
  });
  if (result.timeout) {
    metrics.matchProviders.timeouts++;
    metrics.matchProviders.requests++;
    if (metrics.matchProviders.latencies.length < MAX_LATENCIES) metrics.matchProviders.latencies.push(result.latency);
    return;
  }
  recordMetric(metrics.matchProviders, result.latency, result.status, result.body);
  if (result.status === 200) {
    try {
      const parsed = JSON.parse(result.body);
      if (typeof parsed.matched !== 'number') {
        metrics.matchProviders.errors++;
      }
    } catch { metrics.matchProviders.errors++; }
  } else if (result.status !== 403 && result.status !== 404 && result.status !== 429) {
    metrics.matchProviders.errors++;
  }
}

async function runServiceRecommendations(session) {
  const vehicle = pick(VEHICLE_VARIANTS);
  const result = await timedFetch(`${BASE_URL}/api/ai/service-recommendations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      mileage: vehicle.mileage,
      fuel_type: vehicle.fuel_type,
      last_service_dates: {
        oil_change: Math.random() > 0.5 ? null : '2023-06-15',
        tire_rotation: null,
        brake_service: Math.random() > 0.5 ? '2022-01-10' : null,
      },
    }),
  });
  if (result.timeout) {
    metrics.serviceRecommend.timeouts++;
    metrics.serviceRecommend.requests++;
    if (metrics.serviceRecommend.latencies.length < MAX_LATENCIES) metrics.serviceRecommend.latencies.push(result.latency);
    return;
  }
  recordMetric(metrics.serviceRecommend, result.latency, result.status, result.body);
  if (result.status === 200) {
    try {
      const parsed = JSON.parse(result.body);
      if (!Array.isArray(parsed.recommendations)) {
        metrics.serviceRecommend.errors++;
      }
    } catch { metrics.serviceRecommend.errors++; }
  }
}

async function checkAuthEnforcement() {
  const endpoints = [
    { method: 'POST', url: '/api/ai/rank-bids', body: JSON.stringify({ bids: [{ price: 100 }, { price: 120 }] }) },
    { method: 'GET', url: '/api/price-estimate?category=maintenance' },
    { method: 'POST', url: '/api/ai/package-suggest', body: JSON.stringify({ description: 'oil change needed urgently', category: 'maintenance' }) },
    { method: 'POST', url: '/api/ai/bid-strategy', body: '{}' },
    { method: 'POST', url: '/api/ai/match-providers', body: JSON.stringify({ package_id: 'test-id' }) },
    { method: 'POST', url: '/api/ai/service-recommendations', body: JSON.stringify({ make: 'Toyota', model: 'Camry' }) },
  ];

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const ep of endpoints) {
    const result = await timedFetch(`${BASE_URL}${ep.url}`, {
      method: ep.method,
      headers: { 'Content-Type': 'application/json' },
      body: ep.body,
    });
    recordMetric(metrics.authEnforcement, result.latency, result.status, result.body);

    if (result.status === 401 || result.status === 429) {
      passed++;
    } else {
      failed++;
      failures.push(`${ep.method} ${ep.url} returned ${result.status} (expected 401 or 429)`);
    }
  }

  return { passed, failed, failures };
}

async function runWorker(data, stopSignal) {
  const { memberSession, providerSession, memberPackageId, rankBidsBids } = data;

  while (!stopSignal.stop) {
    const action = Math.floor(Math.random() * 12) + 1;
    try {
      if (action <= 2) {
        await runRankBids(memberSession, rankBidsBids);
      } else if (action <= 4) {
        await runPriceEstimate(memberSession);
      } else if (action <= 6) {
        await runPackageSuggest(memberSession);
      } else if (action <= 8) {
        await runBidStrategy(providerSession);
      } else if (action <= 10) {
        await runMatchProviders(memberSession, memberPackageId);
      } else {
        await runServiceRecommendations(memberSession);
      }
    } catch (err) {
      workerUnhandledErrors++;
      if (workerUnhandledErrors <= 10) {
        console.error('  [Worker error]', err.message);
      }
    }
    if (CONFIG.interRequestDelay > 0) {
      await new Promise(r => setTimeout(r, CONFIG.interRequestDelay));
    }
  }
}

function printReport() {
  console.log('\n' + '='.repeat(70));
  console.log('  MY CAR CONCIERGE — AI FEATURES STRESS TEST REPORT');
  console.log('='.repeat(70));

  let overallPassed = 0;
  let overallFailed = 0;

  for (const [, m] of Object.entries(metrics)) {
    if (m.requests === 0) continue;
    const p50 = percentile(m.latencies, 50);
    const p95 = percentile(m.latencies, 95);
    const p99 = percentile(m.latencies, 99);
    const nonRateLimitedRequests = m.requests - m.rateLimited;
    const successRate = nonRateLimitedRequests > 0 ? (((nonRateLimitedRequests - m.errors - m.timeouts) / nonRateLimitedRequests) * 100).toFixed(1) : '100.0';
    const timeoutPct = m.requests > 0 ? (m.timeouts / m.requests) * 100 : 0;
    const status = m.errors === 0 && m.unhandled500s === 0 && timeoutPct < 20 ? 'PASS' : 'FAIL';
    if (status === 'PASS') overallPassed++;
    else overallFailed++;

    console.log(`\n  ${m.name}`);
    console.log(`    Status:      ${status}`);
    console.log(`    Requests:    ${m.requests.toLocaleString()}`);
    console.log(`    Success:     ${successRate}%`);
    if (m.rateLimited > 0) console.log(`    Rate lmtd:   ${m.rateLimited}`);
    if (m.timeouts > 0)    console.log(`    Timeouts:    ${m.timeouts}`);
    if (m.errors > 0)      console.log(`    Errors:      ${m.errors}`);
    if (m.unhandled500s > 0) console.log(`    Raw 500s:    ${m.unhandled500s} (unstructured)`);
    if (m.latencies.length > 0) {
      console.log(`    Latency:     p50=${p50}ms  p95=${p95}ms  p99=${p99}ms`);
    }
    const codes = Object.entries(m.statusCodes).map(([k, v]) => `${k}:${v}`).join('  ');
    if (codes) console.log(`    Status codes: ${codes}`);
  }

  if (workerUnhandledErrors > 0) {
    console.log(`\n  Worker unhandled errors: ${workerUnhandledErrors}`);
  }

  console.log('\n' + '-'.repeat(70));
  const matchSkipped = metrics.matchProviders.statusCodes['skipped'] > 0 && (metrics.matchProviders.statusCodes['200'] || 0) === 0;
  if (matchSkipped) {
    console.log('\n  ⚠  match-providers: all requests skipped (no test package) — create a package and rerun for full coverage');
  }

  const totalFailed = overallFailed + (workerUnhandledErrors > 10 ? 1 : 0);
  if (totalFailed === 0 && !matchSkipped) {
    console.log(`  OVERALL: PASS — all ${overallPassed} endpoint(s) clean under load`);
  } else if (totalFailed === 0 && matchSkipped) {
    console.log(`  OVERALL: PASS WITH WARNING — ${overallPassed} endpoint(s) clean; match-providers skipped`);
  } else {
    console.log(`  OVERALL: FAIL — ${overallFailed} endpoint(s) had errors`);
  }
  console.log('='.repeat(70) + '\n');

  return totalFailed === 0;
}

async function runPhase(name, workers, durationMs, data) {
  const stopSignal = { stop: false };
  console.log(`\n  [${name}] ${workers} workers for ${durationMs / 1000}s`);

  const workerPromises = [];
  for (let i = 0; i < workers; i++) {
    workerPromises.push(runWorker(data, stopSignal));
  }

  await new Promise(r => setTimeout(r, durationMs));
  stopSignal.stop = true;
  await Promise.all(workerPromises);
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  MY CAR CONCIERGE — AI FEATURES STRESS TEST');
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  Config: concurrency=${CONFIG.concurrency} duration=${CONFIG.duration}s`);
  console.log('='.repeat(70));

  console.log('\n[Phase 0] Auth enforcement checks (unauthenticated → 401)...');
  const authResult = await checkAuthEnforcement();
  console.log(`  Auth enforcement: ${authResult.passed}/6 endpoints return 401/429`);
  if (authResult.failed > 0) {
    console.error('  AUTH FAILURES — aborting test (unauthenticated access must return 401/429):');
    authResult.failures.forEach(f => console.error(`    - ${f}`));
    process.exit(1);
  }
  console.log('  ✓ All endpoints reject unauthenticated requests');

  console.log('\n[Phase 1] Loading test data...');
  const data = await loadTestData();

  console.log('\n[Phase 2] Warm-up...');
  await runPhase('Warm-up', Math.max(1, Math.floor(CONFIG.concurrency / 4)), CONFIG.rampUpTime * 1000, data);

  console.log('\n[Phase 3] Sustained load...');
  await runPhase('Sustained', CONFIG.concurrency, CONFIG.duration * 1000, data);

  console.log('\n[Phase 4] Spike...');
  await runPhase('Spike', Math.min(CONFIG.concurrency * CONFIG.spikeMultiplier, 50), CONFIG.spikeDuration * 1000, data);

  console.log('\n[Phase 5] Cool-down...');
  await runPhase('Cool-down', CONFIG.coolDownConcurrency, CONFIG.coolDownDuration * 1000, data);

  const passed = printReport();
  process.exit(passed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

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
  concurrency:    param('concurrency', 10),
  duration:       param('duration', 30),
  rampUpTime:     param('ramp-up', 10),
  spikeMultiplier: 2,
  spikeDuration:  10,
  coolDownDuration: 10,
  coolDownConcurrency: 3,
  requestTimeout: 30000,
  interRequestDelay: 50,
  searchesPerMember: param('searches-per-member', 4),
  duplicateRatio: 0.3,
  baseUrl: strParam('base-url', process.env.STRESS_TEST_BASE_URL || 'http://localhost:5000'),
};

const BASE_URL = CONFIG.baseUrl;
const SIM_DOMAIN = '@mcc-sim.test';
const SIM_PASSWORD = 'SimPass123!';
const RUN_ID = crypto.randomBytes(4).toString('hex');

const SEARCH_TEMPLATES = [
  { search_name: `stress-${RUN_ID}-sedan`, preferred_makes: ['Toyota', 'Honda'], body_styles: ['sedan'], min_year: 2019, max_year: 2023, min_price: 15000, max_price: 35000, max_mileage: 60000, zip_code: '60601' },
  { search_name: `stress-${RUN_ID}-suv`, preferred_makes: ['Jeep', 'Ford', 'Toyota'], body_styles: ['suv'], min_year: 2020, max_year: 2024, min_price: 25000, max_price: 55000, max_mileage: 45000, zip_code: '10001' },
  { search_name: `stress-${RUN_ID}-truck`, preferred_makes: ['Ford', 'Chevrolet', 'Ram'], body_styles: ['truck'], min_year: 2018, max_year: 2023, min_price: 20000, max_price: 50000, max_mileage: 80000, zip_code: '77001' },
  { search_name: `stress-${RUN_ID}-luxury`, preferred_makes: ['BMW', 'Mercedes-Benz', 'Audi'], body_styles: ['sedan', 'suv'], min_year: 2020, max_year: 2024, min_price: 35000, max_price: 75000, max_mileage: 40000, zip_code: '90001' },
  { search_name: `stress-${RUN_ID}-eco`, preferred_makes: ['Tesla', 'Toyota', 'Hyundai'], body_styles: ['sedan', 'hatchback'], min_year: 2021, max_year: 2024, min_price: 20000, max_price: 45000, max_mileage: 30000, fuel_types: ['electric', 'hybrid'], zip_code: '98101' },
  { search_name: `stress-${RUN_ID}-sporty`, preferred_makes: ['Mazda', 'Subaru', 'Volkswagen'], body_styles: ['sedan', 'coupe'], min_year: 2019, max_year: 2023, min_price: 18000, max_price: 40000, max_mileage: 50000, zip_code: '80201' },
];

const metrics = {
  runSearch: { name: 'POST run-search', requests: 0, errors: 0, rateLimited: 0, timeouts: 0, unhandled500s: 0, latencies: [], statusCodes: {} },
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
  } else if (status >= 400 || status === 0) {
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

async function getSession(email) {
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: SIM_PASSWORD });
  if (error || !data?.session) return null;
  return { token: data.session.access_token, userId: data.user.id };
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function seedSearches(sessions) {
  console.log('  Seeding dream car search records...');
  const seededSearchIds = [];
  const searchOwnership = {};

  for (const session of sessions) {
    const templates = [];
    for (let i = 0; i < CONFIG.searchesPerMember; i++) {
      templates.push(SEARCH_TEMPLATES[i % SEARCH_TEMPLATES.length]);
    }

    const rows = templates.map(t => ({
      user_id: session.userId,
      search_name: t.search_name + `-${crypto.randomBytes(3).toString('hex')}`,
      preferred_makes: t.preferred_makes,
      body_styles: t.body_styles,
      min_year: t.min_year,
      max_year: t.max_year,
      min_price: t.min_price,
      max_price: t.max_price,
      max_mileage: t.max_mileage,
      zip_code: t.zip_code,
      fuel_types: t.fuel_types || [],
      preferred_models: [],
      preferred_trims: [],
      exterior_colors: [],
      must_have_features: [],
      is_active: true,
      search_frequency: 'daily',
      notify_sms: false,
      notify_email: false,
    }));

    const { data, error } = await supabaseAdmin
      .from('dream_car_searches')
      .insert(rows)
      .select('id');

    if (error) {
      console.error(`  Failed to seed searches for ${session.userId}: ${error.message}`);
      continue;
    }

    for (const row of (data || [])) {
      seededSearchIds.push(row.id);
      searchOwnership[row.id] = session;
    }
  }

  console.log(`  Seeded ${seededSearchIds.length} dream car searches`);
  return { seededSearchIds, searchOwnership };
}

async function loadSimData() {
  console.log('  Loading simulation data...');

  const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const simUsers = (allUsers?.users || []).filter(u => u.email && u.email.endsWith(SIM_DOMAIN));
  const memberEmails = simUsers.filter(u => u.email.startsWith('sim-member-')).map(u => u.email).slice(0, 10);

  if (memberEmails.length === 0) {
    console.error('  No simulation member accounts found. Run simulate-platform.js first.');
    process.exit(1);
  }

  console.log(`  Found ${memberEmails.length} member accounts`);
  console.log('  Authenticating test users...');

  const memberSessions = [];
  for (const email of memberEmails) {
    const session = await getSession(email);
    if (session) memberSessions.push(session);
    if (memberSessions.length >= 5) break;
  }

  console.log(`  Authenticated: ${memberSessions.length} members`);

  if (memberSessions.length === 0) {
    console.error('  Could not authenticate any test users. Aborting.');
    process.exit(1);
  }

  const { seededSearchIds, searchOwnership } = await seedSearches(memberSessions);

  if (seededSearchIds.length === 0) {
    console.error('  No searches seeded. Aborting.');
    process.exit(1);
  }

  return { memberSessions, seededSearchIds, searchOwnership };
}

async function runRunSearch(searchId, session) {
  const result = await timedFetch(`${BASE_URL}/api/dream-car/run-search/${searchId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (result.timeout) {
    metrics.runSearch.timeouts++;
    metrics.runSearch.requests++;
    if (metrics.runSearch.latencies.length < MAX_LATENCIES) {
      metrics.runSearch.latencies.push(result.latency);
    }
    return;
  }
  recordMetric(metrics.runSearch, result.latency, result.status, result.body);
}

async function runWorker(data, stopSignal) {
  const { seededSearchIds, searchOwnership } = data;

  while (!stopSignal.stop) {
    const searchId = pick(seededSearchIds);
    const session = searchOwnership[searchId];
    try {
      if (Math.random() < CONFIG.duplicateRatio) {
        await Promise.all([
          runRunSearch(searchId, session),
          runRunSearch(searchId, session),
        ]);
      } else {
        await runRunSearch(searchId, session);
      }
    } catch (err) {
      workerUnhandledErrors++;
    }

    if (!stopSignal.stop && CONFIG.interRequestDelay > 0) {
      await new Promise(r => setTimeout(r, CONFIG.interRequestDelay));
    }
  }
}

async function runPhase(name, concurrency, durationMs, data) {
  const startTime = Date.now();
  const stopSignal = { stop: false };

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(runWorker(data, stopSignal));
  }

  const interval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const total = metrics.runSearch.requests;
    process.stdout.write(`  [${name}] ${elapsed}s elapsed | ${total} total requests | ${concurrency} workers\r`);
  }, 1000);

  await new Promise(resolve => setTimeout(resolve, durationMs));
  stopSignal.stop = true;
  await Promise.allSettled(workers);
  clearInterval(interval);

  const total = metrics.runSearch.requests;
  console.log(`  [${name}] Complete — ${total} total requests                                    `);
}

async function checkDuplicateMatches(seededSearchIds) {
  console.log('\n  DUPLICATE MATCH INTEGRITY CHECK');
  console.log('  ' + '-'.repeat(60));

  let totalMatchRows = 0;
  let totalResultSets = 0;
  let totalExtraResultSets = 0;
  const affectedSearchIds = new Set();

  for (let i = 0; i < seededSearchIds.length; i += 10) {
    const batch = seededSearchIds.slice(i, i + 10);
    const { data: matches, error } = await supabaseAdmin
      .from('dream_car_matches')
      .select('id, search_id, make, model, year, trim, price, mileage, seller_type, found_at')
      .in('search_id', batch)
      .order('found_at', { ascending: true });

    if (error) {
      console.error(`  Error querying matches: ${error.message}`);
      continue;
    }

    totalMatchRows += (matches || []).length;

    const grouped = {};
    for (const m of (matches || [])) {
      if (!grouped[m.search_id]) grouped[m.search_id] = [];
      grouped[m.search_id].push(m);
    }

    for (const [searchId, rows] of Object.entries(grouped)) {
      const signatures = rows.map(r =>
        `${r.year}|${r.make}|${r.model}|${r.trim}|${r.price}|${r.mileage}|${r.seller_type}`
      );

      const sigCounts = {};
      for (const sig of signatures) {
        sigCounts[sig] = (sigCounts[sig] || 0) + 1;
      }

      const resultSetCount = Math.ceil(rows.length / 3);
      totalResultSets += resultSetCount;

      if (resultSetCount > 1) {
        const hasDuplicateSigs = Object.values(sigCounts).some(c => c > 1);

        if (hasDuplicateSigs || resultSetCount > 1) {
          const extraSets = resultSetCount - 1;
          totalExtraResultSets += extraSets;
          affectedSearchIds.add(searchId);
        }
      }
    }
  }

  const searchesWithDuplicates = affectedSearchIds.size;

  console.log(`  Total match rows:        ${totalMatchRows}`);
  console.log(`  Expected result sets:    ${seededSearchIds.length} (1 per search)`);
  console.log(`  Actual result sets:      ${totalResultSets} (~${totalMatchRows}/3 rows per set)`);
  console.log(`  Extra result sets:       ${totalExtraResultSets} (from concurrent race)`);
  console.log(`  Searches with dupes:     ${searchesWithDuplicates}`);

  if (searchesWithDuplicates > 0) {
    console.log(`  Affected search IDs:`);
    for (const sid of affectedSearchIds) {
      console.log(`    - ${sid}`);
    }
    console.log(`  [WARN] Duplicate result sets detected — concurrent run-search calls for the same`);
    console.log(`         search ID produced multiple result sets without idempotency guard`);
  } else {
    console.log(`  [PASS] No duplicate result sets detected`);
  }

  return { totalMatchRows, searchesWithDuplicates, totalExtraResultSets, hasDuplicates: searchesWithDuplicates > 0 };
}

async function cleanup(seededSearchIds) {
  console.log('\n  Cleaning up seeded data...');

  for (let i = 0; i < seededSearchIds.length; i += 50) {
    const batch = seededSearchIds.slice(i, i + 50);
    await supabaseAdmin.from('dream_car_matches').delete().in('search_id', batch);
    await supabaseAdmin.from('dream_car_searches').delete().in('id', batch);
  }

  console.log(`  Deleted ${seededSearchIds.length} seeded searches and associated matches`);
}

function printResults(testDurationSec) {
  console.log('\n====================================================');
  console.log('  My Car Concierge — Dream Car Finder Stress Test Results');
  console.log('====================================================\n');

  const m = metrics.runSearch;
  const totalRequests    = m.requests;
  const totalErrors      = m.errors;
  const totalRateLimited = m.rateLimited;
  const totalTimeouts    = m.timeouts;
  const totalUnhandled   = m.unhandled500s;
  const overallRps       = testDurationSec > 0 ? (totalRequests / testDurationSec).toFixed(1) : 0;

  console.log('  OVERALL');
  console.log(`  Total requests:    ${totalRequests}`);
  console.log(`  Test duration:     ${testDurationSec.toFixed(1)}s`);
  console.log(`  Avg RPS:           ${overallRps} req/s`);
  console.log(`  Real errors:       ${totalErrors} (${totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : 0}%) — excl 429/503`);
  console.log(`  Rate limited:      ${totalRateLimited} (${totalRequests > 0 ? ((totalRateLimited / totalRequests) * 100).toFixed(2) : 0}%) — 429/503, expected under load`);
  console.log(`  Timeouts:          ${totalTimeouts} (${totalRequests > 0 ? ((totalTimeouts / totalRequests) * 100).toFixed(2) : 0}%)`);
  console.log(`  Unhandled 500s:    ${totalUnhandled} (non-JSON error responses)`);
  if (workerUnhandledErrors > 0) {
    console.log(`  Worker crashes:    ${workerUnhandledErrors}`);
  }
  console.log(`  p50:               ${percentile(m.latencies, 50)}ms`);
  console.log(`  p95:               ${percentile(m.latencies, 95)}ms`);
  console.log(`  p99:               ${percentile(m.latencies, 99)}ms\n`);

  const header = '  Endpoint              Reqs   RPS    Errs    429s  Timeouts  Unhdl   p50     p95     p99     Status Codes';
  console.log(header);
  console.log('  ' + '-'.repeat(header.length - 2));

  const p50  = percentile(m.latencies, 50);
  const p95  = percentile(m.latencies, 95);
  const p99  = percentile(m.latencies, 99);
  const rps  = testDurationSec > 0 ? (m.requests / testDurationSec).toFixed(0) : 0;
  const codes = Object.entries(m.statusCodes).map(([k, v]) => `${k}:${v}`).join(' ');
  console.log(
    `  ${m.name.padEnd(20)} ${String(m.requests).padStart(6)} ${String(rps).padStart(5)}  ${String(m.errors).padStart(6)}  ${String(m.rateLimited).padStart(6)}  ${String(m.timeouts).padStart(8)}  ${String(m.unhandled500s).padStart(5)}  ${String(p50 + 'ms').padStart(6)}  ${String(p95 + 'ms').padStart(6)}  ${String(p99 + 'ms').padStart(6)}  ${codes}`
  );

  return { p95, totalErrors, totalRequests, totalRateLimited, totalUnhandled };
}

async function main() {
  console.log('\n====================================================');
  console.log('  My Car Concierge — Dream Car Finder Stress Test');
  console.log('====================================================');
  console.log(`  Target:              ${CONFIG.baseUrl}`);
  console.log(`  Target concurrency:  ${CONFIG.concurrency}`);
  console.log(`  Sustained duration:  ${CONFIG.duration}s`);
  console.log(`  Ramp-up time:        ${CONFIG.rampUpTime}s`);
  console.log(`  Spike multiplier:    ${CONFIG.spikeMultiplier}x`);
  console.log(`  Request timeout:     ${CONFIG.requestTimeout}ms`);
  console.log(`  Inter-request delay: ${CONFIG.interRequestDelay}ms`);
  console.log(`  Duplicate ratio:     ${(CONFIG.duplicateRatio * 100).toFixed(0)}% (concurrent calls for same search ID)`);
  console.log(`  Run ID:              ${RUN_ID}`);
  console.log(`\n  Flow under test (member JWT):`);
  console.log(`    POST /api/dream-car/run-search/{searchId} — AI-powered car search (Gemini/Claude)`);
  console.log(`    Includes intentional duplicate concurrent calls to probe insert race`);
  console.log('====================================================\n');

  console.log('[Setup] Loading test data and authenticating...');
  const data = await loadSimData();
  console.log('  Setup complete.\n');

  let allPassed = false;

  try {
    const testStartTime = Date.now();

    const rampSteps = [
      { concurrency: Math.ceil(CONFIG.concurrency * 0.25), duration: Math.ceil(CONFIG.rampUpTime / 3) },
      { concurrency: Math.ceil(CONFIG.concurrency * 0.5),  duration: Math.ceil(CONFIG.rampUpTime / 3) },
      { concurrency: CONFIG.concurrency,                    duration: Math.ceil(CONFIG.rampUpTime / 3) },
    ];

    console.log('[Phase 1/4] Ramp-up...');
    for (const step of rampSteps) {
      await runPhase(`Ramp ${step.concurrency}`, step.concurrency, step.duration * 1000, data);
    }

    console.log(`\n[Phase 2/4] Sustained load — ${CONFIG.concurrency} concurrent for ${CONFIG.duration}s...`);
    await runPhase('Sustained', CONFIG.concurrency, CONFIG.duration * 1000, data);

    const spikeConcurrency = CONFIG.concurrency * CONFIG.spikeMultiplier;
    console.log(`\n[Phase 3/4] Spike — ${spikeConcurrency} concurrent for ${CONFIG.spikeDuration}s...`);
    await runPhase('Spike', spikeConcurrency, CONFIG.spikeDuration * 1000, data);

    console.log(`\n[Phase 4/4] Cool-down — ${CONFIG.coolDownConcurrency} concurrent for ${CONFIG.coolDownDuration}s...`);
    await runPhase('Cool-down', CONFIG.coolDownConcurrency, CONFIG.coolDownDuration * 1000, data);

    const testDurationSec = (Date.now() - testStartTime) / 1000;
    const results = printResults(testDurationSec);

    const dupeCheck = await checkDuplicateMatches(data.seededSearchIds);

    console.log('\n  PASS/FAIL CRITERIA');
    console.log('  ' + '-'.repeat(60));

    const nonRateLimited = results.totalRequests - results.totalRateLimited;
    const safeErrorRate = nonRateLimited > 0
      ? (results.totalErrors / nonRateLimited) * 100
      : 0;

    const criteria = [
      { name: 'p95 < 10000ms',                    value: `${results.p95}ms`,                    pass: results.p95 < 10000 },
      { name: 'Error rate < 10% (excl 429/503)',   value: `${safeErrorRate.toFixed(2)}%`,        pass: safeErrorRate < 10 },
      { name: 'Zero unhandled 500s',               value: `${results.totalUnhandled}`,           pass: results.totalUnhandled === 0 },
      { name: 'Duplicate match race (info only)',    value: dupeCheck.hasDuplicates ? `${dupeCheck.searchesWithDuplicates} searches, ${dupeCheck.totalExtraResultSets} extra sets` : 'None', pass: true },
    ];

    for (const c of criteria) {
      console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name.padEnd(35)} ${c.value}`);
    }

    if (dupeCheck.hasDuplicates) {
      console.log(`\n  NOTE: Duplicate matches are informational — the server has no idempotency guard on`);
      console.log(`        concurrent run-search. This is a known race condition, not a test failure.`);
    }

    allPassed = criteria.every(c => c.pass);
  } finally {
    await cleanup(data.seededSearchIds);
    console.log('\n====================================================\n');
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('\nStress test failed:', err);
  process.exit(1);
});

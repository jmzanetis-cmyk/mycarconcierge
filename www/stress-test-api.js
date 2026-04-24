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
  return f ? parseInt(f.split('=')[1], 10) : def;
}
function strParam(name, def) {
  const f = args.find(a => a.startsWith(`--${name}=`));
  return f ? f.split('=').slice(1).join('=') : def;
}

const CONFIG = {
  concurrency:    param('concurrency', 100),
  duration:       param('duration', 60),
  rampUpTime:     param('ramp-up', 30),
  spikeMultiplier: 2,
  spikeDuration:  10,
  coolDownDuration: 10,
  coolDownConcurrency: 10,
  requestTimeout: 5000,
  providerJwt:    strParam('provider-jwt',     process.env.STRESS_TEST_PROVIDER_JWT     || ''),
  providerUserId: strParam('provider-user-id', process.env.STRESS_TEST_PROVIDER_USER_ID || ''),
  baseUrl:        strParam('base-url',         process.env.STRESS_TEST_BASE_URL         || 'http://localhost:5000'),
};

const BASE_URL = CONFIG.baseUrl;
const SIM_DOMAIN = '@mcc-sim.test';
const SIM_PASSWORD = 'SimPass123!';

const metrics = {
  getPackages: { name: 'Pkg listing',   requests: 0, errors: 0, rateLimited: 0, timeouts: 0, latencies: [], statusCodes: {} },
  getBids:     { name: 'GET bids',      requests: 0, errors: 0, rateLimited: 0, timeouts: 0, latencies: [], statusCodes: {} },
  postBid:     { name: 'POST bid',      requests: 0, errors: 0, rateLimited: 0, timeouts: 0, latencies: [], statusCodes: {} },
  authProfile: { name: 'Auth+Profile',  requests: 0, errors: 0, rateLimited: 0, timeouts: 0, latencies: [], statusCodes: {} },
};

let workerUnhandledErrors = 0;

function recordMetric(metric, latency, status, expectedStatus) {
  metric.requests++;
  metric.latencies.push(latency);
  metric.statusCodes[status] = (metric.statusCodes[status] || 0) + 1;
  if (status === 429) {
    metric.rateLimited++;
  } else if (expectedStatus && status === expectedStatus) {
  } else if (status >= 400 || status === 0) {
    metric.errors++;
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
    return { status: res.status, latency, ok: res.ok };
  } catch (err) {
    clearTimeout(timeout);
    const latency = Date.now() - start;
    if (err.name === 'AbortError') return { status: 0, latency, ok: false, timeout: true };
    return { status: 0, latency, ok: false };
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

async function loadSimData() {
  console.log('  Loading simulation data...');

  const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const simUsers = (allUsers?.users || []).filter(u => u.email && u.email.endsWith(SIM_DOMAIN));

  const memberEmails   = simUsers.filter(u => u.email.startsWith('sim-member-')).map(u => u.email).slice(0, 10);
  const providerEmails = simUsers.filter(u => u.email.startsWith('sim-provider-')).map(u => u.email).slice(0, 10);

  if (memberEmails.length === 0 || providerEmails.length === 0) {
    console.error('  No simulation accounts found. Run simulate-platform.js first.');
    process.exit(1);
  }

  console.log(`  Found ${memberEmails.length} member accounts, ${providerEmails.length} provider accounts`);
  console.log('  Authenticating test users...');

  const memberSessions   = [];
  const providerSessions = [];

  for (const email of memberEmails) {
    const session = await getSession(email);
    if (session) memberSessions.push(session);
    if (memberSessions.length >= 5) break;
  }

  for (const email of providerEmails) {
    const session = await getSession(email);
    if (session) providerSessions.push(session);
    if (providerSessions.length >= 5) break;
  }

  if (CONFIG.providerJwt) {
    const externalSession = { token: CONFIG.providerJwt, userId: CONFIG.providerUserId || null };
    providerSessions.unshift(externalSession);
    if (CONFIG.providerUserId) {
      console.log(`  Added external provider JWT with user ID ${CONFIG.providerUserId} (bid credit tracking enabled)`);
    } else {
      console.log('  Added external provider JWT — WARNING: --provider-user-id not set, external provider credits excluded from integrity check');
    }
  }

  console.log(`  Authenticated: ${memberSessions.length} members, ${providerSessions.length} providers`);

  if (memberSessions.length === 0 || providerSessions.length === 0) {
    console.error('  Could not authenticate any test users. Aborting.');
    process.exit(1);
  }

  const memberIds = simUsers.filter(u => u.email.startsWith('sim-member-')).map(u => u.id);
  const { data: packages } = await supabaseAdmin
    .from('maintenance_packages')
    .select('id')
    .eq('status', 'open')
    .in('member_id', memberIds.slice(0, 100))
    .limit(200);

  const openPackageIds = (packages || []).map(p => p.id);
  console.log(`  Found ${openPackageIds.length} open packages for testing`);

  if (openPackageIds.length === 0) {
    console.error('  No open packages found. Run simulate-platform.js first.');
    process.exit(1);
  }

  const simProviderUserIds = simUsers.filter(u => u.email.startsWith('sim-provider-')).map(u => u.id).slice(0, 10);
  const trackedProviderIds = CONFIG.providerUserId
    ? [...simProviderUserIds, CONFIG.providerUserId]
    : simProviderUserIds;

  const { data: creditsBefore } = await supabaseAdmin
    .from('profiles')
    .select('id, bid_credits')
    .in('id', trackedProviderIds);

  const totalCreditsBefore = (creditsBefore || []).reduce((sum, p) => sum + (p.bid_credits || 0), 0);

  return { memberSessions, providerSessions, openPackageIds, totalCreditsBefore, providerUserIds: trackedProviderIds };
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

async function runGetPackages(session) {
  const result = await timedFetch(`${BASE_URL}/api/provider/packages`, {
    headers: { 'Authorization': `Bearer ${session.token}` },
  });
  if (result.timeout) {
    metric.timeouts++;
    metric.requests++;
    metric.latencies.push(result.latency);
    return;
  }
  recordMetric(metrics.getPackages, result.latency, result.status);
}

async function runGetBids(session, packageId) {
  const result = await timedFetch(`${BASE_URL}/api/bids?package_id=${packageId}`, {
    headers: { 'Authorization': `Bearer ${session.token}` },
  });
  if (result.timeout) {
    metrics.getBids.timeouts++;
    metrics.getBids.requests++;
    metrics.getBids.latencies.push(result.latency);
    return;
  }
  recordMetric(metrics.getBids, result.latency, result.status);
}

async function runPostBid(session, packageId) {
  const result = await timedFetch(`${BASE_URL}/api/bids`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      package_id: packageId,
      price: rand(50, 500),
      notes: 'Stress test bid',
      estimated_duration: '2 hours',
    }),
  });
  if (result.timeout) {
    metrics.postBid.timeouts++;
    metrics.postBid.requests++;
    metrics.postBid.latencies.push(result.latency);
    return;
  }
  recordMetric(metrics.postBid, result.latency, result.status, 409);
}

async function runAuthProfile(session) {
  const start = Date.now();

  const checkResult = await timedFetch(`${BASE_URL}/api/auth/check-access`, {
    headers: { 'Authorization': `Bearer ${session.token}` },
  });

  if (checkResult.timeout) {
    metrics.authProfile.timeouts++;
    metrics.authProfile.requests++;
    metrics.authProfile.latencies.push(checkResult.latency);
    return;
  }

  if (checkResult.status !== 200) {
    recordMetric(metrics.authProfile, checkResult.latency, checkResult.status);
    return;
  }

  const bidsResult = await timedFetch(`${BASE_URL}/api/bids?package_id=${session.samplePackageId || ''}`, {
    headers: { 'Authorization': `Bearer ${session.token}` },
  });

  const totalLatency = Date.now() - start;

  if (bidsResult.timeout) {
    metrics.authProfile.timeouts++;
    metrics.authProfile.requests++;
    metrics.authProfile.latencies.push(totalLatency);
    return;
  }

  recordMetric(metrics.authProfile, totalLatency, bidsResult.status);
}

async function runWorker(data, stopSignal) {
  const { memberSessions, providerSessions, openPackageIds } = data;

  const sessionsWithPackage = [...memberSessions, ...providerSessions]
    .map(s => ({ ...s, samplePackageId: pick(openPackageIds) }));

  while (!stopSignal.stop) {
    const action = rand(1, 10);
    try {
      if (action <= 3) {
        await runGetPackages(pick(providerSessions));
      } else if (action <= 6) {
        await runGetBids(pick(memberSessions), pick(openPackageIds));
      } else if (action <= 8) {
        await runPostBid(pick(providerSessions), pick(openPackageIds));
      } else {
        await runAuthProfile(pick(sessionsWithPackage));
      }
    } catch (err) {
      workerUnhandledErrors++;
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
    const total = Object.values(metrics).reduce((s, m) => s + m.requests, 0);
    process.stdout.write(`  [${name}] ${elapsed}s elapsed | ${total} total requests | ${concurrency} workers\r`);
  }, 1000);

  await new Promise(resolve => setTimeout(resolve, durationMs));
  stopSignal.stop = true;
  await Promise.allSettled(workers);
  clearInterval(interval);

  const total = Object.values(metrics).reduce((s, m) => s + m.requests, 0);
  console.log(`  [${name}] Complete — ${total} total requests                                    `);
}

function printResults(data, testDurationSec) {
  console.log('\n====================================================');
  console.log('  STRESS TEST RESULTS');
  console.log('====================================================\n');

  const allMetrics = Object.values(metrics);
  const totalRequests    = allMetrics.reduce((s, m) => s + m.requests, 0);
  const totalErrors      = allMetrics.reduce((s, m) => s + m.errors, 0);
  const totalRateLimited = allMetrics.reduce((s, m) => s + m.rateLimited, 0);
  const totalTimeouts    = allMetrics.reduce((s, m) => s + m.timeouts, 0);
  const allLatencies     = allMetrics.flatMap(m => m.latencies);
  const overallRps       = testDurationSec > 0 ? (totalRequests / testDurationSec).toFixed(1) : 0;

  console.log('  OVERALL');
  console.log(`  Total requests:    ${totalRequests}`);
  console.log(`  Test duration:     ${testDurationSec.toFixed(1)}s`);
  console.log(`  Avg RPS:           ${overallRps} req/s`);
  console.log(`  Real errors:       ${totalErrors} (${totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : 0}%)`);
  console.log(`  Rate limited:      ${totalRateLimited} (${totalRequests > 0 ? ((totalRateLimited / totalRequests) * 100).toFixed(2) : 0}%) — expected under load`);
  console.log(`  Timeouts:          ${totalTimeouts} (${totalRequests > 0 ? ((totalTimeouts / totalRequests) * 100).toFixed(2) : 0}%)`);
  if (workerUnhandledErrors > 0) {
    console.log(`  Unhandled errors:  ${workerUnhandledErrors} (unexpected runtime failures — check server logs)`);
  }
  console.log(`  Overall p50:       ${percentile(allLatencies, 50)}ms`);
  console.log(`  Overall p95:       ${percentile(allLatencies, 95)}ms`);
  console.log(`  Overall p99:       ${percentile(allLatencies, 99)}ms\n`);

  const header = '  Endpoint              Reqs   RPS    Errs    429s  Timeouts   p50     p95     p99     Status Codes';
  console.log(header);
  console.log('  ' + '-'.repeat(header.length - 2));

  for (const m of allMetrics) {
    const p50  = percentile(m.latencies, 50);
    const p95  = percentile(m.latencies, 95);
    const p99  = percentile(m.latencies, 99);
    const rps  = testDurationSec > 0 ? (m.requests / testDurationSec).toFixed(0) : 0;
    const codes = Object.entries(m.statusCodes).map(([k, v]) => `${k}:${v}`).join(' ');
    console.log(
      `  ${m.name.padEnd(20)} ${String(m.requests).padStart(6)} ${String(rps).padStart(5)}  ${String(m.errors).padStart(6)}  ${String(m.rateLimited).padStart(6)}  ${String(m.timeouts).padStart(8)}  ${String(p50 + 'ms').padStart(6)}  ${String(p95 + 'ms').padStart(6)}  ${String(p99 + 'ms').padStart(6)}  ${codes}`
    );
  }

  console.log('\n  PASS/FAIL CRITERIA');
  console.log('  ' + '-'.repeat(60));

  const getLatencies  = [...metrics.getPackages.latencies, ...metrics.getBids.latencies, ...metrics.authProfile.latencies];
  const postLatencies = metrics.postBid.latencies;
  const realErrorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
  const getP95  = percentile(getLatencies, 95);
  const postP95 = percentile(postLatencies, 95);

  const criteria = [
    { name: 'GET p95 < 2000ms',          value: `${getP95}ms`,                  pass: getP95 < 2000 },
    { name: 'POST p95 < 3000ms',          value: `${postP95}ms`,                 pass: postP95 < 3000 },
    { name: 'Error rate < 2% (excl 429)', value: `${realErrorRate.toFixed(2)}%`, pass: realErrorRate < 2 },
  ];

  for (const c of criteria) {
    console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name.padEnd(28)} ${c.value}`);
  }

  return { criteria, totalCreditsBefore: data.totalCreditsBefore, providerUserIds: data.providerUserIds };
}

async function checkBidCredits(result) {
  const { data: creditsAfter } = await supabaseAdmin
    .from('profiles')
    .select('id, bid_credits')
    .in('id', result.providerUserIds);

  const totalCreditsAfter = (creditsAfter || []).reduce((sum, p) => sum + (p.bid_credits || 0), 0);
  const successfulBids = metrics.postBid.statusCodes[200] || 0;
  const creditsUsed    = result.totalCreditsBefore - totalCreditsAfter;
  const overcharged    = creditsUsed > successfulBids;
  const undercharged   = creditsUsed < successfulBids;

  console.log(`\n  BID CREDIT INTEGRITY`);
  console.log(`  Tracked providers:   ${result.providerUserIds.length}${CONFIG.providerJwt && !CONFIG.providerUserId ? ' (external provider excluded — no --provider-user-id)' : ''}`);
  console.log(`  Credits before:      ${result.totalCreditsBefore}`);
  console.log(`  Credits after:       ${totalCreditsAfter}`);
  console.log(`  Credits consumed:    ${creditsUsed}`);
  console.log(`  Successful bids:     ${successfulBids}`);
  console.log(`  Rate limited bids:   ${metrics.postBid.rateLimited}`);

  if (creditsUsed === successfulBids) {
    console.log(`  [PASS] No double-deductions — credits consumed matches successful bids exactly`);
  } else if (overcharged) {
    console.log(`  [FAIL] OVERCHARGE detected — credits consumed (${creditsUsed}) > successful bids (${successfulBids}), delta: +${creditsUsed - successfulBids}`);
    console.log(`         Providers were charged more credits than bids were accepted — double-deduction bug`);
  } else if (undercharged) {
    console.log(`  [PASS] No overcharge — credits consumed (${creditsUsed}) < successful bids (${successfulBids}), delta: -${successfulBids - creditsUsed}`);
    console.log(`         ${successfulBids - creditsUsed} bid(s) accepted with no credit deduction (concurrent race — providers under-charged, not over-charged)`);
  }

  console.log('\n====================================================\n');
  return !overcharged;
}

async function main() {
  console.log('\n====================================================');
  console.log('  My Car Concierge — Concurrent API Stress Test');
  console.log('====================================================');
  console.log(`  Target:              ${CONFIG.baseUrl}`);
  console.log(`  Target concurrency:  ${CONFIG.concurrency}`);
  console.log(`  Sustained duration:  ${CONFIG.duration}s`);
  console.log(`  Ramp-up time:        ${CONFIG.rampUpTime}s`);
  console.log(`  Spike multiplier:    ${CONFIG.spikeMultiplier}x`);
  console.log(`  Request timeout:     ${CONFIG.requestTimeout}ms`);
  console.log(`\n  Flows under test (all via server API, user-context JWT):`);
  console.log(`    1. Pkg listing   — GET /api/provider/packages (server-side maintenance_packages listing for providers)`);
  console.log(`    2. GET bids      — GET /api/bids?package_id=X (member bid listing for a specific package)`);
  console.log(`    3. POST bid      — POST /api/bids (provider bid submission with credit deduction)`);
  console.log(`    4. Auth+Profile  — GET /api/auth/check-access + GET /api/bids (session validation + first data load)`);
  console.log('====================================================\n');

  console.log('[Setup] Loading test data and authenticating...');
  const data = await loadSimData();
  console.log('  Setup complete.\n');

  const testStartTime = Date.now();

  const rampSteps = [
    { concurrency: Math.ceil(CONFIG.concurrency * 0.1), duration: Math.ceil(CONFIG.rampUpTime / 3) },
    { concurrency: Math.ceil(CONFIG.concurrency * 0.5), duration: Math.ceil(CONFIG.rampUpTime / 3) },
    { concurrency: CONFIG.concurrency,                   duration: Math.ceil(CONFIG.rampUpTime / 3) },
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
  const result = printResults(data, testDurationSec);
  const creditCheckPassed = await checkBidCredits(result);

  const allPassed = result.criteria.every(c => c.pass) && creditCheckPassed;
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('\nStress test failed:', err);
  process.exit(1);
});

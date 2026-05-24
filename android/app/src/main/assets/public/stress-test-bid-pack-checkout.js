const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ifbyjxuaclwmadqbjcyp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}
if (!STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY environment variable is required');
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
  concurrency:        param('concurrency', 10),
  duration:           param('duration', 30),
  rampUpTime:         param('ramp-up', 5),
  spikeMultiplier:    2,
  spikeDuration:      5,
  coolDownDuration:   5,
  coolDownConcurrency: 3,
  requestTimeout:     10000,
  providerCount:      param('providers', 1),
  baseUrl:            strParam('base-url', process.env.STRESS_TEST_BASE_URL || 'http://localhost:5000'),
};

const BASE_URL = CONFIG.baseUrl;
const SIM_DOMAIN = '@mcc-sim.test';
const RESERVOIR_SIZE = 50000;

function createMetric(name) {
  return { name, requests: 0, errors: 0, rateLimited: 0, timeouts: 0, latencies: new Float32Array(RESERVOIR_SIZE), latencyCount: 0, statusCodes: {} };
}

const metrics = {
  checkout: createMetric('POST /api/create-bid-checkout'),
};

let workerUnhandledErrors = 0;

function addLatency(metric, latency) {
  if (metric.latencyCount < RESERVOIR_SIZE) {
    metric.latencies[metric.latencyCount] = latency;
  } else {
    const j = Math.floor(Math.random() * (metric.latencyCount + 1));
    if (j < RESERVOIR_SIZE) metric.latencies[j] = latency;
  }
  metric.latencyCount++;
}

function recordMetric(metric, latency, status) {
  metric.requests++;
  addLatency(metric, latency);
  metric.statusCodes[status] = (metric.statusCodes[status] || 0) + 1;
  if (status === 429) {
    metric.rateLimited++;
  } else if (status >= 400 || status === 0) {
    metric.errors++;
  }
}

function getLatencies(metric) {
  const len = Math.min(metric.latencyCount, RESERVOIR_SIZE);
  return Array.from(metric.latencies.subarray(0, len));
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const createdSessionIds = [];

async function timedCheckoutFetch(token, packId, providerId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.requestTimeout);
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/create-bid-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ packId, providerId }),
      signal: controller.signal,
    });
    const latency = Date.now() - start;
    clearTimeout(timeout);
    let body = null;
    try { body = await res.json(); } catch {}
    return { status: res.status, latency, ok: res.ok, body };
  } catch (err) {
    clearTimeout(timeout);
    const latency = Date.now() - start;
    if (err.name === 'AbortError') return { status: 0, latency, ok: false, timeout: true };
    return { status: 0, latency, ok: false };
  }
}

async function loadSimData(cleanupState) {
  console.log('  Loading simulation data...');

  const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const simUsers = (allUsers?.users || []).filter(u => u.email && u.email.endsWith(SIM_DOMAIN));
  const providerEmails = simUsers.filter(u => u.email.startsWith('sim-provider-')).map(u => u.email).slice(0, CONFIG.providerCount);

  if (providerEmails.length === 0) {
    throw new Error('No simulation provider accounts found. Run simulate-platform.js first.');
  }

  console.log(`  Found ${providerEmails.length} provider accounts`);

  const providerIds = simUsers
    .filter(u => providerEmails.includes(u.email))
    .map(u => u.id);

  const { data: bidPacks } = await supabaseAdmin
    .from('bid_packs')
    .select('*')
    .eq('is_active', true)
    .order('price', { ascending: true })
    .limit(1);

  if (!bidPacks || bidPacks.length === 0) {
    throw new Error('No active bid packs found in bid_packs table.');
  }

  const packId = bidPacks[0].id;
  console.log(`  Using bid pack: "${bidPacks[0].name}" (id=${packId}, price=$${bidPacks[0].price}, bids=${bidPacks[0].bid_count})`);

  console.log('  Authenticating providers...');
  const providerTokens = {};
  for (const email of providerEmails) {
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password: 'SimPass123!' });
    if (error) {
      console.error(`  Failed to authenticate ${email}: ${error.message}`);
      continue;
    }
    const userId = data.user.id;
    providerTokens[userId] = data.session.access_token;
  }

  const authenticatedProviderIds = Object.keys(providerTokens);
  if (authenticatedProviderIds.length === 0) {
    throw new Error('No providers could be authenticated.');
  }

  console.log(`  Authenticated ${authenticatedProviderIds.length} providers`);

  cleanupState.providerIds = authenticatedProviderIds;

  return { providerIds: authenticatedProviderIds, providerTokens, packId };
}

const sessionTracker = {
  byProviderAndPack: {},
  allSessions: [],
  conflictsByKey: {},
  totalConflicts: 0,
};

async function fireCheckoutRequest(token, packId, providerId) {
  const result = await timedCheckoutFetch(token, packId, providerId);

  if (result.timeout) {
    metrics.checkout.timeouts++;
    metrics.checkout.requests++;
    addLatency(metrics.checkout, result.latency);
    return;
  }

  recordMetric(metrics.checkout, result.latency, result.status);

  if (result.status === 409 || result.status === 429) {
    const key = `${providerId}:${packId}`;
    sessionTracker.conflictsByKey[key] = (sessionTracker.conflictsByKey[key] || 0) + 1;
    sessionTracker.totalConflicts++;
  }

  if (result.ok && result.body && result.body.url) {
    const url = result.body.url;
    const sessionIdMatch = url.match(/\/c\/pay\/(cs_[^#?/]+)/);
    const sessionId = sessionIdMatch ? sessionIdMatch[1] : url;

    const key = `${providerId}:${packId}`;
    if (!sessionTracker.byProviderAndPack[key]) {
      sessionTracker.byProviderAndPack[key] = [];
    }
    sessionTracker.byProviderAndPack[key].push(sessionId);
    sessionTracker.allSessions.push(sessionId);
    createdSessionIds.push(sessionId);
  }
}

async function runWorker(providerTokens, providerIds, packId, stopSignal) {
  while (!stopSignal.stop) {
    const providerId = pick(providerIds);
    const token = providerTokens[providerId];

    try {
      await fireCheckoutRequest(token, packId, providerId);
    } catch (err) {
      workerUnhandledErrors++;
    }

    await new Promise(r => setTimeout(r, 10));
  }
}

async function runPhase(name, concurrency, durationMs, providerTokens, providerIds, packId) {
  const startTime = Date.now();
  const stopSignal = { stop: false };

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(runWorker(providerTokens, providerIds, packId, stopSignal));
  }

  const interval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const total = metrics.checkout.requests;
    process.stdout.write(`  [${name}] ${elapsed}s elapsed | ${total} total requests | ${concurrency} workers\r`);
  }, 1000);

  await new Promise(resolve => setTimeout(resolve, durationMs));
  stopSignal.stop = true;
  await Promise.allSettled(workers);
  clearInterval(interval);

  const total = metrics.checkout.requests;
  console.log(`  [${name}] Complete — ${total} total requests                                    `);
}

function checkSessionDeduplication() {
  console.log('\n  SESSION DEDUPLICATION CHECK');
  console.log('  ' + '-'.repeat(60));

  const uniqueSessions = new Set(sessionTracker.allSessions);
  const totalSuccessful = sessionTracker.allSessions.length;

  console.log(`  Total successful checkout requests:  ${totalSuccessful}`);
  console.log(`  Unique Stripe session IDs returned:  ${uniqueSessions.size}`);
  console.log(`  Conflict responses (409/429):        ${sessionTracker.totalConflicts}`);

  let duplicateProviderPacks = 0;
  let maxSessionsPerCombo = 0;

  const allKeys = new Set([
    ...Object.keys(sessionTracker.byProviderAndPack),
    ...Object.keys(sessionTracker.conflictsByKey),
  ]);

  for (const key of allKeys) {
    const sessions = sessionTracker.byProviderAndPack[key] || [];
    const uniqueForCombo = new Set(sessions).size;
    const conflicts = sessionTracker.conflictsByKey[key] || 0;
    if (uniqueForCombo > 1) {
      duplicateProviderPacks++;
      if (sessions.length > maxSessionsPerCombo) {
        maxSessionsPerCombo = sessions.length;
      }
    }
  }

  const combos = allKeys.size;
  console.log(`  Provider+pack combinations tested:   ${combos}`);
  console.log(`  Combinations with >1 session:        ${duplicateProviderPacks}`);
  if (maxSessionsPerCombo > 0) {
    console.log(`  Max sessions for a single combo:     ${maxSessionsPerCombo}`);
  }

  console.log('\n  PER-COMBO BREAKDOWN');
  const comboEntries = [...allKeys].slice(0, 10);
  for (const key of comboEntries) {
    const sessions = sessionTracker.byProviderAndPack[key] || [];
    const uniqueCount = new Set(sessions).size;
    const conflicts = sessionTracker.conflictsByKey[key] || 0;
    const totalAttempts = sessions.length + conflicts;
    console.log(`    ${key}: ${totalAttempts} attempts → ${uniqueCount} unique sessions, ${conflicts} conflicts`);
  }

  const pass = duplicateProviderPacks === 0;

  if (pass) {
    if (totalSuccessful === 0 && sessionTracker.totalConflicts > 0) {
      console.log('  [PASS] Rate limiter blocked all concurrent checkout attempts (no sessions created)');
    } else if (totalSuccessful > 0) {
      console.log('  [PASS] Server deduplicates checkout sessions per provider+pack');
    } else {
      console.log('  [PASS] No duplicate sessions detected (no successful requests)');
    }
  } else {
    console.log(`  [FAIL] NO DEDUPLICATION: ${duplicateProviderPacks} provider+pack combo(s) received multiple distinct Stripe sessions`);
    const violationEntries = [...allKeys]
      .filter(key => new Set(sessionTracker.byProviderAndPack[key] || []).size > 1)
      .slice(0, 5);
    for (const key of violationEntries) {
      const sessions = sessionTracker.byProviderAndPack[key] || [];
      const unique = new Set(sessions).size;
      const conflicts = sessionTracker.conflictsByKey[key] || 0;
      console.log(`         ${key}: ${sessions.length} successes (${unique} unique) + ${conflicts} conflicts`);
    }
  }

  return { pass, uniqueSessions: uniqueSessions.size, totalSuccessful, duplicateProviderPacks, maxSessionsPerCombo };
}

function printResults(testDurationSec, dedupResult) {
  console.log('\n====================================================');
  console.log('  My Car Concierge — Bid Pack Checkout Stress Test Results');
  console.log('====================================================\n');

  const m = metrics.checkout;
  const totalRequests    = m.requests;
  const totalErrors      = m.errors;
  const totalRateLimited = m.rateLimited;
  const totalTimeouts    = m.timeouts;
  const allLatencies     = getLatencies(m);
  const overallRps       = testDurationSec > 0 ? (totalRequests / testDurationSec).toFixed(1) : 0;

  console.log('  OVERALL');
  console.log(`  Total requests:    ${totalRequests}`);
  console.log(`  Test duration:     ${testDurationSec.toFixed(1)}s`);
  console.log(`  Avg RPS:           ${overallRps} req/s`);
  console.log(`  Real errors:       ${totalErrors} (${totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : 0}%)`);
  console.log(`  Rate limited:      ${totalRateLimited} (${totalRequests > 0 ? ((totalRateLimited / totalRequests) * 100).toFixed(2) : 0}%) — expected under load`);
  console.log(`  Timeouts:          ${totalTimeouts} (${totalRequests > 0 ? ((totalTimeouts / totalRequests) * 100).toFixed(2) : 0}%)`);
  if (workerUnhandledErrors > 0) {
    console.log(`  Unhandled errors:  ${workerUnhandledErrors}`);
  }

  console.log('\n  PER-OPERATION BREAKDOWN');
  console.log('  ' + '-'.repeat(60));

  const lats = getLatencies(m);
  const p50 = percentile(lats, 50);
  const p95 = percentile(lats, 95);
  const p99 = percentile(lats, 99);
  const codes = Object.entries(m.statusCodes).map(([k, v]) => `${k}:${v}`).join(' ');
  console.log(`  ${m.name}`);
  console.log(`    Requests: ${m.requests} | Errors: ${m.errors} | Rate-limited: ${m.rateLimited} | Timeouts: ${m.timeouts}`);
  console.log(`    p50: ${p50}ms | p95: ${p95}ms | p99: ${p99}ms`);
  console.log(`    Status codes: ${codes}`);

  console.log(`\n  Flows under test:`);
  console.log(`    • POST /api/create-bid-checkout — concurrent checkout session creation`);
  console.log(`    • ${CONFIG.providerCount} providers, same pack, concurrent requests`);
  console.log(`    • Testing whether server deduplicates sessions per provider+pack`);

  const realErrorCount = totalErrors + totalTimeouts;
  const errorRate = totalRequests > 0 ? (realErrorCount / totalRequests) * 100 : 0;

  console.log('\n  PASS/FAIL CRITERIA');
  console.log('  ' + '-'.repeat(60));

  const criteria = [
    { name: 'p95 < 1000ms',              value: `${p95}ms`,                      pass: p95 < 1000 },
    { name: 'Error rate < 1% (excl 429)', value: `${errorRate.toFixed(2)}%`,      pass: errorRate < 1 },
    { name: 'Session deduplication',      value: `${dedupResult.duplicateProviderPacks} combos with >1 session`, pass: dedupResult.pass },
  ];

  for (const c of criteria) {
    const tag = c.pass ? 'PASS' : 'FAIL';
    console.log(`  [${tag}] ${c.name.padEnd(30)} ${c.value}`);
  }

  console.log('\n====================================================\n');
}

async function expireStripeSessions() {
  const uniqueIds = [...new Set(createdSessionIds)].filter(id => id.startsWith('cs_'));
  if (uniqueIds.length === 0) {
    console.log('  No Stripe checkout sessions to expire');
    return;
  }

  console.log(`  Expiring ${uniqueIds.length} unique Stripe checkout sessions...`);

  let expired = 0;
  let failed = 0;

  for (let i = 0; i < uniqueIds.length; i += 10) {
    const batch = uniqueIds.slice(i, i + 10);
    await Promise.all(batch.map(async (sessionId) => {
      try {
        const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}/expire`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${Buffer.from(STRIPE_SECRET_KEY + ':').toString('base64')}`,
          },
        });
        if (res.ok || res.status === 400) {
          expired++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }));
    process.stdout.write(`  Expired ${expired}/${uniqueIds.length} sessions\r`);
  }

  console.log(`  Expired ${expired}/${uniqueIds.length} sessions (${failed} failures)      `);
}

async function cleanup() {
  console.log('\n[Teardown] Cleaning up Stripe sessions...');
  await expireStripeSessions();
  console.log('  Cleanup complete');
}

async function main() {
  let exitCode = 1;

  try {
    console.log('\n====================================================');
    console.log('  My Car Concierge — Bid Pack Checkout Concurrency Stress Test');
    console.log('====================================================');
    console.log(`  Concurrency: ${CONFIG.concurrency} | Duration: ${CONFIG.duration}s | Ramp-up: ${CONFIG.rampUpTime}s`);
    console.log(`  Providers: ${CONFIG.providerCount}`);
    console.log(`  Base URL: ${BASE_URL}`);
    console.log('====================================================\n');

    console.log('[Setup] Loading simulation data...');
    const data = await loadSimData({ providerIds: [] });

    console.log('  Setup complete.\n');

    const testStart = Date.now();

    console.log('[Phase 1/4] Ramp-up...');
    await runPhase('Ramp-up', CONFIG.concurrency, CONFIG.rampUpTime * 1000, data.providerTokens, data.providerIds, data.packId);

    console.log('[Phase 2/4] Sustained load...');
    const sustainedDuration = Math.max(5, CONFIG.duration - CONFIG.rampUpTime - CONFIG.spikeDuration - CONFIG.coolDownDuration);
    await runPhase('Sustained', CONFIG.concurrency, sustainedDuration * 1000, data.providerTokens, data.providerIds, data.packId);

    console.log('[Phase 3/4] Spike...');
    await runPhase('Spike', CONFIG.concurrency * CONFIG.spikeMultiplier, CONFIG.spikeDuration * 1000, data.providerTokens, data.providerIds, data.packId);

    console.log('[Phase 4/4] Cool-down...');
    await runPhase('Cool-down', CONFIG.coolDownConcurrency, CONFIG.coolDownDuration * 1000, data.providerTokens, data.providerIds, data.packId);

    const testDurationSec = (Date.now() - testStart) / 1000;

    const dedupResult = checkSessionDeduplication();
    printResults(testDurationSec, dedupResult);

    const finalP95 = percentile(getLatencies(metrics.checkout), 95);
    const totalReqs = metrics.checkout.requests;
    const realErrors = metrics.checkout.errors + metrics.checkout.timeouts;
    const finalErrorRate = totalReqs > 0 ? (realErrors / totalReqs) * 100 : 0;
    exitCode = dedupResult.pass && finalP95 < 1000 && finalErrorRate < 1 ? 0 : 1;

  } catch (err) {
    console.error(`\n[FATAL] ${err.message}`);
    console.error(err.stack);
  } finally {
    await cleanup();
    process.exit(exitCode);
  }
}

main();

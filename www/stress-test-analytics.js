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
  concurrency:        param('concurrency', 100),
  duration:           param('duration', 60),
  rampUpTime:         param('ramp-up', 30),
  spikeMultiplier:    2,
  spikeDuration:      10,
  coolDownDuration:   10,
  coolDownConcurrency: 10,
  requestTimeout:     5000,
  baseUrl:            strParam('base-url', process.env.STRESS_TEST_BASE_URL || 'http://localhost:5000'),
};

const BASE_URL = CONFIG.baseUrl;

const PAGES = [
  { path: '/',                        weight: 25 },
  { path: '/members.html',            weight: 15 },
  { path: '/providers.html',          weight: 10 },
  { path: '/login.html',              weight: 8 },
  { path: '/signup-member.html',      weight: 5 },
  { path: '/signup-provider.html',    weight: 3 },
  { path: '/about.html',              weight: 5 },
  { path: '/how-it-works.html',       weight: 4 },
  { path: '/faq.html',                weight: 3 },
  { path: '/contact.html',            weight: 3 },
  { path: '/admin.html',              weight: 2 },
  { path: '/privacy.html',            weight: 2 },
  { path: '/terms.html',              weight: 2 },
  { path: '/founders.html',           weight: 3 },
  { path: '/car-club-member.html',    weight: 3 },
  { path: '/car-club-provider.html',  weight: 2 },
  { path: '/onboarding-member.html',  weight: 2 },
  { path: '/onboarding-provider.html', weight: 1 },
  { path: '/forgot-password.html',    weight: 1 },
  { path: '/provider-info.html',      weight: 1 },
];

const REFERRERS = [
  '', '', '',
  'https://www.google.com',
  'https://www.google.com/search?q=car+concierge',
  'https://www.facebook.com',
  'https://www.instagram.com',
  'https://twitter.com',
  'https://www.reddit.com/r/cars',
  'https://wefunder.com/my.car.concierge',
];

const DEVICES = [
  { type: 'mobile_web',  weight: 45 },
  { type: 'desktop_web', weight: 35 },
  { type: 'ios_app',     weight: 10 },
  { type: 'android_app', weight: 10 },
];

const pagePool = [];
for (const p of PAGES) {
  for (let i = 0; i < p.weight; i++) pagePool.push(p.path);
}

const devicePool = [];
for (const d of DEVICES) {
  for (let i = 0; i < d.weight; i++) devicePool.push(d.type);
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateVisitorId() {
  const chars = 'abcdef0123456789';
  let id = 'v_';
  for (let i = 0; i < 16; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

const RESERVOIR_SIZE = 50000;

const metrics = {
  track: { name: 'POST track', requests: 0, errors: 0, rateLimited: 0, timeouts: 0, latencies: new Float32Array(RESERVOIR_SIZE), latencyCount: 0, statusCodes: {} },
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

async function runTrack(visitorId) {
  const payload = {
    page: pick(pagePool),
    referrer: pick(REFERRERS),
    device: pick(devicePool),
    visitorId,
  };

  const result = await timedFetch(`${BASE_URL}/api/analytics/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (result.timeout) {
    metrics.track.timeouts++;
    metrics.track.requests++;
    addLatency(metrics.track, result.latency);
    return;
  }
  recordMetric(metrics.track, result.latency, result.status);
}

async function runWorker(visitorId, stopSignal) {
  while (!stopSignal.stop) {
    try {
      await runTrack(visitorId);
      await new Promise(r => setTimeout(r, 5));
    } catch (err) {
      workerUnhandledErrors++;
    }
  }
}

async function runPhase(name, concurrency, durationMs, visitorIds) {
  const startTime = Date.now();
  const stopSignal = { stop: false };

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    const vid = visitorIds[i % visitorIds.length];
    workers.push(runWorker(vid, stopSignal));
  }

  const interval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const total = metrics.track.requests;
    process.stdout.write(`  [${name}] ${elapsed}s elapsed | ${total} total requests | ${concurrency} workers\r`);
  }, 1000);

  await new Promise(resolve => setTimeout(resolve, durationMs));
  stopSignal.stop = true;
  await Promise.allSettled(workers);
  clearInterval(interval);

  console.log(`  [${name}] Complete — ${metrics.track.requests} total requests                                    `);
}

async function getPageViewCount() {
  const { count, error } = await supabaseAdmin
    .from('page_views')
    .select('*', { count: 'exact', head: true });
  if (error) {
    console.error('  [WARN] Could not count page_views:', error.message);
    return null;
  }
  return count;
}

function printResults(testDurationSec, countBefore, countAfter) {
  console.log('\n====================================================');
  console.log('  ANALYTICS TRACKER STRESS TEST RESULTS');
  console.log('====================================================\n');

  const m = metrics.track;
  const totalRequests    = m.requests;
  const totalErrors      = m.errors;
  const totalRateLimited = m.rateLimited;
  const totalTimeouts    = m.timeouts;
  const overallRps       = testDurationSec > 0 ? (totalRequests / testDurationSec).toFixed(1) : 0;

  console.log('  OVERALL');
  console.log(`  Total requests:    ${totalRequests}`);
  console.log(`  Test duration:     ${testDurationSec.toFixed(1)}s`);
  console.log(`  Avg RPS:           ${overallRps} req/s`);
  console.log(`  Real errors:       ${totalErrors} (${totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : 0}%) — unexpected failures`);
  console.log(`  Rate limited:      ${totalRateLimited} (${totalRequests > 0 ? ((totalRateLimited / totalRequests) * 100).toFixed(2) : 0}%) — expected under load`);
  console.log(`  Timeouts:          ${totalTimeouts} (${totalRequests > 0 ? ((totalTimeouts / totalRequests) * 100).toFixed(2) : 0}%)`);
  if (workerUnhandledErrors > 0) {
    console.log(`  Unhandled errors:  ${workerUnhandledErrors} (unexpected runtime failures — check server logs)`);
  }
  const lats = getLatencies(m);
  console.log(`  Overall p50:       ${percentile(lats, 50)}ms`);
  console.log(`  Overall p95:       ${percentile(lats, 95)}ms`);
  console.log(`  Overall p99:       ${percentile(lats, 99)}ms\n`);

  const header = '  Endpoint              Reqs   RPS    Errs    429s  Timeouts   p50     p95     p99     Status Codes';
  console.log(header);
  console.log('  ' + '-'.repeat(header.length - 2));

  const p50  = percentile(lats, 50);
  const p95  = percentile(lats, 95);
  const p99  = percentile(lats, 99);
  const rps  = testDurationSec > 0 ? (m.requests / testDurationSec).toFixed(0) : 0;
  const codes = Object.entries(m.statusCodes).map(([k, v]) => `${k}:${v}`).join(' ');
  console.log(
    `  ${m.name.padEnd(20)} ${String(m.requests).padStart(6)} ${String(rps).padStart(5)}  ${String(m.errors).padStart(6)}  ${String(m.rateLimited).padStart(6)}  ${String(m.timeouts).padStart(8)}  ${String(p50 + 'ms').padStart(6)}  ${String(p95 + 'ms').padStart(6)}  ${String(p99 + 'ms').padStart(6)}  ${codes}`
  );

  const successfulPosts = m.statusCodes[200] || 0;
  const rowsInserted = (countBefore !== null && countAfter !== null) ? (countAfter - countBefore) : null;
  const writeRatio = (rowsInserted !== null && successfulPosts > 0) ? (rowsInserted / successfulPosts) : null;

  console.log('\n  WRITE INTEGRITY');
  console.log('  ' + '-'.repeat(60));
  if (countBefore !== null && countAfter !== null) {
    console.log(`  page_views before:   ${countBefore}`);
    console.log(`  page_views after:    ${countAfter}`);
    console.log(`  Rows inserted:       ${rowsInserted}`);
    console.log(`  Successful POSTs:    ${successfulPosts}`);
    console.log(`  Write ratio:         ${writeRatio !== null ? (writeRatio * 100).toFixed(1) + '%' : 'N/A'}`);
  } else {
    console.log(`  [WARN] Could not query page_views count — write integrity check skipped`);
  }

  const nonRateLimitedRequests = totalRequests - totalRateLimited;
  const realErrorRate = nonRateLimitedRequests > 0 ? (totalErrors / nonRateLimitedRequests) * 100 : 0;

  console.log('\n  PASS/FAIL CRITERIA');
  console.log('  ' + '-'.repeat(60));

  const writeIntegrityPass = writeRatio !== null ? writeRatio >= 0.95 : false;
  const writeIntegrityValue = writeRatio !== null
    ? `${(writeRatio * 100).toFixed(1)}% (${rowsInserted}/${successfulPosts})`
    : 'FAIL (page_views count unavailable — cannot verify write integrity)';

  const criteria = [
    { name: 'p95 < 500ms',               value: `${p95}ms`,                       pass: p95 < 500 },
    { name: 'p99 < 1500ms',              value: `${p99}ms`,                       pass: p99 < 1500 },
    { name: 'Error rate < 1% (excl 429)', value: `${realErrorRate.toFixed(2)}%`,   pass: realErrorRate < 1 },
    { name: 'Write integrity >= 95%',     value: writeIntegrityValue,              pass: writeIntegrityPass },
  ];

  for (const c of criteria) {
    console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name.padEnd(28)} ${c.value}`);
  }

  console.log('\n====================================================\n');
  return criteria;
}

async function main() {
  console.log('\n====================================================');
  console.log('  My Car Concierge — Analytics Tracker Stress Test');
  console.log('====================================================');
  console.log(`  Target:              ${CONFIG.baseUrl}`);
  console.log(`  Target concurrency:  ${CONFIG.concurrency}`);
  console.log(`  Sustained duration:  ${CONFIG.duration}s`);
  console.log(`  Ramp-up time:        ${CONFIG.rampUpTime}s`);
  console.log(`  Spike multiplier:    ${CONFIG.spikeMultiplier}x`);
  console.log(`  Request timeout:     ${CONFIG.requestTimeout}ms`);
  console.log(`\n  Flow under test:`);
  console.log(`    POST /api/analytics/track — page view tracking with varied payloads`);
  console.log(`    (no authentication required — mimics real visitor traffic)`);
  console.log('====================================================\n');

  console.log('[Setup] Preparing test data...');

  const visitorIds = [];
  for (let i = 0; i < Math.max(CONFIG.concurrency * 2, 50); i++) {
    visitorIds.push(generateVisitorId());
  }
  console.log(`  Generated ${visitorIds.length} unique visitor IDs`);
  console.log(`  Page pool: ${PAGES.length} pages (weighted distribution)`);
  console.log(`  Device mix: ${DEVICES.map(d => `${d.type} ${d.weight}%`).join(', ')}`);

  const countBefore = await getPageViewCount();
  if (countBefore !== null) {
    console.log(`  page_views count before: ${countBefore}`);
  } else {
    console.log('  [WARN] Could not read page_views count — write integrity will be skipped');
  }
  console.log('  Setup complete.\n');

  const testStartTime = Date.now();

  const rampSteps = [
    { concurrency: Math.ceil(CONFIG.concurrency * 0.1), duration: Math.ceil(CONFIG.rampUpTime / 3) },
    { concurrency: Math.ceil(CONFIG.concurrency * 0.5), duration: Math.ceil(CONFIG.rampUpTime / 3) },
    { concurrency: CONFIG.concurrency,                   duration: Math.ceil(CONFIG.rampUpTime / 3) },
  ];

  console.log('[Phase 1/4] Ramp-up...');
  for (const step of rampSteps) {
    await runPhase(`Ramp ${step.concurrency}`, step.concurrency, step.duration * 1000, visitorIds);
  }

  console.log(`\n[Phase 2/4] Sustained load — ${CONFIG.concurrency} concurrent for ${CONFIG.duration}s...`);
  await runPhase('Sustained', CONFIG.concurrency, CONFIG.duration * 1000, visitorIds);

  const spikeConcurrency = CONFIG.concurrency * CONFIG.spikeMultiplier;
  console.log(`\n[Phase 3/4] Spike — ${spikeConcurrency} concurrent for ${CONFIG.spikeDuration}s...`);
  await runPhase('Spike', spikeConcurrency, CONFIG.spikeDuration * 1000, visitorIds);

  console.log(`\n[Phase 4/4] Cool-down — ${CONFIG.coolDownConcurrency} concurrent for ${CONFIG.coolDownDuration}s...`);
  await runPhase('Cool-down', CONFIG.coolDownConcurrency, CONFIG.coolDownDuration * 1000, visitorIds);

  const testDurationSec = (Date.now() - testStartTime) / 1000;

  await new Promise(resolve => setTimeout(resolve, 2000));

  const countAfter = await getPageViewCount();

  const criteria = printResults(testDurationSec, countBefore, countAfter);

  const allPassed = criteria.every(c => c.pass);
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('\nStress test failed:', err);
  process.exit(1);
});

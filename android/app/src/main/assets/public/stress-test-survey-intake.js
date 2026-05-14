// Stress test — Survey response intake (Task #227 / Task #167)
//
// The public POST endpoint /api/survey/response is the prospect lead-capture
// surface and a known abuse target (no auth). This test validates:
//   1. Concurrent POSTs from many simulated anonymous IPs persist all 22
//      dimensions correctly under load (each request rotates through a pool
//      of fake IPs via X-Forwarded-For — the per-IP rate-limit bucket
//      `survey:<ip>` is keyed off this).
//   2. Rate-limit returns clean 429 (not 500) when triggered.
//   3. Inserted rows match successful POST count (no silent drops).
//   4. The expanded admin survey-analytics aggregation (Task #167) stays
//      responsive while intake load is sustained — a separate phase drives
//      GET /api/admin/survey-analytics with an admin sim token in parallel
//      with the cool-down POSTs and asserts p95 < 5s + zero 5xx.
//
// Endpoints under test:
//   POST /api/survey/response       (server.js:44087)
//   GET  /api/admin/survey-analytics (server.js:45120)
//
// Usage: node www/stress-test-survey-intake.js
//        node www/stress-test-survey-intake.js --concurrency=20 --duration=20

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
function flag(name) { return args.includes(`--${name}`); }
const ALLOW_ANALYTICS_SKIP = flag('allow-analytics-skip');
function param(name, def) {
  const f = args.find(a => a.startsWith(`--${name}=`));
  return f ? Number.parseInt(f.split('=')[1], 10) : def;
}
function strParam(name, def) {
  const f = args.find(a => a.startsWith(`--${name}=`));
  return f ? f.split('=').slice(1).join('=') : def;
}

const CONFIG = {
  concurrency:        param('concurrency', 50),
  duration:           param('duration', 30),
  rampUpTime:         param('ramp-up', 10),
  spikeMultiplier:    2,
  spikeDuration:      8,
  coolDownDuration:   8,
  coolDownConcurrency: 5,
  requestTimeout:     5000,
  baseUrl:            strParam('base-url', process.env.STRESS_TEST_BASE_URL || 'http://localhost:5000'),
};
const BASE_URL = CONFIG.baseUrl;
// Task #259: do not hard-code stress-test passwords. Operators must supply
// STRESS_TEST_PASSWORD; we fail loudly so a misconfigured run can't silently
// fall back to a known-weak credential.
const SIM_PASSWORD = process.env.STRESS_TEST_PASSWORD;
if (!SIM_PASSWORD) {
  console.error('STRESS_TEST_PASSWORD environment variable is required');
  process.exit(1);
}
const RESERVOIR_SIZE = 50000;
const STRESS_TAG = `stress-survey-${Date.now()}`;

// All 22 survey dimensions per Task #167 (CHART_KEYS in www/admin.js).
// Each stress payload includes EVERY dimension so persistence can be
// verified end-to-end in the integrity check.
const SURVEY_KEYS = [
  'experience_level', 'service_satisfaction', 'biggest_pain', 'desired_improvement',
  'discovery_channel', 'services_used', 'service_frequency', 'spend_level',
  'spend_predictability', 'price_comfort', 'competitive_bid_appetite',
  'shop_around_behavior', 'verification_trust', 'review_trust', 'dispute_history',
  'tracking_interest', 'communication_preference', 'reminder_preference',
  'app_usage_frequency', 'install_intent', 'refer_intent', 'feedback_openness',
];
const ANSWER_OPTIONS = ['option_a', 'option_b', 'option_c', 'option_d', 'skipped'];

function createMetric(name) {
  return {
    name, requests: 0, errors: 0, rateLimited: 0,
    latencies: new Float32Array(RESERVOIR_SIZE), latencyCount: 0,
    statusCodes: {}
  };
}
const metrics = {
  post: createMetric('POST /api/survey/response'),
  analytics: createMetric('GET /api/admin/survey-analytics'),
};

// Pool of fake source IPs. The server keys its survey rate-limit bucket on
// `survey:<client-ip>` (server.js:44093) and resolves client-ip via
// X-Forwarded-For (server.js:340). Rotating through a pool spreads load
// across many buckets exactly the way real public traffic does.
// RFC-5737 TEST-NET-1 (192.0.2.0/24) — reserved for documentation/examples;
// guaranteed to never collide with a real client IP. We rotate through all
// 254 host addresses (1..254 — .0 network and .255 broadcast are excluded).
const IP_POOL_SIZE = 254;
const IP_POOL = Array.from({ length: IP_POOL_SIZE }, (_, i) => `192.0.2.${i + 1}`);
function pickIP() { return IP_POOL[Math.floor(Math.random() * IP_POOL.length)]; }

function addLatency(m, lat) {
  if (m.latencyCount < RESERVOIR_SIZE) {
    m.latencies[m.latencyCount] = lat;
  } else {
    const j = Math.floor(Math.random() * (m.latencyCount + 1));
    if (j < RESERVOIR_SIZE) m.latencies[j] = lat;
  }
  m.latencyCount++;
}
function recordMetric(m, lat, status) {
  m.requests++;
  addLatency(m, lat);
  m.statusCodes[status] = (m.statusCodes[status] || 0) + 1;
  if (status === 429) m.rateLimited++;
  else if (status >= 500 || status === 0) m.errors++;
  // Track 4xx (excl. 429) separately. Payloads are well-formed so a non-trivial
  // 400/422 rate would indicate a schema/validation regression hiding under load.
  else if (status >= 400 && status < 500) m.clientErrors = (m.clientErrors || 0) + 1;
}
function getLatencies(m) {
  const len = Math.min(m.latencyCount, RESERVOIR_SIZE);
  return Array.from(m.latencies.subarray(0, len));
}
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)];
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function buildPayload(idx) {
  const discovery = {};
  for (const k of SURVEY_KEYS) discovery[k] = pick(ANSWER_OPTIONS);
  return {
    discovery_answers: discovery,
    interested: Math.random() < 0.7,
    session_id: `${STRESS_TAG}-session-${idx}-${crypto.randomBytes(4).toString('hex')}`,
    email: `${STRESS_TAG}-${idx}-${crypto.randomBytes(3).toString('hex')}@mcc-stress.test`,
    first_name: 'Stress',
  };
}

async function timedFetch(url, opts = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.requestTimeout);
  const start = Date.now();
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timeout);
    return { status: res.status, latency: Date.now() - start };
  } catch (err) {
    clearTimeout(timeout);
    return { status: 0, latency: Date.now() - start };
  }
}

let postCounter = 0;
async function doPost() {
  const idx = postCounter++;
  const payload = buildPayload(idx);
  const ip = pickIP();
  const { status, latency } = await timedFetch(`${BASE_URL}/api/survey/response`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Spoof source IP so the per-IP rate-limit bucket rotates across the pool.
      'X-Forwarded-For': ip,
    },
    body: JSON.stringify(payload),
  });
  recordMetric(metrics.post, latency, status);
}

let adminToken = null;
async function loadAdminToken() {
  // Find a sim admin from the existing sim pool. We do NOT create one — the
  // suite assumes sim accounts are persistent across runs.
  const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const adminUser = (data?.users || []).find(u =>
    u.email && u.email.endsWith('@mcc-sim.test') && u.email.startsWith('sim-admin-')
  );
  if (!adminUser) return null;
  const c = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: sess } = await c.auth.signInWithPassword({
    email: adminUser.email, password: SIM_PASSWORD
  });
  return sess?.session?.access_token || null;
}

async function doAnalyticsRead() {
  if (!adminToken) return;
  const { status, latency } = await timedFetch(
    `${BASE_URL}/api/admin/survey-analytics`,
    { method: 'GET', headers: { 'Authorization': `Bearer ${adminToken}` } }
  );
  recordMetric(metrics.analytics, latency, status);
}

// True when the given runPhase tick should also fire an analytics read.
// Extracted from runPhase so the loop driver stays under the
// cognitive-complexity budget (Task #262).
function _shouldFireAnalytics(withAnalytics) {
  return withAnalytics && adminToken && Math.random() < 0.1;
}

async function runPhase(name, concurrency, durationMs, withAnalytics = false) {
  const endTime = Date.now() + durationMs;
  let active = 0;
  let analyticsActive = 0;
  await new Promise(resolve => {
    const allDone = () => active === 0 && analyticsActive === 0;
    const tick = () => {
      while (active < concurrency && Date.now() < endTime) {
        active++;
        if (_shouldFireAnalytics(withAnalytics)) {
          analyticsActive++;
          doAnalyticsRead().then(() => {
            analyticsActive--;
            if (Date.now() >= endTime && allDone()) resolve();
          });
        }
        doPost().then(() => {
          active--;
          if (Date.now() < endTime) tick();
          else if (allDone()) resolve();
        });
      }
      if (Date.now() >= endTime && allDone()) resolve();
    };
    tick();
  });
  console.log(`  [${name}] posts: ${metrics.post.requests}, analytics: ${metrics.analytics.requests}`);
}

async function checkIntegrity() {
  const { data: rows, count } = await supabaseAdmin
    .from('survey_responses')
    .select('id, email, discovery_answers', { count: 'exact' })
    .like('email', `${STRESS_TAG}-%`);
  const sampleSize = Math.min(20, (rows || []).length);
  let rowsMissingDimensions = 0;
  let totalDimensions = 0;
  for (const r of (rows || []).slice(0, sampleSize)) {
    const da = r.discovery_answers || {};
    const presentKeys = SURVEY_KEYS.filter(k => k in da);
    totalDimensions += presentKeys.length;
    if (presentKeys.length < SURVEY_KEYS.length) rowsMissingDimensions++;
  }
  return {
    totalInserted: (count !== null && count !== undefined) ? count : (rows || []).length,
    sampleSize,
    rowsMissingDimensions,
    avgDimensionsPerRow: sampleSize > 0 ? (totalDimensions / sampleSize).toFixed(1) : '0',
  };
}

async function cleanup() {
  await supabaseAdmin.from('survey_responses').delete().like('email', `${STRESS_TAG}-%`);
}

function printResults(durationSec, integrity) {
  const arr = getLatencies(metrics.post);
  const p50 = percentile(arr, 50);
  const p95 = percentile(arr, 95);
  const p99 = percentile(arr, 99);
  const success200 = metrics.post.statusCodes[200] || 0;
  const clientErrors = metrics.post.clientErrors || 0;
  const errRate = metrics.post.requests > 0
    ? (metrics.post.errors / metrics.post.requests) * 100
    : 0;
  const clientErrRate = metrics.post.requests > 0
    ? (clientErrors / metrics.post.requests) * 100
    : 0;
  const insertRatio = success200 > 0 ? integrity.totalInserted / success200 : 0;

  console.log('\n====================================================');
  console.log('  Survey Intake — RESULTS');
  console.log('====================================================');
  console.log(`  Duration:           ${durationSec.toFixed(1)}s`);
  console.log(`  Total POSTs:        ${metrics.post.requests}`);
  console.log(`  200s:               ${success200}`);
  console.log(`  429s (rate limit):  ${metrics.post.rateLimited}`);
  console.log(`  4xx (excl. 429):    ${clientErrors} (${clientErrRate.toFixed(2)}%)`);
  console.log(`  Status codes:       ${JSON.stringify(metrics.post.statusCodes)}`);
  console.log(`  Latency p50/p95/p99: ${p50}/${p95}/${p99}ms`);
  console.log(`  Rows inserted:      ${integrity.totalInserted}`);
  console.log(`  Insert ratio (200s): ${success200 > 0 ? (insertRatio*100).toFixed(1) + '%' : 'n/a'}`);
  console.log(`  Sample size:        ${integrity.sampleSize}`);
  console.log(`  Avg dims/row:       ${integrity.avgDimensionsPerRow}/22`);
  console.log(`  Rows missing dims:  ${integrity.rowsMissingDimensions}`);

  // Analytics aggregation path (Task #167) — exercised in the cool-down phase.
  const aArr = getLatencies(metrics.analytics);
  const aP95 = percentile(aArr, 95);
  const a200 = metrics.analytics.statusCodes[200] || 0;
  const a401 = metrics.analytics.statusCodes[401] || 0;
  const a403 = metrics.analytics.statusCodes[403] || 0;
  const aAuthFail = a401 + a403;
  const aErr = metrics.analytics.errors; // 5xx + timeouts (non-401-counted via recordMetric)
  const aErrRate = metrics.analytics.requests > 0 ? (aErr / metrics.analytics.requests) * 100 : 0;
  const aAuthFailRate = metrics.analytics.requests > 0 ? (aAuthFail / metrics.analytics.requests) * 100 : 0;
  console.log(`  Analytics calls:    ${metrics.analytics.requests} (200s=${a200}, 401/403=${aAuthFail}, 5xx=${aErr})`);
  console.log(`  Analytics p95:      ${aP95}ms`);
  // If analytics requests never happened (no admin sim, server down, etc.),
  // surface that as a clean skip — but tighten authentication assertions
  // when analytics DID run so a misconfigured admin token can't silently
  // pass with all 401/403 responses.
  const analyticsRan = metrics.analytics.requests > 0;

  console.log('\n  PASS/FAIL CRITERIA');
  console.log('  ' + '-'.repeat(60));
  const criteria = [
    { name: 'p95 < 1000ms',                   value: `${p95}ms`,                                       pass: p95 < 1000 },
    { name: '5xx error rate < 1%',            value: `${errRate.toFixed(2)}%`,                         pass: errRate < 1 },
    { name: '4xx (excl. 429) rate < 1%',      value: `${clientErrRate.toFixed(2)}%`,                   pass: clientErrRate < 1 },
    { name: 'Insert ratio >= 95% of 200s',    value: success200 > 0 ? `${(insertRatio*100).toFixed(1)}%` : 'no 200s', pass: success200 === 0 || insertRatio >= 0.95 },
    { name: 'All sampled rows have 22 dims',  value: integrity.sampleSize === 0 ? 'no inserts to sample' : `${integrity.rowsMissingDimensions} missing`, pass: integrity.rowsMissingDimensions === 0 },
    { name: 'Successful 200 floor (≥ max(10, 1% of POSTs))',
      // Without a hard 200-floor, an all-429 / all-4xx run could silently
      // PASS (insert ratio + dim-check both pass when success200 === 0).
      // Floor is the larger of 10 absolute or 1% of total POSTs so a small
      // local run still has a meaningful gate without flaking on bursty
      // 429 spikes during the spike phase.
      value: `${success200} 200(s) of ${metrics.post.requests} POSTs`,
      pass: success200 >= Math.max(10, Math.ceil(metrics.post.requests * 0.01)) },
    { name: 'Inserted rows floor (≥ max(10, 95% of 200s))',
      // Belt-and-suspenders alongside insert-ratio: even if the 200 floor
      // is met, we explicitly require the row count itself to clear a
      // numeric floor so a degraded write path producing 200 OK with no
      // row insert can't slip through.
      value: `${integrity.totalInserted} rows`,
      pass: integrity.totalInserted >= Math.max(10, Math.ceil(success200 * 0.95)) },
    { name: 'Analytics p95 < 5000ms',         value: analyticsRan ? `${aP95}ms` : 'no admin sim',     pass: !analyticsRan || aP95 < 5000 },
    { name: 'Analytics 5xx rate < 1%',        value: analyticsRan ? `${aErrRate.toFixed(2)}%` : 'no admin sim', pass: !analyticsRan || aErrRate < 1 },
    { name: 'Analytics auth (401/403) rate < 1%',
      // If the admin token is misconfigured we will see an avalanche of
      // 401/403s; without this assertion the analytics phase would silently
      // pass with zero authenticated success.
      value: analyticsRan ? `${aAuthFailRate.toFixed(2)}% (${aAuthFail}/${metrics.analytics.requests})` : 'no admin sim',
      pass: !analyticsRan || aAuthFailRate < 1 },
    { name: 'Analytics had ≥ 1 successful 200',
      value: analyticsRan ? `${a200} 200(s)` : 'no admin sim',
      pass: !analyticsRan || a200 >= 1 },
    { name: 'Analytics phase actually exercised (admin token resolved)',
      // Mandatory by default. If your environment has no sim-admin-* user
      // (e.g. local dev), pass --allow-analytics-skip to opt out — but in
      // CI / pre-launch this should always run, otherwise the analytics
      // assertions above are vacuous.
      value: analyticsRan
        ? 'YES'
        : (ALLOW_ANALYTICS_SKIP ? 'NO (skip allowed via --allow-analytics-skip)' : 'NO — no admin sim found'),
      pass: analyticsRan || ALLOW_ANALYTICS_SKIP },
  ];
  for (const c of criteria) {
    console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name.padEnd(36)} ${c.value}`);
  }
  console.log('\n====================================================\n');
  return criteria;
}

async function main() {
  console.log('\n====================================================');
  console.log('  MCC — Survey Intake Stress Test');
  console.log('====================================================');
  console.log(`  Target:        ${BASE_URL}`);
  console.log(`  Concurrency:   ${CONFIG.concurrency}`);
  console.log(`  Duration:      ${CONFIG.duration}s`);
  console.log(`  Spike:         ${CONFIG.spikeMultiplier}x for ${CONFIG.spikeDuration}s`);
  console.log('====================================================\n');

  let exitCode = 1;
  try {
    await cleanup();  // defensive

    console.log('[Setup] Loading admin sim token for analytics aggregation phase...');
    adminToken = await loadAdminToken();
    if (!adminToken) {
      console.warn('  No sim-admin-* user found in @mcc-sim.test pool — analytics phase will be skipped.');
    }

    const start = Date.now();
    console.log('[Phase 1/4] Ramp-up...');
    await runPhase('Ramp', Math.ceil(CONFIG.concurrency * 0.3), CONFIG.rampUpTime * 1000);
    console.log('[Phase 2/4] Sustained...');
    await runPhase('Sustained', CONFIG.concurrency, CONFIG.duration * 1000);
    console.log('[Phase 3/4] Spike...');
    await runPhase('Spike', CONFIG.concurrency * CONFIG.spikeMultiplier, CONFIG.spikeDuration * 1000);
    console.log('[Phase 4/4] Cool-down (with admin analytics aggregation)...');
    await runPhase('Cool', CONFIG.coolDownConcurrency, CONFIG.coolDownDuration * 1000, true);
    const dur = (Date.now() - start) / 1000;

    await new Promise(r => setTimeout(r, 1500));

    console.log('\n[Integrity] Verifying inserts and dimension persistence...');
    const integrity = await checkIntegrity();
    const criteria = printResults(dur, integrity);
    exitCode = criteria.every(c => c.pass) ? 0 : 1;
  } catch (err) {
    console.error('\n[FATAL]', err.message, err.stack);
  } finally {
    console.log('[Cleanup] Removing stress survey responses...');
    await cleanup();
    process.exit(exitCode);
  }
}

main().catch(err => { console.error('Unhandled:', err); process.exit(1); });

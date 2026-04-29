// Stress test — Survey response intake (Task #227 / Task #167)
//
// The public POST endpoint /api/survey/response is the prospect lead-capture
// surface and a known abuse target (no auth). This test validates:
//   1. Concurrent POSTs persist all 22 dimensions correctly under load.
//   2. Rate-limit returns clean 429 (not 500) when triggered.
//   3. Inserted rows match successful POST count (no silent drops).
//
// Endpoint under test: POST /api/survey/response (server.js:44087)
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
function param(name, def) {
  const f = args.find(a => a.startsWith(`--${name}=`));
  return f ? parseInt(f.split('=')[1], 10) : def;
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
const metrics = { post: createMetric('POST /api/survey/response') };

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

async function timedFetch(url, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.requestTimeout);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
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
  const { status, latency } = await timedFetch(`${BASE_URL}/api/survey/response`, payload);
  recordMetric(metrics.post, latency, status);
}

async function runPhase(name, concurrency, durationMs) {
  const endTime = Date.now() + durationMs;
  let active = 0;
  await new Promise(resolve => {
    const tick = () => {
      while (active < concurrency && Date.now() < endTime) {
        active++;
        doPost().then(() => {
          active--;
          if (Date.now() < endTime) tick();
          else if (active === 0) resolve();
        });
      }
      if (Date.now() >= endTime && active === 0) resolve();
    };
    tick();
  });
  console.log(`  [${name}] requests so far: ${metrics.post.requests}`);
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
  const errRate = metrics.post.requests > 0
    ? (metrics.post.errors / metrics.post.requests) * 100
    : 0;
  const insertRatio = success200 > 0 ? integrity.totalInserted / success200 : 0;

  console.log('\n====================================================');
  console.log('  Survey Intake — RESULTS');
  console.log('====================================================');
  console.log(`  Duration:           ${durationSec.toFixed(1)}s`);
  console.log(`  Total POSTs:        ${metrics.post.requests}`);
  console.log(`  200s:               ${success200}`);
  console.log(`  429s (rate limit):  ${metrics.post.rateLimited}`);
  console.log(`  Status codes:       ${JSON.stringify(metrics.post.statusCodes)}`);
  console.log(`  Latency p50/p95/p99: ${p50}/${p95}/${p99}ms`);
  console.log(`  Rows inserted:      ${integrity.totalInserted}`);
  console.log(`  Insert ratio (200s): ${success200 > 0 ? (insertRatio*100).toFixed(1) + '%' : 'n/a'}`);
  console.log(`  Sample size:        ${integrity.sampleSize}`);
  console.log(`  Avg dims/row:       ${integrity.avgDimensionsPerRow}/22`);
  console.log(`  Rows missing dims:  ${integrity.rowsMissingDimensions}`);

  console.log('\n  PASS/FAIL CRITERIA');
  console.log('  ' + '-'.repeat(60));
  const criteria = [
    { name: 'p95 < 1000ms',                   value: `${p95}ms`,                                       pass: p95 < 1000 },
    { name: '5xx error rate < 1%',            value: `${errRate.toFixed(2)}%`,                         pass: errRate < 1 },
    { name: 'Insert ratio >= 95% of 200s',    value: success200 > 0 ? `${(insertRatio*100).toFixed(1)}%` : 'no 200s', pass: success200 === 0 || insertRatio >= 0.95 },
    { name: 'All sampled rows have 22 dims',  value: integrity.sampleSize === 0 ? 'no inserts to sample' : `${integrity.rowsMissingDimensions} missing`, pass: integrity.rowsMissingDimensions === 0 },
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

    const start = Date.now();
    console.log('[Phase 1/4] Ramp-up...');
    await runPhase('Ramp', Math.ceil(CONFIG.concurrency * 0.3), CONFIG.rampUpTime * 1000);
    console.log('[Phase 2/4] Sustained...');
    await runPhase('Sustained', CONFIG.concurrency, CONFIG.duration * 1000);
    console.log('[Phase 3/4] Spike...');
    await runPhase('Spike', CONFIG.concurrency * CONFIG.spikeMultiplier, CONFIG.spikeDuration * 1000);
    console.log('[Phase 4/4] Cool-down...');
    await runPhase('Cool', CONFIG.coolDownConcurrency, CONFIG.coolDownDuration * 1000);
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

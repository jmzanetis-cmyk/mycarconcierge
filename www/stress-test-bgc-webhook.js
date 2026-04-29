// Stress test — Background Check webhook idempotency (Task #227)
//
// Stress-tests netlify/functions/background-check-webhook.js by invoking the
// handler in-process. The value is validating OUR signature verification + DB
// upsert + downstream notification idempotency under concurrent retries, not
// Netlify's HTTP routing layer (which we don't own). Each "candidate" gets N
// concurrent webhook deliveries with the same valid signature, simulating a
// webhook sender's retry storm. Verifies each employee_background_checks row
// is updated to a stable terminal state and no duplicate rows are produced.
//
// SKIPS gracefully (exit 0) if BGC_WEBHOOK_SECRET is absent — this lets the
// test live in the suite even before the secret is provisioned.
//
// Usage: node www/stress-test-bgc-webhook.js
//        node www/stress-test-bgc-webhook.js --concurrency=10 --duration=15

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ifbyjxuaclwmadqbjcyp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BGC_WEBHOOK_SECRET = process.env.BGC_WEBHOOK_SECRET;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

if (!BGC_WEBHOOK_SECRET) {
  console.log('\n====================================================');
  console.log('  BGC Webhook Stress Test — SKIPPED');
  console.log('====================================================');
  console.log('  BGC_WEBHOOK_SECRET is not set. The webhook handler');
  console.log('  rejects all requests when the secret is absent, so');
  console.log('  the test cannot meaningfully exercise it.');
  console.log('  Provision BGC_WEBHOOK_SECRET to enable this test.');
  console.log('  Exiting 0 so the suite still passes.');
  console.log('====================================================\n');
  process.exit(0);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// In-process load of the webhook handler.
const handlerPath = path.join(__dirname, '..', 'netlify', 'functions', 'background-check-webhook.js');
let handler;
try {
  ({ handler } = require(handlerPath));
} catch (err) {
  console.error(`  [FATAL] Failed to load webhook handler from ${handlerPath}: ${err.message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
function param(name, def) {
  const f = args.find(a => a.startsWith(`--${name}=`));
  return f ? parseInt(f.split('=')[1], 10) : def;
}

const CONFIG = {
  concurrency:        param('concurrency', 20),
  duration:           param('duration', 20),
  rampUpTime:         param('ramp-up', 5),
  spikeMultiplier:    2,
  spikeDuration:      5,
  coolDownDuration:   5,
  coolDownConcurrency: 5,
  candidateCount:     param('candidates', 25),
  duplicatesPerCandidate: param('duplicates', 10),
};

const STRESS_TAG = 'stress-bgc-' + Date.now();
const RESERVOIR_SIZE = 50000;

function createMetric(name) {
  return {
    name, requests: 0, errors: 0, signatureRejects: 0,
    latencies: new Float32Array(RESERVOIR_SIZE), latencyCount: 0,
    statusCodes: {}
  };
}
const metrics = { webhook: createMetric('Webhook handler') };

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
  if (status === 401) m.signatureRejects++;
  else if (status >= 400 || status === 0) m.errors++;
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

async function seedCandidates() {
  const { data: providers } = await supabaseAdmin
    .from('providers')
    .select('id')
    .limit(1);
  if (!providers || providers.length === 0) {
    console.error('  No providers in DB. Cannot seed background-check rows.');
    process.exit(1);
  }
  const providerId = providers[0].id;
  const seeded = [];
  for (let i = 0; i < CONFIG.candidateCount; i++) {
    const reportId = `${STRESS_TAG}-${i}`;
    const { data, error } = await supabaseAdmin.from('employee_background_checks').insert({
      provider_id: providerId,
      bgc_report_id: reportId,
      candidate_name: `[${STRESS_TAG}] Candidate #${i}`,
      candidate_email: `${STRESS_TAG}-${i}@example.test`,
      status: 'pending',
    }).select('id, bgc_report_id').single();
    if (error || !data) {
      console.log(`  [WARN] Seed candidate ${i} failed: ${error?.message}`);
      continue;
    }
    seeded.push({ id: data.id, reportId: data.bgc_report_id });
  }
  return seeded;
}

function buildPayload(reportId) {
  return JSON.stringify({
    report_id: reportId,
    status: 'clear',
    completed_at: new Date().toISOString(),
  });
}

function signPayload(rawBody) {
  return crypto.createHmac('sha256', BGC_WEBHOOK_SECRET).update(rawBody).digest('hex');
}

async function deliverWebhook(reportId) {
  const rawBody = buildPayload(reportId);
  const sig = signPayload(rawBody);
  const event = {
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': sig },
    body: rawBody,
  };
  const start = Date.now();
  try {
    const result = await handler(event);
    const lat = Date.now() - start;
    recordMetric(metrics.webhook, lat, result?.statusCode || 0);
  } catch (err) {
    const lat = Date.now() - start;
    recordMetric(metrics.webhook, lat, 0);
  }
}

async function runPhase(name, concurrency, durationMs, candidates) {
  const endTime = Date.now() + durationMs;
  let active = 0;
  await new Promise(resolve => {
    const tick = () => {
      while (active < concurrency && Date.now() < endTime) {
        active++;
        deliverWebhook(pick(candidates).reportId).then(() => {
          active--;
          if (Date.now() < endTime) tick();
          else if (active === 0) resolve();
        });
      }
      if (Date.now() >= endTime && active === 0) resolve();
    };
    tick();
  });
  console.log(`  [${name}] requests so far: ${metrics.webhook.requests}`);
}

async function checkIntegrity(seeded) {
  const ids = seeded.map(c => c.id);
  const { data: rows } = await supabaseAdmin
    .from('employee_background_checks')
    .select('id, bgc_report_id, status, completed_at, expires_at')
    .in('id', ids);
  const stats = { updated: 0, stillPending: 0, badStatus: 0 };
  for (const r of (rows || [])) {
    if (r.status === 'pending') stats.stillPending++;
    else if (r.status === 'clear') stats.updated++;
    else stats.badStatus++;
  }
  // Each report_id should appear exactly once across the table.
  const { data: byReport } = await supabaseAdmin
    .from('employee_background_checks')
    .select('bgc_report_id')
    .like('bgc_report_id', `${STRESS_TAG}-%`);
  const reportCounts = {};
  for (const r of (byReport || [])) {
    reportCounts[r.bgc_report_id] = (reportCounts[r.bgc_report_id] || 0) + 1;
  }
  const duplicates = Object.entries(reportCounts).filter(([, v]) => v > 1).length;
  return {
    ...stats,
    duplicates,
    totalRows: (rows || []).length,
  };
}

async function cleanup() {
  await supabaseAdmin.from('employee_background_checks')
    .delete()
    .like('bgc_report_id', `${STRESS_TAG}-%`);
}

function printResults(durationSec, integrity) {
  const arr = getLatencies(metrics.webhook);
  const p50 = percentile(arr, 50);
  const p95 = percentile(arr, 95);
  const p99 = percentile(arr, 99);
  const errRate = metrics.webhook.requests > 0
    ? (metrics.webhook.errors / metrics.webhook.requests) * 100
    : 0;
  console.log('\n====================================================');
  console.log('  BGC Webhook — RESULTS');
  console.log('====================================================');
  console.log(`  Duration:           ${durationSec.toFixed(1)}s`);
  console.log(`  Total requests:     ${metrics.webhook.requests}`);
  console.log(`  Status codes:       ${JSON.stringify(metrics.webhook.statusCodes)}`);
  console.log(`  Latency p50/p95/p99: ${p50}/${p95}/${p99}ms`);
  console.log(`  Updated rows:       ${integrity.updated}/${integrity.totalRows}`);
  console.log(`  Still pending:      ${integrity.stillPending}`);
  console.log(`  Bad status:         ${integrity.badStatus}`);
  console.log(`  Duplicate report_id rows: ${integrity.duplicates}`);

  console.log('\n  PASS/FAIL CRITERIA');
  console.log('  ' + '-'.repeat(60));
  const criteria = [
    { name: 'p95 < 2000ms',                  value: `${p95}ms`,                                      pass: p95 < 2000 },
    { name: 'Non-401 error rate < 5%',       value: `${errRate.toFixed(2)}%`,                        pass: errRate < 5 },
    { name: 'No duplicate report_id rows',   value: `${integrity.duplicates}`,                       pass: integrity.duplicates === 0 },
    { name: 'All seeded rows updated',       value: `${integrity.updated}/${integrity.totalRows}`,   pass: integrity.totalRows > 0 && integrity.updated === integrity.totalRows },
  ];
  for (const c of criteria) {
    console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name.padEnd(36)} ${c.value}`);
  }
  console.log('\n====================================================\n');
  return criteria;
}

async function main() {
  console.log('\n====================================================');
  console.log('  My Car Concierge — BGC Webhook Stress Test');
  console.log('====================================================');
  console.log(`  Concurrency:        ${CONFIG.concurrency}`);
  console.log(`  Duration:           ${CONFIG.duration}s`);
  console.log(`  Candidates seeded:  ${CONFIG.candidateCount}`);
  console.log(`  Dup-per-candidate:  ${CONFIG.duplicatesPerCandidate}`);
  console.log('====================================================\n');

  let seeded = [];
  let exitCode = 1;
  try {
    console.log('[Setup] Seeding background-check candidates...');
    seeded = await seedCandidates();
    console.log(`  Seeded ${seeded.length} candidates`);
    if (seeded.length === 0) {
      console.error('  No candidates seeded.');
      process.exit(1);
    }

    const start = Date.now();
    console.log('\n[Phase 1/4] Ramp-up...');
    await runPhase('Ramp', Math.ceil(CONFIG.concurrency * 0.3), CONFIG.rampUpTime * 1000, seeded);
    console.log('[Phase 2/4] Sustained...');
    await runPhase('Sustained', CONFIG.concurrency, CONFIG.duration * 1000, seeded);
    console.log('[Phase 3/4] Spike...');
    await runPhase('Spike', CONFIG.concurrency * CONFIG.spikeMultiplier, CONFIG.spikeDuration * 1000, seeded);
    console.log('[Phase 4/4] Cool-down...');
    await runPhase('Cool', CONFIG.coolDownConcurrency, CONFIG.coolDownDuration * 1000, seeded);
    const dur = (Date.now() - start) / 1000;

    await new Promise(r => setTimeout(r, 1500));

    console.log('\n[Integrity] Verifying webhook idempotency...');
    const integrity = await checkIntegrity(seeded);
    const criteria = printResults(dur, integrity);
    exitCode = criteria.every(c => c.pass) ? 0 : 1;
  } catch (err) {
    console.error('\n[FATAL]', err.message, err.stack);
  } finally {
    console.log('[Cleanup] Removing seeded candidates...');
    await cleanup();
    process.exit(exitCode);
  }
}

main().catch(err => { console.error('Unhandled:', err); process.exit(1); });

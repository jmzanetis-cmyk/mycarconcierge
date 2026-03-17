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
  concurrency:    param('concurrency', 20),
  duration:       param('duration', 45),
  rampUpTime:     param('ramp-up', 15),
  spikeMultiplier: 2,
  spikeDuration:  10,
  coolDownDuration: 10,
  coolDownConcurrency: 5,
  requestTimeout: 15000,
  interRequestDelay: 10,
  baseUrl: strParam('base-url', process.env.STRESS_TEST_BASE_URL || 'http://localhost:5000'),
};

const BASE_URL = CONFIG.baseUrl;
const SIM_DOMAIN = '@mcc-sim.test';
const SIM_PASSWORD = 'SimPass123!';

const OBD_PAYLOADS = [
  { codes: ['P0300'], desc: 'Random/multiple cylinder misfire' },
  { codes: ['P0420'], desc: 'Catalyst efficiency below threshold' },
  { codes: ['P0171'], desc: 'System too lean (bank 1)' },
  { codes: ['B0001'], desc: 'Driver frontal stage 1 deployment control' },
  { codes: ['C0040'], desc: 'Right front wheel speed circuit malfunction' },
  { codes: ['U0100'], desc: 'Lost communication with ECM/PCM' },
  { codes: ['P0300', 'P0420'], desc: 'Misfire + catalyst efficiency' },
  { codes: ['P0171', 'P0300', 'U0100'], desc: 'Lean + misfire + ECM comms' },
  { codes: ['B0001', 'C0040'], desc: 'Airbag + wheel speed' },
  { codes: ['P0420', 'P0171', 'C0040', 'U0100'], desc: 'Multi-system faults' },
];

const metrics = {
  obdScan:      { name: 'POST /obd/scan',      requests: 0, errors: 0, rateLimited: 0, timeouts: 0, unhandled500s: 0, latencies: [], statusCodes: {} },
  obdInterpret: { name: 'POST /obd/interpret',  requests: 0, errors: 0, rateLimited: 0, timeouts: 0, unhandled500s: 0, latencies: [], statusCodes: {} },
  obdScans:     { name: 'GET /obd/scans',       requests: 0, errors: 0, rateLimited: 0, timeouts: 0, unhandled500s: 0, latencies: [], statusCodes: {} },
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

  const memberIds = memberSessions.map(s => s.userId);
  const { data: vehicles } = await supabaseAdmin
    .from('vehicles')
    .select('id, owner_id, year, make, model')
    .in('owner_id', memberIds)
    .limit(50);

  if (!vehicles || vehicles.length === 0) {
    console.error('  No vehicles found for sim members. Run simulate-platform.js first.');
    process.exit(1);
  }

  console.log(`  Found ${vehicles.length} vehicles for testing`);

  const sessionVehicleMap = {};
  for (const v of vehicles) {
    if (!sessionVehicleMap[v.owner_id]) sessionVehicleMap[v.owner_id] = [];
    sessionVehicleMap[v.owner_id].push(v);
  }

  const enrichedSessions = memberSessions
    .filter(s => sessionVehicleMap[s.userId] && sessionVehicleMap[s.userId].length > 0)
    .map(s => ({
      ...s,
      vehicles: sessionVehicleMap[s.userId],
    }));

  if (enrichedSessions.length === 0) {
    console.error('  No members with vehicles found. Aborting.');
    process.exit(1);
  }

  console.log(`  ${enrichedSessions.length} members have vehicles — ready to test`);
  return { memberSessions: enrichedSessions };
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function runOBDScan(session) {
  const vehicle = pick(session.vehicles);
  const payload = pick(OBD_PAYLOADS);
  const result = await timedFetch(`${BASE_URL}/api/obd/scan`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      vehicleId: vehicle.id,
      codes: payload.codes,
      notes: `Stress test: ${payload.desc}`,
      source: 'manual',
    }),
  });
  if (result.timeout) {
    metrics.obdScan.timeouts++;
    metrics.obdScan.requests++;
    if (metrics.obdScan.latencies.length < MAX_LATENCIES) {
      metrics.obdScan.latencies.push(result.latency);
    }
    return;
  }
  recordMetric(metrics.obdScan, result.latency, result.status, result.body);
}

async function runOBDInterpret(session) {
  const payload = pick(OBD_PAYLOADS);
  const vehicle = pick(session.vehicles);
  const body = {
    codes: payload.codes,
    vehicleInfo: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
  };

  const result = await timedFetch(`${BASE_URL}/api/obd/interpret`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (result.timeout) {
    metrics.obdInterpret.timeouts++;
    metrics.obdInterpret.requests++;
    if (metrics.obdInterpret.latencies.length < MAX_LATENCIES) {
      metrics.obdInterpret.latencies.push(result.latency);
    }
    return;
  }
  recordMetric(metrics.obdInterpret, result.latency, result.status, result.body);
}

async function runGetScans(session) {
  const vehicle = pick(session.vehicles);
  const result = await timedFetch(`${BASE_URL}/api/obd/scans/${vehicle.id}`, {
    headers: { 'Authorization': `Bearer ${session.token}` },
  });
  if (result.timeout) {
    metrics.obdScans.timeouts++;
    metrics.obdScans.requests++;
    if (metrics.obdScans.latencies.length < MAX_LATENCIES) {
      metrics.obdScans.latencies.push(result.latency);
    }
    return;
  }
  recordMetric(metrics.obdScans, result.latency, result.status, result.body);
}

async function runWorker(data, stopSignal) {
  const { memberSessions } = data;

  while (!stopSignal.stop) {
    const action = Math.floor(Math.random() * 10) + 1;
    const session = pick(memberSessions);
    try {
      if (action <= 4) {
        await runOBDScan(session);
      } else if (action <= 7) {
        await runOBDInterpret(session);
      } else {
        await runGetScans(session);
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

function printResults(testDurationSec) {
  console.log('\n====================================================');
  console.log('  My Car Concierge — OBD Diagnostic API Stress Test Results');
  console.log('====================================================\n');

  const allMetrics = Object.values(metrics);
  const totalRequests    = allMetrics.reduce((s, m) => s + m.requests, 0);
  const totalErrors      = allMetrics.reduce((s, m) => s + m.errors, 0);
  const totalRateLimited = allMetrics.reduce((s, m) => s + m.rateLimited, 0);
  const totalTimeouts    = allMetrics.reduce((s, m) => s + m.timeouts, 0);
  const totalUnhandled   = allMetrics.reduce((s, m) => s + m.unhandled500s, 0);
  const allLatencies     = allMetrics.flatMap(m => m.latencies);
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
    console.log(`  Worker crashes:    ${workerUnhandledErrors} (unexpected runtime failures — check server logs)`);
  }
  console.log(`  Overall p50:       ${percentile(allLatencies, 50)}ms`);
  console.log(`  Overall p95:       ${percentile(allLatencies, 95)}ms`);
  console.log(`  Overall p99:       ${percentile(allLatencies, 99)}ms\n`);

  const header = '  Endpoint              Reqs   RPS    Errs    429s  Timeouts  Unhdl   p50     p95     p99     Status Codes';
  console.log(header);
  console.log('  ' + '-'.repeat(header.length - 2));

  for (const m of allMetrics) {
    const p50  = percentile(m.latencies, 50);
    const p95  = percentile(m.latencies, 95);
    const p99  = percentile(m.latencies, 99);
    const rps  = testDurationSec > 0 ? (m.requests / testDurationSec).toFixed(0) : 0;
    const codes = Object.entries(m.statusCodes).map(([k, v]) => `${k}:${v}`).join(' ');
    console.log(
      `  ${m.name.padEnd(20)} ${String(m.requests).padStart(6)} ${String(rps).padStart(5)}  ${String(m.errors).padStart(6)}  ${String(m.rateLimited).padStart(6)}  ${String(m.timeouts).padStart(8)}  ${String(m.unhandled500s).padStart(5)}  ${String(p50 + 'ms').padStart(6)}  ${String(p95 + 'ms').padStart(6)}  ${String(p99 + 'ms').padStart(6)}  ${codes}`
    );
  }

  console.log('\n  PASS/FAIL CRITERIA');
  console.log('  ' + '-'.repeat(60));

  const overallP95 = percentile(allLatencies, 95);
  const realErrorRate = totalRequests > 0
    ? ((totalErrors / (totalRequests - totalRateLimited)) * 100)
    : 0;
  const safeErrorRate = isFinite(realErrorRate) ? realErrorRate : 0;

  const criteria = [
    { name: 'p95 < 5000ms',                    value: `${overallP95}ms`,                     pass: overallP95 < 5000 },
    { name: 'Error rate < 5% (excl 429/503)',   value: `${safeErrorRate.toFixed(2)}%`,        pass: safeErrorRate < 5 },
    { name: 'Zero unhandled 500s',              value: `${totalUnhandled}`,                   pass: totalUnhandled === 0 },
  ];

  for (const c of criteria) {
    console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name.padEnd(35)} ${c.value}`);
  }

  console.log('\n====================================================\n');
  return criteria;
}

async function main() {
  console.log('\n====================================================');
  console.log('  My Car Concierge — OBD Diagnostic API Stress Test');
  console.log('====================================================');
  console.log(`  Target:              ${CONFIG.baseUrl}`);
  console.log(`  Target concurrency:  ${CONFIG.concurrency}`);
  console.log(`  Sustained duration:  ${CONFIG.duration}s`);
  console.log(`  Ramp-up time:        ${CONFIG.rampUpTime}s`);
  console.log(`  Spike multiplier:    ${CONFIG.spikeMultiplier}x`);
  console.log(`  Request timeout:     ${CONFIG.requestTimeout}ms`);
  console.log(`  Inter-request delay: ${CONFIG.interRequestDelay}ms`);
  console.log(`\n  Flows under test (all via server API, member JWT):`);
  console.log(`    1. POST /api/obd/scan       — Submit OBD codes for a vehicle (DB write)`);
  console.log(`    2. POST /api/obd/interpret   — AI interpretation of OBD codes (Gemini/Claude call)`);
  console.log(`    3. GET  /api/obd/scans/{id}  — Fetch scan history for a vehicle (DB read)`);
  console.log(`\n  OBD codes under test: P0300, P0420, P0171, B0001, C0040, U0100`);
  console.log(`  Text-mode only — no image upload (OCR path not tested)`);
  console.log('====================================================\n');

  console.log('[Setup] Loading test data and authenticating...');
  const data = await loadSimData();
  console.log('  Setup complete.\n');

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
  const criteria = printResults(testDurationSec);

  const allPassed = criteria.every(c => c.pass);
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('\nStress test failed:', err);
  process.exit(1);
});

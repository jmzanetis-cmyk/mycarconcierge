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
  burstConcurrency: param('burst-concurrency', 5),
  sessionCount:     param('sessions', 10),
  requestTimeout:   10000,
  baseUrl:          strParam('base-url', process.env.STRESS_TEST_BASE_URL || 'http://localhost:5000'),
};

const BASE_URL = CONFIG.baseUrl;
const SIM_DOMAIN = '@mcc-sim.test';
const SIM_PASSWORD = 'SimPass123!';
const RESERVOIR_SIZE = 50000;

function createMetric(name) {
  return { name, requests: 0, errors: 0, rateLimited: 0, timeouts: 0, latencies: new Float32Array(RESERVOIR_SIZE), latencyCount: 0, statusCodes: {} };
}

const metrics = {
  checkinStart:    createMetric('POST /api/checkin/start'),
  checkinComplete: createMetric('POST /api/checkin/{id}/complete'),
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

function recordMetric(metricKey, latency, status, expectedReject) {
  const metric = metrics[metricKey];
  metric.requests++;
  addLatency(metric, latency);
  metric.statusCodes[status] = (metric.statusCodes[status] || 0) + 1;
  if (status === 429) {
    metric.rateLimited++;
  } else if (expectedReject && (status === 400 || status === 409)) {
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
    let body = null;
    try { body = await res.json(); } catch {}
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
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

const SERVICE_CATEGORIES = [
  'Oil Change', 'Brake Service', 'Tire Rotation', 'Battery Replacement',
  'A/C Service', 'Engine Diagnostics', 'Detailing', 'Alignment',
];

const raceTracker = {};

async function loadSimData() {
  console.log('  Loading simulation data...');

  const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const simUsers = (allUsers?.users || []).filter(u => u.email && u.email.endsWith(SIM_DOMAIN));

  const providerEmails = simUsers.filter(u => u.email.startsWith('sim-provider-')).map(u => u.email).slice(0, 5);
  const memberEmails = simUsers.filter(u => u.email.startsWith('sim-member-')).map(u => u.email).slice(0, 10);

  if (providerEmails.length === 0) throw new Error('No simulation provider accounts found. Run simulate-platform.js first.');
  if (memberEmails.length === 0) throw new Error('No simulation member accounts found. Run simulate-platform.js first.');

  console.log(`  Found ${providerEmails.length} providers, ${memberEmails.length} members`);
  console.log('  Authenticating test users...');

  const providerSessions = [];
  for (const email of providerEmails) {
    const session = await getSession(email);
    if (session) providerSessions.push(session);
  }

  const memberSessions = [];
  for (const email of memberEmails) {
    if (memberSessions.length >= 5) break;
    const session = await getSession(email);
    if (session) memberSessions.push(session);
  }

  if (providerSessions.length === 0) throw new Error('Could not authenticate any provider accounts.');
  if (memberSessions.length === 0) throw new Error('Could not authenticate any member accounts.');

  console.log(`  Authenticated: ${providerSessions.length} providers, ${memberSessions.length} members`);

  const { data: memberVehicles } = await supabaseAdmin
    .from('vehicles')
    .select('id, owner_id')
    .in('owner_id', memberSessions.map(s => s.userId))
    .limit(50);

  const vehicleMap = {};
  for (const v of (memberVehicles || [])) {
    if (!vehicleMap[v.owner_id]) vehicleMap[v.owner_id] = [];
    vehicleMap[v.owner_id].push(v.id);
  }

  return { providerSessions, memberSessions, vehicleMap };
}

async function seedCheckinSession(providerSession, memberSession, vehicleId, cleanupState) {
  const startRes = await timedFetch(`${BASE_URL}/api/checkin/start`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${providerSession.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ providerId: providerSession.userId }),
  });

  recordMetric('checkinStart', startRes.latency, startRes.status);

  if (!startRes.ok || !startRes.body?.session?.id) {
    return null;
  }

  const sessionId = startRes.body.session.id;
  cleanupState.sessionIds.push(sessionId);

  await supabaseAdmin
    .from('checkin_sessions')
    .update({
      member_id: memberSession.userId,
      vehicle_id: vehicleId,
      service_category: pick(SERVICE_CATEGORIES),
      service_description: 'Stress test check-in',
      status: 'service_selected',
    })
    .eq('id', sessionId);

  return sessionId;
}

async function fireCompleteBurst(sessionId, providerSession, burstSize, cleanupState) {
  const tracker = { sessionId, responses: [] };
  raceTracker[sessionId] = tracker;

  const promises = [];
  for (let i = 0; i < burstSize; i++) {
    promises.push(
      timedFetch(`${BASE_URL}/api/checkin/${sessionId}/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${providerSession.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }).then(result => {
        tracker.responses.push(result);
        if (result.status === 200 && result.body?.queueId) {
          cleanupState.createdQueueIds.add(result.body.queueId);
        }
        if (result.timeout) {
          metrics.checkinComplete.timeouts++;
        }
        const isExpectedReject = result.status === 400 || result.status === 409;
        recordMetric('checkinComplete', result.latency, result.status, isExpectedReject);
        return result;
      })
    );
  }

  await Promise.all(promises);
  return tracker;
}

async function checkDuplicateQueueIntegrity(cleanupState) {
  console.log('\n  CHECK-IN INTEGRITY CHECK (DB-authoritative, session-scoped)');
  console.log('  ' + '-'.repeat(58));

  const sessionIds = cleanupState.sessionIds;
  if (sessionIds.length === 0) {
    console.log('  [SKIP] No sessions to check');
    return { pass: true, extraQueueRows: 0, duplicatePositions: 0, sessionsNotCompleted: 0, sessionsWithoutQueueId: 0 };
  }

  const { data: sessions } = await supabaseAdmin
    .from('checkin_sessions')
    .select('id, status, queue_id, provider_id, member_id')
    .in('id', sessionIds);

  const allSessions = sessions || [];
  const completedSessions = allSessions.filter(s => s.status === 'completed');
  const notCompletedSessions = allSessions.filter(s => s.status !== 'completed');
  const sessionsNotCompleted = notCompletedSessions.length;

  console.log(`  Total seeded sessions: ${sessionIds.length}`);
  console.log(`  Sessions in completed state: ${completedSessions.length}`);
  console.log(`  Sessions NOT completed (should be 0): ${sessionsNotCompleted}`);

  const linkedQueueIds = completedSessions.map(s => s.queue_id).filter(Boolean);
  const sessionsWithoutQueueId = completedSessions.filter(s => !s.queue_id).length;

  console.log(`  Completed sessions with queue_id linked: ${linkedQueueIds.length}`);
  console.log(`  Completed sessions missing queue_id: ${sessionsWithoutQueueId}`);

  const responseTrackedCount = cleanupState.createdQueueIds.size;
  const allKnownQueueIds = new Set(cleanupState.createdQueueIds);

  for (const qid of linkedQueueIds) {
    allKnownQueueIds.add(qid);
  }

  const totalKnownQueueIds = allKnownQueueIds.size;
  const expectedQueueRows = completedSessions.length;
  const extraQueueRows = Math.max(0, totalKnownQueueIds - expectedQueueRows);

  console.log(`  Queue IDs from 200 responses: ${responseTrackedCount}`);
  console.log(`  Queue IDs from session.queue_id: ${linkedQueueIds.length}`);
  console.log(`  Total unique queue IDs (union): ${totalKnownQueueIds}`);
  console.log(`  Expected (1 per completed session): ${expectedQueueRows}`);
  console.log(`  Extra queue rows (race duplicates): ${extraQueueRows}`);

  let duplicatePositions = 0;
  if (totalKnownQueueIds > 0) {
    const allIds = [...allKnownQueueIds];
    const { data: queueRows } = await supabaseAdmin
      .from('checkin_queue')
      .select('id, provider_id, queue_position')
      .in('id', allIds);

    const positionsByProvider = {};
    for (const q of (queueRows || [])) {
      if (!positionsByProvider[q.provider_id]) positionsByProvider[q.provider_id] = [];
      positionsByProvider[q.provider_id].push(q.queue_position);
    }

    for (const [, positions] of Object.entries(positionsByProvider)) {
      const seen = new Set();
      for (const pos of positions) {
        if (seen.has(pos)) duplicatePositions++;
        seen.add(pos);
      }
    }

    console.log(`  Duplicate queue positions (same provider): ${duplicatePositions}`);
  }

  const pass = sessionsNotCompleted === 0 && extraQueueRows === 0 && duplicatePositions === 0 && sessionsWithoutQueueId === 0;

  if (pass) {
    console.log('  [PASS] Each session completed exactly once, no duplicate queue entries');
  } else {
    console.log('  [FAIL] RACE CONDITION DETECTED');
    if (sessionsNotCompleted > 0) {
      console.log(`         ${sessionsNotCompleted} session(s) never reached completed state`);
    }
    if (extraQueueRows > 0) {
      console.log(`         ${extraQueueRows} extra queue row(s) from concurrent complete calls`);
    }
    if (duplicatePositions > 0) {
      console.log(`         ${duplicatePositions} duplicate queue position(s) within same provider`);
    }
    if (sessionsWithoutQueueId > 0) {
      console.log(`         ${sessionsWithoutQueueId} completed session(s) have no queue_id linked`);
    }
  }

  return { pass, extraQueueRows, duplicatePositions, sessionsNotCompleted, sessionsWithoutQueueId };
}

function printResults(durationSec, integrityResult) {
  console.log('\n====================================================');
  console.log('  My Car Concierge — QR Check-In Race Stress Test Results');
  console.log('====================================================\n');

  for (const [key, metric] of Object.entries(metrics)) {
    const lats = getLatencies(metric);
    const p50 = percentile(lats, 50);
    const p95 = percentile(lats, 95);
    const p99 = percentile(lats, 99);
    console.log(`  ${metric.name}`);
    console.log(`    Requests: ${metric.requests}  Errors: ${metric.errors}  429s: ${metric.rateLimited}  Timeouts: ${metric.timeouts}`);
    console.log(`    Latency — p50: ${p50}ms  p95: ${p95}ms  p99: ${p99}ms`);
    console.log(`    Status codes: ${JSON.stringify(metric.statusCodes)}`);
    console.log('');
  }

  console.log(`  Duration: ${durationSec.toFixed(1)}s`);
  console.log(`  Worker unhandled errors: ${workerUnhandledErrors}`);
  console.log('');

  const allLatencies = Object.values(metrics).flatMap(m => getLatencies(m));
  const p95 = percentile(allLatencies, 95);
  const totalReqs = Object.values(metrics).reduce((s, m) => s + m.requests, 0);
  const realErrors = Object.values(metrics).reduce((s, m) => s + m.errors + m.timeouts, 0);
  const errorRate = totalReqs > 0 ? (realErrors / totalReqs) * 100 : 0;

  console.log('  PASS / FAIL CRITERIA');
  console.log('  ' + '-'.repeat(58));

  const integrityValue = `extra_rows:${integrityResult.extraQueueRows} dup_pos:${integrityResult.duplicatePositions} not_completed:${integrityResult.sessionsNotCompleted} no_queue_id:${integrityResult.sessionsWithoutQueueId}`;

  const criteria = [
    { name: 'p95 < 1000ms',                                value: `${p95}ms`,                  pass: p95 < 1000 },
    { name: 'Error rate < 1% (excl 400/409)',               value: `${errorRate.toFixed(2)}%`,  pass: errorRate < 1 },
    { name: 'Exactly-once completion, no dup queue entries', value: integrityValue,              pass: integrityResult.pass },
  ];

  for (const c of criteria) {
    const tag = c.pass ? 'PASS' : 'FAIL';
    console.log(`  [${tag}] ${c.name.padEnd(44)} ${c.value}`);
  }

  console.log('\n====================================================\n');
}

async function cleanupAllData(cleanupState) {
  console.log('\n[Teardown] Cleaning up test data...');

  const allQueueIdsToDelete = new Set(cleanupState.createdQueueIds);

  if (cleanupState.sessionIds.length > 0) {
    const { data: sessionsWithQueues } = await supabaseAdmin
      .from('checkin_sessions')
      .select('queue_id')
      .in('id', cleanupState.sessionIds)
      .not('queue_id', 'is', null);

    for (const s of (sessionsWithQueues || [])) {
      if (s.queue_id) allQueueIdsToDelete.add(s.queue_id);
    }
  }

  if (allQueueIdsToDelete.size > 0) {
    const queueIds = [...allQueueIdsToDelete];
    for (let i = 0; i < queueIds.length; i += 100) {
      const batch = queueIds.slice(i, i + 100);
      await supabaseAdmin.from('checkin_queue').delete().in('id', batch);
    }
    console.log(`  Deleted ${queueIds.length} queue entries (tracked by ID)`);
  }

  if (cleanupState.sessionIds.length > 0) {
    await supabaseAdmin
      .from('checkin_sessions')
      .update({ queue_id: null })
      .in('id', cleanupState.sessionIds);

    for (let i = 0; i < cleanupState.sessionIds.length; i += 100) {
      const batch = cleanupState.sessionIds.slice(i, i + 100);
      await supabaseAdmin.from('checkin_sessions').delete().in('id', batch);
    }
    console.log(`  Deleted ${cleanupState.sessionIds.length} check-in sessions`);
  }

  console.log('  Cleanup complete');
}

async function main() {
  const cleanupState = {
    sessionIds: [],
    createdQueueIds: new Set(),
  };

  let exitCode = 1;

  try {
    console.log('\n====================================================');
    console.log('  My Car Concierge — QR Check-In Concurrency Stress Test');
    console.log('====================================================');
    console.log(`  Sessions: ${CONFIG.sessionCount} | Concurrent completes/session: ${CONFIG.burstConcurrency}`);
    console.log(`  Base URL: ${BASE_URL}`);
    console.log('====================================================\n');

    console.log('[Setup] Loading simulation data...');
    const { providerSessions, memberSessions, vehicleMap } = await loadSimData();
    console.log('  Setup complete.\n');

    console.log(`[Seed] Creating ${CONFIG.sessionCount} check-in sessions via API...`);
    const targets = [];
    for (let i = 0; i < CONFIG.sessionCount; i++) {
      const provider = pick(providerSessions);
      const member = pick(memberSessions);
      const memberVehicles = vehicleMap[member.userId] || [];
      const vehicleId = memberVehicles.length > 0 ? pick(memberVehicles) : null;

      if (!vehicleId) {
        console.log(`  [WARN] No vehicle for member ${member.userId}, skipping`);
        continue;
      }

      const sessionId = await seedCheckinSession(provider, member, vehicleId, cleanupState);
      if (sessionId) {
        targets.push({ sessionId, provider, member });
      }
      await new Promise(r => setTimeout(r, 50));
    }

    if (targets.length === 0) {
      throw new Error('No check-in sessions could be seeded. Ensure sim users exist with vehicles.');
    }

    console.log(`  Seeded ${targets.length} sessions ready for race test.\n`);

    const testStart = Date.now();

    console.log(`[Race Test] Firing ${CONFIG.burstConcurrency} concurrent complete calls per session...`);
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const tracker = await fireCompleteBurst(t.sessionId, t.provider, CONFIG.burstConcurrency, cleanupState);
      const successes = tracker.responses.filter(r => r.status === 200).length;
      const rejects = tracker.responses.filter(r => r.status === 400 || r.status === 409).length;
      const errors = tracker.responses.filter(r => r.status >= 500 || r.status === 0).length;
      process.stdout.write(`  Session ${i + 1}/${targets.length}: ${successes} success, ${rejects} expected-reject, ${errors} error\r`);
      await new Promise(r => setTimeout(r, 10));
    }
    console.log(`  Completed all ${targets.length} session bursts                                    \n`);

    const testDurationSec = (Date.now() - testStart) / 1000;

    await new Promise(r => setTimeout(r, 1000));

    const integrityResult = await checkDuplicateQueueIntegrity(cleanupState);
    printResults(testDurationSec, integrityResult);

    const allLatencies = Object.values(metrics).flatMap(m => getLatencies(m));
    const p95 = percentile(allLatencies, 95);
    const totalReqs = Object.values(metrics).reduce((s, m) => s + m.requests, 0);
    const realErrors = Object.values(metrics).reduce((s, m) => s + m.errors + m.timeouts, 0);
    const errorRate = totalReqs > 0 ? (realErrors / totalReqs) * 100 : 0;

    exitCode = integrityResult.pass && p95 < 1000 && errorRate < 1 ? 0 : 1;

  } catch (err) {
    console.error(`\n[FATAL] ${err.message}`);
    console.error(err.stack);
  } finally {
    await cleanupAllData(cleanupState);
    process.exit(exitCode);
  }
}

main();

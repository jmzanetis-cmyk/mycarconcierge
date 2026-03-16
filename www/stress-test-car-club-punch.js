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
  burstConcurrency: param('burst-concurrency', 10),
  membersToTest:    param('members', 3),
  punchesPerMember: param('punches-per-member', 20),
  punchesRequired:  param('punches-required', 50),
  requestTimeout:   10000,
  interRequestDelay: 10,
  baseUrl:          strParam('base-url', process.env.STRESS_TEST_BASE_URL || 'http://localhost:5000'),
};

const BASE_URL = CONFIG.baseUrl;
const SIM_DOMAIN = '@mcc-sim.test';
const SIM_PASSWORD = 'SimPass123!';
const RESERVOIR_SIZE = 50000;
const RUN_ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function createMetric(name) {
  return { name, requests: 0, errors: 0, rateLimited: 0, timeouts: 0, latencies: new Float32Array(RESERVOIR_SIZE), latencyCount: 0, statusCodes: {} };
}

const metrics = {
  logActivity: createMetric('POST /api/car-club/log-activity'),
};

let workerUnhandledErrors = 0;

const createdIds = {
  clubId: null,
  ruleId: null,
  membershipIds: [],
  memberIds: [],
  clubCreatedByTest: false,
  ruleCreatedByTest: false,
};

function addLatency(metric, latency) {
  if (metric.latencyCount < RESERVOIR_SIZE) {
    metric.latencies[metric.latencyCount] = latency;
  } else {
    const j = Math.floor(Math.random() * (metric.latencyCount + 1));
    if (j < RESERVOIR_SIZE) metric.latencies[j] = latency;
  }
  metric.latencyCount++;
}

function recordMetric(metricKey, latency, status) {
  const metric = metrics[metricKey];
  metric.requests++;
  addLatency(metric, latency);
  metric.statusCodes[status] = (metric.statusCodes[status] || 0) + 1;
  if (status === 429) metric.rateLimited++;
  else if (status >= 400 || status === 0) metric.errors++;
}

function percentile(metric, p) {
  const count = Math.min(metric.latencyCount, RESERVOIR_SIZE);
  if (count === 0) return 0;
  const arr = Array.from(metric.latencies.subarray(0, count)).sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * arr.length) - 1;
  return Math.round(arr[Math.max(0, idx)]);
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
    try { body = await res.json(); } catch (_) {}
    return { status: res.status, latency, ok: res.ok, body };
  } catch (err) {
    clearTimeout(timeout);
    const latency = Date.now() - start;
    if (err.name === 'AbortError') return { status: 0, latency, ok: false, timeout: true, body: null };
    return { status: 0, latency, ok: false, body: null };
  }
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return { status: res.status, data: null };
    const data = await res.json();
    return { status: res.status, data };
  } catch (err) {
    clearTimeout(timeout);
    return { status: 0, data: null };
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

async function setupClubAndMemberships(providerSession, memberSessions) {
  console.log('  Setting up dedicated test club...');

  const createRes = await fetchJson(`${BASE_URL}/api/car-club/create`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${providerSession.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Punch Race Test ${RUN_ID}`, description: 'Created for punch card concurrency test — auto-deleted on completion' }),
  });

  let clubId = null;

  if (createRes.data?.club) {
    clubId = createRes.data.club.id;
    createdIds.clubCreatedByTest = true;
  } else if (createRes.status === 409) {
    const myClubRes = await fetchJson(`${BASE_URL}/api/car-club/my-club`, {
      headers: { 'Authorization': `Bearer ${providerSession.token}` },
    });
    if (myClubRes.data?.club) {
      clubId = myClubRes.data.club.id;
      console.log('  Provider already has a club — reusing it (will only delete test-created resources)');
    }
  }

  if (!clubId) {
    console.error('  Could not create or find car club. Aborting.');
    return null;
  }
  createdIds.clubId = clubId;

  const tplRes = await fetchJson(`${BASE_URL}/api/car-club/reward-templates`, {
    headers: { 'Authorization': `Bearer ${providerSession.token}` },
  });
  const punchTpl = (tplRes.data?.templates || []).find(t => t.slug === 'punch_card');
  if (!punchTpl) {
    console.error('  No punch_card reward template found. Aborting.');
    return null;
  }

  const myClubCheck = await fetchJson(`${BASE_URL}/api/car-club/my-club`, {
    headers: { 'Authorization': `Bearer ${providerSession.token}` },
  });
  const existingRules = myClubCheck.data?.club?.reward_rules || [];
  const activeRules = existingRules.filter(r => r.is_active);
  if (activeRules.length >= 3) {
    const staleTestRules = activeRules.filter(r => r.name && r.name.startsWith('Punch Race'));
    const toDeactivate = staleTestRules.length > 0 ? staleTestRules : [activeRules[activeRules.length - 1]];
    for (const stale of toDeactivate) {
      await fetch(`${BASE_URL}/api/car-club/rewards/${stale.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${providerSession.token}` },
      });
      console.log(`  Deactivated rule ${stale.id} (${stale.name || 'unnamed'}) to make room`);
    }
  }

  const rewardReq = {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${providerSession.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_id: punchTpl.id,
      name: `Punch Race Rule ${RUN_ID}`,
      description: `${CONFIG.punchesRequired} punches for reward — test-only`,
      parameters: { punches_required: CONFIG.punchesRequired, auto_reset: false },
    }),
  };
  const rewardRawRes = await fetch(`${BASE_URL}/api/car-club/rewards`, rewardReq);
  let rewardData = null;
  try { rewardData = await rewardRawRes.json(); } catch (_) {}

  if (!rewardData?.reward_rule) {
    console.error(`  Could not create punch_card reward rule (status=${rewardRawRes.status}): ${JSON.stringify(rewardData)}`);
    return null;
  }
  const rewardRes = { data: rewardData };

  const ruleId = rewardRes.data.reward_rule.id;
  createdIds.ruleId = ruleId;
  createdIds.ruleCreatedByTest = true;

  const actualParams = rewardRes.data.reward_rule.parameters || {};
  const actualPunchesRequired = parseInt(actualParams.punches_required) || CONFIG.punchesRequired;
  const actualAutoReset = actualParams.auto_reset !== false;

  console.log(`  Club ID: ${clubId}${createdIds.clubCreatedByTest ? ' (created)' : ' (reused)'}`);
  console.log(`  Reward Rule ID: ${ruleId} (created)`);
  console.log(`  Rule params: punches_required=${actualPunchesRequired}, auto_reset=${actualAutoReset}`);

  if (actualAutoReset) {
    console.warn('  WARNING: auto_reset is true — punch counts will reset at threshold, making integrity check unreliable.');
    console.warn(`  Set --punches-required high enough (currently ${CONFIG.punchesRequired}) so threshold is never reached during test.`);
  }

  const { data: activePromos } = await supabaseAdmin
    .from('club_promotions')
    .select('id, punch_multiplier')
    .eq('club_id', clubId)
    .eq('is_active', true);

  let punchMultiplier = 1;
  if (activePromos && activePromos.length > 0) {
    punchMultiplier = Math.max(...activePromos.map(p => parseInt(p.punch_multiplier) || 1));
    console.warn(`  WARNING: Active promotion detected with punch_multiplier=${punchMultiplier}`);
    console.warn('  Integrity check will account for this multiplier in expected punch counts.');
  }

  console.log(`  Joining ${memberSessions.length} members to club...`);
  const membershipIdsCreated = [];
  for (const ms of memberSessions) {
    const joinRes = await fetchJson(`${BASE_URL}/api/car-club/join`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ms.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ club_id: clubId }),
    });
    if (joinRes.data?.membership_id) {
      membershipIdsCreated.push(joinRes.data.membership_id);
    }
  }

  const assignments = [];
  for (const ms of memberSessions) {
    const myClubsRes = await fetchJson(`${BASE_URL}/api/car-club/my-clubs`, {
      headers: { 'Authorization': `Bearer ${ms.token}` },
    });
    for (const club of (myClubsRes.data?.clubs || [])) {
      if (club.club_id === clubId && club.is_active) {
        assignments.push({
          memberId: ms.userId,
          memberToken: ms.token,
          clubId,
          ruleId,
          providerToken: providerSession.token,
          membershipId: club.membership_id,
        });
        if (!membershipIdsCreated.includes(club.membership_id)) {
          membershipIdsCreated.push(club.membership_id);
        }
      }
    }
  }

  createdIds.membershipIds = membershipIdsCreated;
  createdIds.memberIds = assignments.map(a => a.memberId);

  console.log(`  ${assignments.length} active member-club assignments confirmed`);
  if (assignments.length === 0) {
    console.error('  No member-club assignments found. Aborting.');
    return null;
  }

  return { clubId, ruleId, assignments, punchMultiplier };
}

async function getPunchCounts(assignments) {
  const totals = {};
  const memberTokens = {};
  for (const a of assignments) memberTokens[a.memberId] = a.memberToken;

  for (const memberId of Object.keys(memberTokens)) {
    const token = memberTokens[memberId];
    const res = await fetchJson(`${BASE_URL}/api/car-club/my-clubs`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    for (const club of (res.data?.clubs || [])) {
      const matching = assignments.find(a => a.membershipId === club.membership_id);
      if (!matching) continue;
      let punches = 0;
      for (const bal of (club.balances || [])) {
        if (bal.reward_rule_id === matching.ruleId) punches += (bal.punch_count || 0);
      }
      totals[memberId] = (totals[memberId] || 0) + punches;
    }
  }
  return totals;
}

async function fireLogActivityBurst(assignment, count) {
  const promises = [];
  const successTracker = [];

  for (let i = 0; i < count; i++) {
    const p = timedFetch(`${BASE_URL}/api/car-club/log-activity`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${assignment.providerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        member_id: assignment.memberId,
        reward_rule_id: assignment.ruleId,
        activity_type: 'service_completed',
        quantity: 1,
        description: `Punch concurrency test ${RUN_ID}`,
      }),
    });
    promises.push(p);
    if (CONFIG.interRequestDelay > 0 && i < count - 1) {
      await new Promise(r => setTimeout(r, CONFIG.interRequestDelay));
    }
  }

  const results = await Promise.all(promises);

  for (const result of results) {
    if (result.timeout) {
      recordMetric('logActivity', result.latency, 0);
      metrics.logActivity.timeouts++;
    } else {
      recordMetric('logActivity', result.latency, result.status);
    }
    if (result.ok) successTracker.push(true);
  }

  return successTracker.length;
}

async function runBurstRounds(assignments) {
  const successesByMember = {};

  for (const a of assignments) {
    successesByMember[a.memberId] = 0;
    console.log(`\n  Member ${a.memberId.slice(0, 8)}...`);

    const totalPunches = CONFIG.punchesPerMember;
    const burstSize = CONFIG.burstConcurrency;
    let sent = 0;

    while (sent < totalPunches) {
      const batchSize = Math.min(burstSize, totalPunches - sent);
      const successes = await fireLogActivityBurst(a, batchSize);
      successesByMember[a.memberId] += successes;
      sent += batchSize;
      process.stdout.write(`    Sent ${sent}/${totalPunches} (${successesByMember[a.memberId]} successful so far)\r`);
    }
    console.log(`    Sent ${sent}/${totalPunches} — ${successesByMember[a.memberId]} confirmed successful                `);
  }

  return successesByMember;
}

function printResults(testDurationSec) {
  console.log('\n====================================================');
  console.log('  CAR CLUB PUNCH CARD CONCURRENCY TEST RESULTS');
  console.log('====================================================\n');

  const m = metrics.logActivity;
  const p50 = percentile(m, 50);
  const p95 = percentile(m, 95);
  const p99 = percentile(m, 99);
  const rps = testDurationSec > 0 ? (m.requests / testDurationSec).toFixed(1) : 0;
  const realErrors = m.errors + m.timeouts;
  const errorRate = m.requests > 0 ? ((realErrors / m.requests) * 100) : 0;

  console.log('  ENDPOINT METRICS');
  console.log('  ' + '-'.repeat(60));
  console.log(`  Total requests:    ${m.requests}`);
  console.log(`  Test duration:     ${testDurationSec.toFixed(1)}s`);
  console.log(`  Avg RPS:           ${rps} req/s`);
  console.log(`  Real errors:       ${m.errors} (excl timeouts)`);
  console.log(`  Rate limited:      ${m.rateLimited}`);
  console.log(`  Timeouts:          ${m.timeouts}`);
  console.log(`  Failure rate:      ${errorRate.toFixed(2)}% (errors + timeouts, excl 429)`);
  console.log(`  p50:               ${p50}ms`);
  console.log(`  p95:               ${p95}ms`);
  console.log(`  p99:               ${p99}ms`);
  const codes = Object.entries(m.statusCodes).map(([k, v]) => `${k}:${v}`).join(' ');
  console.log(`  Status codes:      ${codes}`);
  if (workerUnhandledErrors > 0) {
    console.log(`  Unhandled errors:  ${workerUnhandledErrors}`);
  }

  return { p95, errorRate };
}

async function checkPunchIntegrity(assignments, successesByMember, punchesBefore, punchMultiplier) {
  const punchesAfter = await getPunchCounts(assignments);

  console.log('\n  PUNCH COUNT INTEGRITY — BALANCE CHECK (per member)');
  if (punchMultiplier > 1) {
    console.log(`  (punch_multiplier=${punchMultiplier} — expected = successes * multiplier)`);
  }
  console.log('  ' + '-'.repeat(70));
  console.log(`  ${'Member'.padEnd(12)} ${'Before'.padStart(8)} ${'After'.padStart(8)} ${'Awarded'.padStart(9)} ${'Expected'.padStart(10)} ${'Delta'.padStart(7)} ${'Result'.padStart(8)}`);
  console.log('  ' + '-'.repeat(70));

  let totalAwarded = 0;
  let totalExpected = 0;
  let anyOvercount = false;
  let anyUndercount = false;

  for (const a of assignments) {
    const before = punchesBefore[a.memberId] || 0;
    const after = punchesAfter[a.memberId] || 0;
    const awarded = after - before;
    const expected = (successesByMember[a.memberId] || 0) * punchMultiplier;
    const delta = awarded - expected;

    totalAwarded += awarded;
    totalExpected += expected;

    let result = 'OK';
    if (delta > 0) { result = 'OVER'; anyOvercount = true; }
    else if (delta < 0) { result = 'UNDER'; anyUndercount = true; }

    console.log(`  ${a.memberId.slice(0, 10).padEnd(12)} ${String(before).padStart(8)} ${String(after).padStart(8)} ${String(awarded).padStart(9)} ${String(expected).padStart(10)} ${(delta >= 0 ? '+' : '') + String(delta).padStart(6)} ${result.padStart(8)}`);
  }

  console.log('  ' + '-'.repeat(70));
  const totalDelta = totalAwarded - totalExpected;
  console.log(`  ${'TOTAL'.padEnd(12)} ${''.padStart(8)} ${''.padStart(8)} ${String(totalAwarded).padStart(9)} ${String(totalExpected).padStart(10)} ${(totalDelta >= 0 ? '+' : '') + String(totalDelta).padStart(6)} ${(totalDelta === 0 ? 'EXACT' : totalDelta > 0 ? 'OVER' : 'UNDER').padStart(8)}`);

  console.log('\n  PUNCH COUNT INTEGRITY — ACTIVITY LOG ROW AUDIT');
  console.log('  ' + '-'.repeat(70));

  let totalLogRows = 0;
  let totalSuccessful = 0;
  let logRowMismatch = false;

  for (const a of assignments) {
    const { count, error } = await supabaseAdmin
      .from('club_activity_log')
      .select('id', { count: 'exact', head: true })
      .eq('membership_id', a.membershipId)
      .eq('reward_rule_id', a.ruleId);

    const dbRows = error ? null : (count || 0);
    const expectedRows = successesByMember[a.memberId] || 0;

    if (dbRows === null) {
      logRowMismatch = null;
      console.log(`  ${a.memberId.slice(0, 10).padEnd(12)}  DB rows: (RLS blocked)  Expected: ${String(expectedRows).padStart(5)}  — skipped (no access)`);
      totalSuccessful += expectedRows;
      continue;
    }

    const rowDelta = dbRows - expectedRows;
    totalLogRows += dbRows;
    totalSuccessful += expectedRows;

    const rowResult = rowDelta === 0 ? 'OK' : (rowDelta > 0 ? 'EXTRA' : 'MISSING');
    if (logRowMismatch !== null && rowDelta !== 0) logRowMismatch = true;

    console.log(`  ${a.memberId.slice(0, 10).padEnd(12)}  DB rows: ${String(dbRows).padStart(5)}  Expected: ${String(expectedRows).padStart(5)}  Delta: ${(rowDelta >= 0 ? '+' : '') + String(rowDelta).padStart(4)}  ${rowResult}`);
  }

  if (logRowMismatch === null) {
    console.log(`  ${'TOTAL'.padEnd(12)}  (activity log audit skipped — RLS blocks service_role access)`);
  } else {
    const logRowDelta = totalLogRows - totalSuccessful;
    console.log(`  ${'TOTAL'.padEnd(12)}  DB rows: ${String(totalLogRows).padStart(5)}  Expected: ${String(totalSuccessful).padStart(5)}  Delta: ${(logRowDelta >= 0 ? '+' : '') + String(logRowDelta).padStart(4)}  ${logRowDelta === 0 ? 'EXACT' : logRowMismatch ? 'MISMATCH' : 'OK'}`);
  }

  return { totalAwarded, totalExpected, anyOvercount, anyUndercount, totalDelta, logRowMismatch, totalLogRows, totalSuccessful };
}

async function cleanupTestData() {
  console.log('\n[Cleanup] Removing test-created data only...');

  if (createdIds.membershipIds.length > 0) {
    await supabaseAdmin.from('club_reward_redemptions').delete().in('membership_id', createdIds.membershipIds);
    await supabaseAdmin.from('club_activity_log').delete().in('membership_id', createdIds.membershipIds);
    await supabaseAdmin.from('member_club_balances').delete().in('membership_id', createdIds.membershipIds);
    await supabaseAdmin.from('club_memberships').delete().in('id', createdIds.membershipIds);
    console.log(`  Deleted redemptions, activity logs, balances, and ${createdIds.membershipIds.length} memberships`);
  }

  if (createdIds.ruleCreatedByTest && createdIds.ruleId) {
    await supabaseAdmin.from('club_reward_rules').delete().eq('id', createdIds.ruleId);
    console.log(`  Deleted reward rule ${createdIds.ruleId}`);
  }

  if (createdIds.clubCreatedByTest && createdIds.clubId) {
    await supabaseAdmin.from('car_clubs').delete().eq('id', createdIds.clubId);
    console.log(`  Deleted car club ${createdIds.clubId}`);
  } else if (createdIds.clubId) {
    console.log(`  Kept car club ${createdIds.clubId} (pre-existing, not created by this test)`);
  }

  if (createdIds.memberIds.length > 0) {
    await supabaseAdmin.from('notification_queue').delete().in('user_id', createdIds.memberIds);
    console.log('  Cleaned up notification queue entries');
  }

  console.log('  Cleanup complete.\n');
}

async function main() {
  console.log('\n====================================================');
  console.log('  My Car Concierge — Car Club Punch Card Concurrency Test');
  console.log('====================================================');
  console.log(`  Run ID:              ${RUN_ID}`);
  console.log(`  Target:              ${CONFIG.baseUrl}`);
  console.log(`  Burst concurrency:   ${CONFIG.burstConcurrency}`);
  console.log(`  Members to test:     ${CONFIG.membersToTest}`);
  console.log(`  Punches per member:  ${CONFIG.punchesPerMember}`);
  console.log(`  Punches required:    ${CONFIG.punchesRequired} (auto_reset=false to prevent threshold resets)`);
  console.log(`  Request timeout:     ${CONFIG.requestTimeout}ms`);
  console.log(`  Inter-request delay: ${CONFIG.interRequestDelay}ms`);
  console.log(`\n  Race condition under test:`);
  console.log(`    POST /api/car-club/log-activity does a read-modify-write on`);
  console.log(`    member_club_balances.punch_count without DB-level locking.`);
  console.log(`    Concurrent calls for the SAME member can read the same stale`);
  console.log(`    punch_count and both write count+1 instead of count+2.`);
  console.log('====================================================\n');

  let exitCode = 1;

  try {
    console.log('[Phase 1/5] Loading simulation accounts...');
    const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const simUsers = (allUsers?.users || []).filter(u => u.email && u.email.endsWith(SIM_DOMAIN));

    const memberEmails = simUsers
      .filter(u => u.email.startsWith('sim-member-'))
      .map(u => u.email)
      .slice(0, CONFIG.membersToTest);

    const providerEmails = simUsers
      .filter(u => u.email.startsWith('sim-provider-'))
      .map(u => u.email)
      .slice(0, 1);

    if (memberEmails.length === 0 || providerEmails.length === 0) {
      console.error('  No simulation accounts found. Run simulate-platform.js first.');
      return;
    }

    console.log(`  Found ${memberEmails.length} members, ${providerEmails.length} providers`);
    console.log('  Authenticating...');

    const memberSessions = [];
    for (const email of memberEmails) {
      const session = await getSession(email);
      if (session) memberSessions.push(session);
    }

    const providerSession = await getSession(providerEmails[0]);
    if (!providerSession) {
      console.error('  Could not authenticate provider. Aborting.');
      return;
    }

    console.log(`  Authenticated: ${memberSessions.length} members, 1 provider\n`);

    console.log('[Phase 2/5] Setting up car club, reward rule, and memberships...');
    const setupResult = await setupClubAndMemberships(providerSession, memberSessions);
    if (!setupResult) return;

    const { clubId, ruleId, assignments, punchMultiplier } = setupResult;
    console.log('  Setup complete.\n');

    console.log('[Phase 3/5] Recording baseline punch counts...');
    const punchesBefore = await getPunchCounts(assignments);
    for (const a of assignments) {
      console.log(`  Member ${a.memberId.slice(0, 8)}...: ${punchesBefore[a.memberId] || 0} punches`);
    }
    console.log('');

    console.log('[Phase 4/5] Firing concurrent punch bursts...');
    const testStart = Date.now();
    const successesByMember = await runBurstRounds(assignments);
    const testDurationSec = (Date.now() - testStart) / 1000;

    const { p95, errorRate } = printResults(testDurationSec);
    const integrityResult = await checkPunchIntegrity(assignments, successesByMember, punchesBefore, punchMultiplier);

    console.log('\n  PASS/FAIL CRITERIA');
    console.log('  ' + '-'.repeat(60));

    const criteria = [
      { name: 'p95 < 2000ms',                    value: `${p95}ms`,                                                                  pass: p95 < 2000 },
      { name: 'Error rate < 1% (incl timeouts)',  value: `${errorRate.toFixed(2)}%`,                                                  pass: errorRate < 1 },
      { name: 'No punch over-count (per member)', value: `${integrityResult.totalAwarded} awarded / ${integrityResult.totalExpected} expected (delta: ${integrityResult.totalDelta >= 0 ? '+' : ''}${integrityResult.totalDelta})`, pass: !integrityResult.anyOvercount },
      { name: 'Exact punch count match',          value: `${integrityResult.totalDelta === 0 ? 'exact' : `off by ${integrityResult.totalDelta}`}`,                                                                                  pass: integrityResult.totalDelta === 0 },
      { name: 'Activity log rows match calls',    value: integrityResult.logRowMismatch === null ? 'skipped (RLS)' : `${integrityResult.totalLogRows} rows / ${integrityResult.totalSuccessful} calls`,                                    pass: integrityResult.logRowMismatch === null || !integrityResult.logRowMismatch },
    ];

    for (const c of criteria) {
      console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name.padEnd(36)} ${c.value}`);
    }

    if (integrityResult.anyUndercount) {
      console.log(`\n  NOTE: Under-count detected — ${Math.abs(integrityResult.totalDelta)} punch(es) lost to read-modify-write race.`);
      console.log('  The server reads punch_count, adds 1 in JS, and writes back without');
      console.log('  a DB lock. Concurrent calls for the same member read the same stale');
      console.log('  value, causing lost increments.');
    }

    if (integrityResult.anyOvercount) {
      console.log(`\n  WARNING: Over-count detected — members received more punches than`);
      console.log('  successful API calls. This indicates a double-increment bug.');
    }

    console.log('\n====================================================\n');

    exitCode = criteria.every(c => c.pass) ? 0 : 1;

  } finally {
    console.log('[Phase 5/5] Cleanup...');
    try {
      await cleanupTestData();
    } catch (cleanupErr) {
      console.error('  Cleanup error:', cleanupErr.message);
    }
    process.exit(exitCode);
  }
}

main().catch(err => {
  console.error('\nPunch card concurrency test failed:', err);
  cleanupTestData().catch(() => {}).finally(() => process.exit(1));
});

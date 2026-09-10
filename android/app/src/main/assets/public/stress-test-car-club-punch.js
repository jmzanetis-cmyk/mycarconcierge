// Car Club — punch (POST /api/car-club/punch) concurrency/integrity test.
//
// 2026-09-09 REWRITE: the previous version of this script targeted an older
// API shape that no longer exists — POST /api/car-club/log-activity against
// a punch_count column on member_club_balances, driven by a
// club_reward_rules "reward_rule_id" created via a reward-templates catalog.
// None of that survived the Slice 1/2 points-ledger rebuild (migrations
// 20260703a-h): there is no member_club_balances table, no
// club_promotions table, no reward-templates endpoint, and
// POST /api/car-clubs/:id/punch (nested) is now a deliberate 403 stub that
// tells callers to use the real route below (car-clubs.js:426-428).
//
// Current architecture (car-clubs.js punchMember(), ~line 473):
//   POST /api/car-club/punch   body: { club_id, qr_token }
//   - PROVIDER-authenticated (not member!) — the security boundary is
//     car_clubs.provider_id === auth.uid(); a member can never punch
//     themselves. auth 403 if the caller doesn't own the club.
//   - qr_token resolves via profiles.qr_code_token first, falling back to
//     profiles.id when the token itself looks like a UUID — so a member's
//     own auth uid works directly as qr_token without needing their real
//     QR code. That's what this test uses (avoids the qr_code_token
//     schema-drift risk documented at car-clubs.js:469-471).
//   - Every call is a rule-agnostic INSERT into club_points_ledger
//     (delta_points: 1, reason: 'earn_spend'). There is no reward_rule_id
//     column on that table and no punches_required threshold enforced
//     server-side any more — thresholds are evaluated client-side against
//     club_rewards.point_cost at render/redeem time, not at earn time.
//
// What changed about the race condition under test:
//   The old bug class was a read-modify-write lost-update race on a shared
//   punch_count integer (read count, add 1 in JS, write back — two
//   concurrent calls for the same member could read the same stale value).
//   The ledger-INSERT model structurally can't lose an update that way:
//   every successful call appends its own row, and the balance is a SUM.
//   So this test no longer expects to *find* that specific race — but it
//   still verifies real invariants that a regression could break: every
//   successful call must produce exactly one ledger row worth exactly 1
//   point (no dropped writes under burst load, no double-inserts), and the
//   provider-only auth boundary must hold under concurrent calls too.
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
  burstConcurrency: param('burst-concurrency', 10),
  membersToTest:    param('members', 3),
  punchesPerMember: param('punches-per-member', 20),
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
  punch: createMetric('POST /api/car-club/punch'),
};

let workerUnhandledErrors = 0;

// Always created fresh by this run (createClub() has no dedupe/409 any more
// — every provider POST /api/car-club/create makes a new club), so cleanup
// is unconditional: delete everything this run created, no "was it
// pre-existing" branch needed.
const createdIds = {
  clubId: null,
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
    let data = null;
    try { data = await res.json(); } catch (_) {}
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
  console.log('  Creating dedicated test club...');

  const createRes = await fetchJson(`${BASE_URL}/api/car-club/create`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${providerSession.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Punch Race Test ${RUN_ID}`, description: 'Created for punch concurrency test — auto-deleted on completion' }),
  });

  if (createRes.status === 403) {
    console.error('  Could not create car club — 403 Not available.');
    console.error('  The car_club_programs_enabled feature flag is almost certainly off for');
    console.error('  this provider test account. Enable it (globally or for test users) and re-run.');
    return null;
  }
  if (!createRes.data?.club) {
    console.error(`  Could not create car club (status=${createRes.status}): ${JSON.stringify(createRes.data)}`);
    return null;
  }

  const clubId = createRes.data.club.id;
  createdIds.clubId = clubId;
  console.log(`  Club ID: ${clubId} (created)`);

  console.log(`  Joining ${memberSessions.length} members to club...`);
  for (const ms of memberSessions) {
    const joinRes = await fetchJson(`${BASE_URL}/api/car-club/join`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ms.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ club_id: clubId }),
    });
    // join returns { success: true } with no membership_id — membership
    // itself isn't needed downstream; the ledger is keyed on
    // (club_id, member_id) directly, not on a membership row id.
    if (joinRes.status !== 200) {
      console.warn(`  WARNING: join failed for member ${ms.userId.slice(0, 8)}... (status=${joinRes.status})`);
    }
  }

  const assignments = memberSessions.map(ms => ({
    memberId: ms.userId,
    memberToken: ms.token,
    clubId,
    providerToken: providerSession.token,
  }));

  console.log(`  ${assignments.length} members set up`);
  return { clubId, assignments };
}

// Direct service-role read of club_points_ledger — the source of truth for
// both "how many points does this member have" (SUM delta_points) and "how
// many ledger rows did they get" (COUNT), in one query. Scoped to a single
// club_id that this run created and will delete, so every row returned
// unambiguously belongs to this test run — no member_id/reason filtering
// needed for isolation.
async function getLedgerStats(clubId) {
  const { data, error } = await supabaseAdmin
    .from('club_points_ledger')
    .select('member_id, delta_points')
    .eq('club_id', clubId);
  if (error) {
    console.error('  Failed to read club_points_ledger:', error.message);
    return null;
  }
  const balances = {};
  const rowCounts = {};
  for (const row of (data || [])) {
    balances[row.member_id] = (balances[row.member_id] || 0) + row.delta_points;
    rowCounts[row.member_id] = (rowCounts[row.member_id] || 0) + 1;
  }
  return { balances, rowCounts };
}

// Bonus regression check (cheap, one call): confirm the documented
// provider-only security boundary (car-clubs.js:489) still holds — a
// member calling their own punch endpoint must be rejected, not silently
// award themselves points.
async function checkMemberCannotPunchSelf(assignment) {
  const res = await fetchJson(`${BASE_URL}/api/car-club/punch`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${assignment.memberToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ club_id: assignment.clubId, qr_token: assignment.memberId }),
  });
  return res.status === 403;
}

async function firePunchBurst(assignment, count) {
  const promises = [];
  const successTracker = [];

  for (let i = 0; i < count; i++) {
    const p = timedFetch(`${BASE_URL}/api/car-club/punch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${assignment.providerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        club_id: assignment.clubId,
        // Member's own auth uid — a valid qr_token per the profiles.id
        // fallback in punchMember() (car-clubs.js:501-505).
        qr_token: assignment.memberId,
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
      recordMetric('punch', result.latency, 0);
      metrics.punch.timeouts++;
    } else {
      recordMetric('punch', result.latency, result.status);
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
      const successes = await firePunchBurst(a, batchSize);
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
  console.log('  CAR CLUB PUNCH CONCURRENCY TEST RESULTS');
  console.log('====================================================\n');

  const m = metrics.punch;
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

function checkPunchIntegrity(assignments, successesByMember, before, after) {
  console.log('\n  POINTS LEDGER INTEGRITY (club_points_ledger — direct read, service role)');
  console.log('  ' + '-'.repeat(78));
  console.log(`  ${'Member'.padEnd(12)} ${'Before'.padStart(8)} ${'After'.padStart(8)} ${'Awarded'.padStart(9)} ${'Rows+'.padStart(7)} ${'Expected'.padStart(10)} ${'Delta'.padStart(7)} ${'Result'.padStart(8)}`);
  console.log('  ' + '-'.repeat(78));

  let totalAwarded = 0;
  let totalNewRows = 0;
  let totalExpected = 0;
  let anyOvercount = false;
  let anyUndercount = false;
  let anyRowMismatch = false;

  for (const a of assignments) {
    const beforeBal = before.balances[a.memberId] || 0;
    const afterBal = after.balances[a.memberId] || 0;
    const beforeRows = before.rowCounts[a.memberId] || 0;
    const afterRows = after.rowCounts[a.memberId] || 0;
    const awarded = afterBal - beforeBal;
    const newRows = afterRows - beforeRows;
    const expected = successesByMember[a.memberId] || 0;
    const delta = awarded - expected;

    totalAwarded += awarded;
    totalNewRows += newRows;
    totalExpected += expected;

    let result = 'OK';
    if (delta > 0) { result = 'OVER'; anyOvercount = true; }
    else if (delta < 0) { result = 'UNDER'; anyUndercount = true; }
    if (newRows !== awarded) anyRowMismatch = true; // would mean a row with delta_points != 1 snuck in

    console.log(`  ${a.memberId.slice(0, 10).padEnd(12)} ${String(beforeBal).padStart(8)} ${String(afterBal).padStart(8)} ${String(awarded).padStart(9)} ${('+' + newRows).padStart(7)} ${String(expected).padStart(10)} ${(delta >= 0 ? '+' : '') + String(delta).padStart(6)} ${result.padStart(8)}`);
  }

  console.log('  ' + '-'.repeat(78));
  const totalDelta = totalAwarded - totalExpected;
  console.log(`  ${'TOTAL'.padEnd(12)} ${''.padStart(8)} ${''.padStart(8)} ${String(totalAwarded).padStart(9)} ${('+' + totalNewRows).padStart(7)} ${String(totalExpected).padStart(10)} ${(totalDelta >= 0 ? '+' : '') + String(totalDelta).padStart(6)} ${(totalDelta === 0 ? 'EXACT' : totalDelta > 0 ? 'OVER' : 'UNDER').padStart(8)}`);

  if (anyUndercount) {
    console.log(`\n  NOTE: Under-count detected — ${Math.abs(totalDelta)} punch(es) awarded fewer points than`);
    console.log('  successful API calls. Under the ledger-INSERT model this would mean a');
    console.log('  successful call (2xx) did not durably commit its row — a real regression,');
    console.log('  not the old read-modify-write race (there is no shared counter to race).');
  }
  if (anyOvercount) {
    console.log(`\n  WARNING: Over-count detected — members received more points than`);
    console.log('  successful API calls. This indicates a double-insert bug.');
  }
  if (anyRowMismatch) {
    console.log(`\n  WARNING: A ledger row with delta_points != 1 was inserted for this club —`);
    console.log('  unexpected for this test (only punchMember() should write here), investigate.');
  }

  return { totalAwarded, totalExpected, totalDelta, anyOvercount, anyUndercount, anyRowMismatch };
}

async function cleanupTestData() {
  console.log('\n[Cleanup] Removing test-created data...');

  if (createdIds.clubId) {
    await supabaseAdmin.from('club_points_ledger').delete().eq('club_id', createdIds.clubId);
    await supabaseAdmin.from('club_memberships').delete().eq('club_id', createdIds.clubId);
    await supabaseAdmin.from('car_clubs').delete().eq('id', createdIds.clubId);
    console.log(`  Deleted ledger rows, memberships, and car club ${createdIds.clubId}`);
  } else {
    console.log('  Nothing to clean up (club was never created).');
  }

  console.log('  Cleanup complete.\n');
}

async function main() {
  console.log('\n====================================================');
  console.log('  My Car Concierge — Car Club Punch Concurrency Test');
  console.log('====================================================');
  console.log(`  Run ID:              ${RUN_ID}`);
  console.log(`  Target:              ${CONFIG.baseUrl}`);
  console.log(`  Burst concurrency:   ${CONFIG.burstConcurrency}`);
  console.log(`  Members to test:     ${CONFIG.membersToTest}`);
  console.log(`  Punches per member:  ${CONFIG.punchesPerMember}`);
  console.log(`  Request timeout:     ${CONFIG.requestTimeout}ms`);
  console.log(`  Inter-request delay: ${CONFIG.interRequestDelay}ms`);
  console.log(`\n  Endpoint under test:`);
  console.log(`    POST /api/car-club/punch — provider-authenticated, INSERTs one`);
  console.log(`    club_points_ledger row (delta_points=1) per call. No shared counter`);
  console.log(`    to race; this test checks for dropped/duplicated writes under burst`);
  console.log(`    concurrency instead of the old read-modify-write lost-update bug.`);
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

    console.log('[Phase 2/5] Creating car club and memberships...');
    const setupResult = await setupClubAndMemberships(providerSession, memberSessions);
    if (!setupResult) return;

    const { clubId, assignments } = setupResult;
    console.log('  Setup complete.\n');

    console.log('  Verifying provider-only auth boundary (member cannot punch self)...');
    const boundaryHeld = await checkMemberCannotPunchSelf(assignments[0]);
    console.log(`  ${boundaryHeld ? 'OK' : 'FAIL'} — member-authenticated punch call ${boundaryHeld ? 'correctly rejected (403)' : 'was NOT rejected — security regression'}\n`);

    console.log('[Phase 3/5] Recording baseline ledger state...');
    const before = await getLedgerStats(clubId);
    if (!before) return;
    for (const a of assignments) {
      console.log(`  Member ${a.memberId.slice(0, 8)}...: ${before.balances[a.memberId] || 0} points`);
    }
    console.log('');

    console.log('[Phase 4/5] Firing concurrent punch bursts...');
    const testStart = Date.now();
    const successesByMember = await runBurstRounds(assignments);
    const testDurationSec = (Date.now() - testStart) / 1000;

    const { p95, errorRate } = printResults(testDurationSec);
    const after = await getLedgerStats(clubId);
    if (!after) return;
    const integrityResult = checkPunchIntegrity(assignments, successesByMember, before, after);

    console.log('\n  PASS/FAIL CRITERIA');
    console.log('  ' + '-'.repeat(60));

    const criteria = [
      { name: 'p95 < 2000ms',                    value: `${p95}ms`,                                                                  pass: p95 < 2000 },
      { name: 'Error rate < 1% (incl timeouts)',  value: `${errorRate.toFixed(2)}%`,                                                  pass: errorRate < 1 },
      { name: 'No ledger over-count (per member)', value: `${integrityResult.totalAwarded} awarded / ${integrityResult.totalExpected} expected (delta: ${integrityResult.totalDelta >= 0 ? '+' : ''}${integrityResult.totalDelta})`, pass: !integrityResult.anyOvercount },
      { name: 'Exact ledger balance match',        value: `${integrityResult.totalDelta === 0 ? 'exact' : `off by ${integrityResult.totalDelta}`}`,                                                                                  pass: integrityResult.totalDelta === 0 },
      { name: 'No malformed ledger rows',          value: integrityResult.anyRowMismatch ? 'mismatch found' : 'all rows = 1 point',                                                                                                   pass: !integrityResult.anyRowMismatch },
      { name: 'Provider-only auth boundary holds', value: boundaryHeld ? '403 as expected' : 'NOT rejected',                                                                                                                            pass: boundaryHeld },
    ];

    for (const c of criteria) {
      console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name.padEnd(36)} ${c.value}`);
    }

    if (integrityResult.anyUndercount) {
      console.log(`\n  NOTE: Under-count detected — ${Math.abs(integrityResult.totalDelta)} punch(es) lost.`);
      console.log('  A successful (2xx) call did not durably produce a ledger row — investigate');
      console.log('  as a genuine regression, since INSERTs don\'t lose-update the way the old');
      console.log('  read-modify-write counter did.');
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
  console.error('\nPunch concurrency test failed:', err);
  cleanupTestData().catch(() => {}).finally(() => process.exit(1));
});

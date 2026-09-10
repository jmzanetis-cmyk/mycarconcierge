// Car Club — general API load/soak test (ramp-up / sustained / spike /
// cool-down), mixing the same 4 flows a real pilot would generate.
//
// 2026-09-09 REWRITE: this targeted an API shape that no longer exists —
// GET /api/car-club/my-club returning `reward_rules[]` with a
// `template_slug`, a reward-templates catalog endpoint, and
// POST /api/car-club/log-activity keyed on a punch_count balance. None of
// that survived the Slice 1/2 points-ledger rebuild. See
// stress-test-car-club-punch.js's header comment for the full architecture
// change — the short version: punching is now POST /api/car-club/punch
// (provider-authenticated, body { club_id, qr_token }), rule-agnostic, and
// needs no reward-rule/template setup at all — every INSERT just appends
// 1 point to club_points_ledger. That removes an entire setup phase this
// script used to need.
//
// Flows under test (all via server API, user-context JWT):
//   1. Browse clubs  — GET /api/car-club/browse
//   2. My clubs      — GET /api/car-club/my-clubs
//   3. Punch         — POST /api/car-club/punch (provider awards a point)
//   4. My rewards    — GET /api/car-club/my-rewards (legacy club_reward_rules
//                       read path — no current writer populates this table,
//                       so expect empty responses; still real production
//                       traffic shape worth load-testing as-is)
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
const RUN_ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const metrics = {
  browse:  { name: 'Browse clubs', requests: 0, errors: 0, rateLimited: 0, timeouts: 0, latencies: [], statusCodes: {} },
  myClubs: { name: 'My clubs',     requests: 0, errors: 0, rateLimited: 0, timeouts: 0, latencies: [], statusCodes: {} },
  punch:   { name: 'Punch',        requests: 0, errors: 0, rateLimited: 0, timeouts: 0, latencies: [], statusCodes: {} },
  myRewards: { name: 'My rewards', requests: 0, errors: 0, rateLimited: 0, timeouts: 0, latencies: [], statusCodes: {} },
};

let workerUnhandledErrors = 0;

function recordMetric(metric, latency, status) {
  metric.requests++;
  metric.latencies.push(latency);
  metric.statusCodes[status] = (metric.statusCodes[status] || 0) + 1;
  if (status === 429) {
    metric.rateLimited++;
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

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
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

// clubData[i]: { clubId, providerId, providerToken, clubCreatedByTest }
// Multi-club-per-provider is explicitly allowed by the schema (car-clubs.js
// :729-735 — "creates freely, no 409 on second club"), so there's no reuse
// branch to fall back to for the disposable sim providers: each run just
// makes its own club, tagged with RUN_ID, and deletes it in cleanup. The
// one exception is an externally-supplied real provider (--provider-jwt) —
// reuse their existing club if they already have one, so repeated runs
// don't pile up throwaway clubs on a real account.
async function ensureClubsAndMemberships(providerSessions, memberSessions) {
  console.log('  Setting up car clubs for each provider...');
  const clubData = [];

  for (const ps of providerSessions) {
    if (!ps.userId) continue;

    const isExternal = CONFIG.providerUserId && ps.userId === CONFIG.providerUserId;
    let clubId = null;
    let clubCreatedByTest = false;

    if (isExternal) {
      const mineRes = await fetchJson(`${BASE_URL}/api/car-club/my-provider-clubs`, {
        headers: { 'Authorization': `Bearer ${ps.token}` },
      });
      const existing = (mineRes.data?.clubs || [])[0];
      if (existing) {
        clubId = existing.id;
        console.log(`  External provider already has a club (${clubId}) — reusing it`);
      }
    }

    if (!clubId) {
      const createRes = await fetchJson(`${BASE_URL}/api/car-club/create`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ps.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Stress Test Club ${RUN_ID} ${ps.userId.slice(0, 8)}`,
          description: 'Auto-created for stress testing — auto-deleted on completion',
        }),
      });
      if (createRes.status === 403) {
        console.warn(`  Provider ${ps.userId.slice(0, 8)}... got 403 creating a club — car_club_programs_enabled likely off for this account, skipping`);
        continue;
      }
      if (createRes.data?.club) {
        clubId = createRes.data.club.id;
        clubCreatedByTest = true;
      }
    }

    if (!clubId) continue;
    clubData.push({ clubId, providerId: ps.userId, providerToken: ps.token, clubCreatedByTest });
  }

  console.log(`  ${clubData.length} clubs ready`);

  if (clubData.length === 0) {
    console.error('  No clubs could be set up. Aborting.');
    process.exit(1);
  }

  console.log('  Joining members to clubs...');
  let joined = 0;
  const externalClub = CONFIG.providerUserId
    ? clubData.find(c => c.providerId === CONFIG.providerUserId)
    : null;

  for (let i = 0; i < memberSessions.length; i++) {
    const ms = memberSessions[i];
    const targetClub = (externalClub && i === 0) ? externalClub : pick(clubData);
    const joinRes = await fetchJson(`${BASE_URL}/api/car-club/join`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ms.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ club_id: targetClub.clubId }),
    });
    // 200 = joined, 409 = already a member (fine, still assigned below) —
    // both count as "usable" for this run.
    if (joinRes.status === 200 || joinRes.status === 409) joined++;
  }
  console.log(`  ${joined} member-club joins confirmed${externalClub ? ' (first member deterministically joined to external provider club)' : ''}`);

  const clubDataByClubId = {};
  for (const cd of clubData) clubDataByClubId[cd.clubId] = cd;

  // No membership_id in the current my-clubs response shape (listMyClubs
  // returns club_id + balances, not the membership row's own id) — and we
  // don't need one. The ledger is keyed on (club_id, member_id) directly,
  // so that pair is all downstream code needs to track a punch assignment.
  const memberClubAssignments = [];
  for (const ms of memberSessions) {
    const myClubsRes = await fetchJson(`${BASE_URL}/api/car-club/my-clubs`, {
      headers: { 'Authorization': `Bearer ${ms.token}` },
    });
    for (const club of (myClubsRes.data?.clubs || [])) {
      const cd = clubDataByClubId[club.club_id];
      if (cd) {
        memberClubAssignments.push({
          memberId: ms.userId,
          memberToken: ms.token,
          clubId: cd.clubId,
          providerId: cd.providerId,
          providerToken: cd.providerToken,
        });
      }
    }
  }

  const externalProviderExercised = CONFIG.providerUserId
    ? memberClubAssignments.some(a => a.providerId === CONFIG.providerUserId)
    : false;

  console.log(`  ${memberClubAssignments.length} active member-club assignments found`);
  if (CONFIG.providerUserId) {
    console.log(`  External provider: ${externalProviderExercised ? 'exercised (has tracked membership)' : 'NOT exercised — no memberships found'}`);
  }

  if (memberClubAssignments.length === 0) {
    console.error('  No member-club assignments found. Aborting.');
    process.exit(1);
  }

  return { clubData, memberClubAssignments, externalProviderExercised };
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
      console.log(`  Added external provider JWT with user ID ${CONFIG.providerUserId} (punch tracking enabled)`);
    } else {
      console.log('  Added external provider JWT — WARNING: --provider-user-id not set, external provider punches excluded from integrity check');
    }
  }

  console.log(`  Authenticated: ${memberSessions.length} members, ${providerSessions.length} providers`);

  if (memberSessions.length === 0 || providerSessions.length === 0) {
    console.error('  Could not authenticate any test users. Aborting.');
    process.exit(1);
  }

  const { clubData, memberClubAssignments } = await ensureClubsAndMemberships(providerSessions, memberSessions);

  const trackedMemberIds = [...new Set(memberClubAssignments.map(a => a.memberId))];
  const trackedClubIds   = [...new Set(memberClubAssignments.map(a => a.clubId))];
  const trackedPairKeys  = new Set(memberClubAssignments.map(a => `${a.clubId}:${a.memberId}`));

  const ledgerBefore = await getLedgerStats(trackedClubIds, trackedPairKeys);

  return {
    memberSessions,
    providerSessions,
    clubData,
    memberClubAssignments,
    ledgerBefore,
    trackedMemberIds,
    trackedClubIds,
    trackedPairKeys,
  };
}

// Direct service-role read of club_points_ledger, scoped to the tracked
// (club_id, member_id) pairs this run created/joined. Used as a before/after
// snapshot — the diff is correct even when a club is reused from a real
// external provider with pre-existing, unrelated ledger history, because
// only the delta across the test window is ever reported, not the absolute
// totals.
async function getLedgerStats(clubIds, pairKeys) {
  if (clubIds.length === 0) return { balances: {}, rowCounts: {} };
  const { data, error } = await supabaseAdmin
    .from('club_points_ledger')
    .select('club_id, member_id, delta_points')
    .in('club_id', clubIds);
  if (error) {
    console.error('  Failed to read club_points_ledger:', error.message);
    return { balances: {}, rowCounts: {} };
  }
  const balances = {};
  const rowCounts = {};
  for (const row of (data || [])) {
    const key = `${row.club_id}:${row.member_id}`;
    if (!pairKeys.has(key)) continue; // not one of our tracked members — don't mix in real club activity
    balances[key] = (balances[key] || 0) + row.delta_points;
    rowCounts[key] = (rowCounts[key] || 0) + 1;
  }
  return { balances, rowCounts };
}

async function runBrowse(session) {
  const result = await timedFetch(`${BASE_URL}/api/car-club/browse`, {
    headers: { 'Authorization': `Bearer ${session.token}` },
  });
  if (result.timeout) {
    metrics.browse.timeouts++;
    metrics.browse.requests++;
    metrics.browse.latencies.push(result.latency);
    return;
  }
  recordMetric(metrics.browse, result.latency, result.status);
}

async function runMyClubs(session) {
  const result = await timedFetch(`${BASE_URL}/api/car-club/my-clubs`, {
    headers: { 'Authorization': `Bearer ${session.token}` },
  });
  if (result.timeout) {
    metrics.myClubs.timeouts++;
    metrics.myClubs.requests++;
    metrics.myClubs.latencies.push(result.latency);
    return;
  }
  recordMetric(metrics.myClubs, result.latency, result.status);
}

// POST /api/car-club/punch — provider-authenticated (car-clubs.js:473-526).
// Body: { club_id, qr_token }. qr_token uses the member's own auth uid,
// valid via the profiles.id fallback resolution path — see
// stress-test-car-club-punch.js's header for why that's preferred over the
// schema-drift-risky profiles.qr_code_token column.
async function runPunch(assignment) {
  const result = await timedFetch(`${BASE_URL}/api/car-club/punch`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${assignment.providerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      club_id: assignment.clubId,
      qr_token: assignment.memberId,
    }),
  });
  if (result.timeout) {
    metrics.punch.timeouts++;
    metrics.punch.requests++;
    metrics.punch.latencies.push(result.latency);
    return;
  }
  recordMetric(metrics.punch, result.latency, result.status);
}

async function runMyRewards(session) {
  const result = await timedFetch(`${BASE_URL}/api/car-club/my-rewards`, {
    headers: { 'Authorization': `Bearer ${session.token}` },
  });
  if (result.timeout) {
    metrics.myRewards.timeouts++;
    metrics.myRewards.requests++;
    metrics.myRewards.latencies.push(result.latency);
    return;
  }
  recordMetric(metrics.myRewards, result.latency, result.status);
}

async function runWorker(data, stopSignal) {
  const { memberSessions, memberClubAssignments } = data;

  while (!stopSignal.stop) {
    const action = rand(1, 10);
    try {
      if (action <= 3) {
        await runBrowse(pick(memberSessions));
      } else if (action <= 5) {
        await runMyClubs(pick(memberSessions));
      } else if (action <= 8) {
        await runPunch(pick(memberClubAssignments));
      } else {
        await runMyRewards(pick(memberSessions));
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
  console.log('  CAR CLUB STRESS TEST RESULTS');
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

  const getLatencies  = [...metrics.browse.latencies, ...metrics.myClubs.latencies, ...metrics.myRewards.latencies];
  const postLatencies = metrics.punch.latencies;
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

  return { criteria, data };
}

async function checkPunchIntegrity(result) {
  const { data } = result;
  const ledgerAfter = await getLedgerStats(data.trackedClubIds, data.trackedPairKeys);

  let pointsAwarded = 0;
  for (const key of data.trackedPairKeys) {
    pointsAwarded += (ledgerAfter.balances[key] || 0) - (data.ledgerBefore.balances[key] || 0);
  }
  const successfulPunches = metrics.punch.statusCodes[200] || 0;
  const overcounted  = pointsAwarded > successfulPunches;
  const undercounted = pointsAwarded < successfulPunches;

  console.log(`\n  PUNCH LEDGER INTEGRITY (club_points_ledger — direct read, service role)`);
  console.log(`  Tracked (club, member) pairs: ${data.trackedPairKeys.size}`);
  console.log(`  Points awarded (after-before): ${pointsAwarded}`);
  console.log(`  Successful punch calls (200):  ${successfulPunches}`);
  console.log(`  Rate limited punch calls:      ${metrics.punch.rateLimited}`);

  if (pointsAwarded === successfulPunches) {
    console.log(`  [PASS] Points awarded matches successful punch calls exactly`);
  } else if (overcounted) {
    console.log(`  [FAIL] OVER-COUNT — points awarded (${pointsAwarded}) > successful calls (${successfulPunches}), delta: +${pointsAwarded - successfulPunches}`);
    console.log('         Indicates a double-insert bug in punchMember().');
  } else if (undercounted) {
    console.log(`  [FAIL] UNDER-COUNT — points awarded (${pointsAwarded}) < successful calls (${successfulPunches}), delta: -${successfulPunches - pointsAwarded}`);
    console.log('         A 2xx response did not durably produce a ledger row — investigate as a regression.');
  }

  result.criteria.push({
    name: 'Punch ledger matches call count',
    value: `${pointsAwarded} awarded / ${successfulPunches} calls`,
    pass: pointsAwarded === successfulPunches,
  });
  console.log(`  [${pointsAwarded === successfulPunches ? 'PASS' : 'FAIL'}] ${'Punch ledger matches call count'.padEnd(28)} ${pointsAwarded} awarded / ${successfulPunches} calls`);

  console.log('\n====================================================\n');
  return pointsAwarded === successfulPunches;
}

// Test-created clubs get fully torn down (ledger rows, memberships, then
// the club itself). Reused clubs (the external --provider-jwt path, when
// that provider already had one) are never deleted or have their pre-test
// history touched — only THIS run's own ledger rows (time-boxed) are
// removed, and the test members' memberships are deactivated via the same
// is_active=false path leaveClub() uses (never a hard delete — matches
// car-clubs.js:298's "preserves ledger" convention), never hard-deleted.
async function cleanup(data, testStartIso) {
  console.log('\n[Cleanup] Removing test-created data...');

  for (const cd of data.clubData) {
    const memberIdsInThisClub = data.memberClubAssignments
      .filter(a => a.clubId === cd.clubId)
      .map(a => a.memberId);
    if (memberIdsInThisClub.length === 0) continue;

    if (cd.clubCreatedByTest) {
      await supabaseAdmin.from('club_points_ledger').delete().eq('club_id', cd.clubId);
      await supabaseAdmin.from('club_memberships').delete().eq('club_id', cd.clubId);
      await supabaseAdmin.from('car_clubs').delete().eq('id', cd.clubId);
      console.log(`  Deleted test-created club ${cd.clubId} (ledger + memberships + club row)`);
    } else {
      await supabaseAdmin.from('club_points_ledger').delete()
        .eq('club_id', cd.clubId)
        .in('member_id', memberIdsInThisClub)
        .gte('created_at', testStartIso);
      await supabaseAdmin.from('club_memberships').update({ is_active: false })
        .eq('club_id', cd.clubId)
        .in('member_id', memberIdsInThisClub);
      console.log(`  Kept pre-existing club ${cd.clubId} — removed this run's ledger rows + deactivated test members' memberships only`);
    }
  }

  console.log('  Cleanup complete.\n');
}

async function main() {
  console.log('\n====================================================');
  console.log('  My Car Concierge — Car Club API Stress Test');
  console.log('====================================================');
  console.log(`  Target:              ${CONFIG.baseUrl}`);
  console.log(`  Target concurrency:  ${CONFIG.concurrency}`);
  console.log(`  Sustained duration:  ${CONFIG.duration}s`);
  console.log(`  Ramp-up time:        ${CONFIG.rampUpTime}s`);
  console.log(`  Spike multiplier:    ${CONFIG.spikeMultiplier}x`);
  console.log(`  Request timeout:     ${CONFIG.requestTimeout}ms`);
  console.log(`\n  Flows under test (all via server API, user-context JWT):`);
  console.log(`    1. Browse clubs  — GET /api/car-club/browse (club listing for members)`);
  console.log(`    2. My clubs      — GET /api/car-club/my-clubs (member's joined clubs + ledger balances)`);
  console.log(`    3. Punch         — POST /api/car-club/punch (provider awards a point to member)`);
  console.log(`    4. My rewards    — GET /api/car-club/my-rewards (legacy reward-rules read path)`);
  console.log('====================================================\n');

  console.log('[Setup] Loading test data and setting up car clubs...');
  const data = await loadSimData();
  console.log('  Setup complete.\n');

  const testStartTime = Date.now();
  const testStartIso = new Date(testStartTime).toISOString();

  let exitCode = 1;
  try {
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
    const punchCheckPassed = await checkPunchIntegrity(result);

    exitCode = (result.criteria.every(c => c.pass) && punchCheckPassed) ? 0 : 1;
  } finally {
    try {
      await cleanup(data, testStartIso);
    } catch (cleanupErr) {
      console.error('  Cleanup error:', cleanupErr.message);
    }
    process.exit(exitCode);
  }
}

main().catch(err => {
  console.error('\nCar club stress test failed:', err);
  process.exit(1);
});

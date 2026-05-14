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

const metrics = {
  browse:      { name: 'Browse clubs',   requests: 0, errors: 0, rateLimited: 0, timeouts: 0, latencies: [], statusCodes: {} },
  myClubs:     { name: 'My clubs',       requests: 0, errors: 0, rateLimited: 0, timeouts: 0, latencies: [], statusCodes: {} },
  logActivity: { name: 'Log activity',   requests: 0, errors: 0, rateLimited: 0, timeouts: 0, latencies: [], statusCodes: {} },
  myRewards:   { name: 'My rewards',     requests: 0, errors: 0, rateLimited: 0, timeouts: 0, latencies: [], statusCodes: {} },
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
    if (!res.ok) return { status: res.status, data: null };
    const data = await res.json();
    return { status: res.status, data };
  } catch (err) {
    clearTimeout(timeout);
    return { status: 0, data: null };
  }
}

async function ensureClubsAndMemberships(providerSessions, memberSessions) {
  console.log('  Ensuring car clubs exist for each provider...');
  const clubData = [];

  let punchCardTemplateId = null;

  for (const ps of providerSessions) {
    if (!ps.userId) continue;

    const clubRes = await fetchJson(`${BASE_URL}/api/car-club/my-club`, {
      headers: { 'Authorization': `Bearer ${ps.token}` },
    });

    let clubId = null;
    let existingPunchCardRuleId = null;

    if (clubRes.data?.club) {
      clubId = clubRes.data.club.id;
      const punchRule = (clubRes.data.club.reward_rules || []).find(
        r => r.template_slug === 'punch_card' && r.is_active
      );
      if (punchRule) existingPunchCardRuleId = punchRule.id;
    } else {
      const createRes = await fetchJson(`${BASE_URL}/api/car-club/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ps.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `Stress Test Club ${ps.userId.slice(0, 8)}`,
          description: 'Auto-created for stress testing',
        }),
      });
      if (createRes.data?.club) {
        clubId = createRes.data.club.id;
      } else if (createRes.status === 409) {
        const retryRes = await fetchJson(`${BASE_URL}/api/car-club/my-club`, {
          headers: { 'Authorization': `Bearer ${ps.token}` },
        });
        clubId = retryRes.data?.club?.id || null;
      }
    }

    if (!clubId) continue;

    let ruleId = existingPunchCardRuleId;
    if (!ruleId) {
      if (!punchCardTemplateId) {
        const tplRes = await fetchJson(`${BASE_URL}/api/car-club/reward-templates`, {
          headers: { 'Authorization': `Bearer ${ps.token}` },
        });
        const punchTpl = (tplRes.data?.templates || []).find(t => t.slug === 'punch_card');
        punchCardTemplateId = punchTpl?.id || null;
      }

      if (punchCardTemplateId) {
        const rewardRes = await fetchJson(`${BASE_URL}/api/car-club/rewards`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${ps.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            template_id: punchCardTemplateId,
            name: 'Stress Test Punch Card',
            description: '10 punches for a reward',
            parameters: { punches_required: 10 },
          }),
        });
        if (rewardRes.data?.reward_rule) {
          ruleId = rewardRes.data.reward_rule.id;
        }
      }
    }

    if (!ruleId) continue;
    clubData.push({ clubId, ruleId, providerId: ps.userId, providerToken: ps.token });
  }

  console.log(`  ${clubData.length} clubs ready with punch_card reward rules`);

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
    await fetchJson(`${BASE_URL}/api/car-club/join`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ms.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ club_id: targetClub.clubId }),
    });
    joined++;
  }
  console.log(`  ${joined} member-club joins attempted${externalClub ? ' (first member deterministically joined to external provider club)' : ''}`);

  const clubDataByClubId = {};
  for (const cd of clubData) clubDataByClubId[cd.clubId] = cd;

  const memberClubAssignments = [];
  for (const ms of memberSessions) {
    const myClubsRes = await fetchJson(`${BASE_URL}/api/car-club/my-clubs`, {
      headers: { 'Authorization': `Bearer ${ms.token}` },
    });
    for (const club of (myClubsRes.data?.clubs || [])) {
      const cd = clubDataByClubId[club.club_id];
      if (cd && club.is_active) {
        memberClubAssignments.push({
          memberId: ms.userId,
          memberToken: ms.token,
          clubId: cd.clubId,
          ruleId: cd.ruleId,
          providerId: cd.providerId,
          providerToken: cd.providerToken,
          membershipId: club.membership_id,
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
  const trackedMembershipIds = [...new Set(memberClubAssignments.map(a => a.membershipId))];

  const totalPunchesBefore = await getPunchCountsViaApi(memberClubAssignments);

  return {
    memberSessions,
    providerSessions,
    clubData,
    memberClubAssignments,
    totalPunchesBefore,
    trackedMemberIds,
    trackedMembershipIds,
  };
}

async function getPunchCountsViaApi(memberClubAssignments) {
  const memberTokens = {};
  for (const a of memberClubAssignments) memberTokens[a.memberId] = a.memberToken;

  let total = 0;
  const seen = new Set();
  for (const memberId of Object.keys(memberTokens)) {
    const token = memberTokens[memberId];
    const res = await fetchJson(`${BASE_URL}/api/car-club/my-clubs`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    for (const club of (res.data?.clubs || [])) {
      const key = club.membership_id;
      if (seen.has(key)) continue;
      const tracked = memberClubAssignments.some(a => a.membershipId === key);
      if (!tracked) continue;
      seen.add(key);
      for (const bal of (club.balances || [])) {
        total += bal.punch_count || 0;
      }
    }
  }
  return total;
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

async function runLogActivity(assignment) {
  const result = await timedFetch(`${BASE_URL}/api/car-club/log-activity`, {
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
      description: 'Stress test punch',
    }),
  });
  if (result.timeout) {
    metrics.logActivity.timeouts++;
    metrics.logActivity.requests++;
    metrics.logActivity.latencies.push(result.latency);
    return;
  }
  recordMetric(metrics.logActivity, result.latency, result.status);
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
        await runLogActivity(pick(memberClubAssignments));
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
  const postLatencies = metrics.logActivity.latencies;
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

  return { criteria, totalPunchesBefore: data.totalPunchesBefore, trackedMembershipIds: data.trackedMembershipIds, memberClubAssignments: data.memberClubAssignments };
}

async function checkPunchIntegrity(result) {
  const totalPunchesAfter = await getPunchCountsViaApi(result.memberClubAssignments);
  const successfulLogs = metrics.logActivity.statusCodes[200] || 0;
  const punchesAwarded = totalPunchesAfter - result.totalPunchesBefore;
  const overcounted    = punchesAwarded > successfulLogs;
  const undercounted   = punchesAwarded < successfulLogs;

  console.log(`\n  PUNCH COUNT INTEGRITY`);
  console.log(`  Tracked memberships: ${result.trackedMembershipIds.length}`);
  console.log(`  Punches before:      ${result.totalPunchesBefore}`);
  console.log(`  Punches after:       ${totalPunchesAfter}`);
  console.log(`  Punches awarded:     ${punchesAwarded}`);
  console.log(`  Successful logs:     ${successfulLogs}`);
  console.log(`  Rate limited logs:   ${metrics.logActivity.rateLimited}`);

  if (punchesAwarded === successfulLogs) {
    console.log(`  [PASS] No over-count — punches awarded matches successful log-activity calls exactly`);
  } else if (overcounted) {
    console.log(`  [FAIL] OVER-COUNT detected — punches awarded (${punchesAwarded}) > successful calls (${successfulLogs}), delta: +${punchesAwarded - successfulLogs}`);
    console.log(`         Members received more punches than log-activity calls succeeded — double-increment bug`);
  } else if (undercounted) {
    console.log(`  [PASS] No over-count — punches awarded (${punchesAwarded}) < successful calls (${successfulLogs}), delta: -${successfulLogs - punchesAwarded}`);
    console.log(`         ${successfulLogs - punchesAwarded} punch(es) lost (concurrent race or auto-reset — members under-awarded, not over-awarded)`);
  }

  result.criteria.push({
    name: 'No punch over-count',
    value: `${punchesAwarded} awarded / ${successfulLogs} calls`,
    pass: !overcounted,
  });
  console.log(`  [${!overcounted ? 'PASS' : 'FAIL'}] ${'No punch over-count'.padEnd(28)} ${punchesAwarded} awarded / ${successfulLogs} calls`);

  console.log('\n====================================================\n');
  return !overcounted;
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
  console.log(`    2. My clubs      — GET /api/car-club/my-clubs (member's joined clubs + balances)`);
  console.log(`    3. Log activity  — POST /api/car-club/log-activity (provider awards punch to member)`);
  console.log(`    4. My rewards    — GET /api/car-club/my-rewards (member's available redemptions)`);
  console.log('====================================================\n');

  console.log('[Setup] Loading test data and setting up car clubs...');
  const data = await loadSimData();
  console.log('  Setup complete.\n');

  const testStartTime = Date.now();

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

  const allPassed = result.criteria.every(c => c.pass) && punchCheckPassed;
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('\nCar club stress test failed:', err);
  process.exit(1);
});

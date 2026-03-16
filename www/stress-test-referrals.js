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
  concurrency:        param('concurrency', 100),
  duration:           param('duration', 60),
  rampUpTime:         param('ramp-up', 30),
  spikeMultiplier:    2,
  spikeDuration:      10,
  coolDownDuration:   10,
  coolDownConcurrency: 10,
  requestTimeout:     5000,
  seedCount:          param('seed-count', 20),
  maxMembers:         param('max-members', 40),
  baseUrl:            strParam('base-url', process.env.STRESS_TEST_BASE_URL || 'http://localhost:5000'),
  memberJwt:          strParam('member-jwt', process.env.STRESS_MEMBER_JWT || ''),
  providerJwt:        strParam('provider-jwt', process.env.STRESS_PROVIDER_JWT || ''),
};

const BASE_URL = CONFIG.baseUrl;
const SIM_DOMAIN = '@mcc-sim.test';
const SIM_PASSWORD = 'SimPass123!';

const RESERVOIR_SIZE = 50000;

function createMetric(name) {
  return { name, requests: 0, errors: 0, rateLimited: 0, timeouts: 0, latencies: new Float32Array(RESERVOIR_SIZE), latencyCount: 0, statusCodes: {} };
}

const metrics = {
  complete:  createMetric('Ref complete'),
  apply:     createMetric('Ref apply'),
  authCheck: createMetric('Auth check'),
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

function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'STRESSREF';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function seedReferrals(memberSessions, referrerIds) {
  const count = Math.min(CONFIG.seedCount, memberSessions.length);

  const memberIds = memberSessions.map(s => s.userId);

  const { data: staleRefs } = await supabaseAdmin
    .from('referrals')
    .select('id')
    .like('referral_code', 'STRESSREF%')
    .in('referred_id', [...memberIds, null]);
  if (staleRefs && staleRefs.length > 0) {
    const staleIds = staleRefs.map(r => r.id);
    await supabaseAdmin.from('member_credits').delete().in('referral_id', staleIds);
    await supabaseAdmin.from('referrals').delete().in('id', staleIds);
    console.log(`  Cleaned up ${staleRefs.length} leftover STRESSREF referrals for sim accounts`);
  }

  const { data: extraPending } = await supabaseAdmin
    .from('referrals')
    .select('id')
    .in('referred_id', memberIds)
    .eq('status', 'pending');
  if (extraPending && extraPending.length > 0) {
    const extraIds = extraPending.map(r => r.id);
    await supabaseAdmin.from('member_credits').delete().in('referral_id', extraIds);
    await supabaseAdmin.from('referrals').delete().in('id', extraIds);
    console.log(`  Cleaned up ${extraPending.length} existing pending referrals for sim members`);
  }

  console.log(`  Seeding ${count} referral rows in 'pending' state (1 per distinct referred_id)...`);

  const seeded = [];

  for (let i = 0; i < count; i++) {
    const referredSession = memberSessions[i];
    const referrerId = referrerIds[i % referrerIds.length];
    const code = generateReferralCode();

    const { data, error } = await supabaseAdmin
      .from('referrals')
      .insert({
        referrer_id: referrerId,
        referred_id: referredSession.userId,
        referral_code: code,
        status: 'pending',
        referrer_credit_amount: 1000,
        referred_credit_amount: 1000,
      })
      .select('id')
      .single();

    if (error) {
      console.log(`  [WARN] Seed #${i} failed: ${error.message}`);
      continue;
    }

    seeded.push({
      referralId: data.id,
      referredId: referredSession.userId,
      referrerId,
      code,
    });
  }

  console.log(`  ${seeded.length} referral rows seeded`);
  return seeded;
}

async function seedClaimableCodes(referrerIds) {
  const claimableCount = Math.max(5, referrerIds.length);
  console.log(`  Seeding ${claimableCount} claimable referral codes (referred_id IS NULL) for apply flow...`);

  const codes = [];
  const claimableIds = [];

  for (let i = 0; i < claimableCount; i++) {
    const referrerId = referrerIds[i % referrerIds.length];
    const code = generateReferralCode();

    const { data, error } = await supabaseAdmin
      .from('referrals')
      .insert({
        referrer_id: referrerId,
        referred_id: null,
        referral_code: code,
        status: 'pending',
        referrer_credit_amount: 1000,
        referred_credit_amount: 1000,
      })
      .select('id')
      .single();

    if (error) {
      console.log(`  [WARN] Claimable seed #${i} failed: ${error.message}`);
      continue;
    }

    codes.push(code);
    claimableIds.push(data.id);
  }

  console.log(`  ${codes.length} claimable codes seeded`);
  return { claimableCodes: codes, claimableIds };
}

async function grantAdminRole(memberSessions) {
  const adminUserId = memberSessions[0].userId;
  const { data: origProfile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', adminUserId)
    .single();

  const originalRole = origProfile?.role || 'member';

  await supabaseAdmin
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', adminUserId);

  console.log(`  Temporarily granted admin role to ${adminUserId} (was: ${originalRole})`);

  return { adminSession: memberSessions[0], adminUserId, originalRole };
}

async function restoreAdminRole(adminUserId, originalRole) {
  await supabaseAdmin
    .from('profiles')
    .update({ role: originalRole })
    .eq('id', adminUserId);

  console.log(`  Restored role for ${adminUserId} to '${originalRole}'`);
}

async function cleanupSeededData(seededReferrals, claimableIds, claimableCodes) {
  console.log('\n[Teardown] Cleaning up seeded test data...');

  const referralIds = seededReferrals.map(s => s.referralId);
  const allIds = [...referralIds, ...(claimableIds || [])];

  if (claimableCodes && claimableCodes.length > 0) {
    const { data: applyCreated } = await supabaseAdmin
      .from('referrals')
      .select('id')
      .in('referral_code', claimableCodes);
    if (applyCreated && applyCreated.length > 0) {
      const applyIds = applyCreated.map(r => r.id);
      allIds.push(...applyIds);
    }
  }

  if (allIds.length > 0) {
    const { error: credErr } = await supabaseAdmin
      .from('member_credits')
      .delete()
      .in('referral_id', allIds);
    if (credErr) console.log(`  [WARN] member_credits cleanup: ${credErr.message}`);

    const { error: refErr } = await supabaseAdmin
      .from('referrals')
      .delete()
      .in('id', allIds);
    if (refErr) console.log(`  [WARN] referrals cleanup: ${refErr.message}`);
  }

  console.log(`  Cleaned up ${allIds.length} seeded/created referral rows and associated credits`);
}

async function loadSimData(cleanupState) {
  console.log('  Loading simulation data...');

  const memberSessions = [];
  const adminSessions = [];

  if (CONFIG.memberJwt) {
    const jwtPayload = JSON.parse(Buffer.from(CONFIG.memberJwt.split('.')[1], 'base64').toString());
    memberSessions.push({ token: CONFIG.memberJwt, userId: jwtPayload.sub });
    console.log(`  Using externally supplied member JWT (user: ${jwtPayload.sub})`);
  }
  if (CONFIG.providerJwt) {
    const jwtPayload = JSON.parse(Buffer.from(CONFIG.providerJwt.split('.')[1], 'base64').toString());
    adminSessions.push({ token: CONFIG.providerJwt, userId: jwtPayload.sub });
    console.log(`  Using externally supplied provider JWT (user: ${jwtPayload.sub})`);
  }

  const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const simUsers = (allUsers?.users || []).filter(u => u.email && u.email.endsWith(SIM_DOMAIN));

  const maxMembers = CONFIG.maxMembers;
  const memberEmails = simUsers.filter(u => u.email.startsWith('sim-member-')).map(u => u.email).slice(0, maxMembers * 2);
  const providerEmails = simUsers.filter(u => u.email.startsWith('sim-provider-')).map(u => u.email).slice(0, 5);

  if (memberEmails.length === 0 && memberSessions.length === 0) {
    throw new Error('No simulation member accounts found. Run simulate-platform.js first.');
  }

  console.log(`  Found ${memberEmails.length} member accounts, ${providerEmails.length} provider accounts`);
  console.log('  Authenticating test users...');

  for (const email of memberEmails) {
    if (memberSessions.length >= maxMembers) break;
    const session = await getSession(email);
    if (session) memberSessions.push(session);
  }

  for (const email of providerEmails) {
    if (adminSessions.length >= 3) break;
    const session = await getSession(email);
    if (session) adminSessions.push(session);
  }

  if (memberSessions.length === 0) {
    throw new Error('Could not authenticate any member accounts.');
  }

  console.log(`  Authenticated: ${memberSessions.length} members, ${adminSessions.length} providers (for auth load)`);

  const seedCount = Math.min(CONFIG.seedCount, memberSessions.length);
  const completeMembers = memberSessions.slice(0, seedCount);
  const applyMembers = memberSessions.slice(seedCount);

  if (applyMembers.length === 0 && memberSessions.length > seedCount) {
    applyMembers.push(...memberSessions.slice(seedCount));
  }

  console.log(`  Pool split: ${completeMembers.length} members for complete, ${applyMembers.length} members for apply`);

  const referrerIds = simUsers
    .filter(u => u.email.startsWith('sim-member-'))
    .map(u => u.id)
    .filter(id => !completeMembers.some(s => s.userId === id))
    .slice(0, 10);

  if (referrerIds.length === 0) {
    const fallbackIds = simUsers.filter(u => u.email.startsWith('sim-member-')).map(u => u.id).slice(0, 3);
    referrerIds.push(...fallbackIds);
  }

  console.log(`  Using ${referrerIds.length} distinct referrer IDs`);

  const { adminSession, adminUserId, originalRole } = await grantAdminRole(completeMembers);
  cleanupState.adminUserId = adminUserId;
  cleanupState.originalRole = originalRole;

  const seededReferrals = await seedReferrals(completeMembers, referrerIds);
  cleanupState.seededReferrals = seededReferrals;

  if (seededReferrals.length === 0) {
    throw new Error('No referrals could be seeded.');
  }

  const { claimableCodes, claimableIds } = applyMembers.length > 0
    ? await seedClaimableCodes(referrerIds)
    : { claimableCodes: [], claimableIds: [] };
  cleanupState.claimableIds = claimableIds;
  cleanupState.claimableCodes = claimableCodes;

  if (applyMembers.length === 0) {
    console.log(`  [INFO] No separate apply pool — apply flow disabled (increase --max-members above --seed-count)`);
  }

  const allSessions = [...memberSessions, ...adminSessions];

  return { memberSessions, adminSessions, allSessions, adminSession, adminUserId, originalRole, seededReferrals, referrerIds, claimableCodes, claimableIds, applyMembers };
}

async function runComplete(session, referredId) {
  const result = await timedFetch(`${BASE_URL}/api/referral/complete`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ referred_id: referredId }),
  });

  if (result.timeout) {
    metrics.complete.timeouts++;
    metrics.complete.requests++;
    addLatency(metrics.complete, result.latency);
    return;
  }
  recordMetric(metrics.complete, result.latency, result.status);
}

async function runApply(session, code) {
  const result = await timedFetch(`${BASE_URL}/api/referral/apply`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      referral_code: code,
      referred_id: session.userId,
    }),
  });

  if (!result.timeout && result.status === 400) {
    metrics.apply.requests++;
    addLatency(metrics.apply, result.latency);
    metrics.apply.statusCodes[result.status] = (metrics.apply.statusCodes[result.status] || 0) + 1;
    return;
  }

  if (result.timeout) {
    metrics.apply.timeouts++;
    metrics.apply.requests++;
    addLatency(metrics.apply, result.latency);
    return;
  }
  recordMetric(metrics.apply, result.latency, result.status);
}

async function runAuthCheck(session) {
  const result = await timedFetch(`${BASE_URL}/api/auth/check-access`, {
    headers: { 'Authorization': `Bearer ${session.token}` },
  });

  if (result.timeout) {
    metrics.authCheck.timeouts++;
    metrics.authCheck.requests++;
    addLatency(metrics.authCheck, result.latency);
    return;
  }
  recordMetric(metrics.authCheck, result.latency, result.status);
}

async function runWorker(data, stopSignal) {
  const { allSessions, adminSession, seededReferrals, claimableCodes, applyMembers } = data;
  const referredIds = seededReferrals.map(s => s.referredId);
  const hasApplyFlow = applyMembers && applyMembers.length > 0 && claimableCodes && claimableCodes.length > 0;

  while (!stopSignal.stop) {
    const action = rand(1, 10);
    try {
      if (action <= 5) {
        await runComplete(adminSession, pick(referredIds));
      } else if (action <= 7 && hasApplyFlow) {
        await runApply(pick(applyMembers), pick(claimableCodes));
      } else {
        await runAuthCheck(pick(allSessions));
      }
    } catch (err) {
      workerUnhandledErrors++;
    }
    await new Promise(r => setTimeout(r, 10));
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

async function checkDoubleCredit(seededReferrals) {
  console.log('\n  REFERRAL CREDIT INTEGRITY');
  console.log('  ' + '-'.repeat(60));

  const referralIds = seededReferrals.map(s => s.referralId);

  const { data: credits, error: credErr } = await supabaseAdmin
    .from('member_credits')
    .select('id, referral_id')
    .eq('type', 'referral_bonus')
    .in('referral_id', referralIds);

  if (credErr) {
    console.log(`  [WARN] Could not query member_credits: ${credErr.message}`);
    return { pass: false, doubleCredited: 0, correctlyCredited: 0, uncredited: 0 };
  }

  const creditsByReferral = {};
  for (const c of (credits || [])) {
    if (!creditsByReferral[c.referral_id]) creditsByReferral[c.referral_id] = [];
    creditsByReferral[c.referral_id].push(c.id);
  }

  let doubleCredited = 0;
  let correctlyCredited = 0;
  let uncredited = 0;

  for (const sr of seededReferrals) {
    const creditRows = creditsByReferral[sr.referralId] || [];
    if (creditRows.length > 1) {
      doubleCredited++;
    } else if (creditRows.length === 1) {
      correctlyCredited++;
    } else {
      uncredited++;
    }
  }

  console.log(`  Tracked referrals:   ${seededReferrals.length}`);
  console.log(`  Correctly credited:  ${correctlyCredited}`);
  console.log(`  Uncredited (lost):   ${uncredited}`);
  console.log(`  Double-credited:     ${doubleCredited}`);

  const { data: refRows } = await supabaseAdmin
    .from('referrals')
    .select('id, status')
    .in('id', referralIds);

  const statusCounts = {};
  for (const r of (refRows || [])) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  }
  console.log(`  Final referral states: ${Object.entries(statusCounts).map(([k, v]) => `${k}:${v}`).join(', ') || 'none'}`);

  const noDoubleCredit = doubleCredited === 0;

  if (noDoubleCredit) {
    console.log(`  [PASS] No double-credit detected`);
    if (uncredited > 0) {
      console.log(`  [INFO] ${uncredited} referral(s) left uncredited (race caused under-credit — not over-credit)`);
    }
  } else {
    console.log(`  [FAIL] DOUBLE-CREDIT detected: ${doubleCredited} referral(s) credited more than once`);
    for (const sr of seededReferrals) {
      const creditRows = creditsByReferral[sr.referralId] || [];
      if (creditRows.length > 1) {
        console.log(`         Referral ${sr.referralId}: ${creditRows.length} credit rows (referred_id: ${sr.referredId})`);
      }
    }
  }

  return { pass: noDoubleCredit, doubleCredited, correctlyCredited, uncredited };
}

function printResults(testDurationSec) {
  console.log('\n====================================================');
  console.log('  REFERRAL STRESS TEST RESULTS');
  console.log('====================================================\n');

  const allMetrics = Object.values(metrics);
  const totalRequests    = allMetrics.reduce((s, m) => s + m.requests, 0);
  const totalErrors      = allMetrics.reduce((s, m) => s + m.errors, 0);
  const totalRateLimited = allMetrics.reduce((s, m) => s + m.rateLimited, 0);
  const totalTimeouts    = allMetrics.reduce((s, m) => s + m.timeouts, 0);
  const allLats          = allMetrics.flatMap(m => getLatencies(m));
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
  console.log(`  Overall p50:       ${percentile(allLats, 50)}ms`);
  console.log(`  Overall p95:       ${percentile(allLats, 95)}ms`);
  console.log(`  Overall p99:       ${percentile(allLats, 99)}ms\n`);

  const header = '  Endpoint              Reqs   RPS    Errs    429s  Timeouts   p50     p95     p99     Status Codes';
  console.log(header);
  console.log('  ' + '-'.repeat(header.length - 2));

  for (const m of allMetrics) {
    const lats = getLatencies(m);
    const p50  = percentile(lats, 50);
    const p95  = percentile(lats, 95);
    const p99  = percentile(lats, 99);
    const rps  = testDurationSec > 0 ? (m.requests / testDurationSec).toFixed(0) : 0;
    const codes = Object.entries(m.statusCodes).map(([k, v]) => `${k}:${v}`).join(' ');
    console.log(
      `  ${m.name.padEnd(20)} ${String(m.requests).padStart(6)} ${String(rps).padStart(5)}  ${String(m.errors).padStart(6)}  ${String(m.rateLimited).padStart(6)}  ${String(m.timeouts).padStart(8)}  ${String(p50 + 'ms').padStart(6)}  ${String(p95 + 'ms').padStart(6)}  ${String(p99 + 'ms').padStart(6)}  ${codes}`
    );
  }

  const getLats = getLatencies(metrics.authCheck);
  const postLats = [...getLatencies(metrics.complete), ...getLatencies(metrics.apply)];
  const getP95 = percentile(getLats, 95);
  const postP95 = percentile(postLats, 95);

  const nonRateLimited = totalRequests - totalRateLimited;
  const realErrorRate = nonRateLimited > 0 ? (totalErrors / nonRateLimited) * 100 : 0;

  return { getP95, postP95, realErrorRate };
}

async function main() {
  console.log('\n====================================================');
  console.log('  My Car Concierge — Referral Completion Stress Test');
  console.log('====================================================');
  console.log(`  Target:              ${CONFIG.baseUrl}`);
  console.log(`  Target concurrency:  ${CONFIG.concurrency}`);
  console.log(`  Sustained duration:  ${CONFIG.duration}s`);
  console.log(`  Ramp-up time:        ${CONFIG.rampUpTime}s`);
  console.log(`  Spike multiplier:    ${CONFIG.spikeMultiplier}x`);
  console.log(`  Request timeout:     ${CONFIG.requestTimeout}ms`);
  console.log(`  Seeded referrals:    ${CONFIG.seedCount}`);
  console.log(`\n  Flows under test:`);
  console.log(`    1. Ref complete — POST /api/referral/complete (race target — concurrent completion of same referred_id)`);
  console.log(`    2. Ref apply    — POST /api/referral/apply (members applying referral codes)`);
  console.log(`    3. Auth check   — GET /api/auth/check-access (ambient authenticated read load)`);
  console.log('====================================================\n');

  const cleanupState = { adminUserId: null, originalRole: null, seededReferrals: null, claimableIds: null, claimableCodes: null };
  let data = null;
  let allPassed = false;

  try {
    console.log('[Setup] Loading test data and seeding referrals...');
    data = await loadSimData(cleanupState);
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

    const { getP95, postP95, realErrorRate } = printResults(testDurationSec);
    const integrityResult = await checkDoubleCredit(data.seededReferrals);

    console.log('\n  PASS/FAIL CRITERIA');
    console.log('  ' + '-'.repeat(60));

    const criteria = [
      { name: 'GET p95 < 2000ms',           value: `${getP95}ms`,                   pass: getP95 < 2000 },
      { name: 'POST p95 < 3000ms',           value: `${postP95}ms`,                  pass: postP95 < 3000 },
      { name: 'Error rate < 2% (excl 429)',  value: `${realErrorRate.toFixed(2)}%`,  pass: realErrorRate < 2 },
      { name: 'No double-credit',            value: integrityResult.doubleCredited === 0 ? `${integrityResult.correctlyCredited} credited, 0 doubles` : `${integrityResult.doubleCredited} double-credited`, pass: integrityResult.pass },
    ];

    for (const c of criteria) {
      console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name.padEnd(28)} ${c.value}`);
    }

    console.log('\n====================================================\n');

    allPassed = criteria.every(c => c.pass);
  } finally {
    if (cleanupState.seededReferrals) {
      await cleanupSeededData(cleanupState.seededReferrals, cleanupState.claimableIds, cleanupState.claimableCodes).catch(e => console.error('  [WARN] Cleanup failed:', e.message));
    }
    if (cleanupState.adminUserId) {
      await restoreAdminRole(cleanupState.adminUserId, cleanupState.originalRole).catch(e => console.error('  [WARN] Role restore failed:', e.message));
    }
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('\nStress test failed:', err);
  process.exit(1);
});

// Stress test — concurrent care plan complete + dispute lifecycle (Task #227)
//
// Validates the race-condition handling between member-side complete + dispute
// for the same care plan. Both endpoints can flip plan.payment_status, both
// touch care_plan_completions. This test seeds care plans with accepted bids
// and races concurrent /complete and /dispute requests from the same member's
// session against the same plan, then verifies state ends up in exactly one
// terminal state per plan (completed OR disputed, never both, never partial).
//
// Endpoints under test:
//   POST /api/care-plans/:id/complete  (server.js:45633)
//   POST /api/care-plans/:id/dispute   (server.js:45773)
//
// Usage: node www/stress-test-care-plan-lifecycle.js
//        node www/stress-test-care-plan-lifecycle.js --concurrency=20 --duration=20

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
  concurrency:        param('concurrency', 30),
  duration:           param('duration', 30),
  rampUpTime:         param('ramp-up', 10),
  spikeMultiplier:    2,
  spikeDuration:      8,
  coolDownDuration:   8,
  coolDownConcurrency: 5,
  requestTimeout:     8000,
  planCount:          param('plans', 25),
  baseUrl:            strParam('base-url', process.env.STRESS_TEST_BASE_URL || 'http://localhost:5000'),
};
const BASE_URL = CONFIG.baseUrl;
const SIM_DOMAIN = '@mcc-sim.test';
const SIM_PASSWORD = 'SimPass123!';
const RESERVOIR_SIZE = 50000;
const STRESS_TAG = 'stress-care-plan-' + Date.now();

function createMetric(name) {
  return {
    name, requests: 0, errors: 0, rateLimited: 0, timeouts: 0,
    latencies: new Float32Array(RESERVOIR_SIZE), latencyCount: 0,
    statusCodes: {}
  };
}
const metrics = {
  complete: createMetric('POST /complete'),
  dispute:  createMetric('POST /dispute'),
};

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
  else if (status === 0) m.timeouts++;
  // 4xx (incl. 409 from /dispute when /complete already won the race) is
  // expected for races and is NOT counted as an error. Only 5xx are errors.
  else if (status >= 500) m.errors++;
}
function getLatencies(m) {
  const len = Math.min(m.latencyCount, RESERVOIR_SIZE);
  return Array.from(m.latencies.subarray(0, len));
}
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function timedFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.requestTimeout);
  const start = Date.now();
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return { status: res.status, latency: Date.now() - start };
  } catch (err) {
    clearTimeout(timeout);
    return { status: 0, latency: Date.now() - start };
  }
}

async function getSession(email) {
  const c = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data } = await c.auth.signInWithPassword({ email, password: SIM_PASSWORD });
  return data?.session ? { token: data.session.access_token, userId: data.user.id } : null;
}

async function loadSimMembers() {
  const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const sims = (data?.users || []).filter(u =>
    u.email && u.email.endsWith(SIM_DOMAIN) && u.email.startsWith('sim-member-')
  );
  if (sims.length === 0) {
    console.error('  No sim members found. Run simulate-platform.js first.');
    process.exit(1);
  }
  return sims.slice(0, Math.max(5, Math.ceil(CONFIG.planCount / 5)));
}

async function loadSimProviders() {
  const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return (data?.users || []).filter(u =>
    u.email && u.email.endsWith(SIM_DOMAIN) && u.email.startsWith('sim-provider-')
  ).slice(0, 5);
}

// Authenticated provider sessions used for cross-actor pressure on the
// /complete and /dispute endpoints. The endpoints are member-scoped (a
// provider session should be rejected by the auth/ownership check), so
// these requests will return 4xx — exactly the cross-actor race we want
// to verify the auth gate handles correctly under load. Any 2xx from a
// provider session would be an authorization regression and is asserted
// by the dedicated criterion below.
async function loadProviderSessions() {
  const providerUsers = await loadSimProviders();
  const sessions = [];
  for (const u of providerUsers) {
    const s = await getSession(u.email);
    if (s) sessions.push(s);
  }
  return sessions;
}

async function seedPlans(memberSessions, providerIds) {
  const seeded = [];
  for (let i = 0; i < CONFIG.planCount; i++) {
    const member = pick(memberSessions);
    const providerId = pick(providerIds);
    const { data: plan, error: planErr } = await supabaseAdmin.from('care_plans').insert({
      member_id: member.userId,
      title: `[${STRESS_TAG}] Plan #${i}`,
      description: 'Stress test plan',
      status: 'open',
      payment_status: 'none',
      service_type: 'general',
    }).select('id').single();
    if (planErr || !plan) {
      console.log(`  [WARN] Seed plan ${i} failed: ${planErr?.message}`);
      continue;
    }
    const { data: bid, error: bidErr } = await supabaseAdmin.from('plan_bids').insert({
      care_plan_id: plan.id,
      provider_id: providerId,
      amount: 100,
      status: 'accepted',
      message: 'stress test bid',
    }).select('id').single();
    if (bidErr || !bid) {
      console.log(`  [WARN] Seed bid for plan ${plan.id} failed: ${bidErr?.message}`);
      await supabaseAdmin.from('care_plans').delete().eq('id', plan.id);
      continue;
    }
    await supabaseAdmin.from('care_plans')
      .update({ accepted_bid_id: bid.id, provider_id: providerId, status: 'in_progress' })
      .eq('id', plan.id);
    seeded.push({ planId: plan.id, bidId: bid.id, member });
  }
  return seeded;
}

// Track per-actor 2xx outcomes so we can prove the auth gate rejects
// non-owner actor attempts. A 2xx from a provider session would be an
// authorization regression and is asserted in the criteria.
const providerSuccesses = { complete: 0, dispute: 0 };

async function dispute(plan, sessionOverride) {
  const sess = sessionOverride || plan.member;
  const { status, latency } = await timedFetch(`${BASE_URL}/api/care-plans/${plan.planId}/dispute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sess.token}`,
    },
    body: JSON.stringify({ dispute_reason: 'no-show', dispute_description: 'stress test dispute' }),
  });
  recordMetric(metrics.dispute, latency, status);
  if (sessionOverride && status >= 200 && status < 300) providerSuccesses.dispute++;
}

async function complete(plan, sessionOverride) {
  const sess = sessionOverride || plan.member;
  const { status, latency } = await timedFetch(`${BASE_URL}/api/care-plans/${plan.planId}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sess.token}`,
    },
    body: JSON.stringify({ accepted_bid_id: plan.bidId, completion_notes: 'stress test complete' }),
  });
  recordMetric(metrics.complete, latency, status);
  if (sessionOverride && status >= 200 && status < 300) providerSuccesses.complete++;
}

async function runPhase(name, concurrency, durationMs, plans, providerSessions) {
  const endTime = Date.now() + durationMs;
  let active = 0;
  await new Promise(resolve => {
    const tick = () => {
      while (active < concurrency && Date.now() < endTime) {
        active++;
        const plan = pick(plans);
        // Cross-actor race mix per the spec ("from member + provider sims"):
        //   ~40% member /complete (legitimate)
        //   ~40% member /dispute (legitimate)
        //   ~10% provider /complete (auth regression bait — must 4xx)
        //   ~10% provider /dispute (auth regression bait — must 4xx)
        // Provider attempts add real cross-actor pressure on the auth gate
        // for the same plan that members are racing against.
        const r = Math.random();
        let op;
        if (providerSessions.length > 0 && r >= 0.9) {
          op = dispute(plan, pick(providerSessions));
        } else if (providerSessions.length > 0 && r >= 0.8) {
          op = complete(plan, pick(providerSessions));
        } else if (r >= 0.4) {
          op = dispute(plan);
        } else {
          op = complete(plan);
        }
        op.then(() => {
          active--;
          if (Date.now() < endTime) tick();
          else if (active === 0) resolve();
        });
      }
      if (Date.now() >= endTime && active === 0) resolve();
    };
    tick();
  });
  console.log(`  [${name}] complete: ${metrics.complete.requests}, dispute: ${metrics.dispute.requests}`);
}

async function checkIntegrity(planIds) {
  const inconsistent = [];
  const { data: plans } = await supabaseAdmin.from('care_plans')
    .select('id, payment_status, status').in('id', planIds);
  const { data: completions } = await supabaseAdmin.from('care_plan_completions')
    .select('care_plan_id, status').in('care_plan_id', planIds);
  const completionByPlan = {};
  for (const c of (completions || [])) {
    if (!completionByPlan[c.care_plan_id]) completionByPlan[c.care_plan_id] = [];
    completionByPlan[c.care_plan_id].push(c.status);
  }
  const validPaymentStates = new Set(['none', 'captured', 'disputed', 'held', 'refunded']);
  // Terminal states a plan MUST be in if a completion row exists.
  const terminalStates = new Set(['captured', 'disputed', 'refunded']);
  let stuckCompletedPlans = 0;
  for (const p of (plans || [])) {
    const planCompletions = completionByPlan[p.id] || [];
    if (planCompletions.length > 1) {
      inconsistent.push({ planId: p.id, reason: `multiple completion rows: ${planCompletions.join(',')}` });
    }
    if (!validPaymentStates.has(p.payment_status)) {
      inconsistent.push({ planId: p.id, reason: `invalid payment_status: ${p.payment_status}` });
    }
    // If a completion row was written but payment_status is still 'none' or
    // 'held', the lifecycle update was lost — flag as inconsistent so the
    // 'none' state cannot silently mask a failed capture.
    if (planCompletions.length > 0 && !terminalStates.has(p.payment_status)) {
      stuckCompletedPlans++;
      inconsistent.push({ planId: p.id, reason: `completion exists but payment_status=${p.payment_status} (expected captured/disputed/refunded)` });
    }
  }
  return {
    totalPlans: (plans || []).length,
    totalCompletions: (completions || []).length,
    stuckCompletedPlans,
    inconsistent,
  };
}

async function cleanup(planIds) {
  if (planIds.length === 0) return;
  await supabaseAdmin.from('care_plan_completions').delete().in('care_plan_id', planIds);
  await supabaseAdmin.from('plan_bids').delete().in('care_plan_id', planIds);
  await supabaseAdmin.from('care_plans').delete().in('id', planIds);
}

function printResults(testDurationSec, integrity) {
  const cArr = getLatencies(metrics.complete);
  const dArr = getLatencies(metrics.dispute);
  const cP95 = percentile(cArr, 95);
  const cP99 = percentile(cArr, 99);
  const dP95 = percentile(dArr, 95);
  const dP99 = percentile(dArr, 99);
  const total = metrics.complete.requests + metrics.dispute.requests;
  const errors = metrics.complete.errors + metrics.dispute.errors;
  const errRate = total > 0 ? (errors / total) * 100 : 0;

  console.log('\n====================================================');
  console.log('  Care Plan Lifecycle — RESULTS');
  console.log('====================================================');
  console.log(`  Duration:           ${testDurationSec.toFixed(1)}s`);
  console.log(`  /complete requests: ${metrics.complete.requests}, p95=${cP95}ms, p99=${cP99}ms`);
  console.log(`    statusCodes: ${JSON.stringify(metrics.complete.statusCodes)}`);
  console.log(`  /dispute requests:  ${metrics.dispute.requests}, p95=${dP95}ms, p99=${dP99}ms`);
  console.log(`    statusCodes: ${JSON.stringify(metrics.dispute.statusCodes)}`);
  console.log(`  5xx error rate:     ${errRate.toFixed(2)}%`);
  console.log(`  Plans inspected:    ${integrity.totalPlans}`);
  console.log(`  Completion rows:    ${integrity.totalCompletions}`);
  console.log(`  Inconsistent plans: ${integrity.inconsistent.length}`);
  if (integrity.inconsistent.length > 0) {
    for (const i of integrity.inconsistent.slice(0, 5)) {
      console.log(`    - ${i.planId}: ${i.reason}`);
    }
    if (integrity.inconsistent.length > 5) {
      console.log(`    ... and ${integrity.inconsistent.length - 5} more`);
    }
  }

  // Authentication / mutation-success accounting. 4xx (esp. 401/403/409)
  // is "expected" for races (only one of complete-vs-dispute can win), but
  // if EVERY request is 4xx then the test is vacuous — auth could have
  // collapsed and we'd still PASS the latency + 5xx criteria. So we
  // explicitly require:
  //   (a) at least N successful 2xx outcomes across the two endpoints, and
  //   (b) at least M plans reached a terminal payment_status (captured /
  //       disputed / refunded), proving rows actually mutated end-to-end.
  // These thresholds scale with the seeded plan count so a small/local run
  // still has meaningful gates without flaking on stochastic 409 splits.
  const cSuccess = Object.entries(metrics.complete.statusCodes)
    .filter(([code]) => Number(code) >= 200 && Number(code) < 300)
    .reduce((sum, [, n]) => sum + n, 0);
  const dSuccess = Object.entries(metrics.dispute.statusCodes)
    .filter(([code]) => Number(code) >= 200 && Number(code) < 300)
    .reduce((sum, [, n]) => sum + n, 0);
  const totalSuccess = cSuccess + dSuccess;
  // At least one mutation per seeded plan would be the ideal floor; we
  // settle for >= seeded plan count (each plan can only ever be terminally
  // mutated once before subsequent attempts return 4xx) so the threshold
  // can never silently skip.
  const MIN_TOTAL_SUCCESS = Math.max(5, integrity.totalPlans);
  // At least 50% of seeded plans should reach a terminal payment_status by
  // run end. Below that, either the endpoint regressed or auth is broken.
  const MIN_TERMINAL_FRACTION = 0.5;
  const terminalPaymentStates = new Set(['captured', 'disputed', 'refunded']);
  // We only have the integrity payload's `stuckCompletedPlans` and
  // `totalCompletions`; reuse `totalCompletions` as the terminal floor
  // (one row per plan that reached terminal state).
  const terminalReached = integrity.totalCompletions;
  const terminalFloor = Math.ceil(integrity.totalPlans * MIN_TERMINAL_FRACTION);

  console.log(`  Successful 2xx (complete+dispute): ${totalSuccess} (need ≥ ${MIN_TOTAL_SUCCESS})`);
  console.log(`  Plans reaching terminal state:     ${terminalReached}/${integrity.totalPlans} (need ≥ ${terminalFloor})`);

  console.log('\n  PASS/FAIL CRITERIA');
  console.log('  ' + '-'.repeat(60));
  const criteria = [
    { name: 'p95 (/complete) < 2000ms',           value: `${cP95}ms`,                       pass: cP95 < 2000 },
    { name: 'p95 (/dispute)  < 2000ms',           value: `${dP95}ms`,                       pass: dP95 < 2000 },
    { name: '5xx rate < 2%',                      value: `${errRate.toFixed(2)}%`,           pass: errRate < 2 },
    { name: 'No double-completion rows',          value: `${integrity.inconsistent.length} inconsistent`, pass: integrity.inconsistent.length === 0 },
    { name: 'No stuck completions (none/held)',   value: `${integrity.stuckCompletedPlans} stuck`,         pass: integrity.stuckCompletedPlans === 0 },
    { name: `≥ ${MIN_TOTAL_SUCCESS} successful 2xx mutations`,
      // Without this, a regression that returns 401/403/409 on every
      // request would silently PASS (low 5xx + zero inconsistent rows
      // because nothing mutated).
      value: `${totalSuccess} (complete=${cSuccess}, dispute=${dSuccess})`,
      pass: totalSuccess >= MIN_TOTAL_SUCCESS },
    { name: `≥ ${terminalFloor}/${integrity.totalPlans} plans reached terminal state`,
      // Proves the lifecycle actually ran end-to-end on real rows, not
      // just that we got 2xx responses (an endpoint could 200 without
      // persisting).
      value: `${terminalReached}/${integrity.totalPlans}`,
      pass: integrity.totalPlans > 0 && terminalReached >= terminalFloor },
    { name: 'No cross-actor 2xx (provider session on /complete or /dispute)',
      // Cross-actor regression bait: provider sessions hitting member-
      // scoped endpoints must always be rejected by the auth/ownership
      // gate. Any 2xx here is an authorization regression.
      value: `complete=${providerSuccesses.complete}, dispute=${providerSuccesses.dispute}`,
      pass: providerSuccesses.complete === 0 && providerSuccesses.dispute === 0 },
  ];
  for (const c of criteria) {
    console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name.padEnd(36)} ${c.value}`);
  }
  console.log('\n====================================================\n');
  return criteria;
}

async function main() {
  console.log('\n====================================================');
  console.log('  My Car Concierge — Care Plan Lifecycle Stress Test');
  console.log('====================================================');
  console.log(`  Target:        ${CONFIG.baseUrl}`);
  console.log(`  Concurrency:   ${CONFIG.concurrency}`);
  console.log(`  Duration:      ${CONFIG.duration}s`);
  console.log(`  Plans seeded:  ${CONFIG.planCount}`);
  console.log(`  Ramp-up:       ${CONFIG.rampUpTime}s`);
  console.log(`  Spike:         ${CONFIG.spikeMultiplier}x for ${CONFIG.spikeDuration}s`);
  console.log('====================================================\n');

  const cleanupPlanIds = [];
  let exitCode = 1;
  try {
    console.log('[Setup] Loading sim accounts...');
    const memberUsers = await loadSimMembers();
    const providerUsers = await loadSimProviders();
    console.log(`  Found ${memberUsers.length} sim members, ${providerUsers.length} sim providers`);
    if (providerUsers.length === 0) {
      console.error('  No sim providers — cannot seed accepted bids.');
      process.exit(1);
    }
    const memberSessions = [];
    for (const u of memberUsers) {
      const s = await getSession(u.email);
      if (s) memberSessions.push(s);
    }
    if (memberSessions.length === 0) {
      console.error('  Could not authenticate any sim members.');
      process.exit(1);
    }
    console.log(`  Authenticated ${memberSessions.length} sim member sessions`);

    console.log('[Setup] Authenticating sim provider sessions for cross-actor pressure...');
    const providerSessions = await loadProviderSessions();
    console.log(`  Authenticated ${providerSessions.length} sim provider sessions (cross-actor /complete + /dispute attempts will route through these)`);

    console.log(`[Setup] Seeding ${CONFIG.planCount} care plans with accepted bids...`);
    const plans = await seedPlans(memberSessions, providerUsers.map(u => u.id));
    console.log(`  Seeded ${plans.length} plans (target ${CONFIG.planCount})`);
    if (plans.length === 0) {
      console.error('  No plans seeded — schema may be missing required tables.');
      process.exit(1);
    }
    cleanupPlanIds.push(...plans.map(p => p.planId));

    const testStart = Date.now();
    console.log('\n[Phase 1/4] Ramp-up...');
    await runPhase('Ramp', Math.ceil(CONFIG.concurrency * 0.3), CONFIG.rampUpTime * 1000, plans, providerSessions);
    console.log('[Phase 2/4] Sustained...');
    await runPhase('Sustained', CONFIG.concurrency, CONFIG.duration * 1000, plans, providerSessions);
    console.log('[Phase 3/4] Spike...');
    await runPhase('Spike', CONFIG.concurrency * CONFIG.spikeMultiplier, CONFIG.spikeDuration * 1000, plans, providerSessions);
    console.log('[Phase 4/4] Cool-down...');
    await runPhase('Cool', CONFIG.coolDownConcurrency, CONFIG.coolDownDuration * 1000, plans, providerSessions);
    const dur = (Date.now() - testStart) / 1000;

    await new Promise(r => setTimeout(r, 1500));

    console.log('\n[Integrity] Checking plan + completion state...');
    const integrity = await checkIntegrity(cleanupPlanIds);
    const criteria = printResults(dur, integrity);
    exitCode = criteria.every(c => c.pass) ? 0 : 1;
  } catch (err) {
    console.error('\n[FATAL]', err.message, err.stack);
  } finally {
    console.log('[Cleanup] Removing seeded plans...');
    await cleanup(cleanupPlanIds);
    process.exit(exitCode);
  }
}

main().catch(err => { console.error('Unhandled:', err); process.exit(1); });

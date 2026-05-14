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

const CONFIG = {
  concurrency:        param('concurrency', 30),
  duration:           param('duration', 60),
  rampUpTime:         param('ramp-up', 15),
  spikeMultiplier:    2,
  spikeDuration:      10,
  coolDownDuration:   10,
  coolDownConcurrency: 5,
  providerCount:      param('providers', 5),
};

const SIM_DOMAIN = '@mcc-sim.test';
const SIM_PASSWORD = 'SimPass123!';
const RESERVOIR_SIZE = 50000;
const STRESS_MARKER = 'stress_rating_';

const REVIEW_COMMENTS = [
  'Great service, very professional!',
  'Got the job done quickly and at a fair price.',
  'Excellent work, highly recommend.',
  'Very knowledgeable and friendly staff.',
  'Good communication throughout the process.',
  'Fair pricing and quality work.',
  'Would definitely use again.',
  'Solid work, no complaints.',
  'Very thorough and honest assessment.',
  'Quick turnaround, quality parts used.',
];

function createMetric(name) {
  return { name, requests: 0, errors: 0, rateLimited: 0, timeouts: 0, constraintErrors: 0, latencies: new Float32Array(RESERVOIR_SIZE), latencyCount: 0, statusCodes: {} };
}

const metrics = {
  insertReview:      createMetric('INSERT review'),
  suspensionCheck:   createMetric('RPC suspension check'),
};

let workerUnhandledErrors = 0;
const usedPackageIds = new Set();

function addLatency(metric, latency) {
  if (metric.latencyCount < RESERVOIR_SIZE) {
    metric.latencies[metric.latencyCount] = latency;
  } else {
    const j = Math.floor(Math.random() * (metric.latencyCount + 1));
    if (j < RESERVOIR_SIZE) metric.latencies[j] = latency;
  }
  metric.latencyCount++;
}

function recordMetric(metric, latency, success) {
  metric.requests++;
  addLatency(metric, latency);
  const status = success ? 200 : 500;
  metric.statusCodes[status] = (metric.statusCodes[status] || 0) + 1;
  if (!success) metric.errors++;
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

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

const insertedReviewIds = [];

async function loadSimData(cleanupState) {
  console.log('  Loading simulation data...');

  const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const simUsers = (allUsers?.users || []).filter(u => u.email && u.email.endsWith(SIM_DOMAIN));

  const memberUsers = simUsers.filter(u => u.email.startsWith('sim-member-')).slice(0, 50);
  const providerUsers = simUsers.filter(u => u.email.startsWith('sim-provider-')).slice(0, CONFIG.providerCount);

  if (memberUsers.length === 0) throw new Error('No simulation member accounts found. Run simulate-platform.js first.');
  if (providerUsers.length === 0) throw new Error('No simulation provider accounts found. Run simulate-platform.js first.');

  const memberIds = memberUsers.map(u => u.id);
  const providerIds = providerUsers.map(u => u.id);

  console.log(`  Found ${memberUsers.length} members, ${providerUsers.length} providers`);

  const { data: existingStats } = await supabaseAdmin
    .from('provider_stats')
    .select('*')
    .in('provider_id', providerIds);

  const statsBaseline = {};
  for (const s of (existingStats || [])) {
    statsBaseline[s.provider_id] = { ...s };
  }

  cleanupState.providerIds = providerIds;
  cleanupState.statsBaseline = statsBaseline;

  const { data: completedPkgs } = await supabaseAdmin
    .from('maintenance_packages')
    .select('id, member_id')
    .in('member_id', memberIds)
    .eq('status', 'completed')
    .limit(500);

  let availablePackages = completedPkgs || [];
  console.log(`  Found ${availablePackages.length} completed packages for review seeding`);

  {
    console.log('  Seeding completed packages for stress test...');
    const seededPkgs = [];
    const totalNeeded = CONFIG.concurrency * CONFIG.duration * 2;
    const neededPerMember = Math.ceil(totalNeeded / memberIds.length);
    for (let i = 0; i < neededPerMember; i++) {
      for (const memberId of memberIds) {
        seededPkgs.push({
          member_id: memberId,
          title: `${STRESS_MARKER}Service ${i}`,
          service_type: 'Oil Change',
          status: 'completed',
        });
      }
    }

    const insertBatchSize = 100;
    const allSeededIds = [];
    for (let i = 0; i < seededPkgs.length; i += insertBatchSize) {
      const batch = seededPkgs.slice(i, i + insertBatchSize);
      const { data: inserted, error } = await supabaseAdmin
        .from('maintenance_packages')
        .insert(batch)
        .select('id, member_id');
      if (error) {
        console.log(`  [WARN] Package seed batch failed: ${error.message}`);
      } else if (inserted) {
        allSeededIds.push(...inserted);
      }
    }
    cleanupState.seededPackageIds = allSeededIds.map(p => p.id);
    availablePackages = [...availablePackages, ...allSeededIds];
    console.log(`  Seeded ${allSeededIds.length} additional packages`);
  }

  const packagesByMember = {};
  for (const pkg of availablePackages) {
    if (!packagesByMember[pkg.member_id]) packagesByMember[pkg.member_id] = [];
    packagesByMember[pkg.member_id].push(pkg.id);
  }

  for (const providerId of providerIds) {
    await supabaseAdmin
      .from('provider_stats')
      .upsert({ provider_id: providerId, suspended: false }, { onConflict: 'provider_id' });
  }

  return { memberIds, providerIds, packagesByMember };
}

async function insertReviewAndCheck(memberId, providerId, packageId) {
  const key = `${memberId}:${packageId}`;
  if (usedPackageIds.has(key)) {
    return 'skip';
  }
  usedPackageIds.add(key);

  const rating = rand(1, 5);
  const reviewData = {
    provider_id: providerId,
    member_id: memberId,
    package_id: packageId,
    rating: rating,
    overall_rating: rating,
    review_text: pick(REVIEW_COMMENTS),
    status: 'published',
  };

  const insertStart = Date.now();
  const { data: review, error: insertError } = await supabaseAdmin
    .from('provider_reviews')
    .insert(reviewData)
    .select('id')
    .single();
  const insertLatency = Date.now() - insertStart;

  if (insertError) {
    const msg = insertError.message || '';
    if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('violates unique')) {
      metrics.insertReview.constraintErrors++;
      metrics.insertReview.requests++;
      addLatency(metrics.insertReview, insertLatency);
      return 'constraint';
    }
    if (msg.includes('notifications')) {
      metrics.insertReview.requests++;
      addLatency(metrics.insertReview, insertLatency);
      metrics.insertReview.statusCodes['trigger_err'] = (metrics.insertReview.statusCodes['trigger_err'] || 0) + 1;
      return 'trigger_error';
    }
    recordMetric(metrics.insertReview, insertLatency, false);
    if (!metrics.insertReview._sampleErrors) metrics.insertReview._sampleErrors = [];
    if (metrics.insertReview._sampleErrors.length < 5) {
      metrics.insertReview._sampleErrors.push(msg || insertError.code || 'unknown');
    }
    return 'error';
  }

  insertedReviewIds.push(review.id);

  const rpcStart = Date.now();
  const { error: rpcError } = await supabaseAdmin.rpc('check_provider_suspension', {
    p_provider_id: providerId
  });
  const rpcLatency = Date.now() - rpcStart;
  recordMetric(metrics.suspensionCheck, rpcLatency, !rpcError);

  return 'ok';
}

async function runWorker(data, stopSignal) {
  const { memberIds, providerIds, packagesByMember } = data;

  while (!stopSignal.stop) {
    const providerId = pick(providerIds);
    const memberId = pick(memberIds);
    const memberPkgs = packagesByMember[memberId];
    if (!memberPkgs || memberPkgs.length === 0) continue;
    const packageId = pick(memberPkgs);

    try {
      await insertReviewAndCheck(memberId, providerId, packageId);
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

async function checkRatingIntegrity(providerIds, statsBaseline) {
  console.log('\n  RATING INTEGRITY CHECK');
  console.log('  ------------------------------------------------------------');

  let integrityPass = true;
  let totalDeviations = 0;
  const violations = [];

  const stressReviewRatings = {};
  const batchSize = 100;
  for (let i = 0; i < insertedReviewIds.length; i += batchSize) {
    const batch = insertedReviewIds.slice(i, i + batchSize);
    const { data: rows } = await supabaseAdmin
      .from('provider_reviews')
      .select('id, provider_id, rating, overall_rating')
      .in('id', batch);
    for (const r of (rows || [])) {
      if (!stressReviewRatings[r.provider_id]) stressReviewRatings[r.provider_id] = [];
      stressReviewRatings[r.provider_id].push(r.overall_rating || r.rating || 0);
    }
  }

  for (const providerId of providerIds) {
    const stressRatings = stressReviewRatings[providerId] || [];
    const baseline = statsBaseline[providerId] || {};
    const baselineAvg = baseline.average_rating != null ? Number(baseline.average_rating) : 0;
    const baselineCount = baseline.total_reviews || 0;

    if (stressRatings.length === 0) {
      console.log(`  Provider ${providerId.slice(0, 8)}... | no stress reviews inserted — skipping`);
      continue;
    }

    const stressSum = stressRatings.reduce((a, b) => a + b, 0);
    const expectedTotal = baselineCount + stressRatings.length;
    const expectedAvg = (baselineAvg * baselineCount + stressSum) / expectedTotal;

    const { data: stats } = await supabaseAdmin
      .from('provider_stats')
      .select('average_rating, total_reviews')
      .eq('provider_id', providerId)
      .maybeSingle();

    const storedAvg = stats?.average_rating != null ? Number(stats.average_rating) : 0;
    const storedCount = stats?.total_reviews || 0;
    const deviation = Math.abs(storedAvg - expectedAvg);

    console.log(`  Provider ${providerId.slice(0, 8)}... | baseline_avg=${baselineAvg.toFixed(3)} baseline_count=${baselineCount} stress_count=${stressRatings.length} expected_avg=${expectedAvg.toFixed(3)} stored_avg=${storedAvg.toFixed(3)} stored_count=${storedCount} deviation=${deviation.toFixed(3)}`);

    if (deviation > 0.05) {
      integrityPass = false;
      totalDeviations++;
      violations.push({
        providerId,
        baselineCount,
        stressCount: stressRatings.length,
        expectedAvg: expectedAvg.toFixed(3),
        storedAvg: storedAvg.toFixed(3),
        deviation: deviation.toFixed(3),
      });
    }
  }

  if (integrityPass) {
    console.log(`  [PASS] All provider ratings within ±0.05 tolerance`);
  } else {
    console.log(`  [FAIL] RATING DRIFT detected: ${totalDeviations} provider(s) have incorrect average_rating`);
    for (const v of violations.slice(0, 5)) {
      console.log(`         Provider ${v.providerId.slice(0, 8)}...: baseline=${v.baselineCount} stress=${v.stressCount} expected=${v.expectedAvg} stored=${v.storedAvg} deviation=${v.deviation}`);
    }
  }

  return { pass: integrityPass, totalDeviations, violations };
}

function printResults(testDurationSec, integrityResult) {
  console.log('\n====================================================');
  console.log('  PROVIDER RATING CONCURRENCY STRESS TEST RESULTS');
  console.log('====================================================\n');

  const allMetrics = [metrics.insertReview, metrics.suspensionCheck];
  let totalRequests = 0;
  let totalErrors = 0;
  const allLatencies = [];

  for (const m of allMetrics) {
    totalRequests += m.requests;
    totalErrors += m.errors;
    allLatencies.push(...getLatencies(m));
  }

  const overallRps = testDurationSec > 0 ? (totalRequests / testDurationSec).toFixed(1) : 0;

  const constraintErrors = metrics.insertReview.constraintErrors;
  const triggerErrors = metrics.insertReview.statusCodes['trigger_err'] || 0;
  const allErrors = totalErrors + triggerErrors;

  console.log('  OVERALL');
  console.log(`  Total requests:    ${totalRequests}`);
  console.log(`  Test duration:     ${testDurationSec.toFixed(1)}s`);
  console.log(`  Avg RPS:           ${overallRps} req/s`);
  console.log(`  Total errors:      ${allErrors} (${totalRequests > 0 ? ((allErrors / totalRequests) * 100).toFixed(2) : 0}%)`);
  console.log(`    API errors:      ${totalErrors}`);
  console.log(`    Trigger errors:  ${triggerErrors} (notifications trigger bug — review insert rolled back)`);
  console.log(`  Constraint dupes:  ${constraintErrors} (expected — unique violation)`);
  if (workerUnhandledErrors > 0) {
    console.log(`  Unhandled errors:  ${workerUnhandledErrors}`);
  }

  console.log('\n  PER-OPERATION BREAKDOWN');
  console.log('  ' + '-'.repeat(60));
  for (const m of allMetrics) {
    const lats = getLatencies(m);
    const p50 = percentile(lats, 50);
    const p95 = percentile(lats, 95);
    const p99 = percentile(lats, 99);
    const codes = Object.entries(m.statusCodes).map(([k, v]) => `${k}:${v}`).join(' ');
    console.log(`  ${m.name.padEnd(25)} reqs=${m.requests} errs=${m.errors} p50=${p50}ms p95=${p95}ms p99=${p99}ms [${codes}]`);
    if (m._sampleErrors && m._sampleErrors.length > 0) {
      for (const e of m._sampleErrors) {
        console.log(`    error sample: ${e.slice(0, 120)}`);
      }
    }
  }

  const combinedP95 = percentile(allLatencies, 95);
  const errorRate = totalRequests > 0 ? (allErrors / totalRequests) * 100 : 0;

  console.log('\n  PASS/FAIL CRITERIA');
  console.log('  ------------------------------------------------------------');

  const criteria = [
    { name: 'p95 < 2000ms',              value: `${combinedP95}ms`,           pass: combinedP95 < 2000 },
    { name: 'Error rate < 1%',           value: `${errorRate.toFixed(2)}%`,   pass: errorRate < 1 },
    { name: 'Rating integrity (±0.05)',  value: `${integrityResult.totalDeviations} drifted`, pass: integrityResult.pass },
  ];

  for (const c of criteria) {
    const tag = c.pass ? 'PASS' : 'FAIL';
    console.log(`  [${tag}] ${c.name.padEnd(30)} ${c.value}`);
  }

  console.log(`\n  Reviews inserted during test: ${insertedReviewIds.length}`);
  console.log(`  Providers tested:            ${CONFIG.providerCount}`);

  console.log('\n====================================================\n');
}

async function cleanup(cleanupState) {
  console.log('\n[Teardown] Cleaning up stress test data...');

  if (insertedReviewIds.length > 0) {
    const batchSize = 100;
    let deleted = 0;
    for (let i = 0; i < insertedReviewIds.length; i += batchSize) {
      const batch = insertedReviewIds.slice(i, i + batchSize);
      const { error } = await supabaseAdmin
        .from('provider_reviews')
        .delete()
        .in('id', batch);
      if (!error) deleted += batch.length;
    }
    console.log(`  Deleted ${deleted}/${insertedReviewIds.length} stress test reviews`);
  }

  if (cleanupState.seededPackageIds && cleanupState.seededPackageIds.length > 0) {
    const batchSize = 100;
    let deleted = 0;
    for (let i = 0; i < cleanupState.seededPackageIds.length; i += batchSize) {
      const batch = cleanupState.seededPackageIds.slice(i, i + batchSize);
      await supabaseAdmin.from('provider_reviews').delete().in('package_id', batch);
      const { error } = await supabaseAdmin
        .from('maintenance_packages')
        .delete()
        .in('id', batch);
      if (!error) deleted += batch.length;
    }
    console.log(`  Deleted ${deleted} seeded packages`);
  }

  if (cleanupState.providerIds && cleanupState.statsBaseline) {
    for (const providerId of cleanupState.providerIds) {
      const baseline = cleanupState.statsBaseline[providerId];
      if (baseline) {
        const { id, provider_id, created_at, ...restoreFields } = baseline;
        await supabaseAdmin
          .from('provider_stats')
          .update(restoreFields)
          .eq('provider_id', providerId);
      } else {
        await supabaseAdmin
          .from('provider_stats')
          .delete()
          .eq('provider_id', providerId);
      }
    }
    console.log(`  Restored provider_stats for ${cleanupState.providerIds.length} providers`);
  }

  console.log('  Cleanup complete');
}

async function main() {
  const cleanupState = {
    providerIds: [],
    statsBaseline: {},
    seededPackageIds: [],
  };

  let exitCode = 1;

  try {
    console.log('\n====================================================');
    console.log('  My Car Concierge — Provider Rating Concurrency Stress Test');
    console.log('====================================================');
    console.log(`  Concurrency: ${CONFIG.concurrency} | Duration: ${CONFIG.duration}s | Ramp-up: ${CONFIG.rampUpTime}s`);
    console.log(`  Providers: ${CONFIG.providerCount}`);
    console.log('====================================================\n');

    console.log('[Setup] Loading simulation data...');
    const data = await loadSimData(cleanupState);
    console.log('  Setup complete.\n');

    const testStart = Date.now();

    console.log('[Phase 1/4] Ramp-up...');
    await runPhase('Ramp-up', CONFIG.concurrency, CONFIG.rampUpTime * 1000, data);

    console.log('[Phase 2/4] Sustained load...');
    const sustainedDuration = Math.max(10, CONFIG.duration - CONFIG.rampUpTime - CONFIG.spikeDuration - CONFIG.coolDownDuration);
    await runPhase('Sustained', CONFIG.concurrency, sustainedDuration * 1000, data);

    console.log('[Phase 3/4] Spike...');
    await runPhase('Spike', CONFIG.concurrency * CONFIG.spikeMultiplier, CONFIG.spikeDuration * 1000, data);

    console.log('[Phase 4/4] Cool-down...');
    await runPhase('Cool-down', CONFIG.coolDownConcurrency, CONFIG.coolDownDuration * 1000, data);

    const testDurationSec = (Date.now() - testStart) / 1000;

    await new Promise(r => setTimeout(r, 2000));

    const integrityResult = await checkRatingIntegrity(data.providerIds, cleanupState.statsBaseline);
    printResults(testDurationSec, integrityResult);

    exitCode = integrityResult.pass ? 0 : 1;

  } catch (err) {
    console.error('\n[FATAL]', err.message);
    console.error(err.stack);
  } finally {
    await cleanup(cleanupState);
    process.exit(exitCode);
  }
}

main();

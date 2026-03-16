const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ifbyjxuaclwmadqbjcyp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}
if (!STRIPE_WEBHOOK_SECRET) {
  console.error('STRIPE_WEBHOOK_SECRET environment variable is required');
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
  concurrency:        param('concurrency', 20),
  duration:           param('duration', 30),
  rampUpTime:         param('ramp-up', 10),
  spikeMultiplier:    2,
  spikeDuration:      10,
  coolDownDuration:   10,
  coolDownConcurrency: 5,
  requestTimeout:     5000,
  duplicatesPerEvent: param('duplicates', 5),
  providerCount:      param('providers', 5),
  bidsPerEvent:       param('bids', 10),
  bonusBidsPerEvent:  param('bonus-bids', 5),
  baseUrl:            strParam('base-url', process.env.STRESS_TEST_BASE_URL || 'http://localhost:5000'),
};

const BASE_URL = CONFIG.baseUrl;
const SIM_DOMAIN = '@mcc-sim.test';
const RESERVOIR_SIZE = 50000;
const EVENT_MARKER = 'stress_wh_';

function createMetric(name) {
  return { name, requests: 0, errors: 0, rateLimited: 0, timeouts: 0, latencies: new Float32Array(RESERVOIR_SIZE), latencyCount: 0, statusCodes: {} };
}

const metrics = {
  webhook: createMetric('POST webhook'),
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

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function generatePaymentIntentId() {
  const hex = crypto.randomBytes(12).toString('hex');
  return `${EVENT_MARKER}pi_${hex}`;
}

function generateSessionId() {
  const hex = crypto.randomBytes(12).toString('hex');
  return `${EVENT_MARKER}cs_${hex}`;
}

function buildCheckoutEvent(providerId, paymentIntentId, sessionId, bids, bonusBids) {
  const amountCents = (bids + bonusBids) * 500;

  return {
    id: `evt_${crypto.randomBytes(16).toString('hex')}`,
    object: 'event',
    api_version: '2023-10-16',
    created: Math.floor(Date.now() / 1000),
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        payment_intent: paymentIntentId,
        payment_status: 'paid',
        amount_total: amountCents,
        currency: 'usd',
        mode: 'payment',
        status: 'complete',
        metadata: {
          provider_id: providerId,
          pack_id: 'stress_test_pack',
          bids: String(bids),
          bonus_bids: String(bonusBids),
        },
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: { id: `req_${crypto.randomBytes(8).toString('hex')}`, idempotency_key: null },
  };
}

function signPayload(payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payloadStr = JSON.stringify(payload);
  const signedPayload = `${timestamp}.${payloadStr}`;

  const hmac = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(signedPayload).digest('hex');

  return {
    body: payloadStr,
    signature: `t=${timestamp},v1=${hmac}`,
  };
}

async function timedWebhookFetch(body, signature) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.requestTimeout);
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/webhook/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': signature,
      },
      body,
      signal: controller.signal,
    });
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

async function loadSimData(cleanupState) {
  console.log('  Loading simulation data...');

  const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const simUsers = (allUsers?.users || []).filter(u => u.email && u.email.endsWith(SIM_DOMAIN));
  const providerEmails = simUsers.filter(u => u.email.startsWith('sim-provider-')).map(u => u.email).slice(0, CONFIG.providerCount);

  if (providerEmails.length === 0) {
    throw new Error('No simulation provider accounts found. Run simulate-platform.js first.');
  }

  console.log(`  Found ${providerEmails.length} provider accounts`);

  const providerIds = simUsers
    .filter(u => providerEmails.includes(u.email))
    .map(u => u.id);

  const { data: creditsBefore } = await supabaseAdmin
    .from('profiles')
    .select('id, bid_credits')
    .in('id', providerIds);

  const creditsBaseline = {};
  for (const p of (creditsBefore || [])) {
    creditsBaseline[p.id] = p.bid_credits || 0;
  }

  cleanupState.providerIds = providerIds;
  cleanupState.creditsBaseline = creditsBaseline;

  console.log(`  Provider baselines: ${providerIds.map(id => `${id.slice(0, 8)}=${creditsBaseline[id]}`).join(', ')}`);

  return { providerIds, creditsBaseline };
}

function buildEventBatch(providerIds) {
  const events = [];
  for (const providerId of providerIds) {
    const paymentIntentId = generatePaymentIntentId();
    const sessionId = generateSessionId();
    const eventPayload = buildCheckoutEvent(
      providerId,
      paymentIntentId,
      sessionId,
      CONFIG.bidsPerEvent,
      CONFIG.bonusBidsPerEvent,
    );
    events.push({
      providerId,
      paymentIntentId,
      sessionId,
      payload: eventPayload,
      expectedDelta: CONFIG.bidsPerEvent + CONFIG.bonusBidsPerEvent,
    });
  }
  return events;
}

async function fireWebhook(body, signature) {
  const result = await timedWebhookFetch(body, signature);

  if (result.timeout) {
    metrics.webhook.timeouts++;
    metrics.webhook.requests++;
    addLatency(metrics.webhook, result.latency);
    return;
  }

  recordMetric(metrics.webhook, result.latency, result.status);
}

async function runWorker(events, stopSignal) {
  while (!stopSignal.stop) {
    const event = pick(events);
    const signed = signPayload(event.payload);
    const dupes = CONFIG.duplicatesPerEvent;

    const promises = [];
    for (let i = 0; i < dupes; i++) {
      promises.push(fireWebhook(signed.body, signed.signature));
    }
    await Promise.all(promises);

    await new Promise(r => setTimeout(r, 10));
  }
}

async function runPhase(name, concurrency, durationMs, events) {
  const startTime = Date.now();
  const stopSignal = { stop: false };

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(runWorker(events, stopSignal));
  }

  const interval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const total = metrics.webhook.requests;
    process.stdout.write(`  [${name}] ${elapsed}s elapsed | ${total} total requests | ${concurrency} workers\r`);
  }, 1000);

  await new Promise(resolve => setTimeout(resolve, durationMs));
  stopSignal.stop = true;
  await Promise.allSettled(workers);
  clearInterval(interval);

  console.log(`  [${name}] Complete — ${metrics.webhook.requests} total requests                                    `);
}

async function checkCreditIntegrity(providerIds, creditsBaseline, events) {
  console.log('\n  CREDIT INTEGRITY CHECK');
  console.log('  ------------------------------------------------------------');

  const { data: creditsAfter } = await supabaseAdmin
    .from('profiles')
    .select('id, bid_credits')
    .in('id', providerIds);

  const creditsAfterMap = {};
  for (const p of (creditsAfter || [])) {
    creditsAfterMap[p.id] = p.bid_credits || 0;
  }

  const expectedDeltaPerProvider = {};
  for (const ev of events) {
    expectedDeltaPerProvider[ev.providerId] = (expectedDeltaPerProvider[ev.providerId] || 0) + ev.expectedDelta;
  }

  let doubleCredited = 0;
  let correctlyCredited = 0;
  let underCredited = 0;
  let notCredited = 0;
  const violations = [];

  for (const providerId of providerIds) {
    const before = creditsBaseline[providerId] || 0;
    const after = creditsAfterMap[providerId] || 0;
    const actualDelta = after - before;
    const expectedOnce = expectedDeltaPerProvider[providerId] || 0;

    if (actualDelta === expectedOnce) {
      correctlyCredited++;
    } else if (actualDelta === 0 && expectedOnce > 0) {
      notCredited++;
    } else if (actualDelta > expectedOnce) {
      doubleCredited++;
      violations.push({
        providerId,
        before,
        after,
        actualDelta,
        expectedOnce,
        multiplier: expectedOnce > 0 ? (actualDelta / expectedOnce).toFixed(2) : 'N/A',
      });
    } else if (actualDelta > 0 && actualDelta < expectedOnce) {
      underCredited++;
    } else {
      correctlyCredited++;
    }
  }

  console.log(`  Providers tested:     ${providerIds.length}`);
  console.log(`  Correctly credited:   ${correctlyCredited}`);
  console.log(`  Under-credited:       ${underCredited}`);
  console.log(`  Not credited:         ${notCredited}`);
  console.log(`  Double-credited:      ${doubleCredited}`);

  if (doubleCredited === 0) {
    console.log(`  [PASS] No double-credit detected`);
    if (notCredited > 0) {
      console.log(`  [INFO] ${notCredited} provider(s) received no credits (webhook may have been rate-limited)`);
    }
    if (underCredited > 0) {
      console.log(`  [INFO] ${underCredited} provider(s) received fewer credits than expected (partial delivery)`);
    }
  } else {
    console.log(`  [FAIL] DOUBLE-CREDIT detected: ${doubleCredited} provider(s) received excess bid credits`);
    for (const v of violations.slice(0, 5)) {
      console.log(`         Provider ${v.providerId.slice(0, 8)}...: before=${v.before} after=${v.after} delta=${v.actualDelta} expected=${v.expectedOnce} (${v.multiplier}x)`);
    }
  }

  return { pass: doubleCredited === 0, doubleCredited, correctlyCredited, underCredited, notCredited };
}

function printResults(testDurationSec, integrityResult) {
  console.log('\n====================================================');
  console.log('  STRIPE WEBHOOK IDEMPOTENCY STRESS TEST RESULTS');
  console.log('====================================================\n');

  const m = metrics.webhook;
  const totalRequests    = m.requests;
  const totalErrors      = m.errors;
  const totalRateLimited = m.rateLimited;
  const totalTimeouts    = m.timeouts;
  const allLatencies     = getLatencies(m);
  const overallRps       = testDurationSec > 0 ? (totalRequests / testDurationSec).toFixed(1) : 0;

  console.log('  OVERALL');
  console.log(`  Total requests:    ${totalRequests}`);
  console.log(`  Test duration:     ${testDurationSec.toFixed(1)}s`);
  console.log(`  Avg RPS:           ${overallRps} req/s`);
  console.log(`  Real errors:       ${totalErrors} (${totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : 0}%)`);
  console.log(`  Rate limited:      ${totalRateLimited} (${totalRequests > 0 ? ((totalRateLimited / totalRequests) * 100).toFixed(2) : 0}%) — expected under load`);
  console.log(`  Timeouts:          ${totalTimeouts} (${totalRequests > 0 ? ((totalTimeouts / totalRequests) * 100).toFixed(2) : 0}%)`);
  if (workerUnhandledErrors > 0) {
    console.log(`  Unhandled errors:  ${workerUnhandledErrors}`);
  }
  console.log(`  p50:               ${percentile(allLatencies, 50)}ms`);
  console.log(`  p95:               ${percentile(allLatencies, 95)}ms`);
  console.log(`  p99:               ${percentile(allLatencies, 99)}ms`);

  const codes = Object.entries(m.statusCodes).map(([k, v]) => `${k}:${v}`).join(' ');
  console.log(`  Status codes:      ${codes}`);

  console.log(`\n  Flows under test:`);
  console.log(`    • POST /webhook/stripe — concurrent duplicate checkout.session.completed events`);
  console.log(`    • Each event delivered ${CONFIG.duplicatesPerEvent}x concurrently per worker cycle`);
  console.log(`    • Bids per event: ${CONFIG.bidsPerEvent} + ${CONFIG.bonusBidsPerEvent} bonus = ${CONFIG.bidsPerEvent + CONFIG.bonusBidsPerEvent} credits`);

  const p95 = percentile(allLatencies, 95);
  const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

  console.log('\n  PASS/FAIL CRITERIA');
  console.log('  ------------------------------------------------------------');

  const criteria = [
    { name: 'p95 < 1000ms',              value: `${p95}ms`,                      pass: p95 < 1000 },
    { name: 'Error rate < 1% (excl 429)', value: `${errorRate.toFixed(2)}%`,      pass: errorRate < 1 },
    { name: 'No double-credit',           value: `${integrityResult.doubleCredited} providers over-credited`, pass: integrityResult.pass },
  ];

  for (const c of criteria) {
    const tag = c.pass ? 'PASS' : 'FAIL';
    console.log(`  [${tag}] ${c.name.padEnd(30)} ${c.value}`);
  }

  console.log('\n====================================================\n');
}

async function cleanup(cleanupState) {
  console.log('\n[Teardown] Restoring provider bid credits...');

  if (cleanupState.providerIds && cleanupState.creditsBaseline) {
    for (const providerId of cleanupState.providerIds) {
      const originalCredits = cleanupState.creditsBaseline[providerId];
      if (originalCredits !== undefined) {
        await supabaseAdmin
          .from('profiles')
          .update({ bid_credits: originalCredits })
          .eq('id', providerId);
      }
    }
    console.log(`  Restored bid_credits for ${cleanupState.providerIds.length} providers`);
  }

  if (cleanupState.providerIds) {
    const { data: commissions } = await supabaseAdmin
      .from('founder_commissions')
      .select('id')
      .ilike('transaction_id', `${EVENT_MARKER}%`);

    if (commissions && commissions.length > 0) {
      await supabaseAdmin
        .from('founder_commissions')
        .delete()
        .in('id', commissions.map(c => c.id));
      console.log(`  Deleted ${commissions.length} stress test commission records`);
    }
  }

  console.log('  Cleanup complete');
}

async function main() {
  const cleanupState = {
    providerIds: [],
    creditsBaseline: {},
  };

  let events;
  let exitCode = 1;

  try {
    console.log('\n====================================================');
    console.log('  My Car Concierge — Stripe Webhook Idempotency Stress Test');
    console.log('====================================================');
    console.log(`  Concurrency: ${CONFIG.concurrency} | Duration: ${CONFIG.duration}s | Ramp-up: ${CONFIG.rampUpTime}s`);
    console.log(`  Duplicates per event: ${CONFIG.duplicatesPerEvent}`);
    console.log(`  Providers: ${CONFIG.providerCount}`);
    console.log(`  Bids per event: ${CONFIG.bidsPerEvent} + ${CONFIG.bonusBidsPerEvent} bonus`);
    console.log(`  Base URL: ${BASE_URL}`);
    console.log('====================================================\n');

    console.log('[Setup] Loading simulation data...');
    const data = await loadSimData(cleanupState);

    events = buildEventBatch(data.providerIds);
    console.log(`  Built ${events.length} unique webhook events (1 per provider)`);
    console.log('  Setup complete.\n');

    const testStart = Date.now();

    console.log('[Phase 1/4] Ramp-up...');
    await runPhase('Ramp-up', CONFIG.concurrency, CONFIG.rampUpTime * 1000, events);

    console.log('[Phase 2/4] Sustained load...');
    const sustainedDuration = Math.max(10, CONFIG.duration - CONFIG.rampUpTime - CONFIG.spikeDuration - CONFIG.coolDownDuration);
    await runPhase('Sustained', CONFIG.concurrency, sustainedDuration * 1000, events);

    console.log('[Phase 3/4] Spike...');
    await runPhase('Spike', CONFIG.concurrency * CONFIG.spikeMultiplier, CONFIG.spikeDuration * 1000, events);

    console.log('[Phase 4/4] Cool-down...');
    await runPhase('Cool-down', CONFIG.coolDownConcurrency, CONFIG.coolDownDuration * 1000, events);

    const testDurationSec = (Date.now() - testStart) / 1000;

    await new Promise(r => setTimeout(r, 2000));

    const integrityResult = await checkCreditIntegrity(data.providerIds, data.creditsBaseline, events);

    printResults(testDurationSec, integrityResult);

    exitCode = integrityResult.pass ? 0 : 1;
  } catch (err) {
    console.error('\n[FATAL]', err.message);
    exitCode = 1;
  } finally {
    await cleanup(cleanupState);
    process.exit(exitCode);
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});

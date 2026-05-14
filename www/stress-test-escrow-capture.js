const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ifbyjxuaclwmadqbjcyp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}
if (!STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY environment variable is required');
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
  burstConcurrency:   param('burst-concurrency', 5),
  packageCount:       param('packages', 10),
  requestTimeout:     15000,
  baseUrl:            strParam('base-url', process.env.STRESS_TEST_BASE_URL || 'http://localhost:5000'),
};

const BASE_URL = CONFIG.baseUrl;
const SIM_DOMAIN = '@mcc-sim.test';
const SIM_PASSWORD = 'SimPass123!';
const RESERVOIR_SIZE = 50000;
const TEST_MARKER = 'stress_escrow_cap_';

function createMetric(name) {
  return { name, requests: 0, errors: 0, rateLimited: 0, timeouts: 0, schemaErrors: 0, latencies: new Float32Array(RESERVOIR_SIZE), latencyCount: 0, statusCodes: {} };
}

const metrics = {
  release: createMetric('POST /api/escrow/release (member)'),
  refund:  createMetric('POST /api/escrow/refund (provider)'),
};

let workerUnhandledErrors = 0;
let schemaColumnsPresent = true;

const allCreatedPaymentIntentIds = [];

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
  if (status === 429) {
    metric.rateLimited++;
  } else if (!schemaColumnsPresent && (status >= 400 || status === 0)) {
    metric.schemaErrors++;
  } else if (status === 400 || status === 409) {
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

const raceTracker = {};

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

async function checkSchemaColumns() {
  const { error } = await supabaseAdmin
    .from('maintenance_packages')
    .select('id, escrow_payment_intent_id, escrow_amount, escrow_captured')
    .limit(1);
  return !(error && error.message && error.message.includes('does not exist'));
}

async function createStripePI(label) {
  const piRes = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(STRIPE_SECRET_KEY + ':').toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'amount': '5000',
      'currency': 'usd',
      'capture_method': 'manual',
      'confirm': 'true',
      'payment_method': 'pm_card_visa',
      'metadata[stress_test]': label,
      'metadata[type]': 'escrow_capture_stress_test',
    }).toString(),
  });
  const pi = await piRes.json();
  if (pi.id) allCreatedPaymentIntentIds.push(pi.id);
  return pi;
}

async function loadSimData(cleanupState) {
  console.log('  Loading simulation data...');

  schemaColumnsPresent = await checkSchemaColumns();
  if (!schemaColumnsPresent) {
    console.log('  [WARN] Schema gap: maintenance_packages missing escrow columns');
    console.log('         (escrow_payment_intent_id, escrow_amount, escrow_captured)');
    console.log('         Escrow endpoints will return errors — tracked as schema-gap errors.');
    console.log('         This is a critical infrastructure finding for escrow functionality.');
  } else {
    console.log('  Schema check passed: escrow columns present.');
  }

  const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const simUsers = (allUsers?.users || []).filter(u => u.email && u.email.endsWith(SIM_DOMAIN));
  const memberEmails = simUsers.filter(u => u.email.startsWith('sim-member-')).map(u => u.email).slice(0, 5);
  const providerEmails = simUsers.filter(u => u.email.startsWith('sim-provider-')).map(u => u.email).slice(0, 5);

  if (memberEmails.length === 0 || providerEmails.length === 0) {
    throw new Error('No simulation accounts found. Run simulate-platform.js first.');
  }

  console.log(`  Found ${memberEmails.length} member, ${providerEmails.length} provider accounts`);
  console.log('  Authenticating test users...');

  const memberSessions = [];
  const providerSessions = [];

  for (const email of memberEmails) {
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password: SIM_PASSWORD });
    if (!error && data?.session) {
      memberSessions.push({ token: data.session.access_token, userId: data.user.id, email });
    }
  }
  for (const email of providerEmails) {
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password: SIM_PASSWORD });
    if (!error && data?.session) {
      providerSessions.push({ token: data.session.access_token, userId: data.user.id, email });
    }
  }

  console.log(`  Authenticated: ${memberSessions.length} members, ${providerSessions.length} providers`);

  if (memberSessions.length === 0 || providerSessions.length === 0) {
    throw new Error('Could not authenticate any test users. Aborting.');
  }

  const targets = [];

  if (schemaColumnsPresent) {
    console.log('  Seeding test packages with Stripe PaymentIntents...');
    const seededPackageIds = [];
    const seededBidIds = [];
    const seededAddWorkIds = [];

    for (let i = 0; i < CONFIG.packageCount; i++) {
      const member = memberSessions[i % memberSessions.length];
      const provider = providerSessions[i % providerSessions.length];

      const { data: vehicle } = await supabaseAdmin
        .from('vehicles')
        .select('id')
        .eq('owner_id', member.userId)
        .limit(1)
        .single();

      const vehicleId = vehicle?.id || null;

      const pi = await createStripePI(TEST_MARKER + i);
      if (!pi.id || pi.status !== 'requires_capture') {
        console.log(`  [WARN] Failed to create PI #${i}: status=${pi.status || 'unknown'}, error=${pi.error?.message || 'none'}`);
        continue;
      }

      const { data: bid } = await supabaseAdmin
        .from('bids')
        .insert({
          package_id: null,
          provider_id: provider.userId,
          price: 50.00,
          message: 'Stress test bid for escrow capture',
          status: 'accepted',
          accepted_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (!bid) {
        console.log(`  [WARN] Failed to create bid for PI #${i}`);
        continue;
      }
      seededBidIds.push(bid.id);

      const { data: pkg } = await supabaseAdmin
        .from('maintenance_packages')
        .insert({
          member_id: member.userId,
          vehicle_id: vehicleId,
          title: `${TEST_MARKER}Escrow Capture Test ${i}`,
          description: 'Stress test package for escrow capture/refund race',
          service_type: 'Oil Change',
          urgency: 'low',
          member_zip: '60601',
          status: 'payment_held',
          accepted_bid_id: bid.id,
          escrow_payment_intent_id: pi.id,
          escrow_amount: 50.00,
          escrow_captured: false,
        })
        .select('id')
        .single();

      if (!pkg) {
        console.log(`  [WARN] Failed to create package for PI #${i}`);
        continue;
      }

      await supabaseAdmin
        .from('bids')
        .update({ package_id: pkg.id })
        .eq('id', bid.id);

      await supabaseAdmin
        .from('payments')
        .insert({
          package_id: pkg.id,
          member_id: member.userId,
          provider_id: provider.userId,
          amount_total: 50.00,
          amount_provider: 50.00,
          mcc_fee: 0,
          status: 'held',
          stripe_payment_intent_id: pi.id,
          held_at: new Date().toISOString(),
        });

      let addWorkPI = null;
      const addWorkStripePI = await createStripePI(TEST_MARKER + 'addwork_' + i);
      if (addWorkStripePI.id && addWorkStripePI.status === 'requires_capture') {
        const { data: addWork } = await supabaseAdmin
          .from('additional_work_requests')
          .insert({
            package_id: pkg.id,
            provider_id: provider.userId,
            description: 'Stress test additional work for escrow race',
            estimated_cost: 25.00,
            status: 'approved',
            payment_intent_id: addWorkStripePI.id,
          })
          .select('id')
          .single();
        if (addWork) {
          addWorkPI = addWorkStripePI.id;
          seededAddWorkIds.push(addWork.id);
        }
      }

      seededPackageIds.push(pkg.id);
      targets.push({
        packageId: pkg.id,
        bidId: bid.id,
        paymentIntentId: pi.id,
        additionalWorkPI: addWorkPI,
        memberToken: member.token,
        memberId: member.userId,
        providerToken: provider.token,
        providerId: provider.userId,
      });

      raceTracker[pkg.id] = {
        trueCaptures: 0,
        idempotentReleases: 0,
        trueRefunds: 0,
        releaseConflict: 0,
        refundConflict: 0,
        releaseErrors: 0,
        refundErrors: 0,
      };
    }

    cleanupState.seededPackageIds = seededPackageIds;
    cleanupState.seededBidIds = seededBidIds;
    cleanupState.seededAddWorkIds = seededAddWorkIds;
    console.log(`  Seeded ${targets.length} packages with Stripe PaymentIntents (+ ${seededAddWorkIds.length} additional work PIs)`);
  } else {
    const memberIds = memberSessions.map(s => s.userId);
    const { data: pkgs } = await supabaseAdmin
      .from('maintenance_packages')
      .select('id, member_id, status, accepted_bid_id')
      .in('member_id', memberIds)
      .in('status', ['payment_held', 'in_progress', 'completed', 'accepted'])
      .limit(CONFIG.packageCount);

    for (const pkg of (pkgs || [])) {
      const member = memberSessions.find(s => s.userId === pkg.member_id);
      const provider = providerSessions[0];
      if (member) {
        targets.push({
          packageId: pkg.id,
          memberToken: member.token,
          memberId: member.userId,
          providerToken: provider.token,
          providerId: provider.userId,
        });
        raceTracker[pkg.id] = {
          trueCaptures: 0,
          idempotentReleases: 0,
          trueRefunds: 0,
          releaseConflict: 0,
          refundConflict: 0,
          releaseErrors: 0,
          refundErrors: 0,
        };
      }
    }
    console.log(`  Using ${targets.length} existing packages (schema gap mode)`);
  }

  if (targets.length === 0) {
    throw new Error('No test targets available. Cannot proceed.');
  }

  cleanupState.targets = targets;
  return { targets, memberSessions, providerSessions };
}

async function fireReleaseMember(target) {
  const result = await timedFetch(`${BASE_URL}/api/escrow/release/${target.packageId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${target.memberToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (result.timeout) {
    metrics.release.timeouts++;
    metrics.release.requests++;
    addLatency(metrics.release, result.latency);
    return { type: 'timeout' };
  }

  recordMetric('release', result.latency, result.status);
  const tracker = raceTracker[target.packageId];

  if (result.status === 200 && result.body?.success && !result.body?.already_released) {
    tracker.trueCaptures++;
    return { type: 'captured' };
  } else if (result.body?.already_released) {
    tracker.idempotentReleases++;
    return { type: 'idempotent' };
  } else if (result.status === 400 || result.status === 409) {
    tracker.releaseConflict++;
    return { type: 'conflict', detail: result.body?.error };
  } else {
    tracker.releaseErrors++;
    return { type: 'error', status: result.status, detail: result.body?.error };
  }
}

async function fireRefundProvider(target) {
  const result = await timedFetch(`${BASE_URL}/api/escrow/refund/${target.packageId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${target.providerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason: 'Stress test concurrent refund request' }),
  });

  if (result.timeout) {
    metrics.refund.timeouts++;
    metrics.refund.requests++;
    addLatency(metrics.refund, result.latency);
    return { type: 'timeout' };
  }

  recordMetric('refund', result.latency, result.status);
  const tracker = raceTracker[target.packageId];

  if (result.status === 200 && result.body?.success) {
    tracker.trueRefunds++;
    return { type: 'refunded' };
  } else if (result.status === 400 || result.status === 409) {
    tracker.refundConflict++;
    return { type: 'conflict', detail: result.body?.error };
  } else {
    tracker.refundErrors++;
    return { type: 'error', status: result.status, detail: result.body?.error };
  }
}

async function runRaceBurst(target) {
  const promises = [];

  for (let i = 0; i < CONFIG.burstConcurrency; i++) {
    promises.push(fireReleaseMember(target));
    promises.push(fireRefundProvider(target));
  }

  const results = await Promise.all(promises);

  return {
    captures: results.filter(r => r.type === 'captured').length,
    refunds: results.filter(r => r.type === 'refunded').length,
    conflicts: results.filter(r => r.type === 'conflict').length,
    idempotent: results.filter(r => r.type === 'idempotent').length,
    total: results.length,
  };
}

async function runAllBursts(targets) {
  for (let burst = 0; burst < targets.length; burst++) {
    const target = targets[burst];

    const result = await runRaceBurst(target);

    process.stdout.write(`  Burst ${burst + 1}/${targets.length} — pkg ${target.packageId.slice(0, 8)}... | cap:${result.captures} ref:${result.refunds} conflict:${result.conflicts} idem:${result.idempotent}\r`);

    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`  All ${targets.length} bursts complete                                                   `);
}

async function verifyStripeState(targets) {
  console.log('\n  STRIPE PAYMENT INTENT STATE VERIFICATION');
  console.log('  ' + '-'.repeat(60));

  if (!schemaColumnsPresent) {
    console.log('  [SKIP] No Stripe PaymentIntents to verify (schema gap mode)');
    return {};
  }

  const stripeStates = {};

  for (const target of targets) {
    if (!target.paymentIntentId) continue;
    try {
      const res = await fetch(`https://api.stripe.com/v1/payment_intents/${target.paymentIntentId}`, {
        headers: {
          'Authorization': `Basic ${Buffer.from(STRIPE_SECRET_KEY + ':').toString('base64')}`,
        },
      });
      const pi = await res.json();
      stripeStates[target.packageId] = { main: pi.status };

      let addWorkStatus = 'n/a';
      if (target.additionalWorkPI) {
        const addRes = await fetch(`https://api.stripe.com/v1/payment_intents/${target.additionalWorkPI}`, {
          headers: {
            'Authorization': `Basic ${Buffer.from(STRIPE_SECRET_KEY + ':').toString('base64')}`,
          },
        });
        const addPI = await addRes.json();
        addWorkStatus = addPI.status;
        stripeStates[target.packageId].addWork = addPI.status;
      }

      console.log(`    ${target.packageId.slice(0, 8)}...: main PI -> ${pi.status}, addWork PI -> ${addWorkStatus}`);
    } catch (err) {
      console.log(`    ${target.packageId.slice(0, 8)}...: [ERROR] ${err.message}`);
    }
  }

  return stripeStates;
}

async function checkDoubleCaptureIntegrity(targets, stripeStates) {
  console.log('\n  DOUBLE-CAPTURE INTEGRITY CHECK');
  console.log('  ' + '-'.repeat(60));

  if (!schemaColumnsPresent) {
    console.log('  [SKIP] Cannot verify escrow_captured — columns missing from DB schema');
    console.log('  [FAIL] SCHEMA GAP: escrow columns do not exist in maintenance_packages');
    console.log('         The entire escrow capture/refund system is non-functional');
    return { pass: false, schemaGap: true, doubleCaptured: 0, inconsistent: 0, bothSucceeded: 0, noTerminalState: 0 };
  }

  let doubleCaptured = 0;
  let inconsistent = 0;
  let bothSucceeded = 0;
  let cleanCaptures = 0;
  let cleanRefunds = 0;
  let noTerminalState = 0;
  const violations = [];

  for (const target of targets) {
    const { data: pkg } = await supabaseAdmin
      .from('maintenance_packages')
      .select('id, status, escrow_captured, escrow_payment_intent_id')
      .eq('id', target.packageId)
      .single();

    if (!pkg) continue;

    const tracker = raceTracker[target.packageId];
    const captured = pkg.escrow_captured === true;
    const dbRefunded = pkg.status === 'cancelled' || pkg.status === 'refunded';
    const dbReleased = pkg.status === 'completed' || pkg.status === 'payment_released';
    const stripe = stripeStates[target.packageId] || {};

    if (captured && dbRefunded) {
      inconsistent++;
      violations.push({
        packageId: target.packageId,
        status: pkg.status,
        escrowCaptured: pkg.escrow_captured,
        stripe: stripe.main,
        trueCaptures: tracker.trueCaptures,
        trueRefunds: tracker.trueRefunds,
        issue: 'DB shows BOTH captured=true AND status cancelled/refunded',
      });
    }

    if (tracker.trueCaptures > 0 && tracker.trueRefunds > 0) {
      bothSucceeded++;
      violations.push({
        packageId: target.packageId,
        status: pkg.status,
        escrowCaptured: pkg.escrow_captured,
        stripe: stripe.main,
        trueCaptures: tracker.trueCaptures,
        trueRefunds: tracker.trueRefunds,
        issue: `RACE: both release (${tracker.trueCaptures}x) and refund (${tracker.trueRefunds}x) returned success; Stripe=${stripe.main}`,
      });
    }

    if (tracker.trueCaptures > 1) {
      doubleCaptured++;
      violations.push({
        packageId: target.packageId,
        status: pkg.status,
        escrowCaptured: pkg.escrow_captured,
        stripe: stripe.main,
        trueCaptures: tracker.trueCaptures,
        issue: `DOUBLE CAPTURE: ${tracker.trueCaptures} non-idempotent captures`,
      });
    }

    const hadActivity = tracker.trueCaptures > 0 || tracker.trueRefunds > 0;
    if (hadActivity && !dbReleased && !dbRefunded && !captured) {
      noTerminalState++;
      violations.push({
        packageId: target.packageId,
        status: pkg.status,
        escrowCaptured: pkg.escrow_captured,
        stripe: stripe.main,
        issue: `NO TERMINAL STATE: had ${tracker.trueCaptures} captures + ${tracker.trueRefunds} refunds but status=${pkg.status}, captured=${pkg.escrow_captured}`,
      });
    }

    if (dbReleased && captured && tracker.trueRefunds === 0) {
      cleanCaptures++;
    } else if (dbRefunded && !captured && tracker.trueCaptures === 0) {
      cleanRefunds++;
    }
  }

  console.log(`  Packages tested:             ${targets.length}`);
  console.log(`  Clean captures (no race):    ${cleanCaptures}`);
  console.log(`  Clean refunds (no race):     ${cleanRefunds}`);
  console.log(`  Double-captured (>1):        ${doubleCaptured}`);
  console.log(`  Inconsistent (cap+refund):   ${inconsistent}`);
  console.log(`  Both succeeded (race hit):   ${bothSucceeded}`);
  console.log(`  No terminal state:           ${noTerminalState}`);

  console.log('\n  PER-PACKAGE RACE RESULTS');
  for (const target of targets) {
    const t = raceTracker[target.packageId];
    const { data: pkg } = await supabaseAdmin
      .from('maintenance_packages')
      .select('status, escrow_captured')
      .eq('id', target.packageId)
      .single();
    const stripe = stripeStates[target.packageId] || {};
    console.log(`    ${target.packageId.slice(0, 8)}...: capture=${t.trueCaptures}ok/${t.idempotentReleases}idem/${t.releaseConflict}conflict  refund=${t.trueRefunds}ok/${t.refundConflict}conflict  db=${pkg?.status}  captured=${pkg?.escrow_captured}  stripe=${stripe.main || '?'}  addWork=${stripe.addWork || 'n/a'}`);
  }

  const totalIssues = doubleCaptured + inconsistent + bothSucceeded + noTerminalState;
  const pass = totalIssues === 0;

  if (pass) {
    console.log('\n  [PASS] No double-capture, race conditions, or state inconsistencies detected');
    console.log('         Each package reached exactly one terminal state');
  } else {
    console.log(`\n  [FAIL] ${totalIssues} integrity violation(s) detected`);
    for (const v of violations.slice(0, 10)) {
      console.log(`         ${v.packageId.slice(0, 8)}...: ${v.issue}`);
    }
  }

  return { pass, doubleCaptured, inconsistent, bothSucceeded, noTerminalState, cleanCaptures, cleanRefunds, schemaGap: false };
}

function printResults(testDurationSec, integrityResult) {
  console.log('\n====================================================');
  console.log('  My Car Concierge — Escrow Capture/Refund Race Stress Test Results');
  console.log('====================================================\n');

  const allMetrics = Object.values(metrics);
  const totalRequests    = allMetrics.reduce((s, m) => s + m.requests, 0);
  const totalErrors      = allMetrics.reduce((s, m) => s + m.errors, 0);
  const totalSchemaErrors = allMetrics.reduce((s, m) => s + m.schemaErrors, 0);
  const totalRateLimited = allMetrics.reduce((s, m) => s + m.rateLimited, 0);
  const totalTimeouts    = allMetrics.reduce((s, m) => s + m.timeouts, 0);
  const allLatencies     = allMetrics.flatMap(m => getLatencies(m));
  const overallRps       = testDurationSec > 0 ? (totalRequests / testDurationSec).toFixed(1) : 0;

  console.log('  OVERALL');
  console.log(`  Total requests:    ${totalRequests}`);
  console.log(`  Test duration:     ${testDurationSec.toFixed(1)}s`);
  console.log(`  Avg RPS:           ${overallRps} req/s`);
  console.log(`  Real errors:       ${totalErrors} (${totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : 0}%)`);
  if (totalSchemaErrors > 0) {
    console.log(`  Schema-gap errors: ${totalSchemaErrors} (${totalRequests > 0 ? ((totalSchemaErrors / totalRequests) * 100).toFixed(2) : 0}%) — missing DB columns`);
  }
  console.log(`  Rate limited:      ${totalRateLimited} (${totalRequests > 0 ? ((totalRateLimited / totalRequests) * 100).toFixed(2) : 0}%) — expected under load`);
  console.log(`  Timeouts:          ${totalTimeouts} (${totalRequests > 0 ? ((totalTimeouts / totalRequests) * 100).toFixed(2) : 0}%)`);
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
    console.log(`  ${m.name}`);
    console.log(`    Requests: ${m.requests} | Errors: ${m.errors} | Schema: ${m.schemaErrors} | Rate-limited: ${m.rateLimited} | Timeouts: ${m.timeouts}`);
    console.log(`    p50: ${p50}ms | p95: ${p95}ms | p99: ${p99}ms`);
    console.log(`    Status codes: ${codes}`);
  }

  console.log(`\n  Test design:`);
  console.log(`    • Member calls POST /api/escrow/release/:id (capture funds to provider)`);
  console.log(`    • Provider calls POST /api/escrow/refund/:id (cancel/return funds to member)`);
  console.log(`    • Both fired simultaneously via Promise.all for the same package`);
  console.log(`    • ${CONFIG.burstConcurrency} concurrent release+refund pairs per burst`);
  console.log(`    • ${CONFIG.packageCount} packages, each tested exactly once (no reuse)`);
  console.log(`    • Additional work PIs seeded to test capture+additional-work race`);
  console.log(`    • True captures vs idempotent already-released tracked separately`);
  console.log(`    • Stripe PI state verified independently after test`);
  console.log(`    • All created PaymentIntents tracked and cleaned up`);

  const p95 = percentile(allLatencies, 95);
  const realErrorCount = totalErrors + totalTimeouts;
  const errorRate = totalRequests > 0 ? (realErrorCount / totalRequests) * 100 : 0;

  console.log('\n  PASS/FAIL CRITERIA');
  console.log('  ' + '-'.repeat(60));

  let integrityValue;
  if (integrityResult.schemaGap) {
    integrityValue = 'SCHEMA GAP';
  } else {
    integrityValue = `double:${integrityResult.doubleCaptured} incon:${integrityResult.inconsistent} race:${integrityResult.bothSucceeded} noterm:${integrityResult.noTerminalState}`;
  }

  const criteria = [
    { name: 'p95 < 2000ms',                            value: `${p95}ms`,                  pass: p95 < 2000 },
    { name: 'Error rate < 1% (excl 400/409)',           value: `${errorRate.toFixed(2)}%`,  pass: errorRate < 1 },
    { name: 'Exactly-once capture, no cap+refund race', value: integrityValue,              pass: integrityResult.pass },
  ];

  for (const c of criteria) {
    const tag = c.pass ? 'PASS' : 'FAIL';
    console.log(`  [${tag}] ${c.name.padEnd(44)} ${c.value}`);
  }

  if (integrityResult.schemaGap) {
    console.log('\n  [CRITICAL FINDING] Escrow columns missing from maintenance_packages table');
    console.log('  The escrow_payment_intent_id, escrow_amount, escrow_captured columns');
    console.log('  do not exist in the production schema. The entire escrow capture/refund');
    console.log('  system is non-functional until these columns are added.');
  }

  console.log('\n====================================================\n');
}

async function cleanupAllData(cleanupState) {
  console.log('\n[Teardown] Cleaning up test data...');

  if (allCreatedPaymentIntentIds.length > 0) {
    let cancelled = 0;
    let failed = 0;
    for (const piId of allCreatedPaymentIntentIds) {
      try {
        const res = await fetch(`https://api.stripe.com/v1/payment_intents/${piId}`, {
          headers: {
            'Authorization': `Basic ${Buffer.from(STRIPE_SECRET_KEY + ':').toString('base64')}`,
          },
        });
        const pi = await res.json();
        if (pi.status === 'requires_capture') {
          await fetch(`https://api.stripe.com/v1/payment_intents/${piId}/cancel`, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${Buffer.from(STRIPE_SECRET_KEY + ':').toString('base64')}`,
            },
          });
        }
        cancelled++;
      } catch {
        failed++;
      }
    }
    console.log(`  Cleaned ${cancelled}/${allCreatedPaymentIntentIds.length} Stripe PaymentIntents (${failed} failures)`);
  }

  if (cleanupState.seededAddWorkIds && cleanupState.seededAddWorkIds.length > 0) {
    await supabaseAdmin
      .from('additional_work_requests')
      .delete()
      .in('id', cleanupState.seededAddWorkIds);
    console.log(`  Deleted ${cleanupState.seededAddWorkIds.length} additional work requests`);
  }

  if (cleanupState.seededPackageIds && cleanupState.seededPackageIds.length > 0) {
    await supabaseAdmin
      .from('additional_work_requests')
      .delete()
      .in('package_id', cleanupState.seededPackageIds);

    await supabaseAdmin
      .from('payments')
      .delete()
      .in('package_id', cleanupState.seededPackageIds);

    const { error: refErr } = await supabaseAdmin
      .from('refunds')
      .delete()
      .in('package_id', cleanupState.seededPackageIds);
    if (refErr && !refErr.message.includes('does not exist')) {
      console.log(`  Refunds cleanup note: ${refErr.message}`);
    }

    await supabaseAdmin
      .from('service_history')
      .delete()
      .in('package_id', cleanupState.seededPackageIds);

    await supabaseAdmin
      .from('notifications')
      .delete()
      .in('entity_id', cleanupState.seededPackageIds);

    await supabaseAdmin
      .from('maintenance_packages')
      .delete()
      .in('id', cleanupState.seededPackageIds);
    console.log(`  Deleted ${cleanupState.seededPackageIds.length} seeded packages and related records`);
  }

  if (cleanupState.seededBidIds && cleanupState.seededBidIds.length > 0) {
    await supabaseAdmin
      .from('bids')
      .delete()
      .in('id', cleanupState.seededBidIds);
    console.log(`  Deleted ${cleanupState.seededBidIds.length} seeded bids`);
  }

  console.log('  Cleanup complete');
}

async function main() {
  const cleanupState = {
    seededPackageIds: [],
    seededBidIds: [],
    seededAddWorkIds: [],
    targets: [],
  };

  let exitCode = 1;

  try {
    console.log('\n====================================================');
    console.log('  My Car Concierge — Escrow Capture/Refund Race Stress Test');
    console.log('====================================================');
    console.log(`  Packages (one burst each): ${CONFIG.packageCount} | Pairs/burst: ${CONFIG.burstConcurrency}`);
    console.log(`  Base URL: ${BASE_URL}`);
    console.log('====================================================\n');

    console.log('[Setup] Loading simulation data and seeding packages...');
    const data = await loadSimData(cleanupState);
    console.log('  Setup complete.\n');

    const testStart = Date.now();

    console.log('[Race Test] Firing concurrent release+refund bursts...');
    await runAllBursts(data.targets);

    const testDurationSec = (Date.now() - testStart) / 1000;

    await new Promise(r => setTimeout(r, 2000));

    const stripeStates = await verifyStripeState(data.targets);
    const integrityResult = await checkDoubleCaptureIntegrity(data.targets, stripeStates);
    printResults(testDurationSec, integrityResult);

    const allLatencies = Object.values(metrics).flatMap(m => getLatencies(m));
    const p95 = percentile(allLatencies, 95);
    const totalReqs = Object.values(metrics).reduce((s, m) => s + m.requests, 0);
    const realErrors = Object.values(metrics).reduce((s, m) => s + m.errors + m.timeouts, 0);
    const errorRate = totalReqs > 0 ? (realErrors / totalReqs) * 100 : 0;

    exitCode = integrityResult.pass && p95 < 2000 && errorRate < 1 ? 0 : 1;

  } catch (err) {
    console.error(`\n[FATAL] ${err.message}`);
    console.error(err.stack);
  } finally {
    await cleanupAllData(cleanupState);
    process.exit(exitCode);
  }
}

main();

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ifbyjxuaclwmadqbjcyp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}
if (!ADMIN_PASSWORD) {
  console.error('ADMIN_PASSWORD environment variable is required');
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
  concurrency:        param('concurrency', 30),
  duration:           param('duration', 45),
  rampUpTime:         param('ramp-up', 15),
  spikeMultiplier:    2,
  spikeDuration:      10,
  coolDownDuration:   10,
  coolDownConcurrency: 5,
  requestTimeout:     param('timeout', 15000),
  seedCount:          param('seed-count', 10),
  draftBatchSize:     param('draft-batch', 3),
  collisionPoolSize:  param('collision-pool', 5),
  collisionRate:      param('collision-rate', 30),
  baseUrl:            strParam('base-url', process.env.STRESS_TEST_BASE_URL || 'http://localhost:5000'),
};

const BASE_URL = CONFIG.baseUrl;
const STRESS_TAG = 'stress-test-outreach';

const RESERVOIR_SIZE = 50000;

function createMetric(name) {
  return { name, requests: 0, errors: 0, rateLimited: 0, timeouts: 0, unhandled500s: 0, latencies: new Float32Array(RESERVOIR_SIZE), latencyCount: 0, statusCodes: {} };
}

const metrics = {
  leads:       createMetric('GET leads'),
  pipeline:    createMetric('GET pipeline'),
  messages:    createMetric('GET messages'),
  campaigns:   createMetric('GET campaigns'),
  analytics:   createMetric('GET analytics'),
  engineState: createMetric('GET engine-state'),
  schemaCheck: createMetric('GET schema-status'),
  createLead:  createMetric('POST create-lead'),
  draftMsg:    createMetric('POST draft-msg'),
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
  if (status === 429 || status === 503) {
    metric.rateLimited++;
  } else if (status === 500) {
    metric.unhandled500s++;
    metric.errors++;
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

function adminHeaders(extra = {}) {
  return {
    'x-admin-password': ADMIN_PASSWORD,
    ...extra,
  };
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function generateStressEmail(index) {
  return `stress-outreach-${Date.now()}-${index}-${rand(1000, 9999)}@mcc-stress.test`;
}

function generateStressPhone(index) {
  return `555${String(index).padStart(3, '0')}${rand(1000, 9999)}`;
}

const STRESS_LEAD_NAMES = [
  'Stress Test Auto Shop', 'Load Test Garage', 'Concurrent Motors', 'Benchmark Detailing',
  'Throughput Tire Center', 'Latency Brake Service', 'Pipeline Auto Clinic', 'Capacity Car Wash',
  'Volume Fleet Services', 'Parallel Repair Co', 'Burst Test Mechanics', 'Scale Auto Works',
  'Pressure Test Towing', 'Endurance Auto Lab', 'Peak Performance Motors',
];

const STRESS_LOCATIONS = [
  'East Rutherford, NJ', 'Newark, NJ', 'Jersey City, NJ', 'Hoboken, NJ', 'Paterson, NJ',
];

async function seedStressLeads() {
  console.log(`  Seeding ${CONFIG.seedCount} stress-tagged outreach leads...`);

  const seeded = [];
  for (let i = 0; i < CONFIG.seedCount; i++) {
    const email = generateStressEmail(i);
    const phone = generateStressPhone(i);
    const leadType = i % 3 === 0 ? 'member' : 'provider';

    const { data, error } = await supabaseAdmin
      .from('outreach_leads')
      .insert({
        type: leadType,
        name: `${pick(STRESS_LEAD_NAMES)} #${i}`,
        email,
        phone,
        location: pick(STRESS_LOCATIONS),
        source: STRESS_TAG,
        status: 'new',
        crm_sync_status: 'unlinked',
        notes: STRESS_TAG,
      })
      .select('id, email, phone, type')
      .single();

    if (error) {
      console.log(`  [WARN] Seed #${i} failed: ${error.message}`);
      continue;
    }
    seeded.push(data);
  }

  console.log(`  ${seeded.length} stress leads seeded`);
  return seeded;
}

async function cleanupStressData() {
  console.log('\n[Teardown] Cleaning up stress test data...');

  const { data: stressLeads } = await supabaseAdmin
    .from('outreach_leads')
    .select('id')
    .eq('source', STRESS_TAG);

  const leadIds = (stressLeads || []).map(l => l.id);

  if (leadIds.length > 0) {
    for (let i = 0; i < leadIds.length; i += 100) {
      const batch = leadIds.slice(i, i + 100);
      await supabaseAdmin.from('outreach_activity_log').delete().in('lead_id', batch);
      await supabaseAdmin.from('outreach_messages').delete().in('lead_id', batch);
      await supabaseAdmin.from('opportunity_pipeline').delete().in('lead_id', batch);
      await supabaseAdmin.from('campaign_leads').delete().in('lead_id', batch);
    }

    for (let i = 0; i < leadIds.length; i += 100) {
      const batch = leadIds.slice(i, i + 100);
      await supabaseAdmin.from('outreach_leads').delete().in('id', batch);
    }
  }

  const { data: noteLeads } = await supabaseAdmin
    .from('outreach_leads')
    .select('id')
    .eq('notes', STRESS_TAG);

  const noteIds = (noteLeads || []).map(l => l.id).filter(id => !leadIds.includes(id));
  if (noteIds.length > 0) {
    for (let i = 0; i < noteIds.length; i += 100) {
      const batch = noteIds.slice(i, i + 100);
      await supabaseAdmin.from('outreach_activity_log').delete().in('lead_id', batch);
      await supabaseAdmin.from('outreach_messages').delete().in('lead_id', batch);
      await supabaseAdmin.from('opportunity_pipeline').delete().in('lead_id', batch);
      await supabaseAdmin.from('campaign_leads').delete().in('lead_id', batch);
      await supabaseAdmin.from('outreach_leads').delete().in('id', batch);
    }
  }

  const { data: collisionLeads } = await supabaseAdmin
    .from('outreach_leads')
    .select('id')
    .like('email', 'stress-collision-%@mcc-stress.test');

  const collisionIds = (collisionLeads || []).map(l => l.id).filter(id => !leadIds.includes(id) && !noteIds.includes(id));
  if (collisionIds.length > 0) {
    for (let i = 0; i < collisionIds.length; i += 100) {
      const batch = collisionIds.slice(i, i + 100);
      await supabaseAdmin.from('outreach_activity_log').delete().in('lead_id', batch);
      await supabaseAdmin.from('outreach_messages').delete().in('lead_id', batch);
      await supabaseAdmin.from('opportunity_pipeline').delete().in('lead_id', batch);
      await supabaseAdmin.from('campaign_leads').delete().in('lead_id', batch);
      await supabaseAdmin.from('outreach_leads').delete().in('id', batch);
    }
  }

  const totalCleaned = leadIds.length + noteIds.length + collisionIds.length;
  console.log(`  Cleaned up ${totalCleaned} stress-tagged leads and associated data`);
}

async function runGetLeads() {
  const page = rand(1, 3);
  const result = await timedFetch(
    `${BASE_URL}/api/admin/outreach/leads?page=${page}&limit=25`,
    { headers: adminHeaders() }
  );
  if (result.timeout) { metrics.leads.timeouts++; metrics.leads.requests++; addLatency(metrics.leads, result.latency); return; }
  recordMetric(metrics.leads, result.latency, result.status);
}

async function runGetPipeline() {
  const result = await timedFetch(
    `${BASE_URL}/api/admin/outreach/pipeline`,
    { headers: adminHeaders() }
  );
  if (result.timeout) { metrics.pipeline.timeouts++; metrics.pipeline.requests++; addLatency(metrics.pipeline, result.latency); return; }
  recordMetric(metrics.pipeline, result.latency, result.status);
}

async function runGetMessages() {
  const result = await timedFetch(
    `${BASE_URL}/api/admin/outreach/messages?page=1&limit=50`,
    { headers: adminHeaders() }
  );
  if (result.timeout) { metrics.messages.timeouts++; metrics.messages.requests++; addLatency(metrics.messages, result.latency); return; }
  recordMetric(metrics.messages, result.latency, result.status);
}

async function runGetCampaigns() {
  const result = await timedFetch(
    `${BASE_URL}/api/admin/outreach/campaigns`,
    { headers: adminHeaders() }
  );
  if (result.timeout) { metrics.campaigns.timeouts++; metrics.campaigns.requests++; addLatency(metrics.campaigns, result.latency); return; }
  recordMetric(metrics.campaigns, result.latency, result.status);
}

async function runGetAnalytics() {
  const result = await timedFetch(
    `${BASE_URL}/api/admin/outreach/analytics`,
    { headers: adminHeaders() }
  );
  if (result.timeout) { metrics.analytics.timeouts++; metrics.analytics.requests++; addLatency(metrics.analytics, result.latency); return; }
  recordMetric(metrics.analytics, result.latency, result.status);
}

async function runGetEngineState() {
  const result = await timedFetch(
    `${BASE_URL}/api/admin/outreach/engine-state`,
    { headers: adminHeaders() }
  );
  if (result.timeout) { metrics.engineState.timeouts++; metrics.engineState.requests++; addLatency(metrics.engineState, result.latency); return; }
  recordMetric(metrics.engineState, result.latency, result.status);
}

async function runGetSchemaStatus() {
  const result = await timedFetch(
    `${BASE_URL}/api/admin/outreach/schema-status`,
    { headers: adminHeaders() }
  );
  if (result.timeout) { metrics.schemaCheck.timeouts++; metrics.schemaCheck.requests++; addLatency(metrics.schemaCheck, result.latency); return; }
  recordMetric(metrics.schemaCheck, result.latency, result.status);
}

async function runCreateLead(index) {
  const useCollision = collisionPool.length > 0 && rand(1, 100) <= CONFIG.collisionRate;
  let email, phone, name;

  if (useCollision) {
    const entry = pick(collisionPool);
    email = entry.email;
    phone = entry.phone;
    name = entry.name;
  } else {
    email = generateStressEmail(index + 10000);
    phone = generateStressPhone(index + 10000);
    name = `${pick(STRESS_LEAD_NAMES)} Create #${index}`;
  }

  const result = await timedFetch(
    `${BASE_URL}/api/admin/outreach/leads`,
    {
      method: 'POST',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        type: index % 2 === 0 ? 'provider' : 'member',
        name,
        email,
        phone,
        location: pick(STRESS_LOCATIONS),
        notes: STRESS_TAG,
      }),
    }
  );
  if (result.timeout) { metrics.createLead.timeouts++; metrics.createLead.requests++; addLatency(metrics.createLead, result.latency); return; }
  if (result.status === 409) {
    metrics.createLead.requests++;
    addLatency(metrics.createLead, result.latency);
    metrics.createLead.statusCodes[409] = (metrics.createLead.statusCodes[409] || 0) + 1;
    return;
  }
  recordMetric(metrics.createLead, result.latency, result.status);
}

async function runDraftMessage(leadId) {
  const result = await timedFetch(
    `${BASE_URL}/api/admin/outreach/messages/draft`,
    {
      method: 'POST',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ lead_id: leadId, channel: 'email' }),
    }
  );
  if (result.timeout) { metrics.draftMsg.timeouts++; metrics.draftMsg.requests++; addLatency(metrics.draftMsg, result.latency); return; }
  if (result.status === 429 || result.status === 503) {
    metrics.draftMsg.rateLimited++;
    metrics.draftMsg.requests++;
    addLatency(metrics.draftMsg, result.latency);
    metrics.draftMsg.statusCodes[result.status] = (metrics.draftMsg.statusCodes[result.status] || 0) + 1;
    return;
  }
  recordMetric(metrics.draftMsg, result.latency, result.status);
}

let createLeadCounter = 0;
let draftCounter = 0;

const collisionPool = [];
function initCollisionPool() {
  for (let i = 0; i < CONFIG.collisionPoolSize; i++) {
    collisionPool.push({
      email: `stress-collision-${i}@mcc-stress.test`,
      phone: `555999${String(i).padStart(4, '0')}`,
      name: `${pick(STRESS_LEAD_NAMES)} Collision #${i}`,
    });
  }
}

async function runWorker(seededLeads, stopSignal) {
  const readActions = [
    runGetLeads,
    runGetPipeline,
    runGetMessages,
    runGetCampaigns,
    runGetAnalytics,
    runGetEngineState,
    runGetSchemaStatus,
  ];

  while (!stopSignal.stop) {
    const action = rand(1, 100);
    try {
      if (action <= 70) {
        await pick(readActions)();
      } else if (action <= 90) {
        const idx = createLeadCounter++;
        await runCreateLead(idx);
      } else {
        if (seededLeads.length > 0) {
          draftCounter++;
          if (draftCounter <= CONFIG.draftBatchSize) {
            const lead = pick(seededLeads);
            await runDraftMessage(lead.id);
          } else {
            await pick(readActions)();
          }
        } else {
          await pick(readActions)();
        }
      }
    } catch (err) {
      workerUnhandledErrors++;
    }
    await new Promise(r => setTimeout(r, rand(20, 80)));
  }
}

async function runPhase(name, concurrency, durationMs, seededLeads) {
  const startTime = Date.now();
  const stopSignal = { stop: false };

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(runWorker(seededLeads, stopSignal));
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

function printResults(durationSec) {
  const allLatencies = [];
  let totalRequests = 0;
  let totalErrors = 0;
  let totalRateLimited = 0;
  let totalUnhandled = 0;
  let totalTimeouts = 0;

  console.log('\n  RESULTS');
  console.log('  ' + '-'.repeat(90));
  console.log('  ' + 'Endpoint'.padEnd(22) + 'Reqs'.padStart(8) + 'Errs'.padStart(8) + '429s'.padStart(8) + 'T/O'.padStart(6) + '500s'.padStart(7) + 'p50'.padStart(8) + 'p95'.padStart(8) + 'p99'.padStart(8));
  console.log('  ' + '-'.repeat(90));

  for (const [, m] of Object.entries(metrics)) {
    const lats = getLatencies(m);
    allLatencies.push(...lats);
    totalRequests += m.requests;
    totalErrors += m.errors;
    totalRateLimited += m.rateLimited;
    totalUnhandled += m.unhandled500s;
    totalTimeouts += m.timeouts;

    const p50 = Math.round(percentile(lats, 50));
    const p95 = Math.round(percentile(lats, 95));
    const p99 = Math.round(percentile(lats, 99));
    console.log(
      '  ' + m.name.padEnd(22) +
      String(m.requests).padStart(8) +
      String(m.errors).padStart(8) +
      String(m.rateLimited).padStart(8) +
      String(m.timeouts).padStart(6) +
      String(m.unhandled500s).padStart(7) +
      `${p50}ms`.padStart(8) +
      `${p95}ms`.padStart(8) +
      `${p99}ms`.padStart(8)
    );
  }

  console.log('  ' + '-'.repeat(90));

  const overallP50 = Math.round(percentile(allLatencies, 50));
  const overallP95 = Math.round(percentile(allLatencies, 95));
  const overallP99 = Math.round(percentile(allLatencies, 99));

  console.log(
    '  ' + 'TOTAL'.padEnd(22) +
    String(totalRequests).padStart(8) +
    String(totalErrors).padStart(8) +
    String(totalRateLimited).padStart(8) +
    String(totalTimeouts).padStart(6) +
    String(totalUnhandled).padStart(7) +
    `${overallP50}ms`.padStart(8) +
    `${overallP95}ms`.padStart(8) +
    `${overallP99}ms`.padStart(8)
  );

  const rps = (totalRequests / durationSec).toFixed(1);
  console.log(`\n  Duration: ${durationSec.toFixed(1)}s | RPS: ${rps} | Unhandled worker errors: ${workerUnhandledErrors}`);

  const statusSummary = {};
  for (const m of Object.values(metrics)) {
    for (const [code, count] of Object.entries(m.statusCodes)) {
      statusSummary[code] = (statusSummary[code] || 0) + count;
    }
  }
  console.log(`  Status codes: ${JSON.stringify(statusSummary)}`);

  return { totalRequests, totalErrors, totalRateLimited, totalUnhandled, totalTimeouts, p95: overallP95 };
}

async function checkDuplicateLeads() {
  console.log('\n  DUPLICATE LEAD INTEGRITY CHECK');
  console.log('  ' + '-'.repeat(60));

  const { data: stressLeads } = await supabaseAdmin
    .from('outreach_leads')
    .select('id, email, phone, name, source')
    .or(`source.eq.${STRESS_TAG},notes.eq.${STRESS_TAG}`);

  const leads = stressLeads || [];
  if (leads.length === 0) {
    console.log('  No stress leads found (all cleaned or none created)');
    return { hasDuplicates: false, duplicateEmails: 0, duplicatePhones: 0 };
  }

  const emailCounts = {};
  const phoneCounts = {};

  for (const lead of leads) {
    if (lead.email) {
      emailCounts[lead.email] = (emailCounts[lead.email] || 0) + 1;
    }
    if (lead.phone) {
      phoneCounts[lead.phone] = (phoneCounts[lead.phone] || 0) + 1;
    }
  }

  const duplicateEmails = Object.entries(emailCounts).filter(([, count]) => count > 1);
  const duplicatePhones = Object.entries(phoneCounts).filter(([, count]) => count > 1);

  console.log(`  Total stress leads in DB: ${leads.length}`);
  console.log(`  Duplicate emails: ${duplicateEmails.length}`);
  console.log(`  Duplicate phones: ${duplicatePhones.length}`);

  if (duplicateEmails.length > 0) {
    console.log('  Sample duplicate emails:');
    for (const [email, count] of duplicateEmails.slice(0, 5)) {
      console.log(`    ${email}: ${count} rows`);
    }
  }

  if (duplicatePhones.length > 0) {
    console.log('  Sample duplicate phones:');
    for (const [phone, count] of duplicatePhones.slice(0, 5)) {
      console.log(`    ${phone}: ${count} rows`);
    }
  }

  return {
    hasDuplicates: duplicateEmails.length > 0 || duplicatePhones.length > 0,
    duplicateEmails: duplicateEmails.length,
    duplicatePhones: duplicatePhones.length,
    totalLeads: leads.length,
  };
}

async function verifySchemaExists() {
  const tables = ['outreach_leads', 'outreach_messages', 'opportunity_pipeline', 'outreach_activity_log', 'engine_state'];
  const missing = [];

  for (const table of tables) {
    const { error } = await supabaseAdmin.from(table).select('id').limit(1);
    if (error && (error.message.includes('does not exist') || error.code === '42P01')) {
      missing.push(table);
    }
  }

  return missing;
}

async function main() {
  console.log('\n====================================================');
  console.log('  My Car Concierge — Outreach Engine Load Stress Test');
  console.log('====================================================');
  console.log(`  Concurrency: ${CONFIG.concurrency} | Duration: ${CONFIG.duration}s | Timeout: ${CONFIG.requestTimeout}ms`);
  console.log(`  Seed leads: ${CONFIG.seedCount} | Draft batch cap: ${CONFIG.draftBatchSize}`);
  console.log(`  Collision pool: ${CONFIG.collisionPoolSize} entries | Collision rate: ${CONFIG.collisionRate}%`);
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  Endpoints:`);
  console.log(`    GET  /api/admin/outreach/{leads,pipeline,messages,campaigns,analytics,engine-state,schema-status}`);
  console.log(`    POST /api/admin/outreach/leads (create lead, duplicate detection)`);
  console.log(`    POST /api/admin/outreach/messages/draft (Claude AI drafting, capped)`);
  console.log('====================================================\n');

  console.log('[Pre-flight] Verifying outreach schema tables...');
  const missingTables = await verifySchemaExists();
  if (missingTables.length > 0) {
    console.error(`  FATAL: Missing tables: ${missingTables.join(', ')}`);
    console.error('  Apply the outreach migrations in supabase/migrations/ in order via the Supabase SQL Editor first: 20260420_outreach_engine_initial.sql, 20260424_outreach_email_events.sql, 20260425_outreach_crm_bridge.sql, plus any later 20260*_outreach_*.sql files.');
    process.exit(1);
  }
  console.log('  All required tables exist.\n');

  console.log('[Pre-flight] Verifying admin auth...');
  const authCheck = await timedFetch(`${BASE_URL}/api/admin/outreach/schema-status`, {
    headers: adminHeaders(),
  });
  if (authCheck.status !== 200) {
    console.error(`  FATAL: Admin auth failed (status: ${authCheck.status}). Check ADMIN_PASSWORD.`);
    process.exit(1);
  }
  console.log('  Admin auth OK.\n');

  console.log('[Pre-flight] Cleaning up stale stress data...');
  await cleanupStressData();

  initCollisionPool();

  console.log('\n[Setup] Seeding stress-tagged outreach leads...');
  const seededLeads = await seedStressLeads();
  if (seededLeads.length === 0) {
    console.error('  FATAL: Could not seed any leads.');
    process.exit(1);
  }
  console.log('  Setup complete.\n');

  let allPassed = false;

  try {
    const testStartTime = Date.now();

    const rampSteps = [
      { concurrency: Math.ceil(CONFIG.concurrency * 0.25), duration: Math.ceil(CONFIG.rampUpTime / 3) },
      { concurrency: Math.ceil(CONFIG.concurrency * 0.5),  duration: Math.ceil(CONFIG.rampUpTime / 3) },
      { concurrency: CONFIG.concurrency,                    duration: Math.ceil(CONFIG.rampUpTime / 3) },
    ];

    console.log('[Phase 1/4] Ramp-up...');
    for (const step of rampSteps) {
      await runPhase(`Ramp ${step.concurrency}`, step.concurrency, step.duration * 1000, seededLeads);
    }

    console.log(`\n[Phase 2/4] Sustained load — ${CONFIG.concurrency} concurrent for ${CONFIG.duration}s...`);
    await runPhase('Sustained', CONFIG.concurrency, CONFIG.duration * 1000, seededLeads);

    const spikeConcurrency = CONFIG.concurrency * CONFIG.spikeMultiplier;
    console.log(`\n[Phase 3/4] Spike — ${spikeConcurrency} concurrent for ${CONFIG.spikeDuration}s...`);
    await runPhase('Spike', spikeConcurrency, CONFIG.spikeDuration * 1000, seededLeads);

    console.log(`\n[Phase 4/4] Cool-down — ${CONFIG.coolDownConcurrency} concurrent for ${CONFIG.coolDownDuration}s...`);
    await runPhase('Cool-down', CONFIG.coolDownConcurrency, CONFIG.coolDownDuration * 1000, seededLeads);

    const testDurationSec = (Date.now() - testStartTime) / 1000;
    const results = printResults(testDurationSec);

    const dupeCheck = await checkDuplicateLeads();

    console.log('\n  PASS/FAIL CRITERIA');
    console.log('  ' + '-'.repeat(60));

    const nonRateLimited = results.totalRequests - results.totalRateLimited;
    const safeErrorRate = nonRateLimited > 0
      ? (results.totalErrors / nonRateLimited) * 100
      : 0;

    const criteria = [
      { name: 'p95 < 3000ms',                    value: `${results.p95}ms`,           pass: results.p95 < 3000 },
      { name: 'Error rate < 2% (excl 429/503)',   value: `${safeErrorRate.toFixed(2)}%`, pass: safeErrorRate < 2 },
      { name: 'Zero unhandled 500s',               value: `${results.totalUnhandled}`,  pass: results.totalUnhandled === 0 },
      { name: 'No duplicate leads (email)',         value: `${dupeCheck.duplicateEmails}`, pass: dupeCheck.duplicateEmails === 0 },
      { name: 'No duplicate leads (phone)',         value: `${dupeCheck.duplicatePhones}`, pass: dupeCheck.duplicatePhones === 0 },
    ];

    for (const c of criteria) {
      console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name.padEnd(35)} ${c.value}`);
    }

    allPassed = criteria.every(c => c.pass);
  } finally {
    await cleanupStressData();
    console.log('\n====================================================\n');
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  cleanupStressData().finally(() => process.exit(1));
});

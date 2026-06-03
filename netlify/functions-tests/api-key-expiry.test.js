// ============================================================================
// MCC API Key Expiry — Smoke Tests (Task #353)
//
// Pure unit tests with an in-memory Supabase stub. No live creds required.
// Run via: node netlify/functions-tests/api-key-expiry.test.js
// ============================================================================

'use strict';

const path = require('path');
const Module = require('module');

let testsRun = 0;
let testsFailed = 0;
async function run(name, fn) {
  testsRun++;
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    testsFailed++;
    console.error(`✗ ${name}\n   ${err.stack || err.message}`);
  }
}
function eq(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg || 'eq failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function truthy(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }

// ---------- module-load isolation ----------
let currentSupabase = {};
// Probe stub — controls what runProbe() returns without hitting real APIs.
// Set currentProbeResult before each probe test.
let currentProbeResult = { working: null, reason: 'test stub' };
const origLoad = Module._load;
const stubs = new Map();
stubs.set('@supabase/supabase-js', { createClient: () => currentSupabase });
const fakeResend = { emails: { send: async () => ({ data: { id: 'fake' } }) } };
stubs.set('resend', { Resend: function() { return fakeResend; } });
stubs.set('../../lib/api-key-probes', { runProbe: async () => currentProbeResult });

Module._load = function(request, parent, ...rest) {
  if (stubs.has(request)) return stubs.get(request);
  return origLoad.call(this, request, parent, ...rest);
};

process.env.SUPABASE_URL = 'http://stub';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';
process.env.ADMIN_PASSWORD = 'test-admin-pw';
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.RESEND_API_KEY = 'rk_stub';

const { TRACKED_KEYS, findKeyConfig } = require(path.resolve(__dirname, '../../lib/api-key-expiry-config'));
const scheduled = require(path.resolve(__dirname, '../functions/api-key-expiry-scheduled'));
const admin = require(path.resolve(__dirname, '../functions/api-key-expiry-admin'));
const stripeShim = require(path.resolve(__dirname, '../functions/stripe-key-expiry-scheduled'));
const stripeAdminShim = require(path.resolve(__dirname, '../functions/stripe-key-expiry-admin'));

function makeSupabaseStub(initial = {}) {
  const tables = {
    ai_ops_settings: initial.ai_ops_settings ? [...initial.ai_ops_settings] : [],
    ai_action_log: initial.ai_action_log ? [...initial.ai_action_log] : [],
    profiles: [{ id: 'stub-admin-id', role: 'admin' }]
  };
  function from(tableName) {
    const rows = tables[tableName] || (tables[tableName] = []);
    const ctx = { _filters: [], _limit: null, _order: null };
    const builder = {
      select() { return builder; },
      eq(col, val) { ctx._filters.push(r => r[col] === val); return builder; },
      in(col, vals) { ctx._filters.push(r => vals.includes(r[col])); return builder; },
      gte(col, val) { ctx._filters.push(r => r[col] >= val); return builder; },
      gt(col, val) { ctx._filters.push(r => r[col] > val); return builder; },
      order() { return builder; },
      limit(n) { ctx._limit = n; return builder; },
      async single() {
        const filtered = rows.filter(r => ctx._filters.every(f => f(r)));
        return { data: filtered[0] || null, error: null };
      },
      async maybeSingle() {
        const filtered = rows.filter(r => ctx._filters.every(f => f(r)));
        return { data: filtered[0] || null, error: null };
      },
      then(resolve) {
        const filtered = rows.filter(r => ctx._filters.every(f => f(r)));
        const limited = ctx._limit ? filtered.slice(0, ctx._limit) : filtered;
        resolve({ data: limited, error: null });
      },
      async insert(row) {
        rows.push({ ...row, id: rows.length + 1 });
        return { data: null, error: null };
      },
      async upsert(row, { onConflict } = {}) {
        const idx = rows.findIndex(r => r[onConflict] === row[onConflict]);
        if (idx >= 0) rows[idx] = { ...rows[idx], ...row };
        else rows.push({ ...row });
        return { data: null, error: null };
      }
    };
    return builder;
  }
  const auth = {
    getUser: async (token) => {
      if (!token) return { data: { user: null }, error: { message: 'no token' } };
      return { data: { user: { id: 'stub-admin-id' } }, error: null };
    }
  };
  return { from, auth, _tables: tables };
}

function plusDaysFromToday(n) {
  const d = new Date();
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  utc.setUTCDate(utc.getUTCDate() + n);
  return utc.toISOString().slice(0, 10);
}

async function main() {
  await run('TRACKED_KEYS includes Stripe entry with backward-compat setting/module', () => {
    const stripe = findKeyConfig('stripe_secret_key');
    truthy(stripe, 'Stripe entry missing');
    eq(stripe.setting_key, 'stripe_key_expiry_date');
    eq(stripe.module, 'stripe_key_expiry');
  });

  await run('TRACKED_KEYS covers HubSpot, Resend, Twilio, Anthropic, Gemini, Google Vision, GitHub', () => {
    const ids = TRACKED_KEYS.map(k => k.id);
    ['hubspot_token', 'resend_api_key', 'twilio_auth_token', 'anthropic_api_key',
     'gemini_api_key', 'google_vision_api_key', 'github_token'
    ].forEach(id => truthy(ids.includes(id), `missing tracked key ${id}`));
  });

  await run('TRACKED_KEYS entries each have required fields', () => {
    TRACKED_KEYS.forEach(k => {
      ['id', 'label', 'env_var', 'setting_key', 'module', 'feature', 'rotation_steps'].forEach(f => {
        truthy(k[f], `entry ${k.id} missing ${f}`);
      });
      truthy(Array.isArray(k.rotation_steps) && k.rotation_steps.length > 0, `${k.id} rotation_steps empty`);
    });
  });

  await run('TRACKED_KEYS ids and setting_keys are unique', () => {
    const idSet = new Set(); const keySet = new Set();
    TRACKED_KEYS.forEach(k => {
      truthy(!idSet.has(k.id), `duplicate id ${k.id}`); idSet.add(k.id);
      truthy(!keySet.has(k.setting_key), `duplicate setting_key ${k.setting_key}`); keySet.add(k.setting_key);
    });
  });

  await run('computeStatus classifies levels correctly', () => {
    eq(scheduled._computeStatus(plusDaysFromToday(10)).level, 'healthy');
    eq(scheduled._computeStatus(plusDaysFromToday(3)).level, 'warning');
    eq(scheduled._computeStatus(plusDaysFromToday(1)).level, 'critical');
    eq(scheduled._computeStatus(plusDaysFromToday(0)).level, 'expired');
    eq(scheduled._computeStatus(plusDaysFromToday(-2)).level, 'expired');
  });

  await run('runChecker skips keys with no configured expiry date', async () => {
    const supabase = makeSupabaseStub();
    const result = await scheduled._runChecker(supabase);
    eq(result.keys_checked, TRACKED_KEYS.length);
    result.results.forEach(r => eq(r.skipped, true));
    const checks = supabase._tables.ai_action_log.filter(r => r.action_type === 'check');
    eq(checks.length, TRACKED_KEYS.length);
  });

  await run('runChecker fires 3-day alert exactly once per cycle', async () => {
    const supabase = makeSupabaseStub({
      ai_ops_settings: [
        { key: 'api_key_expiry__resend_api_key', value: plusDaysFromToday(3), updated_at: new Date().toISOString() }
      ]
    });
    await scheduled._runChecker(supabase, { onlyKeyId: 'resend_api_key' });
    const sent1 = supabase._tables.ai_action_log.filter(r => r.outcome === 'sent');
    eq(sent1.length, 1, 'expected one sent alert');
    eq(sent1[0].action_type, 'alert_3d');
    await scheduled._runChecker(supabase, { onlyKeyId: 'resend_api_key' });
    const sent2 = supabase._tables.ai_action_log.filter(r => r.outcome === 'sent');
    eq(sent2.length, 1, 'duplicate alert sent');
  });

  await run('runChecker fires ONLY alert_1d when 1 day out and supersedes alert_3d (Task #354)', async () => {
    const supabase = makeSupabaseStub({
      ai_ops_settings: [
        { key: 'api_key_expiry__anthropic_api_key', value: plusDaysFromToday(1), updated_at: new Date().toISOString() }
      ]
    });
    await scheduled._runChecker(supabase, { onlyKeyId: 'anthropic_api_key' });
    const sent = supabase._tables.ai_action_log.filter(r => r.outcome === 'sent').map(r => r.action_type).sort();
    eq(sent, ['alert_1d'], 'only the 1-day email should fire on first-eligible run');
    const superseded = supabase._tables.ai_action_log.filter(r => r.outcome === 'superseded').map(r => r.action_type).sort();
    eq(superseded, ['alert_3d'], 'alert_3d should be marked superseded so it never fires later');
    // Second run must not fire either threshold again.
    await scheduled._runChecker(supabase, { onlyKeyId: 'anthropic_api_key' });
    const sent2 = supabase._tables.ai_action_log.filter(r => r.outcome === 'sent');
    eq(sent2.length, 1, 'no duplicate alerts on a follow-up run');
  });

  await run('runChecker fires ONLY alert_expired when already expired and supersedes 3d+1d (Task #354)', async () => {
    const supabase = makeSupabaseStub({
      ai_ops_settings: [
        { key: 'api_key_expiry__anthropic_api_key', value: plusDaysFromToday(-2), updated_at: new Date().toISOString() }
      ]
    });
    await scheduled._runChecker(supabase, { onlyKeyId: 'anthropic_api_key' });
    const sent = supabase._tables.ai_action_log.filter(r => r.outcome === 'sent').map(r => r.action_type).sort();
    eq(sent, ['alert_expired'], 'only the expired email should fire when first-eligible run is past expiry');
    const superseded = supabase._tables.ai_action_log.filter(r => r.outcome === 'superseded').map(r => r.action_type).sort();
    eq(superseded, ['alert_1d', 'alert_3d']);
  });

  await run('runChecker resets the alert ladder when the expiry date changes (Task #354)', async () => {
    // First cycle: expires today → only alert_expired fires; 3d+1d superseded.
    const settingRow = { key: 'api_key_expiry__anthropic_api_key', value: plusDaysFromToday(0), updated_at: new Date(Date.now() - 60000).toISOString() };
    const supabase = makeSupabaseStub({ ai_ops_settings: [settingRow] });
    await scheduled._runChecker(supabase, { onlyKeyId: 'anthropic_api_key' });
    const firstSent = supabase._tables.ai_action_log.filter(r => r.outcome === 'sent').map(r => r.action_type);
    eq(firstSent, ['alert_expired']);
    // Pathological case: admin saves the new date at the EXACT same
    // millisecond that the prior cycle's log was written. With a `gte`
    // window the prior log would silently block the new cycle; with the
    // strict `gt` window (Task #354) the ladder resets correctly.
    const collisionTs = supabase._tables.ai_action_log.find(r => r.action_type === 'alert_expired').created_at;
    settingRow.value = plusDaysFromToday(3);
    settingRow.updated_at = collisionTs;
    await scheduled._runChecker(supabase, { onlyKeyId: 'anthropic_api_key' });
    const allSent = supabase._tables.ai_action_log.filter(r => r.outcome === 'sent').map(r => r.action_type).sort();
    eq(allSent, ['alert_3d', 'alert_expired'], 'date-change must let the lower threshold fire again even when timestamps collide');
  });

  await run('runChecker retries when prior attempt failed (no_resend)', async () => {
    const savedKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const supabase = makeSupabaseStub({
      ai_ops_settings: [
        { key: 'api_key_expiry__gemini_api_key', value: plusDaysFromToday(1), updated_at: new Date().toISOString() }
      ]
    });
    await scheduled._runChecker(supabase, { onlyKeyId: 'gemini_api_key' });
    const failed = supabase._tables.ai_action_log.filter(r => r.outcome === 'failed');
    truthy(failed.length >= 1, 'expected failed alert log');
    process.env.RESEND_API_KEY = savedKey;
    await scheduled._runChecker(supabase, { onlyKeyId: 'gemini_api_key' });
    const sent = supabase._tables.ai_action_log.filter(r => r.outcome === 'sent');
    truthy(sent.length >= 1, 'expected retry to succeed after key restored');
  });

  await run('admin GET / returns all tracked keys', async () => {
    currentSupabase = makeSupabaseStub();
    const res = await admin.handler({
      httpMethod: 'GET',
      path: '/api/admin/api-key-expiry',
      headers: { 'authorization': 'Bearer test-admin-pw' },
      body: ''
    });
    eq(res.statusCode, 200);
    const data = JSON.parse(res.body);
    eq(data.keys.length, TRACKED_KEYS.length);
    data.keys.forEach(k => truthy(k.id && k.label && k.env_var));
  });

  await run('admin POST upserts a key and returns new status', async () => {
    currentSupabase = makeSupabaseStub();
    const res = await admin.handler({
      httpMethod: 'POST',
      path: '/api/admin/api-key-expiry',
      headers: { 'authorization': 'Bearer test-admin-pw' },
      body: JSON.stringify({ key_id: 'twilio_auth_token', expiry_date: '2030-01-15' })
    });
    eq(res.statusCode, 200);
    const data = JSON.parse(res.body);
    eq(data.success, true);
    eq(data.key.id, 'twilio_auth_token');
    eq(data.key.expiry_date, '2030-01-15');
    const row = currentSupabase._tables.ai_ops_settings.find(r => r.key === 'api_key_expiry__twilio_auth_token');
    truthy(row, 'setting row was not persisted');
    eq(row.value, '2030-01-15');
  });

  await run('admin POST rejects unknown key_id', async () => {
    currentSupabase = makeSupabaseStub();
    const res = await admin.handler({
      httpMethod: 'POST',
      path: '/api/admin/api-key-expiry',
      headers: { 'authorization': 'Bearer test-admin-pw' },
      body: JSON.stringify({ key_id: 'not_real', expiry_date: '2030-01-15' })
    });
    eq(res.statusCode, 400);
  });

  await run('admin POST rejects invalid date format', async () => {
    currentSupabase = makeSupabaseStub();
    const res = await admin.handler({
      httpMethod: 'POST',
      path: '/api/admin/api-key-expiry',
      headers: { 'authorization': 'Bearer test-admin-pw' },
      body: JSON.stringify({ key_id: 'resend_api_key', expiry_date: 'not-a-date' })
    });
    eq(res.statusCode, 400);
  });

  await run('admin unauthenticated request is 401', async () => {
    currentSupabase = makeSupabaseStub();
    const res = await admin.handler({
      httpMethod: 'GET',
      path: '/api/admin/api-key-expiry',
      headers: {},
      body: ''
    });
    eq(res.statusCode, 401);
  });

  await run('legacy /api/admin/stripe-key-expiry GET returns Task #246 shape', async () => {
    currentSupabase = makeSupabaseStub({
      ai_ops_settings: [
        { key: 'stripe_key_expiry_date', value: '2030-06-01', updated_at: new Date().toISOString() }
      ]
    });
    const res = await admin.handler({
      httpMethod: 'GET',
      path: '/api/admin/stripe-key-expiry',
      headers: { 'authorization': 'Bearer test-admin-pw' },
      body: ''
    });
    eq(res.statusCode, 200);
    const data = JSON.parse(res.body);
    truthy(!('keys' in data), 'legacy shape leaked new field');
    eq(data.configured, true);
    eq(data.expiry_date, '2030-06-01');
  });

  await run('legacy /api/admin/stripe-key-expiry POST still works', async () => {
    currentSupabase = makeSupabaseStub();
    const res = await admin.handler({
      httpMethod: 'POST',
      path: '/api/admin/stripe-key-expiry',
      headers: { 'authorization': 'Bearer test-admin-pw' },
      body: JSON.stringify({ expiry_date: '2031-03-04' })
    });
    eq(res.statusCode, 200);
    const data = JSON.parse(res.body);
    eq(data.success, true);
    eq(data.expiry_date, '2031-03-04');
    const row = currentSupabase._tables.ai_ops_settings.find(r => r.key === 'stripe_key_expiry_date');
    truthy(row, 'stripe setting row missing');
  });

  await run('netlify.toml schedules api-key-expiry-scheduled exactly once and does NOT also schedule stripe-key-expiry-scheduled', async () => {
    const fs = require('fs');
    const toml = fs.readFileSync(path.resolve(__dirname, '../../netlify.toml'), 'utf8');
    // Generalized function must be scheduled.
    const genMatches = toml.match(/\[functions\."api-key-expiry-scheduled"\]/g) || [];
    eq(genMatches.length, 1, 'api-key-expiry-scheduled must appear exactly once');
    // Legacy Stripe-only function must NOT be scheduled — having both at the
    // same cron time lets two concurrent invocations race past the
    // (non-atomic) alreadyAlerted check and double-send the same threshold.
    const stripeScheduleMatches = toml.match(/\[functions\."stripe-key-expiry-scheduled"\][\s\S]*?schedule\s*=/g) || [];
    eq(stripeScheduleMatches.length, 0, 'stripe-key-expiry-scheduled must not have a schedule entry (single-cron source of truth)');
  });

  await run('stripe-key-expiry shim re-exports a working _runChecker', async () => {
    truthy(typeof stripeShim._runChecker === 'function');
    truthy(typeof stripeShim.handler === 'function');
    truthy(typeof stripeAdminShim.handler === 'function');
    eq(stripeShim._SETTINGS_KEY, 'stripe_key_expiry_date');
    eq(stripeShim._MODULE, 'stripe_key_expiry');
    const supabase = makeSupabaseStub();
    const result = await stripeShim._runChecker(supabase);
    eq(result.keys_checked, 1);
    eq(result.results[0].key_id, 'stripe_secret_key');
  });

  // ── live probe tests (Task #458) ───────────────────────────────────────────

  await run('probe_ok is logged and no alert sent when probe succeeds', async () => {
    currentProbeResult = { working: true };
    const supabase = makeSupabaseStub();
    const kc = findKeyConfig('anthropic_api_key');
    await scheduled._checkProbeForKey(supabase, kc);
    const okLogs = supabase._tables.ai_action_log.filter(r => r.action_type === 'probe_ok');
    eq(okLogs.length, 1, 'expected probe_ok log entry');
    const alertLogs = supabase._tables.ai_action_log.filter(r => r.action_type === 'probe_alert');
    eq(alertLogs.length, 0, 'no alert on passing probe');
    currentProbeResult = { working: null, reason: 'test stub' };
  });

  await run('probe_alert sent and logged when probe fails', async () => {
    currentProbeResult = { working: false, error: 'HTTP 401: Unauthorized' };
    const supabase = makeSupabaseStub();
    const kc = findKeyConfig('resend_api_key');
    const r = await scheduled._checkProbeForKey(supabase, kc);
    eq(r.probe, 'failed', 'expected probe failed result');
    const alerts = supabase._tables.ai_action_log.filter(r => r.action_type === 'probe_alert');
    eq(alerts.length, 1);
    eq(alerts[0].outcome, 'sent');
    currentProbeResult = { working: null, reason: 'test stub' };
  });

  await run('probe_alert is suppressed when already sent within 24h', async () => {
    currentProbeResult = { working: false, error: 'HTTP 401: Unauthorized' };
    const alreadySentLog = {
      module: 'api_key_expiry__twilio_auth_token',
      action_type: 'probe_alert',
      outcome: 'sent',
      created_at: new Date().toISOString()
    };
    const supabase = makeSupabaseStub({ ai_action_log: [alreadySentLog] });
    const kc = findKeyConfig('twilio_auth_token');
    const r = await scheduled._checkProbeForKey(supabase, kc);
    eq(r.suppressed, true, 'expected suppressed: true');
    const newAlerts = supabase._tables.ai_action_log.filter(r => r.outcome === 'sent' && r.action_type === 'probe_alert');
    eq(newAlerts.length, 1, 'no additional alert should be sent');
    currentProbeResult = { working: null, reason: 'test stub' };
  });

  await run('probe_skipped silently when probe returns working: null', async () => {
    currentProbeResult = { working: null, reason: 'signing secret — not probeable via API' };
    const supabase = makeSupabaseStub();
    const kc = findKeyConfig('stripe_webhook_secret');
    const r = await scheduled._checkProbeForKey(supabase, kc);
    eq(r.probe_skipped, true);
    eq(supabase._tables.ai_action_log.length, 0, 'no log entries for skipped probe');
    currentProbeResult = { working: null, reason: 'test stub' };
  });

  await run('runChecker probe_results included in output when probes run', async () => {
    currentProbeResult = { working: true };
    const supabase = makeSupabaseStub();
    const result = await scheduled._runChecker(supabase, { onlyKeyId: 'github_token' });
    truthy(Array.isArray(result.probe_results), 'probe_results should be array');
    eq(result.probe_results.length, 1);
    eq(result.probe_results[0].probe, 'ok');
    currentProbeResult = { working: null, reason: 'test stub' };
  });

  await run('runChecker with skipProbes:true omits probe_results', async () => {
    const supabase = makeSupabaseStub();
    const result = await scheduled._runChecker(supabase, { onlyKeyId: 'github_token', skipProbes: true });
    eq(result.probe_results, undefined);
  });

  console.log(`\n${testsRun - testsFailed}/${testsRun} passed`);
  Module._load = origLoad;
  process.exit(testsFailed === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });

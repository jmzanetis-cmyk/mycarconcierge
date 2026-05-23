// ============================================================================
// concierge-push-notifier-scheduled smoke tests (Task #333)
//
// In-process tests for netlify/functions/concierge-push-notifier-scheduled.js.
// Stubs Supabase with a chainable mock + global.fetch (FCM v1). Coverage:
//
//   1. Anonymous HTTP caller is rejected with 401.
//   2. Scheduled invocation with no prior cursor SEEDS the cursor and
//      returns seeded:true (does not back-fire old events).
//   3. concierge.driver_assigned → push fires to the assigned driver's
//      profile_id (only their device token is hit).
//   4. concierge.job_accepted → push fires to the OTHER paired driver, not
//      to the driver who accepted.
//   5. concierge.leg_started against an in_progress job whose first
//      in_progress|completed leg matches payload.leg_id → MEMBER push.
//   6. concierge.leg_started for a NON-first leg → skipped (no push).
//   7. concierge.job_completed → member push.
//   8. Cursor advances to the highest processed event id.
//
// Run with:  node netlify/functions-tests/concierge-push-notifier.test.js
// ============================================================================

'use strict';

const assert = require('assert');
const path = require('path');

process.env.ADMIN_PASSWORD = 'test-admin-pass';
process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-key';
process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({
  client_email: 'svc@stub.iam.gserviceaccount.com',
  // PKCS#8 RSA private key only used by node:crypto to sign the OAuth JWT;
  // we stub fetch so the resulting JWT is never actually validated. This is
  // a valid 2048-bit test key (the value is throwaway / never deployed).
  private_key: TEST_PRIVATE_KEY(),
  project_id: 'mcc-test'
});

// ----- Supabase stub --------------------------------------------------------
// Per-table behavior is configured via dbState. Each table maps to an object
// with optional handlers: { select, insert, update, upsert, eq, gt, like, in,
// neq, order, limit, maybeSingle, then } — but we keep it simpler: each
// terminal call (maybeSingle / then-on-array via await) returns a canned
// result based on the table + filters.

let dbState = {};
let lastUpdates = [];

function makeChain(table) {
  const filters = {};
  const self = {
    select() { return self; },
    eq(col, val) { filters[col] = val; return self; },
    gt(col, val) { filters['__gt_' + col] = val; return self; },
    like(col, val) { filters['__like_' + col] = val; return self; },
    in(col, arr) { filters['__in_' + col] = arr; return self; },
    neq(col, val) { filters['__neq_' + col] = val; return self; },
    order() { return self; },
    limit() { return self; },
    async maybeSingle() {
      const fn = dbState[table]?.maybeSingle;
      if (typeof fn === 'function') return fn(filters);
      return { data: null, error: null };
    },
    insert(row) {
      lastUpdates.push({ op: 'insert', table, row });
      return Promise.resolve({ data: null, error: null });
    },
    update(patch) {
      lastUpdates.push({ op: 'update', table, patch, filters: { ...filters } });
      const upd = {
        eq(col, val) { filters[col] = val; return upd; },
        in(col, arr) { filters['__in_' + col] = arr; return upd; },
        then(cb) { return Promise.resolve({ data: null, error: null }).then(cb); }
      };
      return upd;
    },
    upsert(row) {
      lastUpdates.push({ op: 'upsert', table, row });
      return Promise.resolve({ data: null, error: null });
    },
    // Awaiting the chain directly (no maybeSingle) returns a list result.
    then(onFulfilled, onRejected) {
      const fn = dbState[table]?.list;
      const result = typeof fn === 'function' ? fn(filters) : { data: [], error: null };
      return Promise.resolve(result).then(onFulfilled, onRejected);
    }
  };
  return self;
}

const stubClient = {
  from(table) { return makeChain(table); }
};

// Inject the stub by overriding the utils.createSupabaseClient import path.
const Module = require('module');
const origRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === './utils' || id === '../functions/utils') {
    return {
      createSupabaseClient: () => stubClient,
      isValidUUID: () => true,
      successResponse: (body) => ({ statusCode: 200, body: JSON.stringify(body) }),
      errorResponse: (s, m) => ({ statusCode: s, body: JSON.stringify({ error: m }) }),
      optionsResponse: () => ({ statusCode: 204, body: '' })
    };
  }
  return origRequire.apply(this, arguments);
};

// Stub global.fetch — FCM OAuth + v1 send + Resend + Slack all go through here.
let fetchCalls = [];
global.fetch = async (url, opts) => {
  fetchCalls.push({ url: String(url), opts });
  if (String(url).startsWith('https://oauth2.googleapis.com/token')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'fake-oauth-token', expires_in: 3600 })
    };
  }
  if (String(url).includes('fcm.googleapis.com')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ name: 'projects/mcc-test/messages/fake' })
    };
  }
  // Task #435 — stall alert channels: Resend + Slack
  if (String(url).includes('resend.com') || String(url).includes('slack.com')) {
    return { ok: true, status: 200, json: async () => ({ id: 'stub' }) };
  }
  throw new Error('unexpected fetch: ' + url);
};

// Now require the handler (after the require interceptor is in place).
const handlerPath = path.join(__dirname, '..', 'functions', 'concierge-push-notifier-scheduled.js');
delete require.cache[require.resolve(handlerPath)];
const mod = require(handlerPath);
const { runOnce, handleEvent, checkStall, writeHeartbeat, HEARTBEAT_KEY, STALL_ALERT_KEY } = mod._internal;

// ----- Helpers --------------------------------------------------------------
function resetState() {
  dbState = {};
  lastUpdates = [];
  fetchCalls = [];
}

function setupCursor(value) {
  dbState.ai_ops_settings = {
    maybeSingle: () => ({ data: value == null ? null : { value: String(value) }, error: null })
  };
}

function setupAgentEvents(events) {
  dbState.agent_events = {
    list: () => ({ data: events, error: null }),
    maybeSingle: () => ({ data: events[events.length - 1] || null, error: null })
  };
}

// ----- Tests ----------------------------------------------------------------
async function test1_anonymous_rejected() {
  resetState();
  // Bare anonymous HTTP POST → 401.
  const res = await mod.handler({ httpMethod: 'POST', headers: {}, body: '' });
  assert.strictEqual(res.statusCode, 401, 'anonymous should get 401');

  // Spoof attempt 1: attacker sets user-agent: netlify on a real HTTP request.
  // Since httpMethod is present, isScheduledInvocation is bypassed → 401.
  const spoof1 = await mod.handler({
    httpMethod: 'POST',
    headers: { 'user-agent': 'Netlify-Functions/2.0' },
    body: ''
  });
  assert.strictEqual(spoof1.statusCode, 401, 'spoofed user-agent should still 401');

  // Spoof attempt 2: attacker sets x-nf-event header on a real HTTP request.
  const spoof2 = await mod.handler({
    httpMethod: 'POST',
    headers: { 'x-nf-event': 'scheduled' },
    body: ''
  });
  assert.strictEqual(spoof2.statusCode, 401, 'spoofed x-nf-event should still 401');

  // Spoof attempt 3: attacker posts body `__scheduled` over HTTP.
  const spoof3 = await mod.handler({
    httpMethod: 'POST',
    headers: {},
    body: '__scheduled'
  });
  assert.strictEqual(spoof3.statusCode, 401, 'spoofed scheduled body should still 401');

  // Spoof attempt 4: attacker posts the real Netlify scheduled body shape
  // (`{next_run: ...}`) over HTTP. Still must 401 because httpMethod is set.
  const spoof4 = await mod.handler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ next_run: '2026-06-01T00:00:00Z' })
  });
  assert.strictEqual(spoof4.statusCode, 401, 'spoofed scheduled body over HTTP should still 401');

  // Admin GET → 405 (POST required for on-demand).
  const adminGet = await mod.handler({
    httpMethod: 'GET',
    headers: { 'x-admin-password': 'test-admin-pass' },
    body: ''
  });
  assert.strictEqual(adminGet.statusCode, 405, 'admin GET should be 405');

  console.log('  ✓ Test 1: anonymous + spoofed scheduled HTTP rejected (401); admin GET rejected (405)');
}

async function test2_seed_cursor_on_first_run() {
  resetState();
  setupCursor(null);
  setupAgentEvents([{ id: 42, event_type: 'concierge.driver_assigned', payload: {} }]);
  const out = await runOnce(stubClient);
  assert.strictEqual(out.seeded, true);
  assert.strictEqual(out.cursor, 42);
  const upserted = lastUpdates.find(u => u.op === 'upsert' && u.table === 'ai_ops_settings');
  assert.ok(upserted, 'cursor upsert happened');
  assert.strictEqual(upserted.row.value, '42');
  console.log('  ✓ Test 2: first run seeds cursor without firing pushes');
}

async function test3_driver_assigned_pushes_assigned_driver() {
  resetState();
  setupCursor(100);
  setupAgentEvents([{
    id: 101, event_type: 'concierge.driver_assigned',
    payload: { job_id: 'job-1', driver_id: 'driver-1', role: 'primary' }
  }]);
  dbState.drivers = {
    maybeSingle: (f) => f.id === 'driver-1'
      ? { data: { id: 'driver-1', profile_id: 'profile-d1', full_name: 'Alice' }, error: null }
      : { data: null, error: null }
  };
  dbState.concierge_jobs = {
    maybeSingle: () => ({ data: { id: 'job-1', member_id: 'm1', status: 'scheduled', scheduled_start_at: '2026-06-01T10:00:00Z' }, error: null })
  };
  dbState.device_push_tokens = {
    list: (f) => {
      if (f.member_id === 'profile-d1') return { data: [{ token: 'tok-driver1', platform: 'ios' }], error: null };
      return { data: [], error: null };
    }
  };

  const out = await runOnce(stubClient);
  assert.strictEqual(out.processed, 1);
  const fcmSends = fetchCalls.filter(c => c.url.includes('fcm.googleapis.com'));
  assert.strictEqual(fcmSends.length, 1, 'one FCM send');
  const body = JSON.parse(fcmSends[0].opts.body);
  assert.strictEqual(body.message.token, 'tok-driver1');
  assert.ok(/assigned/i.test(body.message.notification.title));
  console.log('  ✓ Test 3: driver_assigned pushes only the assigned driver');
}

async function test4_job_accepted_notifies_other_driver() {
  resetState();
  setupCursor(200);
  setupAgentEvents([{
    id: 201, event_type: 'concierge.job_accepted',
    payload: { job_id: 'job-2', driver_id: 'driver-A', role: 'primary' }
  }]);
  // concierge_job_drivers list: when filtered by job_id and neq(driver_id, driver-A),
  // return driver-B.
  dbState.concierge_job_drivers = {
    list: (f) => {
      if (f.job_id === 'job-2' && f.__neq_driver_id === 'driver-A') {
        return { data: [{ driver_id: 'driver-B', role: 'secondary' }], error: null };
      }
      return { data: [], error: null };
    }
  };
  dbState.drivers = {
    maybeSingle: (f) => f.id === 'driver-B'
      ? { data: { id: 'driver-B', profile_id: 'profile-dB', full_name: 'Bob' }, error: null }
      : { data: null, error: null }
  };
  dbState.device_push_tokens = {
    list: (f) => f.member_id === 'profile-dB'
      ? { data: [{ token: 'tok-driverB', platform: 'android' }], error: null }
      : { data: [], error: null }
  };

  const out = await runOnce(stubClient);
  const fcmSends = fetchCalls.filter(c => c.url.includes('fcm.googleapis.com'));
  assert.strictEqual(fcmSends.length, 1);
  const body = JSON.parse(fcmSends[0].opts.body);
  assert.strictEqual(body.message.token, 'tok-driverB');
  assert.ok(/partner/i.test(body.message.notification.title));
  console.log('  ✓ Test 4: job_accepted notifies only the OTHER paired driver');
}

async function test5_leg_started_first_leg_pushes_member() {
  resetState();
  setupCursor(300);
  setupAgentEvents([{
    id: 301, event_type: 'concierge.leg_started',
    payload: { job_id: 'job-3', leg_id: 'leg-1', driver_id: 'driver-1' }
  }]);
  dbState.concierge_jobs = {
    maybeSingle: () => ({ data: { id: 'job-3', member_id: 'member-1', status: 'in_progress' }, error: null })
  };
  // legs list: lowest-sequence in_progress|completed leg == leg-1 → "first"
  dbState.concierge_job_legs = {
    list: (f) => ({ data: [{ id: 'leg-1', sequence: 1, status: 'in_progress' }], error: null })
  };
  dbState.member_notification_preferences = {
    maybeSingle: () => ({ data: null, error: null }) // default allow
  };
  dbState.device_push_tokens = {
    list: (f) => f.member_id === 'member-1'
      ? { data: [{ token: 'tok-member1', platform: 'ios' }], error: null }
      : { data: [], error: null }
  };

  const out = await runOnce(stubClient);
  const fcmSends = fetchCalls.filter(c => c.url.includes('fcm.googleapis.com'));
  assert.strictEqual(fcmSends.length, 1);
  const body = JSON.parse(fcmSends[0].opts.body);
  assert.strictEqual(body.message.token, 'tok-member1');
  assert.ok(/in progress/i.test(body.message.notification.title));
  console.log('  ✓ Test 5: leg_started (first leg) pushes member');
}

async function test5b_leg_started_after_job_completed_still_fires() {
  // Regression: a short job may flip to 'completed' before the every-minute
  // worker drains the leg_started event. Member must still receive the
  // first-leg "in progress" push — the handler must NOT gate on job.status.
  resetState();
  setupCursor(350);
  setupAgentEvents([{
    id: 351, event_type: 'concierge.leg_started',
    payload: { job_id: 'job-3b', leg_id: 'leg-1', driver_id: 'driver-1' }
  }]);
  dbState.concierge_jobs = {
    // Job already completed by the time the event is processed.
    maybeSingle: () => ({ data: { id: 'job-3b', member_id: 'member-1', status: 'completed' }, error: null })
  };
  dbState.concierge_job_legs = {
    list: () => ({ data: [{ id: 'leg-1', sequence: 1, status: 'completed' }], error: null })
  };
  dbState.member_notification_preferences = { maybeSingle: () => ({ data: null, error: null }) };
  dbState.device_push_tokens = {
    list: (f) => f.member_id === 'member-1'
      ? { data: [{ token: 'tok-mem1b', platform: 'ios' }], error: null }
      : { data: [], error: null }
  };

  await runOnce(stubClient);
  const fcmSends = fetchCalls.filter(c => c.url.includes('fcm.googleapis.com'));
  assert.strictEqual(fcmSends.length, 1, 'must fire even though job already completed');
  const body = JSON.parse(fcmSends[0].opts.body);
  assert.strictEqual(body.message.token, 'tok-mem1b');
  assert.ok(/in progress/i.test(body.message.notification.title));
  console.log('  ✓ Test 5b: leg_started fires member push even if job already flipped to completed');
}

async function test6_leg_started_non_first_skipped() {
  resetState();
  setupCursor(400);
  setupAgentEvents([{
    id: 401, event_type: 'concierge.leg_started',
    payload: { job_id: 'job-4', leg_id: 'leg-2', driver_id: 'driver-1' }
  }]);
  dbState.concierge_jobs = {
    maybeSingle: () => ({ data: { id: 'job-4', member_id: 'member-1', status: 'in_progress' }, error: null })
  };
  // leg_id 'leg-2' is NOT the lowest-sequence; lowest in_progress|completed is leg-1.
  dbState.concierge_job_legs = {
    list: () => ({ data: [{ id: 'leg-1', sequence: 1, status: 'completed' }], error: null })
  };

  const out = await runOnce(stubClient);
  const fcmSends = fetchCalls.filter(c => c.url.includes('fcm.googleapis.com'));
  assert.strictEqual(fcmSends.length, 0, 'no push for non-first leg');
  assert.strictEqual(out.results[0].skipped, 'not_first_leg');
  console.log('  ✓ Test 6: leg_started for non-first leg is skipped');
}

async function test7_job_completed_pushes_member() {
  resetState();
  setupCursor(500);
  setupAgentEvents([{
    id: 501, event_type: 'concierge.job_completed',
    payload: { job_id: 'job-5' }
  }]);
  dbState.concierge_jobs = {
    maybeSingle: () => ({ data: { id: 'job-5', member_id: 'member-5', status: 'completed' }, error: null })
  };
  dbState.member_notification_preferences = { maybeSingle: () => ({ data: null, error: null }) };
  dbState.device_push_tokens = {
    list: (f) => f.member_id === 'member-5'
      ? { data: [{ token: 'tok-mem5', platform: 'ios' }], error: null }
      : { data: [], error: null }
  };

  const out = await runOnce(stubClient);
  const fcmSends = fetchCalls.filter(c => c.url.includes('fcm.googleapis.com'));
  assert.strictEqual(fcmSends.length, 1);
  const body = JSON.parse(fcmSends[0].opts.body);
  assert.ok(/complete/i.test(body.message.notification.title));
  console.log('  ✓ Test 7: job_completed pushes member');
}

async function test8_cursor_advances_to_highest_event() {
  resetState();
  setupCursor(600);
  // Multiple events; cursor should advance to 603.
  setupAgentEvents([
    { id: 601, event_type: 'concierge.unhandled_type', payload: {} },
    { id: 602, event_type: 'concierge.unhandled_type', payload: {} },
    { id: 603, event_type: 'concierge.unhandled_type', payload: {} }
  ]);

  const out = await runOnce(stubClient);
  assert.strictEqual(out.cursor, 603);
  const upserted = lastUpdates.find(u => u.op === 'upsert' && u.table === 'ai_ops_settings');
  assert.strictEqual(upserted.row.value, '603');
  console.log('  ✓ Test 8: cursor advances to highest processed event id');
}

// Task #435 — stall detection tests
async function test9_stall_detection_no_alert_when_fresh() {
  resetState();
  const freshHeartbeat = { updated_at: new Date().toISOString(), value: '{}' };
  const alertsSent = fetchCalls.filter(f => f.url.includes('resend.com') || f.url.includes('slack.com')).length;
  await checkStall(stubClient, freshHeartbeat);
  const alertsAfter = fetchCalls.filter(f => f.url.includes('resend.com') || f.url.includes('slack.com')).length;
  assert.strictEqual(alertsSent, alertsAfter, 'no alert when heartbeat is fresh');
  console.log('  ✓ Test 9: no stall alert when heartbeat is recent');
}

async function test10_stall_detection_alerts_when_stale() {
  resetState();
  process.env.RESEND_API_KEY = 'rk_test';
  process.env.ADMIN_NOTIFICATION_EMAIL = 'admin@example.com';
  // Heartbeat 10 minutes old (well past 3-min threshold)
  const staleTs = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const staleHeartbeat = { updated_at: staleTs, value: '{}' };
  // No prior stall alert row in db
  dbState.ai_ops_settings = { maybeSingle: (f) => ({ data: null, error: null }) };

  const before = fetchCalls.filter(f => f.url.includes('resend.com')).length;
  await checkStall(stubClient, staleHeartbeat);
  const after = fetchCalls.filter(f => f.url.includes('resend.com')).length;
  assert.ok(after > before, 'expected Resend call for stale heartbeat');

  // Stall alert key should have been written
  const staleSaved = lastUpdates.filter(u => u.op === 'upsert' && u.table === 'ai_ops_settings' && u.row?.key === STALL_ALERT_KEY);
  assert.ok(staleSaved.length > 0, 'expected stall alert timestamp to be saved');
  console.log('  ✓ Test 10: stall alert sent when heartbeat is stale');
}

async function test11_stall_suppressed_within_cooldown() {
  resetState();
  process.env.RESEND_API_KEY = 'rk_test';
  process.env.ADMIN_NOTIFICATION_EMAIL = 'admin@example.com';
  const staleTs = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const staleHeartbeat = { updated_at: staleTs, value: '{}' };
  // Stall alert was sent 5 minutes ago (within 30-min cooldown)
  const recentAlert = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  dbState.ai_ops_settings = {
    maybeSingle: (f) => {
      if (f.key === STALL_ALERT_KEY) return { data: { value: recentAlert }, error: null };
      return { data: null, error: null };
    }
  };
  const before = fetchCalls.filter(f => f.url.includes('resend.com')).length;
  await checkStall(stubClient, staleHeartbeat);
  const after = fetchCalls.filter(f => f.url.includes('resend.com')).length;
  assert.strictEqual(before, after, 'stall alert suppressed within cooldown');
  console.log('  ✓ Test 11: stall alert suppressed within cooldown window');
}

// ----- Throwaway test private key (PKCS#8 RSA-2048) -------------------------
function TEST_PRIVATE_KEY() {
  // Generated once with: openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048
  // This key is throwaway test material — never used in production.
  const crypto = require('node:crypto');
  if (!global.__cachedTestKey) {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    global.__cachedTestKey = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  }
  return global.__cachedTestKey;
}

// ----- Runner ---------------------------------------------------------------
(async () => {
  console.log('concierge-push-notifier-scheduled.test.js');
  try {
    await test1_anonymous_rejected();
    await test2_seed_cursor_on_first_run();
    await test3_driver_assigned_pushes_assigned_driver();
    await test4_job_accepted_notifies_other_driver();
    await test5_leg_started_first_leg_pushes_member();
    await test5b_leg_started_after_job_completed_still_fires();
    await test6_leg_started_non_first_skipped();
    await test7_job_completed_pushes_member();
    await test8_cursor_advances_to_highest_event();
    await test9_stall_detection_no_alert_when_fresh();
    await test10_stall_detection_alerts_when_stale();
    await test11_stall_suppressed_within_cooldown();
    console.log('\nAll 12 concierge-push-notifier tests passed.\n');
  } catch (e) {
    console.error('\nTest failed:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();

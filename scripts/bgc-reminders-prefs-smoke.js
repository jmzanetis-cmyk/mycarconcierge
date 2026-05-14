#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Task #202 — Offline smoke test for the BGC reminder + alert engine's
// per-provider preference handling.
//
// scripts/bgc-reminders-smoke.js already covers the dedupe path against a
// real Supabase. This sibling test stubs out @supabase/supabase-js entirely
// (mirroring scripts/bgc-launch-broadcast-smoke.js) so it can run in CI
// without any network or credentials, and exercises the four mute / opt-in
// permutations introduced by Task #159's `provider_notification_prefs`
// table:
//
//   1. No prefs row, 30-day check
//        → 1 reminder_30 notification + 1 bgc_expiring alert (default ON)
//   2. `bgc_reminder_30 = false`, 30-day check
//        → 0 notifications + 0 alerts (mute is comprehensive — Task #202)
//   3. `bgc_reminder_1 = true`, 1-day check
//        → 1 reminder_1 notification + 1 bgc_expiring alert (opt-in fires)
//   4. No prefs row, 1-day check
//        → 0 notifications + 0 alerts (1-day defaults to OFF)
//
// Run from project root:
//   node scripts/bgc-reminders-prefs-smoke.js
//
// Exit codes: 0 all passed, 1 any check failed.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('node:path');

let pass = 0;
let fail = 0;
function ok(msg)  { pass++; console.log('  ✓', msg); }
function bad(msg) { fail++; console.error('  ✗', msg); }
function expect(cond, msg) { cond ? ok(msg) : bad(msg); }

// ─── In-memory Supabase stub ────────────────────────────────────────────────
// One `state` per scenario; reset() is called before each run. The handler
// only uses a small subset of the PostgREST builder API: select / eq / is /
// gte / lt / maybeSingle / single / insert / update — plus an `await` on
// the builder to mean "give me the array".
const state = { tables: {} };
function table(name) {
  if (!state.tables[name]) state.tables[name] = [];
  return state.tables[name];
}
function reset() { state.tables = {}; }

function applyOps(rows, ops) {
  let out = rows.slice();
  for (const op of ops) {
    if (op.kind === 'eq') {
      out = out.filter(r => r[op.col] === op.val || String(r[op.col]) === String(op.val));
    } else if (op.kind === 'is') {
      if (op.val === null) out = out.filter(r => r[op.col] == null);
      else                 out = out.filter(r => r[op.col] === op.val);
    } else if (op.kind === 'gte') {
      out = out.filter(r => r[op.col] != null && r[op.col] >= op.val);
    } else if (op.kind === 'lt') {
      out = out.filter(r => r[op.col] != null && r[op.col] <  op.val);
    }
  }
  return out;
}

function projectColumns(rows, columns) {
  if (!columns || columns === '*') return rows;
  const cols = columns.split(',').map(s => s.trim());
  return rows.map(r => {
    const o = {};
    for (const c of cols) o[c] = r[c];
    return o;
  });
}

function makeQuery(name) {
  const ops = [];
  let columns = '*';
  let pendingInsert = null;
  let pendingUpdate = null;
  let returning = false;

  const exec = (mode) => {
    // INSERT (optionally with .select(...).single() to return the row)
    if (pendingInsert) {
      const arr = table(name);
      const inserted = pendingInsert.map(r => ({ ...r }));
      arr.push(...inserted);
      if (returning) {
        const projected = projectColumns(inserted, columns);
        if (mode === 'single' || mode === 'maybeSingle') {
          return { data: projected[0] || null, error: null };
        }
        return { data: projected, error: null };
      }
      return { data: null, error: null };
    }
    // UPDATE (.update({...}).eq('id', x) — awaited)
    if (pendingUpdate) {
      const matches = applyOps(table(name), ops);
      matches.forEach(r => Object.assign(r, pendingUpdate));
      return { data: null, error: null };
    }
    // SELECT
    let rows = applyOps(table(name), ops);
    rows = projectColumns(rows, columns);
    if (mode === 'single' || mode === 'maybeSingle') {
      return { data: rows[0] || null, error: null };
    }
    return { data: rows, error: null };
  };

  const builder = {
    select(c)         { columns = c; if (pendingInsert || pendingUpdate) returning = true; return builder; },
    eq(col, val)      { ops.push({ kind: 'eq',  col, val }); return builder; },
    is(col, val)      { ops.push({ kind: 'is',  col, val }); return builder; },
    gte(col, val)     { ops.push({ kind: 'gte', col, val }); return builder; },
    lt(col, val)      { ops.push({ kind: 'lt',  col, val }); return builder; },
    insert(row)       { pendingInsert = Array.isArray(row) ? row : [row]; return builder; },
    update(patch)     { pendingUpdate = patch; return builder; },
    maybeSingle()     { return Promise.resolve(exec('maybeSingle')); },
    single()          { return Promise.resolve(exec('single')); },
    then(onF, onR)    { return Promise.resolve(exec('many')).then(onF, onR); }
  };
  return builder;
}

const supabaseStub = { from: makeQuery };

// Hijack require('@supabase/supabase-js') so utils.createSupabaseClient()
// returns our stub. The Netlify functions tree carries its own nested
// node_modules copy of @supabase/supabase-js, so we have to seed the cache
// for BOTH the root install and the nested one — utils.js resolves through
// the nested path, scripts run from the root path.
const supabaseExports = { createClient: () => supabaseStub };
function hijack(fromPaths, name) {
  try {
    const p = require.resolve(name, { paths: fromPaths });
    require.cache[p] = { id: p, filename: p, loaded: true, exports: supabaseExports };
  } catch { /* not installed at that path — fine */ }
}
hijack([__dirname, path.join(__dirname, '..')],                 '@supabase/supabase-js');
hijack([path.join(__dirname, '..', 'netlify', 'functions')],    '@supabase/supabase-js');

// utils.createSupabaseClient() bails out and returns null when these env vars
// are missing, which would short-circuit the whole handler.
process.env.SUPABASE_URL = 'https://stub';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';
// Force pure dry-run mode — no Resend / Twilio HTTP. The handler still
// writes the dedupe row in dry-run, which is what we assert against.
delete process.env.RESEND_API_KEY;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;
delete process.env.TWILIO_PHONE_NUMBER;

const { handler } = require(path.join(__dirname, '..', 'netlify', 'functions', 'bgc-send-reminders.js'));

// ─── Fixture builders ──────────────────────────────────────────────────────
function isoDaysFromNow(days) {
  // Mirror the handler's "today + N days at 00:00 local" window so the check
  // lands inside the half-open [lo, lo+1d) bucket the cron computes.
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

function seedProvider({ providerId, employeeId, checkId, daysOut, prefs }) {
  table('profiles').push({
    id: providerId,
    business_name: 'Smoke Garage',
    full_name: 'Smoke Owner',
    email: 'smoke@example.test',
    phone: null,
    bgc_badge_verified: true
  });
  table('provider_employees').push({
    id: employeeId,
    provider_id: providerId,
    first_name: 'Smoke',
    last_name: 'Test',
    email: 'emp@example.test'
  });
  table('employee_background_checks').push({
    id: checkId,
    employee_id: employeeId,
    provider_id: providerId,
    status: 'clear',
    is_current: true,
    expires_at: isoDaysFromNow(daysOut)
  });
  if (prefs) {
    table('provider_notification_prefs').push({ provider_id: providerId, ...prefs });
  }
}

function notifs(employeeId, checkId) {
  return (state.tables['bgc_notifications'] || [])
    .filter(n => n.employee_id === employeeId && n.bgc_check_id === checkId);
}
function alerts(providerId) {
  return (state.tables['provider_alerts'] || [])
    .filter(a => a.provider_id === providerId && a.resolved_at == null);
}

// ─── Scenarios ─────────────────────────────────────────────────────────────
async function scenarioDefault30() {
  console.log('\nScenario 1: no prefs row, 30-day check → reminder_30 + bgc_expiring alert');
  reset();
  seedProvider({
    providerId: 'p-1', employeeId: 'e-1', checkId: 'c-1',
    daysOut: 30, prefs: null
  });
  await handler({});
  const ns = notifs('e-1', 'c-1');
  const as = alerts('p-1');
  expect(ns.length === 1, `1 notification (got ${ns.length})`);
  expect(ns[0] && ns[0].notification_type === 'reminder_30',
    `notification_type = reminder_30 (got ${ns[0] && ns[0].notification_type})`);
  expect(as.length === 1, `1 open alert (got ${as.length})`);
  expect(as[0] && as[0].alert_type === 'bgc_expiring',
    `alert_type = bgc_expiring (got ${as[0] && as[0].alert_type})`);
  expect(as[0] && as[0].severity === 'warning',
    `severity = warning (got ${as[0] && as[0].severity})`);
}

async function scenarioMuted30() {
  console.log('\nScenario 2: bgc_reminder_30 = false, 30-day check → silent');
  reset();
  seedProvider({
    providerId: 'p-2', employeeId: 'e-2', checkId: 'c-2',
    daysOut: 30,
    prefs: {
      bgc_reminder_60: true,  bgc_reminder_30: false, bgc_reminder_14: true,
      bgc_reminder_7:  true,  bgc_reminder_1:  false,
      bgc_reminder_60_sms: false, bgc_reminder_30_sms: false, bgc_reminder_14_sms: false,
      bgc_reminder_7_sms:  false, bgc_reminder_1_sms:  false,
      sms_phone: null
    }
  });
  await handler({});
  const ns = notifs('e-2', 'c-2');
  const as = alerts('p-2');
  expect(ns.length === 0, `0 notifications (got ${ns.length})`);
  expect(as.length === 0, `0 alerts (got ${as.length})`);
}

async function scenarioOptIn1() {
  console.log('\nScenario 3: bgc_reminder_1 = true, 1-day check → reminder_1 + alert');
  reset();
  seedProvider({
    providerId: 'p-3', employeeId: 'e-3', checkId: 'c-3',
    daysOut: 1,
    prefs: {
      bgc_reminder_60: true, bgc_reminder_30: true, bgc_reminder_14: true,
      bgc_reminder_7:  true, bgc_reminder_1:  true,
      bgc_reminder_60_sms: false, bgc_reminder_30_sms: false, bgc_reminder_14_sms: false,
      bgc_reminder_7_sms:  false, bgc_reminder_1_sms:  false,
      sms_phone: null
    }
  });
  await handler({});
  const ns = notifs('e-3', 'c-3');
  const as = alerts('p-3');
  expect(ns.length === 1, `1 notification (got ${ns.length})`);
  expect(ns[0] && ns[0].notification_type === 'reminder_1',
    `notification_type = reminder_1 (got ${ns[0] && ns[0].notification_type})`);
  expect(as.length === 1, `1 open alert (got ${as.length})`);
  expect(as[0] && as[0].alert_type === 'bgc_expiring',
    `alert_type = bgc_expiring (got ${as[0] && as[0].alert_type})`);
}

async function scenarioDefault1() {
  console.log('\nScenario 4: no prefs row, 1-day check → silent (1-day defaults to OFF)');
  reset();
  seedProvider({
    providerId: 'p-4', employeeId: 'e-4', checkId: 'c-4',
    daysOut: 1, prefs: null
  });
  await handler({});
  const ns = notifs('e-4', 'c-4');
  const as = alerts('p-4');
  expect(ns.length === 0, `0 notifications (got ${ns.length})`);
  expect(as.length === 0, `0 alerts (got ${as.length})`);
}

(async () => {
  try {
    await scenarioDefault30();
    await scenarioMuted30();
    await scenarioOptIn1();
    await scenarioDefault1();
  } catch (err) {
    console.error('FATAL:', err.stack || err.message || err);
    process.exit(1);
  }
  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
})();

#!/usr/bin/env node
/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────────────
// Task #126 — Gatekeeper enablement smoke test.
//
// The supervised enablement run for the Gatekeeper review agent. After the
// operator applies `supabase/migrations/20260424_enable_gatekeeper.sql` in the
// Supabase SQL Editor (or flips the toggle in /admin/agent-fleet.html),
// run this script to:
//
//   1. Verify the registry row reflects the enable flip
//      (enabled=true, autonomy=propose, daily_spend_cap_usd=3.00, model set)
//   2. Verify today's spend headroom is intact (< $3 cap)
//   3. Emit one synthetic test event for each of the three Gatekeeper inputs
//      via POST /api/admin/agent-fleet/test-event
//      ─ provider.applied
//      ─ provider.bgc_completed
//      ─ provider.flagged
//   4. Force an orchestrator tick (POST /api/admin/agent-fleet/run/orchestrator)
//      to dispatch immediately rather than waiting for the cron
//   5. Poll agent_actions for proposed rows linked to each emitted event_id
//      (60s timeout per event)
//   6. Print a summary table: event_type → action_id, status, recommendation,
//      confidence, cost_usd, ms — exit non-zero if any leg failed
//
// Usage (production):
//
//   SITE_URL=https://mycarconcierge.com \
//   ADMIN_PASSWORD=... \
//   SUPABASE_URL=... \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/gatekeeper-enable-smoke.js
//
// Usage (development / against the local server):
//
//   SITE_URL=http://localhost:5000 \
//   ADMIN_PASSWORD=... \
//   SUPABASE_URL=... \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/gatekeeper-enable-smoke.js
//
// Exit codes:
//   0  all checks pass — Gatekeeper is live and producing proposals
//   1  one or more checks failed — see the printed FAIL lines for detail
//   2  missing env / cannot reach the site / pre-flight error
//
// Synthetic events use placeholder UUIDs and `__smoke=true` in the payload so
// they are visually distinguishable from real provider events in the queue.
// ─────────────────────────────────────────────────────────────────────────────

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SITE_URL              = (process.env.SITE_URL || '').replace(/\/+$/, '');
const ADMIN_PASSWORD        = process.env.ADMIN_PASSWORD;
const SUPABASE_URL          = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SITE_URL || !ADMIN_PASSWORD || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing one of: SITE_URL, ADMIN_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  console.error('See the file header for usage examples.');
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS  = 60_000;
const SPEND_CAP_USD    = 3.0;

let failures = 0;
function pass(msg) { console.log('PASS:', msg); }
function fail(msg) { failures++; console.error('FAIL:', msg); }
function info(msg) { console.log('INFO:', msg); }

async function adminPost(route, body) {
  const url = `${SITE_URL}/api/admin/agent-fleet/${route}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-password': ADMIN_PASSWORD
    },
    body: JSON.stringify(body || {})
  });
  const text = await r.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { ok: r.ok, status: r.status, body: parsed };
}

async function adminGet(route) {
  const url = `${SITE_URL}/api/admin/agent-fleet/${route}`;
  const r = await fetch(url, {
    method: 'GET',
    headers: { 'x-admin-password': ADMIN_PASSWORD }
  });
  const text = await r.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { ok: r.ok, status: r.status, body: parsed };
}

async function checkRegistry() {
  info('1. Verifying registry row for gatekeeper');
  const { data, error } = await supabase
    .from('agents')
    .select('slug, enabled, autonomy, daily_spend_cap_usd, model, handles_events, endpoint')
    .eq('slug', 'gatekeeper')
    .maybeSingle();
  if (error) { fail(`registry query: ${error.message}`); return null; }
  if (!data)  { fail('registry has no row for gatekeeper'); return null; }
  if (data.enabled !== true)              fail(`enabled is ${data.enabled} (expected true) — apply the enable migration first`);
  else                                    pass('enabled = true');
  if (data.autonomy !== 'propose')        fail(`autonomy is "${data.autonomy}" (expected "propose")`);
  else                                    pass('autonomy = propose');
  if (Number(data.daily_spend_cap_usd) > SPEND_CAP_USD)
    fail(`daily_spend_cap_usd is $${data.daily_spend_cap_usd} (expected ≤ $${SPEND_CAP_USD})`);
  else
    pass(`daily_spend_cap_usd = $${data.daily_spend_cap_usd}`);
  const expectedEvents = ['provider.applied','provider.bgc_completed','provider.flagged'];
  const actualEvents   = data.handles_events || [];
  for (const t of expectedEvents) {
    if (!actualEvents.includes(t)) fail(`handles_events missing "${t}"`);
  }
  if (expectedEvents.every(t => actualEvents.includes(t))) pass(`handles_events = [${actualEvents.join(', ')}]`);
  if (!data.endpoint) fail('endpoint column is empty (orchestrator cannot dispatch)');
  else                pass(`endpoint = ${data.endpoint}`);
  return data;
}

async function checkSpendHeadroom() {
  info('2. Verifying today\'s spend headroom');
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('agent_daily_spend')
    .select('reserved_usd, actual_usd, call_count, day')
    .eq('agent_slug', 'gatekeeper')
    .eq('day', today)
    .maybeSingle();
  if (error) { fail(`spend query: ${error.message}`); return; }
  const reserved = Number(data?.reserved_usd || 0);
  const actual   = Number(data?.actual_usd || 0);
  const total    = reserved + actual;
  const calls    = data?.call_count || 0;
  if (total >= SPEND_CAP_USD) fail(`today's reserved+actual = $${total.toFixed(4)} already at/over $${SPEND_CAP_USD} cap`);
  else                        pass(`today's reserved+actual = $${total.toFixed(4)} (${calls} calls so far) — headroom intact`);
}

async function emitSyntheticEvent(eventType) {
  const payload = syntheticPayloadFor(eventType);
  const r = await adminPost('test-event', { event_type: eventType, payload });
  if (!r.ok) {
    fail(`emit ${eventType}: HTTP ${r.status} — ${JSON.stringify(r.body)}`);
    return null;
  }
  if (!r.body.event_id) {
    fail(`emit ${eventType}: response missing event_id — ${JSON.stringify(r.body)}`);
    return null;
  }
  pass(`emitted ${eventType} → event_id=${r.body.event_id}`);
  return r.body.event_id;
}

function syntheticPayloadFor(eventType) {
  const base = { __smoke: true, smoked_at: new Date().toISOString() };
  if (eventType === 'provider.applied') {
    return { ...base,
      provider_id:   crypto.randomUUID(),
      business_name: 'Smoke Test Garage',
      full_name:     'Smoke Tester',
      email:         'smoke@example.test',
      phone:         '+15555550100',
      previous_role: null
    };
  }
  if (eventType === 'provider.bgc_completed') {
    return { ...base,
      provider_id: crypto.randomUUID(),
      employee_id: crypto.randomUUID(),
      check_id:    crypto.randomUUID(),
      status:      'clear',
      result:      'pass',
      ran_at:      new Date().toISOString()
    };
  }
  if (eventType === 'provider.flagged') {
    return { ...base,
      provider_id:   crypto.randomUUID(),
      business_name: 'Flagged Smoke Garage',
      previous_role: 'provider',
      reason:        'role_changed_to_suspended'
    };
  }
  return base;
}

async function forceOrchestratorTick() {
  info('4. Forcing an orchestrator tick (rather than waiting for cron)');
  const r = await adminPost('run/orchestrator', { source: 'admin:smoke' });
  if (!r.ok) { fail(`run/orchestrator: HTTP ${r.status} — ${JSON.stringify(r.body)}`); return; }
  pass(`orchestrator tick fired: ${JSON.stringify(r.body).slice(0, 220)}`);
}

async function pollForProposal(eventId, eventType) {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const { data, error } = await supabase
      .from('agent_actions')
      .select('id, agent_slug, event_id, status, decision, reasoning, confidence, cost_usd, duration_ms, error_message, created_at')
      .eq('agent_slug', 'gatekeeper')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) { fail(`poll ${eventType} (event_id=${eventId}): ${error.message}`); return null; }
    if (data && data.length) return data[0];
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null;
}

async function main() {
  console.log(`Smoking Gatekeeper enablement against ${SITE_URL}`);
  console.log(`(Supabase: ${SUPABASE_URL.replace(/^https?:\/\//, '').slice(0, 40)}…)`);
  console.log('');

  const reg = await checkRegistry();
  if (!reg || reg.enabled !== true) {
    console.error('');
    console.error('Aborting smoke run — fix the registry pre-conditions above and re-run.');
    process.exit(1);
  }
  console.log('');
  await checkSpendHeadroom();
  console.log('');

  info('3. Emitting one synthetic test event for each of the three input types');
  const eventTypes = ['provider.applied', 'provider.bgc_completed', 'provider.flagged'];
  const emitted = {};
  for (const t of eventTypes) emitted[t] = await emitSyntheticEvent(t);
  console.log('');

  await forceOrchestratorTick();
  console.log('');

  info(`5. Polling agent_actions for proposed rows (timeout ${POLL_TIMEOUT_MS / 1000}s per event)`);
  const results = {};
  for (const t of eventTypes) {
    if (!emitted[t]) { results[t] = null; continue; }
    const row = await pollForProposal(emitted[t], t);
    if (!row) {
      fail(`no agent_actions row for ${t} (event_id=${emitted[t]}) within ${POLL_TIMEOUT_MS / 1000}s — check Netlify logs for /agent-orchestrator and /agent-gatekeeper`);
      results[t] = null;
    } else {
      results[t] = row;
      const rec = (row.decision && row.decision.recommendation) || '(none)';
      const conf = row.confidence != null ? Number(row.confidence).toFixed(2) : 'n/a';
      if (row.status === 'proposed' && rec !== '(none)') {
        pass(`${t} → action ${row.id} status=${row.status} recommendation=${rec} confidence=${conf} cost=$${Number(row.cost_usd).toFixed(4)} ms=${row.duration_ms}`);
      } else if (row.status === 'error') {
        fail(`${t} → action ${row.id} status=error error_message="${row.error_message}"`);
      } else {
        fail(`${t} → action ${row.id} status=${row.status} recommendation=${rec} (expected status=proposed with a recommendation)`);
      }
    }
  }
  console.log('');

  info('6. Summary');
  console.table(eventTypes.map(t => {
    const row = results[t];
    return {
      event_type: t,
      event_id:   emitted[t] || '—',
      action_id:  row?.id || '—',
      status:     row?.status || '—',
      rec:        (row?.decision && row.decision.recommendation) || '—',
      conf:       row?.confidence != null ? Number(row.confidence).toFixed(2) : '—',
      cost_usd:   row ? Number(row.cost_usd).toFixed(4) : '—',
      ms:         row?.duration_ms ?? '—'
    };
  }));

  await checkSpendHeadroom();
  console.log('');

  if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    console.error('To roll back: re-run the registry UPDATE with enabled=false (single SQL line).');
    process.exit(1);
  }
  console.log('Gatekeeper enablement smoke test passed. Leave it on for 24h and');
  console.log('verify spend stays under $3 via the admin spend dashboard.');
}

main().catch(e => { console.error('UNCAUGHT:', e.stack || e.message); process.exit(2); });

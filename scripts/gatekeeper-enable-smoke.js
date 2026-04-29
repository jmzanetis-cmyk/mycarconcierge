#!/usr/bin/env node
/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────────────
// Task #126 — Gatekeeper enablement smoke test (operator-supervised CLI).
// Task #161 — Now also runs daily as a Netlify scheduled function (see
//             netlify/functions/gatekeeper-smoke-scheduled.js). Both paths
//             share the same engine in netlify/functions/gatekeeper-smoke-core.js
//             so the CLI invariants and the scheduled invariants cannot drift.
//
// What this script does (after the operator applies the enable migration or
// flips the toggle in /admin/agent-fleet.html):
//
//   1. Verify the registry row reflects the enable flip
//      (enabled=true, autonomy=propose, daily_spend_cap_usd ≤ $3.00, model set)
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
// they are visually distinguishable from real provider events in the queue
// (the admin UI surfaces a "Smoke" badge from the stored decision.payload).
// ─────────────────────────────────────────────────────────────────────────────

const { createClient } = require('@supabase/supabase-js');
const { runGatekeeperSmoke } = require('../netlify/functions/gatekeeper-smoke-core');

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

const log = {
  pass: msg => console.log('PASS:', msg),
  fail: msg => console.error('FAIL:', msg),
  info: msg => console.log('INFO:', msg)
};

async function main() {
  console.log(`(Supabase: ${SUPABASE_URL.replace(/^https?:\/\//, '').slice(0, 40)}…)`);
  console.log('');

  const result = await runGatekeeperSmoke({
    supabase,
    siteUrl: SITE_URL,
    adminPassword: ADMIN_PASSWORD,
    log
  });

  console.log('');
  console.log('Summary');
  if (result.summary.events && result.summary.events.length) {
    console.table(result.summary.events.map(e => ({
      event_type: e.event_type,
      event_id:   e.event_id || '—',
      action_id:  e.action_id || '—',
      status:     e.status || '—',
      rec:        e.recommendation || '—',
      conf:       e.confidence != null ? Number(e.confidence).toFixed(2) : '—',
      cost_usd:   e.cost_usd != null ? Number(e.cost_usd).toFixed(4) : '—',
      ms:         e.duration_ms ?? '—'
    })));
  }
  console.log('');

  if (!result.ok) {
    console.error(`${result.failure_count} check(s) failed:`);
    for (const f of result.failed_checks) console.error('  -', f);
    console.error('To roll back: re-run the registry UPDATE with enabled=false (single SQL line).');
    process.exit(1);
  }
  console.log('Gatekeeper enablement smoke test passed. Leave it on for 24h and');
  console.log('verify spend stays under $3 via the admin spend dashboard.');
}

main().catch(e => { console.error('UNCAUGHT:', e.stack || e.message); process.exit(2); });

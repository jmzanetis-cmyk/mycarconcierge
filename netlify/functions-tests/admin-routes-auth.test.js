// ============================================================================
// Lockdown regression test for the admin agent-fleet + ai-ops handlers.
//
// Task #146 added shape-asserting coverage for the four endpoints introduced
// in that task. Task #280 extends the test so it covers EVERY public route
// exposed by:
//   - netlify/functions/agent-fleet-admin.js
//   - netlify/functions/ai-ops-admin.js
//
// Each route is hit twice:
//   1) Without admin credentials. The handler must return a non-2xx
//      (specifically 401) so any future refactor that drops the
//      handler-level authenticateBearerAdmin guard fails the test.
//   2) The four Task #146 routes additionally re-assert their happy-path
//      shape with a valid Bearer admin token — the dashboard relies
//      on those exact JSON keys.
//
// Plus a completeness check: the test scans the two handler source files
// for `route === '...'`, `route.match(/.../)` (and `path` equivalents in
// ai-ops). The number of conditionals it finds MUST match the number of
// covered routes. A new route added to either handler without a matching
// entry in COVERED_ROUTES below will fail this completeness check, forcing
// the contributor to extend the lockdown table.
//
// Handlers run in-process. Supabase is stubbed with a chainable query mock
// so the test does not touch a real database.
//
// Run with:  node netlify/functions-tests/admin-routes-auth.test.js
// Exits non-zero on the first assertion failure.
// ============================================================================

'use strict';

const assert = require('assert');
const fs     = require('node:fs');
const path   = require('node:path');

const ADMIN_PASSWORD = 'test-admin-password-task-146';
process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';

// ---------------------------------------------------------------------------
// Supabase stub
// ---------------------------------------------------------------------------

function makeSupabaseStub() {
  function makeChain(table) {
    const emptyResult = { data: [], count: 0, error: null };
    const chain = {};
    const passthrough = ['select','order','range','limit','eq','neq','gt',
      'gte','lt','lte','is','in','or','filter','match','not','contains','overlaps',
      'textSearch','update','delete','upsert'];
    for (const fn of passthrough) chain[fn] = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    chain.single = () => {
      if (table === 'profiles') return Promise.resolve({ data: { role: 'admin' }, error: null });
      return Promise.resolve({ data: null, error: null });
    };
    chain.insert = () => Promise.resolve({ data: null, error: null });
    chain.then = (resolve, reject) => Promise.resolve(emptyResult).then(resolve, reject);
    return chain;
  }
  return {
    from: (t) => makeChain(t),
    auth: {
      getUser: async (token) => {
        if (!token) return { data: { user: null }, error: { message: 'no token' } };
        return { data: { user: { id: 'stub-admin-uid' } }, error: null };
      }
    }
  };
}

// IMPORTANT: netlify/functions/ has its OWN node_modules (a nested install
// pinned to the function-runtime versions of resend/supabase/etc.), so the
// handlers under test resolve `@supabase/supabase-js` to a DIFFERENT file
// than the repo-root copy. We have to stub BOTH cache entries — otherwise
// the stub silently misses for these handlers and they fall through to a
// real Supabase client that tries to `fetch('http://stub.local/...')` and
// fails with `TypeError: fetch failed`.
const supabasePaths = new Set([
  require.resolve('@supabase/supabase-js'),
  require.resolve('@supabase/supabase-js', { paths: [path.join(__dirname, '..', 'functions')] })
]);
for (const sp of supabasePaths) {
  require.cache[sp] = {
    id: sp,
    filename: sp,
    loaded: true,
    exports: { createClient: () => makeSupabaseStub() }
  };
}

const agentFleet = require('../functions/agent-fleet-admin');
const aiOps      = require('../functions/ai-ops-admin');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeEvent({ path: p, method = 'GET', headers = {}, query = {}, body = null }) {
  return {
    path: p,
    httpMethod: method,
    headers: { host: 'stub.local', ...headers },
    queryStringParameters: query,
    body
  };
}

function parseBody(res) {
  try { return JSON.parse(res.body); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Routes — every public route exposed by both handlers.
//
// `subPath` is the part AFTER the handler prefix
// (`/api/admin/agent-fleet/` or `/api/admin/ai-ops/`). Parameterized
// segments are filled with synthetic-but-shape-valid values so the route
// matcher hits its branch.
//
// `shape` is optional. When present, the route is also exercised WITH a
// valid admin password and the body must satisfy the assertions.
// ---------------------------------------------------------------------------

const SAMPLE_UUID    = '11111111-1111-1111-1111-111111111111';
const SAMPLE_HEX_ID  = 'abcdef0123456789abcdef0123456789';
const SAMPLE_NUM_ID  = '1';
const SAMPLE_SLUG    = 'analyst';
const SAMPLE_DATE    = '2026-05-13';

const AGENT_FLEET_ROUTES = [
  // -- agents
  { method: 'GET',    subPath: 'agents' },
  { method: 'PUT',    subPath: `agents/${SAMPLE_SLUG}` },

  // -- actions
  { method: 'GET',    subPath: 'actions' },
  { method: 'GET',    subPath: 'actions/by-target',
    query: { target_id: SAMPLE_UUID, target_kind: 'provider' },
    shape(body) {
      assert.ok(Array.isArray(body.actions), 'actions/by-target.actions must be an array');
      assert.strictEqual(body.target_id, SAMPLE_UUID);
      assert.strictEqual(body.target_kind, 'provider');
    }
  },
  { method: 'GET',    subPath: 'actions/audit-mismatches',
    shape(body) {
      assert.ok(Array.isArray(body.mismatches), 'audit-mismatches.mismatches must be an array');
      assert.strictEqual(typeof body.scanned, 'number', 'audit-mismatches.scanned must be a number');
    }
  },
  { method: 'GET',    subPath: `actions/${SAMPLE_NUM_ID}` },
  { method: 'POST',   subPath: `actions/${SAMPLE_NUM_ID}/review` },
  { method: 'POST',   subPath: `actions/${SAMPLE_NUM_ID}/apply` },

  // -- spend / stats / badge
  { method: 'GET',    subPath: 'spend' },
  { method: 'GET',    subPath: 'stats/24h',
    shape(body) {
      for (const k of ['actions_taken','escalated','failed']) {
        assert.strictEqual(typeof body[k], 'number', `stats/24h.${k} must be a number`);
      }
      assert.ok(body.sources && typeof body.sources === 'object');
    }
  },
  { method: 'GET',    subPath: 'badge-summary',
    shape(body) {
      for (const k of ['open_dlq','needs_review','unack_spend_alerts','total_attention']) {
        assert.strictEqual(typeof body[k], 'number', `badge-summary.${k} must be a number`);
      }
    }
  },

  // -- briefing / test-event
  { method: 'GET',    subPath: 'briefing' },
  { method: 'POST',   subPath: 'test-event' },

  // -- manual runs
  { method: 'POST',   subPath: 'run/orchestrator' },
  { method: 'POST',   subPath: 'run/analyst' },
  { method: 'POST',   subPath: 'run/gatekeeper-smoke' },
  { method: 'POST',   subPath: 'run/director' },

  // -- director
  { method: 'GET',    subPath: 'director/alerts' },
  { method: 'POST',   subPath: `director/alerts/${SAMPLE_NUM_ID}/resolve` },
  { method: 'GET',    subPath: 'director/config' },
  { method: 'PUT',    subPath: 'director/config' },

  // -- smoke / dlq / spend-alerts / events / memory
  { method: 'GET',    subPath: 'smoke-runs' },
  { method: 'GET',    subPath: 'dead-letter' },
  { method: 'POST',   subPath: `dead-letter/${SAMPLE_NUM_ID}/replay` },
  { method: 'GET',    subPath: 'spend-alerts' },
  { method: 'POST',   subPath: 'spend-alerts/test' },
  { method: 'POST',   subPath: `spend-alerts/${SAMPLE_SLUG}/${SAMPLE_DATE}/resend` },
  { method: 'GET',    subPath: 'events/timeseries' },
  { method: 'GET',    subPath: 'memory' },

  // -- providers
  { method: 'POST',   subPath: `providers/${SAMPLE_UUID}/suspend` },

  // -- social leads
  { method: 'GET',    subPath: 'social/leads' },
  { method: 'GET',    subPath: `social/leads/${SAMPLE_NUM_ID}/reasoning` },
  { method: 'POST',   subPath: `social/leads/${SAMPLE_NUM_ID}/approve` },
  { method: 'POST',   subPath: `social/leads/${SAMPLE_NUM_ID}/reject` },
  { method: 'POST',   subPath: `social/leads/${SAMPLE_NUM_ID}/contacted` },

  // -- social posts
  { method: 'GET',    subPath: 'social/posts' },
  { method: 'POST',   subPath: `social/posts/${SAMPLE_NUM_ID}/approve` },
  { method: 'POST',   subPath: `social/posts/${SAMPLE_NUM_ID}/reject` },
  { method: 'POST',   subPath: `social/posts/${SAMPLE_NUM_ID}/publish` },
  { method: 'POST',   subPath: 'social/request-draft' },
  { method: 'PATCH',  subPath: `social/posts/${SAMPLE_NUM_ID}` },

  // -- social channels
  { method: 'GET',    subPath: 'social/channels' },
  { method: 'POST',   subPath: 'social/channels' },
  { method: 'POST',   subPath: `social/channels/${SAMPLE_NUM_ID}/toggle` },
  { method: 'PATCH',  subPath: `social/channels/${SAMPLE_NUM_ID}` },
  { method: 'DELETE', subPath: `social/channels/${SAMPLE_NUM_ID}` },
  { method: 'POST',   subPath: `social/channels/${SAMPLE_NUM_ID}/run-monitor` },

  // -- prompt versioning
  { method: 'GET',    subPath: `agents/${SAMPLE_SLUG}/prompt` },
  { method: 'GET',    subPath: `agents/${SAMPLE_SLUG}/prompt-history` },
  { method: 'GET',    subPath: `agents/${SAMPLE_SLUG}/prompt/${SAMPLE_NUM_ID}` },
  { method: 'POST',   subPath: `agents/${SAMPLE_SLUG}/prompt` },
  { method: 'POST',   subPath: `agents/${SAMPLE_SLUG}/prompt/${SAMPLE_NUM_ID}/activate` }
];

const AI_OPS_ROUTES = [
  { method: 'GET',    subPath: 'actions',
    query: { target_id: 'tgt-task-146', limit: '5', page: '1' },
    shape(body) {
      assert.ok(Array.isArray(body.actions), 'ai-ops actions.actions must be an array');
      assert.strictEqual(typeof body.page, 'number');
      assert.strictEqual(typeof body.limit, 'number');
      assert.strictEqual(typeof body.total, 'number');
    }
  },
  { method: 'GET',    subPath: `actions/${SAMPLE_HEX_ID}` },
  { method: 'GET',    subPath: 'escalations' },
  { method: 'POST',   subPath: `escalations/${SAMPLE_UUID}/resolve` },
  { method: 'GET',    subPath: 'digests' },
  { method: 'GET',    subPath: 'settings' },
  { method: 'POST',   subPath: 'settings' },
  { method: 'POST',   subPath: 'dispute-resolver/trigger' },
  { method: 'POST',   subPath: 'payment-tracker/run' },
  { method: 'GET',    subPath: 'care-plan-completions' },
  { method: 'POST',   subPath: 'care-plan-completions' },
  { method: 'PATCH',  subPath: `care-plan-completions/${SAMPLE_UUID}` },
  { method: 'POST',   subPath: 'daily-digest/run' }
];

// Wrap into the executable shape used by the runner.
function buildRouteEntries(routes, prefix, handler) {
  return routes.map(r => ({
    label: `${r.method} /api/admin/${prefix}/${r.subPath}`,
    handler,
    method: r.method,
    event: () => makeEvent({
      path: `/api/admin/${prefix}/${r.subPath}`,
      method: r.method,
      query: r.query || {}
    }),
    shape: r.shape || null
  }));
}

const ROUTES = [
  ...buildRouteEntries(AGENT_FLEET_ROUTES, 'agent-fleet', agentFleet.handler),
  ...buildRouteEntries(AI_OPS_ROUTES,      'ai-ops',      aiOps.handler)
];

// ---------------------------------------------------------------------------
// Completeness check — scan handler source for route conditionals.
//
// If a new route is added without an entry above, the count check below
// fires and the contributor sees an "obvious update required" failure.
// ---------------------------------------------------------------------------

// agent-fleet-admin.js was refactored to a router table (an array of
// `{ method, pattern, handler }` entries — see the `const ROUTES = [...]`
// block near the bottom of the file). Count those entries directly so the
// completeness check actually catches a future routing addition. The old
// "if (route === '...')" / route.match() scanner is dead — the new file
// has zero such conditionals.
function countFleetRouterTableEntries(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const re = /^\s*\{\s*method:\s*'(?:GET|POST|PUT|PATCH|DELETE)'\s*,\s*pattern:\s*[^,]+,\s*handler:\s*\w+\s*\}/gm;
  return (src.match(re) || []).length;
}

// ai-ops-admin.js is still written as a long if/else chain on
// `path === '...'` / `path.startsWith(...)`. Keep the original literal
// scanner here so a new ops route without a matching AI_OPS_ROUTES entry
// still trips the completeness check.
function countOpsRouteConditionals(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const literalRe    = /if \(path === '[^']+' && method ===/g;
  const literalAltRe = /if \(method === '[A-Z]+' && path === '[^']+'\)/g;
  const matchAssignRe = /const \w+Match = path\.match\(/g;
  return (src.match(literalRe)    || []).length
       + (src.match(literalAltRe) || []).length
       + (src.match(matchAssignRe) || []).length;
}

function assertCompleteness() {
  const fleetCount = countFleetRouterTableEntries(
    path.join(__dirname, '..', 'functions', 'agent-fleet-admin.js'));
  const opsCount = countOpsRouteConditionals(
    path.join(__dirname, '..', 'functions', 'ai-ops-admin.js'));

  // Counted from the current source. Bump these when you add or remove a
  // public route on either handler — and add/remove the matching entry in
  // AGENT_FLEET_ROUTES / AI_OPS_ROUTES at the top of this file.
  const EXPECTED_FLEET_ROUTES = 48;
  // ai-ops-admin.js: the GET /escalations branch uses a compound condition
  // (`path === 'escalations' || path.startsWith(...)`) that the simple regex
  // above doesn't catch, so the count is 12 even though there are 13 routes.
  const EXPECTED_OPS_CONDITIONALS = 12;

  assert.strictEqual(fleetCount, EXPECTED_FLEET_ROUTES,
    `agent-fleet-admin.js exposes ${fleetCount} ROUTES table entries but the lockdown ` +
    `test expects ${EXPECTED_FLEET_ROUTES}. A route was added or removed — ` +
    `update AGENT_FLEET_ROUTES (and EXPECTED_FLEET_ROUTES) accordingly.`);

  assert.strictEqual(opsCount, EXPECTED_OPS_CONDITIONALS,
    `ai-ops-admin.js exposes ${opsCount} route conditionals but the lockdown ` +
    `test expects ${EXPECTED_OPS_CONDITIONALS}. A route was added or removed — ` +
    `update AI_OPS_ROUTES (and EXPECTED_OPS_CONDITIONALS) accordingly.`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function run() {
  let passed = 0;
  let failed = 0;
  const failures = [];

  // Completeness gate first — fail fast if the table is stale.
  try {
    assertCompleteness();
    passed++;
    console.log(`  ok  completeness check (handler source vs ROUTES table)`);
  } catch (err) {
    failed++;
    failures.push(`[completeness] ${err.message}`);
    console.log(`  FAIL completeness check — ${err.message}`);
  }

  for (const route of ROUTES) {
    // 1) Without credentials → must NOT return a 2xx.
    try {
      const res = await route.handler(route.event());
      assert.ok(res && typeof res.statusCode === 'number',
        `${route.label}: handler must return { statusCode }`);
      assert.ok(res.statusCode < 200 || res.statusCode >= 300,
        `${route.label}: expected NON-2xx without admin credentials, got ${res.statusCode}`);
      assert.strictEqual(res.statusCode, 401,
        `${route.label}: expected 401 without admin credentials, got ${res.statusCode}`);
      passed++;
      console.log(`  ok  ${route.label}  [no-auth → ${res.statusCode}]`);
    } catch (err) {
      failed++;
      failures.push(`[no-auth] ${route.label}: ${err.message}`);
      console.log(`  FAIL ${route.label}  [no-auth] — ${err.message}`);
    }

    // 2) Routes with a `shape` assertion get the happy-path check too.
    if (!route.shape) continue;
    try {
      const ev = route.event();
      ev.headers['authorization'] = 'Bearer stub-admin-bearer';
      const res = await route.handler(ev);
      assert.ok(res && typeof res.statusCode === 'number',
        `${route.label}: handler must return { statusCode }`);
      assert.ok(res.statusCode >= 200 && res.statusCode < 300,
        `${route.label}: expected 2xx with admin credentials, got ${res.statusCode} body=${res.body}`);
      const body = parseBody(res);
      assert.ok(body !== null, `${route.label}: response body must be JSON`);
      route.shape(body);
      passed++;
      console.log(`  ok  ${route.label}  [auth → ${res.statusCode}]`);
    } catch (err) {
      failed++;
      failures.push(`[auth] ${route.label}: ${err.message}`);
      console.log(`  FAIL ${route.label}  [auth] — ${err.message}`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});

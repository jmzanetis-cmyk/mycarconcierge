// ============================================================================
// bid-provider-summary — unit tests
//
// Covers netlify/functions/bid-provider-summary.js. Pure unit tests: no live
// Supabase. Same mock-loader + fake-supabase pattern as
// reviewer-guard.test.js / upsell-handlers.test.js.
//
// Loudest test: safe-field whitelist blocks sensitive columns. That's the
// load-bearing guarantee — the whole reason the endpoint exists instead of
// direct supabase-js access — so we prove it explicitly by shoving a
// sensitive field into the fake row and asserting it does NOT appear in the
// response.
//
// Also covers:
//   - Package owner receives {stats, performance} maps
//   - Non-owner → 403
//   - Missing package → 404
//   - Missing/invalid package_id query param → 400
//   - Missing bearer token → 401
//   - No bids on package → empty maps (not 4xx)
//   - Reviewer account → mock payload with realistic values
//
// Run: node netlify/functions-tests/bid-provider-summary.test.js
// ============================================================================

'use strict';

const path = require('path');
const Module = require('module');

// ---------- harness ----------
let testsRun = 0;
let testsFailed = 0;
async function run(name, fn) {
  testsRun++;
  try { await fn(); console.log(`  ✓ ${name}`); }
  catch (err) {
    testsFailed++;
    console.error(`  ✗ ${name}\n    ${err.stack || err.message}`);
  }
}
function eq(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg || 'eq failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function truthy(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }
function falsy(v, msg) { if (v) throw new Error(msg || 'expected falsy'); }

// ---------- module stubs ----------
// createClient returns whatever currentSupabase is set to at call-time.
// Tests swap currentSupabase via withSb() below. Same pattern as
// reviewer-guard.test.js and founding-commission.test.js.
const origLoad = Module._load;
let currentSupabase = { from: () => ({}), auth: { getUser: async () => ({ data: { user: null }, error: { message: 'not stubbed' } }) } };
const stubs = new Map();
stubs.set('@supabase/supabase-js', { createClient: () => currentSupabase });
Module._load = function (request, parent, ...rest) {
  if (stubs.has(request)) return stubs.get(request);
  return origLoad.call(this, request, parent, ...rest);
};

process.env.SUPABASE_URL = 'http://stub';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';
process.env.REVIEWER_EMAILS = 'reviewer-test@example.com';

const handlerModule = require('../functions/bid-provider-summary');
const { handler, STATS_FIELDS, PERF_FIELDS, STATS_ALLOWED, PERF_ALLOWED, whitelistRow } = handlerModule;

// ---------- constants ----------
const MEMBER_ID   = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const NONOWNER_ID = 'nnnnnnnn-nnnn-nnnn-nnnn-nnnnnnnnnnnn';
const PROVIDER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PROVIDER_ID_2 = 'ccccccc2-cccc-cccc-cccc-cccccccccccc';
const PACKAGE_ID  = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const REVIEWER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// Sensitive fields that MUST NOT leak. Cross-list from the source of truth
// (information_schema on provider_stats + provider_performance).
const SENSITIVE_STATS = [
  'strikes', 'flagged_for_upsell_pattern', 'suspended', 'suspended_reason',
  'suspended_at', 'suspension_lifted_at', 'suspension_lifted_by',
  'total_earnings', 'disputes_won', 'disputes_lost',
  'complaint_counts', 'primary_complaint_reason',
  'upsell_requests_total', 'upsell_requests_approved', 'upsell_requests_declined',
  'upsell_rate', 'upsell_approval_rate',
  'car_required', 'car_id', 'car_submitted_at',
  'created_at', 'updated_at', 'id',
];
const SENSITIVE_PERF = [
  'disputes_count', 'disputes_resolved', 'bids_submitted', 'bids_accepted',
  'acceptance_rate', 'avg_response_time_hours', 'jobs_on_time',
  'last_calculated_at', 'created_at', 'updated_at', 'id',
];

// ---------- fake sb factory ----------
// Supports .from().select().eq().maybeSingle() and .from().select().in().
// Custom behavior injected via `opts` — auth mock, per-table row seeds.
function makeSupabase(opts) {
  const {
    authUser = { id: MEMBER_ID, email: 'member@example.com' },
    authError = null,
    tables = {},
    isReviewerEmail = null,   // string email if the profile lookup should treat this as reviewer
  } = opts || {};

  const state = { calls: { statsSelect: null, perfSelect: null } };

  function from(name) {
    const rows = tables[name] || [];
    const ctx = { filters: [], select: null };
    const b = {
      select(cols) {
        ctx.select = cols;
        if (name === 'provider_stats') state.calls.statsSelect = cols;
        if (name === 'provider_performance') state.calls.perfSelect = cols;
        return b;
      },
      eq(col, val) { ctx.filters.push(r => r[col] === val); return b; },
      in(col, arr) { ctx.filters.push(r => Array.isArray(arr) && arr.includes(r[col])); return b; },
      async maybeSingle() {
        const found = rows.find(r => ctx.filters.every(f => f(r)));
        return { data: found || null, error: null };
      },
      then(resolve) {
        const matched = rows.filter(r => ctx.filters.every(f => f(r)));
        resolve({ data: matched, error: null });
      },
    };
    // profiles lookup used by reviewer-guard.isReviewerAccount — needs
    // .select('email').eq('id', uid).maybeSingle()
    if (name === 'profiles') {
      // Overwrite maybeSingle to return {email} shape reviewer-guard expects.
      b.maybeSingle = async () => {
        const found = rows.find(r => ctx.filters.every(f => f(r)));
        return { data: found ? { email: found.email } : null, error: null };
      };
    }
    return b;
  }

  const sb = {
    from,
    auth: {
      async getUser(token) {
        if (authError) return { data: { user: null }, error: authError };
        return { data: { user: authUser }, error: null };
      },
    },
    _state: state,
  };
  return sb;
}

// Handler builds its own sb via createClient() — we override currentSupabase
// for the duration of the test.
function withSb(sb, fn) {
  const prev = currentSupabase;
  currentSupabase = sb;
  return Promise.resolve(fn()).finally(() => { currentSupabase = prev; });
}

function mockEvent({ method = 'GET', packageId = PACKAGE_ID, bearer = 'token' } = {}) {
  return {
    httpMethod: method,
    headers: bearer ? { authorization: 'Bearer ' + bearer } : {},
    queryStringParameters: packageId ? { package_id: packageId } : {},
  };
}

async function invoke(event) {
  const res = await handler(event);
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

// ============================================================================
// 1. Whitelist enforcement — THE load-bearing test
// ============================================================================
async function testWhitelistBlocksLeakage() {
  console.log('\n── whitelist enforcement ──');

  await run('SELECT strings only name safe fields', () => {
    // Pull straight from module exports.
    for (const field of STATS_FIELDS.split(',').map(s => s.trim())) {
      truthy(STATS_ALLOWED.has(field), `STATS_FIELDS names disallowed field: ${field}`);
    }
    for (const field of PERF_FIELDS.split(',').map(s => s.trim())) {
      truthy(PERF_ALLOWED.has(field), `PERF_FIELDS names disallowed field: ${field}`);
    }
    // Neither list should include any of the sensitive columns.
    for (const s of SENSITIVE_STATS) {
      falsy(STATS_ALLOWED.has(s), `STATS_ALLOWED must NOT include sensitive: ${s}`);
    }
    for (const s of SENSITIVE_PERF) {
      falsy(PERF_ALLOWED.has(s), `PERF_ALLOWED must NOT include sensitive: ${s}`);
    }
  });

  await run('whitelistRow strips fields not in allowlist', () => {
    const dirty = {
      provider_id: PROVIDER_ID,
      average_rating: 4.7,
      strikes: 3,                        // sensitive
      total_earnings: 999999,            // sensitive
      flagged_for_upsell_pattern: true,  // sensitive
      suspended: true,                   // sensitive
      complaint_counts: { foo: 5 },      // sensitive
    };
    const clean = whitelistRow(dirty, STATS_ALLOWED);
    eq(clean, { provider_id: PROVIDER_ID, average_rating: 4.7 });
    falsy('strikes' in clean, 'strikes leaked');
    falsy('total_earnings' in clean, 'total_earnings leaked');
    falsy('flagged_for_upsell_pattern' in clean, 'flagged_for_upsell_pattern leaked');
    falsy('suspended' in clean, 'suspended leaked');
    falsy('complaint_counts' in clean, 'complaint_counts leaked');
  });

  await run('END-TO-END: sensitive field injected into row does NOT appear in response', async () => {
    // Simulate a rogue postgres schema where the SELECT returned extra columns
    // (e.g. a `.select('*')` misedit, or a PostgREST behavior change). The
    // whitelistRow pass at the end of the handler must catch it.
    const sb = makeSupabase({
      authUser: { id: MEMBER_ID },
      tables: {
        maintenance_packages: [{ id: PACKAGE_ID, member_id: MEMBER_ID }],
        bids: [{ provider_id: PROVIDER_ID, package_id: PACKAGE_ID }],
        provider_stats: [{
          provider_id: PROVIDER_ID,
          average_rating: 4.5,
          jobs_completed: 20,
          // These would leak if the endpoint used SELECT * — verify they don't.
          strikes: 3,
          total_earnings: 50000,
          flagged_for_upsell_pattern: true,
          suspended: true,
          suspended_reason: 'quality',
          complaint_counts: { late: 2 },
          primary_complaint_reason: 'late',
        }],
        provider_performance: [{
          provider_id: PROVIDER_ID,
          tier: 'gold',
          rating_avg: 4.5,
          jobs_completed: 20,
          // Sensitive fields that MUST get stripped even if returned.
          disputes_count: 5,
          disputes_resolved: 3,
          bids_submitted: 100,
          bids_accepted: 30,
          acceptance_rate: 0.3,
          avg_response_time_hours: 2.5,
          last_calculated_at: '2026-09-01T00:00:00Z',
        }],
        profiles: [{ id: MEMBER_ID, email: 'member@example.com' }],
      },
    });
    const r = await withSb(sb, () => invoke(mockEvent()));
    eq(r.statusCode, 200);
    const provStats = r.body.stats[PROVIDER_ID];
    const provPerf = r.body.performance[PROVIDER_ID];
    // Every sensitive field must be absent.
    for (const s of SENSITIVE_STATS) {
      falsy(s in provStats, `stats leak: ${s} appeared in response`);
    }
    for (const s of SENSITIVE_PERF) {
      falsy(s in provPerf, `performance leak: ${s} appeared in response`);
    }
    // Safe fields are present.
    eq(provStats.average_rating, 4.5);
    eq(provStats.jobs_completed, 20);
    eq(provPerf.tier, 'gold');
    eq(provPerf.rating_avg, 4.5);
  });
}

// ============================================================================
// 2. Ownership + auth
// ============================================================================
async function testAuthAndOwnership() {
  console.log('\n── auth + ownership ──');

  await run('missing bearer token → 401', async () => {
    const sb = makeSupabase({ authError: { message: 'no token' } });
    const r = await withSb(sb, () => invoke({ httpMethod: 'GET', headers: {}, queryStringParameters: { package_id: PACKAGE_ID } }));
    eq(r.statusCode, 401);
  });

  await run('missing package_id → 400', async () => {
    const sb = makeSupabase({});
    const r = await withSb(sb, () => invoke(mockEvent({ packageId: null })));
    eq(r.statusCode, 400);
    truthy(String(r.body.error).includes('package_id'));
  });

  await run('invalid package_id (not uuid) → 400', async () => {
    const sb = makeSupabase({});
    const r = await withSb(sb, () => invoke(mockEvent({ packageId: 'not-a-uuid' })));
    eq(r.statusCode, 400);
  });

  await run('unknown package → 404', async () => {
    const sb = makeSupabase({
      tables: { maintenance_packages: [] },
    });
    const r = await withSb(sb, () => invoke(mockEvent()));
    eq(r.statusCode, 404);
  });

  await run('non-owner → 403 (no data leak)', async () => {
    const sb = makeSupabase({
      authUser: { id: NONOWNER_ID },
      tables: {
        maintenance_packages: [{ id: PACKAGE_ID, member_id: MEMBER_ID }],
        bids: [{ provider_id: PROVIDER_ID, package_id: PACKAGE_ID }],
        provider_stats: [{ provider_id: PROVIDER_ID, average_rating: 4.9 }],
      },
    });
    const r = await withSb(sb, () => invoke(mockEvent()));
    eq(r.statusCode, 403);
    falsy(r.body.stats, 'must not include stats payload on 403');
    falsy(r.body.performance, 'must not include performance payload on 403');
  });

  await run('method other than GET → 405', async () => {
    const sb = makeSupabase({});
    const r = await withSb(sb, () => invoke(mockEvent({ method: 'POST' })));
    eq(r.statusCode, 405);
  });
}

// ============================================================================
// 3. Happy paths + edge cases
// ============================================================================
async function testHappyPaths() {
  console.log('\n── happy paths + edges ──');

  await run('package with 2 bids → both provider_ids present in both maps', async () => {
    const sb = makeSupabase({
      tables: {
        maintenance_packages: [{ id: PACKAGE_ID, member_id: MEMBER_ID }],
        bids: [
          { provider_id: PROVIDER_ID,   package_id: PACKAGE_ID },
          { provider_id: PROVIDER_ID_2, package_id: PACKAGE_ID },
        ],
        provider_stats: [
          { provider_id: PROVIDER_ID,   average_rating: 4.5, jobs_completed: 20 },
          { provider_id: PROVIDER_ID_2, average_rating: 3.8, jobs_completed: 5 },
        ],
        provider_performance: [
          { provider_id: PROVIDER_ID,   tier: 'gold', rating_avg: 4.5 },
          { provider_id: PROVIDER_ID_2, tier: 'silver', rating_avg: 3.8 },
        ],
      },
    });
    const r = await withSb(sb, () => invoke(mockEvent()));
    eq(r.statusCode, 200);
    truthy(r.body.stats[PROVIDER_ID]);
    truthy(r.body.stats[PROVIDER_ID_2]);
    truthy(r.body.performance[PROVIDER_ID]);
    truthy(r.body.performance[PROVIDER_ID_2]);
    eq(r.body.stats[PROVIDER_ID].average_rating, 4.5);
    eq(r.body.performance[PROVIDER_ID_2].tier, 'silver');
  });

  await run('package with 0 bids → empty maps, 200 not 4xx', async () => {
    const sb = makeSupabase({
      tables: {
        maintenance_packages: [{ id: PACKAGE_ID, member_id: MEMBER_ID }],
        bids: [],
      },
    });
    const r = await withSb(sb, () => invoke(mockEvent()));
    eq(r.statusCode, 200);
    eq(r.body.stats, {});
    eq(r.body.performance, {});
  });

  await run('provider bid but no stats/performance row → provider absent from maps, no crash', async () => {
    const sb = makeSupabase({
      tables: {
        maintenance_packages: [{ id: PACKAGE_ID, member_id: MEMBER_ID }],
        bids: [{ provider_id: PROVIDER_ID, package_id: PACKAGE_ID }],
        provider_stats: [],   // no row for this provider
        provider_performance: [],
      },
    });
    const r = await withSb(sb, () => invoke(mockEvent()));
    eq(r.statusCode, 200);
    falsy(PROVIDER_ID in r.body.stats, 'no stats row → no map entry');
    falsy(PROVIDER_ID in r.body.performance, 'no perf row → no map entry');
  });

  await run('duplicate bids from same provider → provider_id deduplicated', async () => {
    const sb = makeSupabase({
      tables: {
        maintenance_packages: [{ id: PACKAGE_ID, member_id: MEMBER_ID }],
        bids: [
          { provider_id: PROVIDER_ID, package_id: PACKAGE_ID },
          { provider_id: PROVIDER_ID, package_id: PACKAGE_ID },
        ],
        provider_stats: [{ provider_id: PROVIDER_ID, average_rating: 4.5 }],
        provider_performance: [{ provider_id: PROVIDER_ID, tier: 'gold' }],
      },
    });
    const r = await withSb(sb, () => invoke(mockEvent()));
    eq(r.statusCode, 200);
    // Only one map entry per provider.
    eq(Object.keys(r.body.stats).length, 1);
    eq(Object.keys(r.body.performance).length, 1);
  });
}

// ============================================================================
// 4. Reviewer bypass
// ============================================================================
async function testReviewerBypass() {
  console.log('\n── reviewer bypass ──');

  await run('reviewer account → mock payload with realistic values, no DB read', async () => {
    // Force the profile lookup to return a reviewer email.
    process.env.REVIEWER_EMAILS = 'demo@mycarconcierge.com';
    // Clear the reviewer-guard cache so it re-reads the env var.
    delete require.cache[require.resolve('../functions/_shared/reviewer-guard')];
    // Re-require the handler so it picks up the fresh reviewer-guard.
    delete require.cache[require.resolve('../functions/bid-provider-summary')];
    const freshHandler = require('../functions/bid-provider-summary');

    const sb = makeSupabase({
      authUser: { id: REVIEWER_ID, email: 'demo@mycarconcierge.com' },
      tables: {
        maintenance_packages: [{ id: PACKAGE_ID, member_id: REVIEWER_ID }],
        bids: [{ provider_id: PROVIDER_ID, package_id: PACKAGE_ID }],
        profiles: [{ id: REVIEWER_ID, email: 'demo@mycarconcierge.com' }],
      },
    });
    const res = await withSb(sb, () => freshHandler.handler({
      httpMethod: 'GET',
      headers: { authorization: 'Bearer x' },
      queryStringParameters: { package_id: PACKAGE_ID },
    }));
    const body = JSON.parse(res.body);
    eq(res.statusCode, 200);
    eq(body.reviewer_mock, true);
    truthy(body.stats[PROVIDER_ID]);
    truthy(body.performance[PROVIDER_ID]);
    eq(body.performance[PROVIDER_ID].tier, 'gold');
    eq(body.stats[PROVIDER_ID].jobs_completed, 47);
    // Mock payload also honors whitelist (no sensitive fields).
    for (const s of SENSITIVE_STATS) {
      falsy(s in body.stats[PROVIDER_ID], `mock leak: ${s}`);
    }

    // Restore for later tests.
    process.env.REVIEWER_EMAILS = 'reviewer-test@example.com';
    delete require.cache[require.resolve('../functions/_shared/reviewer-guard')];
    delete require.cache[require.resolve('../functions/bid-provider-summary')];
  });
}

// ============================================================================
// main
// ============================================================================
(async () => {
  console.log('bid-provider-summary.test.js');
  await testWhitelistBlocksLeakage();
  await testAuthAndOwnership();
  await testHappyPaths();
  await testReviewerBypass();
  console.log(`\n${testsRun - testsFailed} passed, ${testsFailed} failed`);
  if (testsFailed > 0) process.exitCode = 1;
})();

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Task #207 — Regression coverage for the daily Gatekeeper smoke.
//
// The Gatekeeper smoke is the system's own watchdog for the
// trigger → bus → orchestrator → handler → DB pipeline. Until now it had
// nothing automated guarding it, so a regression in either the shared core
// (gatekeeper-smoke-core.js) or the scheduled wrapper would surface only
// when production cron ran.
//
// This spec exercises the full pipeline against an in-memory Supabase mock
// + an in-process fetch interceptor, covering:
//   (a) success path — all three synthetic events produce a proposal,
//       agent_smoke_runs row is written, and GET /smoke-runs surfaces it.
//   (b) failure path — Gatekeeper agent disabled in the registry, so the
//       smoke bails at pre-flight and persists status='failed'.
//   (c) failure path — orchestrator fires but no proposal lands within the
//       poll window, persisting one no_proposal_<event> failure per event.
//
// The admin endpoints POST /run/gatekeeper-smoke and GET /smoke-runs are
// invoked through the real netlify/functions/agent-fleet-admin.js handler so
// the routing/auth glue is covered too. Resend is stubbed via require.cache
// (mirroring tests/agent-matchmaker.spec.js) so no email is ever sent.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');
const { test, expect } = require('@playwright/test');

// ─── Env stubs (must be set BEFORE requiring the netlify modules) ──────────
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-pw';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-key';
process.env.MCC_APP_URL = 'http://test.mcc.local';
// Ensure no real email send is attempted (sendSmokeFailureEmail short-circuits
// on missing api key + recipient).
delete process.env.RESEND_API_KEY;

// ─── Resend stub via require.cache (matches agent-matchmaker.spec.js) ──────
const ADMIN_FN_PATH = require.resolve('../netlify/functions/agent-fleet-admin');
const RESEND_PATH = require.resolve('resend', { paths: [path.dirname(ADMIN_FN_PATH)] });
require.cache[RESEND_PATH] = {
  id: RESEND_PATH,
  filename: RESEND_PATH,
  loaded: true,
  exports: {
    Resend: class {
      constructor() {}
      get emails() { return { send: async () => ({ id: 'noop' }) }; }
    }
  }
};

// ─── In-memory Supabase mock ───────────────────────────────────────────────
// Only supports the chain shapes used by gatekeeper-smoke-core.js, the
// scheduled wrapper, and the admin /smoke-runs route. Intentionally narrow —
// no PostgREST-grade operator emulation, just what these handlers actually
// touch (eq/in/is, order, limit, insert, update, maybeSingle/single + thenable).
function makeMockSupabase(initial = {}) {
  const tables = {
    agents:            initial.agents            || [],
    agent_daily_spend: initial.agent_daily_spend || [],
    agent_actions:     initial.agent_actions     || [],
    agent_smoke_runs:  initial.agent_smoke_runs  || []
  };
  let idSeq = 1;

  function builder(name) {
    const filters = [];
    let _order = null;
    let _limit = null;
    let mode = 'select';
    let insertRows = null;
    let updateData = null;

    const api = {
      select() { return api; },
      eq(c, v) { filters.push(['eq', c, v]); return api; },
      in(c, vs) { filters.push(['in', c, vs]); return api; },
      not(c, op, v) { filters.push(['not', c, op, v]); return api; },
      is(c, v) { filters.push(['is', c, v]); return api; },
      filter(c, op, v) { filters.push(['filter', c, op, v]); return api; },
      order(c, opts) { _order = { c, asc: opts ? opts.ascending !== false : true }; return api; },
      limit(n) { _limit = n; return api; },
      insert(rows) { insertRows = Array.isArray(rows) ? rows : [rows]; mode = 'insert'; return api; },
      update(d) { updateData = d; mode = 'update'; return api; },
      delete() { mode = 'delete'; return api; },
      maybeSingle() { return execMaybe(); },
      single() { return execSingle(); },
      // Thenable so `await supabase.from(...).select(...).order(...).limit(N)` works.
      then(resolve, reject) { return execMany().then(resolve, reject); }
    };

    function applyFilters(rows) {
      let out = rows.slice();
      for (const f of filters) {
        if (f[0] === 'eq') out = out.filter(r => r[f[1]] === f[2]);
        else if (f[0] === 'in') out = out.filter(r => f[2].includes(r[f[1]]));
        else if (f[0] === 'is' && f[2] === null) out = out.filter(r => r[f[1]] == null);
      }
      if (_order) {
        out.sort((a, b) => {
          const av = a[_order.c]; const bv = b[_order.c];
          if (av === bv) return 0;
          return (av > bv ? 1 : -1) * (_order.asc ? 1 : -1);
        });
      }
      if (_limit != null) out = out.slice(0, _limit);
      return out;
    }

    async function execMany() {
      const rows = tables[name] || (tables[name] = []);
      if (mode === 'select') return { data: applyFilters(rows), error: null };
      if (mode === 'insert') {
        const inserted = insertRows.map(r => ({ id: idSeq++, ...r }));
        rows.push(...inserted);
        return { data: inserted, error: null };
      }
      if (mode === 'update') {
        const matched = applyFilters(rows);
        for (const r of matched) Object.assign(r, updateData);
        return { data: matched, error: null };
      }
      if (mode === 'delete') {
        const matched = applyFilters(rows);
        tables[name] = rows.filter(r => !matched.includes(r));
        return { data: matched, error: null };
      }
      return { data: null, error: { message: `unsupported mode ${mode}` } };
    }
    async function execMaybe() {
      const r = await execMany();
      return { data: r.data && r.data.length ? r.data[0] : null, error: r.error };
    }
    async function execSingle() {
      const r = await execMany();
      if (!r.data || !r.data.length) return { data: null, error: { message: 'no row' } };
      return { data: r.data[0], error: r.error };
    }
    return api;
  }

  return { from: (n) => builder(n), _tables: tables };
}

// ─── Patch agent-fleet-runtime.getSupabase to return our mock ──────────────
// Both agent-fleet-admin.js and gatekeeper-smoke-scheduled.js call this
// helper, so swapping it in require.cache wires both of them to the same
// in-memory store without touching their own modules.
const RUNTIME_PATH = require.resolve('../netlify/functions/agent-fleet-runtime');
const realRuntime = require(RUNTIME_PATH);
const ORIGINAL_RUNTIME_EXPORTS = require.cache[RUNTIME_PATH].exports;
const ORIGINAL_RESEND_CACHE_ENTRY = require.cache[RESEND_PATH];
let CURRENT_MOCK_SB = null;
require.cache[RUNTIME_PATH].exports = Object.assign({}, realRuntime, {
  getSupabase: () => CURRENT_MOCK_SB
});

// ─── Load the handlers AFTER the cache mutations ───────────────────────────
const adminHandler          = require('../netlify/functions/agent-fleet-admin').handler;
const smokeScheduledHandler = require('../netlify/functions/gatekeeper-smoke-scheduled').handler;
const { runGatekeeperSmoke } = require('../netlify/functions/gatekeeper-smoke-core');

// ─── Mock fetch ────────────────────────────────────────────────────────────
// The smoke core posts to {site}/api/admin/agent-fleet/test-event and
// /run/orchestrator over HTTP, and the admin /run/gatekeeper-smoke route
// posts to /.netlify/functions/gatekeeper-smoke-scheduled. We intercept by
// pathname and dispatch in-process, so no dev server is needed.
const realFetch = globalThis.fetch;
const fetchState = {
  emittedEvents: [],          // [{ event_type, event_id, payload }]
  orchestratorBehavior: 'success' // 'success' | 'noop'
};
let nextEventId = 1000;

function fetchResponse(statusCode, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: statusCode >= 200 && statusCode < 300,
    status: statusCode,
    text: async () => text,
    json: async () => JSON.parse(text)
  };
}

globalThis.fetch = async (url, init = {}) => {
  let u; try { u = new URL(url); } catch { return realFetch(url, init); }
  const p = u.pathname;
  const headers = init.headers || {};

  // Admin → scheduled smoke runner.
  if (p === '/.netlify/functions/gatekeeper-smoke-scheduled') {
    const res = await smokeScheduledHandler({
      httpMethod: 'POST',
      path: p,
      headers,
      body: init.body
    });
    return fetchResponse(res.statusCode, res.body);
  }

  // Synthetic event emit — record it so the orchestrator stub can fabricate
  // a matching agent_actions row on the next tick.
  if (p === '/api/admin/agent-fleet/test-event') {
    const body = JSON.parse(init.body || '{}');
    const eventId = String(++nextEventId);
    fetchState.emittedEvents.push({
      event_type: body.event_type, event_id: eventId, payload: body.payload
    });
    return fetchResponse(200, { ok: true, event_id: eventId, event_type: body.event_type });
  }

  // Force orchestrator tick. In 'success' mode we drop a proposed row into
  // agent_actions for every still-unmatched emitted event; in 'noop' mode
  // we return ok but write nothing — that's how (c) starves the poll.
  if (p === '/api/admin/agent-fleet/run/orchestrator') {
    if (fetchState.orchestratorBehavior === 'success' && CURRENT_MOCK_SB) {
      const tbl = CURRENT_MOCK_SB._tables.agent_actions;
      for (const e of fetchState.emittedEvents) {
        if (tbl.find(a => a.event_id === e.event_id)) continue;
        tbl.push({
          id: 9000 + tbl.length,
          agent_slug: 'gatekeeper',
          event_id: e.event_id,
          action_type: 'classify',
          status: 'proposed',
          decision: { recommendation: 'approve', payload: e.payload },
          reasoning: 'mock reasoning',
          confidence: 0.92,
          cost_usd: 0.0021,
          duration_ms: 410,
          error_message: null,
          created_at: new Date().toISOString()
        });
      }
    }
    return fetchResponse(200, { ok: true, ticked: fetchState.emittedEvents.length });
  }

  return fetchResponse(404, { error: 'unmocked: ' + p });
};

// ─── Helpers ───────────────────────────────────────────────────────────────
function makeRegistry({ enabled = true } = {}) {
  return {
    slug: 'gatekeeper',
    enabled,
    autonomy: 'propose',
    daily_spend_cap_usd: 3.0,
    model: 'claude-haiku-4-5-20251001',
    handles_events: ['provider.applied', 'provider.bgc_completed', 'provider.flagged'],
    endpoint: '/.netlify/functions/agent-gatekeeper'
  };
}

function adminEvent(method, route, opts = {}) {
  return {
    httpMethod: method,
    path: `/api/admin/agent-fleet/${route}`,
    headers: { 'x-admin-password': process.env.ADMIN_PASSWORD, ...(opts.headers || {}) },
    queryStringParameters: opts.qs || null,
    body: opts.body ? JSON.stringify(opts.body) : null
  };
}

function scheduledEvent(extraHeaders = {}) {
  return {
    httpMethod: 'POST',
    path: '/.netlify/functions/gatekeeper-smoke-scheduled',
    headers: { 'x-admin-password': process.env.ADMIN_PASSWORD, ...extraHeaders },
    body: JSON.stringify({ source: 'admin' })
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────
test.describe('Gatekeeper smoke — core engine + admin endpoints (mocked Supabase)', () => {
  test.beforeEach(() => {
    fetchState.emittedEvents = [];
    fetchState.orchestratorBehavior = 'success';
    CURRENT_MOCK_SB = makeMockSupabase({ agents: [makeRegistry()] });
  });

  test.afterAll(() => {
    // Restore everything we patched so this spec doesn't leak module state
    // into other specs sharing the same Playwright worker process.
    globalThis.fetch = realFetch;
    require.cache[RUNTIME_PATH].exports = ORIGINAL_RUNTIME_EXPORTS;
    if (ORIGINAL_RESEND_CACHE_ENTRY) {
      require.cache[RESEND_PATH] = ORIGINAL_RESEND_CACHE_ENTRY;
    } else {
      delete require.cache[RESEND_PATH];
    }
  });

  test('success path: every synthetic event produces a proposal; GET /smoke-runs surfaces the row', async () => {
    const res = await smokeScheduledHandler(scheduledEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('passed');
    expect(body.failure_count).toBe(0);
    expect(body.run_id).toBeTruthy();

    // All three event types were emitted.
    const types = fetchState.emittedEvents.map(e => e.event_type).sort();
    expect(types).toEqual(['provider.applied', 'provider.bgc_completed', 'provider.flagged']);

    // agent_smoke_runs row persisted with the expected shape.
    const rows = CURRENT_MOCK_SB._tables.agent_smoke_runs;
    expect(rows).toHaveLength(1);
    expect(rows[0].agent_slug).toBe('gatekeeper');
    expect(rows[0].status).toBe('passed');
    expect(rows[0].failure_count).toBe(0);
    expect(rows[0].triggered_by).toBe('admin');
    expect(rows[0].summary.events).toHaveLength(3);
    for (const ev of rows[0].summary.events) {
      expect(ev.status).toBe('proposed');
      expect(ev.recommendation).toBe('approve');
      expect(ev.action_id).toBeTruthy();
    }

    // GET /smoke-runs surfaces the inserted row.
    const list = await adminHandler(adminEvent('GET', 'smoke-runs', { qs: { limit: '10' } }));
    expect(list.statusCode).toBe(200);
    const lb = JSON.parse(list.body);
    expect(lb.runs).toHaveLength(1);
    expect(lb.runs[0].status).toBe('passed');
    expect(lb.last_pass).toBeTruthy();
    expect(lb.last_pass.id).toBe(rows[0].id);
    expect(lb.last_fail).toBeNull();
    expect(lb.latest.id).toBe(rows[0].id);
  });

  test('failure path: agent disabled — pre-flight bails, agent_smoke_runs row marked failed', async () => {
    CURRENT_MOCK_SB = makeMockSupabase({ agents: [makeRegistry({ enabled: false })] });

    const res = await smokeScheduledHandler(scheduledEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.status).toBe('failed');
    // checkRegistry pushes registry_enabled=false; the runner ALSO short-
    // circuits before emitting events.
    expect(body.failed_checks.some(c => /registry_enabled/.test(c))).toBe(true);
    expect(fetchState.emittedEvents).toHaveLength(0);

    // Persisted + surfaced through /smoke-runs.
    const rows = CURRENT_MOCK_SB._tables.agent_smoke_runs;
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('failed');
    expect(rows[0].summary.events).toEqual([]);

    const list = await adminHandler(adminEvent('GET', 'smoke-runs', { qs: { limit: '10' } }));
    const lb = JSON.parse(list.body);
    expect(lb.runs).toHaveLength(1);
    expect(lb.runs[0].status).toBe('failed');
    expect(lb.last_pass).toBeNull();
    expect(lb.last_fail).toBeTruthy();
    expect(lb.last_fail.id).toBe(rows[0].id);
  });

  test('failure path: orchestrator fires but no proposal lands within the poll window', async () => {
    fetchState.orchestratorBehavior = 'noop'; // never writes agent_actions rows

    // Drive runGatekeeperSmoke directly so we can pass a tight poll timeout —
    // the production default is 60s, which would break the test budget.
    const result = await runGatekeeperSmoke({
      supabase: CURRENT_MOCK_SB,
      siteUrl: 'http://test.mcc.local',
      adminPassword: process.env.ADMIN_PASSWORD,
      pollTimeoutMs: 200,
      pollIntervalMs: 50
    });

    expect(result.ok).toBe(false);
    // Three events all timed out → at least three no_proposal_* failures.
    const noProps = result.failed_checks.filter(c => c.startsWith('no_proposal_'));
    expect(noProps).toHaveLength(3);
    expect(noProps.sort()).toEqual([
      'no_proposal_provider.applied',
      'no_proposal_provider.bgc_completed',
      'no_proposal_provider.flagged'
    ]);
    expect(result.summary.events).toHaveLength(3);
    for (const ev of result.summary.events) {
      expect(ev.status).toBe('no_proposal');
      expect(ev.action_id).toBeNull();
      expect(ev.event_id).toBeTruthy();
    }
  });

  test('admin POST /run/gatekeeper-smoke proxies to the scheduled function and persists the run', async () => {
    const res = await adminHandler(adminEvent('POST', 'run/gatekeeper-smoke', { body: { source: 'admin' } }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.result.status).toBe('passed');
    expect(body.result.run_id).toBeTruthy();

    // Same in-memory store both handlers share, so the row is observable here.
    expect(CURRENT_MOCK_SB._tables.agent_smoke_runs).toHaveLength(1);
    expect(CURRENT_MOCK_SB._tables.agent_smoke_runs[0].triggered_by).toBe('admin');
  });

  test('admin endpoints reject calls without the admin password', async () => {
    const noAuthList = await adminHandler({
      httpMethod: 'GET',
      path: '/api/admin/agent-fleet/smoke-runs',
      headers: {},
      queryStringParameters: null
    });
    expect(noAuthList.statusCode).toBe(401);

    const noAuthRun = await smokeScheduledHandler({
      httpMethod: 'POST',
      path: '/.netlify/functions/gatekeeper-smoke-scheduled',
      headers: {},
      body: JSON.stringify({ source: 'public' })
    });
    expect(noAuthRun.statusCode).toBe(401);
  });
});

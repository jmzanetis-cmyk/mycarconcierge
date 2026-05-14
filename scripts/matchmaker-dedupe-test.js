#!/usr/bin/env node
 
// ─────────────────────────────────────────────────────────────────────────────
// Task #152 — Matchmaker idempotency / dedupe guard test.
//
// Verifies the guard added to netlify/functions/agent-matchmaker.js so a
// retry, replay, or re-trigger of `care_plan.auction_closed` does NOT:
//   - call Claude a second time
//   - burn another spend-cap allotment
//   - write a duplicate `proposed` row to agent_actions
//
// Strategy: stub-load `./agent-fleet-runtime` via require.cache so the
// matchmaker handler runs against an in-memory Supabase mock and a counting
// LLM mock — no network, no DB, no Claude credits required.
//
// Run from project root:
//   node scripts/matchmaker-dedupe-test.js
//
// Exit codes: 0 all passed, 1 any check failed.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('node:path');

const RUNTIME_PATH = require.resolve('../netlify/functions/agent-fleet-runtime');

// ----------------------------- LLM call counter -----------------------------
let llmCalls = 0;
const loggedActions = [];

// ----------------------------- Supabase mock --------------------------------
function makeSupabaseMock(initialState) {
  const state = {
    care_plans: initialState.care_plans || [],
    agent_actions: initialState.agent_actions || [],
    plan_bids: initialState.plan_bids || [],
    profiles: initialState.profiles || []
  };

  // Resolve a JSONB-style path like "decision->payload->>care_plan_id"
  // against a row. Returns the value or undefined.
  function resolveJsonPath(row, expr) {
    const path = expr.split(/->>?|->/).map(s => s.replaceAll('\'', ''));
    let v = row[path[0]];
    for (let i = 1; i < path.length; i++) {
      if (v == null) return undefined;
      v = v[path[i]];
    }
    return v;
  }

  // Parse a single PostgREST clause "col.op.arg" into a row predicate.
  function clauseToPredicate(clause) {
    const firstDot = clause.indexOf('.');
    const secondDot = clause.indexOf('.', firstDot + 1);
    const col = clause.slice(0, firstDot);
    const op = clause.slice(firstDot + 1, secondDot);
    const arg = clause.slice(secondDot + 1);
    const get = r => col.includes('->') ? resolveJsonPath(r, col) : r[col];
    if (op === 'in') {
      const list = arg.replaceAll(/^\(|\)$/g, '').split(',');
      return r => list.includes(String(get(r)));
    }
    if (op === 'eq') return r => String(get(r)) === arg;
    return () => false;
  }

  // Split a comma-separated PostgREST .or() expression while respecting
  // parenthesized groups (e.g. "status.in.(a,b),review_status.eq.x").
  function splitOrExpr(expr) {
    const parts = [];
    let buf = '';
    let depth = 0;
    for (const ch of expr) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        if (buf) { parts.push(buf); buf = ''; }
      } else {
        buf += ch;
      }
    }
    if (buf) parts.push(buf);
    return parts;
  }

  function from(table) {
    let rows = (state[table] || []).slice();
    const filters = [];
    let limit = null;
    let order = null;

    function applyFilters() {
      let out = rows;
      for (const f of filters) out = out.filter(f);
      if (order) {
        out = out.slice().sort((a, b) => {
          const av = a[order.col]; const bv = b[order.col];
          if (av < bv) return order.asc ? -1 : 1;
          if (av > bv) return order.asc ? 1 : -1;
          return 0;
        });
      }
      if (limit) out = out.slice(0, limit);
      return out;
    }

    const builder = {
      select() { return builder; },
      eq(col, val) {
        if (col.includes('->')) {
          filters.push(r => String(resolveJsonPath(r, col)) === String(val));
        } else {
          filters.push(r => r[col] === val);
        }
        return builder;
      },
      neq(col, val) { filters.push(r => r[col] !== val); return builder; },
      in(col, vals) { const set = new Set(vals); filters.push(r => set.has(r[col])); return builder; },
      or(expr) {
        // Multiple .or() calls AND together (matches PostgREST semantics).
        const checks = splitOrExpr(expr).map(clauseToPredicate);
        filters.push(r => checks.some(fn => fn(r)));
        return builder;
      },
      order(col, opts) { order = { col, asc: !!(opts && opts.ascending) }; return builder; },
      limit(n) { limit = n; return builder; },
      single() { return Promise.resolve({ data: applyFilters()[0] || null, error: null }); },
      maybeSingle() { return Promise.resolve({ data: applyFilters()[0] || null, error: null }); },
      then(resolve) { resolve({ data: applyFilters(), error: null }); }
    };
    return builder;
  }

  return {
    from,
    state,
    rpc: async () => ({ data: null, error: null })
  };
}

// ----------------------------- Runtime stub ---------------------------------
// Options:
//   llmGate — optional async function awaited inside the LLM stub. Tests use
//             this to pause both racers between the application-level dedupe
//             check and the proposed-row insert, simulating the
//             check-then-act window the DB unique index protects against.
//   enforceUnique — when true, the logAction stub mirrors the unique partial
//             index agent_actions_matchmaker_rank_unique: a second
//             proposed/executed matchmaker `rank` row for the same
//             decision.payload.care_plan_id is rejected with a 23505
//             unique-violation, just like Postgres does (see
//             supabase/migrations/20260429f_matchmaker_rank_unique.sql).
function installRuntimeStub({ supabase, agent, llmGate = null, enforceUnique = false }) {
  llmCalls = 0;
  loggedActions.length = 0;

  delete require.cache[RUNTIME_PATH];
  delete require.cache[require.resolve('../netlify/functions/agent-matchmaker')];

  class SpendCapError extends Error {}

  const stub = {
    getSupabase: () => supabase,
    getAgent: async () => agent,
    callLLM: async () => {
      llmCalls++;
      if (llmGate) await llmGate();
      return {
        text: '{"recommended_winner_bid_id":"bid-aaaaaaaa","confidence":0.9,"reasoning":"ok","ranked_bids":[],"concerns":[]}',
        tokensIn: 100, tokensOut: 50, costUsd: 0.001
      };
    },
    logAction: async (sb, payload) => {
      loggedActions.push(payload);
      // Simulate the unique partial index. Only proposed/executed
      // matchmaker rank rows participate; skipped/error rows are ignored,
      // matching the real index's WHERE clause.
      if (
        enforceUnique
        && payload.agentSlug === 'matchmaker'
        && payload.actionType === 'rank'
        && (payload.status === 'proposed' || payload.status === 'executed')
      ) {
        const cpId = payload.decision?.payload?.care_plan_id;
        if (cpId) {
          const dup = supabase.state.agent_actions.find(r =>
            r.agent_slug === 'matchmaker'
            && r.action_type === 'rank'
            && (r.status === 'proposed' || r.status === 'executed')
            && r.decision?.payload?.care_plan_id === cpId
          );
          if (dup) {
            return {
              id: null,
              error: { code: '23505', message: 'duplicate key value violates unique constraint "agent_actions_matchmaker_rank_unique"' }
            };
          }
        }
      }
      // Mirror what the real logAction would write into agent_actions so
      // the dedupe lookup on subsequent invocations sees the row.
      const row = {
        id: supabase.state.agent_actions.length + 1,
        agent_slug: payload.agentSlug,
        action_type: payload.actionType,
        status: payload.status,
        decision: payload.decision || {},
        review_status: null,
        created_at: new Date().toISOString()
      };
      supabase.state.agent_actions.push(row);
      return { id: row.id };
    },
    authorizeAgentInvocation: () => true,
    jsonResponse: (status, body) => ({ statusCode: status, body: JSON.stringify(body) }),
    SpendCapError,
    loadActivePrompt: async (_, __, fallback) => fallback
  };

  require.cache[RUNTIME_PATH] = {
    id: RUNTIME_PATH,
    filename: RUNTIME_PATH,
    loaded: true,
    exports: stub
  };
}

// ----------------------------- Test cases -----------------------------------
let failures = 0;
function assertEq(actual, expected, msg) {
  if (actual === expected) {
    console.log(`PASS: ${msg}`);
  } else {
    failures++;
    console.error(`FAIL: ${msg}\n        expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
  }
}

const CARE_PLAN_ID = '11111111-1111-1111-1111-111111111111';
const BID_ID = 'bid-aaaaaaaa';

function freshSupabase(opts = {}) {
  return makeSupabaseMock({
    care_plans: [{
      id: CARE_PLAN_ID, status: opts.status || 'auction_closed',
      member_id: 'm', title: 't', description: 'd',
      services: [], service_types: [], value_min: 100, value_max: 500,
      city: 'X', state: 'Y', zip_code: '00000',
      bid_closes_at: new Date().toISOString(), created_at: new Date().toISOString(),
      vehicle: null
    }],
    plan_bids: opts.bids || [{
      id: BID_ID, care_plan_id: CARE_PLAN_ID, provider_id: 'p1', amount: 200, note: 'n',
      is_auto_bid: false, status: 'pending', created_at: new Date().toISOString()
    }],
    profiles: [{
      id: 'p1', business_name: 'A Garage', full_name: 'Owner', city: 'X', state: 'Y', zip_code: '00000',
      avg_rating: 4.5, review_count: 10, completed_jobs: 5,
      bgc_badge_verified: true, bgc_compliance_pct: 100, bgc_employees_total: 1, bgc_employees_compliant: 1,
      verification_status: 'verified', created_at: new Date().toISOString()
    }],
    agent_actions: opts.agent_actions || []
  });
}

const baseAgent = { slug: 'matchmaker', enabled: true, autonomy: 'propose', model: 'claude-sonnet-4-5', daily_spend_cap_usd: 5 };

async function runHandler(envelope) {
  const matchmaker = require('../netlify/functions/agent-matchmaker');
  const res = await matchmaker.handler({
    httpMethod: 'POST',
    body: JSON.stringify(envelope),
    headers: {}
  });
  return { ...res, parsed: JSON.parse(res.body) };
}

(async () => {
  // ───────────────────────────────────────────────────────────────
  // Test 1: First invocation produces a `proposed` row + 1 LLM call.
  // ───────────────────────────────────────────────────────────────
  console.log('\nTest 1: first invocation creates proposed row');
  let supabase = freshSupabase();
  installRuntimeStub({ supabase, agent: baseAgent });
  let r = await runHandler({ event: { event_type: 'care_plan.auction_closed', event_id: 1, payload: { care_plan_id: CARE_PLAN_ID } } });
  assertEq(llmCalls, 1, 'LLM called once on first run');
  assertEq(r.parsed.success, true, 'response success=true');
  assertEq(supabase.state.agent_actions.filter(a => a.status === 'proposed').length, 1, 'one proposed row written');

  // ───────────────────────────────────────────────────────────────
  // Test 2: Replay of the same event short-circuits without LLM call.
  // ───────────────────────────────────────────────────────────────
  console.log('\nTest 2: replay short-circuits with already_ranked');
  // (reuse the same supabase state — the proposed row from Test 1 lives there)
  installRuntimeStub({ supabase, agent: baseAgent });
  r = await runHandler({ event: { event_type: 'care_plan.auction_closed', event_id: 2, payload: { care_plan_id: CARE_PLAN_ID } } });
  assertEq(llmCalls, 0, 'LLM NOT called on replay');
  assertEq(r.parsed.reason, 'already_ranked', 'response reason=already_ranked');
  assertEq(r.parsed.cost_usd, 0, 'response cost_usd=0');
  assertEq(r.parsed.success, true, 'response still success=true');
  const proposedCount = supabase.state.agent_actions.filter(a => a.status === 'proposed').length;
  assertEq(proposedCount, 1, 'still only one proposed row (no duplicate written)');
  const skippedCount = supabase.state.agent_actions.filter(a => a.status === 'skipped').length;
  assertEq(skippedCount, 1, 'one skipped audit row written for the duplicate dispatch');

  // ───────────────────────────────────────────────────────────────
  // Test 3: Care plan already awarded → short-circuit without LLM call.
  // ───────────────────────────────────────────────────────────────
  console.log('\nTest 3: care_plan.status=awarded short-circuits with already_awarded');
  supabase = freshSupabase({ status: 'awarded' });
  installRuntimeStub({ supabase, agent: baseAgent });
  r = await runHandler({ event: { event_type: 'care_plan.auction_closed', event_id: 3, payload: { care_plan_id: CARE_PLAN_ID } } });
  assertEq(llmCalls, 0, 'LLM NOT called when care plan is awarded');
  assertEq(r.parsed.reason, 'already_awarded', 'response reason=already_awarded');
  assertEq(r.parsed.cost_usd, 0, 'response cost_usd=0');
  assertEq(supabase.state.agent_actions.filter(a => a.status === 'proposed').length, 0, 'no proposed row written');

  // ───────────────────────────────────────────────────────────────
  // Test 4: Existing executed (apply) row blocks re-rank too. The apply
  // row written by netlify/functions/agent-fleet-admin.js stores
  // care_plan_id at the TOP LEVEL of `decision`, not nested under
  // `decision.payload`, so the dedupe lookup must match either shape.
  // ───────────────────────────────────────────────────────────────
  console.log('\nTest 4: prior executed apply row (top-level care_plan_id) also blocks re-rank');
  supabase = freshSupabase({
    agent_actions: [{
      id: 99, agent_slug: 'matchmaker', action_type: 'apply', status: 'executed',
      decision: { care_plan_id: CARE_PLAN_ID, accepted_bid_id: 'bid-zzzzzzzz' },
      review_status: null, created_at: new Date().toISOString()
    }]
  });
  installRuntimeStub({ supabase, agent: baseAgent });
  r = await runHandler({ event: { event_type: 'care_plan.auction_closed', event_id: 4, payload: { care_plan_id: CARE_PLAN_ID } } });
  assertEq(llmCalls, 0, 'LLM NOT called when an executed apply row exists');
  assertEq(r.parsed.reason, 'already_ranked', 'response reason=already_ranked');
  assertEq(r.parsed.existing_action_id, 99, 'response cites the existing action id');

  // ───────────────────────────────────────────────────────────────
  // Test 4b: A `skipped` row (e.g. from a prior failure) does NOT block
  // a fresh attempt — only rank/apply rows in proposed/executed/approved
  // states should short-circuit.
  // ───────────────────────────────────────────────────────────────
  console.log('\nTest 4b: prior skipped row does NOT block a fresh attempt');
  supabase = freshSupabase({
    agent_actions: [{
      id: 70, agent_slug: 'matchmaker', action_type: 'rank', status: 'skipped',
      decision: { payload: { care_plan_id: CARE_PLAN_ID } },
      review_status: null, created_at: new Date().toISOString()
    }]
  });
  installRuntimeStub({ supabase, agent: baseAgent });
  r = await runHandler({ event: { event_type: 'care_plan.auction_closed', event_id: 41, payload: { care_plan_id: CARE_PLAN_ID } } });
  assertEq(llmCalls, 1, 'LLM IS called when only a skipped row exists');
  assertEq(r.parsed.success, true, 'response success');

  // ───────────────────────────────────────────────────────────────
  // Test 5: Different care_plan_id → not deduped.
  // ───────────────────────────────────────────────────────────────
  console.log('\nTest 5: a DIFFERENT care_plan_id is NOT deduped');
  supabase = freshSupabase({
    agent_actions: [{
      id: 50, agent_slug: 'matchmaker', action_type: 'rank', status: 'proposed',
      decision: { payload: { care_plan_id: '00000000-0000-0000-0000-000000000000' } },
      review_status: null, created_at: new Date().toISOString()
    }]
  });
  installRuntimeStub({ supabase, agent: baseAgent });
  r = await runHandler({ event: { event_type: 'care_plan.auction_closed', event_id: 5, payload: { care_plan_id: CARE_PLAN_ID } } });
  assertEq(llmCalls, 1, 'LLM called once for unrelated care plan');
  assertEq(r.parsed.success, true, 'response success');
  assertEq(r.parsed.bid_count, 1, 'bid count surfaced');

  // ───────────────────────────────────────────────────────────────
  // Test 6 (Task #195): two CONCURRENT POSTs against the same care_plan
  // both pass the application-level dedupe check (the row hasn't been
  // written yet) and race to INSERT a `proposed` row. The DB unique
  // partial index `agent_actions_matchmaker_rank_unique` rejects the
  // second insert with 23505 unique_violation; the matchmaker handler
  // catches that, returns `already_ranked` (cost 0) and writes a
  // `skipped` audit row. Final state: exactly ONE proposed row.
  // ───────────────────────────────────────────────────────────────
  console.log('\nTest 6: concurrent invocations — DB unique index keeps it to one proposed row');
  supabase = freshSupabase();
  // Gate both LLM calls until BOTH have entered, so the two handlers race
  // through the post-LLM insert path together (the application-level
  // dedupe check has already passed for both at this point).
  let releaseLlm;
  const llmReady = new Promise(res => { releaseLlm = res; });
  let llmEnteredCount = 0;
  let bothEntered;
  const bothEnteredPromise = new Promise(res => { bothEntered = res; });
  const llmGate = async () => {
    llmEnteredCount++;
    if (llmEnteredCount === 2) bothEntered();
    await llmReady;
  };
  installRuntimeStub({ supabase, agent: baseAgent, llmGate, enforceUnique: true });
  const env = { event_type: 'care_plan.auction_closed', payload: { care_plan_id: CARE_PLAN_ID } };
  const p1 = runHandler({ event: { ...env, event_id: 60 } });
  const p2 = runHandler({ event: { ...env, event_id: 61 } });
  // Wait until both racers are inside the LLM call, then release them
  // simultaneously so they both proceed to the proposed insert.
  await bothEnteredPromise;
  releaseLlm();
  const [r1, r2] = await Promise.all([p1, p2]);
  assertEq(llmCalls, 2, 'both racers called the LLM (passed the application-level guard)');
  const proposed = supabase.state.agent_actions.filter(a => a.agent_slug === 'matchmaker' && a.action_type === 'rank' && a.status === 'proposed');
  assertEq(proposed.length, 1, 'exactly one proposed row exists in agent_actions');
  // One winner returns the normal success shape (no `reason` key); the
  // loser returns reason='already_ranked'. Order is non-deterministic.
  const winners = [r1, r2].filter(r => !r.parsed.reason);
  const losers = [r1, r2].filter(r => r.parsed.reason === 'already_ranked');
  assertEq(winners.length, 1, 'exactly one racer wins (response has no reason key)');
  assertEq(losers.length, 1, 'exactly one racer reports already_ranked');
  assertEq(losers[0].parsed.cost_usd, 0, 'losing racer reports cost_usd=0');
  assertEq(losers[0].parsed.success, true, 'losing racer reports success=true');
  const skipped = supabase.state.agent_actions.filter(a => a.agent_slug === 'matchmaker' && a.action_type === 'rank' && a.status === 'skipped');
  assertEq(skipped.length, 1, 'one skipped audit row written for the duplicate concurrent dispatch');
  assertEq(skipped[0].decision?.dedupe_source, 'db_unique_index', 'skipped row records db_unique_index as the dedupe source');

  // ───────────────────────────────────────────────────────────────
  console.log('');
  if (failures) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('All matchmaker dedupe checks passed.');
})().catch(e => {
  console.error('UNCAUGHT:', e.stack || e.message);
  process.exit(1);
});

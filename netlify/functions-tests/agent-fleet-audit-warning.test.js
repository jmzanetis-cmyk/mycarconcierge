// Task #323 — verify the agent-fleet apply paths surface audit-write
// failures via the `audit_warning` field instead of swallowing them, and
// that the new listAuditMismatches scan detects Stripe-side state that
// diverges from the review-queue status (and fails loud on DB errors).
//
// Stubs Supabase + Stripe so no live creds are required.

const path = require('path');
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const modPath = path.resolve(__dirname, '../functions/agent-fleet-admin.js');
delete require.cache[modPath];
const admin = require(modPath);
const { applyMatchmakerRank } = admin.__test;

let failures = 0;
let passed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log('PASS:', label); }
  else { failures++; console.error('FAIL:', label); }
}

// ---------- Lightweight Supabase fake ----------
// Supports the chained query shape that agent-fleet-admin.js relies on
// (select / eq / neq / order / limit / maybeSingle / update / insert).
// `injectErrors` is keyed by `<table>.<mode>` (e.g. `agent_actions.update`)
// and forces that operation to resolve with `{data:null, error:{message}}`.
function makeFake({ injectErrors = {} } = {}) {
  const state = {
    plan_bids: [
      { id: 'bid-w', care_plan_id: 'plan-1', provider_id: 'prov-1', status: 'pending', amount: 100 },
      { id: 'bid-l', care_plan_id: 'plan-1', provider_id: 'prov-2', status: 'pending', amount: 120 }
    ],
    care_plans: [{ id: 'plan-1', member_id: 'mem-1', status: 'open', title: 'Test plan' }],
    agent_actions: [
      { id: 42, agent_slug: 'matchmaker', action_type: 'rank', review_status: 'proposed',
        decision: { recommended_winner_bid_id: 'bid-w', payload: { care_plan_id: 'plan-1' } } }
    ],
    care_plan_completions: []
  };

  function from(table) {
    const ctx = { table, _filters: [], _mode: null, _patch: null, _row: null };
    function exec() {
      return new Promise(resolve => {
        const inj = injectErrors[`${table}.${ctx._mode || 'select'}`];
        if (inj) return resolve({ data: null, error: { message: inj } });
        if (ctx._mode === 'insert') {
          const r = { ...ctx._row, id: Math.floor(Math.random() * 1e6) };
          if (Array.isArray(state[table])) state[table].push(r);
          return resolve({ data: [r], error: null });
        }
        const rows = (state[table] || []).filter(r =>
          ctx._filters.every(([c, v, op]) => op === 'neq' ? r[c] !== v : r[c] === v));
        if (ctx._mode === 'update') {
          rows.forEach(r => Object.assign(r, ctx._patch));
          return resolve({ data: rows, error: null });
        }
        resolve({ data: rows, error: null });
      });
    }
    const builder = {
      select() { return builder; },
      eq(c, v) { ctx._filters.push([c, v, 'eq']); return builder; },
      neq(c, v) { ctx._filters.push([c, v, 'neq']); return builder; },
      gte() { return builder; },
      order() { return builder; },
      limit() { return builder; },
      range() { return builder; },
      maybeSingle() { return exec().then(r => ({ data: (r.data || [])[0] || null, error: r.error })); },
      single()      { return exec().then(r => ({ data: (r.data || [])[0] || null, error: r.error })); },
      then(res, rej) { return exec().then(res, rej); },
      update(patch) {
        ctx._mode = 'update'; ctx._patch = patch;
        return {
          eq(c, v) { ctx._filters.push([c, v, 'eq']); return this; },
          neq(c, v) { ctx._filters.push([c, v, 'neq']); return this; },
          select() { return { then: (res, rej) => exec().then(res, rej) }; },
          then(res, rej) { return exec().then(res, rej); }
        };
      },
      insert(row) {
        ctx._mode = 'insert'; ctx._row = row;
        return {
          select() {
            return { single() { return exec().then(r => ({ data: (r.data || [])[0] || null, error: r.error })); } };
          },
          then(res, rej) { return exec().then(res, rej); }
        };
      }
    };
    return builder;
  }
  return { state, from };
}

// Reach into the module to call listAuditMismatches without needing the
// full HTTP plumbing (admin password + Netlify event shape). The test
// for HTTP auth/route registration lives in admin-routes-auth.test.js.
function getListAuditMismatches() {
  const src = require('fs').readFileSync(modPath, 'utf8');
  const Module = require('module');
  const m = new Module(modPath);
  m.filename = modPath;
  m.paths = Module._nodeModulePaths(path.dirname(modPath));
  m._compile(src + '\nmodule.exports.listAuditMismatches = listAuditMismatches;\n', modPath);
  return m.exports.listAuditMismatches;
}

(async () => {
  // ---------- Test 1: matchmaker apply with healthy DB → no warning ----------
  const sb = makeFake();
  const r = await applyMatchmakerRank(sb, 42, sb.state.agent_actions[0]);
  ok(r.ok === true, '[healthy] applyMatchmakerRank returns ok:true');
  ok(r.audit_warning === null, '[healthy] audit_warning is null on success');
  ok(sb.state.plan_bids.find(b => b.id === 'bid-w').status === 'accepted',
     '[healthy] winning bid was accepted');

  // ---------- Test 2: stamp update fails → warning surfaced ----------
  const sb2 = makeFake({ injectErrors: { 'agent_actions.update': 'simulated DB hiccup' } });
  const r2 = await applyMatchmakerRank(sb2, 42, sb2.state.agent_actions[0]);
  ok(r2.ok === true, '[stamp-fail] still returns ok:true (mutation already committed)');
  ok(typeof r2.audit_warning === 'string' && r2.audit_warning.includes('simulated DB hiccup'),
     '[stamp-fail] audit_warning surfaces underlying DB error');
  ok(r2.audit_warning.includes('still shows it as pending'),
     '[stamp-fail] audit_warning explains the queue is still pending');
  ok(sb2.state.plan_bids.find(b => b.id === 'bid-w').status === 'accepted',
     '[stamp-fail] winning bid was still accepted');

  // ---------- Test 3: insert-audit-row fails → warning surfaced ----------
  const sb3 = makeFake({ injectErrors: { 'agent_actions.insert': 'unique violation on agent_actions' } });
  const r3 = await applyMatchmakerRank(sb3, 42, sb3.state.agent_actions[0]);
  ok(r3.ok === true, '[insert-fail] still returns ok:true');
  ok(typeof r3.audit_warning === 'string' && r3.audit_warning.includes('unique violation'),
     '[insert-fail] audit_warning surfaces the insert error');

  // ---------- Test 4: listAuditMismatches detects Stripe/queue divergence ----------
  const listAuditMismatches = getListAuditMismatches();
  const sb4 = makeFake();
  sb4.state.agent_actions = [
    // proposed + Stripe captured → SHOULD show up
    { id: 99, agent_slug: 'treasurer', action_type: 'review', review_status: 'proposed',
      decision: { recommendation: 'approve_capture', payload: { care_plan_id: 'plan-stuck' } },
      created_at: '2026-05-15T00:00:00Z' },
    // already executed → should NOT show up
    { id: 100, agent_slug: 'treasurer', action_type: 'review', review_status: 'executed',
      decision: { recommendation: 'approve_capture', payload: { care_plan_id: 'plan-clean' } },
      created_at: '2026-05-14T00:00:00Z' },
    // proposed but Stripe still uncaptured → should NOT show up
    { id: 101, agent_slug: 'treasurer', action_type: 'review', review_status: 'proposed',
      decision: { recommendation: 'approve_capture', payload: { care_plan_id: 'plan-pending' } },
      created_at: '2026-05-13T00:00:00Z' }
  ];
  sb4.state.care_plan_completions = [
    { id: 'cpc-1', care_plan_id: 'plan-stuck',   payment_capture_status: 'captured',
      captured_at: '2026-05-15T00:00:00Z', captured_amount: 250, stripe_payment_intent_id: 'pi_stuck' },
    { id: 'cpc-2', care_plan_id: 'plan-clean',   payment_capture_status: 'captured',
      captured_at: '2026-05-14T00:00:00Z', captured_amount: 100, stripe_payment_intent_id: 'pi_clean' },
    { id: 'cpc-3', care_plan_id: 'plan-pending', payment_capture_status: 'requires_capture',
      stripe_payment_intent_id: 'pi_pending' }
  ];
  const scan = await listAuditMismatches(sb4);
  ok(Array.isArray(scan.mismatches), '[scan] returns a mismatches array');
  ok(scan.mismatches.length === 1 && scan.mismatches[0].action_id === 99,
     '[scan] only the proposed+captured row (action 99) is reported');
  ok(scan.mismatches[0].payment_intent_id === 'pi_stuck',
     '[scan] mismatch payload includes the Stripe PI ID');
  ok(typeof scan.mismatches[0].hint === 'string' && scan.mismatches[0].hint.includes('idempotency'),
     '[scan] mismatch payload includes the recovery hint');

  // ---------- Test 5: scan fails loud on a DB error (no false negatives) ----------
  const sb5 = makeFake({ injectErrors: { 'care_plan_completions.select': 'connection reset' } });
  sb5.state.agent_actions = [
    { id: 99, agent_slug: 'treasurer', action_type: 'review', review_status: 'proposed',
      decision: { recommendation: 'approve_capture', payload: { care_plan_id: 'plan-stuck' } },
      created_at: '2026-05-15T00:00:00Z' }
  ];
  let threw = null;
  try { await listAuditMismatches(sb5); }
  catch (e) { threw = e; }
  ok(threw && /connection reset/.test(threw.message),
     '[scan-fail-loud] DB error on cpc lookup throws (does NOT silently report 0 rows)');

  if (failures) {
    console.error(`\n${failures} failure(s) / ${passed} pass(es)`);
    process.exit(1);
  }
  console.log(`\nAll Task #323 audit-warning checks passed (${passed} assertions).`);
})().catch(e => { console.error('test threw:', e); process.exit(1); });

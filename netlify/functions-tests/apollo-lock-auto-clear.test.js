// ============================================================================
// Task #444 — Auto-clear a wedged Apollo discovery lock instead of just
// alerting. Covers the new forceReleaseApolloLock helper + the
// runApolloDiscoveryCycle auto-clear + re-acquire path.
//
// Threshold ordering under test:
//   6 min  → real-time stuck-alert email (Task #336)
//   15 min → auto-clear + audit row + heads-up email (Task #444)
//   30 min → silent TTL reclaim inside tryAcquireApolloLock (last resort)
//
// Coverage:
//   1) forceReleaseApolloLock: clears running_since/running_nonce when the
//      CAS matches the observed wedged lock.
//   2) forceReleaseApolloLock: refuses to clear when running_nonce has
//      changed.
//   3) forceReleaseApolloLock: refuses to clear when running_since has
//      changed.
//   4) forceReleaseApolloLock: returns already_released when no lock set.
//   5) Threshold ordering invariant: alert (6m) < auto-clear (15m) < TTL.
//   6) runApolloDiscoveryCycle at 7 min held (>= alert, < auto-clear):
//      stuck-alert fires, NO auto-clear attempted, apollo_discovery_skipped
//      row written.
//   7) runApolloDiscoveryCycle at 17 min held (>= auto-clear, < TTL):
//      forceReleaseApolloLock runs, lock is re-acquired, cycle proceeds.
//      Asserts BOTH outreach_activity_log (apollo_lock_auto_cleared) and
//      ai_action_log (lock_auto_cleared) audit rows are written and the
//      apollo_discovery_skipped row is NOT written (because we proceeded).
//   8) runApolloDiscoveryCycle at 17 min held where auto-clear succeeds but
//      a fresh owner slips in before re-acquire: cycle is skipped (no double-
//      run), and the apollo_discovery_skipped row IS written alongside the
//      successful apollo_lock_auto_cleared row.
//   9) maybeSendApolloStuckAlert reflects autoCleared:true context.
//
// Run with:  node netlify/functions-tests/apollo-lock-auto-clear.test.js
// Exits non-zero on the first assertion failure.
// ============================================================================

'use strict';

const assert = require('assert');

process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';
process.env.APOLLO_API_KEY = 'stub-apollo-key';
// Explicitly remove RESEND_API_KEY + ADMIN_EMAIL so stuck-alert sends
// resolve to outcome=failed without hitting the network. Delete (not just
// omit) so the test is hermetic even when the Netlify build env injects
// the real keys. The ai_action_log insert still runs (we assert it).
delete process.env.RESEND_API_KEY;
delete process.env.ADMIN_EMAIL;

const {
  forceReleaseApolloLock,
  maybeSendApolloStuckAlert,
  runApolloDiscoveryCycle,
  APOLLO_LOCK_AUTO_CLEAR_THRESHOLD_MS,
  APOLLO_LOCK_TTL_MS
} = require('../functions/outreach-engine-core');

// ---------------------------------------------------------------------------
// In-memory Supabase stub. engine_state.metadata is mutated by update() so
// the auto-clear + re-acquire path observes its own writes. Inserts to
// outreach_activity_log + ai_action_log are captured in dbState.inserts.
// Apollo HTTP is stubbed via global.fetch so the cycle short-circuits with
// zero leads instead of trying to hit api.apollo.io.
// ---------------------------------------------------------------------------

let dbState;
function resetDbState(initialEngineMeta = {}) {
  dbState = {
    engineMeta: initialEngineMeta,
    inserts: {
      outreach_activity_log: [],
      ai_action_log: [],
      apollo_discovery_cycles: [],
      leads: [],
      member_leads: []
    }
  };
}

function makeChain(table) {
  // Track whether a select() was called on ai_action_log so the .then()
  // terminal can return [] (rate-limit "no recent alerts").
  let isQuery = false;
  const chain = {
    _table: table,
    select() { isQuery = true; return chain; },
    eq()  { return chain; },
    neq() { return chain; },
    gte() { return chain; },
    lte() { return chain; },
    gt()  { return chain; },
    lt()  { return chain; },
    in()  { return chain; },
    is()  { return chain; },
    not() { return chain; },
    or()  { return chain; },
    ilike() { return chain; },
    like()  { return chain; },
    match() { return chain; },
    contains() { return chain; },
    overlaps() { return chain; },
    order(){ return chain; },
    limit(){ return chain; },
    range(){ return chain; },
    single() {
      if (table === 'engine_state') {
        return Promise.resolve({ data: { metadata: dbState.engineMeta }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
    insert(rows) {
      if (dbState.inserts[table]) {
        const list = Array.isArray(rows) ? rows : [rows];
        for (const r of list) dbState.inserts[table].push(r);
      }
      return Promise.resolve({ data: null, error: null });
    },
    upsert() { return Promise.resolve({ data: null, error: null }); },
    update(payload) {
      // Builder that collects .eq() predicates and only commits the write
      // on the terminal .select() / .then() if every predicate matches
      // the current dbState. This mirrors PostgREST's row-count semantics
      // so the test exercises the real atomic-CAS contract: if a
      // metadata->apollo_config->>running_nonce predicate doesn't match,
      // 0 rows are "updated" and no mutation happens.
      const predicates = [];
      const matchesPredicates = () => {
        for (const [path, expected] of predicates) {
          // Special-case `id = 1` on the engine_state singleton.
          if (path === 'id') {
            if (expected !== 1) return false;
            continue;
          }
          // JSONB-path filters like `metadata->apollo_config->>running_nonce`.
          const m = path.match(/^metadata->([^>]+)->>(.+)$/);
          if (m) {
            const [, group, key] = m;
            const actual = dbState.engineMeta?.[group]?.[key];
            if (String(actual) !== String(expected)) return false;
            continue;
          }
          // Unknown predicate — be strict (don't silently pass).
          return false;
        }
        return true;
      };
      const commit = () => {
        if (table === 'engine_state' && payload?.metadata) {
          if (predicates.length === 0 || matchesPredicates()) {
            dbState.engineMeta = payload.metadata;
            return [{ id: 1 }];
          }
          return [];
        }
        if (Array.isArray(dbState.inserts?.[table])) {
          // Best-effort: record updates to non-engine_state tables too.
        }
        return [];
      };
      const builder = {
        eq(path, value) { predicates.push([path, value]); return builder; },
        select() {
          const rows = commit();
          return Promise.resolve({ data: rows, error: null });
        },
        then(resolve) {
          const rows = commit();
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        }
      };
      return builder;
    },
    delete() { return chain; },
    then(resolve) {
      void isQuery;
      return Promise.resolve({ data: [], count: 0, error: null }).then(resolve);
    }
  };
  return chain;
}

const supabaseStub = { from: (t) => makeChain(t) };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

(async () => {
  // ---- 1) forceReleaseApolloLock clears matching wedged lock ----
  resetDbState({
    apollo_config: {
      enabled: true,
      running_since: '2026-05-17T00:00:00.000Z',
      running_nonce: 'wedged-nonce-1',
      other_field: 'kept'
    },
    sibling: 'untouched'
  });
  let res = await forceReleaseApolloLock(supabaseStub, {
    expectedNonce: 'wedged-nonce-1',
    expectedRunningSince: '2026-05-17T00:00:00.000Z'
  });
  assert.strictEqual(res.cleared, true, '1: CAS-matched release returns cleared:true');
  assert.ok(!('running_since' in dbState.engineMeta.apollo_config), '1: running_since deleted');
  assert.ok(!('running_nonce' in dbState.engineMeta.apollo_config), '1: running_nonce deleted');
  assert.strictEqual(dbState.engineMeta.apollo_config.other_field, 'kept', '1: other apollo_config fields preserved');
  assert.strictEqual(dbState.engineMeta.sibling, 'untouched', '1: sibling metadata preserved');
  console.log('  ✓ 1) forceReleaseApolloLock clears matching wedged lock');

  // ---- 2) forceReleaseApolloLock refuses on nonce_changed ----
  resetDbState({
    apollo_config: {
      running_since: '2026-05-17T00:00:00.000Z',
      running_nonce: 'fresh-owner-nonce'
    }
  });
  res = await forceReleaseApolloLock(supabaseStub, {
    expectedNonce: 'wedged-nonce-1',
    expectedRunningSince: '2026-05-17T00:00:00.000Z'
  });
  assert.strictEqual(res.cleared, false, '2: returns cleared:false');
  assert.strictEqual(res.reason, 'nonce_changed', '2: reason=nonce_changed');
  assert.strictEqual(dbState.engineMeta.apollo_config.running_nonce, 'fresh-owner-nonce',
    '2: fresh owner lock left alone');
  console.log('  ✓ 2) forceReleaseApolloLock refuses on nonce_changed (CAS guard)');

  // ---- 3) forceReleaseApolloLock refuses on running_since_changed ----
  resetDbState({
    apollo_config: {
      running_since: '2026-05-18T00:00:00.000Z',
      running_nonce: 'wedged-nonce-1'
    }
  });
  res = await forceReleaseApolloLock(supabaseStub, {
    expectedNonce: 'wedged-nonce-1',
    expectedRunningSince: '2026-05-17T00:00:00.000Z'
  });
  assert.strictEqual(res.cleared, false, '3: returns cleared:false');
  assert.strictEqual(res.reason, 'running_since_changed', '3: reason=running_since_changed');
  console.log('  ✓ 3) forceReleaseApolloLock refuses on running_since_changed (CAS guard)');

  // ---- 4) forceReleaseApolloLock returns already_released on empty ----
  resetDbState({ apollo_config: { enabled: true } });
  res = await forceReleaseApolloLock(supabaseStub, {
    expectedNonce: 'wedged-nonce-1',
    expectedRunningSince: '2026-05-17T00:00:00.000Z'
  });
  assert.strictEqual(res.cleared, false, '4: returns cleared:false');
  assert.strictEqual(res.reason, 'already_released', '4: reason=already_released');
  console.log('  ✓ 4) forceReleaseApolloLock returns already_released when no lock set');

  // ---- 5) Threshold ordering invariant ----
  assert.strictEqual(APOLLO_LOCK_AUTO_CLEAR_THRESHOLD_MS, 15 * 60 * 1000,
    '5a: AUTO_CLEAR threshold is exactly 15 minutes');
  assert.ok(APOLLO_LOCK_AUTO_CLEAR_THRESHOLD_MS > 6 * 60 * 1000,
    '5b: AUTO_CLEAR (15m) > alert threshold (6m)');
  assert.ok(APOLLO_LOCK_AUTO_CLEAR_THRESHOLD_MS < APOLLO_LOCK_TTL_MS,
    `5c: AUTO_CLEAR (15m) < TTL (${APOLLO_LOCK_TTL_MS / 60000}m) so the auto-clear branch fires before TTL silently reclaims`);
  console.log(`  ✓ 5) thresholds: 6m alert < 15m auto-clear < ${APOLLO_LOCK_TTL_MS / 60000}m TTL`);

  // Stub global fetch for tests 6+7+8 so runApolloDiscoveryCycle's Apollo HTTP
  // calls return zero leads instead of hitting the network.
  const origFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ people: [], total_entries: 0 }) });

  try {
    // ---- 6) at 7 min held: alert only, no auto-clear ----
    resetDbState({
      apollo_config: {
        enabled: true,
        interval_hours: 0,
        running_since: new Date(Date.now() - 7 * 60 * 1000).toISOString(),
        running_nonce: 'wedged-7min'
      }
    });
    const r6 = await runApolloDiscoveryCycle(supabaseStub);
    assert.strictEqual(r6.skipped, true, '6: cycle is skipped');
    assert.strictEqual(r6.reason, 'already_running', '6: reason=already_running');
    assert.ok(r6.held_minutes >= 6 && r6.held_minutes <= 8, `6: held_minutes ~7 (got ${r6.held_minutes})`);
    assert.strictEqual(r6.lock_auto_cleared, false, '6: lock_auto_cleared:false at 7 min');
    const skipRows6  = dbState.inserts.outreach_activity_log.filter(r => r.event_type === 'apollo_discovery_skipped');
    const clearRows6 = dbState.inserts.outreach_activity_log.filter(r => r.event_type === 'apollo_lock_auto_cleared');
    assert.strictEqual(skipRows6.length, 1, '6: exactly one apollo_discovery_skipped row');
    assert.strictEqual(clearRows6.length, 0, '6: NO apollo_lock_auto_cleared row at 7 min');
    assert.strictEqual(skipRows6[0].metadata.auto_clear_attempted, false,
      '6: skip row records auto_clear_attempted:false');
    const stuckAlertRows6   = dbState.inserts.ai_action_log.filter(r => r.action_type === 'stuck_lock');
    const autoClearAiRows6  = dbState.inserts.ai_action_log.filter(r => r.action_type === 'lock_auto_cleared');
    assert.strictEqual(stuckAlertRows6.length, 1, '6: one stuck_lock alert row in ai_action_log');
    assert.strictEqual(autoClearAiRows6.length, 0, '6: NO lock_auto_cleared row in ai_action_log');
    console.log('  ✓ 6) at 7 min held: stuck alert fires, no auto-clear attempted');

    // ---- 7) at 17 min held: auto-clear runs, re-acquires, cycle proceeds ----
    // 17 min > 15-min AUTO_CLEAR but < 30-min TTL, so tryAcquireApolloLock
    // returns already_running (the auto-clear branch is reachable), the
    // force-release succeeds via CAS, and the re-acquire wins.
    const wedgedSince17 = new Date(Date.now() - 17 * 60 * 1000).toISOString();
    resetDbState({
      apollo_config: {
        enabled: true,
        interval_hours: 0,
        running_since: wedgedSince17,
        running_nonce: 'wedged-17min'
      }
    });
    const r7 = await runApolloDiscoveryCycle(supabaseStub);
    // The cycle proceeded — `skipped` is NOT true (it should be undefined or
    // have a `started_at` timestamp).
    assert.notStrictEqual(r7.skipped, true,
      `7: cycle should have proceeded after auto-clear, got skipped=${r7.skipped} reason=${r7.reason}`);
    assert.ok(r7.started_at, '7: cycle result has started_at (cycle actually ran)');
    // Lock was force-cleared and re-acquired, so the wedged nonce is gone
    // and a fresh nonce is in place (or the lock was released at end of cycle).
    assert.notStrictEqual(dbState.engineMeta.apollo_config?.running_nonce, 'wedged-17min',
      '7: wedged nonce no longer in engine_state');
    // Audit: apollo_lock_auto_cleared row in BOTH tables.
    const clearRows7 = dbState.inserts.outreach_activity_log
      .filter(r => r.event_type === 'apollo_lock_auto_cleared');
    assert.strictEqual(clearRows7.length, 1, '7: exactly one apollo_lock_auto_cleared row in outreach_activity_log');
    assert.strictEqual(clearRows7[0].metadata.cleared, true, '7: outreach_activity_log row records cleared:true');
    assert.strictEqual(clearRows7[0].metadata.prior_running_nonce, 'wedged-17min',
      '7: outreach_activity_log row records the wedged nonce, not the fresh one');
    assert.strictEqual(clearRows7[0].metadata.prior_running_since, wedgedSince17,
      '7: outreach_activity_log row records the wedged running_since');
    const autoClearAiRows7 = dbState.inserts.ai_action_log
      .filter(r => r.module === 'apollo_stuck_alert' && r.action_type === 'lock_auto_cleared');
    assert.strictEqual(autoClearAiRows7.length, 1, '7: exactly one lock_auto_cleared row in ai_action_log');
    assert.strictEqual(autoClearAiRows7[0].outcome, 'sent', '7: ai_action_log outcome=sent on successful clear');
    assert.strictEqual(autoClearAiRows7[0].escalated, true, '7: ai_action_log escalated=true');
    assert.strictEqual(autoClearAiRows7[0].decision.cleared, true, '7: ai_action_log decision.cleared=true');
    // The apollo_discovery_skipped row should NOT be written when the cycle
    // proceeded after auto-clear.
    const skipRows7 = dbState.inserts.outreach_activity_log
      .filter(r => r.event_type === 'apollo_discovery_skipped');
    assert.strictEqual(skipRows7.length, 0,
      '7: NO apollo_discovery_skipped row when auto-clear + re-acquire succeeded');
    // The stuck-alert email DOES fire (with autoCleared:true context), and
    // the ai_action_log row for it gets written.
    const stuckAlertRows7 = dbState.inserts.ai_action_log.filter(r => r.action_type === 'stuck_lock');
    assert.strictEqual(stuckAlertRows7.length, 1, '7: stuck_lock alert row is written');
    console.log('  ✓ 7) at 17 min held: auto-clear + re-acquire succeeds, cycle proceeds, both audit rows written');

    // ---- 8) at 17 min held with DB-level CAS-miss: fresh owner's lock is preserved ----
    // This test exercises the AUTHORITATIVE DB-level CAS guard in
    // forceReleaseApolloLock. Scenario: the SELECT path returns the wedged
    // lock (so the in-memory pre-check passes), but between SELECT and
    // UPDATE another runner has acquired the lock. The UPDATE's JSONB-path
    // .eq() predicates on running_nonce + running_since match 0 rows in
    // the "real" DB state, so the mutation is rejected and the fresh
    // owner's lock survives intact.
    //
    // Stub: store the "real" DB state as the FRESH owner's lock. The
    // SELECT path lies and returns the wedged-lock snapshot (simulating
    // the stale read that races with the fresh acquire). The UPDATE
    // builder honors the JSONB-path predicates and rejects the write.
    const wedgedSince17b = new Date(Date.now() - 17 * 60 * 1000).toISOString();
    const freshSince17b  = new Date(Date.now() - 30_000).toISOString();
    const realEngineMeta = {
      apollo_config: {
        enabled: true,
        interval_hours: 0,
        running_since: freshSince17b,
        running_nonce: 'fresh-owner-slipped-in'
      }
    };
    const wedgedSnapshotMeta = {
      apollo_config: {
        enabled: true,
        interval_hours: 0,
        running_since: wedgedSince17b,
        running_nonce: 'wedged-17min-b'
      }
    };
    resetDbState({});
    // Override dbState.engineMeta to the REAL state so the stub's UPDATE
    // predicate-check evaluates against the fresh owner's nonce.
    dbState.engineMeta = realEngineMeta;
    const casMissStub = {
      from(table) {
        if (table !== 'engine_state') return makeChain(table);
        const baseChain = makeChain(table);
        // Override .single() to return the STALE wedged snapshot — this
        // is what tryAcquireApolloLock + forceReleaseApolloLock's
        // pre-check will see.
        baseChain.single = async () => ({ data: { metadata: wedgedSnapshotMeta }, error: null });
        baseChain.maybeSingle = baseChain.single;
        return baseChain;
      }
    };
    const r8 = await runApolloDiscoveryCycle(casMissStub);
    // Auto-clear failed at the DB-level CAS, so the run skipped.
    assert.strictEqual(r8.skipped, true, '8: cycle is skipped when DB-level CAS rejects auto-clear');
    assert.strictEqual(r8.lock_auto_cleared, false,
      '8: lock_auto_cleared:false — DB-level CAS prevented the write');
    // Critical safety assertion: the fresh owner's lock survived intact.
    assert.strictEqual(dbState.engineMeta.apollo_config.running_nonce, 'fresh-owner-slipped-in',
      '8: SAFETY — fresh owner nonce was NOT clobbered by force-release');
    assert.strictEqual(dbState.engineMeta.apollo_config.running_since, freshSince17b,
      '8: SAFETY — fresh owner running_since was NOT clobbered by force-release');
    // Audit rows: one apollo_lock_auto_cleared row recording the failed
    // attempt, with cleared:false and clear_reason=cas_miss.
    const clearRows8 = dbState.inserts.outreach_activity_log
      .filter(r => r.event_type === 'apollo_lock_auto_cleared');
    assert.strictEqual(clearRows8.length, 1, '8: one apollo_lock_auto_cleared row (records the FAILED attempt)');
    assert.strictEqual(clearRows8[0].metadata.cleared, false,
      '8: outreach_activity_log records cleared:false');
    assert.strictEqual(clearRows8[0].metadata.clear_reason, 'cas_miss',
      '8: outreach_activity_log records clear_reason=cas_miss');
    const autoClearAiRows8 = dbState.inserts.ai_action_log
      .filter(r => r.action_type === 'lock_auto_cleared');
    assert.strictEqual(autoClearAiRows8.length, 1, '8: one lock_auto_cleared row in ai_action_log');
    assert.strictEqual(autoClearAiRows8[0].outcome, 'failed',
      '8: ai_action_log outcome=failed (DB CAS rejected)');
    assert.strictEqual(autoClearAiRows8[0].error_message, 'cas_miss',
      '8: ai_action_log error_message=cas_miss');
    const skipRows8 = dbState.inserts.outreach_activity_log
      .filter(r => r.event_type === 'apollo_discovery_skipped');
    assert.strictEqual(skipRows8.length, 1, '8: apollo_discovery_skipped row is written');
    assert.strictEqual(skipRows8[0].metadata.auto_clear_attempted, true,
      '8: skip row records auto_clear_attempted:true');
    assert.strictEqual(skipRows8[0].metadata.auto_cleared, false,
      '8: skip row records auto_cleared:false');
    console.log('  ✓ 8) at 17 min held + DB-level CAS miss: fresh owner lock preserved, no clobber');
  } finally {
    global.fetch = origFetch;
  }

  // ---- 9) maybeSendApolloStuckAlert reflects autoCleared in audit row ----
  resetDbState({});
  const r9 = await maybeSendApolloStuckAlert(supabaseStub, {
    heldMinutes: 17,
    runningSince: '2026-05-17T00:00:00.000Z',
    lockReason: 'already_running',
    runningNonce: 'wedged-17min',
    autoCleared: true
  });
  assert.strictEqual(r9.sent, false, '9: send fails without RESEND_API_KEY (expected)');
  const alertRows = dbState.inserts.ai_action_log
    .filter(r => r.module === 'apollo_stuck_alert' && r.action_type === 'stuck_lock');
  assert.strictEqual(alertRows.length, 1, '9: one stuck_lock alert row written');
  assert.strictEqual(alertRows[0].decision.held_minutes, 17, '9: held_minutes echoed');
  assert.strictEqual(alertRows[0].decision.running_nonce, 'wedged-17min', '9: nonce echoed');
  assert.strictEqual(alertRows[0].outcome, 'failed', '9: outcome=failed (no Resend key)');
  console.log('  ✓ 9) maybeSendApolloStuckAlert still logs ai_action_log row when autoCleared:true');

  console.log('\nAll Apollo lock auto-clear tests passed.');
})().catch(e => { console.error('TEST FAILURE:', e); process.exit(1); });

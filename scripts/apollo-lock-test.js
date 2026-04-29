#!/usr/bin/env node

// ─────────────────────────────────────────────────────────────────────────────
// Task #142 — Apollo discovery cycle concurrency lock test.
//
// Verifies tryAcquireApolloLock / releaseApolloLock behavior in
// netlify/functions/outreach-engine-core.js so a scheduled cycle and an
// admin-triggered "Run now" cannot run at the same time.
//
// Run from project root:
//   node scripts/apollo-lock-test.js
//
// Exit codes: 0 all passed, 1 any check failed.
// ─────────────────────────────────────────────────────────────────────────────

const {
  tryAcquireApolloLock,
  releaseApolloLock,
  APOLLO_LOCK_TTL_MS
} = require('../netlify/functions/outreach-engine-core');

function makeMockSupabase(initialMeta = {}) {
  let row = { id: 1, metadata: { ...initialMeta } };
  const reads = { count: 0 };
  const writes = { count: 0 };

  function from(table) {
    if (table !== 'engine_state') {
      throw new Error(`Unexpected table: ${table}`);
    }
    return {
      select() {
        return {
          eq() {
            return {
              single: async () => {
                reads.count++;
                return { data: { metadata: row.metadata }, error: null };
              }
            };
          }
        };
      },
      update(payload) {
        return {
          eq: async () => {
            writes.count++;
            row.metadata = payload.metadata;
            return { data: null, error: null };
          }
        };
      }
    };
  }

  return {
    from,
    _state: {
      get metadata() { return row.metadata; },
      reads,
      writes
    }
  };
}

let pass = 0;
let fail = 0;
function assert(cond, name, extra) {
  if (cond) {
    pass++;
    console.log(`✓ ${name}`);
  } else {
    fail++;
    console.error(`✗ ${name}`, extra ? JSON.stringify(extra) : '');
  }
}

(async () => {
  // 1. Fresh acquire works on empty state.
  {
    const sb = makeMockSupabase();
    const lock = await tryAcquireApolloLock(sb);
    assert(lock.acquired === true, 'fresh acquire succeeds', lock);
    assert(typeof lock.nonce === 'string' && lock.nonce.length > 0, 'lock has nonce');
    assert(!!sb._state.metadata.apollo_config?.running_since, 'running_since written');
    assert(sb._state.metadata.apollo_config?.running_nonce === lock.nonce, 'running_nonce written');
  }

  // 2. Second acquire while first is held returns acquired=false.
  {
    const sb = makeMockSupabase();
    const first = await tryAcquireApolloLock(sb);
    const second = await tryAcquireApolloLock(sb);
    assert(first.acquired === true, 'first acquire succeeds');
    assert(second.acquired === false, 'second concurrent acquire is blocked', second);
    assert(second.reason === 'already_running', 'blocked reason is already_running', second);
    assert(second.running_since === first.since, 'blocked response surfaces running_since');
  }

  // 3. Release frees the lock so the next acquire wins.
  {
    const sb = makeMockSupabase();
    const first = await tryAcquireApolloLock(sb);
    const released = await releaseApolloLock(sb, first.nonce);
    assert(released === true, 'release returns true');
    assert(!sb._state.metadata.apollo_config?.running_since, 'running_since cleared after release');
    const second = await tryAcquireApolloLock(sb);
    assert(second.acquired === true, 'next acquire after release wins');
  }

  // 4. Stale lock (>TTL) is auto-expired and reclaimed.
  {
    const staleIso = new Date(Date.now() - (APOLLO_LOCK_TTL_MS + 60_000)).toISOString();
    const sb = makeMockSupabase({
      apollo_config: { running_since: staleIso, running_nonce: 'old-crashed-cycle' }
    });
    const lock = await tryAcquireApolloLock(sb);
    assert(lock.acquired === true, 'stale lock is reclaimed', lock);
    assert(sb._state.metadata.apollo_config.running_nonce === lock.nonce, 'stale nonce overwritten');
  }

  // 5. Fresh-but-unexpired lock (<TTL) is NOT reclaimed.
  {
    const recentIso = new Date(Date.now() - 60_000).toISOString(); // 1 min old
    const sb = makeMockSupabase({
      apollo_config: { running_since: recentIso, running_nonce: 'in-flight-cycle' }
    });
    const lock = await tryAcquireApolloLock(sb);
    assert(lock.acquired === false, 'fresh in-flight lock blocks', lock);
    assert(lock.running_nonce === 'in-flight-cycle', 'reports holder nonce');
  }

  // 6. Release with a mismatched nonce leaves the newer lock alone.
  {
    const sb = makeMockSupabase({
      apollo_config: { running_since: new Date().toISOString(), running_nonce: 'newer-owner' }
    });
    const released = await releaseApolloLock(sb, 'older-nonce-from-crashed-cycle');
    assert(released === false, 'mismatched-nonce release returns false');
    assert(sb._state.metadata.apollo_config.running_nonce === 'newer-owner', 'newer lock preserved');
  }

  // 7. Invalid timestamp does not falsely block — it's ignored and reclaimed.
  {
    const sb = makeMockSupabase({
      apollo_config: { running_since: 'not-a-date', running_nonce: 'garbage' }
    });
    const lock = await tryAcquireApolloLock(sb);
    assert(lock.acquired === true, 'invalid timestamp does not permanently block');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(err => {
  console.error('Unexpected test crash:', err);
  process.exit(1);
});

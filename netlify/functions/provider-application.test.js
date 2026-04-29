// ============================================================================
// Task #181 — Race-condition regression test for /api/provider-application.
//
// Why this test exists:
//   Task #133 closed a real race in the provider-application flow:
//     1. /api/provider-application enforces "1 application per user per 24h"
//        by SELECT-then-INSERT. Two requests landing in the same millisecond
//        (e.g. a double-click on the submit button) could both pass the
//        SELECT before either INSERTed and produce two duplicate rows.
//     2. supabase/migrations/20260428f_provider_applications_one_per_day.sql
//        added a partial UNIQUE index that makes Postgres reject the second
//        insert with code 23505 (unique_violation).
//     3. netlify/functions/provider-application.js translates that 23505
//        back into the same friendly 429 response the application-level
//        fast path returns, including `existing_application_id`.
//
//   This test fires two near-simultaneous handler invocations with the same
//   JWT and asserts:
//     - exactly one provider_applications row is inserted,
//     - the winner gets HTTP 200 with { application_id, business_name },
//     - the loser gets HTTP 429 with the same body shape the fast-path 429
//       returns, including a non-null `existing_application_id` that points
//       at the winner's id.
//
//   The Supabase client is stubbed in-process. The fast-path SELECT is
//   forced to return empty for *both* requests (which is what causes the
//   race in production), and the second INSERT is forced to fail with the
//   simulated Postgres error { code: '23505', ... }. That exercises every
//   line of the handler's race-handling branch without requiring a live
//   Postgres or a deployed function.
//
// Run with:  node netlify/functions/provider-application.test.js
// Exits non-zero on the first assertion failure.
// ============================================================================

'use strict';

const assert = require('assert');
const Module = require('module');

process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';
// Make sure no real outbound email is attempted even if the Resend stub
// were somehow bypassed.
delete process.env.RESEND_API_KEY;

const FAKE_USER_ID = '11111111-2222-3333-4444-555555555555';
const FAKE_USER_EMAIL = 'provider-applicant@example.com';
const FAKE_TOKEN = 'fake-jwt-token-task-181';
const WINNER_APPLICATION_ID = '99999999-aaaa-bbbb-cccc-dddddddddddd';

// Shared state across all stub Supabase clients. Because every concurrent
// handler invocation does its own getServiceSupabase() (which calls
// createClient()), all the resulting clients must share this state so the
// "race" simulation is consistent across them.
const state = {
  insertedRows: [],   // every successful provider_applications insert
  insertAttempts: 0   // every attempt, including the rejected one
};

// ---------------------------------------------------------------------------
// Supabase stub.
//
// The chain has to satisfy the full path the handler walks:
//
//   Fast-path rate-limit SELECT (both requests):
//     .from('provider_applications')
//       .select('id, created_at')
//       .eq('user_id', userId)
//       .gte('created_at', cutoff)
//       .limit(1)
//   → resolved value: { data: [], error: null }
//   (no .order() call → distinguishes from the loser-lookup below)
//
//   INSERT (both requests):
//     .from('provider_applications')
//       .insert(row)
//       .select('id, business_name, contact_name, email')
//       .single()
//   → first call: { data: { id: WINNER, ... }, error: null }
//   → subsequent calls: { data: null, error: { code: '23505', ... } }
//
//   Loser lookup for existing_application_id (loser only):
//     .from('provider_applications')
//       .select('id')
//       .eq('user_id', userId)
//       .gte('created_at', cutoff)
//       .order('created_at', { ascending: false })
//       .limit(1)
//   → resolved value: { data: [{ id: WINNER }], error: null }
//   (the .order() call is what flags this query as the loser lookup)
//
//   Side effects (best-effort, non-fatal):
//     .from('agent_events').insert(...).select('id').single()  → success
//     .from('admin_audit_log').insert(...)                     → success
// ---------------------------------------------------------------------------
function makeSupabaseStub() {
  return {
    auth: {
      getUser: () => Promise.resolve({
        data: { user: { id: FAKE_USER_ID, email: FAKE_USER_EMAIL } },
        error: null
      })
    },
    from(table) {
      return makeQuery(table);
    }
  };
}

function makeQuery(table) {
  let ordered = false;

  const q = {
    select: () => q,
    eq: () => q,
    neq: () => q,
    in: () => q,
    gt: () => q,
    gte: () => q,
    lt: () => q,
    lte: () => q,
    is: () => q,
    or: () => q,
    not: () => q,
    like: () => q,
    ilike: () => q,
    filter: () => q,
    contains: () => q,
    order: () => { ordered = true; return q; },
    limit: () => q,
    range: () => q,
    single:      () => Promise.resolve({ data: null, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),

    insert(row) {
      if (table === 'provider_applications') {
        state.insertAttempts += 1;
        if (state.insertedRows.length === 0) {
          // Winner — first insert succeeds.
          const inserted = { ...row, id: WINNER_APPLICATION_ID };
          state.insertedRows.push(inserted);
          return {
            select: () => ({
              single: () => Promise.resolve({
                data: {
                  id: WINNER_APPLICATION_ID,
                  business_name: row.business_name,
                  contact_name:  row.contact_name,
                  email:         row.email
                },
                error: null
              })
            })
          };
        }
        // Loser — Postgres rejects the duplicate with 23505.
        return {
          select: () => ({
            single: () => Promise.resolve({
              data: null,
              error: {
                code: '23505',
                message: 'duplicate key value violates unique constraint "provider_applications_one_per_user_per_day"'
              }
            })
          })
        };
      }

      if (table === 'agent_events') {
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'agent-event-stub-1' }, error: null })
          })
        };
      }

      // admin_audit_log (and any other best-effort insert) — directly awaited.
      return Promise.resolve({ data: null, error: null });
    },

    // Awaited terminal of the chain (e.g. fast-path SELECT, loser lookup).
    then(resolve, reject) {
      if (table === 'provider_applications') {
        // The loser lookup is the one chain that calls .order() before
        // awaiting; everything else is the fast-path rate-limit SELECT.
        if (ordered && state.insertedRows.length > 0) {
          return Promise.resolve({ data: [{ id: WINNER_APPLICATION_ID }], error: null }).then(resolve, reject);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      }
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    }
  };

  return q;
}

// ---------------------------------------------------------------------------
// Module stubs.
//
//   - @supabase/supabase-js  → returns our in-memory race-aware client.
//   - resend                 → not installed in this workspace; intercept
//                              the require() so loading provider-application
//                              doesn't crash on import.
//
// Override Module.prototype.require so the stubs apply to the
// provider-application handler when it is loaded below, regardless of
// whether the real packages are present on disk.
// ---------------------------------------------------------------------------
const origRequire = Module.prototype.require;
Module.prototype.require = function patchedRequire(id) {
  if (id === '@supabase/supabase-js') {
    return { createClient: () => makeSupabaseStub() };
  }
  if (id === 'resend') {
    return {
      Resend: function ResendStub() {
        return { emails: { send: async () => ({ id: 'resend-stub-1' }) } };
      }
    };
  }
  return origRequire.apply(this, arguments);
};

const { handler } = require('./provider-application');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeEvent() {
  return {
    httpMethod: 'POST',
    headers: {
      authorization: `Bearer ${FAKE_TOKEN}`,
      'x-forwarded-for': '203.0.113.7'
    },
    body: JSON.stringify({
      business_name: 'Race Condition Auto Shop',
      contact_name:  'Jane Tester',
      phone:         '5551234567',
      email:         FAKE_USER_EMAIL,
      services_offered: ['oil_change', 'brakes'],
      agreement_signed_at:   new Date().toISOString(),
      legal_signatory_name:  'Jane Tester',
      agreement_signature:   'Jane Tester'
    })
  };
}

function parseBody(res) {
  try { return JSON.parse(res.body); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function run() {
  // Fire two near-simultaneous submissions for the same user. Promise.all
  // kicks both off synchronously; their awaits interleave through the
  // microtask queue exactly as concurrent function invocations would in
  // production. Whichever request reaches the INSERT first wins; the other
  // hits the simulated 23505 from Postgres.
  const [resA, resB] = await Promise.all([
    handler(makeEvent()),
    handler(makeEvent())
  ]);

  const responses = [resA, resB];
  const successes = responses.filter(r => r.statusCode === 200);
  const conflicts = responses.filter(r => r.statusCode === 429);
  const others    = responses.filter(r => r.statusCode !== 200 && r.statusCode !== 429);

  assert.strictEqual(others.length, 0,
    `Unexpected non-200/429 response(s): ${JSON.stringify(others)}`);
  assert.strictEqual(successes.length, 1,
    `Expected exactly one HTTP 200 from concurrent submits, got ${successes.length} (statuses: ${responses.map(r => r.statusCode).join(', ')})`);
  assert.strictEqual(conflicts.length, 1,
    `Expected exactly one HTTP 429 from concurrent submits, got ${conflicts.length} (statuses: ${responses.map(r => r.statusCode).join(', ')})`);

  // The DB-level unique index guarantees only one row survives.
  assert.strictEqual(state.insertedRows.length, 1,
    `Expected exactly one provider_applications row to be persisted, got ${state.insertedRows.length}`);
  assert.strictEqual(state.insertAttempts, 2,
    `Expected both requests to have attempted an INSERT (so both passed the fast-path SELECT), got ${state.insertAttempts}`);
  assert.strictEqual(state.insertedRows[0].user_id, FAKE_USER_ID,
    'The persisted row must be owned by the JWT-derived user_id');

  // Winner body shape: { application_id, business_name }.
  const okBody = parseBody(successes[0]);
  assert.ok(okBody, 'Winner response body must be JSON');
  assert.strictEqual(okBody.application_id, WINNER_APPLICATION_ID,
    'Winner body must include the persisted application_id');
  assert.strictEqual(okBody.business_name, 'Race Condition Auto Shop',
    'Winner body must echo the business_name');

  // Loser body shape MUST match the fast-path 429 shape:
  //   { error: '...last 24 hours...', existing_application_id: '<winner id>' }
  // This is the contract the front end relies on to surface "you already
  // applied" instead of a generic failure.
  const conflictBody = parseBody(conflicts[0]);
  assert.ok(conflictBody, 'Loser response body must be JSON');
  assert.ok(typeof conflictBody.error === 'string' && /last 24 hours/i.test(conflictBody.error),
    `Loser 429 body must include the same friendly error message as the fast-path 429; got: ${JSON.stringify(conflictBody)}`);
  assert.strictEqual(conflictBody.existing_application_id, WINNER_APPLICATION_ID,
    `Loser 429 body must include existing_application_id pointing at the winning row; got: ${JSON.stringify(conflictBody)}`);

  console.log('  ok  concurrent submits → 1× 200, 1× 429 with existing_application_id, exactly 1 row persisted');
  console.log('\n1 passed, 0 failed');
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});

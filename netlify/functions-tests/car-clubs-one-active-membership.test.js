// ============================================================================
// Functional test for the "one active Car Club per member" guard (2026-09-10).
//
// Jordan: "make sure that each member may only join one car club." Covers
// netlify/functions/car-clubs.js's joinClub() (and its two entry points,
// POST /api/car-club/join → joinFromBody, and leaveClub for the "leave then
// join elsewhere" scenario), which now:
//   1) pre-checks for another ACTIVE membership before allowing a join, and
//   2) falls back to the same friendly 409 if the DB-level unique constraint
//      (supabase/migrations/20260910_club_memberships_one_active_per_member.sql,
//      a partial unique index on member_id WHERE is_active=true) rejects the
//      write with Postgres 23505 — the actual race-proof guarantee, since the
//      pre-check alone can't close the race between two concurrent joins to
//      different clubs.
//
// "One active club AT A TIME" (not "one club ever") is the intended rule —
// leaving a club and joining a different one must keep working, and so must
// re-joining a club the member previously left (reactivates the old row
// rather than erroring or double-inserting).
//
// This stub keeps a small shared in-memory "DB" (club_memberships / car_clubs
// rows) that mutates across sequential handler() calls within one test case,
// unlike a stateless per-call fixture — needed because these scenarios are
// inherently sequences of join/leave calls against the same member.
//
// Run with:  node netlify/functions-tests/car-clubs-one-active-membership.test.js
// Exits non-zero on the first assertion failure.
// ============================================================================

'use strict';

const assert = require('assert');
const path = require('node:path');

process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';

const USER_ID = 'member-1';
const ONE_CLUB_MSG = 'You can only be an active member of one Car Club at a time. Leave your current club before joining a new one.';

let DB;
function resetDb() {
  DB = {
    clubs: {
      'club-a': { id: 'club-a', is_active: true, member_count: 5 },
      'club-b': { id: 'club-b', is_active: true, member_count: 2 },
      'club-inactive': { id: 'club-inactive', is_active: false, member_count: 0 },
    },
    memberships: [], // {id, club_id, member_id, is_active}
    nextMembershipId: 1,
    // when set to a club_id, the next insert attempting to create a
    // club_memberships row for that club_id simulates a Postgres 23505
    // unique-violation instead of succeeding — exercises the race-guard
    // fallback branch that the app-level pre-check alone can't close.
    forceInsertConflictForClub: null,
  };
}

function findMembership(memberId, clubId) {
  return DB.memberships.find(m => m.member_id === memberId && m.club_id === clubId);
}

function makeSupabaseStub() {
  function builder(table) {
    const filters = {};
    const b = {
      select() { return b; },
      eq(col, val) { filters[col] = val; return b; },
      neq(col, val) { filters['__neq_' + col] = val; return b; },
      in() { return b; },
      ilike() { return b; },
      limit() { return b; },
      order() { return b; },
      insert(row) {
        return {
          then(resolve) {
            if (table === 'club_memberships') {
              if (DB.forceInsertConflictForClub && row.club_id === DB.forceInsertConflictForClub) {
                return resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } });
              }
              const rec = { id: 'm' + (DB.nextMembershipId++), club_id: row.club_id, member_id: row.member_id, is_active: true };
              DB.memberships.push(rec);
              return resolve({ data: rec, error: null });
            }
            return resolve({ data: null, error: null });
          },
        };
      },
      update(patch) {
        return {
          eq(col, val) {
            return {
              then(resolve) {
                if (table === 'club_memberships') {
                  const m = DB.memberships.find(x => x.id === val);
                  if (m) Object.assign(m, patch);
                  return resolve({ data: null, error: null });
                }
                if (table === 'car_clubs') {
                  const c = DB.clubs[val];
                  if (c) Object.assign(c, patch);
                  return resolve({ data: null, error: null });
                }
                return resolve({ data: null, error: null });
              },
            };
          },
        };
      },
      single() {
        if (table === 'platform_settings') {
          return Promise.resolve({ data: { setting_value: { enabled: true } }, error: null });
        }
        if (table === 'car_clubs') {
          const c = DB.clubs[filters.id];
          return Promise.resolve(c ? { data: c, error: null } : { data: null, error: { message: 'not found' } });
        }
        if (table === 'club_memberships') {
          const m = findMembership(filters.member_id, filters.club_id);
          return Promise.resolve(m ? { data: m, error: null } : { data: null, error: { message: 'not found' } });
        }
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle() {
        if (table === 'club_memberships') {
          if (Object.prototype.hasOwnProperty.call(filters, '__neq_club_id')) {
            // joinClub's "does this member have another active membership"
            // guard: member_id + is_active=true + club_id != the one being joined.
            const other = DB.memberships.find(m =>
              m.member_id === filters.member_id &&
              m.is_active === true &&
              m.club_id !== filters['__neq_club_id']
            );
            return Promise.resolve({ data: other || null, error: null });
          }
          // leaveClub's direct lookup: club_id + member_id, any is_active state.
          const m = findMembership(filters.member_id, filters.club_id);
          return Promise.resolve({ data: m || null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then(resolve) {
        return resolve({ data: [], error: null });
      },
    };
    return b;
  }
  return {
    from: (table) => builder(table),
    auth: {
      getUser: async (token) => {
        if (!token) return { data: { user: null }, error: { message: 'no token' } };
        return { data: { user: { id: USER_ID, email: 'member@example.com' } }, error: null };
      },
    },
  };
}

const supabasePaths = new Set([
  require.resolve('@supabase/supabase-js'),
  require.resolve('@supabase/supabase-js', { paths: [path.join(__dirname, '..', 'functions')] }),
]);
for (const sp of supabasePaths) {
  require.cache[sp] = {
    id: sp, filename: sp, loaded: true,
    exports: { createClient: () => makeSupabaseStub() },
  };
}

const handler = require('../functions/car-clubs').handler;

function makeEvent({ method = 'POST', route = 'join', body = {}, auth = true } = {}) {
  return {
    path: `/api/car-club/${route}`,
    httpMethod: method,
    headers: { host: 'stub.local', ...(auth ? { authorization: 'Bearer faketoken' } : {}) },
    queryStringParameters: {},
    body: JSON.stringify(body),
  };
}

function parseBody(res) {
  try { return JSON.parse(res.body); } catch { return null; }
}

async function run() {
  let passed = 0, failed = 0;
  const failures = [];
  function ok(label) { passed++; console.log('  ok  ' + label); }
  function fail(label, err) { failed++; failures.push(`${label}: ${err.message}`); console.log('  FAIL ' + label + ' — ' + err.message); }

  // 1) No credentials → 401
  try {
    resetDb();
    const res = await handler(makeEvent({ route: 'join', body: { club_id: 'club-a' }, auth: false }));
    assert.strictEqual(res.statusCode, 401, `expected 401, got ${res.statusCode}`);
    ok('rejects join without credentials (401)');
  } catch (e) { fail('rejects join without credentials', e); }

  // 2) Joining with no prior membership succeeds
  try {
    resetDb();
    const res = await handler(makeEvent({ route: 'join', body: { club_id: 'club-a' } }));
    assert.strictEqual(res.statusCode, 200, `expected 200, got ${res.statusCode} body=${res.body}`);
    assert.strictEqual(parseBody(res).success, true);
    const m = findMembership(USER_ID, 'club-a');
    assert.ok(m && m.is_active === true, 'expected an active club-a membership row to exist');
    ok('joining a club with no prior membership succeeds');
  } catch (e) { fail('join with no prior membership', e); }

  // 3) Joining a second club while already active elsewhere → 409, ONE_CLUB_MSG
  try {
    // continues from test 2's DB state: already active in club-a
    const res = await handler(makeEvent({ route: 'join', body: { club_id: 'club-b' } }));
    assert.strictEqual(res.statusCode, 409, `expected 409, got ${res.statusCode} body=${res.body}`);
    assert.strictEqual(parseBody(res).error, ONE_CLUB_MSG);
    const m = findMembership(USER_ID, 'club-b');
    assert.ok(!m, 'expected no club-b membership row to have been created');
    ok('joining a second club while active elsewhere is rejected (409) with the one-club message');
  } catch (e) { fail('join second club while active elsewhere', e); }

  // 4) Leaving the current club, then joining a different one, succeeds
  try {
    // still continuing: active in club-a, never joined club-b
    const leaveRes = await handler(makeEvent({ route: 'leave', body: { club_id: 'club-a' } }));
    assert.strictEqual(leaveRes.statusCode, 200, `leave: expected 200, got ${leaveRes.statusCode} body=${leaveRes.body}`);
    assert.strictEqual(findMembership(USER_ID, 'club-a').is_active, false, 'expected club-a membership to be deactivated, not deleted');

    const joinRes = await handler(makeEvent({ route: 'join', body: { club_id: 'club-b' } }));
    assert.strictEqual(joinRes.statusCode, 200, `join club-b: expected 200, got ${joinRes.statusCode} body=${joinRes.body}`);
    assert.strictEqual(findMembership(USER_ID, 'club-b').is_active, true);
    ok('leaving the current club then joining a different one succeeds (one club AT A TIME, not ever)');
  } catch (e) { fail('leave then join a different club', e); }

  // 5) Re-joining the SAME club after leaving it still works (reactivate path,
  //    not blocked as a false-positive "other active membership")
  try {
    resetDb();
    const join1 = await handler(makeEvent({ route: 'join', body: { club_id: 'club-a' } }));
    assert.strictEqual(join1.statusCode, 200);
    const firstRowId = findMembership(USER_ID, 'club-a').id;

    const leave = await handler(makeEvent({ route: 'leave', body: { club_id: 'club-a' } }));
    assert.strictEqual(leave.statusCode, 200);
    assert.strictEqual(findMembership(USER_ID, 'club-a').is_active, false);

    const rejoin = await handler(makeEvent({ route: 'join', body: { club_id: 'club-a' } }));
    assert.strictEqual(rejoin.statusCode, 200, `rejoin: expected 200, got ${rejoin.statusCode} body=${rejoin.body}`);
    const rowsForClubA = DB.memberships.filter(m => m.member_id === USER_ID && m.club_id === 'club-a');
    assert.strictEqual(rowsForClubA.length, 1, 'expected the same membership row to be reactivated, not a duplicate inserted');
    assert.strictEqual(rowsForClubA[0].id, firstRowId);
    assert.strictEqual(rowsForClubA[0].is_active, true);
    ok('re-joining the same club after leaving reactivates the old row (no false-positive block, no duplicate)');
  } catch (e) { fail('rejoin same club after leaving', e); }

  // 6) Simulated race: DB unique-violation (23505) on the insert path still
  //    surfaces as the friendly 409, not a raw 500 — this is the actual
  //    guarantee the migration's partial unique index provides beyond the
  //    app-level pre-check.
  try {
    resetDb();
    DB.forceInsertConflictForClub = 'club-a';
    const res = await handler(makeEvent({ route: 'join', body: { club_id: 'club-a' } }));
    assert.strictEqual(res.statusCode, 409, `expected 409, got ${res.statusCode} body=${res.body}`);
    assert.strictEqual(parseBody(res).error, ONE_CLUB_MSG);
    ok('a simulated DB-level unique-violation (23505) on join is caught as the same friendly 409, not a 500');
  } catch (e) { fail('simulated race — 23505 on insert', e); }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
}

run().catch(err => { console.error('Test runner crashed:', err); process.exit(1); });

#!/usr/bin/env node
/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────────────
// Task #153 — Admin Matchmaker apply notification fan-out test.
//
// Verifies that when an admin applies a Matchmaker `rank` recommendation via
// netlify/functions/agent-fleet-admin.js#applyMatchmakerRank we now ALSO:
//
//   1) insert a `notifications` row for the winning provider (bid_accepted)
//   2) insert a `notifications` row for every losing provider (bid_not_selected)
//   3) insert a `notifications` row for the member (auction_awarded)
//   4) attempt one Resend email per recipient, recording success/failure into
//      the audit-trail decision payload under `notifications`
//
// Strategy: stub the `resend` module so no real emails are sent, run the
// function against an in-memory Supabase mock, and assert the resulting
// notification rows + audit decision payload.
//
// Run from project root:
//   node scripts/matchmaker-award-notify-test.js
//
// Exit codes: 0 all passed, 1 any check failed.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');

const ADMIN_PATH = require.resolve('../netlify/functions/agent-fleet-admin');
// Resend is installed under netlify/functions/node_modules, not the repo
// root, so resolve it from the function directory the way Netlify would.
const RESEND_PATH = require.resolve('resend', {
  paths: [path.dirname(ADMIN_PATH)]
});

// ----------------------------- Resend stub ---------------------------------
let resendCalls = [];
require.cache[RESEND_PATH] = {
  id: RESEND_PATH,
  filename: RESEND_PATH,
  loaded: true,
  exports: {
    Resend: class {
      constructor(_apiKey) { /* no-op */ }
      get emails() {
        return {
          send: async (payload) => {
            resendCalls.push(payload);
            return { id: 'test-' + resendCalls.length };
          }
        };
      }
    }
  }
};

// Force the email helper to actually call Resend.
process.env.RESEND_API_KEY = 'test-key';

// ----------------------------- Supabase mock --------------------------------
function makeSupabaseMock(initial) {
  const state = {
    agent_actions: initial.agent_actions ? initial.agent_actions.slice() : [],
    plan_bids:     initial.plan_bids     ? initial.plan_bids.slice()     : [],
    care_plans:    initial.care_plans    ? initial.care_plans.slice()    : [],
    profiles:      initial.profiles      ? initial.profiles.slice()      : [],
    notifications: []
  };

  function from(table) {
    let rows = state[table] ? state[table].slice() : [];
    let mode = 'select';
    let updatePatch = null;
    let insertPayload = null;
    const filters = [];

    function applyFilters(arr) {
      let out = arr;
      for (const f of filters) out = out.filter(f);
      return out;
    }

    const builder = {
      select() { return builder; },
      eq(col, val) { filters.push(r => r[col] === val); return builder; },
      neq(col, val) { filters.push(r => r[col] !== val); return builder; },
      in(col, vals) { const set = new Set(vals); filters.push(r => set.has(r[col])); return builder; },
      update(patch) { mode = 'update'; updatePatch = patch; return builder; },
      insert(payload) { mode = 'insert'; insertPayload = payload; return builder; },

      maybeSingle() {
        if (mode === 'select') {
          return Promise.resolve({ data: applyFilters(rows)[0] || null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      single() {
        if (mode === 'insert') {
          const inserted = Array.isArray(insertPayload) ? insertPayload[0] : insertPayload;
          state[table].push(inserted);
          return Promise.resolve({ data: inserted, error: null });
        }
        return Promise.resolve({ data: applyFilters(rows)[0] || null, error: null });
      },

      then(resolve) {
        if (mode === 'select') {
          resolve({ data: applyFilters(rows), error: null });
          return;
        }
        if (mode === 'update') {
          const matched = applyFilters(rows);
          for (const r of matched) Object.assign(r, updatePatch);
          // Mirror PostgREST: .update().select() returns the matched rows.
          resolve({ data: matched.map(r => ({ ...r })), error: null });
          return;
        }
        if (mode === 'insert') {
          const arr = Array.isArray(insertPayload) ? insertPayload : [insertPayload];
          for (const row of arr) state[table].push(row);
          resolve({ data: arr, error: null });
          return;
        }
        resolve({ data: null, error: null });
      }
    };
    return builder;
  }

  return { from, state };
}

// ----------------------------- Test cases -----------------------------------
let failures = 0;
function assertEq(actual, expected, msg) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`PASS: ${msg}`);
  } else {
    failures++;
    console.error(`FAIL: ${msg}\n        expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
  }
}
function assertTrue(cond, msg) {
  if (cond) console.log(`PASS: ${msg}`);
  else { failures++; console.error(`FAIL: ${msg}`); }
}

const ACTION_ID  = 'action-1';
const PLAN_ID    = 'plan-1';
const WIN_BID    = 'bid-win';
const LOSE_BID_A = 'bid-lose-a';
const LOSE_BID_B = 'bid-lose-b';
const MEMBER_ID  = 'mem-1';
const WIN_PID    = 'prov-win';
const LOSE_PID_A = 'prov-lose-a';
const LOSE_PID_B = 'prov-lose-b';

function freshSupabase() {
  return makeSupabaseMock({
    agent_actions: [{
      id: ACTION_ID,
      agent_slug: 'matchmaker',
      action_type: 'rank',
      review_status: null,
      decision: {
        recommended_winner_bid_id: WIN_BID,
        payload: { care_plan_id: PLAN_ID }
      }
    }],
    plan_bids: [
      { id: WIN_BID,    care_plan_id: PLAN_ID, provider_id: WIN_PID,    status: 'pending', amount: 250 },
      { id: LOSE_BID_A, care_plan_id: PLAN_ID, provider_id: LOSE_PID_A, status: 'pending', amount: 300 },
      { id: LOSE_BID_B, care_plan_id: PLAN_ID, provider_id: LOSE_PID_B, status: 'pending', amount: 280 }
    ],
    care_plans: [{
      id: PLAN_ID, member_id: MEMBER_ID, status: 'open', title: 'Brake Job & Inspection'
    }],
    profiles: [
      { id: MEMBER_ID,  email: 'member@example.com',  full_name: 'Mia Member',     business_name: null         },
      { id: WIN_PID,    email: 'winner@example.com',  full_name: 'Wendy Winner',   business_name: 'Win Garage' },
      { id: LOSE_PID_A, email: 'losera@example.com',  full_name: 'Larry Loser',    business_name: 'A Auto'     },
      { id: LOSE_PID_B, email: null,                  full_name: 'Bart Bidder',    business_name: 'B Brakes'   }
    ]
  });
}

(async function main() {
  delete require.cache[ADMIN_PATH];
  const admin = require(ADMIN_PATH);
  const { applyMatchmakerRank } = admin.__test;

  // ── Case 1: happy-path award fans out 4 notifications + 3 emails ─────────
  resendCalls = [];
  const supabase = freshSupabase();
  const action = supabase.state.agent_actions[0];
  const result = await applyMatchmakerRank(supabase, ACTION_ID, action);

  assertTrue(result.ok === true, 'applyMatchmakerRank returns ok:true');
  assertEq(result.accepted_bid_id, WIN_BID,    'winner bid id reported');
  assertEq(result.rejected_count,  2,          'two losing bids rejected');

  // plan_bids state: winner accepted, both losers rejected.
  const bidStatuses = supabase.state.plan_bids.reduce((acc, b) => {
    acc[b.id] = b.status; return acc;
  }, {});
  assertEq(bidStatuses[WIN_BID],    'accepted', 'winning bid set to accepted');
  assertEq(bidStatuses[LOSE_BID_A], 'rejected', 'losing bid A set to rejected');
  assertEq(bidStatuses[LOSE_BID_B], 'rejected', 'losing bid B set to rejected');

  // Care plan flipped to awarded.
  assertEq(supabase.state.care_plans[0].status, 'awarded', 'care_plan status flipped to awarded');

  // Notifications: 1 winner + 2 losers + 1 member = 4 rows.
  const notes = supabase.state.notifications;
  assertEq(notes.length, 4, '4 notification rows inserted');

  const byUser = notes.reduce((acc, n) => { acc[n.user_id] = n; return acc; }, {});
  assertTrue(byUser[WIN_PID]    && byUser[WIN_PID].type    === 'bid_accepted',     'winner gets bid_accepted notification');
  assertTrue(byUser[LOSE_PID_A] && byUser[LOSE_PID_A].type === 'bid_not_selected', 'loser A gets bid_not_selected notification');
  assertTrue(byUser[LOSE_PID_B] && byUser[LOSE_PID_B].type === 'bid_not_selected', 'loser B gets bid_not_selected notification (even with no email)');
  assertTrue(byUser[MEMBER_ID]  && byUser[MEMBER_ID].type  === 'auction_awarded',  'member gets auction_awarded notification');
  assertTrue(byUser[WIN_PID].message.includes('$250.00'),                          'winner notification includes amount');
  assertTrue(byUser[MEMBER_ID].message.includes('Win Garage'),                     'member notification names the winner');
  assertTrue(byUser[MEMBER_ID].message.includes('Brake Job & Inspection'),         'member notification names the auction');

  // Emails: winner + member + 1 loser (loser B has no email, so 3 sends total).
  assertEq(resendCalls.length, 3, '3 emails sent (winner + member + loser w/ email)');
  const emailRecipients = resendCalls.map(c => c.to).sort();
  assertEq(emailRecipients, ['losera@example.com','member@example.com','winner@example.com'].sort(), 'emails routed to the right recipients');

  // Audit row appended with notifications summary.
  const auditRow = supabase.state.agent_actions.find(r => r.action_type === 'apply');
  assertTrue(!!auditRow, 'audit row inserted with action_type=apply');
  assertTrue(auditRow.decision && auditRow.decision.notifications, 'audit decision includes notifications summary');
  const sum = auditRow.decision.notifications;
  assertEq(sum.winner_notified,      true, 'summary: winner notified');
  assertEq(sum.member_notified,      true, 'summary: member notified');
  assertEq(sum.loser_notified_count, 2,    'summary: loser_notified_count=2');
  assertEq(sum.winner_emailed,       true, 'summary: winner emailed');
  assertEq(sum.member_emailed,       true, 'summary: member emailed');
  assertEq(sum.loser_emailed_count,  1,    'summary: loser_emailed_count=1');

  // ── Case 2: Resend disabled → notifications still inserted ───────────────
  resendCalls = [];
  delete process.env.RESEND_API_KEY;
  const sb2 = freshSupabase();
  const action2 = sb2.state.agent_actions[0];
  const r2 = await applyMatchmakerRank(sb2, ACTION_ID, action2);
  assertTrue(r2.ok === true, '[no-email] applyMatchmakerRank still ok:true');
  assertEq(sb2.state.notifications.length, 4, '[no-email] 4 notifications still inserted');
  assertEq(resendCalls.length, 0, '[no-email] zero Resend calls');
  const auditRow2 = sb2.state.agent_actions.find(r => r.action_type === 'apply');
  assertEq(auditRow2.decision.notifications.winner_emailed, false, '[no-email] summary records winner not emailed');

  // restore for any downstream tests
  process.env.RESEND_API_KEY = 'test-key';

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll Task #153 award notification checks passed.');
})().catch(err => {
  console.error('Test threw:', err);
  process.exit(1);
});

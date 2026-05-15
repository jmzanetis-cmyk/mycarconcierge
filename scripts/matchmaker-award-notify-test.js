#!/usr/bin/env node
 
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

const path = require('node:path');

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

// ----------------------------- FCM stub ------------------------------------
// Stub global fetch so the FCM v1 helper never reaches the network. Each test
// case can swap `fcmFetchHandler` to control responses. Default returns a
// successful 200 OAuth-token response and a successful 200 send response.
let fcmCalls = [];
let fcmFetchHandler = async (url) => {
  if (String(url).includes('oauth2.googleapis.com')) {
    return {
      status: 200, ok: true,
      json: async () => ({ access_token: 'fake-access-token', expires_in: 3600 })
    };
  }
  if (String(url).includes('fcm.googleapis.com')) {
    return {
      status: 200, ok: true,
      json: async () => ({ name: 'projects/test/messages/fake-id' })
    };
  }
  // Pass through anything else (none expected in tests).
  return { status: 404, ok: false, json: async () => ({}) };
};
const _origFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  fcmCalls.push({ url: String(url), method: opts && opts.method, body: opts && opts.body });
  return fcmFetchHandler(url, opts);
};

// Synthetic FCM service-account JSON (private key is a real RSA PEM so the
// JWT signing step in getFCMAccessToken doesn't throw). Generated once at
// startup so every test case can rely on it.
const _crypto = require('node:crypto');
const { privateKey: _pk } = _crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding:  { type: 'spki',  format: 'pem' }
});
const FAKE_SA_JSON = JSON.stringify({
  type: 'service_account',
  project_id: 'mcc-test',
  private_key: _pk,
  client_email: 'test@mcc-test.iam.gserviceaccount.com'
});

// ----------------------------- Supabase mock --------------------------------
function makeSupabaseMock(initial) {
  const state = {
    agent_actions:                     initial.agent_actions                     ? initial.agent_actions.slice()                     : [],
    plan_bids:                         initial.plan_bids                         ? initial.plan_bids.slice()                         : [],
    care_plans:                        initial.care_plans                        ? initial.care_plans.slice()                        : [],
    profiles:                          initial.profiles                          ? initial.profiles.slice()                          : [],
    device_push_tokens:                initial.device_push_tokens                ? initial.device_push_tokens.slice()                : [],
    member_notification_preferences:   initial.member_notification_preferences   ? initial.member_notification_preferences.slice()   : [],
    provider_notification_preferences: initial.provider_notification_preferences ? initial.provider_notification_preferences.slice() : [],
    notifications:      []
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
  // FCM not configured → push fields should be false with reason 'not_configured'.
  resendCalls = [];
  fcmCalls = [];
  delete process.env.FCM_SERVICE_ACCOUNT_JSON;
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

  // FCM not configured this case → push fields false, reason 'not_configured'.
  assertEq(sum.winner_pushed,        false, '[no-fcm] summary: winner not pushed');
  assertEq(sum.member_pushed,        false, '[no-fcm] summary: member not pushed');
  assertEq(sum.loser_pushed_count,   0,     '[no-fcm] summary: loser_pushed_count=0');
  assertEq(sum.push_skipped_reason,  'not_configured', '[no-fcm] push_skipped_reason=not_configured');
  assertEq(fcmCalls.length,          0,     '[no-fcm] no fetch calls to FCM endpoints');

  // ── Case 2: Resend disabled → notifications still inserted ───────────────
  resendCalls = [];
  fcmCalls = [];
  delete process.env.RESEND_API_KEY;
  delete process.env.FCM_SERVICE_ACCOUNT_JSON;
  const sb2 = freshSupabase();
  const action2 = sb2.state.agent_actions[0];
  const r2 = await applyMatchmakerRank(sb2, ACTION_ID, action2);
  assertTrue(r2.ok === true, '[no-email] applyMatchmakerRank still ok:true');
  assertEq(sb2.state.notifications.length, 4, '[no-email] 4 notifications still inserted');
  assertEq(resendCalls.length, 0, '[no-email] zero Resend calls');
  const auditRow2 = sb2.state.agent_actions.find(r => r.action_type === 'apply');
  assertEq(auditRow2.decision.notifications.winner_emailed, false, '[no-email] summary records winner not emailed');
  assertEq(auditRow2.decision.notifications.winner_pushed,  false, '[no-email] summary records winner not pushed');

  // ── Case 3: FCM enabled with active device tokens → push fans out ────────
  // Members + providers each have 1+ device token; some have multiple devices.
  resendCalls = [];
  fcmCalls = [];
  process.env.RESEND_API_KEY = 'test-key';
  process.env.FCM_SERVICE_ACCOUNT_JSON = FAKE_SA_JSON;
  fcmFetchHandler = async (url) => {
    if (String(url).includes('oauth2.googleapis.com')) {
      return { status: 200, ok: true,
        json: async () => ({ access_token: 'fake-access-token', expires_in: 3600 }) };
    }
    return { status: 200, ok: true,
      json: async () => ({ name: 'projects/mcc-test/messages/fake-id' }) };
  };

  const sb3 = makeSupabaseMock({
    agent_actions: [{
      id: ACTION_ID, agent_slug: 'matchmaker', action_type: 'rank',
      review_status: null,
      decision: { recommended_winner_bid_id: WIN_BID, payload: { care_plan_id: PLAN_ID } }
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
    ],
    device_push_tokens: [
      { token: 'tok-mem-ios',   member_id: MEMBER_ID,  platform: 'ios',     active: true  },
      { token: 'tok-mem-and',   member_id: MEMBER_ID,  platform: 'android', active: true  },
      { token: 'tok-win-ios',   member_id: WIN_PID,    platform: 'ios',     active: true  },
      { token: 'tok-loseA-and', member_id: LOSE_PID_A, platform: 'android', active: true  },
      { token: 'tok-loseB-ios', member_id: LOSE_PID_B, platform: 'ios',     active: true  },
      { token: 'tok-stale',     member_id: WIN_PID,    platform: 'ios',     active: false } // filtered out
    ]
  });
  const r3 = await applyMatchmakerRank(sb3, ACTION_ID, sb3.state.agent_actions[0]);
  assertTrue(r3.ok === true, '[fcm] applyMatchmakerRank ok:true');

  const auditRow3 = sb3.state.agent_actions.find(r => r.action_type === 'apply');
  const sum3 = auditRow3.decision.notifications;
  assertEq(sum3.winner_pushed,       true, '[fcm] summary: winner pushed');
  assertEq(sum3.member_pushed,       true, '[fcm] summary: member pushed');
  assertEq(sum3.loser_pushed_count,  2,    '[fcm] summary: loser_pushed_count=2');
  assertEq(sum3.push_skipped_reason, null, '[fcm] no push_skipped_reason recorded');

  // FCM v1 send calls: 2 (member) + 1 (winner) + 1 (loseA) + 1 (loseB) = 5
  // Plus 1 OAuth token request (cached after first call).
  const sendCalls = fcmCalls.filter(c => c.url.includes('fcm.googleapis.com'));
  assertEq(sendCalls.length, 5, '[fcm] 5 FCM v1 send calls (2 member devices + 1 winner + 2 loser providers)');
  const oauthCalls = fcmCalls.filter(c => c.url.includes('oauth2.googleapis.com'));
  assertTrue(oauthCalls.length >= 1, '[fcm] at least 1 OAuth token request');

  // Stale 'tok-stale' (active=false) must NOT be sent.
  const targetedTokens = sendCalls.map(c => {
    try { return JSON.parse(c.body).message.token; } catch { return null; }
  });
  assertTrue(!targetedTokens.includes('tok-stale'), '[fcm] inactive tokens are filtered out');

  // Notification titles propagate into FCM payloads.
  const winnerSend = sendCalls.find(c => JSON.parse(c.body).message.token === 'tok-win-ios');
  assertTrue(winnerSend && JSON.parse(winnerSend.body).message.notification.title === 'Your bid was accepted',
    '[fcm] winner FCM message has correct title');
  const memberSend = sendCalls.find(c => JSON.parse(c.body).message.token === 'tok-mem-ios');
  assertTrue(memberSend && JSON.parse(memberSend.body).message.notification.title === 'Your auction has been awarded',
    '[fcm] member FCM message has correct title');
  const loserSend = sendCalls.find(c => JSON.parse(c.body).message.token === 'tok-loseA-and');
  assertTrue(loserSend && JSON.parse(loserSend.body).message.notification.title === 'Bid not selected',
    '[fcm] loser FCM message has correct title');

  // Bid acceptance should still have completed normally on top of push.
  assertEq(sb3.state.care_plans[0].status, 'awarded', '[fcm] care plan still flipped to awarded');
  assertEq(sb3.state.notifications.length, 4, '[fcm] in-app notifications still inserted');

  // Per-recipient data payloads (deeplink / role / care_plan_id / amount).
  const winnerData = JSON.parse(winnerSend.body).message.data;
  assertEq(winnerData.deeplink,     '/providers.html#bids', '[fcm] winner data.deeplink');
  assertEq(winnerData.role,         'winner',               '[fcm] winner data.role');
  assertEq(winnerData.care_plan_id, PLAN_ID,                '[fcm] winner data.care_plan_id');
  assertEq(winnerData.amount,       '250',                  '[fcm] winner data.amount');
  assertEq(winnerData.type,         'matchmaker_award',     '[fcm] winner data.type');
  const memberData = JSON.parse(memberSend.body).message.data;
  assertEq(memberData.deeplink,     '/members.html#packages','[fcm] member data.deeplink');
  assertEq(memberData.role,         'member',               '[fcm] member data.role');
  const loserData = JSON.parse(loserSend.body).message.data;
  assertEq(loserData.role,          'loser',                '[fcm] loser data.role');

  // ── Case 3b: stale-token cleanup is precise ──────────────────────────────
  // Only UNREGISTERED (per-detail errorCode) deactivates the token. A
  // top-level INVALID_ARGUMENT status (which can mean payload/auth issues)
  // must NOT mass-deactivate valid tokens.
  resendCalls = [];
  fcmCalls = [];
  fcmFetchHandler = async (url, opts) => {
    if (String(url).includes('oauth2.googleapis.com')) {
      return { status: 200, ok: true,
        json: async () => ({ access_token: 'fake-access-token', expires_in: 3600 }) };
    }
    const body = JSON.parse(opts.body);
    const token = body.message.token;
    if (token === 'tok-unregistered') {
      return { status: 404, ok: false,
        json: async () => ({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }) };
    }
    if (token === 'tok-bad-payload') {
      // INVALID_ARGUMENT at top-level — typically a payload/config bug, NOT a
      // dead token. Must NOT be deactivated.
      return { status: 400, ok: false,
        json: async () => ({ error: { status: 'INVALID_ARGUMENT' } }) };
    }
    return { status: 200, ok: true, json: async () => ({ name: 'ok' }) };
  };
  const sb3b = makeSupabaseMock({
    agent_actions: [{
      id: ACTION_ID, agent_slug: 'matchmaker', action_type: 'rank',
      review_status: null,
      decision: { recommended_winner_bid_id: WIN_BID, payload: { care_plan_id: PLAN_ID } }
    }],
    plan_bids: [
      { id: WIN_BID,    care_plan_id: PLAN_ID, provider_id: WIN_PID,    status: 'pending', amount: 250 },
      { id: LOSE_BID_A, care_plan_id: PLAN_ID, provider_id: LOSE_PID_A, status: 'pending', amount: 300 }
    ],
    care_plans: [{ id: PLAN_ID, member_id: MEMBER_ID, status: 'open', title: 'Oil Change' }],
    profiles: [
      { id: MEMBER_ID, email: 'm@x.com', full_name: 'Mia',  business_name: null },
      { id: WIN_PID,   email: 'w@x.com', full_name: 'Wendy',business_name: 'WG' },
      { id: LOSE_PID_A,email: 'a@x.com', full_name: 'Larry',business_name: 'A' }
    ],
    device_push_tokens: [
      { token: 'tok-unregistered', member_id: WIN_PID,    platform: 'ios',     active: true },
      { token: 'tok-bad-payload',  member_id: LOSE_PID_A, platform: 'android', active: true },
      { token: 'tok-good',         member_id: MEMBER_ID,  platform: 'ios',     active: true }
    ]
  });
  await applyMatchmakerRank(sb3b, ACTION_ID, sb3b.state.agent_actions[0]);
  const tokens3b = sb3b.state.device_push_tokens.reduce((acc, t) => { acc[t.token] = t; return acc; }, {});
  assertEq(tokens3b['tok-unregistered'].active, false, '[stale] UNREGISTERED token deactivated');
  assertEq(tokens3b['tok-bad-payload'].active,  true,  '[stale] INVALID_ARGUMENT (top-level) NOT deactivated');
  assertEq(tokens3b['tok-good'].active,         true,  '[stale] healthy token left active');

  // ── Case 3c: all sends fail → push_skipped_reason carries failure code ──
  resendCalls = [];
  fcmCalls = [];
  fcmFetchHandler = async (url) => {
    if (String(url).includes('oauth2.googleapis.com')) {
      return { status: 200, ok: true,
        json: async () => ({ access_token: 'fake-access-token', expires_in: 3600 }) };
    }
    return { status: 503, ok: false,
      json: async () => ({ error: { status: 'UNAVAILABLE' } }) };
  };
  const sb3c = makeSupabaseMock({
    agent_actions: [{
      id: ACTION_ID, agent_slug: 'matchmaker', action_type: 'rank',
      review_status: null,
      decision: { recommended_winner_bid_id: WIN_BID, payload: { care_plan_id: PLAN_ID } }
    }],
    plan_bids: [
      { id: WIN_BID, care_plan_id: PLAN_ID, provider_id: WIN_PID, status: 'pending', amount: 250 }
    ],
    care_plans: [{ id: PLAN_ID, member_id: MEMBER_ID, status: 'open', title: 'Oil Change' }],
    profiles: [
      { id: MEMBER_ID, email: 'm@x.com', full_name: 'Mia',  business_name: null },
      { id: WIN_PID,   email: 'w@x.com', full_name: 'Wendy',business_name: 'WG' }
    ],
    device_push_tokens: [
      // Both recipients have tokens so neither push call short-circuits with
      // 'no_tokens' before the upstream FCM failure surfaces. This keeps the
      // assertion focused on the all-send-fail summary path.
      { token: 'tok-x', member_id: WIN_PID,    platform: 'ios', active: true },
      { token: 'tok-y', member_id: MEMBER_ID,  platform: 'ios', active: true }
    ]
  });
  await applyMatchmakerRank(sb3c, ACTION_ID, sb3c.state.agent_actions[0]);
  const sum3c = sb3c.state.agent_actions.find(r => r.action_type === 'apply').decision.notifications;
  assertEq(sum3c.winner_pushed, false, '[all-fail] winner_pushed=false');
  assertEq(sum3c.member_pushed, false, '[all-fail] member_pushed=false');
  assertTrue(/^send_failed:/.test(sum3c.push_skipped_reason || ''),
    `[all-fail] push_skipped_reason starts with send_failed: (got ${sum3c.push_skipped_reason})`);
  assertTrue(sum3c.push_skipped_reason.includes('UNAVAILABLE'),
    '[all-fail] push_skipped_reason includes upstream error code');

  // ── Case 4: FCM enabled but no device tokens for any user → graceful skip ─
  resendCalls = [];
  fcmCalls = [];
  const sb4 = makeSupabaseMock({
    agent_actions: [{
      id: ACTION_ID, agent_slug: 'matchmaker', action_type: 'rank',
      review_status: null,
      decision: { recommended_winner_bid_id: WIN_BID, payload: { care_plan_id: PLAN_ID } }
    }],
    plan_bids: [
      { id: WIN_BID,    care_plan_id: PLAN_ID, provider_id: WIN_PID,    status: 'pending', amount: 250 },
      { id: LOSE_BID_A, care_plan_id: PLAN_ID, provider_id: LOSE_PID_A, status: 'pending', amount: 300 }
    ],
    care_plans: [{ id: PLAN_ID, member_id: MEMBER_ID, status: 'open', title: 'Tire Rotation' }],
    profiles: [
      { id: MEMBER_ID, email: 'm@example.com',  full_name: 'Mia',  business_name: null   },
      { id: WIN_PID,   email: 'w@example.com',  full_name: 'Wendy', business_name: 'WG'  },
      { id: LOSE_PID_A,email: null,             full_name: 'Larry', business_name: 'A'   }
    ]
    // device_push_tokens omitted → [] by default
  });
  const r4 = await applyMatchmakerRank(sb4, ACTION_ID, sb4.state.agent_actions[0]);
  assertTrue(r4.ok === true, '[fcm-no-tokens] applyMatchmakerRank ok:true');
  const sum4 = sb4.state.agent_actions.find(r => r.action_type === 'apply').decision.notifications;
  assertEq(sum4.winner_pushed,        false,        '[fcm-no-tokens] winner_pushed=false');
  assertEq(sum4.member_pushed,        false,        '[fcm-no-tokens] member_pushed=false');
  assertEq(sum4.loser_pushed_count,   0,            '[fcm-no-tokens] loser_pushed_count=0');
  assertEq(sum4.push_skipped_reason,  'no_tokens',  '[fcm-no-tokens] push_skipped_reason=no_tokens');
  assertEq(sum4.errors.length,        0,            '[fcm-no-tokens] no errors recorded');

  // ── Case 5: opt-out preferences are honoured (Task #197 review fix) ──────
  // The new admin push helper must NEVER push to a user who has explicitly
  // disabled the matching push category in their preferences row. Member uses
  // member_notification_preferences.push_bid_accepted; provider uses
  // provider_notification_preferences.push_bid_accepted (winner) or
  // push_bid_opportunities (loser). Users without a preferences row default
  // to allowed (matches www/server.js#checkUserPushPreference).
  resendCalls = [];
  fcmCalls = [];
  process.env.RESEND_API_KEY = 'test-key';
  process.env.FCM_SERVICE_ACCOUNT_JSON = FAKE_SA_JSON;
  fcmFetchHandler = async (url) => {
    if (String(url).includes('oauth2.googleapis.com')) {
      return { status: 200, ok: true,
        json: async () => ({ access_token: 'fake-access-token', expires_in: 3600 }) };
    }
    return { status: 200, ok: true, json: async () => ({ name: 'ok' }) };
  };

  const sb5 = makeSupabaseMock({
    agent_actions: [{
      id: ACTION_ID, agent_slug: 'matchmaker', action_type: 'rank',
      review_status: null,
      decision: { recommended_winner_bid_id: WIN_BID, payload: { care_plan_id: PLAN_ID } }
    }],
    plan_bids: [
      { id: WIN_BID,    care_plan_id: PLAN_ID, provider_id: WIN_PID,    status: 'pending', amount: 250 },
      { id: LOSE_BID_A, care_plan_id: PLAN_ID, provider_id: LOSE_PID_A, status: 'pending', amount: 300 },
      { id: LOSE_BID_B, care_plan_id: PLAN_ID, provider_id: LOSE_PID_B, status: 'pending', amount: 280 }
    ],
    care_plans: [{ id: PLAN_ID, member_id: MEMBER_ID, status: 'open', title: 'Brake Job' }],
    profiles: [
      { id: MEMBER_ID,  email: 'm@x.com', full_name: 'Mia',   business_name: null  },
      { id: WIN_PID,    email: 'w@x.com', full_name: 'Wendy', business_name: 'WG'  },
      { id: LOSE_PID_A, email: 'a@x.com', full_name: 'Larry', business_name: 'A'   },
      { id: LOSE_PID_B, email: 'b@x.com', full_name: 'Bart',  business_name: 'B'   }
    ],
    device_push_tokens: [
      { token: 'tok-mem',    member_id: MEMBER_ID,  platform: 'ios',     active: true },
      { token: 'tok-win',    member_id: WIN_PID,    platform: 'ios',     active: true },
      { token: 'tok-loseA',  member_id: LOSE_PID_A, platform: 'android', active: true },
      { token: 'tok-loseB',  member_id: LOSE_PID_B, platform: 'ios',     active: true }
    ],
    // Member opted out of bid_accepted push.
    member_notification_preferences: [
      { member_id: MEMBER_ID, push_bid_accepted: false }
    ],
    // Winner provider opted out of bid_accepted; loser A opted out of
    // bid_opportunities; loser B has no row → defaults to allowed.
    provider_notification_preferences: [
      { provider_id: WIN_PID,    push_bid_accepted: false, push_bid_opportunities: true  },
      { provider_id: LOSE_PID_A, push_bid_accepted: true,  push_bid_opportunities: false }
    ]
  });
  await applyMatchmakerRank(sb5, ACTION_ID, sb5.state.agent_actions[0]);
  const sum5 = sb5.state.agent_actions.find(r => r.action_type === 'apply').decision.notifications;
  assertEq(sum5.winner_pushed,      false, '[opt-out] winner with push_bid_accepted=false NOT pushed');
  assertEq(sum5.member_pushed,      false, '[opt-out] member with push_bid_accepted=false NOT pushed');
  assertEq(sum5.loser_pushed_count, 1,     '[opt-out] only loser B (no pref row) is pushed; loser A opted out');

  const send5 = fcmCalls.filter(c => c.url.includes('fcm.googleapis.com'));
  const sentTokens5 = send5.map(c => { try { return JSON.parse(c.body).message.token; } catch { return null; } });
  assertTrue(!sentTokens5.includes('tok-win'),   '[opt-out] no FCM send to winner token');
  assertTrue(!sentTokens5.includes('tok-mem'),   '[opt-out] no FCM send to member token');
  assertTrue(!sentTokens5.includes('tok-loseA'), '[opt-out] no FCM send to loser A token');
  assertTrue(sentTokens5.includes('tok-loseB'),  '[opt-out] loser B (no pref row) still pushed');
  assertEq(send5.length, 1, '[opt-out] exactly 1 FCM send call (loser B only)');

  // In-app notifications + emails are preference-independent — they should still go out.
  assertEq(sb5.state.notifications.length, 4, '[opt-out] 4 in-app notification rows still inserted');
  assertEq(resendCalls.length, 4, '[opt-out] 4 emails still sent (push opt-out does not silence email/in-app)');

  // Audit trail must explain WHY push was skipped for the opted-out recipients
  // so an admin debugging "why didn't the push fire?" sees push_disabled_by_user
  // instead of a misleading null. Both the winner branch and the member branch
  // were 100% opted out, so at least one of them populates the field (notifyMatchmakerAward
  // records the FIRST non-null reason across the three push fan-outs).
  assertEq(sum5.push_skipped_reason, 'push_disabled_by_user',
    '[opt-out] audit summary push_skipped_reason=push_disabled_by_user');

  // ── Case 5b: opt-out filter is per-category (regression guard for the
  // category=null bypass mentioned in Task #265) ──────────────────────────
  // If a future refactor forgets to pass `category` to sendMatchmakerFCMPush,
  // the opt-out check is bypassed and every recipient gets pushed. This case
  // proves the category argument is actually wired through: a winner who
  // ONLY opted out of bid_opportunities (a different category) still receives
  // their bid_accepted award push.
  resendCalls = [];
  fcmCalls = [];
  const sb5b = makeSupabaseMock({
    agent_actions: [{
      id: ACTION_ID, agent_slug: 'matchmaker', action_type: 'rank',
      review_status: null,
      decision: { recommended_winner_bid_id: WIN_BID, payload: { care_plan_id: PLAN_ID } }
    }],
    plan_bids: [
      { id: WIN_BID, care_plan_id: PLAN_ID, provider_id: WIN_PID, status: 'pending', amount: 250 }
    ],
    care_plans: [{ id: PLAN_ID, member_id: MEMBER_ID, status: 'open', title: 'Brake Job' }],
    profiles: [
      { id: MEMBER_ID, email: 'm@x.com', full_name: 'Mia',   business_name: null  },
      { id: WIN_PID,   email: 'w@x.com', full_name: 'Wendy', business_name: 'WG'  }
    ],
    device_push_tokens: [
      { token: 'tok-win-only', member_id: WIN_PID, platform: 'ios', active: true }
    ],
    // Winner opted out of OPPORTUNITIES, not ACCEPTED — bid_accepted push must still fire.
    provider_notification_preferences: [
      { provider_id: WIN_PID, push_bid_accepted: true, push_bid_opportunities: false }
    ]
  });
  await applyMatchmakerRank(sb5b, ACTION_ID, sb5b.state.agent_actions[0]);
  const sum5b = sb5b.state.agent_actions.find(r => r.action_type === 'apply').decision.notifications;
  assertEq(sum5b.winner_pushed, true,
    '[opt-out per-category] winner who only muted opportunities still gets bid_accepted push');
  const send5b = fcmCalls.filter(c => c.url.includes('fcm.googleapis.com'));
  assertEq(send5b.length, 1, '[opt-out per-category] exactly 1 FCM send (winner)');

  // restore for any downstream tests
  process.env.RESEND_API_KEY = 'test-key';
  delete process.env.FCM_SERVICE_ACCOUNT_JSON;
  globalThis.fetch = _origFetch;

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll Task #153 + Task #197 award notification checks passed.');
})().catch(err => {
  console.error('Test threw:', err);
  process.exit(1);
});

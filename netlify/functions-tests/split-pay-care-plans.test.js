// ============================================================================
// Functional tests for the split-pay rebuild onto care_plans (2026-09-10).
//
// Jordan: "let's finish the split-pay feature and make it live" -- full
// rebuild off the retired maintenance_packages/package-escrow tables onto
// care_plans (the live checkout path). Covers the pieces most likely to
// silently break real money handling:
//
//   - split-pay.js / split-guest-pay.js: reviewer accounts (and
//     reviewer-organized guest splits) never touch real Stripe, and the
//     real path attaches transfer_data so the provider actually gets paid
//     (missing from the pre-retirement design -- see split-pay.js's header
//     comment).
//   - split-confirm.js: the member-path completion gap fix -- previously
//     only split-guest-confirm.js ran care_plans + notification side effects
//     when the LAST participant paid; if that last payer was a member the
//     job silently never left pending_split_payment. Both now share
//     _shared/split-completion.js.
//   - care-plans.js's handleComplete: a plan paid off via split has no
//     stripe_payment_intent_id to capture (each share captured itself) --
//     must complete without ever calling stripe.paymentIntents.capture.
//
// Pure unit tests, no live Stripe or Supabase. Stubs @supabase/supabase-js
// and stripe at the module-loader level, same pattern as
// member-release-payment-escrow.test.js.
//
// Run with: node netlify/functions-tests/split-pay-care-plans.test.js
// ============================================================================

'use strict';

const assert = require('assert');
const Module = require('module');

let testsRun = 0;
let testsFailed = 0;
async function run(name, fn) {
  testsRun++;
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    testsFailed++;
    console.error(`  FAIL ${name}\n       ${err.stack || err.message}`);
  }
}

// ── module stubs ────────────────────────────────────────────────────────
const origLoad = Module._load;
let currentSupabase = null;
let currentStripe = null;
Module._load = function (request, parent, ...rest) {
  if (request === '@supabase/supabase-js') return { createClient: () => currentSupabase };
  if (request === 'stripe') return () => currentStripe;
  return origLoad.call(this, request, parent, ...rest);
};

process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';
process.env.COOKIE_SECRET = 'stub-cookie-secret';
process.env.STRIPE_SECRET_KEY = 'sk_stub';
process.env.REVIEWER_EMAILS = 'reviewer@mycarconcierge.com';

// Fixed valid-format UUIDs (utils.isValidUUID enforces the real shape).
const U = {
  reviewer: '11111111-1111-4111-8111-111111111111',
  member1:  '22222222-2222-4222-8222-222222222222',
  provider: '33333333-3333-4333-8333-333333333333',
  organizer:'44444444-4444-4444-8444-444444444444',
  guestPaid:'55555555-5555-4555-8555-555555555555',
  plan1: 'a1111111-1111-4111-8111-111111111111',
  plan2: 'a2222222-2222-4222-8222-222222222222',
  plan3: 'a3333333-3333-4333-8333-333333333333',
  plan4: 'a4444444-4444-4444-8444-444444444444',
  plan5: 'a5555555-5555-4555-8555-555555555555',
  split1: 'b1111111-1111-4111-8111-111111111111',
  split2: 'b2222222-2222-4222-8222-222222222222',
  split3: 'b3333333-3333-4333-8333-333333333333',
  split4: 'b4444444-4444-4444-8444-444444444444',
  split5: 'b5555555-5555-4555-8555-555555555555',
  part1: 'c1111111-1111-4111-8111-111111111111',
  part2: 'c2222222-2222-4222-8222-222222222222',
  part3: 'c3333333-3333-4333-8333-333333333333',
  part4a:'c4444444-1111-4111-8111-111111111111',
  part4b:'c4444444-2222-4222-8222-222222222222',
  plan6: 'a6666666-6666-4666-8666-666666666666',
  split6: 'b6666666-6666-4666-8666-666666666666',
  part6: 'c6666666-6666-4666-8666-666666666666',
  member2: '66666666-6666-4666-8666-666666666666',
  plan7: 'a7777777-7777-4777-8777-777777777777',
  split7: 'b7777777-7777-4777-8777-777777777777',
  part7: 'c7777777-7777-4777-8777-777777777777',
};

// ── in-memory DB + Supabase stub ────────────────────────────────────────
// Deliberately hand-rolled per table (not a generic query engine) -- same
// approach as member-release-payment-escrow.test.js and
// car-clubs-one-active-membership.test.js: only the exact call shapes this
// file's handlers actually make need to work.

function makeDb() {
  return {
    profiles: {},
    carePlans: {},
    splitPayments: {},
    splitParticipants: {},
    platformSettings: {
      split_payments_enabled: { setting_key: 'split_payments_enabled', setting_value: { enabled: true } },
    },
    notifications: [],
  };
}

function tableStore(table, db) {
  return {
    profiles: db.profiles,
    care_plans: db.carePlans,
    split_payments: db.splitPayments,
    split_participants: db.splitParticipants,
    platform_settings: db.platformSettings,
  }[table] || null;
}

function enrich(table, row, db) {
  if (table === 'split_participants') {
    return Object.assign({}, row, { split_payments: db.splitPayments[row.split_payment_id] || null });
  }
  return row;
}

function makeSupabase(db, opts = {}) {
  const authUser = opts.authUser;

  function from(table) {
    const filters = [];
    const b = {
      select() { return b; },
      eq(col, val) { filters.push([col, val]); return b; },
      in() { return b; },
      order() { return b; },
      limit() { return b; },
      apply(rows) { return rows.filter(r => filters.every(([c, v]) => r[c] === v)); },
      async single() {
        const row = findRow();
        return row ? { data: enrich(table, row, db), error: null } : { data: null, error: { message: 'not found' } };
      },
      async maybeSingle() {
        const row = findRow();
        return { data: row ? enrich(table, row, db) : null, error: null };
      },
      insert(payload) {
        const rows = Array.isArray(payload) ? payload : [payload];
        const created = rows.map(r => insertRow(table, r, db));
        const p = Promise.resolve({ data: table === 'notifications' ? created : created[0], error: null });
        p.select = function () {
          return {
            async single() { return { data: created[0], error: null }; },
            then(resolve) { resolve({ data: created, error: null }); },
          };
        };
        return p;
      },
      update(patch) {
        return {
          eq(col, val) {
            const store = tableStore(table, db) || {};
            for (const id in store) {
              if (store[id][col] === val) Object.assign(store[id], patch);
            }
            return { then(resolve) { resolve({ data: null, error: null }); } };
          },
        };
      },
      delete() {
        return {
          eq(col, val) {
            const store = tableStore(table, db) || {};
            for (const id of Object.keys(store)) {
              if (store[id][col] === val) delete store[id];
            }
            return { then(resolve) { resolve({ data: null, error: null }); } };
          },
        };
      },
      then(resolve) {
        const store = tableStore(table, db) || {};
        resolve({ data: b.apply(Object.values(store)), error: null });
      },
    };
    function findRow() {
      const store = tableStore(table, db);
      if (!store) return null;
      const idFilter = filters.find(([c]) => c === 'id');
      if (idFilter) return store[idFilter[1]] || null;
      return Object.values(store).find(r => filters.every(([c, v]) => r[c] === v)) || null;
    }
    return b;
  }

  return {
    from,
    auth: {
      getUser: async (token) => {
        if (!token || !authUser) return { data: { user: null }, error: { message: 'no token' } };
        return { data: { user: authUser }, error: null };
      },
    },
  };
}

function insertRow(table, row, db) {
  const store = tableStore(table, db);
  const id = row.id || `${table}-${Math.random().toString(36).slice(2)}`;
  const rec = Object.assign({ id }, row);
  if (table === 'notifications') { db.notifications.push(rec); return rec; }
  if (store) store[id] = rec;
  return rec;
}

// ── fake event/request builders ─────────────────────────────────────────
function eventFor(routeSuffix, { method = 'POST', body = {}, token } = {}) {
  return {
    httpMethod: method,
    path: `/api/split/${routeSuffix}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  };
}

function parseBody(res) { return JSON.parse(res.body); }

// ── fake Stripe ──────────────────────────────────────────────────────────
function makeStripe(overrides = {}) {
  const created = [];
  const canceled = [];
  return {
    _created: created,
    _canceled: canceled,
    paymentIntents: Object.assign({
      create: async (params) => {
        created.push(params);
        const id = `pi_${created.length}`;
        return { id, client_secret: `${id}_secret`, amount: params.amount, status: 'requires_payment_method' };
      },
      retrieve: async (id) => ({ id, status: 'requires_payment_method', amount: 5000 }),
      cancel: async (id) => { canceled.push(id); return { id, status: 'canceled' }; },
      capture: async (id) => { throw new Error('capture() should not be called on this path — test bug if reached'); },
    }, overrides),
  };
}

async function main() {
  await run('split-pay.js: reviewer account completes without touching Stripe', async () => {
    const db = makeDb();
    db.profiles[U.reviewer] = { id: U.reviewer, email: 'reviewer@mycarconcierge.com' };
    db.profiles[U.provider] = { id: U.provider, email: 'provider@example.com', stripe_account_id: 'acct_provider' };
    db.carePlans[U.plan1] = { id: U.plan1, provider_id: U.provider, accepted_bid_id: 'bid-1', title: 'Oil change', payment_status: 'pending_split_payment', split_payment_id: U.split1 };
    db.splitPayments[U.split1] = { id: U.split1, package_id: U.plan1, created_by: U.reviewer, total_amount_cents: 5000, status: 'pending' };
    db.splitParticipants[U.part1] = { id: U.part1, split_payment_id: U.split1, member_id: U.reviewer, email: 'reviewer@mycarconcierge.com', amount_cents: 5000, status: 'invited' };

    currentSupabase = makeSupabase(db, { authUser: { id: U.reviewer, email: 'reviewer@mycarconcierge.com' } });
    currentStripe = makeStripe();
    delete require.cache[require.resolve('../functions/split-pay')];
    delete require.cache[require.resolve('../functions/_shared/reviewer-guard')];
    delete require.cache[require.resolve('../functions/_shared/split-completion')];
    const { handler } = require('../functions/split-pay');

    const res = await handler(eventFor(`pay/${U.part1}`, { token: 'tok', body: {} }));
    const data = parseBody(res);
    assert.strictEqual(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${res.body}`);
    assert.strictEqual(data.reviewer_mock, true, 'expected reviewer_mock:true');
    assert.strictEqual(data.splitComplete, true, 'sole participant paying should complete the split');
    assert.strictEqual(currentStripe._created.length, 0, 'reviewer path must not create a real PaymentIntent');
    assert.strictEqual(db.splitParticipants[U.part1].status, 'paid');
    assert.strictEqual(db.carePlans[U.plan1].payment_status, 'held', 'plan should move to held once the split completes');
  });

  await run('split-pay.js: non-reviewer creates a real PI with transfer_data to the provider', async () => {
    const db = makeDb();
    db.profiles[U.member1] = { id: U.member1, email: 'member@example.com' };
    db.profiles[U.provider] = { id: U.provider, email: 'provider@example.com', stripe_account_id: 'acct_provider' };
    db.carePlans[U.plan2] = { id: U.plan2, provider_id: U.provider, payment_status: 'pending_split_payment', split_payment_id: U.split2 };
    db.splitPayments[U.split2] = { id: U.split2, package_id: U.plan2, created_by: U.member1, total_amount_cents: 5000, status: 'pending' };
    db.splitParticipants[U.part2] = { id: U.part2, split_payment_id: U.split2, member_id: U.member1, email: 'member@example.com', amount_cents: 2500, status: 'invited' };

    currentSupabase = makeSupabase(db, { authUser: { id: U.member1, email: 'member@example.com' } });
    currentStripe = makeStripe();
    delete require.cache[require.resolve('../functions/split-pay')];
    const { handler } = require('../functions/split-pay');

    const res = await handler(eventFor(`pay/${U.part2}`, { token: 'tok', body: {} }));
    const data = parseBody(res);
    assert.strictEqual(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${res.body}`);
    assert.strictEqual(currentStripe._created.length, 1, 'expected exactly one real PaymentIntent created');
    const piParams = currentStripe._created[0];
    assert.strictEqual(piParams.amount, 2500);
    assert.strictEqual(piParams.capture_method, 'automatic');
    assert.deepStrictEqual(piParams.transfer_data, { destination: 'acct_provider' }, 'must route funds to the provider connected account');
    assert.ok(data.clientSecret, 'expected a clientSecret in the response');
  });

  await run('split-guest-pay.js: reviewer-organized split completes without touching Stripe', async () => {
    const db = makeDb();
    db.profiles[U.reviewer] = { id: U.reviewer, email: 'reviewer@mycarconcierge.com' };
    db.carePlans[U.plan3] = { id: U.plan3, provider_id: U.provider, payment_status: 'pending_split_payment', split_payment_id: U.split3 };
    db.splitPayments[U.split3] = { id: U.split3, package_id: U.plan3, created_by: U.reviewer, total_amount_cents: 3000, status: 'pending' };
    db.splitParticipants[U.part3] = { id: U.part3, split_payment_id: U.split3, member_id: null, email: 'guest@example.com', amount_cents: 3000, status: 'invited' };

    currentSupabase = makeSupabase(db, {});
    currentStripe = makeStripe();
    delete require.cache[require.resolve('../functions/split-guest-pay')];
    const { handler } = require('../functions/split-guest-pay');
    const utils = require('../functions/utils');
    const guestToken = utils.generateGuestToken(U.part3);

    const res = await handler(eventFor(`guest-pay/${U.part3}`, { body: { token: guestToken } }));
    const data = parseBody(res);
    assert.strictEqual(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${res.body}`);
    assert.strictEqual(data.reviewer_mock, true);
    assert.strictEqual(currentStripe._created.length, 0, 'reviewer-organized guest path must not create a real PaymentIntent');
    assert.strictEqual(db.splitParticipants[U.part3].status, 'paid');
  });

  await run('split-confirm.js: member as LAST payer runs care_plans + notification side effects (the fixed gap)', async () => {
    const db = makeDb();
    db.profiles[U.member1] = { id: U.member1, email: 'member@example.com' };
    db.carePlans[U.plan4] = { id: U.plan4, provider_id: U.provider, title: 'Brake job', payment_status: 'pending_split_payment', split_payment_id: U.split4 };
    db.splitPayments[U.split4] = { id: U.split4, package_id: U.plan4, created_by: U.organizer, total_amount_cents: 6000, status: 'pending' };
    db.splitParticipants[U.part4a] = { id: U.part4a, split_payment_id: U.split4, member_id: U.guestPaid, email: 'a@example.com', amount_cents: 3000, status: 'paid' };
    db.splitParticipants[U.part4b] = { id: U.part4b, split_payment_id: U.split4, member_id: U.member1, email: 'member@example.com', amount_cents: 3000, status: 'pending' };

    currentSupabase = makeSupabase(db, { authUser: { id: U.member1, email: 'member@example.com' } });
    delete require.cache[require.resolve('../functions/split-confirm')];
    delete require.cache[require.resolve('../functions/_shared/split-completion')];
    const { handler } = require('../functions/split-confirm');

    const res = await handler(eventFor(`confirm/${U.part4b}`, { token: 'tok', body: {} }));
    const data = parseBody(res);
    assert.strictEqual(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${res.body}`);
    assert.strictEqual(data.splitComplete, true);
    assert.strictEqual(db.splitPayments[U.split4].status, 'complete');
    assert.strictEqual(db.carePlans[U.plan4].payment_status, 'held', 'care_plan must flip to held once the member is the closing payer');
    const notifTypes = db.notifications.map(n => n.type);
    assert.ok(notifTypes.includes('split_payment_complete'), 'organizer should be notified');
    assert.ok(notifTypes.includes('payment_received'), 'provider should be notified');
  });

  await run('care-plans.js handleComplete: split-paid plan completes without calling stripe.paymentIntents.capture', async () => {
    const db = makeDb();
    db.profiles[U.member1] = { id: U.member1, email: 'member@example.com' };
    db.carePlans[U.plan5] = {
      id: U.plan5, member_id: U.member1, provider_id: U.provider, accepted_bid_id: 'bid-5',
      payment_status: 'held', status: 'awarded', escrow_amount: 60,
      stripe_payment_intent_id: null, split_payment_id: U.split5,
    };
    db.splitPayments[U.split5] = { id: U.split5, package_id: U.plan5, created_by: U.member1, total_amount_cents: 6000, status: 'complete' };

    currentSupabase = makeSupabase(db, { authUser: { id: U.member1, email: 'member@example.com' } });
    currentStripe = makeStripe();
    delete require.cache[require.resolve('../functions/care-plans')];
    delete require.cache[require.resolve('../functions/_shared/reviewer-guard')];
    const { handler } = require('../functions/care-plans');

    const res = await handler({
      httpMethod: 'POST',
      path: `/api/care-plans/${U.plan5}/complete`,
      headers: { authorization: 'Bearer tok' },
      body: JSON.stringify({}),
    });
    const data = parseBody(res);
    assert.strictEqual(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${res.body}`);
    assert.strictEqual(data.success, true);
    assert.strictEqual(db.carePlans[U.plan5].payment_status, 'captured');
    assert.strictEqual(db.carePlans[U.plan5].status, 'completed');
    assert.strictEqual(currentStripe._created.length, 0);
  });

  await run('split-create.js: rejects when the plan is not awaiting card authorization', async () => {
    const db = makeDb();
    db.profiles[U.member1] = { id: U.member1, email: 'member@example.com' };
    db.carePlans[U.plan1] = { id: U.plan1, member_id: U.member1, provider_id: U.provider, payment_status: 'held', stripe_payment_intent_id: null, split_payment_id: null };

    currentSupabase = makeSupabase(db, { authUser: { id: U.member1, email: 'member@example.com' } });
    currentStripe = makeStripe();
    delete require.cache[require.resolve('../functions/split-create')];
    const { handler } = require('../functions/split-create');

    const res = await handler({
      httpMethod: 'POST', path: '/api/split/create',
      headers: { authorization: 'Bearer tok' },
      body: JSON.stringify({ care_plan_id: U.plan1, participants: [{ email: 'a@example.com', amount_cents: 5000 }] }),
    });
    assert.strictEqual(res.statusCode, 409, `expected 409, got ${res.statusCode}: ${res.body}`);
    assert.strictEqual(currentStripe._canceled.length, 0);
  });

  await run('split-create.js: rejects when participant amounts do not sum to the pending charge', async () => {
    const db = makeDb();
    db.profiles[U.member1] = { id: U.member1, email: 'member@example.com' };
    db.carePlans[U.plan1] = { id: U.plan1, member_id: U.member1, provider_id: U.provider, payment_status: 'requires_payment', stripe_payment_intent_id: 'pi_existing', split_payment_id: null };

    currentSupabase = makeSupabase(db, { authUser: { id: U.member1, email: 'member@example.com' } });
    currentStripe = makeStripe({ retrieve: async () => ({ status: 'requires_payment_method', amount: 5000 }) });
    delete require.cache[require.resolve('../functions/split-create')];
    const { handler } = require('../functions/split-create');

    const res = await handler({
      httpMethod: 'POST', path: '/api/split/create',
      headers: { authorization: 'Bearer tok' },
      body: JSON.stringify({ care_plan_id: U.plan1, participants: [{ email: 'a@example.com', amount_cents: 2000 }, { email: 'b@example.com', amount_cents: 2000 }] }),
    });
    assert.strictEqual(res.statusCode, 400, `expected 400, got ${res.statusCode}: ${res.body}`);
    assert.strictEqual(currentStripe._canceled.length, 0, 'must not cancel the PI until amounts are validated');
  });

  await run('split-create.js: happy path cancels the pending PI and creates the split', async () => {
    const db = makeDb();
    db.profiles[U.member1] = { id: U.member1, email: 'member@example.com' };
    db.profiles['guest-target'] = { id: 'guest-target', email: 'b@example.com' };
    db.carePlans[U.plan1] = { id: U.plan1, member_id: U.member1, provider_id: U.provider, payment_status: 'requires_payment', stripe_payment_intent_id: 'pi_existing', split_payment_id: null };

    currentSupabase = makeSupabase(db, { authUser: { id: U.member1, email: 'member@example.com' } });
    currentStripe = makeStripe({ retrieve: async () => ({ status: 'requires_payment_method', amount: 5000 }) });
    delete require.cache[require.resolve('../functions/split-create')];
    const { handler } = require('../functions/split-create');

    const res = await handler({
      httpMethod: 'POST', path: '/api/split/create',
      headers: { authorization: 'Bearer tok' },
      body: JSON.stringify({ care_plan_id: U.plan1, participants: [{ email: 'member@example.com', amount_cents: 2500 }, { email: 'b@example.com', amount_cents: 2500 }] }),
    });
    const data = parseBody(res);
    assert.strictEqual(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${res.body}`);
    assert.deepStrictEqual(currentStripe._canceled, ['pi_existing'], 'the original full-amount PI must be cancelled');
    assert.strictEqual(db.carePlans[U.plan1].payment_status, 'pending_split_payment');
    assert.strictEqual(db.carePlans[U.plan1].stripe_payment_intent_id, null);
    assert.strictEqual(db.carePlans[U.plan1].split_payment_id, data.split_id);
    assert.strictEqual(data.participants.length, 2);
  });

  await run('split-cancel.js: rejects a non-creator (403) and does not touch the plan', async () => {
    const db = makeDb();
    db.profiles[U.member1] = { id: U.member1, email: 'member@example.com' };
    db.profiles[U.member2] = { id: U.member2, email: 'other@example.com' };
    db.carePlans[U.plan6] = { id: U.plan6, provider_id: U.provider, payment_status: 'pending_split_payment', split_payment_id: U.split6 };
    db.splitPayments[U.split6] = { id: U.split6, package_id: U.plan6, created_by: U.member1, total_amount_cents: 4000, status: 'pending' };
    db.splitParticipants[U.part6] = { id: U.part6, split_payment_id: U.split6, member_id: U.member1, email: 'member@example.com', amount_cents: 4000, status: 'invited' };

    currentSupabase = makeSupabase(db, { authUser: { id: U.member2, email: 'other@example.com' } });
    currentStripe = makeStripe();
    delete require.cache[require.resolve('../functions/split-cancel')];
    const { handler } = require('../functions/split-cancel');

    const res = await handler(eventFor(`cancel/${U.split6}`, { token: 'tok', body: {} }));
    assert.strictEqual(res.statusCode, 403, `expected 403, got ${res.statusCode}: ${res.body}`);
    assert.strictEqual(db.carePlans[U.plan6].payment_status, 'pending_split_payment', 'plan must be untouched by a rejected cancel');
    assert.strictEqual(db.splitPayments[U.split6].status, 'pending');
  });

  await run('split-cancel.js: creator cancel refunds a paid share and resets the plan to requires_payment', async () => {
    const db = makeDb();
    db.profiles[U.member1] = { id: U.member1, email: 'member@example.com' };
    db.carePlans[U.plan6] = { id: U.plan6, provider_id: U.provider, title: 'Tune-up', payment_status: 'pending_split_payment', split_payment_id: U.split6 };
    db.splitPayments[U.split6] = { id: U.split6, package_id: U.plan6, created_by: U.member1, total_amount_cents: 4000, status: 'pending' };
    db.splitParticipants[U.part6] = { id: U.part6, split_payment_id: U.split6, member_id: U.member1, email: 'member@example.com', amount_cents: 4000, status: 'paid', payment_intent_id: 'pi_paid_1' };

    currentSupabase = makeSupabase(db, { authUser: { id: U.member1, email: 'member@example.com' } });
    let refunded = [];
    currentStripe = makeStripe({
      retrieve: async (id) => ({ id, status: 'succeeded' }),
    });
    currentStripe.refunds = { create: async (params) => { refunded.push(params); return { id: 're_1' }; } };
    delete require.cache[require.resolve('../functions/split-cancel')];
    const { handler } = require('../functions/split-cancel');

    const res = await handler(eventFor(`cancel/${U.split6}`, { token: 'tok', body: {} }));
    const data = parseBody(res);
    assert.strictEqual(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${res.body}`);
    assert.strictEqual(data.refundedCount, 1);
    assert.deepStrictEqual(refunded, [{ payment_intent: 'pi_paid_1' }]);
    assert.strictEqual(db.splitParticipants[U.part6].status, 'cancelled');
    assert.strictEqual(db.splitPayments[U.split6].status, 'cancelled');
    assert.strictEqual(db.carePlans[U.plan6].payment_status, 'requires_payment', 'plan must reset so the existing accept-bid resume path can mint a fresh PI');
    assert.strictEqual(db.carePlans[U.plan6].stripe_payment_intent_id, null);
    assert.strictEqual(db.carePlans[U.plan6].split_payment_id, null);
  });

  await run('split-reactivate.js: rejects when participant amounts do not match the original split total', async () => {
    const db = makeDb();
    db.profiles[U.member1] = { id: U.member1, email: 'member@example.com' };
    db.carePlans[U.plan7] = { id: U.plan7, provider_id: U.provider, payment_status: 'requires_payment', split_payment_id: null };
    db.splitPayments[U.split7] = { id: U.split7, package_id: U.plan7, created_by: U.member1, total_amount_cents: 5000, status: 'cancelled' };

    currentSupabase = makeSupabase(db, { authUser: { id: U.member1, email: 'member@example.com' } });
    delete require.cache[require.resolve('../functions/split-reactivate')];
    const { handler } = require('../functions/split-reactivate');

    const res = await handler(eventFor(`reactivate/${U.split7}`, {
      token: 'tok',
      body: { participants: [{ email: 'a@example.com', amount_cents: 1000 }, { email: 'b@example.com', amount_cents: 1000 }] },
    }));
    assert.strictEqual(res.statusCode, 400, `expected 400, got ${res.statusCode}: ${res.body}`);
    assert.strictEqual(db.carePlans[U.plan7].payment_status, 'requires_payment', 'plan must be untouched by a rejected reactivate');
  });

  await run('split-reactivate.js: happy path re-links the plan and flips it back to pending_split_payment', async () => {
    const db = makeDb();
    db.profiles[U.member1] = { id: U.member1, email: 'member@example.com' };
    db.carePlans[U.plan7] = { id: U.plan7, provider_id: U.provider, title: 'Alignment', payment_status: 'requires_payment', split_payment_id: null };
    db.splitPayments[U.split7] = { id: U.split7, package_id: U.plan7, created_by: U.member1, total_amount_cents: 5000, status: 'cancelled' };

    currentSupabase = makeSupabase(db, { authUser: { id: U.member1, email: 'member@example.com' } });
    delete require.cache[require.resolve('../functions/split-reactivate')];
    const { handler } = require('../functions/split-reactivate');

    const res = await handler(eventFor(`reactivate/${U.split7}`, {
      token: 'tok',
      body: { participants: [{ email: 'member@example.com', amount_cents: 2500 }, { email: 'friend@example.com', amount_cents: 2500, is_guest: true }] },
    }));
    const data = parseBody(res);
    assert.strictEqual(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${res.body}`);
    assert.strictEqual(db.splitPayments[U.split7].status, 'pending');
    assert.strictEqual(db.carePlans[U.plan7].payment_status, 'pending_split_payment');
    assert.strictEqual(db.carePlans[U.plan7].split_payment_id, U.split7);
    assert.strictEqual(data.participants.length, 2);
  });

  await run('split-status.js: rejects a caller who is neither creator nor participant', async () => {
    const db = makeDb();
    db.profiles[U.member1] = { id: U.member1, email: 'member@example.com' };
    db.profiles[U.member2] = { id: U.member2, email: 'other@example.com' };
    db.carePlans[U.plan6] = { id: U.plan6, provider_id: U.provider, title: 'Tune-up', payment_status: 'pending_split_payment', split_payment_id: U.split6 };
    db.splitPayments[U.split6] = { id: U.split6, package_id: U.plan6, created_by: U.member1, total_amount_cents: 4000, status: 'pending' };
    db.splitParticipants[U.part6] = { id: U.part6, split_payment_id: U.split6, member_id: U.member1, email: 'member@example.com', amount_cents: 4000, status: 'invited' };

    currentSupabase = makeSupabase(db, { authUser: { id: U.member2, email: 'other@example.com' } });
    delete require.cache[require.resolve('../functions/split-status')];
    const { handler } = require('../functions/split-status');

    const res = await handler(eventFor(`status/${U.plan6}`, { method: 'GET', token: 'tok' }));
    assert.strictEqual(res.statusCode, 403, `expected 403, got ${res.statusCode}: ${res.body}`);
  });

  await run('split-status.js: creator can view the split status', async () => {
    const db = makeDb();
    db.profiles[U.member1] = { id: U.member1, email: 'member@example.com' };
    db.carePlans[U.plan6] = { id: U.plan6, provider_id: U.provider, title: 'Tune-up', payment_status: 'pending_split_payment', split_payment_id: U.split6 };
    db.splitPayments[U.split6] = { id: U.split6, package_id: U.plan6, created_by: U.member1, total_amount_cents: 4000, status: 'pending' };
    db.splitParticipants[U.part6] = { id: U.part6, split_payment_id: U.split6, member_id: U.member1, email: 'member@example.com', amount_cents: 4000, status: 'invited' };

    currentSupabase = makeSupabase(db, { authUser: { id: U.member1, email: 'member@example.com' } });
    delete require.cache[require.resolve('../functions/split-status')];
    const { handler } = require('../functions/split-status');

    const res = await handler(eventFor(`status/${U.plan6}`, { method: 'GET', token: 'tok' }));
    const data = parseBody(res);
    assert.strictEqual(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${res.body}`);
    assert.strictEqual(data.isCreator, true);
    assert.strictEqual(data.participants.length, 1);
    assert.strictEqual(data.planTitle, 'Tune-up');
  });

  console.log(`\n${testsRun - testsFailed}/${testsRun} passed`);
  if (testsFailed > 0) process.exit(1);
}

main().catch(err => { console.error('Test runner crashed:', err); process.exit(1); });

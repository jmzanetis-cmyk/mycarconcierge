/**
 * Task #200: Pin the contract that the founder commission rate is read from
 * `member_founder_profiles.commission_rate`, NOT derived from the founder's
 * email address or referral_code.
 *
 * Task #158 moved the rate (90% Chris, 50% standard) out of hardcoded
 * email/referral_code string checks inside `processInstantCommissionPayout`
 * and `processCarePlanFounderCommission` (www/server.js) and into a
 * per-row column on member_founder_profiles. There was no automated test
 * pinning that contract — a future refactor could silently regress to the
 * old hardcoded behavior or pull from the wrong column. This test fills
 * that gap.
 *
 * Strategy: extract both function definitions out of www/server.js,
 * evaluate them inside an isolated `vm` context with mocked Supabase +
 * Stripe, and assert that the commission amount equals
 * `captured_amount * member_founder_profiles.commission_rate` for at
 * least two distinct rates (0.50 and 0.90), regardless of the founder's
 * email or referral_code.
 *
 * If anyone reverts either function to email/referral_code-based rate
 * selection, the 0.90 case for a non-Chris founder will fail (it would
 * compute 0.50 * captured_amount instead of 0.90 * captured_amount).
 */

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('vm');

const SERVER_PATH = path.join(__dirname, '..', 'www', 'server.js');
const SERVER_SOURCE = fs.readFileSync(SERVER_PATH, 'utf8');

/**
 * Extract a top-level `async function NAME(...) { ... }` block from
 * server.js by scanning for the start marker and walking forward until
 * the first `}` that appears alone at column 0 (which is how the file
 * formats every top-level function).
 */
function extractTopLevelFunction(source, name) {
  const marker = `async function ${name}(`;
  const startIdx = source.indexOf(marker);
  if (startIdx === -1) {
    throw new Error(`Could not find function ${name} in www/server.js`);
  }
  const lines = source.slice(startIdx).split('\n');
  const collected = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    collected.push(lines[i]);
    if (lines[i] === '}') {
      return collected.join('\n');
    }
  }
  throw new Error(`Could not find end of function ${name} (no '^}$' line found)`);
}

/**
 * Build a fluent Supabase mock that records every insert/update payload
 * and returns canned data for select/maybeSingle/single calls based on
 * the table being queried and the filters applied.
 *
 * `responses` maps table name -> ordered list of canned results to pop
 * for each terminal call (single/maybeSingle/await-on-update).
 */
function makeSupabaseMock(responses) {
  const captured = { inserts: [], updates: [], selects: [], misc: [] };
  const queue = {};
  for (const [t, list] of Object.entries(responses)) {
    queue[t] = list.slice();
  }

  function next(table, kind, state) {
    const list = queue[table] || [];
    if (list.length === 0) {
      throw new Error(
        `No more mocked responses for table=${table} kind=${kind} ` +
        `filters=${JSON.stringify(state.filters)} cols=${state.cols}`
      );
    }
    const handler = list.shift();
    captured.selects.push({ table, kind, filters: state.filters.slice(), cols: state.cols });
    return typeof handler === 'function' ? handler(state) : handler;
  }

  function from(table) {
    const state = {
      table,
      action: 'select',
      payload: null,
      filters: [],
      cols: null,
      afterMutation: null
    };

    const q = {
      select(cols) {
        state.cols = cols;
        if (state.action === 'insert') state.afterMutation = 'select';
        return q;
      },
      insert(payload) {
        state.action = 'insert';
        state.payload = payload;
        captured.inserts.push({ table, payload });
        return q;
      },
      update(payload) {
        state.action = 'update';
        state.payload = payload;
        return q;
      },
      delete() { state.action = 'delete'; return q; },
      eq(col, val) { state.filters.push({ op: 'eq', col, val }); return q; },
      neq(col, val) { state.filters.push({ op: 'neq', col, val }); return q; },
      in(col, vals) { state.filters.push({ op: 'in', col, val: vals }); return q; },
      gt() { return q; },
      gte() { return q; },
      lt() { return q; },
      lte() { return q; },
      like() { return q; },
      ilike() { return q; },
      is() { return q; },
      not() { return q; },
      or() { return q; },
      contains() { return q; },
      filter() { return q; },
      order() { return q; },
      limit() { return q; },
      range() { return q; },
      single() { return Promise.resolve(next(table, 'single', state)); },
      maybeSingle() { return Promise.resolve(next(table, 'maybeSingle', state)); },
      then(onResolve, onReject) {
        try {
          if (state.action === 'update') {
            captured.updates.push({ table, payload: state.payload, filters: state.filters.slice() });
          }
          const result = next(table, 'await', state);
          onResolve(result);
        } catch (e) {
          if (onReject) onReject(e); else throw e;
        }
        return q;
      },
      catch() { return q; }
    };
    return q;
  }

  return { client: { from }, captured };
}

/**
 * Build a Stripe mock whose `transfers.create` records every call so the
 * test can assert the transferred amount.
 */
function makeStripeMock() {
  const calls = { transfers: [], accountsRetrieve: [] };
  return {
    client: {
      accounts: {
        retrieve: async (id) => {
          calls.accountsRetrieve.push(id);
          return { payouts_enabled: true, charges_enabled: true };
        }
      },
      transfers: {
        create: async (args) => {
          calls.transfers.push(args);
          return { id: `tr_${calls.transfers.length}_${Date.now()}` };
        }
      }
    },
    calls
  };
}

/**
 * Compile both target functions out of server.js and return them ready
 * to be invoked with the given `getStripeClient`.
 */
function loadCommissionFunctions(getStripeClient) {
  const instantSrc = extractTopLevelFunction(SERVER_SOURCE, 'processInstantCommissionPayout');
  const carePlanSrc = extractTopLevelFunction(SERVER_SOURCE, 'processCarePlanFounderCommission');

  const wrapper = `(function(getStripeClient) {
    ${instantSrc}
    ${carePlanSrc}
    return { processInstantCommissionPayout, processCarePlanFounderCommission };
  })`;

  const factory = vm.runInNewContext(wrapper, {
    Promise,
    console: { log() {}, warn() {}, error() {} },
    Math,
    Number,
    parseFloat: Number.parseFloat,
    parseInt: Number.parseInt,
    Date,
    JSON,
    Array,
    Object,
    String,
    Boolean,
    Error
  });
  return factory(getStripeClient);
}

/**
 * Build the canonical mock setup for a successful instant payout flow,
 * parameterized by the founder's commission_rate (whatever value lives
 * in member_founder_profiles.commission_rate for that row).
 */
function setupInstantPayoutMocks({ commissionRate, founderEmail, founderReferralCode, purchaseAmount }) {
  const founderId = 'founder-uuid-1';
  const founderUserId = 'user-uuid-1';
  const providerId = 'provider-uuid-1';
  const transactionId = 'tx-instant-1';
  const founderRow = {
    id: founderId,
    user_id: founderUserId,
    full_name: 'Test Founder',
    email: founderEmail,
    referral_code: founderReferralCode,
    stripe_connect_account_id: 'acct_test',
    instant_payout_enabled: true,
    payout_preference: 'instant',
    total_commissions_earned: 0,
    total_commissions_paid: 0,
    commission_rate: commissionRate
  };

  const responses = {
    founder_commissions: [
      // existingPayout idempotency check
      { data: null, error: null },
      // findError: first lookup before insert
      { data: null, error: null },
      // insert -> .select('id').single()
      { data: { id: 'comm-row-1' }, error: null },
      // .update(...).eq(...) await terminal
      { data: null, error: null },
      // recheckRecord
      { data: { stripe_transfer_id: null, status: 'pending' }, error: null },
      // .update(...).eq(...) success update terminal
      { data: null, error: null }
    ],
    profiles: [
      { data: { id: providerId, referred_by_founder_id: founderUserId, referred_by_code: founderReferralCode }, error: null }
    ],
    member_founder_profiles: [
      // founder lookup (by user_id)
      { data: founderRow, error: null },
      // currentFounder totals fetch
      { data: { total_commissions_earned: 0, total_commissions_paid: 0 }, error: null },
      // totals update (terminal await)
      { data: null, error: null }
    ]
  };

  const sb = makeSupabaseMock(responses);
  const st = makeStripeMock();
  return { sb, st, founderRow, providerId, transactionId, purchaseAmount };
}

function setupCarePlanMocks({ commissionRate, founderEmail, founderReferralCode, capturedAmount }) {
  const founderId = 'founder-uuid-2';
  const founderUserId = 'user-uuid-2';
  const providerId = 'provider-uuid-2';
  const paymentIntentId = 'pi_care_plan_1';
  const founderRow = {
    id: founderId,
    user_id: founderUserId,
    full_name: 'Test Founder 2',
    email: founderEmail,
    referral_code: founderReferralCode,
    stripe_connect_account_id: 'acct_test_2',
    instant_payout_enabled: true,
    payout_preference: 'instant',
    total_commissions_earned: 0,
    total_commissions_paid: 0,
    status: 'active',
    commission_rate: commissionRate
  };

  const responses = {
    founder_commissions: [
      // existingPayout idempotency check
      { data: null, error: null },
      // existing-by-transaction_id lookup
      { data: null, error: null },
      // insert -> .select('id, founder_id').single()
      { data: { id: 'cp-comm-row-1', founder_id: founderId }, error: null },
      // success update terminal (mark paid)
      { data: null, error: null }
    ],
    profiles: [
      { data: { id: providerId, referred_by_founder_id: founderUserId }, error: null }
    ],
    member_founder_profiles: [
      // founder lookup
      { data: founderRow, error: null },
      // totals fetch
      { data: { total_commissions_earned: 0, total_commissions_paid: 0 }, error: null },
      // totals update terminal
      { data: null, error: null }
    ]
  };

  const sb = makeSupabaseMock(responses);
  const st = makeStripeMock();
  return { sb, st, founderRow, providerId, paymentIntentId, capturedAmount };
}

test.describe('Founder commission rate is database-driven (Task #158 contract)', () => {
  test.describe.configure({ mode: 'serial' });

  // Two distinct rates, both with a founder whose email and referral_code
  // would NOT match the old hardcoded "Chris Agrapidis" patterns. If
  // anyone reverts to email/referral_code-based selection, the 0.90 case
  // will collapse to 0.50 and the test will fail.
  const rateScenarios = [
    { rate: 0.50, label: 'standard 50% rate' },
    { rate: 0.90, label: '90% rate (e.g. founding-provider partner)' }
  ];

  for (const { rate, label } of rateScenarios) {
    test(`processInstantCommissionPayout uses commission_rate column (${label})`, async () => {
      const purchaseAmount = 100;
      const { sb, st, founderRow, providerId, transactionId } = setupInstantPayoutMocks({
        commissionRate: rate,
        founderEmail: 'jane.doe@example.com',
        founderReferralCode: 'JANEDOE',
        purchaseAmount
      });
      const { processInstantCommissionPayout } = loadCommissionFunctions(() => st.client);

      const result = await processInstantCommissionPayout(
        sb.client, providerId, purchaseAmount, transactionId, 'req-test'
      );

      const expectedAmount = Number.parseFloat((purchaseAmount * founderRow.commission_rate).toFixed(2));

      expect(result).not.toBeNull();
      expect(result.success).toBe(true);
      expect(result.amount).toBeCloseTo(expectedAmount, 2);

      // Stripe transfer amount (in cents) must equal purchase * DB rate.
      expect(st.calls.transfers).toHaveLength(1);
      expect(st.calls.transfers[0].amount).toBe(Math.round(expectedAmount * 100));
      expect(st.calls.transfers[0].metadata.commission_rate).toBe(String(founderRow.commission_rate));

      // The persisted commission row must record the same rate + amount.
      const insertedCommission = sb.captured.inserts.find(i => i.table === 'founder_commissions');
      expect(insertedCommission).toBeDefined();
      expect(Number(insertedCommission.payload.commission_rate)).toBeCloseTo(founderRow.commission_rate, 4);
      expect(Number(insertedCommission.payload.commission_amount)).toBeCloseTo(expectedAmount, 2);

      // Sanity check: the founder's identity must NOT match the old
      // hardcoded "Chris Agrapidis" patterns. If it did, this test would
      // be vacuous (the hardcoded fallback would happen to match the DB).
      expect(founderRow.email.toLowerCase()).not.toContain('chris');
      expect(founderRow.email.toLowerCase()).not.toContain('agrapidis');
      expect(founderRow.referral_code).not.toBe('CHRISAGRAPIDIS');
    });

    test(`processCarePlanFounderCommission uses commission_rate column (${label})`, async () => {
      const capturedAmount = 200;
      const { sb, st, founderRow, providerId, paymentIntentId } = setupCarePlanMocks({
        commissionRate: rate,
        founderEmail: 'pat.smith@example.com',
        founderReferralCode: 'PATSMITH',
        capturedAmount
      });
      const { processCarePlanFounderCommission } = loadCommissionFunctions(async () => st.client);

      const result = await processCarePlanFounderCommission(
        sb.client, providerId, capturedAmount, paymentIntentId, 'req-test-cp'
      );

      const expectedAmount = Number.parseFloat((capturedAmount * founderRow.commission_rate).toFixed(2));

      expect(result.skipped).toBe(false);
      expect(result.amount).toBeCloseTo(expectedAmount, 2);

      expect(st.calls.transfers).toHaveLength(1);
      expect(st.calls.transfers[0].amount).toBe(Math.round(expectedAmount * 100));
      expect(st.calls.transfers[0].metadata.commission_rate).toBe(String(founderRow.commission_rate));

      const insertedCommission = sb.captured.inserts.find(i => i.table === 'founder_commissions');
      expect(insertedCommission).toBeDefined();
      expect(Number(insertedCommission.payload.commission_rate)).toBeCloseTo(founderRow.commission_rate, 4);
      expect(Number(insertedCommission.payload.commission_amount)).toBeCloseTo(expectedAmount, 2);

      // Sanity check (see above).
      expect(founderRow.email.toLowerCase()).not.toContain('chris');
      expect(founderRow.email.toLowerCase()).not.toContain('agrapidis');
      expect(founderRow.referral_code).not.toBe('CHRISAGRAPIDIS');
    });
  }

  test('processInstantCommissionPayout SELECTs member_founder_profiles.commission_rate', () => {
    // Static guard: the function must read commission_rate from the DB.
    // If this column is dropped from the SELECT list the function
    // cannot be database-driven.
    const src = extractTopLevelFunction(SERVER_SOURCE, 'processInstantCommissionPayout');
    const founderSelect = src.match(/from\(['"]member_founder_profiles['"]\)\s*\n?\s*\.select\(['"]([^'"]+)['"]\)/);
    expect(founderSelect, 'expected processInstantCommissionPayout to .select(...) from member_founder_profiles').toBeTruthy();
    expect(founderSelect[1]).toContain('commission_rate');
  });

  test('processCarePlanFounderCommission SELECTs member_founder_profiles.commission_rate', () => {
    const src = extractTopLevelFunction(SERVER_SOURCE, 'processCarePlanFounderCommission');
    const founderSelect = src.match(/from\(['"]member_founder_profiles['"]\)\s*\n?\s*\.select\(['"]([^'"]+)['"]\)/);
    expect(founderSelect, 'expected processCarePlanFounderCommission to .select(...) from member_founder_profiles').toBeTruthy();
    expect(founderSelect[1]).toContain('commission_rate');
  });

  test('Neither commission function selects rate from email/referral_code', () => {
    // The old hardcoded path computed `commissionRate` from
    // `founder.email` containing 'chris'/'agrapidis' or `referral_code`
    // === 'CHRISAGRAPIDIS'. If either pattern reappears inside these
    // function bodies, the contract is broken.
    const instantSrc = extractTopLevelFunction(SERVER_SOURCE, 'processInstantCommissionPayout');
    const carePlanSrc = extractTopLevelFunction(SERVER_SOURCE, 'processCarePlanFounderCommission');
    for (const [name, src] of [['processInstantCommissionPayout', instantSrc], ['processCarePlanFounderCommission', carePlanSrc]]) {
      expect(src, `${name} must not derive commission rate from email`).not.toMatch(/email[^=\n]{0,60}(?:chris|agrapidis)/i);
      expect(src, `${name} must not derive commission rate from referral_code`).not.toMatch(/referral_code[^=\n]{0,60}CHRISAGRAPIDIS/);
    }
  });
});

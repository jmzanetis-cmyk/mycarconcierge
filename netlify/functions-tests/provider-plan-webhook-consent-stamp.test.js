// handleProviderPlanCheckoutCompleted — consent stamp on
// checkout.session.completed for provider_plan sessions.
//
// The webhook must:
//   * Silently skip when metadata.product !== 'provider_plan'.
//   * Stamp terms_accepted_at + terms_version + checkout_session_id when
//     session.consent.terms_of_service === 'accepted'.
//   * Stamp only checkout_session_id when consent is missing/none — no
//     terms_accepted_at, no terms_version.
//   * Match on stripe_subscription_id and no-op when the subscription
//     row doesn't exist yet (upstream ordering race).

'use strict';
const assert = require('assert');
const { handleProviderPlanCheckoutCompleted } = require('../functions/_provider-plan-webhooks');
const { TERMS_VERSION } = require('../../lib/plan-terms-version');

function makeSb(rows) {
  const state = { rows: rows.map(r => ({ ...r })), updates: [] };
  return {
    _state: state,
    from(name) {
      let filters = [];
      let patch = null;
      let mode = 'select';
      const b = {
        select(_cols) { return this; },
        eq(col, val) { filters.push(row => row[col] === val); return this; },
        update(p) { mode = 'update'; patch = p; return this; },
        then(resolve) {
          if (mode === 'update') {
            const targets = state.rows.filter(r => filters.every(f => f(r)));
            for (const r of targets) Object.assign(r, patch);
            state.updates.push({ table: name, patch, count: targets.length });
            resolve({ data: targets, error: null });
          } else {
            resolve({ data: state.rows.filter(r => filters.every(f => f(r))), error: null });
          }
        },
      };
      return b;
    },
  };
}

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); console.log('  ok  ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + ': ' + e.stack); fail++; }
}

(async () => {

await t('skip when metadata.product !== provider_plan', async () => {
  const sb = makeSb([]);
  const res = await handleProviderPlanCheckoutCompleted({
    id: 'cs_test_1',
    metadata: { product: 'white_label' },
    subscription: 'sub_x',
    consent: { terms_of_service: 'accepted' },
  }, sb);
  assert.strictEqual(res.skipped, 'not_provider_plan');
  assert.strictEqual(sb._state.updates.length, 0, 'no writes on skip');
});

await t('no subscription on session → skip', async () => {
  const sb = makeSb([]);
  const res = await handleProviderPlanCheckoutCompleted({
    id: 'cs_test_2',
    metadata: { product: 'provider_plan' },
    subscription: null,
    consent: { terms_of_service: 'accepted' },
  }, sb);
  assert.strictEqual(res.skipped, 'no_subscription_on_session');
});

await t('accepted → stamps terms_accepted_at + terms_version + session id', async () => {
  const sb = makeSb([{
    id: 'ps-1', provider_id: 'p1',
    stripe_subscription_id: 'sub_abc',
    terms_accepted_at: null, terms_version: null, checkout_session_id: null,
  }]);
  const res = await handleProviderPlanCheckoutCompleted({
    id: 'cs_test_3',
    metadata: { product: 'provider_plan' },
    subscription: 'sub_abc',
    consent: { terms_of_service: 'accepted' },
  }, sb);
  assert.strictEqual(res.stamped, true);
  assert.strictEqual(res.consent, 'accepted');
  const row = sb._state.rows[0];
  assert.ok(row.terms_accepted_at, 'terms_accepted_at stamped');
  assert.strictEqual(row.terms_version, TERMS_VERSION);
  assert.strictEqual(row.checkout_session_id, 'cs_test_3');
});

await t('consent=none → checkout_session_id only, no terms stamps', async () => {
  const sb = makeSb([{
    id: 'ps-2', provider_id: 'p2',
    stripe_subscription_id: 'sub_def',
    terms_accepted_at: null, terms_version: null, checkout_session_id: null,
  }]);
  const res = await handleProviderPlanCheckoutCompleted({
    id: 'cs_test_4',
    metadata: { product: 'provider_plan' },
    subscription: 'sub_def',
    consent: { terms_of_service: 'none' },
  }, sb);
  assert.strictEqual(res.stamped, true);
  assert.strictEqual(res.consent, 'none');
  const row = sb._state.rows[0];
  assert.strictEqual(row.terms_accepted_at, null, 'no terms_accepted_at when not accepted');
  assert.strictEqual(row.terms_version, null,   'no terms_version when not accepted');
  assert.strictEqual(row.checkout_session_id, 'cs_test_4', 'still records the session id for cross-reference');
});

await t('consent field missing entirely → session id only', async () => {
  const sb = makeSb([{
    id: 'ps-3', provider_id: 'p3',
    stripe_subscription_id: 'sub_ghi',
    terms_accepted_at: null, terms_version: null, checkout_session_id: null,
  }]);
  const res = await handleProviderPlanCheckoutCompleted({
    id: 'cs_test_5',
    metadata: { product: 'provider_plan' },
    subscription: 'sub_ghi',
    // consent omitted entirely
  }, sb);
  assert.strictEqual(res.stamped, true);
  assert.strictEqual(res.consent, 'none');
  assert.strictEqual(sb._state.rows[0].terms_accepted_at, null);
});

await t('no matching sub row → stamped=false, no error', async () => {
  const sb = makeSb([]);
  const res = await handleProviderPlanCheckoutCompleted({
    id: 'cs_test_6',
    metadata: { product: 'provider_plan' },
    subscription: 'sub_unknown',
    consent: { terms_of_service: 'accepted' },
  }, sb);
  assert.strictEqual(res.stamped, false);
  assert.strictEqual(res.consent, 'accepted');
});

await t('subscription as expanded object → still reads .id', async () => {
  const sb = makeSb([{
    id: 'ps-4', stripe_subscription_id: 'sub_xyz',
    terms_accepted_at: null, terms_version: null, checkout_session_id: null,
  }]);
  const res = await handleProviderPlanCheckoutCompleted({
    id: 'cs_test_7',
    metadata: { product: 'provider_plan' },
    subscription: { id: 'sub_xyz', object: 'subscription' },
    consent: { terms_of_service: 'accepted' },
  }, sb);
  assert.strictEqual(res.stamped, true);
  assert.strictEqual(sb._state.rows[0].checkout_session_id, 'cs_test_7');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
})();

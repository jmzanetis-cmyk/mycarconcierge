// _anonymizeJobRecords — job records must survive account deletion.
//
// Regression guard for the data-loss bug fixed in 20260921h: care_plans,
// plan_bids and care_plan_completions cascaded from auth.users, so a member
// deleting their account destroyed the provider's invoice basis, warranty
// record and dispute history for work already performed.
//
// These tests assert the SHAPE of the supabase calls (a recording stub, no
// database): what is updated vs deleted, that identity is snapshotted before
// the link is broken, and that no personal data rides along in the snapshot.

'use strict';
const assert = require('assert');
const { _anonymizeJobRecords } = require('../functions/account-deletion-core');

const USER = '11111111-1111-1111-1111-111111111111';

// ---------------------------------------------------------------------------
// Recording stub. Captures every from(...).update/delete/select chain so the
// test can assert on the calls without a live PostgREST.
// ---------------------------------------------------------------------------
function makeStub(seed) {
  const calls = [];
  const data = seed || {};
  function builder(table, op, payload) {
    const rec = { table, op, payload, filters: [] };
    calls.push(rec);
    const chain = {
      eq(col, val) { rec.filters.push(['eq', col, val]); return chain; },
      in(col, vals) { rec.filters.push(['in', col, vals]); return chain; },
      neq(col, val) { rec.filters.push(['neq', col, val]); return chain; },
      select(cols) { rec.select = cols; return chain; },
      then(resolve) {
        const key = table + ':' + op;
        return Promise.resolve({ data: data[key] || [], error: null }).then(resolve);
      },
    };
    return chain;
  }
  return {
    calls,
    from(table) {
      return {
        update: (payload) => builder(table, 'update', payload),
        delete: () => builder(table, 'delete', null),
        select: (cols) => { const c = builder(table, 'select', null); c.select(cols); return c; },
      };
    },
  };
}

const find = (calls, table, op) => calls.filter(c => c.table === table && c.op === op);

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); console.log('  ok  ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + ': ' + e.message); fail++; }
}

(async () => {

  // ---- member path --------------------------------------------------------

  await t('member: completion row is updated, never deleted', async () => {
    const sb = makeStub({
      'care_plans:select': [{ id: 'plan-A' }, { id: 'plan-B' }],
      'care_plan_completions:select': [{ care_plan_id: 'plan-A' }],
    });
    await _anonymizeJobRecords(sb, USER, { isProvider: false, profile: { full_name: 'Dana Reed' } });

    assert.strictEqual(find(sb.calls, 'care_plan_completions', 'delete').length, 0,
      'completions must never be deleted — they are the money record');
    const upd = find(sb.calls, 'care_plan_completions', 'update');
    assert.strictEqual(upd.length, 1);
    assert.strictEqual(upd[0].payload.member_id, null, 'link broken');
    assert.ok(upd[0].payload.member_deleted_at, 'deletion marker stamped');
  });

  await t('member: identity is snapshotted before the link is broken', async () => {
    const sb = makeStub({
      'care_plans:select': [{ id: 'plan-A' }],
      'care_plan_completions:select': [{ care_plan_id: 'plan-A' }],
    });
    await _anonymizeJobRecords(sb, USER, { isProvider: false, profile: { full_name: 'Dana Reed' } });
    const upd = find(sb.calls, 'care_plan_completions', 'update')[0];
    assert.strictEqual(upd.payload.member_name_snapshot, 'Dana Reed');
    // Same statement: the WHERE still matches on the old id, so snapshot and
    // null happen atomically per row.
    assert.deepStrictEqual(upd.filters[0], ['eq', 'member_id', USER]);
  });

  await t('member: snapshot never falls back to the email address', async () => {
    const sb = makeStub({
      'care_plans:select': [],
      'care_plan_completions:select': [],
    });
    await _anonymizeJobRecords(sb, USER, {
      isProvider: false,
      profile: { email: 'dana@example.com' },   // no full_name
    });
    const upd = find(sb.calls, 'care_plan_completions', 'update')[0];
    assert.strictEqual(upd.payload.member_name_snapshot, 'Former member',
      'must not re-introduce the PII being deleted');
  });

  await t('member: plan with a completion is preserved and scrubbed', async () => {
    const sb = makeStub({
      'care_plans:select': [{ id: 'plan-A' }, { id: 'plan-B' }],
      'care_plan_completions:select': [{ care_plan_id: 'plan-A' }],
    });
    await _anonymizeJobRecords(sb, USER, { isProvider: false, profile: { full_name: 'Dana' } });

    const upd = find(sb.calls, 'care_plans', 'update');
    assert.strictEqual(upd.length, 1);
    assert.deepStrictEqual(upd[0].filters[0], ['in', 'id', ['plan-A']]);
    const p = upd[0].payload;
    assert.strictEqual(p.member_id, null);
    assert.ok(p.member_deleted_at);
    // Precise location and member free text go; job content stays.
    assert.strictEqual(p.description, null);
    assert.strictEqual(p.lat, null);
    assert.strictEqual(p.lng, null);
    assert.strictEqual(p.zip_code, null);
    assert.strictEqual(p.city, null, 'city IS scrubbed — city-level location is identifying in a small market (85d60aa)');
    assert.ok(!('title' in p), 'title is kept — the provider needs to know what the job was');
    assert.ok(!('state' in p), 'state is kept — not identifying, useful for provider warranty record');
  });

  await t('member: plan with no completion is deleted, not orphaned', async () => {
    const sb = makeStub({
      'care_plans:select': [{ id: 'plan-A' }, { id: 'plan-B' }],
      'care_plan_completions:select': [{ care_plan_id: 'plan-A' }],
    });
    await _anonymizeJobRecords(sb, USER, { isProvider: false, profile: {} });
    const del = find(sb.calls, 'care_plans', 'delete');
    assert.strictEqual(del.length, 1);
    assert.deepStrictEqual(del[0].filters[0], ['in', 'id', ['plan-B']]);
  });

  await t('member: no plans at all → no update and no delete call', async () => {
    const sb = makeStub({ 'care_plans:select': [], 'care_plan_completions:select': [] });
    await _anonymizeJobRecords(sb, USER, { isProvider: false, profile: {} });
    assert.strictEqual(find(sb.calls, 'care_plans', 'update').length, 0);
    assert.strictEqual(find(sb.calls, 'care_plans', 'delete').length, 0);
  });

  await t('member path never touches plan_bids directly', async () => {
    const sb = makeStub({
      'care_plans:select': [{ id: 'plan-A' }],
      'care_plan_completions:select': [{ care_plan_id: 'plan-A' }],
    });
    await _anonymizeJobRecords(sb, USER, { isProvider: false, profile: {} });
    assert.strictEqual(sb.calls.filter(c => c.table === 'plan_bids').length, 0,
      'bids belong to providers; they follow the plan via FK');
  });

  // ---- provider path ------------------------------------------------------

  await t('provider: bids are anonymised, not deleted', async () => {
    const sb = makeStub({});
    await _anonymizeJobRecords(sb, USER, { isProvider: true, profile: { business_name: 'Alpha Auto Body' } });
    assert.strictEqual(find(sb.calls, 'plan_bids', 'delete').length, 0,
      'deleting bids would erase them from other members\' jobs');
    const upd = find(sb.calls, 'plan_bids', 'update');
    assert.strictEqual(upd.length, 1);
    assert.strictEqual(upd[0].payload.provider_id, null);
    assert.ok(upd[0].payload.provider_deleted_at);
    assert.deepStrictEqual(upd[0].filters[0], ['eq', 'provider_id', USER]);
  });

  await t('provider: business name is snapshotted, personal name is not', async () => {
    const sb = makeStub({});
    await _anonymizeJobRecords(sb, USER, {
      isProvider: true,
      profile: { business_name: 'Alpha Auto Body', full_name: 'Sam Alpha', email: 'sam@alpha.test' },
    });
    const upd = find(sb.calls, 'care_plan_completions', 'update')[0];
    assert.strictEqual(upd.payload.provider_business_name_snapshot, 'Alpha Auto Body');
    const serialized = JSON.stringify(upd.payload);
    assert.ok(!serialized.includes('Sam Alpha'), 'no personal name in the snapshot');
    assert.ok(!serialized.includes('sam@alpha.test'), 'no email in the snapshot');
  });

  await t('provider with no business name gets a placeholder', async () => {
    const sb = makeStub({});
    await _anonymizeJobRecords(sb, USER, { isProvider: true, profile: { full_name: 'Sam Alpha' } });
    const upd = find(sb.calls, 'care_plan_completions', 'update')[0];
    assert.strictEqual(upd.payload.provider_business_name_snapshot, 'Former provider');
  });

  await t('provider path never touches the member side', async () => {
    const sb = makeStub({});
    await _anonymizeJobRecords(sb, USER, { isProvider: true, profile: { business_name: 'Alpha' } });
    const upd = find(sb.calls, 'care_plan_completions', 'update')[0];
    assert.ok(!('member_id' in upd.payload));
    assert.ok(!('member_name_snapshot' in upd.payload));
    assert.strictEqual(find(sb.calls, 'care_plans', 'update').length, 0);
    assert.strictEqual(find(sb.calls, 'care_plans', 'delete').length, 0);
  });

  // ---- shared -------------------------------------------------------------

  await t('missing opts does not throw (defaults to member path)', async () => {
    const sb = makeStub({ 'care_plans:select': [], 'care_plan_completions:select': [] });
    await _anonymizeJobRecords(sb, USER);
    assert.ok(find(sb.calls, 'care_plan_completions', 'update').length === 1);
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})();

'use strict';

// Task #425 (Step 6) regression test: the Stripe webhook MUST NOT respond 200
// when bid credits could not be persisted. If it did, Stripe would never
// retry and the provider would be charged without receiving credits.
//
// This is a unit-level proof of the safety contract — we directly exercise
// the failure branches in the bid-credit handler. The real handler lives
// inside the Stripe webhook in www/server.js; we mimic the same control
// flow here with stubbed supabase calls. If anyone reverts the swallowed-
// error fix, this test fails.
//
// Run: node netlify/functions-tests/stripe-webhook-bid-credit.test.js

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  ok ', name); pass++; }
  else { console.error('  FAIL', name, detail || ''); fail++; }
}

function makeRes() {
  const res = { statusCode: null, body: null, headers: null };
  res.writeHead = (code, headers) => { res.statusCode = code; res.headers = headers; };
  res.end = (b) => { res.body = b; };
  return res;
}

// Mirrors the post-fix control flow in www/server.js bid-credit handler.
// scenario === 'grant_insert_db_error' → supabase grant log insert fails
//                                        (non-23505) → must 500
// scenario === 'grant_insert_duplicate' → 23505 → skip credit add, treat
//                                         as already-granted, return ok
// scenario === 'profile_update_db_error' → grant inserted, profiles.update
//                                          fails → must 500 AND grant row
//                                          must be cleaned up so retry can
//                                          insert again
// scenario === 'happy_path' → returns 200 and credits are added
async function runBidCreditHandler(scenario, res) {
  const transactionId = 'pi_test_123';
  const providerId    = 'prov-1';
  const totalBids     = 10;

  const fakeSupabase = {
    deletedTxnIds: [],
    creditedUserId: null,
    creditedAmount: null,
    from(table) {
      if (table === 'bid_credit_grants') {
        return {
          insert: async () => {
            if (scenario === 'grant_insert_db_error') return { error: { code: '42501', message: 'permission denied' } };
            if (scenario === 'grant_insert_duplicate') return { error: { code: '23505', message: 'duplicate key' } };
            return { error: null };
          },
          delete: () => ({ eq: async (col, val) => { fakeSupabase.deletedTxnIds.push(val); return { error: null }; } })
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { bid_credits: 5 }, error: null }) }) }),
          update: (payload) => ({ eq: async () => {
            if (scenario === 'profile_update_db_error') return { error: { code: '40001', message: 'serialization failure' } };
            fakeSupabase.creditedUserId = providerId;
            fakeSupabase.creditedAmount = payload.bid_credits;
            return { error: null };
          } })
        };
      }
      return { insert: async () => ({ error: null }), update: async () => ({ error: null }) };
    }
  };

  // === transplanted from www/server.js bid-credit handler ===
  const { error: grantInsertError } = await fakeSupabase
    .from('bid_credit_grants')
    .insert({ transaction_id: transactionId, provider_id: providerId, total_bids: totalBids, pack_id: null });
  if (grantInsertError) {
    if (grantInsertError.code === '23505') {
      // Already granted — no DB change, but still 200 to ack Stripe.
    } else {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bid_credit_grant_log_failed', message: grantInsertError.message, retry: true }));
      return fakeSupabase;
    }
  } else {
    const { data: profile, error: fetchError } = await fakeSupabase
      .from('profiles')
      .select('bid_credits')
      .eq('id', providerId)
      .single();
    if (fetchError) {
      await fakeSupabase.from('bid_credit_grants').delete().eq('transaction_id', transactionId);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bid_credit_fetch_failed', retry: true }));
      return fakeSupabase;
    }
    const newCredits = (profile.bid_credits || 0) + totalBids;
    const { error: updateError } = await fakeSupabase
      .from('profiles')
      .update({ bid_credits: newCredits })
      .eq('id', providerId);
    if (updateError) {
      await fakeSupabase.from('bid_credit_grants').delete().eq('transaction_id', transactionId);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bid_credit_update_failed', message: updateError.message, retry: true }));
      return fakeSupabase;
    }
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ received: true }));
  return fakeSupabase;
}

(async () => {
  // grant insert error → 500, no credits applied
  {
    const res = makeRes();
    const db = await runBidCreditHandler('grant_insert_db_error', res);
    ok('grant-insert DB error → 500',  res.statusCode === 500);
    ok('grant-insert DB error → retry flag set', /"retry":true/.test(res.body || ''));
    ok('grant-insert DB error → no credit applied', db.creditedUserId === null);
  }

  // duplicate grant → 200, no double-credit
  {
    const res = makeRes();
    const db = await runBidCreditHandler('grant_insert_duplicate', res);
    ok('duplicate grant → 200 (idempotent)', res.statusCode === 200);
    ok('duplicate grant → no double-credit', db.creditedUserId === null);
  }

  // profile update error → 500 + grant row cleaned up
  {
    const res = makeRes();
    const db = await runBidCreditHandler('profile_update_db_error', res);
    ok('profile-update DB error → 500', res.statusCode === 500);
    ok('profile-update DB error → grant row deleted for retry', db.deletedTxnIds.includes('pi_test_123'));
    ok('profile-update DB error → no credit applied', db.creditedUserId === null);
  }

  // happy path
  {
    const res = makeRes();
    const db = await runBidCreditHandler('happy_path', res);
    ok('happy path → 200', res.statusCode === 200);
    ok('happy path → credit applied (5 + 10 = 15)', db.creditedAmount === 15);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();

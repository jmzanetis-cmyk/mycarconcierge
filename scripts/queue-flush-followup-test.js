#!/usr/bin/env node

// ─────────────────────────────────────────────────────────────────────────────
// Task #306 — regression test: confirm sendMessage does NOT skip valid
// follow-up sends to leads with status='contacted' or status='responded'
// when sequence_step >= 2. A previous round of #306 fixes over-broadly
// treated those statuses as permanent dead-ends, which broke
// runFollowUpDrafts() (which intentionally targets `status='contacted'`
// to send step 2 / step 3 follow-ups).
//
// Asserts:
//   1. status='contacted' + sequence_step=1 → still skipped (duplicate first touch)
//   2. status='contacted' + sequence_step=2 → NOT skipped (valid follow-up)
//   3. status='responded'  + sequence_step=2 → NOT skipped (valid follow-up)
//   4. status='unsubscribed' (any step)     → still skipped (always dead)
//
// Run from project root:
//   node scripts/queue-flush-followup-test.js
// Exit codes: 0 all passed, 1 any check failed.
// ─────────────────────────────────────────────────────────────────────────────

const { sendMessage } = require('../netlify/functions/outreach-engine-core');

let failed = 0;
function assert(cond, label) {
  if (!cond) { console.error('  ✗ FAIL:', label); failed++; }
  else { console.log('  ✓', label); }
}

// Minimal mock supabase that records updates and returns canned select results.
function mockSupabase({ leadStatus, sequenceStep }) {
  const updates = [];
  const inserts = [];
  return {
    _updates: updates,
    _inserts: inserts,
    from(table) {
      return {
        select() {
          return {
            eq() { return this; },
            single: async () => ({
              data: {
                id: 'msg-1',
                status: 'approved',
                sequence_step: sequenceStep,
                channel: 'email',
                lead_id: 'lead-1',
                outreach_leads: {
                  id: 'lead-1',
                  status: leadStatus,
                  email: 'test@example.com',
                  phone: null,
                  name: 'Test Lead',
                  crm_sync_status: null
                }
              }
            })
          };
        },
        update(payload) {
          return {
            eq: async () => { updates.push({ table, payload }); return { error: null }; }
          };
        },
        insert: async (payload) => { inserts.push({ table, payload }); return { error: null }; }
      };
    }
  };
}

async function runCase(label, opts, expectSkipped) {
  console.log(`\n${label}`);
  const sb = mockSupabase(opts);
  let result;
  try {
    result = await sendMessage(sb, 'msg-1');
  } catch (err) {
    // sendMessage may throw further down (e.g. trying to call Resend) once it
    // gets past the skip check. That's fine — the question we're testing is
    // whether the skip path was taken, which we detect via the message-status
    // update payload.
    result = { error: err.message };
  }
  const skippedUpdate = sb._updates.find(u => u.table === 'outreach_messages' && u.payload.status === 'skipped');
  if (expectSkipped) {
    assert(!!skippedUpdate, 'message marked status=skipped');
    assert(result?.skipped === true, 'sendMessage returned skipped:true');
  } else {
    assert(!skippedUpdate, 'message NOT marked skipped (passed through to send path)');
    assert(result?.skipped !== true, 'sendMessage did not return skipped:true');
  }
}

(async () => {
  await runCase('Test 1: contacted + step 1 → skipped (duplicate first touch)',
    { leadStatus: 'contacted', sequenceStep: 1 }, true);
  await runCase('Test 2: contacted + step 2 → NOT skipped (valid follow-up)',
    { leadStatus: 'contacted', sequenceStep: 2 }, false);
  await runCase('Test 3: responded + step 2 → NOT skipped (valid follow-up)',
    { leadStatus: 'responded', sequenceStep: 2 }, false);
  await runCase('Test 4: unsubscribed (any step) → skipped (always dead)',
    { leadStatus: 'unsubscribed', sequenceStep: 2 }, true);
  await runCase('Test 5: bounced (any step) → skipped (always dead)',
    { leadStatus: 'bounced', sequenceStep: 3 }, true);

  console.log(`\nDone. ${failed === 0 ? 'All cases passed.' : failed + ' failures.'}`);
  process.exit(failed === 0 ? 0 : 1);
})();

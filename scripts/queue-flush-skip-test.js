#!/usr/bin/env node

// ─────────────────────────────────────────────────────────────────────────────
// Task #306 — regression test for the outreach queue-flush stall.
//
// Before #306, sendMessage early-returned without any DB update when the lead
// was unsubscribed / bounced / already contacted / had no contact method.
// The queue-flush then picked the same oldest 15 dead messages every cycle
// forever, and the queue never drained.
//
// This test exercises sendMessage against an in-memory mock Supabase for each
// of those conditions and asserts that the message is now flipped to
// status='skipped' and that an outreach_activity_log row of event_type
// 'send_skipped' is written with a structured reason. It also verifies that
// transient errors (daily limit reached) still leave the message 'approved'
// so it gets retried next cycle.
//
// Run from project root:
//   node scripts/queue-flush-skip-test.js
//
// Exit codes: 0 all passed, 1 any check failed.
// ─────────────────────────────────────────────────────────────────────────────

const { sendMessage } = require('../netlify/functions/outreach-engine-core');

function assert(cond, label) {
  if (!cond) {
    console.error('  ✗ FAIL:', label);
    process.exitCode = 1;
  } else {
    console.log('  ✓', label);
  }
}

// Build a mock Supabase client that lets us pre-load a message + lead, then
// records every update / insert so the test can assert the final state.
function makeMockSupabase({ message, lead, sentToday = 0 }) {
  const messages = new Map();
  if (message) messages.set(message.id, { ...message });
  const activityLog = [];
  const updatesByTable = { outreach_messages: [], outreach_leads: [], engine_state: [] };

  function from(table) {
    if (table === 'outreach_messages') {
      return makeMessageQuery();
    }
    if (table === 'outreach_activity_log') {
      return {
        insert(row) {
          activityLog.push(row);
          return Promise.resolve({ data: row, error: null });
        }
      };
    }
    if (table === 'outreach_leads') {
      return {
        update(patch) {
          return {
            eq() {
              updatesByTable.outreach_leads.push(patch);
              return Promise.resolve({ data: null, error: null });
            }
          };
        }
      };
    }
    if (table === 'engine_state') {
      return {
        select() {
          return {
            eq() {
              return {
                single: async () => ({ data: { total_messages_sent: 0 }, error: null })
              };
            }
          };
        },
        update(patch) {
          return {
            eq() {
              updatesByTable.engine_state.push(patch);
              return Promise.resolve({ data: null, error: null });
            }
          };
        }
      };
    }
    throw new Error('Unexpected table: ' + table);
  }

  function makeMessageQuery() {
    let _filterId = null;
    let _filterStatus = null;
    let _isCount = false;
    return {
      select(_cols, opts) {
        if (opts && opts.head) _isCount = true;
        return this;
      },
      eq(col, val) {
        if (col === 'id') _filterId = val;
        if (col === 'status') _filterStatus = val;
        return this;
      },
      gte() { return this; },
      in() { return this; },
      single: async () => {
        const m = messages.get(_filterId);
        if (!m) return { data: null, error: { message: 'not found' } };
        const { lead_id: _, ...rest } = m;
        return { data: { ...rest, outreach_leads: lead }, error: null };
      },
      // Used for checkDailySendLimit — head:true count query.
      then: undefined,
      update(patch) {
        return {
          eq(col, val) {
            const target = messages.get(val);
            // CAS guard in markMessageSkipped chains a second .eq('status','approved')
            const second = {
              eq(col2, val2) {
                if (target && target.status === val2) {
                  Object.assign(target, patch);
                  updatesByTable.outreach_messages.push({ id: val, patch });
                }
                return Promise.resolve({ data: null, error: null });
              }
            };
            // If only one .eq is chained, apply the update unconditionally.
            // The caller may not chain .eq('status', ...).
            if (target) {
              Object.assign(target, patch);
              updatesByTable.outreach_messages.push({ id: val, patch });
            }
            return Object.assign(Promise.resolve({ data: null, error: null }), second);
          }
        };
      }
    };
  }

  // Stub the count query used by checkDailySendLimit so we can simulate
  // hitting the daily cap. checkDailySendLimit calls:
  //   supabase.from('outreach_messages').select('id', { count: 'exact', head: true })
  //     .eq('status', 'sent').gte('updated_at', ...)
  // Override `from('outreach_messages')` to return a count when select had head:true.
  const realFrom = from;
  return {
    from(t) {
      if (t !== 'outreach_messages') return realFrom(t);
      const q = realFrom(t);
      const origSelect = q.select.bind(q);
      q.select = function (cols, opts) {
        const r = origSelect(cols, opts);
        if (opts && opts.head) {
          // make .gte() terminal with a count
          const orig = r.gte.bind(r);
          r.gte = function () {
            orig();
            return Promise.resolve({ count: sentToday, error: null });
          };
        }
        return r;
      };
      return q;
    },
    _state: { messages, activityLog, updates: updatesByTable }
  };
}

function makeMessage(id, lead_id, channel = 'email') {
  return { id, lead_id, channel, status: 'approved', body: 'Hi [FIRST_NAME]', subject: 'Hello' };
}

(async () => {
  console.log('Task #306 — sendMessage skip behavior regression test\n');

  // Case 1: lead is missing (orphan message)
  {
    console.log('Case 1: orphan message (lead deleted)');
    const sb = makeMockSupabase({ message: makeMessage('m1', 'l-missing'), lead: null });
    const r = await sendMessage(sb, 'm1');
    assert(r.skipped === true, 'returns { skipped: true }');
    assert(sb._state.messages.get('m1').status === 'skipped', "message flipped to status='skipped'");
    assert(sb._state.activityLog.some(a => a.event_type === 'send_skipped' && a.metadata.reason === 'lead_missing'), "activity log: 'send_skipped' with reason=lead_missing");
  }

  // Case 2: lead has been contacted already (the dominant cause of the stall)
  {
    console.log('\nCase 2: lead.status = contacted');
    const sb = makeMockSupabase({
      message: makeMessage('m2', 'l2'),
      lead: { id: 'l2', status: 'contacted', email: 'a@b.com', phone: null, crm_sync_status: 'unlinked' }
    });
    const r = await sendMessage(sb, 'm2');
    assert(r.skipped === true, 'returns { skipped: true }');
    assert(sb._state.messages.get('m2').status === 'skipped', "message flipped to status='skipped'");
    assert(sb._state.activityLog.some(a => a.event_type === 'send_skipped' && a.metadata.reason === 'lead_contacted'), "activity log: reason=lead_contacted");
  }

  // Case 3: lead has no email (email-channel message) — the literal first 30
  // queued messages in prod were all in this state.
  {
    console.log('\nCase 3: email channel, lead has no email');
    const sb = makeMockSupabase({
      message: makeMessage('m3', 'l3', 'email'),
      lead: { id: 'l3', status: 'new', email: null, phone: '555-0000', crm_sync_status: 'unlinked' }
    });
    const r = await sendMessage(sb, 'm3');
    assert(r.skipped === true, 'returns { skipped: true }');
    assert(sb._state.messages.get('m3').status === 'skipped', "message flipped to status='skipped'");
    assert(sb._state.activityLog.some(a => a.event_type === 'send_skipped' && a.metadata.reason === 'no_email_contact'), "activity log: reason=no_email_contact");
  }

  // Case 4: lead.status = unsubscribed
  {
    console.log('\nCase 4: lead.status = unsubscribed');
    const sb = makeMockSupabase({
      message: makeMessage('m4', 'l4'),
      lead: { id: 'l4', status: 'unsubscribed', email: 'x@y.com', phone: null, crm_sync_status: 'unlinked' }
    });
    const r = await sendMessage(sb, 'm4');
    assert(r.skipped === true, 'returns { skipped: true }');
    assert(sb._state.messages.get('m4').status === 'skipped', "message flipped to status='skipped'");
    assert(sb._state.activityLog.some(a => a.metadata.reason === 'lead_unsubscribed'), 'activity log: reason=lead_unsubscribed');
  }

  // Case 5: CRM duplicate
  {
    console.log('\nCase 5: lead.crm_sync_status = duplicate');
    const sb = makeMockSupabase({
      message: makeMessage('m5', 'l5'),
      lead: { id: 'l5', status: 'new', email: 'a@b.com', phone: null, crm_sync_status: 'duplicate' }
    });
    const r = await sendMessage(sb, 'm5');
    assert(r.skipped === true, 'returns { skipped: true }');
    assert(sb._state.messages.get('m5').status === 'skipped', "message flipped to status='skipped'");
    assert(sb._state.activityLog.some(a => a.metadata.reason === 'lead_crm_duplicate'), 'activity log: reason=lead_crm_duplicate');
  }

  // Case 6: TRANSIENT — daily limit reached. Message must STAY 'approved' so
  // the next cycle retries it. This guards against over-skipping.
  {
    console.log('\nCase 6: transient — daily send limit reached (must NOT skip)');
    const sb = makeMockSupabase({
      message: makeMessage('m6', 'l6'),
      lead: { id: 'l6', status: 'new', email: 'a@b.com', phone: null, crm_sync_status: 'unlinked' },
      sentToday: 99999 // way above MAX_DAILY_SENDS
    });
    const r = await sendMessage(sb, 'm6');
    assert(r.skipped !== true, 'does NOT return skipped:true');
    assert(/Daily send limit/.test(r.error || ''), 'returns Daily send limit error');
    assert(sb._state.messages.get('m6').status === 'approved', "message stays status='approved' for retry");
    assert(!sb._state.activityLog.some(a => a.event_type === 'send_skipped'), 'no send_skipped activity row');
  }

  console.log('\nDone.');
  if (process.exitCode === 1) {
    console.error('\nOne or more cases failed.');
  } else {
    console.log('\nAll cases passed.');
  }
})().catch(err => {
  console.error('Test crashed:', err);
  process.exit(1);
});

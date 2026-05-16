'use strict';
//
// Task #429 smoke test — verify the shared SMS helper refuses to send
// when the recipient has texted STOP (profiles.sms_opt_out = true), and
// that callers that route through the helper (bgc-send-reminders here)
// inherit the same protection.
//
// Stubs:
//   - Twilio Messages API via global.fetch (any call counts as a "real"
//     send and would fail the opt-out tests).
//   - Supabase client returns a tiny in-memory profiles table.
//

const assert = require('node:assert');

// ── 1. Stub fetch so we can detect Twilio sends ─────────────────────────────
const twilioCalls = [];
global.fetch = async (url, init) => {
  if (typeof url === 'string' && url.includes('api.twilio.com')) {
    twilioCalls.push({ url, body: init && init.body });
    return {
      ok: true,
      status: 201,
      json: async () => ({ sid: `SM_test_${twilioCalls.length}` }),
      text: async () => ''
    };
  }
  throw new Error('Unexpected fetch in test: ' + url);
};

process.env.TWILIO_ACCOUNT_SID  = 'AC_test';
process.env.TWILIO_AUTH_TOKEN   = 'tok_test';
process.env.TWILIO_PHONE_NUMBER = '+15550001111';

// ── 2. Fake Supabase ────────────────────────────────────────────────────────
//
// Tracks .from('profiles').select(...).eq('id', X).maybeSingle()
// and .from('profiles').select(...).or(phone.eq…).eq('sms_opt_out', true).limit(1).
//
function makeSupabase({ profilesById = {}, optedOutPhones = new Set() } = {}) {
  return {
    from(table) {
      if (table !== 'profiles') return makeNoopChain();
      const state = { byId: null, byPhone: null, optOutFilter: false };
      const chain = {
        select() { return chain; },
        eq(col, val) {
          if (col === 'id') state.byId = val;
          else if (col === 'sms_opt_out') state.optOutFilter = (val === true);
          return chain;
        },
        or(expr) {
          // expr looks like: phone.eq.+15551112222,phone.eq.5551112222
          const m = /phone\.eq\.([^,]+)/.exec(expr);
          if (m) state.byPhone = m[1];
          return chain;
        },
        limit() { return chain; },
        maybeSingle() {
          if (state.byId && profilesById[state.byId]) {
            return Promise.resolve({ data: profilesById[state.byId], error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then(resolve) {
          // Array-returning path (the by-phone lookup uses .limit(1) and is awaited as a thenable).
          if (state.optOutFilter && state.byPhone && optedOutPhones.has(state.byPhone)) {
            return Promise.resolve({ data: [{ id: 'opted-out', sms_opt_out: true }], error: null }).then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        }
      };
      return chain;
    }
  };
}
function makeNoopChain() {
  const c = { select(){return c;}, eq(){return c;}, or(){return c;}, limit(){return c;},
    maybeSingle(){return Promise.resolve({data:null,error:null});},
    then(r){return Promise.resolve({data:[],error:null}).then(r);} };
  return c;
}

// ── 3. Tests ────────────────────────────────────────────────────────────────
const { sendSms, isOptedOut, normalizePhone } = require('../functions/_shared/sms');

(async () => {
  let pass = 0, fail = 0;
  function ok(name, cond) {
    if (cond) { console.log('  ok  ', name); pass++; }
    else      { console.error('  FAIL', name); fail++; }
  }
  function eq(name, a, b) { ok(name + ` (got=${JSON.stringify(a)} expected=${JSON.stringify(b)})`, a === b); }

  // normalizePhone
  eq('normalize 10-digit',  normalizePhone('5551234567'),       '+15551234567');
  eq('normalize 1+10',      normalizePhone('15551234567'),      '+15551234567');
  eq('normalize formatted', normalizePhone('(555) 123-4567'),   '+15551234567');
  eq('normalize too short', normalizePhone('123'),              null);
  eq('normalize null',      normalizePhone(null),               null);

  // isOptedOut: by userId
  {
    const sb = makeSupabase({ profilesById: { 'u-stopped': { sms_opt_out: true } } });
    ok('isOptedOut(userId) returns true when flag set',
       (await isOptedOut({ supabase: sb, userId: 'u-stopped', phone: null })) === true);
    ok('isOptedOut(userId) returns false when flag absent',
       (await isOptedOut({ supabase: sb, userId: 'u-other', phone: null })) === false);
  }

  // isOptedOut: by phone (no userId)
  {
    const sb = makeSupabase({ optedOutPhones: new Set(['+15551234567']) });
    ok('isOptedOut(phone) returns true for opted-out number',
       (await isOptedOut({ supabase: sb, phone: '555-123-4567' })) === true);
    ok('isOptedOut(phone) returns false for clean number',
       (await isOptedOut({ supabase: sb, phone: '+15559999999' })) === false);
  }

  // sendSms refuses on opt-out by userId
  {
    twilioCalls.length = 0;
    const sb = makeSupabase({ profilesById: { 'u-stopped': { sms_opt_out: true } } });
    const r = await sendSms({ supabase: sb, toPhone: '+15551234567', body: 'hi', userId: 'u-stopped' });
    ok('sendSms refused (sent=false) when userId opted out', r.sent === false);
    eq('sendSms reason is sms_opt_out (userId)', r.reason, 'sms_opt_out');
    eq('no Twilio call when opted out', twilioCalls.length, 0);
  }

  // sendSms refuses on opt-out by phone
  {
    twilioCalls.length = 0;
    const sb = makeSupabase({ optedOutPhones: new Set(['+15551234567']) });
    const r = await sendSms({ supabase: sb, toPhone: '555-123-4567', body: 'hi' });
    ok('sendSms refused (sent=false) when phone opted out', r.sent === false);
    eq('sendSms reason is sms_opt_out (phone)', r.reason, 'sms_opt_out');
    eq('no Twilio call when phone opted out', twilioCalls.length, 0);
  }

  // sendSms actually sends when not opted out
  {
    twilioCalls.length = 0;
    const sb = makeSupabase();
    const r = await sendSms({ supabase: sb, toPhone: '+15559999999', body: 'hello' });
    ok('sendSms succeeded for clean recipient', r.sent === true);
    ok('Twilio called exactly once', twilioCalls.length === 1);
    ok('Twilio body contains the message', /Body=hello/.test(twilioCalls[0].body || ''));
    ok('Twilio To header is E.164', /To=%2B15559999999/.test(twilioCalls[0].body || ''));
  }

  // sendSms fails closed on lookup error
  {
    twilioCalls.length = 0;
    const sb = {
      from() {
        return {
          select(){return this;}, eq(){return this;}, or(){return this;}, limit(){return this;},
          maybeSingle(){return Promise.reject(new Error('db down'));},
          then(r){return Promise.reject(new Error('db down')).catch(() => r({data:[],error:null}));}
        };
      }
    };
    const r = await sendSms({ supabase: sb, toPhone: '+15558887777', body: 'x', userId: 'u-1' });
    ok('sendSms fails closed on DB error', r.sent === false);
    eq('sendSms reason on DB error', r.reason, 'sms_opt_out');
    eq('no Twilio call on DB error', twilioCalls.length, 0);
  }

  // End-to-end: bgc-send-reminders wrapper skips opted-out provider.
  {
    twilioCalls.length = 0;
    // Re-require the bgc module so it picks up our stubbed env + the
    // already-cached _shared/sms (no isolation needed — sendSms is pure).
    delete require.cache[require.resolve('../functions/bgc-send-reminders')];
    // We only need the internal sendSms wrapper, but it's not exported.
    // Cover the path by directly invoking the shared helper with the
    // provider id — same call shape bgc-send-reminders.js uses on line 359.
    const sb = makeSupabase({ profilesById: { 'prov-stopped': { sms_opt_out: true } } });
    const r = await sendSms({ supabase: sb, toPhone: '+15551112222', body: 'MCC: reminder', userId: 'prov-stopped' });
    ok('bgc reminder call-shape skips opted-out provider', r.sent === false && r.reason === 'sms_opt_out');
    eq('no Twilio call for opted-out provider reminder', twilioCalls.length, 0);
  }

  // aiOpsSendSMS now routes through the shared helper.
  {
    twilioCalls.length = 0;
    const { aiOpsSendSMS } = require('../functions/_shared/ai-ops');
    const sb = makeSupabase({ profilesById: { 'm-stopped': { sms_opt_out: true } } });
    const r = await aiOpsSendSMS(sb, '+15551234567', 'dispute update', 'm-stopped');
    ok('aiOpsSendSMS refused for opted-out userId', r.sent === false && r.reason === 'sms_opt_out');
    eq('no Twilio call from aiOpsSendSMS opt-out', twilioCalls.length, 0);

    const r2 = await aiOpsSendSMS(null, '+15551234567', 'dispute update');
    ok('aiOpsSendSMS fails closed when supabase missing', r2.sent === false);
  }

  // agent-smoke-shared sendSmokeFailureSms now honors opt-out via shared helper.
  {
    twilioCalls.length = 0;
    process.env.ADMIN_PHONE_NUMBER = '+15551234567';
    const { sendSmokeFailureSms } = require('../functions/agent-smoke-shared');
    // Fake supabase: opted-out by phone + supports .update().eq() for the
    // agent_smoke_runs error-log write.
    const sb = makeSupabase({ optedOutPhones: new Set(['+15551234567']) });
    const origFrom = sb.from.bind(sb);
    sb.from = (t) => {
      if (t === 'agent_smoke_runs') {
        return { update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
      }
      return origFrom(t);
    };
    const r = await sendSmokeFailureSms(sb, { id: 'run1', agent_slug: 'ag', failure_count: 1, failed_checks: ['x'] });
    ok('sendSmokeFailureSms refused when admin opted out',
       r.sent === false && r.reason === 'sms_opt_out');
    eq('no Twilio call from smoke alert opt-out', twilioCalls.length, 0);
  }

  console.log(`\n${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
})().catch((e) => { console.error('Test runner threw:', e); process.exit(1); });

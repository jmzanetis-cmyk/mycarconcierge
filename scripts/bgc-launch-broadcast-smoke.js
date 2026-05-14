#!/usr/bin/env node
 
// ─────────────────────────────────────────────────────────────────────────────
// Task #164 — Offline smoke test for `scripts/send-bgc-launch-broadcast.js`.
//
// Stubs `@supabase/supabase-js` and global `fetch` so the broadcast runs
// against an in-memory dataset and a counting Resend mock — no network,
// no DB, no Resend credits.
//
// Run from project root:
//   node scripts/bgc-launch-broadcast-smoke.js
//
// Exit codes: 0 all passed, 1 any check failed.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('node:path');
const Module = require('module');

let pass = 0;
let fail = 0;
function ok(msg)  { pass++; console.log('  ✓', msg); }
function bad(msg) { fail++; console.error('  ✗', msg); }
function expect(cond, msg) { cond ? ok(msg) : bad(msg); }

// ----------------------------- Fixture --------------------------------------
const fixture = {
  profiles: [
    { id: 'u-mem-1',  email: 'amy@example.test',     first_name: 'Amy',   role: 'member' },
    { id: 'u-mem-2',  email: 'bob@example.test',     first_name: 'Bob',   role: 'member' },
    { id: 'u-mem-3',  email: 'cat@example.test',     first_name: 'Cat',   role: 'pending_member' },
    { id: 'u-mem-4',  email: 'optout@example.test',  first_name: 'Opt',   role: 'member' },
    { id: 'u-mem-5',  email: 'amy@example.test',     first_name: 'Amy2',  role: 'member' },          // duplicate
    { id: 'u-mem-6',  email: 'bounced@example.test', first_name: 'Bnc',   role: 'member' },
    { id: 'u-mem-7',  email: 'unsub@example.test',   first_name: 'Uns',   role: 'member' },
    { id: 'u-mem-8',  email: 'oldie@example.test',   first_name: 'Old',   role: 'member' },          // already sent
    { id: 'u-mem-9',  email: '',                     first_name: 'NoMail',role: 'member' },
    { id: 'u-mem-10', email: 'badformat',            first_name: 'Bad',   role: 'member' },

    { id: 'u-pro-1', email: 'shop@example.test',  business_name: 'Acme Garage', full_name: 'Acme Owner', role: 'provider' },
    { id: 'u-pro-2', email: 'pend@example.test',  business_name: '',            full_name: 'Pending Pat', role: 'pending_provider' },
    { id: 'u-pro-3', email: 'fail@example.test',  business_name: 'Fail Co',     role: 'provider' },        // simulated failure
    { id: 'u-pro-4', email: 'unsub@example.test', business_name: 'Skipme',      role: 'provider' },        // suppression

    { id: 'u-x-1', email: 'admin@example.test', role: 'admin' },                                            // ignored
  ],
  member_notification_preferences: [
    { member_id: 'u-mem-4', marketing_emails: false }
  ],
  outreach_leads: [
    { email: 'bounced@example.test', status: 'bounced' }
  ],
  email_unsubscribes: [
    { email: 'unsub@example.test' }
  ],
  bgc_launch_email_sends: [
    { audience: 'customer', email: 'oldie@example.test', status: 'sent' }
  ]
};

// ----------------------------- Supabase stub --------------------------------
function applyOps(rows, ops, columns) {
  let out = rows.slice();
  for (const op of ops) {
    if (op.kind === 'eq')         out = out.filter(r => String(r[op.col]) === String(op.val));
    else if (op.kind === 'neq')   out = out.filter(r => String(r[op.col]) !== String(op.val));
    else if (op.kind === 'in')    out = out.filter(r => op.val.includes(r[op.col]));
    else if (op.kind === 'gt')    out = out.filter(r => r[op.col] != null && r[op.col] > op.val);
    else if (op.kind === 'notNull') out = out.filter(r => r[op.col] != null && r[op.col] !== '');
    else if (op.kind === 'order') out.sort((a, b) => (a[op.col] > b[op.col] ? 1 : -1));
    else if (op.kind === 'range') out = out.slice(op.from, op.to + 1);
  }
  if (columns && columns !== '*') {
    const cols = columns.split(',').map(s => s.trim());
    out = out.map(r => { const o = {}; for (const c of cols) o[c] = r[c]; return o; });
  }
  return out;
}

const inserted = { bgc_launch_email_sends: [] };

// SelectQuery extends Promise so `await query` works through the inherited
// Promise.prototype.then — there is no own `then` property on the object,
// which is what Sonar's S4123 cares about. Each chain method returns a fresh
// SelectQuery with the new op appended; the previous instance still resolves
// (microtask) but is unobserved.
class SelectQuery extends Promise {
  static get [Symbol.species]() { return Promise; }
  constructor(table, ops, columns) {
    super((resolve) => {
      queueMicrotask(() => resolve({
        data: applyOps(fixture[table] || [], ops, columns),
        error: null
      }));
    });
    this._table = table;
    this._ops = ops;
    this._columns = columns;
  }
  _next(op)         { return new SelectQuery(this._table, [...this._ops, op], this._columns); }
  select(c)         { return new SelectQuery(this._table, this._ops, c); }
  eq(col, val)      { return this._next({ kind: 'eq', col, val }); }
  neq(col, val)     { return this._next({ kind: 'neq', col, val }); }
  in(col, val)      { return this._next({ kind: 'in', col, val }); }
  gt(col, val)      { return this._next({ kind: 'gt', col, val }); }
  not(col, _op, val){ return val === null ? this._next({ kind: 'notNull', col }) : this; }
  order(col)        { return this._next({ kind: 'order', col }); }
  range(from, to)   { return this._next({ kind: 'range', from, to }); }
  limit(_n)         { return this; }
}

function makeQuery(table) {
  return {
    select(c) { return new SelectQuery(table, [], c); },
    insert(row) {
      const rows = Array.isArray(row) ? row : [row];
      if (!inserted[table]) inserted[table] = [];
      inserted[table].push(...rows);
      return Promise.resolve({ data: rows, error: null });
    },
    upsert(row) {
      const rows = Array.isArray(row) ? row : [row];
      if (!fixture[table]) fixture[table] = [];
      fixture[table].push(...rows);
      return Promise.resolve({ data: rows, error: null });
    },
    update() {
      return { eq: () => Promise.resolve({ data: null, error: null }) };
    }
  };
}

const supabaseStub = { from: makeQuery };

// Hijack require('@supabase/supabase-js') so the broadcast script picks up our stub.
require.cache[require.resolve('@supabase/supabase-js')] = {
  id: require.resolve('@supabase/supabase-js'),
  filename: require.resolve('@supabase/supabase-js'),
  loaded: true,
  exports: { createClient: () => supabaseStub }
};

// ----------------------------- fetch stub -----------------------------------
const sentByResend = [];
let resendIdCounter = 0;
globalThis.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body || '{}');
  if (body.to === 'fail@example.test') {
    return { ok: false, status: 422, text: async () => JSON.stringify({ message: 'Invalid recipient' }) };
  }
  resendIdCounter++;
  const id = `resend-${resendIdCounter}`;
  sentByResend.push({ url, body, id });
  return { ok: true, status: 200, text: async () => JSON.stringify({ id }) };
};

// ----------------------------- Run the broadcast ----------------------------
process.env.SUPABASE_URL = 'https://stub';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';
process.env.RESEND_API_KEY = 'stub';
process.env.PUBLIC_BASE_URL = 'https://test.example';
// Force --rate to 1000 so the throttle barely sleeps.
process.argv = ['node', path.join(__dirname, 'send-bgc-launch-broadcast.js'), '--rate=1000'];

const broadcaster = require(path.join(__dirname, 'send-bgc-launch-broadcast.js'));

(async () => {
  await broadcaster.main();

  // ------------------------- Assertions ------------------------------------
  console.log('\nAssertions:');

  const customerSends = sentByResend.filter(s => s.body.headers && s.body.headers['X-MCC-Broadcast'] === 'bgc-launch-customer');
  const providerSends = sentByResend.filter(s => s.body.headers && s.body.headers['X-MCC-Broadcast'] === 'bgc-launch-provider');

  const customerEmails = customerSends.map(s => s.body.to).sort((a, b) => a.localeCompare(b));
  const providerEmailsArr = providerSends.map(s => s.body.to).sort((a, b) => a.localeCompare(b));
  const providerEmailsSet = new Set(providerEmailsArr);

  expect(customerEmails.includes('amy@example.test'), 'customer audience: member sent');
  expect(customerEmails.includes('bob@example.test'), 'customer audience: member sent');
  expect(customerEmails.includes('cat@example.test'), 'customer audience: pending_member sent');

  expect(!customerEmails.includes('admin@example.test'),   'customer audience: admin role excluded');
  expect(!customerEmails.includes('optout@example.test'),  'customer audience: marketing opt-out excluded');
  expect(!customerEmails.includes('unsub@example.test'),   'customer audience: global suppression excluded');
  expect(!customerEmails.includes('bounced@example.test'), 'customer audience: outreach bounced excluded');
  expect(!customerEmails.includes('oldie@example.test'),   'customer audience: previously-sent excluded (dedupe)');
  expect(!customerEmails.includes('badformat'),            'customer audience: invalid email excluded');

  const amyCount = customerEmails.filter(e => e === 'amy@example.test').length;
  expect(amyCount === 1, 'customer audience: duplicate email collapsed to one send');

  const amyHtml = customerSends.find(s => s.body.to === 'amy@example.test').body.html;
  expect(/Hi Amy,/.test(amyHtml),                                                                   'customer template: first_name merged');
  expect(/href="https:\/\/test\.example\/providers-directory\.html\?verified=true"/.test(amyHtml),  'customer template: browse_url merged');
  expect(/href="https:\/\/test\.example\/unsubscribe\?email=amy/.test(amyHtml),                     'customer template: unsubscribe_url merged');
  expect(!/\{\{[^}]+\}\}/.test(amyHtml),                                                            'customer template: no unrendered placeholders');

  expect(providerEmailsSet.has('shop@example.test'), 'provider audience: provider sent');
  expect(providerEmailsSet.has('pend@example.test'), 'provider audience: pending_provider sent');
  expect(!providerEmailsSet.has('unsub@example.test'), 'provider audience: global suppression excluded');

  const shopHtml = providerSends.find(s => s.body.to === 'shop@example.test').body.html;
  expect(/Hi Acme Garage,/.test(shopHtml),                                                              'provider template: business_name used as provider_name');
  expect(/href="https:\/\/test\.example\/providers\.html#bgc-state-card"/.test(shopHtml),               'provider template: get_verified_url merged');

  const pendHtml = providerSends.find(s => s.body.to === 'pend@example.test').body.html;
  expect(/Hi Pending Pat,/.test(pendHtml), 'provider template: full_name fallback when business_name is empty');

  expect(sentByResend.every(s => (s.body.headers || {})['List-Unsubscribe']), 'every send carries a List-Unsubscribe header');
  expect(sentByResend.every(s => (s.body.headers || {})['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click'), 'every send carries List-Unsubscribe-Post one-click');

  const sentRows = (inserted.bgc_launch_email_sends || []).filter(r => r.status === 'sent');
  const failedRows = (inserted.bgc_launch_email_sends || []).filter(r => r.status === 'failed');
  expect(sentRows.length === sentByResend.length, 'one bgc_launch_email_sends row per Resend send');
  expect(sentRows.every(r => r.resend_message_id && r.resend_message_id.startsWith('resend-')), 'every sent row carries the Resend message id');

  const failRow = failedRows.find(r => r.email === 'fail@example.test');
  expect(!!failRow,                                                       'fail@example.test recorded as failed (not sent)');
  expect(!providerSends.some(s => s.body.to === 'fail@example.test'),     'failed recipient is not in send list');
  expect(failedRows.length >= 1 && sentRows.length >= 4,                  'failure did not abort the rest of the batch');

  // ------------------------- Dry-run pass ----------------------------------
  console.log('\nDry-run pass:');
  const sendsBefore = sentByResend.length;
  const insertsBefore = (inserted.bgc_launch_email_sends || []).length;
  process.argv = ['node', path.join(__dirname, 'send-bgc-launch-broadcast.js'), '--rate=1000', '--dry-run', '--audience=both'];
  await broadcaster.main();
  expect(sentByResend.length === sendsBefore,                                'dry-run: zero Resend HTTP calls');
  expect((inserted.bgc_launch_email_sends || []).length === insertsBefore,   'dry-run: zero send-log inserts');

  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(err => {
  console.error('FATAL:', err.stack || err.message || err);
  process.exit(1);
});

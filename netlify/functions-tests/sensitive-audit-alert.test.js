// ============================================================================
// Sensitive audit alert helper — smoke tests (Task #427)
// ============================================================================

'use strict';

const path = require('path');
const Module = require('module');

let testsRun = 0, testsFailed = 0;
async function run(name, fn) {
  testsRun++;
  try { await fn(); console.log(`✓ ${name}`); }
  catch (err) { testsFailed++; console.error(`✗ ${name}\n   ${err.stack || err.message}`); }
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${msg || 'eq failed'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function truthy(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }

// ── stubs ────────────────────────────────────────────────────────────────────

let emailCalls = [];
let slackCalls = [];

const origLoad = Module._load;
const fakeResend = {
  emails: {
    send: async (opts) => {
      emailCalls.push(opts);
      return { data: { id: 'fake' } };
    }
  }
};
const stubs = new Map();
stubs.set('resend', { Resend: function() { return fakeResend; } });

// Intercept global fetch for Slack webhook calls
const origFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).includes('slack')) {
    slackCalls.push({ url, body: opts?.body });
    return { ok: true, status: 200 };
  }
  return origFetch ? origFetch(url, opts) : { ok: false, status: 500 };
};

Module._load = function(request, parent, ...rest) {
  if (stubs.has(request)) return stubs.get(request);
  return origLoad.call(this, request, parent, ...rest);
};

process.env.RESEND_API_KEY = 'rk_test';
process.env.ADMIN_NOTIFICATION_EMAIL = 'admin@example.com';
process.env.MCC_FROM_EMAIL = 'noreply@mycarconcierge.com';

const { notifySensitiveAuditAction } = require(path.resolve(__dirname, '../functions/_shared/sensitive-audit-alert'));

async function main() {
  await run('sends email when RESEND_API_KEY and ADMIN_NOTIFICATION_EMAIL are set', async () => {
    emailCalls = [];
    await notifySensitiveAuditAction({
      action: 'suspend_provider',
      target: 'Acme Automotive',
      reason: 'Repeated no-shows',
      performedBy: 'admin'
    });
    eq(emailCalls.length, 1, 'expected 1 email sent');
    truthy(emailCalls[0].subject.toLowerCase().includes('suspend'), `subject: ${emailCalls[0].subject}`);
    eq(emailCalls[0].to, ['admin@example.com']);
  });

  await run('does not throw when RESEND_API_KEY is missing', async () => {
    emailCalls = [];
    const saved = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    await notifySensitiveAuditAction({ action: 'activate_provider', target: 'Test Provider' });
    eq(emailCalls.length, 0, 'no email when key absent');
    process.env.RESEND_API_KEY = saved;
  });

  await run('posts to Slack when ADMIN_SLACK_WEBHOOK_URL is set', async () => {
    slackCalls = [];
    process.env.ADMIN_SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    await notifySensitiveAuditAction({
      action: 'reject_provider_application',
      target: 'Big Auto Shop',
      reason: 'Failed background check',
      performedBy: 'admin'
    });
    eq(slackCalls.length, 1, 'expected 1 Slack call');
    const payload = JSON.parse(slackCalls[0].body);
    truthy(payload.text.includes('Rejected'), `payload: ${payload.text}`);
    delete process.env.ADMIN_SLACK_WEBHOOK_URL;
  });

  await run('skips Slack when ADMIN_SLACK_WEBHOOK_URL is absent', async () => {
    slackCalls = [];
    delete process.env.ADMIN_SLACK_WEBHOOK_URL;
    await notifySensitiveAuditAction({ action: 'approve_provider_application', target: 'Test' });
    eq(slackCalls.length, 0, 'no Slack call when URL absent');
  });

  await run('uses unknown action label gracefully', async () => {
    emailCalls = [];
    await notifySensitiveAuditAction({ action: 'custom_action', target: 'Someone' });
    eq(emailCalls.length, 1);
    truthy(emailCalls[0].subject.includes('custom_action'), `subject: ${emailCalls[0].subject}`);
  });

  console.log(`\n${testsRun - testsFailed}/${testsRun} passed`);
  Module._load = origLoad;
  global.fetch = origFetch;
  process.exit(testsFailed === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });

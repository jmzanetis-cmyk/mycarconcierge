// ============================================================================
// anthropic-health-scheduled smoke tests (Task #217)
//
// In-process tests for netlify/functions/anthropic-health-scheduled.js.
// Stubs the Anthropic SDK + global.fetch (Resend) + Supabase via a Proxy.
// No live network calls. Coverage:
//
//   1. Anonymous HTTP caller is rejected with 401 (no admin password).
//   2. All-models-pass run returns 200 and does NOT call Resend.
//   3. Any-model-fails run returns 500, emails admin, logs ai_action_log.
//   4. MODELS_IN_USE covers every claude-* literal grepped from production.
//
// Run with:  node netlify/functions-tests/anthropic-health.test.js
// ============================================================================

'use strict';

const assert = require('assert');
const { execSync } = require('child_process');
const path = require('path');

process.env.ADMIN_PASSWORD = 'test-admin-pass';
process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-key';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
process.env.RESEND_API_KEY = 'rs-test';
process.env.ADMIN_EMAIL = 'ops@example.test';
process.env.MCC_FROM_EMAIL = 'no-reply@example.test';

// ---- Stub @anthropic-ai/sdk via Module.prototype.require --------------------
// require.cache injection alone doesn't reliably intercept the real SDK once
// it's been resolved (or if the resolve path differs). Overriding require
// on the Module prototype guarantees the stub is returned.
let anthropicBehavior = {};
function FakeAnthropic() {
  return {
    messages: {
      create: async function ({ model }) {
        const b = anthropicBehavior[model];
        if (b && b.throw) {
          const err = new Error(b.throw.message || 'forced');
          err.status = b.throw.status || 404;
          err.error = { error: { type: b.throw.code || 'model_not_found', message: b.throw.message || 'forced' } };
          throw err;
        }
        return { id: 'msg_' + model, content: [{ text: 'ok' }] };
      }
    }
  };
}
FakeAnthropic.default = FakeAnthropic;
FakeAnthropic.Anthropic = FakeAnthropic;
const Module = require('module');
const _origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === '@anthropic-ai/sdk') return FakeAnthropic;
  return _origRequire.apply(this, arguments);
};

// ---- Stub agent-fleet-runtime so we don't need a real Supabase client -------
const aiActionLogRows = [];
require.cache[require.resolve('../functions/agent-fleet-runtime')] = {
  exports: {
    getSupabase: () => ({
      from(table) {
        return {
          insert(row) {
            if (table === 'ai_action_log') aiActionLogRows.push(row);
            return Promise.resolve({ data: null, error: null });
          }
        };
      }
    }),
    authorizeAgentInvocation(event) {
      const h = event.headers || {};
      if ((h['x-admin-password'] || '') === process.env.ADMIN_PASSWORD) return 'admin';
      // Mimic the scheduled-invocation path: no httpMethod + body has next_run.
      if (!event.httpMethod && event.body) {
        try {
          const b = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
          if (b && b.next_run) return 'scheduled';
        } catch {}
      }
      return null;
    },
    jsonResponse(statusCode, data) {
      return { statusCode, headers: {}, body: JSON.stringify(data) };
    }
  }
};

// ---- Stub global.fetch (Resend) --------------------------------------------
const fetchCalls = [];
global.fetch = async function (url, opts) {
  fetchCalls.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null });
  return { ok: true, status: 200, text: async () => '', json: async () => ({}) };
};

const mod = require('../functions/anthropic-health-scheduled');

(async () => {
  // 1. Anonymous HTTP caller rejected with 401.
  {
    const res = await mod.handler({ httpMethod: 'POST', headers: {}, body: '{}' });
    assert.strictEqual(res.statusCode, 401, 'anonymous caller must be 401');
    console.log('  ✓ anonymous HTTP caller is rejected with 401');
  }

  // 2. All models pass.
  {
    anthropicBehavior = {};
    aiActionLogRows.length = 0;
    fetchCalls.length = 0;
    const res = await mod.handler({
      httpMethod: 'POST',
      headers: { 'x-admin-password': process.env.ADMIN_PASSWORD },
      body: '{}'
    });
    assert.strictEqual(res.statusCode, 200, 'all-pass must be 200');
    const body = JSON.parse(res.body);
    assert.strictEqual(body.summary.ok, true);
    assert.strictEqual(body.summary.failure_count, 0);
    assert.strictEqual(body.email.sent, false);
    assert.strictEqual(body.email.reason, 'all_models_passed');
    assert.strictEqual(fetchCalls.length, 0, 'must not call Resend on success');
    assert.strictEqual(aiActionLogRows.length, 1, 'must log one passed row');
    assert.strictEqual(aiActionLogRows[0].outcome, 'passed');
    assert.strictEqual(aiActionLogRows[0].escalated, false);
    console.log('  ✓ all-models-pass returns 200 and does not email');
  }

  // 3. One model fails -> 500, email sent, ai_action_log records failure.
  {
    const failModel = mod._MODELS_IN_USE[0];
    anthropicBehavior = { [failModel]: { throw: { status: 404, code: 'model_not_found', message: 'model not found' } } };
    aiActionLogRows.length = 0;
    fetchCalls.length = 0;
    const res = await mod.handler({
      httpMethod: 'POST',
      headers: { 'x-admin-password': process.env.ADMIN_PASSWORD },
      body: '{}'
    });
    assert.strictEqual(res.statusCode, 500, 'failures must surface 500');
    const body = JSON.parse(res.body);
    assert.strictEqual(body.summary.ok, false);
    assert.strictEqual(body.summary.failure_count, 1);
    assert.strictEqual(body.summary.failed[0].model, failModel);
    assert.strictEqual(body.summary.failed[0].code, 'model_not_found');
    assert.strictEqual(body.email.sent, true);
    assert.strictEqual(fetchCalls.length, 1, 'must POST to Resend exactly once');
    assert.ok(/resend\.com\/emails$/.test(fetchCalls[0].url));
    assert.ok(/Anthropic model smoke FAILED/.test(fetchCalls[0].body.subject));
    assert.strictEqual(aiActionLogRows.length, 1);
    assert.strictEqual(aiActionLogRows[0].outcome, 'failed');
    assert.strictEqual(aiActionLogRows[0].escalated, true);
    assert.ok(aiActionLogRows[0].error_details, 'failed row must include error_details');
    console.log('  ✓ failing model returns 500, emails admin, logs failure');
  }

  // 4. Scheduled invocation (no httpMethod + next_run body) is accepted.
  {
    anthropicBehavior = {};
    const res = await mod.handler({ headers: {}, body: JSON.stringify({ next_run: '2026-01-01T00:00:00Z' }) });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.triggered_by, 'scheduled');
    console.log('  ✓ scheduled invocation is accepted');
  }

  // 5. MODELS_IN_USE covers every claude-* literal in production code.
  {
    const repoRoot = path.resolve(__dirname, '..', '..');
    // Match ANY claude-* literal (not just sonnet/opus/haiku) so future
    // family names (e.g. a new tier) can't slip past the drift guard.
    // Scan every production file under www/server.js + netlify/functions/
    // (only the smoke file itself is excluded so it doesn't count its own
    // MODELS_IN_USE entries; agent-fleet-runtime.js IS scanned because its
    // default-model literal — `agent.model || 'claude-sonnet-4-5'` — is a
    // real production call site, not just a pricing-table entry).
    const out = execSync(
      "rg --no-filename -o \"claude-[0-9a-z][0-9a-z-]*\" www/server.js netlify/functions/ -g '!*.test.js' -g '!anthropic-health-scheduled.js' | sort -u",
      { cwd: repoRoot, encoding: 'utf8' }
    );
    const found = out.split('\n').map(s => s.trim()).filter(Boolean);
    const declared = new Set(mod._MODELS_IN_USE);
    const foundSet = new Set(found);
    const stale = [...declared].filter(m => !foundSet.has(m));
    assert.deepStrictEqual(stale, [],
      'MODELS_IN_USE has stale entries no longer referenced in production code: ' + stale.join(', '));
    const missing = found.filter(m => !declared.has(m));
    assert.deepStrictEqual(missing, [],
      'MODELS_IN_USE is missing claude-* literals used in production: ' + missing.join(', '));
    console.log('  ✓ MODELS_IN_USE covers every claude-* literal in production (' + found.length + ' models)');
  }

  console.log('\nAll anthropic-health smoke tests passed.');
})().catch(err => {
  console.error(err);
  process.exit(1);
});

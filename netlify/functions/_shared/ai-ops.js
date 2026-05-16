// Shared AI Ops helpers used by Netlify Functions.
//
// History (Task #254): these four helpers (`logAiAction`, `aiOpsSendSMS`,
// `callAI`, `getAiOpsSettings`) were copy-pasted across `ai-ops-admin.js`,
// `payment-tracker-scheduled.js`, and `dispute-resolver-background.js`. The
// copies had already started to drift (e.g. `getAiOpsSettings` returned
// `maxRefund` in one file and `maxRefundCents` in another; `logAiAction`
// stringified `target_id` in one file but not the others). This module is the
// single source of truth so future changes to AI prompt/threshold logic land
// in one place.
//
// Bundling: Netlify uses esbuild (`node_bundler = "esbuild"` in
// `netlify.toml`), so this relative `require(...)` is inlined into each
// function bundle automatically — no `included_files` config is needed.
//
// Note: `www/server.js` keeps its own `aiOpsSendSMS` copy because the dev
// server is a long-lived Express process (not a per-request Netlify Function)
// and its variant returns a `reason` field that the dev-only callers depend
// on. See the comment near that function.

async function getAiOpsSettings(supabase) {
  const threshold = Number.parseFloat(process.env.AI_CONFIDENCE_THRESHOLD || '1.0');
  const maxRefund = Number.parseFloat(process.env.AI_MAX_AUTO_REFUND || '500');
  let resolvedThreshold = threshold;
  let resolvedMaxRefund = maxRefund;
  try {
    const { data: rows } = await supabase.from('ai_ops_settings').select('key,value');
    if (rows) {
      for (const r of rows) {
        if (r.key === 'confidence_threshold') {
          const parsed = Number.parseFloat(r.value);
          if (!Number.isNaN(parsed)) resolvedThreshold = parsed;
        }
        if (r.key === 'max_auto_refund') {
          const parsed = Number.parseFloat(r.value);
          if (!Number.isNaN(parsed)) resolvedMaxRefund = parsed;
        }
      }
    }
  } catch {}
  return {
    threshold: resolvedThreshold,
    maxRefund: resolvedMaxRefund,
    maxRefundCents: resolvedMaxRefund * 100,
  };
}

async function callAI(prompt, maxTokens = 512) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY_MCC_FLEET1 || process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] })
      });
      const data = await r.json();
      return { text: data.content?.[0]?.text || '' };
    } catch {}
  }
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await r.json();
      return { text: data.candidates?.[0]?.content?.parts?.[0]?.text || '' };
    } catch {}
  }
  throw new Error('No AI provider available');
}

async function logAiAction(supabase, { module, actionType, targetId, decision, confidence = 0, autoExecuted = false, escalated = false, outcome = 'pending', errorDetails = null, executionTimeMs = 0 }) {
  try {
    await supabase.from('ai_action_log').insert({
      module,
      action_type: actionType,
      target_id: String(targetId || ''),
      decision,
      confidence,
      auto_executed: autoExecuted,
      escalated,
      outcome,
      error_details: errorDetails,
      execution_time_ms: executionTimeMs,
      created_at: new Date().toISOString(),
    });
  } catch {}
}

// Task #429: delegate to the shared sender so STOP / sms_opt_out is honored.
// Signature changed to require `supabase` as the first arg. `userId` is
// optional but should be passed whenever known (member/provider dispute
// notifications) so the by-id check fires in addition to the by-phone check.
const { sendSms: sharedSendSms } = require('./sms');
async function aiOpsSendSMS(supabase, toPhone, body, userId = null) {
  if (!supabase) {
    console.warn('[aiOpsSendSMS] called without supabase — refusing send (TCPA fail-closed)');
    return { sent: false, reason: 'no_supabase' };
  }
  return sharedSendSms({ supabase, toPhone, body, userId });
}

module.exports = { getAiOpsSettings, callAI, logAiAction, aiOpsSendSMS };

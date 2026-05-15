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

async function aiOpsSendSMS(toPhone, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from || !toPhone) return { sent: false };
  try {
    const clean = toPhone.replaceAll(/\D/g, '');
    const to = clean.startsWith('1') ? `+${clean}` : `+1${clean}`;
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const form = new URLSearchParams({ To: to, From: from, Body: body });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    return r.ok ? { sent: true } : { sent: false };
  } catch { return { sent: false }; }
}

module.exports = { getAiOpsSettings, callAI, logAiAction, aiOpsSendSMS };

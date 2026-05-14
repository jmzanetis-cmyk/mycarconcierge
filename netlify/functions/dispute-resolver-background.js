const { createClient } = require('@supabase/supabase-js');
const crypto = require('node:crypto');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function verifySupabaseWebhookSignature(rawBody, signatureHeader) {
  const webhookSecret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.warn('[DisputeResolver] No SUPABASE_WEBHOOK_SECRET set — rejecting unauthenticated requests');
    return false;
  }
  if (!signatureHeader) return false;
  try {
    const expectedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');
    const providedSig = signatureHeader.replace(/^sha256=/, '');
    return crypto.timingSafeEqual(
      Buffer.from(expectedSig, 'hex'),
      Buffer.from(providedSig, 'hex')
    );
  } catch { return false; }
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
      module, action_type: actionType, target_id: targetId, decision,
      confidence, auto_executed: autoExecuted, escalated, outcome,
      error_details: errorDetails, execution_time_ms: executionTimeMs,
      created_at: new Date().toISOString()
    });
  } catch {}
}

async function getAiOpsSettings(supabase) {
  const threshold = Number.parseFloat(process.env.AI_CONFIDENCE_THRESHOLD || '1.0');
  const maxRefund = Number.parseFloat(process.env.AI_MAX_AUTO_REFUND || '500');
  try {
    const { data: rows } = await supabase.from('ai_ops_settings').select('key,value');
    if (rows) {
      const s = {};
      for (const r of rows) {
        if (r.key === 'confidence_threshold') s.threshold = Number.parseFloat(r.value);
        if (r.key === 'max_auto_refund') s.maxRefund = Number.parseFloat(r.value);
      }
      return { threshold: s.threshold ?? threshold, maxRefundCents: (s.maxRefund ?? maxRefund) * 100 };
    }
  } catch {}
  return { threshold, maxRefundCents: maxRefund * 100 };
}

async function runDisputeResolverImpl(supabase, completionId) {
  const t0 = Date.now();
  const { threshold } = await getAiOpsSettings(supabase);

  const { data: completion } = await supabase
    .from('care_plan_completions').select('*').eq('id', completionId).single();
  if (!completion) return { error: 'Completion not found', completionId };
  if (completion.status !== 'disputed') {
    return { error: 'Completion is not in disputed state', status: completion.status };
  }

  const [planRes, bidRes, memberRes, providerRes] = await Promise.all([
    supabase.from('care_plans').select('id, title, description, services, value_min, value_max, service_types').eq('id', completion.care_plan_id).single(),
    completion.accepted_bid_id
      ? supabase.from('plan_bids').select('id, amount, note').eq('id', completion.accepted_bid_id).single()
      : Promise.resolve({ data: null }),
    supabase.from('profiles').select('id, email, phone, full_name, created_at').eq('id', completion.member_id).maybeSingle(),
    completion.provider_id
      ? supabase.from('profiles').select('id, email, phone, business_name, full_name, created_at, bid_credits').eq('id', completion.provider_id).maybeSingle()
      : Promise.resolve({ data: null })
  ]);
  const plan = planRes.data || {};
  const bid = bidRes.data || {};
  const memberProfile = memberRes.data || {};
  const providerProfile = providerRes.data || {};

  const [memberHistRes, providerHistRes] = await Promise.all([
    supabase.from('care_plan_completions').select('id, status').eq('member_id', completion.member_id).neq('id', completionId).limit(10),
    completion.provider_id
      ? supabase.from('care_plan_completions').select('id, status').eq('provider_id', completion.provider_id).neq('id', completionId).limit(10)
      : Promise.resolve({ data: [] })
  ]);
  const memberHist = memberHistRes.data || [];
  const providerHist = providerHistRes.data || [];
  const fmtMoney = v => (v == null ? 'unknown' : `$${Number(v).toFixed(2)}`);
  const disputed = arr => arr.filter(o => o.status === 'disputed').length;

  const prompt = `You are the AI Ops Dispute Resolver for My Car Concierge. Analyze this disputed care plan completion and recommend a resolution.

DISPUTE:
- Completion ID: ${completionId}
- Care plan: ${plan.title || 'Unknown'}
- Services: ${(plan.services || []).join(', ') || 'unspecified'}
- Plan budget: ${fmtMoney(plan.value_min)} – ${fmtMoney(plan.value_max)}
- Accepted bid: ${fmtMoney(bid.amount || completion.bid_amount)}
- Actual paid: ${fmtMoney(completion.actual_paid_amount)}
- Payment method: ${completion.payment_method || 'unspecified'}
- Dispute reason: ${completion.dispute_reason || 'unspecified'}
- Description: ${completion.dispute_description || 'no description'}

MEMBER: ${memberHist.length} prior completions, ${disputed(memberHist)} disputed
PROVIDER: ${providerHist.length} prior completions, ${disputed(providerHist)} disputed; ${providerProfile.bid_credits || 0} bid credits

Respond ONLY with valid JSON:
{"recommendation":"refund_member"|"partial_refund"|"deny_refund"|"escalate","confidence":0.0-1.0,"suggested_refund_amount":number_or_null,"reasoning":"one sentence","member_message":"brief","provider_message":"brief","admin_action_required":"e.g. 'manually refund $X via Stripe' or 'no action needed'"}

Rules: escalate if conflicting evidence, complex, or amounts >$500, or either party has 3+ prior disputes. All refunds are RECOMMENDATIONS — admin executes manually.`;

  let result;
  try {
    const response = await callAI(prompt, 700);
    const m = response.text.match(/\{[\s\S]*\}/);
    result = JSON.parse(m ? m[0] : response.text);
  } catch {
    result = { recommendation: 'escalate', confidence: 0, reasoning: 'AI parse failed', member_message: '', provider_message: '', admin_action_required: 'manually review — AI unavailable' };
  }

  const confidence = Number(result.confidence) || 0;
  const autoExecute = threshold < 1.0 && confidence >= threshold && result.recommendation !== 'escalate';
  const ms = Date.now() - t0;

  await logAiAction(supabase, {
    module: 'dispute_resolver', actionType: result.recommendation, targetId: completionId,
    decision: result, confidence, autoExecuted: autoExecute, escalated: !autoExecute,
    outcome: autoExecute ? 'executed' : 'escalated', executionTimeMs: ms
  });

  if (!autoExecute) {
    await supabase.from('ai_escalations').insert({
      module: 'dispute_resolver', target_id: String(completionId),
      recommendation: result, confidence, status: 'pending', created_at: new Date().toISOString()
    });
    return { success: true, action: 'escalated', confidence, reasoning: result.reasoning };
  }

  await supabase.from('care_plan_completions').update({
    status: 'resolved',
    ai_resolution: { ...result, resolved_by: 'ai_ops_dispute_resolver', resolved_at: new Date().toISOString() },
    resolved_at: new Date().toISOString()
  }).eq('id', completionId);

  if (memberProfile.phone && result.member_message) {
    await aiOpsSendSMS(memberProfile.phone, `My Car Concierge: We've reviewed your dispute. ${result.member_message}`);
  }
  if (providerProfile.phone && result.provider_message) {
    await aiOpsSendSMS(providerProfile.phone, `My Car Concierge: A dispute involving your job has been reviewed. ${result.provider_message}`);
  }

  return { success: true, action: result.recommendation, confidence, reasoning: result.reasoning, auto_executed: true };
}

// Webhook handler: Supabase posts here on care_plan_completions row changes.
// Triggers AI resolution when status transitions to 'disputed'.
exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const rawBody = event.body || '';
  const sigHeader = event.headers?.['x-supabase-signature'] || event.headers?.['X-Supabase-Signature'] || '';
  if (!verifySupabaseWebhookSignature(rawBody, sigHeader)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid signature' }) };
  }

  let payload;
  try { payload = JSON.parse(rawBody); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  // Supabase webhook payload shape: { type: 'INSERT'|'UPDATE'|'DELETE', table, record, old_record, schema }
  const record = payload.record || {};
  const oldRecord = payload.old_record || {};

  // Only act when a row is newly disputed (INSERT with status=disputed, or UPDATE that transitioned to disputed)
  const isNewDispute =
    (payload.type === 'INSERT' && record.status === 'disputed') ||
    (payload.type === 'UPDATE' && record.status === 'disputed' && oldRecord.status !== 'disputed');

  if (!isNewDispute) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'not_a_new_dispute', type: payload.type, status: record.status }) };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  try {
    const result = await runDisputeResolverImpl(supabase, record.id);
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    console.error('[DisputeResolver] Error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

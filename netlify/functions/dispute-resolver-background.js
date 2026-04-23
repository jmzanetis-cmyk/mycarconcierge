const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

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
    const clean = toPhone.replace(/\D/g, '');
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
  const threshold = parseFloat(process.env.AI_CONFIDENCE_THRESHOLD || '1.0');
  const maxRefund = parseFloat(process.env.AI_MAX_AUTO_REFUND || '500');
  try {
    const { data: rows } = await supabase.from('ai_ops_settings').select('key,value');
    if (rows) {
      const s = {};
      for (const r of rows) {
        if (r.key === 'confidence_threshold') s.threshold = parseFloat(r.value);
        if (r.key === 'max_auto_refund') s.maxRefund = parseFloat(r.value);
      }
      return { threshold: s.threshold ?? threshold, maxRefundCents: (s.maxRefund ?? maxRefund) * 100 };
    }
  } catch {}
  return { threshold, maxRefundCents: maxRefund * 100 };
}

exports.handler = async function(event, context) {
  const t0 = Date.now();
  console.log('[DisputeResolver] Background function triggered');

  const rawBody = event.body || '';

  // Verify webhook signature (HMAC-SHA256 from Supabase webhook)
  const signatureHeader = event.headers?.['x-webhook-signature'] || event.headers?.['x-supabase-signature'];
  if (!verifySupabaseWebhookSignature(rawBody, signatureHeader)) {
    console.warn('[DisputeResolver] Webhook signature verification FAILED — rejecting request');
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: invalid webhook signature' }) };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no_database' }) };
  }

  let disputeId;
  try {
    const body = JSON.parse(rawBody);
    disputeId = body.record?.id || body.dispute_id || body.id;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid payload' }) };
  }

  if (!disputeId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing dispute_id' }) };
  }

  // Read settings from DB (admin panel overrides) with env var fallback
  const { threshold, maxRefundCents } = await getAiOpsSettings(supabase);

  try {
    const { data: dispute } = await supabase
      .from('disputes')
      .select('*, packages(*), profiles!disputes_member_id_fkey(id, email, phone, created_at), profiles!disputes_provider_id_fkey(id, email, phone, created_at, bid_credits)')
      .eq('id', disputeId)
      .single();

    if (!dispute) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Dispute not found' }) };
    }

    const pkg = dispute.packages || {};
    const memberProfile = dispute['profiles!disputes_member_id_fkey'] || {};
    const providerProfile = dispute['profiles!disputes_provider_id_fkey'] || {};

    // Gather provider and member history for richer AI context
    const [memberHistory, providerHistory] = await Promise.all([
      memberProfile.id
        ? supabase.from('packages').select('id, status, amount, created_at').eq('member_id', memberProfile.id).order('created_at', { ascending: false }).limit(5).then(r => r.data || [])
        : Promise.resolve([]),
      providerProfile.id
        ? supabase.from('packages').select('id, status, amount, created_at').eq('provider_id', providerProfile.id).order('created_at', { ascending: false }).limit(5).then(r => r.data || [])
        : Promise.resolve([])
    ]);

    const memberPastDisputes = await supabase.from('disputes').select('id, reason, status, created_at').eq('member_id', memberProfile.id || '').limit(5).then(r => r.data || []);
    const providerPastDisputes = await supabase.from('disputes').select('id, reason, status, created_at').eq('provider_id', providerProfile.id || '').limit(5).then(r => r.data || []);

    const prompt = `You are the AI Ops Dispute Resolver for My Car Concierge, an automotive service marketplace.
Analyze this dispute and provide a resolution recommendation.

DISPUTE:
- ID: ${disputeId}
- Reason: ${dispute.reason || 'Not specified'}
- Description: ${dispute.description || 'No description'}
- Status: ${dispute.status}
- Service: ${pkg.title || 'Unknown'} — $${((pkg.amount || 0) / 100).toFixed(2)}
- Created: ${dispute.created_at}

MEMBER HISTORY:
- Account created: ${memberProfile.created_at || 'unknown'}
- Recent orders: ${memberHistory.length} (${memberHistory.filter(o => o.status === 'completed').length} completed)
- Past disputes: ${memberPastDisputes.length} (${memberPastDisputes.filter(d => d.status === 'resolved_by_ai').length} auto-resolved)

PROVIDER HISTORY:
- Account created: ${providerProfile.created_at || 'unknown'}
- Bid credits tier: ${providerProfile.bid_credits || 0} credits
- Recent orders: ${providerHistory.length} (${providerHistory.filter(o => o.status === 'completed').length} completed, ${providerHistory.filter(o => o.status === 'cancelled').length} cancelled)
- Past disputes: ${providerPastDisputes.length} (${providerPastDisputes.filter(d => ['full_refund','partial_refund'].includes(d.status)).length} resulted in refunds)

Respond ONLY with valid JSON:
{"recommendation":"full_refund"|"partial_refund"|"deny_refund"|"escalate","confidence":0.0-1.0,"refund_amount_cents":number,"reasoning":"one concise sentence","member_message":"brief message to member","provider_message":"brief message to provider"}

Rules: escalate if complex or conflicting evidence. full_refund if provider clearly failed. partial_refund if partial delivery. deny_refund if claim is unfounded or member has pattern of abuse. High provider dispute history → escalate. When in doubt, escalate.`;

    let result;
    try {
      const response = await callAI(prompt, 512);
      const m = response.text.match(/\{[\s\S]*\}/);
      result = JSON.parse(m ? m[0] : response.text);
    } catch {
      result = { recommendation: 'escalate', confidence: 0, reasoning: 'AI parse failed', member_message: '', provider_message: '' };
    }

    const confidence = result.confidence || 0;
    // Shadow mode: threshold >= 1.0 means always escalate regardless of AI confidence
    const autoExecute = threshold < 1.0 && confidence >= threshold && result.recommendation !== 'escalate';
    const ms = Date.now() - t0;

    await logAiAction(supabase, {
      module: 'dispute_resolver', actionType: result.recommendation, targetId: disputeId,
      decision: result, confidence, autoExecuted: autoExecute, escalated: !autoExecute,
      outcome: autoExecute ? 'executed' : 'escalated', executionTimeMs: ms
    });

    if (!autoExecute) {
      await supabase.from('ai_escalations').insert({
        module: 'dispute_resolver', target_id: disputeId,
        recommendation: result, confidence, status: 'pending',
        created_at: new Date().toISOString()
      });
      console.log(`[DisputeResolver] Dispute ${disputeId} escalated (confidence=${confidence}, threshold=${threshold}, shadow=${threshold >= 1.0})`);
      return { statusCode: 200, body: JSON.stringify({ success: true, action: 'escalated', confidence, reasoning: result.reasoning }) };
    }

    // Auto-execute: apply Stripe refund
    let stripeRefundId = null;
    const refundable = ['full_refund', 'partial_refund'];
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    if (refundable.includes(result.recommendation) && pkg.payment_intent_id && stripeKey) {
      const refundAmountCents = Math.min(
        result.refund_amount_cents || (result.recommendation === 'full_refund' ? (pkg.amount || 0) : 0),
        maxRefundCents
      );
      if (refundAmountCents > 0) {
        try {
          const stripe = require('stripe')(stripeKey);
          const refund = await stripe.refunds.create({
            payment_intent: pkg.payment_intent_id,
            amount: refundAmountCents,
            metadata: { dispute_id: String(disputeId), resolved_by: 'ai_ops', confidence: String(confidence) }
          });
          stripeRefundId = refund.id;
          console.log(`[DisputeResolver] Stripe refund created: ${stripeRefundId} for dispute ${disputeId}`);
        } catch (refundErr) {
          console.error('[DisputeResolver] Stripe refund error:', refundErr.message);
        }
      }
    }

    await supabase.from('disputes').update({
      status: 'resolved_by_ai',
      resolution: result.reasoning,
      metadata: { ai_recommendation: result.recommendation, ai_confidence: confidence, stripe_refund_id: stripeRefundId },
      updated_at: new Date().toISOString()
    }).eq('id', disputeId);

    if (memberProfile.phone && result.member_message) {
      await aiOpsSendSMS(memberProfile.phone, `My Car Concierge: Your dispute has been resolved. ${result.member_message}`);
    }
    if (providerProfile.phone && result.provider_message) {
      await aiOpsSendSMS(providerProfile.phone, `My Car Concierge: A dispute involving your service has been resolved. ${result.provider_message}`);
    }

    console.log(`[DisputeResolver] Dispute ${disputeId} auto-resolved as ${result.recommendation} (confidence=${confidence})`);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, action: result.recommendation, confidence, reasoning: result.reasoning, auto_executed: true, stripe_refund_id: stripeRefundId })
    };

  } catch (err) {
    console.error('[DisputeResolver] Error:', err.message);
    await logAiAction(supabase, {
      module: 'dispute_resolver', actionType: 'error', targetId: String(disputeId),
      decision: { error: err.message }, confidence: 0, outcome: 'error',
      errorDetails: err.message, executionTimeMs: Date.now() - t0
    });
    return { statusCode: 200, body: JSON.stringify({ error: err.message }) };
  }
};

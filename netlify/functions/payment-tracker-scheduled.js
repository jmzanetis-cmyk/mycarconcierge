const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
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

function getBidCreditTierRate(bidCredits) {
  if (bidCredits >= 50) return { tier: 'Championship', rate: 0.08 };
  if (bidCredits >= 25) return { tier: 'Pole Position', rate: 0.10 };
  if (bidCredits >= 10) return { tier: 'Pit Stop', rate: 0.12 };
  return { tier: 'Dipstick', rate: 0.15 };
}

async function callAI(prompt, maxTokens = 512) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
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

async function createAiEscalation(supabase, { module, targetId, recommendation, confidence }) {
  try {
    await supabase.from('ai_escalations').insert({
      module, target_id: targetId, recommendation, confidence,
      status: 'pending', created_at: new Date().toISOString()
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
      return { threshold: s.threshold ?? threshold, maxRefund: (s.maxRefund ?? maxRefund) * 100 };
    }
  } catch {}
  return { threshold, maxRefund: maxRefund * 100 };
}

exports.handler = async function(event, context) {
  console.log('[PaymentTracker] Scheduled run triggered at', new Date().toISOString());
  const t0 = Date.now();

  const supabase = getSupabase();
  if (!supabase) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no_database' }) };
  }

  const { threshold, maxRefund } = await getAiOpsSettings(supabase);
  const maxRefundCents = maxRefund;

  try {
    const { data: orders } = await supabase
      .from('packages')
      .select('id, provider_id, amount, status, created_at, payment_intent_id, profiles!packages_provider_id_fkey(id, email, bid_credits, stripe_connect_account_id)')
      .eq('status', 'completed')
      .is('metadata->>ai_reconciled', null)
      .limit(50);

    if (!orders || orders.length === 0) {
      console.log('[PaymentTracker] No unreconciled orders found.');
      return { statusCode: 200, body: JSON.stringify({ success: true, message: 'No unreconciled orders', processed: 0 }) };
    }

    const byProvider = {};
    for (const o of orders) {
      if (!o.provider_id) continue;
      if (!byProvider[o.provider_id]) {
        const prof = o['profiles!packages_provider_id_fkey'] || {};
        const { tier, rate } = getBidCreditTierRate(prof.bid_credits || 0);
        byProvider[o.provider_id] = {
          total: 0, orders: [], email: prof.email,
          bid_credits: prof.bid_credits || 0, tier, commission_rate: rate,
          stripe_connect_account_id: prof.stripe_connect_account_id
        };
      }
      byProvider[o.provider_id].total += (o.amount || 0);
      byProvider[o.provider_id].orders.push(o.id);
    }

    const summary = Object.entries(byProvider).map(([pid, v]) => ({
      provider_id: pid, total_cents: v.total, order_count: v.orders.length,
      tier: v.tier, commission_rate: v.commission_rate,
      commission_cents: Math.round(v.total * v.commission_rate),
      net_payout_cents: Math.round(v.total * (1 - v.commission_rate)),
      has_stripe_connect: !!v.stripe_connect_account_id
    }));

    const prompt = `You are the AI Ops Payment Tracker for My Car Concierge. Review this provider payout batch and flag anomalies.
BATCH: ${JSON.stringify(summary)}
Respond ONLY with valid JSON: {"anomalies":[{"provider_id":"...","reason":"..."}],"confidence":0.0-1.0,"recommendation":"process_all"|"flag_anomalies"|"hold_batch","notes":"brief summary"}`;

    let result;
    try {
      const response = await callAI(prompt, 512);
      const m = response.text.match(/\{[\s\S]*\}/);
      result = JSON.parse(m ? m[0] : response.text);
    } catch {
      result = { anomalies: [], confidence: 0.5, recommendation: 'flag_anomalies', notes: 'AI unavailable' };
    }

    // Shadow mode: threshold >= 1.0 means always escalate regardless of AI confidence
    const autoExecute = threshold < 1.0 && result.confidence >= threshold && result.recommendation === 'process_all';
    const anomalousPids = new Set((result.anomalies || []).map(a => a.provider_id));

    await logAiAction(supabase, {
      module: 'payment_tracker', actionType: result.recommendation, targetId: 'batch',
      decision: { ...result, summary }, confidence: result.confidence || 0,
      autoExecuted: autoExecute, escalated: anomalousPids.size > 0,
      outcome: autoExecute ? 'processed' : 'flagged', executionTimeMs: Date.now() - t0
    });

    if (anomalousPids.size > 0) {
      await createAiEscalation(supabase, { module: 'payment_tracker', targetId: 'batch', recommendation: result, confidence: result.confidence || 0 });
    }

    // Initiate Stripe Connect payouts for eligible providers when auto-executing
    let payoutsInitiated = 0;
    const payoutErrors = [];

    if (autoExecute) {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (stripeKey) {
        const stripe = require('stripe')(stripeKey);
        const today = new Date().toISOString().split('T')[0];
        const batchId = `${Date.now()}`;

        for (const [pid, v] of Object.entries(byProvider)) {
          if (anomalousPids.has(pid)) continue;
          if (!v.stripe_connect_account_id) continue;
          const netCents = Math.round(v.total * (1 - v.commission_rate));
          if (netCents < 5000) continue;
          if (netCents > 100000) continue;

          // Per-provider cooldown: check last payout for THIS specific provider (target_id=pid)
          const { data: lastPayoutLog } = await supabase
            .from('ai_action_log')
            .select('created_at')
            .eq('module', 'payment_tracker')
            .eq('action_type', 'payout_initiated')
            .eq('auto_executed', true)
            .eq('target_id', pid)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lastPayoutLog) {
            const daysSince = (Date.now() - new Date(lastPayoutLog.created_at).getTime()) / 86400000;
            if (daysSince < 14) { console.log(`[PaymentTracker] Payout skipped for ${pid}: ${daysSince.toFixed(1)} days since last payout`); continue; }
          }

          try {
            await stripe.transfers.create({
              amount: netCents, currency: 'usd', destination: v.stripe_connect_account_id,
              metadata: { provider_id: pid, batch_id: batchId, commission_rate: String(v.commission_rate), tier: v.tier }
            }, { idempotencyKey: `mcc-payout-${pid}-${today}-${batchId}` });
            payoutsInitiated++;
            // Log per-provider payout for cooldown tracking
            await logAiAction(supabase, { module: 'payment_tracker', actionType: 'payout_initiated', targetId: pid, decision: { provider_id: pid, net_cents: netCents, tier: v.tier, batch_id: batchId }, confidence: 1.0, autoExecuted: true, escalated: false, outcome: 'executed', executionTimeMs: Date.now() - t0 });
            // Use RPC to merge reconciliation flags into existing metadata without overwriting other fields
            for (const orderId of v.orders) {
              await supabase.rpc('merge_package_metadata', {
                p_id: orderId,
                p_metadata: { ai_reconciled: true, reconciled_at: new Date().toISOString(), payout_batch: batchId }
              }).then(({ error: rpcErr }) => {
                if (rpcErr) {
                  // Fallback: fetch existing metadata, merge, then update
                  return supabase.from('packages').select('metadata').eq('id', orderId).single()
                    .then(({ data: pkg }) => {
                      const merged = Object.assign({}, pkg?.metadata || {}, { ai_reconciled: true, reconciled_at: new Date().toISOString(), payout_batch: batchId });
                      return supabase.from('packages').update({ metadata: merged }).eq('id', orderId);
                    });
                }
              });
            }
          } catch (payErr) {
            payoutErrors.push({ provider_id: pid, error: payErr.message });
          }
        }
      }
    }

    const result_out = { success: true, processed: orders.length, anomalies: result.anomalies?.length || 0, recommendation: result.recommendation, payouts_initiated: payoutsInitiated };
    console.log('[PaymentTracker] Complete:', JSON.stringify(result_out));
    return { statusCode: 200, body: JSON.stringify(result_out) };

  } catch (err) {
    console.error('[PaymentTracker] Error:', err.message);
    await logAiAction(supabase, { module: 'payment_tracker', actionType: 'error', targetId: 'batch', decision: { error: err.message }, confidence: 0, outcome: 'error', errorDetails: err.message, executionTimeMs: Date.now() - t0 });
    return { statusCode: 200, body: JSON.stringify({ error: err.message }) };
  }
};

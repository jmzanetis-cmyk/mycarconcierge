const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-password, X-Admin-Password',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    },
    body: JSON.stringify(data)
  };
}

function authenticateAdmin(event) {
  const pw = event.headers['x-admin-password'] || event.headers['X-Admin-Password'];
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  return pw === adminPassword;
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
      return { threshold: s.threshold ?? threshold, maxRefund: s.maxRefund ?? maxRefund };
    }
  } catch {}
  return { threshold, maxRefund };
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
      module, action_type: actionType, target_id: String(targetId || ''), decision,
      confidence, auto_executed: autoExecuted, escalated, outcome,
      error_details: errorDetails, execution_time_ms: executionTimeMs,
      created_at: new Date().toISOString()
    });
  } catch {}
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

async function runDisputeResolver(supabase, disputeId) {
  const t0 = Date.now();
  const { threshold, maxRefund } = await getAiOpsSettings(supabase);
  const maxRefundCents = maxRefund * 100;

  const { data: dispute } = await supabase
    .from('disputes')
    .select('*, packages(*), profiles!disputes_member_id_fkey(id, email, phone, created_at), profiles!disputes_provider_id_fkey(id, email, phone, created_at, bid_credits)')
    .eq('id', disputeId)
    .single();

  if (!dispute) return { error: 'Dispute not found' };

  const pkg = dispute.packages || {};
  const memberProfile = dispute['profiles!disputes_member_id_fkey'] || {};
  const providerProfile = dispute['profiles!disputes_provider_id_fkey'] || {};

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
- Past disputes: ${providerPastDisputes.length} (${providerPastDisputes.filter(d => ['full_refund', 'partial_refund'].includes(d.status)).length} resulted in refunds)

Respond ONLY with valid JSON:
{"recommendation":"full_refund"|"partial_refund"|"deny_refund"|"escalate","confidence":0.0-1.0,"refund_amount_cents":number,"reasoning":"one concise sentence","member_message":"brief message to member","provider_message":"brief message to provider"}

Rules: escalate if complex or conflicting evidence. full_refund if provider clearly failed. partial_refund if partial delivery. deny_refund if claim is unfounded. When in doubt, escalate.`;

  let result;
  try {
    const response = await callAI(prompt, 512);
    const m = response.text.match(/\{[\s\S]*\}/);
    result = JSON.parse(m ? m[0] : response.text);
  } catch {
    result = { recommendation: 'escalate', confidence: 0, reasoning: 'AI parse failed', member_message: '', provider_message: '' };
  }

  const confidence = result.confidence || 0;
  const autoExecute = threshold < 1.0 && confidence >= threshold && result.recommendation !== 'escalate';
  const ms = Date.now() - t0;

  await logAiAction(supabase, {
    module: 'dispute_resolver', actionType: result.recommendation, targetId: disputeId,
    decision: result, confidence, autoExecuted: autoExecute, escalated: !autoExecute,
    outcome: autoExecute ? 'executed' : 'escalated', executionTimeMs: ms
  });

  if (!autoExecute) {
    await supabase.from('ai_escalations').insert({
      module: 'dispute_resolver', target_id: String(disputeId),
      recommendation: result, confidence, status: 'pending', created_at: new Date().toISOString()
    });
    return { success: true, action: 'escalated', confidence, reasoning: result.reasoning };
  }

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
      } catch (refundErr) {
        console.error('[AiOpsAdmin] Stripe refund error:', refundErr.message);
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

  return { success: true, action: result.recommendation, confidence, reasoning: result.reasoning, auto_executed: true, stripe_refund_id: stripeRefundId };
}

async function runPaymentTracker(supabase) {
  const t0 = Date.now();
  const { threshold, maxRefund } = await getAiOpsSettings(supabase);

  function getBidCreditTierRate(bidCredits) {
    if (bidCredits >= 50) return { tier: 'Championship', rate: 0.08 };
    if (bidCredits >= 25) return { tier: 'Pole Position', rate: 0.10 };
    if (bidCredits >= 10) return { tier: 'Pit Stop', rate: 0.12 };
    return { tier: 'Dipstick', rate: 0.15 };
  }

  const { data: orders } = await supabase
    .from('packages')
    .select('id, provider_id, amount, status, created_at, payment_intent_id, profiles!packages_provider_id_fkey(id, email, bid_credits, stripe_connect_account_id)')
    .eq('status', 'completed')
    .is('metadata->>ai_reconciled', null)
    .limit(50);

  if (!orders || orders.length === 0) {
    return { success: true, message: 'No unreconciled orders', processed: 0 };
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

  let aiResult;
  try {
    const response = await callAI(`You are the AI Ops Payment Tracker for My Car Concierge. Review this provider payout batch and flag anomalies.
BATCH: ${JSON.stringify(summary)}
Respond ONLY with valid JSON: {"anomalies":[{"provider_id":"...","reason":"..."}],"confidence":0.0-1.0,"recommendation":"process_all"|"flag_anomalies"|"hold_batch","notes":"brief summary"}`, 512);
    const m = response.text.match(/\{[\s\S]*\}/);
    aiResult = JSON.parse(m ? m[0] : response.text);
  } catch {
    aiResult = { anomalies: [], confidence: 0.5, recommendation: 'flag_anomalies', notes: 'AI unavailable' };
  }

  const autoExecute = threshold < 1.0 && aiResult.confidence >= threshold && aiResult.recommendation === 'process_all';
  const anomalousPids = new Set((aiResult.anomalies || []).map(a => a.provider_id));

  await logAiAction(supabase, {
    module: 'payment_tracker', actionType: aiResult.recommendation, targetId: 'batch',
    decision: { ...aiResult, summary }, confidence: aiResult.confidence || 0,
    autoExecuted: autoExecute, escalated: anomalousPids.size > 0,
    outcome: autoExecute ? 'processed' : 'flagged', executionTimeMs: Date.now() - t0
  });

  if (anomalousPids.size > 0) {
    await supabase.from('ai_escalations').insert({
      module: 'payment_tracker', target_id: 'batch',
      recommendation: aiResult, confidence: aiResult.confidence || 0,
      status: 'pending', created_at: new Date().toISOString()
    });
  }

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

        const { data: lastPayoutLog } = await supabase
          .from('ai_action_log').select('created_at')
          .eq('module', 'payment_tracker').eq('action_type', 'payout_initiated')
          .eq('auto_executed', true).eq('target_id', pid)
          .order('created_at', { ascending: false }).limit(1).maybeSingle();

        if (lastPayoutLog) {
          const daysSince = (Date.now() - new Date(lastPayoutLog.created_at).getTime()) / 86400000;
          if (daysSince < 14) continue;
        }

        try {
          await stripe.transfers.create({
            amount: netCents, currency: 'usd', destination: v.stripe_connect_account_id,
            metadata: { provider_id: pid, batch_id: batchId, commission_rate: String(v.commission_rate), tier: v.tier }
          }, { idempotencyKey: `mcc-payout-${pid}-${today}-${batchId}` });
          payoutsInitiated++;
          await logAiAction(supabase, { module: 'payment_tracker', actionType: 'payout_initiated', targetId: pid, decision: { provider_id: pid, net_cents: netCents, tier: v.tier, batch_id: batchId }, confidence: 1.0, autoExecuted: true, escalated: false, outcome: 'executed', executionTimeMs: Date.now() - t0 });
          for (const orderId of v.orders) {
            await supabase.rpc('merge_package_metadata', {
              p_id: orderId,
              p_metadata: { ai_reconciled: true, reconciled_at: new Date().toISOString(), payout_batch: batchId }
            }).then(({ error: rpcErr }) => {
              if (rpcErr) {
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

  return { success: true, processed: orders.length, anomalies: aiResult.anomalies?.length || 0, recommendation: aiResult.recommendation, payouts_initiated: payoutsInitiated, shadow_mode: threshold >= 1.0 };
}

async function runDailyDigest(supabase) {
  const t0 = Date.now();
  const { threshold } = await getAiOpsSettings(supabase);
  const shadowMode = threshold >= 1.0;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: actions } = await supabase
    .from('ai_action_log')
    .select('module, action_type, outcome, confidence, auto_executed, escalated, created_at')
    .gte('created_at', since);

  const byModule = {};
  for (const a of (actions || [])) {
    if (!byModule[a.module]) byModule[a.module] = { total: 0, auto_executed: 0, escalated: 0, outcomes: {} };
    byModule[a.module].total++;
    if (a.auto_executed) byModule[a.module].auto_executed++;
    if (a.escalated) byModule[a.module].escalated++;
    byModule[a.module].outcomes[a.outcome] = (byModule[a.module].outcomes[a.outcome] || 0) + 1;
  }

  const totalActions = (actions || []).length;
  const today = new Date().toISOString().split('T')[0];

  let narrative = `AI Ops Daily Digest — ${today}. Total actions: ${totalActions}. Mode: ${shadowMode ? 'Shadow (escalate-only)' : 'Active (threshold=' + threshold + ')'}`;
  if (totalActions > 0) {
    try {
      const r = await callAI(`Write a 2-3 sentence daily digest for My Car Concierge AI Ops. Stats: ${JSON.stringify(byModule)}. Shadow mode: ${shadowMode}. Keep concise and informative for the admin.`, 256);
      if (r.text) narrative = r.text;
    } catch {}
  }

  await supabase.from('ai_daily_digests').upsert({
    date: today, narrative, stats: byModule, sent_sms: false, created_at: new Date().toISOString()
  }, { onConflict: 'date' });

  const adminPhone = process.env.ADMIN_PHONE_NUMBER;
  let smsSent = false;
  if (adminPhone) {
    const escalated = Object.values(byModule).reduce((s, m) => s + (m.escalated || 0), 0);
    const autoExec = Object.values(byModule).reduce((s, m) => s + (m.auto_executed || 0), 0);
    const smsBody = `MCC AI Ops | ${today} | Actions: ${totalActions} | Auto-exec: ${autoExec} | Escalated: ${escalated}. ${narrative.slice(0, 100)}`;
    const smsResult = await aiOpsSendSMS(adminPhone, smsBody);
    smsSent = smsResult.sent;
    if (smsSent) {
      await supabase.from('ai_daily_digests').update({ sent_sms: true }).eq('date', today);
    }
  }

  return { success: true, date: today, totalActions, narrative, sms_sent: smsSent, ms: Date.now() - t0 };
}

exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return jsonResponse(204, '');
  }

  if (!authenticateAdmin(event)) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return jsonResponse(500, { error: 'Database not configured' });
  }

  const rawPath = event.path || '';
  const path = rawPath
    .replace(/^\/?\.netlify\/functions\/ai-ops-admin\/?/, '')
    .replace(/^\/api\/admin\/ai-ops\/?/, '')
    .replace(/^\/+/, '');
  const method = event.httpMethod;
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch { body = {}; }
  }
  const params = event.queryStringParameters || {};

  try {
    // GET /api/admin/ai-ops/actions
    // Optional filters: module, target_id (Task #139 — used by inline activity panels)
    if (method === 'GET' && path === 'actions') {
      const page = parseInt(params.page || '1');
      const limit = Math.min(parseInt(params.limit || '25'), 100);
      const mod = params.module || '';
      const targetId = (params.target_id || '').trim();
      const outcome = (params.outcome || '').trim();
      const since = (params.since || '').trim();
      let q = supabase.from('ai_action_log').select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);
      if (mod) q = q.eq('module', mod);
      if (targetId) q = q.eq('target_id', targetId);
      if (outcome) q = q.eq('outcome', outcome);
      if (since && !isNaN(Date.parse(since))) q = q.gte('created_at', since);
      const { data, error, count } = await q;
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, { actions: data || [], total: count || 0, page, limit, totalPages: Math.ceil((count || 0) / limit) });
    }

    // GET /api/admin/ai-ops/escalations
    if (method === 'GET' && (path === 'escalations' || path.startsWith('escalations') && !path.match(/escalations\/[^/]+\/resolve/))) {
      const status = params.status || 'pending';
      const { data, error } = await supabase.from('ai_escalations')
        .select('*').eq('status', status)
        .order('created_at', { ascending: false }).limit(50);
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, { escalations: data || [] });
    }

    // POST /api/admin/ai-ops/escalations/:id/resolve
    const resolveMatch = path.match(/^escalations\/([^/]+)\/resolve$/);
    if (method === 'POST' && resolveMatch) {
      const escId = resolveMatch[1];
      const { action, notes, admin_decision } = body;
      if (!['approve', 'override'].includes(action)) {
        return jsonResponse(400, { error: 'action must be approve or override' });
      }
      const { error } = await supabase.from('ai_escalations').update({
        status: action === 'approve' ? 'approved' : 'overridden',
        admin_decision: admin_decision || action,
        admin_notes: notes || '',
        resolved_at: new Date().toISOString()
      }).eq('id', escId);
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, { success: true });
    }

    // GET /api/admin/ai-ops/digests
    if (method === 'GET' && path === 'digests') {
      const { data, error } = await supabase.from('ai_daily_digests')
        .select('*').order('date', { ascending: false }).limit(30);
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, { digests: data || [] });
    }

    // GET /api/admin/ai-ops/settings
    if (method === 'GET' && path === 'settings') {
      const { threshold, maxRefund } = await getAiOpsSettings(supabase);
      return jsonResponse(200, {
        confidence_threshold: threshold,
        max_auto_refund: maxRefund,
        shadow_mode: threshold >= 1.0,
        env_note: 'Overrides stored in ai_ops_settings table take precedence over env vars.'
      });
    }

    // POST /api/admin/ai-ops/settings
    if (method === 'POST' && path === 'settings') {
      const { confidence_threshold, max_auto_refund } = body;
      if (confidence_threshold !== undefined) {
        const t = parseFloat(confidence_threshold);
        if (isNaN(t) || t < 0 || t > 1) {
          return jsonResponse(400, { error: 'confidence_threshold must be 0.0–1.0' });
        }
        const { error } = await supabase.from('ai_ops_settings').upsert(
          { key: 'confidence_threshold', value: String(t), updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
        if (error) console.error('[AiOpsAdmin] Settings persist error:', error.message);
      }
      if (max_auto_refund !== undefined) {
        const m = parseFloat(max_auto_refund);
        if (isNaN(m) || m < 0) {
          return jsonResponse(400, { error: 'max_auto_refund must be a positive number' });
        }
        const { error } = await supabase.from('ai_ops_settings').upsert(
          { key: 'max_auto_refund', value: String(m), updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
        if (error) console.error('[AiOpsAdmin] Settings persist error:', error.message);
      }
      const { threshold, maxRefund } = await getAiOpsSettings(supabase);
      return jsonResponse(200, { success: true, confidence_threshold: threshold, max_auto_refund: maxRefund, shadow_mode: threshold >= 1.0 });
    }

    // POST /api/admin/ai-ops/dispute-resolver/trigger
    if (method === 'POST' && path === 'dispute-resolver/trigger') {
      const { dispute_id } = body;
      if (!dispute_id) return jsonResponse(400, { error: 'dispute_id required' });
      const result = await runDisputeResolver(supabase, dispute_id);
      return jsonResponse(200, result);
    }

    // POST /api/admin/ai-ops/payment-tracker/run
    if (method === 'POST' && path === 'payment-tracker/run') {
      const result = await runPaymentTracker(supabase);
      return jsonResponse(200, result);
    }

    // POST /api/admin/ai-ops/daily-digest/run
    if (method === 'POST' && path === 'daily-digest/run') {
      const result = await runDailyDigest(supabase);
      return jsonResponse(200, result);
    }

    return jsonResponse(404, { error: 'Not found', path });

  } catch (err) {
    console.error('[AiOpsAdmin] Error:', err.message);
    return jsonResponse(500, { error: err.message });
  }
};

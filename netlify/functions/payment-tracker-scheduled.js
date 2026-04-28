const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
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

async function runPaymentTrackerImpl(supabase) {
  const t0 = Date.now();
  const AGING_DAYS = 7;
  const MISMATCH_THRESHOLD = 0.20;
  const sevenDaysAgo = new Date(Date.now() - AGING_DAYS * 86400000).toISOString();
  const oneDayAgo = new Date(Date.now() - 86400000).toISOString();

  async function alreadyLogged(actionType, targetId) {
    const { data } = await supabase.from('ai_action_log')
      .select('id').eq('module', 'payment_tracker').eq('action_type', actionType)
      .eq('target_id', String(targetId)).gte('created_at', oneDayAgo).limit(1).maybeSingle();
    return !!data;
  }

  const { data: aging } = await supabase.from('care_plan_completions')
    .select('id, care_plan_id, member_id, provider_id, bid_amount, created_at')
    .eq('status', 'pending').lt('created_at', sevenDaysAgo).limit(50);

  const { data: completed } = await supabase.from('care_plan_completions')
    .select('id, care_plan_id, member_id, provider_id, bid_amount, actual_paid_amount, payment_method, completed_at')
    .eq('status', 'completed').not('actual_paid_amount', 'is', null).limit(200);

  const { data: missing } = await supabase.from('care_plan_completions')
    .select('id, care_plan_id, member_id, provider_id, bid_amount, completed_at')
    .eq('status', 'completed').is('actual_paid_amount', null).limit(50);

  const findings = [];

  for (const c of (aging || [])) {
    if (await alreadyLogged('aging_pending', c.id)) continue;
    const ageDays = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000);
    await logAiAction(supabase, {
      module: 'payment_tracker', actionType: 'aging_pending', targetId: String(c.id),
      decision: { care_plan_id: c.care_plan_id, member_id: c.member_id, provider_id: c.provider_id, bid_amount: c.bid_amount, age_days: ageDays, recommendation: 'Nudge member to confirm completion or contact provider.' },
      confidence: 1.0, autoExecuted: false, escalated: true, outcome: 'flagged', executionTimeMs: Date.now() - t0
    });
    findings.push({ type: 'aging_pending', completion_id: c.id });
  }

  for (const c of (completed || [])) {
    const bid = Number(c.bid_amount || 0);
    const paid = Number(c.actual_paid_amount || 0);
    if (bid <= 0) continue;
    const ratio = Math.abs(paid - bid) / bid;
    if (ratio <= MISMATCH_THRESHOLD) continue;
    if (await alreadyLogged('amount_mismatch', c.id)) continue;
    await logAiAction(supabase, {
      module: 'payment_tracker', actionType: 'amount_mismatch', targetId: String(c.id),
      decision: { care_plan_id: c.care_plan_id, member_id: c.member_id, provider_id: c.provider_id, bid_amount: bid, actual_paid_amount: paid, payment_method: c.payment_method, mismatch_ratio: Number(ratio.toFixed(3)), recommendation: 'Confirm with member and provider why amount differed from bid.' },
      confidence: 1.0, autoExecuted: false, escalated: true, outcome: 'flagged', executionTimeMs: Date.now() - t0
    });
    findings.push({ type: 'amount_mismatch', completion_id: c.id });
  }

  for (const c of (missing || [])) {
    if (await alreadyLogged('missing_amount', c.id)) continue;
    await logAiAction(supabase, {
      module: 'payment_tracker', actionType: 'missing_amount', targetId: String(c.id),
      decision: { care_plan_id: c.care_plan_id, member_id: c.member_id, provider_id: c.provider_id, bid_amount: c.bid_amount, recommendation: 'Member marked complete but did not record payment amount.' },
      confidence: 1.0, autoExecuted: false, escalated: true, outcome: 'flagged', executionTimeMs: Date.now() - t0
    });
    findings.push({ type: 'missing_amount', completion_id: c.id });
  }

  return {
    success: true,
    aging_pending: (aging || []).length,
    amount_mismatches: findings.filter(f => f.type === 'amount_mismatch').length,
    missing_amount: (missing || []).length,
    new_findings_logged: findings.length,
    execution_time_ms: Date.now() - t0,
    note: 'Light fix: analytical scanner only — no automated Stripe payouts.'
  };
}

exports.handler = async function(event, context) {
  const t0 = Date.now();
  const supabase = getSupabase();
  if (!supabase) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no_database' }) };
  }
  try {
    const result = await runPaymentTrackerImpl(supabase);
    console.log('[PaymentTracker] Done:', JSON.stringify(result));
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    console.error('[PaymentTracker] Error:', err.message);
    await logAiAction(supabase, {
      module: 'payment_tracker', actionType: 'scan_error', targetId: 'cron',
      decision: { error: err.message }, confidence: 0,
      autoExecuted: false, escalated: true, outcome: 'failed',
      errorDetails: err.message, executionTimeMs: Date.now() - t0
    });
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

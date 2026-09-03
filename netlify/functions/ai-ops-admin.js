const { createClient } = require('@supabase/supabase-js');
// Task #254: shared AI Ops helpers (logAiAction, aiOpsSendSMS, callAI,
// getAiOpsSettings) live in `_shared/ai-ops.js` so the three Netlify Functions
// that use them stop drifting. esbuild inlines this require into the bundle.
const { getAiOpsSettings, callAI, logAiAction, aiOpsSendSMS } = require('./_shared/ai-ops');
const utils = require('./utils');
// Task: AI Ops audit follow-up (2026-09-03) - Capture/Refund buttons.
const { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');
const { audit: sharedAudit } = require('./_shared/audit');

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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-password, X-Admin-Password, x-admin-token, X-Admin-Token',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    },
    body: JSON.stringify(data)
  };
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return require('stripe')(key, { apiVersion: STRIPE_API_VERSION });
}

// Money-path audit wrapper: always log + alert on failure. A failed audit
// must NEVER throw into the money operation. Matches the convention in
// admin-release-payment.js / admin-dispute-resolve.js.
function audit(supabase, row) {
  return sharedAudit(supabase, row, {
    alertOnFailure: true,
    logOnFailure: true,
    logPrefix: '[ai-ops-admin]',
  });
}


// Task #150 Light fix: rewritten against care_plan_completions + care_plans
// + plan_bids. This resolver only RECOMMENDS a resolution (refund /
// partial / deny / escalate) and marks the completion resolved with the
// recommendation captured in ai_resolution — it does not itself call
// Stripe. (Note, 2026-09-03: real Stripe capture/refund now exists via
// the admin-triggered _captureCarePlanEscrow/_refundCarePlanEscrow below
// and the Capture/Refund buttons in the UI — an admin acts on this
// recommendation using those, or the Stripe dashboard. Wiring auto-execute
// straight to Stripe was intentionally left out of this fix's scope.)
async function runDisputeResolver(supabase, completionId) {
  const t0 = Date.now();
  const { threshold } = await getAiOpsSettings(supabase);

  const { data: completion } = await supabase
    .from('care_plan_completions')
    .select('*')
    .eq('id', completionId)
    .single();

  if (!completion) return { error: 'Completion not found', completionId };
  if (completion.status !== 'disputed') {
    return { error: 'Completion is not in disputed state', status: completion.status };
  }

  const [planRes, bidRes, memberRes, providerRes] = await Promise.all([
    supabase.from('care_plans').select('id, title, description, services, value_min, value_max, service_types, city, state, created_at').eq('id', completion.care_plan_id).single(),
    completion.accepted_bid_id
      ? supabase.from('plan_bids').select('id, amount, note, created_at').eq('id', completion.accepted_bid_id).single()
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

  const [memberHistoryRes, providerHistoryRes] = await Promise.all([
    supabase.from('care_plan_completions').select('id, status, bid_amount, actual_paid_amount, created_at')
      .eq('member_id', completion.member_id).neq('id', completionId)
      .order('created_at', { ascending: false }).limit(10),
    completion.provider_id
      ? supabase.from('care_plan_completions').select('id, status, bid_amount, actual_paid_amount, created_at')
        .eq('provider_id', completion.provider_id).neq('id', completionId)
        .order('created_at', { ascending: false }).limit(10)
      : Promise.resolve({ data: [] })
  ]);
  const memberHistory = memberHistoryRes.data || [];
  const providerHistory = providerHistoryRes.data || [];

  const fmtMoney = v => (v == null ? 'unknown' : `$${Number(v).toFixed(2)}`);
  const completedCount = arr => arr.filter(o => o.status === 'completed' || o.status === 'resolved').length;
  const disputedCount = arr => arr.filter(o => o.status === 'disputed').length;

  const prompt = `You are the AI Ops Dispute Resolver for My Car Concierge, an automotive service marketplace.
Analyze this disputed care plan completion and recommend a resolution.

DISPUTE:
- Completion ID: ${completionId}
- Care plan: ${plan.title || 'Unknown'} (${(plan.services || []).join?.(', ') || 'unspecified services'})
- Plan budget range: ${fmtMoney(plan.value_min)} – ${fmtMoney(plan.value_max)}
- Accepted bid amount: ${fmtMoney(bid.amount || completion.bid_amount)}
- Actual amount paid: ${fmtMoney(completion.actual_paid_amount)}
- Payment method: ${completion.payment_method || 'unspecified'}
- Dispute reason category: ${completion.dispute_reason || 'unspecified'}
- Dispute description: ${completion.dispute_description || 'no description'}
- Disputed at: ${completion.disputed_at || completion.created_at}

MEMBER HISTORY (last 10 completions, excluding this one):
- Account created: ${memberProfile.created_at || 'unknown'}
- Total prior completions: ${memberHistory.length} (${completedCount(memberHistory)} resolved cleanly, ${disputedCount(memberHistory)} disputed)
- Pattern: ${disputedCount(memberHistory) >= 3 ? 'frequent disputer — be cautious' : disputedCount(memberHistory) === 0 ? 'no prior disputes — low-risk member' : 'occasional disputer'}

PROVIDER HISTORY (last 10 completions, excluding this one):
- Account created: ${providerProfile.created_at || 'unknown'}
- Bid credits: ${providerProfile.bid_credits || 0}
- Total prior completions: ${providerHistory.length} (${completedCount(providerHistory)} resolved cleanly, ${disputedCount(providerHistory)} disputed)
- Pattern: ${disputedCount(providerHistory) >= 3 ? 'high dispute rate — investigate carefully' : disputedCount(providerHistory) === 0 ? 'no prior disputes — generally reliable' : 'occasional disputes'}

Respond ONLY with valid JSON:
{"recommendation":"refund_member"|"partial_refund"|"deny_refund"|"escalate","confidence":0.0-1.0,"suggested_refund_amount":number_or_null,"reasoning":"one concise sentence explaining the recommendation","member_message":"brief sympathetic message to member","provider_message":"brief professional message to provider","admin_action_required":"e.g. 'manually refund $X via Stripe' or 'no action needed' or 'follow up with provider by phone'"}

Rules:
- escalate if evidence is conflicting, the dispute is complex, or amounts exceed $500
- refund_member if provider clearly failed (no_show, damaged property, work was incomplete after agreed price)
- partial_refund if partial delivery or amount mismatch (suggest a fair $ amount)
- deny_refund if member's claim seems unfounded or member shows pattern of frequent disputes
- always escalate if either party has 3+ disputes in their history
- ALL refund actions are RECOMMENDATIONS only — an admin executes them via the AI Ops Capture/Refund buttons (or the Stripe dashboard directly).`;

  let result;
  try {
    const response = await callAI(prompt, 700);
    const m = response.text.match(/\{[\s\S]*\}/);
    result = JSON.parse(m ? m[0] : response.text);
  } catch {
    result = { recommendation: 'escalate', confidence: 0, reasoning: 'AI parse failed', member_message: '', provider_message: '', admin_action_required: 'manually review — AI was unavailable' };
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
    return { success: true, action: 'escalated', confidence, reasoning: result.reasoning, admin_action_required: result.admin_action_required };
  }

  // Auto-execute: mark completion resolved with the AI's recommendation captured.
  // This still does not call Stripe itself — an admin acts on the
  // admin_action_required field via the Capture/Refund buttons.
  await supabase.from('care_plan_completions').update({
    status: 'resolved',
    ai_resolution: { ...result, resolved_by: 'ai_ops_dispute_resolver', resolved_at: new Date().toISOString() },
    resolved_at: new Date().toISOString()
  }).eq('id', completionId);

  if (memberProfile.phone && result.member_message) {
    await aiOpsSendSMS(supabase, memberProfile.phone, `My Car Concierge: We've reviewed your dispute. ${result.member_message}`, memberProfile.id);
  }
  if (providerProfile.phone && result.provider_message) {
    await aiOpsSendSMS(supabase, providerProfile.phone, `My Car Concierge: A dispute involving your job has been reviewed. ${result.provider_message}`, providerProfile.id);
  }

  return { success: true, action: result.recommendation, confidence, reasoning: result.reasoning, admin_action_required: result.admin_action_required, auto_executed: true };
}

// Task #150 Light fix: rewritten against care_plan_completions. No Stripe
// payouts (Light has no payment integration). This is a daily anomaly
// scanner — finds aging pending completions, bid-vs-paid mismatches, and
// completions missing actual_paid_amount. Each finding is logged once to
// ai_action_log so the admin sees it on the AI Ops dashboard.
async function runPaymentTracker(supabase) {
  const t0 = Date.now();
  const AGING_DAYS = 7;
  const MISMATCH_THRESHOLD = 0.20;
  const sevenDaysAgo = new Date(Date.now() - AGING_DAYS * 86400000).toISOString();

  // 1) Aging pending completions — bid was accepted but member never
  // confirmed completion within AGING_DAYS days.
  const { data: aging } = await supabase
    .from('care_plan_completions')
    .select('id, care_plan_id, member_id, provider_id, bid_amount, created_at')
    .eq('status', 'pending')
    .lt('created_at', sevenDaysAgo)
    .order('created_at', { ascending: true })
    .limit(50);

  // 2) Completions with a significant bid vs paid mismatch (>MISMATCH_THRESHOLD).
  const { data: completed } = await supabase
    .from('care_plan_completions')
    .select('id, care_plan_id, member_id, provider_id, bid_amount, actual_paid_amount, payment_method, completed_at')
    .eq('status', 'completed')
    .not('actual_paid_amount', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(200);

  const mismatches = [];
  const missingAmount = [];
  for (const c of (completed || [])) {
    const bid = Number(c.bid_amount || 0);
    const paid = Number(c.actual_paid_amount || 0);
    if (bid > 0) {
      const ratio = Math.abs(paid - bid) / bid;
      if (ratio > MISMATCH_THRESHOLD) {
        mismatches.push({ ...c, mismatch_ratio: ratio });
      }
    }
  }

  // 3) Completions marked completed but missing actual_paid_amount entirely.
  const { data: missing } = await supabase
    .from('care_plan_completions')
    .select('id, care_plan_id, member_id, provider_id, bid_amount, completed_at')
    .eq('status', 'completed')
    .is('actual_paid_amount', null)
    .order('completed_at', { ascending: false })
    .limit(50);
  for (const c of (missing || [])) missingAmount.push(c);

  const findings = [];

  // De-duplicate: only log a finding if there isn't already an
  // ai_action_log entry for the same completion in the last 24h.
  const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
  async function alreadyLogged(actionType, targetId) {
    const { data } = await supabase.from('ai_action_log')
      .select('id')
      .eq('module', 'payment_tracker')
      .eq('action_type', actionType)
      .eq('target_id', String(targetId))
      .gte('created_at', oneDayAgo)
      .limit(1)
      .maybeSingle();
    return !!data;
  }

  for (const c of (aging || [])) {
    if (await alreadyLogged('aging_pending', c.id)) continue;
    const ageDays = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000);
    await logAiAction(supabase, {
      module: 'payment_tracker', actionType: 'aging_pending', targetId: String(c.id),
      decision: { care_plan_id: c.care_plan_id, member_id: c.member_id, provider_id: c.provider_id, bid_amount: c.bid_amount, age_days: ageDays, recommendation: 'Nudge member to confirm completion or contact provider.' },
      confidence: 1.0, autoExecuted: false, escalated: true, outcome: 'flagged', executionTimeMs: Date.now() - t0
    });
    findings.push({ type: 'aging_pending', completion_id: c.id, age_days: ageDays });
  }

  for (const c of mismatches) {
    if (await alreadyLogged('amount_mismatch', c.id)) continue;
    await logAiAction(supabase, {
      module: 'payment_tracker', actionType: 'amount_mismatch', targetId: String(c.id),
      decision: { care_plan_id: c.care_plan_id, member_id: c.member_id, provider_id: c.provider_id, bid_amount: c.bid_amount, actual_paid_amount: c.actual_paid_amount, payment_method: c.payment_method, mismatch_ratio: Number(c.mismatch_ratio.toFixed(3)), recommendation: 'Confirm with member and provider why amount differed from bid.' },
      confidence: 1.0, autoExecuted: false, escalated: true, outcome: 'flagged', executionTimeMs: Date.now() - t0
    });
    findings.push({ type: 'amount_mismatch', completion_id: c.id, ratio: c.mismatch_ratio });
  }

  for (const c of missingAmount) {
    if (await alreadyLogged('missing_amount', c.id)) continue;
    await logAiAction(supabase, {
      module: 'payment_tracker', actionType: 'missing_amount', targetId: String(c.id),
      decision: { care_plan_id: c.care_plan_id, member_id: c.member_id, provider_id: c.provider_id, bid_amount: c.bid_amount, recommendation: 'Member marked complete but did not record payment amount. Contact member to capture amount paid.' },
      confidence: 1.0, autoExecuted: false, escalated: true, outcome: 'flagged', executionTimeMs: Date.now() - t0
    });
    findings.push({ type: 'missing_amount', completion_id: c.id });
  }

  return {
    success: true,
    aging_pending: (aging || []).length,
    amount_mismatches: mismatches.length,
    missing_amount: missingAmount.length,
    new_findings_logged: findings.length,
    execution_time_ms: Date.now() - t0,
    note: 'Light fix: this is an analytical scanner — admins act on findings via the AI Ops dashboard. No automated Stripe payouts.'
  };
}

async function runDailyDigest(supabase) {
  const t0 = Date.now();
  const { threshold } = await getAiOpsSettings(supabase);
  const shadowMode = threshold >= 1.0;

  // Task #306 — even the simpler AI-Ops digest must surface engine-paused
  // state, otherwise on-call hits the manual "Run Now" button, gets a
  // healthy-looking SMS, and misses that the outreach engine is paused.
  let enginePaused = { paused: false };
  try {
    const { data: es } = await supabase
      .from('engine_state')
      .select('is_running, paused_at, pause_reason')
      .eq('id', 1).single();
    if (es && es.is_running === false) {
      enginePaused = {
        paused: true,
        reason: es.pause_reason || null,
        paused_at: es.paused_at || null
      };
    }
  } catch {}

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
  const escalated = Object.values(byModule).reduce((s, m) => s + (m.escalated || 0), 0);
  const autoExec = Object.values(byModule).reduce((s, m) => s + (m.auto_executed || 0), 0);
  const smsLines = [`MCC AI Ops | ${today} | Actions: ${totalActions} | Auto-exec: ${autoExec} | Escalated: ${escalated}. ${narrative.slice(0, 100)}`];
  // Task #306 — paused state goes first in the SMS so on-call sees the
  // reason in the inbox preview without opening the message.
  if (enginePaused.paused) {
    smsLines.unshift(`🛑 Engine paused${enginePaused.reason ? ': ' + enginePaused.reason : ''}`);
  }
  if (adminPhone) {
    const smsResult = await aiOpsSendSMS(supabase, adminPhone, smsLines.join('\n'));
    smsSent = smsResult.sent;
    if (smsSent) {
      await supabase.from('ai_daily_digests').update({ sent_sms: true }).eq('date', today);
    }
  }

  return {
    success: true, date: today, totalActions, narrative,
    sms_sent: smsSent, ms: Date.now() - t0,
    // Task #306 — expose engine_paused + sms_lines so the admin "Run Now"
    // button (and the offline regression smoke) can verify the paused
    // signal renders without intercepting Twilio.
    digest: { sms_lines: smsLines, engine_paused: enginePaused }
  };
}

// ============================================================================
// Task: AI Ops audit follow-up (2026-09-03) - Capture/Refund buttons.
//
// The Capture/Refund buttons in the AI Ops > Care Plan Completions table
// have existed in www/admin.js since Task #150 but POSTed to routes that
// were never implemented here, so every click 404'd. The code comments on
// runDisputeResolver above ("No Stripe refund - no payment integration in
// Light") are stale: Task #155's migration
// (20260428b_care_plans_stripe_escrow.sql) added real
// stripe_payment_intent_id / payment_capture_status / captured_amount /
// refund_amount columns to care_plan_completions, and netlify/functions/
// care-plans.js creates real manual-capture Stripe PaymentIntents on bid
// acceptance. So this is a contained backend fix, not new feature work.
//
// _processCarePlanFounderCommission and _maybeGrantCarClubReturnBonus below
// are duplicated (not required-in) from netlify/functions/agent-fleet-admin.js,
// where the same logic backs the AI-agent "Treasurer apply" approval workflow
// (_treasurerCapture / _treasurerRefund). That file's exports are marked
// "Exposed for unit tests... Not part of the public Netlify function
// surface" (see its exports.__test block), so reaching into it from here
// would be relying on a test-only seam. Duplicating the two small, stable
// helper functions keeps this fix self-contained and avoids touching the
// already-proven Treasurer path. _captureCarePlanEscrow / _refundCarePlanEscrow
// themselves are a port of _treasurerCapture / _treasurerRefund, adapted to:
//   - key off the completion id directly (the button already has it),
//     instead of payload.care_plan_id (the Treasurer flow only has the
//     care plan id, since it applies an AI recommendation about the plan);
//   - log through the standard admin_audit_log audit() helper (same
//     convention as admin-release-payment.js / admin-dispute-resolve.js)
//     instead of _markTreasurerExecuted, which writes to the agent_actions
//     review queue - a row that only exists for an AI-agent recommendation
//     being applied, not for a direct admin button click.
// ============================================================================

// Inlined port of processCarePlanFounderCommission from www/server.js /
// agent-fleet-admin.js's Treasurer-apply path. Returns a `{skipped, reason?,
// transferId?, amount?, founderId?}` shape; never throws (all errors are
// logged + a skip reason is returned so the capture itself isn't rolled back).
async function _processCarePlanFounderCommission(supabase, stripe, providerId, capturedAmount, paymentIntentId, requestId) {
  try {
    if (!providerId || !capturedAmount || capturedAmount <= 0) return { skipped: true, reason: 'invalid_inputs' };

    const { data: existingPayout } = await supabase
      .from('founder_commissions')
      .select('id, stripe_transfer_id, status')
      .eq('transaction_id', paymentIntentId)
      .maybeSingle();
    if (existingPayout?.stripe_transfer_id || existingPayout?.status === 'paid') {
      return { skipped: true, reason: 'already_paid', transferId: existingPayout.stripe_transfer_id };
    }

    const { data: provider } = await supabase
      .from('profiles').select('id, referred_by_founder_id').eq('id', providerId).maybeSingle();
    if (!provider?.referred_by_founder_id) return { skipped: true, reason: 'no_referrer' };

    const { data: founder } = await supabase
      .from('member_founder_profiles')
      .select('id, user_id, full_name, email, stripe_connect_account_id, instant_payout_enabled, payout_preference, referral_code, total_commissions_earned, total_commissions_paid, status, commission_end_date')
      .eq('user_id', provider.referred_by_founder_id)
      .maybeSingle();
    if (!founder) return { skipped: true, reason: 'founder_not_found' };
    if (founder.status && founder.status !== 'active') return { skipped: true, reason: 'founder_inactive' };
    if (founder.commission_end_date && new Date(founder.commission_end_date) < new Date()) return { skipped: true, reason: 'commission_term_expired' };
    if (!founder.instant_payout_enabled || founder.payout_preference !== 'instant') return { skipped: true, reason: 'instant_payout_disabled' };
    if (!founder.stripe_connect_account_id) return { skipped: true, reason: 'no_connect_account' };

    let account;
    try {
      account = await stripe.accounts.retrieve(founder.stripe_connect_account_id);
    } catch (e) {
      console.error(`[${requestId}] founder commission: connect retrieve failed:`, e.message);
      return { skipped: true, reason: 'connect_retrieve_failed' };
    }
    if (!account.payouts_enabled || !account.charges_enabled) return { skipped: true, reason: 'connect_not_ready' };

    const isChrisAgrapidis = (founder.email && founder.email.toLowerCase().includes('chris') && founder.email.toLowerCase().includes('agrapidis'))
      || (founder.referral_code === 'CHRISAGRAPIDIS');
    const commissionRate = isChrisAgrapidis ? 0.90 : 0.50;
    const commissionAmount = parseFloat((capturedAmount * commissionRate).toFixed(2));
    const transferAmountCents = Math.round(commissionAmount * 100);
    if (transferAmountCents < 100) return { skipped: true, reason: 'amount_below_minimum' };

    let commissionRecord = existingPayout || null;
    if (!commissionRecord) {
      const { data: inserted, error: insErr } = await supabase
        .from('founder_commissions')
        .insert({
          founder_id: founder.id,
          referred_provider_id: providerId,
          purchase_amount: capturedAmount,
          original_amount: capturedAmount,
          commission_rate: commissionRate,
          commission_amount: commissionAmount,
          transaction_id: paymentIntentId,
          source_transaction_id: paymentIntentId,
          status: 'pending',
          commission_type: 'care_plan',
          description: `Care plan capture commission (${commissionRate * 100}%)`
        })
        .select('id, founder_id').single();
      if (insErr) {
        if (insErr.code === '23505') {
          const { data: again } = await supabase
            .from('founder_commissions').select('id, founder_id, status')
            .eq('transaction_id', paymentIntentId).maybeSingle();
          if (again?.status === 'paid') return { skipped: true, reason: 'already_paid' };
          commissionRecord = again;
        } else {
          console.error(`[${requestId}] founder commission insert err:`, insErr.message);
          return { skipped: true, reason: 'insert_failed' };
        }
      } else {
        commissionRecord = inserted;
      }
    }
    if (!commissionRecord) return { skipped: true, reason: 'no_record' };

    let transfer;
    try {
      transfer = await stripe.transfers.create({
        amount: transferAmountCents,
        currency: 'usd',
        destination: founder.stripe_connect_account_id,
        metadata: {
          type: 'care_plan_commission',
          founder_id: founder.id,
          provider_id: providerId,
          payment_intent_id: paymentIntentId,
          commission_rate: commissionRate.toString(),
          captured_amount: capturedAmount.toString()
        }
      }, { idempotencyKey: `care_plan_payout_${paymentIntentId}_${founder.id}` });
    } catch (e) {
      await supabase.from('founder_commissions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', commissionRecord.id);
      console.error(`[${requestId}] founder transfer failed:`, e.message);
      return { skipped: true, reason: 'transfer_failed', error: e.message };
    }

    await supabase.from('founder_commissions')
      .update({ stripe_transfer_id: transfer.id, status: 'paid', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', commissionRecord.id);

    return { skipped: false, transferId: transfer.id, amount: commissionAmount, founderId: founder.id };
  } catch (e) {
    console.error(`[${requestId}] _processCarePlanFounderCommission unexpected:`, e.message);
    return { skipped: true, reason: 'unexpected_error', error: e.message };
  }
}

// Grant 3 bid credits to a provider whose car club member returns for another service.
// Idempotent: one bonus per provider+member pair per 30-day window.
async function _maybeGrantCarClubReturnBonus(supabase, providerId, memberId) {
  try {
    const { data: clubs } = await supabase.from('car_clubs')
      .select('id').eq('provider_id', providerId).eq('is_active', true);
    if (!clubs?.length) return { granted: false, reason: 'no_clubs' };

    const clubIds = clubs.map(c => c.id);
    const { data: membership } = await supabase.from('club_memberships')
      .select('club_id').eq('member_id', memberId).eq('is_active', true)
      .in('club_id', clubIds).limit(1).maybeSingle();
    if (!membership) return { granted: false, reason: 'not_a_member' };

    const windowStart = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
    const { data: recent } = await supabase.from('car_club_return_bonuses')
      .select('id').eq('provider_id', providerId).eq('member_id', memberId)
      .gte('created_at', windowStart).limit(1).maybeSingle();
    if (recent) return { granted: false, reason: 'already_granted_this_month' };

    const BONUS_CREDITS = 3;
    const clubId = membership.club_id;

    await supabase.from('car_club_return_bonuses').insert({
      provider_id: providerId, member_id: memberId, club_id: clubId,
      credits_granted: BONUS_CREDITS,
    });
    await supabase.from('bid_credit_purchases').insert({
      provider_id: providerId, bids_purchased: BONUS_CREDITS,
      amount_paid: 0, status: 'granted',
      stripe_session_id: `car_club_return_bonus_${providerId}_${memberId}`,
    }).catch(() => {}); // non-fatal if duplicate

    const { data: p } = await supabase.from('profiles')
      .select('bid_credits').eq('id', providerId).single();
    await supabase.from('profiles')
      .update({ bid_credits: (p?.bid_credits || 0) + BONUS_CREDITS })
      .eq('id', providerId);

    await supabase.from('notifications').insert({
      user_id:  providerId,
      type:     'car_club_bonus',
      title:    'You earned 3 bonus bid credits!',
      body:     'A car club member returned to book your services.',
      metadata: { member_id: memberId, club_id: clubId, credits: BONUS_CREDITS },
    }).catch(() => {});

    console.log(`[ai-ops-admin] car club return bonus granted: provider ${providerId} member ${memberId}`);
    return { granted: true, credits: BONUS_CREDITS };
  } catch (e) {
    console.warn('[ai-ops-admin] car club return bonus error (non-fatal):', e.message);
    return { granted: false, reason: 'error', error: e.message };
  }
}

async function _captureCarePlanEscrow(supabase, stripe, admin, completionId) {
  const { data: cpc, error: cpcErr } = await supabase
    .from('care_plan_completions')
    .select('id, care_plan_id, provider_id, stripe_payment_intent_id, payment_capture_status, founder_commission_status')
    .eq('id', completionId)
    .maybeSingle();
  if (cpcErr) return { error: cpcErr.message, status: 500 };
  if (!cpc) return { error: 'Completion not found', status: 404 };
  if (!cpc.stripe_payment_intent_id) return { error: 'Completion missing stripe_payment_intent_id - cannot capture', status: 400 };
  if (cpc.payment_capture_status === 'captured') {
    return { ok: true, already_captured: true, completion_id: cpc.id };
  }

  let captureResult;
  try {
    captureResult = await stripe.paymentIntents.capture(cpc.stripe_payment_intent_id, {}, {
      idempotencyKey: `ai_ops_admin_capture_${completionId}`
    });
  } catch (e) {
    return { error: `Stripe capture failed: ${e.message}`, status: 502 };
  }

  const capturedAmount = (captureResult.amount_received || captureResult.amount || 0) / 100;
  const nowIso = new Date().toISOString();
  // Fail-closed: if the post-Stripe DB write fails we surface the error.
  // The Stripe idempotency key on the capture means the admin can safely
  // re-click Capture once the DB issue is resolved - Stripe will
  // short-circuit and we'll fall through to the DB update above it.
  const { error: upErr } = await supabase.from('care_plan_completions').update({
    payment_capture_status: 'captured',
    captured_amount: capturedAmount,
    captured_at: nowIso,
    status: 'resolved',
    resolved_at: nowIso
  }).eq('id', cpc.id);
  if (upErr) {
    return { error: `Stripe capture succeeded but DB update failed (safe to retry): ${upErr.message}`, status: 500 };
  }
  const { error: planUpErr } = await supabase.from('care_plans')
    .update({ payment_status: 'captured', status: 'completed' })
    .eq('id', cpc.care_plan_id);
  if (planUpErr) {
    return { error: `Stripe capture + completion update succeeded but care_plans update failed: ${planUpErr.message}`, status: 500 };
  }

  // Founder commission (best-effort): a transfer failure is logged and
  // surfaced in the response but does NOT roll back the capture.
  let commissionResult = null;
  if (cpc.provider_id && capturedAmount > 0 && cpc.founder_commission_status !== 'paid') {
    commissionResult = await _processCarePlanFounderCommission(
      supabase, stripe, cpc.provider_id, capturedAmount, cpc.stripe_payment_intent_id, `ai-ops-${completionId}`
    );
    if (commissionResult && !commissionResult.skipped && commissionResult.amount) {
      await supabase.from('care_plan_completions').update({
        founder_commission_amount: commissionResult.amount,
        founder_transfer_id: commissionResult.transferId || null,
        founder_commission_status: 'paid'
      }).eq('id', cpc.id);
    }
  }

  // Car club return bonus (best-effort).
  let carClubResult = null;
  if (cpc.provider_id) {
    const { data: plan } = await supabase.from('care_plans')
      .select('member_id').eq('id', cpc.care_plan_id).maybeSingle();
    if (plan?.member_id) {
      carClubResult = await _maybeGrantCarClubReturnBonus(supabase, cpc.provider_id, plan.member_id);
    }
  }

  await audit(supabase, {
    action: 'care_plan_captured_by_admin',
    target_id: cpc.id,
    target_type: 'care_plan_completion',
    performed_by: admin.id,
    metadata: {
      care_plan_id: cpc.care_plan_id,
      payment_intent_id: cpc.stripe_payment_intent_id,
      captured_amount: capturedAmount,
      commission: commissionResult,
      car_club_bonus: carClubResult
    }
  });

  return {
    ok: true, captured: true, captured_amount: capturedAmount, completion_id: cpc.id,
    payment_intent_id: cpc.stripe_payment_intent_id, commission: commissionResult, car_club_bonus: carClubResult
  };
}

async function _refundCarePlanEscrow(supabase, stripe, admin, completionId, requestedAmount) {
  const { data: cpc, error: cpcErr } = await supabase
    .from('care_plan_completions')
    .select('id, care_plan_id, stripe_payment_intent_id, payment_capture_status, captured_amount, refund_amount')
    .eq('id', completionId)
    .maybeSingle();
  if (cpcErr) return { error: cpcErr.message, status: 500 };
  if (!cpc) return { error: 'Completion not found', status: 404 };
  if (!cpc.stripe_payment_intent_id) return { error: 'Completion missing stripe_payment_intent_id - cannot refund', status: 400 };
  if (cpc.payment_capture_status === 'refunded') {
    return { ok: true, already_refunded: true, completion_id: cpc.id };
  }

  // Branch on the PI status so an uncaptured hold cancels cleanly (no
  // charge ever landed) instead of trying to refund a non-existent charge.
  let pi;
  try {
    pi = await stripe.paymentIntents.retrieve(cpc.stripe_payment_intent_id);
  } catch (e) {
    return { error: `Stripe PI retrieve failed: ${e.message}`, status: 502 };
  }
  const nowIso = new Date().toISOString();

  if (pi.status === 'requires_capture') {
    try {
      await stripe.paymentIntents.cancel(cpc.stripe_payment_intent_id, undefined, {
        idempotencyKey: `ai_ops_admin_cancel_${completionId}`
      });
    } catch (e) {
      return { error: `Stripe PI cancel failed: ${e.message}`, status: 502 };
    }
    const { error: upErr } = await supabase.from('care_plan_completions').update({
      payment_capture_status: 'refunded',
      refund_amount: 0,
      refunded_at: nowIso,
      status: 'resolved',
      resolved_at: nowIso
    }).eq('id', cpc.id);
    if (upErr) {
      return { error: `Stripe cancel succeeded but DB update failed (safe to retry): ${upErr.message}`, status: 500 };
    }
    const { error: planUpErr } = await supabase.from('care_plans')
      .update({ payment_status: 'cancelled' })
      .eq('id', cpc.care_plan_id);
    if (planUpErr) {
      return { error: `Stripe cancel + completion update succeeded but care_plans update failed: ${planUpErr.message}`, status: 500 };
    }
    await audit(supabase, {
      action: 'care_plan_refund_cancelled_hold_by_admin',
      target_id: cpc.id,
      target_type: 'care_plan_completion',
      performed_by: admin.id,
      metadata: { care_plan_id: cpc.care_plan_id, payment_intent_id: cpc.stripe_payment_intent_id, cancelled: true, refund_amount: 0 }
    });
    return { ok: true, cancelled: true, refunded: true, refunded_amount: 0, is_full: true, completion_id: cpc.id };
  }

  if (pi.status !== 'succeeded') {
    return { error: `Cannot refund PaymentIntent in status: ${pi.status}`, status: 409 };
  }

  // Bound the refund amount by what Stripe actually has on the PI so we
  // can't request more than was charged.
  const piAmount = pi.amount_received || pi.amount;
  const requested = Number(requestedAmount);
  let refundCents;
  if (Number.isFinite(requested) && requested > 0) {
    refundCents = Math.min(Math.round(requested * 100), piAmount);
  } else {
    refundCents = piAmount;
  }
  if (!(refundCents > 0)) {
    return { error: 'Computed refund amount is zero - nothing to refund', status: 400 };
  }
  const refundAmount = refundCents / 100;

  let refund;
  try {
    refund = await stripe.refunds.create({
      payment_intent: cpc.stripe_payment_intent_id,
      amount: refundCents,
      reason: 'requested_by_customer',
      metadata: { care_plan_completion_id: cpc.id, admin_action: 'true', admin_id: admin.id || '' }
    }, { idempotencyKey: `ai_ops_admin_refund_${completionId}_${refundCents}` });
  } catch (e) {
    return { error: `Stripe refund failed: ${e.message}`, status: 502 };
  }

  const isFull = refundCents === piAmount;
  const { error: upErr } = await supabase.from('care_plan_completions').update({
    payment_capture_status: isFull ? 'refunded' : 'partially_refunded',
    refund_amount: refundAmount,
    refund_id: refund.id,
    refunded_at: nowIso,
    status: 'resolved',
    resolved_at: nowIso
  }).eq('id', cpc.id);
  if (upErr) {
    return { error: `Stripe refund succeeded but DB update failed (safe to retry): ${upErr.message}`, status: 500 };
  }
  const { error: planUpErr } = await supabase.from('care_plans')
    .update({ payment_status: isFull ? 'refunded' : 'partially_refunded' })
    .eq('id', cpc.care_plan_id);
  if (planUpErr) {
    return { error: `Stripe refund + completion update succeeded but care_plans update failed: ${planUpErr.message}`, status: 500 };
  }

  await audit(supabase, {
    action: 'care_plan_refunded_by_admin',
    target_id: cpc.id,
    target_type: 'care_plan_completion',
    performed_by: admin.id,
    metadata: {
      care_plan_id: cpc.care_plan_id, payment_intent_id: cpc.stripe_payment_intent_id,
      refund_id: refund.id, refund_amount: refundAmount, is_full: isFull
    }
  });

  return { ok: true, refunded: true, refund_id: refund.id, refunded_amount: refundAmount, is_full: isFull, completion_id: cpc.id };
}

exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return jsonResponse(204, '');
  }

  const supabase = getSupabase();
  if (!supabase) {
    return jsonResponse(500, { error: 'Database not configured' });
  }

  const admin = await utils.authenticateBearerAdmin(event, supabase);
  if (!admin) return jsonResponse(401, { error: 'Unauthorized' });

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
      const page = Number.parseInt(params.page || '1');
      const limit = Math.min(Number.parseInt(params.limit || '25'), 100);
      const mod = params.module || '';
      const targetId = (params.target_id || '').trim();
      const outcome = (params.outcome || '').trim();
      const since = (params.since || '').trim();
      // Task #174 — count: 'planned' avoids a full COUNT(*) scan over
      // ai_action_log; pagination labels only need an estimate.
      let q = supabase.from('ai_action_log').select('*', { count: 'planned' })
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

    // GET /api/admin/ai-ops/actions/:id  (Task #144)
    // Returns the full ai_action_log row for the inline activity panel
    // "Details" drawer. ai_action_log has no separate prompt column — the
    // input the agent ingested is captured inside `decision` (or not at all
    // for older rows), so this endpoint just returns the full row verbatim.
    const actionDetailMatch = path.match(/^actions\/([0-9a-f-]{8,})$/i);
    if (method === 'GET' && actionDetailMatch) {
      const id = actionDetailMatch[1];
      const { data, error } = await supabase
        .from('ai_action_log').select('*').eq('id', id).maybeSingle();
      if (error) return jsonResponse(500, { error: error.message });
      if (!data) return jsonResponse(404, { error: 'Action not found' });
      return jsonResponse(200, { action: data });
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
        const t = Number.parseFloat(confidence_threshold);
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
        const m = Number.parseFloat(max_auto_refund);
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
    // Task #150 Light fix: now wired to care_plan_completions schema.
    // Body: { completion_id: "<uuid>" }
    if (method === 'POST' && path === 'dispute-resolver/trigger') {
      const completionId = body.completion_id || body.completionId;
      if (!completionId) {
        return jsonResponse(400, { error: 'completion_id required' });
      }
      const result = await runDisputeResolver(supabase, completionId);
      return jsonResponse(result.error ? 400 : 200, result);
    }

    // POST /api/admin/ai-ops/payment-tracker/run
    // Task #150 Light fix: anomaly scanner over care_plan_completions.
    // Findings are logged to ai_action_log for admin review.
    if (method === 'POST' && path === 'payment-tracker/run') {
      const result = await runPaymentTracker(supabase);
      return jsonResponse(200, result);
    }

    // GET /api/admin/ai-ops/care-plan-completions?status=&aging_days=&limit=
    // Task #150 Light: list completions with optional status filter.
    if (method === 'GET' && path === 'care-plan-completions') {
      const status = (params.status || '').trim();
      const limit = Math.min(Number.parseInt(params.limit || '50'), 200);
      const agingDays = Number.parseInt(params.aging_days || '0');
      let q = supabase.from('care_plan_completions')
        .select('*, care_plans(id, title, services, value_min, value_max)')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (status) q = q.eq('status', status);
      if (agingDays > 0) {
        const cutoff = new Date(Date.now() - agingDays * 86400000).toISOString();
        q = q.lt('created_at', cutoff);
      }
      const { data, error } = await q;
      if (error) return jsonResponse(500, { error: error.message });
      // FK joins to profiles can't be expressed via PostgREST because
      // member_id/provider_id reference auth.users(id), not profiles(id).
      // Fetch profiles separately and stitch in.
      const rows = data || [];
      const ids = [...new Set(rows.flatMap(r => [r.member_id, r.provider_id]).filter(Boolean))];
      let profilesById = {};
      if (ids.length > 0) {
        const { data: profs } = await supabase.from('profiles')
          .select('id, email, full_name, business_name, phone')
          .in('id', ids);
        profilesById = Object.fromEntries((profs || []).map(p => [p.id, p]));
      }
      const completions = rows.map(r => ({
        ...r,
        member: r.member_id ? (profilesById[r.member_id] || null) : null,
        provider: r.provider_id ? (profilesById[r.provider_id] || null) : null
      }));
      return jsonResponse(200, { completions });
    }

    // POST /api/admin/ai-ops/care-plan-completions
    // Admin creates a completion record on behalf of a member (Light: no
    // public member UI yet — admin captures the data manually).
    if (method === 'POST' && path === 'care-plan-completions') {
      const { care_plan_id, accepted_bid_id, member_id, provider_id, status, bid_amount, actual_paid_amount, payment_method, completion_notes, dispute_reason, dispute_description, admin_notes, metadata, payout_batch_id } = body;
      if (!care_plan_id || !member_id) {
        return jsonResponse(400, { error: 'care_plan_id and member_id required' });
      }
      const insertRow = {
        care_plan_id, accepted_bid_id: accepted_bid_id || null, member_id, provider_id: provider_id || null,
        status: status || 'pending',
        bid_amount: bid_amount != null ? Number(bid_amount) : null,
        actual_paid_amount: actual_paid_amount != null ? Number(actual_paid_amount) : null,
        payment_method: payment_method || null,
        completion_notes: completion_notes || null,
        dispute_reason: dispute_reason || null,
        dispute_description: dispute_description || null,
        admin_notes: admin_notes || null,
        payout_batch_id: payout_batch_id || null,
        metadata: (metadata && typeof metadata === 'object') ? { ...metadata, created_via: 'admin_endpoint' } : { created_via: 'admin_endpoint' }
      };
      if (insertRow.status === 'completed') insertRow.completed_at = new Date().toISOString();
      if (insertRow.status === 'disputed') insertRow.disputed_at = new Date().toISOString();
      const { data, error } = await supabase.from('care_plan_completions').insert(insertRow).select().single();
      if (error) return jsonResponse(error.code === '23505' ? 409 : 500, { error: error.message });
      return jsonResponse(201, { completion: data });
    }

    // PATCH /api/admin/ai-ops/care-plan-completions/:id — admin update
    const completionMatch = path.match(/^care-plan-completions\/([^/]+)$/);
    if (method === 'PATCH' && completionMatch) {
      const id = completionMatch[1];
      const allowed = {};
      const fields = ['status', 'actual_paid_amount', 'payment_method', 'completion_notes', 'dispute_reason', 'dispute_description', 'admin_notes', 'ai_resolution', 'payout_batch_id'];
      for (const f of fields) if (body[f] !== undefined) allowed[f] = body[f];
      if (allowed.status === 'completed' && !allowed.completed_at) allowed.completed_at = new Date().toISOString();
      if (allowed.status === 'disputed' && !allowed.disputed_at) allowed.disputed_at = new Date().toISOString();
      if (allowed.status === 'resolved' && !allowed.resolved_at) allowed.resolved_at = new Date().toISOString();
      // metadata: full replace (body.metadata) or shallow merge (body.metadata_merge)
      if (body.metadata !== undefined) {
        allowed.metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
      } else if (body.metadata_merge && typeof body.metadata_merge === 'object') {
        const { data: existing } = await supabase.from('care_plan_completions').select('metadata').eq('id', id).maybeSingle();
        const prior = (existing?.metadata && typeof existing.metadata === 'object') ? existing.metadata : {};
        allowed.metadata = { ...prior, ...body.metadata_merge };
      }
      if (!Object.keys(allowed).length) return jsonResponse(400, { error: 'No valid fields' });
      const { data, error } = await supabase.from('care_plan_completions').update(allowed).eq('id', id).select().single();
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, { completion: data });
    }

    // POST /api/admin/ai-ops/care-plan-completions/:id/capture
    // Task: AI Ops audit follow-up (2026-09-03). Real one-click Stripe
    // capture for the button that has existed in the UI since Task #150
    // but 404'd (no backend route) - see the header comment above
    // _captureCarePlanEscrow for the full story.
    const captureMatch = path.match(/^care-plan-completions\/([^/]+)\/capture$/);
    if (method === 'POST' && captureMatch) {
      const stripe = getStripe();
      if (!stripe) return jsonResponse(500, { error: 'STRIPE_SECRET_KEY not configured on this deploy' });
      const result = await _captureCarePlanEscrow(supabase, stripe, admin, captureMatch[1]);
      return jsonResponse(result.error ? (result.status || 500) : 200, result);
    }

    // POST /api/admin/ai-ops/care-plan-completions/:id/refund
    // Body: { amount?: number } in dollars - omit/blank for a full refund
    // (or cancellation of an uncaptured hold). See _refundCarePlanEscrow.
    const refundMatch = path.match(/^care-plan-completions\/([^/]+)\/refund$/);
    if (method === 'POST' && refundMatch) {
      const stripe = getStripe();
      if (!stripe) return jsonResponse(500, { error: 'STRIPE_SECRET_KEY not configured on this deploy' });
      const result = await _refundCarePlanEscrow(supabase, stripe, admin, refundMatch[1], body.amount);
      return jsonResponse(result.error ? (result.status || 500) : 200, result);
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

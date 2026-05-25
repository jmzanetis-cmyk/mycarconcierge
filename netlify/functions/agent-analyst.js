// ============================================================================
// MCC Agent Fleet — Analyst
// Nightly: rolls up the last 24h of marketplace activity, asks Claude for a
// short briefing, stores it in agent_memory and writes an audit-log row.
// Also exposes a manual-trigger endpoint behind admin auth.
// ============================================================================

const {
  getSupabase, getAgent, callLLM, logAction, saveMemory,
  authorizeAgentInvocation, assertRateLimit, jsonResponse, SpendCapError,
  loadActivePrompt
} = require('./agent-fleet-runtime');

const SLUG = 'analyst';

const SYSTEM_PROMPT =
  'You are the Analyst agent for My Car Concierge, an automotive service marketplace that now includes a ' +
  'three-sided transport platform (members + providers + drivers). ' +
  'Write a 4-5 sentence briefing for the admin Jordan based on the last 24 hours. ' +
  'Specifically call out: marketplace match rate, failed payments, open disputes, the agent fleet\'s pending review queue, and today\'s agent spend. ' +
  'Also report on the transport platform: new transport requests, completed trips, driver supply vs demand ratio, ' +
  'average transport fare, driver payout volume, provider subsidy adoption, and Founding Driver Program enrollment. ' +
  'Highlight anything anomalous (low driver supply relative to ride demand, stalled founding driver enrollment, etc.) ' +
  'and end with one specific recommendation. Be concrete; no fluff.';

async function safeCount(supabase, table, since, dateColumn = 'created_at', filters = null) {
  try {
    let q = supabase.from(table).select('id', { count: 'exact', head: true }).gte(dateColumn, since);
    if (filters && typeof filters === 'object') {
      for (const [k, v] of Object.entries(filters)) {
        if (Array.isArray(v)) q = q.in(k, v);
        else q = q.eq(k, v);
      }
    }
    const { count, error } = await q;
    if (error) return null;
    return count || 0;
  } catch { return null; }
}

async function gatherMetrics(supabase) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const today = new Date().toISOString().split('T')[0];

  // Best-effort counts; null if table/column missing.
  const [
    newPackages, newCarePlans, newBids, acceptedBids,
    newProviders, newMembers,
    openDisputes, newDisputes,
    failedPayments,
    newSurveyLeads, newOutreachLeads, sentEmails,
    aiOpsEscalations,
    // Transport platform metrics
    newRides, completedRides, cancelledRides,
    activeDrivers, newDrivers,
    newDriverEarnings
  ] = await Promise.all([
    safeCount(supabase, 'packages', since),
    safeCount(supabase, 'care_plans', since),
    safeCount(supabase, 'bids', since),
    safeCount(supabase, 'bids', since, 'updated_at', { status: 'accepted' }),
    safeCount(supabase, 'profiles', since, 'created_at', { role: ['provider','pending_provider'] }),
    safeCount(supabase, 'profiles', since, 'created_at', { role: 'member' }),
    safeCount(supabase, 'disputes', '1970-01-01', 'created_at', { status: 'open' }),
    safeCount(supabase, 'disputes', since),
    safeCount(supabase, 'payments',  since, 'created_at', { status: 'failed' }),
    safeCount(supabase, 'survey_leads', since),
    safeCount(supabase, 'outreach_leads', since),
    safeCount(supabase, 'outreach_messages', since, 'updated_at', { status: 'sent' }),
    safeCount(supabase, 'ai_escalations', since),
    // Transport
    safeCount(supabase, 'rides', since),
    safeCount(supabase, 'rides', since, 'updated_at', { status: 'completed' }),
    safeCount(supabase, 'rides', since, 'updated_at', { status: ['cancelled_member','cancelled_driver','cancelled_system'] }),
    safeCount(supabase, 'profiles', '1970-01-01', 'created_at', { role: 'driver' }),
    safeCount(supabase, 'profiles', since, 'created_at', { role: 'driver' }),
    safeCount(supabase, 'driver_earnings', since)
  ]);

  // Pending review queue across the agent fleet
  let pendingReview = 0;
  try {
    const { count } = await supabase
      .from('agent_actions')
      .select('id', { count: 'exact', head: true })
      .eq('needs_review', true)
      .is('reviewed_at', null);
    pendingReview = count || 0;
  } catch {}

  // Today's agent fleet spend (USD across all agents, current UTC day)
  let agentSpendUsd = 0;
  try {
    const { data } = await supabase
      .from('agent_daily_spend')
      .select('actual_usd, reserved_usd')
      .eq('day', today);
    if (Array.isArray(data)) {
      for (const r of data) {
        agentSpendUsd += Number(r.actual_usd || 0) + Number(r.reserved_usd || 0);
      }
    }
  } catch {}

  // Marketplace match rate: accepted ÷ created bids (last 24h). Null if no bids.
  let matchRate = null;
  if (newBids != null && newBids > 0 && acceptedBids != null) {
    matchRate = Math.round((acceptedBids / newBids) * 1000) / 1000;
  }

  // Average transport fare (best-effort)
  let avgTransportFare = null;
  try {
    const { data: fareData } = await supabase
      .from('rides')
      .select('actual_fare')
      .eq('status', 'completed')
      .gte('updated_at', since)
      .not('actual_fare', 'is', null);
    if (fareData && fareData.length > 0) {
      const total = fareData.reduce((sum, r) => sum + Number(r.actual_fare || 0), 0);
      avgTransportFare = Math.round((total / fareData.length) * 100) / 100;
    }
  } catch {}

  // Driver supply vs demand ratio
  let driverDemandRatio = null;
  if (activeDrivers != null && newRides != null && newRides > 0) {
    driverDemandRatio = Math.round((activeDrivers / newRides) * 100) / 100;
  }

  return {
    since,
    marketplace: {
      new_packages: newPackages,
      new_care_plans: newCarePlans,
      new_bids: newBids,
      accepted_bids: acceptedBids,
      match_rate: matchRate,
      new_member_signups: newMembers,
      new_provider_signups: newProviders
    },
    transport: {
      new_rides: newRides,
      completed_rides: completedRides,
      cancelled_rides: cancelledRides,
      active_drivers_total: activeDrivers,
      new_drivers_24h: newDrivers,
      driver_supply_demand_ratio: driverDemandRatio,
      avg_fare_usd: avgTransportFare,
      driver_earnings_records_24h: newDriverEarnings
    },
    payments: {
      failed_payments: failedPayments
    },
    disputes: {
      new_disputes: newDisputes,
      open_disputes: openDisputes
    },
    growth: {
      new_survey_leads: newSurveyLeads,
      new_outreach_leads: newOutreachLeads,
      outreach_emails_sent: sentEmails
    },
    fleet: {
      pending_review_queue: pendingReview,
      agent_spend_usd_today: Math.round(agentSpendUsd * 1000) / 1000,
      ai_ops_escalations: aiOpsEscalations
    }
  };
}

function buildPrompt(metrics) {
  return `METRICS (last 24h):\n${JSON.stringify(metrics, null, 2)}`;
}

async function runOnce(triggeredBy = 'scheduled') {
  const t0 = Date.now();
  const supabase = getSupabase();
  if (!supabase) return { skipped: true, reason: 'no_database' };

  // Cooldown: at most one Claude briefing per 6h for non-admin invocations.
  // Admin manual triggers bypass the limit.
  if (triggeredBy !== 'admin') {
    const rl = await assertRateLimit(supabase, SLUG, 6 * 60 * 60);
    if (!rl.allowed) return { skipped: true, reason: 'rate_limited', retry_in_s: rl.retry_in_s };
  }

  const agent = await getAgent(supabase, SLUG);
  if (!agent) return { skipped: true, reason: 'agent_not_seeded' };
  if (!agent.enabled) {
    await logAction(supabase, {
      agentSlug: SLUG, actionType: 'briefing', status: 'skipped',
      autonomyUsed: agent.autonomy, reasoning: 'Agent disabled.', durationMs: Date.now() - t0,
      decision: { triggered_by: triggeredBy }
    });
    return { skipped: true, reason: 'agent_disabled' };
  }

  const metrics = await gatherMetrics(supabase);
  const prompt = buildPrompt(metrics);

  let llmResult;
  try {
    const activeSystem = await loadActivePrompt(supabase, SLUG, SYSTEM_PROMPT);
    llmResult = await callLLM(supabase, agent, {
      prompt, system: activeSystem, maxTokens: 600, temperature: 0.5
    });
  } catch (e) {
    const isCap = e instanceof SpendCapError;
    await logAction(supabase, {
      agentSlug: SLUG, actionType: 'briefing',
      status: isCap ? 'skipped' : 'error',
      autonomyUsed: agent.autonomy,
      decision: { metrics, triggered_by: triggeredBy },
      reasoning: isCap ? 'Daily spend cap reached.' : null,
      errorMessage: e.message, durationMs: Date.now() - t0
    });
    return { error: e.message, spend_cap: isCap };
  }

  const briefing = llmResult.text.trim();
  const today = new Date().toISOString().split('T')[0];

  const briefingPayload = { date: today, narrative: briefing, metrics, model: llmResult.model };
  // Date-keyed entry for history.
  await saveMemory(supabase, SLUG, 'briefing', briefingPayload, { key: today });
  // Stable canonical key — admin UI / other agents read this without needing to
  // know the date. Overwrites on each run (upsert via unique index).
  await saveMemory(supabase, SLUG, 'briefing', briefingPayload, { key: 'latest' });

  await logAction(supabase, {
    agentSlug: SLUG, actionType: 'briefing', status: 'completed',
    autonomyUsed: agent.autonomy,
    decision: { metrics, briefing, triggered_by: triggeredBy },
    reasoning: 'Generated nightly briefing.',
    tokensIn: llmResult.tokensIn, tokensOut: llmResult.tokensOut,
    costUsd: llmResult.costUsd, durationMs: Date.now() - t0
  });

  return { success: true, date: today, briefing, metrics, cost_usd: llmResult.costUsd, ms: Date.now() - t0 };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, { ok: true });

  // Strict gate: only valid admin call OR a real Netlify scheduled invocation.
  const auth = authorizeAgentInvocation(event);
  if (!auth) return jsonResponse(401, { error: 'Unauthorized' });

  try {
    const result = await runOnce(auth);
    console.log('[Analyst]', JSON.stringify(result).slice(0, 600));
    return jsonResponse(200, result);
  } catch (e) {
    console.error('[Analyst] error:', e.message);
    return jsonResponse(200, { error: e.message });
  }
};

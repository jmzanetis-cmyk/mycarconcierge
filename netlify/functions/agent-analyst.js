// ============================================================================
// MCC Agent Fleet — Analyst
// Nightly: rolls up the last 24h of marketplace activity, asks Claude for a
// short briefing, stores it in agent_memory and writes an audit-log row.
// Also exposes a manual-trigger endpoint behind admin auth.
// ============================================================================

const {
  getSupabase, getAgent, callLLM, logAction, saveMemory,
  authenticateAdmin, jsonResponse, SpendCapError
} = require('./agent-fleet-runtime');

const SLUG = 'analyst';

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
  const [
    newPackages, newBids, newDisputes, newProviders, newMembers,
    newSurveyLeads, newOutreachLeads, sentEmails, escalations
  ] = await Promise.all([
    safeCount(supabase, 'packages', since),
    safeCount(supabase, 'bids', since),
    safeCount(supabase, 'disputes', since),
    safeCount(supabase, 'profiles', since, 'created_at', { role: ['provider','pending_provider'] }),
    safeCount(supabase, 'profiles', since, 'created_at', { role: 'member' }),
    safeCount(supabase, 'survey_leads', since),
    safeCount(supabase, 'outreach_leads', since),
    safeCount(supabase, 'outreach_messages', since, 'updated_at'),
    safeCount(supabase, 'ai_escalations', since)
  ]);
  return {
    since,
    new_packages: newPackages,
    new_bids: newBids,
    new_disputes: newDisputes,
    new_provider_signups: newProviders,
    new_member_signups: newMembers,
    new_survey_leads: newSurveyLeads,
    new_outreach_leads: newOutreachLeads,
    outreach_emails_sent: sentEmails,
    ai_ops_escalations: escalations
  };
}

function buildPrompt(metrics) {
  return `You are the Analyst agent for My Car Concierge, an automotive service marketplace. ` +
    `Write a 3-4 sentence briefing for the admin Jordan based on the last 24 hours of metrics. ` +
    `Highlight what stands out (good or concerning), call out anything that looks like a trend, and end with one specific recommendation. ` +
    `Be concrete. No fluff.\n\nMETRICS (last 24h):\n${JSON.stringify(metrics, null, 2)}`;
}

async function runOnce(triggeredBy = 'scheduled') {
  const t0 = Date.now();
  const supabase = getSupabase();
  if (!supabase) return { skipped: true, reason: 'no_database' };

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
    llmResult = await callLLM(supabase, agent, { prompt, maxTokens: 600, temperature: 0.5 });
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

  await saveMemory(supabase, SLUG, 'briefing', {
    date: today, narrative: briefing, metrics, model: llmResult.model
  }, { key: today });

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

  // Manual triggers via HTTP must be admin-authed; scheduled invocations have no x-admin-password header.
  const hasAdminHeader = !!(event.headers?.['x-admin-password'] || event.headers?.['X-Admin-Password']);
  if (hasAdminHeader && !authenticateAdmin(event)) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }
  const triggeredBy = hasAdminHeader ? 'manual' : 'scheduled';

  try {
    const result = await runOnce(triggeredBy);
    console.log('[Analyst]', JSON.stringify(result).slice(0, 600));
    return jsonResponse(200, result);
  } catch (e) {
    console.error('[Analyst] error:', e.message);
    return jsonResponse(200, { error: e.message });
  }
};

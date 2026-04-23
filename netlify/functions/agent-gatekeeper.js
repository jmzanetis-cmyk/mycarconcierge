// ============================================================================
// MCC Agent Fleet — Gatekeeper
//
// Event-driven handler invoked by the orchestrator when one of these events
// lands on the bus:
//
//   provider.applied         → review a new provider application
//   provider.bgc_completed   → review an employee background-check result
//   provider.flagged         → review a provider flagged/suspended in admin
//
// For each event, Gatekeeper gathers concrete context from Supabase, asks
// Claude to recommend approve / reject / manual_review with reasoning, and
// writes a "proposed" row to agent_actions with needs_review=true. The
// existing review-queue UI surfaces the recommendation to the operator —
// Gatekeeper NEVER mutates provider state directly. Autonomy stays at
// `propose`; raising it to assist/autonomous is intentionally a separate task.
//
// Idempotency: each event is dispatched at most once by the orchestrator
// (events are marked processed after dispatch). On the rare retry path, a
// duplicate review row is acceptable — the operator will see two proposals
// for the same event_id and can dismiss the duplicate. We log the event_id
// in `agent_actions.event_id` precisely so duplicates are obvious.
// ============================================================================

const {
  getSupabase, getAgent, callLLM, logAction,
  authorizeAgentInvocation, jsonResponse, SpendCapError
} = require('./agent-fleet-runtime');

const SLUG = 'gatekeeper';

const SYSTEM_PROMPT =
  'You are the Gatekeeper agent for My Car Concierge, an automotive service marketplace. ' +
  'Your job is to review provider lifecycle events (new applications, background-check ' +
  'results, and flagged providers) and propose a recommendation to the human operator. ' +
  'You NEVER take action directly — you only recommend. Be skeptical but fair. Always ' +
  'reply with valid JSON in the exact shape:\n' +
  '{"recommendation":"approve|reject|manual_review","confidence":0.0-1.0,' +
  '"reasoning":"2-3 sentence rationale referencing concrete fields",' +
  '"concerns":["short bullet","..."]}';

// ---------------------------------------------------------------------------
// Per-event-type context gathering. Each loader returns a {label, context}
// pair shoveled into the Claude prompt. Loaders are best-effort: if a
// referenced row is missing we still produce SOME context so the agent can
// at least surface the situation rather than crash.
// ---------------------------------------------------------------------------
async function loadProviderContext(supabase, providerId) {
  if (!providerId) return null;
  const { data: prof } = await supabase
    .from('profiles')
    .select('id, role, business_name, full_name, email, phone, city, state, ' +
            'business_type, service_area, created_at, ' +
            'bgc_badge_verified, bgc_compliance_pct, bgc_employees_total, bgc_employees_compliant')
    .eq('id', providerId).maybeSingle();
  return prof || { id: providerId, missing: true };
}

async function loadBgcCheckContext(supabase, payload) {
  // Webhook emits provider_id + employee_id; the most recent check for that
  // employee is what we want to review.
  const empId = payload.employee_id;
  const provId = payload.provider_id;
  let check = null, employee = null;
  if (empId) {
    const { data: emp } = await supabase
      .from('provider_employees')
      .select('id, first_name, last_name, email, role, hired_at, provider_id')
      .eq('id', empId).maybeSingle();
    employee = emp || null;
    const { data: c } = await supabase
      .from('employee_background_checks')
      .select('id, status, completed_at, expires_at, bgc_report_id, is_current')
      .eq('employee_id', empId)
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(1).maybeSingle();
    check = c || null;
  }
  const provider = await loadProviderContext(supabase, provId || employee?.provider_id);
  return { employee, check, provider };
}

async function buildPromptForEvent(supabase, event) {
  const { event_type, payload = {} } = event;
  switch (event_type) {
    case 'provider.applied': {
      const provider = await loadProviderContext(supabase, payload.provider_id);
      return [
        `EVENT: provider.applied (a new provider application landed)`,
        `Recommend whether to approve, reject, or send to manual review.`,
        `Approve only if the application looks complete, plausible, and low-risk.`,
        `If business name is empty or contact info is missing, prefer manual_review.`,
        ``,
        `PAYLOAD:\n${JSON.stringify(payload, null, 2)}`,
        ``,
        `PROFILE SNAPSHOT:\n${JSON.stringify(provider, null, 2)}`
      ].join('\n');
    }
    case 'provider.bgc_completed': {
      const ctx = await loadBgcCheckContext(supabase, payload);
      return [
        `EVENT: provider.bgc_completed (an employee background-check result was returned)`,
        `Recommend approve when the check is "clear" and consistent with provider context.`,
        `Recommend manual_review on "consider" results. Recommend reject only on clearly disqualifying facts.`,
        ``,
        `PAYLOAD:\n${JSON.stringify(payload, null, 2)}`,
        ``,
        `EMPLOYEE:\n${JSON.stringify(ctx.employee, null, 2)}`,
        ``,
        `BACKGROUND CHECK:\n${JSON.stringify(ctx.check, null, 2)}`,
        ``,
        `PROVIDER COMPLIANCE SNAPSHOT:\n${JSON.stringify(ctx.provider, null, 2)}`
      ].join('\n');
    }
    case 'provider.flagged': {
      const provider = await loadProviderContext(supabase, payload.provider_id);
      return [
        `EVENT: provider.flagged (the provider was moved to suspended status)`,
        `Recommend whether the suspension should stand (approve), be lifted (reject),`,
        `or escalated for manual review pending more information.`,
        ``,
        `PAYLOAD:\n${JSON.stringify(payload, null, 2)}`,
        ``,
        `PROFILE SNAPSHOT:\n${JSON.stringify(provider, null, 2)}`
      ].join('\n');
    }
    default:
      return null; // Unknown — see handler.
  }
}

// Best-effort JSON parse; returns the raw text on failure so the operator
// can still see what Claude said.
function parseRecommendation(text) {
  if (!text) return null;
  // Strip markdown fences if Claude wrapped the JSON.
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch { return null; }
}

async function handleEvent(triggeredBy, eventEnvelope) {
  const t0 = Date.now();
  const supabase = getSupabase();
  if (!supabase) return { skipped: true, reason: 'no_database' };

  const agent = await getAgent(supabase, SLUG);
  if (!agent) return { skipped: true, reason: 'agent_not_seeded' };
  if (!agent.enabled) {
    await logAction(supabase, {
      agentSlug: SLUG, eventId: eventEnvelope.event_id,
      actionType: 'review', status: 'skipped',
      autonomyUsed: agent.autonomy,
      decision: { event_type: eventEnvelope.event_type, triggered_by: triggeredBy },
      reasoning: 'Gatekeeper disabled.', durationMs: Date.now() - t0
    });
    return { skipped: true, reason: 'agent_disabled' };
  }

  const prompt = await buildPromptForEvent(supabase, eventEnvelope);
  if (prompt === null) {
    await logAction(supabase, {
      agentSlug: SLUG, eventId: eventEnvelope.event_id,
      actionType: 'review', status: 'skipped',
      autonomyUsed: agent.autonomy,
      decision: { event_type: eventEnvelope.event_type, triggered_by: triggeredBy },
      reasoning: `Unknown event type "${eventEnvelope.event_type}".`,
      durationMs: Date.now() - t0
    });
    return { skipped: true, reason: 'unknown_event_type' };
  }

  let llmResult;
  try {
    llmResult = await callLLM(supabase, agent, {
      prompt, system: SYSTEM_PROMPT, maxTokens: 500, temperature: 0.2
    });
  } catch (e) {
    const isCap = e instanceof SpendCapError;
    await logAction(supabase, {
      agentSlug: SLUG, eventId: eventEnvelope.event_id,
      actionType: 'review',
      status: isCap ? 'skipped' : 'error',
      autonomyUsed: agent.autonomy,
      decision: { event_type: eventEnvelope.event_type, triggered_by: triggeredBy },
      reasoning: isCap ? 'Daily spend cap reached.' : null,
      errorMessage: e.message, durationMs: Date.now() - t0
    });
    return { error: e.message, spend_cap: isCap };
  }

  const parsed = parseRecommendation(llmResult.text);
  const recommendation = parsed?.recommendation || 'manual_review';
  const confidence = (typeof parsed?.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1)
    ? parsed.confidence : null;
  const reasoning = parsed?.reasoning || llmResult.text.trim().slice(0, 600);
  const concerns = Array.isArray(parsed?.concerns) ? parsed.concerns : [];

  await logAction(supabase, {
    agentSlug: SLUG, eventId: eventEnvelope.event_id,
    actionType: 'review',
    status: 'proposed',
    autonomyUsed: agent.autonomy,
    confidence,
    needsReview: true,
    decision: {
      event_type: eventEnvelope.event_type,
      payload: eventEnvelope.payload || {},
      recommendation,
      concerns,
      raw_response: parsed ? null : llmResult.text.slice(0, 1500)
    },
    reasoning,
    tokensIn: llmResult.tokensIn, tokensOut: llmResult.tokensOut,
    costUsd: llmResult.costUsd, durationMs: Date.now() - t0
  });

  return {
    success: true,
    event_type: eventEnvelope.event_type,
    recommendation, confidence,
    cost_usd: llmResult.costUsd, ms: Date.now() - t0
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, { ok: true });

  // Strict gate: orchestrator forwards x-admin-password (treated as 'admin'
  // by authorizeAgentInvocation), or a real scheduled invocation. Anything
  // else is rejected. Public callers cannot reach Gatekeeper.
  const auth = authorizeAgentInvocation(event);
  if (!auth) return jsonResponse(401, { error: 'Unauthorized' });

  // Parse the orchestrator-shaped envelope. We tolerate an empty body to make
  // simple "is this function alive?" probes return a clean 400 instead of 500.
  let envelope = {};
  if (event.body) {
    try { envelope = typeof event.body === 'string' ? JSON.parse(event.body) : event.body; }
    catch { return jsonResponse(400, { error: 'Invalid JSON body' }); }
  }
  if (!envelope.event_type) {
    return jsonResponse(400, { error: 'event_type required' });
  }

  try {
    const result = await handleEvent(auth, envelope);
    console.log('[Gatekeeper]', JSON.stringify(result).slice(0, 600));
    return jsonResponse(200, result);
  } catch (e) {
    console.error('[Gatekeeper] error:', e.message);
    // Return 200 so the orchestrator marks the event processed; the error is
    // already in agent_actions for the operator to see.
    return jsonResponse(200, { error: e.message });
  }
};

// ============================================================================
// MCC Agent Fleet — Treasurer
//
// Event-driven handler invoked by the orchestrator when one of these events
// lands on the bus (per the registry seed in
// supabase/migrations/20260422_agent_fleet.sql lines 238–241):
//
//   payment.captured          → review a freshly captured escrow payment
//   payment.refund_requested  → review a refund request
//   payout.failed             → review a failed provider payout
//
// For each event, Treasurer pulls modest concrete context from Supabase
// (care plan + completion + provider/member profiles, when the payload
// references them), asks Claude to recommend an action, and writes a
// "proposed" row to agent_actions with needs_review=true. The existing
// review-queue UI surfaces the recommendation to the operator — Treasurer
// NEVER mutates payments, payouts, refunds, or any escrow state directly.
// Autonomy stays at `propose`; raising it is intentionally a separate task.
//
// Recommendation shape (JSON returned by Claude):
//   {
//     "recommendation": "approve_capture|approve_refund|deny_refund|
//                        retry_payout|escalate_payout|manual_review",
//     "confidence": 0.0-1.0,
//     "reasoning": "2-3 sentence rationale referencing concrete fields",
//     "concerns": ["short bullet", "..."]
//   }
//
// Idempotency (Task #320): two-layer dedupe mirrors what Matchmaker
// shipped in Task #152 + Task #195.
//
//   1) Application-level guard (`findExistingTreasurerAction`): before
//      calling Claude, look up an existing proposed/executed/approved
//      review row for the same event_id, or — for the same event_type —
//      the same payment_id / payout_id / care_plan_id keys in
//      decision.payload. On a hit we short-circuit with a `skipped`
//      audit row (cost_usd = 0, no LLM call) so a replayed
//      `payment.captured` / `payment.refund_requested` / `payout.failed`
//      can't write a second proposal or burn the spend cap twice.
//
//   2) DB-level backstop: a set of unique partial indexes
//      (see supabase/migrations/20260514b_treasurer_review_unique.sql)
//      scoped per event_type, on the relevant payload key. Two
//      near-simultaneous invocations that both pass the application
//      guard will hit a 23505 unique-violation on the second insert —
//      this handler catches that and writes the same `skipped` audit
//      row, charging the LLM cost we already incurred to the spend
//      rollup so the duplicate dispatch stays auditable.
//
// The event_type scoping intentionally lets a refund proposal land
// AFTER a capture proposal for the same payment_id — capture and
// refund-requested are distinct lifecycle events and both should be
// reviewable.
//
// Mirrors the structure of agent-gatekeeper.js / agent-matchmaker.js.
// ============================================================================

const {
  getSupabase, getAgent, callLLM, logAction,
  authorizeAgentInvocation, jsonResponse, SpendCapError, loadActivePrompt
} = require('./agent-fleet-runtime');

const SLUG = 'treasurer';

const SYSTEM_PROMPT =
  'You are the Treasurer agent for My Car Concierge, an automotive service marketplace. ' +
  'Your job is to review payment lifecycle events (captured escrow payments, refund ' +
  'requests, and failed provider payouts) and propose a recommendation to the human ' +
  'operator. You NEVER move money directly — you only recommend; the operator must ' +
  'approve before any capture, refund, or payout retry actually fires. Be skeptical ' +
  'but fair, and conservative when context is thin. Always reply with valid JSON in ' +
  'this exact shape:\n' +
  '{"recommendation":"approve_capture|approve_refund|deny_refund|retry_payout|' +
  'escalate_payout|manual_review","confidence":0.0-1.0,' +
  '"reasoning":"2-3 sentence rationale referencing concrete fields",' +
  '"concerns":["short bullet","..."]}';

// ---------------------------------------------------------------------------
// Per-event-type context loaders. Each is best-effort: a missing referenced
// row should NOT crash the handler — we want to surface SOMETHING to the
// operator even when an upstream producer fires before related rows land.
// ---------------------------------------------------------------------------
async function loadCarePlan(supabase, carePlanId) {
  if (!carePlanId) return null;
  const { data } = await supabase
    .from('care_plans')
    .select(
      'id, status, member_id, awarded_provider_id, title, ' +
      'value_min, value_max, stripe_payment_intent_id, ' +
      'bid_count, bid_closes_at, created_at, updated_at'
    )
    .eq('id', carePlanId).maybeSingle();
  return data || { id: carePlanId, missing: true };
}

async function loadCompletion(supabase, carePlanId) {
  if (!carePlanId) return null;
  const { data } = await supabase
    .from('care_plan_completions')
    .select(
      'id, care_plan_id, provider_id, status, amount_cents, currency, ' +
      'stripe_payment_intent_id, created_at, updated_at'
    )
    .eq('care_plan_id', carePlanId)
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(1).maybeSingle();
  return data || null;
}

async function loadProfile(supabase, profileId) {
  if (!profileId) return null;
  const { data } = await supabase
    .from('profiles')
    .select('id, role, business_name, full_name, email, ' +
            'avg_rating, completed_jobs, ' +
            'bgc_badge_verified, bgc_compliance_pct, verification_status, created_at')
    .eq('id', profileId).maybeSingle();
  return data || { id: profileId, missing: true };
}

async function buildPromptForEvent(supabase, event) {
  const { event_type, payload = {} } = event;
  switch (event_type) {
    case 'payment.captured': {
      const carePlan = await loadCarePlan(supabase, payload.care_plan_id);
      const completion = await loadCompletion(supabase, payload.care_plan_id);
      const member = await loadProfile(supabase, payload.member_id || carePlan?.member_id);
      const provider = await loadProfile(supabase, payload.provider_id || carePlan?.awarded_provider_id || completion?.provider_id);
      return [
        `EVENT: payment.captured (escrow payment was just captured for a care plan).`,
        `Recommend approve_capture when the captured amount is consistent with the`,
        `care plan value range AND the completion record (if any) shows the work was`,
        `actually finished. Recommend manual_review on amount mismatches, missing`,
        `completion records, or anything else that smells off.`,
        ``,
        `PAYLOAD:\n${JSON.stringify(payload, null, 2)}`,
        ``,
        `CARE PLAN:\n${JSON.stringify(carePlan, null, 2)}`,
        ``,
        `COMPLETION (most recent for this care plan, if any):\n${JSON.stringify(completion, null, 2)}`,
        ``,
        `MEMBER:\n${JSON.stringify(member, null, 2)}`,
        ``,
        `PROVIDER:\n${JSON.stringify(provider, null, 2)}`
      ].join('\n');
    }
    case 'payment.refund_requested': {
      const carePlan = await loadCarePlan(supabase, payload.care_plan_id);
      const completion = await loadCompletion(supabase, payload.care_plan_id);
      const member = await loadProfile(supabase, payload.member_id || carePlan?.member_id);
      return [
        `EVENT: payment.refund_requested (member or admin asked for a refund).`,
        `Recommend approve_refund when the requested amount is within the captured`,
        `total AND the reason aligns with a legitimate dispute (e.g. work not done,`,
        `quality issue with completion record showing problems). Recommend deny_refund`,
        `only when the completion record clearly shows successful work and the reason`,
        `looks weak. Default to manual_review when context is thin.`,
        ``,
        `PAYLOAD:\n${JSON.stringify(payload, null, 2)}`,
        ``,
        `CARE PLAN:\n${JSON.stringify(carePlan, null, 2)}`,
        ``,
        `COMPLETION (most recent, if any):\n${JSON.stringify(completion, null, 2)}`,
        ``,
        `MEMBER:\n${JSON.stringify(member, null, 2)}`
      ].join('\n');
    }
    case 'payout.failed': {
      const provider = await loadProfile(supabase, payload.provider_id);
      return [
        `EVENT: payout.failed (a provider payout attempt failed).`,
        `Recommend retry_payout for transient failure codes (e.g. account_inactive`,
        `that may resolve, network/timeout). Recommend escalate_payout when the`,
        `failure looks like a Stripe Connect onboarding gap (account not enabled,`,
        `missing verification) — operator needs to nudge the provider. Recommend`,
        `manual_review when the failure code is unfamiliar or the provider profile`,
        `is incomplete.`,
        ``,
        `PAYLOAD:\n${JSON.stringify(payload, null, 2)}`,
        ``,
        `PROVIDER:\n${JSON.stringify(provider, null, 2)}`
      ].join('\n');
    }
    default:
      return null; // Unknown — handler short-circuits to a `skipped` audit row.
  }
}

// Best-effort JSON parse; tolerates ```json fenced output from Claude.
// Returns null on failure so the caller can fall back to the raw text.
function parseRecommendation(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch { /* try braces below */ }
  // Fallback: locate the first {...} block.
  try {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
  } catch { /* swallow */ }
  return null;
}

const VALID_RECOMMENDATIONS = new Set([
  'approve_capture', 'approve_refund', 'deny_refund',
  'retry_payout', 'escalate_payout', 'manual_review'
]);

// Task #320 — Application-level dedupe.
// Look for an existing live review row (proposed/executed/approved) tied
// to the SAME event_type and ANY of the lifecycle keys we have for this
// dispatch. Returns the most recent matching row or null.
//
// Why event_type matters: payment.captured and payment.refund_requested
// share payment_id but are independent lifecycle events — a refund
// proposal must be allowed AFTER a capture proposal landed for the same
// PI. So we filter by event_type client-side after fetching candidates.
async function findExistingTreasurerAction(supabase, eventType, eventId, payload) {
  const orFilters = [];
  if (eventId) orFilters.push(`event_id.eq.${eventId}`);
  if (payload && payload.payment_id)   orFilters.push(`decision->payload->>payment_id.eq.${payload.payment_id}`);
  if (payload && payload.payout_id)    orFilters.push(`decision->payload->>payout_id.eq.${payload.payout_id}`);
  if (payload && payload.care_plan_id) orFilters.push(`decision->payload->>care_plan_id.eq.${payload.care_plan_id}`);
  if (!orFilters.length) return null;

  const { data, error } = await supabase
    .from('agent_actions')
    .select('id, status, review_status, decision, event_id, created_at')
    .eq('agent_slug', SLUG)
    .eq('action_type', 'review')
    .or(orFilters.join(','))
    .or('status.in.(proposed,executed,approved),review_status.eq.approved')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    console.warn(`[${SLUG}] dedupe lookup failed: ${error.message}`);
    return null;
  }

  for (const row of (data || [])) {
    let dec = row.decision;
    if (typeof dec === 'string') { try { dec = JSON.parse(dec); } catch { dec = {}; } }
    // Same event_id always counts (a literal redelivery of the same event).
    if (eventId && row.event_id === eventId) return row;
    // Otherwise require event_type to match so capture/refund don't collide.
    if (dec && dec.event_type === eventType) return row;
  }
  return null;
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
      reasoning: 'Treasurer disabled.', durationMs: Date.now() - t0
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

  // Task #320: application-level dedupe before the LLM call. Replays of
  // the same payment.captured / payment.refund_requested / payout.failed
  // event must not write a second proposal or burn the spend cap twice.
  // The DB unique partial indexes in 20260514b_treasurer_review_unique.sql
  // backstop the race below.
  const existing = await findExistingTreasurerAction(
    supabase, eventEnvelope.event_type, eventEnvelope.event_id, eventEnvelope.payload || {}
  );
  if (existing) {
    await logAction(supabase, {
      agentSlug: SLUG, eventId: eventEnvelope.event_id,
      actionType: 'review', status: 'skipped',
      autonomyUsed: agent.autonomy,
      decision: {
        event_type: eventEnvelope.event_type,
        payload: eventEnvelope.payload || {},
        triggered_by: triggeredBy,
        dedupe_source: 'application_guard',
        existing_action_id: existing.id,
        existing_action_status: existing.status,
        existing_review_status: existing.review_status || null
      },
      reasoning: `Treasurer already reviewed this ${eventEnvelope.event_type} (action #${existing.id}, status=${existing.status}). Short-circuiting to avoid duplicate proposal.`,
      durationMs: Date.now() - t0
    });
    return {
      success: true,
      reason: 'already_reviewed',
      event_type: eventEnvelope.event_type,
      existing_action_id: existing.id,
      cost_usd: 0,
      ms: Date.now() - t0
    };
  }

  let llmResult;
  try {
    const activeSystem = await loadActivePrompt(supabase, SLUG, SYSTEM_PROMPT);
    llmResult = await callLLM(supabase, agent, {
      prompt, system: activeSystem, maxTokens: 500, temperature: 0.2
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
  let recommendation = parsed?.recommendation || 'manual_review';
  if (!VALID_RECOMMENDATIONS.has(recommendation)) recommendation = 'manual_review';
  const confidence = (parsed && typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1)
    ? parsed.confidence : null;
  const reasoning = parsed?.reasoning || llmResult.text.trim().slice(0, 600);
  const concerns = Array.isArray(parsed?.concerns) ? parsed.concerns : [];

  const proposedInsert = await logAction(supabase, {
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

  // Task #320 — DB-level dedupe backstop. The unique partial indexes in
  // 20260514b_treasurer_review_unique.sql guarantee at most one
  // proposed/executed treasurer review row per (event_type, payment_id|
  // payout_id). Two near-simultaneous invocations that both pass the
  // application guard above will land here, and Postgres will reject the
  // second insert with 23505. We turn that into the same `skipped` audit
  // row the application guard would have written, but charge the LLM
  // tokens we already burned to the daily spend rollup.
  if (proposedInsert?.error?.code === '23505') {
    await logAction(supabase, {
      agentSlug: SLUG, eventId: eventEnvelope.event_id,
      actionType: 'review', status: 'skipped',
      autonomyUsed: agent.autonomy,
      decision: {
        event_type: eventEnvelope.event_type,
        payload: eventEnvelope.payload || {},
        triggered_by: triggeredBy,
        dedupe_source: 'db_unique_index',
        unique_violation: proposedInsert.error.message
      },
      reasoning: `Concurrent treasurer invocation already wrote a proposed row for this ${eventEnvelope.event_type}; DB unique index rejected the duplicate. Treating as already_reviewed.`,
      tokensIn: llmResult.tokensIn, tokensOut: llmResult.tokensOut,
      costUsd: llmResult.costUsd, durationMs: Date.now() - t0
    });
    return {
      success: true,
      reason: 'already_reviewed',
      event_type: eventEnvelope.event_type,
      cost_usd: 0,
      ms: Date.now() - t0
    };
  }

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
  // else is rejected. Public callers cannot reach Treasurer.
  const auth = authorizeAgentInvocation(event);
  if (!auth) return jsonResponse(401, { error: 'Unauthorized' });

  // Parse the orchestrator-shaped envelope. Tolerate an empty body so simple
  // "is this function alive?" probes return a clean 400 instead of a 500.
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
    console.log('[Treasurer]', JSON.stringify(result).slice(0, 600));
    return jsonResponse(200, result);
  } catch (e) {
    console.error('[Treasurer] error:', e.message);
    // Return 200 so the orchestrator marks the event processed; the error
    // is already in agent_actions for the operator to see.
    return jsonResponse(200, { error: e.message });
  }
};

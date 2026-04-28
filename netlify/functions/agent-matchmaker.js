// ============================================================================
// MCC Agent Fleet — Matchmaker
//
// Event-driven handler invoked by the orchestrator when:
//
//   care_plan.auction_closed   → rank the bids and recommend a winner
//
// Producer: DB trigger `agent_emit_auction_closed` on care_plans.status
// (migration 20260422_agent_fleet.sql lines 269–301). Payload: { care_plan_id }.
//
// For each event Matchmaker fetches the care_plan, all of its bids, and a
// per-bid provider snapshot (rating, completion stats, BGC compliance), asks
// Claude to rank the bids, and writes a `matchmaker.rank` row to agent_actions
// with needs_review=true. Matchmaker NEVER mutates care_plans, bids, or
// provider state — Phase 2 is recommendation-only. Operator promotes a winner
// from the existing review surface (or future Matchmaker-specific UI).
//
// Idempotency: the orchestrator marks events processed after dispatch, but
// retries, manual replays, or re-triggers can still re-deliver the same
// `auction_closed` payload. Before calling Claude we look up agent_actions
// for an existing matchmaker row tied to the same care_plan_id (status in
// proposed/executed/approved) and short-circuit with a `skipped` audit row +
// `{ success:true, reason:'already_ranked', cost_usd:0 }`. Care plans whose
// status is already `awarded` are also short-circuited (`already_awarded`).
// See findExistingMatchmakerAction below.
// ============================================================================

const {
  getSupabase, getAgent, callLLM, logAction,
  authorizeAgentInvocation, jsonResponse, SpendCapError, loadActivePrompt
} = require('./agent-fleet-runtime');

const SLUG = 'matchmaker';

const SYSTEM_PROMPT =
  'You are the Matchmaker agent for My Car Concierge, an automotive service marketplace. ' +
  'Your job: rank the bids submitted on a care plan and recommend a winner. ' +
  'You weigh price, provider rating, completion rate, BGC verification status, ' +
  'and any explicit notes from the bid. You NEVER take action directly — you only ' +
  'recommend; the operator must approve before notifying any provider. ' +
  'Be transparent about trade-offs. Always reply with valid JSON in this exact shape:\n' +
  '{"recommended_winner_bid_id": <bid_id_string|null>, "confidence": 0.0-1.0, ' +
  '"reasoning": "2-4 sentence rationale citing concrete fields", ' +
  '"ranked_bids":[{"bid_id":<bid_id_string>,"score":0.0-1.0,"why":"short rationale"}], ' +
  '"concerns":["short bullet","..."]}';

// ---------------------------------------------------------------------------
// Context loaders. Each is best-effort: a missing referenced row should not
// crash the handler — we still want to log SOMETHING so the operator sees it.
// ---------------------------------------------------------------------------
async function loadCarePlan(supabase, carePlanId) {
  // Real columns per supabase/migrations/20260328_job_board.sql:
  //   id, member_id, vehicle_id, title, description, services (jsonb),
  //   value_min, value_max, service_types (text[]), city, state, zip_code,
  //   lat, lng, status, bid_count, bid_closes_at, created_at, updated_at.
  // The vehicle (year/make/model) is joined via vehicle_id so the LLM can
  // weight bids against the actual car.
  const { data } = await supabase
    .from('care_plans')
    .select(
      'id, status, member_id, title, description, services, service_types, ' +
      'value_min, value_max, city, state, zip_code, bid_closes_at, created_at, ' +
      'vehicle:vehicle_id (year, make, model)'
    )
    .eq('id', carePlanId).maybeSingle();
  return data || { id: carePlanId, missing: true };
}

// Idempotency guard. The orchestrator's at-least-once delivery (and any manual
// replay of an `auction_closed` event) can re-invoke the handler for the same
// care plan. Without this check we would burn another spend-cap allotment and
// write a second `proposed` row, confusing the operator review queue.
//
// Returns the existing matchmaker action row when one is found, otherwise null.
// Match conditions (PostgREST AND of three .or() / .eq() blocks):
//   - agent_slug = 'matchmaker'
//   - action_type in (rank, apply)  — only the two action types that signify
//     "we have already ranked / acted on this care plan". Skipped/error rows
//     don't count: a previous failure should not block a fresh attempt.
//   - care_plan_id matches at EITHER `decision->payload->>care_plan_id`
//     (the rank-row shape this handler writes) OR `decision->>care_plan_id`
//     (the top-level shape that agent-fleet-admin.js's `apply` rows use).
//   - status in (proposed, executed, approved) OR review_status = 'approved'
//     — captures rows that are still "live" in the review queue or already
//     promoted, and skips terminal skipped/error rows.
async function findExistingMatchmakerAction(supabase, carePlanId) {
  const { data, error } = await supabase
    .from('agent_actions')
    .select('id, status, review_status, action_type, created_at')
    .eq('agent_slug', SLUG)
    .in('action_type', ['rank', 'apply'])
    .or(`decision->payload->>care_plan_id.eq.${carePlanId},decision->>care_plan_id.eq.${carePlanId}`)
    .or('status.in.(proposed,executed,approved),review_status.eq.approved')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    console.warn(`[${SLUG}] dedupe lookup failed: ${error.message}`);
    return null;
  }
  return (data && data[0]) || null;
}

async function loadBids(supabase, carePlanId) {
  // Auctions on the job board live in plan_bids (defined in
  // supabase/migrations/20260328_job_board.sql) — NOT the legacy bids table,
  // which belongs to maintenance_packages. Joined via care_plan_id.
  const { data } = await supabase
    .from('plan_bids')
    .select('id, provider_id, amount, note, is_auto_bid, status, created_at')
    .eq('care_plan_id', carePlanId)
    .order('created_at', { ascending: true });
  return data || [];
}

async function loadProviders(supabase, providerIds) {
  if (!providerIds.length) return {};
  const { data } = await supabase
    .from('profiles')
    .select('id, business_name, full_name, city, state, zip_code, ' +
            'avg_rating, review_count, completed_jobs, ' +
            'bgc_badge_verified, bgc_compliance_pct, bgc_employees_total, bgc_employees_compliant, ' +
            'verification_status, created_at')
    .in('id', providerIds);
  const map = {};
  for (const p of data || []) map[p.id] = p;
  return map;
}

async function buildPrompt(supabase, payload, preloadedCarePlan = null) {
  const carePlanId = payload.care_plan_id;
  const carePlan = preloadedCarePlan || await loadCarePlan(supabase, carePlanId);
  const bids = await loadBids(supabase, carePlanId);
  const providers = await loadProviders(supabase, [...new Set(bids.map(b => b.provider_id).filter(Boolean))]);

  const enriched = bids.map(b => ({
    bid_id: b.id,
    provider_id: b.provider_id,
    amount: b.amount,
    is_auto_bid: b.is_auto_bid,
    notes: b.note,
    status: b.status,
    submitted_at: b.created_at,
    provider: providers[b.provider_id] || { id: b.provider_id, missing: true }
  }));

  return {
    bidCount: bids.length,
    text: [
      `EVENT: care_plan.auction_closed (bidding has closed; pick a winner).`,
      `Rank the bids and recommend ONE winner_bid_id (or null if every bid should be rejected).`,
      `Always set needs_review on the operator side — never assume your pick is final.`,
      `Heuristics: lowest reasonable price wins ties on quality; verified BGC providers ` +
      `outrank non-verified at the same price; rating below 3.5 with >= 5 reviews is a yellow flag; ` +
      `missing/incomplete provider profile = manual review.`,
      ``,
      `CARE PLAN:\n${JSON.stringify(carePlan, null, 2)}`,
      ``,
      `BIDS (${bids.length} total):\n${JSON.stringify(enriched, null, 2)}`
    ].join('\n')
  };
}

function parseRanking(text) {
  if (!text) return null;
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

async function handleEvent(supabase, agent, eventEnvelope) {
  const t0 = Date.now();
  const { event, triggered_by: triggeredBy } = eventEnvelope || {};
  const evt = event || eventEnvelope; // tolerate flat shape
  const eventType = evt?.event_type;
  const payload = evt?.payload || {};

  if (eventType !== 'care_plan.auction_closed') {
    await logAction(supabase, {
      agentSlug: SLUG, eventId: evt?.event_id,
      actionType: 'rank', status: 'skipped',
      autonomyUsed: agent.autonomy,
      decision: { event_type: eventType, triggered_by: triggeredBy },
      reasoning: `Unknown event type "${eventType}".`,
      durationMs: Date.now() - t0
    });
    return { skipped: true, reason: 'unknown_event_type' };
  }

  if (!payload.care_plan_id) {
    await logAction(supabase, {
      agentSlug: SLUG, eventId: evt?.event_id,
      actionType: 'rank', status: 'error',
      autonomyUsed: agent.autonomy,
      decision: { event_type: eventType, payload },
      reasoning: 'Payload missing care_plan_id.',
      errorMessage: 'missing_care_plan_id',
      durationMs: Date.now() - t0
    });
    return { error: 'missing_care_plan_id' };
  }

  // ---------- Idempotency guards (run BEFORE the LLM call) ----------------
  // 1) If the care plan is already in a terminal awarded state, the operator
  //    has promoted a winner and there is nothing left to rank. Short-circuit.
  // 2) If we have already produced (or executed) a rank for this care plan,
  //    short-circuit. A retry/replay must not write a second `proposed` row
  //    or burn another spend-cap allotment.
  //
  // Both branches log a `skipped` action so the audit trail captures the
  // duplicate dispatch without polluting the review queue.
  const carePlanRow = await loadCarePlan(supabase, payload.care_plan_id);
  if (carePlanRow && carePlanRow.status === 'awarded') {
    await logAction(supabase, {
      agentSlug: SLUG, eventId: evt?.event_id,
      actionType: 'rank', status: 'skipped',
      autonomyUsed: agent.autonomy,
      decision: { event_type: eventType, payload, care_plan_status: 'awarded' },
      reasoning: 'Care plan is already awarded — nothing to rank.',
      durationMs: Date.now() - t0
    });
    return { success: true, reason: 'already_awarded', care_plan_id: payload.care_plan_id, cost_usd: 0, ms: Date.now() - t0 };
  }

  const existing = await findExistingMatchmakerAction(supabase, payload.care_plan_id);
  if (existing) {
    await logAction(supabase, {
      agentSlug: SLUG, eventId: evt?.event_id,
      actionType: 'rank', status: 'skipped',
      autonomyUsed: agent.autonomy,
      decision: {
        event_type: eventType, payload,
        existing_action_id: existing.id,
        existing_action_status: existing.status,
        existing_action_type: existing.action_type
      },
      reasoning: `Care plan already ranked by matchmaker (action #${existing.id}, status=${existing.status}). Short-circuiting to avoid duplicate proposal.`,
      durationMs: Date.now() - t0
    });
    return {
      success: true,
      reason: 'already_ranked',
      care_plan_id: payload.care_plan_id,
      existing_action_id: existing.id,
      cost_usd: 0,
      ms: Date.now() - t0
    };
  }

  const built = await buildPrompt(supabase, payload, carePlanRow);

  // Skip the LLM call entirely on a 0-bid auction — there is nothing to rank.
  if (built.bidCount === 0) {
    await logAction(supabase, {
      agentSlug: SLUG, eventId: evt?.event_id,
      actionType: 'rank', status: 'proposed',
      autonomyUsed: agent.autonomy,
      needsReview: true,
      decision: { event_type: eventType, payload, recommended_winner_bid_id: null, ranked_bids: [], concerns: ['no bids submitted'] },
      reasoning: 'Auction closed with zero bids — nothing to rank. Operator should re-list or contact providers directly.',
      durationMs: Date.now() - t0
    });
    return { success: true, bidCount: 0, ms: Date.now() - t0 };
  }

  let llmResult;
  try {
    const activeSystem = await loadActivePrompt(supabase, SLUG, SYSTEM_PROMPT);
    llmResult = await callLLM(supabase, agent, {
      prompt: built.text, system: activeSystem, maxTokens: 800, temperature: 0.2
    });
  } catch (e) {
    const isCap = e instanceof SpendCapError;
    await logAction(supabase, {
      agentSlug: SLUG, eventId: evt?.event_id,
      actionType: 'rank',
      status: isCap ? 'skipped' : 'error',
      autonomyUsed: agent.autonomy,
      decision: { event_type: eventType, payload },
      reasoning: isCap ? 'Daily spend cap reached.' : null,
      errorMessage: e.message, durationMs: Date.now() - t0
    });
    return { error: e.message, spend_cap: isCap };
  }

  const parsed = parseRanking(llmResult.text);
  const winner = (typeof parsed?.recommended_winner_bid_id === 'string' && parsed.recommended_winner_bid_id.length >= 8) ? parsed.recommended_winner_bid_id : null;
  const confidence = (typeof parsed?.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1)
    ? parsed.confidence : null;
  const reasoning = parsed?.reasoning || llmResult.text.trim().slice(0, 600);
  const ranked = Array.isArray(parsed?.ranked_bids) ? parsed.ranked_bids : [];
  const concerns = Array.isArray(parsed?.concerns) ? parsed.concerns : [];

  await logAction(supabase, {
    agentSlug: SLUG, eventId: evt?.event_id,
    actionType: 'rank',
    status: 'proposed',
    autonomyUsed: agent.autonomy,
    confidence,
    needsReview: true,
    decision: {
      event_type: eventType,
      payload,
      recommended_winner_bid_id: winner,
      ranked_bids: ranked,
      concerns,
      raw_response: parsed ? null : llmResult.text.slice(0, 1500)
    },
    reasoning,
    tokensIn: llmResult.tokensIn, tokensOut: llmResult.tokensOut,
    costUsd: llmResult.costUsd, durationMs: Date.now() - t0
  });

  return {
    success: true,
    care_plan_id: payload.care_plan_id,
    bid_count: built.bidCount,
    recommended_winner_bid_id: winner,
    confidence,
    cost_usd: llmResult.costUsd,
    ms: Date.now() - t0
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, { ok: true });

  const auth = authorizeAgentInvocation(event);
  if (!auth) return jsonResponse(401, { error: 'Unauthorized' });

  let envelope = {};
  try { envelope = event.body ? JSON.parse(event.body) : {}; } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }

  const supabase = getSupabase();
  const agent = await getAgent(supabase, SLUG);
  if (!agent) return jsonResponse(404, { error: `Unknown agent: ${SLUG}` });
  if (!agent.enabled) {
    return jsonResponse(202, { skipped: true, reason: 'agent_disabled' });
  }

  try {
    const r = await handleEvent(supabase, agent, envelope);
    return jsonResponse(200, r);
  } catch (e) {
    console.error(`[${SLUG}] handler error:`, e);
    return jsonResponse(500, { error: e.message });
  }
};

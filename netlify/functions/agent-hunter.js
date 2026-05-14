// ============================================================================
// MCC Agent Fleet — Hunter
//
// Inbound social-media lead scorer. Subscribes to:
//   social.lead_discovered   → score a prospect surfaced by social-monitor
//   lead.discovered          → reserved for the legacy outreach pipeline
//   campaign.requested       → reserved (handled in a later phase)
//
// For social.lead_discovered events Hunter pulls the social_leads row, asks
// Claude to classify (member|provider|unknown) and score 0.0–1.0, then writes
// a 'hunter.score' agent_actions row with needs_review=true and updates the
// lead row to status='scored' with a foreign-key link back to the action.
//
// Hunter NEVER sends outreach directly — it only proposes. Approved leads
// move to status='approved' via the operator and a future outreach worker.
// ============================================================================

const {
  getSupabase, getAgent, callLLM, logAction,
  authorizeAgentInvocation, jsonResponse, SpendCapError, loadActivePrompt
} = require('./agent-fleet-runtime');

const SLUG = 'hunter';

const SYSTEM_PROMPT =
  'You are the Hunter agent for My Car Concierge, an automotive service marketplace. ' +
  'You score inbound social-media prospects for member or provider acquisition. ' +
  'You NEVER send outreach directly — you only recommend. Be skeptical: most ' +
  'social posts are noise, low-intent, or spam. Score conservatively. ' +
  'Always reply with valid JSON in this exact shape:\n' +
  '{"lead_type":"member|provider|unknown","score":0.0-1.0,' +
  '"intent_signals":["short bullet","..."],' +
  '"draft_outreach":"2-3 sentence first-touch message tailored to the platform tone, or empty string if score < 0.3",' +
  '"reasoning":"2-3 sentence rationale citing specific words/phrases from the post"}';

async function loadSocialLead(supabase, id) {
  if (!id) return null;
  const { data } = await supabase
    .from('social_leads').select('*').eq('id', id).maybeSingle();
  return data;
}

function parseScore(text) {
  if (!text) return null;
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]);
  } catch { return null; }
}

async function handleSocialLead(supabase, agent, evt, t0) {
  const payload = evt.payload || {};
  const lead = await loadSocialLead(supabase, payload.social_lead_id);
  if (!lead) {
    await logAction(supabase, {
      agentSlug: SLUG, eventId: evt.event_id,
      actionType: 'score', status: 'error',
      autonomyUsed: agent.autonomy,
      decision: { event_type: evt.event_type, payload },
      reasoning: 'social_leads row not found.',
      errorMessage: 'lead_not_found',
      durationMs: Date.now() - t0
    });
    return { error: 'lead_not_found' };
  }

  const promptText = [
    `EVENT: social.lead_discovered (a public post mentions car-care or shop ownership).`,
    `Score this lead for outreach worthiness.`,
    `Conservative scoring: 0.8+ only for clear high-intent ("I need a mechanic", "looking for a shop", "want to switch shops").`,
    `0.4-0.7 for ambiguous but plausible. Below 0.3 = noise / spam / venting / off-topic.`,
    ``,
    `PLATFORM: ${lead.platform}`,
    `AUTHOR: ${lead.author_handle || '(unknown)'}`,
    `PROFILE: ${lead.profile_url || '(none)'}`,
    `LEAD_HINT: ${lead.lead_type || 'unknown'}  (from monitor — verify or override)`,
    `POSTED_TEXT:\n${(lead.raw_text || '').slice(0, 2000)}`,
    ``,
    `CONTEXT:\n${JSON.stringify(lead.context || {}, null, 2)}`
  ].join('\n');

  let llmResult;
  try {
    const activeSystem = await loadActivePrompt(supabase, SLUG, SYSTEM_PROMPT);
    llmResult = await callLLM(supabase, agent, {
      prompt: promptText, system: activeSystem, maxTokens: 500, temperature: 0.3
    });
  } catch (e) {
    const isCap = e instanceof SpendCapError;
    await logAction(supabase, {
      agentSlug: SLUG, eventId: evt.event_id,
      actionType: 'score',
      status: isCap ? 'skipped' : 'error',
      autonomyUsed: agent.autonomy,
      decision: { event_type: evt.event_type, payload, social_lead_id: lead.id },
      reasoning: isCap ? 'Daily spend cap reached.' : null,
      errorMessage: e.message, durationMs: Date.now() - t0
    });
    return { error: e.message, spend_cap: isCap };
  }

  const parsed = parseScore(llmResult.text);
  const leadType = ['member','provider','unknown'].includes(parsed?.lead_type) ? parsed.lead_type : 'unknown';
  const score = (parsed && typeof parsed.score === 'number' && parsed.score >= 0 && parsed.score <= 1) ? parsed.score : null;
  const reasoning = parsed?.reasoning || llmResult.text.trim().slice(0, 600);
  const draft = (parsed?.draft_outreach || '').toString().slice(0, 800);
  const signals = Array.isArray(parsed?.intent_signals) ? parsed.intent_signals : [];

  // Write the agent_actions row first so we can foreign-key from social_leads.
  const inserted = await logAction(supabase, {
    agentSlug: SLUG, eventId: evt.event_id,
    actionType: 'score',
    status: 'proposed',
    autonomyUsed: agent.autonomy,
    confidence: score,
    needsReview: true,
    decision: {
      event_type: evt.event_type,
      social_lead_id: lead.id,
      platform: lead.platform,
      profile_url: lead.profile_url,
      lead_type: leadType,
      score,
      intent_signals: signals,
      draft_outreach: draft,
      raw_response: parsed ? null : llmResult.text.slice(0, 1500)
    },
    reasoning,
    tokensIn: llmResult.tokensIn, tokensOut: llmResult.tokensOut,
    costUsd: llmResult.costUsd, durationMs: Date.now() - t0
  });

  await supabase.from('social_leads').update({
    status: 'scored',
    lead_type: leadType,
    score,
    agent_action_id: inserted?.id || null
  }).eq('id', lead.id);

  return { success: true, social_lead_id: lead.id, score, lead_type: leadType, cost_usd: llmResult.costUsd, ms: Date.now() - t0 };
}

async function handleEvent(supabase, agent, eventEnvelope) {
  const t0 = Date.now();
  const evt = eventEnvelope?.event || eventEnvelope;
  const eventType = evt?.event_type;

  if (eventType === 'social.lead_discovered') {
    return handleSocialLead(supabase, agent, evt, t0);
  }

  // Other subscribed events (lead.discovered, campaign.requested) are
  // reserved for the legacy outreach pipeline; log and skip for now.
  await logAction(supabase, {
    agentSlug: SLUG, eventId: evt?.event_id,
    actionType: 'score', status: 'skipped',
    autonomyUsed: agent.autonomy,
    decision: { event_type: eventType },
    reasoning: `Event type "${eventType}" reserved for future Hunter scope.`,
    durationMs: Date.now() - t0
  });
  return { skipped: true, reason: 'reserved_event_type' };
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
  if (!agent.enabled) return jsonResponse(202, { skipped: true, reason: 'agent_disabled' });

  try {
    const r = await handleEvent(supabase, agent, envelope);
    return jsonResponse(200, r);
  } catch (e) {
    console.error(`[${SLUG}] handler error:`, e);
    return jsonResponse(500, { error: e.message });
  }
};

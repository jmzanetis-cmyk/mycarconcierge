// ============================================================================
// MCC Agent Fleet — Promoter
//
// Outbound social-media post drafter. Subscribes to:
//   social.post_requested  → draft a platform-appropriate post for the
//                            requested audience (member / provider / mixed)
//
// Producers (today): the admin console's "Request a draft" button — emits
// the event manually with { platform, audience, brief }. A future scheduled
// emitter could request weekly drafts per channel.
//
// For each event Promoter writes:
//   - one social_posts row (status='draft')
//   - one agent_actions row (action_type='draft', needs_review=true,
//     decision links to the social_post id)
//
// Promoter NEVER publishes — the operator approves drafts and the publish
// path goes through the channel adapter via a separate admin endpoint
// (POST /admin/social/posts/:id/publish, to be wired in a follow-up).
// ============================================================================

const {
  getSupabase, getAgent, callLLM, logAction,
  authorizeAgentInvocation, jsonResponse, SpendCapError, loadActivePrompt
} = require('./agent-fleet-runtime');

const SLUG = 'promoter';

const PLATFORM_TONE = {
  reddit:    'Conversational, helpful, no marketing speak. Lead with value, ask a question.',
  x:        'Punchy, ≤ 280 chars, 1-2 emojis max, plain language, optional 1 hashtag.',
  facebook:  'Warm, community-oriented, 2-4 short paragraphs OK, soft CTA.',
  instagram: 'Visual-first caption, 3-5 lines, line breaks for rhythm, 5-10 hashtags at the end.',
  tiktok:    'Hook in line 1, casual tone, 3-5 lines, 3-5 hashtags including #fyp.',
  linkedin:  'Professional, B2B-aware, 3-6 short paragraphs, end with a question or CTA.'
};

const SYSTEM_PROMPT =
  'You are the Promoter agent for My Car Concierge, an automotive service marketplace. ' +
  'You draft outbound social-media posts for member acquisition (car owners) or provider ' +
  'acquisition (mechanics, shop owners). You NEVER publish — you only draft. The operator ' +
  'reviews every post before it goes live. Be authentic, never spammy, never make claims ' +
  'about pricing or availability you can\'t back up. Always reply with valid JSON in this ' +
  'exact shape:\n' +
  '{"body":"the post copy","suggested_media":"description of an image/video that would pair well, or empty string",' +
  '"call_to_action":"one short CTA like \\"DM us your zip\\" or \\"Comment your car make\\"",' +
  '"reasoning":"2-3 sentence rationale for tone and angle"}';

function parseDraft(text) {
  if (!text) return null;
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]);
  } catch { return null; }
}

async function handlePostRequest(supabase, agent, evt, t0) {
  const payload = evt.payload || {};
  const platform = (payload.platform || '').toLowerCase();
  const audience = ['member','provider','mixed'].includes(payload.audience) ? payload.audience : 'mixed';
  const brief = (payload.brief || '').toString().slice(0, 1500);

  if (!PLATFORM_TONE[platform]) {
    await logAction(supabase, {
      agentSlug: SLUG, eventId: evt.event_id,
      actionType: 'draft', status: 'error',
      autonomyUsed: agent.autonomy,
      decision: { event_type: evt.event_type, payload },
      reasoning: `Unsupported platform "${platform}".`,
      errorMessage: 'unsupported_platform',
      durationMs: Date.now() - t0
    });
    return { error: 'unsupported_platform' };
  }

  const promptText = [
    `EVENT: social.post_requested`,
    `Platform: ${platform}`,
    `Platform tone guide: ${PLATFORM_TONE[platform]}`,
    `Audience: ${audience} (${audience === 'member' ? 'car owners' : audience === 'provider' ? 'mechanics / shop owners' : 'mixed'})`,
    `Brand: My Car Concierge — "Your complete auto ownership platform". Tone: professional, informative, witty without being gimmicky.`,
    ``,
    `Operator brief:\n${brief || '(no specific brief — draft a general acquisition post for this audience)'}`,
    ``,
    `Constraints: never quote prices; never claim performance metrics; ` +
    `never name specific competitors; never make medical/safety claims about repair work. ` +
    `If the brief asks for something off-brand or unsafe, set body to "" and explain in reasoning.`
  ].join('\n');

  let llmResult;
  try {
    const activeSystem = await loadActivePrompt(supabase, SLUG, SYSTEM_PROMPT);
    llmResult = await callLLM(supabase, agent, {
      prompt: promptText, system: activeSystem, maxTokens: 700, temperature: 0.7
    });
  } catch (e) {
    const isCap = e instanceof SpendCapError;
    await logAction(supabase, {
      agentSlug: SLUG, eventId: evt.event_id,
      actionType: 'draft',
      status: isCap ? 'skipped' : 'error',
      autonomyUsed: agent.autonomy,
      decision: { event_type: evt.event_type, payload },
      reasoning: isCap ? 'Daily spend cap reached.' : null,
      errorMessage: e.message, durationMs: Date.now() - t0
    });
    return { error: e.message, spend_cap: isCap };
  }

  const parsed = parseDraft(llmResult.text);
  const body = (parsed?.body || '').toString().slice(0, 4000);
  const cta = (parsed?.call_to_action || '').toString().slice(0, 200);
  const suggestedMedia = (parsed?.suggested_media || '').toString().slice(0, 500);
  const reasoning = parsed?.reasoning || llmResult.text.trim().slice(0, 600);

  if (!body.trim()) {
    await logAction(supabase, {
      agentSlug: SLUG, eventId: evt.event_id,
      actionType: 'draft',
      status: 'proposed',
      autonomyUsed: agent.autonomy,
      needsReview: true,
      decision: { event_type: evt.event_type, payload, refused: true, suggested_media: suggestedMedia },
      reasoning: reasoning || 'Promoter declined to draft (off-brand or unsafe brief).',
      tokensIn: llmResult.tokensIn, tokensOut: llmResult.tokensOut,
      costUsd: llmResult.costUsd, durationMs: Date.now() - t0
    });
    return { success: true, refused: true };
  }

  // Persist the draft, then write the audit action linking back. We carry
  // variant_group / variant_index / variant_total straight off the event
  // payload so the admin posts table can cluster sibling variants side-by-side.
  const { data: post, error: postErr } = await supabase
    .from('social_posts')
    .insert({
      platform, audience, body,
      status: 'draft',
      channel_id: payload.channel_id || null,
      variant_group: payload.variant_group || null,
      variant_index: Number.isInteger(payload.variant_index) ? payload.variant_index : null,
      variant_total: Number.isInteger(payload.variant_total) ? payload.variant_total : null
    })
    .select('id').single();
  if (postErr) {
    await logAction(supabase, {
      agentSlug: SLUG, eventId: evt.event_id,
      actionType: 'draft', status: 'error',
      autonomyUsed: agent.autonomy,
      decision: { event_type: evt.event_type, payload, body_preview: body.slice(0, 200) },
      reasoning: 'Could not persist draft: ' + postErr.message,
      errorMessage: postErr.message,
      durationMs: Date.now() - t0
    });
    return { error: postErr.message };
  }

  const action = await logAction(supabase, {
    agentSlug: SLUG, eventId: evt.event_id,
    actionType: 'draft',
    status: 'proposed',
    autonomyUsed: agent.autonomy,
    needsReview: true,
    decision: {
      event_type: evt.event_type,
      social_post_id: post.id,
      platform, audience,
      body, call_to_action: cta,
      suggested_media: suggestedMedia
    },
    reasoning,
    tokensIn: llmResult.tokensIn, tokensOut: llmResult.tokensOut,
    costUsd: llmResult.costUsd, durationMs: Date.now() - t0
  });

  // Backfill the FK on the post row.
  if (action?.id) {
    await supabase.from('social_posts').update({ agent_action_id: action.id }).eq('id', post.id);
  }

  return { success: true, social_post_id: post.id, platform, audience, cost_usd: llmResult.costUsd, ms: Date.now() - t0 };
}

async function handleEvent(supabase, agent, eventEnvelope) {
  const t0 = Date.now();
  const evt = eventEnvelope?.event || eventEnvelope;
  if (evt?.event_type === 'social.post_requested') {
    return handlePostRequest(supabase, agent, evt, t0);
  }
  await logAction(supabase, {
    agentSlug: SLUG, eventId: evt?.event_id,
    actionType: 'draft', status: 'skipped',
    autonomyUsed: agent.autonomy,
    decision: { event_type: evt?.event_type },
    reasoning: `Unknown event type "${evt?.event_type}".`,
    durationMs: Date.now() - t0
  });
  return { skipped: true, reason: 'unknown_event_type' };
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

// ============================================================================
// MCC Agent Fleet — Orchestrator
// Scheduled every minute. Drains unprocessed agent_events, looks up handler
// agents in the registry, and dispatches via internal HTTP fire-and-forget
// to each agent's background-function endpoint. Marks events processed.
// ============================================================================

const {
  getSupabase, listAgents, eventMatches, logAction, jsonResponse,
  authorizeAgentInvocation, assertRateLimit
} = require('./agent-fleet-runtime');

const ORCHESTRATOR_SLUG = 'orchestrator';
const MAX_EVENTS_PER_TICK = 50;

function siteBaseUrl(event) {
  // Prefer explicit env, then Netlify-provided URL, then the request itself.
  return process.env.URL
    || process.env.DEPLOY_PRIME_URL
    || (event && event.headers && event.headers.host
          ? `https://${event.headers.host}`
          : 'https://mycarconcierge.com');
}

async function dispatchEvent(baseUrl, agent, evt) {
  if (!agent.endpoint) return { ok: false, reason: 'no_endpoint' };
  try {
    const url = `${baseUrl}${agent.endpoint}`;
    // Background functions return 202 immediately; we await but never block on the agent's work.
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-fleet-source': 'orchestrator'
      },
      body: JSON.stringify({ event_id: evt.id, event_type: evt.event_type, payload: evt.payload })
    });
    // Treat only true success codes as routed. Background functions reply 202;
    // anything else (404 missing endpoint, 401 auth, 4xx/5xx) is a delivery
    // failure that must be surfaced — not silently masked.
    const ok = r.status === 200 || r.status === 201 || r.status === 202 || r.status === 204;
    return { ok, status: r.status };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

async function runTick(event, triggeredBy) {
  const t0 = Date.now();
  const supabase = getSupabase();
  if (!supabase) return { skipped: true, reason: 'no_database' };

  // DB-backed cooldown — caps cost of any spoofed-scheduled spam to one
  // tick per 30s. Admin invocations bypass the limit.
  if (triggeredBy !== 'admin') {
    const rl = await assertRateLimit(supabase, ORCHESTRATOR_SLUG, 30);
    if (!rl.allowed) return { skipped: true, reason: 'rate_limited', retry_in_s: rl.retry_in_s };
  }

  const agents = await listAgents(supabase);
  const orchestrator = agents.find(a => a.slug === ORCHESTRATOR_SLUG);
  if (!orchestrator || !orchestrator.enabled) {
    return { skipped: true, reason: 'orchestrator_disabled' };
  }

  // Pull unprocessed events.
  const { data: events, error } = await supabase
    .from('agent_events')
    .select('id, event_type, payload, source, created_at')
    .is('processed_at', null)
    .order('created_at', { ascending: true })
    .limit(MAX_EVENTS_PER_TICK);
  if (error) throw new Error(`fetch events failed: ${error.message}`);

  if (!events || events.length === 0) {
    return { processed: 0, ms: Date.now() - t0 };
  }

  const baseUrl = siteBaseUrl(event);
  const enabledHandlers = agents.filter(a =>
    a.enabled && a.slug !== ORCHESTRATOR_SLUG && Array.isArray(a.handles_events)
  );

  let processed = 0;
  for (const evt of events) {
    const matched = enabledHandlers.filter(a =>
      a.handles_events.some(p => eventMatches(p, evt.event_type))
    );
    const routedTo = [];
    let dispatchError = null;

    for (const agent of matched) {
      const r = await dispatchEvent(baseUrl, agent, evt);
      if (r.ok) routedTo.push(agent.slug);
      else dispatchError = `${agent.slug}: ${r.reason || 'http_' + r.status}`;
    }

    await supabase
      .from('agent_events')
      .update({
        processed_at: new Date().toISOString(),
        routed_to: routedTo,
        error: dispatchError
      })
      .eq('id', evt.id);

    await logAction(supabase, {
      agentSlug: ORCHESTRATOR_SLUG,
      eventId: evt.id,
      actionType: 'route_event',
      status: matched.length === 0 ? 'skipped' : (dispatchError ? 'error' : 'completed'),
      autonomyUsed: 'autonomous',
      decision: { event_type: evt.event_type, matched: matched.map(a => a.slug), routed_to: routedTo },
      reasoning: matched.length === 0
        ? `No enabled handler for "${evt.event_type}".`
        : `Routed to ${routedTo.length} handler(s).`,
      durationMs: 0,
      errorMessage: dispatchError
    });

    processed++;
  }

  return { processed, events: events.length, ms: Date.now() - t0 };
}

exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, { ok: true });

  // Reject every unauthenticated public HTTP call. Only two callers are valid:
  //   1) Netlify Scheduled Function invocation (body has `next_run`)
  //   2) Manual admin trigger with valid x-admin-password header
  const auth = authorizeAgentInvocation(event);
  if (!auth) return jsonResponse(401, { error: 'Unauthorized' });

  try {
    const result = await runTick(event, auth);
    result.triggered_by = auth;
    console.log('[Orchestrator]', JSON.stringify(result));
    return jsonResponse(200, result);
  } catch (e) {
    console.error('[Orchestrator] error:', e.message);
    return jsonResponse(200, { error: e.message });
  }
};

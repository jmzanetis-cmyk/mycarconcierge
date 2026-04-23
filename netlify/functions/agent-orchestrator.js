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
// DLQ: how many dispatch attempts before an event is dead-lettered.
// Counts the FIRST attempt as 1, so MAX_DISPATCH_ATTEMPTS=3 means 1 initial
// + 2 retries before DLQ.
const MAX_DISPATCH_ATTEMPTS = 3;
// Exponential backoff base in seconds. Schedule: 30s, 120s, 480s ...
const RETRY_BACKOFF_BASE_S = 30;

function siteBaseUrl(event) {
  // MCC_INTERNAL_FN_BASE takes precedence so we can route function-to-function
  // calls over the *.netlify.app subdomain when the primary domain has TLS
  // issues (mismatched cert, custom-domain provisioning lag, etc).
  return process.env.MCC_INTERNAL_FN_BASE
    || process.env.URL
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

  // Pull unprocessed events. Skip rows whose retry backoff hasn't elapsed.
  const nowIso = new Date().toISOString();
  const { data: events, error } = await supabase
    .from('agent_events')
    .select('id, event_type, payload, source, created_at, attempts')
    .is('processed_at', null)
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
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
  let retried = 0;
  let deadLettered = 0;
  for (const evt of events) {
    const matched = enabledHandlers.filter(a =>
      a.handles_events.some(p => eventMatches(p, evt.event_type))
    );
    const routedTo = [];
    const failures = [];

    for (const agent of matched) {
      const r = await dispatchEvent(baseUrl, agent, evt);
      if (r.ok) routedTo.push(agent.slug);
      else failures.push(`${agent.slug}: ${r.reason || 'http_' + r.status}`);
    }

    const dispatchError = failures.length ? failures.join('; ') : null;
    // Retry decision: if at least one handler matched AND none succeeded, the
    // event is a delivery failure — apply backoff and retry until
    // MAX_DISPATCH_ATTEMPTS, then dead-letter. Partial success (some handlers
    // routed, others failed) is still treated as processed: re-dispatching
    // would double-fire the successful handlers.
    const isDeliveryFailure = matched.length > 0 && routedTo.length === 0;
    const newAttempts = (evt.attempts || 0) + 1;
    const exhausted = newAttempts >= MAX_DISPATCH_ATTEMPTS;
    const nowTs = new Date();

    if (isDeliveryFailure && !exhausted) {
      // Schedule retry via exponential backoff. Do NOT set processed_at.
      const backoffSec = RETRY_BACKOFF_BASE_S * Math.pow(4, newAttempts - 1);
      const nextRetry = new Date(nowTs.getTime() + backoffSec * 1000);
      await supabase
        .from('agent_events')
        .update({
          attempts: newAttempts,
          last_attempt_at: nowTs.toISOString(),
          last_error: dispatchError,
          next_retry_at: nextRetry.toISOString()
        })
        .eq('id', evt.id);
      retried++;
    } else {
      // Either success/partial-success/no-handlers, OR retries exhausted.
      // Mark processed; on exhaustion also append to the DLQ.
      await supabase
        .from('agent_events')
        .update({
          processed_at: nowTs.toISOString(),
          routed_to: routedTo,
          error: dispatchError,
          attempts: newAttempts,
          last_attempt_at: nowTs.toISOString(),
          last_error: dispatchError
        })
        .eq('id', evt.id);

      if (isDeliveryFailure && exhausted) {
        const { error: dlqErr } = await supabase.from('agent_dead_letter').insert({
          original_event_id: evt.id,
          event_type: evt.event_type,
          payload: evt.payload || {},
          source: evt.source || null,
          attempts: newAttempts,
          final_error: dispatchError
        });
        if (dlqErr) console.error('[Orchestrator] DLQ insert failed:', dlqErr.message);
        else deadLettered++;
      }
      processed++;
    }

    await logAction(supabase, {
      agentSlug: ORCHESTRATOR_SLUG,
      eventId: evt.id,
      actionType: 'route_event',
      status: matched.length === 0
        ? 'skipped'
        : (isDeliveryFailure
            ? (exhausted ? 'error' : 'error')
            : (dispatchError ? 'completed' : 'completed')),
      autonomyUsed: 'autonomous',
      decision: {
        event_type: evt.event_type,
        matched: matched.map(a => a.slug),
        routed_to: routedTo,
        attempts: newAttempts,
        retry_scheduled: isDeliveryFailure && !exhausted,
        dead_lettered: isDeliveryFailure && exhausted
      },
      reasoning: matched.length === 0
        ? `No enabled handler for "${evt.event_type}".`
        : (isDeliveryFailure
            ? (exhausted
                ? `All ${matched.length} handler(s) failed; attempts=${newAttempts} → dead-letter.`
                : `All ${matched.length} handler(s) failed; attempts=${newAttempts} → retry scheduled.`)
            : `Routed to ${routedTo.length}/${matched.length} handler(s).`),
      durationMs: 0,
      errorMessage: dispatchError
    });
  }

  return { processed, retried, dead_lettered: deadLettered, events: events.length, ms: Date.now() - t0 };
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

// ============================================================================
// Task #161 — Gatekeeper smoke test core (extended Task #206 — Matchmaker /
// Treasurer)
//
// Shared smoke-run engine used by every agent's daily smoke:
//   - scripts/gatekeeper-enable-smoke.js (operator-supervised CLI runner)
//   - netlify/functions/gatekeeper-smoke-scheduled.js (daily cron)
//   - netlify/functions/matchmaker-smoke-scheduled.js (daily cron, Task #206)
//   - netlify/functions/treasurer-smoke-scheduled.js  (daily cron, Task #206)
//
// The smoke fires one synthetic event of each agent-subscribed type via the
// same admin HTTPS surface real callers use, forces an orchestrator tick,
// then polls agent_actions for a proposed row tied to each event_id. A clean
// pass means the trigger → bus → orchestrator → handler → DB pipeline is
// healthy end-to-end.
//
// Synthetic events carry `__smoke=true` in their payload so they're easy to
// identify in the admin queue (the agent stores the input payload on the
// agent_actions.decision row; the admin UI surfaces a "Smoke" badge from it).
//
// `runAgentSmoke` (the generic factory) takes the agent-specific bits as
// parameters: slug, allowed-cap, the synthetic-payload generator for each
// event type it subscribes to, and an action validator that decides whether
// the row the orchestrator produced counts as a clean proposal. The original
// `runGatekeeperSmoke` is now a thin wrapper that supplies the gatekeeper
// flavour. Matchmaker/Treasurer wrappers live in their own scheduled files.
//
// Returns a structured result the caller can both:
//   - Pretty-print to stdout (operator runner)
//   - Persist to agent_smoke_runs + alert on failure (scheduled runner)
// ============================================================================

const crypto = require('node:crypto');

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS  = 60_000;

// Gatekeeper-specific cap expectation (kept for back-compat exports). Other
// agents pass their own cap to runAgentSmoke.
const SPEND_CAP_USD    = 3.0;

// Logger interface: { pass(msg), fail(msg), info(msg) }. The CLI runner uses
// console.log / console.error; the scheduled runner can pass a no-op.
const NULL_LOGGER = { pass: () => {}, fail: () => {}, info: () => {} };

// ---------------------------------------------------------------------------
// Synthetic payload builders.
// ---------------------------------------------------------------------------
// Gatekeeper events — original behaviour preserved exactly so the existing
// scheduled runner and operator CLI keep producing identical payloads.
function syntheticPayloadFor(eventType) {
  const base = { __smoke: true, smoked_at: new Date().toISOString() };
  if (eventType === 'provider.applied') {
    return { ...base,
      provider_id:   crypto.randomUUID(),
      business_name: 'Smoke Test Garage',
      full_name:     'Smoke Tester',
      email:         'smoke@example.test',
      phone:         '+15555550100',
      previous_role: null
    };
  }
  if (eventType === 'provider.bgc_completed') {
    return { ...base,
      provider_id: crypto.randomUUID(),
      employee_id: crypto.randomUUID(),
      check_id:    crypto.randomUUID(),
      status:      'clear',
      result:      'pass',
      ran_at:      new Date().toISOString()
    };
  }
  if (eventType === 'provider.flagged') {
    return { ...base,
      provider_id:   crypto.randomUUID(),
      business_name: 'Flagged Smoke Garage',
      previous_role: 'provider',
      reason:        'role_changed_to_suspended'
    };
  }
  return base;
}

// Matchmaker — synthetic auction. The care_plan_id is a fresh UUID that
// won't resolve in care_plans; matchmaker's loadCarePlan returns
// `{id, missing:true}`, loadBids returns [], and the handler short-circuits
// to a `proposed` rank row with recommended_winner_bid_id=null. That's a
// valid proposal shape — the smoke is testing the trigger → bus →
// orchestrator → handler → DB wiring, not the LLM's bid-ranking judgment.
function syntheticMatchmakerPayloadFor(eventType) {
  const base = { __smoke: true, smoked_at: new Date().toISOString() };
  if (eventType === 'care_plan.auction_closed') {
    return { ...base, care_plan_id: crypto.randomUUID() };
  }
  return base;
}

// Treasurer — synthetic spend events for each of its three subscriptions.
// IDs are fresh UUIDs; the handler can fetch context but the wiring path is
// what the smoke is verifying.
function syntheticTreasurerPayloadFor(eventType) {
  const base = { __smoke: true, smoked_at: new Date().toISOString() };
  if (eventType === 'payment.captured') {
    return { ...base,
      payment_id:    crypto.randomUUID(),
      care_plan_id:  crypto.randomUUID(),
      provider_id:   crypto.randomUUID(),
      member_id:     crypto.randomUUID(),
      amount:        100.00,
      currency:      'usd',
      captured_at:   new Date().toISOString()
    };
  }
  if (eventType === 'payment.refund_requested') {
    return { ...base,
      payment_id:    crypto.randomUUID(),
      care_plan_id:  crypto.randomUUID(),
      member_id:     crypto.randomUUID(),
      amount:        50.00,
      currency:      'usd',
      reason:        'smoke_test',
      requested_at:  new Date().toISOString()
    };
  }
  if (eventType === 'payout.failed') {
    return { ...base,
      payout_id:     crypto.randomUUID(),
      provider_id:   crypto.randomUUID(),
      amount:        75.00,
      currency:      'usd',
      failure_code:  'smoke_test',
      failed_at:     new Date().toISOString()
    };
  }
  return base;
}

// ---------------------------------------------------------------------------
// Per-agent action validators. Return null on success, or a short string id
// describing why the row failed validation (gets pushed onto failed_checks).
// ---------------------------------------------------------------------------
function validateGatekeeperAction(row) {
  const rec = (row.decision && row.decision.recommendation) || null;
  if (row.status === 'proposed' && rec) return null;
  if (row.status === 'error') return `action_error: ${row.error_message || 'unknown'}`;
  return `bad_status:${row.status}|rec:${rec || 'none'}`;
}

function validateMatchmakerAction(row, context) {
  if (row.status === 'error') return `action_error: ${row.error_message || 'unknown'}`;
  if (row.status !== 'proposed') return `bad_status:${row.status}`;
  // The matchmaker rank shape always carries a `recommended_winner_bid_id`
  // key on the decision (may be null on 0-bid synthetic auctions).
  if (!row.decision || !Object.prototype.hasOwnProperty.call(row.decision, 'recommended_winner_bid_id')) {
    return 'missing_winner_bid_id_field';
  }
  // Task #301: when the smoke seeded a real auction with bids, the LLM ranking
  // path must have actually run — winner must be non-null AND must be one of
  // the seeded bid_ids. A null here means the LLM call/parse silently regressed.
  if (context && Array.isArray(context.bidIds) && context.bidIds.length > 0) {
    const winner = row.decision.recommended_winner_bid_id;
    if (!winner) return 'winner_bid_id_null_on_seeded_auction';
    if (!context.bidIds.includes(winner)) return `winner_bid_id_not_in_seeded_set:${winner}`;
  }
  return null;
}

function validateTreasurerAction(row) {
  if (row.status === 'error') return `action_error: ${row.error_message || 'unknown'}`;
  if (row.status !== 'proposed') return `bad_status:${row.status}`;
  return null;
}

function makeAdminClient(siteUrl, adminPassword) {
  const base = String(siteUrl || '').replace(/\/+$/, '');
  return {
    async post(route, body) {
      const r = await fetch(`${base}/api/admin/agent-fleet/${route}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-password': adminPassword
        },
        body: JSON.stringify(body || {})
      });
      const text = await r.text();
      let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
      return { ok: r.ok, status: r.status, body: parsed };
    }
  };
}

async function checkRegistry(supabase, agentSlug, expectedEvents, expectedMaxCapUsd, log, failures) {
  log.info(`1. Verifying registry row for ${agentSlug}`);
  const { data, error } = await supabase
    .from('agents')
    .select('slug, enabled, autonomy, daily_spend_cap_usd, model, handles_events, endpoint')
    .eq('slug', agentSlug)
    .maybeSingle();
  if (error) { failures.push(`registry_query: ${error.message}`); log.fail(`registry query: ${error.message}`); return null; }
  if (!data)  { failures.push('registry_missing'); log.fail(`registry has no row for ${agentSlug}`); return null; }

  if (data.enabled !== true) {
    failures.push(`registry_enabled=${data.enabled}`);
    log.fail(`enabled is ${data.enabled} (expected true) — apply the enable migration first`);
  } else log.pass('enabled = true');

  if (data.autonomy !== 'propose') {
    failures.push(`registry_autonomy=${data.autonomy}`);
    log.fail(`autonomy is "${data.autonomy}" (expected "propose")`);
  } else log.pass('autonomy = propose');

  if (Number(data.daily_spend_cap_usd) > expectedMaxCapUsd) {
    failures.push(`registry_cap=${data.daily_spend_cap_usd}`);
    log.fail(`daily_spend_cap_usd is $${data.daily_spend_cap_usd} (expected ≤ $${expectedMaxCapUsd})`);
  } else log.pass(`daily_spend_cap_usd = $${data.daily_spend_cap_usd}`);

  const actualEvents = data.handles_events || [];
  for (const t of expectedEvents) {
    if (!actualEvents.includes(t)) {
      failures.push(`registry_handles_missing:${t}`);
      log.fail(`handles_events missing "${t}"`);
    }
  }
  if (expectedEvents.every(t => actualEvents.includes(t))) {
    log.pass(`handles_events = [${actualEvents.join(', ')}]`);
  }

  if (!data.endpoint) {
    failures.push('registry_endpoint_empty');
    log.fail('endpoint column is empty (orchestrator cannot dispatch)');
  } else log.pass(`endpoint = ${data.endpoint}`);

  return data;
}

async function checkSpendHeadroom(supabase, agentSlug, capUsd, log, failures) {
  log.info("2. Verifying today's spend headroom");
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('agent_daily_spend')
    .select('reserved_usd, actual_usd, call_count, day')
    .eq('agent_slug', agentSlug)
    .eq('day', today)
    .maybeSingle();
  if (error) { failures.push(`spend_query: ${error.message}`); log.fail(`spend query: ${error.message}`); return; }
  const reserved = Number(data?.reserved_usd || 0);
  const actual   = Number(data?.actual_usd || 0);
  const total    = reserved + actual;
  const calls    = data?.call_count || 0;
  if (total >= capUsd) {
    failures.push(`spend_at_cap:${total.toFixed(4)}`);
    log.fail(`today's reserved+actual = $${total.toFixed(4)} already at/over $${capUsd} cap`);
  } else {
    log.pass(`today's reserved+actual = $${total.toFixed(4)} (${calls} calls so far) — headroom intact`);
  }
}

async function emitSyntheticEvent(admin, eventType, payload, log, failures) {
  const r = await admin.post('test-event', { event_type: eventType, payload });
  if (!r.ok) {
    failures.push(`emit_${eventType}_http_${r.status}`);
    log.fail(`emit ${eventType}: HTTP ${r.status} — ${JSON.stringify(r.body)}`);
    return null;
  }
  if (!r.body.event_id) {
    failures.push(`emit_${eventType}_no_event_id`);
    log.fail(`emit ${eventType}: response missing event_id — ${JSON.stringify(r.body)}`);
    return null;
  }
  log.pass(`emitted ${eventType} → event_id=${r.body.event_id}`);
  return r.body.event_id;
}

async function forceOrchestratorTick(admin, log, failures) {
  log.info('4. Forcing an orchestrator tick (rather than waiting for cron)');
  const r = await admin.post('run/orchestrator', { source: 'admin:smoke' });
  if (!r.ok) {
    failures.push(`orchestrator_tick_http_${r.status}`);
    log.fail(`run/orchestrator: HTTP ${r.status} — ${JSON.stringify(r.body)}`);
    return;
  }
  log.pass(`orchestrator tick fired: ${JSON.stringify(r.body).slice(0, 220)}`);
}

async function pollForProposal(supabase, agentSlug, eventId, eventType, log, failures, opts = {}) {
  const timeoutMs  = opts.pollTimeoutMs  ?? POLL_TIMEOUT_MS;
  const intervalMs = opts.pollIntervalMs ?? POLL_INTERVAL_MS;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data, error } = await supabase
      .from('agent_actions')
      .select('id, agent_slug, event_id, status, decision, reasoning, confidence, cost_usd, duration_ms, error_message, created_at')
      .eq('agent_slug', agentSlug)
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) {
      failures.push(`poll_${eventType}: ${error.message}`);
      log.fail(`poll ${eventType} (event_id=${eventId}): ${error.message}`);
      return null;
    }
    if (data?.length) return data[0];
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return null;
}

// ---------------------------------------------------------------------------
// runAgentSmoke — generic agent smoke runner (Task #206).
//   opts.supabase            — service-role supabase client (required)
//   opts.siteUrl             — e.g. 'https://mycarconcierge.com' (required)
//   opts.adminPassword       — admin password header value (required)
//   opts.agentSlug           — e.g. 'gatekeeper' / 'matchmaker' / 'treasurer'
//   opts.eventTypes          — string[] of event types to fire one each of
//   opts.payloadFn           — (eventType) => synthetic payload object
//   opts.validateAction      — (row) => null | reasonString
//   opts.expectedMaxCapUsd   — number; registry-cap upper bound
//   opts.log                 — { pass, fail, info } (optional)
// ---------------------------------------------------------------------------
// Validate the runAgentSmoke options bag. Throws on the first missing or
// wrong-typed field so the caller's catch records the precise reason.
function _validateRunAgentSmokeOpts(opts) {
  if (!opts.supabase) throw new Error('runAgentSmoke: supabase client is required');
  if (!opts.siteUrl) throw new Error('runAgentSmoke: siteUrl is required');
  if (!opts.adminPassword) throw new Error('runAgentSmoke: adminPassword is required');
  if (!opts.agentSlug) throw new Error('runAgentSmoke: agentSlug is required');
  if (!Array.isArray(opts.eventTypes) || !opts.eventTypes.length) throw new Error('runAgentSmoke: eventTypes is required');
  if (typeof opts.payloadFn !== 'function') throw new Error('runAgentSmoke: payloadFn is required');
  if (typeof opts.validateAction !== 'function') throw new Error('runAgentSmoke: validateAction is required');
}

// Build the per-event summary entry from a polled action row and record
// validation failures on the failures[] list. Returns the entry the caller
// pushes onto summary.events.
function _eventEntryForAction(t, eventId, row, validateAction, log, failures, context) {
  const rec = (row.decision && (row.decision.recommendation || row.decision.recommended_winner_bid_id)) || null;
  const conf = row.confidence != null ? Number(row.confidence) : null;
  const entry = {
    event_type: t,
    event_id: eventId,
    action_id: row.id,
    status: row.status,
    recommendation: rec,
    confidence: conf,
    cost_usd: Number(row.cost_usd || 0),
    duration_ms: row.duration_ms || 0,
    error_message: row.error_message || null
  };
  const validationFailure = validateAction(row, context);
  if (validationFailure) {
    failures.push(`action_${t}:${validationFailure}`);
    log.fail(`${t} → action ${row.id} ${validationFailure}`);
  } else {
    log.pass(`${t} → action ${row.id} status=${row.status} rec=${rec || 'n/a'} cost=$${entry.cost_usd.toFixed(4)} ms=${entry.duration_ms}`);
  }
  return entry;
}

// Poll for a proposal for each emitted event and append a summary entry per
// event. Returns nothing — mutates the summary.events list and failures[].
async function _collectEventOutcomes({ supabase, agentSlug, eventTypes, emitted, validateAction, log, failures, summary, pollTimeoutMs, pollIntervalMs, effectiveTimeoutMs, context }) {
  for (const t of eventTypes) {
    const eventId = emitted[t];
    if (!eventId) {
      summary.events.push({ event_type: t, event_id: null, action_id: null, status: 'emit_failed' });
      continue;
    }
    const row = await pollForProposal(supabase, agentSlug, eventId, t, log, failures, {
      pollTimeoutMs, pollIntervalMs
    });
    if (!row) {
      failures.push(`no_proposal_${t}`);
      log.fail(`no agent_actions row for ${t} (event_id=${eventId}) within ${effectiveTimeoutMs / 1000}s — check logs for /agent-orchestrator and /agent-${agentSlug}`);
      summary.events.push({ event_type: t, event_id: eventId, action_id: null, status: 'no_proposal' });
      continue;
    }
    summary.events.push(_eventEntryForAction(t, eventId, row, validateAction, log, failures, context));
  }
}

async function runAgentSmoke(opts) {
  const {
    supabase, siteUrl, adminPassword,
    agentSlug, eventTypes, payloadFn, validateAction,
    expectedMaxCapUsd,
    pollTimeoutMs, pollIntervalMs,
    setupFn, teardownFn,
    log = NULL_LOGGER
  } = opts || {};
  const effectiveTimeoutMs = pollTimeoutMs ?? POLL_TIMEOUT_MS;
  const startedAt = new Date();
  const failures = [];
  const summary = {
    site_url: siteUrl,
    agent_slug: agentSlug,
    started_at: startedAt.toISOString(),
    registry: null,
    spend_headroom: null,
    events: []
  };
  // Setup-produced context (e.g. seeded care_plan/bid IDs). Passed to
  // payloadFn and validateAction; teardownFn always runs in finally with it,
  // even on uncaught exception, so synthetic rows get cleaned up.
  let context = null;

  try {
    _validateRunAgentSmokeOpts(opts || {});

    const admin = makeAdminClient(siteUrl, adminPassword);

    log.info(`Smoking ${agentSlug} enablement against ${siteUrl}`);

    const reg = await checkRegistry(supabase, agentSlug, eventTypes, expectedMaxCapUsd, log, failures);
    summary.registry = reg ? {
      enabled: reg.enabled,
      autonomy: reg.autonomy,
      daily_spend_cap_usd: reg.daily_spend_cap_usd,
      model: reg.model,
      endpoint: reg.endpoint,
      handles_events: reg.handles_events
    } : null;

    if (!reg || reg.enabled !== true) {
      const finishedAt = new Date();
      return {
        ok: false,
        agent_slug: agentSlug,
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        duration_ms: finishedAt - startedAt,
        failure_count: failures.length || 1,
        failed_checks: failures.length ? failures : ['registry_disabled'],
        summary
      };
    }

    await checkSpendHeadroom(supabase, agentSlug, Number(reg.daily_spend_cap_usd) || expectedMaxCapUsd, log, failures);
    {
      const today = new Date().toISOString().slice(0, 10);
      const { data: spend } = await supabase
        .from('agent_daily_spend')
        .select('reserved_usd, actual_usd, call_count')
        .eq('agent_slug', agentSlug).eq('day', today).maybeSingle();
      summary.spend_headroom = spend || { reserved_usd: 0, actual_usd: 0, call_count: 0 };
    }

    if (typeof setupFn === 'function') {
      log.info('2b. Running agent-specific setup (seeding synthetic fixtures)');
      try {
        context = await setupFn({ supabase, log });
        summary.setup_context = context && context._summary ? context._summary : null;
      } catch (e) {
        failures.push(`setup_exception: ${e.message}`);
        log.fail(`setup failed: ${e.message}`);
        // Still proceed to teardown via finally; skip the rest of the run.
        const finishedAt = new Date();
        return {
          ok: false,
          agent_slug: agentSlug,
          started_at: startedAt.toISOString(),
          finished_at: finishedAt.toISOString(),
          duration_ms: finishedAt - startedAt,
          failure_count: failures.length,
          failed_checks: failures,
          summary
        };
      }
    }

    log.info(`3. Emitting one synthetic test event for each of the ${eventTypes.length} input type(s)`);
    const emitted = {};
    for (const t of eventTypes) {
      const payload = payloadFn(t, context);
      emitted[t] = await emitSyntheticEvent(admin, t, payload, log, failures);
    }

    await forceOrchestratorTick(admin, log, failures);

    log.info(`5. Polling agent_actions for proposed rows (timeout ${effectiveTimeoutMs / 1000}s per event)`);
    await _collectEventOutcomes({
      supabase, agentSlug, eventTypes, emitted, validateAction, log, failures, summary,
      pollTimeoutMs, pollIntervalMs, effectiveTimeoutMs, context
    });
  } catch (e) {
    failures.push(`runner_exception: ${e.message}`);
    log.fail(`UNCAUGHT: ${e.message}`);
    summary.runner_exception = e.message;
  } finally {
    // Cleanup ALWAYS runs, even on failure or exception, so smoke-tagged
    // rows don't accumulate in production.
    if (typeof teardownFn === 'function' && context) {
      try {
        const cleanupSummary = await teardownFn({ supabase, log, context });
        if (cleanupSummary) summary.teardown = cleanupSummary;
      } catch (e) {
        // Cleanup failure should surface as a smoke failure, not crash the
        // overall run. The caller's persistRun records this on the row.
        failures.push(`teardown_exception: ${e.message}`);
        log.fail(`teardown failed: ${e.message}`);
      }
    }
  }

  const finishedAt = new Date();
  return {
    ok: failures.length === 0,
    agent_slug: agentSlug,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt - startedAt,
    failure_count: failures.length,
    failed_checks: failures,
    summary
  };
}

// ---------------------------------------------------------------------------
// Back-compat wrapper. Existing callers keep their signature; the body
// delegates to runAgentSmoke with gatekeeper-flavoured arguments.
// ---------------------------------------------------------------------------
async function runGatekeeperSmoke({ supabase, siteUrl, adminPassword, log, pollTimeoutMs, pollIntervalMs }) {
  return runAgentSmoke({
    supabase, siteUrl, adminPassword, log,
    agentSlug: 'gatekeeper',
    eventTypes: ['provider.applied', 'provider.bgc_completed', 'provider.flagged'],
    payloadFn: syntheticPayloadFor,
    validateAction: validateGatekeeperAction,
    expectedMaxCapUsd: SPEND_CAP_USD,
    pollTimeoutMs, pollIntervalMs
  });
}

module.exports = {
  runAgentSmoke,
  runGatekeeperSmoke,
  syntheticPayloadFor,
  syntheticMatchmakerPayloadFor,
  syntheticTreasurerPayloadFor,
  validateGatekeeperAction,
  validateMatchmakerAction,
  validateTreasurerAction,
  POLL_TIMEOUT_MS,
  SPEND_CAP_USD
};

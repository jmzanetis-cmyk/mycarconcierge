// ============================================================================
// Task #161 — Gatekeeper smoke test core
//
// Shared smoke-run engine used by both:
//   - scripts/gatekeeper-enable-smoke.js (operator-supervised CLI runner)
//   - netlify/functions/gatekeeper-smoke-scheduled.js (daily off-hours cron)
//
// The smoke fires one synthetic event of each Gatekeeper-subscribed type via
// the same admin HTTPS surface real callers use, forces an orchestrator tick,
// then polls agent_actions for a proposed row tied to each event_id. A clean
// pass means the trigger → bus → orchestrator → handler → DB pipeline is
// healthy end-to-end.
//
// Synthetic events carry `__smoke=true` in their payload so they're easy to
// identify in the admin queue (the agent stores the input payload on the
// agent_actions.decision row; the admin UI surfaces a "Smoke" badge from it).
//
// Returns a structured result the caller can both:
//   - Pretty-print to stdout (operator runner)
//   - Persist to agent_smoke_runs + alert on failure (scheduled runner)
// ============================================================================

const crypto = require('crypto');

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS  = 60_000;
const SPEND_CAP_USD    = 3.0;

// Logger interface: { pass(msg), fail(msg), info(msg) }. The CLI runner uses
// console.log / console.error; the scheduled runner can pass a no-op.
const NULL_LOGGER = { pass: () => {}, fail: () => {}, info: () => {} };

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

async function checkRegistry(supabase, log, failures) {
  log.info('1. Verifying registry row for gatekeeper');
  const { data, error } = await supabase
    .from('agents')
    .select('slug, enabled, autonomy, daily_spend_cap_usd, model, handles_events, endpoint')
    .eq('slug', 'gatekeeper')
    .maybeSingle();
  if (error) { failures.push(`registry_query: ${error.message}`); log.fail(`registry query: ${error.message}`); return null; }
  if (!data)  { failures.push('registry_missing'); log.fail('registry has no row for gatekeeper'); return null; }

  if (data.enabled !== true) {
    failures.push(`registry_enabled=${data.enabled}`);
    log.fail(`enabled is ${data.enabled} (expected true) — apply the enable migration first`);
  } else log.pass('enabled = true');

  if (data.autonomy !== 'propose') {
    failures.push(`registry_autonomy=${data.autonomy}`);
    log.fail(`autonomy is "${data.autonomy}" (expected "propose")`);
  } else log.pass('autonomy = propose');

  if (Number(data.daily_spend_cap_usd) > SPEND_CAP_USD) {
    failures.push(`registry_cap=${data.daily_spend_cap_usd}`);
    log.fail(`daily_spend_cap_usd is $${data.daily_spend_cap_usd} (expected ≤ $${SPEND_CAP_USD})`);
  } else log.pass(`daily_spend_cap_usd = $${data.daily_spend_cap_usd}`);

  const expectedEvents = ['provider.applied','provider.bgc_completed','provider.flagged'];
  const actualEvents   = data.handles_events || [];
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

async function checkSpendHeadroom(supabase, log, failures) {
  log.info("2. Verifying today's spend headroom");
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('agent_daily_spend')
    .select('reserved_usd, actual_usd, call_count, day')
    .eq('agent_slug', 'gatekeeper')
    .eq('day', today)
    .maybeSingle();
  if (error) { failures.push(`spend_query: ${error.message}`); log.fail(`spend query: ${error.message}`); return; }
  const reserved = Number(data?.reserved_usd || 0);
  const actual   = Number(data?.actual_usd || 0);
  const total    = reserved + actual;
  const calls    = data?.call_count || 0;
  if (total >= SPEND_CAP_USD) {
    failures.push(`spend_at_cap:${total.toFixed(4)}`);
    log.fail(`today's reserved+actual = $${total.toFixed(4)} already at/over $${SPEND_CAP_USD} cap`);
  } else {
    log.pass(`today's reserved+actual = $${total.toFixed(4)} (${calls} calls so far) — headroom intact`);
  }
}

async function emitSyntheticEvent(admin, eventType, log, failures) {
  const payload = syntheticPayloadFor(eventType);
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

async function pollForProposal(supabase, eventId, eventType, log, failures, opts = {}) {
  const timeoutMs  = opts.pollTimeoutMs  ?? POLL_TIMEOUT_MS;
  const intervalMs = opts.pollIntervalMs ?? POLL_INTERVAL_MS;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data, error } = await supabase
      .from('agent_actions')
      .select('id, agent_slug, event_id, status, decision, reasoning, confidence, cost_usd, duration_ms, error_message, created_at')
      .eq('agent_slug', 'gatekeeper')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) {
      failures.push(`poll_${eventType}: ${error.message}`);
      log.fail(`poll ${eventType} (event_id=${eventId}): ${error.message}`);
      return null;
    }
    if (data && data.length) return data[0];
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return null;
}

// ---------------------------------------------------------------------------
// runGatekeeperSmoke — execute one full smoke cycle.
//   opts.supabase        — service-role supabase client (required)
//   opts.siteUrl         — e.g. 'https://mycarconcierge.com' (required)
//   opts.adminPassword   — admin password header value (required)
//   opts.log             — { pass(msg), fail(msg), info(msg) } (optional)
//
// Resolves to an object the caller can both print and persist:
//   {
//     ok: boolean,            // true iff all checks passed
//     started_at: ISO,
//     finished_at: ISO,
//     duration_ms: number,
//     failure_count: number,
//     failed_checks: string[], // short identifiers; useful in alert emails
//     summary: {
//       site_url, registry, spend_headroom, events: [...]
//     }
//   }
// Never throws — runner-level exceptions are converted into a synthetic
// failure entry so the caller always gets a structured result to persist.
// ---------------------------------------------------------------------------
async function runGatekeeperSmoke({ supabase, siteUrl, adminPassword, log = NULL_LOGGER, pollTimeoutMs, pollIntervalMs }) {
  const opts = { pollTimeoutMs, pollIntervalMs };
  const effectiveTimeoutMs = pollTimeoutMs ?? POLL_TIMEOUT_MS;
  const startedAt = new Date();
  const failures = [];
  const summary = {
    site_url: siteUrl,
    started_at: startedAt.toISOString(),
    registry: null,
    spend_headroom: null,
    events: []
  };

  try {
    if (!supabase) throw new Error('runGatekeeperSmoke: supabase client is required');
    if (!siteUrl) throw new Error('runGatekeeperSmoke: siteUrl is required');
    if (!adminPassword) throw new Error('runGatekeeperSmoke: adminPassword is required');

    const admin = makeAdminClient(siteUrl, adminPassword);

    log.info(`Smoking Gatekeeper enablement against ${siteUrl}`);

    const reg = await checkRegistry(supabase, log, failures);
    summary.registry = reg ? {
      enabled: reg.enabled,
      autonomy: reg.autonomy,
      daily_spend_cap_usd: reg.daily_spend_cap_usd,
      model: reg.model,
      endpoint: reg.endpoint,
      handles_events: reg.handles_events
    } : null;

    if (!reg || reg.enabled !== true) {
      // Hard pre-flight failure — bail before emitting events.
      const finishedAt = new Date();
      return {
        ok: false,
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        duration_ms: finishedAt - startedAt,
        failure_count: failures.length || 1,
        failed_checks: failures.length ? failures : ['registry_disabled'],
        summary
      };
    }

    await checkSpendHeadroom(supabase, log, failures);
    // Re-read the spend snapshot for the summary
    {
      const today = new Date().toISOString().slice(0, 10);
      const { data: spend } = await supabase
        .from('agent_daily_spend')
        .select('reserved_usd, actual_usd, call_count')
        .eq('agent_slug', 'gatekeeper').eq('day', today).maybeSingle();
      summary.spend_headroom = spend || { reserved_usd: 0, actual_usd: 0, call_count: 0 };
    }

    log.info('3. Emitting one synthetic test event for each of the three input types');
    const eventTypes = ['provider.applied', 'provider.bgc_completed', 'provider.flagged'];
    const emitted = {};
    for (const t of eventTypes) emitted[t] = await emitSyntheticEvent(admin, t, log, failures);

    await forceOrchestratorTick(admin, log, failures);

    log.info(`5. Polling agent_actions for proposed rows (timeout ${effectiveTimeoutMs / 1000}s per event)`);
    for (const t of eventTypes) {
      const eventId = emitted[t];
      if (!eventId) {
        summary.events.push({ event_type: t, event_id: null, action_id: null, status: 'emit_failed' });
        continue;
      }
      const row = await pollForProposal(supabase, eventId, t, log, failures, {
        pollTimeoutMs: opts.pollTimeoutMs,
        pollIntervalMs: opts.pollIntervalMs
      });
      if (!row) {
        failures.push(`no_proposal_${t}`);
        log.fail(`no agent_actions row for ${t} (event_id=${eventId}) within ${effectiveTimeoutMs / 1000}s — check logs for /agent-orchestrator and /agent-gatekeeper`);
        summary.events.push({ event_type: t, event_id: eventId, action_id: null, status: 'no_proposal' });
        continue;
      }
      const rec = (row.decision && row.decision.recommendation) || null;
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
      if (row.status === 'proposed' && rec) {
        log.pass(`${t} → action ${row.id} status=${row.status} recommendation=${rec} confidence=${conf?.toFixed?.(2) || 'n/a'} cost=$${entry.cost_usd.toFixed(4)} ms=${entry.duration_ms}`);
      } else if (row.status === 'error') {
        failures.push(`action_error_${t}`);
        log.fail(`${t} → action ${row.id} status=error error_message="${row.error_message}"`);
      } else {
        failures.push(`action_status_${t}=${row.status}`);
        log.fail(`${t} → action ${row.id} status=${row.status} recommendation=${rec || '(none)'} (expected status=proposed with a recommendation)`);
      }
      summary.events.push(entry);
    }
  } catch (e) {
    failures.push(`runner_exception: ${e.message}`);
    log.fail(`UNCAUGHT: ${e.message}`);
    summary.runner_exception = e.message;
  }

  const finishedAt = new Date();
  return {
    ok: failures.length === 0,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt - startedAt,
    failure_count: failures.length,
    failed_checks: failures,
    summary
  };
}

module.exports = {
  runGatekeeperSmoke,
  syntheticPayloadFor,
  POLL_TIMEOUT_MS,
  SPEND_CAP_USD
};

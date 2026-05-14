// ============================================================================
// MCC Agent Fleet — Cron Emitter
//
// Scheduled Function whose only job is to publish "tick" events into the
// agent_events bus. The orchestrator (which runs every minute) picks them up
// and dispatches to whichever enabled agents subscribe to that event type.
//
// Why this exists (per docs/agent-fleet-phase-2.md §3.1):
//   The Analyst is wired to `nightly.tick` but in Phase 1 nothing emitted it
//   on a schedule — the analyst was invoked directly by its own scheduled
//   function. That direct path bypasses the bus and is inconsistent with the
//   "every agent reacts to events" model the rest of Phase 2 relies on.
//   This emitter is the canonical pattern: any future agent that wants to
//   wake up nightly/hourly/weekly just adds itself to the relevant tick.
//
// Schedule is wired in netlify.toml. Adding a new tick is a one-liner here
// plus a netlify.toml entry; no agent code changes needed.
//
// Future cleanup: once we've seen the bus-driven analyst run cleanly for
// several days, drop the analyst's direct schedule from netlify.toml. The
// analyst's assertRateLimit guards against any same-minute double-fire in
// the meantime.
// ============================================================================

const {
  getSupabase, authorizeAgentInvocation, emitEvent, jsonResponse
} = require('./agent-fleet-runtime');

// What cron pattern fires what event. The pattern strings here are pure
// documentation — Netlify reads the actual schedule from netlify.toml.
// We tag the event with the schedule we *expected* so audit logs are clear.
const TICKS = {
  nightly:  { event_type: 'nightly.tick',  cron: '0 5 * * *'  },
  // weekly:   { event_type: 'weekly.tick',   cron: '0 6 * * 0' },
  // hourly:   { event_type: 'hourly.tick',   cron: '0 * * * *' },
};

// Decide which tick(s) to emit for THIS invocation. A scheduled invocation
// could in theory cover multiple ticks if their cron lines up, but in
// practice each Netlify Scheduled Function fires its single configured cron.
// We default to "nightly" because that's the only one wired today; if/when
// we add more we'll thread the choice through the netlify.toml schedule
// configuration (or a query param for manual admin invocations).
function pickTicks(event) {
  // Manual admin invocations may pass ?tick=nightly,weekly to fire one or
  // more ticks on demand. Defaults to nightly.
  const qs = (event?.queryStringParameters) || {};
  const requested = (qs.tick || 'nightly').split(',').map(s => s.trim()).filter(Boolean);
  return requested.filter(name => TICKS[name]).map(name => TICKS[name]);
}

exports.handler = async function(event) {
  // CORS preflight (admin UI may invoke us via the admin proxy).
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, { ok: true });

  // Same auth model as the other agent functions: scheduled invocations or
  // admin-password requests only. Anonymous HTTP callers are rejected.
  const auth = authorizeAgentInvocation(event);
  if (!auth) return jsonResponse(401, { error: 'Unauthorized' });

  const supabase = getSupabase();
  if (!supabase) return jsonResponse(500, { error: 'Database not configured' });

  const ticks = pickTicks(event);
  if (ticks.length === 0) {
    return jsonResponse(400, { error: 'No valid tick selected', valid: Object.keys(TICKS) });
  }

  const emitted = [];
  const errors = [];
  const source = auth === 'scheduled' ? 'cron-emitter:scheduled' : 'cron-emitter:admin';

  for (const tick of ticks) {
    try {
      const id = await emitEvent(supabase, tick.event_type, {
        emitted_at: new Date().toISOString(),
        cron: tick.cron,
        source: 'cron-emitter'
      }, source);
      emitted.push({ event_type: tick.event_type, event_id: id });
      console.log(`[cron-emitter] emitted ${tick.event_type} as event #${id} (auth=${auth})`);
    } catch (e) {
      console.error(`[cron-emitter] failed to emit ${tick.event_type}:`, e.message);
      errors.push({ event_type: tick.event_type, error: e.message });
    }
  }

  const status = errors.length === 0 ? 200 : (emitted.length > 0 ? 207 : 500);
  return jsonResponse(status, { ok: errors.length === 0, emitted, errors });
};

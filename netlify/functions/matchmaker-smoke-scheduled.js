// ============================================================================
// Task #206 — Matchmaker smoke scheduled function
//
// Runs the Matchmaker smoke once a day off-hours. Mirrors the Gatekeeper
// smoke (Task #161) so the same early-warning coverage extends to the bid-
// awarding pipeline: care_plan auction-closed trigger → bus → orchestrator
// → agent-matchmaker handler → agent_actions row with a recommended_winner_bid_id.
//
// The synthetic care_plan_id won't resolve in care_plans, so the matchmaker
// short-circuits on a 0-bid auction with status='proposed' and
// recommended_winner_bid_id=null. That's a valid pipeline pass — the smoke
// is testing wiring, not LLM judgment.
// ============================================================================

const {
  getSupabase, authorizeAgentInvocation, jsonResponse
} = require('./agent-fleet-runtime');
const {
  runAgentSmoke, syntheticMatchmakerPayloadFor, validateMatchmakerAction
} = require('./gatekeeper-smoke-core');
const { persistRun, sendSmokeFailureEmail, MCC_APP_URL } = require('./agent-smoke-shared');

const AGENT_SLUG = 'matchmaker';
const AGENT_LABEL = 'Matchmaker';
const EVENT_TYPES = ['care_plan.auction_closed'];
const MAX_CAP_USD = 5.0; // matches the registry seed in 20260422_agent_fleet.sql

exports.handler = async function(event) {
  if (event?.httpMethod === 'OPTIONS') return jsonResponse(200, { ok: true });

  const auth = authorizeAgentInvocation(event || {});
  if (!auth) return jsonResponse(401, { error: 'Unauthorized' });

  const supabase = getSupabase();
  if (!supabase) {
    console.error('[smoke-scheduled:matchmaker] supabase unavailable');
    return jsonResponse(500, { error: 'db_unavailable' });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error('[smoke-scheduled:matchmaker] ADMIN_PASSWORD not configured');
    return jsonResponse(500, { error: 'admin_password_not_configured' });
  }

  const triggeredBy = auth === 'admin' ? 'admin' : 'scheduled';
  const log = {
    pass: msg => console.log('[smoke-scheduled:matchmaker] PASS:', msg),
    fail: msg => console.error('[smoke-scheduled:matchmaker] FAIL:', msg),
    info: msg => console.log('[smoke-scheduled:matchmaker] INFO:', msg)
  };

  let result;
  try {
    result = await runAgentSmoke({
      supabase, siteUrl: MCC_APP_URL, adminPassword, log,
      agentSlug: AGENT_SLUG,
      eventTypes: EVENT_TYPES,
      payloadFn: syntheticMatchmakerPayloadFor,
      validateAction: validateMatchmakerAction,
      expectedMaxCapUsd: MAX_CAP_USD
    });
  } catch (e) {
    console.error('[smoke-scheduled:matchmaker] runner crash:', e.stack || e.message);
    result = {
      ok: false,
      agent_slug: AGENT_SLUG,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: 0,
      failure_count: 1,
      failed_checks: [`runner_crash: ${e.message}`],
      summary: { runner_exception: e.message, site_url: MCC_APP_URL }
    };
  }

  const row = await persistRun(supabase, AGENT_SLUG, result, triggeredBy);

  let email = { sent: false, reason: 'not_attempted' };
  if (!result.ok && row) {
    email = await sendSmokeFailureEmail(supabase, row, {
      agentLabel: AGENT_LABEL,
      failureCopy: 'Closed auctions may be sitting un-ranked, leaving members without a recommended provider.',
      debugHint:
        'First places to check: the <code>care_plan_auction_closed_emit</code> trigger on <em>care_plans</em>, ' +
        'the orchestrator function logs, and the agent-matchmaker function logs / ANTHROPIC_API_KEY rotation status.'
    });
  }

  return jsonResponse(200, {
    ok: result.ok,
    run_id: row?.id || null,
    status: row?.status || (result.ok ? 'passed' : 'failed'),
    triggered_by: triggeredBy,
    failure_count: result.failure_count,
    failed_checks: result.failed_checks,
    duration_ms: result.duration_ms,
    email
  });
};

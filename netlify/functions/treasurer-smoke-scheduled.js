// ============================================================================
// Task #206 — Treasurer smoke scheduled function
//
// Runs the Treasurer smoke once a day off-hours. Mirrors Gatekeeper /
// Matchmaker so the spend-caps / payouts pipeline gets the same early-warning
// coverage: payment.captured / payment.refund_requested / payout.failed →
// bus → orchestrator → agent-treasurer handler → agent_actions proposal.
//
// Treasurer's handler module isn't in production yet at the time of this
// task; a failing smoke here is the desired signal — it tells the admin
// the agent is registered but its handler isn't actually deployed/enabled.
// Once the handler ships, the same smoke validates the full pipeline
// without further changes here.
// ============================================================================

const {
  getSupabase, authorizeAgentInvocation, jsonResponse
} = require('./agent-fleet-runtime');
const {
  runAgentSmoke, syntheticTreasurerPayloadFor, validateTreasurerAction
} = require('./gatekeeper-smoke-core');
const { persistRun, sendSmokeFailureEmail, MCC_APP_URL } = require('./agent-smoke-shared');

const AGENT_SLUG = 'treasurer';
const AGENT_LABEL = 'Treasurer';
const EVENT_TYPES = ['payment.captured', 'payment.refund_requested', 'payout.failed'];
const MAX_CAP_USD = 5.0; // matches the registry seed in 20260422_agent_fleet.sql

exports.handler = async function(event) {
  if (event?.httpMethod === 'OPTIONS') return jsonResponse(200, { ok: true });

  const auth = authorizeAgentInvocation(event || {});
  if (!auth) return jsonResponse(401, { error: 'Unauthorized' });

  const supabase = getSupabase();
  if (!supabase) {
    console.error('[smoke-scheduled:treasurer] supabase unavailable');
    return jsonResponse(500, { error: 'db_unavailable' });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error('[smoke-scheduled:treasurer] ADMIN_PASSWORD not configured');
    return jsonResponse(500, { error: 'admin_password_not_configured' });
  }

  const triggeredBy = auth === 'admin' ? 'admin' : 'scheduled';
  const log = {
    pass: msg => console.log('[smoke-scheduled:treasurer] PASS:', msg),
    fail: msg => console.error('[smoke-scheduled:treasurer] FAIL:', msg),
    info: msg => console.log('[smoke-scheduled:treasurer] INFO:', msg)
  };

  let result;
  try {
    result = await runAgentSmoke({
      supabase, siteUrl: MCC_APP_URL, adminPassword, log,
      agentSlug: AGENT_SLUG,
      eventTypes: EVENT_TYPES,
      payloadFn: syntheticTreasurerPayloadFor,
      validateAction: validateTreasurerAction,
      expectedMaxCapUsd: MAX_CAP_USD
    });
  } catch (e) {
    console.error('[smoke-scheduled:treasurer] runner crash:', e.stack || e.message);
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
      failureCopy: 'Captured payments, refund requests, or failed payouts may be silently piling up without a Treasurer proposal.',
      debugHint:
        'First places to check: the agent-treasurer function (registered endpoint <code>/.netlify/functions/agent-treasurer</code>) ' +
        'is actually deployed and enabled in the agents table, the orchestrator function logs, ' +
        'and the ANTHROPIC_API_KEY rotation status.'
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

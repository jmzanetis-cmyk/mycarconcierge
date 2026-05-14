// ============================================================================
// Task #161 — Gatekeeper smoke scheduled function
//
// Runs the Gatekeeper smoke test once a day off-hours (cron in netlify.toml).
// Catches silent breakage of the trigger → bus → orchestrator → handler → DB
// pipeline within 24h instead of "whenever someone notices the queue is empty".
//
// On every run we:
//   1. Invoke the shared smoke engine (gatekeeper-smoke-core.js) against
//      MCC_APP_URL (defaults to https://mycarconcierge.com).
//   2. Persist the structured result into agent_smoke_runs so the admin UI
//      can show "smoke last passed N hours ago" without parsing logs.
//   3. On failure, send an admin email mirroring the spend-cap alert path
//      (Resend, ADMIN_EMAIL, MCC_FROM_EMAIL).
//
// The runner is also reachable via admin POST for on-demand smokes (see the
// "Run smoke now" button in /admin/agent-fleet.html) — same engine, same
// persistence, but triggered_by='admin' and no email on success.
//
// Auth: same model as agent-orchestrator.js — scheduled invocations OR
// admin-password header. Anonymous HTTP callers are rejected.
//
// Task #206 — persistence and email helpers are now shared with the
// matchmaker / treasurer scheduled functions in agent-smoke-shared.js.
// ============================================================================

const {
  getSupabase, authorizeAgentInvocation, jsonResponse
} = require('./agent-fleet-runtime');
const { runGatekeeperSmoke } = require('./gatekeeper-smoke-core');
const { persistRun, sendSmokeFailureEmail, sendSmokeFailureSms, MCC_APP_URL } = require('./agent-smoke-shared');

const AGENT_SLUG = 'gatekeeper';
const AGENT_LABEL = 'Gatekeeper';


exports.handler = async function(event) {
  if (event?.httpMethod === 'OPTIONS') return jsonResponse(200, { ok: true });

  const auth = authorizeAgentInvocation(event || {});
  if (!auth) return jsonResponse(401, { error: 'Unauthorized' });

  const supabase = getSupabase();
  if (!supabase) {
    console.error('[smoke-scheduled:gatekeeper] supabase unavailable');
    return jsonResponse(500, { error: 'db_unavailable' });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error('[smoke-scheduled:gatekeeper] ADMIN_PASSWORD not configured');
    return jsonResponse(500, { error: 'admin_password_not_configured' });
  }

  const triggeredBy = auth === 'admin' ? 'admin' : 'scheduled';
  const log = {
    pass: msg => console.log('[smoke-scheduled:gatekeeper] PASS:', msg),
    fail: msg => console.error('[smoke-scheduled:gatekeeper] FAIL:', msg),
    info: msg => console.log('[smoke-scheduled:gatekeeper] INFO:', msg)
  };

  let result;
  try {
    result = await runGatekeeperSmoke({
      supabase, siteUrl: MCC_APP_URL, adminPassword, log
    });
  } catch (e) {
    console.error('[smoke-scheduled:gatekeeper] runner crash:', e.stack || e.message);
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
  let sms   = { sent: false, reason: 'not_attempted' };
  if (!result.ok && row) {
    [email, sms] = await Promise.all([
      sendSmokeFailureEmail(supabase, row, {
        agentLabel: AGENT_LABEL,
        failureCopy: 'Provider applications may be silently piling up un-reviewed.',
        debugHint:
          'First places to check: the <code>provider_applied</code>/<code>provider_flagged</code>/<code>provider_bgc_completed</code> ' +
          'DB triggers in the <em>provider_applications</em> &amp; <em>employee_background_checks</em> schemas, the orchestrator function logs, ' +
          'and the ANTHROPIC_API_KEY rotation status.'
      }),
      sendSmokeFailureSms(supabase, row, { agentLabel: AGENT_LABEL })
    ]);
  }

  return jsonResponse(200, {
    ok: result.ok,
    run_id: row?.id || null,
    status: row?.status || (result.ok ? 'passed' : 'failed'),
    triggered_by: triggeredBy,
    failure_count: result.failure_count,
    failed_checks: result.failed_checks,
    duration_ms: result.duration_ms,
    email,
    sms
  });
};

// Back-compat re-exports (helpers now live in agent-smoke-shared.js).
module.exports.sendSmokeFailureEmail = sendSmokeFailureEmail;
module.exports.sendSmokeFailureSms = sendSmokeFailureSms;
module.exports.persistRun = persistRun;

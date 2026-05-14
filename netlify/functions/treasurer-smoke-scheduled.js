// ============================================================================
// Task #206 / #321 — Treasurer smoke scheduled function
//
// Runs the Treasurer smoke once a day off-hours. Mirrors Gatekeeper /
// Matchmaker so the spend-caps / payouts pipeline gets the same early-warning
// coverage: payment.captured / payment.refund_requested / payout.failed →
// bus → orchestrator → agent-treasurer handler → agent_actions proposal.
//
// Task #321 hardened the smoke beyond the original random-UUID payloads.
// Each run now SEEDS three concrete scenarios — one per Treasurer event
// type — with real auth.users + care_plans + care_plan_completions rows
// so the LLM has actual context to reason against:
//
//   payment.captured (scenario A):
//     member-A + provider-A (BGC verified, well-rated)
//     care_plan-A status='awarded', value_min=200, value_max=300
//     completion-A status='completed', actual_paid_amount=250
//     payload.amount=250 (within range) → expect approve_capture
//
//   payment.refund_requested (scenario B):
//     member-B + provider-B (lower rating)
//     care_plan-B status='awarded', value_min=100, value_max=150
//     completion-B status='disputed', dispute_reason='incomplete'
//     payload.amount=125, reason='work_not_completed' → expect
//     approve_refund OR deny_refund (manual_review = fallback regression)
//
//   payout.failed (scenario C):
//     provider-C (BGC verified, established)
//     payload.failure_code='account_inactive' → expect retry_payout OR
//     escalate_payout (manual_review = fallback regression)
//
// validateTreasurerAction (in gatekeeper-smoke-core.js) holds each event
// type to the per-event allowed-recommendation set when context.scenarios
// is populated. A `manual_review` proposal on any of these seeded scenarios
// fails the smoke — that's the catch-the-fallback signal Task #321 added.
//
// Cleanup runs in finally{} via runAgentSmoke's teardownFn hook. Auth user
// deletion cascades care_plans (FK ON DELETE CASCADE on member_id), which
// in turn cascades care_plan_completions. We delete care_plans explicitly
// first as belt-and-suspenders for the rare partial-cleanup case.
// ============================================================================

const crypto = require('node:crypto');
const {
  getSupabase, authorizeAgentInvocation, jsonResponse
} = require('./agent-fleet-runtime');
const {
  runAgentSmoke, validateTreasurerAction
} = require('./gatekeeper-smoke-core');
const { persistRun, sendSmokeFailureEmail, MCC_APP_URL } = require('./agent-smoke-shared');

const AGENT_SLUG = 'treasurer';
const AGENT_LABEL = 'Treasurer';
const EVENT_TYPES = ['payment.captured', 'payment.refund_requested', 'payout.failed'];
const MAX_CAP_USD = 5.0;
const SMOKE_TAG_PREFIX = '[__SMOKE treasurer]';

// ---------------------------------------------------------------------------
// Tiny helpers (mirror matchmaker-smoke-scheduled.js).
// ---------------------------------------------------------------------------
async function _createSmokeAuthUser(supabase, role, ts) {
  const email = `smoke-tr-${role}-${ts}-${crypto.randomBytes(3).toString('hex')}@example.test`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password: crypto.randomBytes(16).toString('hex'),
    user_metadata: { __smoke: true, smoke_role: role, smoke_agent: 'treasurer' }
  });
  if (error) throw new Error(`auth.admin.createUser(${role}): ${error.message}`);
  return { id: data.user.id, email };
}

async function _upsertSmokeProviderProfile(supabase, providerId, businessName, signal) {
  const { error } = await supabase
    .from('profiles')
    .update({
      role: 'provider',
      business_name: businessName,
      full_name: businessName,
      avg_rating: signal.rating,
      review_count: signal.reviewCount,
      completed_jobs: signal.completedJobs,
      bgc_badge_verified: signal.bgcVerified,
      bgc_compliance_pct: signal.bgcVerified ? 100 : 50,
      verification_status: 'verified'
    })
    .eq('id', providerId);
  if (error) {
    // Best-effort: matchmaker / treasurer tolerate missing profile fields.
    console.warn('[smoke-scheduled:treasurer] profile update failed:', error.message);
  }
}

// ---------------------------------------------------------------------------
// Seed three scenarios. Mutates `context` after EACH successful mutation so
// that, if a later step throws, the finally{} teardown can still clean up
// the partial state. cleanupTreasurerScenarios tolerates any field absent.
// ---------------------------------------------------------------------------
async function seedTreasurerScenarios({ supabase, log, context }) {
  const ts = Date.now();
  log.info('Seeding Treasurer scenarios (3 event types, 5 auth users, 2 care_plans + completions)');

  context.authUserIds = [];
  context.carePlanIds = [];
  context.scenarios   = {}; // event_type → payload

  // ---- Scenario A: payment.captured (clean) -------------------------------
  const memberA   = await _createSmokeAuthUser(supabase, 'memberA', ts);
  context.authUserIds.push(memberA.id);
  const providerA = await _createSmokeAuthUser(supabase, 'providerA', ts);
  context.authUserIds.push(providerA.id);
  await _upsertSmokeProviderProfile(supabase, providerA.id, `${SMOKE_TAG_PREFIX} Garage A`, {
    rating: 4.7, reviewCount: 38, completedJobs: 25, bgcVerified: true
  });

  const cpA = await supabase
    .from('care_plans')
    .insert({
      member_id: memberA.id,
      title: `${SMOKE_TAG_PREFIX} captured ${new Date(ts).toISOString()}`,
      description: JSON.stringify({ __smoke: true, agent: 'treasurer', scenario: 'captured' }),
      services: [{ name: 'Brake Repair', __smoke: true }],
      service_types: ['brake_service'],
      value_min: 200.00, value_max: 300.00,
      city: 'Smoketown', state: 'CA', zip_code: '00000',
      status: 'awarded'
    })
    .select('id').single();
  if (cpA.error) throw new Error(`care_plans A: ${cpA.error.message}`);
  context.carePlanIds.push(cpA.data.id);

  // care_plans.provider_id was added in 20260428b_care_plans_stripe_escrow.sql.
  // Best-effort — a missing column would not break the scenario (the payload
  // also carries provider_id directly).
  await supabase
    .from('care_plans')
    .update({ provider_id: providerA.id })
    .eq('id', cpA.data.id);

  const compA = await supabase
    .from('care_plan_completions')
    .insert({
      care_plan_id: cpA.data.id,
      member_id: memberA.id,
      provider_id: providerA.id,
      status: 'completed',
      bid_amount: 250.00,
      actual_paid_amount: 250.00,
      payment_method: 'card',
      completion_notes: '__smoke=true | brake repair completed cleanly, member signed off',
      completed_at: new Date().toISOString()
    })
    .select('id').single();
  if (compA.error) throw new Error(`completion A: ${compA.error.message}`);

  context.scenarios['payment.captured'] = {
    __smoke: true, smoked_at: new Date().toISOString(),
    payment_id:   crypto.randomUUID(),
    care_plan_id: cpA.data.id,
    member_id:    memberA.id,
    provider_id:  providerA.id,
    amount:       250.00,
    currency:     'usd',
    captured_at:  new Date().toISOString()
  };

  // ---- Scenario B: payment.refund_requested (disputed work) ---------------
  const memberB   = await _createSmokeAuthUser(supabase, 'memberB', ts);
  context.authUserIds.push(memberB.id);
  const providerB = await _createSmokeAuthUser(supabase, 'providerB', ts);
  context.authUserIds.push(providerB.id);
  await _upsertSmokeProviderProfile(supabase, providerB.id, `${SMOKE_TAG_PREFIX} Garage B`, {
    rating: 3.4, reviewCount: 12, completedJobs: 8, bgcVerified: false
  });

  const cpB = await supabase
    .from('care_plans')
    .insert({
      member_id: memberB.id,
      title: `${SMOKE_TAG_PREFIX} refund ${new Date(ts).toISOString()}`,
      description: JSON.stringify({ __smoke: true, agent: 'treasurer', scenario: 'refund' }),
      services: [{ name: 'Oil Change', __smoke: true }],
      service_types: ['oil_change'],
      value_min: 100.00, value_max: 150.00,
      city: 'Smoketown', state: 'CA', zip_code: '00000',
      status: 'awarded'
    })
    .select('id').single();
  if (cpB.error) throw new Error(`care_plans B: ${cpB.error.message}`);
  context.carePlanIds.push(cpB.data.id);

  await supabase
    .from('care_plans')
    .update({ provider_id: providerB.id })
    .eq('id', cpB.data.id);

  const compB = await supabase
    .from('care_plan_completions')
    .insert({
      care_plan_id: cpB.data.id,
      member_id: memberB.id,
      provider_id: providerB.id,
      status: 'disputed',
      bid_amount: 125.00,
      actual_paid_amount: 125.00,
      payment_method: 'card',
      completion_notes: '__smoke=true | oil change attempted',
      dispute_reason: 'incomplete',
      dispute_description: '__smoke=true | provider left without finishing the service; member requests refund',
      completed_at: new Date().toISOString(),
      disputed_at: new Date().toISOString()
    })
    .select('id').single();
  if (compB.error) throw new Error(`completion B: ${compB.error.message}`);

  context.scenarios['payment.refund_requested'] = {
    __smoke: true, smoked_at: new Date().toISOString(),
    payment_id:   crypto.randomUUID(),
    care_plan_id: cpB.data.id,
    member_id:    memberB.id,
    amount:       125.00,
    currency:     'usd',
    reason:       'work_not_completed',
    requested_at: new Date().toISOString()
  };

  // ---- Scenario C: payout.failed (transient failure_code) -----------------
  const providerC = await _createSmokeAuthUser(supabase, 'providerC', ts);
  context.authUserIds.push(providerC.id);
  await _upsertSmokeProviderProfile(supabase, providerC.id, `${SMOKE_TAG_PREFIX} Garage C`, {
    rating: 4.6, reviewCount: 51, completedJobs: 42, bgcVerified: true
  });

  context.scenarios['payout.failed'] = {
    __smoke: true, smoked_at: new Date().toISOString(),
    payout_id:    crypto.randomUUID(),
    provider_id:  providerC.id,
    amount:       75.00,
    currency:     'usd',
    failure_code: 'account_inactive',
    failed_at:    new Date().toISOString()
  };

  context._summary = {
    auth_user_count: context.authUserIds.length,
    care_plan_count: context.carePlanIds.length,
    scenarios:       Object.keys(context.scenarios)
  };
  log.info(`Seeded scenarios=[${Object.keys(context.scenarios).join(', ')}] ` +
           `users=${context.authUserIds.length} care_plans=${context.carePlanIds.length}`);
}

// payloadFn closure — picks the seeded payload for the event type the
// runner is currently emitting. Returns the random-UUID fallback only if
// somehow context.scenarios is empty (shouldn't happen on the seeded path).
function buildTreasurerPayload(eventType, context) {
  const seeded = context && context.scenarios && context.scenarios[eventType];
  if (seeded) return seeded;
  return { __smoke: true, smoked_at: new Date().toISOString() };
}

// Cleanup: best-effort per delete so all attempts run even when one fails.
// Returns { errors: [...] }; runAgentSmoke promotes any errors to smoke
// failures so leaked synthetic rows trigger the failure-alert email.
//
// Order: care_plans first (cascades completions via FK), then auth users
// (cascades any leftover care_plans / completions / profile rows). The
// double-up means partial-state cleanup still works if a care_plan exists
// without a member auth user (or vice versa).
async function cleanupTreasurerScenarios({ supabase, log, context }) {
  const summary = { care_plans_deleted: 0, auth_users_deleted: 0, errors: [] };
  if (!context) return summary;

  for (const cpId of (context.carePlanIds || [])) {
    if (!cpId) continue;
    const { error } = await supabase.from('care_plans').delete().eq('id', cpId);
    if (error) {
      summary.errors.push(`care_plans delete(${cpId}): ${error.message}`);
      log.fail(`cleanup care_plan ${cpId}: ${error.message}`);
    } else {
      summary.care_plans_deleted += 1;
    }
  }

  for (const uid of (context.authUserIds || [])) {
    if (!uid) continue;
    try {
      const { error } = await supabase.auth.admin.deleteUser(uid);
      if (error) {
        summary.errors.push(`auth.admin.deleteUser(${uid}): ${error.message}`);
        log.fail(`cleanup auth user ${uid}: ${error.message}`);
      } else {
        summary.auth_users_deleted += 1;
      }
    } catch (e) {
      summary.errors.push(`auth.admin.deleteUser(${uid}): ${e.message}`);
      log.fail(`cleanup auth user ${uid}: ${e.message}`);
    }
  }

  log.info(`Cleanup: care_plans=${summary.care_plans_deleted}/${(context.carePlanIds || []).length} ` +
           `auth_users=${summary.auth_users_deleted}/${(context.authUserIds || []).length} ` +
           `errors=${summary.errors.length}`);
  return summary;
}

exports.handler = async function(event) {
  if (event && event.httpMethod === 'OPTIONS') return jsonResponse(200, { ok: true });

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
      payloadFn: buildTreasurerPayload,
      validateAction: validateTreasurerAction,
      expectedMaxCapUsd: MAX_CAP_USD,
      setupFn: seedTreasurerScenarios,
      teardownFn: cleanupTreasurerScenarios
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
        'and the ANTHROPIC_API_KEY rotation status. Task #321 also seeds 3 concrete scenarios — ' +
        'failures of the form <code>recommendation_manual_review_fallback:*</code> mean the LLM ' +
        'call ran but the JSON parse / recommendation whitelist regressed (handler fell back to manual_review). ' +
        '<code>recommendation_not_allowed:*</code> means the LLM picked a valid value that was unexpected for the seeded scenario.'
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

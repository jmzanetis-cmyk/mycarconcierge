// ============================================================================
// Task #206 / #301 — Matchmaker smoke scheduled function
//
// Runs the Matchmaker smoke once a day off-hours. Mirrors the Gatekeeper
// smoke (Task #161) so the same early-warning coverage extends to the bid-
// awarding pipeline: care_plan auction-closed trigger → bus → orchestrator
// → agent-matchmaker handler → agent_actions row with a recommended_winner_bid_id.
//
// Task #301 hardened the smoke beyond the original 0-bid wiring check. Each
// run now SEEDS:
//   - 1 synthetic auth user (member)        — title prefixed "[__SMOKE]"
//   - 2 synthetic auth users (providers)    — with profiles rows that carry
//                                              differentiated rating signal
//   - 1 care_plan tied to the smoke member  — status='open'
//   - 2 plan_bids on that care_plan         — different amounts so the LLM
//                                              has a real ranking decision
// then fires care_plan.auction_closed for the seeded plan and asserts that
// the matchmaker writes a `proposed` row with a NON-NULL
// recommended_winner_bid_id that matches one of the seeded bid_ids. That
// upgrade catches silent regressions in the LLM call / JSON parse path that
// the original 0-bid synthetic auction would have missed.
//
// Cleanup runs in a finally{} block inside runAgentSmoke so the seeded rows
// are removed even when the smoke itself fails. Auth user deletion cascades
// the care_plan (FK ON DELETE CASCADE) which in turn cascades the plan_bids.
// ============================================================================

const crypto = require('node:crypto');
const {
  getSupabase, authorizeAgentInvocation, jsonResponse
} = require('./agent-fleet-runtime');
const {
  runAgentSmoke, validateMatchmakerAction
} = require('./gatekeeper-smoke-core');
const { persistRun, sendSmokeFailureEmail, MCC_APP_URL } = require('./agent-smoke-shared');

const AGENT_SLUG = 'matchmaker';
const AGENT_LABEL = 'Matchmaker';
const EVENT_TYPES = ['care_plan.auction_closed'];
const MAX_CAP_USD = 5.0; // matches the registry seed in 20260422_agent_fleet.sql
const SMOKE_TAG_PREFIX = '[__SMOKE matchmaker]';

// ---------------------------------------------------------------------------
// Seed: create 1 member + 2 provider auth users, a care_plan, and 2 plan_bids.
// Returns a context object consumed by payloadFn / validateAction / teardown.
//
// Tagging:
//   - care_plan.title is prefixed with SMOKE_TAG_PREFIX (visible to operators)
//   - care_plan.description carries `__smoke=true` JSON marker
//   - bid notes carry `__smoke=true`
//   - auth user emails follow `smoke-mm-*-${ts}@example.test`
//
// All rows are removed by teardownFn even on failure (finally{} in core).
// ---------------------------------------------------------------------------
async function _createSmokeAuthUser(supabase, role, ts) {
  const email = `smoke-mm-${role}-${ts}-${crypto.randomBytes(3).toString('hex')}@example.test`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password: crypto.randomBytes(16).toString('hex'),
    user_metadata: { __smoke: true, smoke_role: role, smoke_agent: 'matchmaker' }
  });
  if (error) throw new Error(`auth.admin.createUser(${role}): ${error.message}`);
  return { id: data.user.id, email };
}

async function _upsertSmokeProviderProfile(supabase, providerId, businessName, ratingSignal) {
  // The profiles row is auto-created by the on-auth-user-insert trigger.
  // Update it with differentiated provider quality signal so the LLM has
  // something concrete to rank on (rating + completed_jobs + BGC verified).
  const { error } = await supabase
    .from('profiles')
    .update({
      role: 'provider',
      business_name: businessName,
      full_name: businessName,
      avg_rating: ratingSignal.rating,
      review_count: ratingSignal.reviewCount,
      completed_jobs: ratingSignal.completedJobs,
      bgc_badge_verified: ratingSignal.bgcVerified,
      bgc_compliance_pct: ratingSignal.bgcVerified ? 100 : 50,
      verification_status: 'verified'
    })
    .eq('id', providerId);
  if (error) {
    // Non-fatal: matchmaker tolerates missing profile fields. Log and move on.
    console.warn('[smoke-scheduled:matchmaker] profile update failed:', error.message);
  }
}

// Seed mutates `context` progressively after EACH successful mutation so
// that, if any later step throws, the finally{} teardown in runAgentSmoke
// can still clean up the partial state (auth users / care_plan already
// created). Initialize the cleanup-relevant fields up-front to empty.
async function seedMatchmakerAuction({ supabase, log, context }) {
  const ts = Date.now();
  log.info('Seeding synthetic auction (1 member + 2 providers + 1 care_plan + 2 bids)');

  context.providerIds = [];
  context.bidIds = [];
  context.memberId = null;
  context.carePlanId = null;

  const member = await _createSmokeAuthUser(supabase, 'member', ts);
  context.memberId = member.id;

  const providerA = await _createSmokeAuthUser(supabase, 'providerA', ts);
  context.providerIds.push(providerA.id);

  const providerB = await _createSmokeAuthUser(supabase, 'providerB', ts);
  context.providerIds.push(providerB.id);

  // Differentiated provider signal — provider A is the obviously stronger pick
  // (higher rating, more completed jobs, BGC verified) at a slightly higher
  // price than provider B. The matchmaker prompt's heuristics ("verified BGC
  // outranks non-verified at the same price; rating below 3.5 with >=5
  // reviews is a yellow flag") makes either pick defensible — the smoke only
  // requires that the LLM picks ONE of the seeded bid_ids, not which one.
  // _upsertSmokeProviderProfile is best-effort (logs on failure), so it
  // doesn't risk leaving partial state.
  await _upsertSmokeProviderProfile(supabase, providerA.id, `${SMOKE_TAG_PREFIX} Garage A`, {
    rating: 4.8, reviewCount: 42, completedJobs: 31, bgcVerified: true
  });
  await _upsertSmokeProviderProfile(supabase, providerB.id, `${SMOKE_TAG_PREFIX} Garage B`, {
    rating: 3.9, reviewCount: 11, completedJobs: 6, bgcVerified: false
  });

  // Insert the care_plan. status='open' is fine — the matchmaker handler
  // only short-circuits on status='awarded'. The care_plan_id we send in
  // the synthetic event payload is what drives loadCarePlan / loadBids.
  const carePlanInsert = await supabase
    .from('care_plans')
    .insert({
      member_id: member.id,
      title: `${SMOKE_TAG_PREFIX} synthetic auction ${new Date(ts).toISOString()}`,
      description: JSON.stringify({ __smoke: true, agent: 'matchmaker', seeded_at: new Date(ts).toISOString() }),
      services: [{ name: 'Oil Change', __smoke: true }, { name: 'Brake Inspection', __smoke: true }],
      service_types: ['oil_change', 'brake_service'],
      value_min: 100.00,
      value_max: 250.00,
      city: 'Smoketown',
      state: 'CA',
      zip_code: '00000',
      status: 'open'
    })
    .select('id')
    .single();
  if (carePlanInsert.error) {
    throw new Error(`care_plans insert: ${carePlanInsert.error.message}`);
  }
  context.carePlanId = carePlanInsert.data.id;

  // Two plan_bids — different amounts so the LLM has a meaningful ranking.
  const bidsInsert = await supabase
    .from('plan_bids')
    .insert([
      {
        care_plan_id: context.carePlanId,
        provider_id: providerA.id,
        amount: 220.00,
        note: '__smoke=true | full inspection + premium oil',
        is_auto_bid: false,
        status: 'pending'
      },
      {
        care_plan_id: context.carePlanId,
        provider_id: providerB.id,
        amount: 165.00,
        note: '__smoke=true | basic oil change + visual brake check',
        is_auto_bid: false,
        status: 'pending'
      }
    ])
    .select('id');
  if (bidsInsert.error) {
    throw new Error(`plan_bids insert: ${bidsInsert.error.message}`);
  }
  context.bidIds = (bidsInsert.data || []).map(r => r.id);

  context._summary = {
    care_plan_id: context.carePlanId,
    bid_count: context.bidIds.length,
    provider_count: context.providerIds.length
  };
  log.info(`Seeded care_plan=${context.carePlanId} bids=[${context.bidIds.join(', ')}]`);
}

// Cleanup: best-effort, never throws to caller. Order matters because of
// FK cascades:
//   plan_bids → care_plans (CASCADE on care_plan_id and provider_id)
//   care_plans → auth.users (CASCADE on member_id)
//   profiles → auth.users (CASCADE; profiles.id REFERENCES auth.users.id)
// So deleting the care_plan first nukes the bids, and deleting the auth
// users nukes any leftover profile rows. We delete the care_plan explicitly
// before the auth user as a belt-and-suspenders measure (in case the
// member's auth user is gone but the care_plan somehow survives).
async function cleanupMatchmakerAuction({ supabase, log, context }) {
  const summary = { care_plan_deleted: false, auth_users_deleted: 0, errors: [] };
  if (!context) return summary;

  if (context.carePlanId) {
    const { error } = await supabase.from('care_plans').delete().eq('id', context.carePlanId);
    if (error) {
      summary.errors.push(`care_plans delete: ${error.message}`);
      log.fail(`cleanup care_plan ${context.carePlanId}: ${error.message}`);
    } else {
      summary.care_plan_deleted = true;
    }
  }

  const allUserIds = [context.memberId, ...(context.providerIds || [])].filter(Boolean);
  for (const uid of allUserIds) {
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

  log.info(`Cleanup: care_plan_deleted=${summary.care_plan_deleted} auth_users_deleted=${summary.auth_users_deleted}/${allUserIds.length}`);
  return summary;
}

// payloadFn closure — uses the seeded care_plan_id from setup context.
function buildMatchmakerPayload(_eventType, context) {
  return {
    __smoke: true,
    smoked_at: new Date().toISOString(),
    care_plan_id: context?.carePlanId || null
  };
}

exports.handler = async function(event) {
  if (event && event.httpMethod === 'OPTIONS') return jsonResponse(200, { ok: true });

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
      payloadFn: buildMatchmakerPayload,
      validateAction: validateMatchmakerAction,
      expectedMaxCapUsd: MAX_CAP_USD,
      setupFn: seedMatchmakerAuction,
      teardownFn: cleanupMatchmakerAuction
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
        'the orchestrator function logs, and the agent-matchmaker function logs / ANTHROPIC_API_KEY rotation status. ' +
        'Task #301 also seeds a real care_plan + 2 bids — if the failure is <code>winner_bid_id_null_on_seeded_auction</code> ' +
        'the LLM ranking call ran but produced no winner (model output / JSON parse regression).'
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

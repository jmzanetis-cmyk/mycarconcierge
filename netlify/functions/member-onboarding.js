// GET  /api/member/onboarding                 — member-side checklist (default)
// GET  /api/member/onboarding?role=provider   — provider-side checklist (2026-09-18)
// POST /api/member/onboarding/step            — mark a step done (upsert to member_onboarding_steps)
// Auth: Bearer JWT
//
// The provider branch was added 2026-09-18 to close a shipped-broken behavior:
// providers.html's `initProviderChecklist` calls
// `/api/member/onboarding?role=provider` and looks for keys prefixed
// `provider_*` (profile/docs/services/stripe/first_booking, plus a new
// rate_card key), but the endpoint was ignoring the query param and only ever
// returning member-side keys — every provider on prod saw an all-zero
// checklist regardless of what they'd actually done. See the client's STEPS
// array in providers.html (~7239) for the canonical key list.
'use strict';

const { createClient } = require('@supabase/supabase-js');

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
    body: JSON.stringify(body),
  };
}

async function getUser(event, sb) {
  const auth = (event.headers?.authorization || event.headers?.Authorization || '');
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { error: json(401, { error: 'Missing token' }) };
  const { data: { user }, error } = await sb.auth.getUser(m[1].trim());
  if (error || !user) return { error: json(401, { error: 'Invalid token' }) };
  return { user };
}

function isStepPath(path) {
  return /\/api\/member\/onboarding\/step\/?$/.test(path || '');
}

async function handleGet(event, sb, user) {
  const uid = user.id;
  const qs = event.queryStringParameters || {};
  const role = qs.role === 'provider' ? 'provider' : 'member';

  if (role === 'provider') return handleProviderChecklist(sb, uid);
  return handleMemberChecklist(sb, uid);
}

async function handleMemberChecklist(sb, uid) {
  // Run all DB checks in parallel
  const [
    profileRes,
    vehicleRes,
    carePlanRes,
    stepsRes,
    surveyRes,
  ] = await Promise.all([
    sb.from('profiles').select('full_name, phone').eq('id', uid).maybeSingle(),
    sb.from('vehicles').select('id').eq('owner_id', uid).limit(1),
    sb.from('care_plans').select('id').eq('member_id', uid).limit(1),
    sb.from('member_onboarding_steps').select('step').eq('user_id', uid),
    sb.from('survey_responses').select('top_priority').eq('user_id', uid).maybeSingle(),
  ]);

  const profile = profileRes.data;
  const completedSteps = new Set((stepsRes.data || []).map(r => r.step));

  const checklist = {
    account_created:       !!profile,
    profile_completed:     !!(profile && profile.full_name && profile.phone),
    vehicle_added:         !!(vehicleRes.data && vehicleRes.data.length > 0),
    request_posted:        !!(carePlanRes.data && carePlanRes.data.length > 0),
    notifications_enabled: completedSteps.has('notifications_enabled'),
    welcome_shown:         completedSteps.has('welcome_shown'),
  };

  const survey_completed = !!surveyRes.data;
  const top_priority     = surveyRes.data?.top_priority || null;

  return json(200, { survey_completed, checklist, top_priority });
}

// Provider checklist. Matches the STEPS array in www/providers.html at
// initProviderChecklist — every key added here must have a corresponding
// STEPS entry there or it will silently do nothing. Six queries run in
// parallel (~one round trip); all fail-open (missing/error → false), so a
// transient DB blip on one check can't accidentally flag a step as
// "complete" — it just reads as incomplete until the next reload.
async function handleProviderChecklist(sb, uid) {
  const [
    profileRes,
    docsRes,
    rateCardRes,
    firstBookingRes,
  ] = await Promise.all([
    // 1. Profile completeness — the same "does the provider have their
    //    shop's basics filled in" check the Business Profile page saves.
    //    services_offered doubles as the "provider_services" signal, kept
    //    on the same row so one query covers both keys. verification_status
    //    drives the provider_verified step added in Phase 3 (submitted →
    //    pending, admin-approved → verified; both count as "done" for
    //    the checklist).
    sb.from('profiles')
      .select('business_name, city, state, description, services_offered, stripe_account_id, verification_status')
      .eq('id', uid)
      .maybeSingle(),
    // 2. At least one verification doc uploaded (any document_type).
    sb.from('provider_documents').select('id').eq('provider_id', uid).limit(1),
    // 3. Rate Card: at least one row for this provider with a positive
    //    price_cents AND active=true — same combination the Auto-Bid
    //    matching engine and public profile display treat as "priced."
    //    A row with active=false or a null price wouldn't get matched on.
    sb.from('provider_rate_card_items')
      .select('id')
      .eq('provider_id', uid)
      .eq('active', true)
      .not('price_cents', 'is', null)
      .limit(1),
    // 4. Received first booking: at least one plan_bids row for this
    //    provider with status='accepted'. Same signal `provider_earnings`
    //    reports use — the member accepted their bid.
    sb.from('plan_bids').select('id').eq('provider_id', uid).eq('status', 'accepted').limit(1),
  ]);

  const profile = profileRes.data;
  const services = Array.isArray(profile && profile.services_offered) ? profile.services_offered : [];
  const vStatus = profile && profile.verification_status;

  const checklist = {
    provider_profile: !!(profile && profile.business_name && profile.city && profile.state && profile.description),
    provider_docs:    !!(docsRes.data && docsRes.data.length > 0),
    // Phase 3 — provider_verified counts as done once verification has
    // been submitted (pending) or granted (verified). Both are terminal
    // states from the provider's checklist point of view: they've taken
    // the action, admin review is now on the platform side.
    provider_verified: vStatus === 'pending' || vStatus === 'verified',
    provider_services: services.length > 0,
    provider_stripe:  !!(profile && profile.stripe_account_id),
    provider_rate_card: !!(rateCardRes.data && rateCardRes.data.length > 0),
    provider_first_booking: !!(firstBookingRes.data && firstBookingRes.data.length > 0),
  };

  return json(200, { checklist });
}

async function handleMarkStep(event, sb, user) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const step = body.step;
  if (!step || typeof step !== 'string' || step.length > 100) {
    return json(400, { error: 'step is required' });
  }

  if (body.value === false) {
    // Allow un-marking a step (delete)
    await sb.from('member_onboarding_steps').delete().eq('user_id', user.id).eq('step', step);
    return json(200, { success: true });
  }

  const { error } = await sb.from('member_onboarding_steps')
    .upsert({ user_id: user.id, step, completed_at: new Date().toISOString() }, { onConflict: 'user_id,step' });

  if (error) {
    console.error('[member-onboarding] upsert error:', error.message);
    return json(500, { error: 'Failed to save step' });
  }

  return json(200, { success: true });
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  const sb = supabase();
  const auth = await getUser(event, sb);
  if (auth.error) return auth.error;

  if (event.httpMethod === 'GET' && !isStepPath(event.path)) {
    return handleGet(event, sb, auth.user);
  }
  if (event.httpMethod === 'POST' && isStepPath(event.path)) {
    return handleMarkStep(event, sb, auth.user);
  }

  return json(405, { error: 'Method not allowed' });
};

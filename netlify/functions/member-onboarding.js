// GET  /api/member/onboarding       — return step completion + survey status
// POST /api/member/onboarding/step  — mark a step done (upsert to member_onboarding_steps)
// Auth: Bearer JWT
'use strict';

const { createClient } = require('@supabase/supabase-js');

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
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

async function handleGet(sb, user) {
  const uid = user.id;

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
    return handleGet(sb, auth.user);
  }
  if (event.httpMethod === 'POST' && isStepPath(event.path)) {
    return handleMarkStep(event, sb, auth.user);
  }

  return json(405, { error: 'Method not allowed' });
};

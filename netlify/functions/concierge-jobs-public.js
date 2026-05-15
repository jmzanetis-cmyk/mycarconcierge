// ============================================================================
// Task #369 — Member & provider concierge job endpoints.
//
// Mounted at  /.netlify/functions/concierge-jobs-public/*
// Proxied via /api/concierge/* by www/_redirects.
//
// Routes:
//   GET    /                     — list jobs the caller can see
//                                  (member's own; provider's at-shop jobs)
//   GET    /:job_id              — single job (must be owned by caller)
//   POST   /                     — create a job
//                                    members: must own the appointment (if
//                                      appointment_id given) or have no
//                                      appointment, and member_id must be
//                                      themselves
//                                    providers: appointment_id required and
//                                      provider_id must match the caller; the
//                                      member_id is read from the appointment
//   POST   /:job_id/cancel       — cancel a job (caller must be the creator)
//
// SECURITY MODEL
//   - Authentication is a bearer Supabase JWT (the SAME session cookie/token
//     the user uses to talk to Supabase from members.html / providers.html).
//     We resolve it with `supabase.auth.getUser(token)` against the service
//     client — that does NOT trust the token's "sub" blindly, it asks the
//     auth server.
//   - All writes use the service-role client (RLS bypass) but every write is
//     gated by an explicit caller-vs-target ownership check above. We never
//     trust the body's member_id / provider_id without verifying.
//   - Leg expansion is delegated to ./_concierge-scenarios.js so members and
//     providers cannot construct arbitrary leg sequences.
// ============================================================================

const { createClient } = require('@supabase/supabase-js');
const { EXPAND_SCENARIO, SCENARIO_TIER, expandLegs } = require('./_concierge-scenarios');

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    },
    body: typeof data === 'string' ? data : JSON.stringify(data)
  };
}

function getBearerToken(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function isUuid(v) {
  return typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

async function authenticateUser(event, supabase) {
  const token = getBearerToken(event);
  if (!token) return { error: jsonResponse(401, { error: 'missing bearer token' }) };
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { error: jsonResponse(401, { error: 'invalid token' }) };
  return { user: data.user };
}

async function loadProfile(supabase, userId) {
  const { data } = await supabase.from('profiles')
    .select('id, role, secondary_role').eq('id', userId).maybeSingle();
  return data || null;
}

function callerActsAsProvider(profile, providerId) {
  if (!profile || profile.id !== providerId) return false;
  return profile.role === 'provider' || profile.secondary_role === 'provider';
}

async function audit(supabase, row) {
  try { await supabase.from('admin_audit_log').insert(row); } catch { /* best-effort */ }
}

async function emitEvent(supabase, eventType, payload) {
  try {
    await supabase.from('agent_events').insert({
      event_type: eventType, payload, source: 'concierge-jobs-public'
    });
  } catch { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleList(event, supabase, user, profile) {
  const q = event.queryStringParameters || {};
  const role = q.role === 'provider' ? 'provider' : 'member';

  let query = supabase.from('concierge_jobs')
    .select('*, legs:concierge_job_legs(*), assignments:concierge_job_drivers(*)')
    .order('scheduled_start_at', { ascending: false, nullsFirst: false })
    .limit(100);

  if (role === 'provider') {
    if (!callerActsAsProvider(profile, user.id)) {
      return jsonResponse(403, { error: 'caller is not a provider' });
    }
    query = query.eq('provider_id', user.id);
  } else {
    query = query.eq('member_id', user.id);
  }
  if (q.status) query = query.eq('status', q.status);

  const { data, error } = await query;
  if (error) return jsonResponse(500, { error: error.message });
  const jobs = data || [];
  for (const j of jobs) if (Array.isArray(j.legs)) j.legs.sort((a,b) => a.sequence - b.sequence);
  return jsonResponse(200, { jobs });
}

async function handleGet(event, supabase, user, profile, jobId) {
  if (!isUuid(jobId)) return jsonResponse(400, { error: 'invalid job id' });
  const { data, error } = await supabase
    .from('concierge_jobs')
    .select('*, legs:concierge_job_legs(*), assignments:concierge_job_drivers(*)')
    .eq('id', jobId).maybeSingle();
  if (error) return jsonResponse(500, { error: error.message });
  if (!data)  return jsonResponse(404, { error: 'job not found' });
  const isMember   = data.member_id   === user.id;
  const isProvider = data.provider_id === user.id && callerActsAsProvider(profile, user.id);
  if (!isMember && !isProvider) return jsonResponse(403, { error: 'forbidden' });
  if (Array.isArray(data.legs)) data.legs.sort((a,b) => a.sequence - b.sequence);
  return jsonResponse(200, { job: data });
}

async function handleCreate(event, supabase, user, profile, body) {
  // Determine the caller's "kind" for this request. Provider creation is
  // only allowed when the caller has a provider role AND is named on the
  // referenced appointment.
  const wantsProvider = body.created_by_kind === 'provider';
  if (wantsProvider && !callerActsAsProvider(profile, user.id)) {
    return jsonResponse(403, { error: 'caller is not a provider' });
  }
  const kind = wantsProvider ? 'provider' : 'member';

  const tier     = Number(body.tier);
  const scenario = Number(body.scenario);
  const errors = [];
  if (!Number.isInteger(tier) || tier < 1 || tier > 4) errors.push('tier must be 1-4');
  if (!Number.isInteger(scenario) || !EXPAND_SCENARIO[scenario]) errors.push('scenario must be 1-11');
  if (Number.isInteger(scenario) && Number.isInteger(tier) && SCENARIO_TIER[scenario] !== tier) {
    errors.push(`scenario ${scenario} requires tier ${SCENARIO_TIER[scenario]}`);
  }
  if (body.appointment_id && !isUuid(body.appointment_id)) errors.push('appointment_id must be uuid');
  if (errors.length) return jsonResponse(400, { error: 'validation failed', details: errors });

  // Resolve member_id + provider_id authoritatively. NEVER trust body.
  let memberId, providerId;
  if (body.appointment_id) {
    const { data: appt } = await supabase.from('appointments')
      .select('id, member_id, provider_id').eq('id', body.appointment_id).maybeSingle();
    if (!appt) return jsonResponse(404, { error: 'appointment not found' });
    if (kind === 'member' && appt.member_id !== user.id) {
      return jsonResponse(403, { error: 'appointment belongs to a different member' });
    }
    if (kind === 'provider' && appt.provider_id !== user.id) {
      return jsonResponse(403, { error: 'appointment belongs to a different provider' });
    }
    memberId   = appt.member_id;
    providerId = appt.provider_id || null;
  } else {
    if (kind === 'provider') {
      return jsonResponse(400, { error: 'providers must reference an appointment_id' });
    }
    memberId   = user.id;
    providerId = null;
  }

  const job = {
    member_id:          memberId,
    appointment_id:     body.appointment_id || null,
    provider_id:        providerId,
    tier, scenario,
    status:             'requested',
    scheduled_start_at: body.scheduled_start_at || null,
    pickup_address:     body.pickup_address  || null,
    pickup_lat:         isFinite(Number(body.pickup_lat))  ? Number(body.pickup_lat)  : null,
    pickup_lng:         isFinite(Number(body.pickup_lng))  ? Number(body.pickup_lng)  : null,
    dropoff_address:    body.dropoff_address || null,
    dropoff_lat:        isFinite(Number(body.dropoff_lat)) ? Number(body.dropoff_lat) : null,
    dropoff_lng:        isFinite(Number(body.dropoff_lng)) ? Number(body.dropoff_lng) : null,
    member_vehicle_id:  body.member_vehicle_id  || null,
    partner_vehicle_id: body.partner_vehicle_id || null,
    total_price_cents:  Number.isInteger(body.total_price_cents) ? body.total_price_cents : 0,
    notes:              body.notes ? String(body.notes).slice(0, 1000) : null,
    created_by_admin:   kind, // legacy column kept in sync
    created_by_kind:    kind,
    created_by_id:      user.id
  };

  const { data: jobRow, error: jobErr } = await supabase
    .from('concierge_jobs').insert(job).select('*').single();
  if (jobErr) return jsonResponse(500, { error: 'failed to create job', details: jobErr.message });

  const legs = expandLegs(scenario, jobRow).map(l => ({ ...l, job_id: jobRow.id }));
  const { data: legRows, error: legErr } = await supabase
    .from('concierge_job_legs').insert(legs).select('*');
  if (legErr) {
    await supabase.from('concierge_jobs').delete().eq('id', jobRow.id);
    return jsonResponse(500, { error: 'failed to create legs', details: legErr.message });
  }

  await audit(supabase, {
    action: 'create_concierge_job',
    target_id: jobRow.id, target_type: 'concierge_job',
    metadata: { tier, scenario, member_id: memberId, provider_id: providerId, leg_count: legs.length, source: kind },
    performed_by: user.id
  });
  await emitEvent(supabase, 'concierge.job_requested', {
    job_id: jobRow.id, member_id: memberId, provider_id: providerId, source: kind
  });

  return jsonResponse(200, { job: { ...jobRow, legs: legRows } });
}

async function handleCancel(event, supabase, user, profile, jobId, body) {
  if (!isUuid(jobId)) return jsonResponse(400, { error: 'invalid job id' });
  const reason = (body.reason || '').toString().trim();
  if (reason.length < 3 || reason.length > 500) return jsonResponse(400, { error: 'reason must be 3-500 chars' });

  const { data: job } = await supabase.from('concierge_jobs')
    .select('id, status, member_id, provider_id, created_by_id').eq('id', jobId).maybeSingle();
  if (!job) return jsonResponse(404, { error: 'job not found' });

  // Allow cancellation by the creator, the named member, or the named provider.
  const isMember   = job.member_id   === user.id;
  const isProvider = job.provider_id === user.id && callerActsAsProvider(profile, user.id);
  const isCreator  = job.created_by_id && job.created_by_id === user.id;
  if (!isMember && !isProvider && !isCreator) return jsonResponse(403, { error: 'forbidden' });
  if (job.status === 'completed') return jsonResponse(409, { error: 'cannot cancel a completed job' });
  if (job.status === 'cancelled') return jsonResponse(200, { ok: true, already: true });

  const { error } = await supabase.from('concierge_jobs')
    .update({ status: 'cancelled', cancelled_reason: reason, cancelled_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) return jsonResponse(500, { error: error.message });

  await audit(supabase, {
    action: 'cancel_concierge_job',
    target_id: jobId, target_type: 'concierge_job',
    reason, performed_by: user.id,
    metadata: { source: isProvider ? 'provider' : 'member' }
  });
  await emitEvent(supabase, 'concierge.job_cancelled', { job_id: jobId, by: user.id });
  return jsonResponse(200, { ok: true });
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------
function stripPrefix(p) {
  return (p || '')
    .replace(/^\/?\.netlify\/functions\/concierge-jobs-public\/?/, '')
    .replace(/^\/?api\/concierge\/?/, '')
    .replace(/^\/+/, '');
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  const supabase = getServiceSupabase();
  if (!supabase) return jsonResponse(500, { error: 'Database not configured' });

  const auth = await authenticateUser(event, supabase);
  if (auth.error) return auth.error;
  const user = auth.user;
  const profile = await loadProfile(supabase, user.id);

  const route = stripPrefix(event.path);
  const method = event.httpMethod;
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch { return jsonResponse(400, { error: 'invalid JSON body' }); }
  }

  try {
    if (method === 'GET'  && route === '') return await handleList(event, supabase, user, profile);
    if (method === 'POST' && route === '') return await handleCreate(event, supabase, user, profile, body);
    let m = route.match(/^([^/]+)$/);
    if (m && method === 'GET')  return await handleGet(event, supabase, user, profile, m[1]);
    m = route.match(/^([^/]+)\/cancel$/);
    if (m && method === 'POST') return await handleCancel(event, supabase, user, profile, m[1], body);
    return jsonResponse(404, { error: 'Not found', path: route, method });
  } catch (e) {
    console.error('[concierge-jobs-public] handler error:', e);
    return jsonResponse(500, { error: e.message });
  }
};

// Re-export for tests / shared use.
module.exports.EXPAND_SCENARIO = EXPAND_SCENARIO;
module.exports.SCENARIO_TIER   = SCENARIO_TIER;
module.exports.expandLegs      = expandLegs;

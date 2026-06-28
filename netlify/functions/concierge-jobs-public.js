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
//   POST   /:job_id/transition   — provider/member-side status transition
//                                    body { to_status, note? }
//                                    allowed transitions are scoped per role
//                                    (see TRANSITIONS below).
//   POST   /:job_id/update-address — provider-only address adjustment
//                                    body { field: 'pickup'|'dropoff',
//                                           address, lat?, lng? }
//                                    Refused once any driver assignment has
//                                    accepted (concierge_job_drivers.accepted_at
//                                    is NOT NULL) so a driver never sees
//                                    a different address than the one they
//                                    accepted.
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

// Local wrapper around the shared audit helper, pre-bound to this file's
// pre-extraction behaviour: silent swallow (no log, no alert). See
// netlify/functions/_shared/audit.js.
const { audit: sharedAudit } = require('./_shared/audit');
const audit = (supabase, row) =>
  sharedAudit(supabase, row, { alertOnFailure: false, logOnFailure: false });

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
  // Enrich assignments with driver display name + photo so the shared
  // status screen can show "who is driving". Done with manual joins to
  // avoid relying on PostgREST FK relationships that may not be wired
  // up in older environments.
  const assignments = Array.isArray(data.assignments) ? data.assignments : [];
  const driverIds = [...new Set(assignments.map(a => a.driver_id).filter(Boolean))];
  if (driverIds.length) {
    const { data: drvs } = await supabase.from('drivers')
      .select('id, profile_id, display_name').in('id', driverIds);
    const profileIds = (drvs || []).map(d => d.profile_id).filter(Boolean);
    let profMap = {};
    if (profileIds.length) {
      const { data: profs } = await supabase.from('profiles')
        .select('id, full_name, avatar_url').in('id', profileIds);
      profMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
    }
    const drvMap = Object.fromEntries((drvs || []).map(d => {
      const p = d.profile_id ? profMap[d.profile_id] : null;
      return [d.id, {
        driver_id:  d.id,
        name:       (p && p.full_name) || d.display_name || 'Driver',
        avatar_url: (p && p.avatar_url) || null
      }];
    }));
    for (const a of assignments) {
      a.driver = drvMap[a.driver_id] || null;
    }
  }
  // Compute current leg = first leg whose completed_at is null (or last
  // leg if all complete). Lets the status screen render a stable "now".
  if (Array.isArray(data.legs) && data.legs.length) {
    const pending = data.legs.find(l => !l.completed_at);
    data.current_leg = pending || data.legs[data.legs.length - 1];
  }
  return jsonResponse(200, { job: data });
}

async function handleCreate(event, supabase, user, profile, body) {
  // Caller "kind" is derived AUTHORITATIVELY from the caller's profile
  // role + the appointment relationship below — body.created_by_kind is a
  // hint only, never trusted to grant the provider path. A caller without
  // the provider role always falls into member-creation, regardless of
  // what the body says.
  const callerIsProvider = callerActsAsProvider(profile, user.id);
  if (body.created_by_kind === 'provider' && !callerIsProvider) {
    return jsonResponse(403, { error: 'caller is not a provider' });
  }
  // Round-11 contract hardening: if the caller explicitly opts into the
  // provider path (`created_by_kind:'provider'`), they MUST supply an
  // appointment_id they own. We won't silently fall back to a member-kind
  // job for provider-mode requests — that would mask a UX bug and let a
  // provider create unscoped member jobs by accident.
  if (body.created_by_kind === 'provider' && !body.appointment_id) {
    return jsonResponse(400, { error: 'provider requests require appointment_id' });
  }
  // If an appointment_id is given AND the caller owns it as the provider,
  // they're acting as the provider. Otherwise default to member.
  let kind = 'member';
  if (callerIsProvider && body.appointment_id && isUuid(body.appointment_id)) {
    const { data: apptRole } = await supabase.from('appointments')
      .select('provider_id').eq('id', body.appointment_id).maybeSingle();
    if (apptRole && apptRole.provider_id === user.id) kind = 'provider';
  }
  // Explicit kind=member from a provider caller is honored.
  if (body.created_by_kind === 'member') kind = 'member';

  const tier     = Number(body.tier);
  const scenario = Number(body.scenario);
  const errors = [];
  if (!Number.isInteger(tier) || tier < 1 || tier > 4) errors.push('tier must be 1-4');
  if (!Number.isInteger(scenario) || !EXPAND_SCENARIO[scenario]) errors.push('scenario must be 1-11');
  if (Number.isInteger(scenario) && Number.isInteger(tier) && SCENARIO_TIER[scenario] !== tier) {
    errors.push(`scenario ${scenario} requires tier ${SCENARIO_TIER[scenario]}`);
  }
  if (body.appointment_id && !isUuid(body.appointment_id)) errors.push('appointment_id must be uuid');
  // Pickup + dropoff addresses are required so legs always have routable
  // endpoints. UI sends them, but the API must enforce it for direct calls.
  const pickupOk  = typeof body.pickup_address  === 'string' && body.pickup_address.trim().length  >= 3;
  const dropoffOk = typeof body.dropoff_address === 'string' && body.dropoff_address.trim().length >= 3;
  if (!pickupOk)  errors.push('pickup_address is required (min 3 chars)');
  if (!dropoffOk) errors.push('dropoff_address is required (min 3 chars)');
  if (errors.length) return jsonResponse(400, { error: 'validation failed', details: errors });

  // Vehicle ownership check: if the caller supplies member_vehicle_id we
  // verify that vehicle belongs to the member who will end up owning the job
  // (the caller for member-created jobs, or the appointment's member for
  // provider-created jobs). Without this a malicious caller could attach
  // someone else's vehicle id to a job they own.
  let resolvedMemberId = user.id;
  if (body.appointment_id) {
    const { data: apptOwner } = await supabase.from('appointments')
      .select('member_id').eq('id', body.appointment_id).maybeSingle();
    if (apptOwner) resolvedMemberId = apptOwner.member_id;
  }
  if (body.member_vehicle_id) {
    if (!isUuid(body.member_vehicle_id)) return jsonResponse(400, { error: 'member_vehicle_id must be uuid' });
    const { data: veh } = await supabase.from('vehicles')
      .select('id, owner_id').eq('id', body.member_vehicle_id).maybeSingle();
    if (!veh) return jsonResponse(404, { error: 'vehicle not found' });
    if (veh.owner_id !== resolvedMemberId) {
      return jsonResponse(403, { error: 'vehicle does not belong to the named member' });
    }
  }

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

// Allowed status transitions per caller role. Keeps the lifecycle tightly
// gated so members and providers can only push the job through the states
// they are actually responsible for.
const TRANSITIONS = {
  provider: {
    scheduled:        ['vehicle_received','problem_flagged'],
    in_progress:      ['vehicle_received','problem_flagged'],
    vehicle_received: ['vehicle_released','problem_flagged'],
    vehicle_released: ['completed','problem_flagged'],
    requested:        ['problem_flagged']
  },
  member: {
    requested:        ['problem_flagged'],
    scheduled:        ['problem_flagged'],
    in_progress:      ['problem_flagged'],
    vehicle_received: ['problem_flagged'],
    vehicle_released: ['problem_flagged']
  }
};

async function handleTransition(event, supabase, user, profile, jobId, body) {
  if (!isUuid(jobId)) return jsonResponse(400, { error: 'invalid job id' });
  const toStatus = String(body.to_status || '').trim();
  if (!toStatus) return jsonResponse(400, { error: 'to_status required' });
  const note = body.note ? String(body.note).slice(0, 1000) : null;

  const { data: job } = await supabase.from('concierge_jobs')
    .select('id, status, member_id, provider_id, notes').eq('id', jobId).maybeSingle();
  if (!job) return jsonResponse(404, { error: 'job not found' });

  const isMember   = job.member_id   === user.id;
  const isProvider = job.provider_id === user.id && callerActsAsProvider(profile, user.id);
  if (!isMember && !isProvider) return jsonResponse(403, { error: 'forbidden' });
  const role = isProvider ? 'provider' : 'member';

  const allowed = (TRANSITIONS[role] && TRANSITIONS[role][job.status]) || [];
  if (!allowed.includes(toStatus)) {
    return jsonResponse(409, {
      error: `${role} cannot move job from ${job.status} to ${toStatus}`,
      allowed
    });
  }

  const update = { status: toStatus };
  if (note) update.notes = (job.notes ? job.notes + '\n---\n' : '') + `[${role} ${new Date().toISOString()}] ${note}`;

  const { error } = await supabase.from('concierge_jobs').update(update).eq('id', jobId);
  if (error) return jsonResponse(500, { error: error.message });

  await audit(supabase, {
    action: 'transition_concierge_job',
    target_id: jobId, target_type: 'concierge_job',
    metadata: { from: job.status, to: toStatus, source: role, note },
    performed_by: user.id
  });
  await emitEvent(supabase, 'concierge.status_changed', {
    job_id: jobId, from: job.status, to: toStatus, by: user.id, role
  });
  return jsonResponse(200, { ok: true, status: toStatus });
}

async function handleUpdateAddress(event, supabase, user, profile, jobId, body) {
  if (!isUuid(jobId)) return jsonResponse(400, { error: 'invalid job id' });
  const field = String(body.field || '').toLowerCase();
  // Providers may only adjust the shop side (dropoff). The member's pickup
  // address is theirs to edit via the member surfaces, never the provider's.
  if (field !== 'dropoff') {
    return jsonResponse(400, { error: 'providers can only adjust the shop (dropoff) address; pickup is the member\'s to set' });
  }
  const address = String(body.address || '').trim();
  if (address.length < 3 || address.length > 500) {
    return jsonResponse(400, { error: 'address must be 3-500 chars' });
  }
  const lat = isFinite(Number(body.lat)) ? Number(body.lat) : null;
  const lng = isFinite(Number(body.lng)) ? Number(body.lng) : null;

  const { data: job } = await supabase.from('concierge_jobs')
    .select('id, status, member_id, provider_id, pickup_address, dropoff_address, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng')
    .eq('id', jobId).maybeSingle();
  if (!job) return jsonResponse(404, { error: 'job not found' });

  // Provider-only adjustment.
  const isProvider = job.provider_id === user.id && callerActsAsProvider(profile, user.id);
  if (!isProvider) return jsonResponse(403, { error: 'only the named provider may adjust shop address' });
  if (job.status === 'completed' || job.status === 'cancelled') {
    return jsonResponse(409, { error: `cannot edit address on ${job.status} job` });
  }

  // Guard: refuse once any assignment has accepted_at populated, so the
  // driver never sees a different address than the one they accepted.
  const { data: accepted } = await supabase.from('concierge_job_drivers')
    .select('id, role, accepted_at').eq('job_id', jobId).not('accepted_at', 'is', null);
  if (Array.isArray(accepted) && accepted.length > 0) {
    return jsonResponse(409, {
      error: 'a driver has already accepted; address can no longer be edited',
      accepted_roles: accepted.map(a => a.role)
    });
  }

  const updates = {};
  if (field === 'pickup') {
    updates.pickup_address = address;
    if (lat !== null) updates.pickup_lat = lat;
    if (lng !== null) updates.pickup_lng = lng;
  } else {
    updates.dropoff_address = address;
    if (lat !== null) updates.dropoff_lat = lat;
    if (lng !== null) updates.dropoff_lng = lng;
  }

  const { error: jobErr } = await supabase.from('concierge_jobs')
    .update(updates).eq('id', jobId);
  if (jobErr) return jsonResponse(500, { error: jobErr.message });

  // Mirror onto unstarted (pending) legs whose from/to matches the job's
  // old address so distance/route stays consistent. Schema columns are
  // from_address / from_lat / from_lng and to_address / to_lat / to_lng
  // (see supabase/migrations/20260514c_driver_concierge_jobs.sql).
  //
  // Round-trip scenarios reuse the same shop/home address as both the
  // origin (`from_address`) of one leg and the destination (`to_address`)
  // of another, so we mirror across BOTH sides — any pending leg whose
  // from_ OR to_ field still matches the old address gets updated.
  const oldAddress = field === 'pickup' ? job.pickup_address : job.dropoff_address;
  const sides = [
    { addr: 'from_address', lat: 'from_lat', lng: 'from_lng' },
    { addr: 'to_address',   lat: 'to_lat',   lng: 'to_lng'   }
  ];
  if (oldAddress) {
    for (const side of sides) {
      const legUpdate = { [side.addr]: address };
      if (lat !== null) legUpdate[side.lat] = lat;
      if (lng !== null) legUpdate[side.lng] = lng;
      const { error: legErr } = await supabase.from('concierge_job_legs')
        .update(legUpdate)
        .eq('job_id', jobId)
        .eq(side.addr, oldAddress)
        .eq('status', 'pending');
      if (legErr) {
        // Hard fail: drivers must never see a job address that disagrees
        // with their leg routing data. Roll the job row back to the old
        // address before returning so on-disk state stays consistent.
        const rollback = field === 'pickup'
          ? { pickup_address: job.pickup_address, pickup_lat: job.pickup_lat, pickup_lng: job.pickup_lng }
          : { dropoff_address: job.dropoff_address, dropoff_lat: job.dropoff_lat, dropoff_lng: job.dropoff_lng };
        await supabase.from('concierge_jobs').update(rollback).eq('id', jobId);
        return jsonResponse(500, { error: 'leg mirror failed: ' + legErr.message });
      }
    }
  }

  await audit(supabase, {
    action: 'update_concierge_job_address',
    target_id: jobId, target_type: 'concierge_job',
    metadata: { field, old: oldAddress, new: address, source: 'provider' },
    performed_by: user.id
  });
  await emitEvent(supabase, 'concierge.address_updated', {
    job_id: jobId, field, address, by: user.id
  });

  return jsonResponse(200, { ok: true, [field + '_address']: address });
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
    m = route.match(/^([^/]+)\/transition$/);
    if (m && method === 'POST') return await handleTransition(event, supabase, user, profile, m[1], body);
    m = route.match(/^([^/]+)\/update-address$/);
    if (m && method === 'POST') return await handleUpdateAddress(event, supabase, user, profile, m[1], body);
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
module.exports.TRANSITIONS     = TRANSITIONS;

// ============================================================================
// concierge-jobs-admin  (Task #332)
//
// Admin-only endpoints for creating and managing concierge jobs that the
// Driver app then sees. The Driver app does NOT call these — it has the
// driver-api function for its own reads/writes.
//
// Routes (mounted at /.netlify/functions/concierge-jobs-admin/* and proxied
// from /api/admin/concierge-jobs/* via www/_redirects):
//
//   GET  /                          — list jobs (filters: status, driver_id, member_id, from, to)
//   POST /                          — create a new job (server expands legs from scenario)
//   GET  /:id                       — fetch one job with legs + assignments
//   POST /:id/assign-driver         { driver_id, role }
//   POST /:id/cancel                { reason }
//
// All routes require x-admin-password (or x-admin-token) matching
// ADMIN_PASSWORD. Every state-changing action writes an admin_audit_log row.
//
// LEG EXPANSION
//   The 11 canonical scenarios are expanded server-side from
//   `EXPAND_SCENARIO`. Clients NEVER supply legs. Keep this table in sync
//   with the migration header and docs/driver-app-api.md.
// ============================================================================

const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token, x-admin-token, X-Admin-Password, x-admin-password',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    },
    body: typeof data === 'string' ? data : JSON.stringify(data)
  };
}

function authenticateAdmin(event) {
  const h = event.headers || {};
  const pw = (h['x-admin-password'] || h['X-Admin-Password'] || '').trim();
  const tk = (h['x-admin-token']    || h['X-Admin-Token']    || '').trim();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  return pw === adminPassword || tk === adminPassword;
}

function isUuid(v) {
  return typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

async function audit(supabase, row) {
  try { await supabase.from('admin_audit_log').insert(row); } catch (e) { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Scenario → legs expansion. Source of truth shared with the migration
// header comment and docs/driver-app-api.md.
//
// Each leg is described by:
//   { leg_type, driver_role, direction, carries_passenger,
//     carries_member_vehicle, carries_partner_vehicle }
//
// `direction` is 'pickup_to_dropoff' (member's home/origin → provider) or
// 'dropoff_to_pickup' (provider → home). The address fields on the job
// (pickup_*/dropoff_*) are the canonical "home/origin" and "provider"
// endpoints respectively.
// ---------------------------------------------------------------------------

const D_OUT = 'pickup_to_dropoff';   // home → provider
const D_BACK = 'dropoff_to_pickup';  // provider → home

const EXPAND_SCENARIO = {
  // T1 — passenger rides
  1: [{ leg_type: 'passenger_ride', driver_role: 'primary', direction: D_OUT,  carries_passenger: true }],
  2: [{ leg_type: 'passenger_ride', driver_role: 'primary', direction: D_BACK, carries_passenger: true }],
  3: [
    { leg_type: 'passenger_ride', driver_role: 'primary', direction: D_OUT,  carries_passenger: true },
    { leg_type: 'passenger_ride', driver_role: 'primary', direction: D_BACK, carries_passenger: true }
  ],
  // T2 — solo vehicle shuttle (member's vehicle, driver finds own way back)
  4: [{ leg_type: 'vehicle_shuttle', driver_role: 'primary', direction: D_OUT,  carries_member_vehicle: true }],
  5: [{ leg_type: 'vehicle_shuttle', driver_role: 'primary', direction: D_BACK, carries_member_vehicle: true }],
  6: [
    { leg_type: 'vehicle_shuttle', driver_role: 'primary', direction: D_OUT,  carries_member_vehicle: true },
    { leg_type: 'vehicle_shuttle', driver_role: 'primary', direction: D_BACK, carries_member_vehicle: true }
  ],
  // T3 — paired shuttle (driver A in member car, driver B in chase)
  7: [
    { leg_type: 'vehicle_shuttle', driver_role: 'primary',   direction: D_OUT,  carries_member_vehicle: true },
    { leg_type: 'chase_follow',    driver_role: 'secondary', direction: D_OUT,  carries_partner_vehicle: true },
    { leg_type: 'chase_follow',    driver_role: 'primary',   direction: D_BACK, carries_partner_vehicle: true }
  ],
  8: [
    { leg_type: 'chase_follow',    driver_role: 'secondary', direction: D_OUT,  carries_partner_vehicle: true },
    { leg_type: 'vehicle_shuttle', driver_role: 'primary',   direction: D_BACK, carries_member_vehicle: true },
    { leg_type: 'chase_follow',    driver_role: 'secondary', direction: D_BACK, carries_partner_vehicle: true }
  ],
  // T4 — full concierge (driver A in member car, driver B drives the member)
  9: [
    { leg_type: 'vehicle_shuttle', driver_role: 'primary',   direction: D_OUT,  carries_member_vehicle: true },
    { leg_type: 'passenger_ride',  driver_role: 'secondary', direction: D_OUT,  carries_passenger: true, carries_partner_vehicle: true }
  ],
  10: [
    { leg_type: 'vehicle_shuttle', driver_role: 'primary',   direction: D_BACK, carries_member_vehicle: true },
    { leg_type: 'passenger_ride',  driver_role: 'secondary', direction: D_BACK, carries_passenger: true, carries_partner_vehicle: true }
  ],
  11: [
    { leg_type: 'vehicle_shuttle', driver_role: 'primary',   direction: D_OUT,  carries_member_vehicle: true },
    { leg_type: 'passenger_ride',  driver_role: 'secondary', direction: D_OUT,  carries_passenger: true, carries_partner_vehicle: true },
    { leg_type: 'vehicle_shuttle', driver_role: 'primary',   direction: D_BACK, carries_member_vehicle: true },
    { leg_type: 'passenger_ride',  driver_role: 'secondary', direction: D_BACK, carries_passenger: true, carries_partner_vehicle: true }
  ]
};

// Map scenario number → tier. Used to validate caller's tier matches.
const SCENARIO_TIER = { 1:1, 2:1, 3:1, 4:2, 5:2, 6:2, 7:3, 8:3, 9:4, 10:4, 11:4 };

function expandLegs(scenario, job) {
  const blueprint = EXPAND_SCENARIO[scenario];
  if (!blueprint) return null;
  return blueprint.map((leg, idx) => {
    const out = {
      sequence: idx + 1,
      leg_type: leg.leg_type,
      driver_role: leg.driver_role,
      carries_passenger:       !!leg.carries_passenger,
      carries_member_vehicle:  !!leg.carries_member_vehicle,
      carries_partner_vehicle: !!leg.carries_partner_vehicle,
      status: 'pending'
    };
    if (leg.direction === D_OUT) {
      out.from_address = job.pickup_address;  out.from_lat = job.pickup_lat;  out.from_lng = job.pickup_lng;
      out.to_address   = job.dropoff_address; out.to_lat   = job.dropoff_lat; out.to_lng   = job.dropoff_lng;
    } else {
      out.from_address = job.dropoff_address; out.from_lat = job.dropoff_lat; out.from_lng = job.dropoff_lng;
      out.to_address   = job.pickup_address;  out.to_lat   = job.pickup_lat;  out.to_lng   = job.pickup_lng;
    }
    return out;
  });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleList(event, supabase) {
  const q = event.queryStringParameters || {};
  let query = supabase.from('concierge_jobs')
    .select('*, legs:concierge_job_legs(*), assignments:concierge_job_drivers(*)')
    .order('scheduled_start_at', { ascending: false, nullsFirst: false })
    .limit(200);
  if (q.status)    query = query.eq('status', q.status);
  if (q.member_id && isUuid(q.member_id)) query = query.eq('member_id', q.member_id);
  if (q.from)      query = query.gte('scheduled_start_at', q.from);
  if (q.to)        query = query.lte('scheduled_start_at', q.to);
  const { data, error } = await query;
  if (error) return jsonResponse(500, { error: error.message });

  let jobs = data || [];
  if (q.driver_id && isUuid(q.driver_id)) {
    jobs = jobs.filter(j => (j.assignments || []).some(a => a.driver_id === q.driver_id));
  }
  for (const j of jobs) if (Array.isArray(j.legs)) j.legs.sort((a,b) => a.sequence - b.sequence);
  return jsonResponse(200, { jobs });
}

async function handleGet(event, supabase, jobId) {
  if (!isUuid(jobId)) return jsonResponse(400, { error: 'invalid job id' });
  const { data, error } = await supabase
    .from('concierge_jobs')
    .select('*, legs:concierge_job_legs(*), assignments:concierge_job_drivers(*)')
    .eq('id', jobId).maybeSingle();
  if (error) return jsonResponse(500, { error: error.message });
  if (!data)  return jsonResponse(404, { error: 'job not found' });
  if (Array.isArray(data.legs)) data.legs.sort((a,b) => a.sequence - b.sequence);
  return jsonResponse(200, { job: data });
}

async function handleCreate(event, supabase, body) {
  const errors = [];
  if (!isUuid(body.member_id))   errors.push('member_id (uuid) required');
  const tier = Number(body.tier);
  const scenario = Number(body.scenario);
  if (!Number.isInteger(tier) || tier < 1 || tier > 4) errors.push('tier must be 1-4');
  if (!Number.isInteger(scenario) || !EXPAND_SCENARIO[scenario]) errors.push('scenario must be 1-11');
  if (Number.isInteger(scenario) && Number.isInteger(tier) && SCENARIO_TIER[scenario] !== tier) {
    errors.push(`scenario ${scenario} requires tier ${SCENARIO_TIER[scenario]}`);
  }
  if (body.appointment_id && !isUuid(body.appointment_id)) errors.push('appointment_id must be uuid');
  if (body.provider_id    && !isUuid(body.provider_id))    errors.push('provider_id must be uuid');
  if (errors.length) return jsonResponse(400, { error: 'validation failed', details: errors });

  const job = {
    member_id:          body.member_id,
    appointment_id:     body.appointment_id || null,
    provider_id:        body.provider_id    || null,
    tier, scenario,
    status:             body.status || 'scheduled',
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
    notes:              body.notes || null,
    created_by_admin:   'admin'
  };

  const { data: jobRow, error: jobErr } = await supabase
    .from('concierge_jobs').insert(job).select('*').single();
  if (jobErr) return jsonResponse(500, { error: 'failed to create job', details: jobErr.message });

  const legs = expandLegs(scenario, jobRow).map(l => ({ ...l, job_id: jobRow.id }));
  const { data: legRows, error: legErr } = await supabase
    .from('concierge_job_legs').insert(legs).select('*');
  if (legErr) {
    // Roll back the job row so we don't leak a job with no legs.
    await supabase.from('concierge_jobs').delete().eq('id', jobRow.id);
    return jsonResponse(500, { error: 'failed to create legs', details: legErr.message });
  }

  await audit(supabase, {
    action: 'create_concierge_job',
    target_id: jobRow.id, target_type: 'concierge_job',
    metadata: { tier, scenario, member_id: job.member_id, leg_count: legs.length },
    performed_by: 'admin'
  });

  return jsonResponse(200, { job: { ...jobRow, legs: legRows } });
}

async function handleAssignDriver(event, supabase, jobId, body) {
  if (!isUuid(jobId)) return jsonResponse(400, { error: 'invalid job id' });
  if (!isUuid(body.driver_id)) return jsonResponse(400, { error: 'driver_id (uuid) required' });
  const role = body.role;
  if (role !== 'primary' && role !== 'secondary') return jsonResponse(400, { error: "role must be 'primary' or 'secondary'" });

  const { data: job } = await supabase.from('concierge_jobs').select('id, tier, status').eq('id', jobId).maybeSingle();
  if (!job) return jsonResponse(404, { error: 'job not found' });
  if (job.status === 'cancelled' || job.status === 'completed') {
    return jsonResponse(409, { error: `cannot assign driver to ${job.status} job` });
  }
  if (role === 'secondary' && job.tier < 3) {
    return jsonResponse(400, { error: 'secondary role only valid for tier 3 or 4 jobs' });
  }

  const { data: driver } = await supabase.from('drivers').select('id, status').eq('id', body.driver_id).maybeSingle();
  if (!driver)                       return jsonResponse(404, { error: 'driver not found' });
  if (driver.status !== 'active')    return jsonResponse(409, { error: `driver status is ${driver.status}` });

  const row = { job_id: jobId, driver_id: body.driver_id, role };
  const { data, error } = await supabase
    .from('concierge_job_drivers')
    .upsert(row, { onConflict: 'job_id,role' })
    .select('*').single();
  if (error) return jsonResponse(500, { error: error.message });

  await audit(supabase, {
    action: 'assign_concierge_driver',
    target_id: jobId, target_type: 'concierge_job',
    metadata: { driver_id: body.driver_id, role },
    performed_by: 'admin'
  });

  // Emit so the agent fleet (Concierge agent, future push notifier) can react.
  try {
    await supabase.from('agent_events').insert({
      event_type: 'concierge.driver_assigned',
      payload: { job_id: jobId, driver_id: body.driver_id, role },
      source: 'concierge-jobs-admin'
    });
  } catch (e) { /* best-effort */ }

  return jsonResponse(200, { assignment: data });
}

async function handleCancel(event, supabase, jobId, body) {
  if (!isUuid(jobId)) return jsonResponse(400, { error: 'invalid job id' });
  const reason = (body.reason || '').toString().trim();
  if (reason.length < 3 || reason.length > 500) return jsonResponse(400, { error: 'reason must be 3-500 chars' });

  const { data: job } = await supabase.from('concierge_jobs').select('id, status').eq('id', jobId).maybeSingle();
  if (!job) return jsonResponse(404, { error: 'job not found' });
  if (job.status === 'completed') return jsonResponse(409, { error: 'cannot cancel a completed job' });

  const { error } = await supabase.from('concierge_jobs')
    .update({ status: 'cancelled', cancelled_reason: reason, cancelled_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) return jsonResponse(500, { error: error.message });

  await audit(supabase, {
    action: 'cancel_concierge_job',
    target_id: jobId, target_type: 'concierge_job',
    reason, performed_by: 'admin'
  });
  return jsonResponse(200, { ok: true });
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------
function stripPrefix(p) {
  return (p || '')
    .replace(/^\/?\.netlify\/functions\/concierge-jobs-admin\/?/, '')
    .replace(/^\/?api\/admin\/concierge-jobs\/?/, '')
    .replace(/^\/+/, '');
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  if (!authenticateAdmin(event))     return jsonResponse(401, { error: 'Unauthorized' });

  const supabase = getSupabase();
  if (!supabase) return jsonResponse(500, { error: 'Database not configured' });

  const route = stripPrefix(event.path);
  const method = event.httpMethod;
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch { return jsonResponse(400, { error: 'invalid JSON body' }); }
  }

  try {
    if (method === 'GET'  && route === '')   return await handleList(event, supabase);
    if (method === 'POST' && route === '')   return await handleCreate(event, supabase, body);
    let m = route.match(/^([^/]+)$/);
    if (m && method === 'GET')  return await handleGet(event, supabase, m[1]);
    m = route.match(/^([^/]+)\/assign-driver$/);
    if (m && method === 'POST') return await handleAssignDriver(event, supabase, m[1], body);
    m = route.match(/^([^/]+)\/cancel$/);
    if (m && method === 'POST') return await handleCancel(event, supabase, m[1], body);
    return jsonResponse(404, { error: 'Not found', path: route, method });
  } catch (e) {
    console.error('[concierge-jobs-admin] handler error:', e);
    return jsonResponse(500, { error: e.message });
  }
};

module.exports.EXPAND_SCENARIO = EXPAND_SCENARIO;
module.exports.SCENARIO_TIER   = SCENARIO_TIER;
module.exports.expandLegs      = expandLegs;

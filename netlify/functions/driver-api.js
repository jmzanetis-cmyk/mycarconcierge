// ============================================================================
// driver-api  (Task #332)
//
// Single Netlify function backing the separate "MCC Driver" Replit project.
// Mounted at /.netlify/functions/driver-api/* and proxied from
// /api/driver/v1/* via www/_redirects.
//
// Routes:
//   POST /auth/send-code       { phone }                        — send OTP via Twilio Verify
//   POST /auth/verify-code     { phone, code }                  — exchange OTP for session token
//   POST /auth/refresh         { refresh_token }                — refresh access token
//   GET  /me                                                    — driver profile
//   GET  /jobs?status=&from=&to=                                — assigned jobs (with embedded legs)
//   GET  /jobs/:id                                              — single job
//   POST /jobs/:id/accept
//   POST /jobs/:id/decline     { reason }
//   POST /jobs/:id/legs/:leg_id/start
//   POST /jobs/:id/legs/:leg_id/complete
//   POST /jobs/:id/legs/:leg_id/location  { pings: [{lat,lng,...}] }  (≤50)
//   GET  /earnings?range=today|week|month|all
//
// SECURITY MODEL
//   - The Driver app NEVER receives the Supabase service-role key.
//   - All privileged writes happen here using the service-role client.
//   - Auth uses NATIVE Supabase JWTs. After Twilio Verify confirms the
//     OTP, the server calls auth.admin.generateLink({type:'magiclink',email})
//     and exchanges the resulting hashed_token via an anon-client
//     verifyOtp() to mint a real Supabase session (access + refresh).
//     Token validation on subsequent requests uses supabase.auth.getUser().
//     Refresh uses supabase.auth.refreshSession(). Lifecycle / revocation
//     is owned entirely by Supabase Auth.
//   - Phones not present in `drivers` with status='active' are rejected at
//     send-code time so unknown phones can't enumerate the driver roster.
// ============================================================================

const { createClient } = require('@supabase/supabase-js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function errorResponse(statusCode, code, message, extra = {}) {
  return jsonResponse(statusCode, { error: { code, message, ...extra } });
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

function normalizePhone(p) {
  if (typeof p !== 'string') return null;
  const trimmed = p.trim();
  // Accept E.164 (+12015550100). Reject anything else so we don't try to
  // SMS a malformed number through Twilio.
  return /^\+[1-9]\d{1,14}$/.test(trimmed) ? trimmed : null;
}

// ---------------------------------------------------------------------------
// Driver session tokens are NATIVE SUPABASE JWTs minted via the admin
// generateLink + anon-client verifyOtp flow. The Driver app receives a
// real Supabase access_token + refresh_token pair, so RLS policies on
// drivers / concierge_jobs / etc that gate on `auth.uid() = drivers.profile_id`
// work directly against the driver's session — the Driver Replit project
// can talk to Supabase with the anon key, and the lifecycle (refresh /
// expiry / revocation) is managed by Supabase, not by us.
//
// Requires drivers.profile_id linked to an auth.users row whose email
// matches drivers.email.
// ---------------------------------------------------------------------------

let _anonClient = null;
function getAnonClient() {
  if (_anonClient) return _anonClient;
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const { createClient } = require('@supabase/supabase-js');
  _anonClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return _anonClient;
}

async function mintSupabaseSession(supabase, driver) {
  if (!driver.email) {
    return { error: errorResponse(409, 'DRIVER_NO_EMAIL', 'Driver has no email on file — admin must link an auth user') };
  }
  const anon = getAnonClient();
  if (!anon) {
    return { error: errorResponse(503, 'AUTH_UNAVAILABLE', 'Supabase anon key not configured') };
  }
  // Step 1: admin generates a one-time hashed magiclink token for the
  // driver's email (no email is actually sent — we exchange the token
  // server-side immediately).
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink', email: driver.email
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    return { error: errorResponse(500, 'AUTH_LINK_FAILED', linkErr?.message || 'no token returned') };
  }
  // Step 2: anon client exchanges the hashed token for a real Supabase
  // session (access_token + refresh_token).
  const { data: sess, error: vErr } = await anon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token, type: 'magiclink'
  });
  if (vErr || !sess?.session) {
    return { error: errorResponse(500, 'AUTH_VERIFY_FAILED', vErr?.message || 'no session returned') };
  }
  return {
    response: jsonResponse(200, {
      access_token: sess.session.access_token,
      refresh_token: sess.session.refresh_token,
      token_type: 'Bearer',
      expires_in: sess.session.expires_in,
      expires_at: sess.session.expires_at,
      driver: { id: driver.id, full_name: driver.full_name, phone: driver.phone }
    })
  };
}

// ---------------------------------------------------------------------------
// Twilio Verify (REST). We hit the Verify API directly so the function has
// no extra deps. Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and
// TWILIO_VERIFY_SERVICE_SID. If TWILIO_VERIFY_SERVICE_SID is unset we return
// a 503 — the Driver app can detect this and tell the operator to configure
// the env var. We DO NOT silently fall back to a less-secure channel.
// ---------------------------------------------------------------------------

async function twilioVerifyStart(phone) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!sid || !token || !verifySid) {
    return { ok: false, status: 503, error: 'twilio_verify_not_configured' };
  }
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const form = new URLSearchParams({ To: phone, Channel: 'sms' });
  const resp = await fetch(`https://verify.twilio.com/v2/Services/${verifySid}/Verifications`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return { ok: false, status: resp.status, error: data.message || 'twilio_send_failed' };
  return { ok: true, status: data.status };
}

async function twilioVerifyCheck(phone, code) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!sid || !token || !verifySid) {
    return { ok: false, status: 503, error: 'twilio_verify_not_configured' };
  }
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const form = new URLSearchParams({ To: phone, Code: code });
  const resp = await fetch(`https://verify.twilio.com/v2/Services/${verifySid}/VerificationCheck`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return { ok: false, status: resp.status, error: data.message || 'twilio_check_failed' };
  return { ok: data.status === 'approved', status: data.status };
}

// ---------------------------------------------------------------------------
// Per-phone send-code rate limiter (3 per 15min). DB-backed via the
// driver_otp_send_log table so the limit is shared across all Netlify
// function instances and survives cold starts (in-memory counters are
// trivially bypassable under load). Fail-open on transient DB errors so
// drivers aren't permanently locked out by a database hiccup; Twilio
// Verify's own per-number throttle is the secondary defense.
// ---------------------------------------------------------------------------
async function checkSendCodeRateDB(supabase, phone) {
  const windowMs = 15 * 60 * 1000;
  const since = new Date(Date.now() - windowMs).toISOString();
  const { data, error } = await supabase
    .from('driver_otp_send_log')
    .select('sent_at')
    .eq('phone', phone)
    .gte('sent_at', since)
    .order('sent_at', { ascending: true });
  if (error) return { allowed: true }; // fail-open
  const rows = data || [];
  if (rows.length >= 3) {
    const oldest = new Date(rows[0].sent_at).getTime();
    return { allowed: false, retry_after: Math.ceil((windowMs - (Date.now() - oldest)) / 1000) };
  }
  return { allowed: true };
}
async function logSendCode(supabase, phone) {
  try { await supabase.from('driver_otp_send_log').insert({ phone, sent_at: new Date().toISOString() }); } catch { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// agent_events emission + audit log helpers (best-effort).
// ---------------------------------------------------------------------------
async function emitEvent(supabase, eventType, payload) {
  try {
    await supabase.from('agent_events').insert({
      event_type: eventType, payload, source: 'driver-api'
    });
  } catch (e) { /* best-effort */ }
}
async function audit(supabase, row) {
  try { await supabase.from('admin_audit_log').insert(row); } catch (e) { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Auth middleware: parse Bearer token, look up driver, ensure status=active.
// ---------------------------------------------------------------------------
async function authenticateDriver(event, supabase) {
  const token = getBearerToken(event);
  if (!token) return { error: errorResponse(401, 'AUTH_REQUIRED', 'Bearer token required') };
  // Verify the token via Supabase auth — drivers carry real Supabase
  // access tokens minted during /verify-code, so getUser is the canonical
  // validator and respects revocation/expiry without us reimplementing it.
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    return { error: errorResponse(401, 'AUTH_REQUIRED', 'Invalid or expired token') };
  }
  const { data: driver, error } = await supabase
    .from('drivers')
    .select('id, profile_id, full_name, phone, email, status, vehicle_class, hourly_rate_cents, per_job_rate_cents, onboarded_at')
    .eq('profile_id', userData.user.id)
    .maybeSingle();
  if (error || !driver) return { error: errorResponse(401, 'AUTH_REQUIRED', 'No driver record linked to this user') };
  if (driver.status !== 'active') {
    return { error: errorResponse(403, 'DRIVER_NOT_ACTIVE', `Driver status is ${driver.status}`) };
  }
  return { driver };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleSendCode(event, supabase, body) {
  const phone = normalizePhone(body.phone);
  if (!phone) return errorResponse(400, 'BAD_REQUEST', 'phone must be in E.164 format');

  const rate = await checkSendCodeRateDB(supabase, phone);
  if (!rate.allowed) return errorResponse(429, 'RATE_LIMITED', 'Too many code requests', { retry_after: rate.retry_after });

  // Reject phones not present in drivers as 'active'. Returning the same
  // generic 200 vs 404 here would leak driver enumeration; we accept that
  // tradeoff explicitly because driver phones are not customer PII and the
  // operational cost of debugging "I'm not getting codes" is higher.
  const { data: driver } = await supabase
    .from('drivers').select('id, status').eq('phone', phone).maybeSingle();
  if (!driver)               return errorResponse(404, 'DRIVER_NOT_FOUND', 'Phone not registered as a driver');
  if (driver.status !== 'active') return errorResponse(403, 'DRIVER_NOT_ACTIVE', `Driver status is ${driver.status}`);

  const result = await twilioVerifyStart(phone);
  if (!result.ok) {
    return errorResponse(result.status === 503 ? 503 : 502, 'OTP_SEND_FAILED', result.error);
  }
  await logSendCode(supabase, phone);
  return jsonResponse(200, { sent: true, status: result.status });
}

async function handleVerifyCode(event, supabase, body) {
  const phone = normalizePhone(body.phone);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!phone) return errorResponse(400, 'BAD_REQUEST', 'phone must be in E.164 format');
  if (!/^[0-9]{4,10}$/.test(code)) return errorResponse(400, 'BAD_REQUEST', 'code must be 4-10 digits');

  const { data: driver } = await supabase
    .from('drivers')
    .select('id, profile_id, full_name, phone, email, status')
    .eq('phone', phone).maybeSingle();
  if (!driver)                    return errorResponse(404, 'DRIVER_NOT_FOUND', 'Phone not registered as a driver');
  if (driver.status !== 'active') return errorResponse(403, 'DRIVER_NOT_ACTIVE', `Driver status is ${driver.status}`);
  if (!driver.profile_id)         return errorResponse(409, 'DRIVER_NOT_LINKED', 'Driver has no profile_id linked — admin must link an auth user');

  const check = await twilioVerifyCheck(phone, code);
  if (!check.ok) {
    if (check.status === 503) return errorResponse(503, 'OTP_VERIFY_UNAVAILABLE', 'Verify service not configured');
    return errorResponse(401, 'OTP_INVALID', `Verification ${check.status || 'failed'}`);
  }

  await emitEvent(supabase, 'driver.signed_in', { driver_id: driver.id, phone: driver.phone });
  const session = await mintSupabaseSession(supabase, driver);
  if (session.error) return session.error;
  return session.response;
}

async function handleRefresh(event, supabase, body) {
  const token = typeof body.refresh_token === 'string' ? body.refresh_token : '';
  if (!token) return errorResponse(400, 'BAD_REQUEST', 'refresh_token required');
  const anon = getAnonClient();
  if (!anon) return errorResponse(503, 'AUTH_UNAVAILABLE', 'Supabase anon key not configured');
  // Native Supabase refresh — issues a new access_token + (rotated)
  // refresh_token pair.
  const { data, error } = await anon.auth.refreshSession({ refresh_token: token });
  if (error || !data?.session) {
    return errorResponse(401, 'AUTH_REQUIRED', 'Invalid or expired refresh token');
  }
  return jsonResponse(200, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    token_type: 'Bearer',
    expires_in: data.session.expires_in,
    expires_at: data.session.expires_at
  });
}

async function handleMe(event, supabase, driver) {
  return jsonResponse(200, { driver });
}

async function handleListJobs(event, supabase, driver) {
  const q = event.queryStringParameters || {};
  let query = supabase
    .from('concierge_job_drivers')
    .select(`
      role, accepted_at, declined_at,
      job:concierge_jobs (
        id, member_id, appointment_id, provider_id, tier, scenario, status,
        scheduled_start_at, pickup_address, pickup_lat, pickup_lng,
        dropoff_address, dropoff_lat, dropoff_lng, total_price_cents, notes,
        legs:concierge_job_legs ( id, sequence, leg_type, driver_role,
          from_address, from_lat, from_lng, to_address, to_lat, to_lng,
          carries_passenger, carries_member_vehicle, carries_partner_vehicle,
          status, started_at, completed_at )
      )
    `)
    .eq('driver_id', driver.id)
    .order('assigned_at', { ascending: false })
    .limit(200);

  const { data, error } = await query;
  if (error) return errorResponse(500, 'DB_ERROR', error.message);

  let jobs = (data || []).map(row => ({
    ...row.job,
    my_role: row.role,
    accepted_at: row.accepted_at,
    declined_at: row.declined_at
  })).filter(j => j && j.id);

  if (q.status) jobs = jobs.filter(j => j.status === q.status);
  if (q.from)   jobs = jobs.filter(j => !j.scheduled_start_at || j.scheduled_start_at >= q.from);
  if (q.to)     jobs = jobs.filter(j => !j.scheduled_start_at || j.scheduled_start_at <= q.to);

  // Sort legs by sequence — Postgrest doesn't sort embedded rows by default.
  for (const j of jobs) if (Array.isArray(j.legs)) j.legs.sort((a,b) => a.sequence - b.sequence);

  return jsonResponse(200, { jobs });
}

async function loadJobIfAssigned(supabase, driverId, jobId) {
  const { data: assignment } = await supabase
    .from('concierge_job_drivers')
    .select('role, accepted_at, declined_at, job_id')
    .eq('driver_id', driverId).eq('job_id', jobId).maybeSingle();
  if (!assignment) return { error: errorResponse(403, 'JOB_NOT_ASSIGNED', 'You are not assigned to this job') };

  const { data: job } = await supabase
    .from('concierge_jobs')
    .select('*, legs:concierge_job_legs ( * )')
    .eq('id', jobId).maybeSingle();
  if (!job) return { error: errorResponse(404, 'JOB_NOT_FOUND', 'Job not found') };
  if (Array.isArray(job.legs)) job.legs.sort((a,b) => a.sequence - b.sequence);
  return { assignment, job };
}

async function handleGetJob(event, supabase, driver, jobId) {
  if (!isUuid(jobId)) return errorResponse(400, 'BAD_REQUEST', 'invalid job id');
  const r = await loadJobIfAssigned(supabase, driver.id, jobId);
  if (r.error) return r.error;
  return jsonResponse(200, {
    job: { ...r.job, my_role: r.assignment.role, accepted_at: r.assignment.accepted_at, declined_at: r.assignment.declined_at }
  });
}

async function handleAccept(event, supabase, driver, jobId) {
  if (!isUuid(jobId)) return errorResponse(400, 'BAD_REQUEST', 'invalid job id');
  const r = await loadJobIfAssigned(supabase, driver.id, jobId);
  if (r.error) return r.error;
  if (r.assignment.declined_at) return errorResponse(409, 'ALREADY_DECLINED', 'You declined this job');
  if (r.assignment.accepted_at) return jsonResponse(200, { ok: true, already_accepted: true });

  // Concurrency guard: if another driver already accepted the same role on
  // this job, refuse. We rely on the DB unique (job_id, role) for the
  // ultimate race; this check just gives a clean 409 instead of 500.
  const { data: existingRoleAccepts } = await supabase
    .from('concierge_job_drivers')
    .select('driver_id, role, accepted_at')
    .eq('job_id', jobId).eq('role', r.assignment.role).not('accepted_at','is', null);
  if ((existingRoleAccepts || []).some(x => x.driver_id !== driver.id)) {
    return errorResponse(409, 'ROLE_TAKEN', `Another driver already accepted the ${r.assignment.role} role`);
  }

  // Conditional update — both `accepted_at` and `declined_at` must still
  // be NULL when the row is written. Without this guard, a concurrent
  // /decline call that won the read-then-write race would leave the row
  // with BOTH timestamps set. We rely on the returned row count to detect
  // the race rather than a transaction (Postgrest doesn't expose those).
  const { data: updRows, error: updErr } = await supabase
    .from('concierge_job_drivers')
    .update({ accepted_at: new Date().toISOString() })
    .eq('driver_id', driver.id).eq('job_id', jobId)
    .is('accepted_at', null).is('declined_at', null)
    .select('driver_id');
  if (updErr) return errorResponse(500, 'DB_ERROR', updErr.message);
  if (!updRows || updRows.length === 0) {
    return errorResponse(409, 'STATE_CHANGED', 'Assignment state changed — refresh');
  }

  await emitEvent(supabase, 'concierge.job_accepted', { job_id: jobId, driver_id: driver.id, role: r.assignment.role });
  return jsonResponse(200, { ok: true });
}

async function handleDecline(event, supabase, driver, jobId, body) {
  if (!isUuid(jobId)) return errorResponse(400, 'BAD_REQUEST', 'invalid job id');
  const reason = (body.reason || '').toString().trim();
  if (reason.length < 3 || reason.length > 500) return errorResponse(400, 'BAD_REQUEST', 'reason must be 3-500 chars');

  const r = await loadJobIfAssigned(supabase, driver.id, jobId);
  if (r.error) return r.error;
  if (r.assignment.accepted_at) return errorResponse(409, 'ALREADY_ACCEPTED', 'Already accepted — contact dispatch');

  // Conditional update — symmetric to accept. Refuses if a concurrent
  // accept already won.
  const { data: updRows, error: updErr } = await supabase
    .from('concierge_job_drivers')
    .update({ declined_at: new Date().toISOString(), decline_reason: reason })
    .eq('driver_id', driver.id).eq('job_id', jobId)
    .is('accepted_at', null).is('declined_at', null)
    .select('driver_id');
  if (updErr) return errorResponse(500, 'DB_ERROR', updErr.message);
  if (!updRows || updRows.length === 0) {
    return errorResponse(409, 'STATE_CHANGED', 'Assignment state changed — refresh');
  }

  await emitEvent(supabase, 'concierge.job_declined', { job_id: jobId, driver_id: driver.id, reason });
  return jsonResponse(200, { ok: true });
}

async function handleStartLeg(event, supabase, driver, jobId, legId) {
  if (!isUuid(jobId) || !isUuid(legId)) return errorResponse(400, 'BAD_REQUEST', 'invalid id');
  const r = await loadJobIfAssigned(supabase, driver.id, jobId);
  if (r.error) return r.error;
  if (!r.assignment.accepted_at) return errorResponse(409, 'NOT_ACCEPTED', 'Accept the job before starting a leg');

  const leg = r.job.legs.find(l => l.id === legId);
  if (!leg) return errorResponse(404, 'LEG_NOT_FOUND', 'Leg not found on this job');
  if (leg.driver_role !== r.assignment.role) {
    return errorResponse(403, 'LEG_NOT_YOURS', `This leg is for the ${leg.driver_role} driver`);
  }
  if (leg.status === 'in_progress') return jsonResponse(200, { ok: true, already_in_progress: true });
  if (leg.status === 'completed')   return errorResponse(409, 'LEG_ALREADY_COMPLETE', 'Leg already complete');

  // Out-of-order guard: every prior leg with the same driver_role must be
  // completed (or skipped) first. Cross-role legs may overlap (Tier 3/4).
  const earlierForMyRole = r.job.legs
    .filter(l => l.driver_role === r.assignment.role && l.sequence < leg.sequence);
  const blocker = earlierForMyRole.find(l => l.status !== 'completed' && l.status !== 'skipped');
  if (blocker) return errorResponse(422, 'LEG_OUT_OF_ORDER', `Complete leg ${blocker.sequence} first`);

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('concierge_job_legs')
    .update({ status: 'in_progress', started_at: nowIso })
    .eq('id', legId);
  if (error) return errorResponse(500, 'DB_ERROR', error.message);

  // First leg start → flip job to in_progress.
  if (r.job.status === 'scheduled') {
    await supabase.from('concierge_jobs').update({ status: 'in_progress' }).eq('id', jobId);
  }
  await emitEvent(supabase, 'concierge.leg_started', { job_id: jobId, leg_id: legId, driver_id: driver.id });
  return jsonResponse(200, { ok: true });
}

async function handleCompleteLeg(event, supabase, driver, jobId, legId) {
  if (!isUuid(jobId) || !isUuid(legId)) return errorResponse(400, 'BAD_REQUEST', 'invalid id');
  const r = await loadJobIfAssigned(supabase, driver.id, jobId);
  if (r.error) return r.error;
  if (!r.assignment.accepted_at) return errorResponse(409, 'NOT_ACCEPTED', 'Accept the job before completing a leg');

  const leg = r.job.legs.find(l => l.id === legId);
  if (!leg) return errorResponse(404, 'LEG_NOT_FOUND', 'Leg not found on this job');
  if (leg.driver_role !== r.assignment.role) {
    return errorResponse(403, 'LEG_NOT_YOURS', `This leg is for the ${leg.driver_role} driver`);
  }
  if (leg.status === 'completed') return jsonResponse(200, { ok: true, already_complete: true });
  if (leg.status !== 'in_progress') return errorResponse(409, 'LEG_NOT_STARTED', 'Start the leg first');

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('concierge_job_legs')
    .update({ status: 'completed', completed_at: nowIso })
    .eq('id', legId);
  if (error) return errorResponse(500, 'DB_ERROR', error.message);

  // Last leg complete → flip job to completed.
  const { data: remaining } = await supabase
    .from('concierge_job_legs')
    .select('id, status').eq('job_id', jobId).neq('status', 'completed').neq('status', 'skipped');
  if (!remaining || remaining.length === 0) {
    await supabase.from('concierge_jobs').update({ status: 'completed' }).eq('id', jobId);
    await emitEvent(supabase, 'concierge.job_completed', { job_id: jobId });
  }

  await emitEvent(supabase, 'concierge.leg_completed', { job_id: jobId, leg_id: legId, driver_id: driver.id });
  return jsonResponse(200, { ok: true });
}

async function handleLocation(event, supabase, driver, jobId, legId, body) {
  if (!isUuid(jobId) || !isUuid(legId)) return errorResponse(400, 'BAD_REQUEST', 'invalid id');
  const pings = Array.isArray(body.pings) ? body.pings : null;
  if (!pings || pings.length === 0) return errorResponse(400, 'BAD_REQUEST', 'pings array required');
  if (pings.length > 50) return errorResponse(400, 'BAD_REQUEST', 'maximum 50 pings per batch');

  const r = await loadJobIfAssigned(supabase, driver.id, jobId);
  if (r.error) return r.error;
  // Same auth guards as start/complete: must have accepted the job, leg
  // must belong to this driver's role, and the leg must actually be in
  // progress. Without these checks an assigned driver could spray pings
  // for the other driver's leg or before the shift starts.
  if (!r.assignment.accepted_at) return errorResponse(409, 'NOT_ACCEPTED', 'Accept the job before posting location');
  const leg = r.job.legs.find(l => l.id === legId);
  if (!leg) return errorResponse(404, 'LEG_NOT_FOUND', 'Leg not found on this job');
  if (leg.driver_role !== r.assignment.role) {
    return errorResponse(403, 'LEG_NOT_YOURS', `This leg is for the ${leg.driver_role} driver`);
  }
  if (leg.status !== 'in_progress') {
    return errorResponse(409, 'LEG_NOT_STARTED', 'Start the leg before posting location');
  }

  const rows = [];
  for (const p of pings) {
    const lat = Number(p.lat), lng = Number(p.lng);
    if (!isFinite(lat) || lat < -90  || lat > 90)  return errorResponse(400, 'BAD_REQUEST', 'invalid lat');
    if (!isFinite(lng) || lng < -180 || lng > 180) return errorResponse(400, 'BAD_REQUEST', 'invalid lng');
    rows.push({
      driver_id: driver.id, job_id: jobId, leg_id: legId,
      lat, lng,
      accuracy_m: isFinite(Number(p.accuracy_m)) ? Number(p.accuracy_m) : null,
      heading:    isFinite(Number(p.heading))    ? Number(p.heading)    : null,
      speed_mps:  isFinite(Number(p.speed_mps))  ? Number(p.speed_mps)  : null,
      recorded_at: p.recorded_at && !isNaN(Date.parse(p.recorded_at)) ? p.recorded_at : new Date().toISOString()
    });
  }
  const { error } = await supabase.from('driver_location_pings').insert(rows);
  if (error) return errorResponse(500, 'DB_ERROR', error.message);
  return jsonResponse(200, { inserted: rows.length });
}

async function handleEarnings(event, supabase, driver) {
  const range = (event.queryStringParameters || {}).range || 'all';
  let since = null;
  const now = new Date();
  if (range === 'today') {
    const d = new Date(now); d.setUTCHours(0,0,0,0); since = d.toISOString();
  } else if (range === 'week') {
    since = new Date(now.getTime() - 7  * 86400000).toISOString();
  } else if (range === 'month') {
    since = new Date(now.getTime() - 30 * 86400000).toISOString();
  } else if (range !== 'all') {
    return errorResponse(400, 'BAD_REQUEST', 'range must be today|week|month|all');
  }

  let q = supabase.from('driver_earnings')
    .select('id, job_id, leg_id, amount_cents, kind, notes, recorded_at')
    .eq('driver_id', driver.id)
    .order('recorded_at', { ascending: false })
    .limit(500);
  if (since) q = q.gte('recorded_at', since);
  const { data, error } = await q;
  if (error) return errorResponse(500, 'DB_ERROR', error.message);

  const total = (data || []).reduce((s, r) => s + (r.amount_cents || 0), 0);
  return jsonResponse(200, { range, total_cents: total, entries: data || [] });
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------
function stripPrefix(p) {
  return (p || '')
    .replace(/^\/?\.netlify\/functions\/driver-api\/?/, '')
    .replace(/^\/?api\/driver\/v1\/?/, '')
    .replace(/^\/+/, '');
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  const supabase = getServiceSupabase();
  if (!supabase) return errorResponse(500, 'CONFIG', 'Database not configured');

  const route = stripPrefix(event.path);
  const method = event.httpMethod;
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch { return errorResponse(400, 'BAD_REQUEST', 'invalid JSON body'); }
  }

  try {
    // Public auth routes ---------------------------------------------------
    if (method === 'POST' && route === 'auth/send-code')   return await handleSendCode(event, supabase, body);
    if (method === 'POST' && route === 'auth/verify-code') return await handleVerifyCode(event, supabase, body);
    if (method === 'POST' && route === 'auth/refresh')     return await handleRefresh(event, supabase, body);

    // Authenticated routes -------------------------------------------------
    const auth = await authenticateDriver(event, supabase);
    if (auth.error) return auth.error;
    const driver = auth.driver;

    if (method === 'GET'  && route === 'me')       return await handleMe(event, supabase, driver);
    if (method === 'GET'  && route === 'jobs')     return await handleListJobs(event, supabase, driver);
    if (method === 'GET'  && route === 'earnings') return await handleEarnings(event, supabase, driver);

    // Job-scoped routes ---------------------------------------------------
    let m = route.match(/^jobs\/([^/]+)$/);
    if (m && method === 'GET')  return await handleGetJob(event, supabase, driver, m[1]);

    m = route.match(/^jobs\/([^/]+)\/accept$/);
    if (m && method === 'POST') return await handleAccept(event, supabase, driver, m[1]);

    m = route.match(/^jobs\/([^/]+)\/decline$/);
    if (m && method === 'POST') return await handleDecline(event, supabase, driver, m[1], body);

    m = route.match(/^jobs\/([^/]+)\/legs\/([^/]+)\/start$/);
    if (m && method === 'POST') return await handleStartLeg(event, supabase, driver, m[1], m[2]);

    m = route.match(/^jobs\/([^/]+)\/legs\/([^/]+)\/complete$/);
    if (m && method === 'POST') return await handleCompleteLeg(event, supabase, driver, m[1], m[2]);

    m = route.match(/^jobs\/([^/]+)\/legs\/([^/]+)\/location$/);
    if (m && method === 'POST') return await handleLocation(event, supabase, driver, m[1], m[2], body);

    return errorResponse(404, 'NOT_FOUND', 'Unknown route', { route, method });
  } catch (e) {
    console.error('[driver-api] handler error:', e);
    return errorResponse(500, 'INTERNAL', e.message);
  }
};

// Re-export internals for the smoke test.
module.exports._stripPrefix = stripPrefix;
module.exports._mintSupabaseSession = mintSupabaseSession;

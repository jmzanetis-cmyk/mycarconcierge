// ============================================================================
// MCC — Concierge Push Notifier (Task #333)
//
// Drains new `concierge.*` rows from agent_events and dispatches FCM v1 push
// notifications to the right humans. Solves the gap where the driver-api +
// admin job-assignment endpoints already emit job-state events but nothing
// delivered them to a phone (drivers had to refresh, members had no
// in-progress visibility).
//
// Trigger: scheduled every minute via netlify.toml. Also POST-able with
// x-admin-password for on-demand replay. GET (anonymous) is forbidden.
//
// Event → recipient mapping:
//   concierge.driver_assigned  → newly-assigned driver
//   concierge.job_accepted     → the OTHER paired driver (T3/T4 only)
//   concierge.job_declined     → the OTHER paired driver (T3/T4 only)
//   concierge.leg_started      → member (first leg only — when job flips to
//                                in_progress)
//   concierge.job_completed    → member
//
// Cursor: persists last-processed agent_events.id in ai_ops_settings under
// key `concierge_push_last_event_id`. Stays separate from the orchestrator's
// processed_at column so the orchestrator and notifier can't trample each
// other. On the first run (no cursor) it starts at the current max(id) so we
// don't fire backlogged history.
//
// Preferences: respects member_notification_preferences (push_appointment_reminder)
// and is opt-out tolerant — missing/erroring prefs default to ALLOWED. Drivers
// have no per-category preference table (the Driver app is consent-on-install
// and there are no marketing pushes here), so driver pushes always go.
//
// FCM: mirrors the helpers in netlify/functions/notifications-bid-accepted-push.js
// (FCM_SERVICE_ACCOUNT_JSON service account → JWT → OAuth → v1 send). Stale
// tokens are flipped active=false. If FCM is not configured the function
// still advances the cursor so events don't pile up forever.
// ============================================================================

'use strict';

const utils = require('./utils');
const { authorizeAgentInvocation } = require('./agent-fleet-runtime');

const CURSOR_KEY = 'concierge_push_last_event_id';
const MAX_EVENTS_PER_TICK = 100;

// ----- FCM v1 helpers (cached OAuth token, mirrors bid-accepted-push) -------
let _fcmAccessToken = null;
let _fcmAccessTokenExpiry = 0;

async function getFCMAccessToken() {
  const now = Date.now();
  if (_fcmAccessToken && _fcmAccessTokenExpiry > now + 60000) return _fcmAccessToken;

  const saJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!saJson) throw new Error('FCM_SERVICE_ACCOUNT_JSON not set');
  let sa;
  try { sa = JSON.parse(saJson); }
  catch { throw new Error('FCM_SERVICE_ACCOUNT_JSON is not valid JSON'); }

  const crypto = require('node:crypto');
  const iat = Math.floor(now / 1000);
  const exp = iat + 3600;
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email, sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat, exp,
    scope: 'https://www.googleapis.com/auth/firebase.messaging'
  })).toString('base64url');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(sa.private_key).toString('base64url');
  const jwt = `${header}.${payload}.${signature}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    }).toString()
  });
  const tokenData = await resp.json();
  if (!resp.ok || !tokenData.access_token) {
    throw new Error('FCM OAuth failed: ' + (tokenData.error_description || tokenData.error || resp.status));
  }
  _fcmAccessToken = tokenData.access_token;
  _fcmAccessTokenExpiry = now + (tokenData.expires_in || 3600) * 1000;
  return _fcmAccessToken;
}

async function sendFCMv1Message(token, title, body, data, projectId) {
  const accessToken = await getFCMAccessToken();
  const message = {
    message: {
      token,
      notification: { title, body },
      data: Object.fromEntries(Object.entries({ ...(data || {}), title, body }).map(([k, v]) => [k, String(v)])),
      android: { priority: 'HIGH' },
      apns:    { payload: { aps: { sound: 'default', 'content-available': 1 } } }
    }
  };
  const resp = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message)
  });
  let respBody = null;
  try { respBody = await resp.json(); } catch { respBody = null; }
  return { status: resp.status, body: respBody };
}

// Push to one profile_id (member OR driver). Returns { sent, success, failure, reason? }.
async function dispatchPushToProfile(supabase, projectId, profileId, title, body, dataPayload) {
  if (!profileId) return { sent: false, reason: 'no_profile' };
  let tokenRows = [];
  try {
    const { data, error } = await supabase
      .from('device_push_tokens')
      .select('token, platform')
      .eq('member_id', profileId)
      .eq('active', true);
    if (error) return { sent: false, reason: 'token_lookup_error' };
    tokenRows = data || [];
  } catch {
    return { sent: false, reason: 'token_lookup_exception' };
  }
  if (tokenRows.length === 0) return { sent: false, reason: 'no_tokens' };

  const stale = [];
  let success = 0, failure = 0, lastErr = null;
  await Promise.all(tokenRows.map(async (row) => {
    try {
      const r = await sendFCMv1Message(row.token, title, body, dataPayload, projectId);
      if (r.status === 200) {
        success++;
      } else {
        failure++;
        const detail = r.body?.error?.details?.[0]?.errorCode;
        const status = r.body?.error?.status;
        lastErr = detail || status || `http_${r.status}`;
        if (detail === 'UNREGISTERED' || status === 'NOT_FOUND') stale.push(row.token);
      }
    } catch (e) {
      failure++;
      lastErr = lastErr || 'send_exception';
    }
  }));

  if (stale.length > 0) {
    try { await supabase.from('device_push_tokens').update({ active: false }).in('token', stale); }
    catch { /* best-effort */ }
  }

  if (success === 0 && failure > 0) return { sent: false, reason: 'send_failed:' + lastErr, success, failure };
  return { sent: success > 0, success, failure };
}

// Best-effort member opt-out check. Drivers don't appear in either prefs
// table so this returns true for them by default (Driver app is consent-on-
// install; per-category preferences are out of scope for Task #333).
async function isMemberPushAllowed(supabase, memberId) {
  try {
    const { data } = await supabase
      .from('member_notification_preferences')
      .select('push_appointment_reminder')
      .eq('member_id', memberId)
      .maybeSingle();
    if (data && data.push_appointment_reminder === false) return false;
  } catch { /* default allow */ }
  return true;
}

// ----- Cursor (ai_ops_settings) ---------------------------------------------
async function readCursor(supabase) {
  try {
    const { data } = await supabase
      .from('ai_ops_settings')
      .select('value')
      .eq('key', CURSOR_KEY)
      .maybeSingle();
    const n = data && data.value != null ? Number(data.value) : null;
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

async function writeCursor(supabase, lastId) {
  try {
    await supabase
      .from('ai_ops_settings')
      .upsert({ key: CURSOR_KEY, value: String(lastId), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  } catch { /* best-effort — the next tick will retry from the same id */ }
}

async function seedCursor(supabase) {
  try {
    const { data } = await supabase
      .from('agent_events')
      .select('id')
      .order('id', { ascending: false })
      .limit(1);
    const top = data && data[0] ? Number(data[0].id) : 0;
    return Number.isFinite(top) ? top : 0;
  } catch { return 0; }
}

// ----- Per-event handlers ----------------------------------------------------
async function loadJob(supabase, jobId) {
  if (!jobId) return null;
  try {
    const { data } = await supabase
      .from('concierge_jobs')
      .select('id, member_id, tier, scenario, status, scheduled_start_at, pickup_address, dropoff_address')
      .eq('id', jobId)
      .maybeSingle();
    return data || null;
  } catch { return null; }
}

async function loadDriverProfile(supabase, driverId) {
  if (!driverId) return null;
  try {
    const { data } = await supabase
      .from('drivers')
      .select('id, profile_id, full_name')
      .eq('id', driverId)
      .maybeSingle();
    return data || null;
  } catch { return null; }
}

async function loadOtherPairedDriver(supabase, jobId, selfDriverId) {
  if (!jobId || !selfDriverId) return null;
  try {
    const { data } = await supabase
      .from('concierge_job_drivers')
      .select('driver_id, role')
      .eq('job_id', jobId)
      .neq('driver_id', selfDriverId);
    const other = (data || [])[0];
    if (!other) return null;
    return await loadDriverProfile(supabase, other.driver_id);
  } catch { return null; }
}

async function handleEvent(supabase, projectId, evt) {
  const t = evt.event_type;
  const p = evt.payload || {};
  const jobId = p.job_id;

  // concierge.driver_assigned → newly-assigned driver
  if (t === 'concierge.driver_assigned') {
    const driver = await loadDriverProfile(supabase, p.driver_id);
    if (!driver || !driver.profile_id) return { skipped: 'no_driver_profile' };
    const job = await loadJob(supabase, jobId);
    const when = job?.scheduled_start_at ? new Date(job.scheduled_start_at).toLocaleString() : 'soon';
    return await dispatchPushToProfile(supabase, projectId, driver.profile_id,
      'New concierge job assigned',
      `You've been assigned a job (${p.role || 'driver'}) scheduled ${when}. Tap to review and accept.`,
      { section: 'concierge', job_id: jobId || '', kind: 'driver_assigned' });
  }

  // concierge.job_accepted / concierge.job_declined → notify the OTHER paired driver
  if (t === 'concierge.job_accepted' || t === 'concierge.job_declined') {
    const other = await loadOtherPairedDriver(supabase, jobId, p.driver_id);
    if (!other || !other.profile_id) return { skipped: 'no_other_driver' };
    const accepted = t === 'concierge.job_accepted';
    return await dispatchPushToProfile(supabase, projectId, other.profile_id,
      accepted ? 'Your partner driver accepted' : 'Your partner driver declined',
      accepted
        ? 'Your paired driver just accepted this concierge job.'
        : 'Your paired driver declined this job — dispatch is finding a replacement.',
      { section: 'concierge', job_id: jobId || '', kind: accepted ? 'partner_accepted' : 'partner_declined' });
  }

  // concierge.leg_started → member push when the job FIRST flips to in_progress.
  // The trigger condition is purely "is this the first leg?" — we do NOT
  // gate on the job's current status. A short job can flip leg-1 to started
  // and leg-N to completed before the every-minute worker drains the event;
  // by then job.status is already 'completed' but the member still needs the
  // in-progress push for the first leg. De-dupe is via first-leg detection
  // (lowest-sequence in_progress|completed leg matches payload.leg_id), which
  // is what guarantees we fire at most once per job lifecycle.
  if (t === 'concierge.leg_started') {
    const job = await loadJob(supabase, jobId);
    if (!job) return { skipped: 'no_job' };
    let isFirst = false;
    try {
      const { data: legs } = await supabase
        .from('concierge_job_legs')
        .select('id, sequence, status')
        .eq('job_id', jobId)
        .in('status', ['in_progress', 'completed'])
        .order('sequence', { ascending: true })
        .limit(1);
      isFirst = !!(legs && legs[0] && legs[0].id === p.leg_id);
    } catch { isFirst = false; }
    if (!isFirst) return { skipped: 'not_first_leg' };

    const allowed = await isMemberPushAllowed(supabase, job.member_id);
    if (!allowed) return { skipped: 'member_opted_out' };
    return await dispatchPushToProfile(supabase, projectId, job.member_id,
      'Your concierge job is in progress',
      'Your MCC driver just started the trip. Track live status in the app.',
      { section: 'concierge', job_id: jobId || '', kind: 'job_started' });
  }

  // concierge.job_completed → member
  if (t === 'concierge.job_completed') {
    const job = await loadJob(supabase, jobId);
    if (!job) return { skipped: 'no_job' };
    const allowed = await isMemberPushAllowed(supabase, job.member_id);
    if (!allowed) return { skipped: 'member_opted_out' };
    return await dispatchPushToProfile(supabase, projectId, job.member_id,
      'Your concierge job is complete',
      'All legs are wrapped up. Rate your driver in the app.',
      { section: 'concierge', job_id: jobId || '', kind: 'job_completed' });
  }

  return { skipped: 'unhandled_type' };
}

// ----- Main entry ------------------------------------------------------------
async function runOnce(supabase) {
  // Resolve FCM project id once per tick. Missing config is non-fatal — we
  // still advance the cursor so backlog doesn't grow unbounded.
  let projectId = null;
  const saJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (saJson) {
    try { projectId = JSON.parse(saJson).project_id; }
    catch { projectId = null; }
  }

  let cursor = await readCursor(supabase);
  if (cursor == null) {
    cursor = await seedCursor(supabase);
    await writeCursor(supabase, cursor);
    return { ok: true, seeded: true, cursor };
  }

  // Pull next batch of concierge.* events strictly above the cursor.
  let events = [];
  try {
    const { data, error } = await supabase
      .from('agent_events')
      .select('id, event_type, payload, source, created_at')
      .gt('id', cursor)
      .like('event_type', 'concierge.%')
      .order('id', { ascending: true })
      .limit(MAX_EVENTS_PER_TICK);
    if (error) return { ok: false, error: error.message };
    events = data || [];
  } catch (e) {
    return { ok: false, error: e.message };
  }

  if (events.length === 0) return { ok: true, processed: 0, cursor };

  const results = [];
  let highestSeen = cursor;
  for (const evt of events) {
    highestSeen = Number(evt.id);
    if (!projectId) {
      results.push({ id: evt.id, type: evt.event_type, skipped: 'fcm_not_configured' });
      continue;
    }
    let r;
    try { r = await handleEvent(supabase, projectId, evt); }
    catch (e) { r = { error: e.message }; }
    results.push({ id: evt.id, type: evt.event_type, ...r });
  }

  await writeCursor(supabase, highestSeen);
  return {
    ok: true,
    processed: events.length,
    cursor: highestSeen,
    results
  };
}

exports.handler = async function(event) {
  // Auth: defer to the shared `authorizeAgentInvocation` helper used by every
  // other scheduled function (anthropic-health, gatekeeper-smoke, etc.). It
  // returns:
  //   'admin'     — valid x-admin-password / x-admin-token header.
  //   'scheduled' — a real Netlify Scheduled Function invocation. These are
  //                 NOT HTTP requests (no `event.httpMethod`), so external
  //                 callers can't spoof them by setting a header or body
  //                 string. Any HTTP request hitting this function MUST
  //                 carry the admin credential.
  //   null        — reject.
  // On-demand HTTP runs are additionally required to be POST so a stray
  // GET (e.g. a credentialed admin reload from the browser bar) is rejected.
  const auth = authorizeAgentInvocation(event);
  if (!auth) {
    return { statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) };
  }
  if (auth === 'admin' && event.httpMethod && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  const supabase = utils.createSupabaseClient();
  if (!supabase) {
    return { statusCode: 500, body: JSON.stringify({ error: 'supabase_unavailable' }) };
  }

  try {
    const out = await runOnce(supabase);
    return { statusCode: 200, body: JSON.stringify(out) };
  } catch (e) {
    console.error('[concierge-push-notifier] fatal:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

// Exported for tests.
exports._internal = { runOnce, handleEvent, CURSOR_KEY };

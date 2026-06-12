// ============================================================================
// MCC — Tracking Proximity Notifier (Step 7 / spec §5.6)
//
// Trigger: scheduled every minute via netlify.toml.
//
// What it does:
//   1. Find all concierge jobs with live_tracking_enabled = true and an
//      in_progress leg that has a recent tracking_ping (≤ 10 min).
//   2. For each, compute haversine distance from latest ping to leg destination.
//   3. At ~5 min ETA (distance / smoothed_speed ≤ PROXIMITY_THRESHOLD_SECS),
//      send ONE SMS to the job's member: "Your vehicle is ~5 min away."
//   4. On arrival (distance ≤ ARRIVAL_THRESHOLD_M), send ONE SMS: "Your vehicle
//      has arrived."
//   5. Throttle: max one proximity SMS and one arrival SMS per leg, tracked in
//      tracking_notification_log. Suppress if member is a ride-along participant
//      on the leg (they're in the car). Respect sms_opt_out via _shared/sms.js.
//
// Deep link: includes /concierge/jobs/{job_id}/track in the SMS body.
// ============================================================================

'use strict';

const { createClient } = require('@supabase/supabase-js');
const { sendSms }      = require('./_shared/sms');

const PROXIMITY_THRESHOLD_SECS = 5 * 60;  // send when ETA ≤ 5 min
const ARRIVAL_THRESHOLD_M      = 150;      // send "arrived" when within 150 m
const PING_FRESHNESS_SECS      = 10 * 60;
const FALLBACK_MPS             = 13.4;     // 30 mph

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function haversineMeters(a, b) {
  const R = 6_371_000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function etaSeconds(ping, dest) {
  const dist  = haversineMeters(ping, dest);
  const speed = (ping.speed_smoothed && ping.speed_smoothed > 1 && ping.speed_smoothed < 50)
    ? ping.speed_smoothed : FALLBACK_MPS;
  return dist / speed;
}

async function notifyJob(supabase, job, leg, ping, memberPhone, memberId) {
  const dest = { lat: leg.to_lat, lng: leg.to_lng };
  const dist  = haversineMeters(ping, dest);
  const eta   = etaSeconds(ping, dest);

  const trackUrl = `${process.env.MEMBER_APP_URL || 'https://app.mycarconcierge.com'}/concierge/jobs/${job.id}/track`;

  let kind = null;
  let message = null;

  if (dist <= ARRIVAL_THRESHOLD_M) {
    kind    = 'arrival_sms';
    message = `Your vehicle has arrived. ${trackUrl}`;
  } else if (eta <= PROXIMITY_THRESHOLD_SECS) {
    kind    = 'proximity_sms';
    const mins = Math.ceil(eta / 60);
    message = `Your vehicle is ~${mins} min away. Track it live: ${trackUrl}`;
  }

  if (!kind) return { sent: false, reason: 'not_in_range' };

  // Check if already sent for this leg.
  const { data: existing } = await supabase
    .from('tracking_notification_log')
    .select('id')
    .eq('job_id', job.id)
    .eq('leg_id', leg.id)
    .eq('kind', kind)
    .limit(1);
  if (existing && existing.length > 0) return { sent: false, reason: 'already_sent' };

  // Suppress if member is a ride-along participant on this leg.
  const { data: rideAlong } = await supabase
    .from('concierge_job_legs')
    .select('passenger_user_id')
    .eq('id', leg.id)
    .maybeSingle();
  if (rideAlong?.passenger_user_id === memberId) {
    return { sent: false, reason: 'ride_along_suppressed' };
  }

  const result = await sendSms({
    supabase,
    toPhone: memberPhone,
    body:    message,
    userId:  memberId,
  });

  if (result.sent) {
    await supabase.from('tracking_notification_log').insert({
      job_id:    job.id,
      leg_id:    leg.id,
      kind,
      member_id: memberId,
    });
    console.log(`[tracking-proximity] sent ${kind} for job ${job.id} leg ${leg.id}`);
  } else {
    console.warn(`[tracking-proximity] sms skipped for job ${job.id}:`, result.reason);
  }

  return result;
}

async function run(supabase) {
  const freshCutoff = new Date(Date.now() - PING_FRESHNESS_SECS * 1000).toISOString();

  // Find active tracked jobs: live_tracking_enabled, in_progress, with a fresh ping.
  const { data: jobs, error: jobErr } = await supabase
    .from('concierge_jobs')
    .select(`
      id,
      member_id,
      legs:concierge_job_legs!inner (
        id, sequence, status, to_lat, to_lng, to_address
      )
    `)
    .eq('live_tracking_enabled', true)
    .eq('is_demo', false)
    .eq('status', 'in_progress')
    .eq('concierge_job_legs.status', 'in_progress')
    .not('concierge_job_legs.to_lat', 'is', null);

  if (jobErr) { console.error('[tracking-proximity] jobs query failed:', jobErr.message); return; }
  if (!jobs || jobs.length === 0) return;

  for (const job of jobs) {
    const activeLeg = (job.legs || [])[0];
    if (!activeLeg) continue;

    // Get latest fresh ping for this job.
    const { data: pingRow } = await supabase
      .from('tracking_pings')
      .select('lat, lng, speed, speed_smoothed, recorded_at')
      .eq('job_id', job.id)
      .gte('recorded_at', freshCutoff)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!pingRow) continue;

    // Get member phone.
    const { data: memberProfile } = await supabase
      .from('profiles')
      .select('phone, sms_opt_out')
      .eq('id', job.member_id)
      .maybeSingle();

    if (!memberProfile?.phone) continue;

    await notifyJob(supabase, job, activeLeg, pingRow, memberProfile.phone, job.member_id);
  }
}

exports.handler = async function (event) {
  const isScheduled = event.httpMethod === undefined ||
                      (event.headers || {})['x-netlify-event'] === 'schedule';
  const isManual    = event.httpMethod === 'POST' &&
                      (event.headers || {})['x-admin-password'] === process.env.ADMIN_API_PASSWORD;

  if (!isScheduled && !isManual) {
    return { statusCode: 403, body: JSON.stringify({ error: 'forbidden' }) };
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    console.error('[tracking-proximity] supabase not configured');
    return { statusCode: 500, body: JSON.stringify({ error: 'supabase not configured' }) };
  }

  try {
    await run(supabase);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    console.error('[tracking-proximity] threw:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

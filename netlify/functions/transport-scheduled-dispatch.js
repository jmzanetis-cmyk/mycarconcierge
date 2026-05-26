// ============================================================================
// transport-scheduled-dispatch — promote future scheduled rides to 'requested'
//
// Runs every 15 minutes. Finds rides WHERE:
//   status = 'scheduled'
//   scheduled_pickup_at <= NOW() + 30 minutes
//
// Transitions them to 'requested' so the normal dispatch pipeline picks them up.
// Rides with status = 'reserved' (driver already claimed) are left alone —
// that driver will handle the pickup directly.
// ============================================================================
const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

exports.handler = async (event) => {
  // Allow manual HTTP trigger (admin use) as well as scheduled invocation
  const isScheduled = event.type === 'scheduled';
  const isManual    = event.httpMethod === 'POST';
  const authHeader  = event.headers?.authorization || event.headers?.Authorization || '';
  if (!isScheduled && (!isManual || authHeader !== `Bearer ${process.env.INTERNAL_SECRET}`)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const sb = getSupabase();
  if (!sb) {
    console.error('[transport-scheduled-dispatch] Supabase env vars missing');
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase not configured' }) };
  }

  const windowEnd = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  // Find scheduled rides within the 30-minute dispatch window
  const { data: due, error } = await sb.from('rides')
    .select('id, scheduled_pickup_at, member_id, provider_id')
    .eq('status', 'scheduled')
    .lte('scheduled_pickup_at', windowEnd)
    .order('scheduled_pickup_at', { ascending: true });

  if (error) {
    console.error('[transport-scheduled-dispatch] query error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  if (!due || due.length === 0) {
    console.log('[transport-scheduled-dispatch] no rides due for dispatch');
    return { statusCode: 200, body: JSON.stringify({ dispatched: 0 }) };
  }

  const ids = due.map(r => r.id);
  const { error: updateError } = await sb.from('rides')
    .update({ status: 'requested', updated_at: new Date().toISOString() })
    .in('id', ids)
    .eq('status', 'scheduled'); // guard against concurrent state changes

  if (updateError) {
    console.error('[transport-scheduled-dispatch] update error:', updateError);
    return { statusCode: 500, body: JSON.stringify({ error: updateError.message }) };
  }

  // Emit a ride_event for each promoted ride for audit trail
  const events = ids.map(rideId => ({
    ride_id:    rideId,
    event_type: 'scheduled_dispatch_triggered',
    data:       { triggered_at: new Date().toISOString(), window_minutes: 30 },
  }));
  await sb.from('ride_events').insert(events).catch(e =>
    console.warn('[transport-scheduled-dispatch] ride_events insert skipped:', e.message)
  );

  console.log(`[transport-scheduled-dispatch] promoted ${ids.length} ride(s) to requested:`, ids);
  return { statusCode: 200, body: JSON.stringify({ dispatched: ids.length, ride_ids: ids }) };
};

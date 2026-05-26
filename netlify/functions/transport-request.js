// ============================================================================
// transport-request — member & provider ride creation/management
//
// Routes (mounted under /api/transport/* via _redirects):
//   POST /api/transport/request            — member requests vehicle pickup
//   POST /api/transport/provider-request   — provider requests for a member
//   GET  /api/transport/requests           — member's rides (last 20, w/ driver)
//   GET  /api/transport/provider-requests  — provider's rides (last 20, w/ member name)
//   POST /api/transport/cancel             — member cancels a ride
//   POST /api/transport/rate               — member rates a driver
//   POST /api/transport/tip                — member tips a driver
//   POST /api/transport/vehicle-ready      — provider marks return leg ready for dispatch
// ============================================================================

const { createClient } = require('@supabase/supabase-js');

// TNC permit not yet obtained — passenger rides disabled until further notice.
// Flip to true only after regulatory approval is confirmed.
const RIDESHARE_ENABLED = false;
const VEHICLE_ONLY_TIERS = ['tier_2_vehicle_solo', 'tier_3_vehicle_paired'];

function getServiceSupabase() {
  const url  = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    },
    body: JSON.stringify(body)
  };
}

function getBearerToken(event) {
  const auth = (event.headers?.authorization || event.headers?.Authorization || '');
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function stripPrefix(p) {
  return (p || '')
    .replace(/^\/?\.netlify\/functions\/transport-request\/?/, '')
    .replace(/^\/?api\/transport\/?/, '')
    .replace(/^\/+/, '');
}

// Tier pricing per spec: 0-5→$35, 5-10→$50, 10-15→$65, 15-20→$80, 20-25→$100, 25+→$4/mile; tandem +50%
function estimateFare(distanceMiles, isTandem) {
  const d = Number(distanceMiles) || 0;
  let base;
  if (d <= 5)       base = 35;
  else if (d <= 10) base = 50;
  else if (d <= 15) base = 65;
  else if (d <= 20) base = 80;
  else if (d <= 25) base = 100;
  else              base = Math.round(d * 4 * 100) / 100;
  return isTandem ? Math.round(base * 1.5 * 100) / 100 : base;
}

async function authenticate(event, supabase) {
  const token = getBearerToken(event);
  if (!token) return { error: jsonResponse(401, { error: 'Missing bearer token' }) };
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: jsonResponse(401, { error: 'Invalid token' }) };
  return { user };
}

async function getVehicleInfo(supabase, vehicleId) {
  if (!vehicleId) return {};
  const { data: v } = await supabase
    .from('vehicles').select('make, model, year, color, license_plate')
    .eq('id', vehicleId).single();
  if (!v) return {};
  return {
    member_vehicle_make:  v.make,
    member_vehicle_model: v.model,
    member_vehicle_year:  v.year,
    member_vehicle_color: v.color,
    member_vehicle_plate: v.license_plate
  };
}

// ---------------------------------------------------------------------------
// POST /api/transport/request — member-initiated
// ---------------------------------------------------------------------------
async function handleMemberRequest(event, supabase, body) {
  const auth = await authenticate(event, supabase);
  if (auth.error) return auth.error;
  const { user } = auth;

  const {
    pickup_address, pickup_lat = 0, pickup_lng = 0, pickup_notes,
    dropoff_address, dropoff_lat = 0, dropoff_lng = 0,
    vehicle_id, provider_id,
    is_asap = true, scheduled_at,
    is_tandem = false,
    estimated_distance_miles = 0,
    notes,
    provider_covers = false,   // bid include_free_pickup: provider subsidises 100%
    round_trip_parent_id,      // set for auto-created return trips
    is_return_trip = false      // return leg stays in 'pending' until provider triggers
  } = body;

  if (!pickup_address?.trim())  return jsonResponse(400, { error: 'pickup_address required' });
  if (!dropoff_address?.trim()) return jsonResponse(400, { error: 'dropoff_address required' });

  const isTandem = Boolean(is_tandem);
  const fare     = estimateFare(estimated_distance_miles, isTandem);
  const memberRate     = provider_covers ? 0 : fare;
  const providerDiscount = provider_covers ? fare : 0;

  const vehicleInfo = await getVehicleInfo(supabase, vehicle_id);
  const tier     = isTandem ? 'tier_3_vehicle_paired' : 'tier_2_vehicle_solo';
  const scenario = isTandem ? 'paired_vehicle_pickup' : 'vehicle_pickup_solo';

  // Defensive guard: block any ride that resolves to a non-vehicle tier
  // while RIDESHARE_ENABLED is false. Tier is computed above from isTandem,
  // so this should never fire in normal operation — it exists to catch future
  // code paths that might introduce a rideshare tier inadvertently.
  if (!RIDESHARE_ENABLED && !VEHICLE_ONLY_TIERS.includes(tier)) {
    return jsonResponse(403, { error: 'Rideshare service is not available. MCC provides vehicle pickup & delivery only.' });
  }

  // Scheduled rides >30 min in the future go into a browsable pool for drivers to claim.
  // Within 30 min (or ASAP) they dispatch immediately via status='requested'.
  const THIRTY_MIN_MS = 30 * 60 * 1000;
  const isFutureScheduled = !is_return_trip && !is_asap && scheduled_at &&
    (new Date(scheduled_at).getTime() - Date.now() > THIRTY_MIN_MS);
  const initialStatus = is_return_trip ? 'pending' : isFutureScheduled ? 'scheduled' : 'requested';

  const { data, error } = await supabase.from('rides').insert({
    member_id:   user.id,
    provider_id: provider_id || null,
    channel:     'channel_a_member',
    tier, scenario,
    phase:       'phase_2_manual_pilot',
    status:      initialStatus,
    pickup_address:  pickup_address.trim(),
    pickup_lat:  Number(pickup_lat)  || 0,
    pickup_lng:  Number(pickup_lng)  || 0,
    pickup_notes: pickup_notes?.trim() || notes?.trim() || null,
    dropoff_address: dropoff_address.trim(),
    dropoff_lat: Number(dropoff_lat) || 0,
    dropoff_lng: Number(dropoff_lng) || 0,
    is_scheduled: !is_asap,
    scheduled_pickup_at: (!is_asap && scheduled_at) ? new Date(scheduled_at).toISOString() : null,
    estimated_distance_miles: Number(estimated_distance_miles) || null,
    base_rate:    memberRate,
    per_mile_rate: Number(estimated_distance_miles) > 25 ? 4 : 0,
    minimum_fare: 35,
    estimated_fare: fare,
    shuttle_premium_amount: isTandem ? Math.round((fare / 1.5) * 0.5 * 100) / 100 : 0,
    provider_discount_amount: providerDiscount,
    is_round_trip:        Boolean(round_trip_parent_id),
    round_trip_parent_id: round_trip_parent_id || null,
    ...vehicleInfo
  }).select('id, status, estimated_fare, pickup_address, dropoff_address').single();

  if (error) {
    console.error('[transport-request] member insert error:', error);
    return jsonResponse(500, { error: error.message });
  }

  if (isFutureScheduled) {
    return jsonResponse(201, {
      rideId: data.id,
      status: 'scheduled',
      scheduledAt: new Date(scheduled_at).toISOString(),
      message: 'Your pickup is scheduled. A driver will claim or be assigned before your pickup time.',
    });
  }
  return jsonResponse(201, { ride: data });
}

// ---------------------------------------------------------------------------
// POST /api/transport/provider-request — provider-initiated for a member
// ---------------------------------------------------------------------------
async function handleProviderRequest(event, supabase, body) {
  const auth = await authenticate(event, supabase);
  if (auth.error) return auth.error;
  const { user } = auth;

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'provider') return jsonResponse(403, { error: 'Provider account required' });

  const {
    member_id,
    pickup_address, pickup_lat = 0, pickup_lng = 0,
    dropoff_address, dropoff_lat = 0, dropoff_lng = 0,
    vehicle_id,
    is_tandem = false,
    subsidy_pct = 0,
    estimated_distance_miles = 0,
    notes,
    service_request_id,
    include_return = false,   // also create a pending return leg
    return_notes,
    scheduled_at,             // ISO timestamp for future scheduled pickup
    is_asap = true
  } = body;

  if (!member_id)              return jsonResponse(400, { error: 'member_id required' });
  if (!pickup_address?.trim()) return jsonResponse(400, { error: 'pickup_address required' });
  if (!dropoff_address?.trim()) return jsonResponse(400, { error: 'dropoff_address required' });

  const isTandem = Boolean(is_tandem);
  const fare     = estimateFare(estimated_distance_miles, isTandem);
  const subsidy  = Math.min(100, Math.max(0, Number(subsidy_pct) || 0));
  const memberPays   = Math.round(fare * (1 - subsidy / 100) * 100) / 100;
  const providerPays = Math.round(fare * (subsidy / 100) * 100) / 100;

  const vehicleInfo = await getVehicleInfo(supabase, vehicle_id);
  const tier     = isTandem ? 'tier_3_vehicle_paired' : 'tier_2_vehicle_solo';
  const scenario = isTandem ? 'paired_vehicle_pickup' : 'vehicle_pickup_solo';

  if (!RIDESHARE_ENABLED && !VEHICLE_ONLY_TIERS.includes(tier)) {
    return jsonResponse(403, { error: 'Rideshare service is not available. MCC provides vehicle pickup & delivery only.' });
  }

  const THIRTY_MIN_MS = 30 * 60 * 1000;
  const providerFutureScheduled = !is_asap && scheduled_at &&
    (new Date(scheduled_at).getTime() - Date.now() > THIRTY_MIN_MS);
  const providerInitialStatus = providerFutureScheduled ? 'scheduled' : 'requested';

  const { data, error } = await supabase.from('rides').insert({
    member_id,
    provider_id:    user.id,
    service_request_id: service_request_id || null,
    channel:        'channel_b_provider',
    tier, scenario,
    phase:          'phase_2_manual_pilot',
    status:         providerInitialStatus,
    is_scheduled:   !is_asap,
    scheduled_pickup_at: (!is_asap && scheduled_at) ? new Date(scheduled_at).toISOString() : null,
    pickup_address:  pickup_address.trim(),
    pickup_lat:  Number(pickup_lat)  || 0,
    pickup_lng:  Number(pickup_lng)  || 0,
    pickup_notes: notes?.trim() || null,
    dropoff_address: dropoff_address.trim(),
    dropoff_lat: Number(dropoff_lat) || 0,
    dropoff_lng: Number(dropoff_lng) || 0,
    estimated_distance_miles: Number(estimated_distance_miles) || null,
    base_rate:    memberPays,
    per_mile_rate: Number(estimated_distance_miles) > 25 ? 4 : 0,
    minimum_fare: 35,
    estimated_fare: fare,
    provider_discount_amount: providerPays,
    shuttle_premium_amount:   isTandem ? Math.round((fare / 1.5) * 0.5 * 100) / 100 : 0,
    ...vehicleInfo
  }).select('id, status, estimated_fare').single();

  if (error) {
    console.error('[transport-request] provider insert error:', error);
    return jsonResponse(500, { error: error.message });
  }

  // Auto-create pending return leg (shop→member) when include_return=true
  if (include_return && data?.id) {
    await supabase.from('rides').insert({
      member_id,
      provider_id:    user.id,
      service_request_id: service_request_id || null,
      channel:        'channel_b_provider',
      tier, scenario,
      phase:          'phase_2_manual_pilot',
      status:         'awaiting_vehicle_ready',
      pickup_address:  dropoff_address.trim(),
      pickup_lat:  Number(dropoff_lat) || 0,
      pickup_lng:  Number(dropoff_lng) || 0,
      pickup_notes: return_notes?.trim() || 'Return delivery — dispatch when service is complete',
      dropoff_address: pickup_address.trim(),
      dropoff_lat: Number(pickup_lat) || 0,
      dropoff_lng: Number(pickup_lng) || 0,
      estimated_distance_miles: Number(estimated_distance_miles) || null,
      base_rate:    memberPays,
      per_mile_rate: Number(estimated_distance_miles) > 25 ? 4 : 0,
      minimum_fare: 35,
      estimated_fare: fare,
      provider_discount_amount: providerPays,
      is_round_trip:      true,
      round_trip_parent_id: data.id,
      ...vehicleInfo
    }).select('id').single();
  }

  if (providerFutureScheduled) {
    return jsonResponse(201, {
      rideId: data.id,
      status: 'scheduled',
      scheduledAt: new Date(scheduled_at).toISOString(),
      message: 'Your pickup is scheduled. A driver will claim or be assigned before your pickup time.',
    });
  }
  return jsonResponse(201, { ride: data });
}

// ---------------------------------------------------------------------------
// GET /api/transport/requests — member's rides (with driver info)
// ---------------------------------------------------------------------------
async function handleGetRequests(event, supabase) {
  const auth = await authenticate(event, supabase);
  if (auth.error) return auth.error;
  const { user } = auth;

  const { data: rides, error } = await supabase
    .from('rides')
    .select('id, status, pickup_address, dropoff_address, estimated_fare, base_rate, is_scheduled, scheduled_pickup_at, requested_at, completed_at, tier, shuttle_premium_amount, is_round_trip, round_trip_parent_id, multiplier_rate, multiplier_label, pickup_wait_minutes, pickup_wait_cents, dropoff_wait_minutes, dropoff_wait_cents, show_up_fee_cents')
    .eq('member_id', user.id)
    .order('requested_at', { ascending: false })
    .limit(20);

  if (error) return jsonResponse(500, { error: error.message });

  // Attach driver info for rides that have an assigned driver
  const ACTIVE_STATUSES = ['driver_assigned','driver_accepted','driver_en_route','driver_arrived','in_progress','completed'];
  const activeIds = (rides || []).filter(r => ACTIVE_STATUSES.includes(r.status)).map(r => r.id);

  let driverMap = {};
  if (activeIds.length) {
    const { data: assignments } = await supabase
      .from('driver_assignments')
      .select('ride_id, driver_id, status')
      .in('ride_id', activeIds)
      .in('status', ['accepted','en_route','arrived','in_progress','completed']);

    if (assignments?.length) {
      const driverIds = [...new Set(assignments.map(a => a.driver_id))];
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, full_name, phone')
        .in('id', driverIds);

      assignments.forEach(a => {
        const d = (drivers || []).find(dr => dr.id === a.driver_id);
        driverMap[a.ride_id] = {
          driver_id:   a.driver_id,
          driver_name: d?.full_name || null,
          driver_phone: d?.phone    || null
        };
      });
    }
  }

  const result = (rides || []).map(r => ({ ...r, driver: driverMap[r.id] || null }));
  return jsonResponse(200, { rides: result });
}

// ---------------------------------------------------------------------------
// GET /api/transport/provider-requests — provider's rides with member names
// ---------------------------------------------------------------------------
async function handleGetProviderRequests(event, supabase) {
  const auth = await authenticate(event, supabase);
  if (auth.error) return auth.error;
  const { user } = auth;

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'provider') return jsonResponse(403, { error: 'Provider account required' });

  const { data: rides, error } = await supabase
    .from('rides')
    .select('id, status, pickup_address, dropoff_address, estimated_fare, base_rate, provider_discount_amount, member_id, is_scheduled, scheduled_pickup_at, requested_at, tier, is_round_trip, round_trip_parent_id, multiplier_rate, multiplier_label, pickup_wait_minutes, pickup_wait_cents, dropoff_wait_minutes, dropoff_wait_cents, show_up_fee_cents')
    .eq('provider_id', user.id)
    .order('requested_at', { ascending: false })
    .limit(30);

  if (error) return jsonResponse(500, { error: error.message });

  const memberIds = [...new Set((rides || []).map(r => r.member_id).filter(Boolean))];
  let memberMap = {};
  if (memberIds.length) {
    const { data: members } = await supabase.from('profiles').select('id, full_name').in('id', memberIds);
    (members || []).forEach(m => { memberMap[m.id] = m.full_name || 'Member'; });
  }

  const result = (rides || []).map(r => ({ ...r, member_name: memberMap[r.member_id] || 'Member' }));
  return jsonResponse(200, { rides: result });
}

// ---------------------------------------------------------------------------
// POST /api/transport/cancel — member cancels a ride
// ---------------------------------------------------------------------------
async function handleCancel(event, supabase, body) {
  const auth = await authenticate(event, supabase);
  if (auth.error) return auth.error;
  const { user } = auth;

  const { ride_id } = body;
  if (!ride_id) return jsonResponse(400, { error: 'ride_id required' });

  const { data: ride } = await supabase.from('rides').select('id, status, member_id').eq('id', ride_id).single();
  if (!ride) return jsonResponse(404, { error: 'Ride not found' });
  if (ride.member_id !== user.id) return jsonResponse(403, { error: 'Not your ride' });

  const CANCELLABLE = ['requested','pending','pending_dispatch','searching','dispatched','driver_assigned','driver_accepted'];
  const LATE_CANCEL  = ['driver_en_route','driver_arrived'];
  if (![...CANCELLABLE, ...LATE_CANCEL].includes(ride.status)) {
    return jsonResponse(400, { error: 'Ride cannot be cancelled at this stage' });
  }

  const { error } = await supabase.from('rides').update({
    status: 'cancelled_member',
    cancelled_at: new Date().toISOString(),
    cancellation_reason: 'member_cancelled'
  }).eq('id', ride_id);

  if (error) return jsonResponse(500, { error: error.message });
  return jsonResponse(200, { cancelled: true, late_cancel_fee: LATE_CANCEL.includes(ride.status) });
}

// ---------------------------------------------------------------------------
// POST /api/transport/rate — member rates a driver
// ---------------------------------------------------------------------------
async function handleRate(event, supabase, body) {
  const auth = await authenticate(event, supabase);
  if (auth.error) return auth.error;
  const { user } = auth;

  const { ride_id, driver_id, stars, comment } = body;
  if (!ride_id || !driver_id || !stars) return jsonResponse(400, { error: 'ride_id, driver_id, stars required' });
  if (stars < 1 || stars > 5) return jsonResponse(400, { error: 'stars must be 1-5' });

  const { data: ride } = await supabase.from('rides').select('member_id').eq('id', ride_id).single();
  if (!ride || ride.member_id !== user.id) return jsonResponse(403, { error: 'Unauthorized' });

  const { error } = await supabase.from('ride_ratings').insert({
    ride_id,
    rater_id:   user.id,
    rater_role: 'member',
    rated_id:   driver_id,
    rated_role: 'driver',
    stars:      Number(stars),
    comment:    comment?.trim() || null
  });

  if (error) return jsonResponse(500, { error: error.message });
  return jsonResponse(201, { rated: true });
}

// ---------------------------------------------------------------------------
// POST /api/transport/tip — member tips a driver
// ---------------------------------------------------------------------------
async function handleTip(event, supabase, body) {
  const auth = await authenticate(event, supabase);
  if (auth.error) return auth.error;
  const { user } = auth;

  const { ride_id, driver_id, amount_cents } = body;
  if (!ride_id || !driver_id || !amount_cents) return jsonResponse(400, { error: 'ride_id, driver_id, amount_cents required' });
  if (amount_cents < 50 || amount_cents > 10000) return jsonResponse(400, { error: 'Tip must be $0.50–$100' });

  const { data: ride } = await supabase.from('rides').select('member_id').eq('id', ride_id).single();
  if (!ride || ride.member_id !== user.id) return jsonResponse(403, { error: 'Unauthorized' });

  const { error } = await supabase.from('driver_tips').insert({
    ride_id,
    driver_id,
    amount: amount_cents / 100,
    status: 'pending'
  });

  if (error) return jsonResponse(500, { error: error.message });
  return jsonResponse(201, { tipped: true });
}

// ---------------------------------------------------------------------------
// POST /api/transport/vehicle-ready — provider marks return leg ready for dispatch
// ---------------------------------------------------------------------------
async function handleVehicleReady(event, supabase, body) {
  const auth = await authenticate(event, supabase);
  if (auth.error) return auth.error;
  const { user } = auth;

  const { ride_id } = body;
  if (!ride_id) return jsonResponse(400, { error: 'ride_id required' });

  const { data: ride } = await supabase.from('rides')
    .select('id, status, provider_id')
    .eq('id', ride_id)
    .single();

  if (!ride) return jsonResponse(404, { error: 'Ride not found' });
  if (ride.provider_id !== user.id) return jsonResponse(403, { error: 'Not your ride' });
  if (ride.status !== 'awaiting_vehicle_ready') return jsonResponse(400, { error: 'Ride is not awaiting vehicle readiness' });

  const { error } = await supabase.from('rides')
    .update({ status: 'requested' })
    .eq('id', ride_id);

  if (error) return jsonResponse(500, { error: error.message });
  return jsonResponse(200, { ready: true });
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------
exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const supabase = getServiceSupabase();
  if (!supabase) return jsonResponse(500, { error: 'Database not configured' });

  const route  = stripPrefix(event.path);
  const method = event.httpMethod;

  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); }
    catch { return jsonResponse(400, { error: 'Invalid JSON body' }); }
  }

  try {
    if (method === 'POST' && route === '')                       return await handleMemberRequest(event, supabase, body);
    if (method === 'POST' && route === 'provider-request')      return await handleProviderRequest(event, supabase, body);
    if (method === 'GET'  && route === 'requests')              return await handleGetRequests(event, supabase);
    if (method === 'GET'  && route === 'provider-requests')     return await handleGetProviderRequests(event, supabase);
    if (method === 'POST' && route === 'cancel')                return await handleCancel(event, supabase, body);
    if (method === 'POST' && route === 'rate')                  return await handleRate(event, supabase, body);
    if (method === 'POST' && route === 'tip')                   return await handleTip(event, supabase, body);
    if (method === 'POST' && route === 'vehicle-ready')         return await handleVehicleReady(event, supabase, body);
    return jsonResponse(404, { error: 'Not found', route, method });
  } catch (e) {
    console.error('[transport-request] error:', e);
    return jsonResponse(500, { error: e.message });
  }
};

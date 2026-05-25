// ============================================================================
// transport-request  (member-side & provider-side ride creation)
//
// Routes (mounted under /api/transport/* via _redirects):
//   POST /api/transport/request           — member requests vehicle pickup
//   POST /api/transport/provider-request  — provider requests on behalf of member
//   GET  /api/transport/requests          — member's ride history (last 20)
// ============================================================================

const { createClient } = require('@supabase/supabase-js');

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function jsonResponse(statusCode, body, extra = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      ...extra
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

// Price tiers per spec: 0-5→$35, 5-10→$50, 10-15→$65, 15-20→$80, 20-25→$100, 25+→$4/mile; tandem +50%
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
    .from('vehicles')
    .select('make, model, year, color, license_plate')
    .eq('id', vehicleId)
    .single();
  if (!v) return {};
  return {
    member_vehicle_make: v.make,
    member_vehicle_model: v.model,
    member_vehicle_year: v.year,
    member_vehicle_color: v.color,
    member_vehicle_plate: v.license_plate
  };
}

// POST /api/transport/request — member-initiated
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
    provider_covers = false  // provider checked "include free pickup" checkbox
  } = body;

  if (!pickup_address?.trim()) return jsonResponse(400, { error: 'pickup_address required' });
  if (!dropoff_address?.trim()) return jsonResponse(400, { error: 'dropoff_address required' });

  const isTandem = Boolean(is_tandem);
  const fare = estimateFare(estimated_distance_miles, isTandem);

  // If provider covers cost, member pays 0
  const memberRate = provider_covers ? 0 : fare;
  const providerDiscount = provider_covers ? fare : 0;

  const vehicleInfo = await getVehicleInfo(supabase, vehicle_id);
  const tier = isTandem ? 'tier_3_vehicle_paired' : 'tier_2_vehicle_solo';
  const scenario = isTandem ? 'paired_vehicle_pickup' : 'vehicle_pickup_solo';

  const { data, error } = await supabase.from('rides').insert({
    member_id: user.id,
    provider_id: provider_id || null,
    channel: 'channel_a_member',
    tier,
    scenario,
    phase: 'phase_2_manual_pilot',
    status: 'requested',
    pickup_address: pickup_address.trim(),
    pickup_lat: Number(pickup_lat) || 0,
    pickup_lng: Number(pickup_lng) || 0,
    pickup_notes: pickup_notes?.trim() || notes?.trim() || null,
    dropoff_address: dropoff_address.trim(),
    dropoff_lat: Number(dropoff_lat) || 0,
    dropoff_lng: Number(dropoff_lng) || 0,
    is_scheduled: !is_asap,
    scheduled_pickup_at: (!is_asap && scheduled_at) ? new Date(scheduled_at).toISOString() : null,
    estimated_distance_miles: Number(estimated_distance_miles) || null,
    base_rate: memberRate,
    per_mile_rate: Number(estimated_distance_miles) > 25 ? 4 : 0,
    minimum_fare: 35,
    estimated_fare: fare,
    shuttle_premium_amount: isTandem ? Math.round((fare / 1.5) * 0.5 * 100) / 100 : 0,
    provider_discount_amount: providerDiscount,
    ...vehicleInfo
  }).select('id, status, estimated_fare, pickup_address, dropoff_address').single();

  if (error) {
    console.error('[transport-request] member insert error:', error);
    return jsonResponse(500, { error: error.message });
  }

  return jsonResponse(201, { ride: data });
}

// POST /api/transport/provider-request — provider-initiated for a member
async function handleProviderRequest(event, supabase, body) {
  const auth = await authenticate(event, supabase);
  if (auth.error) return auth.error;
  const { user } = auth;

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'provider') {
    return jsonResponse(403, { error: 'Provider account required' });
  }

  const {
    member_id,
    pickup_address, pickup_lat = 0, pickup_lng = 0,
    dropoff_address, dropoff_lat = 0, dropoff_lng = 0,
    vehicle_id,
    is_tandem = false,
    subsidy_pct = 0,
    estimated_distance_miles = 0,
    notes,
    service_request_id
  } = body;

  if (!member_id) return jsonResponse(400, { error: 'member_id required' });
  if (!pickup_address?.trim()) return jsonResponse(400, { error: 'pickup_address required' });
  if (!dropoff_address?.trim()) return jsonResponse(400, { error: 'dropoff_address required' });

  const isTandem = Boolean(is_tandem);
  const fare = estimateFare(estimated_distance_miles, isTandem);
  const subsidy = Math.min(100, Math.max(0, Number(subsidy_pct) || 0));
  const memberPays = Math.round(fare * (1 - subsidy / 100) * 100) / 100;
  const providerPays = Math.round(fare * (subsidy / 100) * 100) / 100;

  const vehicleInfo = await getVehicleInfo(supabase, vehicle_id);
  const tier = isTandem ? 'tier_3_vehicle_paired' : 'tier_2_vehicle_solo';
  const scenario = isTandem ? 'paired_vehicle_pickup' : 'vehicle_pickup_solo';

  const { data, error } = await supabase.from('rides').insert({
    member_id,
    provider_id: user.id,
    service_request_id: service_request_id || null,
    channel: 'channel_b_provider',
    tier,
    scenario,
    phase: 'phase_2_manual_pilot',
    status: 'requested',
    pickup_address: pickup_address.trim(),
    pickup_lat: Number(pickup_lat) || 0,
    pickup_lng: Number(pickup_lng) || 0,
    pickup_notes: notes?.trim() || null,
    dropoff_address: dropoff_address.trim(),
    dropoff_lat: Number(dropoff_lat) || 0,
    dropoff_lng: Number(dropoff_lng) || 0,
    estimated_distance_miles: Number(estimated_distance_miles) || null,
    base_rate: memberPays,
    per_mile_rate: Number(estimated_distance_miles) > 25 ? 4 : 0,
    minimum_fare: 35,
    estimated_fare: fare,
    provider_discount_amount: providerPays,
    shuttle_premium_amount: isTandem ? Math.round((fare / 1.5) * 0.5 * 100) / 100 : 0,
    ...vehicleInfo
  }).select('id, status, estimated_fare').single();

  if (error) {
    console.error('[transport-request] provider insert error:', error);
    return jsonResponse(500, { error: error.message });
  }

  return jsonResponse(201, { ride: data });
}

// GET /api/transport/requests — member's rides
async function handleGetRequests(event, supabase) {
  const auth = await authenticate(event, supabase);
  if (auth.error) return auth.error;
  const { user } = auth;

  const { data, error } = await supabase
    .from('rides')
    .select('id, status, pickup_address, dropoff_address, estimated_fare, base_rate, is_scheduled, scheduled_pickup_at, requested_at, tier, shuttle_premium_amount')
    .eq('member_id', user.id)
    .order('requested_at', { ascending: false })
    .limit(20);

  if (error) return jsonResponse(500, { error: error.message });
  return jsonResponse(200, { rides: data || [] });
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const supabase = getServiceSupabase();
  if (!supabase) return jsonResponse(500, { error: 'Database not configured' });

  const route = stripPrefix(event.path);
  const method = event.httpMethod;

  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch { return jsonResponse(400, { error: 'Invalid JSON body' }); }
  }

  try {
    if (method === 'POST' && route === '')                    return await handleMemberRequest(event, supabase, body);
    if (method === 'POST' && route === 'provider-request')   return await handleProviderRequest(event, supabase, body);
    if (method === 'GET'  && route === 'requests')           return await handleGetRequests(event, supabase);
    return jsonResponse(404, { error: 'Not found', route, method });
  } catch (e) {
    console.error('[transport-request] error:', e);
    return jsonResponse(500, { error: e.message });
  }
};

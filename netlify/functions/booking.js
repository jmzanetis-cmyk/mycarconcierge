// POST   /api/booking           — create a service appointment (slot_bookings)
// GET    /api/booking/:id       — get appointment details
// DELETE /api/booking/:id       — cancel appointment
const { createClient } = require('@supabase/supabase-js');

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

async function getUser(event, sb) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { error: json(401, { error: 'Missing token' }) };
  const { data: { user }, error } = await sb.auth.getUser(m[1].trim());
  if (error || !user) return { error: json(401, { error: 'Invalid token' }) };
  return { user };
}

function stripRoute(path) {
  return (path || '').replace(/.*\/api\/booking\/?/, '').replace(/\/$/, '');
}

async function handleCreate(event, sb, user) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const { provider_id, package_id, booking_date, start_time, service_type, notes, service_location = 'on_site' } = body;
  if (!provider_id || !booking_date || !start_time) {
    return json(400, { error: 'provider_id, booking_date, and start_time are required' });
  }

  // Check provider exists
  const { data: provider } = await sb.from('profiles').select('id, role').eq('id', provider_id).single();
  if (!provider || (provider.role !== 'provider' && !provider.is_also_provider)) {
    return json(404, { error: 'Provider not found' });
  }

  // Check for slot conflict
  const { data: conflict } = await sb.from('slot_bookings')
    .select('id')
    .eq('provider_id', provider_id)
    .eq('booking_date', booking_date)
    .eq('start_time', start_time)
    .not('status', 'eq', 'cancelled')
    .single();
  if (conflict) return json(409, { error: 'That time slot is already booked' });

  // Check provider isn't blocking that time
  const { data: blocked } = await sb.from('provider_blocked_time')
    .select('id')
    .eq('provider_id', provider_id)
    .eq('block_date', booking_date)
    .lte('start_time', start_time)
    .gte('end_time', start_time)
    .limit(1);
  if (blocked && blocked.length > 0) return json(409, { error: 'Provider is unavailable at that time' });

  // Default end_time to 1 hour after start
  const [h, min] = start_time.split(':').map(Number);
  const endH = String((h + 1) % 24).padStart(2, '0');
  const end_time = `${endH}:${String(min).padStart(2, '0')}:00`;

  const { data: booking, error } = await sb.from('slot_bookings').insert({
    provider_id,
    member_id: user.id,
    package_id: package_id || null,
    booking_date,
    start_time,
    end_time,
    duration_minutes: 60,
    service_location,
    service_type: service_type || null,
    member_notes: notes || null,
    status: 'booked',
  }).select('*').single();

  if (error) return json(500, { error: error.message });
  return json(201, { success: true, booking });
}

async function handleGet(sb, user, bookingId) {
  const { data: booking } = await sb.from('slot_bookings')
    .select(`*, profiles!slot_bookings_provider_id_fkey(full_name, business_name, phone)`)
    .eq('id', bookingId)
    .single();
  if (!booking) return json(404, { error: 'Booking not found' });
  if (booking.member_id !== user.id && booking.provider_id !== user.id) return json(403, { error: 'Forbidden' });
  return json(200, { success: true, booking });
}

async function handleCancel(sb, user, bookingId) {
  const { data: booking } = await sb.from('slot_bookings').select('id, member_id, provider_id, status').eq('id', bookingId).single();
  if (!booking) return json(404, { error: 'Booking not found' });
  if (booking.member_id !== user.id && booking.provider_id !== user.id) return json(403, { error: 'Forbidden' });
  if (booking.status === 'cancelled') return json(400, { error: 'Booking already cancelled' });

  const { error } = await sb.from('slot_bookings').update({
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    cancelled_by: user.id === booking.member_id ? 'member' : 'provider',
  }).eq('id', bookingId);

  if (error) return json(500, { error: error.message });
  return json(200, { success: true });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  const sb = supabase();
  const auth = await getUser(event, sb);
  if (auth.error) return auth.error;

  const route = stripRoute(event.path);

  if (event.httpMethod === 'POST' && !route) return handleCreate(event, sb, auth.user);
  if (event.httpMethod === 'GET'  && route)  return handleGet(sb, auth.user, route);
  if (event.httpMethod === 'DELETE' && route) return handleCancel(sb, auth.user, route);

  return json(405, { error: 'Method not allowed' });
};

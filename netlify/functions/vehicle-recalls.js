// GET /api/vehicle/:vehicleId/recalls[?refresh=true]
// Fetches recall data from NHTSA and caches in vehicle_recalls table.
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

function mapSeverity(consequence = '') {
  const c = consequence.toLowerCase();
  if (c.includes('death') || c.includes('fatal') || c.includes('fire')) return 'critical';
  if (c.includes('crash') || c.includes('injur') || c.includes('accident')) return 'high';
  if (c.includes('may') || c.includes('could') || c.includes('loss of control')) return 'medium';
  return 'low';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  const sb = supabase();
  const auth = await getUser(event, sb);
  if (auth.error) return auth.error;

  const m = event.path.match(/\/api\/vehicle\/([^/]+)\/recalls/);
  if (!m) return json(400, { error: 'Vehicle ID required' });
  const vehicleId = m[1];
  const refresh = event.queryStringParameters?.refresh === 'true';

  const { data: vehicle } = await sb.from('vehicles')
    .select('id, owner_id, year, make, model')
    .eq('id', vehicleId)
    .single();
  if (!vehicle) return json(404, { error: 'Vehicle not found' });
  if (vehicle.owner_id !== auth.user.id) return json(403, { error: 'Not your vehicle' });

  // Return cached recalls unless ?refresh=true
  if (!refresh) {
    const { data: cached } = await sb.from('vehicle_recalls')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('created_at', { ascending: false });
    if (cached && cached.length > 0) {
      return json(200, {
        recalls: cached,
        activeCount: cached.filter(r => !r.is_acknowledged).length,
        source: 'cache',
      });
    }
  }

  // Fetch from NHTSA
  const { year, make, model } = vehicle;
  const nhtsaUrl = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${year}`;
  let nhtsaRecalls = [];
  try {
    const res = await fetch(nhtsaUrl, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      nhtsaRecalls = data.results || [];
    }
  } catch {
    // Fall through to cached data on NHTSA timeout
  }

  // Upsert each recall into vehicle_recalls
  for (const r of nhtsaRecalls) {
    const severity = mapSeverity(r.Consequence || '');
    await sb.from('vehicle_recalls').upsert({
      vehicle_id: vehicleId,
      nhtsa_campaign_number: r.NHTSACampaignNumber,
      component: r.Component,
      summary: r.Summary,
      consequence: r.Consequence,
      remedy: r.Remedy,
      manufacturer: r.Manufacturer,
      report_received_date: r.ReportReceivedDate ? r.ReportReceivedDate.split('T')[0] : null,
      severity,
    }, { onConflict: 'vehicle_id,nhtsa_campaign_number', ignoreDuplicates: false });
  }

  const { data: recalls } = await sb.from('vehicle_recalls')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .order('report_received_date', { ascending: false, nullsFirst: false });

  const list = recalls || [];
  return json(200, {
    recalls: list,
    activeCount: list.filter(r => !r.is_acknowledged).length,
    source: 'nhtsa',
  });
};

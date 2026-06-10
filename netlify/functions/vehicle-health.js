// POST /api/vehicles/:vehicleId/compute-health
// Computes a 0-100 health score: maintenance(40%) + mileage(20%) + recalls(20%) + age(20%)
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  return (Date.now() - new Date(dateStr).getTime()) / 86400000;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const sb = supabase();
  const auth = await getUser(event, sb);
  if (auth.error) return auth.error;

  const m = event.path.match(/\/api\/vehicles\/([^/]+)\/compute-health/);
  if (!m) return json(400, { error: 'Vehicle ID required' });
  const vehicleId = m[1];

  const { data: vehicle } = await sb.from('vehicles')
    .select('id, owner_id, year, make, model, mileage, current_mileage, last_service_date, last_oil_change_date, last_tire_rotation_date, last_brake_service_date')
    .eq('id', vehicleId)
    .single();
  if (!vehicle) return json(404, { error: 'Vehicle not found' });
  if (vehicle.owner_id !== auth.user.id) return json(403, { error: 'Not your vehicle' });

  const { data: openRecalls } = await sb.from('vehicle_recalls')
    .select('id')
    .eq('vehicle_id', vehicleId)
    .eq('is_acknowledged', false);

  const positive = [];
  const negative = [];

  // --- Maintenance score (40%) ---
  const lastService = daysSince(vehicle.last_service_date || vehicle.last_oil_change_date);
  let maintenanceScore;
  if (lastService <= 90) {
    maintenanceScore = 100;
    positive.push('Recent service — vehicle is well maintained');
  } else if (lastService <= 180) {
    maintenanceScore = 80;
    positive.push('Service within the last 6 months');
  } else if (lastService <= 365) {
    maintenanceScore = 60;
    negative.push('Service more than 6 months ago — consider scheduling soon');
  } else if (lastService === Infinity) {
    maintenanceScore = 50;
    negative.push('No service history recorded');
  } else {
    maintenanceScore = 30;
    negative.push('No service in over a year — overdue for maintenance');
  }

  // --- Mileage score (20%) ---
  const miles = vehicle.current_mileage || vehicle.mileage || 0;
  let mileageScore;
  if (miles < 30000) {
    mileageScore = 100;
    positive.push(`Low mileage (${miles.toLocaleString()} miles)`);
  } else if (miles < 75000) {
    mileageScore = 80;
    positive.push(`Moderate mileage (${miles.toLocaleString()} miles)`);
  } else if (miles < 120000) {
    mileageScore = 60;
  } else if (miles < 180000) {
    mileageScore = 40;
    negative.push(`High mileage (${miles.toLocaleString()} miles)`);
  } else {
    mileageScore = 20;
    negative.push(`Very high mileage (${miles.toLocaleString()} miles) — monitor closely`);
  }

  // --- Recall score (20%) ---
  const openCount = (openRecalls || []).length;
  const recallScore = Math.max(0, 100 - openCount * 30);
  if (openCount === 0) {
    positive.push('No open safety recalls');
  } else {
    negative.push(`${openCount} open safety recall${openCount > 1 ? 's' : ''} — address at your dealership`);
  }

  // --- Age score (20%) ---
  const currentYear = new Date().getFullYear();
  const age = vehicle.year ? currentYear - vehicle.year : 10;
  let ageScore;
  if (age <= 2) {
    ageScore = 100;
    positive.push(`Nearly new vehicle (${vehicle.year})`);
  } else if (age <= 5) {
    ageScore = 85;
    positive.push(`Relatively young vehicle (${vehicle.year})`);
  } else if (age <= 8) {
    ageScore = 70;
  } else if (age <= 12) {
    ageScore = 55;
  } else {
    ageScore = 40;
    negative.push(`Older vehicle (${vehicle.year}) — preventive maintenance is key`);
  }

  const score = Math.round(
    maintenanceScore * 0.4 +
    mileageScore     * 0.2 +
    recallScore      * 0.2 +
    ageScore         * 0.2
  );

  const label = score >= 90 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Needs Attention';
  const summary = `Your ${vehicle.year} ${vehicle.make} ${vehicle.model} is in ${label.toLowerCase()} condition.` +
    (openCount > 0 ? ` Address the open recall${openCount > 1 ? 's' : ''} to improve your score.` : '');

  // Persist updated score
  await sb.from('vehicles').update({ health_score: score }).eq('id', vehicleId);

  return json(200, { success: true, score, factors: { positive, negative }, summary });
};

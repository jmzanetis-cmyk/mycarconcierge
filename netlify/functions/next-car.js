// POST /api/next-car/suggest
// Uses Anthropic to recommend next vehicles based on the member's current car + preferences.
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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const sb = supabase();
  const auth = await getUser(event, sb);
  if (auth.error) return auth.error;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const { budget_min, budget_max, priorities = [], vehicle_id } = body;

  // Pull current vehicle and member preferences for context
  const [vehicleRes, prefRes] = await Promise.all([
    vehicle_id
      ? sb.from('vehicles').select('year, make, model, mileage, current_mileage').eq('id', vehicle_id).eq('owner_id', auth.user.id).single()
      : Promise.resolve({ data: null }),
    sb.from('member_car_preferences').select('*').eq('member_id', auth.user.id).limit(1).single(),
  ]);

  const currentVehicle = vehicleRes.data;
  const prefs = prefRes.data;

  const budgetText = budget_max
    ? `Budget: $${budget_min || 0}–$${budget_max}`
    : budget_min ? `Budget: $${budget_min}+` : 'Budget: not specified';

  const currentVehicleText = currentVehicle
    ? `Current vehicle: ${currentVehicle.year} ${currentVehicle.make} ${currentVehicle.model}, ${(currentVehicle.current_mileage || currentVehicle.mileage || 0).toLocaleString()} miles`
    : 'No current vehicle specified';

  const prefsText = prefs
    ? `Preferences: body style=${prefs.body_style || 'any'}, fuel=${prefs.fuel_type || 'any'}, must-haves=${JSON.stringify(prefs.must_haves || [])}`
    : priorities.length > 0 ? `Priorities: ${priorities.join(', ')}` : '';

  const prompt = `You are an automotive advisor helping a member find their next car.

${currentVehicleText}
${budgetText}
${prefsText}

Recommend 3 specific vehicles (year range, make, model) with a brief reason for each.
Return a JSON array of objects:
[
  {
    "year_range": "2021-2023",
    "make": "Toyota",
    "model": "Camry",
    "trim_suggestion": "XSE V6",
    "price_range": "$28,000-$35,000",
    "why": "2-3 sentence explanation",
    "pros": ["reliability", "resale value"],
    "cons": ["road noise at highway speeds"],
    "reliability_rating": "Excellent"
  }
]`;

  const apiKey = process.env.ANTHROPIC_API_KEY_MCC_FLEET1 || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json(500, { error: 'AI not configured' });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: 'You are an expert automotive advisor. Always respond with valid JSON only.',
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) return json(502, { error: 'AI service unavailable' });
  const aiData = await res.json();
  const text = aiData.content?.[0]?.text || '[]';

  let suggestions = [];
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) suggestions = JSON.parse(match[0]);
  } catch { suggestions = []; }

  return json(200, { success: true, suggestions });
};

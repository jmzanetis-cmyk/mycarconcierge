// vehicle-predictions.js
//
// GET  /api/vehicle/:vehicleId/predictions          — AI maintenance forecast (cached 7 days)
// POST /api/vehicle/:vehicleId/predictions/invalidate — bust cache after service completion
//
// Uses claude-haiku-4-5-20251001 to generate:
//   { health_summary, predictions: [{ title, urgency, estimated_miles, estimated_date, reason }] }
//
// Cache strategy: one row per vehicle in vehicle_predictions; expires_at drives TTL.
// On cache miss or expiry the function calls Claude, upserts a fresh row, and returns.
// On any Claude/network failure the function returns { success: false } so the client
// can write an empty predictions object and hide the spinner rather than sticking.

'use strict';

const { createClient } = require('@supabase/supabase-js');

const MODEL   = 'claude-haiku-4-5-20251001';
const API_KEY = process.env.ANTHROPIC_API_KEY_MCC_FLEET1 || process.env.ANTHROPIC_API_KEY;

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function resp(status, body) {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

async function getUser(event, sb) {
  const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const { data, error } = await sb.auth.getUser(m[1].trim());
  if (error || !data?.user) return null;
  return data.user;
}

function extractVehicleId(path) {
  const m = path.match(/\/api\/vehicle\/([^/]+)\/predictions/);
  return m ? m[1] : null;
}

const SYSTEM = `You are an expert automotive service advisor for My Car Concierge.
Given a vehicle's specifications and service history, generate a maintenance forecast.

Respond ONLY with valid JSON (no prose, no markdown fences) matching this exact shape:
{
  "health_summary": "One or two sentences describing the vehicle's current maintenance health.",
  "predictions": [
    {
      "title": "Short service name (max 60 chars)",
      "urgency": "critical|soon|upcoming|routine",
      "estimated_miles": 5000,
      "estimated_date": "YYYY-MM-DD",
      "reason": "One sentence explaining why this service is predicted."
    }
  ]
}

Rules:
- Urgency levels: critical = overdue or safety concern, soon = within 3 months or 2000 miles,
  upcoming = 3-12 months or 2000-10000 miles, routine = beyond 12 months or 10000+ miles.
- Return 3-6 predictions ordered by urgency (most urgent first).
- estimated_miles and estimated_date are both optional — include what makes sense.
- Base predictions on manufacturer schedules for the specific year/make/model and the service
  intervals recorded in history. Flag unacknowledged safety recalls as critical.
- Keep health_summary factual, not marketing language.`;

async function callClaude(prompt) {
  if (!API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  const tokens = data.usage?.input_tokens + data.usage?.output_tokens;
  return { text, tokens };
}

function buildPrompt(vehicle, serviceHistory, recalls) {
  const mileage = vehicle.current_mileage || vehicle.mileage;
  const age = vehicle.year ? (new Date().getFullYear() - vehicle.year) : null;

  const lines = [
    `Vehicle: ${vehicle.year || 'Unknown year'} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ' ' + vehicle.trim : ''}`,
    mileage ? `Current mileage: ${mileage.toLocaleString()} miles` : 'Mileage: unknown',
    age !== null ? `Age: ${age} year${age !== 1 ? 's' : ''}` : '',
    vehicle.last_oil_change_date ? `Last oil change: ${vehicle.last_oil_change_date}${vehicle.last_oil_change_mileage ? ' at ' + vehicle.last_oil_change_mileage.toLocaleString() + ' mi' : ''}` : '',
    vehicle.last_tire_rotation_date ? `Last tire rotation: ${vehicle.last_tire_rotation_date}${vehicle.last_tire_rotation_mileage ? ' at ' + vehicle.last_tire_rotation_mileage.toLocaleString() + ' mi' : ''}` : '',
    vehicle.last_brake_service_date ? `Last brake service: ${vehicle.last_brake_service_date}${vehicle.last_brake_service_mileage ? ' at ' + vehicle.last_brake_service_mileage.toLocaleString() + ' mi' : ''}` : '',
    vehicle.last_transmission_service_date ? `Last transmission service: ${vehicle.last_transmission_service_date}` : '',
    vehicle.last_coolant_flush_date ? `Last coolant flush: ${vehicle.last_coolant_flush_date}` : '',
    vehicle.last_service_date ? `Last service date: ${vehicle.last_service_date}` : '',
  ].filter(Boolean).join('\n');

  let historySection = '';
  if (serviceHistory.length > 0) {
    const recent = serviceHistory.slice(0, 10);
    historySection = '\n\nRecent service history:\n' + recent.map(s =>
      `- ${s.service_date}: ${s.service_type}${s.mileage ? ' at ' + s.mileage.toLocaleString() + ' mi' : ''}${s.description ? ' — ' + s.description.slice(0, 80) : ''}`
    ).join('\n');
  }

  let recallSection = '';
  const unacknowledged = recalls.filter(r => !r.is_acknowledged);
  if (unacknowledged.length > 0) {
    recallSection = '\n\nUnacknowledged safety recalls:\n' + unacknowledged.map(r =>
      `- ${r.component || 'Unknown component'}: ${(r.summary || '').slice(0, 120)}`
    ).join('\n');
  }

  return lines + historySection + recallSection + '\n\nToday\'s date: ' + new Date().toISOString().split('T')[0];
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return resp(200, {});

  const sb = serviceClient();
  const user = await getUser(event, sb);
  if (!user) return resp(401, { error: 'Unauthorized' });

  const vehicleId = extractVehicleId(event.path);
  if (!vehicleId) return resp(400, { error: 'Vehicle ID required' });

  // Verify ownership
  const { data: vehicle } = await sb.from('vehicles')
    .select('id, owner_id, year, make, model, trim, mileage, current_mileage, last_service_date, last_oil_change_date, last_oil_change_mileage, last_tire_rotation_date, last_tire_rotation_mileage, last_brake_service_date, last_brake_service_mileage, last_transmission_service_date, last_coolant_flush_date')
    .eq('id', vehicleId)
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!vehicle) return resp(403, { error: 'Not your vehicle' });

  // ── Invalidate route ──────────────────────────────────────────────────────
  if (event.httpMethod === 'POST' && event.path.endsWith('/invalidate')) {
    await sb.from('vehicle_predictions').delete().eq('vehicle_id', vehicleId);
    return resp(200, { success: true });
  }

  if (event.httpMethod !== 'GET') return resp(405, { error: 'Method not allowed' });

  // ── Check cache ───────────────────────────────────────────────────────────
  const { data: cached } = await sb.from('vehicle_predictions')
    .select('health_summary, predictions, generated_at, expires_at')
    .eq('vehicle_id', vehicleId)
    .gt('expires_at', new Date().toISOString())
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached) {
    return resp(200, {
      success: true,
      health_summary: cached.health_summary,
      predictions: cached.predictions,
      generated_at: cached.generated_at,
      cached: true,
    });
  }

  // ── Generate fresh prediction ─────────────────────────────────────────────
  const [{ data: serviceHistory }, { data: recalls }] = await Promise.all([
    sb.from('service_history')
      .select('service_date, service_type, description, mileage')
      .eq('vehicle_id', vehicleId)
      .order('service_date', { ascending: false })
      .limit(20),
    sb.from('vehicle_recalls')
      .select('component, summary, is_acknowledged')
      .eq('vehicle_id', vehicleId),
  ]);

  const prompt = buildPrompt(vehicle, serviceHistory || [], recalls || []);

  let parsed;
  let tokens = 0;
  try {
    const { text, tokens: t } = await callClaude(prompt);
    tokens = t || 0;
    // Strip any accidental markdown fences before parsing
    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    parsed = JSON.parse(clean);
  } catch (err) {
    console.error('[vehicle-predictions] Claude/parse error:', err.message);
    return resp(200, { success: false, predictions: [], health_summary: null });
  }

  const health_summary = typeof parsed.health_summary === 'string' ? parsed.health_summary : null;
  const predictions = Array.isArray(parsed.predictions) ? parsed.predictions : [];

  // Evict stale rows then insert fresh one
  await sb.from('vehicle_predictions').delete().eq('vehicle_id', vehicleId);
  await sb.from('vehicle_predictions').insert({
    vehicle_id: vehicleId,
    member_id: user.id,
    health_summary,
    predictions,
    model: MODEL,
    tokens_used: tokens,
  });

  return resp(200, {
    success: true,
    health_summary,
    predictions,
    generated_at: new Date().toISOString(),
    cached: false,
  });
};

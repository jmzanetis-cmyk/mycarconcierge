// ============================================================================
// ai-describe-to-package — AI care-plan creation helper
//
//   POST /api/ai/describe-to-package
//   Body: { text: string, vehicle?: { make, model, year, trim } }
//
// Parses a plain-language problem description into structured maintenance
// package fields (title, description, category, urgency, estimated_cost_range)
// so the member can review and confirm before submitting.
//
// Auth: optional Bearer JWT (used if present; anonymous calls also allowed so
// the form works before the user signs in and returns consistent behavior).
// Rate-limited to 10 calls / IP / minute by upstream Netlify edge.
// ============================================================================
'use strict';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY_MCC_FLEET1 || process.env.ANTHROPIC_API_KEY;

// Keep this list in exact sync with the <select id="p-category"> options in
// members.html — if the AI picks a value that isn't a real form option, the
// frontend silently fails to select it and the field is left on whatever was
// already chosen (defaulting to "Maintenance & Mechanical"), which biases
// every non-mechanical request toward that category.
const CATEGORIES = [
  'maintenance', 'manufacturer_service', 'detailing', 'cosmetic',
  'accident_repair', 'performance', 'audio_electronics', 'lighting',
  'interior', 'offroad', 'ev_hybrid', 'classic_vintage', 'fleet_graphics',
  'premium_protection', 'convertible_specialty', 'motorcycle', 'rv_camper',
  'boat_marine', 'snow_removal', 'other',
];

const CATEGORY_HINTS = `- maintenance: routine mechanical work, oil changes, brakes, engine/transmission issues, check engine light
- manufacturer_service: factory-scheduled maintenance, recalls, warranty service
- detailing: washing, waxing, interior cleaning, full detail, pre-sale prep
- cosmetic: dents, scratches, paint chips, bumper/body cosmetic repair (non-collision)
- accident_repair: collision damage, insurance claims, structural body work
- performance: tuning, upgrades, aftermarket performance parts
- audio_electronics: stereo, speakers, infotainment, wiring, electronics installs
- lighting: headlights, taillights, underglow, lighting upgrades or repair
- interior: upholstery, seats, carpet, dash repair/replacement
- offroad: lift kits, off-road tires/suspension, trail prep
- ev_hybrid: EV/hybrid-specific service (battery, charging, drivetrain)
- classic_vintage: restoration or service of classic/vintage vehicles
- fleet_graphics: fleet vehicle wraps, decals, commercial graphics
- premium_protection: PPF, ceramic coating, paint protection
- convertible_specialty: convertible tops and specialty mechanisms
- motorcycle: motorcycle service or repair
- rv_camper: RV or camper service or repair
- boat_marine: boat or marine vessel service or repair
- snow_removal: snow plowing/removal for a property
- other: anything that doesn't clearly fit above`;

const SYSTEM = `You are an expert service advisor for My Car Concierge, a concierge
platform covering far more than mechanical repair — detailing, cosmetic and body
work, audio/electronics, interior, off-road, EV/hybrid, classic cars, motorcycles,
RVs, boats, snow removal, and more.
A member has described a problem or service need in plain language.
Extract structured fields for a service request form.

Respond with ONLY valid JSON (no prose, no markdown fences) in this exact shape:
{
  "title": "short service title (max 60 chars)",
  "description": "clear professional description of the work needed (2-4 sentences)",
  "category": "one of: ${CATEGORIES.join(', ')}",
  "urgency": "one of: asap, this_week, flexible",
  "estimated_cost_range": "rough USD range, e.g. '$150–$300' or null if unknown"
}

Category guide:
${CATEGORY_HINTS}

Rules:
- title should be action-oriented, e.g. "Brake pad replacement" not "Fix brakes"
- description should help providers understand the scope and any symptoms mentioned
- category must be exactly one of the listed values — pick the MOST SPECIFIC one that
  fits the description. Do not default to "maintenance" just because the request is
  car-related; only use it for actual mechanical/repair work
- urgency: asap if safety issue or car won't start; this_week if inconvenient; flexible otherwise
- If the description is too vague to parse meaningfully, still return your best guess`;

function json(code, data) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body: JSON.stringify(data),
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  if (!ANTHROPIC_API_KEY) {
    console.error('[ai-describe-to-package] ANTHROPIC_API_KEY not set');
    return json(503, { error: 'AI service not configured' });
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const text = (body.text || '').trim().slice(0, 2000);
  if (!text) return json(400, { error: 'text is required' });

  const vehicleCtx = body.vehicle
    ? `Vehicle: ${[body.vehicle.year, body.vehicle.make, body.vehicle.model, body.vehicle.trim].filter(Boolean).join(' ')}\n`
    : '';

  const userPrompt = `${vehicleCtx}Member description: "${text}"`;

  let rawText = '';
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system:     SYSTEM,
        messages:   [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      console.error('[ai-describe-to-package] Anthropic error:', err);
      return json(502, { error: 'AI service unavailable' });
    }

    const data = await resp.json();
    rawText = data?.content?.[0]?.text || '';
  } catch (e) {
    console.error('[ai-describe-to-package] fetch error:', e.message);
    return json(502, { error: 'AI service unavailable' });
  }

  // Parse the JSON response
  try {
    const m = rawText.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no JSON in response');
    const parsed = JSON.parse(m[0]);

    // Sanitise fields
    const category = CATEGORIES.includes(parsed.category) ? parsed.category : 'other';
    const urgency  = ['asap', 'this_week', 'flexible'].includes(parsed.urgency) ? parsed.urgency : 'flexible';

    return json(200, {
      title:                (parsed.title        || '').slice(0, 60),
      description:          (parsed.description  || '').slice(0, 1000),
      category,
      urgency,
      estimated_cost_range: parsed.estimated_cost_range || null,
    });
  } catch (e) {
    console.error('[ai-describe-to-package] parse error:', e.message, 'raw:', rawText.slice(0, 200));
    return json(422, { error: 'Could not parse AI response — please fill in manually' });
  }
};

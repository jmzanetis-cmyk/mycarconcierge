// ai-care-plan.js
//
// POST /api/ai/create-care-plan
// Body: { description: string, vehicle_id?: string, member_id?: string }
//
// Uses Claude Haiku to parse a plain-language problem description into a
// structured care plan ready for the member to review and submit:
//   { service_type, urgency, title, detailed_description, estimated_cost_range, estimated_min, estimated_max, category }
//
// Auth: Bearer JWT (checked if present; open if absent so the form works
// during onboarding before the user has a session token).

'use strict';

const API_KEY = process.env.ANTHROPIC_API_KEY_MCC_FLEET1 || process.env.ANTHROPIC_API_KEY;
const MODEL   = 'claude-haiku-4-5-20251001';

const URGENCY_LEVELS = ['critical', 'high', 'medium', 'low'];
const CATEGORIES = [
  'maintenance', 'manufacturer_service', 'accident_repair',
  'performance', 'cosmetic', 'tires', 'diagnostics', 'electrical', 'other',
];

const SYSTEM = `You are an expert automotive service advisor for My Car Concierge.
A member has described a car problem or service need in plain language.
Extract structured fields for a care plan.

Respond with ONLY valid JSON (no prose, no markdown fences) matching this shape exactly:
{
  "title": "Short, specific service title (max 80 chars)",
  "service_type": "One of: oil_change, tire_service, brake_service, engine_repair, transmission, electrical, body_repair, detailing, inspection, other",
  "category": "One of: maintenance, manufacturer_service, accident_repair, performance, cosmetic, tires, diagnostics, electrical, other",
  "urgency": "One of: critical, high, medium, low",
  "detailed_description": "Professional description of the issue and recommended service (2-4 sentences)",
  "estimated_min": <integer USD, lower bound of the price range — omit or null only if truly unquotable, e.g. "not sure what's wrong">,
  "estimated_max": <integer USD, upper bound of the price range — must be >= estimated_min; omit or null only if estimated_min is null>,
  "estimated_cost_range": "e.g. $150–$350",
  "safety_note": "One-sentence safety note if urgency is critical or high, otherwise null"
}

If you provide estimated_min and estimated_max, they must be consistent with estimated_cost_range. Use whole-dollar integers; do not include cents.

Urgency guide:
- critical: safety issue (brakes, steering, suspension failure) — drive to shop immediately
- high: will worsen quickly if ignored (oil leak, overheating, transmission slip)
- medium: should be addressed within 1-2 months
- low: cosmetic or convenience item, no immediate risk`;

function jsonResponse(status, body) {
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

// Fallback parser for estimated_cost_range strings when the AI didn't
// populate estimated_min / estimated_max as structured fields. Handles
// "$150–$350", "$150-$350", "$1,500 to $3,500", "$150" (single-point).
// Returns { min: null, max: null } if nothing matches — the client then
// omits value_min / value_max from the care_plans insert (auto-bid engine
// skips those plans, same as behavior pre-fix).
function parseEstRange(str) {
  if (!str || typeof str !== 'string') return { min: null, max: null };
  const range = str.match(/\$?\s*([\d,]+(?:\.\d+)?)\s*(?:[–\-—]|to)\s*\$?\s*([\d,]+(?:\.\d+)?)/i);
  if (range) {
    const min = Math.round(parseFloat(range[1].replace(/,/g, '')));
    const max = Math.round(parseFloat(range[2].replace(/,/g, '')));
    if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min) {
      return { min, max };
    }
  }
  const single = str.match(/\$?\s*([\d,]+(?:\.\d+)?)\+?/);
  if (single) {
    const val = Math.round(parseFloat(single[1].replace(/,/g, '')));
    if (Number.isFinite(val) && val > 0) return { min: val, max: val };
  }
  return { min: null, max: null };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  if (!API_KEY) return jsonResponse(503, { error: 'AI service not configured' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }

  const { description, vehicle_id, member_id } = body;
  if (!description || typeof description !== 'string' || description.trim().length < 5) {
    return jsonResponse(400, { error: 'description is required (min 5 characters)' });
  }
  if (description.length > 2000) {
    return jsonResponse(400, { error: 'description too long (max 2000 characters)' });
  }

  const userMessage = `Member's description: "${description.trim()}"`;

  let parsed;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        system: SYSTEM,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      console.error('[ai-care-plan] Anthropic error', resp.status, err.slice(0, 200));
      return jsonResponse(502, { error: 'AI service temporarily unavailable' });
    }

    const data = await resp.json();
    const raw  = (data.content?.[0]?.text || '').trim();
    // Strip markdown fences if present
    const json  = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    parsed = JSON.parse(json);
  } catch (err) {
    console.error('[ai-care-plan] parse error:', err.message);
    return jsonResponse(500, { error: 'Failed to parse AI response' });
  }

  // Validate and sanitise output
  const urgency  = URGENCY_LEVELS.includes(parsed.urgency) ? parsed.urgency : 'medium';
  const category = CATEGORIES.includes(parsed.category)   ? parsed.category : 'other';

  // Prefer the AI's structured numeric output; fall back to parsing the
  // display string. Both null is acceptable — the client omits value_min /
  // value_max from the care_plans insert in that case (auto-bid engine
  // then skips those plans, same behavior as before this fix).
  let estimated_min = null;
  let estimated_max = null;
  const rawMin = Number.isFinite(parsed.estimated_min) ? Math.round(parsed.estimated_min) : null;
  const rawMax = Number.isFinite(parsed.estimated_max) ? Math.round(parsed.estimated_max) : null;
  if (rawMin != null && rawMin > 0 && rawMax != null && rawMax >= rawMin) {
    estimated_min = rawMin;
    estimated_max = rawMax;
  } else {
    const parsedRange = parseEstRange(parsed.estimated_cost_range);
    estimated_min = parsedRange.min;
    estimated_max = parsedRange.max;
  }

  return jsonResponse(200, {
    success:     true,
    vehicle_id:  vehicle_id || null,
    member_id:   member_id  || null,
    care_plan: {
      title:               (parsed.title               || '').slice(0, 80),
      service_type:        parsed.service_type         || 'other',
      category,
      urgency,
      detailed_description: parsed.detailed_description || '',
      estimated_cost_range: parsed.estimated_cost_range || null,
      estimated_min,
      estimated_max,
      safety_note:          urgency === 'critical' || urgency === 'high' ? (parsed.safety_note || null) : null,
    },
  });
};

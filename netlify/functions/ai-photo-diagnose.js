// ============================================================================
// ai-photo-diagnose — AI photo-based car problem diagnosis
//
//   POST /api/ai/photo-diagnose
//   Body: { image: base64string, vehicle?: { make, model, year, trim } }
//
// Returns structured package fields inferred from a photo, plus a plain-
// English explanation of what the AI sees. Uses Claude vision (haiku tier).
// ============================================================================
'use strict';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY_MCC_FLEET1 || process.env.ANTHROPIC_API_KEY;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB base64 limit

const CATEGORIES = [
  'maintenance', 'manufacturer_service', 'accident_repair',
  'performance', 'cosmetic', 'offroad', 'tires', 'diagnostics',
  'electrical', 'other',
];

const SYSTEM = `You are an expert automotive service advisor for My Car Concierge.
A member has uploaded a photo of their car issue for diagnosis.
Analyze the image and provide structured service request fields.

Respond with ONLY valid JSON in this exact shape:
{
  "title": "short service title (max 60 chars)",
  "description": "clear professional description of the work needed (2-4 sentences)",
  "category": "one of: ${CATEGORIES.join(', ')}",
  "urgency": "one of: asap, this_week, flexible",
  "explanation": "1-2 sentence plain English explanation of what you see in the photo",
  "lowConfidence": false
}

If the image is unclear, not car-related, or you cannot diagnose from it:
{"title":"","description":"","category":"other","urgency":"flexible","explanation":"I couldn't clearly identify a car issue from this photo. Please describe the problem in the text box.","lowConfidence":true}`;

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
    return json(503, { error: 'AI service not configured' });
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const imageB64 = body.image || '';
  if (!imageB64) return json(400, { error: 'image (base64) is required' });
  if (imageB64.length > MAX_IMAGE_BYTES) return json(413, { error: 'Image too large (max 5 MB)' });

  // Detect media type from base64 prefix (if present) or default to jpeg
  const mediaType = imageB64.startsWith('/9j/') ? 'image/jpeg'
    : imageB64.startsWith('iVBOR') ? 'image/png'
    : imageB64.startsWith('R0lGO') ? 'image/gif'
    : 'image/jpeg';

  const vehicleCtx = body.vehicle
    ? `Vehicle: ${[body.vehicle.year, body.vehicle.make, body.vehicle.model, body.vehicle.trim].filter(Boolean).join(' ')}`
    : '';

  const userContent = [
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageB64 } },
    { type: 'text', text: vehicleCtx ? `${vehicleCtx}\nPlease diagnose the car issue shown in this photo.` : 'Please diagnose the car issue shown in this photo.' },
  ];

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
        max_tokens: 600,
        system:     SYSTEM,
        messages:   [{ role: 'user', content: userContent }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      console.error('[ai-photo-diagnose] Anthropic error:', err);
      return json(502, { error: 'AI service unavailable' });
    }

    const data = await resp.json();
    rawText = data?.content?.[0]?.text || '';
  } catch (e) {
    console.error('[ai-photo-diagnose] fetch error:', e.message);
    return json(502, { error: 'AI service unavailable' });
  }

  try {
    const m = rawText.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no JSON');
    const parsed = JSON.parse(m[0]);

    if (parsed.lowConfidence) {
      return json(200, {
        lowConfidence: true,
        explanation: parsed.explanation || 'Could not identify the issue from this photo.',
      });
    }

    const category = CATEGORIES.includes(parsed.category) ? parsed.category : 'other';
    const urgency  = ['asap', 'this_week', 'flexible'].includes(parsed.urgency) ? parsed.urgency : 'flexible';

    return json(200, {
      title:       (parsed.title       || '').slice(0, 60),
      description: (parsed.description || '').slice(0, 1000),
      explanation: (parsed.explanation || '').slice(0, 300),
      category,
      urgency,
      lowConfidence: false,
    });
  } catch (e) {
    console.error('[ai-photo-diagnose] parse error:', e.message);
    return json(200, {
      lowConfidence: true,
      explanation: 'Could not analyze the photo. Please describe the issue in the text box.',
    });
  }
};

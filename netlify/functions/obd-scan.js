// POST /api/obd/scan-ocr  — base64 image → extracted DTC codes (Anthropic vision)
// POST /api/obd/interpret — DTC code string → plain-language explanation + cost estimate
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

async function callAnthropic(messages, system, model = 'claude-haiku-4-5-20251001') {
  const apiKey = process.env.ANTHROPIC_API_KEY_MCC_FLEET1 || process.env.ANTHROPIC_API_KEY;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 1024, system, messages }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function handleScanOcr(event, sb, user) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const { image_base64, vehicle_id, media_type = 'image/jpeg' } = body;
  if (!image_base64) return json(400, { error: 'image_base64 required' });

  const text = await callAnthropic([{
    role: 'user',
    content: [
      {
        type: 'image',
        source: { type: 'base64', media_type, data: image_base64 },
      },
      {
        type: 'text',
        text: 'Extract all OBD-II diagnostic trouble codes (DTCs) visible in this image. Return ONLY a JSON array of code strings, e.g. ["P0301","P0420"]. If no codes are visible, return [].',
      },
    ],
  }], 'You are an automotive diagnostic assistant. Extract DTC codes exactly as shown.', 'claude-sonnet-4-6');

  let codes = [];
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) codes = JSON.parse(match[0]);
  } catch { /* leave empty */ }

  // Persist scan
  const scanPayload = {
    user_id: user.id,
    vehicle_id: vehicle_id || null,
    codes,
    source: 'ocr',
    raw_input: `ocr:${image_base64.substring(0, 30)}...`,
    severity: codes.length > 0 ? (codes.some(c => c.startsWith('P0') || c.startsWith('C') || c.startsWith('B')) ? 'warning' : 'info') : null,
  };
  const { data: scan } = await sb.from('diagnostic_scans').insert(scanPayload).select('id').single();

  return json(200, { success: true, codes, scan_id: scan?.id });
}

async function handleInterpret(event, sb, user) {
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const { code, vehicle_id, scan_id } = body;
  if (!code) return json(400, { error: 'code required' });

  const prompt = `Interpret OBD-II diagnostic trouble code: ${code.toUpperCase()}\n\nRespond with a JSON object containing:\n- "code": the DTC code\n- "name": short name/title\n- "description": plain-language explanation (2-3 sentences)\n- "severity": "low" | "medium" | "high" | "critical"\n- "symptoms": array of strings (what the driver might notice)\n- "common_causes": array of strings\n- "estimated_repair_cost_range": string like "$150-$400"\n- "urgency": "drive to shop soon" | "schedule soon" | "ok to monitor" | "stop driving immediately"`;

  const text = await callAnthropic([{ role: 'user', content: prompt }],
    'You are an expert automotive technician. Always respond with valid JSON only.');

  let interpretation = {};
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) interpretation = JSON.parse(match[0]);
  } catch { interpretation = { code, description: text, severity: 'medium' }; }

  // Update scan record if provided
  if (scan_id) {
    await sb.from('diagnostic_scans')
      .update({ ai_interpretation: interpretation, severity: interpretation.severity, updated_at: new Date().toISOString() })
      .eq('id', scan_id)
      .eq('user_id', user.id);
  } else if (vehicle_id) {
    await sb.from('diagnostic_scans').insert({
      user_id: user.id,
      vehicle_id,
      codes: [code.toUpperCase()],
      source: 'manual',
      ai_interpretation: interpretation,
      severity: interpretation.severity,
    });
  }

  return json(200, { success: true, interpretation });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const sb = supabase();
  const auth = await getUser(event, sb);
  if (auth.error) return auth.error;

  const route = event.path.replace(/.*\/api\/obd\//, '').replace(/\/$/, '');
  if (route === 'scan-ocr') return handleScanOcr(event, sb, auth.user);
  if (route === 'interpret') return handleInterpret(event, sb, auth.user);
  return json(404, { error: 'Unknown OBD route' });
};

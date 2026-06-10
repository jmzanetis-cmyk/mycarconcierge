// PUT  /api/recalls/:id/acknowledge — mark a recall acknowledged
// POST /api/recalls/:id/enrich      — AI plain-language summary + severity
// Auth: Bearer JWT + vehicle ownership check
'use strict';

const { createClient } = require('@supabase/supabase-js');

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

async function getUser(event, sb) {
  const auth = (event.headers?.authorization || event.headers?.Authorization || '');
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { error: json(401, { error: 'Missing token' }) };
  const { data: { user }, error } = await sb.auth.getUser(m[1].trim());
  if (error || !user) return { error: json(401, { error: 'Invalid token' }) };
  return { user };
}

function parseRecallId(path) {
  const m = (path || '').match(/\/api\/recalls\/([^/]+)\//);
  return m ? m[1] : null;
}

async function fetchRecallWithOwnership(sb, recallId, userId) {
  const { data: recall, error } = await sb.from('vehicle_recalls')
    .select('id, vehicle_id, is_acknowledged, summary, consequence, remedy, component, nhtsa_campaign_number, ai_summary, severity')
    .eq('id', recallId)
    .single();
  if (error || !recall) return { notFound: true };

  const { data: vehicle } = await sb.from('vehicles')
    .select('id, owner_id')
    .eq('id', recall.vehicle_id)
    .single();
  if (!vehicle || vehicle.owner_id !== userId) return { forbidden: true };

  return { recall };
}

async function handleAcknowledge(sb, user, recallId) {
  const { recall, notFound, forbidden } = await fetchRecallWithOwnership(sb, recallId, user.id);
  if (notFound) return json(404, { error: 'Recall not found' });
  if (forbidden) return json(403, { error: 'Not your vehicle' });

  const { error } = await sb.from('vehicle_recalls').update({
    is_acknowledged: true,
    acknowledged_at: new Date().toISOString(),
    acknowledged_by: user.id,
  }).eq('id', recallId);

  if (error) {
    console.error('[recall-actions] acknowledge update error:', error.message);
    return json(500, { error: 'Failed to acknowledge recall' });
  }

  return json(200, { success: true, message: 'Recall acknowledged' });
}

async function callClaude(recall) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const parts = [
    recall.component   ? `Component: ${recall.component}`   : null,
    recall.summary     ? `Summary: ${recall.summary}`       : null,
    recall.consequence ? `Consequence: ${recall.consequence}` : null,
    recall.remedy      ? `Remedy: ${recall.remedy}`         : null,
  ].filter(Boolean).join('\n');

  const prompt = `You are a vehicle safety advisor. Given this NHTSA recall data, write:
1. A plain-English summary (2-3 sentences) a car owner can understand. No jargon.
2. A severity rating: one of exactly: low, medium, high, critical.

Recall data:
${parts}

Respond with ONLY valid JSON: {"ai_summary":"...","severity":"low|medium|high|critical"}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('[recall-actions] Anthropic error:', res.status, txt.slice(0, 200));
      return null;
    }

    const payload = await res.json();
    const text = payload?.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    const severity = ['low', 'medium', 'high', 'critical'].includes(parsed.severity)
      ? parsed.severity : 'medium';
    return { ai_summary: String(parsed.ai_summary || '').trim(), severity };
  } catch (e) {
    console.error('[recall-actions] Claude call threw:', e.message);
    return null;
  }
}

async function handleEnrich(sb, user, recallId) {
  const { recall, notFound, forbidden } = await fetchRecallWithOwnership(sb, recallId, user.id);
  if (notFound) return json(404, { error: 'Recall not found' });
  if (forbidden) return json(403, { error: 'Not your vehicle' });

  // Return cached result if already enriched
  if (recall.ai_summary) {
    return json(200, { success: true, ai_summary: recall.ai_summary, severity: recall.severity });
  }

  const result = await callClaude(recall);
  if (!result) {
    return json(502, { error: 'AI enrichment unavailable' });
  }

  const { error } = await sb.from('vehicle_recalls').update({
    ai_summary: result.ai_summary,
    severity:   result.severity,
  }).eq('id', recallId);

  if (error) {
    console.error('[recall-actions] enrich update error:', error.message);
    return json(500, { error: 'Failed to save enrichment' });
  }

  return json(200, { success: true, ai_summary: result.ai_summary, severity: result.severity });
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  const sb = supabase();
  const auth = await getUser(event, sb);
  if (auth.error) return auth.error;

  const recallId = parseRecallId(event.path);
  if (!recallId) return json(400, { error: 'Recall ID required' });

  if (event.httpMethod === 'PUT'  && event.path.endsWith('/acknowledge')) return handleAcknowledge(sb, auth.user, recallId);
  if (event.httpMethod === 'POST' && event.path.endsWith('/enrich'))      return handleEnrich(sb, auth.user, recallId);

  return json(405, { error: 'Method not allowed' });
};

'use strict';

// ============================================================================
// ai-member — Member-facing AI features (Task #456)
//
// Routes (all POST, all require Bearer token):
//   /api/ai/service-history-chat
//     Body:  { question: string }
//     Return: { answer: string } | { error: string }
//
//   /api/ai/appointment-debrief
//     Body:  { package_id: uuid }
//     Return: { summary: string } | { error: string }
//
//   /api/ai/counter-suggestion
//     Body:  { bid_id: uuid }
//     Return: { has_suggestion: true, suggested_counter, rationale,
//              market_low, market_high } | { has_suggestion: false }
//
// Mounted via www/_redirects:
//   /api/ai/* /.netlify/functions/ai-member/:splat 200
// ============================================================================

const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-haiku-4-5-20251001';

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(data)
  };
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function getAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

async function authenticateUser(event) {
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user || null;
}

function parsePath(event) {
  const raw = event.path || event.rawPath || '';
  return raw
    .replace(/^\/?\.netlify\/functions\/ai-member\/?/, '')
    .replace(/^\/api\/ai\/?/, '')
    .replace(/^\/+|\/+$/g, '');
}

// ── service-history-chat ────────────────────────────────────────────────────

async function handleServiceHistoryChat(user, body) {
  const question = (body.question || '').toString().trim().slice(0, 500);
  if (!question) return jsonResponse(400, { error: 'question is required' });

  const supabase = getSupabase();
  if (!supabase) return jsonResponse(503, { error: 'Service unavailable' });

  const anthropic = getAnthropic();
  if (!anthropic) return jsonResponse(503, { error: 'AI service not configured' });

  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, year, make, model, vin')
    .eq('owner_id', user.id)
    .limit(5);

  const { data: packages } = await supabase
    .from('maintenance_packages')
    .select('id, title, status, created_at, total_cost, provider_id')
    .eq('member_id', user.id)
    .in('status', ['completed', 'released'])
    .order('created_at', { ascending: false })
    .limit(20);

  const vehicleSummary = (vehicles || [])
    .map(v => `${v.year} ${v.make} ${v.model}${v.vin ? ' (VIN: ' + v.vin + ')' : ''}`)
    .join('; ') || 'No vehicles on file';

  const serviceList = (packages || [])
    .map(p => `- ${p.title} (${new Date(p.created_at).toLocaleDateString()}, status: ${p.status}${p.total_cost ? ', $' + p.total_cost : ''})`)
    .join('\n') || 'No completed services on file';

  const prompt = `You are a helpful car care assistant for My Car Concierge. Answer the member's question based only on the service history provided. Be concise (2-4 sentences max).

Member's vehicles: ${vehicleSummary}

Service history (most recent first):
${serviceList}

Member's question: ${question}`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    });
    const answer = response.content?.[0]?.text?.trim() || '';
    if (!answer) return jsonResponse(200, { error: 'No response generated' });
    return jsonResponse(200, { answer });
  } catch (err) {
    console.error('[ai-member] service-history-chat error:', err.message);
    return jsonResponse(200, { error: 'AI unavailable — please try again' });
  }
}

// ── appointment-debrief ─────────────────────────────────────────────────────

async function handleAppointmentDebrief(user, body) {
  const packageId = (body.package_id || '').toString().trim();
  if (!packageId) return jsonResponse(400, { error: 'package_id is required' });

  const supabase = getSupabase();
  if (!supabase) return jsonResponse(503, { error: 'Service unavailable' });

  const anthropic = getAnthropic();
  if (!anthropic) return jsonResponse(503, { error: 'AI service not configured' });

  const { data: pkg } = await supabase
    .from('maintenance_packages')
    .select('id, title, status, total_cost, completion_notes, created_at, updated_at, member_id')
    .eq('id', packageId)
    .eq('member_id', user.id)
    .maybeSingle();

  if (!pkg) return jsonResponse(404, { error: 'Package not found' });

  const prompt = `You are a helpful car care assistant for My Car Concierge. Generate a concise, friendly 2-3 sentence summary of this completed service appointment for the member.

Service: ${pkg.title}
Status: ${pkg.status}
Cost: ${pkg.total_cost ? '$' + pkg.total_cost : 'not recorded'}
Completed: ${pkg.updated_at ? new Date(pkg.updated_at).toLocaleDateString() : 'unknown'}
${pkg.completion_notes ? 'Notes: ' + pkg.completion_notes : ''}

Write a friendly summary the member can use to remember what was done. Focus on what was serviced and what it means for their vehicle.`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }]
    });
    const summary = response.content?.[0]?.text?.trim() || '';
    if (!summary) return jsonResponse(200, { error: 'Could not generate summary' });
    return jsonResponse(200, { summary });
  } catch (err) {
    console.error('[ai-member] appointment-debrief error:', err.message);
    return jsonResponse(200, { error: 'AI unavailable — please try again' });
  }
}

// ── counter-suggestion ──────────────────────────────────────────────────────

async function handleCounterSuggestion(user, body) {
  const bidId = (body.bid_id || '').toString().trim();
  if (!bidId) return jsonResponse(400, { error: 'bid_id is required' });

  const supabase = getSupabase();
  if (!supabase) return jsonResponse(503, { error: 'Service unavailable' });

  const anthropic = getAnthropic();
  if (!anthropic) return jsonResponse(503, { error: 'AI service not configured' });

  const { data: bid } = await supabase
    .from('plan_bids')
    .select('id, amount, care_plan_id, provider_id, status, created_at, plan_bids_care_plans:care_plans(title, value_min, value_max, service_types)')
    .eq('id', bidId)
    .maybeSingle();

  if (!bid) return jsonResponse(200, { has_suggestion: false });

  // Verify the care plan belongs to this member
  const { data: plan } = await supabase
    .from('care_plans')
    .select('id, member_id, value_min, value_max, title, service_types')
    .eq('id', bid.care_plan_id)
    .eq('member_id', user.id)
    .maybeSingle();

  if (!plan) return jsonResponse(200, { has_suggestion: false });

  const bidAmount = Number(bid.amount);
  const valueMin  = Number(plan.value_min || 0);
  const valueMax  = Number(plan.value_max || 0);

  const prompt = `You are a helpful negotiation assistant for My Car Concierge. Suggest a counter-offer amount for this automotive service bid.

Service: ${plan.title}
Member's estimated budget: $${valueMin}–$${valueMax}
Provider's bid: $${bidAmount}
Service types: ${(plan.service_types || []).join(', ') || 'general'}

Respond in JSON only with these exact fields:
{
  "suggested_counter": <number, reasonable counter amount>,
  "rationale": "<1-2 sentence plain English explanation>",
  "market_low": <number, estimated low end for this service>,
  "market_high": <number, estimated high end for this service>
}`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }]
    });
    const text = response.content?.[0]?.text?.trim() || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return jsonResponse(200, { has_suggestion: false });
    const parsed = JSON.parse(jsonMatch[0]);
    return jsonResponse(200, {
      has_suggestion: true,
      suggested_counter: Number(parsed.suggested_counter) || bidAmount * 0.9,
      rationale: parsed.rationale || '',
      market_low: Number(parsed.market_low) || 0,
      market_high: Number(parsed.market_high) || 0
    });
  } catch (err) {
    console.error('[ai-member] counter-suggestion error:', err.message);
    return jsonResponse(200, { has_suggestion: false });
  }
}

// ── handler ─────────────────────────────────────────────────────────────────

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'POST only' });

  const user = await authenticateUser(event);
  if (!user) return jsonResponse(401, { error: 'Authentication required' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}

  const route = parsePath(event);

  if (route === 'service-history-chat') return handleServiceHistoryChat(user, body);
  if (route === 'appointment-debrief')  return handleAppointmentDebrief(user, body);
  if (route === 'counter-suggestion')   return handleCounterSuggestion(user, body);

  return jsonResponse(404, { error: 'Not found' });
};

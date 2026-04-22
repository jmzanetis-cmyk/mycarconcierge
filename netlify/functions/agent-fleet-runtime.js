// ============================================================================
// MCC Agent Fleet — Shared Runtime
// Every fleet agent imports this. Centralizes:
//   - Supabase + Anthropic client wiring
//   - Spend-cap reservation/reconciliation (the ONLY allowed path to Claude)
//   - Audit logging into agent_actions
//   - Event emission into agent_events
//   - Autonomy resolution + admin auth helper
// ============================================================================

const { createClient } = require('@supabase/supabase-js');

// ---------------------------------------------------------------------------
// Env / clients
// ---------------------------------------------------------------------------
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function authenticateAdmin(event) {
  const headers = event.headers || {};
  const pw = headers['x-admin-password'] || headers['X-Admin-Password'];
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  return pw === adminPassword;
}

// Netlify Scheduled Functions invoke handlers with a body containing a `next_run`
// field. They never present a real request from the public internet — the
// function URL is invoked internally by the platform. We accept an invocation as
// "scheduled" only when both signals are present (no admin header, parseable
// next_run body). All other unauthenticated calls are rejected.
function isScheduledInvocation(event) {
  if (!event || !event.body) return false;
  try {
    const b = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    return !!(b && typeof b === 'object' && b.next_run);
  } catch {
    return false;
  }
}

// Returns one of: 'admin', 'scheduled', null. Used by orchestrator/analyst to
// decide whether to allow the request and how to label the audit row.
function authorizeAgentInvocation(event) {
  if (authenticateAdmin(event)) return 'admin';
  // No admin header at all and a scheduled body shape → trust the platform.
  const headers = event.headers || {};
  const hasAnyAdminHeader = !!(headers['x-admin-password'] || headers['X-Admin-Password']);
  if (!hasAnyAdminHeader && isScheduledInvocation(event)) return 'scheduled';
  return null;
}

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-password, X-Admin-Password',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    },
    body: JSON.stringify(data)
  };
}

// ---------------------------------------------------------------------------
// Anthropic pricing (USD per 1M tokens). Keep conservative — this only feeds
// the spend-cap accountant, not user billing.
// ---------------------------------------------------------------------------
const PRICING = {
  'claude-sonnet-4-5':            { in: 3.00, out: 15.00 },
  'claude-haiku-4-5-20251001':    { in: 0.80, out:  4.00 },
  'claude-sonnet-4-20250514':     { in: 3.00, out: 15.00 },
  'claude-opus-4-5':              { in: 15.0, out: 75.00 }
};
const DEFAULT_PRICING = { in: 3.00, out: 15.00 };

function priceFor(model) {
  return PRICING[model] || DEFAULT_PRICING;
}

function estimateUsd(model, maxIn, maxOut) {
  const p = priceFor(model);
  return ((maxIn * p.in) + (maxOut * p.out)) / 1_000_000;
}

function actualUsd(model, tokensIn, tokensOut) {
  const p = priceFor(model);
  return ((tokensIn * p.in) + (tokensOut * p.out)) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Agent registry helpers
// ---------------------------------------------------------------------------
async function getAgent(supabase, slug) {
  const { data, error } = await supabase.from('agents').select('*').eq('slug', slug).maybeSingle();
  if (error) throw new Error(`agents lookup failed: ${error.message}`);
  return data || null;
}

async function listAgents(supabase) {
  const { data, error } = await supabase.from('agents').select('*').order('slug');
  if (error) throw new Error(`agents list failed: ${error.message}`);
  return data || [];
}

// ---------------------------------------------------------------------------
// Event bus
// ---------------------------------------------------------------------------
async function emitEvent(supabase, eventType, payload, source = null) {
  const { data, error } = await supabase
    .from('agent_events')
    .insert({ event_type: eventType, payload: payload || {}, source })
    .select('id')
    .single();
  if (error) throw new Error(`emitEvent failed: ${error.message}`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
async function logAction(supabase, {
  agentSlug, eventId = null, actionType, status = 'completed',
  autonomyUsed = null, decision = {}, reasoning = null, confidence = null,
  tokensIn = 0, tokensOut = 0, costUsd = 0, durationMs = 0,
  needsReview = false, errorMessage = null
}) {
  try {
    const { data, error } = await supabase.from('agent_actions').insert({
      agent_slug: agentSlug,
      event_id: eventId,
      action_type: actionType,
      status,
      autonomy_used: autonomyUsed,
      decision,
      reasoning,
      confidence,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd,
      duration_ms: durationMs,
      needs_review: needsReview,
      error_message: errorMessage
    }).select('id').single();
    if (error) {
      console.error(`[runtime] logAction error: ${error.message}`);
      return null;
    }
    return data.id;
  } catch (e) {
    console.error('[runtime] logAction crash:', e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------
async function saveMemory(supabase, agentSlug, kind, value, { key = null, expiresAt = null } = {}) {
  const row = { agent_slug: agentSlug, kind, key, value, expires_at: expiresAt };
  if (key) {
    const { error } = await supabase.from('agent_memory').upsert(row, { onConflict: 'agent_slug,kind,key' });
    if (error) throw new Error(`saveMemory upsert failed: ${error.message}`);
  } else {
    const { error } = await supabase.from('agent_memory').insert(row);
    if (error) throw new Error(`saveMemory insert failed: ${error.message}`);
  }
}

async function latestMemory(supabase, agentSlug, kind) {
  const { data, error } = await supabase
    .from('agent_memory')
    .select('*')
    .eq('agent_slug', agentSlug)
    .eq('kind', kind)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`latestMemory failed: ${error.message}`);
  return data || null;
}

// ---------------------------------------------------------------------------
// callLLM — the ONLY allowed path to Anthropic.
//   1. Reserve the estimated USD against today's cap (atomic via RPC)
//   2. Call Anthropic
//   3. Reconcile the reservation with the actual token usage
//   4. Return { text, tokensIn, tokensOut, costUsd, model }
// Throws SpendCapError if the cap would be exceeded.
// ---------------------------------------------------------------------------
class SpendCapError extends Error {
  constructor(slug, estimateUsd) {
    super(`Spend cap exceeded for agent "${slug}" (need $${estimateUsd.toFixed(4)}).`);
    this.name = 'SpendCapError';
    this.code = 'SPEND_CAP_EXCEEDED';
  }
}

async function callLLM(supabase, agent, { prompt, system = null, maxTokens = 1024, temperature = 0.7, expectedInputTokens = null }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const model = agent.model || 'claude-sonnet-4-5';
  const inEstimate = expectedInputTokens != null
    ? expectedInputTokens
    : Math.ceil((String(prompt).length + (system ? system.length : 0)) / 4); // ~4 chars/token
  const estimate = estimateUsd(model, inEstimate, maxTokens);

  // 1) reserve
  const { data: reserved, error: reserveErr } = await supabase.rpc('agent_try_spend', {
    p_agent_slug: agent.slug,
    p_estimate_usd: estimate
  });
  if (reserveErr) throw new Error(`agent_try_spend failed: ${reserveErr.message}`);
  if (reserved === false) throw new SpendCapError(agent.slug, estimate);

  // 2) call Anthropic
  let text = '', tokensIn = 0, tokensOut = 0, anthropicErr = null;
  try {
    const body = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: String(prompt) }]
    };
    if (system) body.system = system;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!r.ok) {
      anthropicErr = data?.error?.message || `Anthropic HTTP ${r.status}`;
    } else {
      text = data.content?.[0]?.text || '';
      tokensIn = data.usage?.input_tokens || 0;
      tokensOut = data.usage?.output_tokens || 0;
    }
  } catch (e) {
    anthropicErr = e.message;
  }

  // 3) reconcile (always — even on error use the estimate as actual so the cap is honored)
  const cost = anthropicErr ? estimate : actualUsd(model, tokensIn, tokensOut);
  await supabase.rpc('agent_reconcile_spend', {
    p_agent_slug: agent.slug,
    p_estimate_usd: estimate,
    p_actual_usd: cost
  });

  if (anthropicErr) throw new Error(`Anthropic call failed: ${anthropicErr}`);
  return { text, tokensIn, tokensOut, costUsd: cost, model };
}

// ---------------------------------------------------------------------------
// Autonomy resolver
//   - 'propose'    → never auto-execute; always needs_review = true
//   - 'assist'     → auto-execute if confidence >= threshold, else review
//   - 'autonomous' → auto-execute always
// ---------------------------------------------------------------------------
function resolveAutonomy(agent, { confidence = null, assistThreshold = 0.85 } = {}) {
  const mode = agent.autonomy || 'propose';
  if (mode === 'autonomous') return { autoExecute: true,  needsReview: false, autonomyUsed: 'autonomous' };
  if (mode === 'assist') {
    const ok = (confidence != null) && (confidence >= assistThreshold);
    return { autoExecute: ok, needsReview: !ok, autonomyUsed: 'assist' };
  }
  return   { autoExecute: false, needsReview: true,  autonomyUsed: 'propose' };
}

// ---------------------------------------------------------------------------
// Routing — given an event_type, find every enabled agent whose handles_events
// pattern matches. Patterns: exact match, '*' wildcard match-all, or
// 'namespace.*' prefix match.
// ---------------------------------------------------------------------------
function eventMatches(pattern, eventType) {
  if (!pattern) return false;
  if (pattern === '*') return true;
  if (pattern === eventType) return true;
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return eventType === prefix || eventType.startsWith(prefix + '.');
  }
  return false;
}

async function findHandlers(supabase, eventType) {
  const agents = await listAgents(supabase);
  return agents.filter(a =>
    a.enabled &&
    a.slug !== 'orchestrator' &&
    Array.isArray(a.handles_events) &&
    a.handles_events.some(p => eventMatches(p, eventType))
  );
}

module.exports = {
  getSupabase,
  authenticateAdmin,
  isScheduledInvocation,
  authorizeAgentInvocation,
  jsonResponse,
  getAgent,
  listAgents,
  emitEvent,
  logAction,
  saveMemory,
  latestMemory,
  callLLM,
  SpendCapError,
  resolveAutonomy,
  eventMatches,
  findHandlers,
  estimateUsd,
  actualUsd,
  PRICING
};

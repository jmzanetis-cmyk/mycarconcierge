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
// field. The body shape is by itself spoofable, so we treat it as a *signal*,
// not as proof. Real defense lives in `authorizeAgentInvocation` (combination
// of signals) and in `assertRateLimit` (DB-backed cooldown that makes spam
// useless even if a caller spoofs the body).
function isScheduledInvocation(event) {
  if (!event || !event.body) return false;
  try {
    const b = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    return !!(b && typeof b === 'object' && b.next_run);
  } catch {
    return false;
  }
}

// Returns one of: 'admin', 'scheduled', null.
//   - 'admin'     : valid x-admin-password header.
//   - 'scheduled' : a real Netlify Scheduled Function invocation. These are
//                   NOT HTTP requests — Netlify's runtime invokes the handler
//                   directly with a synthetic event that has no `httpMethod`.
//                   Public callers always go through the HTTPS edge, which
//                   sets `httpMethod`. The presence/absence of `httpMethod`
//                   is therefore an unspoofable signal: an external caller
//                   cannot strip it once the request reaches our handler.
//                   We additionally require the scheduled body shape to
//                   reject any future runtime quirks.
//   - null        : reject (HTTP without admin auth, or scheduled-shape spam).
function authorizeAgentInvocation(event) {
  if (authenticateAdmin(event)) return 'admin';
  const headers = event.headers || {};
  const hasAnyAdminHeader = !!(headers['x-admin-password'] || headers['X-Admin-Password']);
  if (hasAnyAdminHeader) return null; // bad password -> reject
  // Unspoofable: a real Netlify scheduled invocation has no httpMethod.
  if (!event.httpMethod && isScheduledInvocation(event)) return 'scheduled';
  return null;
}

// DB-backed cooldown. Records the last successful invocation per agent slug
// in agent_memory; returns false (and logs nothing) if the previous tick was
// too recent. This caps runaway cost to at most one Claude call per cooldown
// window even if an attacker bypasses authorizeAgentInvocation.
async function assertRateLimit(supabase, slug, minSeconds) {
  const key = `last_run_at`;
  const { data } = await supabase.from('agent_memory')
    .select('value, created_at')
    .eq('agent_slug', slug).eq('kind', 'rate_limit').eq('key', key)
    .maybeSingle();
  const last = data?.value?.ts ? new Date(data.value.ts).getTime() : 0;
  const now = Date.now();
  if (last && (now - last) < minSeconds * 1000) {
    return { allowed: false, retry_in_s: Math.ceil(minSeconds - (now - last) / 1000) };
  }
  // Upsert immediately so concurrent calls in the same window are blocked.
  await supabase.from('agent_memory').upsert({
    agent_slug: slug, kind: 'rate_limit', key,
    value: { ts: new Date(now).toISOString() }
  }, { onConflict: 'agent_slug,kind,key' });
  return { allowed: true };
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

// ---------------------------------------------------------------------------
// notifySpendCapBreach — record + email exactly once per agent per UTC day.
//   - Idempotent via (agent_slug, day) PK on agent_spend_alerts.
//   - Emails ADMIN_EMAIL via Resend if RESEND_API_KEY is configured;
//     swallows email errors (the row is the source of truth for "alerted").
//   - Never throws — caller's failure path must remain the SpendCapError.
// ---------------------------------------------------------------------------
async function notifySpendCapBreach(supabase, { slug, capUsd, estimateUsd }) {
  if (!supabase) return { sent: false, reason: 'no_supabase' };
  const today = new Date().toISOString().split('T')[0];

  // Read current spend so the alert row has useful debugging context.
  let reservedUsd = null, actualUsd = null;
  try {
    const { data } = await supabase
      .from('agent_daily_spend')
      .select('reserved_usd, actual_usd')
      .eq('agent_slug', slug).eq('day', today)
      .maybeSingle();
    if (data) { reservedUsd = data.reserved_usd; actualUsd = data.actual_usd; }
  } catch (_) { /* non-fatal */ }

  // Insert dedupe row. ON CONFLICT DO NOTHING means "already alerted today".
  const { data: inserted, error: insertErr } = await supabase
    .from('agent_spend_alerts')
    .upsert(
      {
        agent_slug: slug,
        day: today,
        cap_usd: capUsd,
        estimate_usd: estimateUsd,
        reserved_usd: reservedUsd,
        actual_usd: actualUsd,
        notified_at: new Date().toISOString(),
        email_sent: false
      },
      { onConflict: 'agent_slug,day', ignoreDuplicates: true }
    )
    .select('agent_slug')
    .maybeSingle();

  if (insertErr) {
    console.error('[runtime] spend-alert upsert failed:', insertErr.message);
    return { sent: false, reason: 'db_error' };
  }
  if (!inserted) {
    // Row already existed → already alerted today, nothing more to do.
    return { sent: false, reason: 'already_alerted' };
  }

  // First breach today — send the admin email if Resend is wired up.
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.ADMIN_EMAIL || process.env.MCC_FROM_EMAIL;
  const fromEmail = process.env.MCC_FROM_EMAIL || 'no-reply@mycarconcierge.com';
  if (!apiKey || !toEmail) {
    return { sent: false, reason: 'email_not_configured' };
  }

  try {
    const subject = `[MCC Agent Fleet] Spend cap reached — ${slug}`;
    const html = `
      <h2>Agent spend cap breached</h2>
      <p><strong>Agent:</strong> ${slug}</p>
      <p><strong>Day (UTC):</strong> ${today}</p>
      <p><strong>Daily cap:</strong> $${Number(capUsd).toFixed(4)}</p>
      <p><strong>Reserved so far:</strong> $${reservedUsd != null ? Number(reservedUsd).toFixed(6) : '—'}</p>
      <p><strong>Actual so far:</strong> $${actualUsd != null ? Number(actualUsd).toFixed(6) : '—'}</p>
      <p><strong>Last call estimate (rejected):</strong> $${Number(estimateUsd).toFixed(6)}</p>
      <p>The agent will continue rejecting LLM calls until 00:00 UTC. To raise the cap, edit the registry at <code>/admin/agent-fleet.html</code>.</p>
    `;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: fromEmail, to: toEmail, subject, html })
    });
    if (!r.ok) {
      const txt = await r.text();
      await supabase.from('agent_spend_alerts').update({ email_error: `Resend ${r.status}: ${txt.slice(0,200)}` })
        .eq('agent_slug', slug).eq('day', today);
      return { sent: false, reason: 'resend_error' };
    }
    await supabase.from('agent_spend_alerts').update({ email_sent: true })
      .eq('agent_slug', slug).eq('day', today);
    return { sent: true };
  } catch (e) {
    console.error('[runtime] spend-alert email crashed:', e.message);
    try {
      await supabase.from('agent_spend_alerts').update({ email_error: e.message.slice(0, 200) })
        .eq('agent_slug', slug).eq('day', today);
    } catch (_) { /* swallow */ }
    return { sent: false, reason: 'exception' };
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
  if (reserved === false) {
    // Fire-and-forget alert (idempotent per agent per UTC day). Never throws.
    notifySpendCapBreach(supabase, {
      slug: agent.slug,
      capUsd: agent.daily_spend_cap_usd,
      estimateUsd: estimate
    }).catch(e => console.error('[runtime] notifySpendCapBreach crash:', e.message));
    throw new SpendCapError(agent.slug, estimate);
  }

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
  assertRateLimit,
  jsonResponse,
  getAgent,
  listAgents,
  emitEvent,
  logAction,
  saveMemory,
  latestMemory,
  callLLM,
  SpendCapError,
  notifySpendCapBreach,
  resolveAutonomy,
  eventMatches,
  findHandlers,
  estimateUsd,
  actualUsd,
  PRICING
};

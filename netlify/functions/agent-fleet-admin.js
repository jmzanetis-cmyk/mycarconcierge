// ============================================================================
// MCC Agent Fleet — Admin API
// All routes are admin-auth gated (x-admin-password header).
//
// Routes (mounted via netlify.toml redirect /api/admin/agent-fleet/* → here):
//   GET  /agents                         — list registry rows + today's spend
//   PUT  /agents/:slug                   — { enabled?, autonomy?, daily_spend_cap_usd?, model? }
//   GET  /actions?limit=50&offset=0&agent=&status=&review_only=1
//   POST /actions/:id/review             — { decision: 'approved'|'rejected'|'executed'|'dismissed', notes? }
//   GET  /spend                          — today + last 7 days per agent
//   GET  /briefing                       — latest analyst briefing
//   POST /test-event                     — { event_type, payload? } emits a synthetic event
//   POST /run/orchestrator               — fire orchestrator tick now
//   POST /run/analyst                    — run analyst now
//   GET  /dead-letter?limit=50&offset=0&open=1   — list DLQ entries
//   POST /dead-letter/:id/replay         — re-emit the event (attempts=0)
//   GET  /spend-alerts?days=7            — recent spend-cap breach alerts
// ============================================================================

const {
  getSupabase, authenticateAdmin, jsonResponse, listAgents, emitEvent
} = require('./agent-fleet-runtime');

const ALLOWED_AUTONOMY = new Set(['propose','assist','autonomous']);

function siteBaseUrl(event) {
  return process.env.URL
    || process.env.DEPLOY_PRIME_URL
    || (event && event.headers && event.headers.host
          ? `https://${event.headers.host}`
          : 'https://mycarconcierge.com');
}

function parsePath(event) {
  // Netlify may pass either the rewritten internal path
  //   /.netlify/functions/agent-fleet-admin/<route>
  // or the original public path
  //   /api/admin/agent-fleet/<route>
  // depending on how the request was routed. Strip both prefixes.
  const raw = event.path || '';
  return raw
    .replace(/^\/?\.netlify\/functions\/agent-fleet-admin\/?/, '')
    .replace(/^\/api\/admin\/agent-fleet\/?/, '')
    .replace(/^\/+|\/+$/g, '');
}

async function listAgentsWithSpend(supabase) {
  const today = new Date().toISOString().split('T')[0];
  const [agentsRes, spendRes] = await Promise.all([
    supabase.from('agents').select('*').order('slug'),
    supabase.from('agent_daily_spend').select('*').eq('day', today)
  ]);
  if (agentsRes.error) throw new Error(agentsRes.error.message);
  const spendBySlug = {};
  for (const s of (spendRes.data || [])) spendBySlug[s.agent_slug] = s;
  return (agentsRes.data || []).map(a => ({
    ...a,
    today_spend: spendBySlug[a.slug] || { reserved_usd: 0, actual_usd: 0, call_count: 0 }
  }));
}

async function updateAgent(supabase, slug, body) {
  const patch = {};
  if (typeof body.enabled === 'boolean')                    patch.enabled = body.enabled;
  if (body.autonomy && ALLOWED_AUTONOMY.has(body.autonomy)) patch.autonomy = body.autonomy;
  if (typeof body.daily_spend_cap_usd === 'number' && body.daily_spend_cap_usd >= 0) {
    patch.daily_spend_cap_usd = body.daily_spend_cap_usd;
  }
  if (typeof body.model === 'string' && body.model.trim()) patch.model = body.model.trim();
  if (Object.keys(patch).length === 0) return { error: 'No valid fields to update' };
  patch.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('agents').update(patch).eq('slug', slug).select('*').single();
  if (error) return { error: error.message };
  return { agent: data };
}

async function listActions(supabase, { limit = 50, offset = 0, agent = null, status = null, reviewOnly = false }) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  let q = supabase.from('agent_actions')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(off, off + lim - 1);
  if (agent)  q = q.eq('agent_slug', agent);
  if (status) q = q.eq('status', status);
  if (reviewOnly) q = q.eq('needs_review', true).is('reviewed_at', null);
  const { data, count, error } = await q;
  if (error) throw new Error(error.message);
  return { actions: data || [], total: count || 0, limit: lim, offset: off };
}

async function reviewAction(supabase, id, body) {
  const allowed = new Set(['approved','rejected','executed','dismissed']);
  if (!allowed.has(body.decision)) return { error: 'Invalid decision' };
  const { data, error } = await supabase.from('agent_actions').update({
    reviewed_at: new Date().toISOString(),
    reviewed_by: 'admin',
    review_status: body.decision,
    review_notes: body.notes || null,
    needs_review: false
  }).eq('id', id).select('*').single();
  if (error) return { error: error.message };
  return { action: data };
}

async function spendRollup(supabase) {
  const today = new Date();
  const startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startStr = startDate.toISOString().split('T')[0];
  const [agentsRes, spendRes] = await Promise.all([
    supabase.from('agents').select('slug,display_name,daily_spend_cap_usd,enabled').order('slug'),
    supabase.from('agent_daily_spend').select('*').gte('day', startStr).order('day', { ascending: true })
  ]);
  if (agentsRes.error) throw new Error(agentsRes.error.message);
  if (spendRes.error)  throw new Error(spendRes.error.message);
  return { agents: agentsRes.data || [], days: spendRes.data || [] };
}

async function latestBriefing(supabase) {
  // Prefer the canonical 'latest' key written by the analyst on every run.
  let { data, error } = await supabase
    .from('agent_memory')
    .select('*')
    .eq('agent_slug', 'analyst')
    .eq('kind', 'briefing')
    .eq('key', 'latest')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data;
  // Fallback for legacy rows written before the 'latest' key existed.
  const fallback = await supabase
    .from('agent_memory')
    .select('*')
    .eq('agent_slug', 'analyst')
    .eq('kind', 'briefing')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fallback.error) throw new Error(fallback.error.message);
  return fallback.data;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, { ok: true });
  if (!authenticateAdmin(event)) return jsonResponse(401, { error: 'Unauthorized' });

  const supabase = getSupabase();
  if (!supabase) return jsonResponse(500, { error: 'Database not configured' });

  const route = parsePath(event);
  const method = event.httpMethod || 'GET';
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch { body = {}; }
  }
  const qs = event.queryStringParameters || {};

  try {
    // -------- agents
    if (route === 'agents' && method === 'GET') {
      const agents = await listAgentsWithSpend(supabase);
      return jsonResponse(200, { agents });
    }
    const agentMatch = route.match(/^agents\/([a-z0-9_-]+)$/i);
    if (agentMatch && method === 'PUT') {
      const r = await updateAgent(supabase, agentMatch[1], body);
      return jsonResponse(r.error ? 400 : 200, r);
    }

    // -------- actions
    if (route === 'actions' && method === 'GET') {
      const result = await listActions(supabase, {
        limit: qs.limit,
        offset: qs.offset,
        agent: qs.agent || null,
        status: qs.status || null,
        reviewOnly: qs.review_only === '1' || qs.review_only === 'true'
      });
      return jsonResponse(200, result);
    }
    const reviewMatch = route.match(/^actions\/(\d+)\/review$/);
    if (reviewMatch && method === 'POST') {
      const r = await reviewAction(supabase, parseInt(reviewMatch[1], 10), body);
      return jsonResponse(r.error ? 400 : 200, r);
    }

    // -------- spend
    if (route === 'spend' && method === 'GET') {
      return jsonResponse(200, await spendRollup(supabase));
    }

    // -------- briefing
    if (route === 'briefing' && method === 'GET') {
      const briefing = await latestBriefing(supabase);
      return jsonResponse(200, { briefing });
    }

    // -------- test-event
    if (route === 'test-event' && method === 'POST') {
      const eventType = (body.event_type || '').trim();
      if (!eventType) return jsonResponse(400, { error: 'event_type required' });
      const id = await emitEvent(supabase, eventType, body.payload || { test: true, ts: Date.now() }, 'admin:test');
      return jsonResponse(200, { event_id: id, event_type: eventType });
    }

    // -------- manual run: orchestrator
    if (route === 'run/orchestrator' && method === 'POST') {
      const baseUrl = siteBaseUrl(event);
      const r = await fetch(`${baseUrl}/.netlify/functions/agent-orchestrator`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-password': process.env.ADMIN_PASSWORD || ''
        },
        body: JSON.stringify({ source: 'admin' })
      });
      const text = await r.text();
      let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
      return jsonResponse(200, { ok: r.ok, status: r.status, result: parsed });
    }

    // -------- manual run: analyst
    if (route === 'run/analyst' && method === 'POST') {
      const baseUrl = siteBaseUrl(event);
      const r = await fetch(`${baseUrl}/.netlify/functions/agent-analyst`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-password': process.env.ADMIN_PASSWORD || ''
        },
        body: JSON.stringify({ source: 'admin' })
      });
      const text = await r.text();
      let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
      return jsonResponse(200, { ok: r.ok, status: r.status, result: parsed });
    }

    // -------- dead-letter queue
    if (route === 'dead-letter' && method === 'GET') {
      const lim = Math.min(Math.max(parseInt(qs.limit, 10) || 50, 1), 200);
      const off = Math.max(parseInt(qs.offset, 10) || 0, 0);
      const openOnly = qs.open === '1' || qs.open === 'true';
      let q = supabase.from('agent_dead_letter')
        .select('*', { count: 'exact' })
        .order('failed_at', { ascending: false })
        .range(off, off + lim - 1);
      if (openOnly) q = q.is('replayed_at', null);
      const { data, count, error } = await q;
      if (error) throw new Error(error.message);
      return jsonResponse(200, { entries: data || [], total: count || 0, limit: lim, offset: off });
    }
    const dlqReplayMatch = route.match(/^dead-letter\/(\d+)\/replay$/);
    if (dlqReplayMatch && method === 'POST') {
      const dlqId = parseInt(dlqReplayMatch[1], 10);
      const { data: entry, error: fetchErr } = await supabase
        .from('agent_dead_letter').select('*').eq('id', dlqId).maybeSingle();
      if (fetchErr) return jsonResponse(500, { error: fetchErr.message });
      if (!entry) return jsonResponse(404, { error: 'DLQ entry not found' });
      if (entry.replayed_at) return jsonResponse(400, { error: 'Already replayed', replay_event_id: entry.replay_event_id });
      const newId = await emitEvent(supabase, entry.event_type,
        entry.payload || {}, `dlq-replay:${dlqId}`);
      const { error: updErr } = await supabase.from('agent_dead_letter')
        .update({ replayed_at: new Date().toISOString(), replayed_by: 'admin', replay_event_id: newId })
        .eq('id', dlqId);
      if (updErr) return jsonResponse(500, { error: updErr.message });
      return jsonResponse(200, { ok: true, dlq_id: dlqId, replay_event_id: newId });
    }

    // -------- spend-cap alerts
    if (route === 'spend-alerts' && method === 'GET') {
      const days = Math.min(Math.max(parseInt(qs.days, 10) || 7, 1), 90);
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('agent_spend_alerts')
        .select('*')
        .gte('day', startDate)
        .order('notified_at', { ascending: false });
      if (error) throw new Error(error.message);
      return jsonResponse(200, { alerts: data || [], since: startDate });
    }

    return jsonResponse(404, { error: 'Not found', route });
  } catch (e) {
    console.error('[agent-fleet-admin] error:', e.message);
    return jsonResponse(500, { error: e.message });
  }
};

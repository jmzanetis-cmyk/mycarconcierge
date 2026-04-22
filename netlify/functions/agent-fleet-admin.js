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
  // The redirect rewrites /api/admin/agent-fleet/* → /.netlify/functions/agent-fleet-admin/:splat
  // event.path looks like "/.netlify/functions/agent-fleet-admin/agents"
  const p = event.path || '';
  const m = p.match(/agent-fleet-admin\/?(.*)$/);
  return (m ? m[1] : '').replace(/^\/+|\/+$/g, '');
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
  const { data, error } = await supabase
    .from('agent_memory')
    .select('*')
    .eq('agent_slug', 'analyst')
    .eq('kind', 'briefing')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
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

    return jsonResponse(404, { error: 'Not found', route });
  } catch (e) {
    console.error('[agent-fleet-admin] error:', e.message);
    return jsonResponse(500, { error: e.message });
  }
};

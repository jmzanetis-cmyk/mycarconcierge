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
//   GET  /events/timeseries?days=7&group_by=event_type|status — events per hour
//   GET  /memory?agent=slug&limit=20     — recent memory rows for one agent
//   GET  /agents/:slug/prompt            — active prompt override (or null)
//   GET  /agents/:slug/prompt-history    — list past prompt versions
//   POST /agents/:slug/prompt            — { body, notes? } new active version
//   POST /agents/:slug/prompt/:version/activate — rollback to that version
//   POST /actions/:id/apply              — execute the recommendation (Gatekeeper)
//   POST /providers/:id/suspend          — { reason } admin suspension; the
//                                          DB trigger emits provider.flagged
// ============================================================================

const {
  getSupabase, authenticateAdmin, jsonResponse, listAgents, emitEvent,
  sendSpendAlertEmail, clearPromptCache
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

// Apply a Gatekeeper review recommendation. Mutates profile.role based on
// the embedded decision and stamps the original action as 'executed'. Logs a
// follow-up agent_actions row for the audit trail.
async function applyAction(supabase, id) {
  const { data: action, error: aErr } = await supabase
    .from('agent_actions').select('*').eq('id', id).maybeSingle();
  if (aErr) return { error: aErr.message, status: 500 };
  if (!action) return { error: 'Action not found', status: 404 };
  if (action.agent_slug !== 'gatekeeper' || action.action_type !== 'review') {
    return { error: 'Apply only supported for Gatekeeper review actions in Phase 2', status: 400 };
  }
  if (action.review_status === 'executed') {
    return { error: 'Already executed', status: 409 };
  }
  let decision = action.decision;
  if (typeof decision === 'string') { try { decision = JSON.parse(decision); } catch { decision = {}; } }
  const rec = decision?.recommendation;
  const payload = decision?.payload || {};
  const providerId = payload.provider_id;
  if (!providerId) return { error: 'Action decision missing provider_id', status: 400 };
  if (!['approve','reject'].includes(rec)) {
    return { error: `Cannot apply recommendation "${rec}" — manual_review requires admin to suspend or unsuspend manually`, status: 400 };
  }
  const newRole = rec === 'approve' ? 'provider' : 'member';
  const { data: prof, error: pErr } = await supabase
    .from('profiles').select('id, role').eq('id', providerId).maybeSingle();
  if (pErr) return { error: pErr.message, status: 500 };
  if (!prof) return { error: 'Provider profile not found', status: 404 };

  const { error: upErr } = await supabase
    .from('profiles').update({ role: newRole }).eq('id', providerId);
  if (upErr) return { error: upErr.message, status: 500 };

  await supabase.from('agent_actions').update({
    review_status: 'executed',
    reviewed_at: new Date().toISOString(),
    reviewed_by: 'admin',
    needs_review: false
  }).eq('id', id);

  await supabase.from('agent_actions').insert({
    agent_slug: 'gatekeeper',
    action_type: 'apply',
    status: 'executed',
    autonomy_used: 'admin',
    decision: { applied_action_id: id, provider_id: providerId, prior_role: prof.role, new_role: newRole, recommendation: rec },
    reasoning: `Admin applied Gatekeeper recommendation "${rec}" — role ${prof.role} -> ${newRole}.`
  });

  return { ok: true, provider_id: providerId, prior_role: prof.role, new_role: newRole };
}

async function suspendProvider(supabase, providerId, body) {
  const reason = (body.reason || '').toString().slice(0, 500);
  const { data: prof, error: pErr } = await supabase
    .from('profiles').select('id, role').eq('id', providerId).maybeSingle();
  if (pErr) return { error: pErr.message, status: 500 };
  if (!prof) return { error: 'Provider profile not found', status: 404 };
  if (prof.role === 'suspended') return { error: 'Provider already suspended', status: 409 };

  const { error: upErr } = await supabase
    .from('profiles').update({ role: 'suspended' }).eq('id', providerId);
  if (upErr) return { error: upErr.message, status: 500 };

  await supabase.from('agent_actions').insert({
    agent_slug: 'gatekeeper',
    action_type: 'suspend',
    status: 'executed',
    autonomy_used: 'admin',
    decision: { provider_id: providerId, prior_role: prof.role, new_role: 'suspended', reason },
    reasoning: reason ? `Admin suspended provider: ${reason}` : 'Admin suspended provider (no reason given).'
  });

  return { ok: true, provider_id: providerId, prior_role: prof.role, new_role: 'suspended' };
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

    // Force a synthetic alert (testing). Body: { agent_slug }.
    // Wipes today's row for that agent first so the email actually fires.
    if (route === 'spend-alerts/test' && method === 'POST') {
      const slug = (body.agent_slug || '').trim();
      if (!slug) return jsonResponse(400, { error: 'agent_slug required' });
      const { data: agent, error: agentErr } = await supabase
        .from('agents').select('slug, daily_spend_cap_usd').eq('slug', slug).maybeSingle();
      if (agentErr) return jsonResponse(500, { error: agentErr.message });
      if (!agent)   return jsonResponse(404, { error: `Unknown agent: ${slug}` });

      const today = new Date().toISOString().split('T')[0];

      // Best-effort delete so the email path actually runs (vs. dedupe skip).
      await supabase.from('agent_spend_alerts')
        .delete().eq('agent_slug', slug).eq('day', today);

      const capUsd = Number(agent.daily_spend_cap_usd) || 0;
      const estimateUsd = capUsd > 0 ? capUsd * 0.01 : 0.001;

      // Pull today's spend if any so the test email has realistic numbers.
      let reservedUsd = null, actualUsd = null;
      const { data: spend } = await supabase
        .from('agent_daily_spend')
        .select('reserved_usd, actual_usd')
        .eq('agent_slug', slug).eq('day', today).maybeSingle();
      if (spend) { reservedUsd = spend.reserved_usd; actualUsd = spend.actual_usd; }

      const alertRow = {
        agent_slug: slug,
        day: today,
        cap_usd: capUsd,
        estimate_usd: estimateUsd,
        reserved_usd: reservedUsd,
        actual_usd: actualUsd,
        notified_at: new Date().toISOString(),
        email_sent: false
      };
      const { error: insErr } = await supabase
        .from('agent_spend_alerts').insert(alertRow);
      if (insErr) return jsonResponse(500, { error: insErr.message });

      const result = await sendSpendAlertEmail(supabase, alertRow);
      return jsonResponse(200, { ok: true, agent_slug: slug, day: today, email: result });
    }

    // Resend the email for a specific existing alert. Path: /spend-alerts/:slug/:day/resend
    const resendMatch = route.match(/^spend-alerts\/([a-z0-9_-]+)\/(\d{4}-\d{2}-\d{2})\/resend$/i);
    if (resendMatch && method === 'POST') {
      const [, slug, day] = resendMatch;
      const { data: alert, error: alertErr } = await supabase
        .from('agent_spend_alerts')
        .select('*').eq('agent_slug', slug).eq('day', day).maybeSingle();
      if (alertErr) return jsonResponse(500, { error: alertErr.message });
      if (!alert)   return jsonResponse(404, { error: 'Alert not found' });
      const result = await sendSpendAlertEmail(supabase, alert);
      return jsonResponse(result.sent ? 200 : 500, {
        ok: result.sent, agent_slug: slug, day, email: result
      });
    }

    // -------- events timeseries (per-hour bucketing for the events chart)
    if (route === 'events/timeseries' && method === 'GET') {
      const days = Math.min(Math.max(parseInt(qs.days, 10) || 7, 1), 30);
      const groupBy = qs.group_by === 'status' ? 'status' : 'event_type';
      const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
      const sinceIso = new Date(sinceMs).toISOString();
      const { data, error } = await supabase
        .from('agent_events')
        .select('created_at, event_type, processed_at, error, routed_to')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: true })
        .limit(20000);
      if (error) throw new Error(error.message);
      const bucketMs = 60 * 60 * 1000;
      const startBucket = Math.floor(sinceMs / bucketMs) * bucketMs;
      const endBucket   = Math.floor(Date.now() / bucketMs) * bucketMs;
      const buckets = [];
      for (let t = startBucket; t <= endBucket; t += bucketMs) buckets.push(new Date(t).toISOString());
      const seriesMap = {};
      const eventTypeCounts = {};
      function statusOf(row) {
        if (row.error) return 'errored';
        if (Array.isArray(row.routed_to) && row.routed_to.length === 0) return 'skipped';
        if (row.processed_at) return 'routed';
        return 'pending';
      }
      for (const row of (data || [])) {
        const t = new Date(row.created_at).getTime();
        const bucket = new Date(Math.floor(t / bucketMs) * bucketMs).toISOString();
        const key = groupBy === 'status' ? statusOf(row) : (row.event_type || 'unknown');
        if (groupBy === 'event_type') eventTypeCounts[key] = (eventTypeCounts[key] || 0) + 1;
        if (!seriesMap[key]) seriesMap[key] = {};
        seriesMap[key][bucket] = (seriesMap[key][bucket] || 0) + 1;
      }
      let seriesNames = Object.keys(seriesMap);
      if (groupBy === 'event_type' && seriesNames.length > 8) {
        const top = Object.entries(eventTypeCounts)
          .sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);
        const topSet = new Set(top);
        const collapsed = {};
        for (const k of seriesNames) {
          const dest = topSet.has(k) ? k : 'other';
          collapsed[dest] = collapsed[dest] || {};
          for (const [bucket, n] of Object.entries(seriesMap[k])) {
            collapsed[dest][bucket] = (collapsed[dest][bucket] || 0) + n;
          }
        }
        for (const k of Object.keys(seriesMap)) delete seriesMap[k];
        Object.assign(seriesMap, collapsed);
        seriesNames = Object.keys(seriesMap);
      }
      const series = seriesNames.sort().map(name => ({
        name,
        data: buckets.map(b => seriesMap[name][b] || 0)
      }));
      return jsonResponse(200, {
        days, group_by: groupBy, buckets, series, total: (data || []).length
      });
    }

    // -------- per-agent memory viewer
    if (route === 'memory' && method === 'GET') {
      const slug = (qs.agent || '').trim();
      if (!slug) return jsonResponse(400, { error: 'agent query param required' });
      const lim = Math.min(Math.max(parseInt(qs.limit, 10) || 20, 1), 100);
      const off = Math.max(parseInt(qs.offset, 10) || 0, 0);
      const { data, count, error } = await supabase
        .from('agent_memory')
        .select('*', { count: 'exact' })
        .eq('agent_slug', slug)
        .order('created_at', { ascending: false })
        .range(off, off + lim - 1);
      if (error) throw new Error(error.message);
      return jsonResponse(200, { rows: data || [], total: count || 0, limit: lim, offset: off });
    }

    const applyMatch = route.match(/^actions\/(\d+)\/apply$/);
    if (applyMatch && method === 'POST') {
      const r = await applyAction(supabase, parseInt(applyMatch[1], 10));
      if (r.error) return jsonResponse(r.status || 500, { error: r.error });
      return jsonResponse(200, r);
    }

    const suspendMatch = route.match(/^providers\/([0-9a-f-]+)\/suspend$/i);
    if (suspendMatch && method === 'POST') {
      const r = await suspendProvider(supabase, suspendMatch[1], body);
      if (r.error) return jsonResponse(r.status || 500, { error: r.error });
      return jsonResponse(200, r);
    }

    // -------- social acquisition (Hunter inbound + Promoter outbound)
    const SOCIAL_LEAD_STATUSES = ['pending','scored','approved','rejected','contacted'];
    const SOCIAL_POST_STATUSES = ['draft','approved','published','rejected'];

    if (route === 'social/leads' && method === 'GET') {
      const status = (qs.status || '').trim();
      if (status && !SOCIAL_LEAD_STATUSES.includes(status)) {
        return jsonResponse(400, { error: 'invalid status', allowed: SOCIAL_LEAD_STATUSES });
      }
      const lim = Math.min(Math.max(parseInt(qs.limit, 10) || 50, 1), 200);
      const off = Math.max(parseInt(qs.offset, 10) || 0, 0);
      let q = supabase.from('social_leads')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(off, off + lim - 1);
      if (status) q = q.eq('status', status);
      const { data, count, error } = await q;
      if (error) throw new Error(error.message);
      return jsonResponse(200, { rows: data || [], total: count || 0, limit: lim, offset: off });
    }

    const leadActionMatch = route.match(/^social\/leads\/(\d+)\/(approve|reject|contacted)$/);
    if (leadActionMatch && method === 'POST') {
      const id = parseInt(leadActionMatch[1], 10);
      const status = leadActionMatch[2] === 'approve' ? 'approved'
                   : leadActionMatch[2] === 'reject'  ? 'rejected'
                   : 'contacted';
      const { data, error } = await supabase.from('social_leads')
        .update({ status })
        .eq('id', id).select('*').single();
      if (error) return jsonResponse(404, { error: error.message });
      return jsonResponse(200, { lead: data });
    }

    if (route === 'social/posts' && method === 'GET') {
      const status = (qs.status || '').trim();
      if (status && !SOCIAL_POST_STATUSES.includes(status)) {
        return jsonResponse(400, { error: 'invalid status', allowed: SOCIAL_POST_STATUSES });
      }
      const lim = Math.min(Math.max(parseInt(qs.limit, 10) || 50, 1), 200);
      const off = Math.max(parseInt(qs.offset, 10) || 0, 0);
      let q = supabase.from('social_posts')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(off, off + lim - 1);
      if (status) q = q.eq('status', status);
      const { data, count, error } = await q;
      if (error) throw new Error(error.message);
      return jsonResponse(200, { rows: data || [], total: count || 0, limit: lim, offset: off });
    }

    const postActionMatch = route.match(/^social\/posts\/(\d+)\/(approve|reject|publish)$/);
    if (postActionMatch && method === 'POST') {
      const id = parseInt(postActionMatch[1], 10);
      const action = postActionMatch[2];

      const { data: post, error: loadErr } = await supabase
        .from('social_posts').select('*').eq('id', id).maybeSingle();
      if (loadErr) return jsonResponse(500, { error: loadErr.message });
      if (!post) return jsonResponse(404, { error: 'post not found' });

      if (action === 'reject') {
        // Race-safe: only reject from non-terminal, non-in-flight states.
        const { data, error } = await supabase.from('social_posts')
          .update({ status: 'rejected', reviewed_by: 'admin', reviewed_at: new Date().toISOString() })
          .eq('id', id).in('status', ['draft','approved'])
          .select('*').maybeSingle();
        if (error) return jsonResponse(500, { error: error.message });
        if (!data) return jsonResponse(409, { error: `cannot reject from current state (${post.status})` });
        return jsonResponse(200, { post: data });
      }

      if (action === 'approve') {
        // Race-safe: only approve from draft.
        const { data, error } = await supabase.from('social_posts')
          .update({ status: 'approved', reviewed_by: 'admin', reviewed_at: new Date().toISOString() })
          .eq('id', id).eq('status', 'draft')
          .select('*').maybeSingle();
        if (error) return jsonResponse(500, { error: error.message });
        if (!data) return jsonResponse(409, { error: `cannot approve from current state (${post.status})` });
        return jsonResponse(200, { post: data });
      }

      // publish — adapter dispatch.
      // Race-safe: we first flip status draft|approved -> publishing atomically via a
      // conditional UPDATE. If zero rows match, another request won the race (or the
      // post is in a terminal state). Only one caller ever reaches the adapter.
      if (post.status === 'published') return jsonResponse(409, { error: 'already published' });
      if (post.status === 'rejected')  return jsonResponse(409, { error: 'cannot publish a rejected draft' });
      if (post.status === 'publishing') return jsonResponse(409, { error: 'publish already in flight' });

      // Require a channel for platforms that address posts by account/subreddit.
      // Only Reddit truly needs a target subreddit today, but the same constraint
      // is safe for the other real adapters once they land.
      const PLATFORMS_REQUIRING_CHANNEL = ['reddit'];
      if (PLATFORMS_REQUIRING_CHANNEL.includes(post.platform) && !post.channel_id) {
        return jsonResponse(400, {
          error: `platform "${post.platform}" requires a channel — re-request the draft with a channel_id, or attach one before publishing`
        });
      }

      // Load the channel row (adapter needs the handle for Reddit).
      let channelRow = null;
      if (post.channel_id) {
        const { data: ch, error: chErr } = await supabase
          .from('social_channels').select('*').eq('id', post.channel_id).maybeSingle();
        if (chErr) return jsonResponse(500, { error: 'channel lookup failed: ' + chErr.message });
        channelRow = ch;
      }

      // Atomic claim: only the first caller sees >0 rows returned.
      const priorStatus = post.status; // 'draft' or 'approved'
      const { data: claimed, error: claimErr } = await supabase.from('social_posts')
        .update({ status: 'publishing' })
        .eq('id', id).eq('status', priorStatus)
        .select('id');
      if (claimErr) return jsonResponse(500, { error: 'claim failed: ' + claimErr.message });
      if (!claimed || claimed.length === 0) {
        return jsonResponse(409, { error: 'status changed under us — refresh and retry' });
      }

      let publishResult;
      try {
        const { getAdapter } = require('./social-adapters');
        const adapter = getAdapter(post.platform);
        publishResult = await adapter.publish({
          body: post.body,
          media_urls: post.media_urls || [],
          channel: channelRow
        });
      } catch (e) {
        // Roll the claim back so the post can be retried (or rejected).
        await supabase.from('social_posts')
          .update({ status: priorStatus })
          .eq('id', id).eq('status', 'publishing');
        return jsonResponse(502, { error: 'adapter_publish_failed: ' + e.message });
      }
      const { data, error } = await supabase.from('social_posts')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          external_post_id: publishResult?.external_post_id || null,
          reviewed_by: 'admin',
          reviewed_at: new Date().toISOString()
        })
        .eq('id', id).eq('status', 'publishing').select('*').single();
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, { post: data, publish: publishResult });
    }

    // Manual draft request — emits social.post_requested for Promoter.
    // When `variants` > 1, emits N events sharing a `variant_group` correlation
    // id so the operator can compare multiple drafts of the same brief side-by-side.
    if (route === 'social/request-draft' && method === 'POST') {
      const platform = (body.platform || '').toString();
      const audience = (body.audience || 'mixed').toString();
      const brief    = (body.brief || '').toString();
      let variants = parseInt(body.variants, 10);
      if (!Number.isFinite(variants) || variants < 1) variants = 1;
      if (variants > 10) variants = 10;
      if (!platform) return jsonResponse(400, { error: 'platform required' });

      const variantGroup = variants > 1
        ? `vg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        : null;

      const rows = [];
      for (let i = 0; i < variants; i++) {
        rows.push({
          event_type: 'social.post_requested',
          payload: {
            platform, audience, brief,
            channel_id: body.channel_id || null,
            variant_group: variantGroup,
            variant_index: variants > 1 ? i + 1 : null,
            variant_total: variants > 1 ? variants : null
          },
          source: 'admin-console'
        });
      }
      const { data, error } = await supabase
        .from('agent_events').insert(rows).select('id');
      if (error) return jsonResponse(500, { error: error.message });
      const ids = (data || []).map(r => r.id);
      return jsonResponse(200, {
        event_id: ids[0] || null,
        event_ids: ids,
        variants,
        variant_group: variantGroup
      });
    }

    // Inline-edit a draft. Race-safe: rejects if status is publishing/published.
    const postPatchMatch = route.match(/^social\/posts\/(\d+)$/);
    if (postPatchMatch && method === 'PATCH') {
      const id = parseInt(postPatchMatch[1], 10);
      const { data: cur, error: loadErr } = await supabase
        .from('social_posts').select('*').eq('id', id).maybeSingle();
      if (loadErr) return jsonResponse(500, { error: loadErr.message });
      if (!cur) return jsonResponse(404, { error: 'post not found' });
      if (cur.status === 'publishing' || cur.status === 'published') {
        return jsonResponse(409, { error: `cannot edit a ${cur.status} post` });
      }
      const patch = {};
      if (typeof body.body === 'string') {
        const trimmed = body.body.trim();
        if (!trimmed) return jsonResponse(400, { error: 'body cannot be empty' });
        if (trimmed.length > 4000) return jsonResponse(400, { error: 'body exceeds 4000 chars' });
        patch.body = trimmed;
      }
      if (['member','provider','mixed'].includes(body.audience)) patch.audience = body.audience;
      if (Array.isArray(body.media_urls)) patch.media_urls = body.media_urls.slice(0, 10);
      if (body.channel_id === null || Number.isInteger(body.channel_id)) patch.channel_id = body.channel_id;
      if (Object.keys(patch).length === 0) return jsonResponse(400, { error: 'no valid fields to update' });

      // Stamp the operator's review on every accepted edit — an edit is an
      // implicit review touch even if status doesn't change.
      patch.reviewed_by = 'admin';
      patch.reviewed_at = new Date().toISOString();

      // Atomic guard: only update rows still in draft|approved|rejected.
      const { data, error } = await supabase.from('social_posts')
        .update(patch).eq('id', id).in('status', ['draft','approved','rejected'])
        .select('*').single();
      if (error) {
        // PGRST116 = no rows returned by .single() — likely status raced.
        if (error.code === 'PGRST116') return jsonResponse(409, { error: 'status changed under us — refresh and retry' });
        return jsonResponse(500, { error: error.message });
      }
      return jsonResponse(200, { post: data });
    }

    // Channel CRUD (minimal — list + insert + toggle).
    if (route === 'social/channels' && method === 'GET') {
      const { data, error } = await supabase
        .from('social_channels').select('*').order('platform', { ascending: true });
      if (error) throw new Error(error.message);
      return jsonResponse(200, { rows: data || [] });
    }
    if (route === 'social/channels' && method === 'POST') {
      const platform = (body.platform || '').toString();
      const handle   = (body.handle || '').toString() || null;
      const keywords = Array.isArray(body.monitor_keywords) ? body.monitor_keywords : [];
      const audience = ['member','provider','both'].includes(body.monitor_audience) ? body.monitor_audience : 'both';
      if (!platform) return jsonResponse(400, { error: 'platform required' });
      const { data, error } = await supabase
        .from('social_channels')
        .insert({ platform, handle, monitor_keywords: keywords, monitor_audience: audience, enabled: !!body.enabled })
        .select('*').single();
      if (error) return jsonResponse(400, { error: error.message });
      return jsonResponse(200, { channel: data });
    }
    const channelToggleMatch = route.match(/^social\/channels\/(\d+)\/toggle$/);
    if (channelToggleMatch && method === 'POST') {
      const id = parseInt(channelToggleMatch[1], 10);
      const { data: cur } = await supabase.from('social_channels').select('enabled').eq('id', id).maybeSingle();
      if (!cur) return jsonResponse(404, { error: 'channel not found' });
      const { data, error } = await supabase.from('social_channels')
        .update({ enabled: !cur.enabled }).eq('id', id).select('*').single();
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, { channel: data });
    }

    const channelByIdMatch = route.match(/^social\/channels\/(\d+)$/);
    if (channelByIdMatch && method === 'PATCH') {
      const id = parseInt(channelByIdMatch[1], 10);
      const patch = {};
      if (typeof body.handle === 'string') patch.handle = body.handle.trim() || null;
      if (Array.isArray(body.monitor_keywords)) {
        patch.monitor_keywords = body.monitor_keywords
          .map(s => String(s).trim()).filter(Boolean).slice(0, 50);
      }
      if (['member','provider','both'].includes(body.monitor_audience)) {
        patch.monitor_audience = body.monitor_audience;
      }
      if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
      if (Object.keys(patch).length === 0) return jsonResponse(400, { error: 'no valid fields to update' });
      const { data, error } = await supabase.from('social_channels')
        .update(patch).eq('id', id).select('*').single();
      if (error) return jsonResponse(error.code === 'PGRST116' ? 404 : 400, { error: error.message });
      return jsonResponse(200, { channel: data });
    }

    if (channelByIdMatch && method === 'DELETE') {
      const id = parseInt(channelByIdMatch[1], 10);
      // FK on social_leads/social_posts is ON DELETE SET NULL — historical
      // rows survive but lose their channel pointer. That's intentional.
      const { error } = await supabase.from('social_channels').delete().eq('id', id);
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, { ok: true, id });
    }

    const channelRunMatch = route.match(/^social\/channels\/(\d+)\/run-monitor$/);
    if (channelRunMatch && method === 'POST') {
      const id = parseInt(channelRunMatch[1], 10);
      const { runOnce } = require('./social-monitor-scheduled');
      try {
        const summary = await runOnce(supabase, { channelId: id });
        if (!summary.channels) return jsonResponse(404, { error: 'channel not found' });
        return jsonResponse(200, { ok: true, summary });
      } catch (e) {
        return jsonResponse(500, { error: e.message });
      }
    }

    // -------- prompt versioning
    const promptGetMatch = route.match(/^agents\/([a-z0-9_-]+)\/prompt$/i);
    if (promptGetMatch && method === 'GET') {
      const slug = promptGetMatch[1];
      const { data, error } = await supabase
        .from('agent_prompt_versions')
        .select('*')
        .eq('agent_slug', slug)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return jsonResponse(200, { active: data || null });
    }

    const promptHistoryMatch = route.match(/^agents\/([a-z0-9_-]+)\/prompt-history$/i);
    if (promptHistoryMatch && method === 'GET') {
      const slug = promptHistoryMatch[1];
      const lim = Math.min(Math.max(parseInt(qs.limit, 10) || 20, 1), 100);
      const { data, error } = await supabase
        .from('agent_prompt_versions')
        .select('id, version, notes, is_active, created_at, created_by')
        .eq('agent_slug', slug)
        .order('version', { ascending: false })
        .limit(lim);
      if (error) throw new Error(error.message);
      return jsonResponse(200, { versions: data || [] });
    }

    if (promptGetMatch && method === 'POST') {
      const slug = promptGetMatch[1];
      const body_ = (body.body || '').toString();
      if (!body_.trim()) return jsonResponse(400, { error: 'body is required' });
      if (body_.length > 50000) return jsonResponse(400, { error: 'body exceeds 50,000 char limit' });
      const { data: agentRow, error: agentErr } = await supabase
        .from('agents').select('slug').eq('slug', slug).maybeSingle();
      if (agentErr) return jsonResponse(500, { error: agentErr.message });
      if (!agentRow) return jsonResponse(404, { error: 'Unknown agent: ' + slug });

      const { data: maxRow } = await supabase
        .from('agent_prompt_versions')
        .select('version')
        .eq('agent_slug', slug)
        .order('version', { ascending: false })
        .limit(1).maybeSingle();
      const nextVersion = (maxRow?.version || 0) + 1;

      // Deactivate the existing active row first (partial-unique index forbids two actives).
      const { error: deactErr } = await supabase
        .from('agent_prompt_versions')
        .update({ is_active: false })
        .eq('agent_slug', slug)
        .eq('is_active', true);
      if (deactErr) return jsonResponse(500, { error: deactErr.message });

      const { data: inserted, error: insErr } = await supabase
        .from('agent_prompt_versions')
        .insert({
          agent_slug: slug,
          version: nextVersion,
          body: body_,
          notes: (body.notes || '').toString().slice(0, 500) || null,
          is_active: true,
          created_by: 'admin'
        })
        .select('*').single();
      if (insErr) return jsonResponse(500, { error: insErr.message });
      try { clearPromptCache(slug); } catch (e) { /* warm cache only — ignore */ }
      return jsonResponse(200, { version: inserted });
    }

    const activateMatch = route.match(/^agents\/([a-z0-9_-]+)\/prompt\/(\d+)\/activate$/i);
    if (activateMatch && method === 'POST') {
      const slug = activateMatch[1];
      const version = parseInt(activateMatch[2], 10);
      const { data: target, error: tErr } = await supabase
        .from('agent_prompt_versions')
        .select('id').eq('agent_slug', slug).eq('version', version).maybeSingle();
      if (tErr) return jsonResponse(500, { error: tErr.message });
      if (!target) return jsonResponse(404, { error: 'Version not found' });

      const { error: deactErr } = await supabase
        .from('agent_prompt_versions')
        .update({ is_active: false })
        .eq('agent_slug', slug)
        .eq('is_active', true);
      if (deactErr) return jsonResponse(500, { error: deactErr.message });

      const { data: activated, error: actErr } = await supabase
        .from('agent_prompt_versions')
        .update({ is_active: true })
        .eq('id', target.id)
        .select('*').single();
      if (actErr) return jsonResponse(500, { error: actErr.message });
      try { clearPromptCache(slug); } catch (e) { /* ignore */ }
      return jsonResponse(200, { version: activated });
    }

    return jsonResponse(404, { error: 'Not found', route });
  } catch (e) {
    console.error('[agent-fleet-admin] error:', e.message);
    return jsonResponse(500, { error: e.message });
  }
};

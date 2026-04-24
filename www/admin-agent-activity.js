// ============================================================================
// MCC Admin — Agent Activity Helper (Task #139)
//
// Single shared module that renders a consistent "Agent Activity" panel
// inline in any admin section. Reads from BOTH:
//   - /api/admin/agent-fleet/actions/by-target  (new agent_actions table)
//   - /api/admin/ai-ops/actions?target_id=...   (older ai_action_log table)
//
// Public API:
//   window.renderAgentActivityPanel(containerId, options)
//
// options = {
//   targetId           : string (required when no agentSlug)
//   targetKind         : 'provider'|'application'|'social_lead'|'dispute'|'ticket'|'payment'|'any'
//   agentSlug          : string OR string[]   — fleet agent filter (when no targetId)
//   includeAiOpsModule : string|null          — also pull ai_action_log rows for this module
//   limit              : number (default 10)
//   title              : string (default 'Agent Activity')
//   showEmpty          : bool (default true)  — render empty-state vs hide
// }
// ============================================================================
(function () {
  function adminPw() {
    // Mirrors getAiOpsHeaders / safeFetch pattern in admin.js.
    return window.adminPasswordVerified
        || localStorage.getItem('mcc_admin_pass')
        || '';
  }

  function authHeaders() {
    const pw = adminPw();
    const h = { 'Accept': 'application/json' };
    if (pw) h['x-admin-password'] = pw;
    return h;
  }

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString() + ' ' +
             d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  function statusColor(status) {
    switch ((status || '').toLowerCase()) {
      case 'executed':
      case 'approved':
      case 'completed': return { bg: 'var(--accent-green, #10b981)', fg: '#fff' };
      case 'proposed':
      case 'pending':   return { bg: 'var(--accent-gold, #b8942d)', fg: '#fff' };
      case 'rejected':
      case 'dismissed':
      case 'error':
      case 'errored':   return { bg: 'var(--accent-red, #c0392b)', fg: '#fff' };
      case 'skipped':   return { bg: 'var(--bg-tertiary, #2a2f37)', fg: 'var(--text-muted, #9ca3af)' };
      default:          return { bg: 'var(--bg-tertiary, #2a2f37)', fg: 'var(--text-primary, #e5e7eb)' };
    }
  }

  function confidenceBar(c) {
    if (c == null || isNaN(c)) return '';
    const pct = Math.round(Math.max(0, Math.min(1, Number(c))) * 100);
    const color = pct >= 90 ? '#10b981' : pct >= 70 ? '#b8942d' : '#c0392b';
    return `
      <div style="display:flex;align-items:center;gap:8px;font-size:0.78rem;color:var(--text-muted);">
        <span>Confidence</span>
        <div style="position:relative;flex:1;max-width:120px;height:6px;background:var(--bg-tertiary);border-radius:999px;overflow:hidden;">
          <div style="position:absolute;inset:0;width:${pct}%;background:${color};"></div>
        </div>
        <span style="color:${color};font-weight:600;">${pct}%</span>
      </div>`;
  }

  function recommendationLine(decision) {
    if (!decision || typeof decision !== 'object') return '';
    const rec = decision.recommendation || decision.lead_type || decision.action || null;
    if (!rec) return '';
    return `<div style="margin:8px 0;font-size:0.88rem;"><strong>Recommendation:</strong> <span style="color:var(--accent-blue, #3b82f6);">${esc(rec)}</span></div>`;
  }

  function decisionExtras(decision) {
    if (!decision || typeof decision !== 'object') return '';
    const bits = [];
    if (Array.isArray(decision.intent_signals) && decision.intent_signals.length) {
      bits.push(`<div style="margin-top:6px;"><strong>Intent signals:</strong> ${decision.intent_signals.map(esc).join(', ')}</div>`);
    }
    if (Array.isArray(decision.concerns) && decision.concerns.length) {
      bits.push(`<div style="margin-top:6px;"><strong>Concerns:</strong> ${decision.concerns.map(esc).join('; ')}</div>`);
    }
    if (decision.draft_outreach) {
      bits.push(`<div style="margin-top:6px;padding:8px;background:var(--bg-secondary, #1a1d23);border-radius:6px;font-style:italic;font-size:0.82rem;">"${esc(decision.draft_outreach)}"</div>`);
    }
    if (typeof decision.refund_amount_cents === 'number') {
      bits.push(`<div style="margin-top:6px;"><strong>Refund:</strong> $${(decision.refund_amount_cents / 100).toFixed(2)}</div>`);
    }
    return bits.length
      ? `<div style="font-size:0.82rem;color:var(--text-secondary);">${bits.join('')}</div>` : '';
  }

  function renderFleetCard(a) {
    const sc = statusColor(a.status);
    const reviewBadge = a.needs_review
      ? `<span style="background:var(--accent-gold, #b8942d);color:#fff;font-size:0.7rem;padding:2px 8px;border-radius:999px;margin-left:6px;">NEEDS REVIEW</span>`
      : '';
    const reviewedBadge = (a.reviewed_at && a.review_status)
      ? `<span style="background:var(--bg-tertiary);color:var(--text-muted);font-size:0.7rem;padding:2px 8px;border-radius:999px;margin-left:6px;">REVIEWED: ${esc(a.review_status)}</span>`
      : '';
    return `
      <div class="agent-activity-card" style="border:1px solid var(--border-subtle);border-left:3px solid #3b82f6;border-radius:10px;padding:14px;margin-bottom:10px;background:var(--bg-secondary, #1a1d23);">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="background:#3b82f6;color:#fff;font-size:0.7rem;padding:2px 8px;border-radius:999px;">FLEET</span>
            <strong style="font-family:monospace;font-size:0.85rem;">${esc(a.agent_slug)}</strong>
            <span style="color:var(--text-muted);font-size:0.82rem;">·</span>
            <span style="font-size:0.85rem;">${esc(a.action_type || '—')}</span>
            <span style="background:${sc.bg};color:${sc.fg};font-size:0.7rem;padding:2px 8px;border-radius:999px;">${esc(a.status || 'pending')}</span>
            ${reviewBadge}${reviewedBadge}
          </div>
          <span style="color:var(--text-muted);font-size:0.78rem;">${fmtTime(a.created_at)}</span>
        </div>
        ${recommendationLine(a.decision)}
        ${a.reasoning ? `<div style="font-size:0.86rem;color:var(--text-secondary);line-height:1.5;margin-bottom:6px;">${esc(a.reasoning)}</div>` : ''}
        ${decisionExtras(a.decision)}
        ${confidenceBar(a.confidence)}
        ${a.error_message ? `<div style="margin-top:6px;padding:6px 10px;background:rgba(192,57,43,0.1);color:var(--accent-red);border-radius:6px;font-size:0.8rem;">${esc(a.error_message)}</div>` : ''}
        <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:0.74rem;color:var(--text-muted);">
          <span>autonomy: ${esc(a.autonomy_used || '—')}</span>
          <span>cost: $${Number(a.cost_usd || 0).toFixed(4)} · ${a.duration_ms || 0}ms</span>
        </div>
      </div>`;
  }

  function renderLegacyCard(a) {
    const sc = statusColor(a.outcome);
    return `
      <div class="agent-activity-card" style="border:1px solid var(--border-subtle);border-left:3px solid #7c3aed;border-radius:10px;padding:14px;margin-bottom:10px;background:var(--bg-secondary, #1a1d23);">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="background:#7c3aed;color:#fff;font-size:0.7rem;padding:2px 8px;border-radius:999px;">AI OPS</span>
            <strong style="font-family:monospace;font-size:0.85rem;">${esc(a.module || '—')}</strong>
            <span style="color:var(--text-muted);font-size:0.82rem;">·</span>
            <span style="font-size:0.85rem;">${esc(a.action_type || '—')}</span>
            <span style="background:${sc.bg};color:${sc.fg};font-size:0.7rem;padding:2px 8px;border-radius:999px;">${esc(a.outcome || 'pending')}</span>
            ${a.auto_executed ? '<span style="background:var(--accent-green);color:#fff;font-size:0.7rem;padding:2px 8px;border-radius:999px;">AUTO</span>' : ''}
            ${a.escalated ? '<span style="background:var(--accent-gold);color:#fff;font-size:0.7rem;padding:2px 8px;border-radius:999px;">ESCALATED</span>' : ''}
          </div>
          <span style="color:var(--text-muted);font-size:0.78rem;">${fmtTime(a.created_at)}</span>
        </div>
        ${recommendationLine(a.decision)}
        ${a.decision && a.decision.reasoning ? `<div style="font-size:0.86rem;color:var(--text-secondary);line-height:1.5;margin-bottom:6px;">${esc(a.decision.reasoning)}</div>` : ''}
        ${decisionExtras(a.decision)}
        ${confidenceBar(a.confidence)}
        ${a.error_details ? `<div style="margin-top:6px;padding:6px 10px;background:rgba(192,57,43,0.1);color:var(--accent-red);border-radius:6px;font-size:0.8rem;">${esc(a.error_details)}</div>` : ''}
      </div>`;
  }

  async function fetchFleet(opts) {
    const apiBase = (window.MCC_CONFIG && window.MCC_CONFIG.apiBaseUrl) || '';
    const params = new URLSearchParams();
    params.set('limit', String(opts.limit || 10));
    if (opts.targetId) {
      params.set('target_id', opts.targetId);
      if (opts.targetKind) params.set('target_kind', opts.targetKind);
      if (opts.agentSlug && typeof opts.agentSlug === 'string') params.set('agent', opts.agentSlug);
      const r = await fetch(`${apiBase}/api/admin/agent-fleet/actions/by-target?${params}`, { headers: authHeaders() });
      if (!r.ok) return [];
      const j = await r.json();
      return j.actions || [];
    }
    // No targetId — pull recent actions, optionally filtered by agentSlug.
    if (opts.agentSlug && Array.isArray(opts.agentSlug)) {
      // Fetch per slug and merge (server endpoint only supports single agent filter).
      const all = await Promise.all(opts.agentSlug.map(async (slug) => {
        const p = new URLSearchParams({ limit: String(opts.limit || 10), agent: slug });
        const r = await fetch(`${apiBase}/api/admin/agent-fleet/actions?${p}`, { headers: authHeaders() });
        if (!r.ok) return [];
        const j = await r.json();
        return j.actions || [];
      }));
      const merged = all.flat()
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, opts.limit || 10);
      return merged;
    }
    if (opts.agentSlug) params.set('agent', opts.agentSlug);
    const r = await fetch(`${apiBase}/api/admin/agent-fleet/actions?${params}`, { headers: authHeaders() });
    if (!r.ok) return [];
    const j = await r.json();
    return j.actions || [];
  }

  async function fetchLegacy(opts) {
    if (!opts.includeAiOpsModule) return [];
    const apiBase = (window.MCC_CONFIG && window.MCC_CONFIG.apiBaseUrl) || '';
    const params = new URLSearchParams({ limit: String(opts.limit || 10), module: opts.includeAiOpsModule });
    if (opts.targetId) params.set('target_id', opts.targetId);
    const r = await fetch(`${apiBase}/api/admin/ai-ops/actions?${params}`, { headers: authHeaders() });
    if (!r.ok) return [];
    const j = await r.json();
    return j.actions || [];
  }

  async function renderAgentActivityPanel(containerId, opts) {
    opts = opts || {};
    const container = document.getElementById(containerId);
    if (!container) return;
    const title = opts.title || 'Agent Activity';
    container.innerHTML = `
      <div class="agent-activity-panel" style="margin-top:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h4 style="margin:0;font-size:0.95rem;color:var(--text-primary);">${esc(title)}</h4>
          <span id="${containerId}-count" style="font-size:0.78rem;color:var(--text-muted);">Loading…</span>
        </div>
        <div id="${containerId}-body"></div>
      </div>`;
    const bodyEl = document.getElementById(containerId + '-body');
    const countEl = document.getElementById(containerId + '-count');

    try {
      const [fleet, legacy] = await Promise.all([fetchFleet(opts), fetchLegacy(opts)]);
      const merged = [
        ...fleet.map(a => ({ __src: 'fleet', __ts: a.created_at, row: a })),
        ...legacy.map(a => ({ __src: 'legacy', __ts: a.created_at, row: a }))
      ].sort((a, b) => new Date(b.__ts) - new Date(a.__ts))
       .slice(0, (opts.limit || 10) * 2);

      if (merged.length === 0) {
        if (opts.showEmpty === false) { container.innerHTML = ''; return; }
        bodyEl.innerHTML = `<div style="padding:18px;text-align:center;color:var(--text-muted);font-size:0.85rem;border:1px dashed var(--border-subtle);border-radius:8px;">No agent activity yet for this record.</div>`;
        countEl.textContent = '0 entries';
        return;
      }
      bodyEl.innerHTML = merged.map(m =>
        m.__src === 'fleet' ? renderFleetCard(m.row) : renderLegacyCard(m.row)
      ).join('');
      countEl.textContent = `${merged.length} ${merged.length === 1 ? 'entry' : 'entries'}`;
    } catch (e) {
      bodyEl.innerHTML = `<div style="padding:14px;color:var(--accent-red);font-size:0.85rem;">Failed to load agent activity: ${esc(e.message)}</div>`;
      countEl.textContent = '';
    }
  }

  window.renderAgentActivityPanel = renderAgentActivityPanel;
})();

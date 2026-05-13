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
  // Mirrors getAiOpsHeaders() in admin.js. Both x-admin-token (team-admin
  // session) and x-admin-password (single owner session) are validated
  // server-side against ADMIN_PASSWORD by agent-fleet-runtime.js and
  // ai-ops-admin.js authenticateAdmin (same pattern as admin-team.js).
  // We send whichever credentials are present — the helper does NOT assume
  // one stamps the other.
  function authHeaders() {
    const h = { 'Accept': 'application/json' };
    const token = window.adminTeamToken
               || localStorage.getItem('adminTeamToken')
               || '';
    if (token) h['x-admin-token'] = token;
    const pw = window.adminPasswordVerified
            || localStorage.getItem('mcc_admin_pass')
            || localStorage.getItem('adminPassword')
            || '';
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

  // ----- Details drawer (Task #144) ----------------------------------------
  // Built into every card. Reasoning + decision JSON are rendered from data we
  // already have (the list endpoint returns them). The "Source / Prompt"
  // section is lazy-loaded on first expand from the per-id detail endpoint.
  function drawerShell(src, id, reasoning, decision) {
    const reasoningBlock = reasoning
      ? `<div class="aap-drawer-section">
           <div class="aap-drawer-label">Full reasoning</div>
           <div class="aap-drawer-text">${esc(reasoning)}</div>
         </div>`
      : `<div class="aap-drawer-section">
           <div class="aap-drawer-label">Full reasoning</div>
           <div class="aap-drawer-empty">No reasoning recorded.</div>
         </div>`;
    let decisionPretty;
    try { decisionPretty = JSON.stringify(decision == null ? {} : decision, null, 2); }
    catch { decisionPretty = String(decision); }
    const decisionBlock = `
      <div class="aap-drawer-section">
        <div class="aap-drawer-label">Decision (JSON)</div>
        <pre class="aap-drawer-pre">${esc(decisionPretty)}</pre>
      </div>`;
    const sourceBlock = `
      <div class="aap-drawer-section" data-source-slot="1">
        <div class="aap-drawer-label">Source / prompt the agent ingested</div>
        <div class="aap-drawer-source aap-drawer-empty">Click "Show details" to load…</div>
      </div>`;
    return `
      <details class="agent-activity-details" data-src="${esc(src)}" data-id="${esc(String(id))}">
        <summary class="aap-drawer-summary">Show details</summary>
        <div class="aap-drawer-body">
          ${reasoningBlock}
          ${decisionBlock}
          ${sourceBlock}
        </div>
      </details>`;
  }

  // Build the inline action-button row for a fleet card. Approve / Reject
  // are shown for proposals still flagged needs_review (the same gate the
  // /admin/agent-fleet review queue uses). Replay is shown when the card's
  // event_id matches an open dead-letter row (replayed_at IS NULL).
  // All three call existing /admin/agent-fleet endpoints — see
  // netlify/functions/agent-fleet-admin.js.
  // Task #278 — decide whether an Approve click can ALSO call /apply in the
  // same flow. Mirrors the server-side guards in applyGatekeeperReview /
  // applyMatchmakerRank (netlify/functions/agent-fleet-admin.js):
  //   - Gatekeeper review:   recommendation must be 'approve' or 'reject'
  //                          (manual_review can't be auto-applied — admin
  //                          must suspend/unsuspend manually).
  //   - Matchmaker rank:     recommended_winner_bid_id must be non-null
  //                          (a null winner means no safe bid to accept).
  // Returns { applyable: boolean, reason: string } — `reason` is rendered
  // as a tooltip on the Approve button when applyable is false so the
  // admin understands why the one-click flow is unavailable for that card.
  function fleetApplyability(a) {
    let dec = a.decision;
    if (typeof dec === 'string') { try { dec = JSON.parse(dec); } catch { dec = {}; } }
    dec = dec || {};
    if (a.agent_slug === 'gatekeeper' && a.action_type === 'review') {
      const rec = dec.recommendation;
      if (rec === 'approve' || rec === 'reject') return { applyable: true, reason: '' };
      return { applyable: false,
        reason: `Manual review required — Gatekeeper recommendation "${rec || 'unknown'}" can't be auto-applied. Approve marks reviewed; suspend/unsuspend manually.` };
    }
    if (a.agent_slug === 'matchmaker' && a.action_type === 'rank') {
      if (dec.recommended_winner_bid_id) return { applyable: true, reason: '' };
      return { applyable: false,
        reason: 'No recommended winner — Matchmaker proposed null. Approve marks reviewed; re-list the auction or accept a bid manually.' };
    }
    // Other action types don't have an /apply path on the server.
    return { applyable: false, reason: '' };
  }

  function fleetActionButtons(a, dlqEntry) {
    const btns = [];
    const canReview = (a.status === 'proposed') && a.needs_review === true && !a.reviewed_at;
    if (canReview) {
      const { applyable, reason } = fleetApplyability(a);
      const approveLabel = applyable ? 'Approve &amp; Apply' : 'Approve';
      const approveAttrs = applyable
        ? ' data-aap-applyable="1" title="Approves the recommendation AND executes it server-side in one click."'
        : (reason ? ` title="${esc(reason)}"` : '');
      btns.push(`<button type="button" class="aap-action-btn aap-action-approve" data-aap-action="approve" data-aap-id="${esc(String(a.id))}"${approveAttrs}>${approveLabel}</button>`);
      btns.push(`<button type="button" class="aap-action-btn aap-action-reject" data-aap-action="reject" data-aap-id="${esc(String(a.id))}">Reject</button>`);
    }
    if (dlqEntry && dlqEntry.id != null) {
      btns.push(`<button type="button" class="aap-action-btn aap-action-replay" data-aap-action="replay" data-aap-dlq-id="${esc(String(dlqEntry.id))}">Replay</button>`);
    }
    if (!btns.length) return '';
    return `
      <div class="aap-action-row" data-aap-action-row="1">
        ${btns.join('')}
        <span class="aap-action-status" data-aap-status></span>
      </div>`;
  }

  function renderFleetCard(a, dlqByEventId) {
    const sc = statusColor(a.status);
    const reviewBadge = a.needs_review
      ? `<span style="background:var(--accent-gold, #b8942d);color:#fff;font-size:0.7rem;padding:2px 8px;border-radius:999px;margin-left:6px;">NEEDS REVIEW</span>`
      : '';
    const reviewedBadge = (a.reviewed_at && a.review_status)
      ? `<span style="background:var(--bg-tertiary);color:var(--text-muted);font-size:0.7rem;padding:2px 8px;border-radius:999px;margin-left:6px;">REVIEWED: ${esc(a.review_status)}</span>`
      : '';
    const dlqEntry = (dlqByEventId && a.event_id != null)
      ? dlqByEventId.get(String(a.event_id)) : null;
    const dlqBadge = dlqEntry
      ? `<span style="background:var(--accent-red, #c0392b);color:#fff;font-size:0.7rem;padding:2px 8px;border-radius:999px;margin-left:6px;">DEAD-LETTER</span>`
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
            ${reviewBadge}${reviewedBadge}${dlqBadge}
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
        ${fleetActionButtons(a, dlqEntry)}
        ${drawerShell('fleet', a.id, a.reasoning, a.decision)}
      </div>`;
  }

  function renderLegacyCard(a) {
    const sc = statusColor(a.outcome);
    const legacyReasoning = (a.decision && a.decision.reasoning) || '';
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
        ${legacyReasoning ? `<div style="font-size:0.86rem;color:var(--text-secondary);line-height:1.5;margin-bottom:6px;">${esc(legacyReasoning)}</div>` : ''}
        ${decisionExtras(a.decision)}
        ${confidenceBar(a.confidence)}
        ${a.error_details ? `<div style="margin-top:6px;padding:6px 10px;background:rgba(192,57,43,0.1);color:var(--accent-red);border-radius:6px;font-size:0.8rem;">${esc(a.error_details)}</div>` : ''}
        ${drawerShell('legacy', a.id, legacyReasoning, a.decision)}
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

  // ----- Per-card source/prompt loader (Task #144) -------------------------
  // Called on first expand of a card's <details> drawer. Caches results on
  // the DOM node via data-loaded so re-toggling never refires the request.
  async function loadSourceForCard(detailsEl) {
    if (detailsEl.getAttribute('data-loaded') === '1') return;
    detailsEl.setAttribute('data-loaded', '1');
    const slot = detailsEl.querySelector('.aap-drawer-source');
    if (!slot) return;
    slot.classList.remove('aap-drawer-empty');
    slot.innerHTML = '<span style="color:var(--text-muted);font-size:0.82rem;">Loading…</span>';
    const src = detailsEl.getAttribute('data-src');
    const id  = detailsEl.getAttribute('data-id');
    const apiBase = (window.MCC_CONFIG && window.MCC_CONFIG.apiBaseUrl) || '';
    const url = src === 'fleet'
      ? `${apiBase}/api/admin/agent-fleet/actions/${encodeURIComponent(id)}`
      : `${apiBase}/api/admin/ai-ops/actions/${encodeURIComponent(id)}`;
    try {
      const r = await fetch(url, { headers: authHeaders() });
      if (!r.ok) {
        slot.innerHTML = `<div class="aap-drawer-empty">Could not load source (HTTP ${r.status}).</div>`;
        return;
      }
      const j = await r.json();
      // Fleet detail returns { action, event } where event.payload is the
      // raw event the agent ingested. Legacy returns { action } with no
      // separate source — surface that explicitly so operators don't think
      // it's a bug.
      if (src === 'fleet') {
        const ev = j.event;
        if (!ev) {
          slot.innerHTML = '<div class="aap-drawer-empty">No originating event payload was recorded for this action.</div>';
          return;
        }
        let payloadPretty;
        try { payloadPretty = JSON.stringify(ev.payload == null ? {} : ev.payload, null, 2); }
        catch { payloadPretty = String(ev.payload); }
        slot.innerHTML = `
          <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:6px;">
            event #${esc(String(ev.id))} · <strong>${esc(ev.event_type || '—')}</strong>
            ${ev.source ? ` · source: ${esc(ev.source)}` : ''}
            · ${esc(fmtTime(ev.created_at))}
          </div>
          <pre class="aap-drawer-pre">${esc(payloadPretty)}</pre>`;
      } else {
        // ai_action_log has no separate event — the inputs the agent saw are
        // captured (when at all) in `decision`. Show a clear note + the
        // target_id for cross-reference.
        const a = j.action || {};
        slot.innerHTML = `
          <div class="aap-drawer-empty" style="margin-bottom:6px;">
            Legacy AI Ops actions don't capture a separate prompt. The full
            decision JSON above is the agent's complete record.
          </div>
          <div style="font-size:0.78rem;color:var(--text-muted);">
            target_id: <code>${esc(a.target_id || '—')}</code>
            · execution: ${esc(String(a.execution_time_ms || 0))}ms
          </div>`;
      }
    } catch (e) {
      slot.innerHTML = `<div class="aap-drawer-empty">Failed to load source: ${esc(e.message)}</div>`;
    }
  }

  // Pull open dead-letter rows for ONLY the event_ids attached to the
  // fleet cards we're about to render. This makes Replay-button eligibility
  // deterministic regardless of how big the global DLQ backlog is — a card
  // tied to event #500 is found even if the most recent 200 DLQ rows are
  // all newer. Returns a Map<event_id, dlqRow>. Failure is non-fatal
  // (cards still render, we just don't show Replay buttons).
  async function fetchOpenDeadLetter(eventIds) {
    if (!eventIds || !eventIds.length) return new Map();
    // Cap matches the server-side cap on the event_ids filter.
    const ids = eventIds.slice(0, 200).join(',');
    const apiBase = (window.MCC_CONFIG && window.MCC_CONFIG.apiBaseUrl) || '';
    try {
      const r = await fetch(
        `${apiBase}/api/admin/agent-fleet/dead-letter?open=1&limit=200&event_ids=${encodeURIComponent(ids)}`,
        { headers: authHeaders() });
      if (!r.ok) return new Map();
      const j = await r.json();
      const map = new Map();
      for (const entry of (j.entries || [])) {
        if (entry && entry.event_id != null && entry.replayed_at == null) {
          map.set(String(entry.event_id), entry);
        }
      }
      return map;
    } catch { return new Map(); }
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

  // ----- One-time CSS injection for the drawer (Task #144) -----------------
  // Idempotent: re-rendering the panel never duplicates the <style> tag.
  function ensureDrawerStyles() {
    if (document.getElementById('agent-activity-drawer-styles')) return;
    const style = document.createElement('style');
    style.id = 'agent-activity-drawer-styles';
    style.textContent = `
      .agent-activity-details { margin-top: 10px; border-top: 1px dashed var(--border-subtle, #2a2f37); padding-top: 8px; }
      .agent-activity-details > .aap-drawer-summary {
        cursor: pointer; user-select: none;
        font-size: 0.78rem; color: var(--accent-blue, #3b82f6); font-weight: 600;
        list-style: none; padding: 4px 0; outline: none;
      }
      .agent-activity-details > .aap-drawer-summary::-webkit-details-marker { display: none; }
      .agent-activity-details > .aap-drawer-summary::before { content: '▸ '; display: inline-block; transition: transform 0.15s ease; }
      .agent-activity-details[open] > .aap-drawer-summary::before { content: '▾ '; }
      .agent-activity-details[open] > .aap-drawer-summary { color: var(--text-primary, #e5e7eb); }
      .aap-drawer-body { margin-top: 8px; display: flex; flex-direction: column; gap: 10px; }
      .aap-drawer-section { background: var(--bg-tertiary, #2a2f37); border-radius: 6px; padding: 8px 10px; }
      .aap-drawer-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted, #9ca3af); margin-bottom: 4px; font-weight: 600; }
      .aap-drawer-text { font-size: 0.84rem; color: var(--text-primary, #e5e7eb); white-space: pre-wrap; line-height: 1.5; }
      .aap-drawer-pre {
        margin: 0; font-size: 0.76rem; line-height: 1.4;
        color: var(--text-primary, #e5e7eb);
        background: var(--bg-primary, #0f1115);
        border: 1px solid var(--border-subtle, #2a2f37);
        border-radius: 4px; padding: 8px;
        max-height: 320px; overflow: auto; white-space: pre;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      .aap-drawer-empty { font-size: 0.8rem; color: var(--text-muted, #9ca3af); font-style: italic; }
      .aap-action-row {
        display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
        margin-top: 10px; padding-top: 8px;
        border-top: 1px dashed var(--border-subtle, #2a2f37);
      }
      .aap-action-btn {
        font-size: 0.78rem; font-weight: 600;
        padding: 5px 12px; border-radius: 6px; cursor: pointer;
        border: 1px solid transparent; color: #fff;
        transition: opacity 0.12s ease, filter 0.12s ease;
      }
      .aap-action-btn:hover:not(:disabled) { filter: brightness(1.1); }
      .aap-action-btn:disabled { opacity: 0.55; cursor: not-allowed; }
      .aap-action-approve { background: var(--accent-green, #10b981); }
      .aap-action-reject  { background: var(--accent-red, #c0392b); }
      .aap-action-replay  { background: var(--accent-blue, #3b82f6); }
      .aap-action-status {
        font-size: 0.78rem; color: var(--text-muted, #9ca3af);
        margin-left: 4px;
      }
      .aap-action-status[data-aap-state="error"]   { color: var(--accent-red, #c0392b); }
      .aap-action-status[data-aap-state="success"] { color: var(--accent-green, #10b981); }
    `;
    document.head.appendChild(style);
  }

  // Lazy-load the source/prompt section the first time a card's drawer is
  // expanded. Bound once per panel container via event delegation so we don't
  // leak listeners across re-renders.
  function bindDrawerToggles(rootEl) {
    if (!rootEl || rootEl.__aapBound) return;
    rootEl.__aapBound = true;
    rootEl.addEventListener('toggle', (ev) => {
      const t = ev.target;
      if (!t || t.tagName !== 'DETAILS') return;
      if (!t.classList.contains('agent-activity-details')) return;
      if (t.open) loadSourceForCard(t);
    }, true); // capture phase — `toggle` does not bubble
  }

  // POST helper for the three review/replay endpoints. Returns
  // { ok, status, data } so callers can surface error messages from the
  // server without leaking exceptions through the click handler.
  async function postAction(url, body) {
    const apiBase = (window.MCC_CONFIG && window.MCC_CONFIG.apiBaseUrl) || '';
    const headers = Object.assign({ 'Content-Type': 'application/json' }, authHeaders());
    try {
      const r = await fetch(`${apiBase}${url}`, {
        method: 'POST',
        headers,
        body: body ? JSON.stringify(body) : '{}'
      });
      let data = null;
      try { data = await r.json(); } catch { /* non-JSON body — leave null */ }
      return { ok: r.ok, status: r.status, data };
    } catch (e) {
      return { ok: false, status: 0, data: { error: e.message || 'Network error' } };
    }
  }

  // Click delegation for Approve / Reject / Replay buttons. Bound once per
  // panel container alongside bindDrawerToggles. On success the panel is
  // re-rendered using the stored opts so the card reflects its new state
  // (review_status set, DLQ row replayed, etc.).
  function bindActionButtons(rootEl, containerId) {
    if (!rootEl || rootEl.__aapActionBound) return;
    rootEl.__aapActionBound = true;
    rootEl.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('button.aap-action-btn');
      if (!btn || !rootEl.contains(btn)) return;
      const action = btn.getAttribute('data-aap-action');
      if (!action) return;
      ev.preventDefault();

      const row = btn.closest('.aap-action-row');
      const statusEl = row ? row.querySelector('[data-aap-status]') : null;
      const allBtns = row ? Array.from(row.querySelectorAll('button.aap-action-btn')) : [btn];

      // Reject confirmation — Approve and Replay are non-destructive enough
      // to fire on the first click; Reject closes out the recommendation.
      if (action === 'reject' && !window.confirm('Reject this agent recommendation? It will be marked reviewed and removed from the queue.')) {
        return;
      }

      allBtns.forEach(b => { b.disabled = true; });
      if (statusEl) {
        statusEl.removeAttribute('data-aap-state');
        statusEl.textContent = action === 'replay' ? 'Replaying…' : 'Submitting…';
      }

      let result;
      let applyResult = null;       // Task #278 — set when Approve also executed /apply
      let appliedSummary = null;    // Human-readable outcome label for the status span
      if (action === 'approve' || action === 'reject') {
        const id = btn.getAttribute('data-aap-id');
        if (!id) {
          result = { ok: false, status: 0, data: { error: 'Missing action id' } };
        } else {
          result = await postAction(
            `/api/admin/agent-fleet/actions/${encodeURIComponent(id)}/review`,
            { decision: action === 'approve' ? 'approved' : 'rejected' }
          );
          // Task #278 — one-click Approve & Apply for safely-applyable cards.
          // Only chain /apply when the button itself is flagged applyable
          // (set by fleetApplyability + fleetActionButtons above) so we
          // never call /apply for actions where it would 4xx.
          if (result.ok && action === 'approve' && btn.getAttribute('data-aap-applyable') === '1') {
            if (statusEl) statusEl.textContent = 'Approved — applying…';
            applyResult = await postAction(
              `/api/admin/agent-fleet/actions/${encodeURIComponent(id)}/apply`, null);
            if (!applyResult.ok) {
              // /review already succeeded — surface the apply failure as a
              // partial-success message so the admin knows the recommendation
              // is marked approved but the mutation didn't land. They can
              // still bounce to /admin/agent-fleet.html to retry /apply.
              result = {
                ok: false, status: applyResult.status,
                data: { error: `Approved, but apply failed: ${(applyResult.data && (applyResult.data.error || applyResult.data.message)) || ('HTTP ' + (applyResult.status || 'error'))}` }
              };
            } else {
              const d = applyResult.data || {};
              if (d.new_role) {
                appliedSummary = `Provider role: ${d.prior_role || '?'} → ${d.new_role}`;
              } else if (d.accepted_bid_id) {
                const amt = (d.amount != null) ? ` ($${Number(d.amount).toFixed(2)})` : '';
                appliedSummary = `Bid accepted${amt} · ${d.rejected_count || 0} other bid(s) rejected`;
              } else {
                appliedSummary = 'Applied';
              }
            }
          }
        }
      } else if (action === 'replay') {
        const dlqId = btn.getAttribute('data-aap-dlq-id');
        if (!dlqId) {
          result = { ok: false, status: 0, data: { error: 'Missing DLQ id' } };
        } else {
          result = await postAction(
            `/api/admin/agent-fleet/dead-letter/${encodeURIComponent(dlqId)}/replay`, null);
        }
      } else {
        result = { ok: false, status: 0, data: { error: `Unknown action: ${action}` } };
      }

      if (result.ok) {
        if (statusEl) {
          statusEl.setAttribute('data-aap-state', 'success');
          const baseLabel = action === 'replay' ? 'Replayed' :
                            action === 'approve' ? (appliedSummary ? `Approved & Applied — ${appliedSummary}` : 'Approved')
                                                 : 'Rejected';
          statusEl.textContent = baseLabel;
        }
        // Re-render the whole panel so badges / button visibility / DLQ
        // status all sync up. Stored opts are preserved by the container.
        const opts = rootEl.__aapOpts || {};
        // Tiny delay so the user sees the success label flash before the
        // panel repaints from scratch.
        setTimeout(() => { renderAgentActivityPanel(containerId, opts); }, 250);
      } else {
        const msg = (result.data && (result.data.error || result.data.message)) ||
                    `HTTP ${result.status || 'error'}`;
        if (statusEl) {
          statusEl.setAttribute('data-aap-state', 'error');
          statusEl.textContent = `Failed: ${msg}`;
        }
        allBtns.forEach(b => { b.disabled = false; });
      }
    });
  }

  async function renderAgentActivityPanel(containerId, opts) {
    opts = opts || {};
    const container = document.getElementById(containerId);
    if (!container) return;
    ensureDrawerStyles();
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
    // Stash opts on the body element so the click handler can re-render
    // the panel after a successful Approve/Reject/Replay without callers
    // having to re-pass the original options.
    bodyEl.__aapOpts = opts;
    bindDrawerToggles(bodyEl);
    bindActionButtons(bodyEl, containerId);

    try {
      // Fetch fleet + legacy in parallel, then DLQ filtered by the
      // event_ids we actually need to know about (deterministic, not
      // capped by global backlog size).
      const [fleet, legacy] = await Promise.all([
        fetchFleet(opts),
        fetchLegacy(opts)
      ]);
      const fleetEventIds = Array.from(new Set(
        fleet.map(a => a.event_id).filter(id => id != null)
      ));
      const dlqByEventId = await fetchOpenDeadLetter(fleetEventIds);
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
        m.__src === 'fleet' ? renderFleetCard(m.row, dlqByEventId) : renderLegacyCard(m.row)
      ).join('');
      countEl.textContent = `${merged.length} ${merged.length === 1 ? 'entry' : 'entries'}`;
    } catch (e) {
      bodyEl.innerHTML = `<div style="padding:14px;color:var(--accent-red);font-size:0.85rem;">Failed to load agent activity: ${esc(e.message)}</div>`;
      countEl.textContent = '';
    }
  }

  window.renderAgentActivityPanel = renderAgentActivityPanel;
})();

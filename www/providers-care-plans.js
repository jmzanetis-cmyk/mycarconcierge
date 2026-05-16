// Provider-facing Awarded Care Plans dashboard (Task #421).
// Read-only sibling to members-care-plans.js: lists plans where this
// provider's bid was accepted, shows escrow/payment status, and surfaces
// any dispute the member has raised (reason/description) so providers
// can see what's frozen and why. Adding a provider-side dispute *response*
// is intentionally out of scope here — that's tracked separately.
(function () {
  'use strict';

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtMoney(n) {
    if (n == null || isNaN(Number(n))) return '—';
    return '$' + Number(n).toFixed(2);
  }

  function fmtDate(s) {
    if (!s) return '—';
    try { return new Date(s).toLocaleString(); } catch (_) { return s; }
  }

  function vehicleLabel(v) {
    if (!v) return '';
    const ymm = [v.year, v.make, v.model].filter(Boolean).join(' ');
    if (v.nickname) return v.nickname + (ymm ? ' (' + ymm + ')' : '');
    return ymm;
  }

  function memberLabel(m) {
    if (!m) return 'Member';
    return m.business_name || m.full_name || 'Member';
  }

  function servicesLabel(plan) {
    const arr = Array.isArray(plan.service_types) ? plan.service_types : [];
    return arr.filter(Boolean).join(', ');
  }

  // Escrow / payment status badge. Disputed > captured > held > pending.
  function statusBadge(plan) {
    const ps = plan.payment_status || 'none';
    const compStatus = plan.completion && plan.completion.status;
    let label, color;
    if (ps === 'disputed' || compStatus === 'disputed') {
      label = 'Disputed'; color = 'var(--accent-red,#ef4444)';
    } else if (ps === 'captured' || compStatus === 'completed') {
      label = 'Paid out'; color = 'var(--accent-green,#10b981)';
    } else if (ps === 'held') {
      label = 'Held in escrow'; color = 'var(--accent-gold,#b8942d)';
    } else if (ps === 'requires_payment') {
      label = 'Awaiting member payment'; color = 'var(--accent-blue,#4a7cff)';
    } else if (ps === 'refunded') {
      label = 'Refunded'; color = 'var(--text-muted,#888)';
    } else {
      label = ps || 'Pending'; color = 'var(--text-muted,#888)';
    }
    return '<span class="cp-status-badge" data-status="' + escapeHtml(label) + '" style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:0.75rem;font-weight:600;background:rgba(0,0,0,0.05);color:' + color + ';border:1px solid ' + color + ';">' + escapeHtml(label) + '</span>';
  }

  async function authHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    try {
      const sb = window.supabaseClient || window.supabase;
      if (sb && sb.auth && typeof sb.auth.getSession === 'function') {
        const { data } = await sb.auth.getSession();
        const token = data && data.session && data.session.access_token;
        if (token) headers['Authorization'] = 'Bearer ' + token;
      }
    } catch (_) { /* ignore */ }
    return headers;
  }

  function apiBase() {
    return (window.MCC_CONFIG && window.MCC_CONFIG.apiBaseUrl) || '';
  }

  async function api(method, path) {
    const headers = await authHeaders();
    const res = await fetch(apiBase() + path, { method, headers });
    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || ('HTTP ' + res.status);
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function renderPlanCard(plan) {
    const comp = plan.completion || {};
    const veh = vehicleLabel(plan.vehicle);
    const services = servicesLabel(plan);
    const amount = (plan.accepted_bid && plan.accepted_bid.amount) || plan.escrow_amount || comp.bid_amount;
    const disputeBlock = (comp.status === 'disputed' || plan.payment_status === 'disputed')
      ? '<div class="cp-dispute-panel" style="margin-top:14px;padding:14px;border-radius:10px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);">'
        + '<div style="font-weight:600;color:var(--accent-red,#ef4444);margin-bottom:6px;">Dispute raised by member</div>'
        + (comp.disputed_at ? '<div style="font-size:0.85rem;color:var(--text-muted,#888);margin-bottom:8px;">' + escapeHtml(fmtDate(comp.disputed_at)) + '</div>' : '')
        + (comp.dispute_reason ? '<div style="margin-bottom:6px;"><strong>Reason:</strong> ' + escapeHtml(comp.dispute_reason) + '</div>' : '')
        + (comp.dispute_description ? '<div style="white-space:pre-wrap;">' + escapeHtml(comp.dispute_description) + '</div>' : '')
        + '<div style="margin-top:10px;font-size:0.85rem;color:var(--text-muted,#888);">An administrator will review and resolve this dispute. You\'ll be contacted if more information is needed.</div>'
        + '</div>'
      : '';
    const completedBlock = (comp.status === 'completed' && comp.captured_at)
      ? '<div style="margin-top:10px;font-size:0.9rem;color:var(--accent-green,#10b981);">Payment captured ' + escapeHtml(fmtDate(comp.captured_at)) + (comp.captured_amount ? ' — ' + fmtMoney(comp.captured_amount) : '') + '</div>'
      : '';
    return '<div class="card cp-awarded-card" data-plan-id="' + escapeHtml(plan.id) + '" style="margin-bottom:14px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-weight:600;font-size:1.05rem;">' + escapeHtml(plan.title || 'Care plan') + '</div>'
      + (veh ? '<div style="color:var(--text-muted,#888);font-size:0.9rem;margin-top:2px;">' + escapeHtml(veh) + '</div>' : '')
      + (services ? '<div style="color:var(--text-muted,#888);font-size:0.85rem;margin-top:2px;">' + escapeHtml(services) + '</div>' : '')
      + '<div style="margin-top:6px;font-size:0.85rem;">Member: ' + escapeHtml(memberLabel(plan.member)) + '</div>'
      + '</div>'
      + '<div style="text-align:right;">'
      + '<div style="font-size:1.15rem;font-weight:700;">' + fmtMoney(amount) + '</div>'
      + '<div style="margin-top:6px;">' + statusBadge(plan) + '</div>'
      + '</div>'
      + '</div>'
      + completedBlock
      + disputeBlock
      + '</div>';
  }

  async function loadAwardedPlansSection() {
    const list = document.getElementById('care-plans-awarded-list');
    if (!list) return;
    list.innerHTML = '<div style="padding:20px;color:var(--text-muted,#888);">Loading awarded plans…</div>';
    try {
      const data = await api('GET', '/api/care-plans/awarded');
      const plans = (data && data.plans) || [];
      if (!plans.length) {
        list.innerHTML = '<div class="empty-state"><div class="empty-state-title">No awarded plans yet</div><div class="empty-state-desc">When a member accepts one of your bids, the plan will appear here with payment status and any disputes.</div></div>';
        return;
      }
      // Update badge count for disputed/held plans (actionable)
      const badge = document.getElementById('care-plans-awarded-count');
      if (badge) {
        const actionable = plans.filter(p => {
          const ps = p.payment_status;
          const cs = p.completion && p.completion.status;
          return ps === 'disputed' || cs === 'disputed' || ps === 'held';
        }).length;
        if (actionable > 0) { badge.textContent = String(actionable); badge.style.display = ''; }
        else { badge.style.display = 'none'; }
      }
      list.innerHTML = plans.map(renderPlanCard).join('');
    } catch (err) {
      const msg = err && err.status === 403
        ? 'Your provider account isn\'t verified yet, so awarded plans aren\'t visible.'
        : ('Could not load awarded plans: ' + (err && err.message ? err.message : 'unknown error'));
      list.innerHTML = '<div style="padding:20px;color:var(--accent-red,#ef4444);">' + escapeHtml(msg) + '</div>';
    }
  }

  // Expose for testing + for showSection() hook
  window.loadAwardedCarePlansSection = loadAwardedPlansSection;

  function bind() {
    const navItem = document.querySelector('.nav-item[data-section="care-plans-awarded"]');
    if (navItem) {
      navItem.addEventListener('click', function () {
        // Defer so showSection() can mark the section active first
        setTimeout(loadAwardedPlansSection, 0);
      });
    }
    const refreshBtn = document.getElementById('care-plans-awarded-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', loadAwardedPlansSection);
    // Auto-load on page-load so the badge count is correct even before the
    // section is opened.
    try { loadAwardedPlansSection(); } catch (_) { /* ignore */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();

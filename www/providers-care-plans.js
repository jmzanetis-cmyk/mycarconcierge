// Provider-facing Awarded Care Plans dashboard (Task #421).
// Sibling to members-care-plans.js: lists plans where this provider's bid
// was accepted, shows escrow/payment status, surfaces any dispute the
// member has raised (reason/description) so providers can see what's
// frozen and why, AND lets the winning provider submit/edit a free-text
// response to that dispute (POST /api/care-plans/:id/dispute-response).
// Admin/AI resolver still owns the actual payment resolution — provider
// response is informational input only.
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

  async function api(method, path, body) {
    const headers = await authHeaders();
    const init = { method, headers };
    if (body != null) init.body = JSON.stringify(body);
    const res = await fetch(apiBase() + path, init);
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
    const hasResponse = !!(comp.provider_response && String(comp.provider_response).trim());
    const responseUi = hasResponse
      ? '<div class="cp-dispute-response" style="margin-top:12px;padding:10px;border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);">'
        + '<div style="font-weight:600;margin-bottom:4px;">Your response</div>'
        + (comp.provider_responded_at ? '<div style="font-size:0.8rem;color:var(--text-muted,#888);margin-bottom:6px;">' + escapeHtml(fmtDate(comp.provider_responded_at)) + '</div>' : '')
        + '<div style="white-space:pre-wrap;">' + escapeHtml(comp.provider_response) + '</div>'
        + '<button class="btn btn-sm cp-dispute-edit-response" type="button" data-plan-id="' + escapeHtml(plan.id) + '" style="margin-top:8px;">Edit response</button>'
        + '</div>'
      : '<div class="cp-dispute-response-form" style="margin-top:12px;">'
        + '<label for="cp-resp-' + escapeHtml(plan.id) + '" style="display:block;font-weight:600;margin-bottom:6px;">Your response (admin will review)</label>'
        + '<textarea id="cp-resp-' + escapeHtml(plan.id) + '" class="form-input cp-dispute-response-input" data-plan-id="' + escapeHtml(plan.id) + '" rows="3" maxlength="4000" placeholder="Explain what happened from your side. This will be visible to the admin reviewing the dispute." style="width:100%;"></textarea>'
        + '<div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap;">'
        + '<button class="btn btn-primary cp-dispute-submit-response" type="button" data-plan-id="' + escapeHtml(plan.id) + '">Submit response</button>'
        + '<span class="cp-dispute-response-msg" data-plan-id="' + escapeHtml(plan.id) + '" style="font-size:0.85rem;color:var(--text-muted,#888);"></span>'
        + '</div>'
        + '</div>';
    const disputeBlock = (comp.status === 'disputed' || plan.payment_status === 'disputed')
      ? '<div class="cp-dispute-panel" style="margin-top:14px;padding:14px;border-radius:10px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);">'
        + '<div style="font-weight:600;color:var(--accent-red,#ef4444);margin-bottom:6px;">Dispute raised by member</div>'
        + (comp.disputed_at ? '<div style="font-size:0.85rem;color:var(--text-muted,#888);margin-bottom:8px;">' + escapeHtml(fmtDate(comp.disputed_at)) + '</div>' : '')
        + (comp.dispute_reason ? '<div style="margin-bottom:6px;"><strong>Reason:</strong> ' + escapeHtml(comp.dispute_reason) + '</div>' : '')
        + (comp.dispute_description ? '<div style="white-space:pre-wrap;">' + escapeHtml(comp.dispute_description) + '</div>' : '')
        + responseUi
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
      // Refresh the actionable-count badge BEFORE any early return so an
      // empty list correctly clears a previously-shown count.
      const badge = document.getElementById('care-plans-awarded-count');
      if (badge) {
        const actionable = plans.filter(p => {
          const ps = p.payment_status;
          const cs = p.completion && p.completion.status;
          return ps === 'disputed' || cs === 'disputed' || ps === 'held';
        }).length;
        if (actionable > 0) { badge.textContent = String(actionable); badge.style.display = ''; }
        else { badge.textContent = ''; badge.style.display = 'none'; }
      }
      if (!plans.length) {
        list.innerHTML = '<div class="empty-state"><div class="empty-state-title">No awarded plans yet</div><div class="empty-state-desc">When a member accepts one of your bids, the plan will appear here with payment status and any disputes.</div></div>';
        return;
      }
      list.innerHTML = plans.map(renderPlanCard).join('');
    } catch (err) {
      const msg = err && err.status === 403
        ? 'Your provider account isn\'t verified yet, so awarded plans aren\'t visible.'
        : ('Could not load awarded plans: ' + (err && err.message ? err.message : 'unknown error'));
      list.innerHTML = '<div style="padding:20px;color:var(--accent-red,#ef4444);">' + escapeHtml(msg) + '</div>';
    }
  }

  async function submitDisputeResponse(planId, btn) {
    const input = document.querySelector('.cp-dispute-response-input[data-plan-id="' + planId + '"]');
    const msg = document.querySelector('.cp-dispute-response-msg[data-plan-id="' + planId + '"]');
    if (!input) return;
    const text = (input.value || '').trim();
    if (!text) {
      if (msg) { msg.textContent = 'Please write a response first.'; msg.style.color = 'var(--accent-red,#ef4444)'; }
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
    if (msg) { msg.textContent = ''; }
    try {
      await api('POST', '/api/care-plans/' + encodeURIComponent(planId) + '/dispute-response', { response: text });
      // Reload to show the persisted response
      await loadAwardedPlansSection();
    } catch (err) {
      if (msg) {
        msg.textContent = 'Could not submit: ' + (err && err.message ? err.message : 'unknown error');
        msg.style.color = 'var(--accent-red,#ef4444)';
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Submit response'; }
    }
  }

  function handleListClick(ev) {
    const submitBtn = ev.target.closest('.cp-dispute-submit-response');
    if (submitBtn) {
      const planId = submitBtn.getAttribute('data-plan-id');
      if (planId) submitDisputeResponse(planId, submitBtn);
      return;
    }
    const editBtn = ev.target.closest('.cp-dispute-edit-response');
    if (editBtn) {
      const planId = editBtn.getAttribute('data-plan-id');
      const card = document.querySelector('.cp-awarded-card[data-plan-id="' + planId + '"]');
      const responseBlock = card && card.querySelector('.cp-dispute-response');
      const existingText = responseBlock ? responseBlock.querySelector('div[style*="white-space"]').textContent : '';
      if (responseBlock) {
        responseBlock.outerHTML = '<div class="cp-dispute-response-form" style="margin-top:12px;">'
          + '<label for="cp-resp-' + planId + '" style="display:block;font-weight:600;margin-bottom:6px;">Your response (admin will review)</label>'
          + '<textarea id="cp-resp-' + planId + '" class="form-input cp-dispute-response-input" data-plan-id="' + planId + '" rows="3" maxlength="4000" style="width:100%;"></textarea>'
          + '<div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap;">'
          + '<button class="btn btn-primary cp-dispute-submit-response" type="button" data-plan-id="' + planId + '">Submit response</button>'
          + '<span class="cp-dispute-response-msg" data-plan-id="' + planId + '" style="font-size:0.85rem;color:var(--text-muted,#888);"></span>'
          + '</div>'
          + '</div>';
        const ta = document.getElementById('cp-resp-' + planId);
        if (ta) ta.value = existingText;
      }
    }
  }

  // Expose for testing + for showSection() hook
  window.loadAwardedCarePlansSection = loadAwardedPlansSection;
  window.submitDisputeResponse = submitDisputeResponse;

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
    const list = document.getElementById('care-plans-awarded-list');
    if (list) list.addEventListener('click', handleListClick);
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

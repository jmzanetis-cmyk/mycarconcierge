// Member-facing Care Plans UI (Task #156).
(function () {
  'use strict';

  let activeStripe = null;
  let activeElements = null;
  let activeCardElement = null;
  let activePlanId = null;
  let activeBidId = null;
  let activeClientSecret = null;
  let isSubmitting = false;
  const DISPUTE_REASONS = ['quality', 'incomplete', 'overcharged', 'no_show', 'damaged', 'other'];

  function t(key, fallback, vars) {
    try {
      if (typeof window.t === 'function') {
        const out = window.t(key, vars || {});
        if (out && out !== key) return out;
      }
    } catch (_) {}
    if (fallback && vars) {
      return String(fallback).replace(/\{\{(\w+)\}\}/g, function (_, k) {
        return vars[k] != null ? vars[k] : '';
      });
    }
    return fallback || key;
  }

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

  function servicesLabel(plan) {
    const arr = Array.isArray(plan.service_types) && plan.service_types.length
      ? plan.service_types
      : (Array.isArray(plan.services) ? plan.services.map(s => (typeof s === 'string' ? s : (s && (s.name || s.label || s.type)))) : []);
    return arr.filter(Boolean).join(', ');
  }

  // Bidding window is open iff bid_closes_at is set and still in the future.
  function biddingWindowOpen(plan) {
    if (!plan || !plan.bid_closes_at) return false;
    const ts = Date.parse(plan.bid_closes_at);
    if (isNaN(ts)) return false;
    return ts > Date.now();
  }

  function showToast(msg, kind) {
    if (typeof window.showToast === 'function') {
      try { window.showToast(msg, kind || 'info'); return; } catch (_) {}
    }
    // Fall back to alert so the user is never silently confused.
    try { alert(msg); } catch (_) {}
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
    } catch (_) {}
    return headers;
  }

  function apiBase() {
    return (window.MCC_CONFIG && window.MCC_CONFIG.apiBaseUrl) || '';
  }

  async function api(method, path, body) {
    const headers = await authHeaders();
    const init = { method: method, headers: headers };
    if (body != null) init.body = JSON.stringify(body);
    const res = await fetch(apiBase() + path, init);
    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || ('HTTP ' + res.status);
      const err = new Error(msg);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  // -- status badge -------------------------------------------------------
  function statusBadge(plan) {
    const ps = plan.payment_status || 'none';
    const st = plan.status || 'open';
    let label, color;
    if (st === 'completed' || ps === 'captured') {
      label = t('member.cpStatusCompleted', 'Completed'); color = 'var(--accent-green, #22c55e)';
    } else if (ps === 'disputed') {
      label = t('member.cpStatusDisputed', 'In Dispute'); color = 'var(--accent-red, #ef4444)';
    } else if (ps === 'held') {
      label = t('member.cpStatusHeld', 'Funds Held'); color = 'var(--accent-blue, #3b82f6)';
    } else if (ps === 'requires_payment') {
      label = t('member.cpStatusAwaitingPayment', 'Awaiting Payment'); color = 'var(--accent-orange, #f59e0b)';
    } else if (st === 'awarded') {
      label = t('member.cpStatusAwarded', 'Awarded'); color = 'var(--accent-blue, #3b82f6)';
    } else if (ps === 'failed' || ps === 'cancelled') {
      label = t('member.cpStatusCancelled', 'Cancelled'); color = 'var(--accent-orange, #f59e0b)';
    } else {
      label = t('member.cpStatusOpen', 'Open for Bids'); color = 'var(--accent-gold, #c9a227)';
    }
    return '<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:0.78rem;background:' + color + '22;color:' + color + ';border:1px solid ' + color + '55;">' + escapeHtml(label) + '</span>';
  }

  // -- list view ----------------------------------------------------------
  // Task #284 — track the member's care plan IDs so the realtime channel
  // can decide locally whether an incoming bid INSERT is one we care about
  // (avoids re-fetching /mine on every unrelated bid in the system).
  let myCarePlanIds = new Set();

  async function loadCarePlansSection() {
    const list = document.getElementById('care-plans-list');
    const detail = document.getElementById('care-plan-detail');
    if (detail) { detail.style.display = 'none'; detail.innerHTML = ''; }
    // Set up the realtime channel on first call. Idempotent + non-fatal.
    setupCarePlansRealtime();
    if (!list) return;
    list.innerHTML = '<div class="empty-state"><p>' + escapeHtml(t('member.carePlansLoading', 'Loading your care plans…')) + '</p></div>';
    try {
      const data = await api('GET', '/api/care-plans/mine');
      renderCarePlansList(data.plans || []);
    } catch (e) {
      list.innerHTML = '<div class="empty-state"><p style="color:var(--accent-red,#ef4444);">' + escapeHtml(e.message || 'Failed to load care plans') + '</p></div>';
    }
  }

  function renderCarePlansList(plans) {
    const list = document.getElementById('care-plans-list');
    const badge = document.getElementById('care-plans-count');
    // Refresh the realtime filter set every time the list re-renders so a
    // newly-created plan starts receiving live bid notifications without a
    // page reload.
    myCarePlanIds = new Set((plans || []).map(p => p && p.id).filter(Boolean));
    if (badge) {
      const open = plans.filter(p => (p.status === 'open' || p.payment_status === 'requires_payment')).length;
      if (open > 0) { badge.textContent = String(open); badge.style.display = ''; }
      else { badge.style.display = 'none'; }
    }
    if (!list) return;
    if (!plans.length) {
      list.innerHTML = '<div class="empty-state"><p>' + escapeHtml(t('member.carePlansEmpty', 'You don\u2019t have any care plans yet. Create one from the Job Board to get bids from providers.')) + '</p></div>';
      return;
    }
    const rows = plans.map(p => {
      const pendingBids = p.pending_bid_count || 0;
      const accepted = p.accepted_bid;
      const hint = accepted
        ? t('member.cpAwardedTo', 'Awarded \u2014 escrow {{state}}', { state: t('member.cpPS_' + (p.payment_status || 'none'), p.payment_status || 'none') })
        : (pendingBids
            ? t('member.cpPendingBids', '{{n}} bid(s) waiting for your review', { n: pendingBids })
            : t('member.cpNoBidsYet', 'No bids yet \u2014 check back soon'));
      const amount = (accepted && accepted.amount != null) ? accepted.amount : p.escrow_amount;
      const veh = vehicleLabel(p.vehicle);
      const svc = servicesLabel(p);
      const closes = p.bid_closes_at ? fmtDate(p.bid_closes_at) : '';
      const windowLine = (p.status === 'open' && closes)
        ? '<div style="font-size:0.78rem;color:var(--text-secondary,#9ca3af);margin-top:2px;">' +
            escapeHtml(biddingWindowOpen(p)
              ? t('member.cpBidsCloseAt', 'Bidding closes {{when}}', { when: closes })
              : t('member.cpBidsClosed', 'Bidding window closed')) +
          '</div>'
        : '';
      return '' +
        '<div class="card" style="padding:18px;margin-bottom:14px;border:1px solid var(--border-color,#2c2f36);border-radius:12px;background:var(--bg-card,#1c2128);">' +
          '<div style="display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px;">' +
            '<div style="flex:1 1 260px;min-width:0;">' +
              '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px;">' +
                '<strong style="font-size:1.05rem;color:var(--text-primary,#f5f5f7);">' + escapeHtml(p.title || t('member.cpUntitledPlan', 'Untitled care plan')) + '</strong>' +
                statusBadge(p) +
              '</div>' +
              (veh ? '<div style="font-size:0.86rem;color:var(--text-primary,#f5f5f7);">' + escapeHtml(t('member.cpVehicleLabel', 'Vehicle: {{v}}', { v: veh })) + '</div>' : '') +
              (svc ? '<div style="font-size:0.84rem;color:var(--text-secondary,#9ca3af);margin-top:2px;">' + escapeHtml(t('member.cpServicesLabel', 'Services: {{s}}', { s: svc })) + '</div>' : '') +
              '<div style="font-size:0.85rem;color:var(--text-secondary,#9ca3af);margin-top:6px;">' + escapeHtml(hint) + '</div>' +
              windowLine +
            '</div>' +
            '<div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font-size:0.95rem;color:var(--text-primary,#f5f5f7);">' +
              (amount != null ? '<div><strong>' + escapeHtml(fmtMoney(amount)) + '</strong></div>' : '') +
              '<div style="font-size:0.78rem;color:var(--text-secondary,#9ca3af);">' + escapeHtml(t('member.cpCreated', 'Created {{when}}', { when: fmtDate(p.created_at) })) + '</div>' +
              '<button class="btn btn-primary" type="button" data-plan-open="' + escapeHtml(p.id) + '">' + escapeHtml(t('member.cpOpenBtn', 'Open')) + '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
    }).join('');
    list.innerHTML = rows;
    Array.prototype.forEach.call(list.querySelectorAll('[data-plan-open]'), function (el) {
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        viewCarePlan(el.getAttribute('data-plan-open'));
      });
    });
  }

  // -- detail view --------------------------------------------------------
  async function viewCarePlan(planId) {
    const detail = document.getElementById('care-plan-detail');
    if (!detail) return;
    detail.style.display = '';
    detail.innerHTML = '<div class="card" style="padding:24px;text-align:center;color:var(--text-secondary,#9ca3af);">' + escapeHtml(t('member.cpLoadingDetail', 'Loading care plan\u2026')) + '</div>';
    try {
      const data = await api('GET', '/api/care-plans/' + encodeURIComponent(planId));
      renderCarePlanDetail(data);
    } catch (e) {
      detail.innerHTML = '<div class="card" style="padding:24px;color:var(--accent-red,#ef4444);">' + escapeHtml(e.message || 'Failed to load') + '</div>';
    }
    try { detail.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {}
  }

  function renderCarePlanDetail(data) {
    const detail = document.getElementById('care-plan-detail');
    if (!detail) return;
    const plan = data.plan || {};
    const bids = data.bids || [];
    const completion = data.completion || null;
    const vehicle = data.vehicle || null;

    const acceptedBid = plan.accepted_bid_id ? bids.find(b => b.id === plan.accepted_bid_id) : null;
    const ps = plan.payment_status || 'none';
    const veh = vehicleLabel(vehicle);
    const svc = servicesLabel(plan);
    const closes = plan.bid_closes_at ? fmtDate(plan.bid_closes_at) : '';
    const windowOpen = biddingWindowOpen(plan);

    let metaHtml = '';
    if (veh) metaHtml += '<div style="font-size:0.9rem;color:var(--text-primary,#f5f5f7);"><strong>' + escapeHtml(t('member.cpVehicle', 'Vehicle')) + ':</strong> ' + escapeHtml(veh) + '</div>';
    if (svc) metaHtml += '<div style="font-size:0.9rem;color:var(--text-primary,#f5f5f7);margin-top:2px;"><strong>' + escapeHtml(t('member.cpServices', 'Services')) + ':</strong> ' + escapeHtml(svc) + '</div>';
    if (closes && plan.status === 'open') {
      metaHtml += '<div style="font-size:0.85rem;color:var(--text-secondary,#9ca3af);margin-top:4px;">' +
        escapeHtml(windowOpen
          ? t('member.cpBidsCloseAt', 'Bidding closes {{when}}', { when: closes })
          : t('member.cpBidsClosed', 'Bidding window closed')) +
        '</div>';
    }

    let html = '' +
      '<div class="card" style="padding:20px;border:1px solid var(--border-color,#2c2f36);border-radius:12px;background:var(--bg-card,#1c2128);">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:8px;">' +
          '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
            '<h2 style="margin:0;color:var(--text-primary,#f5f5f7);">' + escapeHtml(plan.title || t('member.cpUntitledPlan', 'Untitled care plan')) + '</h2>' +
            statusBadge(plan) +
          '</div>' +
          '<button class="btn" type="button" id="cp-close-detail">' + escapeHtml(t('common.close', 'Close')) + '</button>' +
        '</div>' +
        (metaHtml ? '<div style="margin:6px 0 10px;">' + metaHtml + '</div>' : '') +
        (plan.description
          ? '<p style="color:var(--text-secondary,#9ca3af);white-space:pre-wrap;margin:8px 0 4px;">' + escapeHtml(plan.description) + '</p>'
          : '') +
      '</div>';

    // Accepted bid + payment lifecycle panel
    if (acceptedBid) {
      const provName = acceptedBid.provider && acceptedBid.provider.business_name
        ? acceptedBid.provider.business_name
        : t('member.cpAcceptedProvider', 'Provider');

      let actionHtml = '';
      if (ps === 'requires_payment') {
        // Member needs to authorize the card. We re-mount the card element.
        actionHtml = renderCardAuthorizePanel(plan.id, acceptedBid.id, acceptedBid.amount);
      } else if (ps === 'held') {
        actionHtml = '' +
          '<div style="display:flex;flex-wrap:wrap;gap:10px;">' +
            '<button class="btn btn-primary" type="button" id="cp-mark-complete-btn">' + escapeHtml(t('member.cpMarkComplete', 'Mark Complete & Release Funds')) + '</button>' +
            '<button class="btn" type="button" id="cp-raise-dispute-btn" style="border-color:var(--accent-red,#ef4444);color:var(--accent-red,#ef4444);">' + escapeHtml(t('member.cpRaiseDispute', 'Raise Dispute')) + '</button>' +
          '</div>' +
          '<p style="font-size:0.83rem;color:var(--text-secondary,#9ca3af);margin:10px 0 0;">' + escapeHtml(t('member.cpHeldHelp', 'Funds are held in escrow. Mark Complete to release them to the provider, or Raise Dispute to freeze them pending review.')) + '</p>';
      } else if (ps === 'captured') {
        actionHtml = '<div style="padding:12px;border-radius:8px;background:rgba(34,197,94,0.08);color:var(--accent-green,#22c55e);">' + escapeHtml(t('member.cpCapturedNote', 'Payment released to provider. Thanks for using My Car Concierge!')) + '</div>';
      } else if (ps === 'disputed') {
        actionHtml = '<div style="padding:12px;border-radius:8px;background:rgba(239,68,68,0.08);color:var(--accent-red,#ef4444);">' + escapeHtml(t('member.cpDisputedNote', 'This plan is in dispute. An administrator will review and resolve it.')) + '</div>';
      } else if (ps === 'failed' || ps === 'cancelled') {
        actionHtml = '<div style="padding:12px;border-radius:8px;background:rgba(245,158,11,0.08);color:var(--accent-orange,#f59e0b);">' + escapeHtml(t('member.cpPaymentCancelled', 'Payment was cancelled. The plan is open again \u2014 you can accept a different bid below.')) + '</div>';
      }

      html += '' +
        '<div class="card" style="padding:20px;margin-top:16px;border:1px solid var(--border-color,#2c2f36);border-radius:12px;background:var(--bg-card,#1c2128);">' +
          '<h3 style="margin:0 0 10px;color:var(--text-primary,#f5f5f7);">' + escapeHtml(t('member.cpAcceptedBid', 'Accepted Bid')) + '</h3>' +
          '<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;margin-bottom:12px;">' +
            '<div><strong>' + escapeHtml(provName) + '</strong>' +
              (acceptedBid.eta_days != null ? ' \u00b7 ' + escapeHtml(t('member.cpEtaDays', '{{n}} day ETA', { n: acceptedBid.eta_days })) : '') +
            '</div>' +
            '<div><strong>' + escapeHtml(fmtMoney(acceptedBid.amount)) + '</strong></div>' +
          '</div>' +
          actionHtml +
        '</div>';
    }

    // Always show the full bids list so the member can see which bid was
    // accepted, which were not selected, and (if payment failed) accept a
    // different one. The bid card itself surfaces the per-bid status.
    if (bids.length) {
      html += renderBidsList(plan, bids, acceptedBid ? acceptedBid.id : null);
    } else {
      html += renderBidsList(plan, bids, null);
    }

    // Completion / dispute footer
    if (completion) {
      html += '' +
        '<div class="card" style="padding:16px;margin-top:16px;border:1px solid var(--border-color,#2c2f36);border-radius:12px;background:var(--bg-card,#1c2128);font-size:0.88rem;color:var(--text-secondary,#9ca3af);">' +
          '<div><strong style="color:var(--text-primary,#f5f5f7);">' + escapeHtml(t('member.cpCompletionRecord', 'Completion Record')) + '</strong></div>' +
          (completion.captured_amount != null ? '<div>' + escapeHtml(t('member.cpCapturedAmount', 'Captured: {{amt}}', { amt: fmtMoney(completion.captured_amount) })) + '</div>' : '') +
          (completion.captured_at ? '<div>' + escapeHtml(t('member.cpCapturedAt', 'Released: {{when}}', { when: fmtDate(completion.captured_at) })) + '</div>' : '') +
          (completion.disputed_at ? '<div style="color:var(--accent-red,#ef4444);">' + escapeHtml(t('member.cpDisputedAt', 'Disputed: {{when}}', { when: fmtDate(completion.disputed_at) })) + (completion.dispute_reason ? ' \u2014 ' + escapeHtml(completion.dispute_reason) : '') + '</div>' : '') +
          (completion.completion_notes ? '<div style="margin-top:6px;">' + escapeHtml(completion.completion_notes) + '</div>' : '') +
        '</div>';
    }

    detail.innerHTML = html;

    // wire up handlers
    const closeBtn = document.getElementById('cp-close-detail');
    if (closeBtn) closeBtn.addEventListener('click', function () {
      detail.style.display = 'none'; detail.innerHTML = '';
    });

    if (acceptedBid && ps === 'held') {
      const cBtn = document.getElementById('cp-mark-complete-btn');
      if (cBtn) cBtn.addEventListener('click', function () { openMarkCompleteFlow(plan.id); });
      const dBtn = document.getElementById('cp-raise-dispute-btn');
      if (dBtn) dBtn.addEventListener('click', function () { openRaiseDisputeFlow(plan.id); });
    }

    // wire up bid accept buttons
    Array.prototype.forEach.call(detail.querySelectorAll('[data-accept-bid]'), function (el) {
      el.addEventListener('click', function () {
        startAcceptBidFlow(plan.id, el.getAttribute('data-accept-bid'));
      });
    });

    // If we just rendered the card-authorize panel, mount the Stripe element.
    if (acceptedBid && ps === 'requires_payment') {
      mountAcceptBidCard(plan.id, acceptedBid.id, acceptedBid.amount);
    }
  }

  function renderBidsList(plan, bids, acceptedBidId) {
    if (!bids.length) {
      return '<div class="card" style="padding:20px;margin-top:16px;border:1px solid var(--border-color,#2c2f36);border-radius:12px;background:var(--bg-card,#1c2128);color:var(--text-secondary,#9ca3af);">' +
        escapeHtml(t('member.cpNoBidsYetLong', 'No bids yet on this plan. Providers will see it on the job board and can submit bids.')) + '</div>';
    }
    // Sort by amount ascending (cheapest first); backend already returns this
    // order, but we re-sort defensively in case future endpoints don't.
    const sorted = bids.slice().sort(function (a, b) {
      const av = Number(a.amount); const bv = Number(b.amount);
      if (isNaN(av) && isNaN(bv)) return 0;
      if (isNaN(av)) return 1;
      if (isNaN(bv)) return -1;
      return av - bv;
    });
    // Accept Bid is only offered when (a) no bid is already accepted, (b) the
    // plan is in an open / re-open payment state, and (c) the bidding window
    // is still in the future.
    const statusOk = !acceptedBidId && (plan.status === 'open' || plan.payment_status === 'failed' || plan.payment_status === 'cancelled' || plan.payment_status === 'none');
    const acceptable = statusOk && biddingWindowOpen(plan);
    const closedNote = (statusOk && !acceptable)
      ? '<div style="font-size:0.83rem;color:var(--text-secondary,#9ca3af);margin-bottom:10px;">' +
          escapeHtml(t('member.cpBidsClosedNote', 'Bidding window has closed; you can no longer accept bids on this plan.')) +
        '</div>'
      : '';
    const rows = sorted.map(b => {
      const isAccepted = acceptedBidId && b.id === acceptedBidId;
      const isRejected = !!acceptedBidId && !isAccepted;
      const prov = b.provider || {};
      const provLine = (prov.business_name ? '<strong>' + escapeHtml(prov.business_name) + '</strong>' : '<em>' + escapeHtml(t('member.cpProvider', 'Provider')) + '</em>') +
        (prov.average_rating != null ? ' \u00b7 \u2605 ' + escapeHtml(Number(prov.average_rating).toFixed(1)) + (prov.total_reviews ? ' (' + prov.total_reviews + ')' : '') : '') +
        (prov.city || prov.state ? ' \u00b7 ' + escapeHtml([prov.city, prov.state].filter(Boolean).join(', ')) : '');
      let statusEl;
      if (isAccepted) {
        statusEl = '<span style="font-size:0.78rem;padding:2px 10px;border-radius:999px;background:rgba(34,197,94,0.12);color:var(--accent-green,#22c55e);border:1px solid rgba(34,197,94,0.4);">' +
          escapeHtml(t('member.cpBidAcceptedLabel', 'Accepted')) + '</span>';
      } else if (isRejected) {
        statusEl = '<span style="font-size:0.78rem;padding:2px 10px;border-radius:999px;background:rgba(156,163,175,0.12);color:var(--text-secondary,#9ca3af);border:1px solid rgba(156,163,175,0.3);">' +
          escapeHtml(t('member.cpBidNotSelected', 'Not selected')) + '</span>';
      } else if (acceptable && b.status === 'pending') {
        statusEl = '<button class="btn btn-primary" type="button" data-accept-bid="' + escapeHtml(b.id) + '">' + escapeHtml(t('member.cpAcceptBid', 'Accept Bid')) + '</button>';
      } else {
        statusEl = '<span style="font-size:0.83rem;color:var(--text-secondary,#9ca3af);">' + escapeHtml(t('member.cpBidStatus_' + b.status, b.status)) + '</span>';
      }
      const cardStyle = isAccepted
        ? 'padding:14px;border:1px solid rgba(34,197,94,0.4);border-radius:10px;margin-bottom:10px;background:rgba(34,197,94,0.04);display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;'
        : (isRejected
          ? 'padding:14px;border:1px solid var(--border-color,#2c2f36);border-radius:10px;margin-bottom:10px;opacity:0.7;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;'
          : 'padding:14px;border:1px solid var(--border-color,#2c2f36);border-radius:10px;margin-bottom:10px;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;');
      return '<div style="' + cardStyle + '">' +
        '<div style="flex:1 1 240px;min-width:0;">' +
          '<div>' + provLine + '</div>' +
          (b.eta_days != null ? '<div style="font-size:0.83rem;color:var(--text-secondary,#9ca3af);margin-top:2px;">' + escapeHtml(t('member.cpEtaDays', '{{n}} day ETA', { n: b.eta_days })) + '</div>' : '') +
          (b.notes ? '<div style="font-size:0.85rem;color:var(--text-secondary,#9ca3af);margin-top:6px;white-space:pre-wrap;">' + escapeHtml(b.notes) + '</div>' : '') +
        '</div>' +
        '<div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:8px;">' +
          '<strong style="font-size:1.05rem;">' + escapeHtml(fmtMoney(b.amount)) + '</strong>' +
          statusEl +
        '</div>' +
      '</div>';
    }).join('');
    return '<div class="card" style="padding:20px;margin-top:16px;border:1px solid var(--border-color,#2c2f36);border-radius:12px;background:var(--bg-card,#1c2128);">' +
      '<h3 style="margin:0 0 12px;color:var(--text-primary,#f5f5f7);">' + escapeHtml(t('member.cpReceivedBids', 'Bids Received')) + '</h3>' +
      closedNote +
      rows +
    '</div>';
  }

  // -- accept bid flow ----------------------------------------------------
  async function startAcceptBidFlow(planId, bidId) {
    if (isSubmitting) return;
    isSubmitting = true;
    try {
      const data = await api('POST', '/api/care-plans/' + encodeURIComponent(planId) + '/accept-bid', { bid_id: bidId });
      activePlanId = planId;
      activeBidId = bidId;
      activeClientSecret = data.client_secret;
      // Re-render the detail view; it will now show the card-authorize panel
      // because payment_status flipped to 'requires_payment'.
      await viewCarePlan(planId);
    } catch (e) {
      if (e.status === 409) {
        showToast(e.message || t('member.cpRaceErr', 'This care plan was already updated. Refreshing.'), 'error');
        await loadCarePlansSection();
      } else {
        showToast(e.message || t('member.cpAcceptFailed', 'Failed to accept bid'), 'error');
      }
    } finally {
      isSubmitting = false;
    }
  }

  function renderCardAuthorizePanel(planId, bidId, amount) {
    return '' +
      '<div style="margin-top:8px;">' +
        '<p style="margin:0 0 10px;color:var(--text-secondary,#9ca3af);">' + escapeHtml(t('member.cpAuthorizeIntro', 'Authorize {{amt}} on your card. Funds will be held in escrow and released only when you Mark Complete.', { amt: fmtMoney(amount) })) + '</p>' +
        '<div id="cp-card-element" style="padding:14px;border:1px solid var(--border-color,#2c2f36);border-radius:10px;background:rgba(20,24,30,0.6);min-height:44px;"></div>' +
        '<div id="cp-card-errors" style="color:var(--accent-red,#ef4444);font-size:0.85rem;margin-top:8px;min-height:18px;"></div>' +
        '<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">' +
          '<button class="btn btn-primary" type="button" id="cp-authorize-btn" data-bid-id="' + escapeHtml(bidId) + '">' + escapeHtml(t('member.cpAuthorizePay', 'Authorize Payment')) + '</button>' +
          '<button class="btn" type="button" id="cp-cancel-card">' + escapeHtml(t('common.cancel', 'Cancel')) + '</button>' +
        '</div>' +
      '</div>';
  }

  async function mountAcceptBidCard(planId, bidId, amount) {
    const errEl = document.getElementById('cp-card-errors');
    try {
      if (typeof window.initStripe !== 'function') {
        if (errEl) errEl.textContent = t('member.cpStripeUnavail', 'Payment system unavailable. Please refresh.');
        return;
      }
      const stripe = await window.initStripe();
      if (!stripe) {
        if (errEl) errEl.textContent = t('member.cpStripeUnavail', 'Payment system unavailable. Please refresh.');
        return;
      }

      // Resume-friendly: if we don't already have a client_secret in memory
      // (page reload, fresh navigation back to a 'requires_payment' plan),
      // re-call /accept-bid with the SAME bid_id. The server is idempotent
      // on (plan, accepted_bid_id) and returns the existing PaymentIntent's
      // client_secret instead of 409, so the member can finish authorising.
      if (activePlanId !== planId || activeBidId !== bidId || !activeClientSecret) {
        try {
          const data = await api('POST', '/api/care-plans/' + encodeURIComponent(planId) + '/accept-bid', { bid_id: bidId });
          activeClientSecret = data.client_secret;
        } catch (e) {
          if (e.status === 409) {
            if (errEl) errEl.textContent = e.message || t('member.cpRaceErr', 'This plan was updated elsewhere. Refreshing.');
            await loadCarePlansSection();
            return;
          }
          if (errEl) errEl.textContent = e.message || t('member.cpResumeErr', 'Could not resume payment. Please refresh.');
          return;
        }
      }
      const isDark = !document.documentElement.classList.contains('light-theme');
      const elements = stripe.elements({
        appearance: {
          theme: isDark ? 'night' : 'stripe',
          variables: {
            colorPrimary: '#c9a227',
            colorText: isDark ? '#f5f5f7' : '#0f172a',
            colorDanger: '#f87171',
            fontFamily: 'Outfit, -apple-system, sans-serif',
            borderRadius: '8px'
          }
        }
      });
      const card = elements.create('card', {
        style: {
          base: {
            color: isDark ? '#f5f5f7' : '#0f172a',
            fontFamily: 'Outfit, -apple-system, sans-serif',
            fontSize: '16px',
            '::placeholder': { color: '#6b7280' }
          },
          invalid: { color: '#f87171', iconColor: '#f87171' }
        }
      });
      const target = document.getElementById('cp-card-element');
      if (!target) return;
      card.mount('#cp-card-element');
      card.on('change', function (ev) {
        if (errEl) errEl.textContent = ev.error ? ev.error.message : '';
      });
      activeStripe = stripe;
      activeElements = elements;
      activeCardElement = card;
      activePlanId = planId;
      activeBidId = bidId;

      const authBtn = document.getElementById('cp-authorize-btn');
      if (authBtn) authBtn.addEventListener('click', function () { confirmAcceptBidCard(planId, bidId); });
      const cancelBtn = document.getElementById('cp-cancel-card');
      if (cancelBtn) cancelBtn.addEventListener('click', function () {
        loadCarePlansSection();
      });
    } catch (e) {
      if (errEl) errEl.textContent = e.message || 'Failed to load card form';
    }
  }

  async function confirmAcceptBidCard(planId, bidId) {
    if (isSubmitting) return;
    if (!activeStripe || !activeCardElement || !activeClientSecret) {
      try {
        const data = await api('POST', '/api/care-plans/' + encodeURIComponent(planId) + '/accept-bid', { bid_id: bidId });
        activeClientSecret = data.client_secret;
      } catch (e) {
        if (e.status === 409) {
          showToast(e.message || t('member.cpRaceErr', 'This plan was updated elsewhere. Refreshing.'), 'error');
          await loadCarePlansSection();
          return;
        }
        showToast(e.message || 'Failed to start payment', 'error');
        return;
      }
    }
    const btn = document.getElementById('cp-authorize-btn');
    const errEl = document.getElementById('cp-card-errors');
    isSubmitting = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('member.cpAuthorizing', 'Authorizing\u2026');
    }
    if (errEl) errEl.textContent = '';
    try {
      const result = await activeStripe.confirmCardPayment(activeClientSecret, {
        payment_method: { card: activeCardElement }
      });
      if (result.error) {
        throw new Error(result.error.message || t('member.cpCardErr', 'Card declined.'));
      }
      const pi = result.paymentIntent;
      if (pi && (pi.status === 'requires_capture' || pi.status === 'succeeded')) {
        showToast(t('member.cpAuthSuccess', 'Payment authorized. Funds are held in escrow.'), 'success');
        activeStripe = activeElements = activeCardElement = null;
        activeClientSecret = null;
        await loadCarePlansSection();
        await viewCarePlan(planId);
      } else {
        throw new Error(t('member.cpCardErr2', 'Card authorization did not succeed. Please try again.'));
      }
    } catch (e) {
      if (errEl) errEl.textContent = e.message || 'Payment failed';
      if (btn) {
        btn.disabled = false;
        btn.textContent = t('member.cpAuthorizePay', 'Authorize Payment');
      }
    } finally {
      isSubmitting = false;
    }
  }

  // -- inline modal helpers -----------------------------------------------
  function closeInlineModal() {
    const m = document.getElementById('cp-inline-modal');
    if (m && m.parentNode) m.parentNode.removeChild(m);
  }

  function openInlineModal(innerHtml, onMount) {
    closeInlineModal();
    const overlay = document.createElement('div');
    overlay.id = 'cp-inline-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML =
      '<div style="background:var(--bg-card,#1c2128);color:var(--text-primary,#f5f5f7);border:1px solid var(--border-color,#2c2f36);border-radius:14px;max-width:480px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,0.45);">' +
        innerHtml +
      '</div>';
    overlay.addEventListener('click', function (ev) { if (ev.target === overlay) closeInlineModal(); });
    document.body.appendChild(overlay);
    if (typeof onMount === 'function') onMount(overlay);
  }

  // -- mark complete ------------------------------------------------------
  function openMarkCompleteFlow(planId) {
    const html =
      '<h3 style="margin:0 0 8px;">' + escapeHtml(t('member.cpMarkComplete', 'Mark Complete & Release Funds')) + '</h3>' +
      '<p style="margin:0 0 12px;font-size:0.9rem;color:var(--text-secondary,#9ca3af);">' +
        escapeHtml(t('member.cpCompleteConfirm', 'This will capture the held funds and release payment to the provider. This cannot be undone.')) +
      '</p>' +
      '<label for="cp-complete-notes" style="display:block;font-size:0.85rem;margin-bottom:6px;">' +
        escapeHtml(t('member.cpCompleteNotesLabel', 'Optional note for the provider')) +
      '</label>' +
      '<textarea id="cp-complete-notes" rows="3" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color,#2c2f36);background:rgba(20,24,30,0.6);color:var(--text-primary,#f5f5f7);font-family:inherit;resize:vertical;"></textarea>' +
      '<div id="cp-complete-error" style="color:var(--accent-red,#ef4444);font-size:0.85rem;margin-top:8px;min-height:18px;"></div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;">' +
        '<button class="btn" type="button" id="cp-complete-cancel">' + escapeHtml(t('common.cancel', 'Cancel')) + '</button>' +
        '<button class="btn btn-primary" type="button" id="cp-complete-confirm">' + escapeHtml(t('member.cpCompleteConfirmBtn', 'Release Funds')) + '</button>' +
      '</div>';
    openInlineModal(html, function () {
      document.getElementById('cp-complete-cancel').addEventListener('click', closeInlineModal);
      document.getElementById('cp-complete-confirm').addEventListener('click', function () {
        submitMarkComplete(planId);
      });
    });
  }

  async function submitMarkComplete(planId) {
    if (isSubmitting) return;
    const ta = document.getElementById('cp-complete-notes');
    const errEl = document.getElementById('cp-complete-error');
    const btn = document.getElementById('cp-complete-confirm');
    const notes = ta ? ta.value.trim() : '';
    if (errEl) errEl.textContent = '';
    if (btn) { btn.disabled = true; btn.textContent = t('member.cpReleasing', 'Releasing\u2026'); }
    isSubmitting = true;
    try {
      const body = notes ? { completion_notes: notes } : {};
      await api('POST', '/api/care-plans/' + encodeURIComponent(planId) + '/complete', body);
      closeInlineModal();
      showToast(t('member.cpCompleteOk', 'Funds released to provider. Thank you!'), 'success');
      await loadCarePlansSection();
      await viewCarePlan(planId);
    } catch (e) {
      if (e.status === 409) {
        closeInlineModal();
        showToast(e.message || t('member.cpRaceErr', 'This plan was updated elsewhere. Refreshing.'), 'error');
        await loadCarePlansSection();
        await viewCarePlan(planId);
      } else if (errEl) {
        errEl.textContent = e.message || t('member.cpCompleteFail', 'Failed to mark complete');
        if (btn) { btn.disabled = false; btn.textContent = t('member.cpCompleteConfirmBtn', 'Release Funds'); }
      }
    } finally {
      isSubmitting = false;
    }
  }

  // -- raise dispute ------------------------------------------------------
  function openRaiseDisputeFlow(planId) {
    const reasonOpts = DISPUTE_REASONS.map(function (r) {
      return '<option value="' + r + '">' + escapeHtml(t('member.cpDisputeReason_' + r, r)) + '</option>';
    }).join('');
    const html =
      '<h3 style="margin:0 0 8px;">' + escapeHtml(t('member.cpRaiseDispute', 'Raise Dispute')) + '</h3>' +
      '<p style="margin:0 0 12px;font-size:0.9rem;color:var(--text-secondary,#9ca3af);">' +
        escapeHtml(t('member.cpDisputeIntro', 'Funds will be frozen pending admin review. Please tell us what went wrong.')) +
      '</p>' +
      '<label for="cp-dispute-reason" style="display:block;font-size:0.85rem;margin-bottom:6px;">' +
        escapeHtml(t('member.cpDisputeReasonLabel', 'Reason')) +
      '</label>' +
      '<select id="cp-dispute-reason" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color,#2c2f36);background:rgba(20,24,30,0.6);color:var(--text-primary,#f5f5f7);margin-bottom:12px;">' +
        reasonOpts +
      '</select>' +
      '<label for="cp-dispute-desc" style="display:block;font-size:0.85rem;margin-bottom:6px;">' +
        escapeHtml(t('member.cpDisputeDescLabel', 'Describe the issue')) +
      '</label>' +
      '<textarea id="cp-dispute-desc" rows="4" required style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color,#2c2f36);background:rgba(20,24,30,0.6);color:var(--text-primary,#f5f5f7);font-family:inherit;resize:vertical;"></textarea>' +
      '<div id="cp-dispute-error" style="color:var(--accent-red,#ef4444);font-size:0.85rem;margin-top:8px;min-height:18px;"></div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;">' +
        '<button class="btn" type="button" id="cp-dispute-cancel">' + escapeHtml(t('common.cancel', 'Cancel')) + '</button>' +
        '<button class="btn" type="button" id="cp-dispute-submit" style="border-color:var(--accent-red,#ef4444);color:var(--accent-red,#ef4444);">' + escapeHtml(t('member.cpDisputeSubmit', 'Submit Dispute')) + '</button>' +
      '</div>';
    openInlineModal(html, function () {
      document.getElementById('cp-dispute-cancel').addEventListener('click', closeInlineModal);
      document.getElementById('cp-dispute-submit').addEventListener('click', function () {
        submitRaiseDispute(planId);
      });
    });
  }

  async function submitRaiseDispute(planId) {
    if (isSubmitting) return;
    const sel = document.getElementById('cp-dispute-reason');
    const ta = document.getElementById('cp-dispute-desc');
    const errEl = document.getElementById('cp-dispute-error');
    const btn = document.getElementById('cp-dispute-submit');
    const reason = sel ? sel.value : '';
    const description = ta ? ta.value.trim() : '';
    if (errEl) errEl.textContent = '';
    if (!reason || DISPUTE_REASONS.indexOf(reason) === -1) {
      if (errEl) errEl.textContent = t('member.cpDisputeReasonReq', 'Please select a reason.');
      return;
    }
    if (!description) {
      if (errEl) errEl.textContent = t('member.cpDisputeDescReq', 'Please describe the issue.');
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = t('member.cpDisputeSubmitting', 'Submitting\u2026'); }
    isSubmitting = true;
    try {
      await api('POST', '/api/care-plans/' + encodeURIComponent(planId) + '/dispute', {
        dispute_reason: reason,
        dispute_description: description
      });
      closeInlineModal();
      showToast(t('member.cpDisputeOk', 'Dispute raised. Funds are frozen pending review.'), 'success');
      await loadCarePlansSection();
      await viewCarePlan(planId);
    } catch (e) {
      if (errEl) errEl.textContent = e.message || t('member.cpDisputeFail', 'Failed to raise dispute');
      if (btn) { btn.disabled = false; btn.textContent = t('member.cpDisputeSubmit', 'Submit Dispute'); }
    } finally {
      isSubmitting = false;
    }
  }

  // -- realtime: live bid notifications (Task #284) -----------------------
  // Members can now act on bids the moment they land instead of having to
  // hit Refresh. We subscribe to INSERTs on the `plan_bids` table and, on
  // each event, check the bid's care_plan_id against the local set built
  // from the most recent /api/care-plans/mine response. When it matches,
  // we surface a toast and re-load the section, which also refreshes the
  // #care-plans-count nav badge.
  //
  // Why subscribe here AND insert a `notifications` row server-side
  // (POST /api/plan-bids in www/server.js):
  //   - The `plan_bids` channel is what makes the LIST view auto-refresh
  //     even when the member already had it open.
  //   - The `notifications` row is what feeds the global notifications
  //     bell + the existing members-core.js notifications subscription
  //     when the user is on a different section, and persists history
  //     beyond the lifetime of the realtime socket.
  let realtimeBidsChannel = null;
  function setupCarePlansRealtime() {
    if (realtimeBidsChannel) return; // idempotent
    const sb = window.supabaseClient || window.supabase;
    if (!sb || typeof sb.channel !== 'function') return;
    try {
      realtimeBidsChannel = sb.channel('member-care-plan-bids')
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'plan_bids'
        }, async function (payload) {
          const row = payload && payload.new;
          if (!row || !row.care_plan_id) return;
          if (!myCarePlanIds.has(row.care_plan_id)) return;
          const amt = (row.amount != null && !isNaN(Number(row.amount)))
            ? ' (' + fmtMoney(row.amount) + ')' : '';
          showToast(t('member.cpRealtimeNewBid', 'New bid received{{amt}} on your care plan.', { amt: amt }), 'success');
          try { await loadCarePlansSection(); } catch (_) {}
        })
        .subscribe(function (status) {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            // Allow a future loadCarePlansSection() call to re-subscribe.
            realtimeBidsChannel = null;
          }
        });
    } catch (e) {
      console.warn('[CarePlans] realtime subscribe failed:', e && e.message);
      realtimeBidsChannel = null;
    }
  }

  window.addEventListener('beforeunload', function () {
    const sb = window.supabaseClient || window.supabase;
    if (realtimeBidsChannel && sb && typeof sb.removeChannel === 'function') {
      try { sb.removeChannel(realtimeBidsChannel); } catch (_) {}
    }
    realtimeBidsChannel = null;
  });

  // -- public surface -----------------------------------------------------
  window.loadCarePlansSection = loadCarePlansSection;
  window.viewCarePlan = viewCarePlan;

  // Refresh button is wired here so it works even if the section was already
  // in the DOM at module-load time.
  document.addEventListener('click', function (e) {
    const tgt = e.target.closest && e.target.closest('#care-plans-refresh-btn');
    if (tgt) loadCarePlansSection();
  });
})();

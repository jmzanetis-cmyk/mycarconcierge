// ============================================================================
// providers-auto-bid-prefill.js — Phase 5 of the auto-bid redesign
//
// Review/confirm/dismiss card for a single auto_bid_prefills row. Opened
// two ways: a provider tapping the "New matching job" push notification
// (via members-push.js's handleNotificationDeepLink →
// window.openAutoBidPrefill(entityId), section 'auto_bid_prefills'), or
// directly if this file is ever linked from elsewhere in Settings.
//
// Talks to GET/PATCH /api/auto-bid-prefill/:id (netlify/functions/
// auto-bid-prefill.js). Same auth convention as the rest of
// providers-settings.js: supabaseClient.auth.getSession() → Bearer token.
// ============================================================================
'use strict';

let _abPrefillCurrent = null; // the last-loaded prefill payload, for the confirm handler

async function openAutoBidPrefill(prefillId) {
  if (!prefillId) return;
  const modalId = 'auto-bid-prefill-modal';
  const body = document.getElementById('ab-prefill-body');
  const errEl = document.getElementById('ab-prefill-error');
  if (!body) { console.warn('[auto-bid-prefill] modal markup not found'); return; }

  if (typeof openModal === 'function') openModal(modalId);
  if (errEl) errEl.style.display = 'none';
  body.innerHTML = '<p style="color:var(--text-muted);padding:20px 0;text-align:center;">Loading…</p>';

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error('not_signed_in');

    const resp = await fetch(`/api/auto-bid-prefill/${prefillId}`, {
      headers: { 'Authorization': 'Bearer ' + session.access_token },
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data && data.error ? data.error : 'load_failed');

    _abPrefillCurrent = data;
    renderAutoBidPrefill(data);
  } catch (err) {
    console.error('[auto-bid-prefill] load failed:', err.message);
    body.innerHTML = `<p style="color:var(--accent-red);padding:20px 0;text-align:center;">Couldn't load this job — it may have already been handled. (${escapeHtml(err.message)})</p>`;
  }
}

function renderAutoBidPrefill(data) {
  const body = document.getElementById('ab-prefill-body');
  if (!body) return;

  if (data.status !== 'pending') {
    const labelByStatus = {
      confirmed: 'You already confirmed this bid.',
      dismissed: 'You already dismissed this one.',
      expired: 'This one expired before it was answered.',
    };
    body.innerHTML = `<p style="color:var(--text-secondary);padding:20px 0;text-align:center;">${labelByStatus[data.status] || 'This prefill is no longer pending.'}</p>`;
    document.getElementById('ab-prefill-actions').style.display = 'none';
    return;
  }
  document.getElementById('ab-prefill-actions').style.display = 'flex';

  const plan = data.care_plan || {};
  const vehicle = plan.vehicle ? `${plan.vehicle.year || ''} ${plan.vehicle.make || ''} ${plan.vehicle.model || ''}`.trim() : '';
  const distance = (typeof data.distance_miles === 'number') ? `${data.distance_miles.toFixed(1)} mi away` : '';
  const location = [plan.city, plan.state].filter(Boolean).join(', ');

  body.innerHTML = `
    <div style="margin-bottom:16px;">
      <div style="font-weight:600;font-size:var(--text-lg);margin-bottom:4px;">${escapeHtml(data.item_label || '')}</div>
      <div style="color:var(--text-secondary);font-size:var(--text-base);">${escapeHtml(plan.title || '')}</div>
      ${vehicle ? `<div style="color:var(--text-muted);font-size:var(--text-sm);margin-top:4px;">${escapeHtml(vehicle)}</div>` : ''}
      <div style="color:var(--text-muted);font-size:var(--text-sm);margin-top:4px;">${[location, distance].filter(Boolean).map(escapeHtml).join(' · ')}</div>
    </div>
    <div class="form-group">
      <label class="form-label">Your bid amount</label>
      <input type="number" class="form-input" id="ab-prefill-amount" min="1" step="0.01"
             value="${(data.prefilled_amount_cents / 100).toFixed(2)}"
             style="font-size:var(--text-lg);font-weight:600;">
      <div style="color:var(--text-muted);font-size:var(--text-sm);margin-top:4px;">Prefilled from your rate card — edit if this job needs a different price.</div>
    </div>`;
}

async function respondToAutoBidPrefill(action) {
  if (!_abPrefillCurrent) return;
  const id = _abPrefillCurrent.id;
  const errEl = document.getElementById('ab-prefill-error');
  const submitBtn = document.getElementById('ab-prefill-submit-btn');
  const dismissBtn = document.getElementById('ab-prefill-dismiss-btn');
  if (errEl) errEl.style.display = 'none';
  if (submitBtn) submitBtn.disabled = true;
  if (dismissBtn) dismissBtn.disabled = true;

  const payload = { status: action };
  if (action === 'confirmed') {
    const amountInput = document.getElementById('ab-prefill-amount');
    const amount = amountInput ? Number.parseFloat(amountInput.value) : NaN;
    if (!Number.isFinite(amount) || amount <= 0) {
      if (errEl) { errEl.textContent = 'Enter a valid bid amount.'; errEl.style.display = 'block'; }
      if (submitBtn) submitBtn.disabled = false;
      if (dismissBtn) dismissBtn.disabled = false;
      return;
    }
    payload.amount = amount;
  }

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error('not_signed_in');

    const resp = await fetch(`/api/auto-bid-prefill/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) {
      const messages = {
        no_credits: "You're out of bid credits.",
        duplicate_bid: 'You already have a bid on this job.',
        bidding_closed: 'Bidding closed on this job.',
        care_plan_not_open: 'This job is no longer open.',
        prefill_not_pending: 'This one was already handled.',
        service_not_offered: "This job doesn't match your declared categories.",
      };
      throw new Error(messages[data && data.error] || (data && data.error) || 'request_failed');
    }

    if (typeof showToast === 'function') {
      showToast(action === 'confirmed' ? 'Bid submitted!' : 'Dismissed.', 'success');
    }
    if (typeof closeModal === 'function') closeModal('auto-bid-prefill-modal');
    _abPrefillCurrent = null;
  } catch (err) {
    console.error('[auto-bid-prefill] respond failed:', err.message);
    if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (dismissBtn) dismissBtn.disabled = false;
  }
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

window.openAutoBidPrefill = openAutoBidPrefill;
window.respondToAutoBidPrefill = respondToAutoBidPrefill;

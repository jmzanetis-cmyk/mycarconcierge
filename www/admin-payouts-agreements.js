    // ========================================================================
    // Task #334 — Driver Payouts admin section
    // ========================================================================
    let driverPayoutsCache = null;

    function dollars(cents) {
      const n = Number(cents || 0) / 100;
      return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
    }

    function escapeHtml(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    async function loadDriverPayouts() {
      const tbody = document.getElementById('driver-payouts-table');
      const earningsBody = document.getElementById('driver-payouts-earnings-table');
      const cashoutsBody = document.getElementById('driver-cashouts-table');
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Loading…</td></tr>';
      if (cashoutsBody) cashoutsBody.innerHTML = '<tr><td colspan="7" class="empty-state">Loading…</td></tr>';
      let data;
      try {
        // Task #355 — adminFetch routes 401/403 through the shared "Sign in
        // again" prompt instead of leaving a dead-end "Failed to load: 401"
        // string in the table.
        data = await adminFetch('/api/admin/driver-payouts', { headers: getAdminHeaders() });
      } catch (err) {
        console.error('loadDriverPayouts error:', err);
        // Task #355 — single shared "Sign in again" renderer for auth errors
        // (NO_ADMIN_AUTH / ADMIN_AUTH_REJECTED).
        if (isAdminAuthError(err)) {
          if (tbody) renderAdminAuthErrorRow(tbody, 8, err, loadDriverPayouts);
          if (cashoutsBody) renderAdminAuthErrorRow(cashoutsBody, 7, err, loadDriverPayouts);
        } else if (tbody) {
          tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Failed to load: ${escapeHtml(err.message || String(err))}</td></tr>`;
        }
        return;
      }
      try {
        driverPayoutsCache = data;

        const drivers = data.drivers || [];
        let available = 0, inflight = 0, paid = 0, blocked = 0, failed = 0;
        drivers.forEach(d => {
          available += d.available_cents || 0;
          inflight  += d.in_flight_cents || 0;
          paid      += (d.paid_cents || 0) + (d.manual_cents || 0);
          blocked   += d.pending_account_cents || 0;
          failed    += d.failed_cents || 0;
        });
        document.getElementById('driver-payouts-available-total').textContent = dollars(available);
        document.getElementById('driver-payouts-inflight-total').textContent  = dollars(inflight);
        document.getElementById('driver-payouts-paid-total').textContent      = dollars(paid);
        document.getElementById('driver-payouts-failed-total').textContent    = dollars(blocked + failed);

        // Badge in nav: drivers with failed/blocked balance OR cash-outs awaiting attention.
        const badge = document.getElementById('driver-payouts-badge');
        const attentionCount = drivers.filter(d => (d.failed_cents + d.pending_account_cents) > 0).length;
        if (badge) {
          badge.textContent = attentionCount;
          badge.style.display = attentionCount > 0 ? 'inline-block' : 'none';
        }

        if (tbody) {
          if (drivers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No drivers configured</td></tr>';
          } else {
            tbody.innerHTML = drivers.map(d => {
              const drv = d.driver || {};
              const connectBadge = drv.stripe_connect_account_id
                ? (drv.stripe_payouts_enabled
                    ? '<span class="status-badge approved">Payouts ON</span>'
                    : '<span class="status-badge orange">Onboarding</span>')
                : '<span class="status-badge red">Not connected</span>';
              const canCashOut = !!(drv.stripe_connect_account_id && drv.stripe_payouts_enabled) && (d.available_cents || 0) >= 100;
              return `<tr>
                <td><strong>${escapeHtml(drv.full_name || '—')}</strong><div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(drv.phone || '')}</div></td>
                <td>${connectBadge}</td>
                <td><strong>${dollars(d.available_cents)}</strong></td>
                <td>${dollars(d.in_flight_cents)}</td>
                <td>${dollars((d.paid_cents || 0) + (d.manual_cents || 0))}</td>
                <td>${dollars(d.pending_account_cents)}</td>
                <td>${dollars(d.failed_cents)}</td>
                <td>${canCashOut
                  ? `<button class="btn btn-sm btn-primary" onclick="adminCashoutDriver('${drv.id}','standard')">Cash Out (ACH)</button>
                     <button class="btn btn-sm" onclick="adminCashoutDriver('${drv.id}','instant')">Instant</button>`
                  : '<span style="color:var(--text-muted);font-size:0.75rem;">—</span>'}</td>
              </tr>`;
            }).join('');
          }
        }

        // Recent cash-outs (driver_cashouts is included in the same payload).
        const cashouts = data.cashouts || [];
        if (cashoutsBody) {
          if (cashouts.length === 0) {
            cashoutsBody.innerHTML = '<tr><td colspan="7" class="empty-state">No cash-outs yet</td></tr>';
          } else {
            const driverNameById = {};
            drivers.forEach(d => { if (d.driver) driverNameById[d.driver.id] = d.driver.full_name || d.driver.phone || d.driver.id; });
            cashoutsBody.innerHTML = cashouts.map(c => {
              const when = c.requested_at ? new Date(c.requested_at).toLocaleString() : '—';
              const statusClass = ({ paid: 'approved', processing: 'orange', failed: 'red', cancelled: 'muted' })[c.status] || 'muted';
              return `<tr>
                <td style="font-size:0.8rem;">${escapeHtml(when)}</td>
                <td>${escapeHtml(driverNameById[c.driver_id] || (c.driver_id || '').slice(0, 8))}</td>
                <td><span class="status-badge ${c.method === 'instant' ? 'orange' : 'muted'}">${escapeHtml(c.method)}</span></td>
                <td>${dollars(c.amount_cents)}</td>
                <td>${c.fee_cents ? dollars(c.fee_cents) : '—'}</td>
                <td><span class="status-badge ${statusClass}">${escapeHtml(c.status)}</span>${c.error ? `<div style="font-size:0.7rem;color:var(--text-muted);">${escapeHtml(c.error)}</div>` : ''}</td>
                <td style="font-size:0.7rem;color:var(--text-muted);">${escapeHtml(c.stripe_transfer_id || '')}<br/>${escapeHtml(c.stripe_payout_id || '')}</td>
              </tr>`;
            }).join('');
          }
        }

        // Populate adjustment driver dropdown.
        const sel = document.getElementById('driver-payout-adjust-driver');
        if (sel) {
          sel.innerHTML = '<option value="">Select driver…</option>' +
            drivers.map(d => `<option value="${escapeHtml(d.driver.id)}">${escapeHtml(d.driver.full_name || d.driver.phone || d.driver.id)}</option>`).join('');
        }

        // Recent earnings table — flatten across drivers, take latest 50.
        const all = [];
        drivers.forEach(d => {
          (d.recent || []).forEach(r => all.push({ ...r, driver_name: d.driver?.full_name || d.driver?.phone || d.driver?.id }));
        });
        all.sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
        const top = all.slice(0, 50);
        if (earningsBody) {
          if (top.length === 0) {
            earningsBody.innerHTML = '<tr><td colspan="7" class="empty-state">No earnings recorded yet</td></tr>';
          } else {
            earningsBody.innerHTML = top.map(r => {
              const when = r.recorded_at ? new Date(r.recorded_at).toLocaleString() : '—';
              const statusClass = ({
                paid: 'approved', pending: 'orange', pending_account: 'red',
                failed: 'red', manual: 'muted'
              })[r.payout_status] || 'muted';
              const canRetry  = r.payout_status === 'failed' || r.payout_status === 'pending_account';
              const canManual = r.payout_status !== 'paid' && r.payout_status !== 'manual';
              const actions = [
                canRetry  ? `<button class="btn btn-sm btn-secondary" onclick="retryDriverPayout('${r.id}')">Retry</button>` : '',
                canManual ? `<button class="btn btn-sm" onclick="markDriverPayoutPaid('${r.id}')">Mark Paid</button>` : ''
              ].filter(Boolean).join(' ');
              return `<tr>
                <td style="font-size:0.8rem;">${escapeHtml(when)}</td>
                <td>${escapeHtml(r.driver_name)}</td>
                <td>${escapeHtml(r.kind)}</td>
                <td>${dollars(r.amount_cents)}</td>
                <td><span class="status-badge ${statusClass}">${escapeHtml(r.payout_status)}</span>${r.payout_error ? `<div style="font-size:0.7rem;color:var(--text-muted);">${escapeHtml(r.payout_error)}</div>` : ''}</td>
                <td style="font-size:0.7rem;color:var(--text-muted);">${escapeHtml((r.job_id || '').slice(0, 8))}</td>
                <td>${actions || '<span style="color:var(--text-muted);font-size:0.75rem;">—</span>'}</td>
              </tr>`;
            }).join('');
          }
        }
      } catch (err) {
        console.error('loadDriverPayouts error:', err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Error: ${escapeHtml(err.message)}</td></tr>`;
      }
    }

    async function submitDriverPayoutAdjustment() {
      const driverId = document.getElementById('driver-payout-adjust-driver').value;
      const amountStr = document.getElementById('driver-payout-adjust-amount').value;
      const kind = document.getElementById('driver-payout-adjust-kind').value;
      const notes = document.getElementById('driver-payout-adjust-notes').value;
      if (!driverId) { showToast('Pick a driver.', 'error'); return; }
      const amountCents = Math.round(parseFloat(amountStr) * 100);
      if (!Number.isFinite(amountCents) || amountCents === 0) { showToast('Enter a nonzero amount.', 'error'); return; }
      try {
        const res = await fetch('/api/admin/driver-payouts/adjust', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ driver_id: driverId, amount_cents: amountCents, kind, notes })
        });
        const data = await res.json();
        if (!res.ok) { showToast(`Failed: ${data.error || res.statusText}`, 'error'); return; }
        document.getElementById('driver-payout-adjust-amount').value = '';
        document.getElementById('driver-payout-adjust-notes').value = '';
        await loadDriverPayouts();
      } catch (err) {
        showToast('Adjustment failed: ' + err.message, 'error');
      }
    }

    async function retryDriverPayout(earningsId) {
      if (!confirm('Retry Stripe transfer for this earnings row?')) return;
      try {
        const res = await fetch(`/api/admin/driver-payouts/${encodeURIComponent(earningsId)}/retry`, {
          method: 'POST', headers: getAdminHeaders()
        });
        const data = await res.json();
        if (!res.ok) { showToast(`Retry failed: ${data.error || res.statusText}`, 'error'); return; }
        await loadDriverPayouts();
      } catch (err) { showToast('Retry failed: ' + err.message, 'error'); }
    }

    async function markDriverPayoutPaid(earningsId) {
      const notes = prompt('Notes (e.g. "paid via Zelle ref 123")', 'Marked paid out-of-band');
      if (notes === null) return;
      try {
        const res = await fetch(`/api/admin/driver-payouts/${encodeURIComponent(earningsId)}/mark-paid`, {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes })
        });
        const data = await res.json();
        if (!res.ok) { showToast(`Failed: ${data.error || res.statusText}`, 'error'); return; }
        await loadDriverPayouts();
      } catch (err) { showToast('Failed: ' + err.message, 'error'); }
    }

    async function adminCashoutDriver(driverId, method) {
      const label = method === 'instant' ? 'Instant Payout (1.5% fee)' : 'standard ACH cash-out';
      if (!confirm(`Trigger ${label} for this driver's full available balance?`)) return;
      try {
        const res = await fetch(`/api/admin/driver-payouts/${encodeURIComponent(driverId)}/cashout`, {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ method })
        });
        const data = await res.json();
        if (!res.ok) { showToast(`Cash-out failed: ${(data.error && data.error.message) || data.error || res.statusText}`, 'error'); return; }
        showToast(`Cash-out queued: ${dollars(data.amount_cents)} (${method}${data.fee_cents ? ', fee ' + dollars(data.fee_cents) : ''})`, 'success');
        await loadDriverPayouts();
      } catch (err) { showToast('Cash-out failed: ' + err.message, 'error'); }
    }

    globalThis.loadDriverPayouts = loadDriverPayouts;
    globalThis.submitDriverPayoutAdjustment = submitDriverPayoutAdjustment;
    globalThis.retryDriverPayout = retryDriverPayout;
    globalThis.markDriverPayoutPaid = markDriverPayoutPaid;
    globalThis.adminCashoutDriver = adminCashoutDriver;

    async function loadDisputes() {
      // Task #281 — surface load errors instead of silently rendering "No disputes".
      loadErrors.disputes = null;
      const { data, error } = await supabaseClient.from('disputes').select('*, maintenance_packages(title, payments(id, amount_total)), filed_by_profile:filed_by(full_name)').order('created_at', { ascending: false });
      if (error) { console.error('loadDisputes failed:', error); setLoadError('disputes', error); disputes = []; renderDisputes(); return; }
      disputes = data || [];
      renderDisputes();
      document.getElementById('dispute-count').textContent = disputes.filter(d => d.status === 'open').length;
    }

    async function loadTickets() {
      // Task #281 — surface load errors instead of silently rendering "No tickets".
      loadErrors.tickets = null;
      const { data, error } = await supabaseClient.from('support_tickets').select('*, user:user_id(full_name, email)').order('created_at', { ascending: false });
      if (error) { console.error('loadTickets failed:', error); setLoadError('tickets', error); tickets = []; renderTickets(); return; }
      tickets = data || [];
      renderTickets();
      document.getElementById('ticket-count').textContent = tickets.filter(t => t.status === 'open').length;
    }

    async function loadMembers(page = 1) {
      const { data: { session } } = await supabaseClient.auth.getSession();
      // Task #355 — auth-coded error so the "Sign in again" prompt appears
      // instead of a dead-end Retry button.
      if (!session) { setLoadError('members', { message: 'No active admin session — sign in again.', code: 'NO_ADMIN_AUTH' }); renderMembers(); return; }

      const state = paginationState.members;
      state.page = page;

      const params = new URLSearchParams({
        page: state.page,
        limit: state.limit,
        search: state.search,
        filter: state.filter
      });

      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      // Task #281 — clear any prior load error before re-fetching.
      loadErrors.members = null;
      try {
        const response = await fetch(`${apiBase}/api/admin/members?${params}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!response.ok) {
          let e; try { e = await response.json(); } catch { /* Intentionally silent */ }
          const err = new Error((e && (e.error || e.message)) || `Failed to load members (${response.status})`);
          // Task #355 — preserve auth code for the "Sign in again" prompt.
          if (response.status === 401 || response.status === 403) err.code = 'ADMIN_AUTH_REJECTED';
          throw err;
        }
        const result = await response.json();

        if (result.success) {
          members = result.data || [];
          state.total = result.total;
          state.totalPages = result.totalPages;
          renderMembers();
        } else {
          console.error('Failed to load members:', result.error);
          setLoadError('members', result.error || 'Server returned success=false');
          members = [];
          renderMembers();
        }
      } catch (err) {
        console.error('Error loading members:', err);
        setLoadError('members', err);
        members = [];
        renderMembers();
      }
    }
    
    function changeMembersPage(delta) {
      const state = paginationState.members;
      const newPage = state.page + delta;
      if (newPage >= 1 && newPage <= state.totalPages) {
        loadMembers(newPage);
      }
    }
    
    function searchMembers() {
      debounceSearch('members', () => {
        const searchInput = document.getElementById('member-search');
        paginationState.members.search = searchInput?.value || '';
        paginationState.members.page = 1;
        loadMembers(1);
      });
    }
    
    function filterMembersApi() {
      const typeFilter = document.getElementById('member-type-filter')?.value || 'all';
      paginationState.members.filter = typeFilter;
      paginationState.members.page = 1;
      loadMembers(1);
    }

    // ========== SIGNED AGREEMENTS MANAGEMENT ==========
    let agreements = [];
    let currentAgreement = null;

    async function loadAgreements(page = 1) {
      const { data: { session } } = await supabaseClient.auth.getSession();
      // Task #355 — missing/expired admin session surfaces the shared "Sign
      // in again" prompt instead of silently returning.
      if (!session) {
        const tbody = document.getElementById('agreements-table');
        if (tbody) {
          const err = new Error('No admin session — please sign in again to view agreements.');
          err.code = 'NO_ADMIN_AUTH';
          renderAdminAuthErrorRow(tbody, 8, err, () => loadAgreements(page));
        }
        return;
      }
      
      const state = paginationState.agreements;
      state.page = page;
      
      const params = new URLSearchParams({
        page: state.page,
        limit: state.limit
      });
      
      if (state.search) {
        params.append('search', state.search);
      }
      if (state.filter && state.filter !== 'all') {
        params.append('type', state.filter);
      }
      
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const response = await fetch(`${apiBase}/api/admin/agreements?${params}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        // Task #355 — 401/403 routes through the shared "Sign in again" prompt.
        if (response.status === 401 || response.status === 403) {
          const err = new Error(`Admin session rejected on /api/admin/agreements (HTTP ${response.status}). Sign in again.`);
          err.code = 'ADMIN_AUTH_REJECTED';
          throw err;
        }
        const result = await response.json();
        
        if (result.success) {
          agreements = result.agreements || [];
          state.total = result.total;
          state.totalPages = result.totalPages;
          renderAgreements();
        } else {
          console.error('Failed to load agreements:', result.error);
          agreements = [];
          renderAgreements();
        }
      } catch (err) {
        console.error('Error loading agreements:', err);
        if (isAdminAuthError(err)) {
          const tbody = document.getElementById('agreements-table');
          if (tbody) renderAdminAuthErrorRow(tbody, 8, err, () => loadAgreements(page));
          return;
        }
        agreements = [];
        renderAgreements();
      }
    }
    
    function changeAgreementsPage(delta) {
      const state = paginationState.agreements;
      const newPage = state.page + delta;
      if (newPage >= 1 && newPage <= state.totalPages) {
        loadAgreements(newPage);
      }
    }
    globalThis.changeAgreementsPage = changeAgreementsPage;
    
    function searchAgreements() {
      debounceSearch('agreements', () => {
        const searchInput = document.getElementById('agreement-search');
        paginationState.agreements.search = searchInput?.value || '';
        paginationState.agreements.page = 1;
        loadAgreements(1);
      });
    }
    globalThis.searchAgreements = searchAgreements;
    
    function filterAgreementsApi() {
      const typeFilter = document.getElementById('agreement-type-filter')?.value || 'all';
      paginationState.agreements.filter = typeFilter;
      paginationState.agreements.page = 1;
      loadAgreements(1);
    }
    globalThis.filterAgreementsApi = filterAgreementsApi;

    async function submitAddAgreement() {
      const name = document.getElementById('add-agreement-name')?.value?.trim();
      const business = document.getElementById('add-agreement-business')?.value?.trim();
      const type = document.getElementById('add-agreement-type')?.value;
      const date = document.getElementById('add-agreement-date')?.value;
      const pdfUrl = document.getElementById('add-agreement-pdf-url')?.value?.trim();
      const notes = document.getElementById('add-agreement-notes')?.value?.trim();
      const errEl = document.getElementById('add-agreement-error');
      if (errEl) errEl.style.display = 'none';
      if (!name || !type) {
        if (errEl) { errEl.textContent = 'Full Name and Agreement Type are required.'; errEl.style.display = 'block'; }
        return;
      }
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const headers = getAdminHeaders();
        const res = await fetch(`${apiBase}/api/admin/agreements`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ full_name: name, business_name: business || null, agreement_type: type, signed_at: date ? new Date(date).toISOString() : null, pdf_url: pdfUrl || null, notes: notes || null })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save agreement');
        document.getElementById('add-agreement-modal').style.display = 'none';
        if (globalThis.showToast) showToast('Agreement added successfully', 'success');
        loadAgreements(1);
      } catch (err) {
        if (errEl) { errEl.textContent = 'Error: ' + err.message; errEl.style.display = 'block'; }
      }
    }
    globalThis.submitAddAgreement = submitAddAgreement;

    function formatAgreementType(type) {
      const types = {
        'founding_partner': 'Founding Partner',
        'founding_provider_chris_agrapidis': 'Founding Provider',
        'member_founder': 'Member Founder',
        'provider': 'Provider'
      };
      return types[type] || type || 'Unknown';
    }

    function getAgreementTypeBadgeClass(type) {
      const classes = {
        'founding_partner': 'background:var(--accent-gold-soft);color:var(--accent-gold);',
        'founding_provider_chris_agrapidis': 'background:linear-gradient(135deg,rgba(212,168,85,0.15),rgba(184,148,45,0.15));color:var(--accent-gold);border:1px solid rgba(212,168,85,0.3);',
        'member_founder': 'background:var(--accent-blue-soft);color:var(--accent-blue);',
        'provider': 'background:var(--accent-green-soft);color:var(--accent-green);'
      };
      return classes[type] || 'background:var(--bg-elevated);color:var(--text-muted);';
    }

    function renderAgreements() {
      const tbody = document.getElementById('agreements-table');
      if (!agreements.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No agreements found</td></tr>';
        const paginationContainer = document.getElementById('agreements-pagination');
        if (paginationContainer) {
          paginationContainer.innerHTML = renderPaginationControls(paginationState.agreements, 'changeAgreementsPage');
        }
        return;
      }

      tbody.innerHTML = agreements.map(a => `
        <tr>
          <td style="font-family:monospace;font-size:0.8rem;color:var(--text-muted);">${a.id?.substring(0, 8) || 'N/A'}...</td>
          <td><span style="padding:4px 10px;border-radius:100px;font-size:0.75rem;font-weight:500;${getAgreementTypeBadgeClass(a.agreement_type)}">${formatAgreementType(a.agreement_type)}</span></td>
          <td>${a.full_name || 'N/A'}</td>
          <td>${a.business_name || '-'}</td>
          <td>${a.signed_at ? new Date(a.signed_at).toLocaleDateString() : 'N/A'}</td>
          <td><button class="btn btn-secondary btn-sm" onclick="viewAgreement('${a.id}')">View</button></td>
        </tr>
      `).join('');
      
      const paginationContainer = document.getElementById('agreements-pagination');
      if (paginationContainer) {
        paginationContainer.innerHTML = renderPaginationControls(paginationState.agreements, 'changeAgreementsPage');
      }
    }

    function viewAgreement(agreementId) {
      currentAgreement = agreements.find(a => a.id === agreementId);
      if (!currentAgreement) return;

      const a = currentAgreement;
      const signedDate = a.signed_at ? new Date(a.signed_at).toLocaleString() : 'N/A';
      const effectiveDate = a.effective_date ? new Date(a.effective_date).toLocaleDateString() : 'N/A';
      
      let acknowledgmentsHtml = '';
      if (a.acknowledgments && typeof a.acknowledgments === 'object') {
        const ackList = Object.entries(a.acknowledgments)
          .filter(([key, value]) => value === true)
          .map(([key]) => `<li style="margin:4px 0;">${key.replaceAll('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</li>`)
          .join('');
        if (ackList) {
          acknowledgmentsHtml = `
            <div class="form-section">
              <div class="form-section-title">Acknowledgments</div>
              <ul style="margin-left:20px;color:var(--text-secondary);font-size:0.9rem;">
                ${ackList}
              </ul>
            </div>
          `;
        }
      }

      let signatureHtml = '';
      if (a.signature_data) {
        if (a.signature_data.startsWith('data:image')) {
          signatureHtml = `
            <div class="form-section">
              <div class="form-section-title">Signature</div>
              <div style="background:white;padding:16px;border-radius:var(--radius-md);border:1px solid var(--border-subtle);display:inline-block;">
                <img src="${a.signature_data}" alt="Signature" style="max-width:100%;max-height:150px;">
              </div>
            </div>
          `;
        } else if (a.signature_type === 'typed' || a.signature_data.startsWith('typed:')) {
          const typedName = a.signature_data.startsWith('typed:') ? a.signature_data.substring(6) : a.signature_data;
          signatureHtml = `
            <div class="form-section">
              <div class="form-section-title">Typed Signature</div>
              <div style="font-family:'Brush Script MT', cursive;font-size:2rem;color:var(--text-primary);padding:16px;background:var(--bg-input);border-radius:var(--radius-md);">
                ${typedName}
              </div>
            </div>
          `;
        }
      }

      document.getElementById('agreement-modal-body').innerHTML = `
        <div class="form-section">
          <div class="form-section-title">Agreement Information</div>
          <div class="detail-grid">
            <span class="detail-label">Agreement ID:</span><span class="detail-value" style="font-family:monospace;">${a.id}</span>
            <span class="detail-label">Type:</span><span class="detail-value"><span style="padding:4px 10px;border-radius:100px;font-size:0.75rem;font-weight:500;${getAgreementTypeBadgeClass(a.agreement_type)}">${formatAgreementType(a.agreement_type)}</span></span>
            <span class="detail-label">Full Name:</span><span class="detail-value">${a.full_name || 'N/A'}</span>
            <span class="detail-label">Business Name:</span><span class="detail-value">${a.business_name || '-'}</span>
            ${a.ein_last4 ? `<span class="detail-label">EIN (last 4):</span><span class="detail-value">****${a.ein_last4}</span>` : ''}
            <span class="detail-label">Effective Date:</span><span class="detail-value">${effectiveDate}</span>
            <span class="detail-label">Signed At:</span><span class="detail-value">${signedDate}</span>
            ${a.user_id ? `<span class="detail-label">User ID:</span><span class="detail-value" style="font-family:monospace;font-size:0.85rem;">${a.user_id}</span>` : ''}
          </div>
        </div>

        ${acknowledgmentsHtml}
        ${signatureHtml}
      `;

      const downloadBtn = document.getElementById('download-agreement-btn');
      if (downloadBtn) {
        downloadBtn.style.display = 'inline-flex';
      }

      openModal('agreement-modal');
    }
    globalThis.viewAgreement = viewAgreement;

    async function downloadAgreementPDF() {
      if (!currentAgreement) return;
      const a = currentAgreement;
      const btn = document.getElementById('download-agreement-btn');
      const origText = btn.innerHTML;
      btn.innerHTML = mccIcon('clock', 16) + ' Generating...';
      btn.disabled = true;

      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const response = await fetch(`${apiBase}/api/admin/agreements/${a.id}/pdf`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Failed to generate PDF' }));
          throw new Error(err.error || 'Failed to generate PDF');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const safeName = (a.full_name || 'agreement').replace(/[^a-zA-Z0-9]/g, '-');
        link.download = `MCC-Agreement-${safeName}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Error downloading PDF:', err);
        showToast('Failed to download PDF. Please try again.', 'error');
      } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
      }
    }
    globalThis.downloadAgreementPDF = downloadAgreementPDF;

    // ========== USER ROLES MANAGEMENT ==========
    let allUsersForRoles = [];

    async function loadUserRoles() {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('id, full_name, business_name, email, role, is_also_member, is_also_provider, created_at')
        .in('role', ['member', 'provider', 'admin'])
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error loading user roles:', error);
        allUsersForRoles = [];
      } else {
        allUsersForRoles = data || [];
      }
      
      renderUserRoles();
    }

    function filterUserRoles() {
      renderUserRoles();
    }

    function renderUserRoles() {
      const tbody = document.getElementById('user-roles-table');
      const searchTerm = document.getElementById('user-roles-search')?.value?.toLowerCase() || '';
      const roleFilter = document.getElementById('user-roles-filter')?.value || 'all';
      
      let filtered = allUsersForRoles;
      
      // Apply search filter
      if (searchTerm) {
        filtered = filtered.filter(u => 
          (u.full_name || '').toLowerCase().includes(searchTerm) ||
          (u.business_name || '').toLowerCase().includes(searchTerm) ||
          (u.email || '').toLowerCase().includes(searchTerm)
        );
      }
      
      // Apply role filter
      if (roleFilter === 'member') {
        filtered = filtered.filter(u => u.role === 'member');
      } else if (roleFilter === 'provider') {
        filtered = filtered.filter(u => u.role === 'provider');
      } else if (roleFilter === 'dual') {
        filtered = filtered.filter(u => u.is_also_member || u.is_also_provider);
      }
      
      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No users found</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(u => {
        const displayName = escapeHtml(u.business_name || u.full_name || 'Unnamed');
        const roleLabel = u.role === 'member' ? 'Member' : u.role === 'provider' ? 'Provider' : 'Admin';
        const roleColor = u.role === 'member' ? 'var(--accent-blue)' : u.role === 'provider' ? 'var(--accent-gold)' : 'var(--accent-green)';
        
        // For members, show "Also Provider" toggle
        // For providers, show "Also Member" toggle
        const showAlsoMember = u.role === 'provider';
        const showAlsoProvider = u.role === 'member';
        
        return `
          <tr>
            <td>
              <div><strong>${displayName}</strong></div>
              ${u.business_name && u.full_name ? `<div style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(u.full_name)}</div>` : ''}
            </td>
            <td style="font-size:0.9rem;">${escapeHtml(u.email) || 'N/A'}</td>
            <td>
              <span style="padding:4px 10px;border-radius:100px;font-size:0.8rem;background:${roleColor}22;color:${roleColor};">${roleLabel}</span>
            </td>
            <td>
              ${showAlsoMember ? `
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                  <input type="checkbox" ${u.is_also_member ? 'checked' : ''} onchange="toggleDualRole('${u.id}', 'is_also_member', this.checked)" style="width:18px;height:18px;accent-color:var(--accent-blue);">
                  <span style="font-size:0.85rem;color:${u.is_also_member ? 'var(--accent-blue)' : 'var(--text-muted)'};">${u.is_also_member ? 'Yes' : 'No'}</span>
                </label>
              ` : '<span style="color:var(--text-muted);font-size:0.85rem;">N/A</span>'}
            </td>
            <td>
              ${showAlsoProvider ? `
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                  <input type="checkbox" ${u.is_also_provider ? 'checked' : ''} onchange="toggleDualRole('${u.id}', 'is_also_provider', this.checked)" style="width:18px;height:18px;accent-color:var(--accent-gold);">
                  <span style="font-size:0.85rem;color:${u.is_also_provider ? 'var(--accent-gold)' : 'var(--text-muted)'};">${u.is_also_provider ? 'Yes' : 'No'}</span>
                </label>
              ` : '<span style="color:var(--text-muted);font-size:0.85rem;">N/A</span>'}
            </td>
            <td style="font-size:0.85rem;color:var(--text-muted);">${new Date(u.created_at).toLocaleDateString()}</td>
          </tr>
        `;
      }).join('');
    }

    async function toggleDualRole(userId, field, value) {
      try {
        // Task #240: routed through audited server endpoint so the broad
        // "Admins can update any profile" RLS policy can be dropped.
        const res = await fetch('/api/admin/provider-actions/update-user-role', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, [field]: value, actor_id: currentUser?.id || null })
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error('Error updating dual role:', json);
          showToast('Failed to update user role', 'error');
          await loadUserRoles(); // Reload to reset checkbox
          return;
        }
        
        // Update local data
        const user = allUsersForRoles.find(u => u.id === userId);
        if (user) {
          user[field] = value;
        }
        
        const action = value ? 'enabled' : 'disabled';
        const roleType = field === 'is_also_member' ? 'member portal access' : 'provider portal access';
        showToast(`${action.charAt(0).toUpperCase() + action.slice(1)} ${roleType}`);
        
        renderUserRoles();
      } catch (err) {
        console.error('toggleDualRole error:', err);
        showToast('Error updating user role', 'error');
      }
    }

    let allPackages = [];
    let currentPackageFilter = 'all';

    async function loadAllPackages(page = 1) {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return;
      
      const state = paginationState.packages;
      state.page = page;
      
      const params = new URLSearchParams({
        page: state.page,
        limit: state.limit,
        search: state.search,
        filter: state.filter
      });
      
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const response = await fetch(`${apiBase}/api/admin/packages?${params}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        // Task #355 — route 401/403 to the shared "Sign in again" prompt.
        if (response.status === 401 || response.status === 403) {
          const err = new Error(`Admin session rejected on /api/admin/packages (HTTP ${response.status}). Sign in again.`);
          err.code = 'ADMIN_AUTH_REJECTED';
          throw err;
        }
        const result = await response.json();
        
        if (result.success) {
          allPackages = result.data || [];
          state.total = result.total;
          state.totalPages = result.totalPages;
          renderAllPackages();
          updatePackageStats();
        } else {
          console.error('Failed to load packages:', result.error);
          allPackages = [];
          renderAllPackages();
        }
      } catch (err) {
        console.error('Error loading packages:', err);
        if (isAdminAuthError(err)) {
          const tbody = document.getElementById('all-packages-tbody');
          if (tbody) renderAdminAuthErrorRow(tbody, 8, err, () => loadAllPackages(page));
          return;
        }
        allPackages = [];
        renderAllPackages();
      }
    }
    
    function changePackagesPage(delta) {
      const state = paginationState.packages;
      const newPage = state.page + delta;
      if (newPage >= 1 && newPage <= state.totalPages) {
        loadAllPackages(newPage);
      }
    }
    
    function searchPackages() {
      debounceSearch('packages', () => {
        const searchInput = document.getElementById('package-search');
        paginationState.packages.search = searchInput?.value || '';
        paginationState.packages.page = 1;
        loadAllPackages(1);
      });
    }
    
    function filterPackagesApi(filter) {
      paginationState.packages.filter = filter;
      paginationState.packages.page = 1;
      currentPackageFilter = filter;
      
      // Update tab active state
      const tabs = document.querySelectorAll('#packages-tabs .tab');
      tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.filter === filter);
      });
      
      loadAllPackages(1);
    }
    
    function updatePackageStats() {
      const now = new Date();
      document.getElementById('packages-open').textContent = allPackages.filter(p => p.status === 'open' && (!p.bidding_deadline || new Date(p.bidding_deadline) > now)).length;
      document.getElementById('packages-accepted').textContent = allPackages.filter(p => p.status === 'accepted').length;
      document.getElementById('packages-in-progress').textContent = allPackages.filter(p => p.status === 'in_progress').length;
      document.getElementById('packages-completed').textContent = allPackages.filter(p => p.status === 'completed').length;
    }

    function renderAllPackages() {
      const now = new Date();
      let filtered = allPackages;

      if (currentPackageFilter !== 'all') {
        if (currentPackageFilter === 'expired') {
          filtered = allPackages.filter(p => p.status === 'open' && p.bidding_deadline && new Date(p.bidding_deadline) < now);
        } else {
          filtered = allPackages.filter(p => p.status === currentPackageFilter);
        }
      }

      const tbody = document.getElementById('packages-table');
      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No packages found</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(p => {
        const isExpired = p.status === 'open' && p.bidding_deadline && new Date(p.bidding_deadline) < now;
        const displayStatus = isExpired ? 'expired' : p.status;
        const vehicle = p.vehicles;
        const vehicleName = vehicle ? `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim() : 'N/A';
        
        return `
          <tr>
            <td><strong>${p.title}</strong></td>
            <td>${p.member?.full_name || p.member?.email || 'Unknown'}</td>
            <td>${vehicleName}</td>
            <td>${p.category || 'N/A'}</td>
            <td>${p.bid_count || 0}</td>
            <td><span class="status-badge ${displayStatus}">${displayStatus}</span></td>
            <td>${new Date(p.created_at).toLocaleDateString()}</td>
          </tr>
        `;
      }).join('');
      
      // Add pagination controls
      const paginationContainer = document.getElementById('packages-pagination');
      if (paginationContainer) {
        paginationContainer.innerHTML = renderPaginationControls(paginationState.packages, 'changePackagesPage');
      }
    }


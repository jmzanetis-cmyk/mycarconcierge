    // ========== PILOT APPLICATIONS ==========
    let pilotApplications = [];
    let currentPilotFilter = 'pending';

    async function loadPilotApplications() {
      try {
        const { data, error } = await supabaseClient
          .from('pilot_applications')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error loading pilot applications:', error);
          pilotApplications = [];
        } else {
          pilotApplications = data || [];
        }

        updatePilotStats();
        renderPilotApplications();
        // Task #139 — Gatekeeper screens applications.
        if (typeof globalThis.renderAgentActivityPanel === 'function') {
          try { globalThis.renderAgentActivityPanel('pilot-agent-activity', {
            agentSlug: 'gatekeeper',
            limit: 10, title: 'Recent Gatekeeper Reviews', showEmpty: false,
            linkContext: { section: 'pilot-applications' }
          }); } catch { /* Intentionally silent */ }
        }
      } catch (err) {
        console.error('loadPilotApplications error:', err);
      }
    }

    function updatePilotStats() {
      const pending = pilotApplications.filter(a => a.status === 'pending').length;
      const approved = pilotApplications.filter(a => a.status === 'approved').length;
      const rejected = pilotApplications.filter(a => a.status === 'rejected').length;

      document.getElementById('pilot-pending').textContent = pending;
      document.getElementById('pilot-approved').textContent = approved;
      document.getElementById('pilot-rejected').textContent = rejected;
      document.getElementById('pilot-count').textContent = pending;
      document.getElementById('pilot-count').style.display = pending > 0 ? 'inline' : 'none';
    }

    function renderPilotApplications() {
      const tbody = document.getElementById('pilot-applications-table');
      let filtered = pilotApplications;

      if (currentPilotFilter !== 'all') {
        filtered = pilotApplications.filter(a => a.status === currentPilotFilter);
      }

      if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No ${currentPilotFilter} pilot applications</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(app => {
        const services = Array.isArray(app.services) ? app.services.join(', ') : (app.services || 'N/A');
        const location = `${app.city || ''}, ${app.state || ''}`.replace(/^, |, $/g, '') || 'N/A';
        
        return `
          <tr>
            <td>
              <div><strong>${app.business_name || 'Unnamed'}</strong></div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${app.contact_name || ''}</div>
            </td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${services}">${services}</td>
            <td>${location}</td>
            <td>${app.phone || 'N/A'}</td>
            <td>${new Date(app.created_at).toLocaleDateString()}</td>
            <td><span class="status-badge ${app.status}">${app.status}</span></td>
            <td>
              <div style="display:flex;gap:4px;">
                <button class="btn btn-secondary btn-sm" onclick="viewPilotApplication('${app.id}')">View</button>
                ${app.status === 'pending' ? `
                  <button class="btn btn-success btn-sm" onclick="approvePilotApplication('${app.id}')">${mccIcon('check', 16)}</button>
                  <button class="btn btn-danger btn-sm" onclick="rejectPilotApplication('${app.id}')">${mccIcon('x', 16)}</button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    function viewPilotApplication(id) {
      const app = pilotApplications.find(a => a.id === id);
      if (!app) return;

      const services = Array.isArray(app.services) ? app.services.join(', ') : (app.services || 'N/A');
      
      const modalContent = `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('star', 24)} Founding Provider Application</div>
          <div class="detail-grid">
            <span class="detail-label">Business Name:</span><span class="detail-value">${app.business_name || 'N/A'}</span>
            <span class="detail-label">Contact Name:</span><span class="detail-value">${app.contact_name || 'N/A'}</span>
            <span class="detail-label">Email:</span><span class="detail-value">${app.email || 'N/A'}</span>
            <span class="detail-label">Phone:</span><span class="detail-value">${app.phone || 'N/A'}</span>
            <span class="detail-label">Location:</span><span class="detail-value">${app.city || ''}, ${app.state || ''}</span>
            <span class="detail-label">Years Experience:</span><span class="detail-value">${app.years_experience || 'N/A'}</span>
            <span class="detail-label">Services:</span><span class="detail-value">${services}</span>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">About the Business</div>
          <p style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);line-height:1.6;">${app.about_business || 'No description provided.'}</p>
        </div>

        <div class="form-section">
          <div class="form-section-title">Agreements</div>
          <div style="display:grid;gap:8px;">
            <div style="display:flex;align-items:center;gap:8px;">
              ${app.agree_tos ? mccIcon('check-circle', 16) : mccIcon('x', 16)} Agreed to Terms of Service
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              ${app.agree_contractor ? mccIcon('check-circle', 16) : mccIcon('x', 16)} Agreed to Independent Contractor Terms
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              ${app.agree_accuracy ? mccIcon('check-circle', 16) : mccIcon('x', 16)} Confirmed Information Accuracy
            </div>
          </div>
        </div>

        <div class="form-section" style="border-bottom:none;">
          <div class="detail-grid">
            <span class="detail-label">Status:</span><span class="detail-value"><span class="status-badge ${app.status}">${app.status}</span></span>
            <span class="detail-label">Submitted:</span><span class="detail-value">${new Date(app.created_at).toLocaleString()}</span>
          </div>
        </div>
      `;

      document.getElementById('application-modal-body').innerHTML = modalContent;
      
      // Update modal footer buttons based on status
      const modalFooter = document.querySelector('#application-modal .modal-footer');
      if (app.status === 'pending') {
        modalFooter.innerHTML = `
          <button class="btn btn-secondary" onclick="closeModal('application-modal')">Close</button>
          <button class="btn btn-danger" onclick="rejectPilotApplication('${app.id}'); closeModal('application-modal');">Reject</button>
          <button class="btn btn-success" onclick="approvePilotApplication('${app.id}'); closeModal('application-modal');">Approve as Founding Provider</button>
        `;
      } else {
        modalFooter.innerHTML = `
          <button class="btn btn-secondary" onclick="closeModal('application-modal')">Close</button>
        `;
      }

      openModal('application-modal');
    }

    async function approvePilotApplication(id) {
      const app = pilotApplications.find(a => a.id === id);
      if (!app) return;

      if (!confirm(`Approve ${app.business_name} as a Founding Provider?\n\nThis will create their provider profile with Founding Provider status.`)) return;

      try {
        // Task #240: pilot application approval is now an audited server
        // endpoint. The browser previously updated pilot_applications and
        // profiles directly via supabaseClient — that relied on the
        // "Admins can update any profile" RLS policy which is being dropped.
        // Look up the matching profile (read is fine under RLS) and pass its
        // id to the server, which performs both writes under the
        // service-role client and writes an admin_audit_log row.
        const { data: existingProfile } = await supabaseClient
          .from('profiles')
          .select('id')
          .eq('email', app.email)
          .maybeSingle();

        const res = await fetch('/api/admin/provider-actions/approve-application', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            application_id: id,
            profile_id: existingProfile?.id || null,
            business_name: app.business_name,
            business_phone: app.phone,
            city: app.city,
            state: app.state,
            approved_by: currentUser.id
          })
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(json.error || `Approval failed (${res.status})`, 'error');
          console.error('Approval error:', json);
          return;
        }

        showToast(`${app.business_name} approved as Founding Provider!`, 'success');
        await loadPilotApplications();
        await loadProviders();
      } catch (err) {
        console.error('approvePilotApplication error:', err);
        showToast('Error approving application', 'error');
      }
    }

    async function rejectPilotApplication(id) {
      const app = pilotApplications.find(a => a.id === id);
      if (!app) return;

      const reason = prompt('Reason for rejection (optional):');
      if (reason === null) return; // Cancelled

      try {
        const { error } = await supabaseClient
          .from('pilot_applications')
          .update({ 
            status: 'rejected',
            rejection_reason: reason || null,
            rejected_at: new Date().toISOString(),
            rejected_by: currentUser.id
          })
          .eq('id', id);

        if (error) {
          showToast('Failed to reject application', 'error');
          console.error('Rejection error:', error);
          return;
        }

        showToast(`Application rejected`, 'success');
        await loadPilotApplications();
      } catch (err) {
        console.error('rejectPilotApplication error:', err);
        showToast('Error rejecting application', 'error');
      }
    }

    // Setup pilot applications tabs
    document.getElementById('pilot-tabs')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab')) {
        document.querySelectorAll('#pilot-tabs .tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentPilotFilter = e.target.dataset.filter;
        renderPilotApplications();
      }
    });

    // ========== DRIVER APPLICATIONS ==========
    let driverApplications = [];

    async function loadDriverApplications() {
      try {
        const { data, error } = await supabaseClient
          .from('profiles')
          .select('id, full_name, email, phone, city, state, created_at, role')
          .eq('role', 'pending_driver')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('loadDriverApplications error:', error);
          driverApplications = [];
          renderDriverApplications();
          return;
        }

        const profileIds = (data || []).map(p => p.id);
        let driverRows = [];
        if (profileIds.length) {
          // Task: admin-portal audit Tier 3 — drivers has no admin RLS policy
          // (by design, it's PII); admin_list_drivers() is the only sanctioned
          // read path. Filter client-side to just this batch of applicants.
          const { data: driversData, error: driversErr } = await supabaseClient.rpc('admin_list_drivers');
          if (driversErr) console.error('admin_list_drivers failed:', driversErr);
          driverRows = (driversData || []).filter(d => profileIds.includes(d.profile_id));
        }
        const driverByProfileId = {};
        driverRows.forEach(d => { driverByProfileId[d.profile_id] = d; });
        driverApplications = (data || []).map(p => ({ ...p, _driver: driverByProfileId[p.id] || null }));

        renderDriverApplications();

        const badge = document.getElementById('driver-apps-badge');
        if (badge) {
          badge.textContent = driverApplications.length;
          badge.style.display = driverApplications.length > 0 ? 'inline' : 'none';
        }
      } catch (err) {
        console.error('loadDriverApplications error:', err);
      }
    }

    function renderDriverApplications() {
      const tbody = document.getElementById('driver-applications-table');
      if (!tbody) return;

      if (!driverApplications.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No pending driver applications</td></tr>';
        return;
      }

      tbody.innerHTML = driverApplications.map(profile => {
        const driver = profile._driver;
        let notes = {};
        try { notes = JSON.parse(driver?.notes || '{}'); } catch { /* ignore */ }
        const vehicle = [notes.vehicle_year, notes.vehicle_make, notes.vehicle_model].filter(Boolean).join(' ') || 'Not provided';
        const location = [profile.city, profile.state].filter(Boolean).join(', ') || 'N/A';
        const bgcStatus = driver?.bgc_status || 'not_started';

        const bgcBadgeMap = {
          not_started: ['#888', 'BGC: Not Started'],
          pending_check: ['#f59e0b', 'BGC: Pending'],
          passed: ['#10b981', 'BGC: Passed'],
          consider: ['#f59e0b', 'BGC: Review Required'],
          failed: ['#ef4444', 'BGC: Failed'],
        };
        const [bgcColor, bgcLabel] = bgcBadgeMap[bgcStatus] || ['#888', bgcStatus];
        const bgcBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:0.72rem;font-weight:600;background:${bgcColor}22;color:${bgcColor};border:1px solid ${bgcColor}55;">${bgcLabel}</span>`;

        const canApprove = bgcStatus === 'passed' || bgcStatus === 'consider';
        const approveBtn = canApprove
          ? `<button class="btn btn-success btn-sm" onclick="approveDriver('${profile.id}')" title="Approve">${mccIcon('check', 16)}</button>`
          : `<button class="btn btn-secondary btn-sm" disabled title="BGC required before approval" style="opacity:0.4;cursor:not-allowed;">${mccIcon('check', 16)}</button>`;

        let bgcActionBtn = '';
        if (bgcStatus === 'not_started') {
          bgcActionBtn = `<button class="btn btn-secondary btn-sm" onclick="runDriverBgc('${profile.id}')" title="Initiate Background Check">Run BGC</button>`;
        } else if (bgcStatus === 'pending_check') {
          bgcActionBtn = `<button class="btn btn-secondary btn-sm" disabled style="opacity:0.5;cursor:not-allowed;">BGC Pending…</button>`;
        }

        return `
          <tr>
            <td>
              <div><strong>${escapeHtml(profile.full_name || 'No name')}</strong></div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(profile.email || '')}</div>
              <div style="margin-top:4px;">${bgcBadge}</div>
            </td>
            <td>${escapeHtml(profile.phone || 'N/A')}</td>
            <td>${escapeHtml(location)}</td>
            <td>${escapeHtml(vehicle)}</td>
            <td>${new Date(profile.created_at).toLocaleDateString()}</td>
            <td>
              <div style="display:flex;gap:4px;flex-wrap:wrap;">
                <button class="btn btn-secondary btn-sm" onclick="viewDriverApplication('${profile.id}')">View</button>
                ${bgcActionBtn}
                ${approveBtn}
                <button class="btn btn-danger btn-sm" onclick="rejectDriver('${profile.id}')" title="Reject">${mccIcon('x', 16)}</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    function viewDriverApplication(profileId) {
      const profile = driverApplications.find(p => p.id === profileId);
      if (!profile) return;

      const driver = profile._driver;
      let notes = {};
      try { notes = JSON.parse(driver?.notes || '{}'); } catch { /* ignore */ }

      const modalContent = `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('truck', 24)} Driver Application</div>
          <div class="detail-grid">
            <span class="detail-label">Full Name:</span><span class="detail-value">${escapeHtml(profile.full_name || 'N/A')}</span>
            <span class="detail-label">Email:</span><span class="detail-value">${escapeHtml(profile.email || 'N/A')}</span>
            <span class="detail-label">Phone:</span><span class="detail-value">${escapeHtml(profile.phone || 'N/A')}</span>
            <span class="detail-label">Location:</span><span class="detail-value">${escapeHtml([profile.city, profile.state].filter(Boolean).join(', ') || 'N/A')}</span>
            <span class="detail-label">Availability:</span><span class="detail-value">${escapeHtml(notes.availability || 'N/A')}</span>
          </div>
        </div>
        <div class="form-section">
          <div class="form-section-title">Vehicle &amp; License</div>
          <div class="detail-grid">
            <span class="detail-label">License Number:</span><span class="detail-value">${escapeHtml(notes.license_number || 'N/A')}</span>
            <span class="detail-label">License State:</span><span class="detail-value">${escapeHtml(notes.license_state || 'N/A')}</span>
            <span class="detail-label">Vehicle Year:</span><span class="detail-value">${escapeHtml(notes.vehicle_year || 'N/A')}</span>
            <span class="detail-label">Vehicle Make:</span><span class="detail-value">${escapeHtml(notes.vehicle_make || 'N/A')}</span>
            <span class="detail-label">Vehicle Model:</span><span class="detail-value">${escapeHtml(notes.vehicle_model || 'N/A')}</span>
            <span class="detail-label">Vehicle Color:</span><span class="detail-value">${escapeHtml(notes.vehicle_color || 'N/A')}</span>
          </div>
        </div>
        <div class="form-section" style="border-bottom:none;">
          <div class="detail-grid">
            <span class="detail-label">Applied:</span><span class="detail-value">${new Date(profile.created_at).toLocaleString()}</span>
          </div>
        </div>
      `;

      document.getElementById('application-modal-body').innerHTML = modalContent;
      const modalFooter = document.querySelector('#application-modal .modal-footer');
      if (modalFooter) {
        const bgcStatus = driver?.bgc_status || 'not_started';
        const canApprove = bgcStatus === 'passed' || bgcStatus === 'consider';
        const approveModalBtn = canApprove
          ? `<button class="btn btn-success" onclick="approveDriver('${profile.id}'); closeModal('application-modal');">Approve Driver</button>`
          : `<button class="btn btn-secondary" disabled style="opacity:0.5;cursor:not-allowed;">BGC Required</button>`;
        const bgcModalBtn = bgcStatus === 'not_started'
          ? `<button class="btn btn-secondary" onclick="runDriverBgc('${profile.id}')">Run BGC</button>`
          : '';
        modalFooter.innerHTML = `
          <button class="btn btn-secondary" onclick="closeModal('application-modal')">Close</button>
          ${bgcModalBtn}
          <button class="btn btn-danger" onclick="rejectDriver('${profile.id}'); closeModal('application-modal');">Reject</button>
          ${approveModalBtn}
        `;
      }
      openModal('application-modal');
    }

    async function runDriverBgc(profileId) {
      const profile = driverApplications.find(p => p.id === profileId);
      if (!profile) return;
      if (!confirm(`Initiate background check for ${profile.full_name || profile.email}?`)) return;

      try {
        const res = await fetch('/api/admin/driver-bgc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
          body: JSON.stringify({ profile_id: profileId }),
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'BGC initiation failed', 'error');
          return;
        }
        showToast(data.mocked ? 'BGC ordered (mock mode)' : 'Background check ordered — awaiting results', 'success');
        await loadDriverApplications();
      } catch (err) {
        console.error('runDriverBgc error:', err);
        showToast('Error initiating background check', 'error');
      }
    }

    async function approveDriver(profileId) {
      const profile = driverApplications.find(p => p.id === profileId);
      if (!profile) return;

      const bgcStatus = profile._driver?.bgc_status || 'not_started';
      if (bgcStatus !== 'passed' && bgcStatus !== 'consider') {
        showToast('Background check must pass before approving this driver', 'error');
        return;
      }

      if (!confirm(`Approve ${profile.full_name || profile.email} as an MCC Driver?`)) return;

      try {
        // Task: admin-portal audit Tier 3 — both writes below used to go
        // straight to supabaseClient (profiles.role had no working admin
        // policy since 20260515c; drivers never had one at all), so this
        // silently did nothing. RPC first: it re-checks the BGC gate
        // server-side, so the profile role never flips to 'driver' unless
        // the drivers-table write actually succeeds.
        const { error: driverError } = await supabaseClient.rpc('admin_approve_driver', {
          p_profile_id: profileId,
          p_full_name: profile.full_name || null,
          p_phone: profile.phone || null,
          p_email: profile.email || null
        });
        if (driverError) {
          showToast('Failed to approve driver: ' + driverError.message, 'error');
          console.error('admin_approve_driver error:', driverError);
          return;
        }

        const res = await fetch('/api/admin/provider-actions/update-user-role', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: profileId, role: 'driver', actor_id: currentUser?.id || null })
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast('Driver approved, but profile role failed to update: ' + (json.error || res.status), 'error');
          console.error('update-user-role error:', json);
          return;
        }

        showToast(`${profile.full_name || 'Driver'} approved!`, 'success');
        await loadDriverApplications();
      } catch (err) {
        console.error('approveDriver error:', err);
        showToast('Error approving driver', 'error');
      }
    }

    async function rejectDriver(profileId) {
      const profile = driverApplications.find(p => p.id === profileId);
      if (!profile) return;
      if (!confirm(`Reject driver application from ${profile.full_name || profile.email}?`)) return;

      try {
        const res = await fetch('/api/admin/provider-actions/update-user-role', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: profileId, role: 'rejected_driver', actor_id: currentUser?.id || null })
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast('Failed to reject application: ' + (json.error || res.status), 'error');
          console.error('rejectDriver error:', json);
          return;
        }

        showToast('Driver application rejected', 'success');
        await loadDriverApplications();
      } catch (err) {
        console.error('rejectDriver error:', err);
        showToast('Error rejecting driver', 'error');
      }
    }

    globalThis.approveDriver = approveDriver;
    globalThis.rejectDriver = rejectDriver;
    globalThis.viewDriverApplication = viewDriverApplication;
    globalThis.runDriverBgc = runDriverBgc;

    // ========== MEMBER FOUNDER APPLICATIONS ==========
    let memberFounderApplications = [];
    // ========== ACTIVE DRIVERS ==========
    let _activeDriversCache = [];

    async function loadActiveDrivers() {
      const tbody = document.getElementById('active-drivers-table');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Loading…</td></tr>';
      try {
        // Task: admin-portal audit Tier 3 — drivers has no admin RLS policy;
        // admin_list_drivers() is the sanctioned read path (see 20260903d).
        const { data, error } = await supabaseClient.rpc('admin_list_drivers');
        if (error) throw error;
        const rows = data || [];
        _activeDriversCache = rows;

        const dEl = id => document.getElementById(id);
        if (dEl('active-drivers-total'))    dEl('active-drivers-total').textContent   = rows.length;
        if (dEl('active-drivers-stripe-ok')) dEl('active-drivers-stripe-ok').textContent = rows.filter(r => r.stripe_payouts_enabled).length;
        if (dEl('active-drivers-bgc-ok'))   dEl('active-drivers-bgc-ok').textContent  = rows.filter(r => r.bgc_status === 'passed').length;
        if (dEl('active-drivers-rides'))    dEl('active-drivers-rides').textContent   = rows.reduce((s, r) => s + (r.total_rides_completed || 0), 0);

        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No approved drivers yet</td></tr>';
          return;
        }

        const bgcBadge = s => {
          const map = { passed: ['#10b981','Passed'], pending_check: ['#f59e0b','Pending'], consider: ['#f59e0b','Review'], failed: ['#ef4444','Failed'], not_started: ['#6b7280','—'] };
          const [c, l] = map[s] || ['#6b7280', s || '—'];
          return `<span style="padding:2px 8px;border-radius:9999px;font-size:0.72rem;font-weight:600;background:${c}22;color:${c};border:1px solid ${c}55;">${l}</span>`;
        };
        const stripeBadge = (acct, enabled) => enabled
          ? `<span style="padding:2px 8px;border-radius:9999px;font-size:0.72rem;font-weight:600;background:#10b98122;color:#10b981;border:1px solid #10b98155;">Connected</span>`
          : acct
            ? `<span style="padding:2px 8px;border-radius:9999px;font-size:0.72rem;font-weight:600;background:#f59e0b22;color:#f59e0b;border:1px solid #f59e0b55;">Pending</span>`
            : `<span style="padding:2px 8px;border-radius:9999px;font-size:0.72rem;font-weight:600;background:#6b728022;color:#6b7280;border:1px solid #6b728055;">Not linked</span>`;
        const statusBadge = s => {
          const map = { active: '#10b981', inactive: '#6b7280', suspended: '#ef4444' };
          const c = map[s] || '#6b7280';
          return `<span style="padding:2px 8px;border-radius:9999px;font-size:0.72rem;font-weight:600;background:${c}22;color:${c};border:1px solid ${c}55;">${s || 'unknown'}</span>`;
        };

        tbody.innerHTML = rows.map(d => `
          <tr>
            <td>
              <div><strong>${escapeHtml(d.full_name || 'No name')}</strong></div>
              <div style="font-size:0.78rem;color:var(--text-muted);">${escapeHtml(d.phone || '')}</div>
            </td>
            <td style="font-size:0.85rem;">${escapeHtml(d.email || '—')}</td>
            <td>${statusBadge(d.status)}</td>
            <td>${bgcBadge(d.bgc_status)}</td>
            <td>${stripeBadge(d.stripe_connect_account_id, d.stripe_payouts_enabled)}</td>
            <td style="text-align:center;">${d.total_rides_completed || 0}</td>
            <td style="text-align:center;">${d.average_rating ? Number(d.average_rating).toFixed(1) + ' ★' : '—'}</td>
            <td style="font-size:0.82rem;color:var(--text-muted);">${new Date(d.created_at).toLocaleDateString()}</td>
            <td>
              <div style="display:flex;gap:4px;flex-wrap:wrap;">
                <button class="btn btn-secondary btn-sm" onclick="viewActiveDriver('${d.id}')">View</button>
                ${d.status !== 'suspended' ? `<button class="btn btn-danger btn-sm" onclick="suspendDriver('${d.id}')">Suspend</button>` : `<button class="btn btn-success btn-sm" onclick="reactivateDriver('${d.id}')">Reactivate</button>`}
              </div>
            </td>
          </tr>`).join('');
      } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="empty-state" style="color:var(--accent-red);">Error loading drivers: ${escapeHtml(err.message)}</td></tr>`;
      }
    }

    async function viewActiveDriver(driverId) {
      const d = _activeDriversCache.find(x => x.id === driverId);
      if (!d) return alert('Driver not found');
      const html = `<div class="form-section">
        <div class="form-section-title">Driver Profile</div>
        <div class="detail-grid">
          <span class="detail-label">Name:</span><span class="detail-value">${escapeHtml(d.full_name || '—')}</span>
          <span class="detail-label">Email:</span><span class="detail-value">${escapeHtml(d.email || '—')}</span>
          <span class="detail-label">Phone:</span><span class="detail-value">${escapeHtml(d.phone || '—')}</span>
          <span class="detail-label">Status:</span><span class="detail-value">${escapeHtml(d.status || '—')}</span>
          <span class="detail-label">Vehicle Class:</span><span class="detail-value">${escapeHtml(d.vehicle_class || '—')}</span>
          <span class="detail-label">BGC Status:</span><span class="detail-value">${escapeHtml(d.bgc_status || 'not_started')}</span>
          <span class="detail-label">BGC Checked:</span><span class="detail-value">${d.bgc_checked_at ? new Date(d.bgc_checked_at).toLocaleDateString() : '—'}</span>
          <span class="detail-label">Stripe Account:</span><span class="detail-value">${escapeHtml(d.stripe_connect_account_id || 'Not linked')}</span>
          <span class="detail-label">Payouts Enabled:</span><span class="detail-value">${d.stripe_payouts_enabled ? 'Yes' : 'No'}</span>
          <span class="detail-label">Hourly Rate:</span><span class="detail-value">${d.hourly_rate_cents ? '$' + (d.hourly_rate_cents / 100).toFixed(2) : '—'}</span>
          <span class="detail-label">Total Rides:</span><span class="detail-value">${d.total_rides_completed || 0}</span>
          <span class="detail-label">Avg Rating:</span><span class="detail-value">${d.average_rating ? Number(d.average_rating).toFixed(2) + ' / 5' : '—'}</span>
          <span class="detail-label">Joined:</span><span class="detail-value">${new Date(d.created_at).toLocaleDateString()}</span>
        </div></div>`;
      showModal('Driver Details', html);
    }

    async function suspendDriver(driverId) {
      if (!confirm('Suspend this driver? They will not receive new ride requests.')) return;
      const { error } = await supabaseClient.rpc('admin_set_driver_status', { p_driver_id: driverId, p_status: 'suspended' });
      if (error) return alert('Error: ' + error.message);
      loadActiveDrivers();
    }

    async function reactivateDriver(driverId) {
      if (!confirm('Reactivate this driver?')) return;
      const { error } = await supabaseClient.rpc('admin_set_driver_status', { p_driver_id: driverId, p_status: 'active' });
      if (error) return alert('Error: ' + error.message);
      loadActiveDrivers();
    }

    globalThis.loadActiveDrivers  = loadActiveDrivers;
    globalThis.viewActiveDriver   = viewActiveDriver;
    globalThis.suspendDriver      = suspendDriver;
    globalThis.reactivateDriver   = reactivateDriver;

    // ========== TRANSPORT MANAGEMENT ==========

    let _transportAllRides = [];

    async function loadTransportRides() {
      const tbody = document.getElementById('transport-table');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Loading…</td></tr>';
      try {
        // Fetch rides with member and driver profile joins
        const { data, error } = await supabaseClient
          .from('rides')
          .select(`id, status, pickup_address, dropoff_address, estimated_fare, actual_fare, gross_fare, tip_amount,
                   base_rate, multiplier_rate, multiplier_label, pickup_wait_cents, dropoff_wait_cents,
                   payment_status, cancellation_reason, member_rating, requested_at, completed_at, cancelled_at, created_at,
                   member:member_id(full_name, email),
                   provider:provider_id(full_name)`)
          .order('created_at', { ascending: false })
          .limit(200);
        if (error) throw error;
        _transportAllRides = data || [];
        renderTransportRides();
      } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="empty-state" style="color:var(--accent-red);">Error: ${escapeHtml(err.message)}</td></tr>`;
      }
    }

    function filterTransportRides() { paginationState.transport.page = 1; renderTransportRides(); }

    function renderTransportRides() {
      const tbody = document.getElementById('transport-table');
      if (!tbody) return;
      const filter = document.getElementById('transport-status-filter')?.value || '';
      const rows = filter ? _transportAllRides.filter(r => r.status === filter) : _transportAllRides;

      const total     = _transportAllRides.length;
      const completed = _transportAllRides.filter(r => r.status === 'completed').length;
      const cancelled = _transportAllRides.filter(r => r.status === 'cancelled').length;
      const fares     = _transportAllRides.filter(r => r.status === 'completed').map(r => r.actual_fare || r.estimated_fare || 0);
      const avgFare   = fares.length ? fares.reduce((s, v) => s + v, 0) / fares.length : 0;
      const completion = total ? Math.round((completed / (total - (total - completed - cancelled > 0 ? total - completed - cancelled : 0))) * 100) : 0;

      const dEl = id => document.getElementById(id);
      if (dEl('transport-total'))          dEl('transport-total').textContent          = total;
      if (dEl('transport-completed'))      dEl('transport-completed').textContent      = completed;
      if (dEl('transport-cancelled'))      dEl('transport-cancelled').textContent      = cancelled;
      if (dEl('transport-avg-fare'))       dEl('transport-avg-fare').textContent       = '$' + avgFare.toFixed(2);
      if (dEl('transport-completion-rate')) dEl('transport-completion-rate').textContent = completed + '/' + total;

      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No rides${filter ? ' matching filter' : ''}</td></tr>`;
        return;
      }

      const statusColor = s => ({
        completed: '#10b981', cancelled: '#ef4444', in_progress: '#3b82f6',
        driver_en_route: '#f59e0b', accepted: '#6366f1', requested: '#6b7280', dispatched: '#f59e0b', driver_arrived: '#3b82f6'
      })[s] || '#6b7280';

      const sortedRides = applySortToRows(rows, sortState.transport, (r, col) => {
        if (col === 'status') return r.status;
        if (col === 'member') return r.member?.full_name || r.member?.email || '';
        if (col === 'driver') return r.provider?.full_name || '';
        if (col === 'fare') return r.actual_fare || r.estimated_fare || 0;
        if (col === 'created_at') return new Date(r.created_at).getTime();
        return null;
      });

      const pagedRides = applyClientPagination(sortedRides, paginationState.transport);

      tbody.innerHTML = pagedRides.map(r => {
        const fare = r.actual_fare || r.estimated_fare || 0;
        const memberName = r.member?.full_name || r.member?.email || '—';
        const driverName = r.provider?.full_name || '—';
        const date = new Date(r.created_at).toLocaleDateString() + ' ' + new Date(r.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
        const c = statusColor(r.status);
        return `<tr>
          <td><span style="padding:2px 8px;border-radius:9999px;font-size:0.72rem;font-weight:600;background:${c}22;color:${c};border:1px solid ${c}55;">${escapeHtml(r.status || '—')}</span></td>
          <td style="font-size:0.85rem;">${escapeHtml(memberName)}</td>
          <td style="font-size:0.85rem;">${escapeHtml(driverName)}</td>
          <td style="font-size:0.82rem;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(r.pickup_address||'')}">${escapeHtml(r.pickup_address||'—')}</td>
          <td style="font-size:0.82rem;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(r.dropoff_address||'')}">${escapeHtml(r.dropoff_address||'—')}</td>
          <td style="font-weight:600;">$${Number(fare).toFixed(2)}</td>
          <td style="font-size:0.82rem;color:var(--text-muted);">${date}</td>
          <td>
            <div style="display:flex;gap:4px;">
              <button class="btn btn-secondary btn-sm" onclick="viewTransportRide('${r.id}')">Detail</button>
              ${['requested','dispatched','accepted','driver_en_route','driver_arrived'].includes(r.status) ? `<button class="btn btn-danger btn-sm" onclick="cancelTransportRide('${r.id}')">Cancel</button>` : ''}
            </div>
          </td>
        </tr>`;
      }).join('');
      updateSortIndicators('transport-table', sortState.transport);
      const transPagEl = document.getElementById('transport-pagination');
      if (transPagEl) transPagEl.innerHTML = renderPaginationControls(paginationState.transport, 'changeTransportPage', 'changeTransportPageSize');
    }

    async function viewTransportRide(rideId) {
      const r = _transportAllRides.find(x => x.id === rideId);
      if (!r) return;
      const fare = r.actual_fare || r.estimated_fare || 0;
      const html = `<div class="form-section">
        <div class="form-section-title">Ride Details — ${escapeHtml(r.id)}</div>
        <div class="detail-grid">
          <span class="detail-label">Status:</span><span class="detail-value">${escapeHtml(r.status)}</span>
          <span class="detail-label">Member:</span><span class="detail-value">${escapeHtml(r.member?.full_name || r.member?.email || '—')}</span>
          <span class="detail-label">Driver:</span><span class="detail-value">${escapeHtml(r.provider?.full_name || '—')}</span>
          <span class="detail-label">Pickup:</span><span class="detail-value">${escapeHtml(r.pickup_address||'—')}</span>
          <span class="detail-label">Dropoff:</span><span class="detail-value">${escapeHtml(r.dropoff_address||'—')}</span>
          <span class="detail-label">Base Rate:</span><span class="detail-value">$${Number(r.base_rate||0).toFixed(2)}</span>
          ${r.multiplier_rate && r.multiplier_rate !== 1 ? `<span class="detail-label">Multiplier:</span><span class="detail-value">${r.multiplier_label || ''} ×${r.multiplier_rate}</span>` : ''}
          <span class="detail-label">Estimated Fare:</span><span class="detail-value">$${Number(r.estimated_fare||0).toFixed(2)}</span>
          <span class="detail-label">Actual Fare:</span><span class="detail-value">$${Number(r.actual_fare||0).toFixed(2)}</span>
          ${r.tip_amount ? `<span class="detail-label">Tip:</span><span class="detail-value">$${Number(r.tip_amount).toFixed(2)}</span>` : ''}
          ${r.pickup_wait_cents ? `<span class="detail-label">Pickup Wait:</span><span class="detail-value">$${(r.pickup_wait_cents/100).toFixed(2)}</span>` : ''}
          ${r.dropoff_wait_cents ? `<span class="detail-label">Dropoff Wait:</span><span class="detail-value">$${(r.dropoff_wait_cents/100).toFixed(2)}</span>` : ''}
          <span class="detail-label">Payment:</span><span class="detail-value">${escapeHtml(r.payment_status||'—')}</span>
          ${r.member_rating ? `<span class="detail-label">Member Rating:</span><span class="detail-value">${r.member_rating} ★</span>` : ''}
          ${r.cancellation_reason ? `<span class="detail-label">Cancel Reason:</span><span class="detail-value">${escapeHtml(r.cancellation_reason)}</span>` : ''}
          <span class="detail-label">Requested:</span><span class="detail-value">${r.requested_at ? new Date(r.requested_at).toLocaleString() : new Date(r.created_at).toLocaleString()}</span>
          ${r.completed_at ? `<span class="detail-label">Completed:</span><span class="detail-value">${new Date(r.completed_at).toLocaleString()}</span>` : ''}
        </div>
      </div>`;
      showModal('Ride Detail', html);
    }

    async function cancelTransportRide(rideId) {
      if (!confirm('Cancel this ride? This cannot be undone.')) return;
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const { data: { session } } = await supabaseClient.auth.getSession();
      const r = await fetch(`${apiBase}/api/transport/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ride_id: rideId, reason: 'Admin cancellation' })
      });
      const j = await r.json();
      if (!r.ok) return alert('Cancel failed: ' + (j.error || r.status));
      loadTransportRides();
    }

    globalThis.loadTransportRides   = loadTransportRides;
    globalThis.filterTransportRides = filterTransportRides;
    globalThis.viewTransportRide    = viewTransportRide;
    globalThis.cancelTransportRide  = cancelTransportRide;

    let currentMFFilter = 'pending';
    let _mfActiveProfiles = [];

    async function loadMemberFounderApplications() {
      // If the active-profiles tab is selected, delegate to the profiles loader.
      if (currentMFFilter === 'active-profiles') {
        await loadMemberFounderActiveProfiles();
        return;
      }
      try {
        const { data, error } = await supabaseClient
          .from('member_founder_applications')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error loading member founder applications:', error);
          memberFounderApplications = [];
        } else {
          memberFounderApplications = data || [];
        }

        updateMFStats();
        loadMemberFounderActiveProfilesCount();
        renderMemberFounderApplications();
        // Task #139 — Concierge + Advocate touch member-founder onboarding.
        if (typeof globalThis.renderAgentActivityPanel === 'function') {
          try { globalThis.renderAgentActivityPanel('member-founders-agent-activity', {
            agentSlug: ['concierge', 'advocate'],
            limit: 10, title: 'Recent Member-Founder Agent Activity', showEmpty: false,
            linkContext: { section: 'member-founders' }
          }); } catch { /* Intentionally silent */ }
        }
      } catch (err) {
        console.error('loadMemberFounderApplications error:', err);
      }
    }

    function updateMFStats() {
      const pending = memberFounderApplications.filter(a => a.status === 'pending').length;
      const approved = memberFounderApplications.filter(a => a.status === 'approved').length;
      const rejected = memberFounderApplications.filter(a => a.status === 'rejected').length;

      document.getElementById('mf-pending').textContent = pending;
      document.getElementById('mf-approved').textContent = approved;
      document.getElementById('mf-rejected').textContent = rejected;
      document.getElementById('member-founder-count').textContent = pending;
      document.getElementById('member-founder-count').style.display = pending > 0 ? 'inline' : 'none';
    }

    function renderMemberFounderApplications() {
      const tbody = document.getElementById('member-founders-table');
      let filtered = memberFounderApplications;

      if (currentMFFilter !== 'all') {
        filtered = memberFounderApplications.filter(a => a.status === currentMFFilter);
      }

      if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No ${currentMFFilter} member founder applications</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(app => {
        const promotionLabels = {
          'social_media': 'Social Media',
          'word_of_mouth': 'Word of Mouth',
          'local_business': 'Local Business',
          'car_community': 'Car Community',
          'professional_network': 'Professional Network',
          'content_creation': 'Content Creation',
          'events': 'Events',
          'other': 'Other'
        };
        const promotionMethod = promotionLabels[app.promotion_method] || app.promotion_method || 'N/A';
        
        return `
          <tr>
            <td>
              <div><strong>${app.full_name || 'Unnamed'}</strong></div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${app.phone || ''}</div>
            </td>
            <td>${app.email || 'N/A'}</td>
            <td>${app.location || 'N/A'}</td>
            <td>${promotionMethod}</td>
            <td>${new Date(app.created_at).toLocaleDateString()}</td>
            <td><span class="status-badge ${app.status}">${app.status}</span></td>
            <td>
              <div style="display:flex;gap:4px;flex-wrap:wrap;">
                <button class="btn btn-secondary btn-sm" onclick="viewMemberFounder('${app.id}')">View</button>
                ${(app.status || '').toLowerCase().trim() === 'pending' ? `
                  <button class="btn btn-success btn-sm" onclick="approveMemberFounder('${app.id}')">${mccIcon('check', 16)}</button>
                  <button class="btn btn-danger btn-sm" onclick="rejectMemberFounder('${app.id}')">${mccIcon('x', 16)}</button>
                ` : ''}
                ${['approved', 'active'].includes((app.status || '').toLowerCase().trim()) ? `
                  <button class="btn btn-primary btn-sm" onclick="resendFounderWelcomeEmail('${app.id}')" title="Resend Welcome Email">${mccIcon('mail', 16)}</button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    async function loadMemberFounderActiveProfilesCount() {
      const { count } = await supabaseClient.from('member_founder_profiles').select('*', { count: 'exact', head: true }).eq('status', 'active');
      const badge = document.getElementById('mf-active-badge');
      if (badge) badge.textContent = count || 0;
    }

    async function loadMemberFounderActiveProfiles() {
      const tbody = document.getElementById('member-founders-table');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Loading active founders…</td></tr>';
      const { data, error } = await supabaseClient
        .from('member_founder_profiles')
        .select('id, full_name, email, phone, location, referral_code, status, total_provider_referrals, total_member_referrals, total_commissions_earned')
        .eq('status', 'active')
        .order('total_commissions_earned', { ascending: false });
      if (error) { tbody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:var(--accent-red);">Error: ${escapeHtml(error.message)}</td></tr>`; return; }
      const rows = data || [];
      if (!rows.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No active member founders</td></tr>'; return; }
      tbody.innerHTML = rows.map(r => `
        <tr>
          <td><strong>${escapeHtml(r.full_name || '—')}</strong><div style="font-size:0.78rem;color:var(--text-muted);">${escapeHtml(r.phone||'')}</div></td>
          <td>${escapeHtml(r.email||'—')}</td>
          <td>${escapeHtml(r.location||'—')}</td>
          <td><code style="font-size:0.82rem;">${escapeHtml(r.referral_code||'—')}</code></td>
          <td style="text-align:center;">${r.total_provider_referrals||0} prov / ${r.total_member_referrals||0} mem</td>
          <td style="font-weight:600;color:#10b981;">$${Number(r.total_commissions_earned||0).toFixed(2)}</td>
          <td><span style="padding:2px 8px;border-radius:9999px;font-size:0.72rem;font-weight:600;background:#10b98122;color:#10b981;border:1px solid #10b98155;">active</span></td>
        </tr>`).join('');
    }

    function viewMemberFounder(id) {
      const app = memberFounderApplications.find(a => a.id === id);
      if (!app) return;

      const promotionLabels = {
        'social_media': 'Social Media (Instagram, Facebook, TikTok)',
        'word_of_mouth': 'Word of Mouth / Networking',
        'local_business': 'Local Business Connections',
        'car_community': 'Car Enthusiast Community',
        'professional_network': 'Professional Network',
        'content_creation': 'Content Creation (YouTube, Blog)',
        'events': 'Events & Car Shows',
        'other': 'Other'
      };

      const connectionLabels = {
        'none': 'No existing connections',
        'mechanics': 'Knows mechanics/technicians',
        'detailers': 'Knows detailers/auto spa owners',
        'bodyshops': 'Knows body shop owners',
        'dealership': 'Knows dealership staff',
        'multiple': 'Multiple types of providers',
        'industry_worker': 'Works in the auto industry'
      };
      
      const modalContent = `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('user', 24)} Applicant Information</div>
          <div class="detail-grid">
            <span class="detail-label">Full Name:</span><span class="detail-value">${app.full_name || 'N/A'}</span>
            <span class="detail-label">Email:</span><span class="detail-value">${app.email || 'N/A'}</span>
            <span class="detail-label">Phone:</span><span class="detail-value">${app.phone || 'N/A'}</span>
            <span class="detail-label">Location:</span><span class="detail-value">${app.location || 'N/A'}</span>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('bell', 24)} Promotion Strategy</div>
          <div class="detail-grid">
            <span class="detail-label">Primary Method:</span><span class="detail-value">${promotionLabels[app.promotion_method] || app.promotion_method || 'N/A'}</span>
            <span class="detail-label">Social Following:</span><span class="detail-value">${app.social_following || 'Not specified'}</span>
            <span class="detail-label">Hours/Week:</span><span class="detail-value">${app.hours_available || 'Not specified'}</span>
            <span class="detail-label">Auto Connections:</span><span class="detail-value">${connectionLabels[app.auto_connections] || app.auto_connections || 'Not specified'}</span>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('message-square', 24)} Motivation</div>
          <p style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);line-height:1.6;">${app.motivation || 'No motivation provided.'}</p>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('clipboard-list', 24)} Agreements</div>
          <div style="display:grid;gap:8px;">
            ${app.agreements_accepted ? `
              <div style="display:flex;align-items:center;gap:8px;">
                ${app.agreements_accepted.terms_of_service ? mccIcon('check-circle', 16) : mccIcon('x', 16)} Terms of Service
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                ${app.agreements_accepted.independent_contractor ? mccIcon('check-circle', 16) : mccIcon('x', 16)} Independent Contractor Terms
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                ${app.agreements_accepted.commission_terms ? mccIcon('check-circle', 16) : mccIcon('x', 16)} Commission Terms
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                ${app.agreements_accepted.accurate_information ? mccIcon('check-circle', 16) : mccIcon('x', 16)} Information Accuracy
              </div>
            ` : '<div style="color:var(--text-muted);">Agreement details not available</div>'}
          </div>
        </div>

        <div class="form-section" style="border-bottom:none;">
          <div class="detail-grid">
            <span class="detail-label">Status:</span><span class="detail-value"><span class="status-badge ${app.status}">${app.status}</span></span>
            <span class="detail-label">Submitted:</span><span class="detail-value">${new Date(app.created_at).toLocaleString()}</span>
          </div>
        </div>
      `;

      document.getElementById('application-modal-body').innerHTML = modalContent;
      
      const modalFooter = document.querySelector('#application-modal .modal-footer');
      if (app.status === 'pending') {
        modalFooter.innerHTML = `
          <button class="btn btn-secondary" onclick="closeModal('application-modal')">Close</button>
          <button class="btn btn-danger" onclick="rejectMemberFounder('${app.id}'); closeModal('application-modal');">Reject</button>
          <button class="btn btn-success" onclick="approveMemberFounder('${app.id}'); closeModal('application-modal');">Approve as Member Founder</button>
        `;
      } else {
        modalFooter.innerHTML = `
          <button class="btn btn-secondary" onclick="closeModal('application-modal')">Close</button>
        `;
      }

      openModal('application-modal');
    }

    function generateReferralCode(name) {
      const base = (name || 'MCC').toUpperCase().replace(/[^A-Z]/g, '').substring(0, 4).padEnd(4, 'X');
      const random = Math.floor(1000 + Math.random() * 9000);
      return base + random;
    }

    async function approveMemberFounder(id) {
      const app = memberFounderApplications.find(a => a.id === id);
      if (!app) return;

      if (!confirm(`Approve ${app.full_name} as a Member Founder?\n\nThey will be notified and added to the ambassador program with a unique referral code.`)) return;

      try {
        let referralCode;
        let founderProfileId;
        const normalizedEmail = (app.email || '').trim().toLowerCase();

        const { data: existingProfile } = await supabaseClient
          .from('member_founder_profiles')
          .select('id, referral_code, email')
          .ilike('email', normalizedEmail)
          .maybeSingle();

        if (existingProfile) {
          referralCode = existingProfile.referral_code;
          founderProfileId = existingProfile.id;
          console.log('Found existing founder profile for email:', app.email);

          const { error: updateProfileError } = await supabaseClient
            .from('member_founder_profiles')
            .update({
              application_id: id,
              user_id: app.user_id || null,
              full_name: app.full_name,
              phone: app.phone,
              location: app.location
            })
            .eq('id', existingProfile.id);

          if (updateProfileError) {
            console.error('Error updating existing profile:', updateProfileError);
            showToast('Failed to link to existing founder profile', 'error');
            return;
          }
        } else {
          referralCode = generateReferralCode(app.full_name);
          
          let attempts = 0;
          let insertError = null;
          while (attempts < 5) {
            const { data: founderProfile, error: profileError } = await supabaseClient
              .from('member_founder_profiles')
              .insert({
                application_id: id,
                user_id: app.user_id || null,
                full_name: app.full_name,
                email: normalizedEmail,
                phone: app.phone,
                location: app.location,
                referral_code: referralCode,
                status: 'active'
              })
              .select()
              .single();

            if (!profileError) {
              founderProfileId = founderProfile.id;
              break;
            }
            
            if (profileError.code === '23505' && profileError.message.includes('referral_code')) {
              referralCode = generateReferralCode(app.full_name);
              attempts++;
              console.log('Referral code collision, retrying with:', referralCode);
              continue;
            }
            
            insertError = profileError;
            break;
          }

          if (insertError) {
            if (insertError.code === '23505') {
              showToast('A founder profile already exists for this email address', 'error');
            } else if (insertError.code === '42P01') {
              showToast('Founder profiles table not set up. Please run the commission system migration in Supabase.', 'error');
            } else {
              showToast('Failed to create founder profile: ' + insertError.message, 'error');
            }
            console.error('Founder profile error:', insertError);
            return;
          }
        }

        const { error } = await supabaseClient
          .from('member_founder_applications')
          .update({ 
            status: 'approved',
            approved_at: new Date().toISOString(),
            approved_by: currentUser.id,
            referral_code: referralCode
          })
          .eq('id', id);

        if (error) {
          showToast('Failed to update application status', 'error');
          console.error('Approval error:', error);
          return;
        }

        showToast(`${app.full_name} approved! Referral code: ${referralCode}`, 'success');
        
        try {
          const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
          const emailResponse = await fetch(`${apiBase}/api/email/founder-approved`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: app.email,
              name: app.full_name,
              referralCode: referralCode
            })
          });
          
          const emailResult = await emailResponse.json();
          if (emailResult.success) {
            console.log('Founder approved email sent successfully');
          } else {
            console.warn('Failed to send founder approved email:', emailResult.error || emailResult.reason);
          }
        } catch (emailErr) {
          console.warn('Error sending founder approved email:', emailErr);
        }
        
        await loadMemberFounderApplications();
        await loadFounderPayouts();
      } catch (err) {
        console.error('approveMemberFounder error:', err);
        showToast('Error approving application', 'error');
      }
    }

    async function rejectMemberFounder(id) {
      const app = memberFounderApplications.find(a => a.id === id);
      if (!app) return;

      const reason = prompt('Reason for rejection (optional):');
      if (reason === null) return;

      try {
        const { error } = await supabaseClient
          .from('member_founder_applications')
          .update({ 
            status: 'rejected',
            rejected_at: new Date().toISOString(),
            rejected_by: currentUser.id,
            rejection_reason: reason || null
          })
          .eq('id', id);

        if (error) {
          showToast('Failed to reject application', 'error');
          console.error('Rejection error:', error);
          return;
        }

        showToast(`Application from ${app.full_name} rejected`, 'success');
        await loadMemberFounderApplications();
      } catch (err) {
        console.error('rejectMemberFounder error:', err);
        showToast('Error rejecting application', 'error');
      }
    }

    async function resendFounderWelcomeEmail(id) {
      const app = memberFounderApplications.find(a => a.id === id);
      if (!app) {
        showToast('Application not found', 'error');
        return;
      }

      const normalizedStatus = (app.status || '').toLowerCase().trim();
      if (!['approved', 'active'].includes(normalizedStatus)) {
        showToast('Can only resend email to approved founders', 'error');
        return;
      }

      const normalizedEmail = (app.email || '').trim().toLowerCase();
      const { data: founderProfile, error: profileError } = await supabaseClient
        .from('member_founder_profiles')
        .select('referral_code')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      if (profileError || !founderProfile || !founderProfile.referral_code) {
        showToast('Could not find referral code for this founder', 'error');
        console.error('Profile lookup error:', profileError);
        return;
      }

      if (!confirm(`Resend welcome email to ${app.full_name} (${app.email})?`)) {
        return;
      }

      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/email/founder-approved`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: app.email,
            name: app.full_name,
            referralCode: founderProfile.referral_code
          })
        });
        
        const result = await response.json();
        if (result.success) {
          showToast(`Welcome email sent to ${app.full_name}!`, 'success');
        } else {
          showToast('Failed to send email: ' + (result.error || 'Unknown error'), 'error');
        }
      } catch (err) {
        console.error('Error resending welcome email:', err);
        showToast('Error sending email', 'error');
      }
    }

    // Setup member founder applications tabs
    document.getElementById('mf-tabs')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab')) {
        document.querySelectorAll('#mf-tabs .tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentMFFilter = e.target.dataset.filter;
        if (currentMFFilter === 'active-profiles') {
          loadMemberFounderActiveProfiles();
        } else {
          renderMemberFounderApplications();
        }
      }
    });


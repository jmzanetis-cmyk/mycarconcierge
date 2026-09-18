    // ========== SMS LOG ==========

    let smsLogPage = 1;
    const SMS_LOG_PAGE_SIZE = 50;

    function smsStatusBadge(status) {
      const map = {
        delivered: 'approved',
        sent: 'blue',
        queued: 'orange',
        failed: 'rejected',
        undelivered: 'rejected',
        unknown: 'muted'
      };
      return `<span class="status-badge ${map[status] || 'muted'}">${status || 'unknown'}</span>`;
    }

    function smsTypeBadge(type) {
      const labels = {
        '2fa': '2FA',
        appointment_reminders: 'Appt Reminder',
        maintenance_reminders: 'Maintenance',
        bid_alert: 'Bid Alert',
        general: 'General',
        maintenance_nudge: 'Maintenance',
        dream_car: 'Dream Car'
      };
      return `<span class="badge badge-gray">${labels[type] || type || 'unknown'}</span>`;
    }

    async function loadSmsLog(page = 1) {
      smsLogPage = page;
      const statusFilter = document.getElementById('sms-log-status-filter')?.value || '';
      const typeFilter = document.getElementById('sms-log-type-filter')?.value || '';
      const tbody = document.getElementById('sms-log-tbody');
      const paginationEl = document.getElementById('sms-log-pagination');
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:40px;"><div style="display:inline-block;width:24px;height:24px;border:2px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;"></div></td></tr>`;

      try {
        const params = new URLSearchParams({ page, limit: SMS_LOG_PAGE_SIZE });
        if (statusFilter) params.set('status', statusFilter);
        if (typeFilter) params.set('type', typeFilter);
        const data = await safeFetch(`/api/admin/sms-log?${params}`, {
          headers: getAdminHeaders()
        });

        const { rows = [], total = 0, summary = {} } = data;

        const total7dEl = document.getElementById('sms-stat-total7d');
        const rateEl = document.getElementById('sms-stat-rate');
        const failedEl = document.getElementById('sms-stat-failed');
        if (total7dEl) total7dEl.textContent = summary.total7d ?? '--';
        if (rateEl) rateEl.textContent = summary.deliveryRate != null ? `${summary.deliveryRate}%` : '--';
        if (failedEl) {
          failedEl.textContent = summary.failed7d ?? '--';
          failedEl.style.color = summary.failed7d > 0 ? 'var(--accent-red)' : 'inherit';
        }

        if (!tbody) return;
        if (rows.length === 0) {
          tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:40px;">No SMS messages found</td></tr>`;
        } else {
          tbody.innerHTML = rows.map(row => {
            const isFailed = row.status === 'failed' || row.status === 'undelivered';
            const rowStyle = isFailed ? 'border-left:3px solid var(--accent-red);' : '';
            const errorCell = row.error_code
              ? `<span style="color:var(--accent-red);font-size:0.82rem;">${row.error_code}${row.error_message ? ' — ' + row.error_message.substring(0, 60) : ''}</span>`
              : `<span style="color:var(--text-muted);">—</span>`;
            const sidCell = row.message_sid
              ? `<span style="font-size:0.75rem;font-family:monospace;color:var(--text-muted);">${row.message_sid}</span>`
              : `<span style="color:var(--text-muted);">—</span>`;
            const actionCell = row.message_sid
              ? `<button class="btn btn-ghost btn-sm" onclick="refreshSingleSmsStatus('${row.message_sid}', this)" title="Refresh status from Twilio" style="padding:4px 8px;font-size:0.75rem;"><span class="icon-inline" data-icon="refresh-cw"></span></button>`
              : '';
            const ts = row.created_at ? new Date(row.created_at).toLocaleString() : '—';
            return `<tr style="${rowStyle}">
              <td style="font-size:0.82rem;white-space:nowrap;">${ts}</td>
              <td style="font-family:monospace;font-size:0.85rem;">${row.to_phone_masked || '—'}</td>
              <td>${smsTypeBadge(row.message_type)}</td>
              <td>${smsStatusBadge(row.status)}</td>
              <td style="max-width:260px;">${errorCell}</td>
              <td>${sidCell}</td>
              <td>${actionCell}</td>
            </tr>`;
          }).join('');
          if (globalThis.MCC_ICONS) {
            tbody.querySelectorAll('[data-icon]').forEach(el => {
              const svg = MCC_ICONS[el.dataset.icon];
              if (svg) el.innerHTML = svg;
            });
          }
        }

        if (paginationEl) {
          const totalPages = Math.ceil(total / SMS_LOG_PAGE_SIZE);
          const start = total > 0 ? (page - 1) * SMS_LOG_PAGE_SIZE + 1 : 0;
          const end = Math.min(page * SMS_LOG_PAGE_SIZE, total);
          paginationEl.innerHTML = `
            <span>${total > 0 ? `${start}–${end} of ${total}` : '0 results'}</span>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-secondary btn-sm" onclick="loadSmsLog(${page - 1})" ${page <= 1 ? 'disabled' : ''}>← Prev</button>
              <span style="padding:6px 12px;font-size:0.85rem;">Page ${page} of ${totalPages || 1}</span>
              <button class="btn btn-secondary btn-sm" onclick="loadSmsLog(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>Next →</button>
            </div>`;
        }
      } catch (err) {
        console.error('[SMS_LOG] Load error:', err);
        // Task #355 — surface auth failures with the shared "Sign in again"
        // prompt instead of leaving the bare error message in the table.
        if (tbody) {
          if (isAdminAuthError(err)) {
            renderAdminAuthErrorRow(tbody, 7, err, () => loadSmsLog(smsLogPage));
          } else {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--accent-red);padding:40px;">${escapeHtml(err.message)}</td></tr>`;
          }
        }
      }
    }

    async function refreshSingleSmsStatus(sid, btn) {
      if (!sid) return;
      if (btn) { btn.disabled = true; btn.textContent = '…'; }
      try {
        const res = await fetch('/api/admin/sms-log/refresh-status', {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({ message_sid: sid })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        if (data?.status) {
          if (globalThis.showToast) showToast(`Status updated: ${data.status}`, 'success');
          await loadSmsLog(smsLogPage);
        }
      } catch (err) {
        if (globalThis.showToast) showToast('Refresh failed: ' + err.message, 'error');
      } finally {
        if (btn) { btn.disabled = false; if (btn.querySelector) btn.innerHTML = (globalThis.MCC_ICONS?.['refresh-cw'] || '↻'); }
      }
    }

    globalThis.loadSmsLog = loadSmsLog;
    globalThis.refreshSingleSmsStatus = refreshSingleSmsStatus;

    // ========== END SMS LOG ==========

    // ========== SAAS SUBSCRIPTIONS ADMIN ==========
    async function loadSaasSubscriptions() {
      const container = document.getElementById('saas-subscriptions-content');
      if (!container) return;
      container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);">Loading subscription data…</div>';
      try {
        const resp = await safeFetch('/api/admin/saas/subscriptions', {
          headers: getAiOpsHeaders()
        });

        const { subscriptions = [], stats = {}, by_product = {}, recent_churns = [] } = resp;

        const productLabels = {
          fleet: 'Fleet Management', shop: 'Provider Shop', ai_api: 'AI API',
          outreach: 'Outreach Engine', white_label: 'White-label'
        };
        const statusColors = {
          active: 'var(--accent-green)', trialing: 'var(--accent-blue)',
          canceled: 'var(--text-muted)', past_due: 'var(--accent-red)',
          incomplete: 'var(--accent-orange)'
        };

        container.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:28px;">
            <div class="stat-card" style="padding:20px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);">
              <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">Total Subscriptions</div>
              <div style="font-size:1.8rem;font-weight:700;">${stats.total || 0}</div>
            </div>
            <div class="stat-card" style="padding:20px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);">
              <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">Active</div>
              <div style="font-size:1.8rem;font-weight:700;color:var(--accent-green);">${stats.active || 0}</div>
            </div>
            <div class="stat-card" style="padding:20px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);">
              <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">Trialing</div>
              <div style="font-size:1.8rem;font-weight:700;color:var(--accent-blue);">${stats.trialing || 0}</div>
            </div>
            <div class="stat-card" style="padding:20px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);">
              <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">Past Due</div>
              <div style="font-size:1.8rem;font-weight:700;color:var(--accent-red);">${stats.past_due || 0}</div>
            </div>
            <div class="stat-card" style="padding:20px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);">
              <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">Est. MRR</div>
              <div style="font-size:1.8rem;font-weight:700;color:var(--accent-gold);">$${stats.mrr_dollars || '0.00'}</div>
            </div>
            <div class="stat-card" style="padding:20px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);">
              <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">Churned (30d)</div>
              <div style="font-size:1.8rem;font-weight:700;color:var(--accent-orange);">${stats.recent_churns || 0}</div>
            </div>
          </div>

          ${recent_churns.length > 0 ? `
          <div style="margin-bottom:24px;">
            <div style="font-weight:600;margin-bottom:10px;color:var(--accent-orange);">Recent Churns (Last 30 Days)</div>
            <div style="overflow-x:auto;">
              <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
                <thead>
                  <tr style="background:var(--bg-input);">
                    <th style="padding:8px 12px;text-align:left;color:var(--text-muted);font-weight:500;">User</th>
                    <th style="padding:8px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Product</th>
                    <th style="padding:8px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Plan</th>
                    <th style="padding:8px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Canceled At</th>
                  </tr>
                </thead>
                <tbody>
                  ${recent_churns.map(c => `
                    <tr style="border-top:1px solid var(--border-subtle);">
                      <td style="padding:8px 12px;color:var(--text-muted);">${c.user_id?.slice(0,8)}…</td>
                      <td style="padding:8px 12px;font-weight:500;">${{ fleet: 'Fleet', shop: 'Shop', ai_api: 'AI API', outreach: 'Outreach', white_label: 'White-label' }[c.product] || c.product}</td>
                      <td style="padding:8px 12px;text-transform:capitalize;">${c.plan}</td>
                      <td style="padding:8px 12px;color:var(--text-muted);">${new Date(c.canceled_at).toLocaleDateString()}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>` : ''}

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:28px;">
            ${Object.entries(by_product).map(([product, counts]) => `
              <div style="padding:16px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);">
                <div style="font-weight:600;margin-bottom:10px;">${productLabels[product] || product}</div>
                <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:0.82rem;">
                  <span style="color:var(--accent-green);">Active: ${counts.active || 0}</span>
                  <span style="color:var(--accent-blue);">Trial: ${counts.trialing || 0}</span>
                  <span style="color:var(--text-muted);">Canceled: ${counts.canceled || 0}</span>
                  <span style="font-weight:600;">Total: ${counts.total || 0}</span>
                </div>
              </div>
            `).join('')}
            ${Object.keys(by_product).length === 0 ? '<div style="color:var(--text-muted);padding:16px;">No subscriptions yet.</div>' : ''}
          </div>

          <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);overflow:hidden;">
            <div style="padding:16px 20px;border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between;">
              <h3 style="margin:0;font-size:1rem;">All Subscriptions</h3>
              <button class="btn btn-secondary btn-sm" onclick="loadSaasSubscriptions()">↻ Refresh</button>
            </div>
            ${subscriptions.length === 0 ? `
              <div style="padding:40px;text-align:center;color:var(--text-muted);">
                <div style="font-size:2.5rem;margin-bottom:12px;">📋</div>
                <p>No SaaS subscriptions yet.</p>
                <p style="font-size:0.85rem;">Once users subscribe to a SaaS product line, their subscriptions will appear here.</p>
              </div>
            ` : `
              <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;">
                  <thead>
                    <tr style="background:var(--bg-input);">
                      <th style="padding:10px 16px;text-align:left;font-size:0.8rem;color:var(--text-muted);font-weight:500;">User ID</th>
                      <th style="padding:10px 16px;text-align:left;font-size:0.8rem;color:var(--text-muted);font-weight:500;">Product</th>
                      <th style="padding:10px 16px;text-align:left;font-size:0.8rem;color:var(--text-muted);font-weight:500;">Plan</th>
                      <th style="padding:10px 16px;text-align:left;font-size:0.8rem;color:var(--text-muted);font-weight:500;">Status</th>
                      <th style="padding:10px 16px;text-align:left;font-size:0.8rem;color:var(--text-muted);font-weight:500;">Renews</th>
                      <th style="padding:10px 16px;text-align:left;font-size:0.8rem;color:var(--text-muted);font-weight:500;">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${subscriptions.map(s => `
                      <tr style="border-top:1px solid var(--border-subtle);">
                        <td style="padding:10px 16px;font-size:0.82rem;color:var(--text-muted);">${s.user_id?.slice(0,8)}…</td>
                        <td style="padding:10px 16px;font-weight:500;">${productLabels[s.product] || s.product}</td>
                        <td style="padding:10px 16px;text-transform:capitalize;">${s.plan}</td>
                        <td style="padding:10px 16px;">
                          <span style="padding:2px 8px;border-radius:100px;font-size:0.75rem;font-weight:600;background:${statusColors[s.status] || 'var(--text-muted)'}22;color:${statusColors[s.status] || 'var(--text-muted)'};border:1px solid ${statusColors[s.status] || 'var(--text-muted)'}44;">${s.status}</span>
                          ${s.cancel_at_period_end ? '<span style="margin-left:4px;font-size:0.72rem;color:var(--accent-orange);">Cancels at period end</span>' : ''}
                        </td>
                        <td style="padding:10px 16px;font-size:0.82rem;color:var(--text-muted);">${s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : '—'}</td>
                        <td style="padding:10px 16px;font-size:0.82rem;color:var(--text-muted);">${new Date(s.created_at).toLocaleDateString()}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        `;
      } catch (err) {
        renderAiOpsAuthError(container, err, loadSaasSubscriptions);
      }
    }

    globalThis.loadSaasSubscriptions = loadSaasSubscriptions;

    // ========== END SAAS SUBSCRIPTIONS ADMIN ==========

    // ========== WHITE-LABEL TENANTS (Task #87) ==========

    let _editingTenantId = null;

    async function loadWhiteLabelTenants() {
      const statsEl = document.getElementById('white-label-stats');
      const contentEl = document.getElementById('white-label-content');
      if (!statsEl || !contentEl) return;

      try {
        const { tenants, meta } = await aiOpsFetch('/api/admin/white-label/tenants', { headers: getAiOpsHeaders() });

        const active = tenants.filter(t => t.status === 'active').length;
        const byPlan = { starter: 0, pro: 0, business: 0 };
        for (const t of tenants) if (byPlan[t.plan] !== undefined) byPlan[t.plan]++;
        const totalMrr = meta?.total_mrr || tenants.filter(t=>t.status==='active').reduce((s,t)=>s+({starter:149,pro:499,business:999}[t.plan]||0),0);
        const totalMembers = tenants.reduce((s,t)=>s+(t._stats?.member_count||0),0);

        statsEl.innerHTML = `
          <div class="stat-card"><div class="stat-icon" style="background:var(--accent-blue-soft);color:var(--accent-blue);">🏢</div><div class="stat-value">${tenants.length}</div><div class="stat-label">Total Tenants</div></div>
          <div class="stat-card"><div class="stat-icon" style="background:var(--accent-green-soft);color:var(--accent-green);">✅</div><div class="stat-value">${active}</div><div class="stat-label">Active</div></div>
          <div class="stat-card"><div class="stat-icon" style="background:var(--accent-gold-soft);color:var(--accent-gold);">💰</div><div class="stat-value">$${totalMrr.toLocaleString()}</div><div class="stat-label">Est. MRR</div></div>
          <div class="stat-card"><div class="stat-icon" style="background:var(--accent-teal-soft);color:var(--accent-teal);">👥</div><div class="stat-value">${totalMembers}</div><div class="stat-label">Total Members</div></div>
          <div class="stat-card"><div class="stat-icon" style="background:var(--accent-gold-soft);color:var(--accent-gold);">⭐</div><div class="stat-value">${byPlan.starter}</div><div class="stat-label">Starter</div></div>
          <div class="stat-card"><div class="stat-icon" style="background:var(--accent-teal-soft);color:var(--accent-teal);">🚀</div><div class="stat-value">${byPlan.pro}</div><div class="stat-label">Pro</div></div>
          <div class="stat-card"><div class="stat-icon" style="background:var(--accent-purple-soft,#7c3aed22);color:#7c3aed;">💼</div><div class="stat-value">${byPlan.business}</div><div class="stat-label">Business</div></div>
        `;

        if (!tenants.length) {
          contentEl.innerHTML = `
            <div style="padding:64px;text-align:center;color:var(--text-muted);">
              <div style="font-size:48px;margin-bottom:16px;">🏢</div>
              <h3 style="margin:0 0 8px;">No White-label Tenants Yet</h3>
              <p style="margin:0 0 20px;">Create your first branded platform instance for an enterprise client.</p>
              <button class="btn btn-primary" onclick="openCreateTenantModal()">Create First Tenant</button>
            </div>`;
          return;
        }

        const planBadge = (plan) => {
          const colors = { starter: 'var(--accent-blue)', pro: 'var(--accent-teal)', business: '#7c3aed' };
          return `<span style="background:${colors[plan] || '#888'}22;color:${colors[plan] || '#888'};padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;text-transform:uppercase;">${plan}</span>`;
        };
        const statusBadge = (s) => {
          const m = { active: ['var(--accent-green)','Active'], suspended: ['var(--accent-orange)','Suspended'], canceled: ['var(--accent-red)','Canceled'], pending: ['var(--accent-blue)','Pending'] };
          const [col, label] = m[s] || ['#888', s];
          return `<span style="background:${col}22;color:${col};padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">${label}</span>`;
        };

        contentEl.innerHTML = `
          <div style="overflow-x:auto;">
            <table class="data-table" style="width:100%;">
              <thead><tr>
                <th>Brand Name</th><th>Domain</th><th>Plan</th><th>Status</th>
                <th>Members Used</th><th>Providers Used</th><th>Est. MRR</th><th>Created</th><th>Actions</th>
              </tr></thead>
              <tbody>
                ${tenants.map(t => {
                  const stats = t._stats || {};
                  const mLimit = t.max_members === -1 ? '∞' : t.max_members;
                  const pLimit = t.max_providers === -1 ? '∞' : t.max_providers;
                  const planMrr = { starter: 149, pro: 499, business: 999 };
                  const mrr = t.status === 'active' ? (planMrr[t.plan] || 0) : 0;
                  const tenantDomain = t.domain || (t.subdomain ? t.subdomain + '.mycarconcierge.com' : null);
                  return `
                  <tr>
                    <td><div style="font-weight:600;">${t.brand_name}</div><div style="font-size:12px;color:var(--text-muted);">${t.name}</div></td>
                    <td style="font-family:monospace;font-size:12px;">${tenantDomain ? `<a href="https://${tenantDomain}" target="_blank" style="color:var(--accent-teal);">${tenantDomain}</a>` : '<span style="color:var(--text-muted)">—</span>'}</td>
                    <td>${planBadge(t.plan)}</td>
                    <td>${statusBadge(t.status)}</td>
                    <td style="text-align:center;">${stats.member_count || 0} / ${mLimit}</td>
                    <td style="text-align:center;">${stats.provider_count || 0} / ${pLimit}</td>
                    <td style="font-weight:600;color:var(--accent-gold);">$${mrr}</td>
                    <td style="font-size:12px;color:var(--text-muted);">${new Date(t.created_at).toLocaleDateString()}</td>
                    <td style="white-space:nowrap;">
                      <button class="btn btn-sm btn-secondary" onclick="openEditTenantModal('${t.id}')">Edit</button>
                      <button class="btn btn-sm btn-secondary" onclick="openTenantAccessModal('${t.id}')" style="margin-left:4px;" title="View tenant portal as admin">View Portal</button>
                      ${tenantDomain ? `<button class="btn btn-sm btn-secondary" onclick="previewTenantBranding('${tenantDomain}')" style="margin-left:4px;" title="Preview branding">Preview</button>` : ''}
                      ${t.status === 'active' ? `<button class="btn btn-sm btn-danger" onclick="deactivateTenant('${t.id}')" style="margin-left:4px;">Suspend</button>` : ''}
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`;

        // Store for edit lookups
        globalThis._wlTenants = tenants;
      } catch (err) {
        renderAiOpsAuthError(contentEl, err, loadWhiteLabelTenants);
      }
    }

    // ===== TENANT ONBOARDING WIZARD (Task #87) =====
    let _tenantWizardStep = 1;
    const _WIZARD_STEPS = 4;
    const _WIZARD_SUBTITLES = [
      'Step 1 of 4 — Tenant Identity',
      'Step 2 of 4 — Domain Configuration',
      'Step 3 of 4 — Branding',
      'Step 4 of 4 — Plan & Review'
    ];

    function _tenantWizardShowStep(step) {
      _tenantWizardStep = step;
      for (let i = 1; i <= _WIZARD_STEPS; i++) {
        const el = document.getElementById('tenant-wz-step-' + i);
        if (el) el.style.display = i === step ? '' : 'none';
        const bar = document.getElementById('wz-step-bar-' + i);
        if (bar) bar.style.background = i <= step ? 'var(--accent-gold)' : 'var(--border-subtle)';
      }
      const sub = document.getElementById('tenant-wizard-subtitle');
      if (sub) sub.textContent = _WIZARD_SUBTITLES[step - 1] || '';
      const backBtn = document.getElementById('tenant-wz-back-btn');
      if (backBtn) backBtn.style.display = step > 1 ? '' : 'none';
      const nextBtn = document.getElementById('tenant-wz-next-btn');
      if (nextBtn) nextBtn.textContent = step < _WIZARD_STEPS ? 'Next →' : 'Create Tenant';
      // Update branding preview on step 3
      if (step === 3) _updateBrandingPreview();
      // Update review on step 4
      if (step === 4) _updateTenantReview();
      // Hide error on step change
      const errEl = document.getElementById('tenant-modal-error');
      if (errEl) errEl.style.display = 'none';
    }

    function _updateBrandingPreview() {
      const primary = document.getElementById('tenant-primary-color')?.value || '#C9A227';
      const accent = document.getElementById('tenant-accent-color')?.value || '#2CC4B4';
      const bg = document.getElementById('tenant-bg-color')?.value || '#12161c';
      const bgEl = document.getElementById('wz-preview-bg');
      const btnEl = document.getElementById('wz-preview-btn');
      const badgeEl = document.getElementById('wz-preview-badge');
      if (bgEl) bgEl.style.background = bg;
      if (btnEl) { btnEl.style.background = primary; btnEl.style.color = '#000'; }
      if (badgeEl) badgeEl.style.background = accent;
    }

    function _updateTenantReview() {
      const reviewEl = document.getElementById('tenant-wizard-review');
      if (!reviewEl) return;
      const name = document.getElementById('tenant-name')?.value || '—';
      const brand = document.getElementById('tenant-brand-name')?.value || '—';
      const ownerEmail = document.getElementById('tenant-owner-email')?.value || '—';
      const domain = document.getElementById('tenant-domain')?.value || '—';
      const subdomain = document.getElementById('tenant-subdomain')?.value || '—';
      const plan = document.getElementById('tenant-plan')?.value || 'starter';
      const planLabels = { starter: 'Starter (500 members)', pro: 'Pro (5,000 members)', business: 'Business (Unlimited)' };
      const logo = document.getElementById('tenant-logo-url')?.value || '—';
      reviewEl.innerHTML = `
        <span style="color:var(--text-muted);">Internal Name</span><span style="font-weight:500;">${name}</span>
        <span style="color:var(--text-muted);">Brand Name</span><span style="font-weight:500;">${brand}</span>
        <span style="color:var(--text-muted);">Owner Email</span><span style="font-weight:500;">${ownerEmail}</span>
        <span style="color:var(--text-muted);">Custom Domain</span><span style="font-weight:500;">${domain}</span>
        <span style="color:var(--text-muted);">Subdomain</span><span style="font-weight:500;">${subdomain !== '—' ? subdomain + '.mycarconcierge.com' : '—'}</span>
        <span style="color:var(--text-muted);">Plan</span><span style="font-weight:500;">${planLabels[plan] || plan}</span>
        <span style="color:var(--text-muted);">Logo</span><span style="font-weight:500;word-break:break-all;">${logo}</span>
      `;
    }

    function tenantWizardBack() {
      if (_tenantWizardStep > 1) _tenantWizardShowStep(_tenantWizardStep - 1);
    }

    async function tenantWizardNext() {
      const errEl = document.getElementById('tenant-modal-error');
      if (errEl) errEl.style.display = 'none';
      // Validate step 1
      if (_tenantWizardStep === 1) {
        const name = document.getElementById('tenant-name')?.value.trim();
        const brand = document.getElementById('tenant-brand-name')?.value.trim();
        if (!name || !brand) {
          if (errEl) { errEl.textContent = 'Internal name and brand name are required.'; errEl.style.display = 'block'; }
          return;
        }
      }
      if (_tenantWizardStep < _WIZARD_STEPS) {
        _tenantWizardShowStep(_tenantWizardStep + 1);
      } else {
        await _saveTenantFromWizard();
      }
    }

    // Read the tenant-wizard form fields into the POST body. Extracted so
    // _saveTenantFromWizard stays under the cognitive-complexity budget
    // (Task #262).
    function _collectTenantWizardBody() {
      const trimVal = id => document.getElementById(id)?.value.trim();
      const optTrimVal = id => trimVal(id) || null;
      const valOr = (id, fallback) => document.getElementById(id)?.value || fallback;
      return {
        name:          trimVal('tenant-name'),
        brand_name:    trimVal('tenant-brand-name'),
        owner_email:   optTrimVal('tenant-owner-email'),
        domain:        optTrimVal('tenant-domain'),
        subdomain:     optTrimVal('tenant-subdomain'),
        logo_url:      optTrimVal('tenant-logo-url'),
        favicon_url:   optTrimVal('tenant-favicon-url'),
        support_email: optTrimVal('tenant-support-email'),
        primary_color: valOr('tenant-primary-color', '#C9A227'),
        accent_color:  valOr('tenant-accent-color',  '#2CC4B4'),
        bg_color:      valOr('tenant-bg-color',      '#12161c'),
        plan:          valOr('tenant-plan',          'starter'),
        status:        valOr('tenant-status',        'active')
      };
    }

    async function _saveTenantFromWizard() {
      const errEl = document.getElementById('tenant-modal-error');
      if (errEl) errEl.style.display = 'none';
      const body = _collectTenantWizardBody();
      if (!body.name || !body.brand_name) {
        if (errEl) { errEl.textContent = 'Internal name and brand name are required.'; errEl.style.display = 'block'; }
        return;
      }
      const nextBtn = document.getElementById('tenant-wz-next-btn');
      if (nextBtn) { nextBtn.disabled = true; nextBtn.textContent = 'Creating…'; }
      const authHeaders = await getAdminAuthHeader().catch(() => ({}));
      const headers = { 'Content-Type': 'application/json', ...authHeaders };
      try {
        const res = await fetch('/api/admin/white-label/tenants', { method: 'POST', headers, body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create tenant');
        closeTenantModal();
        loadedSections['white-label'] = false;
        await loadWhiteLabelTenants();
      } catch (err) {
        if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
      } finally {
        if (nextBtn) { nextBtn.disabled = false; nextBtn.textContent = 'Create Tenant'; }
      }
    }

    function openCreateTenantModal() {
      _editingTenantId = null;
      document.getElementById('tenant-modal-title').textContent = 'New White-label Tenant';
      document.getElementById('tenant-modal-id').value = '';
      const wizardProgress = document.getElementById('tenant-wizard-progress');
      if (wizardProgress) wizardProgress.style.display = '';
      const backBtn = document.getElementById('tenant-wz-back-btn');
      if (backBtn) backBtn.style.display = 'none';
      // Reset all wizard fields
      ['tenant-name','tenant-brand-name','tenant-owner-email','tenant-domain','tenant-subdomain','tenant-logo-url','tenant-favicon-url','tenant-support-email'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      const pc = document.getElementById('tenant-primary-color'); if (pc) pc.value = '#C9A227';
      const ac = document.getElementById('tenant-accent-color'); if (ac) ac.value = '#2CC4B4';
      const bc = document.getElementById('tenant-bg-color'); if (bc) bc.value = '#12161c';
      const plan = document.getElementById('tenant-plan'); if (plan) plan.value = 'starter';
      const status = document.getElementById('tenant-status'); if (status) status.value = 'active';
      const errEl = document.getElementById('tenant-modal-error'); if (errEl) errEl.style.display = 'none';
      _tenantWizardShowStep(1);
      document.getElementById('tenant-modal').style.display = 'flex';
    }

    function openEditTenantModal(id) {
      const t = (globalThis._wlTenants || []).find(x => x.id === id);
      if (!t) return;
      _editingTenantId = id;
      const editModal = document.getElementById('tenant-edit-modal');
      if (!editModal) return;
      document.getElementById('tenant-edit-id').value = id;
      document.getElementById('tenant-edit-name').value = t.name || '';
      document.getElementById('tenant-edit-brand-name').value = t.brand_name || '';
      document.getElementById('tenant-edit-domain').value = t.domain || '';
      document.getElementById('tenant-edit-subdomain').value = t.subdomain || '';
      document.getElementById('tenant-edit-logo-url').value = t.logo_url || '';
      document.getElementById('tenant-edit-support-email').value = t.support_email || '';
      document.getElementById('tenant-edit-primary-color').value = t.primary_color || '#C9A227';
      document.getElementById('tenant-edit-accent-color').value = t.accent_color || '#2CC4B4';
      document.getElementById('tenant-edit-bg-color').value = t.bg_color || '#12161c';
      document.getElementById('tenant-edit-plan').value = t.plan || 'starter';
      document.getElementById('tenant-edit-status').value = t.status || 'active';
      const errEl = document.getElementById('tenant-edit-error'); if (errEl) errEl.style.display = 'none';
      editModal.style.display = 'flex';
    }

    function closeTenantModal() {
      document.getElementById('tenant-modal').style.display = 'none';
    }

    function closeTenantEditModal() {
      const m = document.getElementById('tenant-edit-modal'); if (m) m.style.display = 'none';
    }

    async function saveTenantEdit() {
      const errEl = document.getElementById('tenant-edit-error');
      if (errEl) errEl.style.display = 'none';
      const id = document.getElementById('tenant-edit-id')?.value;
      if (!id) return;
      const body = {
        name: document.getElementById('tenant-edit-name')?.value.trim(),
        brand_name: document.getElementById('tenant-edit-brand-name')?.value.trim(),
        domain: document.getElementById('tenant-edit-domain')?.value.trim() || null,
        subdomain: document.getElementById('tenant-edit-subdomain')?.value.trim() || null,
        logo_url: document.getElementById('tenant-edit-logo-url')?.value.trim() || null,
        support_email: document.getElementById('tenant-edit-support-email')?.value.trim() || null,
        primary_color: document.getElementById('tenant-edit-primary-color')?.value || '#C9A227',
        accent_color: document.getElementById('tenant-edit-accent-color')?.value || '#2CC4B4',
        bg_color: document.getElementById('tenant-edit-bg-color')?.value || '#12161c',
        plan: document.getElementById('tenant-edit-plan')?.value || 'starter',
        status: document.getElementById('tenant-edit-status')?.value || 'active'
      };
      if (!body.name || !body.brand_name) { if (errEl) { errEl.textContent = 'Name and brand name required.'; errEl.style.display = 'block'; } return; }
      const btn = document.getElementById('save-tenant-edit-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      const authHeaders = await getAdminAuthHeader().catch(() => ({}));
      const headers = { 'Content-Type': 'application/json', ...authHeaders };
      try {
        const res = await fetch(`/api/admin/white-label/tenants/${id}`, { method: 'PUT', headers, body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save');
        closeTenantEditModal();
        loadedSections['white-label'] = false;
        await loadWhiteLabelTenants();
      } catch (err) {
        if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
      }
    }

    // Keep legacy saveTenant for backward compat (not called from new wizard)
    async function saveTenant() { await _saveTenantFromWizard(); }

    async function deactivateTenant(id) {
      if (!confirm('Suspend this tenant? They will lose access to white-label features.')) return;
      const authHeaders = await getAdminAuthHeader().catch(() => ({}));
      const headers = { 'Content-Type': 'application/json', ...authHeaders };
      try {
        await fetch(`/api/admin/white-label/tenants/${id}`, { method: 'PUT', headers, body: JSON.stringify({ status: 'suspended' }) });
        loadedSections['white-label'] = false;
        await loadWhiteLabelTenants();
      } catch (err) { alert('Error: ' + err.message); }
    }

    async function previewTenantBranding(domain) {
      const authHeaders = await getAdminAuthHeader().catch(() => null);
      if (!authHeaders) { alert('Admin auth required to preview branding.'); return; }
      try {
        const res = await fetch(`/api/white-label/config?preview_domain=${encodeURIComponent(domain)}`, {
          headers: authHeaders
        });
        const data = await res.json();
        if (!data.is_white_label || !data.tenant) {
          alert(`No active white-label tenant found for domain: ${domain}`);
          return;
        }
        const t = data.tenant;
        const preview = document.createElement('div');
        preview.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;`;
        preview.innerHTML = `
          <div style="background:${t.bg_color||'#12161c'};border-radius:16px;padding:32px;width:min(480px,95vw);position:relative;">
            <button onclick="this.closest('div[style*=fixed]').remove()" style="position:absolute;top:16px;right:16px;background:none;border:none;color:${t.primary_color||'#C9A227'};font-size:20px;cursor:pointer;">✕</button>
            <div style="margin-bottom:20px;">
              ${t.logo_url ? `<img src="${t.logo_url}" alt="${t.brand_name}" style="height:48px;object-fit:contain;margin-bottom:12px;">` : ''}
              <h2 style="color:${t.primary_color||'#C9A227'};margin:0 0 4px;font-size:1.4rem;">${t.brand_name}</h2>
              <p style="color:${t.accent_color||'#2CC4B4'};margin:0;font-size:0.85rem;">White-label Branding Preview</p>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px;">
              <div style="text-align:center;">
                <div style="width:100%;height:40px;border-radius:8px;background:${t.primary_color||'#C9A227'};margin-bottom:6px;"></div>
                <div style="font-size:11px;color:#888;">Primary</div>
                <div style="font-size:11px;color:#ccc;">${t.primary_color||'#C9A227'}</div>
              </div>
              <div style="text-align:center;">
                <div style="width:100%;height:40px;border-radius:8px;background:${t.accent_color||'#2CC4B4'};margin-bottom:6px;"></div>
                <div style="font-size:11px;color:#888;">Accent</div>
                <div style="font-size:11px;color:#ccc;">${t.accent_color||'#2CC4B4'}</div>
              </div>
              <div style="text-align:center;">
                <div style="width:100%;height:40px;border-radius:8px;background:${t.bg_color||'#12161c'};border:1px solid #333;margin-bottom:6px;"></div>
                <div style="font-size:11px;color:#888;">Background</div>
                <div style="font-size:11px;color:#ccc;">${t.bg_color||'#12161c'}</div>
              </div>
            </div>
            <div style="display:flex;gap:10px;">
              <button style="flex:1;padding:12px;border-radius:8px;background:${t.primary_color||'#C9A227'};border:none;color:#12161c;font-weight:600;cursor:pointer;">Sample CTA Button</button>
              <button style="flex:1;padding:12px;border-radius:8px;background:transparent;border:1px solid ${t.accent_color||'#2CC4B4'};color:${t.accent_color||'#2CC4B4'};font-weight:600;cursor:pointer;">Secondary Action</button>
            </div>
            ${t.plan ? `<div style="margin-top:16px;font-size:12px;color:#888;">Plan: <strong style="color:#ccc;">${t.plan}</strong> · Domain: <strong style="color:#ccc;">${domain}</strong></div>` : ''}
          </div>`;
        document.body.appendChild(preview);
        preview.addEventListener('click', (e) => { if (e.target === preview) preview.remove(); });
      } catch (err) { alert('Preview failed: ' + err.message); }
    }

    globalThis.loadWhiteLabelTenants = loadWhiteLabelTenants;
    globalThis.openCreateTenantModal = openCreateTenantModal;
    globalThis.openEditTenantModal = openEditTenantModal;
    globalThis.closeTenantModal = closeTenantModal;
    globalThis.saveTenant = saveTenant;
    globalThis.deactivateTenant = deactivateTenant;
    globalThis.previewTenantBranding = previewTenantBranding;

    // ===== TENANT PORTAL ACCESS MODAL (Admin Impersonation-Lite) =====
    async function openTenantAccessModal(tenantId) {
      const modal = document.getElementById('tenant-access-modal');
      const contentEl = document.getElementById('tenant-access-content');
      if (!modal || !contentEl) return;
      contentEl.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);">Loading tenant data…</div>';
      modal.style.display = 'flex';
      const headers = await getAdminAuthHeader().catch(() => ({}));
      try {
        const res = await fetch(`/api/admin/white-label/tenants/${tenantId}/portal`, { headers });
        if (!res.ok) throw new Error('Failed to load tenant portal');
        const { tenant, usage, estimated_mrr, recent_members } = await res.json();
        const titleEl = document.getElementById('tenant-access-title');
        if (titleEl) titleEl.textContent = `Portal View — ${tenant.brand_name}`;
        const planColors = { starter: 'var(--accent-teal)', pro: 'var(--accent-gold)', business: '#7c3aed' };
        const planColor = planColors[tenant.plan] || 'var(--text-muted)';
        const domain = tenant.domain || (tenant.subdomain ? `${tenant.subdomain}.mycarconcierge.com` : '—');
        const mPct = usage.members.unlimited ? 0 : Math.min(100, Math.round((usage.members.current / usage.members.limit) * 100));
        const pPct = usage.providers.unlimited ? 0 : Math.min(100, Math.round((usage.providers.current / usage.providers.limit) * 100));
        const barColor = (pct) => pct >= 90 ? 'var(--accent-red)' : pct >= 70 ? 'var(--accent-orange)' : 'var(--accent-teal)';

        contentEl.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:20px;">
            <div style="padding:12px;background:var(--surface-3);border-radius:8px;text-align:center;">
              <div style="font-size:1.3rem;font-weight:700;color:${planColor};">${tenant.plan?.toUpperCase()}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">Plan</div>
            </div>
            <div style="padding:12px;background:var(--surface-3);border-radius:8px;text-align:center;">
              <div style="font-size:1.3rem;font-weight:700;color:var(--accent-teal);">${usage.members.current}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">Members</div>
            </div>
            <div style="padding:12px;background:var(--surface-3);border-radius:8px;text-align:center;">
              <div style="font-size:1.3rem;font-weight:700;color:var(--accent-gold);">${usage.providers.current}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">Providers</div>
            </div>
            <div style="padding:12px;background:var(--surface-3);border-radius:8px;text-align:center;">
              <div style="font-size:1.3rem;font-weight:700;color:var(--accent-gold);">$${estimated_mrr}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">Est. MRR</div>
            </div>
          </div>
          <div style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px;"><span>Member Seats</span><span>${usage.members.current} / ${usage.members.unlimited ? '∞' : usage.members.limit}</span></div>
            <div style="height:6px;background:var(--border-subtle);border-radius:3px;overflow:hidden;margin-bottom:8px;"><div style="height:100%;background:${barColor(mPct)};width:${mPct}%;border-radius:3px;"></div></div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px;"><span>Provider Seats</span><span>${usage.providers.current} / ${usage.providers.unlimited ? '∞' : usage.providers.limit}</span></div>
            <div style="height:6px;background:var(--border-subtle);border-radius:3px;overflow:hidden;"><div style="height:100%;background:${barColor(pPct)};width:${pPct}%;border-radius:3px;"></div></div>
          </div>
          <div style="padding:14px;background:var(--surface-3);border-radius:8px;margin-bottom:16px;">
            <div style="display:grid;grid-template-columns:auto 1fr;gap:5px 14px;font-size:0.83rem;">
              <span style="color:var(--text-muted);">Brand</span><span>${tenant.brand_name}</span>
              <span style="color:var(--text-muted);">Domain</span><span style="font-family:monospace;">${domain}</span>
              <span style="color:var(--text-muted);">Status</span>
              <span style="display:inline-flex;align-items:center;gap:6px;">
                <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${tenant.status === 'active' ? 'var(--accent-teal)' : 'var(--accent-red)'}"></span>
                <span style="text-transform:capitalize;">${tenant.status}</span>
              </span>
              <span style="color:var(--text-muted);">Created</span><span>${new Date(tenant.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          ${recent_members.length ? `
          <div>
            <div style="font-size:0.82rem;font-weight:600;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Recent Members</div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${recent_members.map(m => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--surface-3);border-radius:6px;font-size:0.83rem;">
                  <span style="font-family:monospace;color:var(--text-muted);">${m.user_id.slice(0,12)}…</span>
                  <span style="background:var(--accent-teal-soft,rgba(44,196,180,0.1));color:var(--accent-teal);padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;text-transform:uppercase;">${m.role}</span>
                  <span style="color:var(--text-muted);font-size:11px;">${new Date(m.joined_at).toLocaleDateString()}</span>
                </div>`).join('')}
            </div>
          </div>` : '<div style="color:var(--text-muted);font-size:0.85rem;padding:8px 0;">No members have joined yet.</div>'}
          <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
            <button class="btn btn-secondary" onclick="closeTenantAccessModal()">Close</button>
            <button class="btn btn-primary" onclick="openEditTenantModal('${tenant.id}');closeTenantAccessModal();">Edit Tenant</button>
          </div>`;
      } catch (err) {
        contentEl.innerHTML = `<div style="color:var(--accent-red);padding:16px;">Error: ${err.message}</div>`;
      }
    }

    function closeTenantAccessModal() {
      const modal = document.getElementById('tenant-access-modal');
      if (modal) modal.style.display = 'none';
    }

    globalThis.openTenantAccessModal = openTenantAccessModal;
    globalThis.closeTenantAccessModal = closeTenantAccessModal;

    // ========== END WHITE-LABEL TENANTS ==========


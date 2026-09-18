    // ========== DASHBOARD ==========
    async function updateDashboard() {
      try {
        // Task #61 (2026-09-10) — these used to query supabaseClient
        // directly from the browser, which only ever resolves real rows
        // for a profiles.role=admin session; a Team Login session has no
        // such session, so every card here silently read 0 for every
        // team-login user regardless of their permissions. Routed through
        // GET /api/admin/stats/kpis (authenticateAdminSection(..., 'dashboard'),
        // service-role client server-side) so this works the same way the
        // rest of the page's team-login-aware sections already do.
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const kpisRes = await fetch(`${apiBase}/api/admin/stats/kpis`, { headers: getAdminHeaders() });
        const kpisJson = await kpisRes.json();
        if (!kpisRes.ok || !kpisJson.success) throw new Error(kpisJson.error || 'Failed to load dashboard KPIs');
        const kpis = kpisJson.data;

        const pendingAppsCount = kpis.pendingApps;
        const openDisputesCount = kpis.openDisputes;
        const openTicketsCount = kpis.openTickets;

        document.getElementById('stat-pending-apps').textContent = pendingAppsCount || 0;
        document.getElementById('stat-active-providers').textContent = kpis.activeProviders || 0;
        document.getElementById('stat-escrow').textContent = '$' + (kpis.escrowAmount || 0).toLocaleString();
        document.getElementById('stat-open-disputes').textContent = openDisputesCount || 0;
        document.getElementById('stat-revenue').textContent = '$' + (kpis.revenue || 0).toLocaleString();
        document.getElementById('stat-packages').textContent = kpis.activePackages || 0;

        const attentionItems = [];
        if (pendingAppsCount > 0) attentionItems.push({ icon: mccIcon('clipboard-list', 16), text: `${pendingAppsCount} provider application(s) awaiting review`, section: 'applications' });
        if (openDisputesCount > 0) attentionItems.push({ icon: mccIcon('alert-triangle', 16), text: `${openDisputesCount} dispute(s) need resolution`, section: 'disputes' });
        if (openTicketsCount > 0) attentionItems.push({ icon: mccIcon('ticket', 16), text: `${openTicketsCount} support ticket(s) awaiting response`, section: 'tickets' });

        const container = document.getElementById('attention-items');
        if (attentionItems.length === 0) {
          container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">' + mccIcon('check-circle', 40) + '</div><p>All caught up!</p></div>';
        } else {
          container.innerHTML = attentionItems.map(item => `
            <div style="display:flex;align-items:center;gap:16px;padding:16px;background:var(--bg-elevated);border-radius:var(--radius-md);margin-bottom:8px;cursor:pointer;" onclick="showSection('${item.section}')">
              <span style="font-size:24px;">${item.icon}</span>
              <span>${item.text}</span>
              <span style="margin-left:auto;color:var(--accent-blue);">View →</span>
            </div>
          `).join('');
        }

        await loadRecentActivityLazy();
        await loadQuickStats();
      } catch (err) {
        console.error('Dashboard update error:', err);
      }
    }

    async function loadRecentActivityLazy() {
      try {
        const [
          { data: recentPayments },
          { data: recentApps },
          { data: recentDisputes }
        ] = await Promise.all([
          supabaseClient.from('payments').select('status, amount_total, created_at').order('created_at', { ascending: false }).limit(5),
          supabaseClient.from('provider_applications').select('business_name, created_at').order('created_at', { ascending: false }).limit(3),
          supabaseClient.from('disputes').select('status, created_at, maintenance_packages(title)').order('created_at', { ascending: false }).limit(3)
        ]);

        const activities = [];
        (recentPayments || []).forEach(p => {
          activities.push({
            icon: p.status === 'released' ? mccIcon('dollar-sign', 16) : p.status === 'held' ? mccIcon('lock', 16) : mccIcon('credit-card', 16),
            text: `${p.status === 'released' ? 'Payment released' : p.status === 'held' ? 'Payment held in escrow' : 'Payment'} - $${p.amount_total?.toFixed(2) || 0}`,
            time: p.created_at,
            type: 'payment'
          });
        });
        (recentApps || []).forEach(a => {
          activities.push({ icon: mccIcon('clipboard-list', 16), text: `New provider application: ${a.business_name}`, time: a.created_at, type: 'application' });
        });
        (recentDisputes || []).forEach(d => {
          activities.push({ icon: mccIcon('alert-triangle', 16), text: `Dispute ${d.status}: ${d.maintenance_packages?.title || 'Package'}`, time: d.created_at, type: 'dispute' });
        });

        activities.sort((a, b) => new Date(b.time) - new Date(a.time));
        const container = document.getElementById('recent-activity-feed');
        if (activities.length === 0) {
          container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">' + mccIcon('bar-chart', 40) + '</div><p>No recent activity</p></div>';
          return;
        }
        container.innerHTML = activities.slice(0, 8).map(a => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-subtle);">
            <span style="font-size:18px;">${a.icon}</span>
            <div style="flex:1;">
              <div style="font-size:0.9rem;">${a.text}</div>
              <div style="font-size:0.78rem;color:var(--text-muted);">${formatTimeAgo(a.time)}</div>
            </div>
          </div>
        `).join('');
      } catch (err) {
        console.error('Recent activity error:', err);
      }
    }

    function updateStatPreviews() {
      // NOTE: This function is not currently called from anywhere.
      // It uses global arrays which would be empty during lazy loading.
      // If previews are needed in the future, this should be refactored to
      // fetch its own data like loadRecentActivityLazy() does.
      // Preview for pending applications
      const pendingApps = applications.filter(a => a.status === 'pending').slice(0, 3);
      const appsPreview = document.getElementById('preview-pending-apps');
      if (pendingApps.length > 0) {
        appsPreview.innerHTML = pendingApps.map(a => `
          <div class="stat-preview-item">
            <span class="stat-preview-name">${a.business_name || 'Unnamed'}</span>
          </div>
        `).join('');
        if (applications.filter(a => a.status === 'pending').length > 3) {
          appsPreview.innerHTML += '<div class="stat-preview-more">+ more...</div>';
        }
        appsPreview.classList.add('has-data');
      } else {
        appsPreview.classList.remove('has-data');
      }

      // Preview for active providers
      const activeProviders = providers.slice(0, 3);
      const providersPreview = document.getElementById('preview-active-providers');
      if (activeProviders.length > 0) {
        providersPreview.innerHTML = activeProviders.map(p => `
          <div class="stat-preview-item">
            <span class="stat-preview-name">${p.business_name || p.full_name || 'Provider'}</span>
          </div>
        `).join('');
        if (providers.length > 3) {
          providersPreview.innerHTML += '<div class="stat-preview-more">+ more...</div>';
        }
        providersPreview.classList.add('has-data');
      } else {
        providersPreview.classList.remove('has-data');
      }

      // Preview for open disputes
      const openDisputes = disputes.filter(d => d.status === 'open').slice(0, 3);
      const disputesPreview = document.getElementById('preview-open-disputes');
      if (openDisputes.length > 0) {
        disputesPreview.innerHTML = openDisputes.map(d => `
          <div class="stat-preview-item">
            <span class="stat-preview-name">${d.maintenance_packages?.title || 'Dispute'}</span>
          </div>
        `).join('');
        if (disputes.filter(d => d.status === 'open').length > 3) {
          disputesPreview.innerHTML += '<div class="stat-preview-more">+ more...</div>';
        }
        disputesPreview.classList.add('has-data');
      } else {
        disputesPreview.classList.remove('has-data');
      }

      // Preview for active packages
      const activePackages = allPackages.filter(p => ['open', 'accepted', 'in_progress'].includes(p.status)).slice(0, 3);
      const packagesPreview = document.getElementById('preview-packages');
      if (activePackages.length > 0) {
        packagesPreview.innerHTML = activePackages.map(p => `
          <div class="stat-preview-item">
            <span class="stat-preview-name">${p.title || 'Package'}</span>
          </div>
        `).join('');
        if (allPackages.filter(p => ['open', 'accepted', 'in_progress'].includes(p.status)).length > 3) {
          packagesPreview.innerHTML += '<div class="stat-preview-more">+ more...</div>';
        }
        packagesPreview.classList.add('has-data');
      } else {
        packagesPreview.classList.remove('has-data');
      }
    }

    async function loadQuickStats() {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      
      try {
        // New members
        const { count: newMembers } = await supabaseClient
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'member')
          .gte('created_at', sevenDaysAgo);
        document.getElementById('stat-new-members').textContent = newMembers || 0;

        // New packages
        const { count: newPackages } = await supabaseClient
          .from('maintenance_packages')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', sevenDaysAgo);
        document.getElementById('stat-new-packages').textContent = newPackages || 0;

        // New bids
        const { count: newBids } = await supabaseClient
          .from('bids')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', sevenDaysAgo);
        document.getElementById('stat-new-bids').textContent = newBids || 0;

        // Completed jobs
        const { count: completedJobs } = await supabaseClient
          .from('maintenance_packages')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'completed')
          .gte('member_confirmed_at', sevenDaysAgo);
        document.getElementById('stat-completed-jobs').textContent = completedJobs || 0;

        // Total processed
        const { data: processedPayments } = await supabaseClient
          .from('payments')
          .select('amount_total')
          .eq('status', 'released')
          .gte('released_at', sevenDaysAgo);
        const totalProcessed = processedPayments?.reduce((sum, p) => sum + (p.amount_total || 0), 0) || 0;
        document.getElementById('stat-total-processed').textContent = '$' + totalProcessed.toLocaleString();
      } catch (err) {
        console.error('Error loading quick stats:', err);
      }
    }

    function formatTimeAgo(timestamp) {
      const now = new Date();
      const date = new Date(timestamp);
      const diff = now - date;
      
      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return Math.floor(diff / 60000) + ' minutes ago';
      if (diff < 86400000) return Math.floor(diff / 3600000) + ' hours ago';
      if (diff < 604800000) return Math.floor(diff / 86400000) + ' days ago';
      return date.toLocaleDateString();
    }

    // ========== RENDER TABLES ==========
    // Task #248 — derive the filter "source key" for an application. Apps
    // that were never linked to an outreach lead get the pseudo-source
    // 'direct' so they're filterable as a group ("Direct signup"). Apps
    // linked to a lead but with a missing/loaded-as-null source string
    // collapse to 'outreach' (matches the badge fallback in
    // renderApplicationLeadBadge).
    function getApplicationSourceKey(app) {
      if (!app || !app.outreach_lead_id) return 'direct';
      const lead = app._outreach_lead;
      const raw = (lead && lead.source) ? String(lead.source).trim().toLowerCase() : '';
      return raw || 'outreach';
    }
    globalThis.getApplicationSourceKey = getApplicationSourceKey;

    // Title-case a source key for display ("hunter" → "Hunter",
    // "direct" → "Direct signup"). Mirrors renderApplicationLeadBadge.
    function formatApplicationSourceLabel(key) {
      if (key === 'direct') return 'Direct signup';
      const s = String(key || '').replaceAll('_', ' ');
      return s.charAt(0).toUpperCase() + s.slice(1);
    }

    // Task #248 — populate the <select> with the distinct source keys
    // present in the loaded applications, plus render a tiny breakdown
    // widget showing the count per source. Called from renderApplications
    // so every refresh keeps both UI bits in sync with the data.
    function refreshApplicationSourceUI() {
      const select = document.getElementById('application-source-filter');
      const breakdown = document.getElementById('application-source-breakdown');
      if (!select && !breakdown) return;

      // Group counts by source key across the FULL application set (not
      // the status-filtered subset) so the dropdown options never
      // disappear when the reviewer flips between status tabs.
      const counts = new Map();
      applications.forEach(a => {
        const key = getApplicationSourceKey(a);
        counts.set(key, (counts.get(key) || 0) + 1);
      });

      // Stable ordering: known sources first in a friendly order, then any
      // unknown ones alphabetically. Keeps the dropdown predictable.
      const knownOrder = ['hunter', 'apollo', 'manual', 'outreach', 'direct'];
      const allKeys = Array.from(counts.keys());
      const ordered = [
        ...knownOrder.filter(k => counts.has(k)),
        ...allKeys.filter(k => !knownOrder.includes(k)).sort()
      ];

      if (select) {
        const current = currentFilters.applicationsSource || 'all';
        const totalCount = applications.length;
        const opts = [`<option value="all">All sources (${totalCount})</option>`];
        ordered.forEach(k => {
          opts.push(`<option value="${escapeHtml(k)}">${escapeHtml(formatApplicationSourceLabel(k))} (${counts.get(k)})</option>`);
        });
        // If the current filter refers to a source no longer present in
        // the data, still render it so the user sees what they picked
        // (with a 0 count) and can clear it.
        if (current !== 'all' && !counts.has(current)) {
          opts.push(`<option value="${escapeHtml(current)}">${escapeHtml(formatApplicationSourceLabel(current))} (0)</option>`);
        }
        select.innerHTML = opts.join('');
        select.value = current;
      }

      if (breakdown) {
        if (!ordered.length) {
          breakdown.innerHTML = '';
        } else {
          breakdown.innerHTML = ordered.map(k => {
            const isActive = currentFilters.applicationsSource === k;
            const style = `padding:3px 8px;border-radius:100px;border:1px solid ${isActive ? 'var(--accent-gold)' : 'var(--border-subtle)'};background:${isActive ? 'rgba(201,162,39,0.12)' : 'transparent'};color:${isActive ? 'var(--accent-gold)' : 'var(--text-muted)'};`;
            return `<span style="${style}">${escapeHtml(formatApplicationSourceLabel(k))}: <strong>${counts.get(k)}</strong></span>`;
          }).join('');
        }
      }
    }

    // Task #248 — write the current applications filters back to the URL
    // so deep links (e.g. shared in Slack) restore the same view.
    function syncApplicationsUrl() {
      try {
        const params = new URLSearchParams(globalThis.location.search);
        if (currentFilters.applications && currentFilters.applications !== 'pending') {
          params.set('app_status', currentFilters.applications);
        } else {
          params.delete('app_status');
        }
        if (currentFilters.applicationsSource && currentFilters.applicationsSource !== 'all') {
          params.set('app_source', currentFilters.applicationsSource);
        } else {
          params.delete('app_source');
        }
        const qs = params.toString();
        const url = globalThis.location.pathname + (qs ? `?${qs}` : '') + globalThis.location.hash;
        globalThis.history.replaceState(null, '', url);
      } catch { /* Intentionally silent — URL update must never break the admin UI. */ }
    }

    // Task #248 — change handler bound to the source <select>. Updates
    // state, refreshes the URL, and re-renders the table.
    function filterApplicationsBySource(value) {
      currentFilters.applicationsSource = value || 'all';
      paginationState.applications.page = 1;
      syncApplicationsUrl();
      renderApplications();
    }
    globalThis.filterApplicationsBySource = filterApplicationsBySource;

    function renderApplications() {
      const tbody = document.getElementById('applications-table');

      // Task #281 — show load error before falling through to "No applications".
      if (loadErrors.applications) {
        renderTableLoadErrorRow('applications-table', 7, 'applications', 'loadApplications()');
        return;
      }

      // Task #248 — keep the source dropdown + breakdown widget in sync
      // with the currently-loaded applications on every render.
      refreshApplicationSourceUI();

      const sourceFilter = currentFilters.applicationsSource || 'all';
      const filtered = applications.filter(a => {
        const statusOk = currentFilters.applications === 'all' || a.status === currentFilters.applications;
        if (!statusOk) return false;
        if (sourceFilter === 'all') return true;
        return getApplicationSourceKey(a) === sourceFilter;
      });

      if (!filtered.length) {
        const reason = sourceFilter === 'all'
          ? 'No applications'
          : `No applications match source "${escapeHtml(formatApplicationSourceLabel(sourceFilter))}"`;
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">${reason}</td></tr>`;
        return;
      }

      const sortedApps = applySortToRows(filtered, sortState.applications, (r, col) => {
        if (col === 'business_name') return r.business_name;
        if (col === 'business_type') return r.business_type;
        if (col === 'city') return r.city;
        if (col === 'created_at') return new Date(r.created_at).getTime();
        if (col === 'status') return r.status;
        return null;
      });

      const pagedApps = applyClientPagination(sortedApps, paginationState.applications);

      tbody.innerHTML = pagedApps.map(app => `
        <tr>
          <td><strong>${escapeHtml(app.business_name)}</strong><br><span style="color:var(--text-muted);font-size:0.82rem;">${escapeHtml(app.contact_name)}</span></td>
          <td>${escapeHtml(app.business_type) || 'N/A'}</td>
          <td>${escapeHtml(app.city) || ''}, ${escapeHtml(app.state) || ''}</td>
          <td>${new Date(app.created_at).toLocaleDateString()}</td>
          <td>${renderApplicationLeadBadge(app)}</td>
          <td><span class="status-badge ${escapeHtml(app.status)}">${escapeHtml(app.status)}</span></td>
          <td><button class="btn btn-secondary btn-sm" onclick="viewApplication('${escapeHtml(app.id)}')">Review</button></td>
        </tr>
      `).join('');
      updateSortIndicators('applications-table', sortState.applications);
      const appsPagEl = document.getElementById('applications-pagination');
      if (appsPagEl) appsPagEl.innerHTML = renderPaginationControls(paginationState.applications, 'changeApplicationsPage', 'changeApplicationsPageSize');
    }

    let selectedProviders = new Set();
    let filteredProviders = [];

    function renderBgCheckBadge(status, updatedAt) {
      const cfg = {
        eligible:     { bg: 'rgba(74,200,140,0.15)',  border: 'rgba(74,200,140,0.3)',  color: 'var(--accent-green)',  icon: '✅', label: 'Cleared'    },
        clear:        { bg: 'rgba(74,200,140,0.15)',  border: 'rgba(74,200,140,0.3)',  color: 'var(--accent-green)',  icon: '✅', label: 'Cleared'    },
        needs_review: { bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.3)',  color: 'var(--accent-orange)', icon: '⚠️', label: 'Review'     },
        not_eligible: { bg: 'rgba(239,95,95,0.15)',   border: 'rgba(239,95,95,0.3)',   color: 'var(--accent-red)',    icon: '🚫', label: 'Not Eligible'},
        initiated:    { bg: 'rgba(56,189,248,0.1)',   border: 'rgba(56,189,248,0.25)', color: 'var(--accent-blue)',   icon: '⏳', label: 'Initiated'  },
        pending:      { bg: 'rgba(201,162,39,0.12)',  border: 'rgba(201,162,39,0.3)',  color: 'var(--accent-gold)',   icon: '⏳', label: 'Pending'    },
        processing:   { bg: 'rgba(56,189,248,0.1)',   border: 'rgba(56,189,248,0.25)', color: 'var(--accent-blue)',   icon: '🔍', label: 'Processing' },
        canceled:     { bg: 'rgba(100,100,120,0.1)',  border: 'var(--border-subtle)',  color: 'var(--text-muted)',    icon: '—',  label: 'Canceled'   },
        disputed:     { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.25)', color: 'var(--accent-orange)', icon: '⚠️', label: 'Disputed'   },
      };
      if (!status) {
        return `<span style="font-size:0.75rem;color:var(--text-muted);">Not started</span>`;
      }
      const s = cfg[status] || { bg: 'rgba(100,100,120,0.1)', border: 'var(--border-subtle)', color: 'var(--text-muted)', icon: '—', label: status };
      const title = updatedAt ? `title="Updated ${new Date(updatedAt).toLocaleDateString()}"` : '';
      return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:100px;font-size:0.72rem;font-weight:600;background:${s.bg};color:${s.color};border:1px solid ${s.border};" ${title}>${s.icon} ${s.label}</span>`;
    }

    // Task #373 — BackgroundChecks.com Mode visibility panel. Renders a
    // header card with the global BGC_LIVE_MODE flag + platform-fallback
    // status, and a per-provider table showing each provider's Live/Mock
    // pill, mode_reason, pending/completed counts, and bgchecks_account_id.
    // Source data: GET /api/admin/bgc/providers (already fetched by
    // loadProviders so the same payload is reused — no extra round-trip).
    function renderBgcModePanel(bgcJson) {
      const host = document.getElementById('bgc-mode-panel');
      if (!host) return;
      if (bgcJson && bgcJson.error) {
        host.innerHTML = `
          <div class="card" style="padding:16px 20px;border:1px solid var(--border-subtle);">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
              <div>
                <div style="font-weight:600;font-size:0.95rem;">BackgroundChecks.com Mode</div>
                <div style="font-size:0.8rem;color:var(--accent-red);">Failed to load: ${escapeHtml(String(bgcJson.error))}</div>
              </div>
              <button class="btn btn-sm btn-secondary" onclick="loadProviders(paginationState.providers.page||1)">Retry</button>
            </div>
          </div>`;
        return;
      }
      const rows = (bgcJson && bgcJson.providers) || [];
      const liveGlobal = !!(bgcJson && bgcJson.live_mode_global);
      const hasFallback = !!(bgcJson && bgcJson.platform_fallback);
      const liveCount = rows.filter(r => r.live_mode).length;
      const mockCount = rows.length - liveCount;

      const headerPill = (label, color, bg, border) =>
        `<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:100px;font-size:0.72rem;font-weight:700;background:${bg};color:${color};border:1px solid ${border};">${label}</span>`;

      const globalPill = liveGlobal
        ? headerPill('BGC_LIVE_MODE ON', 'var(--accent-green)', 'rgba(74,200,140,0.15)', 'rgba(74,200,140,0.3)')
        : headerPill('BGC_LIVE_MODE OFF', 'var(--text-muted)', 'rgba(100,100,120,0.15)', 'var(--border-subtle)');
      const fallbackPill = hasFallback
        ? headerPill('Platform fallback token present', 'var(--accent-blue)', 'rgba(56,189,248,0.12)', 'rgba(56,189,248,0.25)')
        : headerPill('No platform fallback token', 'var(--accent-orange)', 'rgba(245,158,11,0.12)', 'rgba(245,158,11,0.25)');

      const bodyHtml = rows.length === 0
        ? `<div class="empty-state" style="padding:18px;">No providers have BGC activity yet.</div>`
        : `
          <div style="overflow-x:auto;">
            <table style="width:100%;">
              <thead>
                <tr>
                  <th style="text-align:left;">Provider</th>
                  <th style="text-align:left;">Mode</th>
                  <th style="text-align:left;">Reason</th>
                  <th style="text-align:right;">Pending</th>
                  <th style="text-align:right;">Completed</th>
                  <th style="text-align:right;">Expiring ≤30d</th>
                  <th style="text-align:left;">BGC account ID</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r => {
                  const livePill = r.live_mode
                    ? '<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:100px;font-size:0.7rem;font-weight:700;background:rgba(74,200,140,0.15);color:var(--accent-green);border:1px solid rgba(74,200,140,0.3);">LIVE</span>'
                    : '<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:100px;font-size:0.7rem;font-weight:700;background:rgba(100,100,120,0.15);color:var(--text-muted);border:1px solid var(--border-subtle);">MOCK</span>';
                  const name = escapeHtml(r.business_name || 'Unnamed');
                  const email = r.email ? `<div style="font-size:0.78rem;color:var(--text-muted);">${escapeHtml(r.email)}</div>` : '';
                  const reason = escapeHtml(r.mode_reason || '—');
                  const acct = r.bgchecks_account_id
                    ? `<code style="font-size:0.78rem;">${escapeHtml(String(r.bgchecks_account_id))}</code>`
                    : '<span style="color:var(--text-muted);">—</span>';
                  const expiring = r.expiring_within_30_days || 0;
                  const expiringCell = expiring > 0
                    ? `<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:100px;font-size:0.7rem;font-weight:700;background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.4);">⚠ ${expiring}</span>`
                    : `<span style="color:var(--text-muted);">—</span>`;
                  return `
                    <tr>
                      <td><div><strong>${name}</strong></div>${email}</td>
                      <td>${livePill}</td>
                      <td style="font-size:0.82rem;color:var(--text-muted);">${reason}</td>
                      <td style="text-align:right;">${r.pending_count || 0}</td>
                      <td style="text-align:right;">${r.completed_count || 0}</td>
                      <td style="text-align:right;">${expiringCell}</td>
                      <td>${acct}</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`;

      host.innerHTML = `
        <div class="card" style="padding:0;overflow:hidden;">
          <div style="padding:16px 20px;border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div>
              <div style="font-weight:600;font-size:0.95rem;">BackgroundChecks.com Mode</div>
              <div style="font-size:0.8rem;color:var(--text-muted);">Which providers are hitting the real BGC API vs. the mock path.</div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
              ${globalPill}
              ${fallbackPill}
              ${headerPill(`${liveCount} live`, 'var(--accent-green)', 'rgba(74,200,140,0.1)', 'rgba(74,200,140,0.25)')}
              ${headerPill(`${mockCount} mock`, 'var(--text-muted)', 'rgba(100,100,120,0.1)', 'var(--border-subtle)')}
            </div>
          </div>
          ${bodyHtml}
        </div>`;
    }

    // Step 1b — small badge cluster shown in the provider row's Status column.
    // All four fields are already in the admin-data response — frontend-only.
    function renderProviderSignals(p) {
      const b = (cls, text, title) =>
        `<span class="badge ${cls}" style="font-size:0.65rem;padding:2px 5px;" title="${title}">${text}</span>`;

      const v = p.verification_status;
      const vBadge = v === 'verified' ? b('badge-success',   'Verified',   'Verified to place bids')
                   : v === 'pending'  ? b('badge-warning',   'V Pending',  'Verification pending review')
                   : v === 'rejected' ? b('badge-danger',    'V Rejected', 'Verification rejected')
                                      : b('badge-secondary', 'Unverified', 'Not yet verified for bidding');

      const idBadge = p.identity_verified
        ? b('badge-success', 'ID ✓', 'Stripe Identity verified')
        : b('badge-warning', 'ID —', 'Stripe Identity not verified');

      const bgcBadge = p.bgc_badge_verified
        ? b('badge-success', 'BGC ✓', 'Background-check badge verified')
        : b('badge-warning', 'BGC —', 'Background-check badge not verified');

      const a = p.application_status;
      const aBadge = a === 'approved'         ? b('badge-success',   'App ✓',  'Application approved')
                   : a === 'pending'          ? b('badge-warning',   'App pending', 'Application pending')
                   : a === 'rejected'         ? b('badge-danger',    'App ✗',  'Application rejected')
                   : a === 'more_info_needed' ? b('badge-warning',   'App ?',       'Application needs more info')
                                              : b('badge-secondary', 'App —',  'No application');

      return vBadge + idBadge + bgcBadge + aBadge;
    }

    function renderProviders() {
      const tbody = document.getElementById('providers-table');
      // Task #281 — show load error before falling through to "No providers match filters",
      // which previously masked a failed fetch as an empty result set.
      if (loadErrors.providers) {
        // Task #249 — column count bumped from 9 → 10 (added Source column).
        renderTableLoadErrorRow('providers-table', 10, 'providers', 'loadProviders()');
        updateBulkBar();
        return;
      }
      filteredProviders = filterProvidersData();

      if (!filteredProviders.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No providers match filters</td></tr>';
        updateBulkBar();
        return;
      }

      const sortedProviders = applySortToRows(filteredProviders, sortState.providers, (p, col) => {
        const stats = p.provider_stats?.[0] || {};
        if (col === 'business_name') return p.business_name || p.full_name || '';
        if (col === 'bid_credits') return (p.bid_credits || 0) + (p.free_trial_bids || 0);
        if (col === 'rating') return stats.average_rating || 0;
        if (col === 'jobs') return stats.jobs_completed || 0;
        if (col === 'earnings') return stats.total_earnings || 0;
        if (col === 'status') return p.suspension_reason ? 'suspended' : 'active';
        return null;
      });

      tbody.innerHTML = sortedProviders.map(p => {
        const stats = p.provider_stats?.[0] || {};
        const totalCredits = (p.bid_credits || 0) + (p.free_trial_bids || 0);
        const isSuspended = p.suspension_reason || stats.suspended;
        const isSelected = selectedProviders.has(p.id);
        
        // Intentional contrast: dark text (#0a0a0f) on gold FOUNDING badge for readability
        return `
          <tr style="${isSelected ? 'background:var(--accent-blue-soft);' : ''}">
            <td><input type="checkbox" class="provider-checkbox" data-id="${p.id}" ${isSelected ? 'checked' : ''} onchange="toggleProviderSelection('${p.id}')"></td>
            <td>
              <div><strong>${p.business_name || p.full_name || 'Unnamed'}</strong>${p.is_founding_provider ? ' <span style="background:linear-gradient(135deg,var(--accent-gold),#f0d78c);color:#0a0a0f;padding:2px 8px;border-radius:4px;font-size:0.7rem;font-weight:600;margin-left:8px;">' + mccIcon('star', 16) + ' FOUNDING</span>' : ''}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${p.email || ''}</div>
            </td>
            <td>
              <span style="padding:4px 8px;border-radius:4px;font-size:0.85rem;background:${totalCredits === 0 ? 'var(--accent-red-soft)' : totalCredits < 10 ? 'var(--accent-orange-soft)' : 'var(--accent-green-soft)'};color:${totalCredits === 0 ? 'var(--accent-red)' : totalCredits < 10 ? 'var(--accent-orange)' : 'var(--accent-green)'};">
                ${mccIcon('ticket', 16)} ${totalCredits}
              </span>
            </td>
            <td>${mccIcon('star', 16)} ${stats.average_rating?.toFixed(1) || 'New'}${stats.average_rating && stats.average_rating < 4 ? ' <span style="color:var(--accent-red);">' + mccIcon('alert-triangle', 16) + '</span>' : ''}</td>
            <td>${stats.jobs_completed || 0}</td>
            <td>$${(stats.total_earnings || 0).toLocaleString()}</td>
            <td>${renderBgCheckBadge(p.bgcheck_status, p.bgcheck_updated_at)}${
              p.bgc_live_mode === true
                ? ' <span title="' + (p.bgc_mode_reason || 'live BGC API') + '" style="display:inline-flex;align-items:center;padding:2px 6px;border-radius:100px;font-size:0.65rem;font-weight:700;background:rgba(74,200,140,0.15);color:var(--accent-green);border:1px solid rgba(74,200,140,0.3);margin-left:4px;">LIVE</span>'
                : (p.bgc_live_mode === false
                  ? ' <span title="' + (p.bgc_mode_reason || 'mock mode') + '" style="display:inline-flex;align-items:center;padding:2px 6px;border-radius:100px;font-size:0.65rem;font-weight:700;background:rgba(100,100,120,0.15);color:var(--text-muted);border:1px solid var(--border-subtle);margin-left:4px;">MOCK</span>'
                  : '')
            }${
              (typeof p.bgc_pending_count === 'number' || typeof p.bgc_completed_count === 'number')
                ? '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;" title="Real (non-mock) BGC checks">' +
                  (p.bgc_completed_count || 0) + ' done · ' + (p.bgc_pending_count || 0) + ' pending' +
                  '</div>'
                : ''
            }</td>
            <td>${renderApplicationLeadBadge(p)}</td>
            <td>
              <span class="status-badge ${isSuspended ? 'rejected' : 'approved'}">${isSuspended ? 'Suspended' : 'Active'}</span>
              <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">${renderProviderSignals(p)}</div>
            </td>
            <td>
              <div style="display:flex;gap:4px;">
                <button class="btn btn-secondary btn-sm" onclick="viewProvider('${p.id}')">View</button>
                <button class="btn btn-ghost btn-sm" onclick="quickAddCredits('${p.id}')" title="Add Credits">${mccIcon('ticket', 16)}</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
      
      updateBulkBar();
      updateSortIndicators('providers-table', sortState.providers);

      // Add pagination controls
      const paginationContainer = document.getElementById('providers-pagination');
      if (paginationContainer) {
        paginationContainer.innerHTML = renderPaginationControls(paginationState.providers, 'changeProvidersPage');
      }
    }

    // Task: admin-portal audit — the "View" button called viewProvider(), which
    // never existed, so it silently threw and did nothing. Built as a
    // read-only detail modal over data already in `providers` (no extra
    // fetch); "Manage Credits" reuses the existing, already-wired
    // quickAddCredits() rather than duplicating that logic.
    function viewProvider(providerId) {
      const p = providers.find(pr => pr.id === providerId);
      if (!p) { showToast('Provider not found', 'error'); return; }

      const stats = p.provider_stats?.[0] || {};
      const isSuspended = !!(p.suspension_reason || stats.suspended);
      const totalCredits = (p.bid_credits || 0) + (p.free_trial_bids || 0);

      const body = document.getElementById('provider-detail-modal-body');
      body.innerHTML = `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('user', 24)} Provider Information</div>
          <div class="detail-grid">
            <span class="detail-label">Business Name:</span>
            <span class="detail-value">${escapeHtml(p.business_name || p.full_name || 'Unnamed')}${p.is_founding_provider ? ' <span style="background:linear-gradient(135deg,var(--accent-gold),#f0d78c);color:#0a0a0f;padding:2px 8px;border-radius:4px;font-size:0.7rem;font-weight:600;margin-left:6px;">FOUNDING</span>' : ''}</span>
            <span class="detail-label">Contact Name:</span>
            <span class="detail-value">${escapeHtml(p.full_name || '—')}</span>
            <span class="detail-label">Email:</span>
            <span class="detail-value">${escapeHtml(p.email || '—')}</span>
            <span class="detail-label">Phone:</span>
            <span class="detail-value">${escapeHtml(p.phone || '—')}</span>
            <span class="detail-label">Joined:</span>
            <span class="detail-value">${p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</span>
            <span class="detail-label">Status:</span>
            <span class="detail-value"><span class="status-badge ${isSuspended ? 'rejected' : 'approved'}">${isSuspended ? 'Suspended' : 'Active'}</span>${isSuspended && p.suspension_reason ? ` <span style="color:var(--text-muted);font-size:0.85rem;">(${escapeHtml(p.suspension_reason)})</span>` : ''}</span>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('bar-chart', 24)} Performance</div>
          <div class="detail-grid">
            <span class="detail-label">Rating:</span>
            <span class="detail-value">${stats.average_rating?.toFixed(1) || 'New'}${stats.total_reviews ? ` (${stats.total_reviews} reviews)` : ''}</span>
            <span class="detail-label">Jobs Completed:</span>
            <span class="detail-value">${stats.jobs_completed || 0}</span>
            <span class="detail-label">Total Earnings:</span>
            <span class="detail-value">$${(stats.total_earnings || 0).toLocaleString()}</span>
            <span class="detail-label">Bid Credits:</span>
            <span class="detail-value">${totalCredits} (${p.bid_credits || 0} paid + ${p.free_trial_bids || 0} trial)</span>
          </div>
        </div>

        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('shield', 24)} Verification</div>
          <div class="detail-grid">
            <span class="detail-label">Application:</span>
            <span class="detail-value">${escapeHtml(p.application_status || '—')}</span>
            <span class="detail-label">Background Check:</span>
            <span class="detail-value">${escapeHtml(p.bgcheck_status || 'not started')}${p.bgc_live_mode === true ? ' (live)' : p.bgc_live_mode === false ? ' (mock)' : ''}</span>
            <span class="detail-label">Identity Verified:</span>
            <span class="detail-value">${p.identity_verified ? 'Yes' : 'No'}</span>
          </div>
        </div>
      `;

      document.getElementById('provider-detail-modal-footer').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('provider-detail-modal')">Close</button>
        <button class="btn btn-primary" onclick="closeModal('provider-detail-modal'); quickAddCredits('${p.id}');">Manage Credits</button>
      `;

      openModal('provider-detail-modal');
    }
    globalThis.viewProvider = viewProvider;

    function filterProvidersData() {
      const statusFilter = document.getElementById('provider-status-filter')?.value || 'all';
      const creditsFilter = document.getElementById('provider-credits-filter')?.value || 'all';
      const ratingFilter = document.getElementById('provider-rating-filter')?.value || 'all';
      const typeFilter = document.getElementById('provider-type-filter')?.value || 'all';
      const searchTerm = document.getElementById('provider-search')?.value?.toLowerCase() || '';

      return providers.filter(p => {
        const stats = p.provider_stats?.[0] || {};
        const isSuspended = p.suspension_reason || stats.suspended;
        const totalCredits = (p.bid_credits || 0) + (p.free_trial_bids || 0);
        const avgRating = stats.average_rating;
        const searchStr = `${p.business_name || ''} ${p.full_name || ''} ${p.email || ''}`.toLowerCase();

        // Status filter
        if (statusFilter === 'active' && isSuspended) return false;
        if (statusFilter === 'suspended' && !isSuspended) return false;

        // Credits filter
        if (creditsFilter === 'zero' && totalCredits > 0) return false;
        if (creditsFilter === 'low' && (totalCredits === 0 || totalCredits > 10)) return false;
        if (creditsFilter === 'has' && totalCredits < 10) return false;

        // Rating filter
        if (ratingFilter === 'low' && (avgRating === null || avgRating === undefined || avgRating >= 4)) return false;
        if (ratingFilter === 'good' && (avgRating === null || avgRating === undefined || avgRating < 4)) return false;
        if (ratingFilter === 'new' && avgRating !== null && avgRating !== undefined) return false;

        // Type filter (founding/standard)
        if (typeFilter === 'founding' && !p.is_founding_provider) return false;
        if (typeFilter === 'standard' && p.is_founding_provider) return false;

        // Search filter
        if (searchTerm && !searchStr.includes(searchTerm)) return false;

        return true;
      });
    }

    function filterProviders() {
      renderProviders();
    }

    function toggleProviderSelection(id) {
      if (selectedProviders.has(id)) {
        selectedProviders.delete(id);
      } else {
        selectedProviders.add(id);
      }
      renderProviders();
    }

    function toggleSelectAll(checkbox) {
      if (checkbox.checked) {
        filteredProviders.forEach(p => selectedProviders.add(p.id));
      } else {
        selectedProviders.clear();
      }
      renderProviders();
    }

    function clearSelection() {
      selectedProviders.clear();
      document.getElementById('select-all-providers').checked = false;
      renderProviders();
    }

    function updateBulkBar() {
      const bar = document.getElementById('bulk-actions-bar');
      const count = selectedProviders.size;
      document.getElementById('selected-count').textContent = count;
      bar.style.display = count > 0 ? 'block' : 'none';
    }

    async function bulkAddCredits() {
      const count = selectedProviders.size;
      const credits = prompt(`Add bid credits to ${count} provider(s):\n\nEnter number of credits to add:`);
      if (!credits || isNaN(credits) || Number.parseInt(credits) <= 0) return;

      const creditsToAdd = Number.parseInt(credits);

      try {
        const res = await fetch('/api/admin/provider-actions/adjust-credits', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider_ids: Array.from(selectedProviders),
            delta: creditsToAdd,
            reason: 'Bulk credit grant from admin UI'
          })
        });
        const json = await res.json();
        if (!res.ok) {
          showToast(json.error || `Add credits failed (${res.status})`, 'error');
          return;
        }
        const ok = json.updated || 0;
        const failed = (json.failed || []).length;
        showToast(`Added ${creditsToAdd} credits to ${ok} provider(s)${failed ? ` · ${failed} failed` : ''}`, failed ? 'warning' : 'success');
        clearSelection();
        await loadProviders();
      } catch (e) {
        showToast(`Add credits failed: ${e.message}`, 'error');
      }
    }

    // Step 1b — Verify Provider bulk action. Mirrors bulkSuspend/bulkActivate.
    // Reason is OPTIONAL (verify is a positive action); cancel aborts.
    async function bulkVerify() {
      const count = selectedProviders.size;
      if (count < 1) { showToast('Select at least one provider', 'error'); return; }
      const reason = prompt(`Verify ${count} provider(s) to place bids on My Car Concierge?\n\nOptional notes (cancel to abort):`);
      if (reason === null) return;

      try {
        const res = await fetch('/api/admin/provider-actions/verify', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider_ids: Array.from(selectedProviders), reason: reason.trim() })
        });
        const json = await res.json();
        if (!res.ok) {
          showToast(json.error || `Verify failed (${res.status})`, 'error');
          return;
        }
        const ok = json.updated || 0;
        const failed = (json.failed || []).length;
        showToast(`Verified ${ok} provider(s)${failed ? ` · ${failed} failed` : ''}`, failed ? 'warning' : 'success');
        clearSelection();
        await loadProviders();
      } catch (e) {
        showToast(`Verify failed: ${e.message}`, 'error');
      }
    }

    async function bulkSuspend() {
      const count = selectedProviders.size;
      const reason = prompt(`Suspend ${count} provider(s):\n\nEnter suspension reason:`);
      if (!reason || reason.trim().length < 5) {
        showToast('Suspension reason must be at least 5 characters.', 'error');
        return;
      }

      try {
        const res = await fetch('/api/admin/provider-actions/suspend', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          // Step 1c — set_role_suspended:true engages the role-flip belt
          // (suspended_at is already RLS-gated, but flipping role='suspended'
          // is the secondary block the bid gate checks).
          body: JSON.stringify({ provider_ids: Array.from(selectedProviders), reason: reason.trim(), set_role_suspended: true })
        });
        const json = await res.json();
        if (!res.ok) {
          showToast(json.error || `Suspend failed (${res.status})`, 'error');
          return;
        }
        const ok = json.updated || 0;
        const failed = (json.failed || []).length;
        showToast(`Suspended ${ok} provider(s)${failed ? ` · ${failed} failed` : ''}`, failed ? 'warning' : 'success');
        clearSelection();
        await loadProviders();
      } catch (e) {
        showToast(`Suspend failed: ${e.message}`, 'error');
      }
    }

    async function bulkActivate() {
      const count = selectedProviders.size;
      if (!confirm(`Activate ${count} suspended provider(s)?`)) return;

      try {
        const res = await fetch('/api/admin/provider-actions/activate', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider_ids: Array.from(selectedProviders) })
        });
        const json = await res.json();
        if (!res.ok) {
          showToast(json.error || `Activate failed (${res.status})`, 'error');
          return;
        }
        const ok = json.updated || 0;
        const failed = (json.failed || []).length;
        showToast(`Activated ${ok} provider(s)${failed ? ` · ${failed} failed` : ''}`, failed ? 'warning' : 'success');
        clearSelection();
        await loadProviders();
      } catch (e) {
        showToast(`Activate failed: ${e.message}`, 'error');
      }
    }

    async function bulkSendMessage() {
      const count = selectedProviders.size;
      const message = prompt(`Send message to ${count} provider(s):\n\nEnter your message:`);
      if (!message) return;

      // Queue notification for each provider
      let success = 0;
      for (const providerId of selectedProviders) {
        const { error } = await supabaseClient.from('notifications').insert({
          user_id: providerId,
          type: 'admin_message',
          title: mccIcon('bell', 16) + ' Message from MCC Admin',
          message: message
        });
        if (!error) success++;
      }

      showToast(`Message sent to ${success} provider(s)`, 'success');
      clearSelection();
    }

    // Step 1c — flag-for-admin-review only (no auto-suspend). The endpoint
    // returns providers under 3.0 ★ with ≥10 published reviews. Admin then
    // reviews each one and uses the existing manual Suspend action.
    async function checkLowRatedProviders() {
      try {
        const res = await fetch('/api/admin/provider-actions/check-low-rated', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating_threshold: 3.0, min_reviews: 10 })
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || `Check failed (${res.status})`, 'error');
          return;
        }

        const flagged = data.providers || [];
        if (flagged.length === 0) {
          showToast('No providers under 3.0 ★ with ≥10 published reviews.', 'success');
          return;
        }

        // Surface the flagged set via the existing low-rating filter; admin
        // reviews each provider and Suspends manually.
        document.getElementById('provider-rating-filter').value = 'low';
        filterProviders();
        showToast(`Flagged ${flagged.length} provider(s) under 3.0 ${mccIcon('star', 14)} (≥10 reviews). Review and Suspend manually.`, 'info');
      } catch (e) {
        showToast(`Check failed: ${e.message}`, 'error');
      }
    }

    // Build a single CSV-export row from a provider profile + stats.
    // Extracted from bulkExport to keep that function under the cognitive
    // complexity budget (Task #262).
    function _providerToCsvRow(p) {
      const stats = p.provider_stats?.[0] || {};
      return {
        business_name: p.business_name || '',
        full_name: p.full_name || '',
        email: p.email || '',
        phone: p.business_phone || '',
        bid_credits: (p.bid_credits || 0) + (p.free_trial_bids || 0),
        rating: stats.average_rating || 'N/A',
        jobs_completed: stats.jobs_completed || 0,
        total_earnings: stats.total_earnings || 0,
        status: p.suspension_reason ? 'Suspended' : 'Active'
      };
    }

    function _downloadCsv(data, filenamePrefix) {
      const headers = Object.keys(data[0] || {}).join(',');
      const rows = data.map(row => Object.values(row).join(','));
      const csv = [headers, ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filenamePrefix}-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    function bulkExport() {
      const data = [];
      for (const providerId of selectedProviders) {
        const p = providers.find(pr => pr.id === providerId);
        if (p) data.push(_providerToCsvRow(p));
      }
      _downloadCsv(data, 'providers-export');
      showToast(`Exported ${data.length} provider(s)`, 'success');
    }

    async function quickAddCredits(providerId) {
      const provider = providers.find(p => p.id === providerId);
      const name = provider?.business_name || provider?.full_name || 'Provider';
      const currentCredits = (provider?.bid_credits || 0) + (provider?.free_trial_bids || 0);

      const credits = prompt(`Add credits to ${name}\nCurrent balance: ${currentCredits}\n\nEnter credits to add:`);
      if (!credits || isNaN(credits) || Number.parseInt(credits) <= 0) return;

      const creditsToAdd = Number.parseInt(credits);

      try {
        const res = await fetch('/api/admin/provider-actions/adjust-credits', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider_ids: [providerId],
            delta: creditsToAdd,
            reason: `Quick credit grant for ${name}`
          })
        });
        const json = await res.json();
        if (!res.ok || (json.updated || 0) === 0) {
          const detail = (json.failed && json.failed[0] && json.failed[0].error) || json.error || `status ${res.status}`;
          showToast(`Failed to add credits: ${detail}`, 'error');
          return;
        }
        showToast(`Added ${creditsToAdd} credits to ${name}`, 'success');
        await loadProviders();
      } catch (e) {
        showToast(`Failed to add credits: ${e.message}`, 'error');
      }
    }

    let filteredPayments = [];

    function renderPayments() {
      if (currentFilters.payments === 'transport') { renderTransportPayments(); return; }
      const filtered = payments.filter(p => p.status === currentFilters.payments || currentFilters.payments === 'all');
      filteredPayments = filtered;
      const tbody = document.getElementById('payments-table');

      // Update stats
      document.getElementById('payments-held').textContent = '$' + payments.filter(p => p.status === 'held').reduce((s, p) => s + (p.amount_total || 0), 0).toLocaleString();
      document.getElementById('payments-released').textContent = '$' + payments.filter(p => p.status === 'released').reduce((s, p) => s + (p.amount_total || 0), 0).toLocaleString();
      document.getElementById('payments-refunded').textContent = '$' + payments.filter(p => p.status === 'refunded').reduce((s, p) => s + (p.refund_amount || 0), 0).toLocaleString();
      document.getElementById('payments-fees').textContent = '$' + payments.filter(p => p.status === 'released').reduce((s, p) => s + (p.amount_mcc_fee || 0), 0).toLocaleString();

      // Task #281 — show load error before falling through to "No payments".
      if (loadErrors.payments) {
        renderTableLoadErrorRow('payments-table', 8, 'payments', 'loadPayments()');
        return;
      }

      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No payments</td></tr>';
        return;
      }

      const sortedPayments = applySortToRows(filtered, sortState.payments, (p, col) => {
        if (col === 'package') return p.maintenance_packages?.title || '';
        if (col === 'member') return p.member?.full_name || '';
        if (col === 'provider') return p.provider?.full_name || '';
        if (col === 'amount_total') return p.amount_total || 0;
        if (col === 'amount_mcc_fee') return p.amount_mcc_fee || 0;
        if (col === 'status') return p.status;
        return null;
      });

      const pagedPayments = applyClientPagination(sortedPayments, paginationState.payments);

      tbody.innerHTML = pagedPayments.map(p => `
        <tr>
          <td><input type="checkbox" class="payment-row-cb" data-id="${p.id}" ${selectedPaymentIds.has(p.id) ? 'checked' : ''} onchange="onPaymentRowCheck(this)"></td>
          <td>${p.maintenance_packages?.title || 'Package'}</td>
          <td>${p.member?.full_name || 'Member'}</td>
          <td>${p.provider?.full_name || 'Provider'}</td>
          <td>$${(p.amount_total || 0).toFixed(2)}</td>
          <td>$${(p.amount_mcc_fee || 0).toFixed(2)}</td>
          <td><span class="status-badge ${p.status}">${p.status}</span></td>
          <td style="white-space:nowrap;">
            ${p.status === 'held' ? `<button class="btn btn-sm btn-success" onclick="releasePayment('${p.id}')">Release</button> ` : ''}
            <button class="btn btn-sm btn-secondary" onclick="editPayment('${p.id}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="deletePayment('${p.id}')">Delete</button>
          </td>
        </tr>
      `).join('');
      updateSortIndicators('payments-table', sortState.payments);
      syncPaymentsBulkBar();
      const payPagEl = document.getElementById('payments-pagination');
      if (payPagEl) payPagEl.innerHTML = renderPaginationControls(paginationState.payments, 'changePaymentsPage', 'changePaymentsPageSize');
    }

    function syncPaymentsBulkBar() {
      const bar = document.getElementById('payments-bulk-bar');
      const countEl = document.getElementById('payments-bulk-count');
      const selectAll = document.getElementById('payments-select-all');
      const n = selectedPaymentIds.size;
      if (bar) bar.style.display = n > 0 ? 'flex' : 'none';
      if (countEl) countEl.textContent = `${n} payment${n === 1 ? '' : 's'} selected`;
      if (selectAll) {
        const pageIds = [...document.querySelectorAll('.payment-row-cb')].map(cb => cb.dataset.id);
        const allChecked = pageIds.length > 0 && pageIds.every(id => selectedPaymentIds.has(id));
        const someChecked = pageIds.some(id => selectedPaymentIds.has(id));
        selectAll.checked = allChecked;
        selectAll.indeterminate = someChecked && !allChecked;
      }
    }

    function onPaymentRowCheck(cb) {
      const id = cb.dataset.id;
      if (cb.checked) selectedPaymentIds.add(id); else selectedPaymentIds.delete(id);
      syncPaymentsBulkBar();
    }

    function toggleAllPayments(checked) {
      document.querySelectorAll('.payment-row-cb').forEach(cb => {
        if (checked) selectedPaymentIds.add(cb.dataset.id); else selectedPaymentIds.delete(cb.dataset.id);
        cb.checked = checked;
      });
      syncPaymentsBulkBar();
    }

    function clearPaymentSelection() {
      selectedPaymentIds.clear();
      document.querySelectorAll('.payment-row-cb').forEach(cb => { cb.checked = false; });
      syncPaymentsBulkBar();
    }

    async function bulkDeletePayments() {
      const ids = [...selectedPaymentIds];
      if (!ids.length) return;
      if (!confirm(`Permanently delete ${ids.length} payment${ids.length === 1 ? '' : 's'}?\n\nThis cannot be undone.`)) return;

      // Check for open disputes via package_id across all selected payments
      const selectedPayments = payments.filter(p => ids.includes(p.id));
      const packageIds = selectedPayments.map(p => p.package_id).filter(Boolean);
      if (packageIds.length) {
        const { data: openDisputes, error: disputeErr } = await supabaseClient
          .from('disputes').select('id').in('package_id', packageIds).eq('status', 'open').limit(1);
        if (disputeErr) { showToast('Could not check disputes: ' + disputeErr.message, 'error'); return; }
        if (openDisputes && openDisputes.length > 0) {
          showToast('Cannot delete: one or more selected payments have open disputes. Resolve disputes first.', 'error');
          return;
        }
      }

      let failed = 0;
      for (const id of ids) {
        const { error } = await supabaseClient.rpc('admin_delete_payment', { p_id: id });
        if (error) failed++;
      }
      selectedPaymentIds.clear();
      await loadPayments();
      if (failed > 0) showToast(`Deleted ${ids.length - failed}/${ids.length} — ${failed} failed`, 'error');
      else showToast(`Deleted ${ids.length} payment${ids.length === 1 ? '' : 's'}`);
    }

    let _transportPaymentCache = null;

    async function renderTransportPayments() {
      const tbody = document.getElementById('payments-table');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Loading transport fares…</td></tr>';
      try {
        if (!_transportPaymentCache) {
          const { data } = await supabaseClient
            .from('rides')
            .select('id, status, actual_fare, estimated_fare, tip_amount, pickup_wait_cents, dropoff_wait_cents, payment_status, stripe_payment_intent_id, total_charged, created_at, member:member_id(full_name, email), provider:provider_id(full_name)')
            .not('stripe_payment_intent_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(100);
          _transportPaymentCache = data || [];
        }
        const rows = _transportPaymentCache;
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No transport payments with Stripe charge yet</td></tr>';
          return;
        }
        tbody.innerHTML = rows.map(r => {
          const fare = r.actual_fare || r.estimated_fare || 0;
          const tip = r.tip_amount || 0;
          const wait = ((r.pickup_wait_cents || 0) + (r.dropoff_wait_cents || 0)) / 100;
          const total = r.total_charged || (fare + tip + wait);
          return `<tr>
            <td style="font-size:0.8rem;font-family:monospace;">${escapeHtml(String(r.id).slice(0,12))}…</td>
            <td>${escapeHtml(r.member?.full_name || r.member?.email || '—')}</td>
            <td>${escapeHtml(r.provider?.full_name || 'Driver')}</td>
            <td>$${Number(fare).toFixed(2)}${tip ? ` + $${tip.toFixed(2)} tip` : ''}${wait ? ` + $${wait.toFixed(2)} wait` : ''}</td>
            <td>$${Number(total).toFixed(2)}</td>
            <td><span class="status-badge ${r.payment_status || 'pending'}">${escapeHtml(r.payment_status || 'pending')}</span></td>
            <td style="font-size:0.8rem;color:var(--text-muted);">${new Date(r.created_at).toLocaleDateString()}</td>
          </tr>`;
        }).join('');
      } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:var(--accent-red);">Error: ${escapeHtml(err.message)}</td></tr>`;
      }
    }

    let allRefunds = [];
    
    async function loadRefunds(page = 1) {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return;
      
      const state = paginationState.refunds;
      state.page = page;
      
      const params = new URLSearchParams({
        page: state.page,
        limit: state.limit,
        filter: state.filter
      });
      
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const response = await fetch(`${apiBase}/api/admin/refunds?${params}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        // Task #355 — route 401/403 to the shared "Sign in again" prompt.
        if (response.status === 401 || response.status === 403) {
          const err = new Error(`Admin session rejected on /api/admin/refunds (HTTP ${response.status}). Sign in again.`);
          err.code = 'ADMIN_AUTH_REJECTED';
          throw err;
        }
        const result = await response.json();
        
        if (result.success) {
          allRefunds = result.data || [];
          state.total = result.total;
          state.totalPages = result.totalPages;
          renderRefunds();
          updateRefundStats();
        } else {
          console.error('Failed to load refunds:', result.error);
          allRefunds = [];
          renderRefunds();
        }
      } catch (err) {
        console.error('Error loading refunds:', err);
        if (isAdminAuthError(err)) {
          const tbody = document.getElementById('refunds-tbody');
          if (tbody) renderAdminAuthErrorRow(tbody, 8, err, () => loadRefunds(page));
          return;
        }
        allRefunds = [];
        renderRefunds();
      }
    }
    
    function changeRefundsPage(delta) {
      const state = paginationState.refunds;
      const newPage = state.page + delta;
      if (newPage >= 1 && newPage <= state.totalPages) {
        loadRefunds(newPage);
      }
    }
    
    function updateRefundStats() {
      document.getElementById('refunds-requested').textContent = allRefunds.filter(r => r.status === 'requested').length;
      document.getElementById('refunds-processed').textContent = allRefunds.filter(r => r.status === 'processed').length;
      const totalRefunded = allRefunds.filter(r => r.status === 'processed').reduce((s, r) => s + (r.amount_cents || 0), 0);
      document.getElementById('refunds-total-amount').textContent = '$' + (totalRefunded / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      document.getElementById('refund-count').textContent = allRefunds.filter(r => r.status === 'requested').length;
    }
    
    function renderRefunds() {
      const tbody = document.getElementById('refunds-table');
      
      if (!allRefunds.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No refunds found</td></tr>';
        document.getElementById('refunds-pagination').innerHTML = '';
        return;
      }
      
      tbody.innerHTML = allRefunds.map(r => {
        const memberName = r.member?.full_name || 'Unknown';
        const pkgTitle = r.package?.title || r.package_id?.slice(0, 8) || '-';
        const amount = (r.amount_cents || 0) / 100;
        const statusClass = r.status === 'processed' ? 'released' : r.status === 'requested' ? 'held' : r.status === 'cancelled' ? 'refunded' : 'pending';
        
        let actionHtml = `<button class="btn btn-sm btn-secondary" onclick="viewRefund('${escapeHtml(r.id)}')">View</button>`;
        if (r.status === 'requested') {
          actionHtml += `
            <button class="btn btn-sm btn-success" onclick="approveRefund('${escapeHtml(r.id)}', ${r.amount_cents})">Approve</button>
            <button class="btn btn-sm btn-secondary" onclick="denyRefund('${escapeHtml(r.id)}')">Deny</button>
          `;
        }
        
        return `
          <tr>
            <td>${escapeHtml(memberName)}</td>
            <td title="${escapeHtml(r.package_id || '')}">${escapeHtml(pkgTitle)}</td>
            <td><span class="status-badge ${r.refund_type === 'partial' ? 'pending' : 'held'}">${escapeHtml(r.refund_type || 'full')}</span></td>
            <td>$${amount.toFixed(2)}</td>
            <td title="${escapeHtml(r.reason || '')}">${escapeHtml((r.reason || '-').substring(0, 40))}${(r.reason || '').length > 40 ? '...' : ''}</td>
            <td><span class="status-badge ${statusClass}">${escapeHtml(r.status)}</span></td>
            <td>${r.requested_at ? new Date(r.requested_at).toLocaleDateString() : '-'}</td>
            <td>${actionHtml}</td>
          </tr>
        `;
      }).join('');
      
      const state = paginationState.refunds;
      document.getElementById('refunds-pagination').innerHTML = renderPaginationControls(state, 'changeRefundsPage');
    }
    
    async function approveRefund(refundId, amountCents) {
      if (!confirm(`Approve this refund of $${(amountCents / 100).toFixed(2)}? This will process the refund via Stripe immediately.`)) return;
      
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return;
      
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const response = await fetch(`${apiBase}/api/admin/refunds/${refundId}/process`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ action: 'approve' })
        });
        const result = await response.json();
        
        if (result.success) {
          showToast(`Refund of ${result.message || 'processed'} successfully`, 'success');
          loadedSections.refunds = false;
          await loadRefunds(paginationState.refunds.page);
        } else {
          showToast(result.error || 'Failed to process refund', 'error');
        }
      } catch (err) {
        console.error('Approve refund error:', err);
        showToast('Error processing refund', 'error');
      }
    }
    
    async function viewRefund(refundId) {
      const r = allRefunds.find(x => x.id === refundId);
      if (!r) return;

      const memberName = r.member?.full_name || r.member?.email || 'Unknown';
      const pkgTitle = r.package?.title || r.package_id || '-';
      const amount = ((r.amount_cents || 0) / 100).toFixed(2);
      const statusClass = r.status === 'processed' ? 'released' : r.status === 'requested' ? 'held' : r.status === 'cancelled' ? 'refunded' : 'pending';

      document.getElementById('refund-modal-body').innerHTML = `
        <div class="form-section">
          <div class="form-section-title">Refund Details</div>
          <div class="detail-grid">
            <span class="detail-label">Member:</span><span class="detail-value">${escapeHtml(memberName)}</span>
            <span class="detail-label">Package:</span><span class="detail-value">${escapeHtml(pkgTitle)}</span>
            <span class="detail-label">Type:</span><span class="detail-value">${escapeHtml(r.refund_type || 'full')}</span>
            <span class="detail-label">Amount:</span><span class="detail-value">$${amount}</span>
            <span class="detail-label">Status:</span><span class="detail-value"><span class="status-badge ${statusClass}">${escapeHtml(r.status)}</span></span>
            <span class="detail-label">Requested:</span><span class="detail-value">${r.requested_at ? new Date(r.requested_at).toLocaleString() : '-'}</span>
            ${r.processed_at ? `<span class="detail-label">Processed:</span><span class="detail-value">${new Date(r.processed_at).toLocaleString()}</span>` : ''}
          </div>
          ${r.reason ? `<p style="margin-top:16px;color:var(--text-secondary);background:var(--bg-input);padding:16px;border-radius:var(--radius-md);">${escapeHtml(r.reason)}</p>` : ''}
        </div>

        ${(r.user_id || r.requested_by) ? `
        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('mail', 24)} Outreach History</div>
          <div id="refund-outreach-history-body-${r.id}" style="font-size:0.9rem;color:var(--text-muted);">Loading…</div>
        </div>
        ` : ''}
      `;

      document.getElementById('refund-modal-footer').innerHTML = r.status === 'requested' ? `
        <button class="btn btn-secondary" onclick="denyRefund('${escapeHtml(r.id)}')">Deny</button>
        <button class="btn btn-success" onclick="approveRefund('${escapeHtml(r.id)}', ${r.amount_cents})">Approve</button>
      ` : '';

      const refundUserId = r.user_id || r.requested_by;
      if (refundUserId && typeof globalThis.renderOutreachHistoryPanel === 'function') {
        try { globalThis.renderOutreachHistoryPanel(`refund-outreach-history-body-${r.id}`, refundUserId); }
        catch (e) { console.warn('[admin] refund outreach history panel failed:', e); }
      }

      openModal('refund-modal');
    }

    async function denyRefund(refundId) {
      if (!confirm('Deny this refund request? The member will be notified.')) return;
      
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return;
      
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const response = await fetch(`${apiBase}/api/admin/refunds/${refundId}/process`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ action: 'deny' })
        });
        const result = await response.json();
        
        if (result.success) {
          showToast('Refund denied', 'success');
          loadedSections.refunds = false;
          await loadRefunds(paginationState.refunds.page);
        } else {
          showToast(result.error || 'Failed to deny refund', 'error');
        }
      } catch (err) {
        console.error('Deny refund error:', err);
        showToast('Error denying refund', 'error');
      }
    }

    function renderDisputes() {
      const filtered = disputes.filter(d => {
        if (currentFilters.disputes === 'inspection') return d.requires_inspection && d.status !== 'resolved';
        return d.status === currentFilters.disputes || currentFilters.disputes === 'all';
      });
      const tbody = document.getElementById('disputes-table');

      const highValue = disputes.filter(d => (d.maintenance_packages?.payments?.[0]?.amount_total || 0) > 1000 && d.status === 'open');
      document.getElementById('high-value-alert').style.display = highValue.length ? 'block' : 'none';

      // Task #281 — show load error before falling through to "No disputes".
      if (loadErrors.disputes) {
        renderTableLoadErrorRow('disputes-table', 7, 'disputes', 'loadDisputes()');
        return;
      }

      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No disputes</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(d => `
        <tr>
          <td>${escapeHtml(d.maintenance_packages?.title) || 'Package'}</td>
          <td>${escapeHtml(d.filed_by_profile?.full_name) || 'User'} (${escapeHtml(d.filed_by_role)})</td>
          <td>${escapeHtml(d.reason)}</td>
          <td>$${(d.maintenance_packages?.payments?.[0]?.amount_total || 0).toFixed(2)}</td>
          <td>${new Date(d.created_at).toLocaleDateString()}</td>
          <td><span class="status-badge ${d.status === 'open' ? 'open' : d.status.includes('resolved') ? 'resolved' : 'pending'}">${escapeHtml(d.status)}</span></td>
          <td><button class="btn btn-secondary btn-sm" onclick="viewDispute('${escapeHtml(d.id)}')">Review</button></td>
        </tr>
      `).join('');
    }

    function renderTickets() {
      const filtered = tickets.filter(t => t.status === currentFilters.tickets || currentFilters.tickets === 'all');
      const tbody = document.getElementById('tickets-table');

      // Task #281 — show load error before falling through to "No tickets".
      if (loadErrors.tickets) {
        renderTableLoadErrorRow('tickets-table', 7, 'tickets', 'loadTickets()');
        return;
      }

      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No tickets</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(t => `
        <tr>
          <td>${escapeHtml(t.subject)}</td>
          <td>${escapeHtml(t.user?.full_name || t.user?.email) || 'User'}</td>
          <td>${escapeHtml(t.category) || 'General'}</td>
          <td><span class="status-badge ${t.priority === 'urgent' ? 'rejected' : t.priority === 'high' ? 'pending' : 'approved'}">${t.priority || 'normal'}</span></td>
          <td>${new Date(t.created_at).toLocaleDateString()}</td>
          <td><span class="status-badge ${t.status === 'open' ? 'open' : t.status === 'resolved' ? 'resolved' : 'pending'}">${t.status}</span></td>
          <td><button class="btn btn-secondary btn-sm" onclick="viewTicket('${t.id}')">View</button></td>
        </tr>
      `).join('');
    }

    function renderMembers() {
      const tbody = document.getElementById('members-table');
      if (loadErrors.members) {
        renderTableLoadErrorRow('members-table', 8, 'members', 'loadMembers()');
        const paginationContainer = document.getElementById('members-pagination');
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
      }
      if (!members.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No members</td></tr>';
        const paginationContainer = document.getElementById('members-pagination');
        if (paginationContainer) {
          paginationContainer.innerHTML = renderPaginationControls(paginationState.members, 'changeMembersPage');
        }
        return;
      }

      const sortedMembers = applySortToRows(members, sortState.members, (m, col) => {
        if (col === 'full_name') return m.full_name || '';
        if (col === 'email') return m.email || '';
        if (col === 'account_type') return m.account_type || '';
        if (col === 'created_at') return new Date(m.created_at).getTime();
        return null;
      });

      tbody.innerHTML = sortedMembers.map(m => {
        const identityBadge = m.identity_verified
          ? '<span class="badge badge-success" title="Stripe Identity verified">Verified</span>'
          : '<span class="badge badge-warning" title="Identity not yet verified">Unverified</span>';
        return `
          <tr>
            <td>${m.full_name || 'N/A'}</td>
            <td>${m.email || 'N/A'}</td>
            <td>${m.account_type || 'individual'}</td>
            <td>-</td>
            <td>-</td>
            <td>${identityBadge}</td>
            <td>${new Date(m.created_at).toLocaleDateString()}</td>
            <td><button class="btn btn-secondary btn-sm" onclick="viewMember('${m.id}')">View</button></td>
          </tr>`;
      }).join('');
      updateSortIndicators('members-table', sortState.members);

      const paginationContainer = document.getElementById('members-pagination');
      if (paginationContainer) {
        paginationContainer.innerHTML = renderPaginationControls(paginationState.members, 'changeMembersPage');
      }
    }

    globalThis.viewMember = async function viewMember(memberId) {
      const m = members.find(x => x.id === memberId);
      if (!m) return;

      const identityHtml = m.identity_verified
        ? `<span class="badge badge-success">Verified</span>${m.identity_verified_at ? ` <small style="color:var(--text-muted);">on ${new Date(m.identity_verified_at).toLocaleDateString()}</small>` : ''}`
        : '<span class="badge badge-warning">Not Verified</span>';

      const sessionHtml = m.stripe_identity_session_id
        ? `<a href="https://dashboard.stripe.com/identity/verification-sessions/${m.stripe_identity_session_id}" target="_blank" style="color:var(--accent-blue);font-size:0.82rem;">${m.stripe_identity_session_id}</a>`
        : '<span style="color:var(--text-muted);">None</span>';

      const safeDisplayName = (m.full_name || m.email || 'this user').replace(/'/g, "\\'");
      const twoFaHtml = m.two_factor_enabled
        ? `<span class="badge badge-warning">TOTP enrolled</span> <button class="btn btn-sm" style="margin-left:8px;font-size:0.75rem;padding:3px 10px;background:rgba(239,95,95,0.15);color:var(--accent-red);border:1px solid rgba(239,95,95,0.4);" onclick="adminResetMfa('${m.id}','${safeDisplayName}')">Reset 2FA</button>`
        : '<span style="color:var(--text-muted);">Not enrolled</span>';

      document.getElementById('member-detail-body').innerHTML = `
        <div class="detail-grid" style="row-gap:12px;">
          <span class="detail-label">Name</span><span class="detail-value">${m.full_name || 'N/A'}</span>
          <span class="detail-label">Email</span><span class="detail-value">${m.email || 'N/A'}</span>
          <span class="detail-label">Phone</span><span class="detail-value">${m.phone || 'N/A'}</span>
          <span class="detail-label">Account Type</span><span class="detail-value">${m.account_type || 'individual'}</span>
          <span class="detail-label">Joined</span><span class="detail-value">${new Date(m.created_at).toLocaleDateString()}</span>
          <span class="detail-label" style="border-top:1px solid var(--border-color);padding-top:12px;margin-top:4px;">Identity (KYC)</span><span class="detail-value" style="border-top:1px solid var(--border-color);padding-top:12px;margin-top:4px;">${identityHtml}</span>
          <span class="detail-label">Stripe Session</span><span class="detail-value">${sessionHtml}</span>
          <span class="detail-label">Stripe Customer</span><span class="detail-value">${m.stripe_customer_id
            ? `<a href="https://dashboard.stripe.com/customers/${m.stripe_customer_id}" target="_blank" style="color:var(--accent-blue);font-size:0.82rem;">${m.stripe_customer_id}</a>`
            : '<span style="color:var(--text-muted);">None</span>'}</span>
          <span class="detail-label" style="border-top:1px solid var(--border-color);padding-top:12px;margin-top:4px;">Two-Factor Auth</span><span class="detail-value" style="border-top:1px solid var(--border-color);padding-top:12px;margin-top:4px;">${twoFaHtml}</span>
        </div>
        <div id="member-vehicles-panel" style="margin-top:20px;">
          <div style="font-weight:600;margin-bottom:10px;font-size:0.95rem;">Vehicles</div>
          <div class="loading-state" style="padding:16px 0;justify-content:flex-start;gap:8px;font-size:0.85rem;"><div class="loading-spinner"></div> Loading...</div>
        </div>`;

      openModal('member-detail-modal');

      // Load vehicles with verification status + cross-ref
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const { data: vehs } = await supabaseClient.from('vehicles')
          .select('id,year,make,model,vin,registration_verified,insurance_verified,insurance_carrier,insurance_policy_number,insurance_verification_id')
          .eq('owner_id', memberId)
          .order('created_at');

        if (!vehs || !vehs.length) {
          document.getElementById('member-vehicles-panel').innerHTML =
            '<div style="font-weight:600;margin-bottom:10px;font-size:0.95rem;">Vehicles</div><div style="color:var(--text-muted);font-size:0.85rem;">No vehicles.</div>';
          return;
        }

        // For each vehicle, fetch cross-ref
        const crossRefs = await Promise.all(vehs.map(v =>
          fetch(`/api/insurance/name-cross-ref/${v.id}`, { headers: { 'Authorization': `Bearer ${session?.access_token}` } })
            .then(r => r.ok ? r.json() : null).catch(() => null)
        ));

        const vehHtml = vehs.map((v, i) => {
          const cr = crossRefs[i];
          const confColor = !cr ? 'var(--text-muted)' : cr.confidence === 'high' ? 'var(--accent-green)' : cr.confidence === 'medium' ? 'var(--accent-gold)' : 'var(--accent-red)';
          const confLabel = cr?.confidence?.replace('_', ' ') || 'N/A';
          const mismatchCount = cr?.mismatches?.length || 0;
          return `
            <div style="background:var(--bg-elevated);border-radius:8px;padding:14px;margin-bottom:10px;border:1px solid var(--border-subtle);">
              <div style="font-weight:600;margin-bottom:8px;">${v.year || ''} ${v.make || ''} ${v.model || ''}${v.vin ? ` <small style="color:var(--text-muted)">VIN: ${v.vin}</small>` : ''}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
                <span class="badge ${v.registration_verified ? 'badge-success' : 'badge-warning'}">${v.registration_verified ? 'Reg ✓' : 'Reg —'}</span>
                <span class="badge ${v.insurance_verified ? 'badge-success' : 'badge-warning'}">${v.insurance_verified ? 'Ins ✓' : 'Ins —'}</span>
              </div>
              ${v.insurance_verified ? `<div style="font-size:0.82rem;color:var(--text-muted);">Carrier: ${v.insurance_carrier || '—'} &nbsp; Policy: ${v.insurance_policy_number || '—'}</div>` : ''}
              <div style="margin-top:8px;font-size:0.82rem;">
                <span style="color:var(--text-muted);">Name cross-ref: </span>
                <span style="color:${confColor};font-weight:600;">${confLabel}</span>
                ${mismatchCount ? `<span style="color:var(--accent-red);margin-left:8px;">${mismatchCount} mismatch${mismatchCount > 1 ? 'es' : ''}</span>` : ''}
              </div>
            </div>`;
        }).join('');

        document.getElementById('member-vehicles-panel').innerHTML =
          `<div style="font-weight:600;margin-bottom:10px;font-size:0.95rem;">Vehicles</div>${vehHtml}`;
      } catch (e) {
        console.warn('[admin] viewMember vehicles error:', e.message);
      }
    };

    globalThis.adminResetMfa = async function adminResetMfa(userId, displayName) {
      const confirmed = window.confirm(
        `Reset 2FA for ${displayName}?\n\nThis will:\n• Delete their authenticator app enrollment\n• Delete their backup codes\n• Require them to re-enroll\n\nThis cannot be undone.`
      );
      if (!confirmed) return;

      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) { alert('Session expired. Please refresh and try again.'); return; }

        const res = await fetch('/api/admin/mfa-reset', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ userId })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          alert(`2FA reset for ${displayName}. They can now re-enroll.`);
          closeModal('member-detail-modal');
          loadMembers();
        } else {
          alert(`Reset failed: ${data.error || data.message || 'Unknown error'}`);
        }
      } catch (err) {
        console.error('[admin] adminResetMfa error:', err);
        alert('Network error. Please try again.');
      }
    };


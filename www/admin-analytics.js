    // ========== ANALYTICS ==========
    let analyticsDateRange = 7; // days

    async function loadAnalytics() {
      const startDate = analyticsDateRange > 0 
        ? new Date(Date.now() - analyticsDateRange * 24 * 60 * 60 * 1000).toISOString()
        : null;

      try {
        // Fetch all data for analytics
        let paymentsQuery = supabaseClient.from('payments').select('*');
        let packagesQuery = supabaseClient.from('maintenance_packages').select('*');
        let bidsQuery = supabaseClient.from('bids').select('*');
        let membersQuery = supabaseClient.from('profiles').select('*').eq('role', 'member');
        let providersQuery = supabaseClient.from('profiles').select('*').eq('role', 'provider');
        let reviewsQuery = supabaseClient.from('provider_reviews').select('*');
        let disputesQuery = supabaseClient.from('disputes').select('*');

        if (startDate) {
          paymentsQuery = paymentsQuery.gte('created_at', startDate);
          packagesQuery = packagesQuery.gte('created_at', startDate);
          bidsQuery = bidsQuery.gte('created_at', startDate);
          membersQuery = membersQuery.gte('created_at', startDate);
          providersQuery = providersQuery.gte('created_at', startDate);
        }

        const [
          { data: paymentsData },
          { data: packagesData },
          { data: bidsData },
          { data: membersData },
          { data: providersData },
          { data: reviewsData },
          { data: disputesData }
        ] = await Promise.all([
          paymentsQuery,
          packagesQuery,
          bidsQuery,
          membersQuery,
          providersQuery,
          reviewsQuery,
          disputesQuery
        ]);

        const payments = paymentsData || [];
        const packages = packagesData || [];
        const bids = bidsData || [];
        const newMembers = membersData || [];
        const newProviders = providersData || [];
        const reviews = reviewsData || [];
        const disputes = disputesData || [];

        // Calculate metrics
        const totalRevenue = payments.filter(p => p.status === 'released').reduce((sum, p) => sum + (p.mcc_fee || 0), 0);
        const totalPackages = packages.length;
        const totalBids = bids.length;
        const completedJobs = packages.filter(p => p.status === 'completed').length;

        // Update key metrics
        document.getElementById('analytics-revenue').textContent = '$' + totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        document.getElementById('analytics-packages').textContent = totalPackages.toLocaleString();
        document.getElementById('analytics-bids').textContent = totalBids.toLocaleString();
        document.getElementById('analytics-completed').textContent = completedJobs.toLocaleString();

        // Revenue chart
        renderRevenueChart(payments);

        // Signups chart
        renderSignupsChart(newMembers, newProviders);

        // Top providers
        renderTopProviders();

        // Category breakdown
        renderCategoryBreakdown(packages);

        // Platform health
        const acceptedBids = bids.filter(b => b.status === 'accepted').length;
        const bidRate = totalBids > 0 ? ((acceptedBids / totalBids) * 100).toFixed(1) : 0;
        const avgBidsPerPackage = totalPackages > 0 ? (totalBids / totalPackages).toFixed(1) : 0;
        const avgRating = reviews.length > 0 ? (reviews.reduce((sum, r) => sum + r.overall_rating, 0) / reviews.length).toFixed(1) : '--';
        const disputeRate = completedJobs > 0 ? ((disputes.length / completedJobs) * 100).toFixed(1) : 0;

        document.getElementById('health-bid-rate').textContent = bidRate + '%';
        document.getElementById('health-avg-bids').textContent = avgBidsPerPackage;
        document.getElementById('health-avg-rating').innerHTML = avgRating + ' ' + mccIcon('star', 16);
        document.getElementById('health-dispute-rate').textContent = disputeRate + '%';
        document.getElementById('health-time-to-accept').textContent = '~24 hrs'; // Placeholder

      } catch (err) {
        console.error('Analytics error:', err);
      }
    }

    function renderRevenueChart(payments) {
      const container = document.getElementById('revenue-chart');
      const releasedPayments = payments.filter(p => p.status === 'released' && p.released_at);
      
      if (!releasedPayments.length) {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center;width:100%;">No revenue data for this period</p>';
        return;
      }

      // Group by day
      const dailyRevenue = {};
      releasedPayments.forEach(p => {
        const day = new Date(p.released_at).toLocaleDateString();
        dailyRevenue[day] = (dailyRevenue[day] || 0) + (p.mcc_fee || 0);
      });

      const days = Object.keys(dailyRevenue).sort((a, b) => new Date(a) - new Date(b)).slice(-14);
      const maxRevenue = Math.max(...days.map(d => dailyRevenue[d]));

      container.innerHTML = days.map(day => {
        const value = dailyRevenue[day];
        const height = maxRevenue > 0 ? (value / maxRevenue) * 180 : 0;
        const shortDay = new Date(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
            <div style="font-size:0.7rem;color:var(--text-muted);">$${value.toFixed(0)}</div>
            <div style="width:100%;max-width:40px;height:${Math.max(height, 4)}px;background:linear-gradient(180deg, var(--accent-green), rgba(74,200,140,0.5));border-radius:4px 4px 0 0;"></div>
            <div style="font-size:0.65rem;color:var(--text-muted);white-space:nowrap;">${shortDay}</div>
          </div>
        `;
      }).join('');
    }

    function renderSignupsChart(members, providers) {
      const container = document.getElementById('signups-chart');
      
      // Combine and group by day
      const dailySignups = {};
      [...members, ...providers].forEach(p => {
        const day = new Date(p.created_at).toLocaleDateString();
        if (!dailySignups[day]) dailySignups[day] = { members: 0, providers: 0 };
        if (p.role === 'provider') {
          dailySignups[day].providers++;
        } else {
          dailySignups[day].members++;
        }
      });

      const days = Object.keys(dailySignups).sort((a, b) => new Date(a) - new Date(b)).slice(-14);
      
      if (!days.length) {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center;width:100%;">No signup data for this period</p>';
        return;
      }

      const maxSignups = Math.max(...days.map(d => dailySignups[d].members + dailySignups[d].providers));

      container.innerHTML = days.map(day => {
        const data = dailySignups[day];
        const total = data.members + data.providers;
        const height = maxSignups > 0 ? (total / maxSignups) * 180 : 0;
        const memberHeight = maxSignups > 0 ? (data.members / maxSignups) * 180 : 0;
        const providerHeight = maxSignups > 0 ? (data.providers / maxSignups) * 180 : 0;
        const shortDay = new Date(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
            <div style="font-size:0.7rem;color:var(--text-muted);">${total}</div>
            <div style="width:100%;max-width:40px;display:flex;flex-direction:column;">
              <div style="height:${Math.max(providerHeight, total > 0 ? 2 : 0)}px;background:var(--accent-gold);border-radius:4px 4px 0 0;"></div>
              <div style="height:${Math.max(memberHeight, total > 0 ? 2 : 0)}px;background:var(--accent-blue);border-radius:0 0 0 0;"></div>
            </div>
            <div style="font-size:0.65rem;color:var(--text-muted);white-space:nowrap;">${shortDay}</div>
          </div>
        `;
      }).join('') + `
        <div style="position:absolute;top:0;right:0;font-size:0.75rem;">
          <span style="color:var(--accent-blue);"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent-blue);margin-right:4px;"></span> Members</span>
          <span style="color:var(--accent-gold);margin-left:8px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent-gold);margin-right:4px;"></span> Providers</span>
        </div>
      `;
      container.style.position = 'relative';
    }

    async function renderTopProviders() {
      const container = document.getElementById('top-providers-list');
      
      const { data: reviews } = await supabaseClient
        .from('provider_reviews')
        .select('provider_id, overall_rating');

      if (!reviews?.length) {
        container.innerHTML = '<p style="color:var(--text-muted);">No provider data yet</p>';
        return;
      }

      // Calculate avg rating per provider
      const providerRatings = {};
      reviews.forEach(r => {
        if (!providerRatings[r.provider_id]) {
          providerRatings[r.provider_id] = { sum: 0, count: 0 };
        }
        providerRatings[r.provider_id].sum += r.overall_rating;
        providerRatings[r.provider_id].count++;
      });

      const ranked = Object.entries(providerRatings)
        .map(([id, data]) => ({ id, avg: data.sum / data.count, count: data.count }))
        .filter(p => p.count >= 2)
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 5);

      if (!ranked.length) {
        container.innerHTML = '<p style="color:var(--text-muted);">Not enough data yet</p>';
        return;
      }

      // Get provider names
      const { data: profiles } = await supabaseClient
        .from('profiles')
        .select('id, business_name, full_name')
        .in('id', ranked.map(r => r.id));

      const profileMap = {};
      profiles?.forEach(p => profileMap[p.id] = p);

      container.innerHTML = ranked.map((p, i) => {
        const profile = profileMap[p.id] || {};
        const name = profile.business_name || profile.full_name || 'Provider';
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;${i < ranked.length - 1 ? 'border-bottom:1px solid var(--border-subtle);' : ''}">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:1.2rem;">${i === 0 ? mccIcon('award', 20) : i === 1 ? mccIcon('award', 20) : i === 2 ? mccIcon('award', 20) : mccIcon('star', 20)}</span>
              <span>${name}</span>
            </div>
            <div style="text-align:right;">
              <div style="font-weight:600;">${p.avg.toFixed(1)} ${mccIcon('star', 16)}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${p.count} reviews</div>
            </div>
          </div>
        `;
      }).join('');
    }

    function renderCategoryBreakdown(packages) {
      const container = document.getElementById('category-breakdown');
      
      if (!packages.length) {
        container.innerHTML = '<p style="color:var(--text-muted);">No package data for this period</p>';
        return;
      }

      const categories = {};
      packages.forEach(p => {
        const cat = p.category || 'other';
        categories[cat] = (categories[cat] || 0) + 1;
      });

      const total = packages.length;
      const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);
      const colors = {
        maintenance: 'var(--accent-blue)',
        detailing: 'var(--accent-gold)',
        cosmetic: 'var(--accent-green)',
        accident_repair: 'var(--accent-red)',
        other: 'var(--text-muted)'
      };
      const labels = {
        maintenance: mccIcon('wrench', 16) + ' Maintenance',
        detailing: mccIcon('sparkles', 16) + ' Detailing',
        cosmetic: mccIcon('sparkles', 16) + ' Cosmetic',
        accident_repair: mccIcon('car', 16) + ' Accident Repair',
        other: mccIcon('package', 16) + ' Other'
      };

      container.innerHTML = sorted.map(([cat, count]) => {
        const pct = ((count / total) * 100).toFixed(0);
        return `
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span>${labels[cat] || cat}</span>
              <span style="font-weight:500;">${count} (${pct}%)</span>
            </div>
            <div style="height:8px;background:var(--bg-input);border-radius:4px;overflow:hidden;">
              <div style="width:${pct}%;height:100%;background:${colors[cat] || 'var(--accent-blue)'};"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Analytics date range handler
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('analytics-range')) {
        document.querySelectorAll('.analytics-range').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        analyticsDateRange = Number.parseInt(e.target.dataset.days);
        loadAnalytics();
      }
    });

    // ========== DASHBOARD CHARTS (Chart.js) ==========
    let dashboardCharts = {
      revenue: null,
      users: null,
      orders: null
    };
    let dashboardPeriod = 'week';

    const chartColors = {
      gold: '#d4a855',
      blue: '#4a7cff',
      green: '#4ac88c',
      textColor: '#f4f4f6',
      gridColor: 'rgba(148, 148, 168, 0.1)',
      goldSoft: 'rgba(212, 168, 85, 0.2)',
      blueSoft: 'rgba(74, 124, 255, 0.2)',
      greenSoft: 'rgba(74, 200, 140, 0.2)'
    };

    const chartDefaults = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: chartColors.textColor, font: { size: 11 } }
        }
      },
      scales: {
        x: {
          ticks: { color: chartColors.textColor, font: { size: 10 } },
          grid: { color: chartColors.gridColor }
        },
        y: {
          ticks: { color: chartColors.textColor, font: { size: 10 } },
          grid: { color: chartColors.gridColor },
          beginAtZero: true
        }
      }
    };

    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('dashboard-period')) {
        document.querySelectorAll('.dashboard-period').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        dashboardPeriod = e.target.dataset.period;
        loadDashboardCharts();
      }
    });

    async function loadDashboardCharts() {
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const statsHeaders = getAdminHeaders();
        const [overviewRes, revenueRes, usersRes, ordersRes] = await Promise.all([
          fetch(`${apiBase}/api/admin/stats/overview`, { headers: statsHeaders }),
          fetch(`${apiBase}/api/admin/stats/revenue?period=${dashboardPeriod}`, { headers: statsHeaders }),
          fetch(`${apiBase}/api/admin/stats/users?period=${dashboardPeriod}`, { headers: statsHeaders }),
          fetch(`${apiBase}/api/admin/stats/orders?period=${dashboardPeriod}`, { headers: statsHeaders })
        ]);

        const [overview, revenue, users, orders] = await Promise.all([
          overviewRes.json(),
          revenueRes.json(),
          usersRes.json(),
          ordersRes.json()
        ]);

        if (overview.success) {
          document.getElementById('dash-total-members').textContent = (overview.data.totalMembers || 0).toLocaleString();
          document.getElementById('dash-total-providers').textContent = (overview.data.totalProviders || 0).toLocaleString();
          document.getElementById('dash-active-packages').textContent = (overview.data.activePackages || 0).toLocaleString();
          document.getElementById('dash-total-revenue').textContent = '$' + (overview.data.totalRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const t = overview.data.transport || {};
          const dEl = id => document.getElementById(id);
          if (dEl('dash-total-rides'))       dEl('dash-total-rides').textContent       = (t.totalRides       || 0).toLocaleString();
          if (dEl('dash-completed-rides'))   dEl('dash-completed-rides').textContent   = (t.completedRides   || 0).toLocaleString();
          if (dEl('dash-active-drivers'))    dEl('dash-active-drivers').textContent    = (t.activeDrivers    || 0).toLocaleString();
          if (dEl('dash-transport-revenue')) dEl('dash-transport-revenue').textContent = '$' + (t.transportRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        if (revenue.success) {
          renderDashboardRevenueChart(revenue.data.chartData || []);
        }

        if (users.success) {
          renderDashboardUsersChart(users.data.chartData || []);
        }

        if (orders.success) {
          renderDashboardOrdersChart(orders.data.chartData || []);
        }
      } catch (err) {
        console.error('Dashboard charts error:', err);
      }
      // Task #139 — best-effort agent fleet tile/recent list (won't block dashboard if it fails).
      try { if (typeof loadDashboardAgentTile === 'function') await loadDashboardAgentTile(); }
      catch (e) { console.warn('[admin] dashboard agent tile failed:', e); }
    }

    function formatChartLabel(dateStr) {
      if (!dateStr) return '';
      if (dateStr.length === 7) {
        const [year, month] = dateStr.split('-');
        return new Date(year, month - 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
      }
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    function renderDashboardRevenueChart(data) {
      const ctx = document.getElementById('dashboard-revenue-chart');
      if (!ctx) return;

      if (dashboardCharts.revenue) {
        dashboardCharts.revenue.destroy();
      }

      const labels = data.map(d => formatChartLabel(d.label));
      const values = data.map(d => d.revenue || 0);

      dashboardCharts.revenue = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Revenue ($)',
            data: values,
            borderColor: chartColors.gold,
            backgroundColor: chartColors.goldSoft,
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: chartColors.gold
          }]
        },
        options: {
          ...chartDefaults,
          plugins: {
            ...chartDefaults.plugins,
            tooltip: {
              callbacks: {
                label: (ctx) => `$${ctx.raw.toFixed(2)}`
              }
            }
          }
        }
      });
    }

    function renderDashboardUsersChart(data) {
      const ctx = document.getElementById('dashboard-users-chart');
      if (!ctx) return;

      if (dashboardCharts.users) {
        dashboardCharts.users.destroy();
      }

      const labels = data.map(d => formatChartLabel(d.label));
      const members = data.map(d => d.members || 0);
      const providers = data.map(d => d.providers || 0);

      dashboardCharts.users = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Members',
              data: members,
              borderColor: chartColors.blue,
              backgroundColor: chartColors.blueSoft,
              fill: true,
              tension: 0.3,
              pointRadius: 3,
              pointBackgroundColor: chartColors.blue
            },
            {
              label: 'Providers',
              data: providers,
              borderColor: chartColors.gold,
              backgroundColor: chartColors.goldSoft,
              fill: true,
              tension: 0.3,
              pointRadius: 3,
              pointBackgroundColor: chartColors.gold
            }
          ]
        },
        options: chartDefaults
      });
    }

    function renderDashboardOrdersChart(data) {
      const ctx = document.getElementById('dashboard-orders-chart');
      if (!ctx) return;

      if (dashboardCharts.orders) {
        dashboardCharts.orders.destroy();
      }

      const labels = data.map(d => formatChartLabel(d.label));
      const created = data.map(d => d.created || 0);
      const completed = data.map(d => d.completed || 0);

      dashboardCharts.orders = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Created',
              data: created,
              backgroundColor: chartColors.blue,
              borderRadius: 4
            },
            {
              label: 'Completed',
              data: completed,
              backgroundColor: chartColors.green,
              borderRadius: 4
            }
          ]
        },
        options: {
          ...chartDefaults,
          plugins: {
            ...chartDefaults.plugins,
            legend: {
              ...chartDefaults.plugins.legend,
              position: 'top'
            }
          }
        }
      });
    }

    async function loadApplications() {
      // Task #281 — surface load errors instead of silently rendering "No applications".
      loadErrors.applications = null;
      const { data, error } = await supabaseClient.from('provider_applications').select('*').order('created_at', { ascending: false });
      if (error) {
        console.error('loadApplications failed:', error);
        // Task #355 — Supabase 401/JWT-expired errors tag the load with the
        // ADMIN_AUTH_REJECTED code so the shared table-row renderer surfaces
        // the "Sign in again" prompt instead of just "Failed to load".
        const isAuth = error && (
          error.status === 401 || error.status === 403 ||
          /jwt|token|unauthor|expired/i.test(error.message || '')
        );
        const wrapped = new Error(error.message || 'Failed to load applications');
        if (isAuth) wrapped.code = 'ADMIN_AUTH_REJECTED';
        setLoadError('applications', wrapped);
        applications = [];
        renderApplications();
        document.getElementById('app-count').textContent = '!';
        return;
      }
      applications = data || [];
      // Task #248 — if a deep-link URL set a non-default status filter,
      // sync the visual ".active" tab class to match (the HTML hardcodes
      // "Pending" as the initial active tab).
      try {
        const tabs = document.querySelectorAll('#applications .tabs .tab');
        if (tabs.length) {
          tabs.forEach(t => t.classList.toggle('active', t.dataset.filter === currentFilters.applications));
        }
      } catch { /* Intentionally silent */ }
      // Task #189 — surface the originating cold-outreach lead on each
      // application. The browser admin client uses the anon JWT and so can
      // not SELECT from outreach_leads (RLS only grants service_role), so we
      // batch-fetch the lead rows through the privileged
      // provider-application-review endpoint and decorate each application
      // with `_outreach_lead`. Failures here never block the table render —
      // worst case the badge falls back to "Direct signup" / "Lead linked".
      await hydrateApplicationOutreachLeads(applications);
      renderApplications();
      document.getElementById('app-count').textContent = applications.filter(a => a.status === 'pending').length;
    }

    async function hydrateApplicationOutreachLeads(apps) {
      if (!Array.isArray(apps) || !apps.length) return;
      const leadIds = Array.from(new Set(
        apps.map(a => a?.outreach_lead_id).filter(Boolean)
      ));
      if (!leadIds.length) return;
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/provider-application/outreach-leads`, {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_ids: leadIds })
        });
        if (!res.ok) {
          console.warn('[admin] outreach-leads fetch failed:', res.status);
          return;
        }
        const json = await res.json();
        const map = new Map((json.leads || []).map(l => [l.id, l]));
        apps.forEach(a => {
          a._outreach_lead = a.outreach_lead_id ? (map.get(a.outreach_lead_id) || null) : null;
        });
      } catch (e) {
        console.warn('[admin] outreach-leads fetch errored:', e);
      }
    }

    // Task #189 — formats the originating-lead chip shown in the
    // applications table and detail modal. Returns a small HTML snippet that
    // is safe to drop into innerHTML; everything user-controlled is run
    // through escapeHtml first.
    function renderApplicationLeadBadge(app) {
      const lead = app?._outreach_lead;
      if (!app || !app.outreach_lead_id) {
        return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:100px;font-size:0.72rem;font-weight:600;background:rgba(100,100,120,0.12);color:var(--text-muted);border:1px solid var(--border-subtle);" title="No matching outreach lead — applicant signed up without ever being contacted by the cold-outreach engine.">${mccIcon('user', 14)} Direct signup</span>`;
      }
      if (!lead) {
        // Application has an outreach_lead_id but the row could not be loaded
        // (RLS denial, deleted lead, lookup failure). Treat as linked-but-
        // unreadable so reviewers still see the attribution exists.
        return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:100px;font-size:0.72rem;font-weight:600;background:rgba(56,189,248,0.10);color:var(--accent-blue);border:1px solid rgba(56,189,248,0.25);" title="Linked to outreach lead ${escapeHtml(app.outreach_lead_id)} but the lead row could not be loaded.">${mccIcon('link', 14)} Lead linked</span>`;
      }
      const sourceLabel = (lead.source || 'outreach').toString();
      // Title-case the source code for display ("hunter" → "Hunter").
      const sourceDisplay = sourceLabel.charAt(0).toUpperCase() + sourceLabel.slice(1).replaceAll('_', ' ');
      const parts = [sourceDisplay];
      if (lead.location) parts.push(lead.location);
      if (lead.created_at) {
        try { parts.push(new Date(lead.created_at).toLocaleDateString()); } catch { /* Intentionally silent */ }
      }
      const label = parts.join(' — ');
      const tooltip = `From cold-outreach lead "${lead.name || 'Unknown'}" (${lead.type || '?'}) — click to open the lead`;
      // Use data-* attributes (encoded for attribute context) instead of an
      // inline JS handler so apostrophes / quotes / backslashes / angle
      // brackets in untrusted lead fields can't break the attribute boundary
      // or inject script. The repo-wide escapeHtml helper relies on the HTML
      // serializer, which escapes & < > but NOT " or ' — unsafe for raw
      // attribute interpolation. encodeAttr handles the additional chars.
      const encodeAttr = (v) => String(v == null ? '' : v)
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll('\'', '&#39;');
      const safeId = encodeAttr(lead.id);
      const safeName = encodeAttr(lead.name || '');
      const safeEmail = encodeAttr(lead.email || '');
      const safeTooltip = encodeAttr(tooltip);
      // The `mcc-outreach-lead-link` class is wired to a single delegated
      // click handler installed below (no inline handler in markup).
      return `<a href="#" class="mcc-outreach-lead-link" data-lead-id="${safeId}" data-lead-name="${safeName}" data-lead-email="${safeEmail}" title="${safeTooltip}" style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:100px;font-size:0.72rem;font-weight:600;background:rgba(201,162,39,0.12);color:var(--accent-gold);border:1px solid rgba(201,162,39,0.3);text-decoration:none;">${mccIcon('mail', 14)} ${escapeHtml(label)}</a>`;
    }
    // Test seam: exposed so unit tests can exercise the real renderer
    // against full DOM output instead of a re-implemented stub.
    globalThis.renderApplicationLeadBadge = renderApplicationLeadBadge;

    // Delegated click handler for outreach-lead badges (Task #189). Installed
    // once per page load — guarded by a window flag so repeated re-renders or
    // hot-reloads don't stack listeners. Reads data-* attributes (which the
    // browser already decodes back to plain text) and dispatches to
    // viewOutreachLead, so untrusted values never touch a JS literal.
    if (!globalThis.__mccOutreachLeadLinkBound) {
      document.addEventListener('click', function(e) {
        const el = e.target && e.target.closest && e.target.closest('.mcc-outreach-lead-link');
        if (!el) return;
        e.preventDefault();
        const id = el.dataset.leadId || '';
        const name = el.dataset.leadName || '';
        const email = el.dataset.leadEmail || '';
        if (typeof globalThis.viewOutreachLead === 'function') {
          globalThis.viewOutreachLead(id, name, email);
        }
      });
      globalThis.__mccOutreachLeadLinkBound = true;
    }

    // Task #189 — deep-link from the application row's source badge into the
    // outreach engine's Leads tab, with the lead's email pre-filled in the
    // search box so the operator immediately sees the matching row. We do not
    // try to open the edit modal directly because editLead() reads from the
    // local outreachLeads cache and that cache is only populated after
    // loadLeads() resolves; instead we navigate, switch tabs, set the search
    // box, and let the operator click through.
    async function viewOutreachLead(leadId, leadName, leadEmail) {
      try {
        // 1. Navigate to the marketing-outreach section.
        if (typeof showSection === 'function') {
          await showSection('marketing-outreach');
        }
        // 2. Make sure the Outreach Engine sub-tab is active (it's the
        //    default but a previous session may have switched away).
        const moTab = document.querySelector('.mo-tab[data-tab="outreach-engine"]');
        if (moTab && !moTab.classList.contains('active')) moTab.click();
        // 3. Switch to the Leads sub-tab inside Outreach Engine.
        if (typeof globalThis.switchOutreachTab === 'function') {
          globalThis.switchOutreachTab('leads');
        }
        // 4. Pre-fill the leads search input. Email is the most precise
        //    match; fall back to name. loadLeads() reads the input value
        //    when called, so we trigger it after setting.
        await new Promise(r => setTimeout(r, 50));
        const searchEl = document.getElementById('leads-search');
        if (searchEl) {
          searchEl.value = leadEmail || leadName || '';
          searchEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (typeof globalThis.loadLeads === 'function') {
          await globalThis.loadLeads();
        }
      } catch (e) {
        console.warn('[admin] viewOutreachLead failed:', e);
      }
    }
    globalThis.viewOutreachLead = viewOutreachLead;

    async function loadProviders(page = 1) {
      const { data: { session } } = await supabaseClient.auth.getSession();
      // Task #355 — flag this as an auth failure so renderTableLoadErrorRow
      // surfaces the "Sign in again" prompt instead of a generic Retry.
      if (!session) { setLoadError('providers', { message: 'No active admin session — sign in again.', code: 'NO_ADMIN_AUTH' }); renderProviders(); return; }

      const state = paginationState.providers;
      state.page = page;

      const params = new URLSearchParams({
        page: state.page,
        limit: state.limit,
        search: state.search,
        filter: state.filter
      });

      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      // Task #281 — clear any prior load error before re-fetching so a
      // successful retry repaints the table cleanly.
      loadErrors.providers = null;
      try {
        const response = await fetch(`${apiBase}/api/admin/providers?${params}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!response.ok) {
          let e; try { e = await response.json(); } catch { /* Intentionally silent */ }
          const err = new Error((e && (e.error || e.message)) || `Failed to load providers (${response.status})`);
          // Task #355 — preserve auth-failure code so renderTableLoadErrorRow
          // can swap Retry for "Sign in again".
          if (response.status === 401 || response.status === 403) err.code = 'ADMIN_AUTH_REJECTED';
          throw err;
        }
        const result = await response.json();

        if (result.success) {
          providers = result.data || [];
          state.total = result.total;
          state.totalPages = result.totalPages;
          // Task #249 — surface outreach attribution on the approved-providers
          // list. profiles.outreach_lead_id is set by the same conversion path
          // that populates provider_applications.outreach_lead_id (Task #137),
          // so we hydrate _outreach_lead the same way the Applications tab
          // does. Failures here never block the table render — the badge
          // gracefully falls back to "Direct signup" / "Lead linked".
          await hydrateApplicationOutreachLeads(providers);
          // Task #372 — hydrate the BGC Live/Mock pill from the dedicated
          // admin endpoint. Failures are swallowed so the providers table
          // still renders if the BGC endpoint is unreachable.
          try {
            const bgcResp = await fetch(`${apiBase}/api/admin/bgc/providers`, {
              headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (bgcResp.ok) {
              const bgcJson = await bgcResp.json();
              const liveMap = {};
              (bgcJson.providers || []).forEach(b => { liveMap[b.provider_id] = b; });
              providers = providers.map(p => liveMap[p.id] ? Object.assign({}, p, {
                bgc_live_mode: liveMap[p.id].live_mode,
                bgc_mode_reason: liveMap[p.id].mode_reason,
                bgc_pending_count: liveMap[p.id].pending_count,
                bgc_completed_count: liveMap[p.id].completed_count
              }) : p);
              // Task #373 — render the BGC Mode visibility panel above
              // the providers table from the same payload.
              renderBgcModePanel(bgcJson);
            } else {
              renderBgcModePanel({ error: `HTTP ${bgcResp.status}` });
            }
          } catch (e) { renderBgcModePanel({ error: e?.message || 'fetch failed' }); }
          renderProviders();
        } else {
          console.error('Failed to load providers:', result.error);
          setLoadError('providers', result.error || 'Server returned success=false');
          providers = [];
          renderProviders();
        }
      } catch (err) {
        console.error('Error loading providers:', err);
        setLoadError('providers', err);
        providers = [];
        renderProviders();
      }
      // Task #139 — agent activity strip (matchmaker / treasurer / gatekeeper / advocate touch providers).
      // Runs on both success and failure paths so the strip always reflects fleet activity.
      if (typeof globalThis.renderAgentActivityPanel === 'function') {
        try { globalThis.renderAgentActivityPanel('providers-agent-activity', {
          agentSlug: ['matchmaker', 'treasurer', 'gatekeeper', 'advocate'],
          limit: 10, title: 'Recent Provider-related Agent Activity', showEmpty: false,
          linkContext: { section: 'providers' }
        }); } catch { /* Intentionally silent */ }
      }
    }
    
    function changeProvidersPage(delta) {
      const state = paginationState.providers;
      const newPage = state.page + delta;
      if (newPage >= 1 && newPage <= state.totalPages) {
        loadProviders(newPage);
      }
    }
    
    function searchProviders() {
      debounceSearch('providers', () => {
        const searchInput = document.getElementById('provider-search');
        paginationState.providers.search = searchInput?.value || '';
        paginationState.providers.page = 1;
        loadProviders(1);
      });
    }
    
    function filterProvidersApi() {
      const statusFilter = document.getElementById('provider-status-filter')?.value || 'all';
      paginationState.providers.filter = statusFilter;
      paginationState.providers.page = 1;
      loadProviders(1);
    }

    // Add suspended_at column if not exists
    // ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

    async function loadPayments() {
      // Task #281 — surface load errors instead of silently rendering "No payments".
      loadErrors.payments = null;
      const { data, error } = await supabaseClient.from('payments').select('*, maintenance_packages(title), member:member_id(full_name), provider:provider_id(full_name)').order('created_at', { ascending: false });
      if (error) { console.error('loadPayments failed:', error); setLoadError('payments', error); payments = []; renderPayments(); return; }
      payments = data || [];
      renderPayments();
      // Task #246 / Task #353 — load critical API key expiry tracker
      // alongside the payments table.
      try { await loadApiKeyExpiry(); } catch (err) { console.error('loadApiKeyExpiry failed:', err); }
      // Task #139 — Treasurer agent + legacy payment_tracker module both touch payments.
      if (typeof globalThis.renderAgentActivityPanel === 'function') {
        try { globalThis.renderAgentActivityPanel('payments-agent-activity', {
          agentSlug: 'treasurer',
          includeAiOpsModule: 'payment_tracker',
          limit: 10, title: 'Recent Payment-related Agent Activity', showEmpty: false,
          linkContext: { section: 'payments' }
        }); } catch { /* Intentionally silent */ }
      }
    }

    // Task #246 / Task #353 — Critical API key expiry tracker (multi-key
    // generalization of the original Stripe-only pill). Renders one row per
    // tracked secret into #api-key-expiry-rows with a colored status pill,
    // an inline YYYY-MM-DD input, and an Update button. The same idempotent
    // alert ladder fires for each one (3-day / 1-day / 0-day email reminders).
    function apiKeyExpiryPillFor(data) {
      if (!data.configured) {
        return { cls: 'status-badge muted', label: 'Not configured' };
      }
      const days = data.days_until;
      if (typeof days !== 'number' || !Number.isFinite(days) || !data.expiry_date) {
        return { cls: 'status-badge red', label: 'Invalid date' };
      }
      if (data.level === 'expired' || days <= 0) {
        return { cls: 'status-badge red', label: `EXPIRED ${days < 0 ? `${Math.abs(days)}d ago` : 'today'}` };
      }
      if (data.level === 'critical' || days <= 1) {
        return { cls: 'status-badge red', label: days === 1 ? 'Expires in 1 day' : `Expires in ${days} days` };
      }
      if (data.level === 'warning' || days <= 3) {
        return { cls: 'status-badge orange', label: `Expires in ${days} days` };
      }
      return { cls: 'status-badge approved', label: `Healthy · ${days} days` };
    }

    // Task #460 — build "Alerts sent this cycle" chips for a key row
    function buildAlertSentChips(k) {
      const alerts = Array.isArray(k.recent_alerts) ? k.recent_alerts : [];
      const THRESHOLDS = [
        { type: 'alert_3d',      label: '3-day' },
        { type: 'alert_1d',      label: '1-day' },
        { type: 'alert_expired', label: 'Expired' },
        { type: 'probe_alert',   label: 'Probe failure' }
      ];
      const chips = THRESHOLDS.map(t => {
        const sent = alerts.find(a => a.action_type === t.type && a.outcome === 'sent');
        if (sent) {
          const ts = sent.created_at ? new Date(sent.created_at).toLocaleDateString() : '';
          return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:0.72rem;padding:2px 7px;border-radius:10px;background:var(--accent-green-soft,#d1fae5);color:var(--accent-green,#059669);" title="Sent ${escapeHtml(ts)}">✓ ${escapeHtml(t.label)}</span>`;
        }
        return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:0.72rem;padding:2px 7px;border-radius:10px;background:var(--bg-subtle,rgba(255,255,255,0.04));color:var(--text-muted);">${escapeHtml(t.label)}</span>`;
      }).join('');
      if (!chips) return '';
      return `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;" title="Alert status resets when you update the expiry date">${chips}</div>`;
    }

    function renderApiKeyExpiryRows(keys) {
      const host = document.getElementById('api-key-expiry-rows');
      if (!host) return;
      if (!Array.isArray(keys) || keys.length === 0) {
        host.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:0.9rem;">No tracked keys configured.</div>';
        return;
      }
      host.innerHTML = keys.map(k => {
        const pill = apiKeyExpiryPillFor(k);
        const probePill = k.probe_failing
          ? `<span class="status-badge red" style="font-size:0.72rem;">Probe failing</span>`
          : '';
        const dateStr = k.expiry_date ? escapeHtml(k.expiry_date) : '—';
        const dateVal = k.expiry_date && /^\d{4}-\d{2}-\d{2}$/.test(k.expiry_date) ? escapeHtml(k.expiry_date) : '';
        const feature = escapeHtml(k.feature || '');
        const alertChips = buildAlertSentChips(k);
        return `
          <div style="padding:12px 14px;border:1px solid var(--border-subtle);border-radius:var(--radius-md);background:var(--bg-input);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
              <div style="min-width:240px;flex:1;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  <span style="font-weight:600;color:var(--text-primary);">${escapeHtml(k.label)}</span>
                  <span class="${pill.cls}">${escapeHtml(pill.label)}</span>
                  ${probePill}
                  <span style="font-size:0.78rem;color:var(--text-muted);">env <code>${escapeHtml(k.env_var)}</code></span>
                </div>
                <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">${feature}</div>
                <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">Expiry: ${dateStr}</div>
                ${alertChips}
              </div>
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                <input type="date" data-api-key-input="${escapeHtml(k.id)}" class="form-input" style="width:auto;padding:6px 10px;font-size:0.85rem;" value="${dateVal}" />
                <button class="btn btn-primary btn-sm" onclick="saveApiKeyExpiry('${escapeHtml(k.id)}')">Update</button>
              </div>
            </div>
          </div>`;
      }).join('');
    }

    async function loadApiKeyExpiry() {
      const host = document.getElementById('api-key-expiry-rows');
      if (!host) return;
      try {
        // Task #355 — adminFetch surfaces 401/403 with auth codes so the
        // catch can render the shared "Sign in again" prompt instead of a
        // dead-end red error string.
        const data = await adminFetch('/api/admin/api-key-expiry', { headers: getAdminHeaders() });
        renderApiKeyExpiryRows(data.keys || []);
      } catch (err) {
        console.error('loadApiKeyExpiry error:', err);
        if (err && (err.code === 'NO_ADMIN_AUTH' || err.code === 'ADMIN_AUTH_REJECTED') && typeof globalThis.renderAdminAuthError === 'function') {
          globalThis.renderAdminAuthError(host, err, loadApiKeyExpiry);
        } else {
          host.innerHTML = `<div style="padding:12px;color:var(--accent-red);font-size:0.9rem;">Error loading API key expiry data: ${escapeHtml(err.message || String(err))}</div>`;
        }
      }
    }

    async function saveApiKeyExpiry(keyId) {
      const input = document.querySelector(`[data-api-key-input="${keyId}"]`);
      const value = (input?.value || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        showToast('Enter the expiry date in YYYY-MM-DD format.', 'error');
        return;
      }
      try {
        const data = await adminFetch('/api/admin/api-key-expiry', {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({ key_id: keyId, expiry_date: value })
        });
        await loadApiKeyExpiry();
        if (typeof showToast === 'function') showToast(`Expiry updated for ${data.key?.label || keyId}. Alert state reset.`);
      } catch (err) {
        console.error('saveApiKeyExpiry error:', err);
        showToast('Failed to update API key expiry.', 'error');
      }
    }

    globalThis.loadApiKeyExpiry = loadApiKeyExpiry;
    globalThis.saveApiKeyExpiry = saveApiKeyExpiry;

    // Task #459 — Render a banner on admin home when any key needs attention
    function renderDashboardApiKeyAlert(keys) {
      const host = document.getElementById('dashboard-api-key-alert');
      if (!host) return;
      const urgent = (keys || []).filter(k =>
        k.probe_failing ||
        k.level === 'expired' ||
        k.level === 'critical' ||
        k.level === 'warning'
      );
      if (urgent.length === 0) { host.style.display = 'none'; return; }

      const hasExpiredOrFailing = urgent.some(k => k.probe_failing || k.level === 'expired' || k.level === 'critical');
      const accent = hasExpiredOrFailing ? 'var(--accent-red)' : 'var(--accent-orange, #f59e0b)';
      const borderColor = hasExpiredOrFailing ? 'var(--accent-red-soft, #fca5a5)' : 'var(--accent-orange-soft, #fde68a)';
      const icon = hasExpiredOrFailing ? 'alert-triangle' : 'alert-circle';

      const pills = urgent.map(k => {
        let label, cls;
        if (k.probe_failing) { label = `${escapeHtml(k.label)}: probe failure`; cls = 'status-badge red'; }
        else if (k.level === 'expired') { label = `${escapeHtml(k.label)}: EXPIRED`; cls = 'status-badge red'; }
        else if (k.level === 'critical') { label = `${escapeHtml(k.label)}: expires tomorrow`; cls = 'status-badge red'; }
        else { label = `${escapeHtml(k.label)}: expiring soon`; cls = 'status-badge orange'; }
        return `<span class="${cls}" style="font-size:0.75rem;">${label}</span>`;
      }).join('');

      host.style.display = '';
      host.innerHTML = `
        <div style="background:var(--bg-elevated);border:1px solid ${borderColor};border-left:4px solid ${accent};border-radius:var(--radius-md);padding:14px 16px;display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;">
          <span class="icon-inline" data-icon="${icon}" style="color:${accent};flex-shrink:0;margin-top:2px;"></span>
          <div style="flex:1;min-width:200px;">
            <div style="font-weight:600;color:var(--text-primary);margin-bottom:6px;">${urgent.length} API key${urgent.length > 1 ? 's need' : ' needs'} attention</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">${pills}</div>
          </div>
          <button class="btn btn-sm btn-primary" onclick="navigateToSection('payments');setTimeout(()=>document.getElementById('api-key-expiry-rows')?.scrollIntoView({behavior:'smooth'}),300);" style="flex-shrink:0;">
            View API Keys →
          </button>
        </div>`;
      if (typeof renderIcons === 'function') renderIcons(host);
    }

    async function loadDashboardApiKeyAlert() {
      try {
        const data = await adminFetch('/api/admin/api-key-expiry', { headers: getAdminHeaders() });
        renderDashboardApiKeyAlert(data.keys || []);
      } catch {}
    }

    globalThis.loadDashboardApiKeyAlert = loadDashboardApiKeyAlert;


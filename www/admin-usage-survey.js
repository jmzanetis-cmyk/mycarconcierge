    // ========== AI API USAGE DASHBOARD (Task #90) ==========
    let _apiUsageChart = null;
    async function loadApiUsage() {
      const keysEl = document.getElementById('api-stat-keys');
      const callsEl = document.getElementById('api-stat-calls');
      const revenueEl = document.getElementById('api-stat-revenue');
      const monthEl = document.getElementById('api-stat-month');
      const tableEl = document.getElementById('api-keys-table');
      // Task #355 — missing admin session surfaces the shared "Sign in again"
      // prompt instead of silently returning.
      if (!_adminBearer && !adminTeamToken) {
        if (tableEl) {
          const err = new Error('No admin session — please sign in again to view API usage.');
          err.code = 'NO_ADMIN_AUTH';
          renderAdminAuthErrorInto(tableEl, err, loadApiUsage);
        }
        return;
      }
      if (callsEl) callsEl.textContent = '…';
      try {
        const data = await aiOpsFetch('/api/admin/api-usage', { headers: getAiOpsHeaders() });
        if (keysEl) keysEl.textContent = data.active_keys ?? '--';
        if (callsEl) callsEl.textContent = (data.total_calls_this_month || 0).toLocaleString();
        if (revenueEl) revenueEl.textContent = '$' + ((data.estimated_revenue_cents || 0) / 100).toFixed(2);
        if (monthEl) monthEl.textContent = data.month || '--';
        // Chart
        const canvas = document.getElementById('api-endpoint-chart');
        if (canvas && data.by_endpoint) {
          const labels = Object.keys(data.by_endpoint);
          const callValues = Object.values(data.by_endpoint);
          // Estimated revenue: avg blended rate per call
          const totalCalls = callValues.reduce((a, b) => a + b, 0);
          const revenuePerCall = totalCalls > 0 ? (data.estimated_revenue_cents || 0) / 100 / totalCalls : 0;
          const revenueValues = callValues.map(c => Number.parseFloat((c * revenuePerCall).toFixed(2)));
          if (_apiUsageChart) _apiUsageChart.destroy();
          _apiUsageChart = new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets: [
              { label: 'API Calls', data: callValues, backgroundColor: 'rgba(201,168,76,0.7)', borderColor: '#c9a84c', borderWidth: 1, yAxisID: 'y' },
              { label: 'Est. Revenue ($ based on plan rate)', data: revenueValues, backgroundColor: 'rgba(52,211,153,0.5)', borderColor: '#34d399', borderWidth: 1, yAxisID: 'y1' }
            ] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, labels: { color: '#9ca3af' } } }, scales: { y: { beginAtZero: true, position: 'left', ticks: { color: '#9ca3af' }, grid: { color: 'rgba(156,163,175,0.1)' } }, y1: { beginAtZero: true, position: 'right', ticks: { color: '#34d399', callback: v => '$' + v.toFixed(2) }, grid: { display: false } }, x: { ticks: { color: '#9ca3af' }, grid: { display: false } } } }
          });
        }
        // Table
        if (tableEl) {
          if (!data.top_keys || data.top_keys.length === 0) {
            tableEl.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);">No API keys found.</div>';
          } else {
            tableEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
              <thead><tr style="border-bottom:1px solid var(--border-subtle);">
                <th style="text-align:left;padding:10px 8px;color:var(--text-muted);">Key Name</th>
                <th style="text-align:left;padding:10px 8px;color:var(--text-muted);">Plan</th>
                <th style="text-align:right;padding:10px 8px;color:var(--text-muted);">Total Calls</th>
                <th style="text-align:right;padding:10px 8px;color:var(--text-muted);">Limit</th>
                <th style="text-align:left;padding:10px 8px;color:var(--text-muted);">Last Used</th>
                <th style="text-align:left;padding:10px 8px;color:var(--text-muted);">Status</th>
                <th style="text-align:center;padding:10px 8px;color:var(--text-muted);">Actions</th>
              </tr></thead>
              <tbody>${data.top_keys.map(k => {
                const safeName = escapeHtml(k.name || 'Unnamed');
                const safePlan = escapeHtml(String(k.plan || ''));
                const safeStatus = escapeHtml(String(k.status || ''));
                const statusBg = safeStatus === 'active' ? 'var(--accent-green-soft)' : 'var(--accent-red-soft)';
                const statusColor = safeStatus === 'active' ? 'var(--accent-green)' : 'var(--accent-red)';
                return `<tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:10px 8px;">${safeName}</td>
                  <td style="padding:10px 8px;"><span class="badge" style="background:var(--accent-gold-soft);color:var(--accent-gold);text-transform:capitalize;">${safePlan}</span></td>
                  <td style="padding:10px 8px;text-align:right;">${(k.calls_made || 0).toLocaleString()}</td>
                  <td style="padding:10px 8px;text-align:right;">${k.calls_limit === -1 ? '∞' : (k.calls_limit || 0).toLocaleString()}</td>
                  <td style="padding:10px 8px;color:var(--text-muted);">${k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}</td>
                  <td style="padding:10px 8px;"><span class="badge" style="background:${statusBg};color:${statusColor};">${safeStatus}</span></td>
                  <td style="padding:10px 8px;text-align:center;">${safeStatus === 'active' ? `<button onclick="adminRevokeApiKey('${escapeHtml(String(k.id || ''))}', this)" style="padding:3px 10px;background:var(--accent-red-soft);color:var(--accent-red);border:1px solid var(--accent-red);border-radius:4px;cursor:pointer;font-size:0.8rem;">Revoke</button>` : '<span style="color:var(--text-muted);font-size:0.8rem;">—</span>'}</td>
                </tr>`;
              }).join('')}
              </tbody>
            </table>`;
          }
        }
      } catch (err) {
        if (callsEl) callsEl.textContent = 'Error';
        console.error('[Admin] API usage load error:', err.message);
        // Task #355 — auth-expiry surfaces the shared "Sign in again" prompt.
        if (isAdminAuthError(err) && tableEl) renderAdminAuthErrorInto(tableEl, err, loadApiUsage);
      }
    }
    globalThis.loadApiUsage = loadApiUsage;

    async function adminRevokeApiKey(keyId, btn) {
      if (!keyId || !confirm('Revoke this API key? This cannot be undone.')) return;
      const authHeaders = await getAdminAuthHeader().catch(() => null);
      if (!authHeaders) { alert('Admin session not found. Please sign in again.'); return; }
      btn.disabled = true; btn.textContent = 'Revoking…';
      try {
        const res = await fetch(`/api/admin/api-keys/${encodeURIComponent(keyId)}/revoke`, {
          method: 'POST',
          headers: authHeaders
        });
        const data = await res.json();
        if (res.ok) {
          btn.textContent = 'Revoked';
          btn.style.opacity = '0.5';
          btn.disabled = true;
          const statusCell = btn.closest('tr').cells[5];
          if (statusCell) {
            const badge = statusCell.querySelector('.badge');
            if (badge) { badge.textContent = 'revoked'; badge.style.background = 'var(--accent-red-soft)'; badge.style.color = 'var(--accent-red)'; }
          }
        } else {
          btn.disabled = false; btn.textContent = 'Revoke';
          alert(data.error || 'Failed to revoke key');
        }
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Revoke';
        alert('Network error');
      }
    }
    globalThis.adminRevokeApiKey = adminRevokeApiKey;
    // ========== END AI API USAGE DASHBOARD ==========

    // ========== SURVEY LEADS (Task #93) ==========

    const SURVEY_FEATURE_NAMES = {
      get_quotes:       'Get Instant Quotes',
      manage_vehicles:  'Manage Your Vehicles',
      maintenance:      'Maintenance Tracking',
      shop_smarter:     'Shop Smarter',
      booking:          'Easy Service Booking',
      obd_diagnostics:  'OBD Diagnostics',
      provider_ratings: 'Verified Ratings',
      price_estimator:  'AI Price Estimator'
    };

    const SURVEY_SERVICE_NAMES = {
      oil_change: 'Oil Change', tire_rotation: 'Tire Rotation', brake_service: 'Brake Service',
      diagnostic: 'Diagnostic', ac_repair: 'A/C Repair', transmission: 'Transmission',
      body_paint: 'Body Work', detailing: 'Detailing', towing: 'Towing',
      inspection: 'Inspection', windshield: 'Windshield', electrical: 'Electrical',
      suspension: 'Suspension', snow_removal: 'Snow Removal', other: 'Other'
    };

    let surveyLeadsState = { page: 1, limit: 25, total: 0, totalPages: 0, sortDir: 'desc' };
    let surveyNiState    = { page: 1, limit: 50, total: 0, totalPages: 0 };
    let surveyTrendData  = null;
    let surveyTrendChart = null;
    let surveyTrendView  = 'daily';
    let surveySearchTimer = null;
    // Cache leads rows so onclick can reference by index (avoids unsafe inline JSON)
    let _surveyLeadsCache = [];

    async function loadSurveyAnalytics() {
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const data = await aiOpsFetch(apiBase + '/api/admin/survey-stats', { headers: getAdminHeaders() });

        const el = id => document.getElementById(id);
        if (el('sl-total'))          el('sl-total').textContent          = (data.total_responses || 0).toLocaleString();
        if (el('sl-pct-interested')) el('sl-pct-interested').textContent = (data.pct_interested || 0) + '%';
        if (el('sl-profiles'))       el('sl-profiles').textContent       = (data.total_profiles || 0).toLocaleString();
        if (el('sl-jobs'))           el('sl-jobs').textContent           = (data.total_jobs || 0).toLocaleString();

        // Render heatmap
        renderSurveyHeatmap(data.feature_heatmap || {});

        // Store trend data for chart
        surveyTrendData = data.daily_counts || {};
        if (document.getElementById('sl-trend-chart')) renderSurveyTrendChart();

        // Load leads table
        await loadSurveyLeads(1);

      } catch (err) {
        console.error('[SurveyLeads] loadSurveyAnalytics error:', err.message);
      }
    }
    globalThis.loadSurveyAnalytics = loadSurveyAnalytics;

    // ===== MEMBER SURVEY ANALYTICS =====
    // Labels come from the shared survey definition (www/shared/survey-questions.js)
    // so they cannot drift from the form options (onboarding-member.html) or the
    // server's ALLOWED enum map (server.js). Unknown values fall back to the raw enum code.
    const MS_LABELS = (typeof window !== 'undefined' && globalThis.MCCSurvey && globalThis.MCCSurvey.LABELS) || {};
    const MS_CHART_COLORS = ['#c9a227','#22d3ee','#38bdf8','#34d399','#fb923c','#f87171','#a78bfa'];
    let _msCharts = {};

    function buildMsDoughnut(canvasId, labelMap, countMap) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      const keys = Object.keys(countMap).filter(k => countMap[k] > 0);
      // No data: show placeholder but preserve canvas so re-render works without full reload
      let placeholder = canvas.parentElement.querySelector('.ms-chart-empty');
      if (!keys.length) {
        canvas.style.display = 'none';
        if (!placeholder) {
          placeholder = document.createElement('p');
          placeholder.className = 'ms-chart-empty';
          placeholder.style.cssText = 'color:var(--text-muted);text-align:center;font-size:0.88rem;padding:32px 0;';
          placeholder.textContent = 'Not enough responses yet';
          canvas.parentElement.appendChild(placeholder);
        }
        return;
      }
      // Has data: hide placeholder, restore canvas
      if (placeholder) placeholder.remove();
      canvas.style.display = '';
      const labels = keys.map(k => labelMap[k] || k);
      const values = keys.map(k => countMap[k]);
      if (_msCharts[canvasId]) { _msCharts[canvasId].destroy(); }
      _msCharts[canvasId] = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{ data: values, backgroundColor: MS_CHART_COLORS.slice(0, keys.length), borderWidth: 0 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { color: '#a0a8b8', font: { size: 11 }, padding: 10, boxWidth: 12 } },
            tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} (${Math.round(ctx.raw / values.reduce((a,b) => a+b,0) * 100)}%)` } }
          },
          cutout: '60%'
        }
      });
    }

    async function loadMemberSurveyAnalytics() {
      const el = id => document.getElementById(id);
      const banner = el('ms-error-banner');
      // Reset banner on every load
      if (banner) { banner.style.display = 'none'; banner.textContent = ''; }
      // Read date-range selector (default all-time preserves prior behavior)
      const rangeSel = el('ms-range-select');
      const range = (rangeSel && rangeSel.value) || 'all';
      const RANGE_LABELS = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', 'all': 'All time' };
      // Update headline-card labels so admins can see which window the numbers reflect
      const totalLabelEl = el('ms-total') && el('ms-total').parentElement && el('ms-total').parentElement.querySelector('.stat-label');
      if (totalLabelEl) totalLabelEl.textContent = range === 'all' ? 'Total Responses' : `Responses (${RANGE_LABELS[range]})`;
      // "This Week" is still last 7 days within the active window — clarify when window < 7d or > 7d
      const weekLabelEl = el('ms-week') && el('ms-week').parentElement && el('ms-week').parentElement.querySelector('.stat-label');
      if (weekLabelEl) weekLabelEl.textContent = range === '7d' ? 'This Week (full window)' : 'This Week';
      try {
        const headers = getAdminHeaders();
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        // Always include ?range for explicitness and server-side telemetry
        const url = apiBase + '/api/admin/survey-analytics?range=' + encodeURIComponent(range);
        const data = await aiOpsFetch(url, { headers: getAdminHeaders() });

        if (el('ms-total')) el('ms-total').textContent = (data.total || 0).toLocaleString();
        if (el('ms-week')) el('ms-week').textContent = (data.recent_week || 0).toLocaleString();

        const topPriority = Object.entries(data.by_top_priority || {}).sort((a,b) => b[1]-a[1])[0];
        if (el('ms-top-pain')) el('ms-top-pain').textContent = topPriority ? (MS_LABELS.top_priority[topPriority[0]] || topPriority[0]) : '—';

        const topSat = Object.entries(data.by_provider_satisfaction || {}).sort((a,b) => b[1]-a[1])[0];
        if (el('ms-top-improvement')) el('ms-top-improvement').textContent = topSat ? (MS_LABELS.provider_satisfaction[topSat[0]] || topSat[0]) : '—';

        // Render every survey dimension. The list of keys is the single source of
        // truth in www/shared/survey-questions.js (MCCSurvey.KEYS); we iterate it
        // directly so adding a new question there automatically renders a chart.
        // Each key needs a matching <canvas id="ms-chart-<key>"> card in admin.html
        // (the survey-questions-drift smoke test enforces that mapping).
        const surveyKeys = (globalThis.MCCSurvey && Array.isArray(globalThis.MCCSurvey.KEYS))
          ? globalThis.MCCSurvey.KEYS
          : [];
        for (const key of surveyKeys) {
          buildMsDoughnut('ms-chart-' + key, MS_LABELS[key] || {}, data['by_' + key] || {});
        }

        // Surface "schema not yet migrated" hint to the admin if the server told us so
        if (data.schema_pending && banner) {
          banner.style.display = 'block';
          banner.style.color = '#fbbf24';
          banner.style.background = 'rgba(251,191,36,0.10)';
          banner.style.borderColor = 'rgba(251,191,36,0.40)';
          banner.textContent = 'survey_responses table is missing expected columns. Apply supabase/migrations/20260428_survey_responses_columns_fix.sql in Supabase SQL Editor, then refresh this page.';
        }
      } catch (err) {
        const isAuthErr = err && (err.code === 'NO_ADMIN_AUTH' || err.code === 'ADMIN_AUTH_REJECTED');
        if (isAuthErr && banner) {
          renderAiOpsAuthError(banner, err, loadMemberSurveyAnalytics);
        } else {
          console.error('[MemberSurveys] load error:', err.message);
          if (banner) {
            banner.style.display = 'block';
            banner.textContent = 'Could not load survey analytics: ' + err.message + '. Check server logs and try Refresh.';
          }
          // Reset headline cards to a clear "error" sentinel rather than stale numbers
          if (el('ms-total')) el('ms-total').textContent = '—';
          if (el('ms-week')) el('ms-week').textContent = '—';
          if (el('ms-top-pain')) el('ms-top-pain').textContent = '—';
          if (el('ms-top-improvement')) el('ms-top-improvement').textContent = '—';
        }
      }
    }
    globalThis.loadMemberSurveyAnalytics = loadMemberSurveyAnalytics;

    function renderSurveyHeatmap(heatmap) {
      const container = document.getElementById('sl-heatmap');
      if (!container) return;
      const FEATURE_IDS = Object.keys(SURVEY_FEATURE_NAMES);
      if (!FEATURE_IDS.some(fid => (heatmap[fid]?.yes || 0) + (heatmap[fid]?.maybe || 0) + (heatmap[fid]?.no || 0) > 0)) {
        container.innerHTML = '<p style="color:var(--text-muted);padding:24px;text-align:center;">No feature ratings yet.</p>';
        return;
      }
      container.innerHTML = FEATURE_IDS.map(fid => {
        const counts = heatmap[fid] || { yes: 0, maybe: 0, no: 0 };
        const total  = counts.yes + counts.maybe + counts.no || 1;
        const yPct   = Math.round((counts.yes   / total) * 100);
        const mPct   = Math.round((counts.maybe / total) * 100);
        const nPct   = 100 - yPct - mPct;
        return `
          <div style="margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
              <span style="font-size:0.88rem;font-weight:500;color:var(--text-primary);">${escapeHtml(SURVEY_FEATURE_NAMES[fid] || fid)}</span>
              <span style="font-size:0.78rem;color:var(--text-muted);">${counts.yes}👍 ${counts.maybe}🤔 ${counts.no}👎</span>
            </div>
            <div style="display:flex;height:10px;border-radius:6px;overflow:hidden;gap:2px;">
              <div style="width:${yPct}%;background:#22c55e;border-radius:6px 0 0 6px;" title="Yes: ${yPct}%"></div>
              <div style="width:${mPct}%;background:var(--accent-gold);" title="Maybe: ${mPct}%"></div>
              <div style="width:${nPct}%;background:#94a3b8;border-radius:0 6px 6px 0;" title="No: ${nPct}%"></div>
            </div>
          </div>`;
      }).join('');
    }

    function renderSurveyTrendChart() {
      if (!surveyTrendData) return;
      const canvas = document.getElementById('sl-trend-chart');
      if (!canvas) return;
      if (typeof Chart === 'undefined') {
        // Lazy-load Chart.js
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
        s.onload = () => renderSurveyTrendChart();
        document.head.appendChild(s);
        return;
      }
      if (surveyTrendChart) { surveyTrendChart.destroy(); surveyTrendChart = null; }

      const daily   = Object.entries(surveyTrendData).sort((a, b) => a[0].localeCompare(b[0]));
      let labels, values;
      if (surveyTrendView === 'weekly') {
        const weekMap = {};
        for (const [date, count] of daily) {
          const d = new Date(date);
          const wStart = new Date(d); wStart.setDate(d.getDate() - d.getDay());
          const key = wStart.toISOString().slice(0, 10);
          weekMap[key] = (weekMap[key] || 0) + count;
        }
        const weeks = Object.entries(weekMap).sort((a, b) => a[0].localeCompare(b[0]));
        labels = weeks.map(([d]) => 'Wk ' + d.slice(5));
        values = weeks.map(([, v]) => v);
      } else {
        labels = daily.map(([d]) => d.slice(5));
        values = daily.map(([, v]) => v);
      }

      const isDark = document.documentElement.dataset.theme !== 'light';
      const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
      const textColor = isDark ? '#a0a8b8' : '#4a5568';
      surveyTrendChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Responses',
            data: values,
            borderColor: '#C9A84C',
            backgroundColor: 'rgba(201,168,76,0.12)',
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.3,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: textColor, maxTicksLimit: 14 }, grid: { color: gridColor } },
            y: { ticks: { color: textColor, stepSize: 1, precision: 0 }, grid: { color: gridColor }, beginAtZero: true }
          }
        }
      });
    }

    function switchTrendView(view) {
      surveyTrendView = view;
      const dailyBtn  = document.getElementById('sl-trend-daily');
      const weeklyBtn = document.getElementById('sl-trend-weekly');
      if (dailyBtn)  dailyBtn.style.background  = view === 'daily'  ? 'var(--accent-blue-soft)' : '';
      if (dailyBtn)  dailyBtn.style.color        = view === 'daily'  ? 'var(--accent-blue)' : '';
      if (weeklyBtn) weeklyBtn.style.background  = view === 'weekly' ? 'var(--accent-blue-soft)' : '';
      if (weeklyBtn) weeklyBtn.style.color        = view === 'weekly' ? 'var(--accent-blue)' : '';
      renderSurveyTrendChart();
    }
    globalThis.switchTrendView = switchTrendView;

    async function loadSurveyLeads(page) {
      page = page || surveyLeadsState.page;
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const search  = (document.getElementById('sl-search')?.value || '').trim();
      const filter  = document.getElementById('sl-filter')?.value || 'all';
      const sortDir = surveyLeadsState.sortDir || 'desc';
      // Thread the active Survey Analytics range so the list reflects the same window
      // as the charts. Falls back to 'all' when the selector hasn't been rendered yet.
      const range   = document.getElementById('ms-range-select')?.value || 'all';
      const params  = new URLSearchParams({ page, limit: surveyLeadsState.limit, search, filter, sort_dir: sortDir, range });
      const tbody   = document.getElementById('sl-table-body');
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted);">Loading…</td></tr>';
      try {
        const res = await fetch(apiBase + '/api/admin/survey-leads?' + params.toString(), { headers: getAdminHeaders() });
        if (!res.ok) throw new Error('Fetch failed');
        const data = await res.json();
        surveyLeadsState.page       = page;
        surveyLeadsState.total      = data.total || 0;
        surveyLeadsState.totalPages = Math.max(1, Math.ceil((data.total || 0) / surveyLeadsState.limit));
        _surveyLeadsCache = data.leads || [];

        // Update sort button labels
        const sortBtn = document.getElementById('sl-sort-date-btn');
        if (sortBtn) sortBtn.textContent = sortDir === 'desc' ? '📅 Newest First' : '📅 Oldest First';

        if (tbody) {
          const leads = _surveyLeadsCache;
          if (!leads.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);">No leads found.</td></tr>';
          } else {
            // Use data-idx to avoid unsafe inline JSON in onclick
            tbody.innerHTML = leads.map((lead, idx) => {
              const badge = lead.interested === true
                ? '<span class="badge badge-green">✅ Yes</span>'
                : lead.interested === false
                  ? '<span class="badge badge-gray">👎 No</span>'
                  : '<span class="badge badge-gray">—</span>';
              const topFeature = lead.top_feature ? (SURVEY_FEATURE_NAMES[lead.top_feature] || lead.top_feature) : '—';
              const service    = lead.job_service  ? (SURVEY_SERVICE_NAMES[lead.job_service]  || lead.job_service)  : '—';
              const date       = lead.created_at   ? new Date(lead.created_at).toLocaleDateString() : '—';
              return `<tr class="sl-lead-row" data-idx="${idx}" style="cursor:pointer;">
                <td><span style="font-weight:500;">${escapeHtml(lead.name || '—')}</span></td>
                <td><a href="mailto:${escapeHtml(lead.email||'')}" class="sl-email-link" style="color:var(--accent-blue);">${escapeHtml(lead.email||'—')}</a></td>
                <td>${escapeHtml(lead.zip||'—')}</td>
                <td style="font-size:0.83rem;">${escapeHtml(lead.vehicle||'—')}</td>
                <td>${badge}</td>
                <td style="font-size:0.83rem;">${escapeHtml(topFeature)}</td>
                <td style="font-size:0.83rem;">${escapeHtml(service)}</td>
                <td style="font-size:0.83rem;color:var(--text-muted);">${date}</td>
              </tr>`;
            }).join('');
            // Attach click events via delegation (safe — no inline JSON)
            tbody.querySelectorAll('.sl-lead-row').forEach(row => {
              row.addEventListener('click', e => {
                if (e.target.classList.contains('sl-email-link')) return;
                openSurveyLeadDetail(_surveyLeadsCache[Number.parseInt(row.dataset.idx, 10)]);
              });
            });
          }
        }

        const pagEl = document.getElementById('sl-pagination');
        if (pagEl) pagEl.innerHTML = renderPaginationControls(surveyLeadsState, 'loadSurveyLeads');
      } catch (err) {
        console.error('[SurveyLeads] loadSurveyLeads error:', err.message);
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--accent-red);">Failed to load leads.</td></tr>';
      }
    }
    globalThis.loadSurveyLeads = loadSurveyLeads;

    function toggleSurveyDateSort() {
      surveyLeadsState.sortDir = surveyLeadsState.sortDir === 'desc' ? 'asc' : 'desc';
      loadSurveyLeads(1);
    }
    globalThis.toggleSurveyDateSort = toggleSurveyDateSort;

    function openSurveyLeadDetail(lead) {
      if (!lead) return;
      const modal = document.getElementById('sl-detail-modal');
      const body  = document.getElementById('sl-detail-body');
      if (!modal || !body) return;

      const fr = lead.feature_ratings || {};
      const featureRows = Object.entries(fr).map(([fid, val]) => {
        const icon = val === 'yes' ? '👍' : val === 'maybe' ? '🤔' : '👎';
        return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border-subtle);font-size:0.85rem;">
          <span style="color:var(--text-secondary);">${escapeHtml(SURVEY_FEATURE_NAMES[fid] || fid)}</span>
          <span>${icon} ${escapeHtml(val)}</span>
        </div>`;
      }).join('') || '<p style="color:var(--text-muted);font-size:0.83rem;">No feature ratings.</p>';

      const urgencyMap = { asap: '🚨 ASAP', this_week: '📅 This Week', this_month: '🗓️ This Month', just_curious: '👀 Just Pricing' };
      const budgetMap  = { under_100: 'Under $100', '100_500': '$100–$500', '500_1000': '$500–$1,000', '1000_plus': '$1,000+', unsure: 'Not sure' };

      body.innerHTML = `
        <div style="margin-bottom:20px;">
          <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:8px;">Contact</div>
          <div class="detail-grid">
            <span class="detail-label">Name</span><span class="detail-value">${escapeHtml(lead.name||'—')}</span>
            <span class="detail-label">Email</span><span class="detail-value"><a href="mailto:${escapeHtml(lead.email||'')}" style="color:var(--accent-blue);">${escapeHtml(lead.email||'—')}</a></span>
            <span class="detail-label">Phone</span><span class="detail-value">${escapeHtml(lead.phone||'—')}</span>
            <span class="detail-label">ZIP</span><span class="detail-value">${escapeHtml(lead.zip||'—')}</span>
            <span class="detail-label">Vehicle</span><span class="detail-value">${escapeHtml(lead.vehicle||'—')}</span>
            <span class="detail-label">Interested</span><span class="detail-value">${lead.interested === true ? '✅ Yes' : lead.interested === false ? '👎 No' : '—'}</span>
            <span class="detail-label">Date</span><span class="detail-value">${lead.created_at ? new Date(lead.created_at).toLocaleString() : '—'}</span>
          </div>
        </div>
        ${lead.job_service || lead.job_issue ? `
        <div style="margin-bottom:20px;">
          <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:8px;">Job Request</div>
          <div class="detail-grid">
            <span class="detail-label">Service</span><span class="detail-value">${escapeHtml(SURVEY_SERVICE_NAMES[lead.job_service] || lead.job_service || '—')}</span>
            <span class="detail-label">Urgency</span><span class="detail-value">${escapeHtml(urgencyMap[lead.job_urgency] || lead.job_urgency || '—')}</span>
            <span class="detail-label">Budget</span><span class="detail-value">${escapeHtml(budgetMap[lead.job_budget] || lead.job_budget || '—')}</span>
            <span class="detail-label" style="align-self:start;">Issue</span><span class="detail-value" style="white-space:pre-wrap;">${escapeHtml(lead.job_issue || '—')}</span>
          </div>
        </div>` : ''}
        <div>
          <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:8px;">Feature Ratings</div>
          ${featureRows}
        </div>`;

      modal.classList.add('active');
    }
    globalThis.openSurveyLeadDetail = openSurveyLeadDetail;

    async function loadSurveyNotInterested(page) {
      page = page || surveyNiState.page;
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const tbody   = document.getElementById('sl-ni-body');
      if (tbody) tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--text-muted);">Loading…</td></tr>';
      try {
        const params = new URLSearchParams({ page, limit: surveyNiState.limit });
        const res = await fetch(apiBase + '/api/admin/survey-not-interested?' + params.toString(), { headers: getAdminHeaders() });
        if (!res.ok) throw new Error('Fetch failed');
        const data = await res.json();
        surveyNiState.page       = page;
        surveyNiState.total      = data.total || 0;
        surveyNiState.totalPages = Math.max(1, Math.ceil((data.total || 0) / surveyNiState.limit));

        if (tbody) {
          const emails = data.emails || [];
          if (!emails.length) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:32px;color:var(--text-muted);">No not-interested emails yet.</td></tr>';
          } else {
            tbody.innerHTML = emails.map(row => {
              const hasRatings = row.feature_ratings && Object.keys(row.feature_ratings).length > 0;
              return `<tr>
                <td><a href="mailto:${escapeHtml(row.email||'')}" style="color:var(--accent-blue);">${escapeHtml(row.email||'—')}</a></td>
                <td style="color:var(--text-muted);font-size:0.85rem;">${row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}</td>
                <td>${hasRatings ? '<span class="badge badge-green">Yes</span>' : '<span class="badge badge-gray">No</span>'}</td>
              </tr>`;
            }).join('');
          }
        }

        const pagEl = document.getElementById('sl-ni-pagination');
        if (pagEl) pagEl.innerHTML = renderPaginationControls(surveyNiState, 'loadSurveyNotInterested');
      } catch (err) {
        console.error('[SurveyLeads] loadSurveyNotInterested error:', err.message);
        if (tbody) tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--accent-red);">Failed to load emails.</td></tr>';
      }
    }
    globalThis.loadSurveyNotInterested = loadSurveyNotInterested;

    function switchSurveyTab(tab, el) {
      document.querySelectorAll('#survey-leads-tabs .tab').forEach(t => t.classList.remove('active'));
      if (el) el.classList.add('active');
      ['leads','not-interested','heatmap','trends'].forEach(t => {
        const div = document.getElementById('survey-tab-' + t);
        if (div) div.style.display = t === tab ? '' : 'none';
      });
      if (tab === 'not-interested') loadSurveyNotInterested(1);
      if (tab === 'trends' && surveyTrendData) setTimeout(renderSurveyTrendChart, 50);
    }
    globalThis.switchSurveyTab = switchSurveyTab;

    function debounceSurveySearch() {
      if (surveySearchTimer) clearTimeout(surveySearchTimer);
      surveySearchTimer = setTimeout(() => loadSurveyLeads(1), 300);
    }
    globalThis.debounceSurveySearch = debounceSurveySearch;

    function exportSurveyLeads() {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const headers = getAdminHeaders();
      // Thread the active Survey Analytics range so the CSV matches the charts/list window.
      const range   = document.getElementById('ms-range-select')?.value || 'all';
      const url     = apiBase + '/api/admin/survey-leads/export?range=' + encodeURIComponent(range);
      const a       = document.createElement('a');
      a.href = url;
      // Pass auth via fetch and redirect to blob URL
      fetch(url, { headers }).then(r => r.blob()).then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        a.href = blobUrl;
        a.download = 'survey-leads-' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      }).catch(err => { console.error('[SurveyLeads] export error:', err); alert('Export failed.'); });
    }
    globalThis.exportSurveyLeads = exportSurveyLeads;

    // ========== END SURVEY LEADS ==========

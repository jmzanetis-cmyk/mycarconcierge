    // ========== FETCH HELPER ==========
    // Task #234 — `safeFetch` is kept as a thin compatibility wrapper. It now
    // delegates to `aiOpsFetch` (declared further below as `adminFetch` too)
    // when that helper is available, so every admin loader gets the same
    // diagnostic messages added in Task #174 (HTTP status, relative path,
    // plain-language reason) instead of the bare "Server error (NNN)" text
    // that production triage could not act on. We fall back to the legacy
    // path only on the very first call ordering, before adminFetch has been
    // defined; in practice every loader is invoked long after parse-time so
    // the wrapper always finds adminFetch.
    async function safeFetch(url, options) {
      if (typeof globalThis.adminFetch === 'function') {
        return globalThis.adminFetch(url, options);
      }
      const res = await fetch(url, options);
      if (!res.ok) {
        let errMsg = `Server error (${res.status})`;
        try { const e = await res.clone().json(); errMsg = e.error || e.message || errMsg; } catch { /* Intentionally silent */ }
        throw new Error(errMsg);
      }
      return res.json();
    }
    
    // ========== STATE ==========
    let currentUser = null;
    let applications = [];
    let providers = [];
    let payments = [];
    let selectedPaymentIds = new Set();
    let disputes = [];
    let tickets = [];
    let members = [];
    // Task #281 — capture loader errors so renderX functions can surface
    // them instead of falling through to the generic empty-state row that
    // makes failures look like "no data".
    let loadErrors = { providers: null, members: null, payments: null, disputes: null, tickets: null, applications: null };
    // Task #355 — preserve the error `code` (NO_ADMIN_AUTH / ADMIN_AUTH_REJECTED
    // from adminFetch) alongside the human message so renderTableLoadErrorRow
    // can swap the dead-end Retry button for an actionable "Sign in again"
    // prompt when the failure was a session expiry. Stored as a parallel map
    // so the existing `loadErrors[key]` string lookups keep working.
    const loadErrorCodes = {};
    function setLoadError(key, err) {
      const msg = err && (err.message || err.error || err.hint) ? (err.message || err.error || err.hint) : (err ? String(err) : 'Unknown error');
      loadErrors[key] = msg;
      loadErrorCodes[key] = err && err.code ? err.code : null;
    }
    // Task #355 — single canonical renderer for an "admin session expired"
    // table-row banner. Every admin loader that pours an error into a table
    // calls this so the prompt copy, color, and Sign-in-again behavior stay
    // identical. `retryFn` may be a function or a string (HTML onclick form
    // used by `renderTableLoadErrorRow`).
    function renderAdminAuthErrorRow(tbody, colspan, err, retryFn) {
      if (!tbody) return;
      const stashKey = '_adminAuthRetry_' + Math.random().toString(36).slice(2, 10);
      globalThis[stashKey] = function () {
        try { delete globalThis[stashKey]; } catch { globalThis[stashKey] = null; }
        const fn = (typeof retryFn === 'function')
          ? retryFn
          : (typeof retryFn === 'string'
              ? () => { try { new Function(retryFn)(); } catch (e) { console.error('Auth retry failed:', e); } }
              : null);
        if (typeof globalThis.openAdminReauth === 'function') globalThis.openAdminReauth(fn);
        else if (typeof globalThis.openAiOpsReauth === 'function') globalThis.openAiOpsReauth(fn);
      };
      const msg = (err && err.message) ? err.message : (typeof err === 'string' ? err : 'Your admin session is no longer valid.');
      tbody.innerHTML = `<tr><td colspan="${colspan}" style="padding:18px 16px;background:rgba(245,158,11,0.06);border-left:3px solid var(--accent-gold);">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div style="flex:1;min-width:240px;">
            <div style="font-weight:600;color:var(--accent-gold);margin-bottom:4px;">⚠ Your admin session expired</div>
            <div style="font-size:0.85rem;color:var(--text-secondary);">${escapeHtml(msg)}</div>
          </div>
          <button class="btn btn-sm btn-primary" onclick="globalThis['${stashKey}']()">Sign in again</button>
        </div>
      </td></tr>`;
    }
    globalThis.renderAdminAuthErrorRow = renderAdminAuthErrorRow;

    // Task #355 — same "Sign in again" prompt as the table-row variant but
    // rendered into an arbitrary container element (e.g. a card body, a
    // summary div) so non-table loaders share the exact same UI and copy.
    function renderAdminAuthErrorInto(el, err, retryFn) {
      if (!el) return;
      const stashKey = '_adminAuthRetry_' + Math.random().toString(36).slice(2, 10);
      globalThis[stashKey] = function () {
        try { delete globalThis[stashKey]; } catch { globalThis[stashKey] = null; }
        const fn = (typeof retryFn === 'function')
          ? retryFn
          : (typeof retryFn === 'string'
              ? () => { try { new Function(retryFn)(); } catch (e) { console.error('Auth retry failed:', e); } }
              : null);
        if (typeof globalThis.openAdminReauth === 'function') globalThis.openAdminReauth(fn);
        else if (typeof globalThis.openAiOpsReauth === 'function') globalThis.openAiOpsReauth(fn);
      };
      const msg = (err && err.message) ? err.message : (typeof err === 'string' ? err : 'Your admin session is no longer valid.');
      el.innerHTML = `<div style="padding:18px 16px;background:rgba(245,158,11,0.06);border-left:3px solid var(--accent-gold);display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div style="flex:1;min-width:240px;">
          <div style="font-weight:600;color:var(--accent-gold);margin-bottom:4px;">⚠ Your admin session expired</div>
          <div style="font-size:0.85rem;color:var(--text-secondary);">${escapeHtml(msg)}</div>
        </div>
        <button class="btn btn-sm btn-primary" onclick="globalThis['${stashKey}']()">Sign in again</button>
      </div>`;
    }
    globalThis.renderAdminAuthErrorInto = renderAdminAuthErrorInto;

    // Task #355 — helper that lets non-table loaders decide auth vs non-auth
    // without each one duplicating the `err.code === ...` boilerplate.
    function isAdminAuthError(err) {
      return !!(err && (err.code === 'NO_ADMIN_AUTH' || err.code === 'ADMIN_AUTH_REJECTED'));
    }
    globalThis.isAdminAuthError = isAdminAuthError;

    function renderTableLoadErrorRow(tbodyId, colspan, key, retryFn) {
      const tbody = document.getElementById(tbodyId);
      if (!tbody) return;
      const msg = loadErrors[key] || 'Unknown error';
      const code = loadErrorCodes[key];
      if (code === 'NO_ADMIN_AUTH' || code === 'ADMIN_AUTH_REJECTED') {
        renderAdminAuthErrorRow(tbody, colspan, { message: msg, code }, retryFn);
        return;
      }
      tbody.innerHTML = `<tr><td colspan="${colspan}" style="padding:18px 16px;background:rgba(220,53,69,0.06);border-left:3px solid #dc3545;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div style="flex:1;min-width:240px;">
            <div style="font-weight:600;color:#dc3545;margin-bottom:4px;">Couldn't load ${escapeHtml(key)} — ${escapeHtml(msg)}</div>
            <div style="font-size:0.82rem;color:var(--text-muted);">The list below is empty because the request failed, not because there are no records. Click Retry once you've checked your session / network.</div>
          </div>
          <button class="btn btn-sm" onclick="${escapeHtml(retryFn)}" style="background:var(--accent-blue);color:#fff;">Retry</button>
        </div>
      </td></tr>`;
    }

    // Task #281 — "Look up a user" verdict tool on the Active Providers
    // panel. Answers the recurring question "is so-and-so on the platform?"
    // by matching either profiles or provider_applications and emitting a
    // single explicit verdict (no profile / wrong role / suspended /
    // active / pending application status).
    async function lookupUserOnProvidersPage() {
      const input = document.getElementById('user-lookup-input');
      const out = document.getElementById('user-lookup-result');
      if (!input || !out) return;
      const raw = (input.value || '').trim();
      if (!raw) {
        out.innerHTML = `<div style="padding:10px 12px;border-radius:6px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);color:var(--accent-orange);font-size:0.85rem;">Enter a name or email to search.</div>`;
        return;
      }
      out.innerHTML = `<div style="padding:10px 12px;color:var(--text-muted);font-size:0.85rem;">Searching for "${escapeHtml(raw)}"…</div>`;

      const term = raw.toLowerCase();
      const like = '%' + raw.replace(/[%_]/g, m => '\\' + m) + '%';
      // Per code review (Task #281) — when the input looks like an email,
      // run a deterministic case-insensitive exact match first so we don't
      // depend on in-memory tie-breaking against ILIKE noise.
      const looksLikeEmail = /@/.test(raw);
      try {
        const profilesQuery = looksLikeEmail
          ? supabaseClient
              .from('profiles')
              .select('id, full_name, email, role, suspension_reason, suspended_at, created_at, updated_at')
              .or(`email.ilike.${raw.replace(/[%_]/g, m => '\\' + m)},full_name.ilike.${like}`)
              .limit(10)
          : supabaseClient
              .from('profiles')
              .select('id, full_name, email, role, suspension_reason, suspended_at, created_at, updated_at')
              .or(`email.ilike.${like},full_name.ilike.${like}`)
              .limit(10);
        const appsQuery = looksLikeEmail
          ? supabaseClient
              .from('provider_applications')
              .select('id, business_name, contact_name, email, status, created_at, updated_at')
              .or(`email.ilike.${raw.replace(/[%_]/g, m => '\\' + m)},contact_name.ilike.${like},business_name.ilike.${like}`)
              .limit(10)
          : supabaseClient
              .from('provider_applications')
              .select('id, business_name, contact_name, email, status, created_at, updated_at')
              .or(`email.ilike.${like},contact_name.ilike.${like},business_name.ilike.${like}`)
              .limit(10);
        const [profilesRes, appsRes] = await Promise.all([profilesQuery, appsQuery]);

        // Treat any single-source failure as degraded — don't emit a definitive
        // "no profile found" verdict from partial data. Per code review (Task #281).
        if (profilesRes.error || appsRes.error) {
          const failedSources = [];
          if (profilesRes.error) failedSources.push(`profiles: ${profilesRes.error.message || 'query error'}`);
          if (appsRes.error) failedSources.push(`applications: ${appsRes.error.message || 'query error'}`);
          out.innerHTML = `<div style="padding:12px 14px;border-radius:6px;background:rgba(220,53,69,0.08);border:1px solid rgba(220,53,69,0.3);color:#dc3545;font-size:0.9rem;">
            <div style="font-weight:600;margin-bottom:4px;">Lookup failed — can't return a verdict</div>
            <div style="font-size:0.82rem;color:var(--text-secondary);">One or more queries errored, so a "no profile found" answer would be unreliable. Click Look up again to retry.</div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">${escapeHtml(failedSources.join(' · '))}</div>
          </div>`;
          return;
        }

        const profileRows = profilesRes.data || [];
        const appRows = appsRes.data || [];

        // Prefer an exact email match on the profile when present.
        const exactProfile = profileRows.find(p => (p.email || '').toLowerCase() === term);
        const profile = exactProfile || profileRows[0] || null;
        const exactApp = appRows.find(a => (a.email || '').toLowerCase() === term);
        const app = exactApp || appRows[0] || null;

        if (!profile && !app) {
          out.innerHTML = `<div style="padding:12px 14px;border-radius:6px;background:rgba(100,100,120,0.08);border:1px solid var(--border-subtle);font-size:0.9rem;">
            <div style="font-weight:600;margin-bottom:4px;">No profile found</div>
            <div style="font-size:0.82rem;color:var(--text-muted);">No profile or provider application matches "${escapeHtml(raw)}". Double-check the spelling, or try the email they signed up with.</div>
          </div>`;
          return;
        }

        // Verdict computation
        let verdict, badgeBg, badgeBorder, badgeColor, detail = '';
        if (profile) {
          const role = profile.role || '(none)';
          const isSuspended = !!profile.suspension_reason;
          if (isSuspended) {
            verdict = `Suspended ${role === 'provider' || role === 'pending_provider' ? 'provider' : role}`;
            badgeBg = 'rgba(239,95,95,0.12)'; badgeBorder = 'rgba(239,95,95,0.35)'; badgeColor = 'var(--accent-red)';
            detail = `Reason: ${escapeHtml(profile.suspension_reason)}${profile.suspended_at ? ` (since ${new Date(profile.suspended_at).toLocaleDateString()})` : ''}. Suspended providers are hidden from the default "All Status" view above — switch the status filter to <strong>Suspended</strong> to see them in the table.`;
          } else if (role === 'provider') {
            verdict = 'Active provider';
            badgeBg = 'rgba(74,200,140,0.12)'; badgeBorder = 'rgba(74,200,140,0.3)'; badgeColor = 'var(--accent-green)';
            const lastUpdated = profile.updated_at ? new Date(profile.updated_at).toLocaleString() : (profile.created_at ? new Date(profile.created_at).toLocaleString() : '—');
            detail = `This profile has the provider role and is not suspended — should appear in the Active Providers list. <span style="color:var(--text-muted);">Last updated ${escapeHtml(lastUpdated)}.</span>`;
          } else if (role === 'pending_provider') {
            verdict = 'Pending provider (application in review)';
            badgeBg = 'rgba(245,158,11,0.12)'; badgeBorder = 'rgba(245,158,11,0.3)'; badgeColor = 'var(--accent-orange)';
            detail = `Profile role is pending_provider — they won't show up in Active Providers until their application is approved.`;
          } else {
            verdict = `Wrong role: ${role}`;
            badgeBg = 'rgba(245,158,11,0.12)'; badgeBorder = 'rgba(245,158,11,0.3)'; badgeColor = 'var(--accent-orange)';
            detail = `This person is registered, but as a ${escapeHtml(role)} — not a provider. They will not appear in the Active Providers list.`;
          }
        } else {
          // No profile but an application exists.
          verdict = `No profile yet — application status: ${app.status || 'unknown'}`;
          badgeBg = 'rgba(56,189,248,0.10)'; badgeBorder = 'rgba(56,189,248,0.3)'; badgeColor = 'var(--accent-blue)';
          detail = `A provider application exists for this email/name but no signed-in profile yet. They need to create an account to be activated.`;
        }

        const profileBlock = profile ? `
          <div style="margin-top:10px;padding:10px 12px;border-radius:6px;background:rgba(255,255,255,0.02);border:1px solid var(--border-subtle);">
            <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:4px;">PROFILE</div>
            <div><strong>${escapeHtml(profile.full_name || '(no name)')}</strong> · ${escapeHtml(profile.email || '(no email)')}</div>
            <div style="font-size:0.82rem;color:var(--text-muted);margin-top:2px;">role: <code>${escapeHtml(profile.role || '(none)')}</code> · id: <code>${escapeHtml(profile.id)}</code> · created ${profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}${profile.updated_at ? ` · updated ${new Date(profile.updated_at).toLocaleString()}` : ''}</div>
          </div>` : '';

        const appBlock = app ? `
          <div style="margin-top:10px;padding:10px 12px;border-radius:6px;background:rgba(255,255,255,0.02);border:1px solid var(--border-subtle);">
            <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:4px;">PROVIDER APPLICATION</div>
            <div><strong>${escapeHtml(app.business_name || app.contact_name || '(no name)')}</strong> · ${escapeHtml(app.email || '(no email)')}</div>
            <div style="font-size:0.82rem;color:var(--text-muted);margin-top:2px;">status: <code>${escapeHtml(app.status || 'unknown')}</code> · submitted ${app.created_at ? new Date(app.created_at).toLocaleDateString() : '—'}${app.updated_at ? ` · updated ${new Date(app.updated_at).toLocaleDateString()}` : ''}</div>
          </div>` : '';

        const moreMatches = (profileRows.length + appRows.length) > ((profile ? 1 : 0) + (app ? 1 : 0)) ?
          `<div style="margin-top:8px;font-size:0.78rem;color:var(--text-muted);">Showing best match. ${profileRows.length} profile / ${appRows.length} application result(s) total — refine your search if this isn't the right person.</div>` : '';

        out.innerHTML = `
          <div style="padding:12px 14px;border-radius:6px;background:${badgeBg};border:1px solid ${badgeBorder};">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <div style="font-weight:700;color:${badgeColor};font-size:0.95rem;">${escapeHtml(verdict)}</div>
            </div>
            <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:6px;">${detail}</div>
            ${profileBlock}
            ${appBlock}
            ${moreMatches}
          </div>`;
      } catch (err) {
        console.error('lookupUserOnProvidersPage failed:', err);
        out.innerHTML = `<div style="padding:12px 14px;border-radius:6px;background:rgba(220,53,69,0.08);border:1px solid rgba(220,53,69,0.3);color:#dc3545;font-size:0.9rem;">
          <div style="font-weight:600;margin-bottom:4px;">Lookup failed</div>
          <div style="font-size:0.82rem;">${escapeHtml(err.message || String(err))}</div>
        </div>`;
      }
    }
    globalThis.lookupUserOnProvidersPage = lookupUserOnProvidersPage;

    let registrationVerifications = [];
    let currentApplication = null;
    let currentDispute = null;
    let currentTicket = null;
    let currentVerification = null;
    let currentFilters = {
      applications: 'pending',
      // Task #248 — lead-source filter for the applications queue. 'all'
      // means "no source filter applied"; otherwise it matches a value from
      // outreach_leads.source (e.g. 'hunter', 'apollo', 'manual') or the
      // pseudo-source 'direct' for applications that were never linked to an
      // outreach lead (no outreach_lead_id).
      applicationsSource: 'all',
      payments: 'held',
      disputes: 'open',
      tickets: 'open',
      registrations: 'all'
    };

    // Task #248 — hydrate application status + source filters from the URL on
    // first script load so a shared link like
    //   /admin.html?app_status=approved&app_source=hunter
    // lands the reviewer in the right slice. Runs before any tab/render call
    // so the initial paint already reflects the filter.
    try {
      const __initialParams = new URLSearchParams(globalThis.location.search);
      const __qsStatus = __initialParams.get('app_status');
      const __qsSource = __initialParams.get('app_source');
      if (__qsStatus && ['pending', 'under_review', 'approved', 'rejected', 'all'].includes(__qsStatus)) {
        currentFilters.applications = __qsStatus;
      }
      if (__qsSource) currentFilters.applicationsSource = __qsSource;
    } catch { /* Intentionally silent — URL parse errors must not break admin boot. */ }

    // ========== PAGINATION STATE ==========
    const paginationState = {
      providers: { page: 1, limit: 25, total: 0, totalPages: 0, search: '', filter: 'all' },
      members: { page: 1, limit: 25, total: 0, totalPages: 0, search: '', filter: 'all' },
      packages: { page: 1, limit: 25, total: 0, totalPages: 0, search: '', filter: 'all' },
      agreements: { page: 1, limit: 25, total: 0, totalPages: 0, search: '', filter: 'all' },
      refunds: { page: 1, limit: 25, total: 0, totalPages: 0, filter: 'all' },
      payments: { page: 1, limit: 25, total: 0, totalPages: 0 },
      transport: { page: 1, limit: 25, total: 0, totalPages: 0 },
      applications: { page: 1, limit: 25, total: 0, totalPages: 0 },
    };
    
    // ========== NAV GROUP COLLAPSE STATE ==========
    // `revenue` defaults to collapsed: SaaS Subscriptions is gated behind
    // feature_disabled 403 for most accounts and White-label Tenants is
    // pre-launch — no need to eat sidebar real-estate at page load. Users
    // click the caret to expand. Reversible in one edit.
    const navGroupCollapsed = {
      overview: false, 'provider-management': false, 'founder-management': false,
      operations: false, support: false, commerce: false, crm: false,
      resources: false, 'ai-operations': false, revenue: true, system: false,
    };

    // Apply the initial collapsed state to the DOM on load. `toggleNavGroup`
    // only handles user-driven state changes — without this, groups that
    // default to `true` above would still render expanded on first paint.
    document.addEventListener('DOMContentLoaded', () => {
      Object.keys(navGroupCollapsed).forEach((group) => {
        if (!navGroupCollapsed[group]) return;
        const items = document.querySelector(`.nav-group-items[data-group="${group}"]`);
        if (items) items.classList.add('collapsed');
        const caret = document.querySelector(`.nav-label[data-group="${group}"] .nav-group-caret`);
        if (caret) caret.style.transform = 'rotate(-90deg)';
      });
    });

    globalThis.toggleNavGroup = function(group) {
      navGroupCollapsed[group] = !navGroupCollapsed[group];
      const items = document.querySelector(`.nav-group-items[data-group="${group}"]`);
      if (items) items.classList.toggle('collapsed', navGroupCollapsed[group]);
      const caret = document.querySelector(`.nav-label[data-group="${group}"] .nav-group-caret`);
      if (caret) caret.style.transform = navGroupCollapsed[group] ? 'rotate(-90deg)' : '';
    };

    // ========== SORT STATE ==========
    const sortState = {
      applications: { col: null, dir: 'asc' },
      transport:    { col: null, dir: 'asc' },
      providers:    { col: null, dir: 'asc' },
      payments:     { col: null, dir: 'asc' },
      members:      { col: null, dir: 'asc' },
    };

    function applySortToRows(rows, state, accessor) {
      if (!state.col) return rows;
      const dir = state.dir === 'asc' ? 1 : -1;
      return [...rows].sort((a, b) => {
        const av = accessor(a, state.col);
        const bv = accessor(b, state.col);
        if (av == null && bv == null) return 0;
        if (av == null) return 1 * dir;
        if (bv == null) return -1 * dir;
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av).toLowerCase().localeCompare(String(bv).toLowerCase()) * dir;
      });
    }

    function updateSortIndicators(tbodyId, state) {
      const tbody = document.getElementById(tbodyId);
      if (!tbody) return;
      const thead = tbody.closest('table')?.querySelector('thead');
      if (!thead) return;
      thead.querySelectorAll('th[data-sort]').forEach(th => {
        const caret = th.querySelector('.sort-caret');
        if (!caret) return;
        if (th.dataset.sort === state.col) {
          caret.textContent = state.dir === 'asc' ? '▲' : '▼';
          caret.classList.add('active');
        } else {
          caret.textContent = '⇅';
          caret.classList.remove('active');
        }
      });
    }

    globalThis.toggleSort = function(tableId, col) {
      const state = sortState[tableId];
      if (!state) return;
      if (state.col === col) {
        state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      } else {
        state.col = col;
        state.dir = 'asc';
      }
      if (paginationState[tableId]) paginationState[tableId].page = 1;
      ({ applications: renderApplications, transport: renderTransportRides,
         providers: renderProviders, payments: renderPayments, members: renderMembers })[tableId]?.();
    };

    function applyClientPagination(rows, state) {
      state.total = rows.length;
      state.totalPages = Math.max(1, Math.ceil(rows.length / state.limit));
      if (state.page > state.totalPages) state.page = state.totalPages;
      const start = (state.page - 1) * state.limit;
      return rows.slice(start, start + state.limit);
    }

    globalThis.changeApplicationsPage = function(delta) {
      paginationState.applications.page = Math.max(1, paginationState.applications.page + delta);
      renderApplications();
    };
    globalThis.changeApplicationsPageSize = function(size) {
      paginationState.applications.limit = Number(size);
      paginationState.applications.page = 1;
      renderApplications();
    };
    globalThis.changePaymentsPage = function(delta) {
      selectedPaymentIds.clear();
      paginationState.payments.page = Math.max(1, paginationState.payments.page + delta);
      renderPayments();
    };
    globalThis.changePaymentsPageSize = function(size) {
      selectedPaymentIds.clear();
      paginationState.payments.limit = Number(size);
      paginationState.payments.page = 1;
      renderPayments();
    };
    globalThis.changeTransportPage = function(delta) {
      paginationState.transport.page = Math.max(1, paginationState.transport.page + delta);
      renderTransportRides();
    };
    globalThis.changeTransportPageSize = function(size) {
      paginationState.transport.limit = Number(size);
      paginationState.transport.page = 1;
      renderTransportRides();
    };

    // Debounce helper for search functions
    let searchDebounceTimers = {};
    function debounceSearch(key, fn, delay = 300) {
      if (searchDebounceTimers[key]) {
        clearTimeout(searchDebounceTimers[key]);
      }
      searchDebounceTimers[key] = setTimeout(fn, delay);
    }
    
    function renderPaginationControls(state, changePageFn, changePageSizeFn = null) {
      const start = state.total === 0 ? 0 : (state.page - 1) * state.limit + 1;
      const end = Math.min(state.page * state.limit, state.total);
      const pageSizeHtml = changePageSizeFn
        ? `<select onchange="${changePageSizeFn}(this.value)" style="padding:4px 8px;border-radius:6px;border:1px solid var(--border-subtle);background:var(--bg-card);color:var(--text-primary);font-size:0.85rem;">
            ${[25,50,100].map(n => `<option value="${n}" ${state.limit === n ? 'selected' : ''}>${n} / page</option>`).join('')}
           </select>`
        : '';

      return `
        <div class="pagination-controls" style="display:flex;justify-content:space-between;align-items:center;padding:16px 0;border-top:1px solid var(--border-subtle);margin-top:16px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="color:var(--text-secondary);font-size:0.9rem;">Showing ${start}–${end} of ${state.total}</span>
            ${pageSizeHtml}
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <button class="btn btn-secondary btn-sm" onclick="${changePageFn}(-1)" ${state.page <= 1 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
              ← Previous
            </button>
            <span style="color:var(--text-primary);font-size:0.9rem;font-weight:500;">
              Page ${state.page} of ${state.totalPages || 1}
            </span>
            <button class="btn btn-secondary btn-sm" onclick="${changePageFn}(1)" ${state.page >= state.totalPages ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
              Next →
            </button>
          </div>
        </div>
      `;
    }

    // ========== LAZY LOADING STATE ==========
    const loadedSections = {
      dashboard: false,
      analytics: false,
      applications: false,
      providers: false,
      violations: false,
      'car-reviews': false,
      'pilot-applications': false,
      'member-founders': false,
      'commission-payouts': false,
      packages: false,
      payments: false,
      disputes: false,
      refunds: false,
      'registration-verifications': false,
      tickets: false,
      members: false,
      'user-roles': false,
      'user-management': false,
      'merch-manager': false,
      agreements: false,
      settings: false,
      'ai-chat-insights': false,
      crm: false,
      traffic: false,
      'marketing-outreach': false,
      'ai-ops': false,
      'agent-fleet': false,
      'saas-subscriptions': false,
      'white-label': false,
      'survey-analytics': false,
      'member-surveys': false
    };

    const sectionLoaders = {
      dashboard: async () => { await loadDashboardCharts(); },
      analytics: async () => { await loadAnalytics(); },
      applications: async () => { await loadApplications(); },
      providers: async () => { await loadProviders(); },
      violations: async () => { await loadViolationReports(); },
      'car-reviews': async () => { await loadPendingCARs(); },
      'pilot-applications': async () => { await loadPilotApplications(); },
      'driver-applications': async () => { await loadDriverApplications(); },
      'active-drivers': async () => { await loadActiveDrivers(); },
      'transport': async () => { await loadTransportRides(); },
      'member-founders': async () => { await loadMemberFounderApplications(); },
      'commission-payouts': async () => { await loadFounderPayouts(); },
      packages: async () => { await loadAllPackages(); },
      payments: async () => { await loadPayments(); },
      'driver-payouts': async () => { await loadDriverPayouts(); },
      disputes: async () => { await loadDisputes(); },
      refunds: async () => { await loadRefunds(); },
      'registration-verifications': async () => { await loadRegistrationVerifications(); },
      'bgc-dashboard': async () => { await loadBgcDashboard(); },
      tickets: async () => { await loadTickets(); },
      members: async () => { await loadMembers(); },
      'user-roles': async () => { await loadUserRoles(); },
      'user-management': async () => { await loadUserManagement(); },
      'merch-manager': async () => { await loadDesignLibrary(); await loadMerchPreferences(); },
      agreements: async () => { await loadAgreements(); },
      settings: async () => { await load2faGlobalStatus(); },
      'ai-chat-insights': async () => { await loadChatInsights(); },
      crm: async () => { await loadCrmData(); },
      'team-management': async () => { await loadTeamMembers(); },
      traffic: async () => { await loadTrafficData(); },
      'marketing-outreach': async () => { await initMarketingHub(); if (typeof globalThis.initOutreachEngine === 'function') await globalThis.initOutreachEngine(); },
      'ai-ops': async () => { await initAiOps(); },
      'agent-fleet': async () => { await loadAgentFleetSection(); },
      'sms-log': async () => { await loadSmsLog(1); },
      'audit-log': async () => { if (typeof globalThis.loadAdminAuditLog === 'function') await globalThis.loadAdminAuditLog(); },
      'saas-subscriptions': async () => { await loadSaasSubscriptions(); },
      'white-label': async () => { await loadWhiteLabelTenants(); },
      'api-usage': async () => { await loadApiUsage(); },
      'survey-analytics': async () => { await loadSurveyAnalytics(); },
      'member-surveys': async () => { await loadMemberSurveyAnalytics(); },
      'car-clubs': async () => { await loadCarClubs(); },
      referrals: async () => { await loadReferralDashboard(); },
      'feature-flags': async () => { await loadFeatureFlags(); }
    };

    function showSectionLoading(sectionId) {
      const section = document.getElementById(sectionId);
      if (!section) return;
      let loader = section.querySelector('.section-loader');
      if (!loader) {
        loader = document.createElement('div');
        loader.className = 'section-loader';
        loader.innerHTML = `
          <div class="loading-state">
            <div class="loading-spinner"></div>
            Loading...
          </div>
        `;
        section.insertBefore(loader, section.firstChild);
      }
      loader.style.display = 'block';
    }

    function hideSectionLoading(sectionId) {
      const section = document.getElementById(sectionId);
      if (!section) return;
      const loader = section.querySelector('.section-loader');
      if (loader) loader.style.display = 'none';
    }

    async function loadSectionIfNeeded(sectionId) {
      if (loadedSections[sectionId]) return;
      const loader = sectionLoaders[sectionId];
      if (!loader) return;
      
      showSectionLoading(sectionId);
      try {
        await loader();
        loadedSections[sectionId] = true;
      } catch (err) {
        console.error(`Error loading section ${sectionId}:`, err);
      } finally {
        hideSectionLoading(sectionId);
      }
    }

    // ========== INIT ==========
    let adminPasswordVerified = false;
    let adminTeamToken = null;
    let adminTeamUser = null;
    let adminPermissions = null;
    let _adminBearer = null;
    // 2026-09-04h — a single sign-in can trigger BOTH the calling code's own
    // continuation (performAdminLogin, or the page-load session check) AND
    // the separately-registered onAuthStateChange('SIGNED_IN') listener,
    // since supabaseClient.auth.signInWithPassword()/getSession() both fire
    // that listener too. Nothing stopped completeAdminAuth() /
    // completeTeamLoginFrom() from both running for the same login — each
    // full run re-fetches dashboard data, re-renders charts, and
    // re-registers every click listener in setupEventListeners(), so two
    // overlapping runs looks exactly like the page "jumping" a viewer
    // reported after logging in: duplicate chart re-renders and doubled
    // nav-click handlers (each click firing showSection() + scrollTo()
    // twice) fighting each other. This is an in-flight lock, not a
    // "run once ever" flag — completeAdminAuth() is legitimately called
    // again much later by the 401 reauth-retry flow (openAiOpsReauth /
    // _aiOpsReauthRetry, further down this file), which must still work.
    let _authCompletionInFlight = false;
    let currentModalState = 'loading'; // 'loading', 'login', 'password', 'not-admin', 'team-login'
    
    function showModalState(state) {
      currentModalState = state;
      const loginForm = document.getElementById('admin-login-form');
      const passwordForm = document.getElementById('admin-password-form');
      const teamLoginForm = document.getElementById('admin-team-login-form');
      const notAdminError = document.getElementById('admin-not-admin-error');
      const modalBtn = document.getElementById('admin-modal-btn');
      const modalTitle = document.getElementById('admin-modal-title');
      
      loginForm.style.display = 'none';
      passwordForm.style.display = 'none';
      if (teamLoginForm) teamLoginForm.style.display = 'none';
      notAdminError.style.display = 'none';
      
      if (state === 'login') {
        modalTitle.innerHTML = mccIcon('lock', 16) + ' Admin Sign In';
        loginForm.style.display = 'block';
        modalBtn.textContent = 'Sign In';
        modalBtn.style.display = 'block';
        document.getElementById('admin-login-email').focus();
      } else if (state === 'password') {
        modalTitle.innerHTML = mccIcon('lock', 16) + ' Admin Access';
        passwordForm.style.display = 'block';
        modalBtn.textContent = 'Verify';
        modalBtn.disabled = false;
        modalBtn.style.display = 'block';
        // Task #233 — clear any leftover error from a previous attempt so
        // re-opening the modal via "Sign in again" starts clean.
        const pwErr = document.getElementById('admin-password-error');
        if (pwErr) { pwErr.style.display = 'none'; pwErr.textContent = ''; }
        document.getElementById('admin-password-input').focus();
      } else if (state === 'team-login') {
        modalTitle.innerHTML = mccIcon('users', 16) + ' Team Login';
        if (teamLoginForm) teamLoginForm.style.display = 'block';
        modalBtn.textContent = 'Sign In';
        modalBtn.style.display = 'block';
        document.getElementById('team-login-email')?.focus();
      } else if (state === 'not-admin') {
        modalTitle.innerHTML = mccIcon('alert-triangle', 16) + ' Access Denied';
        notAdminError.style.display = 'block';
        modalBtn.textContent = 'Sign Out & Try Again';
        modalBtn.style.display = 'block';
      }
    }
    
    async function handleAdminModalAction() {
      if (currentModalState === 'loading') {
        var pwForm = document.getElementById('admin-password-form');
        var loginForm = document.getElementById('admin-login-form');
        var teamForm = document.getElementById('admin-team-login-form');
        if (teamForm && teamForm.style.display !== 'none') {
          currentModalState = 'team-login';
          await performTeamLogin();
        } else if (pwForm && pwForm.style.display !== 'none') {
          currentModalState = 'password';
          await verifyAdminPassword();
        } else if (loginForm && loginForm.style.display !== 'none') {
          currentModalState = 'login';
          await performAdminLogin();
        } else {
          showModalState('login');
        }
        return;
      }
      if (currentModalState === 'login') {
        await performAdminLogin();
      } else if (currentModalState === 'password') {
        await verifyAdminPassword();
      } else if (currentModalState === 'team-login') {
        await performTeamLogin();
      } else if (currentModalState === 'not-admin') {
        await supabaseClient.auth.signOut();
        showModalState('login');
      }
    }
    
    async function performAdminLogin() {
      const email = document.getElementById('admin-login-email').value.trim();
      const password = document.getElementById('admin-login-password').value;
      const errorEl = document.getElementById('admin-login-error');
      const btn = document.getElementById('admin-modal-btn');
      
      if (!email || !password) {
        errorEl.textContent = 'Please enter email and password.';
        errorEl.style.display = 'block';
        return;
      }
      
      btn.textContent = 'Signing in...';
      btn.disabled = true;
      errorEl.style.display = 'none';
      
      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        
        if (error) {
          errorEl.textContent = error.message;
          errorEl.style.display = 'block';
          btn.textContent = 'Sign In';
          btn.disabled = false;
          return;
        }
        
        if (data.user) {
          currentUser = data.user;
          // Check if admin
          const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', currentUser.id).single();

          if (!profile || profile.role !== 'admin') {
            // 2026-09-04f — not a super_admin, but this Sign In form just
            // verified real Supabase credentials, and a team member's
            // credentials are just as real (see admin-team-login.js). Try
            // resolving team membership before declaring Access Denied.
            const teamResult = await tryTeamLoginByPassword(email, password);
            if (teamResult.ok) {
              btn.disabled = false;
              await completeTeamLoginFrom(teamResult.data);
              return;
            }
            showModalState('not-admin');
            btn.disabled = false;
            return;
          }

          // Admin confirmed — complete auth directly (no password step needed)
          btn.disabled = false;
          await completeAdminAuth();
        }
      } catch (err) {
        errorEl.textContent = 'Login failed. Please try again.';
        errorEl.style.display = 'block';
        btn.textContent = 'Sign In';
        btn.disabled = false;
      }
    }
    
    // Listen for auth state changes
    try { supabaseClient.auth.onAuthStateChange(async (event, session) => {
      console.log('[Admin] Auth state changed:', event, { hasSession: !!session });

      if (session?.access_token) { _adminBearer = session.access_token; globalThis._adminBearer = session.access_token; }

      if (event === 'SIGNED_IN' && session?.user && currentModalState === 'login') {
        currentUser = session.user;
        globalThis._adminEmail = session.user.email || '';
        const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', currentUser.id).single();
        if (profile && profile.role === 'admin') {
          await completeAdminAuth();
        } else {
          // 2026-09-04f — see performAdminLogin: try team membership via
          // the session token we already have before declaring denial.
          const teamResult = session.access_token ? await tryTeamLoginByToken(session.access_token) : { ok: false };
          if (teamResult.ok) {
            await completeTeamLoginFrom(teamResult.data);
          } else {
            showModalState('not-admin');
          }
        }
      }
    });
    } catch(e) { console.error('[Admin] onAuthStateChange setup error:', e); }
    
    // ========== 2FA ACCESS CHECK ==========
    async function checkAccessAuthorization() {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        window.location.href = 'login.html';
        return false;
      }
      
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/auth/check-access`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!response.ok) {
          window.location.href = 'login.html';
          return false;
        }
        const result = await response.json();
        if (!result.authorized && result.reason === '2fa_required') {
          window.location.href = 'login.html?2fa=required&returnTo=' + encodeURIComponent(window.location.pathname);
          return false;
        }
        return result.authorized === true;
      } catch (error) {
        console.error('Access check error:', error);
        window.location.href = 'login.html';
        return false;
      }
    }

    window.addEventListener('load', async () => {
      console.log('[Admin] Page loaded, checking auth...');
      
      // Set up enter key handlers
      document.getElementById('admin-login-email').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('admin-login-password').focus();
      });
      document.getElementById('admin-login-password').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAdminModalAction();
      });
      document.getElementById('admin-password-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAdminModalAction();
      });
      const teamEmailEl = document.getElementById('team-login-email');
      if (teamEmailEl) {
        teamEmailEl.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') document.getElementById('team-login-password')?.focus();
        });
        document.getElementById('team-login-password')?.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') handleAdminModalAction();
        });
      }
      
      try {
        // Check for existing session
        const { data: { session } } = await supabaseClient.auth.getSession();
        console.log('[Admin] getSession result:', { hasSession: !!session, hasUser: !!session?.user });
        
        if (session?.user) {
          currentUser = session.user;
          globalThis._adminEmail = session.user.email || '';
          if (session.access_token) { _adminBearer = session.access_token; globalThis._adminBearer = session.access_token; }

          // Check 2FA authorization before checking admin role
          const authorized = await checkAccessAuthorization();
          if (!authorized) return;
          
          // Check if admin
          const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', currentUser.id).single();
          console.log('[Admin] Profile:', profile);
          
          if (profile && profile.role === 'admin') {
            await completeAdminAuth();
          } else {
            // 2026-09-04f — see performAdminLogin: try team membership via
            // the session token we already have before declaring denial.
            // Covers, e.g., a team member reloading the page after a
            // successful sign-in — this same check used to re-fail every
            // time since it only ever recognized profiles.role === 'admin'.
            const teamResult = session.access_token ? await tryTeamLoginByToken(session.access_token) : { ok: false };
            if (teamResult.ok) {
              await completeTeamLoginFrom(teamResult.data);
            } else {
              showModalState('not-admin');
            }
          }
        } else {
          // No session - show login form (NO REDIRECT!)
          console.log('[Admin] No session, showing login form');
          showModalState('login');
        }
      } catch (err) {
        console.error('[Admin] Init error, falling back to login:', err);
        showModalState('login');
      }
    });
    
    // Thin alias kept so handleAdminModalAction and any external callers continue
    // to work without changes. All logic lives in completeAdminAuth().
    async function verifyAdminPassword() {
      return completeAdminAuth();
    }

    async function completeAdminAuth() {
      if (_authCompletionInFlight) return;
      _authCompletionInFlight = true;
      try {
        try {
          const { data: { session } } = await supabaseClient.auth.getSession();
          if (session?.access_token) {
            _adminBearer = session.access_token;
            globalThis._adminBearer = session.access_token;
          }
        } catch { /* non-fatal */ }
        adminPasswordVerified = false;
        adminPermissions = null;
        document.getElementById('admin-password-modal').style.display = 'none';
        applyRolePermissions(null);
        if (typeof _aiOpsReauthRetry === 'function') {
          const fn = _aiOpsReauthRetry;
          _aiOpsReauthRetry = null;
          try { await fn(); } catch (retryErr) { console.error('[Admin] reauth retry failed:', retryErr); }
        } else {
          await loadAllData();
          setupEventListeners();
        }
      } finally {
        _authCompletionInFlight = false;
      }
    }

    globalThis.handleAdminModalAction = handleAdminModalAction;
    globalThis.verifyAdminPassword = verifyAdminPassword;
    globalThis.completeAdminAuth = completeAdminAuth;

    (function bindAdminButtons() {
      function attach() {
        var btn = document.getElementById('admin-modal-btn');
        var cancelBtn = document.getElementById('admin-cancel-btn');
        if (btn) {
          btn.removeEventListener('click', handleAdminModalAction);
          btn.addEventListener('click', handleAdminModalAction);
        }
        if (cancelBtn) {
          cancelBtn.onclick = function() { window.location.href = 'index.html'; };
        }
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attach);
      } else {
        attach();
      }
    })();
    
    function showForgotAdminPassword(event) {
      event.preventDefault();
      const infoDiv = document.getElementById('admin-forgot-password-info');
      infoDiv.style.display = infoDiv.style.display === 'none' ? 'block' : 'none';
    }
    globalThis.showForgotAdminPassword = showForgotAdminPassword;

    async function loadAllData() {
      await Promise.all([
        loadDashboardStats(),
        loadDashboardCharts(),
        loadAnalytics()
      ]);
      loadedSections.dashboard = true;
      loadedSections.analytics = true;
      updateDashboard();
      // Task #139 — start agent-fleet badge polling once admin is verified,
      // and explicitly load the dashboard agent tile (also called from
      // loadDashboardCharts as a best-effort, but called here too so the
      // dependency on charts succeeding does not gate fleet visibility).
      if (typeof loadAgentFleetBadge === 'function') {
        loadAgentFleetBadge();
        if (!_agentFleetBadgeTimer) {
          _agentFleetBadgeTimer = setInterval(() => {
            try { loadAgentFleetBadge(); } catch { /* Intentionally silent */ }
          }, 60000);
        }
      }
      if (typeof loadDashboardAgentTile === 'function') {
        try { await loadDashboardAgentTile(); }
        catch (e) { console.warn('[admin] dashboard agent tile failed:', e); }
      }
      // Task #459 — show API key alert banner if any key is failing or expiring
      try { await loadDashboardApiKeyAlert(); } catch {}
      // Task #406 — if the admin landed here via a shared activity-card
      // deep link (?aap_src=...&aap_id=...[&aap_section=...|&aap_modal=...]),
      // route to the right section/modal now that loadAllData has populated
      // the in-memory caches viewApplication/viewDispute/viewTicket need.
      try {
        if (typeof globalThis.consumeAgentActivityDeepLink === 'function') {
          await globalThis.consumeAgentActivityDeepLink();
        }
      } catch (e) { console.warn('[admin] agent activity deep-link routing failed:', e); }
    }

    async function loadDashboardStats() {
      try {
        const [
          { count: appCount },
          { count: providerCount },
          { count: disputeCount },
          { count: ticketCount },
          { count: violationCount },
          { count: carCount },
          { count: pilotCount },
          { count: memberFounderCount },
          { count: payoutCount },
          { count: memberCount },
          { count: registrationCount },
          { count: driverAppsCount }
        ] = await Promise.all([
          supabaseClient.from('provider_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabaseClient.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'provider').eq('application_status', 'approved').is('suspended_at', null),
          supabaseClient.from('disputes').select('*', { count: 'exact', head: true }).eq('status', 'open'),
          Promise.resolve(supabaseClient.from('helpdesk_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open')).catch(() => ({ count: 0 })),
          Promise.resolve(supabaseClient.from('circumvention_reports').select('*', { count: 'exact', head: true }).eq('status', 'pending')).catch(() => ({ count: 0 })),
          Promise.resolve(supabaseClient.from('corrective_action_responses').select('*', { count: 'exact', head: true }).in('status', ['pending', 'under_review'])).catch(() => ({ count: 0 })),
          supabaseClient.from('pilot_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabaseClient.from('member_founder_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabaseClient.from('founder_payouts').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabaseClient.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'member').is('suspended_at', null),
          supabaseClient.from('registration_verifications').select('*', { count: 'exact', head: true }).in('status', ['pending', 'manual_review']),
          supabaseClient.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'pending_driver')
        ]);

        document.getElementById('app-count').textContent = appCount || 0;
        document.getElementById('dispute-count').textContent = disputeCount || 0;
        document.getElementById('ticket-count').textContent = ticketCount || 0;
        document.getElementById('violation-count').textContent = violationCount || 0;
        document.getElementById('car-count').textContent = carCount || 0;
        document.getElementById('pilot-count').textContent = pilotCount || 0;
        document.getElementById('member-founder-count').textContent = memberFounderCount || 0;
        document.getElementById('payout-count').textContent = payoutCount || 0;
        document.getElementById('registration-count').textContent = registrationCount || 0;
        const driverAppsEl = document.getElementById('dash-driver-apps');
        if (driverAppsEl) driverAppsEl.textContent = (driverAppsCount || 0).toLocaleString();

        const statApps = document.getElementById('stat-pending-apps');
        const statProviders = document.getElementById('stat-providers');
        const statDisputes = document.getElementById('stat-disputes');
        const statTickets = document.getElementById('stat-tickets');
        const statMembers = document.getElementById('stat-members');
        if (statApps) statApps.textContent = appCount || 0;
        if (statProviders) statProviders.textContent = providerCount || 0;
        if (statDisputes) statDisputes.textContent = disputeCount || 0;
        if (statTickets) statTickets.textContent = ticketCount || 0;
        if (statMembers) statMembers.textContent = memberCount || 0;
      } catch (err) {
        console.error('Dashboard stats error:', err);
      }
    }


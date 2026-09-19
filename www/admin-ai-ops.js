    // ========== AI OPS AGENT ==========

    let aiOpsCurrentTab = 'activity';
    let aiOpsActivityPage = 1;
    let aiOpsDigests = [];

    function getAiOpsHeaders() {
      const headers = {};
      if (_adminBearer) headers['Authorization'] = 'Bearer ' + _adminBearer;
      if (adminTeamToken && !headers['Authorization']) headers['Authorization'] = 'Bearer ' + adminTeamToken;
      return headers;
    }

    // Task #174 — diagnostic fetch wrapper for the AI Activity / Agent Fleet
    // admin loaders. The legacy code path showed a generic "Failed to fetch"
    // for any failure mode (network, 401, 5xx) which made production triage
    // impossible. This helper turns every failure into a human-readable error
    // that names:
    //   - the HTTP status code (or "network unreachable" when fetch() itself
    //     rejects, which is what produces the literal "Failed to fetch"
    //     TypeError)
    //   - the relative API path that failed
    //   - a short, plain-language reason ("not signed in", "server error",
    //     "network unreachable")
    // Used by loadAiOpsActivity / loadAiOpsEscalations / loadAiOpsDigests /
    // loadAiOpsSettings so future failures are obvious from the UI without
    // DevTools.
    async function aiOpsFetch(url, options) {
      const opts = options || {};
      const headers = opts.headers || {};
      // Detect missing admin auth headers up-front. Without this guard we
      // would call the function, get a 401, and surface "server said 401" —
      // but the actual user-actionable problem is that they need to sign in
      // again. Common production cause: the admin re-logged in on a different
      // subdomain, or their localStorage was cleared by a tab-restore.
      let hasAuth = false;
      for (const k of Object.keys(headers)) {
        const lk = k.toLowerCase();
        if (lk === 'authorization' && headers[k]) {
          hasAuth = true; break;
        }
      }
      // Compute a stable display path. Strip query strings only for the
      // primary label so the message stays short, but include the full
      // path+query as a parenthetical so admins can replay the exact call.
      let displayPath = url;
      let fullPath = url;
      try {
        const u = new URL(url, window.location.origin);
        displayPath = u.pathname;
        fullPath = u.pathname + (u.search || '');
      } catch { /* leave url as-is */ }
      if (!hasAuth) {
        const e = new Error(`Not signed in as admin — open the admin login page and sign in again, then retry. (${displayPath})`);
        e.code = 'NO_ADMIN_AUTH';
        throw e;
      }
      let res;
      try {
        res = await fetch(url, opts);
      } catch (netErr) {
        // fetch() rejects only on network/CORS-level failure. The browser's
        // TypeError message is usually the literal "Failed to fetch", which
        // tells the admin nothing. Replace it with something actionable.
        const e = new Error(`Network unreachable — could not reach ${displayPath} (browser said: ${netErr?.message ? netErr.message : 'fetch failed'}). Check your internet connection or whether the API endpoint is deployed.`);
        e.code = 'NETWORK_UNREACHABLE';
        e.path = fullPath;
        throw e;
      }
      if (!res.ok) {
        // Try to surface the JSON `error`/`message` field the function
        // returned (agent-fleet-admin / ai-ops-admin both use jsonResponse()
        // with { error: '...' }). If parsing fails (502 with no body), keep
        // the bare HTTP status.
        let serverMsg = '';
        try {
          const body = await res.clone().json();
          serverMsg = (body && (body.error || body.message)) || '';
        } catch { /* non-JSON body, leave blank */ }
        const tail = serverMsg ? ` — ${serverMsg}` : '';
        if (res.status === 401) {
          const e = new Error(`Not signed in as admin (HTTP ${res.status}) on ${displayPath}${tail}. Sign in again from the admin login page.`);
          e.code = 'ADMIN_AUTH_REJECTED';
          e.status = res.status;
          e.path = fullPath;
          throw e;
        }
        if (res.status === 403) {
          // Fixed 2026-09-18: 403 from an admin-*.js function is essentially
          // never "you're not signed in as admin" — every admin function in
          // this codebase signals that with 401 (`authenticateBearerAdmin` /
          // "Authentication required" / "Unauthorized"; grep-verified across
          // all netlify/functions/admin-*.js). 403 means the caller IS an
          // authenticated admin but this specific action is blocked for
          // another reason: a feature flag is off (admin-saas.js's
          // `feature_disabled`), a business rule (admin-founders.js's
          // contractually-locked commission rate), or a team-login-specific
          // state. Lumping this in with ADMIN_AUTH_REJECTED sent admins into
          // a "Sign in again" loop on pages that will never load no matter
          // how many times they re-authenticate (caught live on SaaS
          // Subscriptions: shop_saas_enabled is off, so /api/admin/saas/
          // subscriptions correctly 403s with 'feature_disabled', but the UI
          // claimed the session had expired). Surface the real reason
          // instead — renderAiOpsAuthError's non-auth branch already does
          // this correctly, it just never used to be reached for a 403.
          const e = new Error(`Request blocked (HTTP 403) on ${displayPath}${tail}.`);
          e.code = 'REQUEST_FORBIDDEN';
          e.status = res.status;
          e.path = fullPath;
          throw e;
        }
        if (res.status >= 500) {
          const e = new Error(`Server error – HTTP ${res.status} on ${displayPath}${tail}.`);
          e.code = 'SERVER_ERROR';
          e.status = res.status;
          e.path = fullPath;
          throw e;
        }
        const e = new Error(`Request failed – HTTP ${res.status} on ${displayPath}${tail}.`);
        e.code = 'REQUEST_FAILED';
        e.status = res.status;
        e.path = fullPath;
        throw e;
      }
      // Defensive: a 200 with non-JSON body still parses as JSON via res.json()
      // throwing — surface that distinctly so the admin knows the function
      // returned garbage rather than a true network failure.
      try {
        return await res.json();
      } catch (parseErr) {
        const e = new Error(`Server returned a non-JSON response (HTTP ${res.status}) on ${displayPath}. ${parseErr?.message ? parseErr.message : ''}`);
        e.code = 'NON_JSON_RESPONSE';
        e.status = res.status;
        e.path = fullPath;
        throw e;
      }
    }
    globalThis.aiOpsFetch = aiOpsFetch;
    // Task #234 — expose the same diagnostic helper under a generic name so
    // non-AI-Ops loaders (SMS log, SaaS subscriptions, dispute resolver,
    // payment tracker, etc.) can call it without reading as if they're part
    // of the AI Ops module. `safeFetch` (top of file) delegates here too.
    globalThis.adminFetch = aiOpsFetch;

    // Task #233 — shared helpers that turn the text-only "Not signed in as
    // admin" error from aiOpsFetch into an actionable inline prompt with a
    // "Sign in again" button. Used by every AI Ops loader (Activity,
    // Escalations, Digest, Settings) so the four cards behave consistently.
    let _aiOpsReauthRetry = null;

    async function openAiOpsReauth(retryFn) {
      _aiOpsReauthRetry = (typeof retryFn === 'function') ? retryFn : null;
      try {
        const { data, error } = await supabaseClient.auth.refreshSession();
        if (!error && data?.session?.access_token) {
          _adminBearer = data.session.access_token;
          globalThis._adminBearer = data.session.access_token;
          await completeAdminAuth();
          return;
        }
      } catch { /* fall through to login redirect */ }
      window.location.href = 'login.html';
    }
    globalThis.openAiOpsReauth = openAiOpsReauth;
    // Task #355 — generic alias so non-AI-Ops admin loaders (Provider /
    // Member / BGC / Care Plans / Marketing Hub / SMS log / etc.) can call
    // the same re-login modal without reading as if they belong to AI Ops.
    globalThis.openAdminReauth = openAiOpsReauth;

    function renderAiOpsAuthError(containerEl, err, retryFn) {
      if (!containerEl) return;
      const isAuthErr = err && (err.code === 'NO_ADMIN_AUTH' || err.code === 'ADMIN_AUTH_REJECTED');
      if (!isAuthErr) {
        containerEl.innerHTML = `<div style="padding:32px;text-align:center;color:var(--accent-red);">Error: ${escapeHtml(err && err.message ? err.message : String(err))}</div>`;
        return;
      }
      // Stash the retry callback under a one-shot global key so the inline
      // onclick handler can find it without requiring a re-render binding.
      const key = '_aiOpsRetry_' + Math.random().toString(36).slice(2, 10);
      globalThis[key] = function () {
        const fn = globalThis[key];
        try { delete globalThis[key]; } catch { globalThis[key] = null; }
        openAiOpsReauth(typeof retryFn === 'function' ? retryFn : null);
        return fn;
      };
      containerEl.innerHTML = `<div style="padding:28px 24px;text-align:center;max-width:560px;margin:0 auto;border:1px solid var(--border-subtle);border-radius:12px;background:var(--bg-secondary);">
        <div style="font-size:1.05rem;font-weight:600;color:var(--accent-gold);margin-bottom:8px;">⚠ Your admin session expired</div>
        <div style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:18px;line-height:1.5;">${escapeHtml(err.message)}</div>
        <button class="btn btn-primary" onclick="globalThis['${key}']()">Sign in again</button>
      </div>`;
    }
    globalThis.renderAiOpsAuthError = renderAiOpsAuthError;
    // Task #355 — generic alias. Non-AI-Ops admin loaders should call
    // `renderAdminAuthError(container, err, retryFn)` so a 401/403 always
    // surfaces the same actionable "Sign in again" prompt instead of a
    // dead-end error string.
    globalThis.renderAdminAuthError = renderAiOpsAuthError;

    // ========== AGENT FLEET (Task #139) ==========
    // Lightweight glue that exposes the agent-fleet output in the main admin
    // portal. Polls badge-summary every 60s, renders the inline section, and
    // populates the dashboard 24h tile. All heavy lifting still lives in
    // /admin/agent-fleet.html — this is presentation only.
    let _agentFleetBadgeTimer = null;

    async function loadAgentFleetBadge() {
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const r = await fetch(`${apiBase}/api/admin/agent-fleet/badge-summary`, { headers: getAiOpsHeaders() });
        if (!r.ok) return;
        const j = await r.json();
        const badge = document.getElementById('agent-fleet-badge');
        if (!badge) return;
        const total = j.total_attention || 0;
        if (total > 0) {
          badge.textContent = total > 99 ? '99+' : String(total);
          badge.style.display = 'inline-block';
          badge.title = `${j.open_dlq||0} dead-letter · ${j.needs_review||0} needs review · ${j.unack_spend_alerts||0} spend alerts`;
        } else {
          badge.style.display = 'none';
        }
      } catch (e) { /* silent — badge is best-effort */ }
    }
    globalThis.loadAgentFleetBadge = loadAgentFleetBadge;

    async function loadAgentFleetSection() {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const summaryEl = document.getElementById('agent-fleet-summary');
      // Pull badge summary (counts) and recent actions in parallel.
      try {
        const [bRes] = await Promise.all([
          fetch(`${apiBase}/api/admin/agent-fleet/badge-summary`, { headers: getAiOpsHeaders() })
        ]);
        const b = bRes.ok ? await bRes.json() : { open_dlq: 0, needs_review: 0, unack_spend_alerts: 0 };
        if (summaryEl) {
          const tile = (label, val, color, hint) => `
            <div style="background:var(--bg-elevated);border-radius:10px;padding:14px;border-left:3px solid ${color};">
              <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:4px;">${label}</div>
              <div style="font-size:1.6rem;font-weight:700;color:${color};">${val}</div>
              <div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">${hint}</div>
            </div>`;
          summaryEl.innerHTML = [
            tile('Dead-letter (open)', b.open_dlq || 0, '#c0392b', 'agent_dead_letter'),
            tile('Actions awaiting review', b.needs_review || 0, '#b8942d', 'needs_review = true'),
            tile('Unack spend alerts (7d)', b.unack_spend_alerts || 0, '#f59e0b', 'agent_spend_alerts')
          ].join('');
        }
      } catch (e) {
        if (summaryEl) summaryEl.innerHTML =
          `<div style="grid-column:1/-1;padding:14px;color:var(--accent-red);font-size:0.85rem;">Failed to load summary: ${escapeHtml(e.message)}</div>`;
      }
      // Load promoter drafts panel.
      loadPromoterDrafts();
      // Render last 25 across all agents using the shared helper.
      if (typeof globalThis.renderAgentActivityPanel === 'function') {
        globalThis.renderAgentActivityPanel('agent-fleet-recent', {
          limit: 25, title: '', showEmpty: true,
          linkContext: { section: 'agent-fleet' }
        });
      }
    }
    globalThis.loadAgentFleetSection = loadAgentFleetSection;

    async function loadPromoterDrafts() {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const listEl = document.getElementById('promoter-drafts-list');
      const badgeEl = document.getElementById('promoter-drafts-count-badge');
      if (!listEl) return;
      listEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);">Loading…</div>';
      try {
        const r = await fetch(`${apiBase}/api/admin/agent-fleet/actions?agent=promoter&review_only=1&limit=50`, { headers: getAiOpsHeaders() });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const drafts = j.actions || [];
        if (badgeEl) {
          if (drafts.length > 0) {
            badgeEl.textContent = String(drafts.length);
            badgeEl.style.display = 'inline-block';
          } else {
            badgeEl.style.display = 'none';
          }
        }
        if (drafts.length === 0) {
          listEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);">No promoter drafts pending review.</div>';
          return;
        }
        const platformColor = p => ({ reddit:'#ff4500', twitter:'#1da1f2', x:'#000', linkedin:'#0077b5', facebook:'#1877f2', instagram:'#e1306c' })[(p||'').toLowerCase()] || '#6b7280';
        listEl.innerHTML = drafts.map(a => {
          const d = a.decision || {};
          const platform = d.platform || a.action_type || '—';
          const audience = d.audience || '—';
          const body = d.body || d.content || '(no content)';
          const cta = d.call_to_action || '';
          const media = d.suggested_media || '';
          const ts = new Date(a.created_at).toLocaleDateString() + ' ' + new Date(a.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
          return `<div data-draft-id="${escapeHtml(String(a.id))}" style="border:1px solid var(--border-subtle);border-radius:10px;padding:16px;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:10px;">
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <span style="background:${platformColor(platform)};color:#fff;padding:2px 10px;border-radius:6px;font-size:0.78rem;font-weight:600;text-transform:capitalize;">${escapeHtml(platform)}</span>
                <span style="background:var(--bg-elevated);color:var(--text-secondary);padding:2px 8px;border-radius:6px;font-size:0.78rem;">audience: ${escapeHtml(audience)}</span>
                <span style="color:var(--text-muted);font-size:0.78rem;">${ts}</span>
              </div>
              <div style="display:flex;gap:8px;flex-shrink:0;">
                <button class="btn btn-sm" onclick="reviewPromoterDraft(${a.id},'approved')" style="background:#10b981;color:#fff;border-color:#10b981;">Approve &amp; Post</button>
                <button class="btn btn-sm" onclick="reviewPromoterDraft(${a.id},'rejected')" style="background:var(--accent-red);color:#fff;border-color:var(--accent-red);">Reject</button>
              </div>
            </div>
            <div style="background:var(--bg-elevated);border-radius:8px;padding:12px;font-size:0.88rem;line-height:1.55;white-space:pre-wrap;margin-bottom:${cta||media?'10px':'0'};">${escapeHtml(body)}</div>
            ${cta ? `<div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:${media?'6px':'0'};"><strong>CTA:</strong> ${escapeHtml(cta)}</div>` : ''}
            ${media ? `<div style="font-size:0.82rem;color:var(--text-secondary);"><strong>Suggested media:</strong> ${escapeHtml(media)}</div>` : ''}
          </div>`;
        }).join('');
      } catch (e) {
        listEl.innerHTML = `<div style="padding:24px;color:var(--accent-red);font-size:0.85rem;">Failed to load promoter drafts: ${escapeHtml(e.message)}</div>`;
      }
    }
    globalThis.loadPromoterDrafts = loadPromoterDrafts;

    // ========== CAR CLUBS ==========
    // Task #472: browser writes on car_clubs (list/view/create/toggle)
    // moved off the anon client and behind admin-authenticated Netlify
    // routes. RLS on car_clubs in prod has three SELECT policies and no
    // INSERT/UPDATE — the old anon-client writes have been failing since
    // #471's live-state capture. Routes handled in
    // netlify/functions/car-clubs.js (admin branch), wired via
    // /api/admin/car-clubs[/*] entries in www/_redirects.

    // Cache of admin-list clubs for viewCarClub to read from without a
    // second network hit. Populated by loadCarClubs, cleared on toggle/
    // create success.
    let _carClubsCache = [];

    async function _adminApiFetch(pathname, options = {}) {
      const session = await supabaseClient.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('Not signed in');
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const opts = {
        method: options.method || 'GET',
        headers: {
          'Authorization': 'Bearer ' + token,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {}),
        },
      };
      if (options.body) opts.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      const resp = await fetch(apiBase + pathname, opts);
      const text = await resp.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (_) { /* non-JSON is OK for shape errors */ }
      if (!resp.ok) throw new Error((data && data.error) || ('HTTP ' + resp.status));
      return data || {};
    }

    async function loadCarClubs() {
      const tbody = document.querySelector('#car-clubs-table tbody');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px;">Loading…</td></tr>';
      try {
        const { clubs } = await _adminApiFetch('/api/admin/car-clubs');
        _carClubsCache = clubs || [];

        const dEl = id => document.getElementById(id);
        if (dEl('car-club-total'))       dEl('car-club-total').textContent  = _carClubsCache.length;
        if (dEl('car-club-active'))      dEl('car-club-active').textContent = _carClubsCache.filter(c => c.is_active && !c.provider_suspended).length;
        if (dEl('car-club-members'))     dEl('car-club-members').textContent = _carClubsCache.reduce((s, c) => s + (c.member_count || 0), 0);
        if (dEl('car-club-redemptions')) dEl('car-club-redemptions').textContent = '—';

        if (!_carClubsCache.length) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:40px;">No car clubs yet — create one below</td></tr>';
          renderCarClubCreateForm();
          return;
        }

        tbody.innerHTML = _carClubsCache.map(c => {
          const providerName = c.provider?.full_name || c.provider?.email || 'Platform';
          const active = c.is_active && !c.provider_suspended;
          const vehicleTag = [c.vehicle_make, c.vehicle_model].filter(Boolean).join(' ') || '—';
          const statusC = active ? '#10b981' : '#6b7280';
          return `<tr>
            <td style="font-size:0.85rem;">${escapeHtml(providerName)}</td>
            <td><strong>${escapeHtml(c.name || '—')}</strong>
              ${c.region ? `<div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(c.region)}</div>` : ''}
            </td>
            <td style="font-size:0.82rem;color:var(--text-muted);">${escapeHtml(vehicleTag)}</td>
            <td style="text-align:center;">${c.member_count || 0}</td>
            <td>—</td>
            <td><span style="padding:2px 8px;border-radius:9999px;font-size:0.72rem;font-weight:600;background:${statusC}22;color:${statusC};border:1px solid ${statusC}55;">${active ? 'Active' : 'Inactive'}</span></td>
            <td>
              <div style="display:flex;gap:4px;">
                <button class="btn btn-secondary btn-sm" onclick="viewCarClub('${c.id}')">View</button>
                <button class="btn btn-${active ? 'danger' : 'success'} btn-sm" onclick="toggleCarClub('${c.id}', ${active})">${active ? 'Deactivate' : 'Activate'}</button>
              </div>
            </td>
          </tr>`;
        }).join('');

        // Update table header to include Actions col
        const thead = document.querySelector('#car-clubs-table thead tr');
        if (thead && thead.children.length < 7) {
          const th = document.createElement('th');
          th.textContent = 'Actions';
          thead.appendChild(th);
        }

        renderCarClubCreateForm();
      } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--accent-red);padding:32px;">Error: ${escapeHtml(err.message)}</td></tr>`;
      }
    }

    function renderCarClubCreateForm() {
      const section = document.getElementById('car-clubs');
      if (!section || section.querySelector('#car-club-create-form')) return;
      const div = document.createElement('div');
      div.id = 'car-club-create-form';
      div.className = 'card';
      div.style.marginTop = '24px';
      div.innerHTML = `
        <div class="card-header"><h3>Create Platform Club</h3></div>
        <div class="card-body" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:16px;">
          <input id="new-club-name" class="form-control" placeholder="Club name" style="padding:8px 12px;border:1px solid var(--border-subtle);border-radius:6px;background:var(--bg-elevated);color:var(--text-primary);">
          <select id="new-club-provider" class="form-control" style="padding:8px 12px;border:1px solid var(--border-subtle);border-radius:6px;background:var(--bg-elevated);color:var(--text-primary);">
            <option value="">Provider (loading…)</option>
          </select>
          <input id="new-club-make" class="form-control" placeholder="Vehicle make (optional)" style="padding:8px 12px;border:1px solid var(--border-subtle);border-radius:6px;background:var(--bg-elevated);color:var(--text-primary);">
          <input id="new-club-model" class="form-control" placeholder="Vehicle model (optional)" style="padding:8px 12px;border:1px solid var(--border-subtle);border-radius:6px;background:var(--bg-elevated);color:var(--text-primary);">
          <input id="new-club-region" class="form-control" placeholder="Region (optional)" style="padding:8px 12px;border:1px solid var(--border-subtle);border-radius:6px;background:var(--bg-elevated);color:var(--text-primary);">
          <textarea id="new-club-desc" placeholder="Description" style="grid-column:1/-1;padding:8px 12px;border:1px solid var(--border-subtle);border-radius:6px;background:var(--bg-elevated);color:var(--text-primary);resize:vertical;min-height:70px;"></textarea>
          <button class="btn btn-primary" onclick="createCarClub()" style="grid-column:1/-1;">Create Club</button>
        </div>`;
      section.appendChild(div);
      // Populate the provider dropdown asynchronously — verified providers only.
      _populateEligibleProvidersDropdown();
    }

    async function _populateEligibleProvidersDropdown() {
      const sel = document.getElementById('new-club-provider');
      if (!sel) return;
      try {
        const { providers } = await _adminApiFetch('/api/admin/car-clubs/eligible-providers');
        const options = [
          '<option value="">— Select a verified provider —</option>',
          ...(providers || []).map(p => {
            const label = p.business_name || p.full_name || p.email || p.id;
            return `<option value="${escapeHtml(p.id)}">${escapeHtml(label)}</option>`;
          })
        ];
        sel.innerHTML = options.join('');
      } catch (err) {
        sel.innerHTML = `<option value="">Failed to load providers: ${escapeHtml(err.message)}</option>`;
      }
    }

    async function createCarClub() {
      const name       = document.getElementById('new-club-name')?.value.trim();
      const providerId = document.getElementById('new-club-provider')?.value.trim();
      const make       = document.getElementById('new-club-make')?.value.trim();
      const model      = document.getElementById('new-club-model')?.value.trim();
      const region     = document.getElementById('new-club-region')?.value.trim();
      const desc       = document.getElementById('new-club-desc')?.value.trim();
      if (!name) return alert('Club name is required');
      if (!providerId) return alert('Please select a verified provider');
      try {
        await _adminApiFetch('/api/admin/car-clubs', {
          method: 'POST',
          body: {
            name,
            provider_id:    providerId,
            description:    desc   || null,
            vehicle_make:   make   || null,
            vehicle_model:  model  || null,
            region:         region || null,
          },
        });
      } catch (err) {
        return alert('Error: ' + err.message);
      }
      ['new-club-name','new-club-make','new-club-model','new-club-region','new-club-desc']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      const sel = document.getElementById('new-club-provider');
      if (sel) sel.value = '';
      loadCarClubs();
    }

    // Reads from the admin-list cache. loadCarClubs() populates it; viewing
    // a club that isn't in the cache (e.g. after a race) falls back to a
    // list refresh.
    async function viewCarClub(clubId) {
      let c = _carClubsCache.find(x => x.id === clubId);
      if (!c) {
        try {
          const { clubs } = await _adminApiFetch('/api/admin/car-clubs');
          _carClubsCache = clubs || [];
          c = _carClubsCache.find(x => x.id === clubId);
        } catch (err) {
          return alert('Error loading club: ' + err.message);
        }
      }
      if (!c) return alert('Club not found');
      const html = `<div class="form-section"><div class="form-section-title">${escapeHtml(c.name)}</div><div class="detail-grid">
        <span class="detail-label">Provider:</span><span class="detail-value">${escapeHtml(c.provider?.full_name || c.provider?.email || 'Platform')}</span>
        <span class="detail-label">Description:</span><span class="detail-value">${escapeHtml(c.description || '—')}</span>
        <span class="detail-label">Vehicle:</span><span class="detail-value">${escapeHtml([c.vehicle_make,c.vehicle_model].filter(Boolean).join(' ') || '—')}</span>
        <span class="detail-label">Region:</span><span class="detail-value">${escapeHtml(c.region || '—')}</span>
        <span class="detail-label">Members:</span><span class="detail-value">${c.member_count || 0}</span>
        <span class="detail-label">Active:</span><span class="detail-value">${c.is_active ? 'Yes' : 'No'}</span>
        <span class="detail-label">Rules:</span><span class="detail-value" style="white-space:pre-wrap;">${escapeHtml(c.rules_text || '—')}</span>
        <span class="detail-label">Created:</span><span class="detail-value">${new Date(c.created_at).toLocaleDateString()}</span>
      </div></div>`;
      showModal('Car Club', html);
    }

    async function toggleCarClub(clubId, currentlyActive) {
      const msg = currentlyActive ? 'Deactivate this car club?' : 'Reactivate this car club?';
      if (!confirm(msg)) return;
      try {
        await _adminApiFetch('/api/admin/car-clubs/' + encodeURIComponent(clubId), {
          method: 'PATCH',
          body: { is_active: !currentlyActive },
        });
      } catch (err) {
        return alert('Error: ' + err.message);
      }
      loadCarClubs();
    }

    globalThis.loadCarClubs       = loadCarClubs;
    globalThis.createCarClub      = createCarClub;
    globalThis.viewCarClub        = viewCarClub;
    globalThis.toggleCarClub      = toggleCarClub;

    // ========== BGC UNIFIED DASHBOARD ==========

    let _bgcTab = 'providers';

    document.getElementById('bgc-tabs')?.addEventListener('click', e => {
      const tab = e.target.closest('[data-bgc-tab]');
      if (!tab) return;
      document.querySelectorAll('#bgc-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _bgcTab = tab.dataset.bgcTab;
      const title = document.getElementById('bgc-tab-title');
      if (title) title.textContent = _bgcTab === 'providers' ? 'Provider Employee Checks' : 'Driver Checks';
      renderBgcContent();
    });

    let _bgcProviderRows = [];
    let _bgcDriverRows   = [];

    async function loadBgcDashboard() {
      const content = document.getElementById('bgc-content');
      if (content) content.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);">Loading…</div>';
      try {
        const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
        const { data: { session } } = await supabaseClient.auth.getSession();
        const headers = { 'Authorization': `Bearer ${session?.access_token}` };

        const [provRes, driverRes] = await Promise.all([
          fetch(`${apiBase}/api/admin/bgc/providers`, { headers }),
          supabaseClient.from('drivers').select('id, full_name, email, bgc_status, bgc_report_id, bgc_checked_at, status').order('bgc_checked_at', { ascending: false })
        ]);

        _bgcProviderRows = provRes.ok ? (await provRes.json()).providers || [] : [];
        _bgcDriverRows   = driverRes.data || [];

        const allRows = [..._bgcProviderRows, ..._bgcDriverRows];
        const passed  = allRows.filter(r => (r.bgc_status || r.status) === 'passed' || r.bgc_status === 'passed').length;
        const pending = allRows.filter(r => ['pending_check','consider','in_progress'].includes(r.bgc_status)).length;
        const failed  = allRows.filter(r => r.bgc_status === 'failed').length;

        const dEl = id => document.getElementById(id);
        if (dEl('bgc-provider-total')) dEl('bgc-provider-total').textContent = _bgcProviderRows.length;
        if (dEl('bgc-driver-total'))   dEl('bgc-driver-total').textContent   = _bgcDriverRows.length;
        if (dEl('bgc-passed-total'))   dEl('bgc-passed-total').textContent   = _bgcDriverRows.filter(r => r.bgc_status === 'passed').length + _bgcProviderRows.filter(r => r.bgc_status === 'passed').length;
        if (dEl('bgc-pending-total'))  dEl('bgc-pending-total').textContent  = pending;
        if (dEl('bgc-failed-total'))   dEl('bgc-failed-total').textContent   = failed;

        renderBgcContent();
      } catch (err) {
        const content = document.getElementById('bgc-content');
        if (content) content.innerHTML = `<div style="padding:32px;color:var(--accent-red);">Error: ${escapeHtml(err.message)}</div>`;
      }
    }

    function renderBgcContent() {
      const content = document.getElementById('bgc-content');
      if (!content) return;

      const bgcBadge = s => {
        const map = { passed: ['#10b981','Passed'], pending_check: ['#f59e0b','Pending'], consider: ['#f59e0b','Consider'], failed: ['#ef4444','Failed'], not_started: ['#6b7280','—'], in_progress: ['#3b82f6','In Progress'] };
        const [c, l] = map[s] || ['#6b7280', s || 'Unknown'];
        return `<span style="padding:2px 8px;border-radius:9999px;font-size:0.72rem;font-weight:600;background:${c}22;color:${c};border:1px solid ${c}55;">${l}</span>`;
      };

      if (_bgcTab === 'providers') {
        if (!_bgcProviderRows.length) {
          content.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">No provider employee background checks on record.</div>';
          return;
        }
        content.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
          <thead><tr style="border-bottom:2px solid var(--border-subtle);">
            <th style="padding:10px 14px;text-align:left;color:var(--text-muted);">Provider ID</th>
            <th style="padding:10px 14px;text-align:left;color:var(--text-muted);">BGC Status</th>
            <th style="padding:10px 14px;text-align:left;color:var(--text-muted);">Live Mode</th>
            <th style="padding:10px 14px;text-align:left;color:var(--text-muted);">Pending</th>
          </tr></thead><tbody>
          ${_bgcProviderRows.map(r => `<tr style="border-bottom:1px solid var(--border-subtle);">
            <td style="padding:10px 14px;font-family:monospace;font-size:0.8rem;">${escapeHtml(String(r.provider_id||'').slice(0,12))}…</td>
            <td style="padding:10px 14px;">${bgcBadge(r.bgc_status)}</td>
            <td style="padding:10px 14px;">${r.live_mode ? '🟢 Live' : '🟡 Mock'}</td>
            <td style="padding:10px 14px;">${r.pending_count || 0}</td>
          </tr>`).join('')}
          </tbody></table>`;
      } else {
        if (!_bgcDriverRows.length) {
          content.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">No drivers in the system yet.</div>';
          return;
        }
        content.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
          <thead><tr style="border-bottom:2px solid var(--border-subtle);">
            <th style="padding:10px 14px;text-align:left;color:var(--text-muted);">Driver</th>
            <th style="padding:10px 14px;text-align:left;color:var(--text-muted);">Email</th>
            <th style="padding:10px 14px;text-align:left;color:var(--text-muted);">BGC Status</th>
            <th style="padding:10px 14px;text-align:left;color:var(--text-muted);">Last Checked</th>
            <th style="padding:10px 14px;text-align:left;color:var(--text-muted);">Driver Status</th>
          </tr></thead><tbody>
          ${_bgcDriverRows.map(r => `<tr style="border-bottom:1px solid var(--border-subtle);">
            <td style="padding:10px 14px;"><strong>${escapeHtml(r.full_name||'—')}</strong></td>
            <td style="padding:10px 14px;font-size:0.82rem;">${escapeHtml(r.email||'—')}</td>
            <td style="padding:10px 14px;">${bgcBadge(r.bgc_status)}</td>
            <td style="padding:10px 14px;color:var(--text-muted);font-size:0.82rem;">${r.bgc_checked_at ? new Date(r.bgc_checked_at).toLocaleDateString() : '—'}</td>
            <td style="padding:10px 14px;font-size:0.82rem;">${escapeHtml(r.status||'—')}</td>
          </tr>`).join('')}
          </tbody></table>`;
      }
    }

    globalThis.loadBgcDashboard = loadBgcDashboard;

    // ── Referral Tracking Dashboard ──────────────────────────────────────────
    let _refTab = 'provider-codes';
    let _refProviderCodes = [];
    let _refFounderProfiles = [];

    document.addEventListener('click', e => {
      const tab = e.target.closest('[data-ref-tab]');
      if (!tab) return;
      _refTab = tab.dataset.refTab;
      document.querySelectorAll('[data-ref-tab]').forEach(t => t.classList.toggle('active', t === tab));
      const titleEl = document.getElementById('ref-tab-title');
      if (titleEl) titleEl.textContent = _refTab === 'provider-codes' ? 'Provider Referral Codes' : 'Member Founder Activity';
      renderReferralContent();
    });

    async function loadReferralDashboard() {
      const content = document.getElementById('referrals-content');
      if (content) content.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);">Loading…</div>';
      try {
        // Two-query stitch — provider_referral_codes.provider_id FK targets
        // auth.users, not profiles, so the previous embed silently 404'd and
        // the admin UI showed codes without provider names/emails.
        const [codesRes, foundersRes] = await Promise.all([
          supabaseClient
            .from('provider_referral_codes')
            .select('id, code, provider_id, code_type, uses_count, platform_fee_exempt, skip_identity_verification, is_active, created_at')
            .order('created_at', { ascending: false }),
          supabaseClient
            .from('member_founder_profiles')
            .select('id, full_name, email, referral_code, total_provider_referrals, total_member_referrals, total_commissions_earned, status')
            .eq('status', 'active')
            .order('total_provider_referrals', { ascending: false })
        ]);

        if (codesRes.error) console.error('provider_referral_codes select failed:', codesRes.error.message);
        if (foundersRes.error) console.error('member_founder_profiles select failed:', foundersRes.error.message);

        const codes = codesRes.data || [];
        const providerIds = [...new Set(codes.map(c => c.provider_id).filter(Boolean))];
        let profilesById = {};
        if (providerIds.length > 0) {
          const { data: profs, error: profErr } = await supabaseClient
            .from('profiles')
            .select('id, full_name, email')
            .in('id', providerIds);
          if (profErr) {
            console.error('profiles stitch failed:', profErr.message);
          } else {
            profilesById = Object.fromEntries((profs || []).map(p => [p.id, p]));
          }
        }
        _refProviderCodes   = codes.map(c => ({ ...c, profiles: profilesById[c.provider_id] || null }));
        _refFounderProfiles = foundersRes.data || [];

        const totalUses        = _refProviderCodes.reduce((s, r) => s + (r.uses_count || 0), 0);
        const foundersWithCode = _refFounderProfiles.filter(f => f.referral_code).length;
        const totalCommissions = _refFounderProfiles.reduce((s, f) => s + (f.total_commissions_earned || 0), 0);

        const dEl = id => document.getElementById(id);
        if (dEl('ref-provider-codes'))   dEl('ref-provider-codes').textContent   = _refProviderCodes.length;
        if (dEl('ref-total-uses'))        dEl('ref-total-uses').textContent        = totalUses;
        if (dEl('ref-member-founders'))   dEl('ref-member-founders').textContent   = foundersWithCode;
        if (dEl('ref-total-commissions')) dEl('ref-total-commissions').textContent = `$${(totalCommissions/100).toFixed(0)}`;

        renderReferralContent();
      } catch (err) {
        const content = document.getElementById('referrals-content');
        if (content) content.innerHTML = `<div style="padding:32px;color:var(--accent-red);">Error: ${escapeHtml(err.message)}</div>`;
      }
    }

    function renderReferralContent() {
      const content = document.getElementById('referrals-content');
      if (!content) return;

      const badge = (val, trueColor = '#10b981', falseColor = '#6b7280') => {
        const on = val === true;
        return `<span style="padding:2px 8px;border-radius:9999px;font-size:0.72rem;font-weight:600;background:${on?trueColor:falseColor}22;color:${on?trueColor:falseColor};border:1px solid ${on?trueColor:falseColor}55;">${on?'Yes':'No'}</span>`;
      };

      if (_refTab === 'provider-codes') {
        if (!_refProviderCodes.length) {
          content.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">No provider referral codes on record.</div>';
          return;
        }
        const siteUrl = 'https://www.mycarconcierge.com';
        content.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
          <thead><tr style="border-bottom:2px solid var(--border-subtle);">
            <th style="padding:10px 14px;text-align:left;color:var(--text-muted);">Code</th>
            <th style="padding:10px 14px;text-align:left;color:var(--text-muted);">Provider</th>
            <th style="padding:10px 14px;text-align:left;color:var(--text-muted);">Type</th>
            <th style="padding:10px 14px;text-align:center;color:var(--text-muted);">Uses</th>
            <th style="padding:10px 14px;text-align:center;color:var(--text-muted);">Fee Exempt</th>
            <th style="padding:10px 14px;text-align:center;color:var(--text-muted);">Skip ID</th>
            <th style="padding:10px 14px;text-align:center;color:var(--text-muted);">Active</th>
            <th style="padding:10px 14px;text-align:left;color:var(--text-muted);">Created</th>
            <th style="padding:10px 14px;"></th>
          </tr></thead><tbody>
          ${_refProviderCodes.map(r => {
            const p = r.profiles || {};
            const qrUrl = `${siteUrl}/signup-provider.html?ref=${encodeURIComponent(r.code||'')}`;
            return `<tr style="border-bottom:1px solid var(--border-subtle);">
              <td style="padding:10px 14px;font-family:monospace;font-weight:600;">${escapeHtml(r.code||'—')}</td>
              <td style="padding:10px 14px;">
                <div style="font-weight:500;">${escapeHtml(p.full_name||'—')}</div>
                <div style="font-size:0.78rem;color:var(--text-muted);">${escapeHtml(p.email||'')}</div>
              </td>
              <td style="padding:10px 14px;font-size:0.82rem;">${escapeHtml(r.code_type||'—')}</td>
              <td style="padding:10px 14px;text-align:center;font-weight:600;">${r.uses_count||0}</td>
              <td style="padding:10px 14px;text-align:center;">${badge(r.platform_fee_exempt)}</td>
              <td style="padding:10px 14px;text-align:center;">${badge(r.skip_identity_verification)}</td>
              <td style="padding:10px 14px;text-align:center;">${badge(r.is_active)}</td>
              <td style="padding:10px 14px;color:var(--text-muted);font-size:0.82rem;">${r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
              <td style="padding:10px 14px;"><button class="btn btn-secondary btn-sm" onclick="showAdminQr(${escapeHtml(JSON.stringify(qrUrl))},${escapeHtml(JSON.stringify(r.code||''))},${escapeHtml(JSON.stringify(p.full_name||'Provider'))})">QR</button></td>
            </tr>`;
          }).join('')}
          </tbody></table>`;
      } else {
        if (!_refFounderProfiles.length) {
          content.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">No active member founder profiles on record.</div>';
          return;
        }
        const siteUrl2 = 'https://www.mycarconcierge.com';
        content.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
          <thead><tr style="border-bottom:2px solid var(--border-subtle);">
            <th style="padding:10px 14px;text-align:left;color:var(--text-muted);">Name</th>
            <th style="padding:10px 14px;text-align:left;color:var(--text-muted);">Email</th>
            <th style="padding:10px 14px;text-align:left;color:var(--text-muted);">Referral Code</th>
            <th style="padding:10px 14px;text-align:center;color:var(--text-muted);">Provider Refs</th>
            <th style="padding:10px 14px;text-align:center;color:var(--text-muted);">Member Refs</th>
            <th style="padding:10px 14px;text-align:right;color:var(--text-muted);">Commissions</th>
            <th style="padding:10px 14px;"></th>
          </tr></thead><tbody>
          ${_refFounderProfiles.map(f => {
            const qrUrl = f.referral_code ? `${siteUrl2}/signup-provider.html?ref=${encodeURIComponent(f.referral_code)}` : '';
            return `<tr style="border-bottom:1px solid var(--border-subtle);">
              <td style="padding:10px 14px;font-weight:500;">${escapeHtml(f.full_name||'—')}</td>
              <td style="padding:10px 14px;font-size:0.82rem;">${escapeHtml(f.email||'—')}</td>
              <td style="padding:10px 14px;font-family:monospace;font-size:0.82rem;">${f.referral_code ? escapeHtml(f.referral_code) : '<span style="color:var(--text-muted);">—</span>'}</td>
              <td style="padding:10px 14px;text-align:center;">${f.total_provider_referrals||0}</td>
              <td style="padding:10px 14px;text-align:center;">${f.total_member_referrals||0}</td>
              <td style="padding:10px 14px;text-align:right;font-weight:600;">$${((f.total_commissions_earned||0)/100).toFixed(2)}</td>
              <td style="padding:10px 14px;">${qrUrl ? `<button class="btn btn-secondary btn-sm" onclick="showAdminQr(${escapeHtml(JSON.stringify(qrUrl))},${escapeHtml(JSON.stringify(f.referral_code||''))},${escapeHtml(JSON.stringify(f.full_name||'Founder'))})">QR</button>` : ''}</td>
            </tr>`;
          }).join('')}
          </tbody></table>`;
      }
    }

    // ── Admin QR Modal ──────────────────────────────────────────────────────
    let _adminQrCurrentLink = '';

    async function showAdminQr(url, code, name) {
      _adminQrCurrentLink = url;
      const modal = document.getElementById('admin-qr-modal');
      const titleEl = document.getElementById('admin-qr-modal-title');
      const nameEl  = document.getElementById('admin-qr-modal-name');
      const linkEl  = document.getElementById('admin-qr-modal-link');
      if (titleEl) titleEl.textContent = `QR — ${code}`;
      if (nameEl)  nameEl.textContent  = name;
      if (linkEl)  linkEl.textContent  = url;
      if (modal)   modal.style.display = 'flex';
      const canvas = document.getElementById('admin-qr-canvas');
      if (canvas && typeof QRCode !== 'undefined') {
        try { await QRCode.toCanvas(canvas, url, { width: 200, margin: 2, color: { dark: '#0a0a0f', light: '#ffffff' } }); } catch {}
      }
    }
    function closeAdminQrModal() {
      const modal = document.getElementById('admin-qr-modal');
      if (modal) modal.style.display = 'none';
    }
    function downloadAdminQr() {
      const canvas = document.getElementById('admin-qr-canvas');
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = 'mcc-referral-qr.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
    function copyAdminQrLink() {
      if (!_adminQrCurrentLink) return;
      navigator.clipboard.writeText(_adminQrCurrentLink).then(() => showToast('Link copied!', 'success')).catch(() => {});
    }
    globalThis.showAdminQr      = showAdminQr;
    globalThis.closeAdminQrModal = closeAdminQrModal;
    globalThis.downloadAdminQr  = downloadAdminQr;
    globalThis.copyAdminQrLink  = copyAdminQrLink;

    globalThis.loadReferralDashboard = loadReferralDashboard;

    async function reviewPromoterDraft(id, decision) {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const card = document.querySelector(`[data-draft-id="${id}"]`);
      if (card) card.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
      try {
        const r = await fetch(`${apiBase}/api/admin/agent-fleet/actions/${id}/review`, {
          method: 'POST',
          headers: { ...getAiOpsHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision })
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        if (card) {
          card.style.opacity = '0.4';
          card.style.transition = 'opacity 0.3s';
          setTimeout(() => { loadPromoterDrafts(); loadAgentFleetBadge(); }, 400);
        } else {
          loadPromoterDrafts(); loadAgentFleetBadge();
        }
      } catch (e) {
        if (card) card.querySelectorAll('button').forEach(b => { b.disabled = false; b.style.opacity = ''; });
        alert(`Failed to ${decision === 'approved' ? 'approve' : 'reject'} draft: ${e.message}`);
      }
    }
    globalThis.reviewPromoterDraft = reviewPromoterDraft;

    async function loadDashboardAgentTile() {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const tileEl = document.getElementById('dashboard-agent-fleet-tile');
      if (!tileEl) return;
      try {
        // Use the service-role-backed admin API; agent_actions has RLS that only
        // allows service_role, so a browser supabaseClient query would silently
        // return zeros. The /stats/24h endpoint runs server-side with the
        // service-role client and respects authenticateAdmin.
        const r = await fetch(`${apiBase}/api/admin/agent-fleet/stats/24h`, { headers: getAiOpsHeaders() });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const tile = (label, val, color) => `
          <div style="background:var(--bg-elevated);border-radius:10px;padding:14px;border-left:3px solid ${color};">
            <div style="font-size:0.74rem;color:var(--text-muted);margin-bottom:4px;">${label}</div>
            <div style="font-size:1.4rem;font-weight:700;color:${color};">${val}</div>
          </div>`;
        tileEl.innerHTML = [
          tile('Actions taken', j.actions_taken || 0, '#10b981'),
          tile('Escalated',     j.escalated     || 0, '#b8942d'),
          tile('Failed',        j.failed        || 0, '#c0392b')
        ].join('');
      } catch (e) {
        tileEl.innerHTML = `<div style="grid-column:1/-1;padding:10px;color:var(--text-muted);font-size:0.82rem;">Agent metrics unavailable</div>`;
      }
      if (typeof globalThis.renderAgentActivityPanel === 'function') {
        globalThis.renderAgentActivityPanel('dashboard-agent-recent', {
          limit: 10, title: 'Recent Agent Actions', showEmpty: true,
          linkContext: { section: 'dashboard' }
        });
      }
    }
    globalThis.loadDashboardAgentTile = loadDashboardAgentTile;


    function switchAiOpsTab(tab) {
      aiOpsCurrentTab = tab;
      ['activity', 'escalations', 'digest', 'settings'].forEach(t => {
        const btn = document.getElementById(`ai-ops-tab-${t}`);
        const panel = document.getElementById(`ai-ops-panel-${t}`);
        if (btn) { btn.style.borderBottomColor = t === tab ? 'var(--accent-blue)' : 'transparent'; btn.style.color = t === tab ? 'var(--accent-blue)' : 'var(--text-secondary)'; btn.style.fontWeight = t === tab ? '600' : '400'; }
        if (panel) panel.style.display = t === tab ? '' : 'none';
      });
      if (tab === 'activity') loadAiOpsActivity();
      else if (tab === 'escalations') loadAiOpsEscalations();
      else if (tab === 'digest') loadAiOpsDigests();
      else if (tab === 'settings') loadAiOpsSettings();
    }
    globalThis.switchAiOpsTab = switchAiOpsTab;

    async function initAiOps() {
      await loadAiOpsActivity();
      loadAiOpsEscalations();
      loadAiOpsSettings();
    }

    async function loadAiOpsActivity() {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const listEl = document.getElementById('ai-ops-activity-list');
      const pagEl = document.getElementById('ai-ops-activity-pagination');
      if (!listEl) return;
      const rawMod = document.getElementById('ai-ops-module-filter')?.value || '';
      const source = document.getElementById('ai-ops-source-filter')?.value || 'all';
      const outcome = document.getElementById('ai-ops-outcome-filter')?.value || '';
      const timeRange = document.getElementById('ai-ops-time-filter')?.value || '7d';
      // Split "agent:slug" prefix into a fleet-only filter; bare values stay legacy.
      const isAgentFilter = rawMod.startsWith('agent:');
      const agentSlug = isAgentFilter ? rawMod.slice('agent:'.length) : '';
      const mod = isAgentFilter ? '' : rawMod;
      // Effective source: agent: prefix forces fleet, otherwise honor dropdown.
      const effSource = isAgentFilter ? 'fleet' : source;
      // Build a `since` ISO timestamp for both branches; "all" leaves it blank.
      const sinceMap = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 };
      const sinceISO = sinceMap[timeRange]
        ? new Date(Date.now() - sinceMap[timeRange] * 60 * 60 * 1000).toISOString()
        : '';
      // Outcome filter is rendered post-fetch (legacy and fleet use different
      // status field names — outcome vs status — and slightly different value
      // vocabularies: legacy uses 'error' where fleet uses 'errored').
      const matchesOutcome = (row, src) => {
        if (!outcome) return true;
        const v = (src === 'fleet' ? row.status : row.outcome) || '';
        if (outcome === 'escalated') {
          return v === 'escalated' || (src === 'fleet' && row.needs_review && !row.reviewed_at);
        }
        if (outcome === 'errored') {
          // Legacy ai_action_log emits 'error', fleet agent_actions emits 'errored'.
          return v === 'errored' || v === 'error';
        }
        return v === outcome;
      };

      listEl.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);">Loading…</div>';
      try {
        // Helpers shared between fleet/all rendering paths.
        const confColor = c => c >= 0.9 ? 'var(--accent-green)' : c >= 0.7 ? 'var(--accent-gold)' : 'var(--accent-red)';
        const renderFleetRow = (a) => `<tr style="border-bottom:1px solid var(--border-subtle);">
          <td style="padding:10px 12px;"><span style="background:#3b82f6;color:#fff;padding:2px 8px;border-radius:6px;font-size:0.75rem;margin-right:6px;">FLEET</span><span style="font-family:monospace;font-size:0.82rem;">${escapeHtml(a.agent_slug)}</span></td>
          <td style="padding:10px 12px;">${escapeHtml(a.action_type || '—')}</td>
          <td style="padding:10px 12px;color:var(--text-muted);font-size:0.82rem;">${escapeHtml(a.autonomy_used || '—')}</td>
          <td style="padding:10px 12px;text-align:center;"><span style="color:${confColor(a.confidence || 0)};font-weight:600;">${((a.confidence || 0) * 100).toFixed(0)}%</span></td>
          <td style="padding:10px 12px;"><span style="padding:2px 8px;border-radius:20px;font-size:0.78rem;background:${a.status === 'executed' ? 'var(--accent-green)' : a.status === 'proposed' ? '#f59e0b' : a.status === 'errored' ? 'var(--accent-red)' : 'var(--bg-tertiary)'};color:${['executed','proposed','errored'].includes(a.status) ? '#fff' : 'var(--text-primary)'};">${escapeHtml(a.status || 'pending')}${a.needs_review && !a.reviewed_at ? ' · review' : ''}</span></td>
          <td style="padding:10px 12px;text-align:right;color:var(--text-muted);font-size:0.82rem;">$${Number(a.cost_usd || 0).toFixed(4)}</td>
          <td style="padding:10px 12px;color:var(--text-muted);font-size:0.82rem;">${new Date(a.created_at).toLocaleDateString()} ${new Date(a.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
        </tr>`;
        const renderLegacyRow = (a) => `<tr style="border-bottom:1px solid var(--border-subtle);">
          <td style="padding:10px 12px;"><span style="background:#7c3aed;color:#fff;padding:2px 8px;border-radius:6px;font-size:0.75rem;margin-right:6px;">AI OPS</span><span style="font-family:monospace;font-size:0.82rem;">${escapeHtml(a.module || '—')}</span></td>
          <td style="padding:10px 12px;">${escapeHtml(a.action_type || '—')}</td>
          <td style="padding:10px 12px;color:var(--text-muted);font-size:0.82rem;">${a.auto_executed ? 'auto' : a.escalated ? 'escalated' : '—'}</td>
          <td style="padding:10px 12px;text-align:center;"><span style="color:${confColor(a.confidence || 0)};font-weight:600;">${((a.confidence || 0) * 100).toFixed(0)}%</span></td>
          <td style="padding:10px 12px;"><span style="padding:2px 8px;border-radius:20px;font-size:0.78rem;background:${a.outcome === 'executed' ? 'var(--accent-green)' : a.outcome === 'escalated' ? '#f59e0b' : a.outcome === 'error' ? 'var(--accent-red)' : 'var(--bg-tertiary)'};color:${['executed','escalated','error'].includes(a.outcome) ? '#fff' : 'var(--text-primary)'};">${escapeHtml(a.outcome || 'pending')}</span></td>
          <td style="padding:10px 12px;text-align:right;color:var(--text-muted);font-size:0.82rem;">—</td>
          <td style="padding:10px 12px;color:var(--text-muted);font-size:0.82rem;">${new Date(a.created_at).toLocaleDateString()} ${new Date(a.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
        </tr>`;
        const tableShell = (rowsHtml) => `<table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
          <thead><tr style="border-bottom:2px solid var(--border-subtle);">
            <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Source / Agent</th>
            <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Action</th>
            <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Autonomy</th>
            <th style="padding:10px 12px;text-align:center;color:var(--text-muted);font-weight:500;">Confidence</th>
            <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Status</th>
            <th style="padding:10px 12px;text-align:right;color:var(--text-muted);font-weight:500;">Cost</th>
            <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Time</th>
          </tr></thead><tbody>${rowsHtml}</tbody></table>`;

        // Fleet-only branch.
        if (effSource === 'fleet') {
          const p = new URLSearchParams({ limit: 100 });
          if (agentSlug) p.set('agent', agentSlug);
          if (sinceISO) p.set('since', sinceISO);
          // Task #174 — aiOpsFetch surfaces network/auth/server errors as
          // human-readable messages instead of bare "Failed to fetch".
          const j = await aiOpsFetch(`${apiBase}/api/admin/agent-fleet/actions?${p}`, { headers: getAiOpsHeaders() });
          let actions = (j.actions || []).filter(a => matchesOutcome(a, 'fleet'));
          if (sinceISO) actions = actions.filter(a => new Date(a.created_at) >= new Date(sinceISO));
          actions = actions.slice(0, 50);
          if (actions.length === 0) {
            listEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">No agent fleet actions match the current filters.</div>';
            if (pagEl) pagEl.innerHTML = '';
            return;
          }
          listEl.innerHTML = tableShell(actions.map(renderFleetRow).join(''));
          if (pagEl) pagEl.innerHTML = '';
          return;
        }

        // Unified ("all") branch — fetch both legacy and fleet, merge by created_at.
        // When a legacy module is selected, fleet rows are suppressed because
        // the module concept does not map to fleet agent_slug (fleet is filtered
        // via the `agent:` prefix instead, which routes to the fleet-only branch).
        if (effSource === 'all') {
          const fleetParams = new URLSearchParams({ limit: 50 });
          if (sinceISO) fleetParams.set('since', sinceISO);
          const legacyParams = new URLSearchParams({ page: 1, limit: 50 });
          if (mod) legacyParams.set('module', mod);
          if (sinceISO) legacyParams.set('since', sinceISO);
          // Task #174 — capture per-source errors instead of silently
          // swallowing them. Previously a 401/network failure on both sides
          // rendered as the harmless "No AI activity matches the current
          // filters." empty state, hiding real outages. Now we surface the
          // diagnostic message from aiOpsFetch when both sides fail and
          // show a partial-fail banner when only one side fails.
          const fleetErr = { msg: null, code: null };
          const legacyErr = { msg: null, code: null };
          const [fleetRes, legacyRes] = await Promise.all([
            // Skip the fleet round-trip entirely when a legacy-only module filter is set.
            mod
              ? Promise.resolve({ actions: [] })
              : aiOpsFetch(`${apiBase}/api/admin/agent-fleet/actions?${fleetParams}`, { headers: getAiOpsHeaders() })
                  .catch(e => { fleetErr.msg = e.message; fleetErr.code = e.code; return { actions: [] }; }),
            aiOpsFetch(`${apiBase}/api/admin/ai-ops/actions?${legacyParams}`, { headers: getAiOpsHeaders() })
              .catch(e => { legacyErr.msg = e.message; legacyErr.code = e.code; return { actions: [] }; })
          ]);
          // Both sides failed → render the real error so the admin can act
          // instead of seeing a misleading empty state.
          if (fleetErr.msg && legacyErr.msg) {
            // Task #233 — when both sides failed for the same auth reason,
            // collapse the noise into a single "Sign in again" prompt.
            const isAuth = (c) => c === 'NO_ADMIN_AUTH' || c === 'ADMIN_AUTH_REJECTED';
            if (isAuth(fleetErr.code) && isAuth(legacyErr.code)) {
              renderAiOpsAuthError(listEl, { code: fleetErr.code, message: fleetErr.msg }, loadAiOpsActivity);
              if (pagEl) pagEl.innerHTML = '';
              return;
            }
            listEl.innerHTML = `<div style="padding:32px;text-align:left;color:var(--accent-red);max-width:760px;margin:0 auto;">
              <div style="font-weight:600;margin-bottom:8px;">Could not load AI activity.</div>
              <div style="font-size:0.85rem;margin-bottom:6px;"><strong>Agent Fleet:</strong> ${escapeHtml(fleetErr.msg)}</div>
              <div style="font-size:0.85rem;">Legacy AI Ops: ${escapeHtml(legacyErr.msg)}</div>
            </div>`;
            if (pagEl) pagEl.innerHTML = '';
            return;
          }
          const merged = [
            ...(fleetRes.actions  || []).filter(a => matchesOutcome(a, 'fleet'))
              .map(a => ({ __src: 'fleet',  __ts: a.created_at, row: a })),
            ...(legacyRes.actions || []).filter(a => matchesOutcome(a, 'legacy'))
              .map(a => ({ __src: 'legacy', __ts: a.created_at, row: a }))
          ]
            .filter(m => !sinceISO || new Date(m.__ts) >= new Date(sinceISO))
            .sort((a, b) => new Date(b.__ts) - new Date(a.__ts))
            .slice(0, 50);
          // One side failed → surface a banner above whatever data the other
          // side returned, so the admin sees both the available data AND
          // the real reason the other source is missing.
          const partialFailBanner = (fleetErr.msg || legacyErr.msg)
            ? `<div style="background:var(--bg-tertiary);border-left:3px solid var(--accent-red);padding:10px 14px;margin-bottom:12px;font-size:0.85rem;color:var(--accent-red);">
                 ${fleetErr.msg ? `Agent Fleet feed unavailable: ${escapeHtml(fleetErr.msg)}` : `Legacy AI Ops feed unavailable: ${escapeHtml(legacyErr.msg)}`}
               </div>`
            : '';
          if (merged.length === 0) {
            listEl.innerHTML = partialFailBanner + '<div style="padding:40px;text-align:center;color:var(--text-muted);">No AI activity matches the current filters.</div>';
            if (pagEl) pagEl.innerHTML = '';
            return;
          }
          listEl.innerHTML = partialFailBanner + tableShell(merged.map(m =>
            m.__src === 'fleet' ? renderFleetRow(m.row) : renderLegacyRow(m.row)
          ).join(''));
          if (pagEl) pagEl.innerHTML = '';
          return;
        }

        // Legacy-only branch (preserves the original paginated behavior).
        // Outcome is handled client-side via matchesOutcome() because the legacy
        // table uses different vocabularies ('error' vs fleet 'errored') and we
        // want the same set of dropdown values to behave consistently across
        // every Source selection.
        const params = new URLSearchParams({ page: aiOpsActivityPage, limit: 25 });
        if (mod) params.set('module', mod);
        if (sinceISO) params.set('since', sinceISO);
        // Task #174 — aiOpsFetch surfaces the HTTP status, path, and a plain-
        // language reason instead of a bare "Failed to fetch" / "Server error".
        const data = await aiOpsFetch(`${apiBase}/api/admin/ai-ops/actions?${params}`, { headers: getAiOpsHeaders() });
        const actions = (data.actions || []).filter(a => matchesOutcome(a, 'legacy'));
        if (actions.length === 0) {
          listEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">No AI actions logged yet. Run an AI Ops module to see activity here.</div>';
          if (pagEl) pagEl.innerHTML = '';
          return;
        }
        listEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
          <thead><tr style="border-bottom:2px solid var(--border-subtle);">
            <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Module</th>
            <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Action</th>
            <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Target</th>
            <th style="padding:10px 12px;text-align:center;color:var(--text-muted);font-weight:500;">Confidence</th>
            <th style="padding:10px 12px;text-align:center;color:var(--text-muted);font-weight:500;">Auto</th>
            <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Outcome</th>
            <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Time</th>
          </tr></thead>
          <tbody>${actions.map(a => `<tr style="border-bottom:1px solid var(--border-subtle);">
            <td style="padding:10px 12px;"><span style="background:var(--bg-tertiary);padding:2px 8px;border-radius:6px;font-size:0.8rem;font-family:monospace;">${escapeHtml(a.module || '—')}</span></td>
            <td style="padding:10px 12px;">${escapeHtml(a.action_type || '—')}</td>
            <td style="padding:10px 12px;color:var(--text-muted);font-size:0.82rem;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(a.target_id || '')}">${escapeHtml((a.target_id || '—').substring(0, 12))}…</td>
            <td style="padding:10px 12px;text-align:center;"><span style="color:${confColor(a.confidence || 0)};font-weight:600;">${((a.confidence || 0) * 100).toFixed(0)}%</span></td>
            <td style="padding:10px 12px;text-align:center;">${a.auto_executed ? '<span style="color:var(--accent-green);">✓</span>' : a.escalated ? '<span style="color:var(--accent-gold);">⬆</span>' : '<span style="color:var(--text-muted);">—</span>'}</td>
            <td style="padding:10px 12px;"><span style="padding:2px 8px;border-radius:20px;font-size:0.78rem;background:${a.outcome === 'executed' ? 'var(--accent-green)' : a.outcome === 'escalated' ? '#f59e0b' : a.outcome === 'error' ? 'var(--accent-red)' : 'var(--bg-tertiary)'};color:${a.outcome === 'executed' || a.outcome === 'escalated' || a.outcome === 'error' ? '#fff' : 'var(--text-primary)'};">${escapeHtml(a.outcome || 'pending')}</span></td>
            <td style="padding:10px 12px;color:var(--text-muted);font-size:0.82rem;">${new Date(a.created_at).toLocaleDateString()} ${new Date(a.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
          </tr>`).join('')}</tbody>
        </table>`;
        if (pagEl) {
          const total = data.total || 0;
          const totalPages = data.totalPages || 1;
          pagEl.innerHTML = total > 25 ? renderPaginationControls({ page: aiOpsActivityPage, limit: 25, total, totalPages }, 'changeAiOpsActivityPage') : '';
        }
      } catch (err) {
        // Task #233 — auth errors render a "Sign in again" button instead of
        // a dead-end text message.
        renderAiOpsAuthError(listEl, err, loadAiOpsActivity);
      }
    }
    globalThis.loadAiOpsActivity = loadAiOpsActivity;

    function changeAiOpsActivityPage(delta) { aiOpsActivityPage += delta; loadAiOpsActivity(); }
    globalThis.changeAiOpsActivityPage = changeAiOpsActivityPage;

    async function loadAiOpsEscalations() {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const listEl = document.getElementById('ai-ops-escalations-list');
      if (!listEl) return;
      listEl.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);">Loading escalations…</div>';
      try {
        // Task #174 — aiOpsFetch produces actionable error messages.
        const data = await aiOpsFetch(`${apiBase}/api/admin/ai-ops/escalations?status=pending`, { headers: getAiOpsHeaders() });
        const escs = data.escalations || [];
        const badge = document.getElementById('ai-ops-esc-badge');
        if (badge) { badge.textContent = escs.length; badge.style.display = escs.length > 0 ? 'inline' : 'none'; }
        if (escs.length === 0) {
          listEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">No pending escalations. All clear!</div>';
          return;
        }
        listEl.innerHTML = escs.map(e => {
          const rec = e.recommendation || {};
          return `<div style="border:1px solid var(--border-subtle);border-radius:12px;padding:20px;margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
              <div>
                <span style="background:var(--bg-tertiary);padding:2px 10px;border-radius:6px;font-size:0.8rem;font-family:monospace;">${escapeHtml(e.module || '—')}</span>
                <span style="margin-left:8px;color:var(--text-muted);font-size:0.85rem;">${new Date(e.created_at).toLocaleDateString()}</span>
              </div>
              <span style="color:var(--accent-gold);font-weight:600;font-size:0.85rem;">Confidence: ${((e.confidence || 0) * 100).toFixed(0)}%</span>
            </div>
            <div style="margin-bottom:8px;"><strong>Target:</strong> <code style="font-size:0.82rem;background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;">${escapeHtml(e.target_id || '—')}</code></div>
            <div style="margin-bottom:8px;"><strong>AI Recommendation:</strong> <span style="color:var(--accent-blue);">${escapeHtml(rec.recommendation || '—')}</span></div>
            ${rec.reasoning ? `<div style="background:var(--bg-secondary);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:0.88rem;color:var(--text-secondary);">${escapeHtml(rec.reasoning)}</div>` : ''}
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-primary btn-sm" onclick="resolveAiEscalation('${e.id}', 'approve')">✓ Approve AI Recommendation</button>
              <button class="btn btn-secondary btn-sm" onclick="showEscalationOverride('${e.id}')">↩ Override</button>
            </div>
            <div id="esc-override-${e.id}" style="display:none;margin-top:12px;padding:12px;background:var(--bg-secondary);border-radius:8px;">
              <label style="display:block;font-size:0.82rem;color:var(--text-muted);margin-bottom:6px;">Admin Decision</label>
              <select id="esc-decision-${e.id}" style="width:100%;padding:8px 12px;border:1px solid var(--border-subtle);border-radius:6px;background:var(--bg-tertiary);color:var(--text-primary);font-size:0.88rem;margin-bottom:8px;">
                <option value="deny_refund">Deny Refund</option>
                <option value="full_refund">Issue Full Refund</option>
                <option value="partial_refund">Issue Partial Refund</option>
                <option value="escalate_to_support">Escalate to Support Team</option>
                <option value="no_action">No Action Required</option>
                <option value="manual_review">Requires Manual Review</option>
              </select>
              <label style="display:block;font-size:0.82rem;color:var(--text-muted);margin-bottom:6px;">Override Notes</label>
              <textarea id="esc-notes-${e.id}" placeholder="Explain your override reason…" style="width:100%;padding:8px;border:1px solid var(--border-subtle);border-radius:6px;background:var(--bg-tertiary);color:var(--text-primary);font-size:0.85rem;min-height:60px;resize:vertical;"></textarea>
              <div style="display:flex;gap:8px;margin-top:8px;">
                <button class="btn btn-secondary btn-sm" onclick="resolveAiEscalation('${e.id}', 'override')">Confirm Override</button>
                <button class="btn btn-secondary btn-sm" onclick="document.getElementById('esc-override-${e.id}').style.display='none'">Cancel</button>
              </div>
            </div>
          </div>`;
        }).join('');
      } catch (err) {
        // Task #233 — auth errors render a "Sign in again" button.
        renderAiOpsAuthError(listEl, err, loadAiOpsEscalations);
      }
    }
    globalThis.loadAiOpsEscalations = loadAiOpsEscalations;

    function showEscalationOverride(id) {
      const el = document.getElementById(`esc-override-${id}`);
      if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
    }
    globalThis.showEscalationOverride = showEscalationOverride;

    async function resolveAiEscalation(id, action) {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const notes = document.getElementById(`esc-notes-${id}`)?.value || '';
      const adminDecision = action === 'override' ? (document.getElementById(`esc-decision-${id}`)?.value || 'manual_review') : action;
      try {
        const res = await fetch(`${apiBase}/api/admin/ai-ops/escalations/${id}/resolve`, {
          method: 'POST',
          headers: { ...getAiOpsHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, notes, admin_decision: adminDecision })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        if (globalThis.showToast) showToast(action === 'approve' ? 'AI recommendation approved' : 'Override recorded', 'success');
        loadAiOpsEscalations();
      } catch (err) {
        if (globalThis.showToast) showToast('Error: ' + err.message, 'error');
      }
    }
    globalThis.resolveAiEscalation = resolveAiEscalation;

    async function loadAiOpsDigests() {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const contentEl = document.getElementById('ai-ops-digest-content');
      const selectorEl = document.getElementById('ai-ops-digest-selector');
      const dateEl = document.getElementById('ai-ops-digest-date');
      if (!contentEl) return;
      try {
        // Task #174 — aiOpsFetch produces actionable error messages.
        const data = await aiOpsFetch(`${apiBase}/api/admin/ai-ops/digests`, { headers: getAiOpsHeaders() });
        aiOpsDigests = data.digests || [];
        if (aiOpsDigests.length === 0) {
          contentEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">No digests yet. Click "Generate Now" to create today\'s digest.</div>';
          if (selectorEl) selectorEl.style.display = 'none';
          return;
        }
        if (dateEl) {
          dateEl.innerHTML = aiOpsDigests.map(d => `<option value="${d.date}">${new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric', year:'numeric'})}</option>`).join('');
        }
        if (selectorEl) selectorEl.style.display = '';
        renderSelectedDigest();
      } catch (err) {
        // Task #233 — auth errors render a "Sign in again" button.
        renderAiOpsAuthError(contentEl, err, loadAiOpsDigests);
      }
    }
    globalThis.loadAiOpsDigests = loadAiOpsDigests;

    function renderSelectedDigest() {
      const dateEl = document.getElementById('ai-ops-digest-date');
      const contentEl = document.getElementById('ai-ops-digest-content');
      if (!contentEl) return;
      const date = dateEl?.value;
      const digest = aiOpsDigests.find(d => d.date === date) || aiOpsDigests[0];
      if (!digest) { contentEl.innerHTML = '<div style="color:var(--text-muted);padding:24px;">No digest found for this date.</div>'; return; }
      const stats = digest.stats || {};
      const moduleCount = Object.keys(stats).length;
      contentEl.innerHTML = `
        <div style="padding:20px;background:var(--bg-secondary);border-radius:10px;margin-bottom:16px;">
          <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;">${new Date(digest.date + 'T12:00:00').toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric', year:'numeric'})}</div>
          <p style="line-height:1.6;color:var(--text-primary);">${escapeHtml(digest.narrative || 'No narrative generated.')}</p>
        </div>
        ${moduleCount > 0 ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;">
          ${Object.entries(stats).map(([mod, s]) => `<div style="border:1px solid var(--border-subtle);border-radius:10px;padding:16px;">
            <div style="font-size:0.78rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">${escapeHtml(mod.replaceAll('_', ' '))}</div>
            <div style="font-size:1.6rem;font-weight:700;color:var(--text-primary);">${s.total || 0}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);">actions<br>${s.auto_executed || 0} auto · ${s.escalated || 0} escalated</div>
          </div>`).join('')}
        </div>` : ''}
      `;
    }
    globalThis.renderSelectedDigest = renderSelectedDigest;

    async function runAiOpsDigest() {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const resultEl = document.getElementById('ai-ops-digest-trigger-result');
      try {
        if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = 'var(--text-muted)'; resultEl.textContent = 'Generating…'; }
        const res = await fetch(`${apiBase}/api/admin/ai-ops/daily-digest/run`, { method: 'POST', headers: getAiOpsHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        if (globalThis.showToast) showToast('Digest generated successfully', 'success');
        if (resultEl) { resultEl.style.color = 'var(--accent-green)'; resultEl.textContent = `Generated: ${data.date} (${data.totalActions} actions)`; }
        if (aiOpsCurrentTab === 'digest') setTimeout(loadAiOpsDigests, 500);
      } catch (err) {
        if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = 'var(--accent-red)'; resultEl.textContent = 'Error: ' + err.message; }
        if (globalThis.showToast) showToast('Error: ' + err.message, 'error');
      }
    }
    globalThis.runAiOpsDigest = runAiOpsDigest;

    // === Task #150 Light: Dispute Resolver / Payment Tracker / Care Plan Completions ===
    async function runAiOpsDisputeResolver() {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const resultEl = document.getElementById('ai-ops-dispute-trigger-result');
      const idEl = document.getElementById('ai-ops-dispute-completion-id');
      const completionId = (idEl?.value || '').trim();
      if (!completionId) {
        if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = 'var(--accent-red)'; resultEl.textContent = 'Enter a completion UUID first.'; }
        return;
      }
      try {
        if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = 'var(--text-muted)'; resultEl.textContent = 'Resolving…'; }
        const res = await fetch(`${apiBase}/api/admin/ai-ops/dispute-resolver/trigger`, {
          method: 'POST', headers: { ...getAiOpsHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ completion_id: completionId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        if (globalThis.showToast) showToast(`Dispute ${data.action || 'processed'}`, 'success');
        if (resultEl) { resultEl.style.color = 'var(--accent-green)'; resultEl.textContent = `${data.action} (conf ${(data.confidence || 0).toFixed(2)}) — ${data.reasoning || ''}`; }
        if (typeof loadCarePlanCompletions === 'function') loadCarePlanCompletions();
      } catch (err) {
        if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = 'var(--accent-red)'; resultEl.textContent = 'Error: ' + err.message; }
        if (globalThis.showToast) showToast('Error: ' + err.message, 'error');
      }
    }
    globalThis.runAiOpsDisputeResolver = runAiOpsDisputeResolver;

    async function runAiOpsPaymentTracker() {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const resultEl = document.getElementById('ai-ops-payment-trigger-result');
      try {
        if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = 'var(--text-muted)'; resultEl.textContent = 'Scanning…'; }
        const res = await fetch(`${apiBase}/api/admin/ai-ops/payment-tracker/run`, { method: 'POST', headers: getAiOpsHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        if (globalThis.showToast) showToast('Payment scan complete', 'success');
        if (resultEl) {
          resultEl.style.color = 'var(--accent-green)';
          resultEl.textContent = `Aging: ${data.aging_pending || 0} · Mismatches: ${data.amount_mismatches || 0} · Missing amount: ${data.missing_amount || 0} · New findings: ${data.new_findings_logged || 0}`;
        }
      } catch (err) {
        if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = 'var(--accent-red)'; resultEl.textContent = 'Error: ' + err.message; }
        if (globalThis.showToast) showToast('Error: ' + err.message, 'error');
      }
    }
    globalThis.runAiOpsPaymentTracker = runAiOpsPaymentTracker;

    async function loadCarePlanCompletions() {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const contentEl = document.getElementById('ai-ops-completions-content');
      if (!contentEl) return;
      const status = (document.getElementById('ai-ops-completions-status-filter')?.value || '').trim();
      contentEl.innerHTML = '<div style="color:var(--text-muted);padding:24px;text-align:center;">Loading…</div>';
      try {
        const qs = status ? `?status=${encodeURIComponent(status)}` : '';
        // Task #355 — adminFetch surfaces auth failures with NO_ADMIN_AUTH /
        // ADMIN_AUTH_REJECTED codes so the catch can render the "Sign in
        // again" prompt instead of a dead-end "Failed" message.
        const data = await adminFetch(`${apiBase}/api/admin/ai-ops/care-plan-completions${qs}`, { headers: getAiOpsHeaders() });
        const rows = data.completions || [];
        if (!rows.length) {
          contentEl.innerHTML = '<div style="color:var(--text-muted);padding:24px;text-align:center;font-size:0.9rem;">No completions found.</div>';
          return;
        }
        const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const fmt = v => v == null ? '—' : `$${Number(v).toFixed(2)}`;
        const dt = s => s ? new Date(s).toLocaleString() : '—';
        const statusColor = s => ({pending:'var(--text-muted)',completed:'var(--accent-green)',disputed:'var(--accent-red)',resolved:'var(--accent-blue)',cancelled:'var(--text-muted)'})[s] || 'var(--text-muted)';
        const payColor = s => ({pending:'var(--text-muted)',captured:'var(--accent-green)',refunded:'var(--accent-red)',partially_refunded:'var(--accent-orange)'})[s] || 'var(--text-muted)';
        contentEl.innerHTML = `
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
              <thead>
                <tr style="text-align:left;border-bottom:1px solid var(--border-subtle);color:var(--text-muted);">
                  <th style="padding:8px;">ID</th><th style="padding:8px;">Status</th><th style="padding:8px;">Bid</th><th style="padding:8px;">Paid/Captured</th><th style="padding:8px;">Escrow</th><th style="padding:8px;">Payout Batch</th><th style="padding:8px;">Created</th><th style="padding:8px;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r => {
                  const hasPI = !!r.stripe_payment_intent_id;
                  const escrowState = r.payment_capture_status || (hasPI ? 'pending' : null);
                  const canCapture = hasPI && r.payment_capture_status !== 'captured' && r.payment_capture_status !== 'refunded';
                  const canRefund = hasPI && r.payment_capture_status !== 'refunded';
                  return `
                  <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:8px;font-family:monospace;font-size:0.78rem;">${esc(r.id).slice(0,8)}…</td>
                    <td style="padding:8px;color:${statusColor(r.status)};font-weight:600;">${esc(r.status)}</td>
                    <td style="padding:8px;">${fmt(r.bid_amount)}</td>
                    <td style="padding:8px;">${fmt(r.captured_amount != null ? r.captured_amount : r.actual_paid_amount)}</td>
                    <td style="padding:8px;color:${payColor(escrowState)};font-weight:600;font-size:0.8rem;">${escrowState ? esc(escrowState) : '—'}</td>
                    <td style="padding:8px;font-family:monospace;font-size:0.78rem;color:var(--text-muted);">${r.payout_batch_id ? esc(r.payout_batch_id) : '—'}</td>
                    <td style="padding:8px;color:var(--text-muted);">${dt(r.created_at)}</td>
                    <td style="padding:8px;display:flex;gap:4px;flex-wrap:wrap;">
                      <button class="btn btn-secondary btn-sm" onclick="document.getElementById('ai-ops-dispute-completion-id').value='${esc(r.id)}';globalThis.scrollTo({top:0,behavior:'smooth'});">Use ID</button>
                      ${r.status === 'disputed' ? `<button class="btn btn-primary btn-sm" onclick="(async()=>{document.getElementById('ai-ops-dispute-completion-id').value='${esc(r.id)}';await runAiOpsDisputeResolver();})()">Resolve</button>` : ''}
                      ${canCapture ? `<button class="btn btn-primary btn-sm" style="background:var(--accent-green);" onclick="captureCarePlanEscrow('${esc(r.id)}')">Capture</button>` : ''}
                      ${canRefund ? `<button class="btn btn-secondary btn-sm" style="border-color:var(--accent-red);color:var(--accent-red);" onclick="refundCarePlanEscrow('${esc(r.id)}')">Refund</button>` : ''}
                      <button class="btn btn-secondary btn-sm" onclick="tagCarePlanPayoutBatch('${esc(r.id)}', '${esc(r.payout_batch_id || '')}')">Tag Batch</button>
                    </td>
                  </tr>
                `;}).join('')}
              </tbody>
            </table>
          </div>
          <div style="color:var(--text-muted);font-size:0.78rem;padding:8px;">${rows.length} record${rows.length === 1 ? '' : 's'} · Capture/Refund actions hit Stripe live — held funds get released immediately.</div>
        `;
      } catch (err) {
        // Task #355 — auth failures route to the shared "Sign in again"
        // prompt; everything else falls back to the inline red error.
        if (err && (err.code === 'NO_ADMIN_AUTH' || err.code === 'ADMIN_AUTH_REJECTED') && typeof globalThis.renderAdminAuthError === 'function') {
          globalThis.renderAdminAuthError(contentEl, err, loadCarePlanCompletions);
        } else {
          contentEl.innerHTML = `<div style="color:var(--accent-red);padding:16px;font-size:0.85rem;">Error: ${escapeHtml(err && err.message ? err.message : String(err))}</div>`;
        }
      }
    }
    globalThis.loadCarePlanCompletions = loadCarePlanCompletions;

    async function captureCarePlanEscrow(completionId) {
      if (!completionId) return;
      if (!confirm('Capture held escrow funds for this completion? This will release payment to the provider AND trigger founder commission. Cannot be undone.')) return;
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const res = await fetch(`${apiBase}/api/admin/ai-ops/care-plan-completions/${completionId}/capture`, {
          method: 'POST',
          headers: getAiOpsHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        alert(data.already_captured ? 'Already captured.' : `Captured $${(data.captured_amount || 0).toFixed(2)}` + (data.commission?.amount ? ` (commission: $${data.commission.amount.toFixed(2)})` : ''));
        await loadCarePlanCompletions();
      } catch (err) {
        alert(`Capture failed: ${err.message}`);
      }
    }
    globalThis.captureCarePlanEscrow = captureCarePlanEscrow;

    async function refundCarePlanEscrow(completionId) {
      if (!completionId) return;
      const amountStr = prompt('Refund amount in dollars (leave blank for full refund):', '');
      if (amountStr === null) return;
      const body = {};
      const cleaned = String(amountStr).replace(/[\s$,]/g, '');
      if (cleaned !== '') {
        const amt = Number(cleaned);
        if (!isFinite(amt) || amt <= 0) { alert('Invalid amount.'); return; }
        body.amount = amt;
      }
      if (!confirm(`Refund ${body.amount ? '$' + body.amount.toFixed(2) : 'FULL amount'} to member? If funds are still held (uncaptured), the authorization will be cancelled. Cannot be undone.`)) return;
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const res = await fetch(`${apiBase}/api/admin/ai-ops/care-plan-completions/${completionId}/refund`, {
          method: 'POST',
          headers: { ...getAiOpsHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (data.cancelled) {
          alert('Held authorization cancelled — member was never charged.');
        } else {
          alert(`Refunded $${(data.refunded_amount || 0).toFixed(2)}${data.is_full ? ' (full)' : ' (partial)'}`);
        }
        await loadCarePlanCompletions();
      } catch (err) {
        alert(`Refund failed: ${err.message}`);
      }
    }
    globalThis.refundCarePlanEscrow = refundCarePlanEscrow;

    // Task #150: tag a completion with a payout-batch label so weekly
    // settlement runs can be reconciled in one place. Pass empty string to clear.
    async function tagCarePlanPayoutBatch(completionId, currentValue) {
      if (!completionId) return;
      const next = prompt('Payout batch ID (e.g. 2026-W17). Leave blank to clear.', currentValue || '');
      if (next === null) return;
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const res = await fetch(`${apiBase}/api/admin/ai-ops/care-plan-completions/${completionId}`, {
          method: 'PATCH',
          headers: { ...getAiOpsHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payout_batch_id: next.trim() || null,
            metadata_merge: { payout_batch_tagged_at: new Date().toISOString(), payout_batch_value: next.trim() || null }
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (globalThis.showToast) showToast('Payout batch updated', 'success');
        await loadCarePlanCompletions();
      } catch (err) {
        alert(`Tag failed: ${err.message}`);
      }
    }
    globalThis.tagCarePlanPayoutBatch = tagCarePlanPayoutBatch;

    async function loadAiOpsSettings() {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const contentEl = document.getElementById('ai-ops-settings-content');
      if (!contentEl) return;
      try {
        // Task #174 — aiOpsFetch produces actionable error messages instead
        // of "Failed to fetch" / generic "Failed".
        const data = await aiOpsFetch(`${apiBase}/api/admin/ai-ops/settings`, { headers: getAiOpsHeaders() });
        const shadowMode = data.shadow_mode;
        const shadowBanner = document.getElementById('ai-ops-shadow-banner');
        if (shadowBanner) shadowBanner.style.display = shadowMode ? 'flex' : 'none';
        contentEl.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-bottom:20px;">
            <div style="border:1px solid var(--border-subtle);border-radius:10px;padding:16px;">
              <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">Current Confidence Threshold</div>
              <div style="font-size:1.8rem;font-weight:700;color:${shadowMode ? '#a78bfa' : 'var(--accent-blue)'};">${(data.confidence_threshold * 100).toFixed(0)}%</div>
              <div style="font-size:0.82rem;color:var(--text-muted);margin-top:4px;">${shadowMode ? '🛡️ Shadow Mode — nothing auto-executes' : '✓ Autonomous actions enabled'}</div>
            </div>
            <div style="border:1px solid var(--border-subtle);border-radius:10px;padding:16px;">
              <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">Current Max Auto-Refund</div>
              <div style="font-size:1.8rem;font-weight:700;color:var(--accent-green);">$${data.max_auto_refund}</div>
              <div style="font-size:0.82rem;color:var(--text-muted);margin-top:4px;">Per dispute auto-resolution ceiling</div>
            </div>
          </div>
          <div style="border:1px solid var(--border-subtle);border-radius:12px;padding:20px;max-width:480px;">
            <div style="font-weight:600;margin-bottom:16px;">Override Settings (Session)</div>
            <div style="margin-bottom:14px;">
              <label style="display:block;font-size:0.85rem;color:var(--text-muted);margin-bottom:6px;">Confidence Threshold (0.0 – 1.0)</label>
              <input id="ai-ops-threshold-input" type="number" min="0" max="1" step="0.05" value="${data.confidence_threshold}" style="width:100%;padding:8px 12px;border:1px solid var(--border-subtle);border-radius:8px;background:var(--bg-tertiary);color:var(--text-primary);font-size:0.95rem;">
              <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">1.0 = Shadow Mode (recommend for initial setup)</div>
            </div>
            <div style="margin-bottom:16px;">
              <label style="display:block;font-size:0.85rem;color:var(--text-muted);margin-bottom:6px;">Max Auto-Refund ($)</label>
              <input id="ai-ops-max-refund-input" type="number" min="0" max="10000" step="50" value="${data.max_auto_refund}" style="width:100%;padding:8px 12px;border:1px solid var(--border-subtle);border-radius:8px;background:var(--bg-tertiary);color:var(--text-primary);font-size:0.95rem;">
            </div>
            <button class="btn btn-primary btn-sm" onclick="saveAiOpsSettings()">Save Settings</button>
            <div id="ai-ops-settings-save-msg" style="margin-top:10px;font-size:0.85rem;display:none;"></div>
          </div>
          <div style="margin-top:16px;padding:12px 16px;background:var(--bg-secondary);border-radius:8px;font-size:0.82rem;color:var(--text-secondary);">
            <strong>Note:</strong> These overrides are stored in the database and take precedence over environment variables at runtime. For permanent changes, also update <code>AI_CONFIDENCE_THRESHOLD</code> and <code>AI_MAX_AUTO_REFUND</code> env vars.
          </div>
        `;
      } catch (err) {
        // Task #233 — auth errors render a "Sign in again" button.
        renderAiOpsAuthError(contentEl, err, loadAiOpsSettings);
      }
    }
    globalThis.loadAiOpsSettings = loadAiOpsSettings;

    async function saveAiOpsSettings() {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const threshold = Number.parseFloat(document.getElementById('ai-ops-threshold-input')?.value || '1');
      const maxRefund = Number.parseFloat(document.getElementById('ai-ops-max-refund-input')?.value || '500');
      const msgEl = document.getElementById('ai-ops-settings-save-msg');
      if (isNaN(threshold) || threshold < 0 || threshold > 1) { if (globalThis.showToast) showToast('Threshold must be between 0.0 and 1.0', 'error'); return; }
      if (isNaN(maxRefund) || maxRefund < 0) { if (globalThis.showToast) showToast('Max refund must be a positive number', 'error'); return; }
      if (msgEl) { msgEl.style.display = 'block'; msgEl.style.color = 'var(--text-muted)'; msgEl.textContent = 'Saving…'; }
      try {
        const res = await fetch(`${apiBase}/api/admin/ai-ops/settings`, {
          method: 'POST',
          headers: { ...getAiOpsHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ confidence_threshold: threshold, max_auto_refund: maxRefund })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');
        if (msgEl) { msgEl.style.color = 'var(--accent-green)'; msgEl.textContent = '✓ Settings saved'; setTimeout(() => { msgEl.style.display = 'none'; }, 3000); }
        if (globalThis.showToast) showToast('AI Ops settings saved', 'success');
        setTimeout(loadAiOpsSettings, 500);
      } catch (err) {
        if (msgEl) { msgEl.style.color = 'var(--accent-red)'; msgEl.textContent = 'Error: ' + err.message; }
        if (globalThis.showToast) showToast('Save failed: ' + err.message, 'error');
      }
    }
    globalThis.saveAiOpsSettings = saveAiOpsSettings;

    async function triggerDisputeResolver() {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const disputeId = document.getElementById('ai-ops-dispute-id')?.value?.trim();
      const resultEl = document.getElementById('ai-ops-dispute-result');
      if (!disputeId) { if (globalThis.showToast) showToast('Enter a dispute ID', 'error'); return; }
      if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = 'var(--text-muted)'; resultEl.textContent = 'Analyzing dispute…'; }
      try {
        const data = await safeFetch(`${apiBase}/api/admin/ai-ops/dispute-resolver/trigger`, {
          method: 'POST',
          headers: { ...getAiOpsHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ dispute_id: disputeId })
        });
        if (resultEl) {
          resultEl.style.color = 'var(--accent-green)';
          resultEl.textContent = `Action: ${data.action || '—'} | Confidence: ${((data.confidence || 0) * 100).toFixed(0)}% | ${data.reasoning || ''}`;
        }
        if (globalThis.showToast) showToast(`Dispute ${data.action || 'analyzed'} (${((data.confidence || 0) * 100).toFixed(0)}% confidence)`, 'success');
        setTimeout(() => { if (aiOpsCurrentTab === 'activity') loadAiOpsActivity(); else if (aiOpsCurrentTab === 'escalations') loadAiOpsEscalations(); }, 500);
      } catch (err) {
        if (resultEl) { resultEl.style.color = 'var(--accent-red)'; resultEl.textContent = 'Error: ' + err.message; }
        if (globalThis.showToast) showToast('Error: ' + err.message, 'error');
      }
    }
    globalThis.triggerDisputeResolver = triggerDisputeResolver;

    async function triggerPaymentTracker() {
      const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
      const resultEl = document.getElementById('ai-ops-payment-result');
      if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = 'var(--text-muted)'; resultEl.textContent = 'Running payment tracker…'; }
      try {
        const data = await safeFetch(`${apiBase}/api/admin/ai-ops/payment-tracker/run`, { method: 'POST', headers: getAiOpsHeaders() });
        if (resultEl) {
          resultEl.style.color = 'var(--accent-green)';
          resultEl.textContent = data.message || `Processed ${data.processed || 0} orders, ${data.anomalies || 0} anomalies`;
        }
        if (globalThis.showToast) showToast(data.message || `Payment tracker: ${data.processed || 0} orders`, 'success');
      } catch (err) {
        if (resultEl) { resultEl.style.color = 'var(--accent-red)'; resultEl.textContent = 'Error: ' + err.message; }
        if (globalThis.showToast) showToast('Error: ' + err.message, 'error');
      }
    }
    globalThis.triggerPaymentTracker = triggerPaymentTracker;

    // ========== END AI OPS AGENT ==========


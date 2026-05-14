(function() {
  const apiBase = globalThis.MCC_CONFIG?.apiBaseUrl || '';
  let outreachState = {};
  let outreachLeads = [];
  let outreachPipeline = [];
  let outreachMessages = [];
  let outreachCampaigns = [];
  let currentOutreachTab = 'pipeline';
  let schemaReady = false;
  let realtimeChannel = null;
  let pipelineChannel = null;
  // Loaded from /api/admin/apollo/config. Stays null until the first GET
  // succeeds so the panel can show "Discovery — unavailable" instead of
  // mis-rendering "Disabled" for a config it never tried to fetch.
  let apolloConfig = null;

  function getOutreachHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const adminTeamToken = localStorage.getItem('mcc_admin_team_token');
    const adminPass = localStorage.getItem('mcc_admin_pass');
    if (adminTeamToken) headers['x-admin-token'] = adminTeamToken;
    else if (adminPass) headers['x-admin-password'] = adminPass;
    return headers;
  }

  async function outreachFetch(endpoint, options = {}) {
    const res = await fetch(`${apiBase}/api/admin/outreach${endpoint}`, {
      ...options,
      headers: { ...getOutreachHeaders(), ...(options.headers || {}) }
    });
    return res;
  }

  // Sibling of outreachFetch for the Apollo admin endpoints proxied through
  // /api/admin/apollo/* → netlify/functions/apollo-admin.js.
  async function apolloFetch(endpoint, options = {}) {
    const res = await fetch(`${apiBase}/api/admin/apollo${endpoint}`, {
      ...options,
      headers: { ...getOutreachHeaders(), ...(options.headers || {}) }
    });
    return res;
  }

  async function loadApolloConfig() {
    try {
      const res = await apolloFetch('/config');
      if (!res.ok) {
        // Leave apolloConfig at null so the badge renders as "unavailable".
        // 401 here usually means the admin password header is missing/wrong;
        // the admin already sees a separate auth banner so don't re-toast.
        if (res.status !== 401) {
          console.error('Failed to load Apollo config:', res.status);
        }
        apolloConfig = null;
        return null;
      }
      const data = await res.json();
      apolloConfig = data?.config || null;
      return apolloConfig;
    } catch (e) {
      console.error('Failed to load Apollo config:', e);
      apolloConfig = null;
      return null;
    }
  }

  async function setApolloEnabled(enabled) {
    try {
      const res = await apolloFetch('/config', {
        method: 'PUT',
        body: JSON.stringify({ enabled: !!enabled })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (typeof showToast !== 'undefined') showToast(data.error || 'Failed to update Apollo discovery', 'error');
        return false;
      }
      apolloConfig = data?.config || apolloConfig;
      if (typeof showToast !== 'undefined') showToast(enabled ? 'Apollo discovery enabled' : 'Apollo discovery disabled');
      renderEngineControlPanel();
      return true;
    } catch (e) {
      if (typeof showToast !== 'undefined') showToast('Apollo update error: ' + e.message, 'error');
      return false;
    }
  }

  async function enableApolloDiscovery() {
    await setApolloEnabled(true);
  }

  async function disableApolloDiscovery() {
    if (!confirm('Pause Apollo discovery? Scheduled cycles will stop until re-enabled.')) return;
    await setApolloEnabled(false);
  }

  async function runApolloNow() {
    if (typeof showToast !== 'undefined') showToast('Running Apollo discovery cycle...');
    try {
      const res = await apolloFetch('/run-now', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      const r = data?.result || {};
      if (!res.ok) {
        if (typeof showToast !== 'undefined') showToast(data.error || `Apollo run failed (HTTP ${res.status})`, 'error');
      } else if (r.skipped) {
        if (typeof showToast !== 'undefined') showToast(`Cycle skipped: ${r.reason || 'unknown'}`, 'error');
      } else if (r.success === false) {
        if (typeof showToast !== 'undefined') showToast(`Apollo cycle error: ${r.error || r.error_kind || 'unknown'}`, 'error');
      } else {
        if (typeof showToast !== 'undefined') showToast(`Apollo cycle complete — ${r.search_results || 0} found, ${r.added || 0} added, ${r.enriched || 0} enriched`);
      }
    } catch (e) {
      if (typeof showToast !== 'undefined') showToast('Apollo run error: ' + e.message, 'error');
    }
    await loadApolloConfig();
    renderEngineControlPanel();
  }

  // Compact "Save Apollo Settings" modal — exposes the small set of safe
  // tunables (interval/per-page/auto-enrich/instantly sync) so admin can
  // adjust cadence without editing the database directly. Rotation indices
  // and search_profiles are intentionally not exposed.
  function showApolloSettings() {
    if (!apolloConfig) {
      if (typeof showToast !== 'undefined') showToast('Apollo config unavailable', 'error');
      return;
    }
    const cfg = apolloConfig;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'apollo-settings-modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:520px;">
        <div class="modal-header"><h3>Apollo Discovery Settings</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
        <div style="display:flex;flex-direction:column;gap:14px;padding:20px;">
          <div>
            <label style="font-weight:500;display:block;margin-bottom:6px;">Interval (hours between cycles)</label>
            <input type="number" id="apollo-cfg-interval" class="form-input" value="${Number(cfg.interval_hours) || 6}" min="1" max="168" step="1">
          </div>
          <div>
            <label style="font-weight:500;display:block;margin-bottom:6px;">Results per page</label>
            <input type="number" id="apollo-cfg-per-page" class="form-input" value="${Number(cfg.per_page) || 25}" min="1" max="100" step="1">
          </div>
          <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg-tertiary,#1a1f2e);border-radius:8px;">
            <input type="checkbox" id="apollo-cfg-auto-enrich" ${cfg.auto_enrich !== false ? 'checked' : ''} style="width:18px;height:18px;">
            <label for="apollo-cfg-auto-enrich" style="cursor:pointer;">Auto-enrich newly discovered leads</label>
          </div>
          <div>
            <label style="font-weight:500;display:block;margin-bottom:6px;">Enrichment batch size</label>
            <input type="number" id="apollo-cfg-enrich-batch" class="form-input" value="${Number(cfg.enrich_batch) || 15}" min="0" max="100" step="1">
          </div>
          <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg-tertiary,#1a1f2e);border-radius:8px;">
            <input type="checkbox" id="apollo-cfg-instantly-sync" ${cfg.instantly_auto_sync ? 'checked' : ''} style="width:18px;height:18px;">
            <label for="apollo-cfg-instantly-sync" style="cursor:pointer;">Auto-sync provider leads to Instantly.ai</label>
          </div>
          <div>
            <label style="font-weight:500;display:block;margin-bottom:6px;">Instantly provider campaign ID</label>
            <input type="text" id="apollo-cfg-instantly-campaign" class="form-input" value="${cfg.instantly_provider_campaign_id ? String(cfg.instantly_provider_campaign_id).replaceAll('"', '&quot;') : ''}" placeholder="campaign_abc123...">
          </div>
          <button class="btn btn-primary" onclick="globalThis.saveApolloSettings()">Save Apollo Settings</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  async function saveApolloSettings() {
    const intervalHours = Number.parseInt(document.getElementById('apollo-cfg-interval').value, 10);
    const perPage = Number.parseInt(document.getElementById('apollo-cfg-per-page').value, 10);
    const enrichBatch = Number.parseInt(document.getElementById('apollo-cfg-enrich-batch').value, 10);
    const autoEnrich = !!document.getElementById('apollo-cfg-auto-enrich').checked;
    const instantlySync = !!document.getElementById('apollo-cfg-instantly-sync').checked;
    const instantlyCampaignRaw = document.getElementById('apollo-cfg-instantly-campaign').value.trim();

    const updates = {
      interval_hours: intervalHours,
      per_page: perPage,
      enrich_batch: enrichBatch,
      auto_enrich: autoEnrich,
      instantly_auto_sync: instantlySync,
      instantly_provider_campaign_id: instantlyCampaignRaw === '' ? null : instantlyCampaignRaw
    };

    try {
      const res = await apolloFetch('/config', {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = Array.isArray(data.details) ? ' — ' + data.details.join('; ') : '';
        if (typeof showToast !== 'undefined') showToast((data.error || 'Save failed') + detail, 'error');
        return;
      }
      apolloConfig = data?.config || apolloConfig;
      document.getElementById('apollo-settings-modal')?.remove();
      if (typeof showToast !== 'undefined') showToast('Apollo settings saved');
      renderEngineControlPanel();
    } catch (e) {
      if (typeof showToast !== 'undefined') showToast('Save error: ' + e.message, 'error');
    }
  }

  async function initOutreachEngine() {
    try {
      const statusRes = await outreachFetch('/schema-status');
      if (!statusRes.ok) throw new Error('Status check failed: ' + statusRes.status);
      const statusData = await statusRes.json();
      schemaReady = statusData.schema_ready;
    } catch (e) {
      console.error('Outreach schema check failed:', e);
      schemaReady = false;
    }

    const container = document.getElementById('outreach-engine');
    if (!container) return;

    if (!schemaReady) {
      container.querySelector('.outreach-content')?.remove();
      const notice = container.querySelector('.outreach-schema-notice') || document.createElement('div');
      notice.className = 'outreach-schema-notice card';
      notice.innerHTML = `
        <div style="padding:40px;text-align:center;">
          <span class="icon-inline" data-icon="alert-triangle" style="width:48px;height:48px;color:var(--accent-gold);"></span>
          <h2 style="margin:16px 0 8px;">Database Schema Required</h2>
          <p style="color:var(--text-muted);max-width:560px;margin:0 auto 12px;">The Outreach Engine tables have not been created yet. Open the Supabase SQL Editor and apply the migration files below in order:</p>
          <pre style="display:inline-block;text-align:left;background:var(--bg-elevated);padding:12px 16px;border-radius:6px;margin:0 auto 20px;font-size:13px;line-height:1.6;">supabase/migrations/20260420_outreach_engine_initial.sql
supabase/migrations/20260424_outreach_email_events.sql
supabase/migrations/20260425_outreach_crm_bridge.sql
(plus any later 20260*_outreach_*.sql)</pre>
          <div>
            <button class="btn" onclick="globalThis.initOutreachEngine()">Check Again</button>
          </div>
        </div>
      `;
      if (!container.querySelector('.outreach-schema-notice')) container.appendChild(notice);
      if (typeof initInlineIcons !== 'undefined') initInlineIcons(container);
      return;
    }

    container.querySelector('.outreach-schema-notice')?.remove();
    await loadEngineState();
    switchOutreachTab('pipeline');
    setupOutreachRealtime();
    // Task #243 — render the Facebook Page connection picker card.
    // Safe to fail independently of the rest of the panel.
    try { await initFacebookPageConnection(); }
    catch (e) { console.warn('[FB Page] init failed:', e); }
  }

  async function loadEngineState() {
    try {
      // Load engine state and Apollo config in parallel — neither blocks the
      // other and the panel reads both. If the Apollo fetch fails, the panel
      // still renders with a "Discovery — unavailable" badge.
      const [stateRes] = await Promise.all([
        outreachFetch('/engine-state'),
        loadApolloConfig()
      ]);
      const data = await stateRes.json();
      outreachState = data;
      renderEngineControlPanel();
    } catch (e) {
      console.error('Failed to load engine state:', e);
    }
  }

  // Task #306 — surfaces ops-facing engine diagnostics inside the admin panel:
  // is_running flag, last cycle skip reason (e.g. engine_paused), Apollo
  // credit-exhaustion warning, and last Resend send error. Renders as a
  // single low-profile diagnostics strip; degrades to nothing when the
  // engine-state endpoint hasn't returned diagnostics yet (older deploy).
  function renderEngineDiagnostics(d) {
    if (!d) return '';
    const fmtAgo = (iso) => {
      if (!iso) return null;
      const mins = Math.round((Date.now() - new Date(iso)) / 60000);
      if (mins < 60) return `${mins}m ago`;
      const hrs = mins / 60;
      if (hrs < 48) return `${Math.round(hrs)}h ago`;
      return `${Math.round(hrs / 24)}d ago`;
    };
    const chips = [];
    chips.push(d.is_running
      ? `<span title="Engine cycle is running every 15 min" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.3);color:#4ade80;">● running</span>`
      : `<span title="Engine paused — manual cycles only${d.pause_reason ? ': ' + escapeHtml(d.pause_reason) : ''}" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);color:#f87171;">● paused${d.pause_reason ? ' — ' + escapeHtml(d.pause_reason) : ''}</span>`);
    if (d.last_skip) {
      chips.push(`<span title="Most recent send_skipped reason from outreach_activity_log" style="font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(148,163,184,0.1);border:1px solid rgba(148,163,184,0.25);color:var(--text-muted);">last skip: ${escapeHtml(d.last_skip.reason || 'unknown')}${d.last_skip.channel ? ' · ' + d.last_skip.channel : ''} (${fmtAgo(d.last_skip.at)})</span>`);
    }
    if (d.last_send_error) {
      chips.push(`<span title="Most recent send_failed (Resend / Twilio error)" style="font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#f87171;">last send error: ${escapeHtml(String(d.last_send_error.error || 'unknown').slice(0, 80))}${d.last_send_error.channel ? ' · ' + d.last_send_error.channel : ''} (${fmtAgo(d.last_send_error.at)})</span>`);
    }
    // Task #306 — AI circuit-breaker chip. Trips open after 3 consecutive
    // Anthropic/OpenAI failures and pauses the draft pipeline for 5 min.
    if (d.ai_circuit_breaker?.open) {
      const fmt = d.ai_circuit_breaker.paused_until ? fmtAgo(d.ai_circuit_breaker.paused_until) : null;
      chips.push(`<span title="AI draft pipeline tripped open after ${d.ai_circuit_breaker.failures} consecutive Anthropic/OpenAI failures. Will auto-resume when pause window expires." style="font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);color:#f87171;font-weight:600;">⛔ AI breaker open (${d.ai_circuit_breaker.failures} fails${fmt ? ', resumes by ' + fmt : ''})</span>`);
    } else if ((d.ai_circuit_breaker?.failures || 0) > 0) {
      chips.push(`<span title="Recent AI failures recorded; breaker still closed (trips at 3)" style="font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(148,163,184,0.1);border:1px solid rgba(148,163,184,0.25);color:var(--text-muted);">AI fails: ${d.ai_circuit_breaker.failures}</span>`);
    }
    if (d.apollo_likely_credit_exhaustion_at) {
      chips.push(`<span title="Set after 5+ consecutive Apollo cycles returned 0 results — almost always means Apollo credits are exhausted" style="font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.4);color:#fbbf24;font-weight:600;">⚠ Apollo credit-exhaustion suspected (${d.apollo_consecutive_zero_cycles} zero cycles)</span>`);
    } else if (d.apollo_consecutive_zero_cycles >= 2) {
      chips.push(`<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(148,163,184,0.1);border:1px solid rgba(148,163,184,0.25);color:var(--text-muted);">${d.apollo_consecutive_zero_cycles} zero Apollo cycles in a row</span>`);
    }
    if (chips.length === 1) return ''; // only "running" — no real diagnostics worth showing
    return `<div style="display:flex;align-items:center;gap:6px;padding:6px 12px;margin-top:4px;background:var(--bg-elevated,#1a1f2e);border-radius:8px;border:1px solid var(--border-subtle,#2a3040);flex-wrap:wrap;">
      <span style="font-size:11px;color:var(--text-muted);font-weight:500;">Diagnostics:</span>
      ${chips.join('')}
    </div>`;
  }

  function renderEngineControlPanel() {
    const panel = document.getElementById('outreach-control-panel');
    if (!panel) return;

    const isRunning = outreachState.is_running;
    const lastCycle = outreachState.last_draft_run || outreachState.last_discovery_run;
    const lastCycleText = lastCycle ? timeAgo(new Date(lastCycle)) : 'Never';
    const pausedText = outreachState.paused_at ? `Paused ${timeAgo(new Date(outreachState.paused_at))}${outreachState.paused_by ? ' by ' + outreachState.paused_by : ''}` : '';

    const autoSendOn = outreachState.auto_send !== false;
    const apolloConfigLoaded = apolloConfig !== null;
    const apolloEnabled = apolloConfig?.enabled === true;
    const formatAgo = (iso) => {
      if (!iso) return null;
      const mins = Math.round((Date.now() - new Date(iso)) / 60000);
      if (mins < 60) return `${mins}m ago`;
      const hrs = mins / 60;
      if (hrs < 48) return `${Math.round(hrs)}h ago`;
      return `${Math.round(hrs / 24)}d ago`;
    };
    const apolloLastRun = formatAgo(apolloConfig?.last_run);
    const apolloLastSuccess = formatAgo(apolloConfig?.last_successful_run);
    const apolloHoursSinceSuccess = apolloConfig?.last_successful_run
      ? (Date.now() - new Date(apolloConfig.last_successful_run)) / 3600000
      : null;
    // Health window aligned with daily-digest getApolloHealth(): only treat as
    // stalled when we've actually had a successful pull AND it's >18h old.
    // A freshly-enabled config with no success history is "pending", not stalled.
    const apolloPending = apolloEnabled && apolloHoursSinceSuccess === null;
    const apolloStalled = apolloEnabled && apolloHoursSinceSuccess !== null && apolloHoursSinceSuccess > 18;
    const apolloBadgeHtml = !apolloConfigLoaded
      ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:12px;background:rgba(148,163,184,0.1);border:1px solid rgba(148,163,184,0.25);color:var(--text-muted);font-size:12px;font-weight:600;">
           <span style="width:7px;height:7px;border-radius:50%;background:var(--text-muted);display:inline-block;"></span>
           Discovery — unavailable
         </span>`
      : apolloEnabled
      ? (apolloStalled
        ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:12px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.4);color:#fbbf24;font-size:12px;font-weight:600;" title="No new leads in 18+ hours — check API key, balance, or recent error logs">
             <span style="width:7px;height:7px;border-radius:50%;background:#fbbf24;display:inline-block;"></span>
             ⚠ Discovery Stalled${apolloLastRun ? ' · last attempt ' + apolloLastRun : ''}
           </span>`
        : apolloPending
        ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:12px;background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.35);color:#7dd3fc;font-size:12px;font-weight:600;" title="Enabled — waiting for first successful pull">
             <span style="width:7px;height:7px;border-radius:50%;background:#7dd3fc;display:inline-block;"></span>
             Discovery Pending${apolloLastRun ? ' · last attempt ' + apolloLastRun : ' · no cycles run yet'}
           </span>`
        : `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:12px;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.4);color:#4ade80;font-size:12px;font-weight:600;">
             <span style="width:7px;height:7px;border-radius:50%;background:#4ade80;display:inline-block;"></span>
             Discovery Active${apolloLastRun ? ' · last run ' + apolloLastRun : ''}
           </span>`)
      : `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:12px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);color:#f87171;font-size:12px;font-weight:600;">
           <span style="width:7px;height:7px;border-radius:50%;background:#f87171;display:inline-block;"></span>
           Discovery Disabled
         </span>
         <button class="btn btn-sm" onclick="globalThis.enableApolloDiscovery()" style="font-size:12px;padding:3px 10px;background:var(--accent-blue,#2563eb);color:#fff;border:none;">Enable Discovery</button>`;
    // Action buttons rendered next to the Apollo discovery badge — Run Now,
    // Settings, and Pause are only meaningful when discovery is enabled, so
    // they only appear in that state.
    const apolloActionsHtml = apolloConfigLoaded && apolloEnabled
      ? `<button class="btn btn-sm" onclick="globalThis.runApolloNow()" title="Trigger one Apollo discovery cycle now" style="font-size:12px;padding:3px 10px;background:var(--accent-gold,#d4a843);color:#000;border:none;">Run Now</button>
         <button class="btn btn-sm" onclick="globalThis.showApolloSettings()" title="Edit Apollo discovery settings" style="font-size:12px;padding:3px 10px;"><span class="icon-inline" data-icon="settings"></span> Settings</button>
         <button class="btn btn-sm" onclick="globalThis.disableApolloDiscovery()" title="Pause scheduled Apollo discovery" style="font-size:12px;padding:3px 10px;">Pause</button>`
      : '';
    const apolloHealthHtml = apolloConfigLoaded && apolloEnabled
      ? `<span style="font-size:11px;color:${apolloStalled ? '#fbbf24' : 'var(--text-muted)'};margin-left:4px;">
           ${apolloLastSuccess
             ? `Last successful pull: ${apolloLastSuccess}${apolloConfig?.last_successful_added ? ` (+${apolloConfig.last_successful_added} leads` + (apolloConfig.last_successful_profile ? ` · ${escapeHtml(apolloConfig.last_successful_profile)}` : '') + ')' : ''}`
             : 'No successful pulls recorded yet'}
         </span>`
      : '';
    panel.innerHTML = `
      <div class="engine-status-row">
        <div class="engine-status-left">
          <span class="engine-dot ${isRunning ? 'running' : 'paused'}"></span>
          <div>
            <strong class="engine-label">${isRunning ? 'Engine Running' : 'Engine Paused'}</strong>
            <span class="engine-sublabel">${isRunning ? 'Last cycle: ' + lastCycleText : pausedText}${outreachState.pause_reason ? ' — ' + outreachState.pause_reason : ''}</span>
            ${autoSendOn ? '<span style="color:var(--accent-green,#4ade80);font-size:12px;margin-left:8px;">Auto-send active</span>' : '<span style="color:var(--text-muted);font-size:12px;margin-left:8px;">Auto-send off (manual approval)</span>'}
          </div>
        </div>
        <div class="engine-counters">
          <div class="engine-counter"><span class="counter-value">${(outreachState.total_leads_discovered || 0).toLocaleString()}</span><span class="counter-label">Leads Found</span></div>
          <div class="engine-counter"><span class="counter-value">${(outreachState.drafts_in_queue || 0).toLocaleString()}</span><span class="counter-label">Drafts in Queue</span></div>
          <div class="engine-counter"><span class="counter-value">${(outreachState.total_messages_sent || 0).toLocaleString()}</span><span class="counter-label">Messages Sent</span></div>
        </div>
        <div class="engine-controls">
          <label class="engine-toggle">
            <input type="checkbox" ${isRunning ? 'checked' : ''} onchange="globalThis.toggleOutreachEngine(this.checked)">
            <span class="toggle-slider"></span>
            <span class="toggle-text">${isRunning ? 'Active' : 'Paused'}</span>
          </label>
          <button class="btn btn-sm" onclick="globalThis.showEngineSettings()" title="Engine Settings"><span class="icon-inline" data-icon="settings"></span></button>
          <button class="btn btn-sm" onclick="globalThis.runManualCycle()" title="Run Cycle Now"><span class="icon-inline" data-icon="refresh-cw"></span></button>
          <button class="btn btn-sm" onclick="globalThis.enrichLeadContacts()" title="Enrich Lead Contacts" style="background:var(--accent-gold,#d4a843);color:#000"><span class="icon-inline" data-icon="search"></span> Enrich Contacts</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;margin-top:4px;background:var(--bg-elevated,#1a1f2e);border-radius:8px;border:1px solid var(--border-subtle,#2a3040);flex-wrap:wrap;">
        <span style="font-size:12px;color:var(--text-muted);font-weight:500;">Apollo Discovery:</span>
        ${apolloBadgeHtml}
        ${apolloActionsHtml}
        ${apolloHealthHtml}
        ${apolloConfigLoaded && !apolloEnabled ? `<span style="font-size:11px;color:var(--text-muted);margin-left:4px;">After enabling, also add <code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:3px;">&#123;&#123;ref_link&#125;&#125;</code> as a variable in your <a href="https://app.instantly.ai/app/campaigns" target="_blank" rel="noopener noreferrer" style="color:var(--accent-blue,#2563eb);text-decoration:underline;">Instantly.ai campaign template</a> to track provider signups.</span>` : ''}
      </div>
      ${renderEngineDiagnostics(outreachState.diagnostics)}
    `;
    if (typeof initInlineIcons !== 'undefined') initInlineIcons(panel);
  }

  async function toggleOutreachEngine(enable) {
    if (!enable) {
      const reason = prompt('Reason for pausing (optional):');
      const res = await outreachFetch('/engine-toggle', {
        method: 'POST',
        body: JSON.stringify({ is_running: false, pause_reason: reason || null })
      });
      if (res.ok && typeof showToast !== 'undefined') showToast('Engine paused');
    } else {
      const res = await outreachFetch('/engine-toggle', {
        method: 'POST',
        body: JSON.stringify({ is_running: true })
      });
      if (res.ok && typeof showToast !== 'undefined') showToast('Engine resumed');
    }
    await loadEngineState();
  }

  async function runManualCycle() {
    if (typeof showToast !== 'undefined') showToast('Running engine cycle...');
    const res = await outreachFetch('/engine-cycle', { method: 'POST' });
    const data = await res.json();
    if (data.skipped) {
      if (typeof showToast !== 'undefined') showToast('Cycle skipped — engine is paused', 'error');
    } else {
      if (typeof showToast !== 'undefined') showToast(`Cycle complete: ${data.scored || 0} scored, ${data.drafted || 0} drafted, ${data.auto_sent || 0} sent`);
    }
    await loadEngineState();
    await loadCurrentTab();
  }

  async function enrichLeadContacts() {
    if (typeof showToast !== 'undefined') showToast('Enriching lead contacts (this may take a minute)...');
    try {
      const res = await outreachFetch('/enrich-leads', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        if (typeof showToast !== 'undefined') showToast(`Enriched ${data.enriched} of ${data.total} leads with contact info`);
      } else {
        if (typeof showToast !== 'undefined') showToast('Enrichment failed', 'error');
      }
    } catch (e) {
      if (typeof showToast !== 'undefined') showToast('Enrichment error: ' + e.message, 'error');
    }
    await loadCurrentTab();
  }
  globalThis.enrichLeadContacts = enrichLeadContacts;

  function showEngineSettings() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'engine-settings-modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:500px;">
        <div class="modal-header"><h3>Engine Settings</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
        <div style="display:flex;flex-direction:column;gap:16px;padding:20px;">
          <div>
            <label style="font-weight:500;display:block;margin-bottom:6px;">Discovery Interval (minutes)</label>
            <input type="number" id="eng-interval" class="form-input" value="${outreachState.discovery_interval_minutes || 30}" min="5" max="1440">
          </div>
          <div>
            <label style="font-weight:500;display:block;margin-bottom:6px;">Max Drafts Per Cycle</label>
            <input type="number" id="eng-max-drafts" class="form-input" value="${outreachState.max_drafts_per_cycle || 20}" min="1" max="100">
          </div>
          <div>
            <label style="font-weight:500;display:block;margin-bottom:6px;">Target Cities (one per line)</label>
            <textarea id="eng-cities" class="form-input" style="min-height:100px;">${(outreachState.target_cities || []).join('\n')}</textarea>
          </div>
          <div>
            <label style="font-weight:500;display:block;margin-bottom:6px;">Search Radius (meters)</label>
            <input type="number" id="eng-radius" class="form-input" value="${outreachState.search_radius_meters || 15000}" min="1000" max="50000">
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg-tertiary,#1a1f2e);border-radius:8px;">
            <label class="engine-toggle" style="margin:0;">
              <input type="checkbox" id="eng-auto-send" ${outreachState.auto_send !== false ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
            <div>
              <label style="font-weight:500;display:block;margin-bottom:2px;cursor:pointer;" for="eng-auto-send">Auto-Send Messages</label>
              <span style="font-size:12px;color:var(--text-muted);">Automatically send outreach to providers and members. Investor messages always require manual approval.</span>
            </div>
          </div>
          <button class="btn btn-primary" onclick="globalThis.saveEngineSettings()">Save Settings</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  async function saveEngineSettings() {
    const cities = document.getElementById('eng-cities').value.split('\n').map(c => c.trim()).filter(Boolean);
    const res = await outreachFetch('/engine-settings', {
      method: 'POST',
      body: JSON.stringify({
        discovery_interval_minutes: Number.parseInt(document.getElementById('eng-interval').value) || 30,
        max_drafts_per_cycle: Number.parseInt(document.getElementById('eng-max-drafts').value) || 20,
        target_cities: cities,
        search_radius_meters: Number.parseInt(document.getElementById('eng-radius').value) || 15000,
        auto_send: document.getElementById('eng-auto-send')?.checked ?? true
      })
    });
    if (res.ok) {
      document.getElementById('engine-settings-modal')?.remove();
      if (typeof showToast !== 'undefined') showToast('Settings saved');
      await loadEngineState();
    }
  }

  function switchOutreachTab(tab) {
    currentOutreachTab = tab;
    document.querySelectorAll('.outreach-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.outreach-panel').forEach(p => p.style.display = 'none');
    const panel = document.getElementById('outreach-' + tab);
    if (panel) panel.style.display = 'block';
    loadCurrentTab();
  }

  async function loadCurrentTab() {
    switch (currentOutreachTab) {
      case 'pipeline': await loadPipeline(); break;
      case 'queue': await loadMessageQueue(); break;
      case 'leads': await loadLeads(); break;
      case 'campaigns': await loadCampaigns(); break;
      case 'analytics': await loadAnalytics(); break;
      case 'funnel': await loadConversionFunnel(); break;
      case 'instantly': await loadInstantlyCampaigns(); break;
    }
  }

  // ------------------------------------------------------------------
  // Task #190 — outreach → application conversion funnel by source.
  // Calls /api/admin/outreach/conversion-report (SQL-driven via the
  // outreach_conversion_report() RPC) and renders a per-source table
  // plus an overall totals row.
  // ------------------------------------------------------------------
  function fmtPct(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '0.0%';
    return n.toFixed(1) + '%';
  }

  function fmtSourceLabel(src) {
    if (!src) return 'Unknown';
    // The SQL function lowercases source for grouping, so we lookup by
    // the lowercase key. Anything unmapped falls back to title-case.
    const key = String(src).toLowerCase();
    const map = {
      google_places:       'Google Places',
      community_discovery: 'Community Discovery',
      crm_reengagement:    'CRM Re-engagement',
      referral_nudge:      'Referral Nudge',
      apollo:              'Apollo',
      hunter:              'Hunter',
      manual:              'Manual',
      csv_import:          'CSV Import',
      unknown:             'Unknown'
    };
    if (map[key]) return map[key];
    return key.split(/[_\s]+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  function resetConversionFunnelDates(days) {
    const fromInput = document.getElementById('funnel-date-from');
    const toInput   = document.getElementById('funnel-date-to');
    if (!fromInput || !toInput) return;
    if (!days) {
      fromInput.value = '';
      toInput.value = '';
    } else {
      const today = new Date();
      const from = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
      const iso = (d) => d.toISOString().slice(0, 10);
      fromInput.value = iso(from);
      toInput.value = iso(today);
    }
    loadConversionFunnel();
  }

  async function loadConversionFunnel() {
    const container = document.getElementById('outreach-funnel-content');
    if (!container) return;
    container.innerHTML = '<div class="loading-spinner" style="padding:40px;text-align:center;"><div style="width:32px;height:32px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto;"></div></div>';

    const dateFrom = document.getElementById('funnel-date-from')?.value || '';
    const dateTo   = document.getElementById('funnel-date-to')?.value || '';
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo)   params.set('date_to',   dateTo);

    let res, data;
    try {
      res = await outreachFetch('/conversion-report' + (params.toString() ? '?' + params.toString() : ''));
      data = await res.json();
    } catch (e) {
      container.innerHTML = `<div class="card" style="padding:24px;color:var(--accent-red,#ef4444);">Failed to load: ${e.message}</div>`;
      return;
    }
    if (!res.ok) {
      const hint = data?.hint ? `<div style="margin-top:8px;font-size:0.82rem;color:var(--text-muted);">${data.hint}</div>` : '';
      container.innerHTML = `<div class="card" style="padding:24px;color:var(--accent-red,#ef4444);">Error: ${data?.error || res.status}${hint}</div>`;
      return;
    }

    const rows = data.by_source || [];
    const totals = data.totals || {};

    const labelEl = document.getElementById('funnel-date-label');
    if (labelEl) {
      const f = data.filter?.date_from;
      const t = data.filter?.date_to;
      labelEl.textContent = (f || t) ? `Filtered: ${f || '—'} → ${t || 'now'}` : 'All time';
    }

    const summaryCards = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:18px;">
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--accent-teal-soft,rgba(45,212,191,0.15));color:var(--accent-teal,#2dd4bf);"><span class="icon-inline" data-icon="users"></span></div>
          <div class="stat-value">${totals.leads_contacted?.toLocaleString() || 0}</div>
          <div class="stat-label">Leads Contacted</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--accent-blue-soft,rgba(99,179,237,0.15));color:var(--accent-blue,#63b3ed);"><span class="icon-inline" data-icon="user-check"></span></div>
          <div class="stat-value">${totals.profiles_created?.toLocaleString() || 0}</div>
          <div class="stat-label">Profiles Created (${fmtPct(totals.lead_to_profile_pct)})</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--accent-gold-soft,rgba(201,168,76,0.15));color:var(--accent-gold,#c9a84c);"><span class="icon-inline" data-icon="file-text"></span></div>
          <div class="stat-value">${totals.provider_applications_submitted?.toLocaleString() || 0}</div>
          <div class="stat-label">Applications Submitted (${fmtPct(totals.profile_to_application_pct)} of profiles)</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--accent-green-soft,rgba(34,197,94,0.15));color:var(--accent-green,#22c55e);"><span class="icon-inline" data-icon="trending-up"></span></div>
          <div class="stat-value">${fmtPct(totals.lead_to_application_pct)}</div>
          <div class="stat-label">Cold Outreach → Application</div>
        </div>
      </div>
    `;

    let tableBody;
    if (!rows.length) {
      tableBody = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:30px;">No outreach leads in this date range.</td></tr>`;
    } else {
      tableBody = rows.map(r => `
        <tr>
          <td><span class="status-badge" style="background:var(--bg-elevated);border:1px solid var(--border-subtle);">${fmtSourceLabel(r.source)}</span></td>
          <td style="text-align:right;font-variant-numeric:tabular-nums;">${(r.leads_contacted || 0).toLocaleString()}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums;">${(r.profiles_created || 0).toLocaleString()}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--accent-blue,#63b3ed);">${fmtPct(r.lead_to_profile_pct)}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums;">${(r.provider_applications_submitted || 0).toLocaleString()}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--accent-gold,#c9a84c);">${fmtPct(r.profile_to_application_pct)}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:var(--accent-green,#22c55e);">${fmtPct(r.lead_to_application_pct)}</td>
        </tr>
      `).join('');
    }

    const totalsRow = rows.length ? `
      <tr style="border-top:2px solid var(--border-subtle);font-weight:600;background:var(--bg-elevated);">
        <td>All sources</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;">${(totals.leads_contacted || 0).toLocaleString()}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;">${(totals.profiles_created || 0).toLocaleString()}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--accent-blue,#63b3ed);">${fmtPct(totals.lead_to_profile_pct)}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;">${(totals.provider_applications_submitted || 0).toLocaleString()}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--accent-gold,#c9a84c);">${fmtPct(totals.profile_to_application_pct)}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:700;color:var(--accent-green,#22c55e);">${fmtPct(totals.lead_to_application_pct)}</td>
      </tr>
    ` : '';

    container.innerHTML = `
      ${summaryCards}
      <div class="card" style="padding:0;overflow:hidden;">
        <div class="card-header" style="padding:14px 18px;border-bottom:1px solid var(--border-subtle);">
          <h2 class="card-title" style="margin:0;"><span class="icon-inline" data-icon="bar-chart-2"></span> Funnel by Outreach Source</h2>
        </div>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:var(--bg-elevated);font-size:0.78rem;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted);">
                <th style="text-align:left;padding:10px 14px;">Source</th>
                <th style="text-align:right;padding:10px 14px;">Leads Contacted</th>
                <th style="text-align:right;padding:10px 14px;">Profiles Created</th>
                <th style="text-align:right;padding:10px 14px;">→ Profile %</th>
                <th style="text-align:right;padding:10px 14px;">Applications</th>
                <th style="text-align:right;padding:10px 14px;">Profile → App %</th>
                <th style="text-align:right;padding:10px 14px;">Lead → App %</th>
              </tr>
            </thead>
            <tbody style="font-size:0.9rem;">
              ${tableBody}
              ${totalsRow}
            </tbody>
          </table>
        </div>
      </div>
    `;
    if (typeof initInlineIcons !== 'undefined') initInlineIcons(container);
  }

  async function loadPipeline() {
    const container = document.getElementById('outreach-pipeline-list');
    if (!container) return;

    const priority = document.getElementById('pipeline-filter-priority')?.value || '';
    const stage = document.getElementById('pipeline-filter-stage')?.value || '';
    const params = new URLSearchParams();
    if (priority) params.set('priority', priority);
    if (stage) params.set('stage', stage);

    container.innerHTML = '<div class="loading-spinner" style="padding:40px;text-align:center;"><div style="width:32px;height:32px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto;"></div></div>';

    const res = await outreachFetch('/pipeline?' + params.toString());
    outreachPipeline = await res.json();

    if (!outreachPipeline.length) {
      container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);"><p>No opportunities in the pipeline yet.</p><p style="margin-top:8px;">Add leads manually or import from Google Places to get started.</p></div>';
      return;
    }

    container.innerHTML = outreachPipeline.map(opp => {
      const lead = opp.outreach_leads || {};
      const isDuplicate = lead.crm_sync_status === 'duplicate';
      const isReengagement = lead.source === 'crm_reengagement';
      return `
        <div class="pipeline-row" style="animation:slideIn 0.3s ease;">
          <div class="pipeline-cell">
            <span class="priority-badge ${opp.priority}">${opp.priority}</span>
          </div>
          <div class="pipeline-cell">
            <strong>${escapeHtml(lead.name || 'Unknown')}</strong>
            <span class="type-badge ${lead.type}">${lead.type || '?'}</span>
            ${isDuplicate ? '<span class="crm-badge duplicate">CRM User</span>' : ''}
            ${isReengagement ? '<span class="crm-badge reengagement">Re-engagement</span>' : ''}
            ${lead.crm_sync_status === 'converted' ? '<span class="crm-badge converted">Converted</span>' : ''}
          </div>
          <div class="pipeline-cell">
            <div class="score-bar"><div class="score-fill" style="width:${opp.opportunity_score}%"></div></div>
            <span class="score-text">${opp.opportunity_score}</span>
          </div>
          <div class="pipeline-cell pipeline-notes">${escapeHtml(opp.ai_notes || '-')}</div>
          <div class="pipeline-cell"><span class="channel-badge">${opp.recommended_channel}</span></div>
          <div class="pipeline-cell"><span class="stage-badge ${opp.stage}">${opp.stage.replaceAll('_', ' ')}</span></div>
          <div class="pipeline-cell">${timeAgo(new Date(opp.added_at))}</div>
          <div class="pipeline-cell" style="display:flex;gap:4px;">
            <button class="btn btn-sm" onclick="globalThis.previewMessage('${lead.id}')" title="Preview message">Preview</button>
            ${!isDuplicate && lead.status !== 'unsubscribed' ? `<button class="btn btn-sm btn-primary" onclick="globalThis.draftForLead('${lead.id}')">Draft</button>` : '<span class="text-muted" title="Cannot draft for CRM duplicates">—</span>'}
          </div>
        </div>
      `;
    }).join('');
  }

  async function loadMessageQueue() {
    const container = document.getElementById('outreach-queue-list');
    if (!container) return;

    container.innerHTML = '<div style="padding:40px;text-align:center;"><div style="width:32px;height:32px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto;"></div></div>';

    const res = await outreachFetch('/messages?status=draft');
    const data = await res.json();
    outreachMessages = data.data || [];

    const bulkBar = document.getElementById('outreach-bulk-bar');
    if (bulkBar) bulkBar.style.display = outreachMessages.length > 1 ? 'flex' : 'none';

    if (!outreachMessages.length) {
      container.innerHTML = '<div style="padding:60px;text-align:center;color:var(--text-muted);"><span class="icon-inline" data-icon="check-circle" style="width:48px;height:48px;opacity:0.4;"></span><p style="margin-top:16px;font-size:1.1rem;">Message queue is empty</p><p>All caught up! New drafts will appear here when the engine generates them.</p></div>';
      if (typeof initInlineIcons !== 'undefined') initInlineIcons(container);
      return;
    }

    container.innerHTML = outreachMessages.map(msg => {
      const lead = msg.outreach_leads || {};
      return `
        <div class="queue-card" id="queue-card-${msg.id}">
          <div class="queue-card-header">
            <div>
              <strong>${escapeHtml(lead.name || 'Unknown')}</strong>
              <span class="type-badge ${lead.type}">${lead.type}</span>
              <span class="channel-badge">${msg.channel}</span>
            </div>
            <span class="text-muted">${timeAgo(new Date(msg.created_at))}</span>
          </div>
          ${msg.subject ? `<div class="queue-subject"><strong>Subject:</strong> ${escapeHtml(msg.subject)}</div>` : ''}
          <div class="queue-body">${escapeHtml(msg.body)}</div>
          <div class="queue-actions">
            <button class="btn btn-sm" onclick="globalThis.toggleEditMessage('${msg.id}')"><span class="icon-inline" data-icon="edit"></span> Edit</button>
            <button class="btn btn-sm btn-danger" onclick="globalThis.skipMessage('${msg.id}')">Skip</button>
            <button class="btn btn-sm btn-primary" onclick="globalThis.approveAndSend('${msg.id}')"><span class="icon-inline" data-icon="send"></span> Approve & Send</button>
          </div>
          <div class="queue-edit-area" id="edit-area-${msg.id}" style="display:none;">
            ${msg.channel === 'email' ? `<input type="text" class="form-input" id="edit-subject-${msg.id}" value="${escapeHtml(msg.subject || '')}" placeholder="Subject" style="margin-bottom:8px;">` : ''}
            <textarea class="form-input" id="edit-body-${msg.id}" style="min-height:120px;">${escapeHtml(msg.body)}</textarea>
            <button class="btn btn-sm btn-primary" onclick="globalThis.saveEditedMessage('${msg.id}')" style="margin-top:8px;">Save Edit</button>
          </div>
        </div>
      `;
    }).join('');
    if (typeof initInlineIcons !== 'undefined') initInlineIcons(container);
  }

  function toggleEditMessage(msgId) {
    const area = document.getElementById('edit-area-' + msgId);
    if (area) area.style.display = area.style.display === 'none' ? 'block' : 'none';
  }

  async function saveEditedMessage(msgId) {
    const body = document.getElementById('edit-body-' + msgId)?.value;
    const subject = document.getElementById('edit-subject-' + msgId)?.value;
    const res = await outreachFetch('/messages/approve', {
      method: 'POST',
      body: JSON.stringify({ message_id: msgId, edited_body: body, edited_subject: subject })
    });
    if (res.ok) {
      const sendRes = await outreachFetch('/messages/send', {
        method: 'POST',
        body: JSON.stringify({ message_id: msgId })
      });
      const sendData = await sendRes.json();
      if (sendData.success) {
        if (typeof showToast !== 'undefined') showToast('Message edited, approved, and sent');
      } else {
        if (typeof showToast !== 'undefined') showToast('Approved but send failed: ' + (sendData.error || 'Unknown error'), 'error');
      }
      await loadMessageQueue();
      await loadEngineState();
    }
  }

  async function approveAndSend(msgId) {
    const res = await outreachFetch('/messages/approve', {
      method: 'POST',
      body: JSON.stringify({ message_id: msgId })
    });
    if (!res.ok) {
      if (typeof showToast !== 'undefined') showToast('Failed to approve message', 'error');
      return;
    }
    const sendRes = await outreachFetch('/messages/send', {
      method: 'POST',
      body: JSON.stringify({ message_id: msgId })
    });
    const sendData = await sendRes.json();
    if (sendData.success) {
      if (typeof showToast !== 'undefined') showToast('Message approved and sent');
      document.getElementById('queue-card-' + msgId)?.remove();
    } else {
      if (typeof showToast !== 'undefined') showToast('Approved but send failed: ' + (sendData.error || 'Unknown'), 'error');
    }
    await loadEngineState();
  }

  async function skipMessage(msgId) {
    await outreachFetch('/messages/skip', {
      method: 'POST',
      body: JSON.stringify({ message_id: msgId })
    });
    document.getElementById('queue-card-' + msgId)?.remove();
    if (typeof showToast !== 'undefined') showToast('Message skipped');
    await loadEngineState();
  }

  async function bulkApproveAll() {
    if (!confirm(`Approve and send all ${outreachMessages.length} messages?`)) return;
    const ids = outreachMessages.map(m => m.id);

    await outreachFetch('/messages/approve-bulk', {
      method: 'POST',
      body: JSON.stringify({ message_ids: ids })
    });

    let sent = 0;
    for (const id of ids) {
      const sendRes = await outreachFetch('/messages/send', {
        method: 'POST',
        body: JSON.stringify({ message_id: id })
      });
      const data = await sendRes.json();
      if (data.success) sent++;
    }

    if (typeof showToast !== 'undefined') showToast(`${sent} of ${ids.length} messages sent`);
    await loadMessageQueue();
    await loadEngineState();
  }

  async function loadLeads() {
    const container = document.getElementById('outreach-leads-list');
    if (!container) return;

    const search = document.getElementById('leads-search')?.value || '';
    const type = document.getElementById('leads-filter-type')?.value || '';
    const status = document.getElementById('leads-filter-status')?.value || '';

    const params = new URLSearchParams({ page: '1', limit: '50' });
    if (search) params.set('search', search);
    if (type) params.set('type', type);
    if (status) params.set('status', status);

    container.innerHTML = '<div style="padding:40px;text-align:center;"><div style="width:32px;height:32px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto;"></div></div>';

    const res = await outreachFetch('/leads?' + params.toString());
    const data = await res.json();
    outreachLeads = data.data || [];

    if (!outreachLeads.length) {
      container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">No leads found.</div>';
      return;
    }

    container.innerHTML = `
      <div class="leads-table-header">
        <div>Name</div><div>Type</div><div>Email</div><div>Location</div><div>Source</div><div>Status</div><div>CRM</div><div>Actions</div>
      </div>
      ${outreachLeads.map(lead => {
        const isDuplicate = lead.crm_sync_status === 'duplicate';
        return `
          <div class="leads-table-row">
            <div><strong>${escapeHtml(lead.name)}</strong></div>
            <div><span class="type-badge ${lead.type}">${lead.type}</span></div>
            <div class="text-truncate">${escapeHtml(lead.email || '-')}</div>
            <div class="text-truncate">${escapeHtml(lead.location || '-')}</div>
            <div><span class="source-badge">${lead.source || '-'}</span></div>
            <div><span class="status-badge ${lead.status}">${lead.status}</span></div>
            <div>
              ${isDuplicate ? '<span class="crm-badge duplicate">Duplicate</span>' : ''}
              ${lead.crm_sync_status === 'linked' ? '<span class="crm-badge linked">Linked</span>' : ''}
              ${lead.crm_sync_status === 'converted' ? '<span class="crm-badge converted">Converted</span>' : ''}
              ${lead.source === 'crm_reengagement' ? '<span class="crm-badge reengagement">Re-engage</span>' : ''}
            </div>
            <div class="leads-actions">
              ${!isDuplicate && lead.status !== 'unsubscribed' ? `<button class="btn btn-xs btn-primary" onclick="globalThis.draftForLead('${lead.id}')">Draft</button>` : ''}
              <button class="btn btn-xs" onclick="globalThis.editLead('${lead.id}')"><span class="icon-inline" data-icon="edit"></span></button>
            </div>
          </div>
        `;
      }).join('')}
    `;
    if (typeof initInlineIcons !== 'undefined') initInlineIcons(container);
  }

  async function draftForLead(leadId) {
    const channel = prompt('Channel? (email or sms)', 'email');
    if (!channel) return;
    if (typeof showToast !== 'undefined') showToast('Drafting message with AI...');
    const res = await outreachFetch('/messages/draft', {
      method: 'POST',
      body: JSON.stringify({ lead_id: leadId, channel })
    });
    const data = await res.json();
    if (res.ok) {
      if (typeof showToast !== 'undefined') showToast('Draft created — check the Queue tab');
    } else {
      if (typeof showToast !== 'undefined') showToast('Draft failed: ' + (data.error || 'Unknown'), 'error');
    }
    await loadEngineState();
  }

  function editLead(leadId) {
    const lead = outreachLeads.find(l => l.id === leadId);
    if (!lead) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'edit-lead-modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:500px;">
        <div class="modal-header"><h3>Edit Lead</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
        <div style="display:flex;flex-direction:column;gap:12px;padding:20px;">
          <div><label style="font-weight:500;display:block;margin-bottom:4px;">Name</label><input type="text" id="edit-lead-name" class="form-input" value="${escapeHtml(lead.name)}"></div>
          <div><label style="font-weight:500;display:block;margin-bottom:4px;">Email</label><input type="text" id="edit-lead-email" class="form-input" value="${escapeHtml(lead.email || '')}"></div>
          <div><label style="font-weight:500;display:block;margin-bottom:4px;">Phone</label><input type="text" id="edit-lead-phone" class="form-input" value="${escapeHtml(lead.phone || '')}"></div>
          <div><label style="font-weight:500;display:block;margin-bottom:4px;">Notes</label><textarea id="edit-lead-notes" class="form-input" style="min-height:80px;">${escapeHtml(lead.notes || '')}</textarea></div>
          <div><label style="font-weight:500;display:block;margin-bottom:4px;">Status</label>
            <select id="edit-lead-status" class="form-input">
              <option value="new" ${lead.status === 'new' ? 'selected' : ''}>New</option>
              <option value="queued" ${lead.status === 'queued' ? 'selected' : ''}>Queued</option>
              <option value="contacted" ${lead.status === 'contacted' ? 'selected' : ''}>Contacted</option>
              <option value="responded" ${lead.status === 'responded' ? 'selected' : ''}>Responded</option>
              <option value="converted" ${lead.status === 'converted' ? 'selected' : ''}>Converted</option>
              <option value="unsubscribed" ${lead.status === 'unsubscribed' ? 'selected' : ''}>Unsubscribed</option>
              <option value="dead" ${lead.status === 'dead' ? 'selected' : ''}>Dead</option>
            </select>
          </div>
          <button class="btn btn-primary" onclick="globalThis.saveLead('${lead.id}')">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  async function saveLead(leadId) {
    const res = await outreachFetch('/leads/' + leadId, {
      method: 'PUT',
      body: JSON.stringify({
        name: document.getElementById('edit-lead-name').value,
        email: document.getElementById('edit-lead-email').value || null,
        phone: document.getElementById('edit-lead-phone').value || null,
        notes: document.getElementById('edit-lead-notes').value || null,
        status: document.getElementById('edit-lead-status').value
      })
    });
    if (res.ok) {
      document.getElementById('edit-lead-modal')?.remove();
      if (typeof showToast !== 'undefined') showToast('Lead updated');
      await loadLeads();
    }
  }

  function showAddLeadModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'add-lead-modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:500px;">
        <div class="modal-header"><h3>Add Lead</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
        <div style="display:flex;flex-direction:column;gap:12px;padding:20px;">
          <div><label style="font-weight:500;display:block;margin-bottom:4px;">Type *</label>
            <select id="new-lead-type" class="form-input"><option value="provider">Provider</option><option value="member">Member</option><option value="investor">Investor</option></select>
          </div>
          <div><label style="font-weight:500;display:block;margin-bottom:4px;">Name *</label><input type="text" id="new-lead-name" class="form-input" placeholder="Business or person name"></div>
          <div><label style="font-weight:500;display:block;margin-bottom:4px;">Email</label><input type="email" id="new-lead-email" class="form-input"></div>
          <div><label style="font-weight:500;display:block;margin-bottom:4px;">Phone</label><input type="tel" id="new-lead-phone" class="form-input"></div>
          <div><label style="font-weight:500;display:block;margin-bottom:4px;">Company</label><input type="text" id="new-lead-company" class="form-input"></div>
          <div><label style="font-weight:500;display:block;margin-bottom:4px;">Location</label><input type="text" id="new-lead-location" class="form-input" placeholder="City, State"></div>
          <div><label style="font-weight:500;display:block;margin-bottom:4px;">Notes</label><textarea id="new-lead-notes" class="form-input" style="min-height:60px;"></textarea></div>
          <button class="btn btn-primary" onclick="globalThis.submitNewLead()">Add Lead</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  async function submitNewLead() {
    const name = document.getElementById('new-lead-name').value;
    const type = document.getElementById('new-lead-type').value;
    if (!name) { if (typeof showToast !== 'undefined') showToast('Name is required', 'error'); return; }

    const res = await outreachFetch('/leads', {
      method: 'POST',
      body: JSON.stringify({
        type,
        name,
        email: document.getElementById('new-lead-email').value || null,
        phone: document.getElementById('new-lead-phone').value || null,
        company: document.getElementById('new-lead-company').value || null,
        location: document.getElementById('new-lead-location').value || null,
        notes: document.getElementById('new-lead-notes').value || null
      })
    });
    const data = await res.json();
    if (res.ok) {
      document.getElementById('add-lead-modal')?.remove();
      if (typeof showToast !== 'undefined') showToast('Lead added');
      await loadLeads();
    } else {
      if (typeof showToast !== 'undefined') showToast(data.error || 'Failed to add lead', 'error');
    }
  }

  function showImportModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'import-modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:600px;">
        <div class="modal-header"><h3>Import Leads</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
        <div style="padding:20px;">
          <div style="display:flex;gap:8px;margin-bottom:16px;">
            <button class="btn btn-sm active" id="import-tab-places" onclick="globalThis.switchImportTab('places')">Google Places</button>
            <button class="btn btn-sm" id="import-tab-csv" onclick="globalThis.switchImportTab('csv')">CSV Upload</button>
          </div>
          <div id="import-places-panel">
            <div style="display:flex;flex-direction:column;gap:12px;">
              <div><label style="font-weight:500;display:block;margin-bottom:4px;">City / Address</label><input type="text" id="import-location" class="form-input" placeholder="e.g., Newark, NJ"></div>
              <div><label style="font-weight:500;display:block;margin-bottom:4px;">Radius</label>
                <select id="import-radius" class="form-input">
                  <option value="8045">5 miles</option>
                  <option value="16090" selected>10 miles</option>
                  <option value="40234">25 miles</option>
                </select>
              </div>
              <button class="btn btn-primary" onclick="globalThis.importFromPlaces()">Search & Import</button>
              <div id="import-places-result"></div>
            </div>
          </div>
          <div id="import-csv-panel" style="display:none;">
            <div style="display:flex;flex-direction:column;gap:12px;">
              <p style="color:var(--text-muted);font-size:0.9rem;">CSV columns: name, type (member/provider/investor), email, phone, company, location, notes</p>
              <input type="file" id="import-csv-file" accept=".csv" class="form-input" onchange="globalThis.previewCSV(this)">
              <div id="import-csv-preview"></div>
              <button class="btn btn-primary" id="import-csv-btn" onclick="globalThis.importCSV()" style="display:none;">Import</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function switchImportTab(tab) {
    document.getElementById('import-places-panel').style.display = tab === 'places' ? 'block' : 'none';
    document.getElementById('import-csv-panel').style.display = tab === 'csv' ? 'block' : 'none';
    document.getElementById('import-tab-places').classList.toggle('active', tab === 'places');
    document.getElementById('import-tab-csv').classList.toggle('active', tab === 'csv');
  }

  async function importFromPlaces() {
    const location = document.getElementById('import-location').value;
    if (!location) { if (typeof showToast !== 'undefined') showToast('Enter a location', 'error'); return; }
    const radius = document.getElementById('import-radius').value;
    const resultDiv = document.getElementById('import-places-result');
    resultDiv.innerHTML = '<p style="color:var(--text-muted);">Searching...</p>';

    const res = await outreachFetch('/leads/import-places', {
      method: 'POST',
      body: JSON.stringify({ location, radius_meters: Number.parseInt(radius) })
    });
    const data = await res.json();
    if (res.ok) {
      resultDiv.innerHTML = `<p style="color:var(--accent-green);">Imported ${data.imported} new leads from ${escapeHtml(location)}</p>`;
      if (typeof showToast !== 'undefined') showToast(`${data.imported} leads imported`);
    } else {
      resultDiv.innerHTML = `<p style="color:var(--accent-red);">${escapeHtml(data.error || 'Import failed')}</p>`;
    }
  }

  let csvData = [];

  function previewCSV(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      const lines = e.target.result.split('\n').filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      csvData = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map(v => v.trim());
        const row = {};
        headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
        if (row.name) csvData.push(row);
      }
      const preview = document.getElementById('import-csv-preview');
      preview.innerHTML = `<p>${csvData.length} leads found. Preview:</p><div style="max-height:200px;overflow-y:auto;font-size:0.85rem;">` +
        csvData.slice(0, 5).map(r => `<div style="padding:4px 0;border-bottom:1px solid var(--border-subtle);">${escapeHtml(r.name)} — ${r.type || 'provider'} — ${r.email || 'no email'}</div>`).join('') +
        (csvData.length > 5 ? `<div style="padding:4px 0;color:var(--text-muted);">...and ${csvData.length - 5} more</div>` : '') +
        '</div>';
      document.getElementById('import-csv-btn').style.display = 'block';
    };
    reader.readAsText(file);
  }

  async function importCSV() {
    if (!csvData.length) return;
    const leads = csvData.map(r => ({
      name: r.name,
      type: r.type || 'provider',
      email: r.email || null,
      phone: r.phone || null,
      company: r.company || null,
      location: r.location || null,
      notes: r.notes || null
    }));

    const res = await outreachFetch('/leads/import-csv', {
      method: 'POST',
      body: JSON.stringify({ leads })
    });
    const data = await res.json();
    if (res.ok) {
      if (typeof showToast !== 'undefined') showToast(`Imported ${data.imported} leads (${data.duplicates} duplicates skipped)`);
      document.getElementById('import-modal')?.remove();
      await loadLeads();
    }
  }

  async function loadCampaigns() {
    const container = document.getElementById('outreach-campaigns-list');
    if (!container) return;

    const res = await outreachFetch('/campaigns');
    outreachCampaigns = await res.json();

    if (!outreachCampaigns.length) {
      container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">No campaigns yet. Create one to organize your outreach.</div>';
      return;
    }

    container.innerHTML = outreachCampaigns.map(c => `
      <div class="campaign-card">
        <div class="campaign-header">
          <strong>${escapeHtml(c.name)}</strong>
          <span class="status-badge ${c.status}">${c.status}</span>
        </div>
        <div class="campaign-meta">
          <span class="type-badge ${c.target_type}">${c.target_type}</span>
          <span class="channel-badge">${c.channel}</span>
          <span class="text-muted">${new Date(c.created_at).toLocaleDateString()}</span>
        </div>
        <div class="campaign-actions">
          ${c.status === 'active' ? `<button class="btn btn-xs" onclick="globalThis.pauseCampaign('${c.id}')">Pause</button>` : `<button class="btn btn-xs" onclick="globalThis.resumeCampaign('${c.id}')">Resume</button>`}
        </div>
      </div>
    `).join('');
  }

  function showCreateCampaignModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'create-campaign-modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:500px;">
        <div class="modal-header"><h3>Create Campaign</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
        <div style="display:flex;flex-direction:column;gap:12px;padding:20px;">
          <div><label style="font-weight:500;display:block;margin-bottom:4px;">Campaign Name *</label><input type="text" id="camp-name" class="form-input" placeholder="e.g., NJ Auto Shops Q1"></div>
          <div><label style="font-weight:500;display:block;margin-bottom:4px;">Target Type *</label>
            <select id="camp-type" class="form-input"><option value="provider">Provider</option><option value="member">Member</option><option value="investor">Investor</option></select>
          </div>
          <div><label style="font-weight:500;display:block;margin-bottom:4px;">Channel *</label>
            <select id="camp-channel" class="form-input"><option value="email">Email</option><option value="sms">SMS</option><option value="both">Both</option></select>
          </div>
          <div><label style="font-weight:500;display:block;margin-bottom:4px;">Message Template (optional)</label><textarea id="camp-template" class="form-input" style="min-height:60px;" placeholder="Custom instructions for AI drafting..."></textarea></div>
          <button class="btn btn-primary" onclick="globalThis.submitCampaign()">Create Campaign</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  async function submitCampaign() {
    const name = document.getElementById('camp-name').value;
    if (!name) { if (typeof showToast !== 'undefined') showToast('Name is required', 'error'); return; }
    const res = await outreachFetch('/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        name,
        target_type: document.getElementById('camp-type').value,
        channel: document.getElementById('camp-channel').value,
        message_template: document.getElementById('camp-template').value || null
      })
    });
    if (res.ok) {
      document.getElementById('create-campaign-modal')?.remove();
      if (typeof showToast !== 'undefined') showToast('Campaign created');
      await loadCampaigns();
    }
  }

  async function pauseCampaign(id) {
    await outreachFetch('/campaigns/' + id, { method: 'PUT', body: JSON.stringify({ status: 'paused' }) });
    await loadCampaigns();
  }

  async function resumeCampaign(id) {
    await outreachFetch('/campaigns/' + id, { method: 'PUT', body: JSON.stringify({ status: 'active' }) });
    await loadCampaigns();
  }

  async function loadAnalytics() {
    const container = document.getElementById('outreach-analytics-content');
    if (!container) return;

    const res = await outreachFetch('/analytics');
    const data = await res.json();

    const ab = data.ab_test_results || { A: {}, B: {} };
    const cb = data.ai_circuit_breaker || {};

    container.innerHTML = `
      ${data.high_volume_warning ? '<div class="outreach-warning" style="background:var(--accent-gold);color:#000;padding:12px;border-radius:8px;margin-bottom:16px;font-weight:500;">High send volume detected. Monitor deliverability.</div>' : ''}
      ${cb.paused_until ? '<div class="outreach-warning" style="background:#ef4444;color:#fff;padding:12px;border-radius:8px;margin-bottom:16px;font-weight:500;">AI Circuit Breaker Active — AI calls paused until ' + new Date(cb.paused_until).toLocaleTimeString() + '</div>' : ''}
      <div class="analytics-cards">
        <div class="analytics-card"><span class="analytics-value">${data.total_leads?.toLocaleString() || 0}</span><span class="analytics-label">Total Leads</span></div>
        <div class="analytics-card"><span class="analytics-value">${data.messages_sent?.toLocaleString() || 0}</span><span class="analytics-label">Messages Sent</span></div>
        <div class="analytics-card"><span class="analytics-value">${data.open_rate || '0.0%'}</span><span class="analytics-label">Open Rate</span></div>
        <div class="analytics-card"><span class="analytics-value">${data.click_rate || '0.0%'}</span><span class="analytics-label">Click Rate</span></div>
        <div class="analytics-card"><span class="analytics-value">${data.bounce_rate || '0.0%'}</span><span class="analytics-label">Bounce Rate</span></div>
        <div class="analytics-card"><span class="analytics-value">${data.responded?.toLocaleString() || 0}</span><span class="analytics-label">Responses</span></div>
        <div class="analytics-card"><span class="analytics-value">${data.pending_approval?.toLocaleString() || 0}</span><span class="analytics-label">Pending Approval</span></div>
        <div class="analytics-card"><span class="analytics-value">${data.conversions?.toLocaleString() || 0}</span><span class="analytics-label">Conversions</span></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px;">
        <div class="card" style="padding:20px;">
          <h3 style="margin-bottom:12px;">Leads by Type</h3>
          <div class="type-breakdown">
            <div class="breakdown-row"><span class="type-badge provider">Provider</span><span>${data.type_breakdown?.provider || 0}</span></div>
            <div class="breakdown-row"><span class="type-badge member">Member</span><span>${data.type_breakdown?.member || 0}</span></div>
            <div class="breakdown-row"><span class="type-badge investor">Investor</span><span>${data.type_breakdown?.investor || 0}</span></div>
          </div>
        </div>
        <div class="card" style="padding:20px;">
          <h3 style="margin-bottom:12px;">Status Funnel</h3>
          <div class="status-funnel">
            ${Object.entries(data.status_funnel || {}).map(([status, count]) =>
              `<div class="funnel-row"><span class="status-badge ${status}">${status}</span><span>${count}</span></div>`
            ).join('')}
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px;">
        <div class="card" style="padding:20px;">
          <h3 style="margin-bottom:12px;">A/B Subject Line Results</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="text-align:center;padding:12px;background:rgba(201,168,76,0.1);border-radius:8px;">
              <div style="font-size:22px;font-weight:700;color:var(--accent-gold);">${ab.A.open_rate || 'N/A'}</div>
              <div style="font-size:13px;color:#9ca3af;margin-top:4px;">Variant A (${ab.A.sent || 0} sent)</div>
            </div>
            <div style="text-align:center;padding:12px;background:rgba(99,179,237,0.1);border-radius:8px;">
              <div style="font-size:22px;font-weight:700;color:#63b3ed;">${ab.B.open_rate || 'N/A'}</div>
              <div style="font-size:13px;color:#9ca3af;margin-top:4px;">Variant B (${ab.B.sent || 0} sent)</div>
            </div>
          </div>
        </div>
        <div class="card" style="padding:20px;">
          <h3 style="margin-bottom:12px;">Warmup & Deliverability</h3>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div class="breakdown-row"><span style="color:#9ca3af;">Daily Limit</span><span>${data.warmup_daily_limit || 100}</span></div>
            <div class="breakdown-row"><span style="color:#9ca3af;">Sent Today</span><span>${data.sent_today || 0}</span></div>
            <div class="breakdown-row"><span style="color:#9ca3af;">Bounced</span><span style="color:${(data.bounced || 0) > 0 ? '#ef4444' : 'inherit'}">${data.bounced || 0}</span></div>
            <div class="breakdown-row"><span style="color:#9ca3af;">Bounce Rate</span><span style="color:${Number.parseFloat(data.bounce_rate) > 5 ? '#ef4444' : 'inherit'}">${data.bounce_rate || '0.0%'}</span></div>
          </div>
        </div>
      </div>
    `;
  }

  function setupOutreachRealtime() {
    if (typeof globalThis.supabaseClient === 'undefined') return;
    try {
      if (realtimeChannel) globalThis.supabaseClient.removeChannel(realtimeChannel);
      realtimeChannel = globalThis.supabaseClient
        .channel('outreach-engine-state')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'engine_state' }, () => {
          loadEngineState();
        })
        .subscribe();

      if (pipelineChannel) globalThis.supabaseClient.removeChannel(pipelineChannel);
      pipelineChannel = globalThis.supabaseClient
        .channel('outreach-pipeline')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'opportunity_pipeline' }, () => {
          if (currentOutreachTab === 'pipeline') loadPipeline();
          if (typeof showToast !== 'undefined') showToast('New opportunity discovered');
        })
        .subscribe();
    } catch (e) {
      console.log('Outreach realtime setup skipped:', e.message);
    }
  }

  async function loadOutreachHistory(profileId) {
    try {
      const res = await outreachFetch('/history/' + profileId);
      const data = await res.json();
      return data;
    } catch (e) {
      return { lead: null, messages: [] };
    }
  }

  function renderOutreachHistoryPanel(containerId, profileId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    loadOutreachHistory(profileId).then(data => {
      if (!data.lead) {
        container.innerHTML = '<div class="outreach-history-empty" style="padding:12px;color:var(--text-muted);font-size:0.9rem;">No outreach history — joined organically.</div>';
        return;
      }

      const lead = data.lead;
      const messages = data.messages || [];
      container.innerHTML = `
        <details class="outreach-history-details">
          <summary style="cursor:pointer;font-weight:600;padding:8px 0;">Outreach History</summary>
          <div style="padding:8px 0;">
            <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px;font-size:0.9rem;">
              <span>Source: <strong>${lead.source}</strong></span>
              <span>First contact: <strong>${new Date(lead.created_at).toLocaleDateString()}</strong></span>
              <span>Status: <strong>${lead.status}</strong></span>
            </div>
            ${messages.length === 0 ? '<p style="color:var(--text-muted);">No messages sent yet.</p>' :
              messages.map(msg => `
                <div style="padding:8px;margin-bottom:8px;background:var(--bg-elevated);border-radius:6px;font-size:0.9rem;">
                  <div style="display:flex;justify-content:space-between;">
                    <span><strong>${msg.channel.toUpperCase()}</strong> ${msg.subject ? '— ' + escapeHtml(msg.subject) : ''}</span>
                    <span class="status-badge ${msg.status}">${msg.status}</span>
                  </div>
                  <div style="color:var(--text-muted);font-size:0.85rem;margin-top:4px;">${new Date(msg.created_at).toLocaleDateString()}</div>
                </div>
              `).join('')
            }
          </div>
        </details>
      `;
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  }

  function timeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
  }

  async function importFromPlacesInline() {
    const location = document.getElementById('import-location-inline')?.value;
    if (!location) { if (typeof showToast !== 'undefined') showToast('Enter a location', 'error'); return; }
    const radius = document.getElementById('import-radius-inline')?.value || '16090';
    const resultDiv = document.getElementById('import-places-result-inline');
    if (resultDiv) resultDiv.innerHTML = '<p style="color:var(--text-muted);">Searching...</p>';

    const res = await outreachFetch('/leads/import-places', {
      method: 'POST',
      body: JSON.stringify({ location, radius_meters: Number.parseInt(radius) })
    });
    const data = await res.json();
    if (resultDiv) {
      if (res.ok) {
        resultDiv.innerHTML = `<p style="color:var(--accent-green);">Imported ${data.imported} new leads from ${escapeHtml(location)}</p>`;
        if (typeof showToast !== 'undefined') showToast(`${data.imported} leads imported`);
      } else {
        resultDiv.innerHTML = `<p style="color:var(--accent-red);">${escapeHtml(data.error || 'Import failed')}</p>`;
      }
    }
  }

  function previewCSVInline(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      const lines = e.target.result.split('\n').filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      csvData = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map(v => v.trim());
        const row = {};
        headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
        if (row.name) csvData.push(row);
      }
      const preview = document.getElementById('import-csv-preview-inline');
      if (preview) {
        preview.innerHTML = `<p>${csvData.length} leads found. Preview:</p><div style="max-height:200px;overflow-y:auto;font-size:0.85rem;">` +
          csvData.slice(0, 5).map(r => `<div style="padding:4px 0;border-bottom:1px solid var(--border-subtle);">${escapeHtml(r.name)} — ${r.type || 'provider'} — ${r.email || 'no email'}</div>`).join('') +
          (csvData.length > 5 ? `<div style="padding:4px 0;color:var(--text-muted);">...and ${csvData.length - 5} more</div>` : '') +
          '</div>';
      }
      const btn = document.getElementById('import-csv-btn-inline');
      if (btn) btn.style.display = 'block';
    };
    reader.readAsText(file);
  }

  globalThis.outreachFetch = outreachFetch;
  async function previewMessage(leadId) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'preview-message-modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:700px;">
        <div class="modal-header"><h3>Message Preview</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
        <div style="padding:20px;text-align:center;"><div style="width:32px;height:32px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto;"></div><p style="margin-top:12px;color:var(--text-muted);">Generating preview with AI...</p></div>
      </div>
    `;
    document.body.appendChild(modal);

    try {
      const res = await outreachFetch('/preview-message', {
        method: 'POST',
        body: JSON.stringify({ lead_id: leadId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview failed');

      const content = modal.querySelector('.modal-content');
      const lead = data.lead || {};
      content.innerHTML = `
        <div class="modal-header"><h3>Message Preview — ${escapeHtml(lead.name || 'Unknown')}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
        <div style="padding:20px;">
          <div style="margin-bottom:8px;color:var(--text-muted);font-size:13px;">${escapeHtml(lead.type || '')} · ${escapeHtml(lead.location || '')}${lead.email ? ' · ' + escapeHtml(lead.email) : ''}${lead.phone ? ' · ' + escapeHtml(lead.phone) : ''}</div>
          ${data.email ? `
            <div style="margin-bottom:24px;">
              <h4 style="color:var(--accent-gold);margin-bottom:8px;">Email Preview</h4>
              <div style="background:var(--bg-tertiary,#1a1f2e);border-radius:8px;padding:16px;">
                <div style="font-weight:600;margin-bottom:8px;color:var(--text-primary);">Subject: ${escapeHtml(data.email.subject || '')}</div>
                <div style="white-space:pre-wrap;font-size:14px;line-height:1.6;color:var(--text-secondary);">${escapeHtml(data.email.body)}</div>
              </div>
            </div>
          ` : '<p style="color:var(--text-muted);">No email preview (no email address)</p>'}
          ${data.sms ? `
            <div>
              <h4 style="color:var(--accent-gold);margin-bottom:8px;">SMS Preview</h4>
              <div style="background:var(--bg-tertiary,#1a1f2e);border-radius:8px;padding:16px;">
                <div style="white-space:pre-wrap;font-size:14px;line-height:1.6;color:var(--text-secondary);">${escapeHtml(data.sms.body)}</div>
              </div>
            </div>
          ` : '<p style="color:var(--text-muted);">No SMS preview (no phone number)</p>'}
        </div>
      `;
    } catch (e) {
      const content = modal.querySelector('.modal-content');
      content.innerHTML = `
        <div class="modal-header"><h3>Preview Error</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button></div>
        <div style="padding:20px;color:var(--text-muted);">${escapeHtml(e.message)}</div>
      `;
    }
  }

  globalThis.previewMessage = previewMessage;
  globalThis.initOutreachEngine = initOutreachEngine;
  async function clearAndRedraft() {
    if (!confirm('This will delete all unsent draft messages and re-draft them using the latest template. Already-sent messages are not affected. Continue?')) return;
    if (typeof showToast !== 'undefined') showToast('Clearing old drafts and re-drafting...');
    try {
      const res = await outreachFetch('/clear-and-redraft', { method: 'POST', body: '{}' });
      const data = await res.json();
      if (data.success) {
        if (typeof showToast !== 'undefined') showToast(`Cleared ${data.cleared} old drafts. New messages drafted and sending.`);
        await loadMessageQueue();
        await loadEngineState();
      } else {
        if (typeof showToast !== 'undefined') showToast('Failed to clear and re-draft', 'error');
      }
    } catch (e) {
      if (typeof showToast !== 'undefined') showToast('Error: ' + e.message, 'error');
    }
  }

  async function runCycleNow() {
    if (typeof showToast !== 'undefined') showToast('Running outreach cycle...');
    try {
      const res = await outreachFetch('/engine-cycle', { method: 'POST', body: '{}' });
      const data = await res.json();
      const drafted = data.drafted || 0;
      const autoSent = data.auto_sent || 0;
      if (typeof showToast !== 'undefined') showToast(`Cycle complete: ${drafted} drafted, ${autoSent} auto-sent`);
      await loadMessageQueue();
      await loadEngineState();
    } catch (e) {
      if (typeof showToast !== 'undefined') showToast('Error: ' + e.message, 'error');
    }
  }

  async function syncLeadsToInstantly() {
    const btn = document.getElementById('instantly-sync-btn');
    const resultDiv = document.getElementById('instantly-sync-result');
    const campaignId = document.getElementById('instantly-sync-campaign')?.value?.trim() || '';
    const limit = Number.parseInt(document.getElementById('instantly-sync-limit')?.value) || 500;
    if (btn) btn.disabled = true;
    if (btn) btn.innerHTML = '<span class="icon-inline" data-icon="loader"></span> Syncing...';
    resultDiv.style.display = 'none';
    try {
      const payload = { limit };
      if (campaignId) payload.campaign_id = campaignId;
      const res = await outreachFetch('/instantly-sync', { method: 'POST', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Sync failed: ' + res.status);
      const data = await res.json();
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = `<strong>Sync Complete:</strong> ${data.synced || 0} leads synced to Instantly.ai` +
        (data.errors ? `<br><span style="color:var(--accent-red);">Errors: ${data.errors.join(', ')}</span>` : '') +
        (data.message ? `<br>${data.message}` : '');
      if (typeof showToast !== 'undefined') showToast(`${data.synced || 0} leads synced to Instantly.ai`);
    } catch (e) {
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = `<span style="color:var(--accent-red);">Error: ${e.message}</span>`;
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="icon-inline" data-icon="send"></span> Sync Leads Now'; }
  }

  async function createInstantlyCampaign() {
    const name = document.getElementById('instantly-campaign-name')?.value?.trim();
    const resultDiv = document.getElementById('instantly-campaign-result');
    if (!name) { if (typeof showToast !== 'undefined') showToast('Campaign name is required', 'error'); return; }
    try {
      const res = await outreachFetch('/instantly-campaign', { method: 'POST', body: JSON.stringify({ name }) });
      if (!res.ok) throw new Error('Campaign creation failed: ' + res.status);
      const data = await res.json();
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = `<strong>Campaign Created!</strong><br>ID: <code style="user-select:all;">${data.campaign?.id || 'unknown'}</code><br>Name: ${data.campaign?.name || name}`;
      if (typeof showToast !== 'undefined') showToast('Instantly campaign created');
    } catch (e) {
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = `<span style="color:var(--accent-red);">Error: ${e.message}</span>`;
    }
  }

  async function loadInstantlyCampaigns() {
    const container = document.getElementById('instantly-campaigns-list');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:20px;"><div style="width:32px;height:32px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto;"></div></div>';
    try {
      const campaignsRes = await outreachFetch('/instantly-campaigns', { method: 'GET' });
      if (!campaignsRes.ok) throw new Error('Failed to load campaigns: ' + campaignsRes.status);
      const data = await campaignsRes.json();
      const campaigns = data.items || data.data || data || [];
      if (!Array.isArray(campaigns) || campaigns.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">No campaigns found in Instantly.ai</p>';
        return;
      }
      let analyticsData = {};
      try {
        const analyticsRes = await outreachFetch('/instantly-analytics', { method: 'GET' });
        const analytics = analyticsRes.ok ? await analyticsRes.json() : {};
        const analyticsArray = analytics.data || analytics || [];
        if (Array.isArray(analyticsArray)) {
          analyticsArray.forEach(a => { analyticsData[a.campaign_id || a.id] = a; });
        }
      } catch { /* Intentionally silent */ }
      let html = '<div style="display:flex;flex-direction:column;gap:12px;">';
      campaigns.forEach(c => {
        const stats = analyticsData[c.id] || {};
        html += `<div style="padding:16px;background:var(--bg-input);border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <strong>${c.name || 'Unnamed'}</strong>
            <span style="font-size:0.8rem;padding:2px 8px;border-radius:12px;background:${c.status === 1 ? 'var(--accent-green)' : 'var(--bg-elevated)'};color:${c.status === 1 ? 'white' : 'var(--text-muted)'};">${c.status === 1 ? 'Active' : c.status === 0 ? 'Draft' : 'Paused'}</span>
          </div>
          <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;">ID: <code style="user-select:all;">${c.id}</code></div>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;text-align:center;font-size:0.85rem;">
            <div><div style="font-weight:600;">${stats.leads_count || stats.total_leads || '-'}</div><div style="color:var(--text-muted);font-size:0.75rem;">Leads</div></div>
            <div><div style="font-weight:600;">${stats.sent || stats.emails_sent || '-'}</div><div style="color:var(--text-muted);font-size:0.75rem;">Sent</div></div>
            <div><div style="font-weight:600;">${stats.open || stats.opened || '-'}</div><div style="color:var(--text-muted);font-size:0.75rem;">Opened</div></div>
            <div><div style="font-weight:600;">${stats.reply || stats.replied || '-'}</div><div style="color:var(--text-muted);font-size:0.75rem;">Replied</div></div>
            <div><div style="font-weight:600;">${stats.bounce || stats.bounced || '-'}</div><div style="color:var(--text-muted);font-size:0.75rem;">Bounced</div></div>
          </div>
        </div>`;
      });
      html += '</div>';
      container.innerHTML = html;
    } catch (e) {
      container.innerHTML = `<p style="color:var(--accent-red);text-align:center;padding:20px;">Error loading campaigns: ${e.message}</p>`;
    }
  }

  async function generateWeeklyCalendar() {
    const btn = document.getElementById('generate-calendar-btn');
    const output = document.getElementById('social-calendar-output');
    const weekStart = document.getElementById('calendar-week-start')?.value || '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="icon-inline" data-icon="loader"></span> Generating...'; }
    output.innerHTML = '<div style="text-align:center;padding:40px;"><div style="width:32px;height:32px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto;"></div><p style="margin-top:12px;color:var(--text-muted);">Generating 28 posts across 7 days...</p></div>';
    try {
      const calRes = await outreachFetch('/social-calendar', { method: 'POST', body: JSON.stringify({ week_start_date: weekStart || undefined }) });
      if (!calRes.ok) throw new Error('Calendar generation failed: ' + calRes.status);
      const data = await calRes.json();
      if (data.parse_error) {
        output.innerHTML = `<div style="padding:16px;"><p style="color:var(--accent-red);">AI returned invalid JSON. Raw response:</p><pre style="white-space:pre-wrap;font-size:0.85rem;max-height:400px;overflow-y:auto;padding:12px;background:var(--bg-input);border-radius:var(--radius-md);">${data.raw || 'No response'}</pre></div>`;
        return;
      }
      const days = data.days || [];
      let html = '<div style="display:flex;flex-direction:column;gap:16px;">';
      const platformIcons = { x: '𝕏', facebook: '📘', instagram: '📸', linkedin: '💼' };
      days.forEach(day => {
        html += `<div style="padding:16px;background:var(--bg-input);border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <strong style="font-size:1.1rem;">${day.day}</strong>
            <span style="font-size:0.85rem;padding:4px 12px;border-radius:12px;background:var(--bg-elevated);color:var(--text-secondary);">${day.theme}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">`;
        ['x', 'facebook', 'instagram', 'linkedin'].forEach(platform => {
          const post = day.posts?.[platform] || '';
          const escapedPost = post.replaceAll('\'', "\\'").replace(/\n/g, "\\n");
          html += `<div style="padding:12px;background:var(--bg-elevated);border-radius:var(--radius-sm);border:1px solid var(--border-subtle);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-weight:600;font-size:0.85rem;">${platformIcons[platform] || ''} ${platform.charAt(0).toUpperCase() + platform.slice(1)}</span>
              <button class="btn btn-sm" onclick="navigator.clipboard.writeText('${escapedPost}');if(typeof showToast!=='undefined')showToast('Copied!');"><span class="icon-inline" data-icon="clipboard"></span></button>
            </div>
            <p style="font-size:0.85rem;color:var(--text-secondary);white-space:pre-wrap;margin:0;">${post}</p>
          </div>`;
        });
        html += '</div></div>';
      });
      html += '</div>';
      output.innerHTML = html;
      if (typeof showToast !== 'undefined') showToast(`Generated ${days.length * 4} posts for ${days.length} days`);
    } catch (e) {
      output.innerHTML = `<p style="color:var(--accent-red);text-align:center;padding:20px;">Error: ${e.message}</p>`;
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="icon-inline" data-icon="zap"></span> Generate Week'; }
  }

  async function generateSocialProofContent() {
    const btn = document.getElementById('generate-proof-btn');
    const output = document.getElementById('social-proof-output');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="icon-inline" data-icon="loader"></span> Generating...'; }
    output.innerHTML = '<div style="text-align:center;padding:40px;"><div style="width:32px;height:32px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto;"></div><p style="margin-top:12px;color:var(--text-muted);">Querying live stats and generating content...</p></div>';
    try {
      const proofRes = await outreachFetch('/social-proof', { method: 'POST', body: '{}' });
      if (!proofRes.ok) throw new Error('Social proof generation failed: ' + proofRes.status);
      const data = await proofRes.json();
      if (data.parse_error) {
        output.innerHTML = `<div style="padding:16px;"><p style="color:var(--accent-red);">AI returned invalid JSON. Raw response:</p><pre style="white-space:pre-wrap;font-size:0.85rem;max-height:400px;overflow-y:auto;padding:12px;background:var(--bg-input);border-radius:var(--radius-md);">${data.raw || 'No response'}</pre></div>`;
        return;
      }
      const stats = data.stats || {};
      const content = data.content || [];
      let html = '';
      if (stats) {
        html += `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:20px;padding:16px;background:var(--bg-input);border-radius:var(--radius-md);">
          <div style="text-align:center;"><div style="font-size:1.5rem;font-weight:700;">${stats.providers || 0}</div><div style="font-size:0.8rem;color:var(--text-muted);">Providers</div></div>
          <div style="text-align:center;"><div style="font-size:1.5rem;font-weight:700;">${stats.members || 0}</div><div style="font-size:0.8rem;color:var(--text-muted);">Members</div></div>
          <div style="text-align:center;"><div style="font-size:1.5rem;font-weight:700;">${(stats.leads_discovered || 0).toLocaleString()}</div><div style="font-size:0.8rem;color:var(--text-muted);">Leads</div></div>
          <div style="text-align:center;"><div style="font-size:1.5rem;font-weight:700;">${stats.messages_sent || 0}</div><div style="font-size:0.8rem;color:var(--text-muted);">Messages</div></div>
          <div style="text-align:center;"><div style="font-size:1.5rem;font-weight:700;">${stats.cities_served || 0}</div><div style="font-size:0.8rem;color:var(--text-muted);">Cities</div></div>
        </div>`;
      }
      const platformIcons = { x: '𝕏', facebook: '📘', instagram: '📸', linkedin: '💼', email_signature: '✉️' };
      content.forEach(item => {
        html += `<div style="padding:16px;background:var(--bg-input);border-radius:var(--radius-md);border:1px solid var(--border-subtle);margin-bottom:16px;">
          <h3 style="margin:0 0 12px 0;font-size:1rem;">${item.category}</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">`;
        Object.entries(item.posts || {}).forEach(([platform, post]) => {
          const escapedPost = (post || '').replaceAll('\'', "\\'").replace(/\n/g, "\\n");
          html += `<div style="padding:12px;background:var(--bg-elevated);border-radius:var(--radius-sm);border:1px solid var(--border-subtle);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-weight:600;font-size:0.85rem;">${platformIcons[platform] || ''} ${platform.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
              <button class="btn btn-sm" onclick="navigator.clipboard.writeText('${escapedPost}');if(typeof showToast!=='undefined')showToast('Copied!');"><span class="icon-inline" data-icon="clipboard"></span></button>
            </div>
            <p style="font-size:0.85rem;color:var(--text-secondary);white-space:pre-wrap;margin:0;">${post || ''}</p>
          </div>`;
        });
        html += '</div></div>';
      });
      output.innerHTML = html;
      if (typeof showToast !== 'undefined') showToast('Social proof content generated from live stats');
    } catch (e) {
      output.innerHTML = `<p style="color:var(--accent-red);text-align:center;padding:20px;">Error: ${e.message}</p>`;
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="icon-inline" data-icon="zap"></span> Generate from Real Stats'; }
  }

  globalThis.syncLeadsToInstantly = syncLeadsToInstantly;
  globalThis.createInstantlyCampaign = createInstantlyCampaign;
  globalThis.loadInstantlyCampaigns = loadInstantlyCampaigns;
  globalThis.generateWeeklyCalendar = generateWeeklyCalendar;
  globalThis.generateSocialProofContent = generateSocialProofContent;
  globalThis.clearAndRedraft = clearAndRedraft;
  globalThis.runCycleNow = runCycleNow;
  globalThis.toggleOutreachEngine = toggleOutreachEngine;
  globalThis.runManualCycle = runManualCycle;
  globalThis.showEngineSettings = showEngineSettings;
  globalThis.saveEngineSettings = saveEngineSettings;
  globalThis.enableApolloDiscovery = enableApolloDiscovery;
  globalThis.disableApolloDiscovery = disableApolloDiscovery;
  globalThis.runApolloNow = runApolloNow;
  globalThis.showApolloSettings = showApolloSettings;
  globalThis.saveApolloSettings = saveApolloSettings;
  globalThis.loadApolloConfig = loadApolloConfig;
  globalThis.switchOutreachTab = switchOutreachTab;
  globalThis.draftForLead = draftForLead;
  globalThis.editLead = editLead;
  globalThis.saveLead = saveLead;
  globalThis.showAddLeadModal = showAddLeadModal;
  globalThis.submitNewLead = submitNewLead;
  globalThis.showImportModal = showImportModal;
  globalThis.switchImportTab = switchImportTab;
  globalThis.importFromPlaces = importFromPlaces;
  globalThis.importFromPlacesInline = importFromPlacesInline;
  globalThis.previewCSV = previewCSV;
  globalThis.previewCSVInline = previewCSVInline;
  globalThis.importCSV = importCSV;
  globalThis.approveAndSend = approveAndSend;
  globalThis.skipMessage = skipMessage;
  globalThis.bulkApproveAll = bulkApproveAll;
  globalThis.toggleEditMessage = toggleEditMessage;
  globalThis.saveEditedMessage = saveEditedMessage;
  globalThis.showCreateCampaignModal = showCreateCampaignModal;
  globalThis.submitCampaign = submitCampaign;
  globalThis.pauseCampaign = pauseCampaign;
  globalThis.resumeCampaign = resumeCampaign;
  globalThis.renderOutreachHistoryPanel = renderOutreachHistoryPanel;
  globalThis.loadConversionFunnel = loadConversionFunnel;
  globalThis.resetConversionFunnelDates = resetConversionFunnelDates;

  // ===================================================================
  // Task #243 — Facebook Page admin OAuth picker
  // -------------------------------------------------------------------
  // Three-state card on the outreach panel:
  //   1. Disconnected — "Connect Facebook Page" button
  //   2. Picking      — dropdown of Pages returned by /me/accounts
  //   3. Connected    — current Page name + ID + "Disconnect"
  //
  // Auto-enters the "Picking" state when /admin.html loads with
  // ?picking=facebook-page (the OAuth callback redirect).
  // ===================================================================

  function fbHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const adminTeamToken = localStorage.getItem('mcc_admin_team_token');
    const adminPass = localStorage.getItem('mcc_admin_pass');
    if (adminTeamToken) headers['x-admin-token'] = adminTeamToken;
    else if (adminPass) headers['x-admin-password'] = adminPass;
    return headers;
  }

  async function fbApi(method, endpoint, body) {
    const opts = { method, headers: fbHeaders() };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`/api/admin/facebook${endpoint}`, opts);
    let json = null;
    try { json = await res.json(); } catch { /* Intentionally silent */ }
    return { ok: res.ok, status: res.status, json: json || {} };
  }

  function fbEscape(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // Inline card-level banner replacing browser alert()s. `kind` is
  // 'error' | 'warn' | 'info'. The banner is prepended to the card body
  // so it survives connected/disconnected re-renders (which preserve
  // existing innerHTML) and gets cleared on the next renderFacebookPageCard().
  function fbFlash(message, kind) {
    const body = document.getElementById('fb-page-card-body');
    if (!body) return;
    fbClearFlash();
    const palette = {
      error: { border: 'var(--accent-red,#c0392b)', bg: 'rgba(192,57,43,0.08)' },
      warn:  { border: 'var(--accent-gold)',         bg: 'rgba(184,148,45,0.08)' },
      info:  { border: 'var(--accent-blue,#3498db)', bg: 'rgba(52,152,219,0.08)' }
    };
    const c = palette[kind] || palette.error;
    const banner = document.createElement('div');
    banner.className = 'fb-flash';
    banner.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    banner.style.cssText = `padding:10px 14px;border-left:3px solid ${c.border};background:${c.bg};margin-bottom:12px;border-radius:4px;color:var(--text-default);font-size:14px;`;
    banner.textContent = String(message);
    body.insertBefore(banner, body.firstChild);
  }

  function fbClearFlash() {
    const body = document.getElementById('fb-page-card-body');
    if (!body) return;
    body.querySelectorAll('.fb-flash').forEach(el => el.remove());
  }

  function fbCardEl() {
    return document.getElementById('facebook-page-connection-card');
  }

  function fbReadFlashError() {
    try {
      const params = new URLSearchParams(window.location.search);
      const err = params.get('fb_error');
      if (err) {
        params.delete('fb_error');
        const qs = params.toString();
        const newUrl = window.location.pathname + (qs ? '?' + qs : '');
        window.history.replaceState({}, '', newUrl);
        return err;
      }
    } catch { /* Intentionally silent */ }
    return null;
  }

  function fbIsPicking() {
    try {
      return new URLSearchParams(window.location.search).get('picking') === 'facebook-page';
    } catch (_) { return false; }
  }

  function fbClearPickingParam() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has('picking')) {
        params.delete('picking');
        const qs = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''));
      }
    } catch { /* Intentionally silent */ }
  }

  async function initFacebookPageConnection() {
    const card = fbCardEl();
    if (!card) return;
    const flashError = fbReadFlashError();
    card.innerHTML = `
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
        <h2 class="card-title" style="margin:0;">Facebook Page Connection</h2>
        <span style="font-size:12px;color:var(--text-muted);">App Review · pages_show_list</span>
      </div>
      <div id="fb-page-card-body" style="padding:16px;">
        <div style="color:var(--text-muted);">Loading…</div>
      </div>
    `;
    if (flashError) {
      const body = document.getElementById('fb-page-card-body');
      body.innerHTML = `<div class="fb-flash" role="alert" style="padding:10px 14px;border-left:3px solid var(--accent-red,#c0392b);background:rgba(192,57,43,0.08);margin-bottom:12px;border-radius:4px;color:var(--text-default);font-size:14px;"><strong>Facebook OAuth error:</strong> ${fbEscape(flashError)}</div>` + body.innerHTML;
    }
    await renderFacebookPageCard({ preserveFlash: true });
  }

  async function renderFacebookPageCard(opts) {
    const body = document.getElementById('fb-page-card-body');
    if (!body) return;
    // Clear stale inline banners from prior actions unless the caller
    // explicitly asked to keep them (e.g. a fresh OAuth-callback flash).
    if (!(opts?.preserveFlash)) fbClearFlash();

    // 1. Schema/connection check
    const conn = await fbApi('GET', '/connection');
    if (!conn.ok) {
      body.innerHTML = `<div style="color:var(--accent-red,#c0392b);">Failed to load connection (HTTP ${conn.status}). ${fbEscape(conn.json.error || '')}</div>`;
      return;
    }
    if (conn.json.schema_missing) {
      body.innerHTML = `
        <div style="padding:16px;border-left:3px solid var(--accent-gold);background:rgba(184,148,45,0.08);border-radius:4px;">
          <strong>Database table not yet created.</strong>
          <p style="margin:8px 0 4px;color:var(--text-muted);">Open the Supabase SQL Editor and apply:</p>
          <pre style="background:var(--bg-elevated);padding:8px 12px;border-radius:4px;display:inline-block;font-size:13px;">supabase/migrations/20260429e_facebook_page_connections.sql</pre>
        </div>
      `;
      return;
    }

    // 2. If returning from OAuth callback, attempt to load the Pages list
    if (fbIsPicking()) {
      const pending = await fbApi('GET', '/pending-pages');
      if (pending.ok && Array.isArray(pending.json.pages) && pending.json.pages.length > 0) {
        renderFacebookPicker(body, pending.json.pages, conn.json.connection);
        return;
      }
      // Expired or empty — fall through to default state and clear the param
      fbClearPickingParam();
      if (pending.json.expired) {
        body.innerHTML = `<div style="padding:12px;border-left:3px solid var(--accent-gold);background:rgba(184,148,45,0.08);margin-bottom:12px;border-radius:4px;">Page list expired. Please reconnect.</div>`;
      } else if (pending.ok && pending.json.pages && pending.json.pages.length === 0) {
        body.innerHTML = `<div style="padding:12px;border-left:3px solid var(--accent-gold);background:rgba(184,148,45,0.08);margin-bottom:12px;border-radius:4px;">Your Facebook account doesn't manage any Pages. Create one on facebook.com first, then try again.</div>`;
      }
    }

    // 3. Render connected vs disconnected state
    const c = conn.json.connection;
    if (c) {
      renderFacebookConnected(body, c);
    } else {
      renderFacebookDisconnected(body);
    }
  }

  function renderFacebookDisconnected(body) {
    const existing = body.innerHTML; // preserve any flash banner
    body.innerHTML = existing + `
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <div style="flex:1;min-width:240px;">
          <p style="margin:0 0 6px;color:var(--text-default);">No Facebook Page is connected yet.</p>
          <p style="margin:0;color:var(--text-muted);font-size:13px;">Connect a Page to satisfy Meta App Review for the <code>pages_show_list</code> permission. You'll be sent to facebook.com to authorize, then returned here to pick which Page to use.</p>
        </div>
        <button class="btn btn-primary" id="fb-connect-btn" onclick="globalThis.startFacebookPageConnect()">
          <span class="icon-inline" data-icon="link"></span> Connect Facebook Page
        </button>
      </div>
    `;
    if (typeof initInlineIcons !== 'undefined') initInlineIcons(body);
  }

  function renderFacebookPicker(body, pages, currentConn) {
    const opts = pages.map(p => `<option value="${fbEscape(p.id)}">${fbEscape(p.name)}${p.category ? ' — ' + fbEscape(p.category) : ''} (${fbEscape(p.id)})</option>`).join('');
    body.innerHTML = `
      <div>
        <p style="margin:0 0 12px;color:var(--text-default);">
          Pick the Facebook Page to associate with My Car Concierge.
          ${currentConn ? `<br><span style="color:var(--text-muted);font-size:13px;">Currently connected: <strong>${fbEscape(currentConn.page_name)}</strong> (${fbEscape(currentConn.page_id)}). Selecting a new Page replaces it.</span>` : ''}
        </p>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <select id="fb-page-select" class="form-input" style="flex:1;min-width:280px;">${opts}</select>
          <button class="btn btn-primary" onclick="globalThis.confirmFacebookPagePick()">
            <span class="icon-inline" data-icon="check"></span> Use this Page
          </button>
          <button class="btn" onclick="globalThis.cancelFacebookPagePick()">Cancel</button>
        </div>
      </div>
    `;
    if (typeof initInlineIcons !== 'undefined') initInlineIcons(body);
  }

  function renderFacebookConnected(body, c) {
    const existing = body.innerHTML;
    const when = c.connected_at ? new Date(c.connected_at).toLocaleString() : '—';
    const who = c.connected_by_email || (c.connected_by_user_id ? c.connected_by_user_id : 'env-admin');
    body.innerHTML = existing + `
      <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;">
        <div style="flex:1;min-width:260px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span class="icon-inline" data-icon="check-circle" style="color:#27ae60;"></span>
            <strong style="font-size:15px;">${fbEscape(c.page_name)}</strong>
          </div>
          <div style="color:var(--text-muted);font-size:13px;line-height:1.6;">
            <div>Page ID: <code>${fbEscape(c.page_id)}</code></div>
            <div>Connected by: ${fbEscape(who)}</div>
            <div>Connected at: ${fbEscape(when)}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button class="btn" onclick="globalThis.startFacebookPageConnect()">
            <span class="icon-inline" data-icon="refresh-cw"></span> Change Page
          </button>
          <button class="btn" onclick="globalThis.disconnectFacebookPage()" style="color:var(--accent-red,#c0392b);">
            <span class="icon-inline" data-icon="x-circle"></span> Disconnect
          </button>
        </div>
      </div>
    `;
    if (typeof initInlineIcons !== 'undefined') initInlineIcons(body);
  }

  async function startFacebookPageConnect() {
    const btn = document.getElementById('fb-connect-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Opening Facebook…'; }
    const res = await fbApi('POST', '/oauth-start');
    if (!res.ok || !res.json.oauth_url) {
      const msg = res.json.error || `Failed to start OAuth (HTTP ${res.status})`;
      fbFlash('Could not start Facebook OAuth: ' + msg, 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '<span class="icon-inline" data-icon="link"></span> Connect Facebook Page'; }
      return;
    }
    window.location.href = res.json.oauth_url;
  }

  async function confirmFacebookPagePick() {
    const sel = document.getElementById('fb-page-select');
    if (!sel || !sel.value) {
      fbFlash('Please pick a Page from the list above.', 'warn');
      return;
    }
    const res = await fbApi('POST', '/select-page', { page_id: sel.value });
    if (!res.ok) {
      fbFlash('Failed to save selection: ' + (res.json.error || `HTTP ${res.status}`), 'error');
      return;
    }
    fbClearPickingParam();
    await renderFacebookPageCard();
  }

  function cancelFacebookPagePick() {
    fbClearPickingParam();
    renderFacebookPageCard();
  }

  async function disconnectFacebookPage() {
    if (!confirm('Disconnect the current Facebook Page? You can reconnect at any time.')) return;
    const res = await fbApi('POST', '/disconnect');
    if (!res.ok) {
      fbFlash('Failed to disconnect: ' + (res.json.error || `HTTP ${res.status}`), 'error');
      return;
    }
    await renderFacebookPageCard();
  }

  globalThis.startFacebookPageConnect = startFacebookPageConnect;
  globalThis.confirmFacebookPagePick = confirmFacebookPagePick;
  globalThis.cancelFacebookPagePick = cancelFacebookPagePick;
  globalThis.disconnectFacebookPage = disconnectFacebookPage;
  globalThis.initFacebookPageConnection = initFacebookPageConnection;

  // Auto-switch to the marketing-outreach panel when returning from the
  // Facebook OAuth callback. The OAuth callback redirects to
  // /admin.html?picking=facebook-page; admin.js doesn't read URL params
  // for tab routing, so we trigger showSection() ourselves once the
  // sidebar nav is available.
  (function fbAutoSwitchOnCallbackReturn() {
    if (!fbIsPicking()) return;
    let attempts = 0;
    function tryActivate() {
      attempts++;
      if (typeof globalThis.showSection === 'function' &&
          document.querySelector('.nav-item[data-section="marketing-outreach"]') &&
          document.getElementById('marketing-outreach')) {
        try { globalThis.showSection('marketing-outreach'); }
        catch (e) { console.warn('[FB Page] showSection failed:', e); }
        return;
      }
      if (attempts < 60) setTimeout(tryActivate, 250);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(tryActivate, 500));
    } else {
      setTimeout(tryActivate, 500);
    }
  })();
})();

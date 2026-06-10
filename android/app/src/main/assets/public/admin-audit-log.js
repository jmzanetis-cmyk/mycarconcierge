// ============================================================================
// admin-audit-log.js
//
// Task #330 — generic "Admin Audit Log" viewer.
//
// Extends the Apollo-only audit viewer from Task #275 to surface every
// admin_audit_log row (provider suspends/activates, application
// approvals/rejections, adjust_bid_credits, concierge job state changes,
// user role flips, etc.) on the new admin.html "Audit Log" section.
//
// Exposes (on globalThis) so the existing Apollo card in admin-outreach.js
// can reuse the same friendly-label renderer:
//
//   describeAuditRow(row)         -> { label, summary }
//   formatAuditTimestamp(iso)     -> "YYYY-MM-DD ... (Nm ago)" html
//   loadAdminAuditLog()           -> populates #admin-audit-list
//   adminAuditLogEscapeHtml(str)  -> shared HTML escaper
//
// Read-only — the panel only renders rows the server returns; all auditable
// state changes still go through the existing privileged endpoints.
// ============================================================================

(function () {
  'use strict';

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function formatAuditTimestamp(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const diffMs = Date.now() - d.getTime();
      const diffMin = Math.round(diffMs / 60000);
      let rel;
      if (diffMin < 1) rel = 'just now';
      else if (diffMin < 60) rel = diffMin + 'm ago';
      else if (diffMin < 1440) rel = Math.round(diffMin / 60) + 'h ago';
      else rel = Math.round(diffMin / 1440) + 'd ago';
      return `${d.toLocaleString()} <span style="color:var(--text-muted);">(${rel})</span>`;
    } catch (_e) { return escapeHtml(iso); }
  }

  // Truncate a free-form value so the row stays one line on a normal viewport.
  function truncate(s, n) {
    s = String(s);
    return s.length > n ? s.slice(0, n - 3) + '...' : s;
  }

  // Render a metadata dict as `key=value` chips. Used as a generic fallback
  // for rows whose action we don't have a hand-written template for.
  function renderMetaChips(meta) {
    if (!meta || typeof meta !== 'object') return '';
    const keys = Object.keys(meta);
    if (keys.length === 0) return '';
    const parts = keys.slice(0, 8).map(k => {
      const v = meta[k];
      let display;
      if (v === null || v === '') display = '(empty)';
      else if (typeof v === 'boolean') display = v ? 'true' : 'false';
      else if (Array.isArray(v)) display = v.length ? `[${v.length}]` : '[]';
      else if (typeof v === 'object') display = '{...}';
      else display = truncate(String(v), 60);
      return `<code style="font-size:0.78rem;">${escapeHtml(k)}</code>=<span style="color:var(--text-secondary);">${escapeHtml(display)}</span>`;
    });
    return `<div style="margin-top:4px;font-size:0.82rem;line-height:1.6;">${parts.join('  &middot;  ')}</div>`;
  }

  // Friendly per-action templates. Anything not listed falls through to the
  // generic chip renderer below. Templates return { label, summary } where
  // label may contain pre-escaped HTML (so it can use <strong>) and summary
  // is the secondary line of context.
  function describeAuditRow(row) {
    const meta = (row && row.metadata) || {};
    const action = row && row.action;
    switch (action) {
      // ---- Apollo (Task #275, mirrored from admin-outreach.js) -----------
      case 'update_apollo_config': {
        const updates = meta.updates || {};
        const keys = Object.keys(updates);
        let headline = 'Apollo settings updated';
        if (Object.prototype.hasOwnProperty.call(updates, 'enabled')) {
          headline = updates.enabled === true
            ? 'Apollo discovery <strong style="color:var(--success);">ENABLED</strong>'
            : 'Apollo discovery <strong style="color:var(--danger,#dc2626);">DISABLED</strong>';
        }
        const parts = keys.map(k => {
          const v = updates[k];
          let display;
          if (Array.isArray(v)) display = v.length ? v.join(', ') : '(empty)';
          else if (v === null || v === '') display = '(cleared)';
          else if (typeof v === 'boolean') display = v ? 'on' : 'off';
          else display = String(v);
          if (display.length > 60) display = display.slice(0, 57) + '...';
          return `<code style="font-size:0.78rem;">${escapeHtml(k)}</code>=<span style="color:var(--text-secondary);">${escapeHtml(display)}</span>`;
        });
        const summary = parts.length ? `<div style="margin-top:4px;font-size:0.82rem;line-height:1.6;">${parts.join('  &middot;  ')}</div>` : '';
        return { label: headline, summary };
      }
      case 'apollo_run_now':
        return { label: 'Manual Apollo discovery run triggered', summary: '' };
      case 'apollo_manual_search': {
        const found = meta.found != null ? meta.found : '?';
        const withEmail = meta.with_email != null ? meta.with_email : '?';
        const page = meta.page != null ? meta.page : '?';
        return {
          label: 'Manual Apollo search executed',
          summary: `<div style="margin-top:4px;font-size:0.82rem;color:var(--text-secondary);">Page ${escapeHtml(page)} &middot; <strong>${escapeHtml(found)}</strong> people found, <strong>${escapeHtml(withEmail)}</strong> with email</div>`
        };
      }
      case 'apollo_manual_enrich': {
        const total = meta.total != null ? meta.total : '?';
        const enriched = meta.enriched != null ? meta.enriched : '?';
        const failed = meta.failed != null ? meta.failed : '?';
        return {
          label: 'Manual Apollo enrichment run',
          summary: `<div style="margin-top:4px;font-size:0.82rem;color:var(--text-secondary);">Processed <strong>${escapeHtml(total)}</strong> leads &middot; <strong style="color:var(--success);">${escapeHtml(enriched)}</strong> enriched &middot; <strong style="color:var(--danger,#dc2626);">${escapeHtml(failed)}</strong> failed</div>`
        };
      }
      case 'apollo_lock_force_cleared':
        return {
          label: 'Apollo discovery lock force-cleared',
          summary: meta.success === false
            ? '<div style="margin-top:4px;font-size:0.82rem;color:var(--danger,#dc2626);">Clear attempt failed</div>'
            : ''
        };

      // ---- Provider lifecycle (provider-admin.js) ------------------------
      case 'suspend_provider':
        return {
          label: 'Provider <strong style="color:var(--danger,#dc2626);">SUSPENDED</strong>',
          summary: row.reason
            ? `<div style="margin-top:4px;font-size:0.82rem;color:var(--text-secondary);">Reason: ${escapeHtml(truncate(row.reason, 200))}</div>`
            : ''
        };
      case 'autosuspend_low_rated':
        return {
          label: 'Provider <strong style="color:var(--danger,#dc2626);">auto-suspended</strong> (low rating)',
          summary: row.reason
            ? `<div style="margin-top:4px;font-size:0.82rem;color:var(--text-secondary);">${escapeHtml(truncate(row.reason, 200))}</div>`
            : ''
        };
      case 'activate_provider':
        return { label: 'Provider <strong style="color:var(--success);">reactivated</strong>', summary: '' };
      case 'check_low_rated': {
        const threshold = meta.threshold != null ? meta.threshold : '?';
        const found = meta.found != null ? meta.found : '?';
        const autosuspend = meta.autosuspend ? ' &middot; autosuspend ON' : '';
        return {
          label: 'Low-rated provider sweep',
          summary: `<div style="margin-top:4px;font-size:0.82rem;color:var(--text-secondary);">Threshold &lt; <strong>${escapeHtml(threshold)}</strong> &middot; <strong>${escapeHtml(found)}</strong> providers matched${autosuspend}</div>`
        };
      }
      case 'adjust_bid_credits': {
        const delta = meta.delta != null ? meta.delta : '?';
        const before = meta.before != null ? meta.before : '?';
        const after = meta.after != null ? meta.after : '?';
        const sign = typeof delta === 'number' && delta > 0 ? '+' : '';
        const color = typeof delta === 'number' && delta < 0 ? 'var(--danger,#dc2626)' : 'var(--success)';
        return {
          label: `Bid credits adjusted <strong style="color:${color};">${escapeHtml(sign + delta)}</strong>`,
          summary: `<div style="margin-top:4px;font-size:0.82rem;color:var(--text-secondary);">${escapeHtml(before)} &rarr; <strong>${escapeHtml(after)}</strong>${row.reason ? ' &middot; ' + escapeHtml(truncate(row.reason, 120)) : ''}</div>`
        };
      }
      case 'update_user_role': {
        const before = meta.before || {};
        const after = meta.after || {};
        const beforeRole = before.role || '—';
        const afterRole = after.role || '—';
        const changed = beforeRole !== afterRole
          ? `<strong>${escapeHtml(beforeRole)}</strong> &rarr; <strong>${escapeHtml(afterRole)}</strong>`
          : `role unchanged (<strong>${escapeHtml(afterRole)}</strong>)`;
        const dualBits = [];
        ['also_member', 'also_provider', 'is_also_member', 'is_also_provider', 'is_founding_provider'].forEach(k => {
          if (k in after && before[k] !== after[k]) {
            dualBits.push(`${k}=${after[k] ? 'on' : 'off'}`);
          }
        });
        const dual = dualBits.length ? ` &middot; ${escapeHtml(dualBits.join(', '))}` : '';
        return {
          label: 'User role updated',
          summary: `<div style="margin-top:4px;font-size:0.82rem;color:var(--text-secondary);">${changed}${dual}</div>`
        };
      }

      // ---- Provider applications (provider-application-review.js) --------
      case 'approve_provider_application':
        return {
          label: 'Provider application <strong style="color:var(--success);">approved</strong>',
          summary: meta.business_name
            ? `<div style="margin-top:4px;font-size:0.82rem;color:var(--text-secondary);">${escapeHtml(truncate(meta.business_name, 80))}</div>`
            : ''
        };
      case 'reject_provider_application':
        return {
          label: 'Provider application <strong style="color:var(--danger,#dc2626);">rejected</strong>',
          summary: row.reason
            ? `<div style="margin-top:4px;font-size:0.82rem;color:var(--text-secondary);">Reason: ${escapeHtml(truncate(row.reason, 200))}</div>`
            : (meta.business_name ? `<div style="margin-top:4px;font-size:0.82rem;color:var(--text-secondary);">${escapeHtml(truncate(meta.business_name, 80))}</div>` : '')
        };
      case 'request_application_info':
        return {
          label: 'Requested more info on provider application',
          summary: meta.info_requested
            ? `<div style="margin-top:4px;font-size:0.82rem;color:var(--text-secondary);">${escapeHtml(truncate(meta.info_requested, 200))}</div>`
            : ''
        };
      case 'create_provider_application':
        return {
          label: 'New provider application submitted',
          summary: meta.business_name
            ? `<div style="margin-top:4px;font-size:0.82rem;color:var(--text-secondary);">${escapeHtml(truncate(meta.business_name, 80))}</div>`
            : ''
        };

      // ---- Concierge jobs (concierge-jobs-admin.js / -public.js) ----------
      case 'create_concierge_job':
        return {
          label: 'Concierge job created',
          summary: `<div style="margin-top:4px;font-size:0.82rem;color:var(--text-secondary);">${meta.scenario ? 'Scenario: <code>' + escapeHtml(meta.scenario) + '</code>' : ''}${meta.source ? ' &middot; source: ' + escapeHtml(meta.source) : ''}</div>`
        };
      case 'assign_concierge_driver':
        return {
          label: 'Driver assigned to concierge job',
          summary: meta.driver_id
            ? `<div style="margin-top:4px;font-size:0.82rem;color:var(--text-secondary);">Driver: <code>${escapeHtml(truncate(meta.driver_id, 40))}</code></div>`
            : ''
        };
      case 'cancel_concierge_job':
        return {
          label: 'Concierge job cancelled',
          summary: row.reason
            ? `<div style="margin-top:4px;font-size:0.82rem;color:var(--text-secondary);">Reason: ${escapeHtml(truncate(row.reason, 200))}</div>`
            : ''
        };
      case 'transition_concierge_job':
        return {
          label: `Concierge job status &rarr; <strong>${escapeHtml(meta.to_status || meta.new_status || '?')}</strong>`,
          summary: meta.from_status
            ? `<div style="margin-top:4px;font-size:0.82rem;color:var(--text-secondary);">from <strong>${escapeHtml(meta.from_status)}</strong></div>`
            : ''
        };
      case 'update_concierge_job_address':
        return {
          label: 'Concierge job address updated',
          summary: meta.leg_kind
            ? `<div style="margin-top:4px;font-size:0.82rem;color:var(--text-secondary);">Leg: <code>${escapeHtml(meta.leg_kind)}</code></div>`
            : ''
        };

      // ---- Generic fallback ---------------------------------------------
      default:
        return {
          label: escapeHtml(String(action || 'unknown action')),
          summary: renderMetaChips(meta)
        };
    }
  }

  // Build the query string for the GET /api/admin/audit-log call from the
  // filter inputs in the panel.
  function buildAuditQuery() {
    const params = new URLSearchParams();
    const action = (document.getElementById('admin-audit-filter-action') || {}).value || '';
    const targetId = ((document.getElementById('admin-audit-filter-target') || {}).value || '').trim();
    const performedBy = ((document.getElementById('admin-audit-filter-actor') || {}).value || '').trim();
    if (action) params.set('action', action);
    if (targetId) params.set('target_id', targetId);
    if (performedBy) params.set('performed_by', performedBy);
    params.set('limit', '50');
    return params.toString();
  }

  // Read the admin password the rest of admin.js already cached on the
  // session storage during /verify so the GET inherits the same credential.
  function adminHeaders() {
    const h = { 'Content-Type': 'application/json' };
    // Mirror the pattern used by the rest of admin.js (~L1876, ~L8167):
    // team token first, otherwise the cached admin password.
    try {
      const teamToken = globalThis.adminTeamToken;
      if (teamToken) {
        h['x-admin-token'] = teamToken;
        return h;
      }
    } catch (_e) { /* ignore */ }
    try {
      const cached = localStorage.getItem('mcc_admin_pass');
      if (cached) h['x-admin-password'] = cached;
    } catch (_e) { /* localStorage may be disabled */ }
    return h;
  }

  async function loadAdminAuditLog() {
    const list = document.getElementById('admin-audit-list');
    if (!list) return;
    list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:24px;font-size:0.88rem;">Loading recent admin actions...</p>';

    let res;
    try {
      res = await fetch('/api/admin/audit-log?' + buildAuditQuery(), { headers: adminHeaders() });
    } catch (e) {
      list.innerHTML = `<p style="color:var(--danger,#dc2626);text-align:center;padding:24px;font-size:0.88rem;">Audit log fetch failed: ${escapeHtml(e.message)}</p>`;
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      list.innerHTML = `<p style="color:var(--danger,#dc2626);text-align:center;padding:24px;font-size:0.88rem;">Failed to load audit log: ${escapeHtml(data.error || ('HTTP ' + res.status))}</p>`;
      return;
    }

    // Lazily populate the action <select> the first time the panel loads
    // so the options always reflect what the backend says is currently
    // emitted instead of a static client-side list that can drift.
    const filterSelect = document.getElementById('admin-audit-filter-action');
    if (filterSelect && filterSelect.dataset.populated !== '1' && Array.isArray(data.available_actions)) {
      const current = filterSelect.value;
      const opts = ['<option value="">All actions</option>']
        .concat(data.available_actions.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`));
      filterSelect.innerHTML = opts.join('');
      filterSelect.value = current || '';
      filterSelect.dataset.populated = '1';
    }

    const rows = data.rows || [];
    if (rows.length === 0) {
      list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:24px;font-size:0.88rem;">No admin actions match these filters.</p>';
      return;
    }

    list.innerHTML = rows.map(row => {
      const { label, summary } = describeAuditRow(row);
      const who = escapeHtml(row.performed_by || 'admin');
      const target = row.target_id
        ? `<div style="margin-top:2px;font-size:0.74rem;color:var(--text-muted);">target: <code>${escapeHtml(truncate(row.target_id, 40))}</code>${row.target_type ? ' &middot; ' + escapeHtml(row.target_type) : ''}</div>`
        : '';
      return `
        <div style="padding:12px 14px;border:1px solid var(--border-subtle);border-radius:var(--radius-md);margin-bottom:8px;background:var(--bg-elevated);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
            <div style="flex:1;min-width:240px;">
              <div style="font-size:0.92rem;color:var(--text-primary);">${label}</div>
              ${summary}
              ${target}
            </div>
            <div style="text-align:right;font-size:0.78rem;color:var(--text-muted);white-space:nowrap;">
              <div>${formatAuditTimestamp(row.performed_at)}</div>
              <div>by <strong>${who}</strong></div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  globalThis.describeAuditRow = describeAuditRow;
  globalThis.formatAuditTimestamp = formatAuditTimestamp;
  globalThis.adminAuditLogEscapeHtml = escapeHtml;
  globalThis.loadAdminAuditLog = loadAdminAuditLog;
})();

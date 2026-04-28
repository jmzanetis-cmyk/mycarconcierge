// ─────────────────────────────────────────────────────────────────────────────
// Task #112 — Provider Compliance dashboard panel
//
// Reads provider_employees + employee_background_checks + the cached
// bgc_* columns on profiles, renders the summary card and per-employee
// table, lets the provider add an employee and initiate a check.
//
// Depends on the global `supabase` client created by providers-settings.js
// (Supabase JS, already authenticated for the current provider).
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  const STATUS_COLOR = {
    clear:    { bg: 'rgba(46, 184, 138, 0.15)', fg: '#2eb88a', label: 'Clear' },
    pending:  { bg: 'rgba(212, 168, 85, 0.15)', fg: '#d4a855', label: 'Pending' },
    consider: { bg: 'rgba(212, 168, 85, 0.15)', fg: '#d4a855', label: 'Review' },
    failed:   { bg: 'rgba(220, 80, 80, 0.15)',  fg: '#dc5050', label: 'Failed' },
    expired:  { bg: 'rgba(160, 160, 160, 0.15)', fg: '#a0a0a0', label: 'Expired' },
    none:     { bg: 'rgba(160, 160, 160, 0.15)', fg: '#a0a0a0', label: 'No check yet' }
  };

  function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString(); } catch { return '—'; }
  }

  // The provider portal exposes the authenticated Supabase client as
  // `window.supabaseClient` (see www/supabaseclient.js). We accept a few
  // alternate globals defensively so this script also works on other pages.
  function getSupabase() {
    const c = window.supabaseClient
      || (window.sb && window.sb.client)
      || null;
    // `window.supabase` is the UMD SDK namespace (has createClient), not a
    // client — only return it if it actually quacks like a client.
    if (!c && window.supabase && typeof window.supabase.from === 'function') {
      return window.supabase;
    }
    return c;
  }

  async function getProviderId() {
    const sb = getSupabase();
    if (!sb) return null;
    const { data } = await sb.auth.getUser();
    return data?.user?.id || null;
  }

  // ──────────────────────────────────────────────────────────────────────
  // 4-state Compliance Card copy (Section 3,
  // "Provider Dashboard — Compliance Card"). Do not paraphrase.
  //   Active     : pct >= 90 && badge verified
  //   At Risk    : pct in 80..89 (badge not yet revoked or about to drop)
  //   Inactive   : pct < 80 (badge removed)
  //   Not enrolled: total === 0
  // <!-- TODO ES -->
  // ──────────────────────────────────────────────────────────────────────
  function _stateCopy(pct, total, badge) {
    // <!-- TODO ES -->
    if (total === 0) {
      return {
        key: 'not_enrolled',
        title: 'Get MCC Verified',
        body:  'Stand out from the competition. Background-checked providers get up to 3x more bid responses from customers.',
        cta:   'Start the verification process →',
        ctaAction: 'enroll',
        pillText: 'Not enrolled',
        pillBg:  'rgba(255,255,255,0.05)',
        pillFg:  'var(--text-muted)'
      };
    }
    // <!-- TODO ES -->
    if (badge && pct >= 90) {
      return {
        key: 'active',
        title: 'MCC Verified — Active ✓',
        body:  'Your team is ' + pct.toFixed(0) + '% compliant. Your Verified badge is live and visible to customers.',
        cta:   'View compliance details →',
        ctaAction: 'details',
        pillText: '✓ MCC Verified',
        pillBg:  'linear-gradient(135deg, rgba(46,184,138,0.18), rgba(46,184,138,0.08))',
        pillFg:  '#2eb88a'
      };
    }
    // <!-- TODO ES -->
    if (pct >= 90 && !badge) {
      return {
        key: 'activating',
        title: 'MCC Verified — Activating',
        body:  'Your team is ' + pct.toFixed(0) + '% compliant. Your Verified badge will go live shortly.',
        cta:   'View compliance details →',
        ctaAction: 'details',
        pillText: 'Activating',
        pillBg:  'rgba(212, 168, 85, 0.15)',
        pillFg:  '#d4a855'
      };
    }
    // <!-- TODO ES -->
    if (pct >= 80 && pct < 90) {
      return {
        key: 'at_risk',
        title: 'MCC Verified — At Risk',
        // The PDF copy includes "[Y] employee(s) need attention." — we leave
        // [Y] resolved as the count of non-current employees so the line is
        // grammatical without paraphrasing the surrounding sentence.
        body:  'Your compliance is at ' + pct.toFixed(0) + '%. You need 90% to keep your Verified badge.',
        cta:   'View details →',
        ctaAction: 'details',
        pillText: '⚠ At Risk',
        pillBg:  'rgba(212, 168, 85, 0.15)',
        pillFg:  '#d4a855'
      };
    }
    // pct < 80 — badge removed
    // <!-- TODO ES -->
    return {
      key: 'inactive',
      title: 'MCC Verified — Inactive ✗',
      body:  'Your compliance has dropped to ' + pct.toFixed(0) + '%. Your Verified badge has been removed from your listing. Renew expired checks to restore it.',
      cta:   'Renew now →',
      ctaAction: 'details',
      pillText: '✗ Inactive',
      pillBg:  'rgba(220, 80, 80, 0.15)',
      pillFg:  '#dc5050'
    };
  }

  function _renderStateCard(state, pct, compliant, total) {
    const card = document.getElementById('bgc-state-card');
    if (!card) return;
    // <!-- TODO ES -->
    card.innerHTML =
      '<div style="display:flex;flex-wrap:wrap;align-items:flex-start;gap:24px;justify-content:space-between;">' +
        '<div style="flex:1;min-width:260px;">' +
          '<div style="display:inline-block;padding:6px 14px;border-radius:999px;font-weight:600;font-size:0.78rem;background:' + state.pillBg + ';color:' + state.pillFg + ';">' + escapeHtml(state.pillText) + '</div>' +
          '<h3 style="margin:12px 0 6px;font-size:1.25rem;font-weight:600;color:var(--text-primary);">' + escapeHtml(state.title) + '</h3>' +
          '<p style="margin:0;color:var(--text-secondary);font-size:0.95rem;line-height:1.55;">' + escapeHtml(state.body) + '</p>' +
          (state.key === 'not_enrolled'
            ? '<button class="btn btn-primary" style="margin-top:14px;" onclick="window.bgcCompliance.startEnrollment()">' + escapeHtml(state.cta) + '</button>'
            : '<a href="#compliance" class="btn btn-secondary" style="margin-top:14px;display:inline-block;text-decoration:none;">' + escapeHtml(state.cta) + '</a>'
          ) +
        '</div>' +
        '<div style="text-align:right;min-width:140px;">' +
          '<div style="font-size:2.4rem;font-weight:700;color:var(--accent-gold);">' + pct.toFixed(0) + '%</div>' +
          '<div style="color:var(--text-secondary);font-size:0.88rem;">' + compliant + ' of ' + total + ' employees cleared</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:18px;height:8px;background:rgba(255,255,255,0.06);border-radius:999px;overflow:hidden;">' +
        '<div style="height:100%;width:' + Math.max(0, Math.min(100, pct)) + '%;background:linear-gradient(90deg,var(--accent-gold),var(--accent-teal));transition:width 0.4s ease;"></div>' +
      '</div>';
  }

  async function loadSummary(providerId) {
    const sb = getSupabase();
    const { data: prof } = await sb
      .from('profiles')
      .select('bgc_total_employees,bgc_compliant_employees,bgc_compliance_pct,bgc_badge_verified')
      .eq('id', providerId)
      .maybeSingle();

    const total      = prof?.bgc_total_employees     || 0;
    const compliant  = prof?.bgc_compliant_employees || 0;
    const pct        = Number(prof?.bgc_compliance_pct || 0);
    const badge      = !!prof?.bgc_badge_verified;

    // Legacy DOM (kept for backward compat with other pages still using
    // the inline summary card).
    const pctEl    = document.getElementById('bgc-pct');
    const countsEl = document.getElementById('bgc-counts');
    const barEl    = document.getElementById('bgc-pct-bar');
    const stateEl  = document.getElementById('bgc-badge-state');
    const pillEl   = document.getElementById('bgc-badge-pill');

    if (pctEl)    pctEl.textContent    = pct.toFixed(0) + '%';
    if (countsEl) countsEl.textContent = compliant + ' of ' + total + ' employees cleared';
    if (barEl)    barEl.style.width    = Math.max(0, Math.min(100, pct)) + '%';

    if (stateEl) {
      if (badge) {
        stateEl.textContent      = '✓ MCC Verified';
        stateEl.style.background = 'linear-gradient(135deg, rgba(46,184,138,0.18), rgba(46,184,138,0.08))';
        stateEl.style.color      = '#2eb88a';
      } else if (total === 0) {
        stateEl.textContent      = 'Not enrolled';
        stateEl.style.background = 'rgba(255,255,255,0.05)';
        stateEl.style.color      = 'var(--text-muted)';
      } else if (pct < 80) {
        stateEl.textContent      = '✗ Inactive';
        stateEl.style.background = 'rgba(220, 80, 80, 0.15)';
        stateEl.style.color      = '#dc5050';
      } else if (pct < 90) {
        stateEl.textContent      = '⚠ At Risk';
        stateEl.style.background = 'rgba(212, 168, 85, 0.15)';
        stateEl.style.color      = '#d4a855';
      } else {
        stateEl.textContent      = 'Below 90% — not yet verified';
        stateEl.style.background = 'rgba(255,255,255,0.05)';
        stateEl.style.color      = 'var(--text-muted)';
      }
    }
    if (pillEl) pillEl.style.display = badge ? '' : 'none';

    // 4-state state card. Renders only if the slot exists.
    const state = _stateCopy(pct, total, badge);
    _renderStateCard(state, pct, compliant, total);
  }

  function startEnrollment() {
    if (window.MCC_BGC_Onboarding && typeof window.MCC_BGC_Onboarding.open === 'function') {
      window.MCC_BGC_Onboarding.open();
    } else {
      // Fallback: scroll to the compliance section so the provider can add
      // employees manually if the onboarding script failed to load.
      const el = document.getElementById('compliance');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  }

  // ── Task #113: alerts panel ───────────────────────────────────────────
  const SEV = {
    info:     { bg: 'rgba(70, 140, 220, 0.10)', border: '#468cdc', fg: '#9bc3f0' },
    warning:  { bg: 'rgba(212, 168, 85, 0.10)', border: '#d4a855', fg: '#e6c787' },
    critical: { bg: 'rgba(220, 80, 80, 0.10)',  border: '#dc5050', fg: '#f0a0a0' }
  };

  // We render the same alert list into BOTH the dashboard banner slot
  // (#bgc-alerts-panel-overview, top of the Overview section) and the
  // Compliance section's panel (#bgc-alerts-panel). Either may be absent
  // depending on the page; missing slots are silently skipped.
  function _alertPanels() {
    return [
      document.getElementById('bgc-alerts-panel-overview'),
      document.getElementById('bgc-alerts-panel')
    ].filter(Boolean);
  }

  function _renderAlertsHtml(alerts) {
    return alerts.map(a => {
      const palette = SEV[a.severity] || SEV.info;
      const cta = a.action_url
        ? '<a href="' + escapeHtml(a.action_url) + '" style="display:inline-block;margin-top:8px;padding:8px 14px;border-radius:8px;background:' + palette.border + ';color:#fff;text-decoration:none;font-weight:600;font-size:0.85rem;">Renew now →</a>'
        : '';
      return '<div style="display:flex;gap:14px;align-items:flex-start;padding:14px 18px;margin-bottom:10px;border-radius:10px;background:' + palette.bg + ';border-left:4px solid ' + palette.border + ';">' +
        '<div style="flex:1;">' +
          '<div style="font-weight:600;color:' + palette.fg + ';">' + escapeHtml(a.title) + '</div>' +
          (a.body ? '<div style="margin-top:4px;color:var(--text-secondary);font-size:0.9rem;">' + escapeHtml(a.body) + '</div>' : '') +
          cta +
        '</div>' +
        '<button onclick="window.bgcCompliance.dismissAlert(\'' + a.id + '\')" title="Dismiss" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.2rem;line-height:1;">×</button>' +
      '</div>';
    }).join('');
  }

  async function loadAlerts(providerId) {
    const sb = getSupabase();
    const panels = _alertPanels();
    if (panels.length === 0) return;
    const { data: alerts, error } = await sb
      .from('provider_alerts')
      .select('id, alert_type, severity, title, body, action_url, created_at')
      .eq('provider_id', providerId)
      .is('resolved_at', null)
      .eq('is_dismissed', false)
      .order('severity', { ascending: false })
      .order('created_at', { ascending: false });
    if (error || !alerts || alerts.length === 0) {
      panels.forEach(p => { p.style.display = 'none'; p.innerHTML = ''; });
      return;
    }
    const html = _renderAlertsHtml(alerts);
    panels.forEach(p => { p.style.display = ''; p.innerHTML = html; });
  }

  async function dismissAlert(alertId) {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from('provider_alerts').update({ is_dismissed: true }).eq('id', alertId);
    const providerId = await getProviderId();
    if (providerId) await loadAlerts(providerId);
  }

  function daysUntil(iso) {
    if (!iso) return null;
    const d = new Date(iso).getTime() - Date.now();
    return Math.round(d / 86400000);
  }

  async function loadEmployees(providerId) {
    const sb = getSupabase();
    const tbody = document.getElementById('bgc-employees-tbody');
    if (!tbody) return;

    const { data: emps, error } = await sb
      .from('provider_employees')
      .select('id, first_name, last_name, role, is_customer_facing, is_active')
      .eq('provider_id', providerId)
      .eq('is_active', true)
      .order('last_name', { ascending: true });

    if (error) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding:32px;text-align:center;color:#dc5050;">Failed to load employees: ' + escapeHtml(error.message || 'unknown error') + '</td></tr>';
      return;
    }
    if (!emps || emps.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding:48px;text-align:center;color:var(--text-muted);">No employees yet. Add your first to start a background check.</td></tr>';
      return;
    }

    const empIds = emps.map(e => e.id);
    const { data: checks } = await sb
      .from('employee_background_checks')
      .select('employee_id, status, expires_at, completed_at')
      .in('employee_id', empIds)
      .eq('is_current', true);

    const byEmp = {};
    (checks || []).forEach(c => { byEmp[c.employee_id] = c; });

    tbody.innerHTML = emps.map(e => {
      const chk = byEmp[e.id];
      const statusKey = chk ? chk.status : 'none';
      const palette = STATUS_COLOR[statusKey] || STATUS_COLOR.none;
      const expires = chk ? fmtDate(chk.expires_at) : '—';
      let expiringPill = '';
      if (chk && chk.status === 'clear' && chk.expires_at) {
        const d = daysUntil(chk.expires_at);
        if (d != null && d <= 30 && d >= 0) {
          const sev = d <= 7 ? SEV.critical : SEV.warning;
          expiringPill = ' <span style="margin-left:6px;padding:2px 8px;border-radius:999px;font-size:0.7rem;font-weight:600;background:' + sev.bg + ';color:' + sev.fg + ';">in ' + d + 'd</span>';
        }
      }
      const actionLabel = (!chk || chk.status === 'expired' || chk.status === 'failed')
        ? 'Initiate check'
        : (chk.status === 'pending' || chk.status === 'consider' ? 'In progress' : 'Renew');
      const disabled = (chk && (chk.status === 'pending' || chk.status === 'consider')) ? 'disabled' : '';

      // Customer-facing toggle. Affects whether the employee counts toward the
      // 90% compliance threshold. Click flips the flag on the row, which then
      // re-runs the compliance recompute via toggleCustomerFacing.
      const cfChecked = e.is_customer_facing ? 'checked' : '';
      const cfToggle =
        '<label title="Counts toward the 90% MCC Verified threshold when on" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:0.78rem;color:var(--text-muted);">' +
          '<input type="checkbox" ' + cfChecked + ' onchange="window.bgcCompliance.toggleCustomerFacing(\'' + e.id + '\', this.checked)" style="cursor:pointer;" />' +
          '<span>Customer-facing</span>' +
        '</label>';

      return '<tr style="border-bottom:1px solid var(--border-subtle);">' +
        '<td style="padding:14px 16px;">' + escapeHtml(e.first_name + ' ' + e.last_name) + '<div style="margin-top:6px;">' + cfToggle + '</div></td>' +
        '<td style="padding:14px 16px;color:var(--text-secondary);">' + escapeHtml(e.role || '—') + '</td>' +
        '<td style="padding:14px 16px;"><span style="padding:4px 10px;border-radius:999px;font-size:0.78rem;font-weight:600;background:' + palette.bg + ';color:' + palette.fg + ';">' + palette.label + '</span></td>' +
        '<td style="padding:14px 16px;color:var(--text-secondary);">' + expires + expiringPill + '</td>' +
        '<td style="padding:14px 16px;text-align:right;">' +
          '<button class="btn btn-secondary" ' + disabled + ' onclick="window.bgcCompliance.initiate(\'' + e.id + '\')">' + actionLabel + '</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  async function toggleCustomerFacing(employeeId, value) {
    const sb = getSupabase();
    const providerId = await getProviderId();
    if (!sb || !providerId) { alert('Not signed in.'); return; }
    const { error } = await sb
      .from('provider_employees')
      .update({ is_customer_facing: !!value, updated_at: new Date().toISOString() })
      .eq('id', employeeId);
    if (error) { alert('Failed to update: ' + error.message); return; }
    // Recompute compliance for this provider so the % / badge reflect the new
    // denominator immediately. RLS allows providers to call this RPC because
    // it's SECURITY DEFINER.
    await sb.rpc('calculate_provider_compliance', { p_provider_id: providerId });
    await refresh();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Lightweight refresh: only the alerts banner. Used on every dashboard
  // load so providers see the banner without first navigating to the
  // Compliance section. The full `refresh()` (summary + employees + alerts)
  // is reserved for the Compliance section itself, where its DOM nodes live.
  async function refreshAlertsOnly() {
    const providerId = await getProviderId();
    if (!providerId) return;
    await loadAlerts(providerId);
  }

  async function refresh() {
    const providerId = await getProviderId();
    if (!providerId) return;
    await Promise.all([
      loadSummary(providerId),
      loadEmployees(providerId),
      loadAlerts(providerId)
    ]);
  }

  async function openAddEmployee() {
    const first = (prompt('Employee first name:') || '').trim();
    if (!first) return;
    const last = (prompt('Employee last name:') || '').trim();
    if (!last) return;
    const role = (prompt('Role / title (e.g. Mobile Mechanic):') || '').trim();
    const email = (prompt('Email (optional):') || '').trim();

    const sb = getSupabase();
    const providerId = await getProviderId();
    if (!sb || !providerId) { alert('Not signed in.'); return; }

    const { error } = await sb.from('provider_employees').insert({
      provider_id: providerId,
      first_name: first,
      last_name: last,
      role: role || null,
      email: email || null,
      is_customer_facing: true,
      is_active: true
    });
    if (error) { alert('Failed to add employee: ' + error.message); return; }
    await refresh();
  }

  async function initiate(employeeId) {
    if (!confirm('Initiate a background check for this employee?')) return;
    const sb = getSupabase();
    const session = sb ? (await sb.auth.getSession()).data.session : null;
    const token = session?.access_token;
    if (!token) { alert('Please sign in again.'); return; }

    try {
      const resp = await fetch('/api/provider/initiate-background-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ employeeId })
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        alert('Could not initiate check: ' + (body.error || resp.status));
        return;
      }
      if (body.mocked) {
        alert('Background check started in test mode (BGC_API_TOKEN not configured).');
      }
      await refresh();
    } catch (e) {
      alert('Network error initiating check: ' + e.message);
    }
  }

  window.bgcCompliance = { refresh, refreshAlertsOnly, openAddEmployee, initiate, dismissAlert, startEnrollment };

  // Auto-refresh whenever the user opens the Compliance section.
  document.addEventListener('click', function (ev) {
    const item = ev.target.closest && ev.target.closest('[data-section="compliance"]');
    if (item) setTimeout(refresh, 50);
  });

  // ── Initial load ────────────────────────────────────────────────────────
  // - On the Compliance section itself: do a full refresh (summary, employee
  //   table, alerts).
  // - Anywhere else on the provider portal: just load the alerts banner so
  //   it appears at the top of the dashboard from the moment the page loads.
  //   The Supabase client may not be ready yet on DOMContentLoaded, so we
  //   poll briefly until it's available before firing.
  document.addEventListener('DOMContentLoaded', function () {
    const onCompliance =
      location.hash === '#compliance' ||
      document.querySelector('#compliance.section.active');

    let tries = 0;
    const tick = () => {
      tries++;
      if (getSupabase()) {
        if (onCompliance) refresh();
        else refreshAlertsOnly();
        return;
      }
      if (tries < 30) setTimeout(tick, 200);
    };
    setTimeout(tick, 200);
  });
})();

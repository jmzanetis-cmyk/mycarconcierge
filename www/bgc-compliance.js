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
  // "Provider Dashboard — Compliance Card"). Bilingual (EN / ES).
  //   Active     : pct >= 90 && badge verified
  //   At Risk    : pct in 80..89 (badge not yet revoked or about to drop)
  //   Inactive   : pct < 80 (badge removed)
  //   Not enrolled: total === 0
  // ──────────────────────────────────────────────────────────────────────
  function _clearedLine(compliant, total) {
    return _stateLang() === 'es'
      ? compliant + ' de ' + total + ' empleados aprobados'
      : compliant + ' of ' + total + ' employees cleared';
  }

  function _stateLang() {
    try {
      if (window.I18n && typeof window.I18n.getCurrentLanguage === 'function') {
        return window.I18n.getCurrentLanguage();
      }
      const stored = window.localStorage && window.localStorage.getItem('mcc_language');
      if (stored) return stored;
      if (document.documentElement.lang) return document.documentElement.lang;
    } catch (e) { /* ignore */ }
    return 'en';
  }

  const STATE_COPY_EN = {
    not_enrolled: {
      title: 'Get MCC Verified',
      body:  'Stand out from the competition. Background-checked providers get up to 3x more bid responses from customers.',
      cta:   'Start the verification process →',
      pillText: 'Not enrolled'
    },
    active: {
      title: 'MCC Verified — Active ✓',
      body:  function (pct) { return 'Your team is ' + pct.toFixed(0) + '% compliant. Your Verified badge is live and visible to customers.'; },
      cta:   'View compliance details →',
      pillText: '✓ MCC Verified'
    },
    activating: {
      title: 'MCC Verified — Activating',
      body:  function (pct) { return 'Your team is ' + pct.toFixed(0) + '% compliant. Your Verified badge will go live shortly.'; },
      cta:   'View compliance details →',
      pillText: 'Activating'
    },
    at_risk: {
      title: 'MCC Verified — At Risk',
      body:  function (pct) { return 'Your compliance is at ' + pct.toFixed(0) + '%. You need 90% to keep your Verified badge.'; },
      cta:   'View details →',
      pillText: '⚠ At Risk'
    },
    inactive: {
      title: 'MCC Verified — Inactive ✗',
      body:  function (pct) { return 'Your compliance has dropped to ' + pct.toFixed(0) + '%. Your Verified badge has been removed from your listing. Renew expired checks to restore it.'; },
      cta:   'Renew now →',
      pillText: '✗ Inactive'
    }
  };

  const STATE_COPY_ES = {
    not_enrolled: {
      title: 'Obtén la insignia MCC Verificado',
      body:  'Destácate frente a la competencia. Los proveedores con verificación de antecedentes reciben hasta 3 veces más respuestas a sus ofertas.',
      cta:   'Iniciar el proceso de verificación →',
      pillText: 'No inscrito'
    },
    active: {
      title: 'MCC Verificado — Activo ✓',
      body:  function (pct) { return 'Tu equipo cumple al ' + pct.toFixed(0) + ' %. Tu insignia Verificado está activa y visible para los clientes.'; },
      cta:   'Ver detalles de cumplimiento →',
      pillText: '✓ MCC Verificado'
    },
    activating: {
      title: 'MCC Verificado — Activando',
      body:  function (pct) { return 'Tu equipo cumple al ' + pct.toFixed(0) + ' %. Tu insignia Verificado se activará en breve.'; },
      cta:   'Ver detalles de cumplimiento →',
      pillText: 'Activando'
    },
    at_risk: {
      title: 'MCC Verificado — En riesgo',
      body:  function (pct) { return 'Tu cumplimiento está al ' + pct.toFixed(0) + ' %. Necesitas 90 % para mantener tu insignia Verificado.'; },
      cta:   'Ver detalles →',
      pillText: '⚠ En riesgo'
    },
    inactive: {
      title: 'MCC Verificado — Inactivo ✗',
      body:  function (pct) { return 'Tu cumplimiento bajó al ' + pct.toFixed(0) + ' %. Tu insignia Verificado ha sido retirada de tu ficha. Renueva las verificaciones vencidas para restablecerla.'; },
      cta:   'Renovar ahora →',
      pillText: '✗ Inactivo'
    }
  };

  function _stateCopy(pct, total, badge) {
    const dict = _stateLang() === 'es' ? STATE_COPY_ES : STATE_COPY_EN;
    let key;
    if (total === 0) key = 'not_enrolled';
    else if (badge && pct >= 90) key = 'active';
    else if (pct >= 90 && !badge) key = 'activating';
    else if (pct >= 80 && pct < 90) key = 'at_risk';
    else key = 'inactive'; // pct < 80 — badge removed

    const c = dict[key];
    const palette = {
      not_enrolled: { bg: 'rgba(255,255,255,0.05)', fg: 'var(--text-muted)' },
      active:       { bg: 'linear-gradient(135deg, rgba(46,184,138,0.18), rgba(46,184,138,0.08))', fg: '#2eb88a' },
      activating:   { bg: 'rgba(212, 168, 85, 0.15)', fg: '#d4a855' },
      at_risk:      { bg: 'rgba(212, 168, 85, 0.15)', fg: '#d4a855' },
      inactive:     { bg: 'rgba(220, 80, 80, 0.15)', fg: '#dc5050' }
    }[key];

    return {
      key:        key,
      title:      c.title,
      body:       (typeof c.body === 'function') ? c.body(pct) : c.body,
      cta:        c.cta,
      ctaAction:  key === 'not_enrolled' ? 'enroll' : 'details',
      pillText:   c.pillText,
      pillBg:     palette.bg,
      pillFg:     palette.fg
    };
  }

  function _renderStateCard(state, pct, compliant, total) {
    const card = document.getElementById('bgc-state-card');
    if (!card) return;
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
          '<div style="color:var(--text-secondary);font-size:0.88rem;">' + escapeHtml(_clearedLine(compliant, total)) + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:18px;height:8px;background:rgba(255,255,255,0.06);border-radius:999px;overflow:hidden;">' +
        '<div style="height:100%;width:' + Math.max(0, Math.min(100, pct)) + '%;background:linear-gradient(90deg,var(--accent-gold),var(--accent-teal));transition:width 0.4s ease;"></div>' +
      '</div>';
  }

  // Resolve the (label, background, color) tuple for the legacy inline badge
  // pill. Pure data — kept separate from the DOM write so loadSummary stays
  // under the cognitive-complexity budget (Task #262).
  function _legacyBadgePalette(badge, total, pct, isEs) {
    if (badge) return {
      text: isEs ? '✓ MCC Verificado' : '✓ MCC Verified',
      bg:   'linear-gradient(135deg, rgba(46,184,138,0.18), rgba(46,184,138,0.08))',
      fg:   '#2eb88a'
    };
    if (total === 0) return {
      text: isEs ? 'No inscrito' : 'Not enrolled',
      bg:   'rgba(255,255,255,0.05)',
      fg:   'var(--text-muted)'
    };
    if (pct < 80) return {
      text: isEs ? '✗ Inactivo' : '✗ Inactive',
      bg:   'rgba(220, 80, 80, 0.15)',
      fg:   '#dc5050'
    };
    if (pct < 90) return {
      text: isEs ? '⚠ En riesgo' : '⚠ At Risk',
      bg:   'rgba(212, 168, 85, 0.15)',
      fg:   '#d4a855'
    };
    return {
      text: isEs ? 'Menos del 90 % — aún no verificado' : 'Below 90% — not yet verified',
      bg:   'rgba(255,255,255,0.05)',
      fg:   'var(--text-muted)'
    };
  }

  function _renderLegacyBadgeState(stateEl, badge, total, pct) {
    const palette = _legacyBadgePalette(badge, total, pct, _stateLang() === 'es');
    stateEl.textContent      = palette.text;
    stateEl.style.background = palette.bg;
    stateEl.style.color      = palette.fg;
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
    if (countsEl) countsEl.textContent = _clearedLine(compliant, total);
    if (barEl)    barEl.style.width    = Math.max(0, Math.min(100, pct)) + '%';

    if (stateEl) _renderLegacyBadgeState(stateEl, badge, total, pct);
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
      const renewLabel = _stateLang() === 'es' ? 'Renovar ahora →' : 'Renew now →';
      const cta = a.action_url
        ? '<a href="' + escapeHtml(a.action_url) + '" style="display:inline-block;margin-top:8px;padding:8px 14px;border-radius:8px;background:' + palette.border + ';color:#fff;text-decoration:none;font-weight:600;font-size:0.85rem;">' + escapeHtml(renewLabel) + '</a>'
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
      loadAlerts(providerId),
      loadNotificationPrefs(providerId)
    ]);
  }

  // ── Task #159 (+ Task #201): BGC reminder preferences ─────────────────
  // Each row maps 1:1 to a pair of columns on provider_notification_prefs:
  //   col      — the email toggle (legacy, defaults OFF/ON per Task #159).
  //   colSms   — the SMS toggle  (added in Task #201, always defaults OFF
  //              so we never text without an explicit per-threshold flip).
  // Defaults must mirror the migration so the UI shows the same state
  // the cron job will act on for providers who never opened this panel.
  const PREF_THRESHOLDS = [
    { col: 'bgc_reminder_60', colSms: 'bgc_reminder_60_sms', days: 60, label: '60 days before expiry', help: 'Early heads-up — useful for shops that schedule renewals weeks in advance.', defaultOn: true,  defaultSms: false },
    { col: 'bgc_reminder_30', colSms: 'bgc_reminder_30_sms', days: 30, label: '30 days before expiry', help: 'Standard renewal window for most providers.',                              defaultOn: true,  defaultSms: false },
    { col: 'bgc_reminder_14', colSms: 'bgc_reminder_14_sms', days: 14, label: '14 days before expiry', help: 'Time is getting tight — most renewals clear within 1–2 weeks.',          defaultOn: true,  defaultSms: false },
    { col: 'bgc_reminder_7',  colSms: 'bgc_reminder_7_sms',  days:  7, label: '7 days before expiry',  help: 'Final warning before the check expires and the badge is at risk.',       defaultOn: true,  defaultSms: false },
    { col: 'bgc_reminder_1',  colSms: 'bgc_reminder_1_sms',  days:  1, label: '1 day before expiry',   help: 'Last-chance nudge the day before — opt in if your team needs the extra prompt.', defaultOn: false, defaultSms: false }
  ];

  function _defaultPrefs() {
    const out = { sms_phone: '' };
    for (const t of PREF_THRESHOLDS) {
      out[t.col]    = t.defaultOn;
      out[t.colSms] = t.defaultSms;
    }
    return out;
  }

  async function loadNotificationPrefs(providerId) {
    const slot = document.getElementById('bgc-notif-prefs-card');
    if (!slot) return;
    const sb = getSupabase();
    if (!sb) return;

    // Pull the prefs row + the provider's existing profile phone in
    // parallel. The profile phone is used as the placeholder/fallback for
    // the SMS phone field — providers who never enter an override still
    // get texted at the number already on file (Task #201).
    const [{ data, error }, { data: prof }] = await Promise.all([
      sb.from('provider_notification_prefs')
        .select('bgc_reminder_60,bgc_reminder_30,bgc_reminder_14,bgc_reminder_7,bgc_reminder_1,'
              + 'bgc_reminder_60_sms,bgc_reminder_30_sms,bgc_reminder_14_sms,bgc_reminder_7_sms,bgc_reminder_1_sms,'
              + 'sms_phone')
        .eq('provider_id', providerId)
        .maybeSingle(),
      sb.from('profiles').select('phone').eq('id', providerId).maybeSingle()
    ]);

    const prefs = _defaultPrefs();
    if (!error && data) {
      for (const t of PREF_THRESHOLDS) {
        if (data[t.col]    !== null && data[t.col]    !== undefined) prefs[t.col]    = !!data[t.col];
        if (data[t.colSms] !== null && data[t.colSms] !== undefined) prefs[t.colSms] = !!data[t.colSms];
      }
      if (data.sms_phone) prefs.sms_phone = data.sms_phone;
    }

    // Resolve the phone field's initial value: explicit override wins, but
    // when there isn't one we pre-fill the input with the existing profile
    // phone so providers don't have to retype it. We also keep the profile
    // phone in a data-attribute so the save path knows when the user left
    // the input identical to it (and we can store NULL in that case to
    // preserve the "always reuse profile phone" behaviour going forward).
    const profilePhone = (prof && prof.phone) ? String(prof.phone) : '';
    const phoneValue   = prefs.sms_phone || profilePhone;
    const anySms       = PREF_THRESHOLDS.some(t => prefs[t.colSms]);
    const phoneHint    = profilePhone
      ? 'Defaults to your profile phone (' + escapeHtml(profilePhone) + '). Edit to send texts to a different number.'
      : 'Add a phone number to receive any SMS reminders. We text the number on this row only.';

    const rows = PREF_THRESHOLDS.map(t => {
      const checkedEmail = prefs[t.col]    ? 'checked' : '';
      const checkedSms   = prefs[t.colSms] ? 'checked' : '';
      return '' +
        '<div style="display:flex;gap:14px;align-items:flex-start;padding:12px 14px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid var(--border-subtle);">' +
          '<div style="flex:1;">' +
            '<div style="font-weight:600;color:var(--text-primary);">' + escapeHtml(t.label) + '</div>' +
            '<div style="margin-top:2px;font-size:0.85rem;color:var(--text-secondary);">' + escapeHtml(t.help) + '</div>' +
          '</div>' +
          '<label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:0.82rem;color:var(--text-secondary);min-width:88px;justify-content:flex-end;" title="Email this reminder">' +
            '<input type="checkbox" data-pref-col="' + t.col + '" ' + checkedEmail + ' style="cursor:pointer;width:16px;height:16px;flex:0 0 auto;" />' +
            '<span>Email</span>' +
          '</label>' +
          '<label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:0.82rem;color:var(--text-secondary);min-width:96px;justify-content:flex-end;" title="Also text this reminder">' +
            '<input type="checkbox" data-pref-col-sms="' + t.colSms + '" ' + checkedSms + ' style="cursor:pointer;width:16px;height:16px;flex:0 0 auto;" />' +
            '<span>Also text me</span>' +
          '</label>' +
        '</div>';
    }).join('');

    slot.innerHTML =
      '<div class="card-header" style="margin-bottom:6px;">' +
        '<h2 class="card-title">Reminder preferences</h2>' +
      '</div>' +
      '<p style="margin:0 0 14px;color:var(--text-secondary);font-size:0.9rem;">' +
        'Choose how we nudge you about expiring background checks. ' +
        'In-dashboard alerts and expired-check / badge-removal emails are always sent — they cannot be muted.' +
      '</p>' +
      '<div style="display:grid;gap:10px;">' + rows + '</div>' +
      '<div style="margin-top:16px;padding:12px 14px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid var(--border-subtle);">' +
        '<label for="bgc-prefs-sms-phone" style="display:block;font-weight:600;color:var(--text-primary);font-size:0.9rem;">SMS phone number</label>' +
        '<div style="margin-top:2px;font-size:0.82rem;color:var(--text-secondary);">' + phoneHint + '</div>' +
        '<input type="tel" id="bgc-prefs-sms-phone" data-profile-phone="' + escapeHtml(profilePhone) + '" value="' + escapeHtml(phoneValue) + '" placeholder="(555) 123-4567" autocomplete="tel" style="margin-top:8px;width:100%;max-width:260px;padding:8px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:rgba(255,255,255,0.04);color:var(--text-primary);font-size:0.95rem;" />' +
        (anySms && !phoneValue ? '<div style="margin-top:8px;font-size:0.82rem;color:#d4a855;">⚠ Texts are turned on but no phone number is on file — add one above so we can reach you.</div>' : '') +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:12px;margin-top:16px;">' +
        '<button class="btn btn-primary" id="bgc-prefs-save-btn" onclick="window.bgcCompliance.saveNotificationPrefs()">Save preferences</button>' +
        '<span id="bgc-prefs-status" style="font-size:0.85rem;color:var(--text-muted);"></span>' +
      '</div>';
  }

  async function saveNotificationPrefs() {
    const sb = getSupabase();
    const providerId = await getProviderId();
    if (!sb || !providerId) { alert('Not signed in.'); return; }

    const slot = document.getElementById('bgc-notif-prefs-card');
    if (!slot) return;

    const payload = { provider_id: providerId };
    for (const t of PREF_THRESHOLDS) {
      const cbEmail = slot.querySelector('input[data-pref-col="' + t.col + '"]');
      const cbSms   = slot.querySelector('input[data-pref-col-sms="' + t.colSms + '"]');
      payload[t.col]    = !!(cbEmail && cbEmail.checked);
      payload[t.colSms] = !!(cbSms   && cbSms.checked);
    }

    // Phone resolution: empty input → store NULL (cron falls back to
    // profile phone). Same value as profile phone → also NULL so future
    // profile-phone updates flow through automatically. Anything else is
    // saved as the explicit override.
    const phoneEl = document.getElementById('bgc-prefs-sms-phone');
    const typed   = phoneEl ? String(phoneEl.value || '').trim() : '';
    const profilePhone = phoneEl ? String(phoneEl.dataset.profilePhone || '').trim() : '';
    payload.sms_phone = !typed || typed === profilePhone ? null : typed;

    const btn = document.getElementById('bgc-prefs-save-btn');
    const status = document.getElementById('bgc-prefs-status');
    if (btn) btn.disabled = true;
    if (status) { status.textContent = 'Saving…'; status.style.color = 'var(--text-muted)'; }

    // Upsert by provider_id so the very first save creates the row and
    // subsequent saves overwrite it. RLS limits inserts/updates to the
    // signed-in provider's own row (see migrations 20260428i / 20260429g).
    const { error } = await sb
      .from('provider_notification_prefs')
      .upsert(payload, { onConflict: 'provider_id' });

    if (btn) btn.disabled = false;
    if (error) {
      if (status) { status.textContent = 'Could not save: ' + (error.message || 'unknown error'); status.style.color = '#dc5050'; }
      return;
    }
    if (status) { status.textContent = 'Saved.'; status.style.color = '#2eb88a'; }
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

  window.bgcCompliance = { refresh, refreshAlertsOnly, openAddEmployee, initiate, dismissAlert, startEnrollment, toggleCustomerFacing, saveNotificationPrefs };

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

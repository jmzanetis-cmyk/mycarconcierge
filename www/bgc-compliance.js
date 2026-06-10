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
  // `globalThis.supabaseClient` (see www/supabaseclient.js). We accept a few
  // alternate globals defensively so this script also works on other pages.
  function getSupabase() {
    const c = globalThis.supabaseClient
      || (globalThis.sb && globalThis.sb.client)
      || null;
    // `globalThis.supabase` is the UMD SDK namespace (has createClient), not a
    // client — only return it if it actually quacks like a client.
    if (!c && globalThis.supabase && typeof globalThis.supabase.from === 'function') {
      return globalThis.supabase;
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
    const lang = _stateLang();
    if (lang === 'es') return compliant + ' de ' + total + ' empleados aprobados';
    if (lang === 'ar') return compliant + ' من ' + total + ' موظفين معتمدين';
    return compliant + ' of ' + total + ' employees cleared';
  }

  function _stateLang() {
    try {
      if (globalThis.I18n && typeof globalThis.I18n.getCurrentLanguage === 'function') {
        return globalThis.I18n.getCurrentLanguage();
      }
      const stored = globalThis.localStorage && globalThis.localStorage.getItem('mcc_language');
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

  const STATE_COPY_AR = {
    not_enrolled: {
      title: 'احصل على توثيق MCC',
      body:  'تميّز عن المنافسين. مزوّدو الخدمة الذين خضعوا للتحقق من الخلفية يحصلون على ضعف عدد العروض من العملاء حتى ثلاث مرات.',
      cta:   '← ابدأ عملية التحقق',
      pillText: 'غير مُسجَّل'
    },
    active: {
      title: 'موثّق من MCC — نشط ✓',
      body:  function (pct) { return 'فريقك ملتزم بنسبة ' + pct.toFixed(0) + '%. شارة "موثّق" مفعّلة وظاهرة للعملاء.'; },
      cta:   '← عرض تفاصيل الالتزام',
      pillText: '✓ موثّق من MCC'
    },
    activating: {
      title: 'موثّق من MCC — قيد التفعيل',
      body:  function (pct) { return 'فريقك ملتزم بنسبة ' + pct.toFixed(0) + '%. ستُفعَّل شارة "موثّق" خلال وقت قصير.'; },
      cta:   '← عرض تفاصيل الالتزام',
      pillText: 'قيد التفعيل'
    },
    at_risk: {
      title: 'موثّق من MCC — في خطر',
      body:  function (pct) { return 'نسبة التزامك ' + pct.toFixed(0) + '%. تحتاج إلى 90% للاحتفاظ بشارة "موثّق".'; },
      cta:   '← عرض التفاصيل',
      pillText: '⚠ في خطر'
    },
    inactive: {
      title: 'موثّق من MCC — غير نشط ✗',
      body:  function (pct) { return 'انخفض التزامك إلى ' + pct.toFixed(0) + '%. تمّت إزالة شارة "موثّق" من صفحتك. جدّد عمليات التحقق المنتهية لاستعادتها.'; },
      cta:   '← جدّد الآن',
      pillText: '✗ غير نشط'
    }
  };

  function _stateCopy(pct, total, badge) {
    const lang = _stateLang();
    const dict = lang === 'es' ? STATE_COPY_ES : (lang === 'ar' ? STATE_COPY_AR : STATE_COPY_EN);
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

  // Task #372 — render the persistent BGC connection-status pill that sits
  // next to the compliance state pill. This polls the public view via
  // /api/provider/bgc/config + the existing supabase RLS-scoped read of
  // provider_background_check_accounts_public so the provider can always
  // tell at a glance whether their orders go to live BGC, the platform
  // fallback, or are still in mock mode.
  async function _renderConnectionPill() {
    const slot = document.getElementById('bgc-connection-pill');
    if (!slot) return;
    let label = 'Mock mode'; let bg = 'rgba(255,255,255,0.06)'; let fg = 'var(--text-muted)'; let title = 'BGC live mode is off platform-wide — orders are simulated until ops flips BGC_LIVE_MODE on.';
    try {
      // Step 1: ask the platform whether live mode is on globally. Only when
      // BGC_LIVE_MODE is true does the per-provider sub-account state matter
      // for the user-facing label. /api/provider/bgc/config exposes this
      // safely without leaking secrets.
      let liveModeGlobal = false;
      let platformFallback = false;
      try {
        const cfg = await fetch('/api/provider/bgc/config').then(r => r.ok ? r.json() : null).catch(() => null);
        liveModeGlobal = !!(cfg && cfg.live_mode);
        platformFallback = !!(cfg && cfg.platform_fallback);
      } catch { liveModeGlobal = false; platformFallback = false; }

      // Step 2: read the per-provider linked-account row via the RLS-scoped
      // public view (no api_key column).
      const sb = getSupabase();
      let row = null;
      if (sb && sb.auth) {
        const { data: sessionWrap } = await sb.auth.getSession();
        const uid = sessionWrap && sessionWrap.session && sessionWrap.session.user && sessionWrap.session.user.id;
        if (uid) {
          const r = await sb
            .from('provider_background_check_accounts_public')
            .select('live_mode, bgchecks_account_id')
            .eq('provider_id', uid)
            .maybeSingle();
          row = r && r.data ? r.data : null;
        }
      }

      // Step 3: combine global flag + provider row to pick the label. Only
      // claim "Live · Sub-account linked" when BOTH are true; "Live · Platform
      // fallback" when global is on but the provider hasn't linked their own
      // account; "Setup pending" only when global is on but nothing is wired.
      if (!liveModeGlobal) {
        // default mock mode pill stays
      } else if (row && row.live_mode) {
        label = 'Live · Sub-account linked';
        bg = 'linear-gradient(135deg, rgba(46,184,138,0.18), rgba(46,184,138,0.08))';
        fg = '#2eb88a';
        title = 'Background checks run under your own BackgroundChecks.com sub-account' + (row.bgchecks_account_id ? ' (#' + row.bgchecks_account_id + ').' : '.');
      } else if (platformFallback) {
        label = 'Live · Platform fallback';
        bg = 'rgba(212, 168, 85, 0.15)';
        fg = '#d4a855';
        title = 'BGC live mode is on, but you haven\u2019t linked your own sub-account. Orders run under MCC\u2019s platform account. Click Enroll BGC sub-account to get your own console.';
      } else {
        label = 'Setup pending';
        bg = 'rgba(220, 80, 80, 0.15)';
        fg = '#dc5050';
        title = 'BGC live mode is on platform-wide but no API credential is configured \u2014 neither your sub-account nor the platform fallback token is available. New orders will fail until ops configures BGC_API_TOKEN or you link your sub-account.';
      }
    } catch { /* non-fatal — keep default mock pill */ }
    slot.innerHTML =
      '<span title="' + escapeHtml(title) + '" style="display:inline-block;padding:6px 14px;border-radius:999px;font-weight:600;font-size:0.78rem;background:' + bg + ';color:' + fg + ';margin-inline-start:8px;">' + escapeHtml(label) + '</span>';
  }

  function _renderStateCard(state, pct, compliant, total) {
    const card = document.getElementById('bgc-state-card');
    if (!card) return;
    card.innerHTML =
      '<div style="display:flex;flex-wrap:wrap;align-items:flex-start;gap:24px;justify-content:space-between;">' +
        '<div style="flex:1;min-width:260px;">' +
          '<div style="display:inline-block;padding:6px 14px;border-radius:999px;font-weight:600;font-size:0.78rem;background:' + state.pillBg + ';color:' + state.pillFg + ';">' + escapeHtml(state.pillText) + '</div>' +
          '<span id="bgc-connection-pill"></span>' +
          '<h3 style="margin:12px 0 6px;font-size:1.25rem;font-weight:600;color:var(--text-primary);">' + escapeHtml(state.title) + '</h3>' +
          '<p style="margin:0;color:var(--text-secondary);font-size:0.95rem;line-height:1.55;">' + escapeHtml(state.body) + '</p>' +
          (state.key === 'not_enrolled'
            ? '<button class="btn btn-primary" style="margin-top:14px;" onclick="globalThis.bgcCompliance.startEnrollment()">' + escapeHtml(state.cta) + '</button>'
            : '<a href="#compliance" class="btn btn-secondary" style="margin-top:14px;display:inline-block;text-decoration:none;">' + escapeHtml(state.cta) + '</a>'
          ) +
        '</div>' +
        '<div style="text-align:end;min-width:140px;">' +
          '<div style="font-size:2.4rem;font-weight:700;color:var(--accent-gold);unicode-bidi:plaintext;">' + pct.toFixed(0) + '%</div>' +
          '<div style="color:var(--text-secondary);font-size:0.88rem;">' + escapeHtml(_clearedLine(compliant, total)) + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:18px;height:8px;background:rgba(255,255,255,0.06);border-radius:999px;overflow:hidden;">' +
        // RTL note (Task #410): 90deg gradient is cosmetic on a width-driven progress bar (intentionally physical). Follow-up #506.
        '<div style="height:100%;width:' + Math.max(0, Math.min(100, pct)) + '%;background:linear-gradient(90deg,var(--accent-gold),var(--accent-teal));transition:width 0.4s ease;"></div>' +
      '</div>';
  }

  // Resolve the (label, background, color) tuple for the legacy inline badge
  // pill. Pure data — kept separate from the DOM write so loadSummary stays
  // under the cognitive-complexity budget (Task #262).
  function _legacyBadgePalette(badge, total, pct, lang) {
    const pick = (en, es, ar) => lang === 'es' ? es : (lang === 'ar' ? ar : en);
    if (badge) return {
      text: pick('✓ MCC Verified', '✓ MCC Verificado', '✓ موثّق من MCC'),
      bg:   'linear-gradient(135deg, rgba(46,184,138,0.18), rgba(46,184,138,0.08))',
      fg:   '#2eb88a'
    };
    if (total === 0) return {
      text: pick('Not enrolled', 'No inscrito', 'غير مُسجَّل'),
      bg:   'rgba(255,255,255,0.05)',
      fg:   'var(--text-muted)'
    };
    if (pct < 80) return {
      text: pick('✗ Inactive', '✗ Inactivo', '✗ غير نشط'),
      bg:   'rgba(220, 80, 80, 0.15)',
      fg:   '#dc5050'
    };
    if (pct < 90) return {
      text: pick('⚠ At Risk', '⚠ En riesgo', '⚠ في خطر'),
      bg:   'rgba(212, 168, 85, 0.15)',
      fg:   '#d4a855'
    };
    return {
      text: pick('Below 90% — not yet verified', 'Menos del 90 % — aún no verificado', 'أقل من 90% — لم يتم التوثيق بعد'),
      bg:   'rgba(255,255,255,0.05)',
      fg:   'var(--text-muted)'
    };
  }

  function _renderLegacyBadgeState(stateEl, badge, total, pct) {
    const palette = _legacyBadgePalette(badge, total, pct, _stateLang());
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
    _renderConnectionPill();
  }

  function startEnrollment() {
    if (globalThis.MCC_BGC_Onboarding && typeof globalThis.MCC_BGC_Onboarding.open === 'function') {
      globalThis.MCC_BGC_Onboarding.open();
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
      const _alertLang = _stateLang();
      const renewLabel = _alertLang === 'es'
        ? 'Renovar ahora →'
        : (_alertLang === 'ar' ? '← جدّد الآن' : 'Renew now →');
      const cta = a.action_url
        ? '<a href="' + escapeHtml(a.action_url) + '" style="display:inline-block;margin-top:8px;padding:8px 14px;border-radius:8px;background:' + palette.border + ';color:#fff;text-decoration:none;font-weight:600;font-size:0.85rem;">' + escapeHtml(renewLabel) + '</a>'
        : '';
      return '<div style="display:flex;gap:14px;align-items:flex-start;padding:14px 18px;margin-bottom:10px;border-radius:10px;background:' + palette.bg + ';border-inline-start:4px solid ' + palette.border + ';">' +
        '<div style="flex:1;">' +
          '<div style="font-weight:600;color:' + palette.fg + ';">' + escapeHtml(a.title) + '</div>' +
          (a.body ? '<div style="margin-top:4px;color:var(--text-secondary);font-size:0.9rem;">' + escapeHtml(a.body) + '</div>' : '') +
          cta +
        '</div>' +
        '<button onclick="globalThis.bgcCompliance.dismissAlert(\'' + a.id + '\')" title="Dismiss" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.2rem;line-height:1;">×</button>' +
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
          expiringPill = ' <span style="margin-inline-start:6px;padding:2px 8px;border-radius:999px;font-size:0.7rem;font-weight:600;background:' + sev.bg + ';color:' + sev.fg + ';">in ' + d + 'd</span>';
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
          '<input type="checkbox" ' + cfChecked + ' onchange="globalThis.bgcCompliance.toggleCustomerFacing(\'' + e.id + '\', this.checked)" style="cursor:pointer;" />' +
          '<span>Customer-facing</span>' +
        '</label>';

      return '<tr style="border-bottom:1px solid var(--border-subtle);">' +
        '<td style="padding:14px 16px;">' + escapeHtml(e.first_name + ' ' + e.last_name) + '<div style="margin-top:6px;">' + cfToggle + '</div></td>' +
        '<td style="padding:14px 16px;color:var(--text-secondary);">' + escapeHtml(e.role || '—') + '</td>' +
        '<td style="padding:14px 16px;"><span style="padding:4px 10px;border-radius:999px;font-size:0.78rem;font-weight:600;background:' + palette.bg + ';color:' + palette.fg + ';">' + palette.label + '</span></td>' +
        '<td style="padding:14px 16px;color:var(--text-secondary);">' + expires + expiringPill + '</td>' +
        '<td style="padding:14px 16px;text-align:end;">' +
          '<button class="btn btn-secondary" ' + disabled + ' onclick="globalThis.bgcCompliance.initiate(\'' + e.id + '\')">' + actionLabel + '</button>' +
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
      loadNotificationPrefs(providerId),
      loadSubaccountCard(providerId)
    ]);
  }

  // ── Task #374: BGC sub-account link card ──────────────────────────────
  // Reads the safe public view `provider_background_check_accounts_public`
  // (NEVER the base table — the api_key column is revoked from
  // authenticated/anon by migration 20260515e). Renders a small card so
  // providers can see at a glance whether ordered checks will run under
  // their own BGC sub-account or fall back to the platform credential,
  // and lets them deep-link to /bgc-enroll-account.html to enroll.
  async function loadSubaccountCard(providerId) {
    const slot = document.getElementById('bgc-subaccount-card');
    if (!slot) return;
    const sb = getSupabase();
    if (!sb) return;

    let row = null;
    try {
      const { data } = await sb
        .from('provider_background_check_accounts_public')
        .select('live_mode, bgchecks_account_id, created_at, updated_at')
        .eq('provider_id', providerId)
        .maybeSingle();
      row = data || null;
    } catch { row = null; }

    const isEs = _stateLang() === 'es';
    // The public view deliberately omits the secret api_key column. Per
    // migration 20260515e the `live_mode` flag is the canonical "is your
    // sub-account linked?" signal — it's only set true by the enrollment
    // flow after /token/decrypt succeeds.
    const linked = !!(row && row.live_mode);

    const title = isEs ? 'Sub-cuenta de BackgroundChecks.com' : 'BackgroundChecks.com sub-account';
    let pillText; let pillBg; let pillFg; let body; let cta;

    if (linked) {
      pillText = isEs ? '✓ Vinculada' : '✓ Linked';
      pillBg = 'linear-gradient(135deg, rgba(46,184,138,0.18), rgba(46,184,138,0.08))';
      pillFg = '#2eb88a';
      body = isEs
        ? 'Las verificaciones que solicites se realizarán bajo tu propia sub-cuenta de BackgroundChecks.com'
          + (row && row.bgchecks_account_id ? ' (#' + escapeHtml(String(row.bgchecks_account_id)) + ')' : '')
          + '.'
        : 'Background checks you order will run under your own BackgroundChecks.com sub-account'
          + (row && row.bgchecks_account_id ? ' (#' + escapeHtml(String(row.bgchecks_account_id)) + ')' : '')
          + '.';
      cta = '<a href="/bgc-enroll-account.html" target="_blank" rel="noopener" class="btn btn-secondary" style="text-decoration:none;display:inline-block;">'
          + escapeHtml(isEs ? 'Reenrolar / actualizar' : 'Re-enroll / update') + '</a>';
    } else {
      pillText = isEs ? 'No vinculada' : 'Not linked';
      pillBg = 'rgba(212, 168, 85, 0.15)';
      pillFg = '#d4a855';
      body = isEs
        ? 'Aún no has vinculado tu propia sub-cuenta de BackgroundChecks.com. Por ahora, las verificaciones se procesan con la cuenta de respaldo de MCC. Enrólate gratis para tener tu propia consola y facturación.'
        : 'You haven’t linked your own BackgroundChecks.com sub-account yet. Until you do, ordered checks run against MCC’s fallback account. Enroll for free to get your own console and billing.';
      cta = '<a href="/bgc-enroll-account.html" target="_blank" rel="noopener" class="btn btn-primary" style="text-decoration:none;display:inline-block;" onclick="globalThis.bgcCompliance.armSubaccountRefresh()">'
          + escapeHtml(isEs ? 'Enrolar sub-cuenta →' : 'Enroll sub-account →') + '</a>';
    }

    slot.style.display = '';
    slot.innerHTML =
      '<div style="display:flex;flex-wrap:wrap;align-items:flex-start;gap:18px;justify-content:space-between;">' +
        '<div style="flex:1;min-width:240px;">' +
          '<div style="display:inline-block;padding:6px 14px;border-radius:999px;font-weight:600;font-size:0.78rem;background:' + pillBg + ';color:' + pillFg + ';">' + escapeHtml(pillText) + '</div>' +
          '<h3 style="margin:12px 0 6px;font-size:1.05rem;font-weight:600;color:var(--text-primary);">' + escapeHtml(title) + '</h3>' +
          '<p style="margin:0;color:var(--text-secondary);font-size:0.92rem;line-height:1.5;">' + body + '</p>' +
        '</div>' +
        '<div style="display:flex;align-items:center;">' + cta + '</div>' +
      '</div>';
  }

  // Called when the provider clicks "Enroll sub-account" so we can
  // refresh the card the moment they return to this tab (the enrollment
  // page opens in a new tab, and `handleSuccess` there links the account
  // via /api/provider/bgc/decrypt-token).
  let _subaccountRefreshArmed = false;
  function armSubaccountRefresh() {
    if (_subaccountRefreshArmed) return;
    _subaccountRefreshArmed = true;
    const handler = async function () {
      if (document.visibilityState !== 'visible') return;
      const providerId = await getProviderId();
      if (providerId) await loadSubaccountCard(providerId);
    };
    window.addEventListener('focus', handler);
    document.addEventListener('visibilitychange', handler);
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
        '<button class="btn btn-primary" id="bgc-prefs-save-btn" onclick="globalThis.bgcCompliance.saveNotificationPrefs()">Save preferences</button>' +
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
      if (body.applicantInviteUrl) {
        // Live mode — surface the BGC-hosted PII intake link so the
        // provider can hand it to the employee. SSN/DOB are entered on
        // BGC, never on MCC.
        const msg = 'Background check ordered.\n\nSend this secure link to the employee so they can complete their consent and PII intake on BackgroundChecks.com:\n\n' + body.applicantInviteUrl;
        try { await navigator.clipboard.writeText(body.applicantInviteUrl); } catch { /* clipboard may be unavailable */ }
        alert(msg + '\n\n(Link copied to your clipboard.)');
      } else if (body.mocked) {
        alert('Background check started in test mode (BGC_LIVE_MODE not enabled).');
      } else {
        alert('Background check started. The employee will receive an email from BackgroundChecks.com to complete their secure intake.');
      }
      await refresh();
    } catch (e) {
      alert('Network error initiating check: ' + e.message);
    }
  }

  globalThis.bgcCompliance = { refresh, refreshAlertsOnly, openAddEmployee, initiate, dismissAlert, startEnrollment, toggleCustomerFacing, saveNotificationPrefs, loadSubaccountCard, armSubaccountRefresh };

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

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

  function getSupabase() {
    return window.supabase || (window.sb && window.sb.client) || null;
  }

  async function getProviderId() {
    const sb = getSupabase();
    if (!sb) return null;
    const { data } = await sb.auth.getUser();
    return data?.user?.id || null;
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
        stateEl.textContent     = '✓ MCC Verified';
        stateEl.style.background = 'linear-gradient(135deg, rgba(46,184,138,0.18), rgba(46,184,138,0.08))';
        stateEl.style.color      = '#2eb88a';
      } else {
        stateEl.textContent     = total === 0 ? 'Add employees to begin' : 'Below 90% — not yet verified';
        stateEl.style.background = 'rgba(255,255,255,0.05)';
        stateEl.style.color      = 'var(--text-muted)';
      }
    }
    if (pillEl) pillEl.style.display = badge ? '' : 'none';
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
      tbody.innerHTML = '<tr><td colspan="5" style="padding:32px;text-align:center;color:#dc5050;">Failed to load employees: ' + error.message + '</td></tr>';
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
      const actionLabel = (!chk || chk.status === 'expired' || chk.status === 'failed')
        ? 'Initiate check'
        : (chk.status === 'pending' || chk.status === 'consider' ? 'In progress' : 'Renew');
      const disabled = (chk && (chk.status === 'pending' || chk.status === 'consider')) ? 'disabled' : '';
      const cfTag = e.is_customer_facing
        ? ''
        : ' <span style="font-size:0.7rem;color:var(--text-muted);">(internal)</span>';

      return '<tr style="border-bottom:1px solid var(--border-subtle);">' +
        '<td style="padding:14px 16px;">' + escapeHtml(e.first_name + ' ' + e.last_name) + cfTag + '</td>' +
        '<td style="padding:14px 16px;color:var(--text-secondary);">' + escapeHtml(e.role || '—') + '</td>' +
        '<td style="padding:14px 16px;"><span style="padding:4px 10px;border-radius:999px;font-size:0.78rem;font-weight:600;background:' + palette.bg + ';color:' + palette.fg + ';">' + palette.label + '</span></td>' +
        '<td style="padding:14px 16px;color:var(--text-secondary);">' + expires + '</td>' +
        '<td style="padding:14px 16px;text-align:right;">' +
          '<button class="btn btn-secondary" ' + disabled + ' onclick="window.bgcCompliance.initiate(\'' + e.id + '\')">' + actionLabel + '</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  async function refresh() {
    const providerId = await getProviderId();
    if (!providerId) return;
    await Promise.all([loadSummary(providerId), loadEmployees(providerId)]);
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

  window.bgcCompliance = { refresh, openAddEmployee, initiate };

  // Auto-refresh whenever the user opens the Compliance section.
  document.addEventListener('click', function (ev) {
    const item = ev.target.closest && ev.target.closest('[data-section="compliance"]');
    if (item) setTimeout(refresh, 50);
  });

  // First load if the page boots straight onto #compliance.
  document.addEventListener('DOMContentLoaded', function () {
    if (location.hash === '#compliance' || document.querySelector('#compliance.section.active')) {
      setTimeout(refresh, 200);
    }
  });
})();

/* Task #114 — MCC Verified status card on the provider dashboard overview.
 * Renders the four states from the platform-copy PDF:
 *   Active (badge live), At Risk (80–89%), Inactive (badge removed), Not enrolled.
 * Reads the cached bgc_* columns from the provider's profile row. */
(function () {
  function getSupabase() { return window.supabase || window.sb || null; }

  async function load() {
    const sb = getSupabase();
    const card = document.getElementById('mcc-verified-status-card');
    const COPY = window.MCC_BGC_COPY;
    if (!sb || !card || !COPY) return;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const { data: prof } = await sb
      .from('profiles')
      .select('bgc_badge_verified, bgc_compliant_employees, bgc_total_employees, bgc_compliance_pct')
      .eq('id', user.id)
      .maybeSingle();
    if (!prof) return;

    const total = prof.bgc_total_employees || 0;
    const compliant = prof.bgc_compliant_employees || 0;
    const pct = total > 0
      ? Math.round((prof.bgc_compliance_pct != null ? prof.bgc_compliance_pct : (compliant / total) * 100))
      : 0;
    const needAttention = Math.max(0, total - compliant);

    let state, palette;
    if (total === 0) {
      state = COPY.provider.cardNotEnrolled;
      palette = { bg: 'rgba(212,168,85,0.10)', bd: '#d4a855', fg: '#e6c787' };
    } else if (prof.bgc_badge_verified) {
      state = COPY.provider.cardActive(pct);
      palette = { bg: 'rgba(46,125,50,0.10)', bd: '#4CAF50', fg: '#9ed99e' };
    } else if (pct >= 80) {
      state = COPY.provider.cardAtRisk(pct, needAttention);
      palette = { bg: 'rgba(212,168,85,0.10)', bd: '#d4a855', fg: '#e6c787' };
    } else {
      state = COPY.provider.cardInactive(pct);
      palette = { bg: 'rgba(220,80,80,0.10)', bd: '#dc5050', fg: '#f0a0a0' };
    }

    function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    card.style.display = '';
    card.style.background = palette.bg;
    card.style.borderLeft = '4px solid ' + palette.bd;
    card.innerHTML =
      '<div style="font-size:1.05rem;font-weight:700;color:' + palette.fg + ';margin-bottom:6px;">' + esc(state.title) + '</div>' +
      '<div style="font-size:0.92rem;color:var(--text-secondary);line-height:1.5;margin-bottom:12px;">' + esc(state.body) + '</div>' +
      '<a href="#compliance" onclick="if(window.showSection)showSection(\'compliance\');return true;" style="display:inline-block;padding:8px 14px;border-radius:8px;background:' + palette.bd + ';color:#fff;text-decoration:none;font-weight:600;font-size:0.85rem;">' + esc(state.cta) + '</a>';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    setTimeout(load, 800); // wait for supabase init
  }
  window.MCCVerifiedStatusCard = { load };
})();

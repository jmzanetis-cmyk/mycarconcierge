/* Task #114 — Reusable MCC Verified badge component (vanilla JS, framework-free).
 *
 * Public API on window.MCCVerifiedBadge:
 *   .render(provider, opts)  → HTML string
 *   .openDetailModal()       → injects + shows the "What does MCC Verified mean?" modal
 *
 * Inputs (any subset of the provider object):
 *   bgc_badge_verified       boolean   — primary trigger
 *   bgc_compliant_employees  number    — fills the "[X] of [Y]" detail line
 *   bgc_total_employees      number
 *   bgc_last_verified_at     ISO date  — Car Club "Last verified" line
 *
 * Variants (opts.variant):
 *   'compact'  → small ✓ Verified pill (search cards)
 *   'full'     → "✓ Background Verified — [X] of [Y] employees screened" (detail pages)
 *   'card'     → full + neutral copy block when not verified (Car Club profile)
 */
(function (global) {
  const COPY = global.MCC_BGC_COPY || {};
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtMonth(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch (e) { return '—'; }
  }

  function compact(p) {
    if (!p || !p.bgc_badge_verified) return '';
    const tip = esc((COPY.customer && COPY.customer.tooltipBadge) || '');
    return '<span class="mcc-verified-badge mcc-verified-badge--compact" title="' + tip + '" onclick="event.stopPropagation();window.MCCVerifiedBadge.openDetailModal();">' +
             '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>' +
             '<span>' + esc((COPY.branding && COPY.branding.compactLabel) || '\u2713 Verified') + '</span>' +
           '</span>';
  }

  function full(p) {
    if (!p || !p.bgc_badge_verified) return '';
    const detail = (COPY.badge && COPY.badge.fullDetail)
      ? COPY.badge.fullDetail(p.bgc_compliant_employees, p.bgc_total_employees)
      : '';
    return '<div class="mcc-verified-badge mcc-verified-badge--full" onclick="window.MCCVerifiedBadge.openDetailModal();">' +
             '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
             '<div class="mcc-verified-badge__text">' +
               '<div class="mcc-verified-badge__label">' + esc((COPY.branding && COPY.branding.badgeLabel) || '\u2713 Background Verified') + '</div>' +
               '<div class="mcc-verified-badge__detail">' + esc(detail) + '</div>' +
             '</div>' +
           '</div>';
  }

  function card(p) {
    if (p && p.bgc_badge_verified) {
      const body = (COPY.customer && COPY.customer.ccBody)
        ? COPY.customer.ccBody(p.bgc_compliant_employees, p.bgc_total_employees, fmtMonth(p.bgc_last_verified_at))
        : '';
      return '<div class="mcc-verified-card mcc-verified-card--active">' +
               '<div class="mcc-verified-card__head">' +
                 '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
                 '<strong>' + esc((COPY.customer && COPY.customer.ccHeader) || 'MCC Verified Provider') + '</strong>' +
               '</div>' +
               '<div class="mcc-verified-card__body">' + esc(body).replace(/\n/g, '<br>') + '</div>' +
             '</div>';
    }
    // Neutral copy when not verified
    return '<div class="mcc-verified-card mcc-verified-card--neutral">' +
             '<div class="mcc-verified-card__body">' + esc((COPY.customer && COPY.customer.ccNotVerified) || '') + '</div>' +
           '</div>';
  }

  function detailSection(provider) {
    const p = provider || {};
    const name = p.business_name || p.full_name || 'This provider';
    if (!p.bgc_badge_verified) return '';
    const c = COPY.customer || {};
    return '<section class="mcc-verified-section">' +
             '<h3>' + esc(c.detailHeader || 'About MCC Verified') + '</h3>' +
             '<p>' + esc(c.detailBody ? c.detailBody(name) : '') + '</p>' +
             '<p>' + esc(c.detailIncluded || '') + '</p>' +
             '<p>' + esc(c.detailFooter || '') + '</p>' +
             '<details><summary>' + esc(c.whyHeader || 'Why does this matter?') + '</summary>' +
               '<p>' + esc(c.whyBody || '') + '</p>' +
             '</details>' +
           '</section>';
  }

  function render(provider, opts) {
    const variant = (opts && opts.variant) || 'compact';
    if (variant === 'full')   return full(provider);
    if (variant === 'card')   return card(provider);
    if (variant === 'detail') return detailSection(provider);
    return compact(provider);
  }

  function openDetailModal() {
    const m = COPY.badge && COPY.badge.modal;
    if (!m) return;
    let modal = document.getElementById('mcc-verified-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'mcc-verified-modal';
      modal.className = 'mcc-verified-modal';
      modal.innerHTML =
        '<div class="mcc-verified-modal__backdrop" onclick="document.getElementById(\'mcc-verified-modal\').remove();"></div>' +
        '<div class="mcc-verified-modal__panel">' +
          '<button class="mcc-verified-modal__close" onclick="document.getElementById(\'mcc-verified-modal\').remove();" aria-label="Close">×</button>' +
          '<h2>' + esc(m.header) + '</h2>' +
          '<p>' + esc(m.body) + '</p>' +
          '<p>' + esc(m.included) + '</p>' +
          '<p style="font-style:italic;">' + esc(m.guarantee) + '</p>' +
          '<p><a href="/trust-safety.html">' + esc(m.learnMore) + '</a></p>' +
        '</div>';
      document.body.appendChild(modal);
    }
  }

  // Inject one-time stylesheet
  function injectStyles() {
    if (document.getElementById('mcc-verified-styles')) return;
    const s = document.createElement('style');
    s.id = 'mcc-verified-styles';
    s.textContent = `
      .mcc-verified-badge { display:inline-flex; align-items:center; gap:6px; cursor:pointer; user-select:none; }
      .mcc-verified-badge--compact { padding:3px 10px; border-radius:999px; background:rgba(46,125,50,0.12); color:#4CAF50; border:1px solid rgba(76,175,80,0.4); font-size:0.75rem; font-weight:600; }
      .mcc-verified-badge--compact:hover { background:rgba(46,125,50,0.20); }
      .mcc-verified-badge--full { padding:10px 14px; border-radius:10px; background:rgba(46,125,50,0.10); color:#4CAF50; border-left:3px solid #4CAF50; align-items:flex-start; }
      .mcc-verified-badge__label { font-weight:700; font-size:0.95rem; }
      .mcc-verified-badge__detail { font-size:0.78rem; opacity:0.85; margin-top:2px; color:var(--text-secondary, #888); }
      .mcc-verified-card { padding:14px 18px; border-radius:12px; margin:12px 0; }
      .mcc-verified-card--active { background:rgba(46,125,50,0.10); border-left:4px solid #4CAF50; color:var(--text-primary, inherit); }
      .mcc-verified-card--neutral { background:var(--bg-card-soft, rgba(255,255,255,0.04)); border-left:4px solid var(--border-subtle, #444); color:var(--text-secondary, #888); font-size:0.9rem; }
      .mcc-verified-card__head { display:flex; align-items:center; gap:8px; color:#4CAF50; margin-bottom:6px; }
      .mcc-verified-card__body { color:var(--text-secondary, inherit); font-size:0.9rem; line-height:1.5; }
      .mcc-verified-section { padding:18px 0; border-top:1px solid var(--border-subtle, #333); margin-top:18px; }
      .mcc-verified-section h3 { color:#4CAF50; margin:0 0 10px; }
      .mcc-verified-section details { margin-top:14px; }
      .mcc-verified-section summary { cursor:pointer; font-weight:600; padding:8px 0; }
      .mcc-verified-modal { position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; }
      .mcc-verified-modal__backdrop { position:absolute; inset:0; background:rgba(0,0,0,0.55); }
      .mcc-verified-modal__panel { position:relative; max-width:540px; width:100%; background:var(--bg-card,#1a202a); color:var(--text-primary,#fff); padding:28px; border-radius:14px; box-shadow:0 20px 60px rgba(0,0,0,0.4); max-height:90vh; overflow:auto; }
      .mcc-verified-modal__close { position:absolute; top:10px; right:14px; background:none; border:none; color:inherit; font-size:1.6rem; cursor:pointer; line-height:1; }
      .mcc-verified-modal__panel h2 { color:#4CAF50; margin:0 0 14px; }
      .mcc-verified-modal__panel p { line-height:1.55; margin:10px 0; color:var(--text-secondary, #aaa); }
      .mcc-verified-modal__panel a { color:#4CAF50; }
    `;
    document.head.appendChild(s);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectStyles);
    } else {
      injectStyles();
    }
  }

  global.MCCVerifiedBadge = { render, openDetailModal };
})(typeof window !== 'undefined' ? window : globalThis);

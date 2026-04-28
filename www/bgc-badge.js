// MCC Verified badge renderer. Variants: 'full' (✓ Background Verified +
// employee count line) and 'compact' (✓ Verified). Returns empty string
// when the provider is not verified. <!-- TODO ES -->
(function (root) {
  'use strict';

  // <!-- TODO ES -->
  const COPY = {
    fullLabel: '\u2713 Background Verified',
    compactLabel: '\u2713 Verified',
    pendingLabel: '\u23F3 Check Pending',
    tooltip:
      "This provider's team is background-checked through MCC's accredited " +
      "screening partner. Checks include criminal history, sex offender " +
      "registry, and identity verification. Renewed annually.",
    tooltipListing:
      'This provider maintains current background checks on at least 90% of ' +
      'their customer-facing employees, verified through a nationally ' +
      'accredited screening service. Checks are renewed annually.',
    listingSubtitle: '\u2713 Background Verified \u2014 employees screened and current',
    notVerifiedNeutral:
      'This provider has not yet completed the MCC Verified program. You can ' +
      'still request bids from them \u2014 many great providers are in the ' +
      'process of getting verified.',
    detailModalTitle: 'What does MCC Verified mean?',
    detailModalBody:
      'Providers with the MCC Verified badge maintain current background ' +
      'checks on at least 90% of their customer-facing employees. Checks are ' +
      'conducted by a nationally accredited screening service and must be ' +
      'renewed every 12 months.',
    detailModalIncluded:
      "What's included in the screening? \u2022 National criminal history " +
      'search \u2022 County-level criminal records \u2022 National sex ' +
      'offender registry \u2022 Identity verification',
    detailModalGuarantee:
      'Is this a guarantee? The MCC Verified badge indicates that a provider ' +
      'has completed the screening process and is maintaining compliance. It ' +
      'is not a guarantee of future behavior. We encourage you to use your ' +
      'own judgment alongside this information.',
    consumerDisclosure:
      'Background check information is provided by a third-party consumer ' +
      'reporting agency. My Car Concierge does not conduct background checks ' +
      'directly. The MCC Verified badge indicates that a provider has met ' +
      "the program's compliance requirements at the time of verification. It " +
      'is not a guarantee, warranty, or endorsement of any provider\u2019s ' +
      'character, qualifications, or future conduct. My Car Concierge is not ' +
      'liable for the acts or omissions of any service provider. Consumers ' +
      'should exercise their own judgment when selecting service providers.'
  };

  // ── Inline styles (verified=green, pending=amber) ─────────────────────
  const STYLE = {
    verified: {
      bg: '#E8F5E9',
      border: '#4CAF50',
      text: '#2E7D32',
      iconBg: '#4CAF50'
    },
    pending: {
      bg: '#FFF8E1',
      border: '#FFC107',
      text: '#F57F17',
      iconBg: '#FFC107'
    }
  };

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _pillHtml(palette, icon, label, tooltip, extraClass, clickable) {
    const cls = 'mcc-bgc-badge ' + (extraClass || '');
    const tip = tooltip ? ' title="' + escapeHtml(tooltip) + '"' : '';
    const clickAttrs = clickable
      ? ' role="button" tabindex="0" data-mcc-bgc-detail="1"'
      : '';
    const cursor = clickable ? 'cursor:pointer;' : '';
    return (
      '<span class="' + cls + '"' + tip + clickAttrs +
      ' style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;' +
      'border-radius:20px;background:' + palette.bg + ';' +
      'border:1px solid ' + palette.border + ';font-size:13px;' +
      'font-weight:600;color:' + palette.text + ';line-height:1;' + cursor + '">' +
        '<span style="display:inline-flex;align-items:center;' +
        'justify-content:center;width:18px;height:18px;border-radius:50%;' +
        'background:' + palette.iconBg + ';color:#fff;font-size:11px;' +
        'font-weight:700;">' + icon + '</span>' +
        escapeHtml(label) +
      '</span>'
    );
  }

  /**
   * Render the MCC Verified badge.
   * Hides for non-verified, non-pending providers (matches PDF: don't penalize
   * non-verified providers or create alarm).
   */
  function renderBadge(opts) {
    opts = opts || {};
    const variant = opts.variant === 'full' ? 'full' : 'compact';

    if (opts.verified) {
      const label = variant === 'full' ? COPY.fullLabel : COPY.compactLabel;
      const tip = variant === 'full' ? COPY.tooltip : COPY.tooltipListing;
      const pill = _pillHtml(STYLE.verified, '\u2713', label, tip, 'mcc-bgc-verified', true);
      if (variant === 'full' && (opts.compliantEmployees != null || opts.totalEmployees != null)) {
        const x = Number(opts.compliantEmployees || 0);
        const y = Number(opts.totalEmployees || 0);
        const detail = x + ' of ' + y + ' employees screened \u00B7 Renewed annually';
        return (
          '<span class="mcc-bgc-fullinline" style="display:inline-flex;flex-direction:column;gap:4px;">' +
            pill +
            '<span style="font-size:0.78rem;color:#6b7280;">' + escapeHtml(detail) + '</span>' +
          '</span>'
        );
      }
      return pill;
    }
    return '';
  }

  /**
   * Open the badge detail modal: title, body, "what's included" bullets, "is this a
   * guarantee" disclosure, and the consumer-disclosure footer.
   */
  function openDetailModal() {
    if (typeof document === 'undefined') return;
    const existing = document.getElementById('mcc-bgc-detail-modal');
    if (existing) { existing.remove(); }

    const overlay = document.createElement('div');
    overlay.id = 'mcc-bgc-detail-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'mcc-bgc-detail-title');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:10000;background:rgba(13,13,13,0.78);' +
      'display:flex;align-items:center;justify-content:center;padding:20px;';

    overlay.innerHTML =
      '<div class="mcc-bgc-detail-card" style="background:#fff;color:#1f2937;' +
      'max-width:560px;width:100%;max-height:90vh;overflow-y:auto;' +
      'border-radius:14px;padding:28px 26px;box-shadow:0 20px 60px rgba(0,0,0,0.45);' +
      'border-top:4px solid #4CAF50;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">' +
          '<h2 id="mcc-bgc-detail-title" style="margin:0;font-size:1.4rem;color:#2E7D32;font-weight:700;">' +
            escapeHtml(COPY.detailModalTitle) +
          '</h2>' +
          '<button type="button" data-mcc-bgc-close="1" aria-label="Close" ' +
          'style="border:0;background:transparent;font-size:1.6rem;line-height:1;cursor:pointer;color:#6b7280;">&times;</button>' +
        '</div>' +
        '<p style="margin:14px 0 12px;font-size:0.95rem;line-height:1.55;">' +
          escapeHtml(COPY.detailModalBody) +
        '</p>' +
        '<div style="margin:14px 0;padding:12px 14px;background:#F1F8E9;border-radius:10px;font-size:0.9rem;line-height:1.55;">' +
          escapeHtml(COPY.detailModalIncluded) +
        '</div>' +
        '<div style="margin:14px 0;font-size:0.88rem;line-height:1.55;color:#374151;">' +
          escapeHtml(COPY.detailModalGuarantee) +
        '</div>' +
        '<div style="margin-top:18px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:0.75rem;line-height:1.55;color:#6b7280;">' +
          escapeHtml(COPY.consumerDisclosure) +
        '</div>' +
        '<div style="margin-top:18px;text-align:right;">' +
          '<button type="button" data-mcc-bgc-close="1" ' +
          'style="background:#2E7D32;color:#fff;border:0;padding:10px 18px;border-radius:8px;font-weight:600;cursor:pointer;">Close</button>' +
        '</div>' +
      '</div>';

    function close(ev) {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(e); }

    overlay.addEventListener('click', function (ev) {
      const t = ev.target;
      if (t === overlay || (t && t.getAttribute && t.getAttribute('data-mcc-bgc-close') === '1')) {
        close(ev);
      }
    });
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
  }

  // Global delegation: any element with data-mcc-bgc-detail="1" opens the
  // detail modal on click or Enter/Space. Attaches once.
  function _wireBadgeClicks() {
    if (typeof document === 'undefined') return;
    if (document._mccBgcWired) return;
    document._mccBgcWired = true;
    document.addEventListener('click', function (ev) {
      const el = ev.target && ev.target.closest && ev.target.closest('[data-mcc-bgc-detail="1"]');
      if (el) {
        ev.preventDefault();
        ev.stopPropagation();
        openDetailModal();
      }
    }, true);
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const el = ev.target && ev.target.closest && ev.target.closest('[data-mcc-bgc-detail="1"]');
      if (el) {
        ev.preventDefault();
        ev.stopPropagation();
        openDetailModal();
      }
    }, true);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _wireBadgeClicks);
    } else {
      _wireBadgeClicks();
    }
  }

  /**
   * Full badge detail block for the listing/Car Club profile (PDF Section 6).
   * Renders the badge plus the "[X] of [Y] employees screened · Renewed annually"
   * detail line when verified.
   */
  function renderFullBlock(opts) {
    opts = opts || {};
    if (!opts.verified) return '';
    const x = Number(opts.compliantEmployees || 0);
    const y = Number(opts.totalEmployees || 0);
    const detail = x + ' of ' + y + ' employees screened \u00B7 Renewed annually';
    return (
      '<div class="mcc-bgc-fullblock" style="display:inline-flex;flex-direction:column;gap:6px;">' +
        renderBadge({ verified: true, variant: 'full' }) +
        '<span style="font-size:0.78rem;color:#6b7280;">' + escapeHtml(detail) + '</span>' +
      '</div>'
    );
  }

  /**
   * Listing-card subtitle, returned only when the provider is verified.
   */
  function renderListingSubtitle(opts) {
    if (!opts || !opts.verified) return '';
    return (
      '<div class="mcc-bgc-subtitle" style="font-size:0.82rem;color:#2E7D32;font-weight:500;margin-top:4px;">' +
        escapeHtml(COPY.listingSubtitle) +
      '</div>'
    );
  }

  function renderListingNeutral() {
    return (
      '<div class="mcc-bgc-listing-neutral" style="font-size:0.78rem;color:#a0a8b8;line-height:1.5;margin-top:6px;">' +
        escapeHtml(COPY.notVerifiedNeutral) +
      '</div>'
    );
  }

  /**
   * Car Club profile compliance area (PDF Section 2).
   *   When verified:  MCC Verified Provider / Background checks current for
   *                   [X] of [Y] team members / Last verified: [Month Year]
   *   When not:       Neutral "has not yet completed" copy.
   */
  function renderCarClubBlock(opts) {
    opts = opts || {};
    if (opts.verified) {
      const x = Number(opts.compliantEmployees || 0);
      const y = Number(opts.totalEmployees || 0);
      let when = '';
      if (opts.lastVerified) {
        try {
          when = new Date(opts.lastVerified).toLocaleString(undefined, {
            month: 'long',
            year: 'numeric'
          });
        } catch (e) { when = ''; }
      }
      return (
        '<div class="mcc-bgc-carclub" style="padding:14px 18px;border-radius:12px;' +
        'background:rgba(46,125,50,0.08);border:1px solid rgba(46,125,50,0.25);">' +
          '<div style="display:flex;align-items:center;gap:10px;font-weight:600;color:#2E7D32;">' +
            '<span style="display:inline-flex;align-items:center;justify-content:center;' +
            'width:22px;height:22px;border-radius:50%;background:#4CAF50;color:#fff;font-weight:700;">\u2713</span>' +
            'MCC Verified Provider' +
          '</div>' +
          '<div style="margin-top:6px;font-size:0.88rem;color:#374151;">' +
            'Background checks current for ' + escapeHtml(String(x)) +
            ' of ' + escapeHtml(String(y)) + ' team members' +
          '</div>' +
          (when
            ? '<div style="margin-top:2px;font-size:0.82rem;color:#6b7280;">Last verified: ' + escapeHtml(when) + '</div>'
            : '') +
        '</div>'
      );
    }
    return (
      '<div class="mcc-bgc-carclub mcc-bgc-carclub--neutral" style="padding:14px 18px;border-radius:12px;' +
      'background:rgba(160,168,184,0.08);border:1px solid rgba(160,168,184,0.18);">' +
        '<div style="font-size:0.88rem;color:#a0a8b8;line-height:1.5;">' +
          escapeHtml(COPY.notVerifiedNeutral) +
        '</div>' +
      '</div>'
    );
  }

  /**
   * Filter description copy (PDF Section 2 — Filter description).
   */
  function getFilterDescription() {
    return 'Verified Providers maintain current background checks on their employees, renewed every year.';
  }

  function getFilterLabel() {
    return 'Show only Verified Providers';
  }

  // Expose
  root.MCC_BGC = {
    COPY: COPY,
    renderBadge: renderBadge,
    renderFullBlock: renderFullBlock,
    renderListingSubtitle: renderListingSubtitle,
    renderCarClubBlock: renderCarClubBlock,
    getFilterLabel: getFilterLabel,
    getFilterDescription: getFilterDescription,
    openDetailModal: openDetailModal,
    renderListingNeutral: renderListingNeutral
  };
})(typeof window !== 'undefined' ? window : this);

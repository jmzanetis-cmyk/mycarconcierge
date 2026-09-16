(function () {
  const STORAGE_KEY = 'mcc_cookie_consent';
  const CONSENT_VERSION = '1';

  function getConsent() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
  }

  function setConsent(value) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: CONSENT_VERSION, choice: value, ts: Date.now() }));
  }

  function removeBanner() {
    const b = document.getElementById('mcc-cookie-banner');
    if (b) { b.style.transform = 'translateY(120%)'; b.style.opacity = '0'; setTimeout(() => b.remove(), 350); }
  }

  function injectBanner() {
    if (document.getElementById('mcc-cookie-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'mcc-cookie-banner';
    banner.className = 'mcc-cb-collapsed';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.innerHTML = `
      <div class="mcc-cb-content">
        <p class="mcc-cb-text">
          <strong>We use cookies</strong> to keep you signed in, remember your preferences, and improve our service. Analytics and ad cookies are only set with your permission.
          <a href="/privacy.html#cookies" class="mcc-cb-link">Learn more</a>
        </p>
        <div class="mcc-cb-actions">
          <button id="mcc-cb-accept" class="mcc-cb-btn mcc-cb-accept" aria-label="Accept all cookies">Accept All</button>
          <button id="mcc-cb-essential" class="mcc-cb-btn mcc-cb-essential" aria-label="Accept essential cookies only">Essential Only</button>
          <a href="/data-rights.html" class="mcc-cb-link mcc-cb-manage" aria-label="Manage privacy choices">Your Privacy Choices</a>
        </div>
        <span class="mcc-cb-pill" aria-hidden="true">Cookie settings</span>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #mcc-cookie-banner {
        position: fixed; bottom: 0; left: 0; right: 0; z-index: 99999;
        background: #1a2030; border-top: 2px solid #c9a84c;
        /* Slimmed (was 16px 24px) so the hero trust-badge row stays visible
           on a 1024x600 first paint. Safe-area padding handles iOS home bar. */
        padding: 8px 20px calc(8px + env(safe-area-inset-bottom)) 20px;
        box-shadow: 0 -4px 24px rgba(0,0,0,0.4);
        transform: translateY(0); opacity: 1;
        transition: transform 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.35s ease;
        font-family: 'Inter', 'Inter', system-ui, sans-serif;
      }
      .mcc-cb-content {
        max-width: 1080px; margin: 0 auto;
        display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
      }
      .mcc-cb-text { flex: 1; font-size: 0.78rem; color: #c8d0dc; line-height: 1.45; margin: 0; min-width: 220px; }
      .mcc-cb-text strong { color: #f0f4fa; }
      .mcc-cb-link { color: #c9a84c; text-decoration: underline; }
      .mcc-cb-link:hover { color: #e6b84a; }
      .mcc-cb-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .mcc-cb-btn {
        padding: 7px 16px; border-radius: 8px; border: none; cursor: pointer;
        font-size: 0.8rem; font-weight: 600; font-family: inherit;
        transition: filter 0.15s ease; white-space: nowrap;
      }
      .mcc-cb-btn:hover { filter: brightness(1.1); }
      .mcc-cb-accept { background: linear-gradient(135deg, #c9a84c, #e6b84a); color: #12161c; }
      .mcc-cb-essential { background: rgba(255,255,255,0.08); color: #c8d0dc; border: 1px solid rgba(255,255,255,0.15); }
      .mcc-cb-manage { font-size: 0.75rem; white-space: nowrap; }

      /* Auto-collapsed pill state — after a few seconds with no choice the
         banner shrinks to a small bottom-right pill so the hero stays
         readable. Click re-expands; consent logic itself is unchanged. */
      #mcc-cookie-banner.mcc-cb-collapsed {
        left: auto; right: 16px; bottom: 16px;
        padding: 8px 14px calc(8px + env(safe-area-inset-bottom)) 14px;
        border-top: none; border: 1px solid #c9a84c; border-radius: 999px;
        cursor: pointer; max-width: 220px;
      }
      #mcc-cookie-banner.mcc-cb-collapsed .mcc-cb-content { gap: 8px; flex-wrap: nowrap; }
      #mcc-cookie-banner.mcc-cb-collapsed .mcc-cb-text,
      #mcc-cookie-banner.mcc-cb-collapsed .mcc-cb-actions { display: none; }
      #mcc-cookie-banner.mcc-cb-collapsed .mcc-cb-pill { display: inline-flex !important; }

      .mcc-cb-pill {
        display: none; align-items: center; gap: 8px;
        font-size: 0.78rem; color: #f0f4fa; font-weight: 600;
      }
      .mcc-cb-pill::before {
        content: ""; width: 8px; height: 8px; border-radius: 50%;
        background: #c9a84c; flex-shrink: 0;
      }

      @media (max-width: 600px) {
        #mcc-cookie-banner { padding: 8px 14px calc(8px + env(safe-area-inset-bottom)) 14px; }
        .mcc-cb-content { gap: 10px; }
        .mcc-cb-actions { width: 100%; }
        .mcc-cb-btn { flex: 1; }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(banner);

    document.getElementById('mcc-cb-accept').addEventListener('click', function (e) {
      if (banner.classList.contains('mcc-cb-collapsed')) { e.stopPropagation(); banner.classList.remove('mcc-cb-collapsed'); return; }
      setConsent('all');
      removeBanner();
    });
    document.getElementById('mcc-cb-essential').addEventListener('click', function (e) {
      if (banner.classList.contains('mcc-cb-collapsed')) { e.stopPropagation(); banner.classList.remove('mcc-cb-collapsed'); return; }
      setConsent('essential');
      removeBanner();
    });

    // Banner starts as a small bottom-right pill so the hero trust-badge
    // row is fully visible on first paint (1024x600 and mobile). Click
    // the pill to expand the full consent banner. Consent storage logic
    // is unchanged — the user must still actively choose Accept/Essential.
    banner.addEventListener('click', function () {
      if (banner.classList.contains('mcc-cb-collapsed')) {
        banner.classList.remove('mcc-cb-collapsed');
      }
    });
  }

  function init() {
    const consent = getConsent();
    if (consent && consent.v === CONSENT_VERSION) return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectBanner);
    } else {
      setTimeout(injectBanner, 300);
    }
  }

  init();
})();

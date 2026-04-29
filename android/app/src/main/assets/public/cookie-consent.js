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
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #mcc-cookie-banner {
        position: fixed; bottom: 0; left: 0; right: 0; z-index: 99999;
        background: #1a2030; border-top: 2px solid #c9a84c;
        padding: 16px 24px; box-shadow: 0 -4px 24px rgba(0,0,0,0.4);
        transform: translateY(0); opacity: 1;
        transition: transform 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.35s ease;
        font-family: 'Outfit', 'Inter', system-ui, sans-serif;
      }
      .mcc-cb-content {
        max-width: 1080px; margin: 0 auto;
        display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
      }
      .mcc-cb-text { flex: 1; font-size: 0.875rem; color: #c8d0dc; line-height: 1.5; margin: 0; }
      .mcc-cb-text strong { color: #f0f4fa; }
      .mcc-cb-link { color: #c9a84c; text-decoration: underline; }
      .mcc-cb-link:hover { color: #e6b84a; }
      .mcc-cb-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .mcc-cb-btn {
        padding: 9px 20px; border-radius: 8px; border: none; cursor: pointer;
        font-size: 0.85rem; font-weight: 600; font-family: inherit;
        transition: filter 0.15s ease; white-space: nowrap;
      }
      .mcc-cb-btn:hover { filter: brightness(1.1); }
      .mcc-cb-accept { background: linear-gradient(135deg, #c9a84c, #e6b84a); color: #12161c; }
      .mcc-cb-essential { background: rgba(255,255,255,0.08); color: #c8d0dc; border: 1px solid rgba(255,255,255,0.15); }
      .mcc-cb-manage { font-size: 0.8rem; white-space: nowrap; }
      @media (max-width: 600px) {
        #mcc-cookie-banner { padding: 14px 16px; }
        .mcc-cb-content { flex-direction: column; align-items: flex-start; gap: 12px; }
        .mcc-cb-actions { width: 100%; }
        .mcc-cb-btn { flex: 1; }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(banner);

    document.getElementById('mcc-cb-accept').addEventListener('click', function () {
      setConsent('all');
      removeBanner();
    });
    document.getElementById('mcc-cb-essential').addEventListener('click', function () {
      setConsent('essential');
      removeBanner();
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

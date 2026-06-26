function renderMCCFooter() {
  if (window.Capacitor?.isNativePlatform?.()) return document.createDocumentFragment();
  const footer = document.createElement('footer');
  footer.className = 'mcc-footer';
  footer.innerHTML = `
    <div class="footer-container">
      <div class="footer-grid">
        <div class="footer-section">
          <h4>For Vehicle Owners</h4>
          <ul>
            <li><a href="/onboarding-member.html">Create an Account</a></li>
            <li><a href="/login.html">Sign In</a></li>
            <li><a href="/how-it-works.html">How Bidding Works</a></li>
            <li><a href="/faq.html">FAQ</a></li>
            <li><a href="/member-founder.html">Founding Member Program</a></li>
          </ul>
        </div>

        <div class="footer-section">
          <h4>For Service Providers</h4>
          <ul>
            <li><a href="/signup-provider.html">Join as a Provider</a></li>
            <li><a href="/provider-pilot.html">Founding Provider Program</a></li>
            <li><a href="/provider-faq.html">Provider FAQ</a></li>
            <li><a href="/provider-tips.html">How to Win Bids</a></li>
          </ul>
        </div>

        <div class="footer-section">
          <h4>For Rideshare Drivers</h4>
          <ul>
            <li><a href="/rideshare.html">Why MCC for Rideshare</a></li>
            <li><a href="/rideshare.html#resources">Driver Resources</a></li>
            <li><a href="/rideshare.html#maintenance">Maintenance Tips</a></li>
          </ul>
        </div>

        <div class="footer-section">
          <h4>Company</h4>
          <ul>
            <li><a href="/about.html">About</a></li>
            <li><a href="/blog/">Blog</a></li>
            <li><a href="/contact.html">Contact Us</a></li>
          </ul>
        </div>

        <div class="footer-section">
          <h4>Connect</h4>
          <ul>
            <li><a href="https://facebook.com/mycarconcierge" target="_blank" rel="noopener noreferrer">Facebook</a></li>
            <li><a href="https://instagram.com/mycarconcierge" target="_blank" rel="noopener noreferrer">Instagram</a></li>
            <li><a href="https://linkedin.com/company/mycarconcierge" target="_blank" rel="noopener noreferrer">LinkedIn</a></li>
            <li><a href="https://x.com/mycarconcierge" target="_blank" rel="noopener noreferrer">X (Twitter)</a></li>
          </ul>
        </div>

        <div class="footer-section">
          <h4>Legal</h4>
          <ul>
            <li><a href="/terms.html">Terms of Service</a></li>
            <li><a href="/privacy.html">Privacy Policy</a></li>
            <li><a href="/data-deletion.html">Data Deletion</a></li>
            <li><a href="/sms-consent.html">SMS Policy</a></li>
            <li><a href="/trust-safety.html">Trust & Safety</a></li>
            <li><a href="/data-rights.html">Your Privacy Choices</a></li>
            <li><a href="/background-check-disclosure.html">FCRA Disclosure</a></li>
          </ul>
        </div>
      </div>

      <div class="footer-bottom">
        <div class="footer-brand">
          <a href="/" class="mcc-logo" aria-label="MyCarConcierge home">
            <span class="mcc-logo-word">MyCarConcierge</span>
            <svg class="mcc-logo-mark" viewBox="284 452 797 374" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <g transform="translate(0,1302) scale(0.1,-0.1)">
                <path fill="#f5f0e6" d="M7030 8083 c-19 -2 -170 -24 -335 -48 -375 -55 -437 -61 -820 -80 -331 -17 -401 -28 -475 -73 -166 -102 -140 -370 49 -491 176 -113 413 -141 874 -105 398 31 584 11 657 -72 52 -60 43 -68 -95 -76 -233 -14 -345 -44 -700 -190 -435 -179 -508 -194 -711 -143 -180 45 -1110 370 -1364 477 -350 147 -416 166 -537 154 -245 -25 -394 -237 -300 -429 39 -79 43 -81 509 -321 227 -117 460 -238 518 -268 525 -277 1302 -667 1395 -701 175 -62 436 -82 635 -48 41 7 239 41 440 76 935 164 1043 177 1284 156 167 -15 296 -40 424 -82 51 -17 95 -29 97 -27 4 4 363 1089 450 1362 35 107 42 142 33 148 -7 5 -83 45 -168 90 -85 45 -194 103 -242 129 -589 326 -910 480 -1098 527 -148 37 -367 52 -520 35z"/>
                <path fill="#c7a466" d="M9314 7451 c5 -8 2 -11 -9 -9 -21 4 -106 -229 -97 -264 3 -14 1 -19 -5 -15 -7 5 -9 -1 -5 -15 3 -13 1 -19 -5 -15 -12 7 -106 -280 -96 -296 3 -5 2 -7 -4 -4 -9 6 -80 -204 -77 -230 1 -7 -3 -13 -8 -13 -6 0 -8 -6 -5 -14 3 -8 2 -16 -3 -18 -5 -2 -11 -14 -12 -28 -2 -14 -5 -27 -8 -30 -9 -8 -174 -513 -174 -532 0 -10 -4 -18 -9 -18 -4 0 -5 -5 -1 -11 3 -6 2 -14 -4 -18 -7 -4 -13 -18 -14 -31 -2 -14 -6 -27 -9 -30 -12 -11 -141 -419 -137 -436 2 -11 11 -18 21 -18 9 1 14 -3 10 -9 -4 -6 2 -8 15 -5 14 4 20 2 15 -5 -4 -6 2 -8 15 -5 14 4 20 2 15 -5 -4 -6 2 -8 15 -5 12 4 20 3 17 -1 -6 -11 293 -103 307 -95 6 4 8 3 5 -3 -8 -12 59 -34 81 -26 11 5 13 3 7 -6 -6 -10 -2 -11 15 -6 16 5 20 4 15 -5 -5 -9 -2 -10 12 -6 11 4 31 2 44 -3 14 -6 18 -10 9 -11 -18 -2 158 -60 182 -60 23 0 41 35 32 63 -3 12 -3 18 2 14 10 -9 126 331 118 344 -3 5 0 9 7 9 7 0 9 8 6 21 -3 12 -3 18 0 15 9 -9 213 606 207 624 -3 8 -2 11 2 7 10 -9 306 883 299 901 -3 7 0 10 5 7 6 -3 10 4 9 17 0 13 -3 18 -5 11 -4 -8 -11 -7 -23 5 -10 9 -16 21 -13 26 2 4 -6 5 -18 1 -16 -5 -20 -4 -15 5 5 9 1 10 -15 5 -16 -5 -20 -4 -15 5 5 9 1 10 -15 5 -17 -5 -21 -4 -15 6 6 9 2 11 -13 7 -14 -4 -20 -2 -16 4 5 7 -2 9 -19 6 -16 -3 -24 -1 -20 5 3 5 -3 6 -17 2 -14 -4 -20 -3 -16 3 7 12 -40 25 -56 16 -6 -4 -8 -3 -5 3 7 11 -255 98 -290 96 -13 0 -20 4 -17 9 4 6 -2 7 -16 3 -14 -4 -20 -3 -16 3 7 12 -80 35 -96 26 -6 -4 -8 -3 -5 3 4 6 -4 14 -17 17 -13 3 -32 9 -42 13 -12 4 -15 3 -10 -6z m-82 -1634 c9 -1 15 -3 13 -5 -2 -3 7 -14 22 -25 105 -83 37 -267 -100 -267 -45 0 -102 24 -121 51 -7 10 -16 16 -20 12 -4 -4 -4 1 0 11 6 14 4 17 -6 11 -8 -5 -11 -3 -8 6 3 8 1 26 -3 42 -5 19 -2 39 9 65 9 20 17 44 17 52 0 8 5 15 10 16 21 2 45 17 39 25 -3 5 2 6 10 3 9 -3 16 -2 16 4 0 8 23 8 122 -1z"/>
              </g>
            </svg>
          </a>
        </div>
        <p class="footer-business-info">Zanetis Holdings LLC &middot; Flemington, NJ &middot; Founded 2025 &middot; <a href="mailto:support@mycarconcierge.com">support@mycarconcierge.com</a></p>
        <p class="footer-copyright">Copyright &copy; ${new Date().getFullYear()} Zanetis Holdings LLC. All rights reserved.</p>
      </div>
    </div>
  `;
  
  if (!document.getElementById('mcc-footer-styles')) {
    const styles = document.createElement('style');
    styles.id = 'mcc-footer-styles';
    styles.textContent = `
      .mcc-footer {
        background: linear-gradient(180deg, transparent 0%, rgba(10, 10, 15, 0.95) 20%);
        border-top: 1px solid rgba(148, 148, 168, 0.12);
        margin-top: 80px;
        padding: 60px 0 30px;
        position: relative;
        z-index: 10;
      }

      .footer-container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 0 24px;
      }

      .footer-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 40px 24px;
      }

      @media (min-width: 640px) {
        .footer-grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      @media (min-width: 1024px) {
        .footer-grid {
          grid-template-columns: repeat(6, 1fr);
          gap: 24px;
        }
      }

      .footer-section h4 {
        font-family: 'Inter', sans-serif;
        font-weight: 600;
        font-size: 0.9rem;
        color: #d4a855;
        margin-bottom: 16px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .footer-section ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      .footer-section li {
        margin-bottom: 10px;
      }

      .footer-section a {
        color: #9898a8;
        text-decoration: none;
        font-size: 0.875rem;
        transition: color 0.2s ease;
      }

      .footer-section a:hover {
        color: #f4f4f6;
      }

      .footer-bottom {
        border-top: 1px solid rgba(148, 148, 168, 0.12);
        margin-top: 48px;
        padding-top: 24px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        text-align: center;
      }

      @media (min-width: 768px) {
        .footer-bottom {
          flex-direction: row;
          justify-content: space-between;
          text-align: left;
        }
      }

      .footer-brand {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      /* Footer no-box variant: cream wordmark + glove sit directly on the
         near-black footer bg (no navy box, no border, no padding). The cream
         already has full contrast against the footer. Hover adds a subtle
         gold glow on the wordmark — no box, no underline. */
      .mcc-footer .mcc-logo {
        background: transparent;
        border: none;
        padding: 0;
      }
      .mcc-footer .mcc-logo:hover {
        border: none;
        box-shadow: none;
      }
      .mcc-footer .mcc-logo:hover .mcc-logo-word {
        text-shadow: 0 0 12px rgba(199, 164, 102, 0.5);
      }

      .footer-business-info {
        color: #6b6b7a;
        font-size: 0.8rem;
        text-align: center;
      }

      .footer-business-info a {
        color: #9898a8;
        text-decoration: none;
      }

      .footer-business-info a:hover {
        color: #f4f4f6;
      }

      .footer-copyright {
        color: #6b6b7a;
        font-size: 0.8rem;
      }
    `;
    document.head.appendChild(styles);
  }
  
  return footer;
}

document.addEventListener('DOMContentLoaded', () => {
  const main = document.querySelector('main') || document.body;
  const existingFooter = document.querySelector('.mcc-footer');
  if (!existingFooter) {
    main.parentNode.insertBefore(renderMCCFooter(), main.nextSibling);
  }
});

(function loadCookieConsent() {
  if (window.Capacitor?.isNativePlatform?.()) return;
  if (document.getElementById('mcc-cookie-consent-script')) return;
  const s = document.createElement('script');
  s.id = 'mcc-cookie-consent-script';
  s.src = '/cookie-consent.js';
  document.head.appendChild(s);
})();

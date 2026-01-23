function renderMCCFooter() {
  const footer = document.createElement('footer');
  footer.className = 'mcc-footer';
  footer.innerHTML = `
    <div class="footer-container">
      <div class="footer-grid">
        <div class="footer-section">
          <h4>For Vehicle Owners</h4>
          <ul>
            <li><a href="/signup-member.html">Create an Account</a></li>
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
            <li><a href="/about.html">Our Story</a></li>
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
            <li><a href="/sms-consent.html">SMS Policy</a></li>
            <li><a href="/trust-safety.html">Trust & Safety</a></li>
          </ul>
        </div>
      </div>

      <div class="footer-bottom">
        <div class="footer-brand">
          <img src="/logo.png" alt="My Car Concierge" class="footer-logo">
          <span class="footer-brand-name">My Car Concierge</span>
        </div>
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
        font-family: 'Outfit', sans-serif;
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

      .footer-logo {
        height: 40px;
        width: auto;
        border-radius: 8px;
      }

      .footer-brand-name {
        font-family: 'Playfair Display', serif;
        font-weight: 600;
        font-size: 1.25rem;
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

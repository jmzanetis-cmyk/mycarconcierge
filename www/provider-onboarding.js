class ProviderOnboarding {
  constructor() {
    this.currentStep = 0;
    this.totalSteps = 7;
    this.storageKey = 'mcc-provider-onboarding-completed';
  }

  shouldShow() {
    try {
      return !localStorage.getItem(this.storageKey);
    } catch (e) {
      return false;
    }
  }

  markCompleted() {
    try {
      localStorage.setItem(this.storageKey, Date.now().toString());
    } catch (e) {}
  }

  getSteps() {
    return [
      {
        title: 'Welcome to My Car Concierge!',
        icon: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>',
        content: 'You\'re now part of a growing network of trusted auto service providers. We connect you directly with vehicle owners looking for quality service.',
        detail: 'Think of us as your customer acquisition partner. We bring the customers, you bring the expertise.'
      },
      {
        title: 'Complete Your Profile',
        icon: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        content: 'Your profile is your storefront. Add your business details, service areas, specialties, and photos to stand out.',
        detail: 'Providers with complete profiles get up to 3x more bid requests. Include your certifications and specialties.',
        action: { label: 'Go to Profile Settings', section: 'settings' }
      },
      {
        title: 'Understanding Bid Packs',
        icon: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
        content: 'Bid packs are how you respond to customer requests. Purchase packs of bids, then use them to submit competitive quotes.',
        detail: 'Each bid you place goes directly to a vehicle owner who needs your service. No wasted marketing spend \u2014 you only pay to connect with real customers.'
      },
      {
        title: 'Getting Your First Job',
        icon: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        content: 'When a vehicle owner needs service in your area, you\'ll be notified. Review the request, submit your best quote, and win the job!',
        detail: 'Respond quickly and competitively. Owners choose based on price, reviews, and response time.'
      },
      {
        title: 'Payments & Escrow',
        icon: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
        content: 'Payments are held securely in escrow until the job is completed. This protects both you and the customer.',
        detail: 'Once the customer confirms the work is done, the full payment is released to your account. There are no platform fees.'
      },
      {
        title: 'Build Your Car Club',
        icon: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
        content: 'Your customers stay YOUR customers. Create a Car Club loyalty program — set up punch cards, reward repeat visits, and give customers a reason to keep coming back to you.',
        detail: 'Members auto-join your club on their first job. You also earn 10 free bids every time a referred customer books with you. It\'s retention built right in.',
        action: { label: 'Set Up Your Car Club', section: 'car-club' }
      },
      {
        title: 'Build Your Car Club',
        icon: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
        content: 'Your customers stay YOUR customers. Create a Car Club loyalty program — set up punch cards, reward repeat visits, and give customers a reason to keep coming back to you.',
        detail: 'Members auto-join your club on their first job. You also earn 10 free bids every time a referred customer books with you. It\'s retention built right in.',
        action: { label: 'Set Up Your Car Club', section: 'car-club' }
      },
      {
        title: 'You\'re All Set!',
        icon: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
        content: 'Your account is ready. Complete your profile, set up your Car Club, and start building your reputation by completing jobs and earning great reviews!',
        detail: 'Need help? Use the chat widget in the bottom right corner anytime. We\'re here to support your success.'
      }
    ];
  }

  show() {
    if (document.getElementById('provider-onboarding-overlay')) return;
    this.currentStep = 0;
    this.render();
  }

  render() {
    const existing = document.getElementById('provider-onboarding-overlay');
    if (existing) existing.remove();

    const steps = this.getSteps();
    const step = steps[this.currentStep];
    const isLast = this.currentStep === this.totalSteps - 1;
    const isFirst = this.currentStep === 0;

    const overlay = document.createElement('div');
    overlay.id = 'provider-onboarding-overlay';
    overlay.innerHTML = `
      <style>
        #provider-onboarding-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: onboardFadeIn 0.3s ease;
        }
        @keyframes onboardFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .onboard-card {
          background: var(--bg-card, #1a202a);
          border: 1px solid var(--border-subtle, rgba(160, 168, 184, 0.15));
          border-radius: 20px;
          max-width: 520px;
          width: 100%;
          padding: 40px;
          text-align: center;
          animation: onboardSlideUp 0.3s ease;
          position: relative;
        }
        @keyframes onboardSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .onboard-icon {
          width: 80px;
          height: 80px;
          margin: 0 auto 24px;
          background: linear-gradient(135deg, rgba(212, 168, 85, 0.15), rgba(212, 168, 85, 0.05));
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent-gold, #d4a855);
        }
        .onboard-title {
          font-size: 1.4rem;
          font-weight: 600;
          color: var(--text-primary, #f5f5f7);
          margin-bottom: 16px;
          font-family: 'Outfit', sans-serif;
        }
        .onboard-content {
          color: var(--text-secondary, #a0a8b8);
          font-size: 1rem;
          line-height: 1.6;
          margin-bottom: 12px;
        }
        .onboard-detail {
          color: var(--text-muted, #6b7280);
          font-size: 0.9rem;
          line-height: 1.5;
          margin-bottom: 24px;
          font-style: italic;
        }
        .onboard-progress {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin-bottom: 28px;
        }
        .onboard-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--border-subtle, rgba(160, 168, 184, 0.15));
          transition: all 0.3s ease;
        }
        .onboard-dot.active {
          background: var(--accent-gold, #d4a855);
          transform: scale(1.2);
        }
        .onboard-dot.completed {
          background: var(--accent-green, #34d399);
        }
        .onboard-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .onboard-btn {
          padding: 12px 28px;
          border-radius: 10px;
          border: none;
          font-family: 'Outfit', sans-serif;
          font-size: 0.95rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .onboard-btn-primary {
          background: linear-gradient(135deg, #d4a855 0%, #c49a45 100%);
          color: #0a0a0f;
        }
        .onboard-btn-primary:hover {
          transform: scale(1.03);
          box-shadow: 0 4px 16px rgba(212, 168, 85, 0.3);
        }
        .onboard-btn-secondary {
          background: var(--bg-input, rgba(30, 38, 48, 0.9));
          color: var(--text-secondary, #a0a8b8);
          border: 1px solid var(--border-subtle, rgba(160, 168, 184, 0.15));
        }
        .onboard-btn-secondary:hover {
          background: var(--bg-elevated, rgba(36, 44, 56, 0.95));
        }
        .onboard-skip {
          position: absolute;
          top: 16px;
          right: 16px;
          background: none;
          border: none;
          color: var(--text-muted, #6b7280);
          cursor: pointer;
          font-size: 0.85rem;
          padding: 4px 8px;
        }
        .onboard-skip:hover {
          color: var(--text-secondary, #a0a8b8);
        }
        .onboard-action-link {
          display: inline-block;
          margin-bottom: 16px;
          padding: 10px 20px;
          background: var(--accent-gold-soft, rgba(201, 162, 39, 0.18));
          color: var(--accent-gold, #d4a855);
          border-radius: 8px;
          font-size: 0.9rem;
          cursor: pointer;
          border: 1px solid rgba(212, 168, 85, 0.3);
          transition: all 0.2s ease;
        }
        .onboard-action-link:hover {
          background: rgba(212, 168, 85, 0.25);
        }
        [data-theme="light"] .onboard-card {
          background: #ffffff;
        }
        [data-theme="light"] .onboard-icon {
          background: linear-gradient(135deg, rgba(184, 148, 45, 0.15), rgba(184, 148, 45, 0.05));
          color: #b8942d;
        }
        @media (max-width: 480px) {
          .onboard-card { padding: 28px 20px; }
          .onboard-title { font-size: 1.2rem; }
        }
      </style>
      <div class="onboard-card">
        <button class="onboard-skip" onclick="window._providerOnboarding.dismiss()">Skip tour</button>
        <div class="onboard-icon">${step.icon}</div>
        <h2 class="onboard-title">${step.title}</h2>
        <p class="onboard-content">${step.content}</p>
        <p class="onboard-detail">${step.detail}</p>
        ${step.action ? `<button class="onboard-action-link" onclick="window._providerOnboarding.goToSection('${step.action.section}')">${step.action.label}</button>` : ''}
        <div class="onboard-progress">
          ${steps.map((_, i) => `<div class="onboard-dot ${i === this.currentStep ? 'active' : i < this.currentStep ? 'completed' : ''}"></div>`).join('')}
        </div>
        <div class="onboard-actions">
          ${!isFirst ? '<button class="onboard-btn onboard-btn-secondary" onclick="window._providerOnboarding.prev()">Back</button>' : '<div></div>'}
          <button class="onboard-btn onboard-btn-primary" onclick="window._providerOnboarding.${isLast ? 'complete' : 'next'}()">${isLast ? 'Get Started!' : 'Next'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) return;
    });
  }

  next() {
    if (this.currentStep < this.totalSteps - 1) {
      this.currentStep++;
      this.render();
    }
  }

  prev() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.render();
    }
  }

  complete() {
    this.markCompleted();
    this.dismiss();
  }

  dismiss() {
    this.markCompleted();
    const overlay = document.getElementById('provider-onboarding-overlay');
    if (overlay) {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 300);
    }
  }

  goToSection(section) {
    this.dismiss();
    if (typeof showSection === 'function') {
      showSection(section);
    } else if (typeof navigateToSection === 'function') {
      navigateToSection(section);
    }
  }
}

if (typeof window !== 'undefined') {
  window.ProviderOnboarding = ProviderOnboarding;
  window._providerOnboarding = new ProviderOnboarding();
}

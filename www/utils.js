/* ==========================================================================
   My Car Concierge - Shared Utilities
   Common helper functions for the entire application
   ========================================================================== */

const MCCUtils = (function() {
  'use strict';

  /* ==========================================================================
     Toast Notifications
     ========================================================================== */
  let toastContainer = null;

  function ensureToastContainer() {
    if (!toastContainer) {
      toastContainer = document.querySelector('.toast-container');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
      }
    }
    return toastContainer;
  }

  function showToast(message, type = 'info', duration = 4000) {
    const container = ensureToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
      success: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
      error: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
      warning: mccIcon('alert-triangle', 16),
      info: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'
    };
    
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-message">${message}</span>
    `;
    
    container.appendChild(toast);
    
    announceToScreenReader(message, type === 'error' ? 'assertive' : 'polite');
    
    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, duration);
    
    return toast;
  }

  /* ==========================================================================
     Date & Time Formatting
     ========================================================================== */
  function formatDate(dateStr, options = {}) {
    if (!dateStr) return 'N/A';
    
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return 'Invalid Date';
    
    const defaultOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...options
    };
    
    return date.toLocaleDateString(undefined, defaultOptions);
  }

  function formatDateTime(dateStr, options = {}) {
    if (!dateStr) return 'N/A';
    
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return 'Invalid Date';
    
    const defaultOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      ...options
    };
    
    return date.toLocaleDateString(undefined, defaultOptions);
  }

  function formatRelativeTime(dateStr) {
    if (!dateStr) return 'N/A';
    
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return 'Invalid Date';
    
    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    
    return formatDate(dateStr);
  }

  function formatTimeRemaining(endDateStr) {
    if (!endDateStr) return null;
    
    const end = new Date(endDateStr);
    const now = new Date();
    const diffMs = end - now;
    
    if (diffMs <= 0) return { expired: true, text: 'Expired' };
    
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return { expired: false, text: `${diffDays}d ${diffHours % 24}h`, urgent: false };
    }
    if (diffHours > 0) {
      return { expired: false, text: `${diffHours}h ${diffMins % 60}m`, urgent: diffHours < 2 };
    }
    return { expired: false, text: `${diffMins}m`, urgent: true };
  }

  /* ==========================================================================
     Number & Currency Formatting
     ========================================================================== */
  function formatCurrency(amount, currency = 'USD') {
    if (amount === null || amount === undefined) return 'N/A';
    
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2
    }).format(amount);
  }

  function formatNumber(num, decimals = 0) {
    if (num === null || num === undefined) return 'N/A';
    
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(num);
  }

  function formatMileage(miles) {
    if (miles === null || miles === undefined) return 'N/A';
    return formatNumber(miles) + ' mi';
  }

  /* ==========================================================================
     Loading States
     ========================================================================== */
  function showLoading(element, text = 'Loading...') {
    if (!element) return;
    
    element.dataset.originalContent = element.innerHTML;
    element.disabled = true;
    element.innerHTML = `<span class="spinner"></span> ${text}`;
  }

  function hideLoading(element) {
    if (!element) return;
    
    element.disabled = false;
    if (element.dataset.originalContent) {
      element.innerHTML = element.dataset.originalContent;
      delete element.dataset.originalContent;
    }
  }

  function showSkeleton(container, count = 3, type = 'card') {
    if (!container) return;
    
    let html = '';
    for (let i = 0; i < count; i++) {
      if (type === 'card') {
        html += '<div class="skeleton skeleton-card"></div>';
      } else if (type === 'stat') {
        html += '<div class="skeleton skeleton-stat"></div>';
      } else if (type === 'text') {
        html += `
          <div class="skeleton skeleton-text"></div>
          <div class="skeleton skeleton-text medium"></div>
          <div class="skeleton skeleton-text short"></div>
        `;
      }
    }
    container.innerHTML = html;
  }

  /* ==========================================================================
     DOM Helpers
     ========================================================================== */
  function $(selector, parent = document) {
    return parent.querySelector(selector);
  }

  function $$(selector, parent = document) {
    return Array.from(parent.querySelectorAll(selector));
  }

  function createElement(tag, options = {}) {
    const el = document.createElement(tag);
    
    if (options.className) el.className = options.className;
    if (options.id) el.id = options.id;
    if (options.html) el.innerHTML = options.html;
    if (options.text) el.textContent = options.text;
    if (options.attrs) {
      Object.entries(options.attrs).forEach(([key, val]) => el.setAttribute(key, val));
    }
    if (options.parent) options.parent.appendChild(el);
    
    return el;
  }

  /* ==========================================================================
     Validation Helpers
     ========================================================================== */
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function isValidPhone(phone) {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
  }

  function isValidZip(zip) {
    return /^\d{5}(-\d{4})?$/.test(zip);
  }

  function isValidVIN(vin) {
    if (!vin) return false;
    const cleaned = vin.replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase();
    return cleaned.length === 17;
  }

  /* ==========================================================================
     Storage Helpers
     ========================================================================== */
  function getFromStorage(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      console.error('Storage read error:', e);
      return defaultValue;
    }
  }

  function saveToStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Storage write error:', e);
      return false;
    }
  }

  function removeFromStorage(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ==========================================================================
     Debounce & Throttle
     ========================================================================== */
  function debounce(fn, delay = 300) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function throttle(fn, limit = 300) {
    let inThrottle;
    return function (...args) {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /* ==========================================================================
     URL & Query String Helpers
     ========================================================================== */
  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function setQueryParam(name, value) {
    const url = new URL(window.location);
    if (value === null || value === undefined) {
      url.searchParams.delete(name);
    } else {
      url.searchParams.set(name, value);
    }
    window.history.replaceState({}, '', url);
  }

  /* ==========================================================================
     Modal Helpers
     ========================================================================== */
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  function closeAllModals() {
    $$('.modal-backdrop.active').forEach(modal => {
      modal.classList.remove('active');
    });
    document.body.style.overflow = '';
  }

  /* ==========================================================================
     Escape HTML
     ========================================================================== */
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /* ==========================================================================
     Copy to Clipboard
     ========================================================================== */
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied to clipboard!', 'success', 2000);
      return true;
    } catch (err) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        showToast('Copied to clipboard!', 'success', 2000);
        return true;
      } catch (e) {
        showToast('Failed to copy', 'error');
        return false;
      } finally {
        textarea.remove();
      }
    }
  }

  /* ==========================================================================
     Theme Toggle
     ========================================================================== */
  function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    html.classList.add('theme-transition');
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    setTimeout(() => {
      html.classList.remove('theme-transition');
    }, 300);
    
    return newTheme;
  }

  function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    return savedTheme;
  }

  /* ==========================================================================
     API Helpers
     ========================================================================== */
  async function fetchJSON(url, options = {}) {
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };
    
    const response = await fetch(url, { ...defaultOptions, ...options });
    
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      try {
        error.data = await response.json();
      } catch (e) {}
      throw error;
    }
    
    return response.json();
  }

  async function postJSON(url, data, options = {}) {
    return fetchJSON(url, {
      method: 'POST',
      body: JSON.stringify(data),
      ...options
    });
  }

  /* ==========================================================================
     Accessibility Helpers
     ========================================================================== */
  let ariaLiveRegion = null;
  let focusTrapElement = null;
  let previousFocusElement = null;

  function initAccessibility() {
    if (!document.querySelector('.skip-to-content')) {
      const skipLink = document.createElement('a');
      skipLink.className = 'skip-to-content';
      skipLink.href = '#main-content';
      skipLink.textContent = 'Skip to main content';
      document.body.insertBefore(skipLink, document.body.firstChild);
    }
    
    if (!document.querySelector('.aria-live-region')) {
      ariaLiveRegion = document.createElement('div');
      ariaLiveRegion.className = 'aria-live-region';
      ariaLiveRegion.setAttribute('aria-live', 'polite');
      ariaLiveRegion.setAttribute('aria-atomic', 'true');
      ariaLiveRegion.setAttribute('role', 'status');
      document.body.appendChild(ariaLiveRegion);
    } else {
      ariaLiveRegion = document.querySelector('.aria-live-region');
    }
    
    // Ensure main content element has an id for skip link target
    let main = document.getElementById('main-content');
    if (!main) {
      main = document.querySelector('main, [role="main"], .main-content, .dashboard-content, .hero');
    }
    if (!main) {
      // Fallback: try to find first major content element
      main = document.querySelector('.content, .container');
    }
    if (!main) {
      // Last resort: find the second child that isn't nav, header, script, or style
      const children = Array.from(document.body.children).filter(el => {
        const tag = el.tagName.toLowerCase();
        return !['nav', 'header', 'script', 'style'].includes(tag);
      });
      main = children[1] || children[0];
    }
    if (main && !main.id) {
      main.id = 'main-content';
    }
  }

  function announceToScreenReader(message, priority = 'polite') {
    if (!ariaLiveRegion) initAccessibility();
    ariaLiveRegion.setAttribute('aria-live', priority);
    ariaLiveRegion.textContent = '';
    setTimeout(() => {
      ariaLiveRegion.textContent = message;
    }, 100);
  }

  function trapFocus(element) {
    previousFocusElement = document.activeElement;
    focusTrapElement = element;
    
    const focusableSelectors = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableElements = element.querySelectorAll(focusableSelectors);
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];
    
    if (firstFocusable) firstFocusable.focus();
    
    function handleKeyDown(e) {
      if (e.key !== 'Tab') return;
      
      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    }
    
    element._focusTrapHandler = handleKeyDown;
    element.addEventListener('keydown', handleKeyDown);
  }

  function releaseFocus() {
    if (focusTrapElement && focusTrapElement._focusTrapHandler) {
      focusTrapElement.removeEventListener('keydown', focusTrapElement._focusTrapHandler);
      delete focusTrapElement._focusTrapHandler;
    }
    focusTrapElement = null;
    if (previousFocusElement) {
      previousFocusElement.focus();
      previousFocusElement = null;
    }
  }

  /* ==========================================================================
     Error Recovery & Network Status
     ========================================================================== */
  let errorBanner = null;
  let offlineIndicator = null;

  function initErrorRecovery() {
    // Create error banner
    if (!document.querySelector('.error-banner')) {
      errorBanner = document.createElement('div');
      errorBanner.className = 'error-banner';
      errorBanner.setAttribute('role', 'alert');
      errorBanner.innerHTML = `
        <span class="error-banner-message">Something went wrong</span>
        <button class="error-banner-action" onclick="MCCUtils.retryLastAction()">Try Again</button>
        <button class="error-banner-dismiss" onclick="MCCUtils.dismissError()" aria-label="Dismiss">&times;</button>
      `;
      document.body.appendChild(errorBanner);
    }
    
    // Create offline indicator
    if (!document.querySelector('.offline-indicator')) {
      offlineIndicator = document.createElement('div');
      offlineIndicator.className = 'offline-indicator';
      offlineIndicator.setAttribute('role', 'status');
      offlineIndicator.innerHTML = `
        <span class="offline-dot"></span>
        <span>You're offline. Some features may be unavailable.</span>
      `;
      document.body.appendChild(offlineIndicator);
    }
    
    // Monitor online/offline status
    window.addEventListener('online', () => {
      hideOfflineIndicator();
      showToast('Back online!', 'success', 3000);
      announceToScreenReader('Internet connection restored');
    });
    
    window.addEventListener('offline', () => {
      showOfflineIndicator();
      announceToScreenReader('Internet connection lost. Some features may be unavailable.');
    });
  }

  function showErrorBanner(message, retryFn) {
    if (!errorBanner) initErrorRecovery();
    const msgEl = errorBanner.querySelector('.error-banner-message');
    if (msgEl) msgEl.textContent = message || 'Something went wrong. Please try again.';
    errorBanner._retryFn = retryFn || null;
    errorBanner.classList.add('visible');
    announceToScreenReader(message || 'An error occurred');
  }

  function dismissError() {
    if (errorBanner) {
      errorBanner.classList.remove('visible');
    }
  }

  function retryLastAction() {
    if (errorBanner && errorBanner._retryFn) {
      dismissError();
      errorBanner._retryFn();
    } else {
      dismissError();
      window.location.reload();
    }
  }

  function showOfflineIndicator() {
    if (!offlineIndicator) initErrorRecovery();
    offlineIndicator.classList.add('visible');
  }

  function hideOfflineIndicator() {
    if (offlineIndicator) {
      offlineIndicator.classList.remove('visible');
    }
  }

  function friendlyError(error) {
    const errorMap = {
      'Failed to fetch': 'Unable to connect. Please check your internet connection.',
      'NetworkError': 'Network issue detected. Please try again.',
      '401': 'Your session has expired. Please log in again.',
      '403': 'You don\'t have permission for this action.',
      '404': 'The requested item was not found.',
      '429': 'Too many requests. Please wait a moment and try again.',
      '500': 'Our servers are having trouble. Please try again shortly.',
      'timeout': 'The request took too long. Please try again.',
    };
    
    const errorStr = String(error?.message || error?.status || error || '');
    for (const [key, msg] of Object.entries(errorMap)) {
      if (errorStr.includes(key)) return msg;
    }
    return 'Something unexpected happened. Please try again.';
  }

  /* ==========================================================================
     Button Loading State Helper
     ========================================================================== */
  function setButtonLoading(button, loading) {
    if (!button) return;
    if (loading) {
      button._originalText = button.textContent;
      button.classList.add('btn-loading');
      button.disabled = true;
    } else {
      button.classList.remove('btn-loading');
      button.disabled = false;
      if (button._originalText) {
        button.textContent = button._originalText;
      }
    }
  }

  /* ==========================================================================
     Section Transition Helper
     ========================================================================== */
  function animateSection(element) {
    if (!element) return;
    element.classList.remove('section-enter');
    void element.offsetWidth; // Force reflow
    element.classList.add('section-enter');
  }

  /* ==========================================================================
     Onboarding Tour System
     ========================================================================== */
  let onboardingOverlay = null;
  let onboardingTooltip = null;
  let currentTourSteps = [];
  let currentTourStep = 0;

  function startOnboardingTour(tourId, steps) {
    const tourKey = `mcc_tour_${tourId}`;
    if (localStorage.getItem(tourKey) === 'completed') return;
    
    currentTourSteps = steps;
    currentTourStep = 0;
    
    // Create overlay
    if (!onboardingOverlay) {
      onboardingOverlay = document.createElement('div');
      onboardingOverlay.className = 'onboarding-overlay';
      document.body.appendChild(onboardingOverlay);
      onboardingOverlay.addEventListener('click', () => endOnboardingTour(tourId));
    }
    
    // Create tooltip
    if (!onboardingTooltip) {
      onboardingTooltip = document.createElement('div');
      onboardingTooltip.className = 'onboarding-tooltip';
      document.body.appendChild(onboardingTooltip);
    }
    
    showTourStep(tourId);
  }

  function showTourStep(tourId) {
    if (currentTourStep >= currentTourSteps.length) {
      endOnboardingTour(tourId);
      return;
    }
    
    const step = currentTourSteps[currentTourStep];
    const target = document.querySelector(step.target);
    
    // Remove previous highlight
    document.querySelectorAll('.onboarding-highlight').forEach(el => el.classList.remove('onboarding-highlight'));
    
    // Show overlay
    onboardingOverlay.classList.add('visible');
    
    // Highlight target
    if (target) {
      target.classList.add('onboarding-highlight');
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    // Position tooltip
    onboardingTooltip.innerHTML = `
      <div class="onboarding-tooltip-title">${step.title}</div>
      <div class="onboarding-tooltip-text">${step.text}</div>
      <div class="onboarding-tooltip-footer">
        <span class="onboarding-tooltip-progress">${currentTourStep + 1} of ${currentTourSteps.length}</span>
        <div class="onboarding-tooltip-actions">
          <button class="onboarding-tooltip-skip" onclick="MCCUtils.endOnboardingTour('${tourId}')">Skip</button>
          <button class="onboarding-tooltip-next" onclick="MCCUtils.nextTourStep('${tourId}')">${currentTourStep < currentTourSteps.length - 1 ? 'Next' : 'Got it!'}</button>
        </div>
      </div>
    `;
    
    // Position tooltip near target
    if (target) {
      const rect = target.getBoundingClientRect();
      const tooltipRect = onboardingTooltip.getBoundingClientRect();
      let top = rect.bottom + 12;
      let left = rect.left + (rect.width / 2) - 160;
      
      // Keep within viewport
      if (top + tooltipRect.height > window.innerHeight - 20) {
        top = rect.top - tooltipRect.height - 12;
      }
      if (left < 12) left = 12;
      if (left + 320 > window.innerWidth - 12) left = window.innerWidth - 332;
      
      onboardingTooltip.style.top = `${top + window.scrollY}px`;
      onboardingTooltip.style.left = `${left}px`;
    } else {
      // Center if no target
      onboardingTooltip.style.top = '50%';
      onboardingTooltip.style.left = '50%';
      onboardingTooltip.style.transform = 'translate(-50%, -50%)';
    }
    
    onboardingTooltip.style.display = 'block';
    announceToScreenReader(`Tour step ${currentTourStep + 1} of ${currentTourSteps.length}: ${step.title}. ${step.text}`);
  }

  function nextTourStep(tourId) {
    currentTourStep++;
    showTourStep(tourId);
  }

  function endOnboardingTour(tourId) {
    const tourKey = `mcc_tour_${tourId}`;
    localStorage.setItem(tourKey, 'completed');
    
    document.querySelectorAll('.onboarding-highlight').forEach(el => el.classList.remove('onboarding-highlight'));
    if (onboardingOverlay) onboardingOverlay.classList.remove('visible');
    if (onboardingTooltip) onboardingTooltip.style.display = 'none';
    
    currentTourSteps = [];
    currentTourStep = 0;
  }

  /* ==========================================================================
     Mobile Bottom Navigation
     ========================================================================== */
  let bottomNavElement = null;

  function initMobileBottomNav(navItems) {
    if (bottomNavElement) return;
    if (window.innerWidth > 768) return;
    
    bottomNavElement = document.createElement('nav');
    bottomNavElement.className = 'mobile-bottom-nav';
    bottomNavElement.setAttribute('aria-label', 'Mobile navigation');
    
    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'mobile-bottom-nav-items';
    
    navItems.forEach(item => {
      const navItem = document.createElement('button');
      navItem.className = `mobile-bottom-nav-item${item.active ? ' active' : ''}`;
      navItem.setAttribute('aria-label', item.label);
      navItem.innerHTML = `<span class="nav-icon">${item.icon}</span><span>${item.label}</span>`;
      navItem.addEventListener('click', () => {
        if (item.action) {
          item.action();
        } else if (item.href) {
          window.location.href = item.href;
        }
        itemsContainer.querySelectorAll('.mobile-bottom-nav-item').forEach(el => el.classList.remove('active'));
        navItem.classList.add('active');
      });
      itemsContainer.appendChild(navItem);
    });
    
    bottomNavElement.appendChild(itemsContainer);
    document.body.appendChild(bottomNavElement);
    document.body.classList.add('has-bottom-nav');
    document.querySelectorAll('.sidebar').forEach(el => el.classList.add('hide-on-mobile'));
  }

  /* ==========================================================================
     Pull to Refresh
     ========================================================================== */
  function initPullToRefresh(callback) {
    if (window.innerWidth > 768) return;
    
    let startY = 0;
    let pulling = false;
    
    const indicator = document.createElement('div');
    indicator.className = 'pull-refresh-indicator';
    indicator.innerHTML = '<div class="refresh-spinner"></div>';
    document.body.appendChild(indicator);
    
    document.addEventListener('touchstart', (e) => {
      if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
        pulling = true;
      }
    }, { passive: true });
    
    document.addEventListener('touchmove', (e) => {
      if (!pulling) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - startY;
      
      if (diff > 60 && window.scrollY === 0) {
        indicator.classList.add('pulling');
      }
    }, { passive: true });
    
    document.addEventListener('touchend', () => {
      if (indicator.classList.contains('pulling')) {
        if (callback) {
          callback();
        } else {
          window.location.reload();
        }
      }
      indicator.classList.remove('pulling');
      pulling = false;
    }, { passive: true });
  }

  /* ==========================================================================
     Step Progress Indicator
     ========================================================================== */
  function createStepProgress(container, steps, currentStep) {
    if (!container) return;
    
    container.className = 'step-progress';
    container.setAttribute('role', 'progressbar');
    container.setAttribute('aria-valuenow', String(currentStep));
    container.setAttribute('aria-valuemin', '1');
    container.setAttribute('aria-valuemax', String(steps.length));
    container.setAttribute('aria-label', `Step ${currentStep} of ${steps.length}: ${steps[currentStep - 1] || ''}`);
    
    container.innerHTML = steps.map((label, i) => {
      const stepNum = i + 1;
      const state = stepNum < currentStep ? 'completed' : stepNum === currentStep ? 'active' : '';
      const checkmark = stepNum < currentStep ? '&#10003;' : stepNum;
      
      return `
        <div class="step-progress-item ${state}">
          ${i > 0 ? '<div class="step-progress-line"></div>' : ''}
          <div>
            <div class="step-progress-circle">${checkmark}</div>
            <div class="step-progress-label">${label}</div>
          </div>
        </div>
      `;
    }).join('');
    
    announceToScreenReader(`Step ${currentStep} of ${steps.length}: ${steps[currentStep - 1] || ''}`);
  }

  function updateStepProgress(container, currentStep) {
    if (!container) return;
    const items = container.querySelectorAll('.step-progress-item');
    items.forEach((item, i) => {
      const stepNum = i + 1;
      item.classList.remove('active', 'completed');
      if (stepNum < currentStep) item.classList.add('completed');
      if (stepNum === currentStep) item.classList.add('active');
      
      const circle = item.querySelector('.step-progress-circle');
      if (circle) circle.innerHTML = stepNum < currentStep ? '&#10003;' : String(stepNum);
    });
    container.setAttribute('aria-valuenow', String(currentStep));
  }

  /* ==========================================================================
     Public API
     ========================================================================== */
  return {
    showToast,
    formatDate,
    formatDateTime,
    formatRelativeTime,
    formatTimeRemaining,
    formatCurrency,
    formatNumber,
    formatMileage,
    showLoading,
    hideLoading,
    showSkeleton,
    $,
    $$,
    createElement,
    isValidEmail,
    isValidPhone,
    isValidZip,
    isValidVIN,
    getFromStorage,
    saveToStorage,
    removeFromStorage,
    debounce,
    throttle,
    getQueryParam,
    setQueryParam,
    openModal,
    closeModal,
    closeAllModals,
    escapeHtml,
    copyToClipboard,
    toggleTheme,
    initTheme,
    fetchJSON,
    postJSON,
    initAccessibility,
    announceToScreenReader,
    trapFocus,
    releaseFocus,
    initErrorRecovery,
    showErrorBanner,
    dismissError,
    retryLastAction,
    showOfflineIndicator,
    hideOfflineIndicator,
    friendlyError,
    setButtonLoading,
    animateSection,
    startOnboardingTour,
    nextTourStep,
    endOnboardingTour,
    initMobileBottomNav,
    initPullToRefresh,
    createStepProgress,
    updateStepProgress
  };
})();

// Auto-initialize accessibility and error recovery on all pages
document.addEventListener('DOMContentLoaded', function() {
  if (typeof MCCUtils !== 'undefined') {
    MCCUtils.initAccessibility();
    MCCUtils.initErrorRecovery();
  }
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MCCUtils;
}

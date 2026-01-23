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
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };
    
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-message">${message}</span>
    `;
    
    container.appendChild(toast);
    
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
    if (isNaN(date.getTime())) return 'Invalid Date';
    
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
    if (isNaN(date.getTime())) return 'Invalid Date';
    
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
    if (isNaN(date.getTime())) return 'Invalid Date';
    
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
    postJSON
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MCCUtils;
}

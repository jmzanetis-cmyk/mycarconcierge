/**
 * White-label Branding Client
 * Detects white-label domains and applies tenant branding (colors, logo, favicon, custom CSS).
 * Include this script early in <head> on all public-facing pages.
 * Safe to include on non-white-label domains — it no-ops if no tenant is found.
 */
(function() {
  var BASE_URL = (function() {
    if (window.MCC_CONFIG && typeof window.MCC_CONFIG.apiBaseUrl === 'string') {
      return window.MCC_CONFIG.apiBaseUrl;
    }
    var hostname = window.location.hostname;
    var isNetlify = hostname.includes('netlify') || hostname === 'mycarconcierge.com' || hostname === 'www.mycarconcierge.com';
    var isNativeApp = typeof window.Capacitor !== 'undefined' || window.location.protocol === 'capacitor:' || window.location.protocol === 'file:';
    return (isNetlify || isNativeApp) ? (window.MCC_API_BASE_URL || '') : '';
  })();

  function applyTenantBranding(tenant) {
    if (!tenant) return;

    var root = document.documentElement;

    if (tenant.primary_color) {
      root.style.setProperty('--accent-gold', tenant.primary_color);
      root.style.setProperty('--accent-gold-soft', tenant.primary_color + '2e');
      root.style.setProperty('--accent-bronze', tenant.primary_color);
      root.style.setProperty('--accent-bronze-soft', tenant.primary_color + '26');
    }

    if (tenant.accent_color) {
      root.style.setProperty('--accent-teal', tenant.accent_color);
      root.style.setProperty('--accent-teal-soft', tenant.accent_color + '1f');
    }

    if (tenant.bg_color) {
      root.style.setProperty('--bg-deep', tenant.bg_color);
    }

    if (tenant.logo_url) {
      var logoEls = document.querySelectorAll('img.site-logo, img[data-wl-logo], .sidebar-brand img');
      for (var i = 0; i < logoEls.length; i++) {
        logoEls[i].src = tenant.logo_url;
        logoEls[i].alt = (tenant.brand_name || 'Logo');
      }
    }

    if (tenant.favicon_url) {
      var faviconEl = document.querySelector('link[rel="icon"]');
      if (!faviconEl) {
        faviconEl = document.createElement('link');
        faviconEl.rel = 'icon';
        document.head.appendChild(faviconEl);
      }
      faviconEl.href = tenant.favicon_url;

      var appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
      if (appleIcon) appleIcon.href = tenant.favicon_url;
    }

    if (tenant.brand_name) {
      var title = document.title;
      var sep = title.indexOf('–');
      if (sep > -1) {
        document.title = title.slice(0, sep).trim() + ' – ' + tenant.brand_name;
      } else if (title) {
        document.title = title + ' | ' + tenant.brand_name;
      } else {
        document.title = tenant.brand_name;
      }
    }

    if (tenant.custom_css) {
      var style = document.createElement('style');
      style.id = 'wl-custom-css';
      style.textContent = tenant.custom_css;
      document.head.appendChild(style);
    }

    window.MCC_WHITE_LABEL_TENANT = tenant;
    window.dispatchEvent(new CustomEvent('wl-branding-applied', { detail: tenant }));
  }

  function getStoredAuthToken() {
    try {
      var keys = Object.keys(localStorage);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].startsWith('sb-') && keys[i].endsWith('-auth-token')) {
          var p = JSON.parse(localStorage.getItem(keys[i]) || '{}');
          if (p && p.access_token) return p.access_token;
        }
      }
    } catch(e) {}
    return null;
  }

  function getInviteToken() {
    try {
      var params = new URLSearchParams(window.location.search);
      var fromUrl = params.get('wl_invite');
      if (fromUrl) { sessionStorage.setItem('wl_invite_token', fromUrl); return fromUrl; }
      return sessionStorage.getItem('wl_invite_token') || null;
    } catch(e) {}
    return null;
  }

  function loadBranding() {
    var url = (BASE_URL || '') + '/api/white-label/config';
    fetch(url, { cache: 'default' })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) {
        if (data && data.is_white_label && data.tenant) {
          applyTenantBranding(data.tenant);
          // Auto-join tenant: invite token takes priority; falls back to domain-based join
          autoJoinTenant();
        }
      })
      .catch(function() {});
  }

  // Auto-join the white-label tenant on page load when the user is authenticated.
  // Prefers HMAC-signed invite token (?wl_invite=...) if present.
  // Falls back to domain-based auto-join — server resolves tenant from Host header,
  // so no tenant_id needs to be sent from the client.
  function autoJoinTenant() {
    try {
      var token = getStoredAuthToken();
      if (!token) return;
      var inviteToken = getInviteToken();
      var body = inviteToken
        ? JSON.stringify({ invite_token: inviteToken })
        : JSON.stringify({ domain_join: true });
      fetch('/api/white-label/tenant/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: body
      })
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
          if (data && data.success) {
            if (inviteToken && !data.already_member) {
              try { sessionStorage.removeItem('wl_invite_token'); } catch(e) {}
            }
            window.dispatchEvent(new CustomEvent('wl-tenant-joined', {
              detail: { membership: data.membership, already_member: !!data.already_member }
            }));
          }
        })
        .catch(function() {});
    } catch(e) {}
  }

  window.wlAutoJoinTenant = autoJoinTenant;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadBranding);
  } else {
    loadBranding();
  }
})();

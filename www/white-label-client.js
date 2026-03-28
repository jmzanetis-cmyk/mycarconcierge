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
    var authToken = getStoredAuthToken();
    var url = (BASE_URL || '') + '/api/white-label/config';
    var headers = {};
    // Pass auth token so server can issue a signed domain_join_token for auto-join
    if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
    fetch(url, { cache: authToken ? 'no-store' : 'default', headers: headers })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) {
        if (data && data.is_white_label && data.tenant) {
          applyTenantBranding(data.tenant);
          // Auto-join: invite token takes priority, then server-issued domain assertion token
          autoJoinTenant(data.domain_join_token || null);
        }
      })
      .catch(function() {});
  }

  // Auto-join the white-label tenant when the user is authenticated.
  // Uses HMAC-signed invite token (?wl_invite=) or a server-issued domain_join_token.
  // The domain_join_token is issued by /api/white-label/config when the server validates
  // the request host — the join endpoint verifies its signature without trusting Host headers.
  function autoJoinTenant(domainJoinToken) {
    try {
      var token = getStoredAuthToken();
      if (!token) return;
      var inviteToken = getInviteToken();
      if (!inviteToken && !domainJoinToken) return; // No valid join credential
      var body = inviteToken
        ? JSON.stringify({ invite_token: inviteToken })
        : JSON.stringify({ domain_join_token: domainJoinToken });
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

  window.wlAutoJoinTenant = function() { autoJoinTenant(null); };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadBranding);
  } else {
    loadBranding();
  }
})();

/**
 * White-label Branding Client
 * Detects white-label domains and applies tenant branding (colors, logo, favicon, custom CSS).
 * Include this script early in <head> on all public-facing pages.
 * Safe to include on non-white-label domains — it no-ops if no tenant is found.
 */
(function() {
  var BASE_URL = (function() {
    var REPLIT_API_URL = 'https://my-car-concierge--jmzanetis.replit.app';
    var hostname = window.location.hostname;
    var isNetlify = hostname.includes('netlify') || hostname === 'mycarconcierge.com' || hostname === 'www.mycarconcierge.com';
    var isNativeApp = typeof window.Capacitor !== 'undefined' || window.location.protocol === 'capacitor:' || window.location.protocol === 'file:';
    return (isNetlify || isNativeApp) ? REPLIT_API_URL : '';
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

  function loadBranding() {
    var url = (BASE_URL || '') + '/api/white-label/config';
    fetch(url, { cache: 'default' })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) {
        if (data && data.is_white_label && data.tenant) {
          applyTenantBranding(data.tenant);
          // Lifecycle: auto-join the tenant when an authenticated user lands on a tenant domain.
          // Passes the server-issued join_token (from config) so the join endpoint can authorize
          // by token lookup rather than relying on host headers (which are spoofable).
          autoJoinTenantIfAuthenticated(data.tenant.join_token);
        }
      })
      .catch(function() {});
  }

  // Auto-join the current tenant when an authenticated user loads a white-label domain.
  // Idempotent. Uses join_token from config (only returned to authed users) as authz credential.
  // Uses relative URL to keep bearer token same-origin.
  function autoJoinTenantIfAuthenticated(joinToken) {
    try {
      if (!joinToken) return; // No token = not authed at config time; skip.
      var token = null;
      try {
        var lsKeys = Object.keys(localStorage);
        for (var k = 0; k < lsKeys.length; k++) {
          if (lsKeys[k].startsWith('sb-') && lsKeys[k].endsWith('-auth-token')) {
            var parsed = JSON.parse(localStorage.getItem(lsKeys[k]) || '{}');
            if (parsed && parsed.access_token) { token = parsed.access_token; break; }
          }
        }
      } catch(e) {}
      if (!token) return;
      fetch('/api/white-label/tenant/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ join_token: joinToken })
      })
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
          if (data && data.success) {
            window.dispatchEvent(new CustomEvent('wl-tenant-joined', {
              detail: { membership: data.membership, already_member: !!data.already_member }
            }));
          }
        })
        .catch(function() {});
    } catch(e) {}
  }

  // Expose for manual invocation (e.g., after login on a tenant domain)
  window.wlAutoJoinTenant = autoJoinTenantIfAuthenticated;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadBranding);
  } else {
    loadBranding();
  }
})();

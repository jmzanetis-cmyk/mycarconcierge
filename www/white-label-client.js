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
          // This triggers server-side profile stamping (tenant_id) and creates the tenant membership row.
          // Runs asynchronously after branding — does not block page render.
          autoJoinTenantIfAuthenticated();
        }
      })
      .catch(function() {});
  }

  /**
   * Tenant lifecycle wiring: auto-join the current tenant when an authenticated user
   * first loads a white-label domain. Idempotent — server returns 200 with already_member=true
   * if the user is already a member, so safe to call on every page load.
   *
   * SECURITY: Always uses a same-origin relative URL (/api/white-label/tenant/join).
   * White-label custom domains point directly to the MCC API server, so relative URLs
   * are correct. Bearer tokens are NEVER sent to cross-origin destinations.
   *
   * Role is determined server-side from the user's platform profile — the client
   * does not supply a role, preventing member→provider self-promotion exploits.
   */
  function autoJoinTenantIfAuthenticated() {
    try {
      var token = null;

      // Read Supabase access token from localStorage (populated by Supabase SDK after login).
      // Works before full SDK initialization because localStorage is synchronous.
      try {
        var lsKeys = Object.keys(localStorage);
        for (var k = 0; k < lsKeys.length; k++) {
          if (lsKeys[k].startsWith('sb-') && lsKeys[k].endsWith('-auth-token')) {
            var parsed = JSON.parse(localStorage.getItem(lsKeys[k]) || '{}');
            if (parsed && parsed.access_token) {
              token = parsed.access_token;
              break;
            }
          }
        }
      } catch(e) {}

      if (!token) {
        // No authenticated session — skip join silently
        return;
      }

      // ALWAYS use relative URL — ensures the bearer token stays same-origin.
      // White-label domains (e.g., partner.mycarconcierge.com, partner.com) are configured
      // via DNS to point to the MCC API server, so /api paths resolve to the correct origin.
      fetch('/api/white-label/tenant/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({})
        // No role field — server derives role from user's platform profile to prevent self-promotion
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

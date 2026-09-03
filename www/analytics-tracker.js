(function() {
  if (window.location.pathname.includes('/admin')) return;

  // Do not run in native iOS/Android Capacitor — App Store Guideline 5.1.2.
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return;

  var vid = localStorage.getItem('mcc_vid');
  if (!vid) {
    vid = 'v_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('mcc_vid', vid);
  }

  function getDevice() {
    if (window.Capacitor) {
      var platform = (window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || '';
      if (platform === 'ios') return 'ios_app';
      if (platform === 'android') return 'android_app';
    }
    var ua = navigator.userAgent || '';
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return 'mobile_web';
    return 'desktop_web';
  }

  function track() {
    // Task: admin-portal audit (2026-09-03) — /api/analytics/track now
    // exists (netlify/functions/analytics.js + www/_redirects), so this is
    // re-enabled after being a no-op since the 2026-07-16 audit.
    var payload = JSON.stringify({
      page: window.location.pathname,
      referrer: document.referrer || '',
      device: getDevice(),
      visitorId: vid
    });

    var apiBase = (window.MCC_CONFIG && window.MCC_CONFIG.apiBaseUrl) || '';
    var url = apiBase + '/api/analytics/track';

    // sendBeacon is fire-and-forget and survives page unload, so it's the
    // right primary path for a tracking call; fall back to fetch with
    // keepalive when it's unavailable or rejects the payload outright.
    var sent = false;
    if (navigator.sendBeacon) {
      try {
        var blob = new Blob([payload], { type: 'application/json' });
        sent = navigator.sendBeacon(url, blob);
      } catch (_e) { sent = false; }
    }
    if (!sent) {
      try {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true
        }).catch(function() { /* best-effort — never let analytics break the page */ });
      } catch (_e) { /* ignore */ }
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    track();
  } else {
    window.addEventListener('DOMContentLoaded', track);
  }
})();

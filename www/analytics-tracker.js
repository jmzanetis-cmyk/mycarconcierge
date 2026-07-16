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
    // Audit Batch 2 (2026-07-16): /api/analytics/track endpoint not built.
    // Was firing on every page load; sendBeacon fails silently but fetch
    // fallback surfaces 404s in console. No-op until the endpoint ships
    // (page_views table exists; ingest handler is Phase 6 decision).
    return;
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    track();
  } else {
    window.addEventListener('DOMContentLoaded', track);
  }
})();

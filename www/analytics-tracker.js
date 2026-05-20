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
    var apiBase = (window.MCC_CONFIG && window.MCC_CONFIG.apiBaseUrl) || '';
    var url = apiBase + '/api/analytics/track';
    var payload = JSON.stringify({
      page: window.location.pathname,
      referrer: document.referrer || '',
      device: getDevice(),
      visitorId: vid
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
    } else {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(function() {});
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    track();
  } else {
    window.addEventListener('DOMContentLoaded', track);
  }
})();

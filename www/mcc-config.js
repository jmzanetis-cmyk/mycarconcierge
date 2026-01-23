(function() {
  const defaultConfig = {
    siteUrl: 'https://mycarconcierge.com',
    siteUrlWww: 'https://www.mycarconcierge.com',
    appName: 'My Car Concierge',
    supportEmail: 'support@mycarconcierge.com'
  };

  window.MCC_CONFIG = defaultConfig;

  const isNativeApp = typeof window.Capacitor !== 'undefined' || 
                      window.location.protocol === 'capacitor:' ||
                      window.location.protocol === 'ionic:' ||
                      window.location.protocol === 'file:';

  const configUrl = isNativeApp 
    ? 'https://www.mycarconcierge.com/api/config'
    : '/api/config';

  fetch(configUrl)
    .then(function(response) {
      if (response.ok) return response.json();
      throw new Error('Config fetch failed');
    })
    .then(function(config) {
      window.MCC_CONFIG = Object.assign({}, defaultConfig, config);
      window.dispatchEvent(new CustomEvent('mcc-config-loaded', { detail: window.MCC_CONFIG }));
    })
    .catch(function(error) {
      console.log('Using default config:', error.message);
      window.dispatchEvent(new CustomEvent('mcc-config-loaded', { detail: window.MCC_CONFIG }));
    });
})();

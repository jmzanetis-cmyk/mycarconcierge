(function() {
  const REPLIT_API_URL = 'https://02d27e1f-6d6d-48b8-b938-06bb7cd16658-00-3tgt4fe0973fs.worf.replit.dev';
  
  const isNetlify = window.location.hostname.includes('netlify') || 
                    window.location.hostname === 'mycarconcierge.com' ||
                    window.location.hostname === 'www.mycarconcierge.com';
  
  const isNativeApp = typeof window.Capacitor !== 'undefined' || 
                      window.location.protocol === 'capacitor:' ||
                      window.location.protocol === 'ionic:' ||
                      window.location.protocol === 'file:';

  const apiBaseUrl = (isNetlify || isNativeApp) ? REPLIT_API_URL : '';

  const defaultConfig = {
    siteUrl: 'https://mycarconcierge.com',
    siteUrlWww: 'https://www.mycarconcierge.com',
    appName: 'My Car Concierge',
    supportEmail: 'support@mycarconcierge.com',
    apiBaseUrl: apiBaseUrl
  };

  window.MCC_CONFIG = defaultConfig;

  const configUrl = apiBaseUrl ? `${apiBaseUrl}/api/config` : '/api/config';

  fetch(configUrl)
    .then(function(response) {
      if (response.ok) return response.json();
      throw new Error('Config fetch failed');
    })
    .then(function(config) {
      window.MCC_CONFIG = Object.assign({}, defaultConfig, config, { apiBaseUrl: apiBaseUrl });
      window.dispatchEvent(new CustomEvent('mcc-config-loaded', { detail: window.MCC_CONFIG }));
    })
    .catch(function(error) {
      console.log('Using default config:', error.message);
      window.dispatchEvent(new CustomEvent('mcc-config-loaded', { detail: window.MCC_CONFIG }));
    });
})();

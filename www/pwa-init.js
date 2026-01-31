if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // Force update with cache-busting timestamp
      const swUrl = '/sw.js?v=' + Date.now();
      const registration = await navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' });
      console.log('ServiceWorker registered:', registration.scope);
      
      // Force immediate update check
      registration.update();
      
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Auto-update without asking
            newWorker.postMessage({ type: 'SKIP_WAITING' });
            window.location.reload();
          }
        });
      });
    } catch (error) {
      console.log('ServiceWorker registration failed:', error);
    }
  });
  
  // Listen for controller change and reload
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('New service worker activated, reloading...');
  });
}

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallButton();
});

function showInstallButton() {
  const existingBanner = document.getElementById('pwa-install-banner');
  if (existingBanner) return;
  
  if (sessionStorage.getItem('pwa-dismissed')) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #1a56db 0%, #1e40af 100%);
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      gap: 16px;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 90%;
    ">
      <div style="flex: 1;">
        <div style="font-weight: 600; font-size: 16px;">Install My Car Concierge</div>
        <div style="font-size: 13px; opacity: 0.9;">Add to home screen for quick access</div>
      </div>
      <button id="pwa-install-btn" style="
        background: white;
        color: #1a56db;
        border: none;
        padding: 10px 20px;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        font-size: 14px;
      ">Install</button>
      <button id="pwa-dismiss-btn" style="
        background: transparent;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 20px;
        padding: 0 8px;
        opacity: 0.8;
      ">&times;</button>
    </div>
  `;
  document.body.appendChild(banner);

  document.getElementById('pwa-install-btn').addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('Install prompt outcome:', outcome);
      deferredPrompt = null;
      banner.remove();
    }
  });

  document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
    banner.remove();
    sessionStorage.setItem('pwa-dismissed', 'true');
  });
}

window.addEventListener('appinstalled', () => {
  console.log('App installed successfully');
  deferredPrompt = null;
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.remove();
});

if (window.matchMedia('(display-mode: standalone)').matches) {
  console.log('Running as installed PWA');
}

// Force clear all caches function (can be called from console)
window.clearAllCaches = async function() {
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
    console.log('All caches cleared');
  }
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(reg => reg.unregister()));
    console.log('Service workers unregistered');
  }
  window.location.reload(true);
};

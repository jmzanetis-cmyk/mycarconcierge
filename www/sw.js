const CACHE_NAME = 'mcc-cache-v70';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/signup-member.html',
  '/signup-provider.html',
  '/members.html',
  '/providers.html',
  '/admin.html',
  '/fleet.html',
  '/provider-info.html',
  '/provider-pilot.html',
  '/privacy.html',
  '/terms.html',
  '/founding-partner-agreement.html',
  '/member-founder-agreement.html',
  '/provider-agreement.html',
  '/logo.png',
  '/manifest.json',
  '/shared-styles.css',
  '/utils.js',
  '/pwa-init.js',
  '/i18n.js',
  '/agreement-form.js',
  '/members-core.js',
  '/members-vehicles.js',
  '/members-packages.js',
  '/members-settings.js',
  '/members-extras.js',
  '/providers-core.js',
  '/providers-bids.js',
  '/providers-jobs.js',
  '/providers-analytics.js',
  '/providers-settings.js',
  '/admin.js',
  '/login.js',
  '/fleet.js',
  '/founder-dashboard.js',
  '/check-in.js',
  '/signup-provider.js',
  '/locales/en.json',
  '/locales/es.json',
  '/locales/fr.json',
  '/locales/el.json',
  '/locales/zh.json',
  '/locales/hi.json',
  '/locales/ar.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => {
        console.log('Deleting old cache:', k);
        return caches.delete(k);
      }))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== location.origin) return;

  if (url.href.includes('supabase.co') ||
      url.href.includes('stripe.com') ||
      url.href.includes('fonts.googleapis.com') ||
      url.href.includes('fonts.gstatic.com') ||
      url.href.includes('cdn.jsdelivr.net') ||
      url.href.includes('unpkg.com') ||
      url.href.includes('api.openai.com')) {
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (request.destination === 'image' || request.destination === 'font' ||
      url.pathname.endsWith('.js') || url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.png') || url.pathname.endsWith('.jpg') ||
      url.pathname.endsWith('.webp') || url.pathname.endsWith('.woff2')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  if (request.destination === 'document' ||
      url.pathname.endsWith('.html') ||
      request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('push', (event) => {
  let data = { title: 'My Car Concierge', body: 'You have a new notification' };

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    console.log('Push data parse error:', e);
  }

  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/members.html',
      type: data.type || 'general'
    },
    actions: data.actions || []
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'My Car Concierge', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/members.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            client.navigate(url);
            return;
          }
        }
        return clients.openWindow(url);
      })
  );
});

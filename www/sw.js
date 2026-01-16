const CACHE_NAME = 'mcc-cache-v8';
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
  '/forgot-password.html',
  '/reset-password.html',
  '/privacy.html',
  '/terms.html',
  '/logo.png',
  '/manifest.json',
  '/pwa-init.js',
  '/i18n.js',
  '/locales/en.json',
  '/locales/es.json',
  '/locales/fr.json',
  '/locales/el.json',
  '/locales/zh.json',
  '/locales/hi.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('supabase.co') || 
      event.request.url.includes('stripe.com') ||
      event.request.method !== 'GET') {
    return;
  }

  // For HTML files, use network-first strategy to always get fresh content
  if (event.request.destination === 'document' || 
      event.request.url.endsWith('.html') ||
      event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              return caches.match('/index.html');
            });
        })
    );
    return;
  }

  // For other assets, use stale-while-revalidate
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME)
                .then((cache) => cache.put(event.request, networkResponse.clone()));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

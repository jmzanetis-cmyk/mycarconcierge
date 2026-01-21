const CACHE_NAME = 'mcc-cache-v39';
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
  '/logo.png',
  '/manifest.json',
  '/pwa-init.js',
  '/i18n.js',
  '/members.js',
  '/providers.js',
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
  // Skip external CDN and API requests - let browser handle them directly
  const url = event.request.url;
  if (event.request.method !== 'GET' ||
      url.includes('supabase.co') || 
      url.includes('stripe.com') ||
      url.includes('fonts.googleapis.com') ||
      url.includes('fonts.gstatic.com') ||
      url.includes('cdn.jsdelivr.net') ||
      url.includes('unpkg.com') ||
      url.includes('api.openai.com') ||
      !url.startsWith(self.location.origin)) {
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
            if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'opaque') {
              try {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then((cache) => cache.put(event.request, responseToCache))
                  .catch(() => {}); // Ignore cache errors
              } catch (e) {
                // Ignore clone errors
              }
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

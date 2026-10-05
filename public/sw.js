/**
 * Keepnet PWA Service Worker
 * Enables offline bankside journal access, asset caching, and standalone PWA installation.
 */

const CACHE_NAME = 'keepnet-shell-v3';
const PRECACHE_ASSETS = [
  /* BUILD_ASSETS */
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/images/keepnet-logo-dark.png',
  '/images/welcome-hero.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(PRECACHE_ASSETS.map(asset => cache.add(asset).catch(err => {
        console.warn('[Keepnet SW] Precache warning:', asset, err);
      })));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key.startsWith('keepnet-') && key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. NEVER cache API requests (they handle dynamic data / authentication)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 2. Navigation requests: Network first, fall back to cached index.html for offline bankside usage
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(async response => {
        if (response.ok) {
          const copy = response.clone();
          await caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy)).catch(() => {});
        }
        return response;
      }).catch(async () => (await caches.match('/index.html')) || (await caches.match('/')) || new Response('Keepnet is unavailable offline. Connect once to download the app.', { status: 503, headers: { 'Content-Type': 'text/plain' } }))
    );
    return;
  }

  // 3. Static assets: Stale-while-revalidate strategy
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/assets/') ||
     url.pathname.startsWith('/icons/') ||
     url.pathname.startsWith('/images/') ||
     url.pathname.endsWith('.svg') ||
     url.pathname.endsWith('.css') ||
     url.pathname.endsWith('.js'))
  ) {
    const cachedResponse = caches.match(event.request);
    const update = fetch(event.request).then(async response => {
      if (response.ok) await caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone())).catch(() => {});
      return response;
    }).catch(async () => (await cachedResponse) || new Response('Asset unavailable offline.', { status: 503 }));
    event.waitUntil(update.then(() => {}));
    event.respondWith(cachedResponse.then(cached => cached || update));
    return;
  }
});

/* =========================================================
   SafeHaven - Official Service Worker (PWA)
   Offline Emergency Resiliency, Telemetry & Asset Caching
   ========================================================= */

const CACHE_NAME = 'safehaven-cache-v17';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/state.js',
  './js/parentUI.js',
  './js/childUI.js',
  './js/mapController.js',
  './js/safetyEngine.js',
  './js/audioNotifier.js',
  './js/icons.js',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable.png',
  './assets/avatars/aarav.jpg',
  './assets/avatars/anaya.jpg',
  './assets/avatars/kabir.jpg',
  './assets/avatars/sarah.jpg'
];

// 1. Install: Precache App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching SafeHaven core assets...');
      return cache.addAll(CORE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate: Purge obsolete caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing legacy cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch: Network-First for app files, Stale-While-Revalidate for tiles & fonts
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests
  if (req.method !== 'GET') return;

  // Local assets: Network-First so updates land immediately; cache keeps the app working offline
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return networkResponse;
      }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // External tile requests (Google Maps / CartoCDN): Stale-While-Revalidate with caching
  if (url.hostname.includes('google.com') || url.hostname.includes('cartocdn.com') || url.hostname.includes('fonts.googleapis.com')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkResponse;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});

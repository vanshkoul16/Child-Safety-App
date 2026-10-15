/* =========================================================
   SafeHaven - Official Service Worker (PWA)
   Offline Emergency Resiliency, Telemetry & Asset Caching
   ========================================================= */

const CACHE_NAME = 'safehaven-cache-v5';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/parent.css',
  './css/child.css',
  './css/map.css',
  './css/timeAllowance.css',
  './js/app.js',
  './js/state.js',
  './js/parentUI.js',
  './js/childUI.js',
  './js/mapController.js',
  './js/safetyEngine.js',
  './js/simulator.js',
  './js/audioNotifier.js',
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

// 3. Fetch: Cache-First for static assets, Stale-While-Revalidate for tiles
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests
  if (req.method !== 'GET') return;

  // Local assets: Cache-First with Network fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cachedResponse) => {
        if (cachedResponse) {
          // Stale-while-revalidate in background
          fetch(req).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(req, networkResponse));
            }
          }).catch(() => {/* offline */});
          return cachedResponse;
        }
        return fetch(req).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkResponse;
        });
      })
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

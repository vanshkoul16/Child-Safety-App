/* =========================================================
   SafeHaven - Official Service Worker (PWA)
   Offline Emergency Resiliency, Telemetry & Asset Caching
   ========================================================= */

const CACHE_NAME = 'safehaven-cache-v21';

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
  './js/permissions.js',
  './js/main.js',
  './js/live/api.js',
  './js/live/authView.js',
  './js/live/childApp.js',
  './js/live/liveApp.js',
  './js/live/liveMap.js',
  './js/live/parentApp.js',
  './js/live/push.js',
  './js/live/tracker.js',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js',
  './vendor/supabase/supabase.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable.png',
  './assets/avatars/aarav.jpg',
  './assets/avatars/anneliese.jpg',
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

  // Never cache API responses or the runtime config
  if (url.origin === self.location.origin && (url.pathname.startsWith('/api/') || url.pathname === '/app-config.js')) return;

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

// 4. Web Push: SOS alerts for guardians (live mode)
// The delivery receipt is posted only after the notification is actually shown on this device.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  if (data.type !== 'sos') return;

  event.waitUntil((async () => {
    await self.registration.showNotification(data.title || 'SafeHaven SOS', {
      body: data.body || 'Open SafeHaven now.',
      tag: `sos-${data.sosId}`,
      renotify: true,
      requireInteraction: true,
      icon: './assets/icons/icon-192.png',
      badge: './assets/icons/icon-192.png',
      vibrate: [300, 120, 300, 120, 600],
      data: { url: data.url || '/' }
    });
    if (data.notificationId && data.receiptToken) {
      try {
        await fetch('/api/live/push-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notificationId: data.notificationId, receiptToken: data.receiptToken })
        });
      } catch (e) {
        // Offline: the guardian's dashboard still shows the SOS; delivery just stays unconfirmed
      }
    }
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    windows.forEach((w) => w.postMessage({ type: 'sos-push', sosId: data.sosId }));
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      return existing.navigate(target);
    }
    return self.clients.openWindow(target);
  })());
});

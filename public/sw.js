// Phone Buzz Dashboard service worker. Everything is live data, so nothing is cached;
// it only shows a friendly page when the phone has no internet.
const OFFLINE = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open('pb-offline-v1').then((c) => c.add(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== 'pb-offline-v1').map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return; // API calls, images, scripts: straight to the network
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)));
});

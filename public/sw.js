// Minimal service worker: satisfies PWA installability (incl. TWA) without
// caching app responses, since guide content is generated per-request.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // No-op: fall through to the network for every request.
});

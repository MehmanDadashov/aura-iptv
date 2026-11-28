// AURA IPTV — kill-switch service worker.
// Replaces the old cache-first SW: clears all caches and unregisters itself
// so every client falls through to the network and picks up /sw-v2.js.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.map((n) => caches.delete(n))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll())
      .then((clients) => clients.forEach((c) => c.navigate(c.url)))
  );
});

// No fetch handler: all requests go straight to the network.
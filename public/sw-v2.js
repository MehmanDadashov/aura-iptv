const CACHE_NAME = 'aura-iptv-v10';
const urlsToCache = [
  '/',
  '/css/aura.css?v=2.1.3',
  '/js/ui.js?v=2.5.0',
    '/js/qrcodegen.min.js?v=1.0.0',
  '/js/i18n.js?v=2.3.0',
  '/js/flags.js?v=2.2.0',
  '/js/analytics.js?v=2.2.0',
  '/js/aura-ads.js?v=2.2.0',
  '/js/hls.min.js',
  '/manifest.json',
  '/icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Network-first for app shell & data (fresh deploys always win), cache fallback offline.
  event.respondWith(
    fetch(event.request).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/')))
  );
});
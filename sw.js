// Kept in step with js/version.js so each deploy busts old caches.
const CACHE_NAME = 'fitted-cache-2026.07.14-2022';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/main.js',
  './js/version.js',
  './js/camera.js',
  './js/imageProcess.js',
  './js/colorMatch.js',
  './js/matcher.js',
  './js/explain.js',
  './js/storage.js',
  './js/ai/aiRouter.js',
  './js/ai/providerGemini.js',
  './js/ai/providerClaude.js',
  './js/ai/providerGPT.js',
  './js/ui/wardrobeView.js',
  './js/ui/captureView.js',
  './js/ui/suggestView.js',
  './js/ui/matchView.js',
  './js/ui/aiChatView.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first for same-origin app shell requests. AI provider calls go to
// other origins and are left to the network untouched.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});

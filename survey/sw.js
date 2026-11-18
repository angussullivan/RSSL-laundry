/* Network-first, single-file RSSL kiosk shell. Only the survey scope is cached. */
const CACHE = 'rssl-kiosk-v5';
const SHELL = ['./index.html', './icon.svg', './manifest.webmanifest', '../IMG_7178.jpeg'];
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const LOGO_PATH = new URL('../IMG_7178.jpeg',self.registration.scope).pathname;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => (key.startsWith('rssl-survey-') || key.startsWith('rssl-kiosk-')) && key !== CACHE)
        .map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' ||
      url.origin !== self.location.origin ||
      !(url.pathname.startsWith(SCOPE_PATH) || url.pathname === LOGO_PATH)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const isPage = request.mode === 'navigate';
      const offlineFallback = () => cache.match(isPage ? './index.html' : request);
      try {
        const response = await fetch(request);
        if (response.ok) {
          // Cache a single canonical document, not one copy per query parameter.
          await cache.put(isPage ? './index.html' : request, response.clone());
        }
        return response;
      } catch (err) {
        const cached = await offlineFallback();
        if (cached) return cached;
        throw err;
      }
    })()
  );
});

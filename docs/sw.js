/* LocalHints service worker: makes the site installable and lets the pages open offline.
   API calls are never cached. Bump CACHE when you change site files. */
const CACHE = 'localhints-v5';
const FILES = ['./', 'index.html', 'business.html', 'admin.html', 'css/styles.css', 'js/config.js', 'js/api.js', 'js/engine.js', 'js/seed.js', 'js/ui.js', 'staff.html', 'js/nav.js', 'js/icons.js', 'js/charts.js', 'js/consumer.js', 'js/business.js', 'js/admin.js', 'js/staff.js', 'icon.svg', 'manifest.webmanifest'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // network first, fall back to cache when offline
  e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; }).catch(() => caches.match(e.request)));
});

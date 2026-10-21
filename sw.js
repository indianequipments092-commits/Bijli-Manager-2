// Offline-first + auto-update: cache se turant khulta hai (net ke bina bhi),
// peeche se net pe latest file download karke cache update karta hai.
const C = 'bijli-v4';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(FILES)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== C).map(k => caches.delete(k))))
      .then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Dusri sites (jaise tools server ka /health, CDN libraries) cache nahi karni, seedha net se jayein
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(cached => {
      const net = fetch(e.request, { cache: 'no-store' }).then(r => {
        if (r && r.ok) {
          const copy = r.clone();
          caches.open(C).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return r;
      }).catch(() => cached || caches.match('index.html'));
      return cached || net;
    })
  );
});

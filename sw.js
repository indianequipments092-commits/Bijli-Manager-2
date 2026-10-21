// Offline-first + auto-update: cache se turant khulta hai (net ke bina bhi),
// peeche se net pe latest file download karke cache update karta hai.
const C = 'bijli-v5';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
// Sirf ye CDN libraries (PDF, OCR, ZIP wale tools) cache hoti hain, taaki pehli baar chalne ke baad offline bhi chalein
const LIB_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];

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
  const u = new URL(e.request.url);

  // CDN libraries: cache-first (version URL me hota hai, to badalti nahi)
  if (LIB_HOSTS.includes(u.hostname)) {
    e.respondWith(
      caches.match(e.request).then(m => m || fetch(e.request).then(r => {
        if (r && (r.ok || r.type === 'opaque')) {
          const copy = r.clone();
          caches.open(C).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return r;
      }))
    );
    return;

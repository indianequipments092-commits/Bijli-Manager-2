// Offline-first + auto-update: cache se turant khulta hai (net ke bina bhi),
// peeche se net pe latest file download karke cache update karta hai.
const C = 'bijli-v16';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
// Local pdf.js (repo ka pdfjs/ folder) - alag se add, taaki ek file na mile to baaki cache ho jayein
const LOCAL_PDFJS = [
  'pdfjs/build/pdf.min.js',
  'pdfjs/build/pdf.worker.min.js',
  'pdfjs/legacy/build/pdf.min.js',
  'pdfjs/legacy/build/pdf.worker.min.js'
];
// pdf.js CDN backup bhi pehle se cache me
const PDFJS = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];
// Sirf ye CDN libraries (PDF, OCR, ZIP wale tools) cache hoti hain, taaki pehli baar chalne ke baad offline bhi chalein
const LIB_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(C).then(c =>
      c.addAll(FILES).catch(() => {})
        .then(() => Promise.all(LOCAL_PDFJS.concat(PDFJS).map(u => c.add(u).catch(() => {}))))
    ).catch(() => {})
  );
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
  }

  // Apni files: cache se turant, peeche se update
  if (u.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(m => {
      const net = fetch(e.request).then(r => {
        if (r && r.ok) {
          const copy = r.clone();
          caches.open(C).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return r;
      }).catch(() => m);
      e.waitUntil(net.catch(() => {}));
      return m || net;
    })
  );
});

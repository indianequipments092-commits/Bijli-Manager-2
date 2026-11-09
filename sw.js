// Offline-first + auto-update: cache se turant khulta hai (net ke bina bhi),
// peeche se net pe latest file download karke cache update karta hai.
const C = 'bijli-v22';
const FILES = ['./', 'index.html', 'studyos.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
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
      .then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .catch(() => {})
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  const sameOrigin = u.origin === self.location.origin;
  const libHost = LIB_HOSTS.includes(u.hostname);
  if (!sameOrigin && !libHost) return; /* API / baaki requests seedha net se, cache nahi */
  e.respondWith((async () => {
    const cached = await caches.match(e.request).catch(() => null);
    const update = fetch(e.request).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(C).then(c => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => null);
    if (libHost) return cached || await update;
    if (cached) return cached; /* peeche se update hota rahega */
    const res = await update;
    if (res) return res;
    throw new Error('Offline aur cache me nahi hai');
  })());
});

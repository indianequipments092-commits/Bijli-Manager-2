// Offline-first + auto-update: cache se turant khulta hai (net ke bina bhi),
// peeche se net pe latest file download karke cache update karta hai.
const C = 'bijli-v17';
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

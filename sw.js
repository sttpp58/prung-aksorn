// Service Worker สำหรับ "ปรุงอักษร"
// แคชเฉพาะไฟล์ของแอปเอง (app shell) เพื่อให้เปิดใช้งานได้แบบออฟไลน์
// ไม่แตะ/ไม่แคชการเรียก AI API (OpenAI, Gemini) หรือฟอนต์จาก Google เด็ดขาด
// เพื่อไม่ให้คำแปลค้างหรือใช้คีย์/โควตาผิดพลาด

const APP_RELEASE_VERSION = 'v11';
const CACHE_NAME = `prung-aksorn-${APP_RELEASE_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './app/01-shell-context-history.js',
  './app/02-translation-recovery.js',
  './app/03-storage-settings.js',
  './app/04-utils-prompts-diff.js',
  './app/05-dialog-ai-core.js',
  './app/06-projects.js',
  './app/07-glossary.js',
  './app/08-tqg-controller.js',
  './app/09-editor-draft.js',
  './app/10-ocr-chunking.js',
  './app/11-ai-providers-recovery-state.js',
  './app/12-translation-core.js',
  './app/13-batch.js',
  './app/14-export.js',
  './app/15-reader-tts.js',
  './app/16-book-tools.js',
  './app/17-reader-mode.js',
  './app/18-ingestion.js',
  './storage-v2.js',
  './tqg.js',
  './tqg-inspector.js',
  './tqg-repair.js',
  './tqg-ui.js',
  './tqg-integration.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ปล่อยผ่านทุกคำขอข้ามโดเมนไปที่เครือข่ายตรงๆ เสมอ
  // (เรียก OpenAI / Gemini / Google Fonts ฯลฯ — ห้าม cache)
  if (url.origin !== self.location.origin) {
    return;
  }
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => cache.match(event.request).then((cached) => {
      // Do not refresh a cached hit in the background. Doing so can write assets
      // from a newly deployed release into the cache still serving an older worker,
      // yielding a mixed app shell while the update is waiting to activate.
      if (cached) {
        return cached;
      }

      // Cache misses are fetched and written only into this worker's versioned cache.
      // A new release pre-caches its complete APP_SHELL before activation.
      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          return cache.put(event.request, response.clone()).then(() => response);
        }
        return response;
      }).catch(() => cached);
    }))
  );
});

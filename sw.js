// Service Worker สำหรับ "ปรุงอักษร"
// แคชเฉพาะไฟล์ของแอปเอง (app shell) เพื่อให้เปิดใช้งานได้แบบออฟไลน์
// ไม่แตะ/ไม่แคชการเรียก AI API (OpenAI, Gemini) หรือฟอนต์จาก Google เด็ดขาด
// เพื่อไม่ให้คำแปลค้างหรือใช้คีย์/โควตาผิดพลาด

const CACHE_NAME = 'prung-aksorn-v1';
const APP_SHELL = [
  './',
  './index.html',
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
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

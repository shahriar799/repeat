/* রিপিট — অফলাইন ক্যাশ। নতুন ভার্সন দিলে VERSION বাড়াতে হবে। */
const VERSION = 'repeat-v1';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json', 'data/bank.json', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // নিজের ফাইল: ক্যাশ থেকে দ্রুত দেখাও, পেছনে নতুনটা এনে রাখো
  if (url.origin === location.origin) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(e.request);
      const net = fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});

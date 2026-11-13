/* রিপিট — অফলাইন ক্যাশ। নতুন ভার্সন দিলে VERSION বাড়াতে হবে।
   অ্যাপের কোড ও প্রশ্ন (html/js/css/json): আগে নেটওয়ার্ক, না পেলে ক্যাশ — তাই আপডেট সাথে সাথে পৌঁছায়।
   ছবি ও আইকন: আগে ক্যাশ — দ্রুত, আর এগুলো বদলায় না। */
const VERSION = 'repeat-v10';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json', 'data/bank.json', 'data/notes.json', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  // cache:'reload' — ব্রাউজারের পুরনো কপি না নিয়ে সার্ভার থেকে নতুনটা আনে
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  const isAsset = /\/(img|icons)\//.test(url.pathname);
  e.respondWith(caches.open(VERSION).then(async (c) => {
    if (isAsset) {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok) c.put(e.request, r.clone());
      return r;
    }
    try {
      const r = await fetch(e.request, { cache: 'no-cache' });
      if (r.ok) c.put(e.request, r.clone());
      return r;
    } catch (err) {
      const hit = await c.match(e.request, { ignoreSearch: true });
      return hit || Response.error();
    }
  }));
});

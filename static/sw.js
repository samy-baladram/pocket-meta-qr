// Pocket Meta QR service worker (UI chat, Nov 12, 2026): keeps the card, zoom, pack and energy images and the font on the device.
// GitHub Pages sends them with max-age=600, so without this every visit after 10 min checks each image again.
// An image path always shows the same picture (c/<card id>.webp), so cache-first is safe. Only these image paths are
// handled; data.json, the lists and the page always come from the network as before.
// To drop all stored images (for example after images.py changes how it draws them): change VERSION.
const VERSION = "img-v1";
const MAX = 1500; // stored images at most (about 25 MB); the oldest go first
const IMG = /^\/((c|z|p|e)\/[^/]+\.webp|figtree\.woff2)$/; // + the page font (static/figtree.woff2)

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
  await self.clients.claim();
})()));

let puts = 0;
async function trim(c) {
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== "GET" || u.origin !== self.location.origin || !IMG.test(u.pathname)) return;
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const r = await fetch(req);
    if (r.ok && r.type === "basic") {
      e.waitUntil(c.put(req, r.clone()).then(() => (++puts % 50 === 0 ? trim(c) : 0)).catch(() => {}));
    }
    return r;
  })());
});

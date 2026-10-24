const BASE = "/", SHELL = "static-latest-shell-050b23b6db62f62f";
const PREFIX = "static-latest-shell-", CONFIG = "static-latest-maps-config-v4", MEDIA = "static-latest-map-images-r2";
const PRECACHE = ["/assets/0GtScd8f.css","/assets/9unVA9SI.css","/assets/AboutView-D-Hd_Xis.js","/assets/C8w1RCmA.css","/assets/CffDn5qI.woff2","/assets/ChangelogView-BsIWwsn-.js","/assets/CzXfDS-Z.css","/assets/D8SXnS9M.woff2","/assets/DK4MbIvE.woff2","/assets/Xa87wuGl.png","/assets/changelog-KcCUscOU.js","/assets/index-C5PK9ggV.js","/favicon.ico","/icons/treasure.webp","/index.html","/pwa-192.png","/pwa-512.png","/registerSW.js","/manifest.webmanifest"];
self.addEventListener('install', event => event.waitUntil((async () => { await (await caches.open(SHELL)).addAll(PRECACHE); await self.skipWaiting(); })()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== SHELL) await caches.delete(key);
  await self.clients.claim();
})()));
async function networkFirst(request, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request, { signal: AbortSignal.timeout(3000) });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const saved = await cache.match(request) || (fallback && await cache.match(fallback));
    // Vercel cleanUrls redirects index.html. A cached redirected response cannot
    // satisfy a navigation whose redirect mode is manual (notably an offline reload).
    if (saved) return saved.redirected ? new Response(saved.body, {
      status: saved.status, statusText: saved.statusText, headers: saved.headers,
    }) : saved;
    throw error;
  }
}
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  const path = url.pathname.slice(BASE.length);
  // A root worker must never cache or replace a historical version or the version directory.
  const firstSegment = path.split('/')[0];
  if (BASE === '/' && (/^v[0-9]/.test(firstSegment) || firstSegment === 'versions')) return;
  if (event.request.mode === 'navigate' && (path === '' || path === 'index.html')) {
    event.respondWith(networkFirst(event.request, SHELL, BASE + 'index.html')); return;
  }
  if (path === 'maps-v4.json') { event.respondWith(networkFirst(event.request, CONFIG)); return; }
  if (path.startsWith('media/')) {
    event.respondWith((async () => {
      const cache = await caches.open(MEDIA), saved = await cache.match(event.request);
      if (saved) return saved;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    })()); return;
  }
  if (PRECACHE.includes(url.pathname)) event.respondWith((async () => await (await caches.open(SHELL)).match(event.request) || fetch(event.request))());
});

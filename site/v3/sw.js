const BASE = "/v3/", SHELL = "static-v3-shell-bc8eae619240c07d";
const PREFIX = "static-v3-shell-", CONFIG = "static-v3-maps-config-v4", MEDIA = "static-v3-map-images-r2";
const PRECACHE = ["/v3/assets/9unVA9SI.css","/v3/assets/AboutView-CDoy6ogn.js","/v3/assets/C8w1RCmA.css","/v3/assets/CffDn5qI.woff2","/v3/assets/ChangelogView-Cca6KXTI.js","/v3/assets/CzXfDS-Z.css","/v3/assets/D8SXnS9M.woff2","/v3/assets/DJq4MdCl.css","/v3/assets/DK4MbIvE.woff2","/v3/assets/Xa87wuGl.png","/v3/assets/changelog-CZZAyGsl.js","/v3/assets/index-C6QU0Cv4.js","/v3/favicon.ico","/v3/icons/treasure.webp","/v3/index.html","/v3/pwa-192.png","/v3/pwa-512.png","/v3/registerSW.js","/v3/manifest.webmanifest"];
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

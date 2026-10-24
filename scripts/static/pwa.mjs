import { resolve } from 'node:path';
import { files, write } from './lib.mjs';

export async function createPwa(root, base, releaseId) {
  const scope = base === '/' ? 'latest' : base.replaceAll('/', '');
  const prefix = `static-${scope}-`;
  const shell = prefix + 'shell-' + releaseId;
  const precache = (await files(root)).filter(path => /\.(?:html|js|css|woff2|png|ico|webp)$/.test(path) && !path.startsWith('media/') && !['sw.js', 'sw-update.js', 'registerSW.js'].includes(path));
  await write(resolve(root, 'registerSW.js'), `(() => {
    if (!('serviceWorker' in navigator)) return;
    const workerURL = new URL(${JSON.stringify(base + 'sw.js')}, location.href).href;
    // A newly opened archive may inherit the root worker until its own worker claims it.
    // Only an update within this same scope should reload the already running UI.
    const hadController = navigator.serviceWorker.controller?.scriptURL === workerURL;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloading) { reloading = true; location.reload(); }
    });
    navigator.serviceWorker.register(workerURL, { scope: ${JSON.stringify(base)}, updateViaCache: 'none' }).then(registration => {
      const update = () => { if (navigator.onLine && !document.hidden) void registration.update().catch(() => {}); };
      addEventListener('online', update); addEventListener('focus', update);
      setInterval(update, 300000);
    }).catch(() => {});
  })();\n`);
  await write(resolve(root, 'manifest.webmanifest'), JSON.stringify({
    id: base, name: '加页手记解密手册', short_name: '加页手记', lang: 'zh-CN',
    start_url: base, scope: base, display: 'standalone', theme_color: '#1a1410', background_color: '#1a1410',
    icons: [192, 512].map(size => ({ src: base + `pwa-${size}.png`, sizes: `${size}x${size}`, type: 'image/png' })),
  }, null, 2) + '\n');
  await write(resolve(root, 'sw.js'), `const BASE = ${JSON.stringify(base)}, SHELL = ${JSON.stringify(shell)};
const PREFIX = ${JSON.stringify(prefix + 'shell-')}, CONFIG = ${JSON.stringify(prefix + 'maps-config-v4')}, MEDIA = ${JSON.stringify(prefix + 'map-images-r2')};
const PRECACHE = ${JSON.stringify([...precache.map(path => base + path), base + 'registerSW.js', base + 'manifest.webmanifest'])};
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
});\n`);
}

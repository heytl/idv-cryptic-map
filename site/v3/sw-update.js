// Activation bridge also upgrades old pages that have no update listener.
const upgradeExistingApp = !!self.registration.active;
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const home = new URL("/", self.location.origin).href;
      const response = await fetch(home, { cache: "no-store", signal: controller.signal });
      if (!response.ok) return;
      const shell = await caches.open("app-navigation-v1");
      await shell.put(home, response.clone());
      await shell.put(new URL("/index.html", self.location.origin).href, response);
      if (!upgradeExistingApp) return;
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        const url = new URL(client.url);
        if (url.origin === self.location.origin && ["/", "/index.html"].includes(url.pathname)) {
          // Do not await navigation here: it can wait for activation to finish.
          // Back-office paths are excluded so unsaved edits are never reloaded.
          void client.navigate(client.url).catch(() => {});
        }
      }
    } catch { /* A failed/offline update must not discard the offline shell. */ }
    finally { clearTimeout(timer); }
  })());
});

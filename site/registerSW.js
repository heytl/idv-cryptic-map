(() => {
    if (!('serviceWorker' in navigator)) return;
    const workerURL = new URL("/sw.js", location.href).href;
    // A newly opened archive may inherit the root worker until its own worker claims it.
    // Only an update within this same scope should reload the already running UI.
    const hadController = navigator.serviceWorker.controller?.scriptURL === workerURL;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloading) { reloading = true; location.reload(); }
    });
    navigator.serviceWorker.register(workerURL, { scope: "/", updateViaCache: 'none' }).then(registration => {
      const update = () => { if (navigator.onLine && !document.hidden) void registration.update().catch(() => {}); };
      addEventListener('online', update); addEventListener('focus', update);
      setInterval(update, 300000);
    }).catch(() => {});
  })();

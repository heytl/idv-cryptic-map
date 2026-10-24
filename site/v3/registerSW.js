(() => {
    if (!('serviceWorker' in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloading) { reloading = true; location.reload(); }
    });
    navigator.serviceWorker.register("/v3/sw.js", { scope: "/v3/", updateViaCache: 'none' }).then(registration => {
      const update = () => { if (navigator.onLine && !document.hidden) void registration.update().catch(() => {}); };
      addEventListener('online', update); addEventListener('focus', update);
      setInterval(update, 300000);
    }).catch(() => {});
  })();

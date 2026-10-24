(() => {
  if (!("serviceWorker" in navigator)) return;
  // Do not wait for window.load: a slow image must not block app updates.
  navigator.serviceWorker.register("/sw.js", {
    scope: "/", updateViaCache: "none",
  }).then(registration => {
    let lastCheck = 0;
    const check = () => {
      if (!navigator.onLine || document.visibilityState === "hidden" || Date.now() - lastCheck < 60_000) return;
      lastCheck = Date.now();
      void registration.update().catch(() => {});
    };
    check();
    window.addEventListener("online", check);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    window.setInterval(check, 5 * 60_000);
  }).catch(() => {}); // Offline startup keeps the installed worker and maps.
})();

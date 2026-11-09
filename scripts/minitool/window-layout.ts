import { windowMetrics } from './window-metrics.mjs';

export async function initializeWindowLayout() {
  document.body.classList.add('minitool-shell');
  const root = document.documentElement;
  const api = (window as any).xhs?.miniTool;
  const build = Number((window as any).xhs?.launchOptions?.miniToolEnv?.buildVersion || 0);
  const available = typeof api?.getWindowInfo === 'function' && (!build || Math.floor(build / 1000) >= 9490);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let revision = 0;
  function apply(info?: any) {
    const style = getComputedStyle(root);
    const fallback = Object.fromEntries(['top','bottom','left','right'].map(side => [side, parseFloat(style.getPropertyValue('--safe-area-inset-' + side)) || 0]));
    const values = windowMetrics(info, { width: root.clientWidth, height: window.innerHeight }, fallback);
    for (const [key, value] of Object.entries(values)) {
      const property = '--mini-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
      const next = value + 'px';
      if (root.style.getPropertyValue(property) !== next) root.style.setProperty(property, next);
    }
  }
  // Keep the first paint below the navigation row even if the bridge is slow.
  apply();
  async function refresh() {
    const request = ++revision;
    if (!available) { apply(); return; }
    try { const info = await api.getWindowInfo(); if (request === revision) apply(info); }
    catch { if (request === revision) apply(); }
  }
  window.addEventListener('resize', () => {
    clearTimeout(timer); timer = setTimeout(() => { void refresh(); }, 150);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refresh();
  });
  await refresh();
}

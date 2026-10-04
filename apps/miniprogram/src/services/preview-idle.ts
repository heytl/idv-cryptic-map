/** One quiet interval after load/interaction; no polling or per-frame updates. */
export function createPreviewIdle(delay = 600) {
  let ready = false;
  let interacting = false;
  let foreground = true;
  let disposed = false;
  let lastActivity = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waiting = new Set<() => void>();
  function release() {
    clearTimeout(timer); timer = undefined;
    for (const resolve of waiting) resolve();
    waiting.clear();
  }
  function schedule() {
    clearTimeout(timer); timer = undefined;
    if (!disposed && ready && !interacting && foreground && waiting.size) {
      timer = setTimeout(release, Math.max(0, delay - (Date.now() - lastActivity)));
    }
  }
  function activity() { lastActivity = Date.now(); schedule(); }
  return {
    setReady(value: boolean) { ready = value; activity(); },
    setInteracting(value: boolean) { interacting = value; activity(); },
    setForeground(value: boolean) { foreground = value; activity(); },
    activity,
    wait(): Promise<void> {
      if (disposed) return Promise.resolve();
      return new Promise(resolve => { waiting.add(resolve); schedule(); });
    },
    // User-requested preview takes priority over idle preparation.
    release,
    dispose() { disposed = true; release(); },
  };
}

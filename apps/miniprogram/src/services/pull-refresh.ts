import { computed, nextTick, ref } from "vue";

export function createPullRefresh(requestRefresh: () => Promise<boolean>, isDisabled: () => boolean) {
  const threshold = 100;
  const phase = ref<'pull' | 'ready' | 'loading' | 'success' | 'error'>('pull');
  const progress = ref(0);
  const triggered = ref(false);
  let busy = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finishDelay: (() => void) | undefined;
  const label = computed(() => ({ pull: '下拉刷新地图', ready: '松手开启金箱', loading: '金箱开启中 · 正在更新地图', success: '地图已更新', error: '刷新失败，请再次下拉重试' })[phase.value]);
  const hint = computed(() => ({ pull: '探索新的手记线索', ready: '新的线索即将揭晓', loading: '正在读取最新手记…', success: '最新线索已收入手记', error: '已保留当前地图' })[phase.value]);
  function pulling(event: { detail: { dy: number } }) {
    if (busy || isDisabled()) return;
    progress.value = Math.max(0, Math.min(1, event.detail.dy / threshold));
    phase.value = progress.value >= 1 ? 'ready' : 'pull';
  }
  function reset() {
    if (busy) return;
    triggered.value = false;
    progress.value = 0;
    phase.value = 'pull';
  }
  function delay(ms: number) {
    return new Promise<void>(resolve => {
      finishDelay = resolve;
      timer = setTimeout(() => { timer = undefined; finishDelay = undefined; resolve(); }, ms);
    });
  }
  async function refresh() {
    if (busy) return;
    if (isDisabled()) {
      // A native refresh must observe true -> false even when a request is already pending.
      triggered.value = true;
      await nextTick();
      reset();
      return;
    }
    busy = true;
    triggered.value = true;
    phase.value = 'loading';
    progress.value = 1;
    const started = Date.now();
    let success = false;
    try { success = await requestRefresh(); } catch { /* Keep the refresher recoverable on failure. */ }
    if (disposed) return;
    await delay(Math.max(0, 900 - (Date.now() - started)));
    if (disposed) return;
    phase.value = success ? 'success' : 'error';
    await delay(success ? 900 : 1500);
    if (disposed) return;
    busy = false;
    triggered.value = false;
  }
  function dispose() {
    disposed = true;
    if (timer) clearTimeout(timer);
    finishDelay?.();
  }

  return { threshold, phase, progress, triggered, label, hint, pulling, reset, refresh, dispose };
}

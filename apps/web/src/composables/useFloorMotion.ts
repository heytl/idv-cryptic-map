import { nextTick, onBeforeUnmount, ref, type Ref } from 'vue';

interface Options {
  track: Ref<HTMLElement | null>;
  width: () => number;
  index: () => number;
  count: () => number;
  change: (index: number) => void;
  progress: (index: number, duration: number) => void;
  duration?: () => number;
}

export function useFloorMotion(options: Options) {
  const pendingFloor = ref<number | null>(null);
  const settling = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  let disposed = false;
  let revision = 0;
  const duration = options.duration ?? (() => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240);
  function paint(offset: number, ms: number) {
    if (options.track.value) {
      options.track.value.style.transition = ms ? `transform ${ms}ms cubic-bezier(.22,.8,.24,1)` : 'none';
      options.track.value.style.transform = `translate3d(${offset}px,0,0)`;
    }
  }
  function cancelMotion() {
    revision++;
    clearTimeout(timer); timer = undefined;
    cancelAnimationFrame(frame); frame = 0;
    settling.value = false; pendingFloor.value = null;
    paint(0, 0);
    if (!disposed) options.progress(options.index(), 0);
  }
  function dragTrack(offset: number) {
    if (settling.value) return;
    paint(offset, 0);
    const progress = options.index() - offset / Math.max(1, options.width() + 12);
    options.progress(Math.max(0, Math.min(options.count() - 1, progress)), 0);
  }
  function returnTrack() {
    const ms = duration();
    paint(0, ms);
    options.progress(options.index(), ms);
  }
  async function requestFloor(index: number) {
    if (disposed || settling.value) return;
    if (index === options.index() || index < 0 || index >= options.count()) { returnTrack(); return; }
    settling.value = true; pendingFloor.value = index;
    const currentRevision = ++revision;
    await nextTick();
    if (disposed || currentRevision !== revision) return;
    // Render the destination neighbor before starting a cross-floor button jump.
    frame = requestAnimationFrame(() => {
      frame = 0;
      const ms = duration();
      paint(-Math.sign(index - options.index()) * (options.width() + 12), ms);
      options.progress(index, ms);
      timer = setTimeout(() => {
        timer = undefined;
        if (!disposed && currentRevision === revision) options.change(index);
      }, ms);
    });
  }
  onBeforeUnmount(() => { disposed = true; cancelMotion(); });
  return { pendingFloor, settling, cancelMotion, dragTrack, returnTrack, requestFloor };
}

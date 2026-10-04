import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { useFloorMotion } from './useFloorMotion';

const hooks = vi.hoisted(() => ({ unmount: [] as (() => void)[] }));
vi.mock('vue', async importOriginal => ({ ...await importOriginal<typeof import('vue')>(), onBeforeUnmount: (fn: () => void) => hooks.unmount.push(fn) }));
beforeEach(() => {
  hooks.unmount.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(0), 16));
  vi.stubGlobal('cancelAnimationFrame', (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
});
afterEach(() => { hooks.unmount.forEach(fn => fn()); vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup() {
  const track = { style: { transition: '', transform: '' } };
  const index = ref(0);
  const change = vi.fn();
  const progress = vi.fn();
  const motion = useFloorMotion({ track: ref(track as HTMLElement), width: () => 375, index: () => index.value, count: () => 3, change, progress });
  return { motion, track, index, change, progress };
}
describe('floor animation and selection coordination', () => {
  it('reveals the neighbor during dragging and rolls the highlight back with the image', () => {
    const { motion, track, progress } = setup();
    motion.dragTrack(-100);
    expect(track.style.transform).toContain('-100px');
    expect(progress.mock.lastCall![0]).toBeCloseTo(100 / 387);
    motion.returnTrack(); expect(track.style.transform).toContain('0px'); expect(progress).toHaveBeenLastCalledWith(0, 240);
  });
  it('supports direct jumps, moves image and indicator together, and commits only after 240ms', async () => {
    const { motion, track, change, progress } = setup();
    await motion.requestFloor(2);
    expect(motion.pendingFloor.value).toBe(2);
    vi.advanceTimersByTime(16);
    expect(track.style.transform).toContain('-387px'); expect(progress).toHaveBeenLastCalledWith(2, 240);
    vi.advanceTimersByTime(239); expect(change).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(change).toHaveBeenCalledExactlyOnceWith(2);
  });
  it('ignores repeated selections and new drags until the committed route is acknowledged', async () => {
    const { motion, track, index, change } = setup();
    await motion.requestFloor(1); await motion.requestFloor(2);
    vi.advanceTimersByTime(16); motion.dragTrack(50);
    expect(track.style.transform).toContain('-387px');
    vi.advanceTimersByTime(240); expect(change).toHaveBeenCalledExactlyOnceWith(1);
    expect(motion.settling.value).toBe(true);
    index.value = 1; motion.cancelMotion(); expect(motion.settling.value).toBe(false);
  });
  it('cannot wrap beyond the available floors', async () => {
    const { motion, change } = setup();
    await motion.requestFloor(-1); await motion.requestFloor(3);
    vi.runAllTimers(); expect(change).not.toHaveBeenCalled(); expect(motion.pendingFloor.value).toBeNull();
  });
  it('cancels stale commits during reset or resize, including before the next render', async () => {
    const { motion, change } = setup();
    const pending = motion.requestFloor(1); motion.cancelMotion(); await pending;
    vi.runAllTimers(); expect(change).not.toHaveBeenCalled();
    await motion.requestFloor(2); vi.advanceTimersByTime(16); motion.cancelMotion();
    vi.runAllTimers(); expect(change).not.toHaveBeenCalled();
  });
  it('disposes timers when leaving the detail page', async () => {
    const { motion, change } = setup();
    await motion.requestFloor(1); vi.advanceTimersByTime(16);
    hooks.unmount.forEach(fn => fn()); vi.runAllTimers();
    expect(change).not.toHaveBeenCalled();
    await motion.requestFloor(2); await nextTick(); expect(change).not.toHaveBeenCalled();
  });
  it('respects reduced motion by skipping the timed slide', async () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    const { motion, track, change, progress } = setup();
    await motion.requestFloor(1); vi.advanceTimersByTime(16);
    expect(track.style.transition).toBe('none'); expect(progress).toHaveBeenLastCalledWith(1, 0);
    vi.runAllTimers(); expect(change).toHaveBeenCalledExactlyOnceWith(1);
  });
});

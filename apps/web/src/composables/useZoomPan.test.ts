import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useZoomPan } from './useZoomPan';

const hooks = vi.hoisted(() => ({ mounted: [] as (() => void)[], unmounted: [] as (() => void)[] }));
vi.mock('vue', async importOriginal => ({
  ...await importOriginal<typeof import('vue')>(),
  onMounted: (fn: () => void) => hooks.mounted.push(fn),
  onBeforeUnmount: (fn: () => void) => hooks.unmounted.push(fn),
}));

class Viewport extends EventTarget {
  clientWidth = 375;
  clientHeight = 600;
  style = { cursor: '' };
  getBoundingClientRect() { return { left: 0, top: 0 }; }
}
const point = (clientX: number, clientY = 200) => ({ clientX, clientY });
function event(target: EventTarget, type: string, data: Record<string, unknown>) {
  const value = new Event(type, { cancelable: true });
  Object.assign(value, data);
  target.dispatchEvent(value);
  return value;
}
function setup() {
  const viewport = new Viewport();
  const windowTarget = new EventTarget();
  vi.stubGlobal('window', windowTarget);
  const swipe = { blocked: vi.fn(() => false), previous: vi.fn(() => true), next: vi.fn(() => true), move: vi.fn(), end: vi.fn(), cancel: vi.fn() };
  const wrapper = { style: {} };
  const zoom = useZoomPan({ viewport: ref(viewport as unknown as HTMLElement), wrapper: ref(wrapper as HTMLElement),
    img: ref({ naturalWidth: 900, naturalHeight: 1500 } as HTMLImageElement), swipe });
  hooks.mounted.forEach(fn => fn());
  zoom.reset(true);
  vi.clearAllMocks();
  const touch = (type: string, touches: ReturnType<typeof point>[]) => event(viewport, type, { touches });
  return { zoom, swipe, viewport, windowTarget, touch };
}
beforeEach(() => { hooks.mounted.length = 0; hooks.unmounted.length = 0; });
afterEach(() => { hooks.unmounted.forEach(fn => fn()); vi.unstubAllGlobals(); });

describe('map touch and floor swipe integration', () => {
  it('exposes an adjacent floor while dragging and commits a slow swipe on release', () => {
    const { touch, swipe } = setup();
    touch('touchstart', [point(250)]); touch('touchmove', [point(150)]);
    expect(swipe.move).toHaveBeenLastCalledWith(-100);
    touch('touchend', []); expect(swipe.end).toHaveBeenLastCalledWith(1);
  });
  it('lets a zoomed map consume movement before switching at its edge', () => {
    const { touch, swipe, zoom } = setup();
    zoom.zoomByFactor(3); vi.clearAllMocks();
    const origin = zoom.state.x;
    touch('touchstart', [point(300)]); touch('touchmove', [point(200)]);
    expect(zoom.state.x).toBe(origin - 100);
    expect(swipe.move).toHaveBeenLastCalledWith(0);
    touch('touchmove', [point(-300)]);
    expect(swipe.move.mock.lastCall![0]).toBeLessThan(-96);
    touch('touchend', []); expect(swipe.end).toHaveBeenLastCalledWith(1);
  });
  it('withdraws the preview when dragging back and snaps back below the threshold', () => {
    const { touch, swipe } = setup();
    touch('touchstart', [point(250)]); touch('touchmove', [point(140)]);
    touch('touchmove', [point(240)]); expect(swipe.move).toHaveBeenLastCalledWith(-10);
    touch('touchend', []); expect(swipe.end).toHaveBeenLastCalledWith(0);
  });
  it('keeps vertical gestures from switching floors', () => {
    const { touch, swipe } = setup();
    touch('touchstart', [point(250, 200)]); touch('touchmove', [point(150, 400)]);
    expect(swipe.move).toHaveBeenLastCalledWith(0);
    touch('touchend', []); expect(swipe.end).toHaveBeenLastCalledWith(0);
  });
  it('adds resistance at the first and last floor without claiming an unavailable floor', () => {
    const { touch, swipe } = setup();
    swipe.next.mockReturnValue(false);
    touch('touchstart', [point(250)]); touch('touchmove', [point(150)]);
    expect(swipe.move.mock.lastCall![0]).toBeGreaterThan(-25);
    touch('touchend', []); expect(swipe.end).toHaveBeenLastCalledWith(0);
    swipe.previous.mockReturnValue(false);
    touch('touchstart', [point(100)]); touch('touchmove', [point(250)]);
    expect(swipe.move.mock.lastCall![0]).toBeLessThan(37.5);
    touch('touchend', []); expect(swipe.end).toHaveBeenLastCalledWith(0);
  });
  it('continues single-finger panning after a pinch without turning it into a floor swipe', () => {
    const { touch, zoom, swipe } = setup();
    touch('touchstart', [point(100), point(200)]);
    touch('touchmove', [point(50), point(250)]);
    expect(zoom.state.scale).toBe(zoom.state.fitScale * 2);
    touch('touchend', [point(250)]);
    const previousX = zoom.state.x;
    touch('touchmove', [point(150)]);
    expect(zoom.state.x).toBeLessThan(previousX);
    expect(swipe.move).toHaveBeenLastCalledWith(0);
    touch('touchend', []); expect(swipe.end).toHaveBeenLastCalledWith(0);
  });
  it('cancels an interrupted touch and ignores its late release', () => {
    const { touch, swipe } = setup();
    touch('touchstart', [point(250)]); touch('touchmove', [point(150)]);
    touch('touchcancel', []); expect(swipe.cancel).toHaveBeenCalledOnce();
    touch('touchend', []); expect(swipe.end).not.toHaveBeenCalled();
  });
  it('ignores touches that start during a floor transition', () => {
    const { touch, swipe } = setup();
    swipe.blocked.mockReturnValue(true); touch('touchstart', [point(250)]);
    swipe.blocked.mockReturnValue(false); touch('touchmove', [point(100)]); touch('touchend', []);
    expect(swipe.move).not.toHaveBeenCalled(); expect(swipe.end).not.toHaveBeenCalled();
  });
  it('supports mouse dragging and cancels pending motion on rotation and reset', () => {
    const { viewport, windowTarget, zoom, swipe } = setup();
    event(viewport, 'mousedown', { button: 0, ...point(250) });
    event(windowTarget, 'mousemove', point(100)); event(windowTarget, 'mouseup', {});
    expect(swipe.end).toHaveBeenLastCalledWith(1);
    zoom.rotateMap(); zoom.reset(true); expect(swipe.cancel).toHaveBeenCalledTimes(2);
  });
  it('does not start a map gesture from toolbar buttons', () => {
    const { viewport, windowTarget, swipe } = setup();
    Object.assign(viewport, { closest: () => ({}) });
    event(viewport, 'mousedown', { button: 0, ...point(250) });
    event(windowTarget, 'mousemove', point(100)); event(windowTarget, 'mouseup', {});
    expect(swipe.end).not.toHaveBeenCalled();
  });
  it('stops an active mouse drag when a button or keyboard selection starts an animation', () => {
    const { viewport, windowTarget, zoom, swipe } = setup();
    event(viewport, 'mousedown', { button: 0, ...point(250) });
    const x = zoom.state.x;
    swipe.blocked.mockReturnValue(true);
    event(windowTarget, 'mousemove', point(100)); event(windowTarget, 'mouseup', {});
    expect(zoom.state.x).toBe(x); expect(swipe.end).not.toHaveBeenCalled();
  });
  it('does not interpret the click generated after a drag as a fullscreen-background tap', () => {
    const { viewport, windowTarget } = setup();
    event(viewport, 'mousedown', { button: 0, ...point(250) });
    event(windowTarget, 'mousemove', point(100)); event(windowTarget, 'mouseup', {});
    expect(event(viewport, 'click', {}).defaultPrevented).toBe(true);
  });
});

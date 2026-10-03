import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { createMapGesture } from "./map-gestures";

// Exercise the actual view-layer code shipped in WXML, with its native facade.
const component = readFileSync(new URL("../components/MapViewport.vue", import.meta.url), "utf8");
const code = component.match(/<script module="floorMotion" lang="wxs">([\s\S]*?)<\/script>/)![1];
const touch = (x: number, y = 100, identifier = 1) => ({ identifier, pageX: x, pageY: y });
const event = (points = [touch(200)], ended = false) => ({ touches: ended ? [] : points, changedTouches: points });
function setup() {
  const module = { exports: {} as Record<string, (...args: any[]) => void> };
  runInNewContext(code, { module });
  const state = {};
  const setStyle = vi.fn();
  const mapStyle = vi.fn();
  const gesture = createMapGesture();
  let result: string | undefined;
  const callMethod = vi.fn((name: string, data: ReturnType<typeof event>) => {
    if (name === "touchStart") gesture.start(data, 0);
    if (name === "touchMoved") gesture.move(data);
    if (name === "touchCancel") gesture.cancel();
    if (name === "touchEnd") result = gesture.end(data, 200);
    if (name === "onScale") gesture.scaled();
    if (name === "requestFloor") result = (data as any) === 1 ? "next" : "previous";
  });
  const owner = { getState: () => state, selectComponent: (selector: string) => ({ setStyle: selector === ".map-surface" ? mapStyle : setStyle }), callMethod };
  const config = { width: 375, height: 500, imageWidth: 375, imageHeight: 500, scale: 1, revision: 0, busy: false, previous: true, next: true, serial: 0, offset: 0, duration: 0 };
  module.exports.configure(config, undefined, owner);
  setStyle.mockClear();
  return { motion: module.exports, owner, setStyle, mapStyle, callMethod, config, result: () => result };
}

describe("view-layer floor motion", () => {
  it("ignores the undefined change:motion callback before the first data patch", () => {
    const s = setup();
    expect(() => s.motion.configure(undefined, undefined, s.owner)).not.toThrow();
    s.motion.start(event(), s.owner);
    s.motion.move(event([touch(100)]), s.owner);
    expect(s.setStyle.mock.lastCall![0].transform).toBe("translate3d(-100px,0,0)");
  });
  it("follows the finger and reveals the neighbor without per-frame JS notifications", () => {
    const s = setup();
    s.motion.start(event(), s.owner);
    for (let x = 199; x >= 100; x--) s.motion.move(event([touch(x)]), s.owner);
    expect(s.callMethod.mock.calls.map(([name]) => name)).toEqual(["touchStart", "touchMoved"]);
    expect(s.setStyle.mock.lastCall![0].transform).toBe("translate3d(-100px,0,0)");
    s.motion.end(event([touch(100)], true), s.owner);
    expect(s.result()).toBe("next");
  });
  it("resists the first/last edge and animates back with a command", () => {
    const s = setup();
    s.motion.configure({ ...s.config, next: false }, s.config, s.owner);
    s.motion.start(event(), s.owner); s.motion.move(event([touch(100)]), s.owner);
    const style = s.setStyle.mock.lastCall![0];
    expect(parseFloat(style.transform.slice(12))).toBeGreaterThan(-25);
    s.motion.configure({ ...s.config, serial: 1, offset: 0, duration: 240 }, s.config, s.owner);
    expect(s.setStyle.mock.lastCall![0].transition).toContain("240ms");
    expect(s.setStyle.mock.lastCall![0].transform).toBe("translate3d(0px,0,0)");
  });
  it("pans the zoomed map before spending any distance on the floor track", () => {
    const s = setup();
    s.motion.configure({ ...s.config, scale: 2 }, s.config, s.owner);
    s.motion.start(event(), s.owner); s.motion.move(event([touch(100)]), s.owner);
    expect(s.mapStyle.mock.lastCall![0].transform).toBe("translate3d(-287.5px,-250px,0) scale(2)");
    expect(s.setStyle.mock.lastCall![0].transform).toBe("translate3d(0px,0,0)");
    s.motion.end(event([touch(100)], true), s.owner);
    expect(s.result()).toBeUndefined();
  });
  it("switches only after dragging beyond the zoomed map edge by the threshold", () => {
    for (const [x, expected] of [[0, undefined], [-80, "next"], [480, "previous"]] as const) {
      const s = setup();
      s.motion.configure({ ...s.config, scale: 2 }, s.config, s.owner);
      s.motion.start(event(), s.owner); s.motion.move(event([touch(x)]), s.owner);
      s.motion.end(event([touch(x)], true), s.owner);
      expect(s.result()).toBe(expected);
    }
  });
  it("supports pinch followed immediately by one-finger pan without switching floors", () => {
    const s = setup();
    s.motion.start(event([touch(100), touch(200, 100, 2)]), s.owner);
    s.motion.move(event([touch(50), touch(250, 100, 2)]), s.owner);
    expect(s.mapStyle.mock.lastCall![0].transform).toBe("translate3d(-150px,-100px,0) scale(2)");
    s.motion.end({ touches: [touch(50)], changedTouches: [touch(250, 100, 2)] }, s.owner);
    s.motion.move(event([touch(-300, 50)]), s.owner);
    expect(s.mapStyle.mock.lastCall![0].transform).toBe("translate3d(-375px,-150px,0) scale(2)");
    expect(s.setStyle.mock.lastCall![0].transform).toBe("translate3d(0px,0,0)");
    s.motion.end(event([touch(-300, 50)], true), s.owner);
    expect(s.result()).toBeUndefined();
    expect(s.callMethod).toHaveBeenCalledWith("onScale", { detail: { scale: 2 } });
  });
  it("withdraws the floor reveal when dragging back inside the map", () => {
    const s = setup();
    s.motion.configure({ ...s.config, scale: 2 }, s.config, s.owner);
    s.motion.start(event(), s.owner); s.motion.move(event([touch(-100)]), s.owner);
    expect(s.setStyle.mock.lastCall![0].transform).toBe("translate3d(-112.5px,0,0)");
    s.motion.move(event([touch(100)]), s.owner);
    expect(s.setStyle.mock.lastCall![0].transform).toBe("translate3d(0px,0,0)");
    s.motion.end(event([touch(100)], true), s.owner);
    expect(s.result()).toBeUndefined();
  });
  it("restores the track when a second finger arrives and cannot turn that gesture into a tap", () => {
    const s = setup();
    s.motion.start(event(), s.owner); s.motion.move(event([touch(150)]), s.owner);
    s.motion.start(event([touch(150), touch(250, 100, 2)]), s.owner);
    expect(s.setStyle.mock.lastCall![0].transform).toBe("translate3d(0px,0,0)");
    s.motion.end(event([touch(200)], true), s.owner);
    expect(s.result()).toBeUndefined();
  });
  it("rejects vertical gestures, cancelled drags, and input during the slide animation", () => {
    const s = setup();
    s.motion.start(event(), s.owner); s.motion.move(event([touch(200, 150)]), s.owner);
    s.motion.end(event([touch(100, 150)], true), s.owner);
    expect(s.result()).toBeUndefined();
    s.motion.start(event(), s.owner); s.motion.cancel(event(), s.owner);
    s.motion.end(event([touch(100)], true), s.owner);
    expect(s.result()).toBeUndefined();
    s.callMethod.mockClear();
    s.motion.configure({ ...s.config, busy: true }, s.config, s.owner);
    s.motion.start(event(), s.owner); s.motion.move(event([touch(100)]), s.owner); s.motion.end(event([touch(100)], true), s.owner);
    expect(s.callMethod).not.toHaveBeenCalled();
  });
});

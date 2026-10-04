import { describe, expect, it } from "vitest";
import { adjacentFloor, createMapGesture, type TouchPoint } from "./map-gestures";

const point = (pageX: number, pageY = 100, identifier = 1): TouchPoint => ({ pageX, pageY, identifier });
const start = (points = [point(200)]) => ({ touches: points, changedTouches: points });
const end = (p = point(100)) => ({ touches: [], changedTouches: [p] });

describe("detail map gestures", () => {
  it("switches in capsule order, without wrapping or inventing missing floors", () => {
    const floors = ["full", "1f", "3f"];
    expect(adjacentFloor(floors, "full", 1)).toBe("1f");
    expect(adjacentFloor(floors, "3f", -1)).toBe("1f");
    expect(adjacentFloor(floors, "3f", 1)).toBeUndefined();
    expect(adjacentFloor(floors, "full", -1)).toBeUndefined();
    expect(adjacentFloor(floors, "missing", 1)).toBeUndefined();
  });
  it("leaves all horizontal and vertical swipes to the WXS view layer", () => {
    const g = createMapGesture();
    for (const [x, y, duration] of [
      [100, 110, 300], [300, 100, 300], [165, 100, 200], [100, 200, 300], [100, 100, 900],
    ] as const) {
      g.start(start(), 0);
      expect(g.end(end(point(x, y)), duration)).toBeUndefined();
    }
  });
  it("never treats panning or a pinch followed by one finger as a tap", () => {
    const g = createMapGesture();
    g.start(start(), 0);
    expect(g.end(end(), 200)).toBeUndefined();
    g.start(start(), 0);
    g.start(start([point(200), point(250, 100, 2)]), 10);
    expect(g.end({ touches: [point(200)], changedTouches: [point(250, 100, 2)] }, 100)).toBeUndefined();
    expect(g.end(end(), 200)).toBeUndefined();
    g.start(start(), 0); g.scaled();
    expect(g.end(end(point(200)), 200)).toBeUndefined();
  });
  it("distinguishes a tap from long press, cancelled touch, and dragging back to the origin", () => {
    const g = createMapGesture();
    g.start(start(), 0);
    expect(g.end(end(point(204)), 150)).toBe("tap");
    g.start(start(), 0);
    expect(g.end(end(point(200)), 500)).toBeUndefined();
    g.start(start(), 0); g.cancel();
    expect(g.end(end(), 100)).toBeUndefined();
    g.start(start(), 0); g.move(start([point(130)]));
    expect(g.end(end(point(200)), 200)).toBeUndefined();
  });
});

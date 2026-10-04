import { describe, expect, it } from "vitest";
import { fitScale, rotatedSize, rotationOffset, clampPosition, type QuarterTurn } from "./viewport";

describe("cropped viewport geometry", () => {
  const region = { width: 900, height: 735 };
  it.each([0, 90, 180, 270] as QuarterTurn[])("fits the whole region and keeps all corners positive at %s degrees", rotation => {
    const viewport = { width: 320, height: 480 };
    const scale = fitScale(region, viewport, rotation);
    const size = rotatedSize(region, rotation);
    expect(size.width * scale).toBeLessThanOrEqual(viewport.width + 1e-8);
    expect(size.height * scale).toBeLessThanOrEqual(viewport.height + 1e-8);
    const offset = rotationOffset(region, rotation);
    const radians = rotation * Math.PI / 180;
    const corners = [[0, 0], [900, 0], [0, 735], [900, 735]].map(([x, y]) => ({
      x: Math.round(x * Math.cos(radians) - y * Math.sin(radians) + offset.x),
      y: Math.round(x * Math.sin(radians) + y * Math.cos(radians) + offset.y),
    }));
    expect(Math.min(...corners.map(p => p.x))).toBeCloseTo(0);
    expect(Math.min(...corners.map(p => p.y))).toBeCloseTo(0);
    expect(Math.max(...corners.map(p => p.x))).toBe(size.width);
    expect(Math.max(...corners.map(p => p.y))).toBe(size.height);
  });
  it("uses region dimensions rather than full-image height", () => {
    expect(fitScale(region, { width: 320, height: 200 })).toBeCloseTo(200 / 735);
    expect(fitScale(region, { width: 0, height: 200 })).toBe(0);
  });
  it("centers small content and prevents large content being dragged out of view", () => {
    expect(clampPosition(99, 200, 320)).toBe(60);
    expect(clampPosition(99, 900, 320)).toBe(0);
    expect(clampPosition(-999, 900, 320)).toBe(-580);
  });
});

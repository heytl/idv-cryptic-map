import { describe, expect, it } from "vitest";
import { isPublicMapConfigV4, resolveFloorSource } from "./map-client";
import { availableFloors, catalogFilterValuesV2, enabledEntranceTypesV2 } from "./catalog";
import type { PublicMapConfigV4 } from "./map-v3";

export function fixture(): PublicMapConfigV4 {
  return { schemaVersion: 4, dataVersion: 35, updatedAt: "2026-10-02T00:00:00Z", defaultFloor: "full",
    dictionaries: { modes: [], entrances: [], directions: [], passages: [], floors: [] },
    gameMaps: [{ id: "lady-of-doom", name: "厄运之女", sort: 10, published: true }],
    layouts: [{ id: 1, gameMapId: "lady-of-doom", mode: "hard", name: "example", displayName: "example",
      remarks: "", sort: 10, legacyNames: [], entrances: [],
      floorImages: { full: { url: "https://example.com/full.webp" }, floor2: { url: "https://example.com/old-floor2.webp" } },
      floorRegions: { sourceUrl: "https://example.com/full.webp", imageWidth: 900, imageHeight: 1500,
        regions: { floor1: { x: 0, y: 0, width: 900, height: 735 } } } }] };
}

describe("V4 client boundary", () => {
  it("resolves full, region and legacy floors without inventing missing floors", () => {
    const data = fixture(), layout = data.layouts[0];
    expect(isPublicMapConfigV4(data)).toBe(true);
    expect(availableFloors(layout)).toEqual(["full", "floor1", "floor2"]);
    expect(resolveFloorSource(layout, "full")).toEqual({ url: layout.floorRegions!.sourceUrl, imageWidth: 900, imageHeight: 1500 });
    expect(resolveFloorSource(layout, "floor1")?.url).toBe(resolveFloorSource(layout, "full")?.url);
    expect(resolveFloorSource(layout, "floor1")?.region).toEqual({ x: 0, y: 0, width: 900, height: 735 });
    expect(resolveFloorSource(layout, "floor2")).toEqual({ url: "https://example.com/old-floor2.webp" });
    expect(resolveFloorSource(layout, "basement")).toBeUndefined();
  });
  it("rejects legacy protocols, malformed layouts and mismatched full images", () => {
    expect(isPublicMapConfigV4({ ...fixture(), schemaVersion: 3 })).toBe(false);
    expect(isPublicMapConfigV4({ ...fixture(), layouts: [null] })).toBe(false);
    const data = fixture();
    data.layouts[0].floorRegions!.sourceUrl = "https://example.com/replaced.webp";
    expect(isPublicMapConfigV4(data)).toBe(false);
  });
  it("rejects out-of-bounds regions and dual sources", () => {
    const data = fixture();
    data.layouts[0].floorRegions!.regions.floor1!.x = 1;
    expect(isPublicMapConfigV4(data)).toBe(false);
    data.layouts[0].floorRegions!.regions.floor1!.x = 0;
    data.layouts[0].floorImages.floor1 = { url: "https://example.com/duplicate.webp" };
    expect(isPublicMapConfigV4(data)).toBe(false);
  });
  it("rejects dangling map references and duplicate IDs", () => {
    const data = fixture();
    data.layouts[0].gameMapId = "missing";
    expect(isPublicMapConfigV4(data)).toBe(false);
    data.layouts[0].gameMapId = "lady-of-doom";
    data.layouts.push(data.layouts[0]);
    expect(isPublicMapConfigV4(data)).toBe(false);
  });
  it("preserves current published entrance rules and front passage filters", () => {
    expect(enabledEntranceTypesV2("hard")).toEqual(["side"]);
    expect(enabledEntranceTypesV2("nightmare")).toEqual(["front", "upstairs"]);
    expect(catalogFilterValuesV2("front")).toEqual(["upperLeft", "upperRight", "both", "triple"]);
    expect(catalogFilterValuesV2("side")).toEqual(["left", "right", "south", "north"]);
  });
});

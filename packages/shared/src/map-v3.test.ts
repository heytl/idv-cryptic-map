import { describe, it, expect } from "vitest";
import {
  assetKeys,
  compatibleV2Config,
  migrateV2ToV3,
  toPublicMapConfigV3,
  validateMapConfigV3,
} from "./map-v3";
import type { MapConfigV2 } from "./map-v2";
const v2: MapConfigV2 = {
  schemaVersion: 2,
  version: 12,
  updatedAt: "2026-09-22",
  maps: [
    {
      id: 8,
      name: "甲",
      displayName: "甲",
      mode: "hard",
      sort: 1,
      published: false,
      remarks: "",
      layout: { full: { key: "maps/full/test.webp" } },
      entrances: [],
    },
  ],
};
describe("V3 content", () => {
  it("migration retains IDs, media, metadata and round-trips to V2", () => {
    const c = migrateV2ToV3(v2);
    expect(c.layouts[0]!.id).toBe(8);
    expect(c.layouts[0]!.floorImages).toEqual(v2.maps[0]!.layout);
    expect(compatibleV2Config(c)).toEqual(v2);
    expect(validateMapConfigV3(c).valid).toBe(true);
  });
  it("rejects orphan layouts and duplicate IDs while allowing a referenced map to be retired", () => {
    const c = migrateV2ToV3(v2);
    c.layouts[0]!.gameMapId = "missing";
    expect(validateMapConfigV3(c).valid).toBe(false);
    c.layouts[0]!.gameMapId = c.gameMaps[0]!.id;
    c.gameMaps[0]!.deletedAt = "now";
    expect(validateMapConfigV3(c).valid).toBe(true);
    c.gameMaps[0]!.deletedAt = null;
    c.gameMaps.push({ ...c.gameMaps[0]! });
    expect(validateMapConfigV3(c).valid).toBe(false);
  });
  it("hides unpublished maps and never leaks the second map through V2", () => {
    const c = migrateV2ToV3(v2);
    c.gameMaps.push({ id: "second", name: "乙", sort: 2, published: false });
    c.layouts.push({ ...c.layouts[0]!, id: 9, gameMapId: "second" });
    expect(compatibleV2Config(c).maps.map((l) => l.id)).toEqual([8]);
    expect(toPublicMapConfigV3(c, "https://media.test").gameMaps).toHaveLength(
      1,
    );
    expect(assetKeys(c)).toEqual(["maps/full/test.webp"]);
  });
  it("invalid shape returns errors instead of throwing", () => {
    for (const input of [
      null,
      {},
      { schemaVersion: 3, gameMaps: [null], layouts: [] },
      { schemaVersion: 3, gameMaps: [], layouts: [null] },
    ])
      expect(validateMapConfigV3(input).valid).toBe(false);
  });
});

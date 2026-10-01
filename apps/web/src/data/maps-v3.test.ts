import { describe, it, expect, beforeEach } from "vitest";
import {
  assetKeys,
  migrateV2ToV3,
  toPublicMapConfigV4,
  type MapConfigV2,
  type MapConfigV3,
} from "@idv-map/shared";
import oldSnapshot from "./maps-v2.snapshot.json";
import snapshot from "./maps-v3.snapshot.json";
import { mapsV2 } from "./maps-v2";
import { imageUrls } from "../composables/useOfflineCache";
describe("baseline and offline packages", () => {
  beforeEach(() =>
    mapsV2.splice(
      0,
      mapsV2.length,
      ...toPublicMapConfigV4(snapshot as MapConfigV3, "https://test").layouts,
    ),
  );
  it("checked-in migration exactly matches the V2 baseline", () => {
    expect(snapshot).toEqual(migrateV2ToV3(oldSnapshot as MapConfigV2));
    expect(assetKeys(snapshot as MapConfigV3).length).toBeGreaterThan(0);
  });
  it("downloads the full image only for converted floors and includes unmigrated floors", () => {
    const config = structuredClone(snapshot) as MapConfigV3;
    const layout = config.layouts[0]!;
    const legacyFloor = layout.floorImages.floor2!.key;
    const removed = layout.floorImages.floor1!.key;
    delete layout.floorImages.floor1;
    layout.floorRegions = { sourceKey: layout.floorImages.full!.key, imageWidth: 900, imageHeight: 1500,
      regions: { floor1: { x: 0, y: 0, width: 900, height: 700 } } };
    mapsV2.splice(0, mapsV2.length, ...toPublicMapConfigV4({ ...config, layouts: [layout] }, "https://test").layouts);
    const urls = imageUrls(layout.gameMapId);
    expect(urls).toContain(`https://test/${legacyFloor}`);
    expect(urls).not.toContain(`https://test/${removed}`);
    expect(urls.filter(u => u === `https://test/${layout.floorImages.full!.key}`)).toHaveLength(1);
  });
  it("downloads only selected map resources, deduplicated", () => {
    const first = mapsV2[0]!;
    mapsV2.push({
      ...first,
      id: 999,
      gameMapId: "other",
      floorImages: { full: { url: "https://test/unique.webp" } },
      entrances: [],
    });
    expect(imageUrls("other")).toEqual(["https://test/unique.webp"]);
    expect(imageUrls("lady-of-doom")).not.toContain("https://test/unique.webp");
    expect(new Set(imageUrls("lady-of-doom")).size).toBe(
      imageUrls("lady-of-doom").length,
    );
  });
});

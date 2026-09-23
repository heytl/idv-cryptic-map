import { describe, it, expect, beforeEach } from "vitest";
import {
  assetKeys,
  migrateV2ToV3,
  toPublicMapConfigV3,
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
      ...toPublicMapConfigV3(snapshot as MapConfigV3, "https://test").layouts,
    ),
  );
  it("checked-in migration exactly matches the V2 baseline", () => {
    expect(snapshot).toEqual(migrateV2ToV3(oldSnapshot as MapConfigV2));
    expect(assetKeys(snapshot as MapConfigV3).length).toBeGreaterThan(0);
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

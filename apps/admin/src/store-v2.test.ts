import { beforeEach, expect, it, vi } from "vitest";
import type { MapConfigV3 } from "@idv-map/shared";
import { fetchConfigV2, saveConfigV2 } from "./api-v2";
import { loadV2, markDirtyV2, saveV2, storeV2 } from "./store-v2";

vi.mock("./api-v2", () => ({ fetchConfigV2: vi.fn(), saveConfigV2: vi.fn() }));
const fixture = (): MapConfigV3 => ({
  schemaVersion: 3, version: 4, updatedAt: "2026-01-01",
  gameMaps: [{ id: "example", name: "示例", sort: 10, published: false }],
  layouts: [37, 12, 109].map((sort, i) => ({
    id: i + 1, gameMapId: "example", mode: "hard", name: `layout-${i}`, displayName: `布局 ${i}`,
    remarks: "", sort, published: false, floorImages: {}, entrances: [],
  })),
});
beforeEach(() => { vi.clearAllMocks(); });

it("saves a difficulty visibility change without rewriting unrelated layout metadata or sort order", async () => {
  const original = fixture();
  vi.mocked(fetchConfigV2).mockResolvedValue(original);
  vi.mocked(saveConfigV2).mockImplementation(async (_version, config) => ({ ...config, version: config.version + 1 }));
  await loadV2();
  storeV2.gameMaps[0]!.modeVisibility!.hard = false;
  markDirtyV2();
  expect(await saveV2()).toBeNull();
  const saved = vi.mocked(saveConfigV2).mock.calls[0]![1];
  expect(saved.layouts).toEqual(original.layouts);
  expect(saved.entranceRulesVersion).toBe(2);
  expect(saved.gameMaps[0]!.modeVisibility!.hard).toBe(false);
  expect(saved.gameMaps[0]!.entranceRules!.hard.enabled).toEqual(["side"]);
  expect(storeV2.dirty).toBe(false);
});

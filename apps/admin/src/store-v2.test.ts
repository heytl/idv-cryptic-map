import { beforeEach, expect, it, vi } from "vitest";
import type { MapConfigV3 } from "@idv-map/shared/dynamic";
import { normalizeMapConfigV4, purgeGameMap } from "@idv-map/shared";
import { fetchConfigV2, saveConfigV2 } from "./api-v2";
import { loadV2, markDirtyV2, saveImmediateV2, saveV2, storeV2 } from "./store-v2";

vi.mock("./api-v2", () => ({ fetchConfigV2: vi.fn(), saveConfigV2: vi.fn() }));
const fixture = (): MapConfigV3 => normalizeMapConfigV4({
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
  storeV2.gameMaps[0]!.difficulties[0].visible = false;
  markDirtyV2();
  expect(await saveV2()).toBeNull();
  const saved = vi.mocked(saveConfigV2).mock.calls[0]![1];
  expect(saved.layouts).toEqual(original.layouts);
  expect(saved.schemaVersion).toBe(4);
  expect(saved.gameMaps[0]!.difficulties[0].visible).toBe(false);
  expect(saved.gameMaps[0]!.difficulties[0].entranceRules.enabled).toEqual(["side"]);
  expect(storeV2.dirty).toBe(false);
});

async function setup() {
  const original = fixture();
  vi.mocked(fetchConfigV2).mockResolvedValue(original);
  vi.mocked(saveConfigV2).mockImplementation(async (_version, config) => ({ ...config, version: config.version + 1 }));
  await loadV2();
  return JSON.parse(JSON.stringify(original)) as MapConfigV3;
}
const addDifficulty = (config: MapConfigV3) => { config.difficulties.push({ id: "abyss", name: "深渊", sort: 30 }); };

it("immediately saves a dictionary change and advances the baseline for edits and deletion", async () => {
  await setup();
  expect(await saveImmediateV2(addDifficulty)).toBeNull();
  expect(storeV2.dirty).toBe(false);
  expect(storeV2.difficulties.find(d => d.id === "abyss")?.name).toBe("深渊");
  expect(await saveImmediateV2(c => { c.difficulties.find(d => d.id === "abyss")!.name = "新深渊"; })).toBeNull();
  expect(await saveImmediateV2(c => { Object.assign(c.difficulties.find(d => d.id === "abyss")!, { deletedAt: "2026-01-02", archived: true }); })).toBeNull();
  expect(vi.mocked(saveConfigV2).mock.calls.map(([version]) => version)).toEqual([4, 5, 6]);
  expect(storeV2.version).toBe(7);
  expect(storeV2.dirty).toBe(false);
  const persisted = vi.mocked(saveConfigV2).mock.calls[2]![1];
  vi.mocked(fetchConfigV2).mockResolvedValue({ ...persisted, version: 7 });
  await loadV2();
  expect(storeV2.difficulties.find(d => d.id === "abyss")).toMatchObject({ name: "新深渊", deletedAt: "2026-01-02" });
});

it("keeps unrelated drafts local and lets the top save commit them against the new version", async () => {
  const original = await setup();
  storeV2.maps[0]!.displayName = "未提交布局名称";
  storeV2.gameMaps[0]!.name = "未提交地图名称";
  markDirtyV2();
  expect(await saveImmediateV2(addDifficulty)).toBeNull();
  const sent = vi.mocked(saveConfigV2).mock.calls[0]![1];
  expect(sent.layouts).toEqual(original.layouts);
  expect(sent.gameMaps).toEqual(original.gameMaps);
  expect(storeV2.maps[0]!.displayName).toBe("未提交布局名称");
  expect(storeV2.gameMaps[0]!.name).toBe("未提交地图名称");
  expect(storeV2.dirty).toBe(true);
  expect(await saveV2()).toBeNull();
  expect(vi.mocked(saveConfigV2).mock.calls[1]![0]).toBe(5);
  expect(vi.mocked(saveConfigV2).mock.calls[1]![1].layouts[0]!.displayName).toBe("未提交布局名称");
  expect(storeV2.dirty).toBe(false);
});

it("does not change local content or the saved baseline when an immediate save fails", async () => {
  await setup();
  vi.mocked(saveConfigV2).mockRejectedValueOnce(new Error("内容已更新，请刷新后重试"));
  expect(await saveImmediateV2(addDifficulty)).toBe("内容已更新，请刷新后重试");
  expect(storeV2.difficulties.some(d => d.id === "abyss")).toBe(false);
  expect(storeV2.version).toBe(4);
  expect(storeV2.dirty).toBe(false);
  expect(storeV2.saving).toBe(false);
  expect(await saveImmediateV2(addDifficulty)).toBeNull();
  expect(vi.mocked(saveConfigV2).mock.calls.map(([version]) => version)).toEqual([4, 4]);
  expect(storeV2.difficulties.filter(d => d.id === "abyss")).toHaveLength(1);
});

it("rejects invalid immediate changes without sending or mutating content", async () => {
  await setup();
  expect(await saveImmediateV2(c => { c.difficulties.push({ id: "invalid", name: "", sort: 30 }); })).toBeTruthy();
  expect(saveConfigV2).not.toHaveBeenCalled();
  expect(storeV2.difficulties.some(d => d.id === "invalid")).toBe(false);
  expect(storeV2.dirty).toBe(false);
});

it("retains edits made during a request and prevents overlapping saves", async () => {
  const original = await setup();
  let finish!: (config: MapConfigV3) => void;
  vi.mocked(saveConfigV2).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = saveImmediateV2(addDifficulty);
  expect(storeV2.saving).toBe(true);
  expect(storeV2.difficulties.some(d => d.id === "abyss")).toBe(false);
  storeV2.maps[0]!.remarks = "请求期间的新草稿";
  markDirtyV2();
  expect(await saveImmediateV2(addDifficulty)).toMatch(/正在保存/);
  expect(await saveV2()).toMatch(/正在保存/);
  expect(saveConfigV2).toHaveBeenCalledTimes(1);
  const sent = vi.mocked(saveConfigV2).mock.calls[0]![1];
  finish({ ...sent, version: original.version + 1 });
  expect(await pending).toBeNull();
  expect(storeV2.maps[0]!.remarks).toBe("请求期间的新草稿");
  expect(storeV2.dirty).toBe(true);
  expect(storeV2.saving).toBe(false);
});

it("immediately restores a map while retaining unrelated map property drafts", async () => {
  const original = fixture();
  original.gameMaps[0]!.deletedAt = "2026-01-01";
  vi.mocked(fetchConfigV2).mockResolvedValue(original);
  vi.mocked(saveConfigV2).mockImplementation(async (_version, config) => ({ ...config, version: config.version + 1 }));
  await loadV2();
  storeV2.gameMaps[0]!.name = "未提交名称";
  markDirtyV2();
  expect(await saveImmediateV2(c => { c.gameMaps[0]!.deletedAt = null; c.gameMaps[0]!.published = false; })).toBeNull();
  expect(vi.mocked(saveConfigV2).mock.calls[0]![1].gameMaps[0]).toMatchObject({ name: "示例", deletedAt: null, published: false });
  expect(storeV2.gameMaps[0]).toMatchObject({ name: "未提交名称", deletedAt: null });
  expect(storeV2.dirty).toBe(true);
});

it("immediately purges the map and linked layouts without submitting a layout draft", async () => {
  const original = fixture();
  original.gameMaps[0]!.deletedAt = "2026-01-01";
  vi.mocked(fetchConfigV2).mockResolvedValue(original);
  vi.mocked(saveConfigV2).mockImplementation(async (_version, config) => ({ ...config, version: config.version + 1 }));
  await loadV2();
  storeV2.maps[0]!.remarks = "未提交备注";
  markDirtyV2();
  expect(await saveImmediateV2(c => { purgeGameMap(c, "example", new Date("2026-01-02")); })).toBeNull();
  const sent = vi.mocked(saveConfigV2).mock.calls[0]![1];
  expect(sent.gameMaps[0]!.purgedAt).toBeTruthy();
  expect(sent.layouts.every(l => l.deletedAt && !l.published)).toBe(true);
  expect(sent.layouts[0]!.remarks).toBe("");
  expect(storeV2.maps[0]!.remarks).toBe("未提交备注");
  expect(storeV2.maps.every(l => l.deletedAt && !l.published)).toBe(true);
  expect(storeV2.dirty).toBe(true);
});

import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  assetKeysV4 as assetKeys,
  normalizeMapConfigV4,
  entranceFilterFor,
  purgeGameMap,
  toPublicMapConfigV6,
  type MapConfigV4 as MapConfigV3,
} from "../packages/shared/src/index";
import {
  checkedConfig,
  exportContent,
  maintenance,
  preserveIdentities,
  saveContent,
} from "../packages/server/src/content";
import type {
  AssetStorage,
  ContentRepository,
} from "../packages/server/src/ports";
import snapshot from "../apps/web/src/data/maps-v2.snapshot.json";
let current: MapConfigV3;
let repo: ContentRepository;
let storage: AssetStorage;
beforeEach(() => {
  current = normalizeMapConfigV4(structuredClone(snapshot));
  repo = {
    read: async () => structuredClone(current),
    save: vi.fn(async (c) => {
      current = c;
    }),
    backup: vi.fn(async () => {}),
    backups: async () => [],
    readBackup: async () => null,
  };
  storage = {
    exists: async () => true,
    get: async () => ({ bytes: new ArrayBuffer(0), contentType: "image/webp" }),
    put: async () => {},
    url: (key) => `https://media.test/${key}`,
  };
});
describe("portable content service", () => {
  it('purges a recycled map and its layouts while retaining identities and media for historical statistics', async () => {
    const candidate = structuredClone(current), map = candidate.gameMaps[0];
    expect(() => purgeGameMap(candidate, map.id)).toThrow('回收站');
    map.deletedAt = '2026-11-05T12:00:00.000Z';
    const beforeIds = candidate.layouts.map(l => l.id), beforeAssets = assetKeys(candidate);
    purgeGameMap(candidate, map.id, new Date('2026-11-05T13:00:00.000Z'));
    await saveContent(repo, storage, candidate, current.version);
    expect(current.gameMaps[0].purgedAt).toBe('2026-11-05T13:00:00.000Z');
    expect(current.layouts.filter(l => l.gameMapId === map.id).every(l => l.deletedAt && !l.published)).toBe(true);
    expect(current.layouts.map(l => l.id)).toEqual(beforeIds);
    expect(assetKeys(current)).toEqual(beforeAssets);
    expect(toPublicMapConfigV6(current, 'https://media.test').gameMaps.some(m => m.id === map.id)).toBe(false);
    expect((await exportContent(repo, storage)).config.gameMaps[0].name).toBe(map.name);
  });
  it('never resurrects purged maps on save or backup restore, and releases their dictionary references', async () => {
    const baseline = structuredClone(current), candidate = structuredClone(current);
    candidate.gameMaps[0].deletedAt = '2026-11-05T12:00:00.000Z';
    purgeGameMap(candidate, candidate.gameMaps[0].id);
    await saveContent(repo, storage, candidate, current.version);
    const revived = structuredClone(current);
    delete revived.gameMaps[0].purgedAt;
    await expect(saveContent(repo, storage, revived, current.version)).rejects.toMatchObject({ code: 'retired_map' });
    const activeLayout = structuredClone(current);
    activeLayout.layouts[0].deletedAt = null;
    await expect(saveContent(repo, storage, activeLayout, current.version)).rejects.toMatchObject({ code: 'invalid_config' });
    const next = structuredClone(current);
    next.difficulties.forEach(d => { d.deletedAt = new Date().toISOString(); });
    next.entranceTypes.forEach(d => { d.deletedAt = new Date().toISOString(); });
    await saveContent(repo, storage, next, current.version);
    const restored = preserveIdentities(baseline, current);
    expect(restored.gameMaps[0].purgedAt).toBe(current.gameMaps[0].purgedAt);
    expect(restored.layouts.filter(l => l.gameMapId === restored.gameMaps[0].id).every(l => l.deletedAt && !l.published)).toBe(true);
    await saveContent(repo, storage, restored, current.version);
  });
  it('saves deletion of persisted unused definitions and floors without losing their identities', async () => {
    const candidate = structuredClone(current);
    candidate.difficulties.push({ id: 'unused', name: '未使用难度', sort: 100 });
    candidate.entranceTypes.push({ id: 'unused', name: '未使用入口', sort: 100 });
    candidate.gameMaps[0].difficulties[0].entranceFilters!.side.filterOptions.push({ id: 'unused', name: '未使用分类', sort: 100 });
    candidate.gameMaps[0].difficulties[0].floors.push({ id: 'unused', name: '未使用楼层', sort: 100, visible: true });
    await saveContent(repo, storage, candidate, current.version);
    const next = await repo.read(), deletedAt = '2026-11-05T12:00:00.000Z';
    const records = [next.difficulties.at(-1)!, next.entranceTypes.at(-1)!, next.gameMaps[0].difficulties[0].entranceFilters!.side.filterOptions.at(-1)!, next.gameMaps[0].difficulties[0].floors.at(-1)!];
    records.forEach(d => Object.assign(d, { deletedAt, archived: true }));
    next.gameMaps[0].difficulties[0].floors.at(-1)!.visible = false;
    await saveContent(repo, storage, next, current.version);
    expect((await repo.read()).difficulties.at(-1)).toMatchObject({ id: 'unused', deletedAt });
    expect((await exportContent(repo, storage)).config).toEqual(current);
    const removed = structuredClone(current);
    removed.difficulties.pop();
    await expect(saveContent(repo, storage, removed, current.version)).rejects.toMatchObject({ code: 'missing_identity' });
    const restored = preserveIdentities(normalizeMapConfigV4(structuredClone(snapshot)), current);
    expect(restored.difficulties.at(-1)?.deletedAt).toBe(deletedAt);
    await saveContent(repo, storage, restored, current.version);
  });
  it('rejects direct API deletion of referenced dictionaries and reusing a deleted option', async () => {
    const next = structuredClone(current);
    next.difficulties[0].deletedAt = '2026-11-05T12:00:00.000Z';
    await expect(saveContent(repo, storage, next, current.version)).rejects.toMatchObject({ code: 'invalid_config' });
    expect(repo.save).not.toHaveBeenCalled();
    const option = structuredClone(current);
    const l = option.layouts[0], e = l.entrances[0], def = entranceFilterFor(option.gameMaps.find(m => m.id === l.gameMapId), l.mode, e.type)!;
    def.filterOptions.push({ id: 'deleted', name: '已删除分类', sort: 100, deletedAt: '2026-11-05T12:00:00.000Z' });
    e.filterValue = 'deleted';
    await expect(saveContent(repo, storage, option, current.version)).rejects.toMatchObject({ code: 'invalid_config' });
    expect(repo.save).not.toHaveBeenCalled();
  });
  it("rejects an outdated admin writer without discarding entrance rules", async () => {
    const candidate = { ...structuredClone(current), schemaVersion: 3 };
    await expect(saveContent(repo, storage, candidate, current.version)).rejects.toMatchObject({ code: "admin_upgrade_required" });
    expect(repo.save).not.toHaveBeenCalled();
  });
  it("exports complete resources and restores content into an isolated repository", async () => {
    const bundle = await exportContent(repo, storage);
    expect(bundle.assets.map((a) => a.key)).toEqual(assetKeys(current));
    const isolated = {
      ...repo,
      read: async () =>
        normalizeMapConfigV4({
          schemaVersion: 3,
          version: 0,
          updatedAt: "",
          gameMaps: [],
          layouts: [],
        }),
      save: vi.fn(async () => {}),
    };
    const restored = await saveContent(isolated, storage, bundle.config, 0);
    expect(restored.layouts).toEqual(current.layouts);
    expect(restored.gameMaps).toEqual(current.gameMaps);
    expect(isolated.save).toHaveBeenCalledTimes(1);
  });
  it("round-trips mixed region content and restores a legacy backup", async () => {
    const legacy = structuredClone(current);
    const candidate = structuredClone(current);
    const layout = candidate.layouts.find(l => l.mode === "hard" && l.published)!;
    const oldFloorKey = layout.floorImages.floor1!.key;
    delete layout.floorImages.floor1;
    layout.floorRegions = { sourceKey: layout.floorImages.full!.key, imageWidth: 900, imageHeight: 1500,
      regions: { floor1: { x: 0, y: 0, width: 900, height: 700 } } };
    await saveContent(repo, storage, candidate, current.version);
    const bundle = await exportContent(repo, storage);
    expect(bundle.config.layouts.find(l => l.id === layout.id)!.floorRegions).toEqual(layout.floorRegions);
    expect(bundle.assets.some(a => a.key === oldFloorKey)).toBe(false);
    await saveContent(repo, storage, checkedConfig(JSON.parse(JSON.stringify(bundle.config))), current.version);
    const restored = await saveContent(repo, storage, preserveIdentities(legacy, current), current.version);
    expect(restored.layouts.find(l => l.id === layout.id)!.floorImages.floor1?.key).toBe(oldFloorKey);
    expect(restored.layouts.find(l => l.id === layout.id)!.floorRegions).toBeUndefined();
  });
  it("rejects stale saves and missing media without changing content", async () => {
    await expect(saveContent(repo, storage, current, -1)).rejects.toMatchObject(
      { status: 409 },
    );
    storage.exists = async () => false;
    await expect(
      saveContent(repo, storage, current, current.version),
    ).rejects.toMatchObject({ code: "missing_asset" });
    expect(repo.save).not.toHaveBeenCalled();
  });
  it("does not recycle IDs or change layout ownership", async () => {
    const next = structuredClone(current);
    next.layouts.pop();
    await expect(
      saveContent(repo, storage, next, current.version),
    ).rejects.toMatchObject({ code: "immutable_layout" });
    const moved = structuredClone(current);
    moved.gameMaps.push({
      id: "other",
      name: "其他",
      sort: 2,
      published: true,
      difficulties: structuredClone(current.gameMaps[0].difficulties),
    });
    moved.layouts[0]!.gameMapId = "other";
    await expect(
      saveContent(repo, storage, moved, current.version),
    ).rejects.toMatchObject({ code: "immutable_layout" });
  });
  it("restore preserves new IDs as tombstones", () => {
    const old = structuredClone(current);
    current.layouts.push({ ...current.layouts[0]!, id: 999, entrances: current.layouts[0].entrances.map(e=>({...e,id:`999-${e.type}`})) });
    const restored = preserveIdentities(old, current);
    expect(restored.layouts.find((l) => l.id === 999)).toMatchObject({
      published: false,
      deletedAt: expect.any(String),
    });
  });
  it("scheduler cleans up even when backup fails", async () => {
    repo.backup = async () => {
      throw new Error("backup");
    };
    const prune = vi.fn(async () => {});
    await expect(
      maintenance(
        repo,
        {
          prune,
          record: async () => {},
          report: vi.fn(),
          export: async () => [],
        },
        new Date("2026-09-22T16:00:00Z"),
      ),
    ).rejects.toThrow("backup");
    expect(prune).toHaveBeenCalledWith("2026-06-25T16:00:00.000Z");
  });
  it("malformed config fails safely", () => {
    expect(() =>
      checkedConfig({ schemaVersion: 3, gameMaps: [], layouts: [null] }),
    ).toThrow();
  });
  it('only lets new unpublished drafts change difficulty, and never unlocks after publication or restore', async () => {
    const draft = { ...structuredClone(current.layouts[0]), id: 9001, mode: 'hard', modeLocked: false, published: false, floorImages: {}, floorRegions: undefined, entrances: [] };
    await saveContent(repo, storage, { ...current, layouts: [...current.layouts, draft] }, current.version);
    let candidate=structuredClone(current);
    candidate.layouts.find(l=>l.id===9001)!.mode='nightmare';
    await saveContent(repo,storage,candidate,current.version);
    const beforePublish=structuredClone(current);
    candidate=structuredClone(current);
    const target=candidate.layouts.find(l=>l.id===9001)!;
    target.published=true; target.floorImages={full:current.layouts[0].floorImages.full};
    target.entrances=[{id:'9001-front',type:'front',image:current.layouts[0].entrances[0].image}];
    await saveContent(repo,storage,candidate,current.version);
    expect(current.layouts.find(l=>l.id===9001)!.modeLocked).toBe(true);
    candidate=structuredClone(current); candidate.layouts.find(l=>l.id===9001)!.mode='hard';
    await expect(saveContent(repo,storage,candidate,current.version)).rejects.toMatchObject({code:'immutable_mode'});
    const restored=preserveIdentities(beforePublish,current);
    expect(restored.layouts.find(l=>l.id===9001)!.modeLocked).toBe(true);
    await saveContent(repo,storage,restored,current.version);
  });
  it('retains added global definitions, floor identities and classifications across a restore', async () => {
    const baseline=structuredClone(current), candidate=structuredClone(current);
    candidate.difficulties.push({id:'abyss',name:'深渊',sort:30});
    candidate.gameMaps[0].difficulties[0].entranceFilters!.side.filterOptions.push({id:'center',name:'中央',sort:50});
    candidate.gameMaps[0].difficulties[0].floors.push({id:'b4',name:'负四楼',sort:40,visible:true});
    await saveContent(repo,storage,candidate,current.version);
    const restored=preserveIdentities(baseline,current);
    expect(restored.difficulties.find(d=>d.id==='abyss')?.archived).toBe(true);
    expect(restored.gameMaps[0].difficulties[0].entranceFilters!.side.filterOptions.find(d=>d.id==='center')?.archived).toBe(true);
    expect(restored.gameMaps[0].difficulties[0].floors.find(f=>f.id==='b4')?.visible).toBe(false);
    await saveContent(repo,storage,restored,current.version);
  });
  it('saves classifications for one map difficulty without changing another or permitting identity loss', async () => {
    const candidate = structuredClone(current), map = candidate.gameMaps[0], [hard, nightmare] = map.difficulties;
    const original = structuredClone(nightmare.entranceFilters);
    hard.entranceFilters!.side.filterLabel = '颜色';
    hard.entranceFilters!.side.filterOptions[0].name = '红色';
    await saveContent(repo, storage, candidate, current.version);
    expect(current.gameMaps[0].difficulties[1].entranceFilters).toEqual(original);
    expect(current.gameMaps[0].difficulties[0].entranceFilters!.side.filterLabel).toBe('颜色');
    const removed = structuredClone(current);
    delete removed.gameMaps[0].difficulties[0].entranceFilters!.side;
    for (const l of removed.layouts.filter(l => l.gameMapId === map.id && l.mode === hard.difficultyId))
      l.entrances.forEach(e => { if (e.type === 'side') delete e.filterValue; });
    await expect(saveContent(repo, storage, removed, current.version)).rejects.toMatchObject({ code: 'missing_identity' });
  });
  it('keeps option deletion and restore scoped when the same option ID exists in another difficulty', async () => {
    const candidate = structuredClone(current), [hard, nightmare] = candidate.gameMaps[0].difficulties;
    hard.entranceFilters!.side.filterOptions.push({ id: 'scoped', name: '本地图分类', sort: 100 });
    nightmare.entranceFilters!.side.filterOptions.push({ id: 'scoped', name: '其他难度分类', sort: 100 });
    await saveContent(repo, storage, candidate, current.version);
    const baseline = structuredClone(current), next = structuredClone(current);
    next.gameMaps[0].difficulties[0].entranceFilters!.side.filterOptions.find(o => o.id === 'scoped')!.deletedAt = '2026-11-06T00:00:00.000Z';
    next.gameMaps[0].difficulties[1].entranceFilters!.side.filterOptions.push({ id: 'later', name: '后续分类', sort: 110 });
    await saveContent(repo, storage, next, current.version);
    expect(current.gameMaps[0].difficulties[1].entranceFilters!.side.filterOptions.find(o => o.id === 'scoped')!.deletedAt).toBeUndefined();
    const restored = preserveIdentities(baseline, current);
    expect(restored.gameMaps[0].difficulties[1].entranceFilters!.side.filterOptions.find(o => o.id === 'later')?.archived).toBe(true);
    expect(restored.gameMaps[0].difficulties[0].entranceFilters!.side.filterOptions.some(o => o.id === 'later')).toBe(false);
    await saveContent(repo, storage, restored, current.version);
  });
});

import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  assetKeys,
  migrateV2ToV3,
  type MapConfigV2,
  type MapConfigV3,
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
  current = migrateV2ToV3(snapshot as MapConfigV2);
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
  it("exports complete resources and restores content into an isolated repository", async () => {
    const bundle = await exportContent(repo, storage);
    expect(bundle.assets.map((a) => a.key)).toEqual(assetKeys(current));
    const isolated = {
      ...repo,
      read: async () =>
        ({
          schemaVersion: 3,
          version: 0,
          updatedAt: "",
          gameMaps: [],
          layouts: [],
        }) as MapConfigV3,
      save: vi.fn(async () => {}),
    };
    const restored = await saveContent(isolated, storage, bundle.config, 0);
    expect(restored.layouts).toEqual(current.layouts);
    expect(restored.gameMaps).toEqual(current.gameMaps);
    expect(isolated.save).toHaveBeenCalledTimes(1);
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
    });
    moved.layouts[0]!.gameMapId = "other";
    await expect(
      saveContent(repo, storage, moved, current.version),
    ).rejects.toMatchObject({ code: "immutable_layout" });
  });
  it("restore preserves new IDs as tombstones", () => {
    const old = structuredClone(current);
    current.layouts.push({ ...current.layouts[0]!, id: 999 });
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
});

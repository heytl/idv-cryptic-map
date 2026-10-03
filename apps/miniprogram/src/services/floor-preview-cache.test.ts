import { describe, expect, it, vi } from "vitest";
import type { FloorSource } from "@idv-map/shared";
import { createFloorPreviewCache, floorPreviewKey, type PreviewCacheFiles, type PreviewCacheIndex } from "./floor-preview-cache";

const source: FloorSource = { url: "https://example.com/full-hash.webp", imageWidth: 900, imageHeight: 1500,
  region: { x: 0, y: 0, width: 900, height: 750 } };
const second: FloorSource = { ...source, region: { ...source.region!, y: 750 } };
function storage() {
  let index: unknown = null;
  const images = new Set<string>();
  const files: PreviewCacheFiles = {
    readIndex: vi.fn(async () => structuredClone(index)),
    writeIndex: vi.fn(async value => { index = structuredClone(value); }),
    list: vi.fn(async () => [...images]),
    exists: vi.fn(async name => images.has(name)),
    copy: vi.fn(async (_temp, name) => { images.add(name); }),
    remove: vi.fn(async name => { images.delete(name); }),
    discardTemp: vi.fn(async () => {}),
    path: name => `wxfile://usr/idv-floor-previews-v1/${name}`,
  };
  return { files, images, setIndex: (value: unknown) => { index = value; }, index: () => index as PreviewCacheIndex };
}

describe("persistent floor previews", () => {
  it("survives a new cache instance/app launch and removes the temporary duplicate", async () => {
    const s = storage();
    const first = createFloorPreviewCache(s.files);
    await first.reconcile([source, second]);
    const path = await first.put(source, "wxfile://tmp/crop.png");
    expect(path).toContain("wxfile://usr/");
    expect(s.files.discardTemp).toHaveBeenCalledWith("wxfile://tmp/crop.png");
    const restarted = createFloorPreviewCache(s.files);
    await restarted.reconcile([source, second]);
    expect(await restarted.get(source)).toBe(path);
    expect(s.files.copy).toHaveBeenCalledTimes(1);
  });
  it("keeps unchanged regions but removes replaced images, changed coordinates and removed floors", async () => {
    const s = storage();
    const cache = createFloorPreviewCache(s.files);
    await cache.reconcile([source, second]);
    await cache.put(source, "tmp-first"); await cache.put(second, "tmp-second");
    const unchanged = await cache.get(second);
    const moved = { ...source, region: { ...source.region!, height: 700 } };
    await cache.reconcile([moved, second]);
    expect(await cache.get(source)).toBeUndefined();
    expect(await cache.get(second)).toBe(unchanged);
    expect(s.images.size).toBe(1);
    await cache.reconcile([{ ...second, url: "https://example.com/new-hash.webp" }]);
    expect(s.images.size).toBe(0);
    expect(await cache.get(second)).toBeUndefined();
    await cache.reconcile([]);
    expect(s.index().entries).toEqual([]);
  });
  it("regenerates missing files, and cleans orphans without deleting unrelated files", async () => {
    const s = storage();
    const cache = createFloorPreviewCache(s.files);
    await cache.reconcile([source]);
    await cache.put(source, "tmp");
    s.images.clear();
    expect(await cache.get(source)).toBeUndefined();
    expect(s.index().entries).toEqual([]);
    s.images.add("preview-orphan.png"); s.images.add("unrelated.png");
    await cache.reconcile([source]);
    expect([...s.images]).toEqual(["unrelated.png"]);
    const replacement = await cache.put(source, "tmp-new");
    expect(await cache.get(source)).toBe(replacement);
  });
  it("falls back to temporary previews on write failure without committing broken entries", async () => {
    const s = storage(); const report = vi.fn();
    const cache = createFloorPreviewCache(s.files, report);
    await cache.reconcile([source]);
    vi.mocked(s.files.writeIndex).mockRejectedValueOnce(new Error("disk full"));
    expect(await cache.put(source, "tmp-still-usable")).toBe("tmp-still-usable");
    expect(s.images.size).toBe(0);
    expect(s.files.discardTemp).not.toHaveBeenCalled();
    expect(await cache.get(source)).toBeUndefined();
    expect(report).toHaveBeenCalledTimes(1);
    expect(await cache.put(source, "tmp-retry")).toContain("wxfile://usr/");
  });
  it("does not resurrect an obsolete export when content changes during persistence", async () => {
    const s = storage();
    const cache = createFloorPreviewCache(s.files);
    await cache.reconcile([source]);
    let copied!: () => void; let continueCopy!: () => void;
    const copying = new Promise<void>(resolve => { copied = resolve; });
    const resume = new Promise<void>(resolve => { continueCopy = resolve; });
    vi.mocked(s.files.copy).mockImplementationOnce(async (_temp, name) => { s.images.add(name); copied(); await resume; });
    const put = cache.put(source, "tmp-old");
    await copying;
    const update = cache.reconcile([second]);
    continueCopy();
    expect(await put).toBe("tmp-old");
    await update;
    expect(s.images.size).toBe(0);
    expect(s.index().entries).toEqual([]);
  });
  it("rejects unsafe index paths and shares duplicate crops without a second saved file", async () => {
    const s = storage();
    s.setIndex({ version: 1, entries: [[floorPreviewKey(source), "../other.png"]] });
    const cache = createFloorPreviewCache(s.files);
    await cache.reconcile([source]);
    const results = await Promise.all([cache.put(source, "tmp-one"), cache.put(source, "tmp-two")]);
    expect(results[0]).toBe(results[1]);
    expect(s.images.size).toBe(1);
    expect(s.files.copy).toHaveBeenCalledTimes(1);
    expect(s.files.exists).not.toHaveBeenCalledWith("../other.png");
    expect(s.files.discardTemp).toHaveBeenCalledTimes(2);
  });
});

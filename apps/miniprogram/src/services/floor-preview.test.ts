import { describe, expect, it, vi } from "vitest";
import { createFloorPreview, previewSize, type PreviewCanvas, type PreviewImage } from "./floor-preview";
import type { FloorSource } from "@idv-map/shared";

const full = { url: "https://example.com/full.webp" };
const first: FloorSource = { ...full, imageWidth: 900, imageHeight: 1500, region: { x: 0, y: 0, width: 900, height: 750 } };
const second: FloorSource = { ...first, region: { x: 0, y: 750, width: 900, height: 750 } };
function setup(cache?: Parameters<typeof createFloorPreview>[2]) {
  const drawImage = vi.fn();
  let failLoad = false;
  const createImage = vi.fn(() => {
    const image: PreviewImage = {
      width: 900, height: 1500, onload: null, onerror: null,
      get src() { return ""; },
      set src(_value: string) { queueMicrotask(() => failLoad ? image.onerror?.(new Error("decode")) : image.onload?.()); },
    };
    return image;
  });
  const canvas: PreviewCanvas = { width: 1, height: 1, createImage, getContext: () => ({ drawImage }) };
  const getCanvas = vi.fn(async () => canvas);
  const exportCanvas = vi.fn(async () => `wxfile://crop-${drawImage.mock.calls.length}.png`);
  return { service: createFloorPreview(getCanvas, exportCanvas, cache), getCanvas, canvas, createImage, drawImage, exportCanvas, failLoad: (value: boolean) => { failLoad = value; } };
}

describe("native floor preview", () => {
  it("preserves capsule order across full, cropped, and legacy images; reuses decoding and cached exports", async () => {
    const s = setup();
    const sources = [full, first, second, { url: "https://example.com/legacy.png" }];
    const pending = s.service.prepare(sources);
    expect(s.service.prepare(sources)).toBe(pending);
    const urls = await pending;
    expect(urls).toEqual([full.url, "wxfile://crop-1.png", "wxfile://crop-2.png", sources[3].url]);
    expect(s.createImage).toHaveBeenCalledTimes(1);
    expect(s.drawImage.mock.calls[1].slice(1)).toEqual([0, 750, 900, 750, 0, 0, 900, 750]);
    expect(s.canvas.width).toBe(1);
    expect(await s.service.prepare(sources)).toEqual(urls);
    expect(s.exportCanvas).toHaveBeenCalledTimes(2);
  });
  it("opens independent images without allocating a canvas", async () => {
    const s = setup();
    expect(await s.service.prepare([full])).toEqual([full.url]);
    expect(s.getCanvas).not.toHaveBeenCalled();
  });
  it("rejects mismatched metadata or out-of-bounds crops rather than showing the wrong floor", async () => {
    const s = setup();
    await expect(s.service.prepare([{ ...first, imageWidth: 999 }])).rejects.toThrow("尺寸");
    await expect(s.service.prepare([{ ...second, region: { x: 0, y: 1400, width: 900, height: 750 } }])).rejects.toThrow("尺寸");
    expect(s.exportCanvas).not.toHaveBeenCalled();
  });
  it("allows retry after decode or export failure", async () => {
    const s = setup();
    s.failLoad(true);
    await expect(s.service.prepare([first])).rejects.toThrow("加载失败");
    s.failLoad(false);
    s.exportCanvas.mockRejectedValueOnce(new Error("export failed"));
    await expect(s.service.prepare([first])).rejects.toThrow("export failed");
    expect(await s.service.prepare([first])).toHaveLength(1);
  });
  it("stops pending work when the page is disposed", async () => {
    const s = setup();
    const pending = s.service.prepare([first, second]);
    s.service.dispose();
    await expect(pending).rejects.toThrow("已关闭");
    expect(s.exportCanvas).not.toHaveBeenCalled();
  });
  it("keeps ordinary maps at source resolution and bounds large bitmap memory", () => {
    expect(previewSize(900, 750)).toEqual({ width: 900, height: 750 });
    expect(previewSize(10000, 1000)).toEqual({ width: 4096, height: 410 });
    const size = previewSize(10000, 10000);
    expect(size.width * size.height).toBeLessThanOrEqual(8_000_000);
  });
  it("opens saved crops without canvas work and regenerates a file removed after same-page reuse", async () => {
    const cache = { get: vi.fn().mockResolvedValue("wxfile://usr/saved.png"), put: vi.fn(async (_source, path: string) => path) };
    const s = setup(cache);
    expect(await s.service.prepare([full, first])).toEqual([full.url, "wxfile://usr/saved.png"]);
    expect(s.getCanvas).not.toHaveBeenCalled();
    cache.get.mockResolvedValue(undefined);
    expect(await s.service.prepare([full, first])).toEqual([full.url, "wxfile://crop-1.png"]);
    expect(s.exportCanvas).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalledWith(first, "wxfile://crop-1.png");
  });
  it("prioritizes the current floor during warmup while preserving preview order", async () => {
    const s = setup();
    await s.service.prepare([full, first, second], { current: 2, waitForIdle: async () => {} });
    expect(s.drawImage.mock.calls[0].slice(1, 5)).toEqual([0, 750, 900, 750]);
    expect(await s.service.prepare([full, first, second])).toEqual([full.url, "wxfile://crop-2.png", "wxfile://crop-1.png"]);
  });
  it("promotes a waiting warmup on tap, shares canvas work, and cancels waiting work on disposal", async () => {
    const s = setup(); const waiting = vi.fn(() => new Promise<void>(() => {}));
    const warm = s.service.prepare([first, second], { current: 0, waitForIdle: waiting });
    expect(s.getCanvas).not.toHaveBeenCalled();
    const opened = s.service.prepare([first, second]);
    expect(opened).toBe(warm);
    await opened;
    expect(s.createImage).toHaveBeenCalledTimes(1);
    expect(s.exportCanvas).toHaveBeenCalledTimes(2);
    const other = setup();
    const cancelled = other.service.prepare([first], { current: 0, waitForIdle: waiting });
    other.service.dispose();
    await expect(cancelled).rejects.toThrow("已关闭");
    expect(other.getCanvas).not.toHaveBeenCalled();
  });
});

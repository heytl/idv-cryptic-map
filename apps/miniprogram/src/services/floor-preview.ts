import { validPixelRect, type FloorSource } from "@idv-map/shared";
import { floorPreviewKey, type FloorPreviewCache } from "./floor-preview-cache";

export interface PreviewImage {
  width: number;
  height: number;
  src: string;
  onload: (() => void) | null;
  onerror: ((error: unknown) => void) | null;
}
export interface PreviewCanvas {
  width: number;
  height: number;
  createImage(): PreviewImage;
  getContext(type: "2d"): {
    drawImage(image: PreviewImage, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
  };
}

export function previewSize(width: number, height: number) {
  const ratio = Math.min(1, 4096 / Math.max(width, height), Math.sqrt(8_000_000 / (width * height)));
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

function loadImage(canvas: PreviewCanvas, url: string): Promise<PreviewImage> {
  return new Promise((resolve, reject) => {
    const image = canvas.createImage();
    const finish = (error?: Error) => {
      clearTimeout(timer);
      image.onload = null; image.onerror = null;
      if (error) reject(error); else resolve(image);
    };
    const timer = setTimeout(() => finish(new Error("预览图片加载超时，请重试")), 15000);
    image.onload = () => finish();
    image.onerror = () => finish(new Error("预览图片加载失败，请重试"));
    // Keep the network URL, including for WebP. Do not route through getImageInfo.
    image.src = url;
  });
}

// One canvas owner per detail page; saved crops are shared across pages/launches.
export function createFloorPreview(
  getCanvas: () => Promise<PreviewCanvas>,
  exportCanvas: (canvas: PreviewCanvas) => Promise<string>,
  cache?: FloorPreviewCache,
) {
  const paths = new Map<string, string>();
  let disposed = false;
  let pending: Promise<string[]> | undefined;
  let foreground = false;
  let promote: (() => void) | undefined;
  const assertActive = () => { if (disposed) throw new Error("预览已关闭"); };
  return {
    dispose() { disposed = true; paths.clear(); promote?.(); },
    prepare(sources: readonly FloorSource[], warm?: { current: number; waitForIdle: () => Promise<void> }): Promise<string[]> {
      if (pending) {
        if (!warm) { foreground = true; promote?.(); }
        return pending;
      }
      foreground = !warm;
      const promoted = new Promise<void>(resolve => { promote = resolve; });
      const beforeWork = async () => {
        if (warm && !foreground) await Promise.race([warm.waitForIdle(), promoted]);
        assertActive();
      };
      const run = async () => {
        assertActive();
        let canvas: PreviewCanvas | undefined;
        // Decode a shared full map only once for all its regions in this request.
        const images = new Map<string, PreviewImage>();
        const urls: string[] = new Array(sources.length);
        const order = sources.map((_, index) => index);
        if (warm && sources[warm.current]) order.unshift(...order.splice(warm.current, 1));
        try {
          for (const index of order) {
            const source = sources[index];
            assertActive();
            if (!source.region) { urls[index] = source.url; continue; }
            const key = floorPreviewKey(source);
            // Persistent files are checked on every request, including same-page reuse.
            const cached = cache ? await cache.get(source) : paths.get(key);
            assertActive();
            if (cached) { paths.set(key, cached); urls[index] = cached; continue; }
            await beforeWork();
            canvas ??= await getCanvas();
            await beforeWork();
            let image = images.get(source.url);
            if (!image) { image = await loadImage(canvas, source.url); images.set(source.url, image); }
            await beforeWork();
            if ((source.imageWidth && source.imageWidth !== image.width) ||
                (source.imageHeight && source.imageHeight !== image.height) ||
                !validPixelRect(source.region, image.width, image.height)) {
              throw new Error("图片尺寸与楼层数据不一致，请返回并刷新地图");
            }
            const region = source.region;
            const output = previewSize(region.width, region.height);
            canvas.width = output.width; canvas.height = output.height;
            canvas.getContext("2d").drawImage(image, region.x, region.y, region.width, region.height, 0, 0, output.width, output.height);
            const tempPath = await exportCanvas(canvas);
            assertActive();
            const path = cache ? await cache.put(source, tempPath) : tempPath;
            assertActive();
            paths.set(key, path); urls[index] = path;
          }
          return urls;
        } finally {
          images.clear();
          // Release the backing bitmap after exporting; retain only file paths.
          if (canvas) { canvas.width = 1; canvas.height = 1; }
        }
      };
      pending = run().finally(() => { pending = undefined; promote = undefined; });
      return pending;
    },
  };
}

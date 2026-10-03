export interface LoadedImage { path: string; width: number; height: number }

// Network URLs retain WeChat's WebP decoder support. Dimensions come from image @load.
export function createImageCache(limit = 8) {
  const cache = new Map<string, LoadedImage>();
  return {
    get(url: string) { return cache.get(url); },
    forget(url: string) { cache.delete(url); },
    remember(url: string, width: number, height: number): LoadedImage {
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error("无法读取地图图片尺寸，请重试");
      }
      const image = { path: url, width, height };
      cache.delete(url);
      cache.set(url, image);
      if (cache.size > limit) cache.delete(cache.keys().next().value!);
      return image;
    },
  };
}

export const imageCache = createImageCache();
export function imageErrorMessage(detail: string): string {
  if (/domain|域名|url not in/i.test(detail)) return "图片域名未配置，请检查微信后台的合法域名设置";
  if (/timeout|timed out/i.test(detail)) return "地图图片加载超时，请检查网络后重试";
  return "地图图片加载失败，请检查网络后重试";
}

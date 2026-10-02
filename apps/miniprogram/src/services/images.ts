export interface LoadedImage { path: string; width: number; height: number }
// Bounded session cache, not an offline-package promise. Floors reuse one decoded source.
const cache = new Map<string, Promise<LoadedImage>>();
export function forgetImage(url: string) { cache.delete(url); }
export function loadImage(url: string): Promise<LoadedImage> {
  const cached = cache.get(url);
  if (cached) return cached;
  const pending = new Promise<LoadedImage>((resolve, reject) => {
    uni.getImageInfo({ src: url, success: result => resolve({ path: result.path, width: result.width, height: result.height }),
      fail: () => { cache.delete(url); reject(new Error("地图图片加载失败，请重试")); } });
  });
  cache.set(url, pending);
  if (cache.size > 8) cache.delete(cache.keys().next().value!);
  return pending;
}

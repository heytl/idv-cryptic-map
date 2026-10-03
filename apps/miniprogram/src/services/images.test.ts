import { describe, expect, it } from "vitest";
import { createImageCache, imageErrorMessage } from "./images";

describe("native image dimensions", () => {
  it("preserves the network WebP URL and reuses dimensions across floors", () => {
    const cache = createImageCache();
    const url = "https://example.com/full.webp";
    const image = cache.remember(url, 900, 1500);
    expect(image).toEqual({ path: url, width: 900, height: 1500 });
    expect(cache.get(url)).toBe(image);
    expect(cache.get("https://example.com/other.webp")).toBeUndefined();
  });
  it("rejects malformed native dimensions instead of rendering incorrect regions", () => {
    const cache = createImageCache();
    for (const [width, height] of [[0, 1500], [900, -1], [NaN, 1500], [900, Infinity]]) {
      expect(() => cache.remember("map", width, height)).toThrow("图片尺寸");
    }
    expect(cache.get("map")).toBeUndefined();
  });
  it("bounds the cache and clears failed sources for retry", () => {
    const cache = createImageCache(2);
    cache.remember("one", 900, 1500);
    cache.remember("two", 900, 1500);
    cache.remember("three", 900, 1500);
    expect(cache.get("one")).toBeUndefined();
    cache.forget("three");
    expect(cache.get("three")).toBeUndefined();
    expect(cache.get("two")).toBeDefined();
  });
  it("distinguishes a rejected domain from timeout or decoding failure", () => {
    expect(imageErrorMessage("url not in domain list")).toContain("合法域名");
    expect(imageErrorMessage("download timeout")).toContain("超时");
    expect(imageErrorMessage("decode failed")).toContain("加载失败");
  });
});

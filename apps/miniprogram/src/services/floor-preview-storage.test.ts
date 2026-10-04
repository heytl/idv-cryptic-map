import { afterEach, expect, it, vi } from "vitest";
import type { FloorSource } from "@idv-map/shared";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it("handles WeChat's native 'not found' errors and reuses saved user files after restarting the runtime", async () => {
  const root = "http://usr/idv-floor-previews-v1";
  const source: FloorSource = { url: "https://example.com/hash.webp", imageWidth: 900, imageHeight: 1500,
    region: { x: 0, y: 0, width: 900, height: 750 } };
  const files = new Map<string, string>(); const directories = new Set<string>();
  const missing = (operation: string, path: string) => ({ errMsg: `${operation}:fail ${path} not found` });
  const manager = {
    accessSync(path: string) { if (!directories.has(path) && !files.has(path)) throw new Error("not found"); },
    mkdir: vi.fn((o: any) => { directories.add(o.dirPath); o.success({}); }),
    readFile(o: any) { files.has(o.filePath) ? o.success({ data: files.get(o.filePath) }) : o.fail(missing("readFile", o.filePath)); },
    writeFile(o: any) { files.set(o.filePath, o.data); o.success({}); },
    rename(o: any) { files.set(o.newPath, files.get(o.oldPath)!); files.delete(o.oldPath); o.success({}); },
    readdir(o: any) { o.success({ files: [...files.keys()].filter(path => path.startsWith(`${o.dirPath}/`)).map(path => path.slice(o.dirPath.length + 1)) }); },
    access(o: any) { files.has(o.path) ? o.success({}) : o.fail(missing("access", o.path)); },
    copyFile: vi.fn((o: any) => { files.set(o.destPath, files.get(o.srcPath)!); o.success({}); }),
    unlink(o: any) { files.has(o.filePath) ? (files.delete(o.filePath), o.success({})) : o.fail(missing("unlink", o.filePath)); },
  };
  vi.stubGlobal("wx", { env: { USER_DATA_PATH: "http://usr" }, getFileSystemManager: () => manager });
  vi.resetModules();
  const first = (await import("./floor-preview-storage")).floorPreviewCache;
  await first.reconcile([source]);
  expect(files.has(`${root}/index.json`)).toBe(true);
  files.set("http://tmp/crop.png", "png-bytes");
  const path = await first.put(source, "http://tmp/crop.png");
  expect(path).toMatch(/^http:\/\/usr\/idv-floor-previews-v1\/preview-.*\.png$/);
  expect(files.get(path)).toBe("png-bytes");
  expect(files.has("http://tmp/crop.png")).toBe(false);
  vi.resetModules();
  const restarted = (await import("./floor-preview-storage")).floorPreviewCache;
  await restarted.reconcile([source]);
  expect(await restarted.get(source)).toBe(path);
  expect(manager.copyFile).toHaveBeenCalledTimes(1);
  files.delete(path);
  expect(await restarted.get(source)).toBeUndefined();
  expect(JSON.parse(files.get(`${root}/index.json`)!).entries).toEqual([]);
});

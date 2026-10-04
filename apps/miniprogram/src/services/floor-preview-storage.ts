import { createFloorPreviewCache, isPreviewFile, type PreviewCacheFiles } from "./floor-preview-cache";

// WeChat-only adapter, initialized lazily after the application runtime exists.
declare const wx: { env: { USER_DATA_PATH: string }; getFileSystemManager(): UniNamespace.FileSystemManager };
function createFiles(): PreviewCacheFiles {
  let manager: UniNamespace.FileSystemManager | undefined;
  let directory = "";
  let initialized: Promise<void> | undefined;
  function init() {
    return initialized ??= (async () => {
      manager = wx.getFileSystemManager();
      directory = `${wx.env.USER_DATA_PATH}/idv-floor-previews-v1`;
      try { manager.accessSync(directory); }
      catch {
        await new Promise<void>((resolve, reject) => manager!.mkdir({ dirPath: directory, recursive: true, success: () => resolve(), fail: reject }));
      }
    })().catch(error => { initialized = undefined; throw error; });
  }
  const path = (name: string) => `${directory}/${name}`;
  const missing = (error: { errMsg?: string }) => /no such file|not exist|not found|ENOENT/i.test(error.errMsg ?? "");
  return {
    path,
    async readIndex() {
      await init();
      return new Promise<unknown>((resolve, reject) => manager!.readFile({
        filePath: path("index.json"), encoding: "utf8",
        success: result => { try { resolve(JSON.parse(String(result.data))); } catch { resolve(null); } },
        fail: error => missing(error) ? resolve(null) : reject(error),
      }));
    },
    async writeIndex(index) {
      await init();
      await new Promise<void>((resolve, reject) => manager!.writeFile({
        filePath: path("index.pending"), data: JSON.stringify(index), encoding: "utf8", success: () => resolve(), fail: reject,
      }));
      await new Promise<void>((resolve, reject) => manager!.rename({
        oldPath: path("index.pending"), newPath: path("index.json"), success: () => resolve(), fail: reject,
      }));
    },
    async list() {
      await init();
      return new Promise<string[]>((resolve, reject) => manager!.readdir({ dirPath: directory, success: result => resolve(result.files), fail: reject }));
    },
    async exists(name) {
      await init();
      return new Promise<boolean>((resolve, reject) => manager!.access({
        path: path(name), success: () => resolve(true), fail: error => missing(error) ? resolve(false) : reject(error),
      }));
    },
    async copy(tempPath, name) {
      await init();
      if (!isPreviewFile(name)) throw new Error("Invalid preview file");
      return new Promise<void>((resolve, reject) => manager!.copyFile({ srcPath: tempPath, destPath: path(name), success: () => resolve(), fail: reject }));
    },
    async remove(name) {
      await init();
      if (!isPreviewFile(name)) throw new Error("Invalid preview file");
      return new Promise<void>((resolve, reject) => manager!.unlink({ filePath: path(name), success: () => resolve(), fail: reject }));
    },
    async discardTemp(tempPath) {
      await init();
      // Only remove an export supplied by the preview service, never a saved file.
      if (tempPath.startsWith(`${directory}/`)) return;
      return new Promise<void>((resolve, reject) => manager!.unlink({ filePath: tempPath, success: () => resolve(), fail: reject }));
    },
  };
}

export const floorPreviewCache = createFloorPreviewCache(createFiles(), error => console.warn("[floor-preview] cache unavailable", error));

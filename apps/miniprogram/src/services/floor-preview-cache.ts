import { availableFloors, resolveFloorSource, type FloorSource, type PublicMapConfigV4 } from "@idv-map/shared";

// Include the rendering policy so a future format/size change cannot reuse old output.
export function floorPreviewKey(source: FloorSource): string {
  const r = source.region;
  return JSON.stringify(["png-4096-8000000-v1", source.url, source.imageWidth, source.imageHeight,
    r && [r.x, r.y, r.width, r.height]]);
}

export function floorPreviewSources(config: PublicMapConfigV4): FloorSource[] {
  return config.layouts.flatMap(layout => availableFloors(layout)
    .map(floor => resolveFloorSource(layout, floor)!).filter(source => source.region));
}

export interface PreviewCacheIndex { version: 1; entries: [string, string][] }
export interface PreviewCacheFiles {
  readIndex(): Promise<unknown>;
  writeIndex(index: PreviewCacheIndex): Promise<void>;
  list(): Promise<string[]>;
  exists(name: string): Promise<boolean>;
  copy(tempPath: string, name: string): Promise<void>;
  remove(name: string): Promise<void>;
  discardTemp(path: string): Promise<void>;
  path(name: string): string;
}
export interface FloorPreviewCache {
  get(source: FloorSource): Promise<string | undefined>;
  put(source: FloorSource, tempPath: string): Promise<string>;
}

export const isPreviewFile = (name: unknown): name is string =>
  typeof name === "string" && /^preview-[a-z0-9-]+\.png$/.test(name);

/** Only our own preview directory is managed. No count, age, or capacity eviction. */
export function createFloorPreviewCache(files: PreviewCacheFiles, report: (error: unknown) => void = () => {}) {
  let entries: Map<string, string> | undefined;
  let allowed: Set<string> | undefined;
  let sequence = 0;
  let tail: Promise<unknown> = Promise.resolve();
  function serial<T>(work: () => Promise<T>, fallback: T): Promise<T> {
    const run = tail.then(work).catch(error => { report(error); return fallback; });
    tail = run;
    return run;
  }
  async function load() {
    if (entries) return entries;
    const index = await files.readIndex() as Partial<PreviewCacheIndex> | null;
    entries = new Map();
    if (index?.version === 1 && Array.isArray(index.entries)) {
      for (const entry of index.entries) {
        if (Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string" && isPreviewFile(entry[1])) {
          entries.set(entry[0], entry[1]);
        }
      }
    }
    return entries;
  }
  const write = (next: Map<string, string>) => files.writeIndex({ version: 1, entries: [...next] });
  async function remove(name: string) {
    if (await files.exists(name)) await files.remove(name);
  }
  async function discardTemp(path: string) {
    try { await files.discardTemp(path); } catch (error) { report(error); }
  }
  return {
    reconcile(sources: readonly FloorSource[]): Promise<void> {
      // Reject obsolete in-flight exports as soon as fresh content is received.
      allowed = new Set(sources.filter(source => source.region).map(floorPreviewKey));
      return serial(async () => {
        const current = await load();
        const next = new Map([...current].filter(([key]) => allowed!.has(key)));
        const retained = new Set(next.values());
        // Also collect interrupted writes/orphans, without touching unrelated files.
        for (const name of await files.list()) {
          if (isPreviewFile(name) && !retained.has(name)) await remove(name);
        }
        await write(next);
        entries = next;
      }, undefined);
    },
    get(source: FloorSource): Promise<string | undefined> {
      return serial(async () => {
        const key = floorPreviewKey(source);
        if (allowed && !allowed.has(key)) return undefined;
        const current = await load();
        const name = current.get(key);
        if (!name) return undefined;
        if (await files.exists(name)) return files.path(name);
        const next = new Map(current);
        next.delete(key);
        await write(next);
        entries = next;
        return undefined;
      }, undefined);
    },
    put(source: FloorSource, tempPath: string): Promise<string> {
      return serial(async () => {
        const key = floorPreviewKey(source);
        if (!source.region || (allowed && !allowed.has(key))) return tempPath;
        const current = await load();
        const existing = current.get(key);
        if (existing && await files.exists(existing)) {
          await discardTemp(tempPath);
          return files.path(existing);
        }
        const name = `preview-${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2)}.png`;
        try {
          await files.copy(tempPath, name);
          if (allowed && !allowed.has(key)) { await remove(name); return tempPath; }
          const next = new Map(current).set(key, name);
          await write(next);
          entries = next;
        } catch (error) {
          try { await remove(name); } catch { /* Reconcile retries orphan cleanup. */ }
          throw error;
        }
        await discardTemp(tempPath);
        return files.path(name);
      }, tempPath);
    },
  };
}

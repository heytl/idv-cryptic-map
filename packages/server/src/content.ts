import {
  assetKeys,
  validateMapConfigV3,
  type MapConfigV3,
} from "../../shared/src/index";
import type {
  AssetStorage,
  ContentRepository,
  StatisticsRepository,
} from "./ports";

export class ServiceError extends Error {
  constructor(
    public status: number,
    public code: string,
    message = code,
  ) {
    super(message);
  }
}
export function checkedConfig(value: unknown): MapConfigV3 {
  const validation = validateMapConfigV3(value);
  if (!validation.valid)
    throw new ServiceError(400, "invalid_config", validation.errors.join("\n"));
  return value as MapConfigV3;
}
export async function saveContent(
  repo: ContentRepository,
  assets: AssetStorage,
  candidate: unknown,
  expectedVersion: number,
  now = new Date(),
): Promise<MapConfigV3> {
  const config = checkedConfig(candidate);
  const current = await repo.read();
  if (current.version !== expectedVersion)
    throw new ServiceError(409, "version_conflict", "内容已更新，请刷新后重试");
  // Keep tombstones: IDs must remain reserved even across restore/import.
  const maps = new Map(config.gameMaps.map((m) => [m.id, m]));
  for (const map of current.gameMaps)
    if (!maps.has(map.id))
      throw new ServiceError(
        400,
        "missing_map",
        "地图记录必须保留；请使用下架或软删除",
      );
  for (const map of current.gameMaps)
    if (map.deletedAt && !maps.get(map.id)?.deletedAt)
      throw new ServiceError(400, "retired_map_id", "已移除地图 ID 不可复用");
  const layouts = new Map(config.layouts.map((l) => [l.id, l]));
  for (const l of current.layouts) {
    const next = layouts.get(l.id);
    if (!next || next.gameMapId !== l.gameMapId)
      throw new ServiceError(
        400,
        "immutable_layout",
        "已有布局不可移除或改变地图归属；请使用软删除",
      );
    if (l.deletedAt && !next.deletedAt)
      throw new ServiceError(400, "retired_id", "已移除布局 ID 不可复用");
  }
  for (const key of assetKeys(config))
    if (!(await assets.exists(key)))
      throw new ServiceError(400, "missing_asset", `缺少图片：${key}`);
  const next = {
    ...config,
    version: current.version + 1,
    updatedAt: now.toISOString(),
  };
  await repo.backup(current);
  await repo.save(next, expectedVersion);
  return next;
}
export interface ContentManifest {
  format: "idv-content";
  formatVersion: 1;
  config: MapConfigV3;
  assets: { key: string; url: string }[];
}
export async function exportContent(
  repo: ContentRepository,
  storage: AssetStorage,
): Promise<ContentManifest> {
  const config = checkedConfig(await repo.read());
  return {
    format: "idv-content",
    formatVersion: 1,
    config,
    assets: assetKeys(config).map((key) => ({ key, url: storage.url(key) })),
  };
}
/** Keep post-backup additions as tombstones; never recycle IDs on restore. */
export function preserveIdentities(
  restored: MapConfigV3,
  current: MapConfigV3,
  now = new Date(),
): MapConfigV3 {
  const result = structuredClone(restored);
  for (const map of current.gameMaps)
    if (!result.gameMaps.some((m) => m.id === map.id))
      result.gameMaps.push({ ...map, published: false });
  for (const map of current.gameMaps)
    if (map.deletedAt) {
      const target = result.gameMaps.find((m) => m.id === map.id)!;
      target.deletedAt = map.deletedAt;
      target.published = false;
    }
  for (const l of current.layouts) {
    const index = result.layouts.findIndex((item) => item.id === l.id);
    if (index < 0)
      result.layouts.push({
        ...l,
        published: false,
        deletedAt: now.toISOString(),
      });
    else if (l.deletedAt)
      result.layouts[index] = {
        ...result.layouts[index]!,
        published: false,
        deletedAt: l.deletedAt,
      };
  }
  return result;
}
/** Callable from any scheduler; does not depend on a Worker context. */
export async function maintenance(
  repo: ContentRepository,
  statistics?: StatisticsRepository,
  now = new Date(),
): Promise<void> {
  const outcomes = await Promise.allSettled([
    repo.read().then((c) => repo.backup(checkedConfig(c))),
    statistics?.prune(
      new Date(
        Date.parse(
          new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10) +
            "T00:00:00+08:00",
        ) -
          89 * 86400_000,
      ).toISOString(),
    ),
  ]);
  const failure = outcomes.find((r) => r.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}

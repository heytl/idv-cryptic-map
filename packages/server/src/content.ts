import { assetKeysV4 as assetKeys, normalizeMapConfigV4, purgeGameMap, type MapConfigV4, } from "../../shared/src/index";
import { entranceAvailabilityIssues, entranceFilterFor, layoutPublicationIssues, } from "../../shared/src/map-v4";
import type { AssetStorage, ContentRepository, StatisticsRepository, } from "./ports";
export class ServiceError extends Error {
  constructor(public status: number, public code: string, message = code) {
    super(message);
  }
}
export function checkedConfig(value: unknown): MapConfigV4 {
  try {
    return normalizeMapConfigV4(value);
  }
  catch (error) {
    throw new ServiceError(400, 'invalid_config', error instanceof Error ? error.message : '配置无效');
  }
}
function preserveDefinitionReferences(next: MapConfigV4, current: MapConfigV4) {
  const keep = <T>(old: T[], values: T[], key: (item: T) => string) => {
    const ids = new Set(values.map(key));
    if (old.some(item => !ids.has(key(item))))
      throw new ServiceError(400, 'missing_identity', '字典、难度关联和楼层标识必须保留；删除请保留 deletedAt 记录');
  };
  keep(current.difficulties, next.difficulties, d => d.id);
  keep(current.entranceTypes, next.entranceTypes, d => d.id);
  for (const m of current.gameMaps) {
    const target = next.gameMaps.find(n => n.id === m.id);
    if (!target)
      continue;
    keep(m.difficulties, target.difficulties, d => d.difficultyId);
    for (const d of m.difficulties) {
      const nextDifficulty = target.difficulties.find(n => n.difficultyId === d.difficultyId)!;
      keep(d.floors, nextDifficulty.floors, f => f.id);
      for (const [type, filter] of Object.entries(d.entranceFilters ?? {}))
        keep(filter.filterOptions, nextDifficulty.entranceFilters?.[type]?.filterOptions ?? [], o => o.id);
    }
  }
  const archivedModes = new Set(next.difficulties.filter(d => d.archived).map(d => d.id));
  const archivedTypes = new Set(next.entranceTypes.filter(d => d.archived).map(d => d.id));
  for (const m of next.gameMaps)
    for (const d of m.difficulties) {
      const old = current.gameMaps.find(n => n.id === m.id)?.difficulties.find(n => n.difficultyId === d.difficultyId);
      if (!old && archivedModes.has(d.difficultyId))
        throw new ServiceError(400, 'archived_definition', '停用难度不能新增关联');
      if (d.entranceRules.allowed.some(id => archivedTypes.has(id) && !old?.entranceRules.allowed.includes(id)))
        throw new ServiceError(400, 'archived_definition', '停用入口不能新增关联');
    }
  const oldEntries = new Map(current.layouts.flatMap(l => l.entrances.map(e => [e.id, { e, mode: l.mode, gameMapId: l.gameMapId }] as const)));
  const maps = new Map(next.gameMaps.map(m => [m.id, m]));
  for (const l of next.layouts)
    for (const e of l.entrances)
      if (e.filterValue && (oldEntries.get(e.id)?.e.filterValue !== e.filterValue || oldEntries.get(e.id)?.mode !== l.mode || oldEntries.get(e.id)?.gameMapId !== l.gameMapId) && entranceFilterFor(maps.get(l.gameMapId), l.mode, e.type)?.filterOptions.find(o => o.id === e.filterValue)?.archived)
        throw new ServiceError(400, 'archived_definition', '停用分类不能新增使用');
}
export async function saveContent(repo: ContentRepository, assets: AssetStorage, candidate: unknown, expectedVersion: number, now = new Date()): Promise<MapConfigV4> {
  if ((candidate as MapConfigV4)?.schemaVersion !== 4)
    throw new ServiceError(409, 'admin_upgrade_required', '请刷新后台后再保存');
  const config = checkedConfig(candidate);
  const current = await repo.read();
  if (current.version !== expectedVersion)
    throw new ServiceError(409, "version_conflict", "内容已更新，请刷新后重试");
  preserveDefinitionReferences(config, current);
  // Keep tombstones: IDs must remain reserved even across restore/import.
  const maps = new Map(config.gameMaps.map((m) => [m.id, m]));
  for (const map of current.gameMaps)
    if (!maps.has(map.id))
      throw new ServiceError(400, "missing_map", "地图记录必须保留；请使用下架或软删除");
    else if (map.purgedAt && maps.get(map.id)!.purgedAt !== map.purgedAt)
      throw new ServiceError(400, 'retired_map', '已从回收站删除的地图不可复用');
  // The existing row keeps this ID reserved. Clearing deletedAt restores that
  // same map; removing the row entirely is still rejected by the check above.
  const layouts = new Map(config.layouts.map((l) => [l.id, l]));
  for (const l of current.layouts) {
    const next = layouts.get(l.id);
    if (!next || next.gameMapId !== l.gameMapId)
      throw new ServiceError(400, "immutable_layout", "已有布局不可移除或改变地图归属；请使用软删除");
    if (l.deletedAt && !next.deletedAt)
      throw new ServiceError(400, "retired_id", "已移除布局 ID 不可复用");
    if (l.modeLocked && (next.mode !== l.mode || !next.modeLocked))
      throw new ServiceError(400, 'immutable_mode', '已发布或历史布局不可原 ID 修改难度或解锁，请复制布局');
    for (const e of l.entrances) {
      const target = next.entrances.find(item => item.id === e.id);
      if (!target || target.type !== e.type || (e.deletedAt && !target.deletedAt))
        throw new ServiceError(400, 'immutable_entrance', '入口实例必须保留身份，请使用软删除');
    }
  }
  const oldLayouts = new Map(current.layouts.map(l => [l.id, l]));
  const mapById = new Map(config.gameMaps.map(m => [m.id, m]));
  for (const layout of config.layouts)
    if (layout.published && !layout.deletedAt &&
      (!oldLayouts.get(layout.id)?.published || oldLayouts.get(layout.id)?.mode !== layout.mode)) {
      const issues = layoutPublicationIssues(layout, mapById.get(layout.gameMapId));
      if (issues.length)
        throw new ServiceError(400, "invalid_publication", `布局 ${layout.id}：${issues.join("；")}`);
    }
  const readiness = entranceAvailabilityIssues(config, current);
  if (readiness.length)
    throw new ServiceError(400, "entrance_not_ready", readiness.join("；"));
  for (const key of assetKeys(config))
    if (!(await assets.exists(key)))
      throw new ServiceError(400, "missing_asset", `缺少图片：${key}`);
  const next = {
    ...config,
    layouts: config.layouts.map(l => ({ ...l, modeLocked: l.modeLocked || l.published })),
    version: current.version + 1,
    updatedAt: now.toISOString(),
  };
  await repo.backup(current);
  await repo.save(next, expectedVersion);
  return next;
}
export interface ContentManifest {
  format: "idv-content";
  formatVersion: 2;
  config: MapConfigV4;
  assets: {
    key: string;
    url: string;
  }[];
}
export async function exportContent(repo: ContentRepository, storage: AssetStorage): Promise<ContentManifest> {
  const config = checkedConfig(await repo.read());
  return {
    format: "idv-content",
    formatVersion: 2,
    config,
    assets: assetKeys(config).map((key) => ({ key, url: storage.url(key) })),
  };
}
/** Keep post-backup additions as tombstones; never recycle IDs on restore. */
export function preserveIdentities(restored: MapConfigV4, current: MapConfigV4, now = new Date()): MapConfigV4 {
  const result = structuredClone(restored);
  const merge = <T extends {
    id: string;
  }>(target: T[], existing: T[], hide: (v: T) => T) => {
    for (const item of existing)
      if (!target.some(v => v.id === item.id))
        target.push(hide(structuredClone(item)));
  };
  merge(result.difficulties, current.difficulties, v => ({ ...v, archived: true }));
  merge(result.entranceTypes, current.entranceTypes, v => ({ ...v, archived: true }));
  for (const map of current.gameMaps)
    if (!result.gameMaps.some((m) => m.id === map.id))
      result.gameMaps.push({ ...map, published: false });
  for (const map of current.gameMaps)
    if (map.deletedAt) {
      const target = result.gameMaps.find((m) => m.id === map.id)!;
      target.deletedAt = map.deletedAt;
      target.published = false;
    }
  for (const map of current.gameMaps) {
    const target = result.gameMaps.find(m => m.id === map.id)!;
    for (const d of map.difficulties) {
      const restoredDifficulty = target.difficulties.find(n => n.difficultyId === d.difficultyId);
      if (!restoredDifficulty)
        target.difficulties.push({ ...structuredClone(d), visible: false });
      else {
        merge(restoredDifficulty.floors, d.floors, f => ({ ...f, visible: false }));
        for (const [type, filter] of Object.entries(d.entranceFilters ?? {})) {
          restoredDifficulty.entranceFilters ??= {};
          restoredDifficulty.entranceFilters[type] ??= { filterLabel: filter.filterLabel, filterOptions: [] };
          merge(restoredDifficulty.entranceFilters[type].filterOptions, filter.filterOptions, o => ({ ...o, archived: true }));
        }
      }
    }
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
    const target = result.layouts.find(item => item.id === l.id)!;
    if (l.modeLocked && target.mode !== l.mode)
      Object.assign(target, structuredClone(l), { published: false });
    target.modeLocked = target.modeLocked || l.modeLocked;
    for (const e of l.entrances) {
      const restoredEntry = target.entrances.find(v => v.id === e.id);
      if (!restoredEntry)
        target.entrances.push({ ...structuredClone(e), deletedAt: e.deletedAt ?? now.toISOString() });
      else if (e.deletedAt)
        restoredEntry.deletedAt = e.deletedAt;
    }
  }
  for (const map of current.gameMaps)
    if (map.purgedAt) {
      result.gameMaps.find(m => m.id === map.id)!.purgedAt = map.purgedAt;
      purgeGameMap(result, map.id, new Date(map.purgedAt));
    }
  return result;
}
/** Callable from any scheduler; does not depend on a Worker context. */
export async function maintenance(repo: ContentRepository, statistics?: StatisticsRepository, now = new Date()): Promise<void> {
  const outcomes = await Promise.allSettled([
    repo.read().then((c) => repo.backup(checkedConfig(c))),
    statistics?.prune(new Date(Date.parse(new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10) +
      "T00:00:00+08:00") -
      89 * 86400000).toISOString()),
  ]);
  const failure = outcomes.find((r) => r.status === "rejected");
  if (failure?.status === "rejected")
    throw failure.reason;
}

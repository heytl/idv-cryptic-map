import {
  toPublicMapConfigV2,
  validateMapConfigV2,
  publicationIssues,
  type MapConfigV2,
  type MapItemV2,
  type PublicMapV2,
  type PublicMapConfigV2,
} from "./map-v2";

export const DEFAULT_GAME_MAP_ID = "lady-of-doom";
export interface GameMap {
  id: string;
  name: string;
  sort: number;
  published: boolean;
  deletedAt?: string | null;
}
export interface Layout extends Omit<MapItemV2, "layout"> {
  gameMapId: string;
  floorImages: MapItemV2["layout"];
}
export interface MapConfigV3 {
  schemaVersion: 3;
  version: number;
  updatedAt: string;
  gameMaps: GameMap[];
  layouts: Layout[];
}
export interface PublicLayout extends Omit<PublicMapV2, "layout"> {
  gameMapId: string;
  floorImages: PublicMapV2["layout"];
}
export interface PublicMapConfigV3
  extends Omit<PublicMapConfigV2, "schemaVersion" | "maps"> {
  schemaVersion: 3;
  gameMaps: GameMap[];
  layouts: PublicLayout[];
}

export function asV2Layout(item: Layout): MapItemV2 {
  const { gameMapId: _gameMapId, floorImages, ...rest } = item;
  return { ...rest, layout: floorImages };
}
export function layoutPublicationIssues(item: Layout): string[] {
  return publicationIssues(asV2Layout(item));
}

export function migrateV2ToV3(input: MapConfigV2): MapConfigV3 {
  const result = validateMapConfigV2(input);
  if (!result.valid) throw new Error(result.errors.join("\n"));
  return {
    schemaVersion: 3,
    version: input.version,
    updatedAt: input.updatedAt,
    gameMaps: [
      { id: DEFAULT_GAME_MAP_ID, name: "厄运之女", sort: 10, published: true },
    ],
    layouts: input.maps.map(({ layout, ...item }) => ({
      ...item,
      gameMapId: DEFAULT_GAME_MAP_ID,
      floorImages: layout,
    })),
  };
}

export function validateMapConfigV3(input: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!input || typeof input !== "object")
    return { valid: false, errors: ["配置必须是对象"] };
  const c = input as MapConfigV3;
  if (c.schemaVersion !== 3) errors.push("schemaVersion 必须为 3");
  if (!Array.isArray(c.gameMaps) || !Array.isArray(c.layouts))
    return { valid: false, errors: ["gameMaps 和 layouts 必须是数组"] };
  const ids = new Set<string>();
  for (const m of c.gameMaps) {
    if (
      !m ||
      typeof m.id !== "string" ||
      !/^[a-z0-9][a-z0-9-]{0,63}$/.test(m.id) ||
      ids.has(m.id)
    )
      errors.push("地图 ID 无效或重复");
    else ids.add(m.id);
    if (
      !m ||
      typeof m.name !== "string" ||
      !m.name.trim() ||
      !Number.isFinite(m.sort) ||
      typeof m.published !== "boolean"
    )
      errors.push("地图名称、排序或发布状态无效");
  }
  for (const l of c.layouts) {
    if (!l || !ids.has(l.gameMapId)) errors.push("布局引用的地图不存在");
    if (
      !l?.floorImages ||
      typeof l.floorImages !== "object" ||
      Array.isArray(l.floorImages)
    )
      errors.push("布局楼层图片无效");
  }
  if (errors.length) return { valid: false, errors };
  try {
    errors.push(
      ...validateMapConfigV2({
        schemaVersion: 2,
        version: c.version,
        updatedAt: c.updatedAt,
        maps: c.layouts.map(asV2Layout),
      }).errors,
    );
  } catch {
    errors.push("布局结构无效");
  }
  return { valid: errors.length === 0, errors };
}

/** V2 clients see only the original game map. */
export function compatibleV2Config(c: MapConfigV3): MapConfigV2 {
  const visible = c.gameMaps.some(
    (m) => m.id === DEFAULT_GAME_MAP_ID && m.published && !m.deletedAt,
  );
  return {
    schemaVersion: 2,
    version: c.version,
    updatedAt: c.updatedAt,
    maps: visible
      ? c.layouts
          .filter((l) => l.gameMapId === DEFAULT_GAME_MAP_ID)
          .map(asV2Layout)
      : [],
  };
}
export function toPublicMapConfigV3(
  c: MapConfigV3,
  mediaBaseUrl: string,
): PublicMapConfigV3 {
  const gameMaps = c.gameMaps
    .filter((m) => m.published && !m.deletedAt)
    .sort((a, b) => a.sort - b.sort);
  const allowed = new Set(gameMaps.map((m) => m.id));
  const source = c.layouts.filter((l) => allowed.has(l.gameMapId));
  const publicV2 = toPublicMapConfigV2(
    {
      schemaVersion: 2,
      version: c.version,
      updatedAt: c.updatedAt,
      maps: source.map(asV2Layout),
    },
    mediaBaseUrl,
  );
  const { maps, schemaVersion: _schemaVersion, ...rest } = publicV2;
  const byId = new Map(source.map((l) => [l.id, l.gameMapId]));
  return {
    ...rest,
    schemaVersion: 3,
    gameMaps,
    layouts: maps.map(({ layout, ...l }) => ({
      ...l,
      gameMapId: byId.get(l.id)!,
      floorImages: layout,
    })),
  };
}

export function assetKeys(c: MapConfigV3): string[] {
  return [
    ...new Set(
      c.layouts
        .flatMap((l) => [
          ...Object.values(l.floorImages).map((a) => a?.key),
          ...l.entrances.flatMap((e) => [e.image?.key, e.thumb?.key]),
        ])
        .filter((key): key is string => !!key),
    ),
  ].sort();
}

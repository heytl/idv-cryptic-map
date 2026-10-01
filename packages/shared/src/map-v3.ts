import {
  toPublicMapConfigV2,
  validateMapConfigV2,
  publicationIssues,
  type FloorType,
  type MapConfigV2,
  type MapItemV2,
  type PublicMapV2,
  type PublicMapConfigV2,
} from "./map-v2";

export type RegionFloor = Exclude<FloorType, "full">;
export interface PixelRect { x: number; y: number; width: number; height: number }
export interface FloorRegions {
  sourceKey: string;
  imageWidth: number;
  imageHeight: number;
  regions: Partial<Record<RegionFloor, PixelRect>>;
}
export interface PublicFloorRegions extends Omit<FloorRegions, "sourceKey"> { sourceUrl: string }
export interface PublicLayoutV4 extends PublicLayout { floorRegions?: PublicFloorRegions }
export interface PublicMapConfigV4 extends Omit<PublicMapConfigV3, "schemaVersion" | "layouts"> {
  schemaVersion: 4;
  layouts: PublicLayoutV4[];
}
export function validPixelRect(value: unknown, width: number, height: number): value is PixelRect {
  if (!value || typeof value !== "object") return false;
  const r = value as PixelRect;
  return [r.x, r.y, r.width, r.height].every(Number.isSafeInteger) &&
    r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0 &&
    r.x + r.width <= width && r.y + r.height <= height;
}
function regionErrors(item: Layout): string[] {
  if (item.floorRegions === undefined) return [];
  const r = item.floorRegions;
  if (!r || typeof r !== "object" || Array.isArray(r)) return ["楼层区域无效"];
  const errors: string[] = [];
  if (!r.sourceKey || r.sourceKey !== item.floorImages.full?.key) errors.push("楼层区域必须引用当前全图");
  if (![r.imageWidth, r.imageHeight].every(n => Number.isSafeInteger(n) && n > 0)) errors.push("全图像素尺寸无效");
  if (!r.regions || typeof r.regions !== "object" || Array.isArray(r.regions)) return [...errors, "楼层区域集合无效"];
  for (const [floor, rect] of Object.entries(r.regions)) {
    if (!["basement", "floor1", "floor2"].includes(floor)) errors.push("区域楼层无效");
    if (!validPixelRect(rect, r.imageWidth, r.imageHeight)) errors.push(`${floor} 区域越界或尺寸无效`);
    if (item.floorImages[floor as FloorType]) errors.push(`${floor} 不能同时配置区域与独立图片`);
  }
  return errors;
}

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
  floorRegions?: FloorRegions;
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
  const { gameMapId: _gameMapId, floorImages, floorRegions: _regions, ...rest } = item;
  return { ...rest, layout: floorImages };
}
export function layoutPublicationIssues(item: Layout): string[] {
  const issues = publicationIssues(asV2Layout(item), floor =>
    !!item.floorImages[floor] || (floor !== "full" && !!item.floorRegions?.regions?.[floor]),
  );
  return [...issues, ...regionErrors(item)];
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
    if (typeof l?.published !== "boolean") errors.push("布局发布状态必须为布尔值");
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
        maps: c.layouts.map(l => ({ ...asV2Layout(l), published: false })),
      }).errors,
    );
    for (const l of c.layouts) {
      errors.push(...(l.published ? layoutPublicationIssues(l) : regionErrors(l)).map(e => `布局 ${l.id}：${e}`));
    }
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

/** Current public protocol. Legacy serializers remain only for historical imports/tests. */
export function toPublicMapConfigV4(c: MapConfigV3, mediaBaseUrl: string): PublicMapConfigV4 {
  const base = toPublicMapConfigV3(c, mediaBaseUrl);
  const byId = new Map(c.layouts.map(l => [l.id, l]));
  return {
    ...base, schemaVersion: 4,
    layouts: base.layouts.map(l => {
      const regions = byId.get(l.id)!.floorRegions;
      return regions ? { ...l, floorRegions: {
        sourceUrl: l.floorImages.full!.url,
        imageWidth: regions.imageWidth, imageHeight: regions.imageHeight,
        regions: structuredClone(regions.regions),
      } } : l;
    }),
  };
}

import { DEFAULT_FLOOR, FLOOR_ORDER, GAME_MODES, ENTRANCE_TYPES, DIRECTIONS_V2, PASSAGES_V2, type FloorType } from "./map-v2";
import { validPixelRect, type PublicMapConfigV4, type PublicLayoutV4, type PixelRect } from "./map-v3";

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
const url = (v: unknown): v is string => text(v) && /^https?:\/\/[^\s]+$/.test(v);
const integer = (v: unknown) => Number.isSafeInteger(v);

/** Validate the public boundary before either client renders it. No browser APIs. */
export function isPublicMapConfigV4(value: unknown): value is PublicMapConfigV4 {
  if (!object(value) || value.schemaVersion !== 4 || value.defaultFloor !== DEFAULT_FLOOR ||
      !integer(value.dataVersion) || (value.dataVersion as number) < 0 || !text(value.updatedAt) ||
      !Array.isArray(value.gameMaps) || !Array.isArray(value.layouts) || !object(value.dictionaries)) return false;
  const dictionaries = value.dictionaries;
  if (!["modes", "entrances", "directions", "passages", "floors"].every(key =>
    Array.isArray(dictionaries[key]) && dictionaries[key].every((d: unknown) => object(d) && text(d.value) && text(d.label)))) return false;
  const maps = new Set<string>();
  for (const m of value.gameMaps) {
    if (!object(m) || !text(m.id) || !m.id || maps.has(m.id) || !text(m.name) ||
        !Number.isFinite(m.sort) || m.published !== true || m.deletedAt) return false;
    maps.add(m.id);
  }
  const layouts = new Set<number>();
  for (const l of value.layouts) {
    if (!object(l) || !integer(l.id) || layouts.has(l.id as number) || !maps.has(l.gameMapId as string) ||
        !GAME_MODES.includes(l.mode as never) || !text(l.name) || !text(l.displayName) ||
        !text(l.remarks) || !Number.isFinite(l.sort) || !Array.isArray(l.legacyNames) || !l.legacyNames.every(text) ||
        !object(l.floorImages) || !object(l.floorImages.full) || !url(l.floorImages.full.url) || !Array.isArray(l.entrances)) return false;
    layouts.add(l.id as number);
    for (const [floor, asset] of Object.entries(l.floorImages)) {
      if (!FLOOR_ORDER.includes(floor as FloorType) || !object(asset) || !url(asset.url)) return false;
    }
    const entrances = new Set<string>();
    for (const e of l.entrances) {
      if (!object(e) || !text(e.id) || entrances.has(e.id) || !ENTRANCE_TYPES.includes(e.type as never) ||
          !text(e.typeLabel) || !DIRECTIONS_V2.includes(e.direction as never) || !text(e.directionLabel) ||
          !url(e.imageUrl) || !url(e.thumbUrl) ||
          (e.passage !== undefined && !PASSAGES_V2.includes(e.passage as never)) ||
          (e.passageLabel !== undefined && !text(e.passageLabel))) return false;
      entrances.add(e.id);
    }
    if (l.floorRegions !== undefined) {
      const r = l.floorRegions;
      if (!object(r) || r.sourceUrl !== l.floorImages.full.url || !integer(r.imageWidth) || !integer(r.imageHeight) ||
          (r.imageWidth as number) <= 0 || (r.imageHeight as number) <= 0 || !object(r.regions)) return false;
      for (const [floor, rect] of Object.entries(r.regions)) {
        if (floor === "full" || !FLOOR_ORDER.includes(floor as FloorType) || l.floorImages[floor] ||
            !validPixelRect(rect, r.imageWidth as number, r.imageHeight as number)) return false;
      }
    }
  }
  return true;
}

export interface FloorSource {
  url: string;
  region?: PixelRect;
  imageWidth?: number;
  imageHeight?: number;
}

/** Region coordinates always refer to the original image, never CSS/rpx pixels. */
export function resolveFloorSource(layout: PublicLayoutV4, floor: FloorType): FloorSource | undefined {
  const regions = layout.floorRegions;
  const region = floor === "full" ? undefined : regions?.regions[floor];
  if (region && regions) return {
    url: regions.sourceUrl, region, imageWidth: regions.imageWidth, imageHeight: regions.imageHeight,
  };
  const asset = layout.floorImages[floor];
  if (!asset) return undefined;
  return floor === "full" && regions
    ? { url: asset.url, imageWidth: regions.imageWidth, imageHeight: regions.imageHeight }
    : { url: asset.url };
}

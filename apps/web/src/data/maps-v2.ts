import {
  DEFAULT_FLOOR,
  DIRECTION_LABELS,
  DIRECTIONS_V2,
  ENTRANCE_TYPES,
  FLOOR_ORDER,
  GAME_MODES,
  PASSAGES_V2,
  PASSAGE_LABELS,
  type DirectionV2,
  type EntranceType,
  type FloorType,
  type GameMode,
  type PassageV2,
  type PublicEntranceV2,
  type PublicMapConfigV2,
  type PublicMapV2,
} from '@idv-map/shared';
import { reactive, ref } from 'vue';

export const mapsV2 = reactive<PublicMapV2[]>([]);
export const mapsV2UpdatedAt = ref('');
export const mapsV2Version = ref(0);
export const mapsV2Error = ref('');

/**
 * 当前前台启用的入口。困难模式的正门、二楼门数据继续保留在 V2，
 * 等素材完成后只需在这里开放，不需要重新录入后台数据。
 */
const ENABLED_ENTRANCES: Record<GameMode, readonly EntranceType[]> = {
  hard: ['side'],
  nightmare: ['front', 'upstairs'],
};

let loadPromise: Promise<boolean> | null = null;

function publicEndpoint(): string {
  const base = (import.meta.env.VITE_MAP_API_BASE_URL ?? '').replace(/\/$/, '');
  // 正式 Access 策略覆盖 /api/*；使用等价的公开文件路由可让网页、main 静态站和小程序
  // 在无需后台登录的情况下读取，同时仍由 Worker 从同一份 config:v2:current 下发。
  return `${base}/maps-v2.json`;
}

function isPublicConfig(input: unknown): input is PublicMapConfigV2 {
  if (!input || typeof input !== 'object') return false;
  const config = input as Partial<PublicMapConfigV2>;
  return config.schemaVersion === 2 &&
    config.defaultFloor === DEFAULT_FLOOR &&
    typeof config.dataVersion === 'number' &&
    Array.isArray(config.maps);
}

export async function ensureMapsV2(): Promise<boolean> {
  if (mapsV2.length > 0) return true;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    mapsV2Error.value = '';
    try {
      const response = await fetch(publicEndpoint(), { cache: 'no-cache' });
      if (!response.ok) throw new Error(response.status === 404 ? 'V2 地图尚未准备好' : `HTTP ${response.status}`);
      const data: unknown = await response.json();
      if (!isPublicConfig(data)) throw new Error('V2 地图协议不合法');
      mapsV2.splice(0, mapsV2.length, ...data.maps);
      mapsV2UpdatedAt.value = data.updatedAt;
      mapsV2Version.value = data.dataVersion;
      return true;
    } catch (error) {
      mapsV2Error.value = error instanceof Error ? error.message : 'V2 地图加载失败';
      return false;
    } finally {
      loadPromise = null;
    }
  })();
  return loadPromise;
}

export function isGameMode(value: unknown): value is GameMode {
  return typeof value === 'string' && GAME_MODES.includes(value as GameMode);
}

export function isEntranceType(value: unknown): value is EntranceType {
  return typeof value === 'string' && ENTRANCE_TYPES.includes(value as EntranceType);
}

export function enabledEntranceTypesV2(mode: GameMode): readonly EntranceType[] {
  return ENABLED_ENTRANCES[mode];
}

export function isEnabledEntranceV2(mode: GameMode, entrance: EntranceType): boolean {
  return enabledEntranceTypesV2(mode).includes(entrance);
}

export function defaultEntranceV2(mode: GameMode): EntranceType {
  return enabledEntranceTypesV2(mode)[0]!;
}

export type CatalogFilterV2 = DirectionV2 | PassageV2;

/** 正门按进门后的通道分类，其他入口继续按地图方向分类。 */
export function catalogFilterValuesV2(entrance: EntranceType): readonly CatalogFilterV2[] {
  return entrance === 'front' ? PASSAGES_V2 : DIRECTIONS_V2;
}

export function isCatalogFilterV2(entrance: EntranceType, value: unknown): value is CatalogFilterV2 {
  return typeof value === 'string' && catalogFilterValuesV2(entrance).includes(value as CatalogFilterV2);
}

export function catalogFilterLabelV2(entrance: EntranceType, value: CatalogFilterV2): string {
  return entrance === 'front'
    ? PASSAGE_LABELS[value as PassageV2]
    : DIRECTION_LABELS[value as DirectionV2];
}

export function entranceFilterValueV2(entrance: PublicEntranceV2): CatalogFilterV2 | undefined {
  return entrance.type === 'front' ? entrance.passage : entrance.direction;
}

export function entranceFilterLabelV2(entrance: PublicEntranceV2): string {
  return entrance.type === 'front' ? entrance.passageLabel ?? '通道待分类' : entrance.directionLabel;
}

export function findMapV2(id: number, mode?: GameMode): PublicMapV2 | undefined {
  return mapsV2.find((map) => map.id === id && (!mode || map.mode === mode));
}

export function findEntranceV2(map: PublicMapV2, type: EntranceType): PublicEntranceV2 | undefined {
  return map.entrances.find((entrance) => entrance.type === type);
}

export function availableFloors(map: PublicMapV2): FloorType[] {
  return FLOOR_ORDER.filter((floor) => !!map.layout[floor]);
}

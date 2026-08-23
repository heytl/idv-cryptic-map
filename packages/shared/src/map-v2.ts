export const GAME_MODES = ['hard', 'nightmare'] as const;
export type GameMode = (typeof GAME_MODES)[number];

export const ENTRANCE_TYPES = ['side', 'front', 'upstairs'] as const;
export type EntranceType = (typeof ENTRANCE_TYPES)[number];

export const DIRECTIONS_V2 = ['left', 'right', 'south', 'north'] as const;
export type DirectionV2 = (typeof DIRECTIONS_V2)[number];

/** 正门进门后的通道数量与方位；与地图入口方向分开表达。 */
export const PASSAGES_V2 = ['upperLeft', 'upperRight', 'both', 'triple'] as const;
export type PassageV2 = (typeof PASSAGES_V2)[number];

/** 所有客户端共用：全图始终第一，并作为进入详情页后的默认楼层。 */
export const FLOOR_ORDER = ['full', 'basement', 'floor1', 'floor2'] as const;
export type FloorType = (typeof FLOOR_ORDER)[number];
export const DEFAULT_FLOOR = 'full' as const;

export const MODE_LABELS: Record<GameMode, string> = {
  hard: '困难',
  nightmare: '噩梦',
};

export const ENTRANCE_LABELS: Record<EntranceType, string> = {
  side: '侧门',
  front: '正门',
  upstairs: '二楼门',
};

export const DIRECTION_LABELS: Record<DirectionV2, string> = {
  left: '左',
  right: '右',
  south: '南',
  north: '北',
};

export const PASSAGE_LABELS: Record<PassageV2, string> = {
  upperLeft: '左上门',
  upperRight: '右上门',
  both: '左右门',
  triple: '三门',
};

export const FLOOR_LABELS: Record<FloorType, string> = {
  full: '全图',
  basement: '地下室',
  floor1: '一楼',
  floor2: '二楼',
};

export interface AssetRef {
  key: string;
}

export interface EntranceV2 {
  id: string;
  type: EntranceType;
  direction?: DirectionV2;
  passage?: PassageV2;
  image?: AssetRef;
  thumb?: AssetRef;
}

export interface MapLayoutV2 {
  full?: AssetRef;
  basement?: AssetRef;
  floor1?: AssetRef;
  floor2?: AssetRef;
}

export interface MapItemV2 {
  id: number;
  mode: GameMode;
  name: string;
  displayName: string;
  remarks: string;
  sort: number;
  published: boolean;
  deletedAt?: string | null;
  legacyNames?: string[];
  layout: MapLayoutV2;
  entrances: EntranceV2[];
}

export interface MapConfigV2 {
  schemaVersion: 2;
  version: number;
  updatedAt: string;
  maps: MapItemV2[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const REQUIRED_LAYOUTS: Record<GameMode, readonly FloorType[]> = {
  hard: ['full', 'floor1', 'floor2'],
  nightmare: FLOOR_ORDER,
};

const REQUIRED_ENTRANCES: Record<GameMode, readonly EntranceType[]> = {
  hard: ENTRANCE_TYPES,
  nightmare: ['front', 'upstairs'],
};

/**
 * 给后台直接展示的发布检查清单。草稿不调用这项检查，所以录入过程可以不完整。
 * 文案使用业务名称，避免把 full / upstairs 一类内部代码暴露给管理员。
 */
export function publicationIssues(map: MapItemV2): string[] {
  const issues: string[] = [];
  for (const floor of REQUIRED_LAYOUTS[map.mode]) {
    if (!map.layout[floor]) issues.push(`缺少${FLOOR_LABELS[floor]}地图`);
  }
  if (map.mode === 'hard' && map.layout.basement) issues.push('困难模式不使用地下室地图，请先移除');

  const requiredTypes = REQUIRED_ENTRANCES[map.mode];
  for (const type of requiredTypes) {
    const entrance = map.entrances.find((item) => item.type === type);
    if (!entrance) {
      issues.push(`缺少${ENTRANCE_LABELS[type]}入口`);
      continue;
    }
    if (!entrance.direction) issues.push(`${ENTRANCE_LABELS[type]}还没有选择方向`);
    if (!entrance.image) issues.push(`${ENTRANCE_LABELS[type]}还没有入口图`);
  }
  for (const entrance of map.entrances) {
    if (!requiredTypes.includes(entrance.type)) {
      issues.push(`${MODE_LABELS[map.mode]}模式不使用${ENTRANCE_LABELS[entrance.type]}，请先移除`);
    }
  }
  return issues;
}

const ASSET_PREFIXES: Record<'full' | 'basement' | 'floor1' | 'floor2' | 'entrance' | 'thumb', readonly string[]> = {
  full: ['maps/layout/full/', 'maps/full/'],
  basement: ['maps/layout/basement/'],
  floor1: ['maps/layout/floor1/', 'maps/floor1/'],
  floor2: ['maps/layout/floor2/', 'maps/floor2/'],
  entrance: ['maps/entrance/', 'maps/entry/'],
  thumb: ['maps/entrance-thumb/', 'maps/entry-thumb/'],
};

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function validateAsset(asset: unknown, role: keyof typeof ASSET_PREFIXES, path: string, errors: string[]): void {
  if (!asset || typeof asset !== 'object') {
    errors.push(`${path} 必须是图片引用`);
    return;
  }
  const key = (asset as AssetRef).key;
  if (
    typeof key !== 'string' ||
    key.includes('..') ||
    !key.endsWith('.webp') ||
    !ASSET_PREFIXES[role].some((prefix) => key.startsWith(prefix))
  ) {
    errors.push(`${path}.key 不在允许的 R2 目录: ${String(key)}`);
  }
}

/**
 * 草稿允许缺内容；一旦 published=true，则按模式检查完整 Layout 和入口集合。
 * 返回全部错误，便于后台一次展示完整度，而不是让管理员逐个保存碰错。
 */
export function validateMapConfigV2(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return { valid: false, errors: ['配置必须是对象'] };
  const config = input as MapConfigV2;
  if (config.schemaVersion !== 2) errors.push('schemaVersion 必须为 2');
  if (!Number.isInteger(config.version) || config.version < 0) errors.push('version 必须是非负整数');
  if (typeof config.updatedAt !== 'string') errors.push('updatedAt 必须是字符串');
  if (!Array.isArray(config.maps)) return { valid: false, errors: [...errors, 'maps 必须是数组'] };

  const mapIds = new Set<number>();
  const entranceIds = new Set<string>();
  for (const map of config.maps) {
    const mapPath = `map[${String(map?.id)}]`;
    if (!Number.isInteger(map?.id) || mapIds.has(map.id)) errors.push(`${mapPath}.id 缺失或重复`);
    else mapIds.add(map.id);
    if (!isOneOf(map?.mode, GAME_MODES)) errors.push(`${mapPath}.mode 不合法`);
    if (typeof map?.name !== 'string' || !map.name.trim()) errors.push(`${mapPath}.name 缺失`);
    if (typeof map?.displayName !== 'string' || !map.displayName.trim()) errors.push(`${mapPath}.displayName 缺失`);
    if (typeof map?.remarks !== 'string') errors.push(`${mapPath}.remarks 必须是字符串`);
    if (!Number.isFinite(map?.sort)) errors.push(`${mapPath}.sort 必须是数字`);
    if (typeof map?.published !== 'boolean') errors.push(`${mapPath}.published 必须是布尔值`);
    if (!map?.layout || typeof map.layout !== 'object') errors.push(`${mapPath}.layout 必须是对象`);
    if (!Array.isArray(map?.entrances)) {
      errors.push(`${mapPath}.entrances 必须是数组`);
      continue;
    }

    const layout = map.layout ?? {};
    for (const floor of FLOOR_ORDER) {
      const asset = layout[floor];
      if (asset) validateAsset(asset, floor, `${mapPath}.layout.${floor}`, errors);
    }

    const entranceTypes = new Set<EntranceType>();
    for (const entrance of map.entrances) {
      const entrancePath = `${mapPath}.entrance[${String(entrance?.id)}]`;
      if (typeof entrance?.id !== 'string' || !entrance.id || entranceIds.has(entrance.id)) {
        errors.push(`${entrancePath}.id 缺失或重复`);
      } else {
        entranceIds.add(entrance.id);
      }
      if (!isOneOf(entrance?.type, ENTRANCE_TYPES)) {
        errors.push(`${entrancePath}.type 不合法`);
      } else if (entranceTypes.has(entrance.type)) {
        errors.push(`${mapPath} 的 ${entrance.type} 入口重复`);
      } else {
        entranceTypes.add(entrance.type);
      }
      if (entrance?.direction !== undefined && !isOneOf(entrance.direction, DIRECTIONS_V2)) {
        errors.push(`${entrancePath}.direction 不合法`);
      }
      if (entrance?.passage !== undefined && !isOneOf(entrance.passage, PASSAGES_V2)) {
        errors.push(`${entrancePath}.passage 不合法`);
      }
      if (entrance?.type !== 'front' && entrance?.passage !== undefined) {
        errors.push(`${entrancePath}.passage 仅正门可以配置`);
      }
      if (entrance?.image) validateAsset(entrance.image, 'entrance', `${entrancePath}.image`, errors);
      if (entrance?.thumb) validateAsset(entrance.thumb, 'thumb', `${entrancePath}.thumb`, errors);
    }

    if (!map.published || !isOneOf(map.mode, GAME_MODES)) continue;

    errors.push(...publicationIssues(map).map((issue) => `${mapPath}：${issue}`));
  }

  return { valid: errors.length === 0, errors };
}

export interface PublicAssetV2 {
  url: string;
}

export interface PublicEntranceV2 {
  id: string;
  type: EntranceType;
  typeLabel: string;
  direction: DirectionV2;
  directionLabel: string;
  passage?: PassageV2;
  passageLabel?: string;
  imageUrl: string;
  thumbUrl: string;
}

export interface PublicMapV2 {
  id: number;
  mode: GameMode;
  name: string;
  displayName: string;
  remarks: string;
  sort: number;
  legacyNames: string[];
  layout: Partial<Record<FloorType, PublicAssetV2>>;
  entrances: PublicEntranceV2[];
}

export interface PublicMapConfigV2 {
  schemaVersion: 2;
  dataVersion: number;
  updatedAt: string;
  defaultFloor: typeof DEFAULT_FLOOR;
  dictionaries: {
    modes: { value: GameMode; label: string }[];
    entrances: { value: EntranceType; label: string }[];
    directions: { value: DirectionV2; label: string }[];
    passages: { value: PassageV2; label: string }[];
    floors: { value: FloorType; label: string; shortLabel?: string }[];
  };
  maps: PublicMapV2[];
}

function assetUrl(baseUrl: string, asset: AssetRef): string {
  return `${baseUrl.replace(/\/$/, '')}/${asset.key}`;
}

/** 仅序列化已经通过 validateMapConfigV2 的配置。 */
export function toPublicMapConfigV2(config: MapConfigV2, mediaBaseUrl: string): PublicMapConfigV2 {
  return {
    schemaVersion: 2,
    dataVersion: config.version,
    updatedAt: config.updatedAt,
    defaultFloor: DEFAULT_FLOOR,
    dictionaries: {
      modes: GAME_MODES.map((value) => ({ value, label: MODE_LABELS[value] })),
      entrances: ENTRANCE_TYPES.map((value) => ({ value, label: ENTRANCE_LABELS[value] })),
      directions: DIRECTIONS_V2.map((value) => ({ value, label: DIRECTION_LABELS[value] })),
      passages: PASSAGES_V2.map((value) => ({ value, label: PASSAGE_LABELS[value] })),
      floors: FLOOR_ORDER.map((value) => ({
        value,
        label: FLOOR_LABELS[value],
        ...(value === 'basement' ? { shortLabel: '负一楼' } : {}),
      })),
    },
    maps: config.maps
      .filter((map) => map.published && !map.deletedAt)
      .sort((a, b) => a.sort - b.sort)
      .map((map) => {
        const layout: Partial<Record<FloorType, PublicAssetV2>> = {};
        for (const floor of FLOOR_ORDER) {
          const asset = map.layout[floor];
          if (asset) layout[floor] = { url: assetUrl(mediaBaseUrl, asset) };
        }
        return {
          id: map.id,
          mode: map.mode,
          name: map.name,
          displayName: map.displayName,
          remarks: map.remarks,
          sort: map.sort,
          legacyNames: map.legacyNames ?? [],
          layout,
          entrances: map.entrances.map((entrance) => {
            if (!entrance.direction || !entrance.image) {
              throw new Error(`已发布地图 ${map.id} 的入口 ${entrance.id} 不完整`);
            }
            // 正门的物理入口固定在南侧；前台第三级改按 passage 分类。
            const direction = entrance.type === 'front' ? 'south' : entrance.direction;
            return {
              id: entrance.id,
              type: entrance.type,
              typeLabel: ENTRANCE_LABELS[entrance.type],
              direction,
              directionLabel: DIRECTION_LABELS[direction],
              ...(entrance.passage
                ? { passage: entrance.passage, passageLabel: PASSAGE_LABELS[entrance.passage] }
                : {}),
              imageUrl: assetUrl(mediaBaseUrl, entrance.image),
              thumbUrl: assetUrl(mediaBaseUrl, entrance.thumb ?? entrance.image),
            };
          }),
        };
      }),
  };
}

export type LegacyDirection = '左' | '右' | '南' | '北';

export interface LegacyMap {
  id: number;
  sort?: number;
  direction: LegacyDirection;
  name: string;
  displayName: string;
  remarks?: string;
  published?: boolean;
  deletedAt?: string | null;
  sourceKey?: string;
  images?: Partial<Record<'entry' | 'entryThumb' | 'floor1' | 'floor2' | 'full', string>>;
}

export interface LegacyConfig {
  version: number;
  updatedAt: string;
  maps: LegacyMap[];
}

const LEGACY_DIRECTIONS: Record<LegacyDirection, DirectionV2> = {
  左: 'left',
  右: 'right',
  南: 'south',
  北: 'north',
};

function keyFromLegacyUrl(value: string): string | null {
  try {
    const pathname = new URL(value, 'https://legacy.invalid').pathname;
    const key = decodeURIComponent(pathname).replace(/^\/r2\//, '').replace(/^\//, '');
    return key.startsWith('maps/') ? key : null;
  } catch {
    return null;
  }
}

function legacyAsset(value: string | undefined, path: string, warnings: string[]): AssetRef | undefined {
  if (!value) {
    warnings.push(`${path} 缺失`);
    return undefined;
  }
  const key = keyFromLegacyUrl(value);
  if (!key) {
    warnings.push(`${path} 无法转换为 R2 Key: ${value}`);
    return undefined;
  }
  return { key };
}

export interface MigrationResult {
  config: MapConfigV2;
  warnings: string[];
}

export interface MigrationOptions {
  /** 临时占位：正门、二楼门复用侧门的方向、入口图和缩略图。 */
  copySideToAllEntrances?: boolean;
  /** 仅用于从已发布 V1 公开配置做完整同步；默认仍迁为草稿。 */
  publish?: boolean;
}

/** 纯转换：不写 KV、不上传 R2，调用方必须将结果写入独立的 config:v2:current。 */
export function migrateLegacyConfigToV2(legacy: LegacyConfig, options: MigrationOptions = {}): MigrationResult {
  const warnings: string[] = [];
  const maps = legacy.maps.map<MapItemV2>((map, index) => {
    const direction = LEGACY_DIRECTIONS[map.direction];
    const image = legacyAsset(map.images?.entry, `${map.name}.images.entry`, warnings);
    const thumb = legacyAsset(map.images?.entryThumb, `${map.name}.images.entryThumb`, warnings);
    const entranceTypes: readonly EntranceType[] = options.copySideToAllEntrances
      ? ['side', 'front', 'upstairs']
      : ['side'];

    return {
      id: map.id,
      mode: 'hard',
      name: map.name,
      displayName: map.displayName,
      remarks: map.remarks ?? '',
      sort: map.sort ?? (index + 1) * 10,
      published: options.publish === true && map.published !== false && !map.deletedAt,
      deletedAt: map.deletedAt,
      legacyNames: [...new Set([map.name, map.displayName])],
      layout: {
        full: legacyAsset(map.images?.full, `${map.name}.images.full`, warnings),
        floor1: legacyAsset(map.images?.floor1, `${map.name}.images.floor1`, warnings),
        floor2: legacyAsset(map.images?.floor2, `${map.name}.images.floor2`, warnings),
      },
      entrances: entranceTypes.map((type) => ({
        id: `${map.id}-${type}`,
        type,
        direction,
        image: image ? { ...image } : undefined,
        thumb: thumb ? { ...thumb } : undefined,
      })),
    };
  });

  return {
    config: {
      schemaVersion: 2,
      version: 0,
      updatedAt: legacy.updatedAt,
      maps,
    },
    warnings,
  };
}

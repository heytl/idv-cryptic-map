import { GAME_MODES, MODE_LABELS, ENTRANCE_TYPES, ENTRANCE_LABELS, FLOOR_ORDER, FLOOR_LABELS, REQUIRED_LAYOUTS, DIRECTIONS_V2, DIRECTION_LABELS, PASSAGES_V2, PASSAGE_LABELS, ENABLED_ENTRANCES, type AssetRef, type PublicEntranceV2 } from './map-v2';
import { migrateV2ToV3, normalizeEntranceRules, validateMapConfigV3, validPixelRect, type MapConfigV3, type PixelRect, type PublicMapConfigV4, type PublicMapConfigV5 } from './map-v3';
import { isContentAssetForRole } from './media-paths.mjs';
import { definitionReferences } from './definition-references';
export type DifficultyId = string;
export type EntranceTypeId = string;
export type FloorId = string;
export interface Definition {
  id: string;
  name: string;
  sort: number;
  archived?: boolean;
  deletedAt?: string | null;
}
export interface FloorDefinition extends Definition {
  visible: boolean;
}
export type EntranceDefinition = Definition;
export interface EntranceFilter {
  filterLabel: string;
  filterOptions: Definition[];
}
export interface MapDifficulty {
  difficultyId: string;
  sort: number;
  visible: boolean;
  deletedAt?: string | null;
  floors: FloorDefinition[];
  entranceFilters?: Record<string, EntranceFilter>;
  entranceRules: {
    allowed: string[];
    enabled: string[];
  };
}
export interface GameMapV4 {
  id: string;
  name: string;
  sort: number;
  published: boolean;
  deletedAt?: string | null;
  purgedAt?: string | null;
  difficulties: MapDifficulty[];
}
export interface EntranceV4 {
  id: string;
  type: string;
  filterValue?: string;
  image?: AssetRef;
  thumb?: AssetRef;
  deletedAt?: string | null;
}
export interface LayoutV4 {
  id: number;
  gameMapId: string;
  mode: string;
  modeLocked: boolean;
  name: string;
  displayName: string;
  remarks: string;
  sort: number;
  published: boolean;
  deletedAt?: string | null;
  legacyNames?: string[];
  floorImages: Partial<Record<string, AssetRef>>;
  floorRegions?: {
    sourceKey: string;
    imageWidth: number;
    imageHeight: number;
    regions: Record<string, PixelRect>;
  };
  entrances: EntranceV4[];
}
export interface MapConfigV4 {
  schemaVersion: 4;
  version: number;
  updatedAt: string;
  difficulties: Definition[];
  entranceTypes: EntranceDefinition[];
  gameMaps: GameMapV4[];
  layouts: LayoutV4[];
}
export interface PublicEntranceV6 {
  id: string;
  type: string;
  typeLabel: string;
  filterValue?: string;
  filterLabel?: string;
  imageUrl: string;
  thumbUrl: string;
}
export interface PublicGameMapV6 extends Omit<GameMapV4, 'deletedAt' | 'purgedAt' | 'difficulties'> {
  difficulties: {
    difficultyId: string;
    sort: number;
    floors: FloorDefinition[];
    enabledEntrances: string[];
    entranceFilters?: Record<string, EntranceFilter>;
  }[];
}
export interface PublicLayoutV6 extends Omit<LayoutV4, 'modeLocked' | 'published' | 'deletedAt' | 'floorImages' | 'floorRegions' | 'entrances' | 'legacyNames'> {
  legacyNames: string[];
  floorImages: Partial<Record<string, {
    url: string;
  }>>;
  floorRegions?: {
    sourceUrl: string;
    imageWidth: number;
    imageHeight: number;
    regions: Record<string, PixelRect>;
  };
  entrances: PublicEntranceV6[];
  /** Client-only reference, attached after validating the wire document. */
  floorDefinitions?: FloorDefinition[];
}
export interface PublicMapConfigV6 {
  schemaVersion: 6;
  dataVersion: number;
  updatedAt: string;
  defaultFloor: 'full';
  dictionaries: {
    modes: Definition[];
    entrances: EntranceDefinition[];
  };
  gameMaps: PublicGameMapV6[];
  layouts: PublicLayoutV6[];
}
export const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value);
const obj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const sorted = <T extends {
  sort: number;
}>(values: readonly T[]): T[] => [...values].sort((a, b) => a.sort - b.sort);
export function legacyDefinitions() {
  return {
    difficulties: GAME_MODES.map((id, i) => ({ id, name: MODE_LABELS[id], sort: (i + 1) * 10 })),
    entranceTypes: ENTRANCE_TYPES.map((id, i) => ({
      id, name: ENTRANCE_LABELS[id], sort: (i + 1) * 10,
      filterLabel: id === 'front' ? '通道' : '方向', filterOptions: (id === 'front' ? PASSAGES_V2 : DIRECTIONS_V2).map((value, index) => ({
        id: value, name: id === 'front' ? PASSAGE_LABELS[value as keyof typeof PASSAGE_LABELS] : DIRECTION_LABELS[value as keyof typeof DIRECTION_LABELS], sort: (index + 1) * 10
      }))
    })),
  };
}
export function migrateV3ToV4(value: MapConfigV3): MapConfigV4 {
  const check = validateMapConfigV3(value);
  if (!check.valid)
    throw new Error(check.errors.join('\n'));
  const c = normalizeEntranceRules(value);
  return migrateEntranceFilters({
    schemaVersion: 4, version: c.version, updatedAt: c.updatedAt, ...legacyDefinitions(),
    gameMaps: c.gameMaps.map(({ entranceRules, modeVisibility, ...m }) => ({
      ...m, difficulties: GAME_MODES.map((mode, i) => ({
        difficultyId: mode, sort: (i + 1) * 10, visible: modeVisibility![mode],
        floors: FLOOR_ORDER.filter(f => f !== 'full' && (REQUIRED_LAYOUTS[mode].includes(f) || c.layouts.some(l => l.gameMapId === m.id && l.mode === mode && (l.floorImages[f] || l.floorRegions?.regions[f])))).map((id, index) => ({ id, name: FLOOR_LABELS[id], sort: (index + 1) * 10, visible: true })),
        entranceRules: structuredClone(entranceRules![mode]),
      }))
    })),
    layouts: c.layouts.map(l => ({
      ...l, modeLocked: true, floorImages: { ...l.floorImages }, floorRegions: l.floorRegions ? structuredClone(l.floorRegions) as LayoutV4['floorRegions'] : undefined,
      entrances: l.entrances.map(({ direction, passage, ...e }) => ({ ...e, ...(e.type === 'front' ? passage ? { filterValue: passage } : {} : direction ? { filterValue: direction } : {}) })),
    })),
  });
}
export function normalizeMapConfigV4(value: unknown): MapConfigV4 {
  if (!obj(value))
    throw new Error('配置必须是对象');
  if (value.schemaVersion === 2)
    return migrateV3ToV4(migrateV2ToV3(value as any));
  if (value.schemaVersion === 3)
    return migrateV3ToV4(value as MapConfigV3);
  const normalized = migrateEntranceFilters(value as MapConfigV4);
  const check = validateMapConfigV4(normalized);
  if (!check.valid)
    throw new Error(check.errors.join('\n'));
  // A validated V4 document is already the request-local JSON value.
  return normalized;
}
/** Read legacy entrance-owned classifications without writing or sharing drafts. */
function migrateEntranceFilters<T extends { entranceTypes: EntranceDefinition[]; gameMaps: { difficulties: { difficultyId: string; entranceFilters?: Record<string, EntranceFilter> }[] }[] }>(value: T): T {
  if (!Array.isArray(value.entranceTypes) || !value.entranceTypes.some(e => obj(e) && ('filterLabel' in e || 'filterOptions' in e))) return value;
  const filters = Object.fromEntries(value.entranceTypes.filter(e => 'filterLabel' in e || 'filterOptions' in e).map(e => {
    const legacy = e as EntranceDefinition & EntranceFilter;
    return [e.id, { filterLabel: legacy.filterLabel, filterOptions: legacy.filterOptions }];
  }));
  return { ...value,
    entranceTypes: value.entranceTypes.map(({ id, name, sort, archived, deletedAt }) => ({ id, name, sort, ...(archived !== undefined ? { archived } : {}), ...(deletedAt !== undefined ? { deletedAt } : {}) })),
    gameMaps: value.gameMaps.map(m => ({ ...m, difficulties: m.difficulties.map(d => ({ ...d,
      entranceFilters: d.entranceFilters ?? structuredClone(filters),
    })) })),
  };
}
export function entranceFilterFor(map: GameMapV4 | PublicGameMapV6 | undefined, mode: string, type: string): EntranceFilter | undefined {
  return difficultyFor(map, mode)?.entranceFilters?.[type];
}
export function difficultyFor(map: GameMapV4 | undefined, mode: string): MapDifficulty | undefined;
export function difficultyFor(map: PublicGameMapV6 | undefined, mode: string): PublicGameMapV6['difficulties'][number] | undefined;
export function difficultyFor(map: GameMapV4 | PublicGameMapV6 | undefined, mode: string): MapDifficulty | PublicGameMapV6['difficulties'][number] | undefined;
export function difficultyFor(map: GameMapV4 | PublicGameMapV6 | undefined, mode: string) {
  return map?.difficulties.find(d => d.difficultyId === mode);
}
export function configuredEntranceTypes(map: GameMapV4 | PublicGameMapV6 | undefined, mode: string): string[] {
  const d = difficultyFor(map, mode);
  return !d || ('deletedAt' in d && d.deletedAt) ? [] : 'entranceRules' in d ? d.entranceRules.enabled : d.enabledEntrances;
}
export function enabledEntranceTypes(map: GameMapV4 | PublicGameMapV6 | undefined, mode: string): string[] {
  const d = difficultyFor(map, mode);
  return d && (!('visible' in d) || d.visible) ? configuredEntranceTypes(map, mode) : [];
}
export function allowedEntranceTypes(map: GameMapV4 | undefined, mode: string): string[] {
  return difficultyFor(map, mode)?.entranceRules.allowed ?? [];
}
export function availableModes(map: GameMapV4 | PublicGameMapV6 | undefined): string[] {
  return [...(map?.difficulties ?? [])].sort((a, b) => a.sort - b.sort).filter(d => enabledEntranceTypes(map, d.difficultyId).length).map(d => d.difficultyId);
}
export function defaultEntrance(map: GameMapV4 | PublicGameMapV6 | undefined, mode: string) {
  return enabledEntranceTypes(map, mode)[0];
}
export function completeEntrance(e: EntranceV4) {
  return !e.deletedAt && !!e.image;
}
export function layoutPublicationIssues(l: LayoutV4, map?: GameMapV4, requireOpen = true): string[] {
  const issues = !l.floorImages.full ? ['缺少全图'] : [];
  const types = configuredEntranceTypes(map, l.mode);
  if (requireOpen && !l.entrances.some(e => types.includes(e.type) && completeEntrance(e)))
    issues.push('至少补齐一个已配置开放入口的入口图');
  return issues;
}
export function entranceAvailabilityIssues(next: MapConfigV4, previous: MapConfigV4): string[] {
  const ready = (c: MapConfigV4) => new Set(c.layouts.filter(l => l.published && !l.deletedAt && l.floorImages.full).flatMap(l => l.entrances.filter(completeEntrance).map(e => `${l.gameMapId}/${l.mode}/${e.type}`)));
  const before = ready(previous), after = ready(next), oldMaps = new Map(previous.gameMaps.map(m => [m.id, m]));
  const errors: string[] = [];
  for (const m of next.gameMaps)
    if (m.published && !m.deletedAt)
      for (const mode of availableModes(m))
        for (const type of enabledEntranceTypes(m, mode)) {
          const key = `${m.id}/${mode}/${type}`, old = oldMaps.get(m.id);
          if (!after.has(key) && (!old?.published || old.deletedAt || !enabledEntranceTypes(old, mode).includes(type) || before.has(key)))
            errors.push(`${m.name}：${mode} / ${type} 没有已发布的完整资料`);
        }
  return errors;
}
export function validateMapConfigV4(value: unknown): {
  valid: boolean;
  errors: string[];
} {
  try {
    return validateMapConfigV4Unchecked(obj(value) ? migrateEntranceFilters(value as MapConfigV4) : value);
  }
  catch {
    return { valid: false, errors: ['配置集合或引用结构无效'] };
  }
}
function validateMapConfigV4Unchecked(value: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!obj(value) || value.schemaVersion !== 4 || !Number.isSafeInteger(value.version) || value.version < 0 || typeof value.updatedAt !== 'string')
    return { valid: false, errors: ['配置版本或元数据无效'] };
  const c = value as MapConfigV4;
  const definitions = (items: unknown, path: string): Set<string> => {
    const ids = new Set<string>();
    if (!Array.isArray(items)) {
      errors.push(`${path}必须是数组`);
      return ids;
    }
    for (const d of items) {
      if (!obj(d) || !validId(d.id) || ids.has(d.id) || typeof d.name !== 'string' || !d.name.trim() || !Number.isFinite(d.sort) || (d.archived !== undefined && typeof d.archived !== 'boolean') || (d.deletedAt != null && (typeof d.deletedAt !== 'string' || !Number.isFinite(Date.parse(d.deletedAt)))))
        errors.push(`${path}标识、名称或排序无效`);
      else
        ids.add(d.id);
    }
    return ids;
  };
  const modes = definitions(c.difficulties, '难度'), types = definitions(c.entranceTypes, '入口');
  if (!Array.isArray(c.entranceTypes) || !Array.isArray(c.gameMaps) || !Array.isArray(c.layouts))
    return { valid: false, errors: [...errors, '配置集合无效'] };
  const maps = new Map<string, GameMapV4>();
  for (const m of c.gameMaps) {
    if (!obj(m) || !validId(m.id) || maps.has(m.id) || typeof m.name !== 'string' || !m.name.trim() || !Number.isFinite(m.sort) || typeof m.published !== 'boolean' || !Array.isArray(m.difficulties)) {
      errors.push('地图无效或重复');
      continue;
    }
    maps.set(m.id, m);
    if (m.purgedAt != null && (typeof m.purgedAt !== 'string' || !Number.isFinite(Date.parse(m.purgedAt)) || !m.deletedAt || m.published || m.difficulties.some(d => !d.deletedAt || d.visible)))
      errors.push('已从回收站删除的地图不能恢复或发布');
    const used = new Set<string>();
    for (const d of m.difficulties) {
      if (!obj(d) || !modes.has(d.difficultyId) || used.has(d.difficultyId) || typeof d.visible !== 'boolean' || !Number.isFinite(d.sort)) {
        errors.push('地图关联难度无效或重复');
        continue;
      }
      used.add(d.difficultyId);
      if (d.entranceFilters !== undefined && !obj(d.entranceFilters)) errors.push('地图入口分类配置无效');
      for (const [type, filter] of Object.entries(d.entranceFilters ?? {})) {
        if (!types.has(type) || !obj(filter) || typeof filter.filterLabel !== 'string' || (filter.filterOptions?.length && !filter.filterLabel.trim())) {
          errors.push('地图入口分类类型无效');
          continue;
        }
        definitions(filter.filterOptions, '分类');
      }
      const floors = definitions(d.floors, '楼层');
      if (floors.has('full') || d.floors?.some(f => typeof f.visible !== 'boolean'))
        errors.push('楼层显示配置无效');
      if (!obj(d.entranceRules)) {
        errors.push('入口规则无效');
        continue;
      }
      for (const field of ['allowed', 'enabled'] as const)
        if (!Array.isArray(d.entranceRules[field]) || new Set(d.entranceRules[field]).size !== d.entranceRules[field].length || d.entranceRules[field].some(t => !types.has(t)))
          errors.push('入口规则包含无效或重复标识');
      if (Array.isArray(d.entranceRules.allowed) && Array.isArray(d.entranceRules.enabled) && d.entranceRules.enabled.some(t => !d.entranceRules.allowed.includes(t)))
        errors.push('开放入口必须允许录入');
      if (d.visible && !d.deletedAt && !d.entranceRules.enabled.length)
        errors.push('显示难度请至少配置一个开放入口');
    }
  }
  const layoutIds = new Set<number>(), entranceIds = new Set<string>();
  const entryDefs = new Map(c.entranceTypes.map(e => [e.id, e]));
  for (const l of c.layouts) {
    if (!obj(l) || !Number.isSafeInteger(l.id) || layoutIds.has(l.id) || typeof l.modeLocked !== 'boolean' || typeof l.published !== 'boolean' || !Number.isFinite(l.sort) || !['name', 'displayName', 'remarks'].every(k => typeof (l as any)[k] === 'string') || !l.name?.trim() || !l.displayName?.trim()) {
      errors.push('布局身份或元数据无效');
      continue;
    }
    layoutIds.add(l.id);
    const d = difficultyFor(maps.get(l.gameMapId), l.mode);
    if (!d || !obj(l.floorImages) || !Array.isArray(l.entrances)) {
      errors.push(`布局 ${l.id} 的关联或素材集合无效`);
      continue;
    }
    if ((maps.get(l.gameMapId)?.purgedAt && (!l.deletedAt || l.published)) || (d.deletedAt && !l.deletedAt))
      errors.push(`布局 ${l.id} 关联的地图或难度已移除`);
    const floors = new Set(['full', ...d.floors.map(f => f.id)]);
    const asset = (a: unknown, role: 'full' | 'floor' | 'entrance' | 'thumb') => obj(a) && isContentAssetForRole(a.key, role);
    for (const [id, a] of Object.entries(l.floorImages))
      if (!floors.has(id) || !asset(a, id === 'full' ? 'full' : 'floor'))
        errors.push(`布局 ${l.id} 的楼层图片无效`);
    if (l.floorRegions !== undefined) {
      const r = l.floorRegions;
      if (!obj(r) || !l.floorImages.full || typeof r.sourceKey !== 'string' || r.sourceKey !== l.floorImages.full.key || !Number.isSafeInteger(r.imageWidth) || !Number.isSafeInteger(r.imageHeight) || r.imageWidth <= 0 || r.imageHeight <= 0 || !obj(r.regions))
        errors.push(`布局 ${l.id} 的区域来源无效`);
      else
        for (const [id, rect] of Object.entries(r.regions))
          if (id === 'full' || !floors.has(id) || l.floorImages[id] || !validPixelRect(rect, r.imageWidth, r.imageHeight))
            errors.push(`布局 ${l.id} 的楼层区域无效`);
    }
    const used = new Set<string>();
    for (const e of l.entrances) {
      const def = entryDefs.get(e?.type);
      if (!obj(e) || typeof e.id !== 'string' || !e.id || entranceIds.has(e.id) || !def || (!e.deletedAt && used.has(e.type))) {
        errors.push(`布局 ${l.id} 的入口标识无效或重复`);
        continue;
      }
      entranceIds.add(e.id);
      if (!e.deletedAt)
        used.add(e.type);
      if (!l.deletedAt && !e.deletedAt && !d.entranceRules.allowed.includes(e.type))
        errors.push(`布局 ${l.id} 的入口不允许录入`);
      if (e.filterValue !== undefined && !d.entranceFilters?.[e.type]?.filterOptions.some(f => f.id === e.filterValue))
        errors.push(`布局 ${l.id} 的分类不存在`);
      if ((e.image && !asset(e.image, 'entrance')) || (e.thumb && !asset(e.thumb, 'thumb')))
        errors.push(`布局 ${l.id} 的入口图片无效`);
    }
    if (l.published && !l.deletedAt)
      errors.push(...layoutPublicationIssues(l, maps.get(l.gameMapId), false).map(e => `布局 ${l.id}：${e}`));
  }
  if (!errors.length) {
    // Most reads have no deleted definitions; build the index only when needed.
    let refs: ReturnType<typeof definitionReferences> | undefined;
    const references = () => refs ??= definitionReferences(c);
    for (const d of c.difficulties)
      if (d.deletedAt && references().difficulties.has(d.id))
        errors.push(`难度「${d.name}」仍有引用，不能删除`);
    for (const e of c.entranceTypes) {
      if (e.deletedAt && references().entranceTypes.has(e.id))
        errors.push(`入口「${e.name}」仍有引用，不能删除`);
    }
    for (const m of c.gameMaps)
      for (const d of m.difficulties) {
        for (const [type, filter] of Object.entries(d.entranceFilters ?? {}))
          for (const o of filter.filterOptions)
            if (o.deletedAt && references().filterOptions.has(`${m.id}/${d.difficultyId}/${type}/${o.id}`))
              errors.push(`分类「${m.name} / ${o.name}」仍有引用，不能删除`);
        for (const f of d.floors)
          if (f.deletedAt && references().floors.has(`${m.id}/${d.difficultyId}/${f.id}`))
            errors.push(`楼层「${m.name} / ${f.name}」仍有图片或区域引用，不能删除`);
      }
  }
  return { valid: !errors.length, errors };
}
export function assetKeysV4(c: MapConfigV4): string[] {
  return [...new Set(c.layouts.flatMap(l => [...Object.values(l.floorImages).map(a => a?.key), ...l.entrances.flatMap(e => [e.image?.key, e.thumb?.key])]).filter((k): k is string => !!k))].sort();
}
export function toPublicMapConfigV6(c: MapConfigV4, base: string): PublicMapConfigV6 {
  c = migrateEntranceFilters(c);
  const url = (a: AssetRef) => `${base.replace(/\/$/, '')}/${a.key}`;
  const maps = new Map(c.gameMaps.filter(m => m.published && !m.deletedAt).map(m => [m.id, m]));
  const types = new Map(c.entranceTypes.map(e => [e.id, e]));
  const ready = new Map<string, Set<string>>();
  const layouts: PublicLayoutV6[] = [];
  for (const l of sorted(c.layouts)) {
    const m = maps.get(l.gameMapId), d = difficultyFor(m, l.mode);
    if (!m || !d || !d.visible || d.deletedAt || !l.published || l.deletedAt || !l.floorImages.full)
      continue;
    const enabled = enabledEntranceTypes(m, l.mode);
    const entrances = l.entrances.filter(e => enabled.includes(e.type) && completeEntrance(e)).sort((a, b) => enabled.indexOf(a.type) - enabled.indexOf(b.type)).map(e => {
      const def = types.get(e.type)!;
      return {
        id: e.id, type: e.type, typeLabel: def.name, ...(e.filterValue ? { filterValue: e.filterValue, filterLabel: d.entranceFilters?.[e.type]?.filterOptions.find(f => f.id === e.filterValue)!.name } : {}), imageUrl: url(e.image!), thumbUrl: url(e.thumb ?? e.image!)
      };
    });
    if (!entrances.length)
      continue;
    const key = `${m.id}/${d.difficultyId}`;
    if (!ready.has(key))
      ready.set(key, new Set());
    entrances.forEach(e => ready.get(key)!.add(e.type));
    const ids = new Set(['full', ...d.floors.filter(f => f.visible && !f.deletedAt).map(f => f.id)]);
    const regions = Object.fromEntries(Object.entries(l.floorRegions?.regions ?? {}).filter(([id]) => ids.has(id)));
    layouts.push({
      id: l.id, gameMapId: l.gameMapId, mode: l.mode, name: l.name, displayName: l.displayName, remarks: l.remarks, sort: l.sort, legacyNames: l.legacyNames ?? [],
      floorImages: Object.fromEntries(Object.entries(l.floorImages).filter(([id, a]) => ids.has(id) && a).map(([id, a]) => [id, { url: url(a!) }])),
      ...(Object.keys(regions).length && l.floorRegions ? {
        floorRegions: {
          sourceUrl: url(l.floorImages.full), imageWidth: l.floorRegions.imageWidth, imageHeight: l.floorRegions.imageHeight, regions
        }
      } : {}), entrances
    });
  }
  const usedModes = new Set(layouts.map(l => l.mode)), usedTypes = new Set(layouts.flatMap(l => l.entrances.map(e => e.type)));
  return {
    schemaVersion: 6, dataVersion: c.version, updatedAt: c.updatedAt, defaultFloor: 'full', dictionaries: { modes: structuredClone(c.difficulties.filter(d => !d.deletedAt && usedModes.has(d.id))), entrances: structuredClone(c.entranceTypes.filter(d => !d.deletedAt && usedTypes.has(d.id))) },
    gameMaps: sorted([...maps.values()]).map(m => ({
      id: m.id, name: m.name, sort: m.sort, published: true, difficulties: sorted(m.difficulties).filter(d => ready.has(`${m.id}/${d.difficultyId}`)).map(d => ({
        difficultyId: d.difficultyId, sort: d.sort, floors: sorted(d.floors).filter(f => f.visible && !f.deletedAt).map(f => ({ id: f.id, name: f.name, sort: f.sort, visible: true })), enabledEntrances: d.entranceRules.enabled.filter(e => ready.get(`${m.id}/${d.difficultyId}`)!.has(e)),
        entranceFilters: Object.fromEntries(Object.entries(d.entranceFilters ?? {}).filter(([type]) => ready.get(`${m.id}/${d.difficultyId}`)!.has(type) && d.entranceRules.enabled.includes(type)).map(([type, filter]) => [type, { filterLabel: filter.filterLabel, filterOptions: filter.filterOptions.filter(o => !o.deletedAt).map(o => ({ ...o })) }]))
      }))
    })).filter(m => m.difficulties.length), layouts
  };
}
/** No guessing or loss of effective floors is allowed in legacy projections. */
export function projectLegacyConfig(c: MapConfigV4, base: string, protocol: 4 | 5): PublicMapConfigV4 | PublicMapConfigV5 {
  const current = toPublicMapConfigV6(c, base), presets = legacyDefinitions();
  const modeDefs = new Map(c.difficulties.map(d => [d.id, d]));
  const typeDefs = new Map(c.entranceTypes.map(d => [d.id, d]));
  const maps = new Map(current.gameMaps.map(m => [m.id, m]));
  const layouts = current.layouts.flatMap(l => {
    const mode = GAME_MODES.find(id => id === l.mode);
    if (!mode || modeDefs.get(mode)?.name !== MODE_LABELS[mode])
      return [];
    const d = difficultyFor(maps.get(l.gameMapId), mode)!;
    const floors = availableFloors(l, d.floors);
    if (floors.some(id => id !== 'full' && (!FLOOR_ORDER.includes(id as any) || d.floors.find(f => f.id === id)?.name !== FLOOR_LABELS[id as keyof typeof FLOOR_LABELS])))
      return [];
    const entrances = l.entrances.flatMap(e => {
      const type = ENTRANCE_TYPES.find(id => id === e.type), def = typeDefs.get(e.type), preset = presets.entranceTypes.find(t => t.id === type);
      const filter = d.entranceFilters?.[e.type];
      if (!type || !def || def.name !== preset!.name || filter?.filterLabel !== preset!.filterLabel || (protocol === 4 && !ENABLED_ENTRANCES[mode].includes(type)))
        return [];
      if (e.filterValue && (!preset!.filterOptions.some(f => f.id === e.filterValue && f.name === filter?.filterOptions.find(v => v.id === e.filterValue)?.name)))
        return [];
      const direction = type === 'front' ? 'south' : DIRECTIONS_V2.find(v => v === e.filterValue);
      if (!direction || (type === 'front' && e.filterValue && !PASSAGES_V2.includes(e.filterValue as any)))
        return [];
      return [{
        id: e.id, type, typeLabel: ENTRANCE_LABELS[type], direction, directionLabel: DIRECTION_LABELS[direction], ...(type === 'front' && e.filterValue ? { passage: e.filterValue, passageLabel: e.filterLabel } : {}), imageUrl: e.imageUrl, thumbUrl: e.thumbUrl
      } as PublicEntranceV2];
    });
    return entrances.length ? [{ ...l, mode, entrances }] : [];
  });
  const gameMaps = current.gameMaps.flatMap(m => {
    const own = layouts.filter(l => l.gameMapId === m.id);
    if (!own.length)
      return [];
    return [{
      id: m.id, name: m.name, sort: m.sort, published: true, ...(protocol === 5 ? { enabledEntrances: Object.fromEntries(GAME_MODES.map(mode => [mode, difficultyFor(m, mode)?.enabledEntrances.filter(type => own.some(l => l.mode === mode && l.entrances.some(e => e.type === type))) ?? []])) } : {})
    }];
  });
  return {
    schemaVersion: protocol, dataVersion: c.version, updatedAt: c.updatedAt, defaultFloor: 'full', gameMaps, layouts,
    dictionaries: {
      modes: GAME_MODES.map(value => ({ value, label: MODE_LABELS[value] })), entrances: ENTRANCE_TYPES.map(value => ({ value, label: ENTRANCE_LABELS[value] })), floors: FLOOR_ORDER.map(value => ({ value, label: FLOOR_LABELS[value], ...(value === 'basement' ? { shortLabel: '负一楼' } : {}) })), directions: DIRECTIONS_V2.map(value => ({ value, label: DIRECTION_LABELS[value] })), passages: PASSAGES_V2.map(value => ({ value, label: PASSAGE_LABELS[value] }))
    }
  } as PublicMapConfigV4 | PublicMapConfigV5;
}
export function availableFloors(l: Pick<PublicLayoutV6, 'floorImages' | 'floorRegions' | 'floorDefinitions'>, definitions = l.floorDefinitions): string[] {
  const order = definitions ? sorted(definitions).filter(f => f.visible && !f.deletedAt).map(f => f.id) : [...new Set([...FLOOR_ORDER.filter(f => f !== 'full'), ...Object.keys(l.floorImages), ...Object.keys(l.floorRegions?.regions ?? {})])].filter(f => f !== 'full');
  return ['full', ...order].filter(id => !!l.floorImages[id] || !!l.floorRegions?.regions[id]);
}
export function floorLabel(l: Pick<PublicLayoutV6, 'floorDefinitions'> | undefined, id: string) {
  return id === 'full' ? '全图' : l?.floorDefinitions?.find(f => f.id === id)?.name ?? FLOOR_LABELS[id as keyof typeof FLOOR_LABELS] ?? id;
}
export function resolveFloorSource(l: Pick<PublicLayoutV6, 'floorImages' | 'floorRegions'>, id: string) {
  const r = l.floorRegions, rect = r?.regions[id];
  if (rect && r)
    return { url: r.sourceUrl, region: rect, imageWidth: r.imageWidth, imageHeight: r.imageHeight };
  const a = l.floorImages[id];
  return a ? { url: a.url, ...(id === 'full' && r ? { imageWidth: r.imageWidth, imageHeight: r.imageHeight } : {}) } : undefined;
}
export function isPublicMapConfigV6(v: unknown): v is PublicMapConfigV6 {
  try {
    return validatePublicMapConfigV6(v);
  }
  catch {
    return false;
  }
}
function validatePublicMapConfigV6(v: unknown): v is PublicMapConfigV6 {
  if (!obj(v) || v.schemaVersion !== 6 || v.defaultFloor !== 'full' || !Number.isSafeInteger(v.dataVersion) || v.dataVersion < 0 || typeof v.updatedAt !== 'string' || !obj(v.dictionaries) || !Array.isArray(v.dictionaries.modes) || !Array.isArray(v.dictionaries.entrances) || !Array.isArray(v.gameMaps) || !Array.isArray(v.layouts))
    return false;
  const uri = (x: unknown) => typeof x === 'string' && /^https?:\/\/[^\s]+$/.test(x);
  const asset = (a: any) => obj(a) && uri(a.url);
  const candidate = {
    schemaVersion: 4, version: v.dataVersion, updatedAt: v.updatedAt, difficulties: v.dictionaries.modes, entranceTypes: v.dictionaries.entrances,
    gameMaps: v.gameMaps.map((m: any) => obj(m) && Array.isArray(m.difficulties) ? ({ ...m, difficulties: m.difficulties.map((d: any) => obj(d) ? ({ ...d, visible: true, entranceRules: { allowed: d.enabledEntrances, enabled: d.enabledEntrances } }) : d) }) : m),
    layouts: []
  };
  if (!validateMapConfigV4(candidate).valid)
    return false;
  if (v.gameMaps.some((m: any) => m.published !== true || !m.difficulties.length || m.difficulties.some((d: any) => !d.enabledEntrances.length)))
    return false;
  const normalized = migrateEntranceFilters(candidate as MapConfigV4);
  const maps = new Map<string, any>(normalized.gameMaps.map(m => [m.id, m]));
  const ids = new Set<number>(), entries = new Set<string>();
  for (const l of v.layouts) {
    if (!obj(l) || !Number.isSafeInteger(l.id) || ids.has(l.id) || !['name', 'displayName', 'remarks'].every(k => typeof l[k] === 'string') || !Array.isArray(l.legacyNames) || !l.legacyNames.every((n: any) => typeof n === 'string') || !Number.isFinite(l.sort) || !obj(l.floorImages) || !asset(l.floorImages.full) || !Array.isArray(l.entrances) || !l.entrances.length)
      return false;
    ids.add(l.id);
    const map = maps.get(l.gameMapId) as PublicGameMapV6 | undefined, d = difficultyFor(map, l.mode);
    if (!map?.published || !d)
      return false;
    const floors = new Set(['full', ...d.floors.map(f => f.id)]), used = new Set();
    if (Object.entries(l.floorImages).some(([id, a]) => !floors.has(id) || !asset(a)))
      return false;
    for (const e of l.entrances) {
      const def = v.dictionaries.entrances.find((t: any) => t.id === e?.type);
      if (!obj(e) || typeof e.id !== 'string' || !e.id || entries.has(e.id) || used.has(e.type) || !d.enabledEntrances.includes(e.type) || !def || e.typeLabel !== def.name || !uri(e.imageUrl) || !uri(e.thumbUrl) || (e.filterValue !== undefined && !d.entranceFilters?.[e.type]?.filterOptions.some(f => !f.deletedAt && f.id === e.filterValue && f.name === e.filterLabel)))
        return false;
      if (e.filterValue === undefined && e.filterLabel !== undefined)
        return false;
      entries.add(e.id);
      used.add(e.type);
    }
    if (l.floorRegions !== undefined) {
      const r = l.floorRegions;
      if (!obj(r) || r.sourceUrl !== l.floorImages.full.url || !Number.isSafeInteger(r.imageWidth) || !Number.isSafeInteger(r.imageHeight) || r.imageWidth <= 0 || r.imageHeight <= 0 || !obj(r.regions))
        return false;
      if (Object.entries(r.regions).some(([id, rect]) => id === 'full' || !floors.has(id) || l.floorImages[id] || !validPixelRect(rect, r.imageWidth, r.imageHeight)))
        return false;
    }
  }
  return true;
}
// Client dictionaries are installed only after boundary validation. The server
// always passes its document explicitly and never uses this presentation state.
export const CLIENT_MODE_LABELS: Record<string, string> = { ...MODE_LABELS };
export const CLIENT_ENTRANCE_LABELS: Record<string, string> = { ...ENTRANCE_LABELS };
export function hydrateConfigV6(c: PublicMapConfigV6): PublicMapConfigV6 {
  const normalized = migrateEntranceFilters({ entranceTypes: c.dictionaries.entrances, gameMaps: c.gameMaps });
  c.dictionaries.entrances = normalized.entranceTypes;
  c.gameMaps = normalized.gameMaps;
  Object.keys(CLIENT_MODE_LABELS).forEach(k => delete CLIENT_MODE_LABELS[k]);
  Object.keys(CLIENT_ENTRANCE_LABELS).forEach(k => delete CLIENT_ENTRANCE_LABELS[k]);
  c.dictionaries.modes.forEach(d => CLIENT_MODE_LABELS[d.id] = d.name);
  c.dictionaries.entrances.forEach(d => CLIENT_ENTRANCE_LABELS[d.id] = d.name);
  const floors = new Map(c.gameMaps.flatMap(m => m.difficulties.map(d => [`${m.id}/${d.difficultyId}`, d.floors] as const)));
  for (const l of c.layouts)
    l.floorDefinitions = floors.get(`${l.gameMapId}/${l.mode}`);
  return c;
}
export function catalogFilterValuesV4(type: string, map: PublicGameMapV6 | undefined, mode: string): string[] {
  return sorted(entranceFilterFor(map, mode, type)?.filterOptions ?? []).filter(o => !o.archived && !o.deletedAt).map(o => o.id);
}
export function catalogFilterLabelV4(type: string, value: string, map: PublicGameMapV6 | undefined, mode: string): string {
  return entranceFilterFor(map, mode, type)?.filterOptions.find(o => o.id === value)?.name ?? value;
}
export function catalogFilterTitle(type: string, map: PublicGameMapV6 | undefined, mode: string): string {
  return entranceFilterFor(map, mode, type)?.filterLabel ?? '';
}
export function isCatalogFilterV4(type: string, value: unknown, map: PublicGameMapV6 | undefined, mode: string): value is string {
  return typeof value === 'string' && catalogFilterValuesV4(type, map, mode).includes(value);
}

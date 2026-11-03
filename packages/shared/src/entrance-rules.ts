import { ENABLED_ENTRANCES, ENTRANCE_TYPES, GAME_MODES, REQUIRED_ENTRANCES, type EntranceType, type EntranceV2, type GameMode } from "./map-v2";

export interface EntranceRule { allowed: EntranceType[]; enabled: EntranceType[] }
export type EntranceRules = Record<GameMode, EntranceRule>;
export interface EntranceMap {
  entranceRules?: EntranceRules;
  enabledEntrances?: Record<GameMode, EntranceType[]>;
  modeVisibility?: Record<GameMode, boolean>;
}

/** Fresh arrays on every migration; explicit empty lists never receive defaults. */
export function legacyEntranceRules(): EntranceRules {
  return Object.fromEntries(GAME_MODES.map(mode => [mode, {
    allowed: [...REQUIRED_ENTRANCES[mode]], enabled: [...ENABLED_ENTRANCES[mode]],
  }])) as EntranceRules;
}
export function configuredEntranceTypes(map: EntranceMap | undefined, mode: GameMode): readonly EntranceType[] {
  if (!map) return [];
  return map.entranceRules?.[mode].enabled ?? map.enabledEntrances?.[mode] ?? ENABLED_ENTRANCES[mode];
}
export function isModeVisible(map: EntranceMap | undefined, mode: GameMode): boolean {
  return !!map && (map.modeVisibility?.[mode] ?? configuredEntranceTypes(map, mode).length > 0);
}
export function enabledEntranceTypes(map: EntranceMap | undefined, mode: GameMode): readonly EntranceType[] {
  return isModeVisible(map, mode) ? configuredEntranceTypes(map, mode) : [];
}
export function allowedEntranceTypes(map: EntranceMap | undefined, mode: GameMode): readonly EntranceType[] {
  if (!map) return [];
  return map.entranceRules?.[mode].allowed ?? REQUIRED_ENTRANCES[mode];
}
export function availableModes(map: EntranceMap | undefined): GameMode[] {
  return GAME_MODES.filter(mode => enabledEntranceTypes(map, mode).length > 0);
}
export function defaultEntrance(map: EntranceMap | undefined, mode: GameMode): EntranceType | undefined {
  return enabledEntranceTypes(map, mode)[0];
}
export function completeEntrance(entrance: EntranceV2): boolean {
  return !!entrance.direction && !!entrance.image;
}
export function publicEntrance(entrance: EntranceV2, map: EntranceMap, mode: GameMode): boolean {
  return enabledEntranceTypes(map, mode).includes(entrance.type) && completeEntrance(entrance);
}
export function entranceRulesErrors(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["入口配置无效"];
  const rules = value as EntranceRules;
  const errors: string[] = [];
  if (Object.keys(rules).some(mode => !GAME_MODES.includes(mode as GameMode))) errors.push("入口配置包含未知难度");
  for (const mode of GAME_MODES) {
    const rule = rules[mode];
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) { errors.push(`${mode} 入口配置缺失`); continue; }
    for (const field of ["allowed", "enabled"] as const) {
      const types = rule[field];
      if (!Array.isArray(types) || types.some(type => !ENTRANCE_TYPES.includes(type)) || new Set(types).size !== types.length)
        errors.push(`${mode} ${field} 入口类型无效或重复`);
    }
    if (Array.isArray(rule.allowed) && Array.isArray(rule.enabled) && rule.enabled.some(type => !rule.allowed.includes(type)))
      errors.push(`${mode} 开放入口必须允许录入`);
  }
  return errors;
}

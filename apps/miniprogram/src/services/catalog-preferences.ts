import { DEFAULT_GAME_MAP_ID, defaultEntrance, availableModes, enabledEntranceTypes, isEntranceType,
  type PublicGameMap, type GameMode, type EntranceType } from "@idv-map/shared/dynamic";

export interface CatalogConditions { gameMapId: string; mode: GameMode; entrance: EntranceType }
const key = "idv-catalog-conditions";

export function createCatalogPreferences(storage: { get(key: string): unknown; set(key: string, value: string): void }) {
  return {
    read(maps: PublicGameMap[]): CatalogConditions | undefined {
      maps = maps.filter(map => availableModes(map).length);
      if (!maps.length) return undefined;
      let saved: Record<string, unknown> = {};
      try {
        const raw = storage.get(key);
        const value: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (value && typeof value === "object" && !Array.isArray(value)) saved = value as Record<string, unknown>;
      } catch { /* Storage is optional; use published defaults. */ }
      const map = maps.find(m => m.id === saved.gameMapId) ?? maps.find(m => m.id === DEFAULT_GAME_MAP_ID) ?? maps[0]!;
      const modes = availableModes(map);
      const mode = modes.find(mode => mode === saved.mode) ?? modes[0]!;
      const entrance = isEntranceType(saved.entrance) && enabledEntranceTypes(map, mode).includes(saved.entrance)
        ? saved.entrance : defaultEntrance(map, mode)!;
      return { gameMapId: map.id, mode, entrance };
    },
    remember(conditions: CatalogConditions) {
      try { storage.set(key, JSON.stringify(conditions)); } catch { /* Keep the current session usable. */ }
    },
  };
}

export const catalogPreferences = createCatalogPreferences({
  get: key => uni.getStorageSync(key), set: (key, value) => uni.setStorageSync(key, value),
});

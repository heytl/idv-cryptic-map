import { DEFAULT_GAME_MAP_ID, defaultEntranceV2, isGameMode, isEntranceType, isEnabledEntranceV2,
  type GameMap, type GameMode, type EntranceType } from "@idv-map/shared";

export interface CatalogConditions { gameMapId: string; mode: GameMode; entrance: EntranceType }
const key = "idv-catalog-conditions";

export function createCatalogPreferences(storage: { get(key: string): unknown; set(key: string, value: string): void }) {
  return {
    read(maps: Pick<GameMap, "id">[]): CatalogConditions | undefined {
      if (!maps.length) return undefined;
      let saved: Record<string, unknown> = {};
      try {
        const raw = storage.get(key);
        const value: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (value && typeof value === "object" && !Array.isArray(value)) saved = value as Record<string, unknown>;
      } catch { /* Storage is optional; use published defaults. */ }
      const map = maps.find(m => m.id === saved.gameMapId) ?? maps.find(m => m.id === DEFAULT_GAME_MAP_ID) ?? maps[0]!;
      const mode = isGameMode(saved.mode) ? saved.mode : "hard";
      const entrance = isEntranceType(saved.entrance) && isEnabledEntranceV2(mode, saved.entrance)
        ? saved.entrance : defaultEntranceV2(mode);
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

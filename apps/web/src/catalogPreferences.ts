import { DEFAULT_GAME_MAP_ID, availableModes, enabledEntranceTypes, type PublicGameMap, type EntranceType } from "@idv-map/shared";

const KEY = "idv-catalog-conditions";
export function rememberCatalog(gameMapId: string, mode: string, entrance: string) {
  try { localStorage.setItem(KEY, JSON.stringify({ gameMapId, mode, entrance })); } catch { /* Device preference is optional. */ }
}
export function preferredCatalogPath(maps: (Pick<PublicGameMap, "id"> & Partial<PublicGameMap>)[]): string | undefined {
  maps = maps.filter(map => availableModes(map).length);
  if (!maps.length) return undefined;
  let saved: Record<string, unknown> = {};
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (value && typeof value === "object") saved = value as Record<string, unknown>;
  } catch { /* Fall back if storage is unavailable or invalid. */ }
  const map = maps.find(m => m.id === saved.gameMapId) ?? maps.find(m => m.id === DEFAULT_GAME_MAP_ID) ?? maps[0]!;
  const modes = availableModes(map);
  const mode = modes.find(mode => mode === saved.mode) ?? modes[0]!;
  const allowed = enabledEntranceTypes(map, mode);
  const entrance = allowed.includes(saved.entrance as EntranceType) ? saved.entrance : allowed[0];
  return `/maps/${map.id}/${mode}/${entrance}`;
}

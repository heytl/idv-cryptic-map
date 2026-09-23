import type {
  RouteLocationNormalized,
  RouteLocationGeneric,
  RouteRecordRaw,
} from "vue-router";
import { DEFAULT_GAME_MAP_ID } from "@idv-map/shared";
import CatalogV2View from "./views/CatalogV2View.vue";
import StrategyV2View from "./views/StrategyV2View.vue";
import { preferredCatalogPath } from "./catalogPreferences";
import GameMapsView from "./views/GameMapsView.vue";
import {
  availableFloors,
  defaultEntranceV2,
  ensureMapsV2,
  findEntranceV2,
  findMapV2,
  gameMaps,
  isCatalogFilterV2,
  isEnabledEntranceV2,
  isEntranceType,
  isGameMode,
} from "./data/maps-v2";

export async function normalizeV2Route(to: RouteLocationNormalized) {
  if (!["game-maps", "catalog-v2", "map-v2"].includes(String(to.name)))
    return true;
  await ensureMapsV2();
  if (to.name === "game-maps") {
    const path = preferredCatalogPath(gameMaps);
    return path ? { path, replace: true } : true;
  }
  const gameMapId = String(to.params.gameMapId);
  if (!gameMaps.some((m) => m.id === gameMapId))
    return { path: "/maps", replace: true };
  const mode = to.params.mode;
  if (!isGameMode(mode))
    return { path: `/maps/${gameMapId}/hard/side`, replace: true };
  const requested = to.params.entrance;
  const entrance =
    isEntranceType(requested) && isEnabledEntranceV2(mode, requested)
      ? requested
      : defaultEntranceV2(mode);
  const base = `/maps/${gameMapId}/${mode}/${entrance}`;
  if (to.name === "catalog-v2") {
    const filter = to.params.filter;
    const path =
      base +
      (filter && isCatalogFilterV2(entrance, filter) ? `/${filter}` : "");
    return to.path === path ? true : { path, replace: true };
  }
  const layout = findMapV2(Number(to.params.layoutId), mode, gameMapId);
  if (!layout || !findEntranceV2(layout, entrance))
    return { path: base, replace: true };
  const floor = String(to.params.floor || "full");
  const validFloor = availableFloors(layout).find((f) => f === floor) || "full";
  const path = `${base}/layout/${layout.id}${validFloor === "full" ? "" : `/${validFloor}`}`;
  return path === to.path ? true : { path, replace: true };
}
const oldCatalog = (to: RouteLocationGeneric) =>
  `/maps/${DEFAULT_GAME_MAP_ID}/${to.params.mode}/${to.params.entrance}${to.params.filter ? `/${to.params.filter}` : ""}`;
const oldLayout = (to: RouteLocationGeneric) =>
  `/maps/${DEFAULT_GAME_MAP_ID}/${to.params.mode}/${to.params.entrance}/layout/${to.params.id}${to.params.floor ? `/${to.params.floor}` : ""}`;
export const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/maps" },
  { path: "/maps", name: "game-maps", component: GameMapsView },
  {
    path: "/maps/:gameMapId/:mode/:entrance/layout/:layoutId/:floor?",
    name: "map-v2",
    component: StrategyV2View,
  },
  {
    path: "/maps/:gameMapId/:mode/:entrance/:filter?",
    name: "catalog-v2",
    component: CatalogV2View,
  },
  {
    path: "/:mode(hard|nightmare)/:entrance/map/:id/:floor?",
    redirect: oldLayout,
  },
  { path: "/:mode(hard|nightmare)/:entrance/:filter?", redirect: oldCatalog },
  { path: "/v2/:mode/:entrance/map/:id/:floor?", redirect: oldLayout },
  { path: "/v2/:mode/:entrance/:filter?", redirect: oldCatalog },
  { path: "/v2", redirect: `/maps/${DEFAULT_GAME_MAP_ID}/hard/side` },
  { path: "/:pathMatch(.*)*", redirect: "/maps" },
];

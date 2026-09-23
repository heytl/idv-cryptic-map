import { createRouter, createWebHashHistory } from "vue-router";
import { normalizeV2Route, routes } from "./routes";
import { findEntranceV2, findMapV2 } from "./data/maps-v2";
import { rememberCatalog } from "./catalogPreferences";
import { createVisitTracker } from "./telemetry";
import type { EntranceType } from "@idv-map/shared";

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }
    return { top: 0, left: 0 };
  },
});

router.beforeEach(normalizeV2Route);

const tracker = createVisitTracker(
  (event) => {
    if (import.meta.env.VITE_MAP_API_BASE_URL) return; // Mirrors are outside the initial scope.
    void fetch("/telemetry/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
    }).catch(() => undefined);
  },
  () => crypto.randomUUID(),
);
function trackVisit() {
  const route = router.currentRoute.value;
  const layout =
    route.name === "map-v2"
      ? findMapV2(Number(route.params.layoutId))
      : undefined;
  const entrance = layout
    ? findEntranceV2(layout, route.params.entrance as EntranceType)
    : undefined;
  tracker.navigate(
    layout && entrance
      ? {
          gameMapId: layout.gameMapId,
          layoutId: layout.id,
          entranceId: entrance.id,
        }
      : null,
    document.visibilityState === "visible",
    navigator.onLine,
  );
}
router.afterEach((to, _from, failure) => {
  if (!failure) {
    if (to.name === "catalog-v2") rememberCatalog(String(to.params.gameMapId), String(to.params.mode), String(to.params.entrance));
    trackVisit();
  }
});
document.addEventListener("visibilitychange", trackVisit);

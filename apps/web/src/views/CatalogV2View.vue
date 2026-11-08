<script setup lang="ts">
import {
  catalogFilterTitle,
  type EntranceType,
  type GameMode,
} from "@idv-map/shared/dynamic";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import CatalogConditions from "../components/CatalogConditions.vue";
import DensitySwitch from "../components/DensitySwitch.vue";
import MapCardV2 from "../components/MapCardV2.vue";
import { useDensity } from "../composables/useDensity";
import {
  catalogFilterLabelV2,
  catalogFilterValuesV2,
  entranceFilterValueV2,
  findEntranceV2,
  isCatalogFilterV2,
  mapsV2,
  gameMaps,
  mapsV2Error,
  type CatalogFilterV2,
} from "../data/maps-v2";

const route = useRoute();
const router = useRouter();
const { compact } = useDensity();

const gameMapId = computed(() => route.params.gameMapId as string);
const mode = computed(() => route.params.mode as GameMode);
const entranceType = computed(() => route.params.entrance as EntranceType);
const activeFilter = computed(
  () => (route.params.filter as CatalogFilterV2 | undefined) || "all",
);
const gameMap = computed(() => gameMaps.find(m => m.id === gameMapId.value));

const filterTitle = computed(() =>
  catalogFilterTitle(entranceType.value, gameMap.value, mode.value),
);
const filterOptions = computed(() =>
  catalogFilterValuesV2(entranceType.value, gameMap.value, mode.value).map((value) => ({
    value,
    label: catalogFilterLabelV2(entranceType.value, value, gameMap.value, mode.value),
  })),
);
const catalogCards = computed(() =>
  mapsV2
    .filter(
      (map) => map.mode === mode.value && map.gameMapId === gameMapId.value,
    )
    .flatMap((map) => {
      const entrance = findEntranceV2(map, entranceType.value);
      return entrance ? [{ map, entrance }] : [];
    }),
);
const cards = computed(() => activeFilter.value === "all"
  ? catalogCards.value
  : catalogCards.value.filter(({ entrance }) => entranceFilterValueV2(entrance) === activeFilter.value));
const filterCounts = computed(() => {
  const counts = new Map<string, number>([["all", catalogCards.value.length]]);
  for (const { entrance } of catalogCards.value) {
    const value = entranceFilterValueV2(entrance);
    if (value !== undefined) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
});

const filterButtons = ref<HTMLElement | null>(null);
const filterMinWidth = ref("3.5rem");
let widthObserver: ResizeObserver | undefined;

function measureFilterWidth() {
  const group = filterButtons.value;
  if (!group || !window.matchMedia("(max-width: 768px)").matches) return;
  const counter = group.querySelector<HTMLElement>(".tab-count-num");
  if (!counter) return;

  // Measure complete labels with their own counts, even when not selected.
  // Hidden probes are removed before painting and never enter the grid flow.
  const probes = Array.from(group.querySelectorAll<HTMLButtonElement>(":scope > button"), button => {
    const probe = button.cloneNode(true) as HTMLButtonElement;
    probe.setAttribute("aria-hidden", "true");
    probe.tabIndex = -1;
    probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;white-space:nowrap;width:max-content;min-width:max-content;max-width:none;transform:none";
    probe.querySelector<HTMLElement>(".filter-option-label")!.style.whiteSpace = "nowrap";
    const count = probe.querySelector<HTMLElement>(".tab-count-num") ?? probe.appendChild(counter.cloneNode(true)) as HTMLElement;
    count.textContent = `(${filterCounts.value.get(button.dataset.filter ?? "all") ?? 0})`;
    return probe;
  });
  group.append(...probes);
  try {
    const width = Math.ceil(Math.max(56, ...probes.map(probe => probe.getBoundingClientRect().width))) + 1;
    filterMinWidth.value = `${width}px`;
  } finally {
    probes.forEach(probe => probe.remove());
  }
}

watch(filterButtons, group => {
  widthObserver?.disconnect();
  if (!group) return;
  let previousWidth = -1;
  widthObserver = new ResizeObserver(([entry]) => {
    if (entry && entry.contentRect.width !== previousWidth) {
      previousWidth = entry.contentRect.width;
      measureFilterWidth();
    }
  });
  widthObserver.observe(group);
  measureFilterWidth();
}, { flush: "post" });
watch([filterOptions, filterCounts], measureFilterWidth, { flush: "post" });
onMounted(() => {
  void document.fonts?.ready.then(measureFilterWidth);
  document.fonts?.addEventListener("loadingdone", measureFilterWidth);
});
onUnmounted(() => {
  widthObserver?.disconnect();
  document.fonts?.removeEventListener("loadingdone", measureFilterWidth);
});

function navigate(
  nextMode: GameMode,
  nextEntrance: EntranceType,
  nextFilter: CatalogFilterV2 | "all" = "all",
) {
  router.replace(
    `/maps/${gameMapId.value}/${nextMode}/${nextEntrance}${nextFilter === "all" ? "" : `/${nextFilter}`}`,
  );
}

function applyConditions(nextMapId: string, nextMode: GameMode, nextEntrance: EntranceType) {
  const unchanged = nextMapId === gameMapId.value && nextMode === mode.value && nextEntrance === entranceType.value;
  const filter = unchanged && isCatalogFilterV2(nextEntrance, activeFilter.value, gameMap.value, mode.value) ? activeFilter.value : "all";
  router.replace(`/maps/${nextMapId}/${nextMode}/${nextEntrance}${filter === "all" ? "" : `/${filter}`}`);
}
</script>

<template>
  <main id="catalog-v2-view" class="view-panel active">
    <div class="parchment-card">
      <div class="card-inner">
        <div class="catalog-controls">
        <CatalogConditions :game-map-id="gameMapId" :mode="mode" :entrance="entranceType" @apply="applyConditions" />
        <div class="v2-filter-toolbar catalog-layout-toolbar" aria-label="地图筛选">
          <div
            v-if="filterOptions.length" class="v2-filter-segment v2-direction-filter"
            role="group"
            :aria-label="filterTitle"
          >
            <span class="v2-filter-label">{{ filterTitle }}</span>
            <div
              ref="filterButtons"
              class="v2-segment-buttons v2-direction-buttons"
              :style="{ '--filter-min-width': filterMinWidth }"
            >
              <button
                data-filter="all"
                class="tab-btn"
                :class="{ active: activeFilter === 'all' }"
                :aria-pressed="activeFilter === 'all'"
                @click="navigate(mode, entranceType)"
              >
                <span class="filter-option-label">全部</span><span
                  v-if="activeFilter === 'all'" class="tab-count-num"
                >({{ cards.length }})</span>
              </button>
              <button
                v-for="item in filterOptions"
                :key="item.value"
                :data-filter="item.value"
                class="tab-btn"
                :class="{ active: activeFilter === item.value }"
                :aria-pressed="activeFilter === item.value"
                @click="navigate(mode, entranceType, item.value)"
              >
                <span class="filter-option-label">{{ item.label }}</span><span
                  v-if="activeFilter === item.value"
                  class="tab-count-num"
                >({{ cards.length }})</span>
              </button>
            </div>
          </div>

        </div>
          <DensitySwitch v-model="compact" />
        </div>

        <div class="entry-grid" :class="{ compact }">
          <MapCardV2
            v-for="card in cards"
            :key="card.entrance.id"
            :map="card.map"
            :entrance="card.entrance"
          />
        </div>
        <p v-if="cards.length === 0" class="v2-empty">
          {{ mapsV2Error || "当前筛选下暂无已发布布局。" }}
        </p>
      </div>
    </div>
  </main>
</template>

<style scoped>
.catalog-controls { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 10px; row-gap: 6px; margin-bottom: 12px; }
.catalog-controls :deep(.catalog-conditions) { grid-column: 1; grid-row: 1; min-width: 0; }
.catalog-controls :deep(.density-switch) { position: relative; top: auto; right: auto; transform: none; grid-column: 2; grid-row: 1; }
.catalog-layout-toolbar { grid-column: 1 / -1; grid-row: 2; display: flex; justify-content: space-between; min-height: 0; margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; backdrop-filter: none; }
.catalog-layout-toolbar .v2-direction-filter { flex: 1; min-width: 0; align-items: flex-start; }
.catalog-layout-toolbar .v2-filter-label { padding-top: 10px; }
.catalog-layout-toolbar .v2-direction-buttons { flex: 1; min-width: 0; flex-wrap: wrap; }
.catalog-layout-toolbar .v2-direction-buttons .tab-btn { flex: 0 1 auto; min-width: 0; max-width: 100%; white-space: normal; overflow-wrap: anywhere; line-height: 1.4; }
@media (max-width: 768px) {
  .catalog-controls { column-gap: 6px; row-gap: 4px; margin-bottom: 10px; }
  .catalog-layout-toolbar .v2-direction-buttons { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--filter-min-width)), 1fr)); align-items: stretch; gap: 6px; }
  .catalog-layout-toolbar .v2-direction-buttons .tab-btn { min-height: 36px; padding: 6px 4px; }
  .catalog-layout-toolbar .filter-option-label { display: inline-block; max-width: 100%; vertical-align: middle; }
  .catalog-layout-toolbar .tab-count-num { display: inline-block; white-space: nowrap; vertical-align: middle; }
}
</style>

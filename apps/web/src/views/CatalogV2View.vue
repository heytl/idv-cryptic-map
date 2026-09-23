<script setup lang="ts">
import {
  type EntranceType,
  type GameMode,
} from "@idv-map/shared";
import { computed } from "vue";
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

const filterTitle = computed(() =>
  entranceType.value === "front" ? "通道" : "方向",
);
const filterOptions = computed(() =>
  catalogFilterValuesV2(entranceType.value).map((value) => ({
    value,
    label: catalogFilterLabelV2(entranceType.value, value),
  })),
);

const cards = computed(() =>
  mapsV2
    .filter(
      (map) => map.mode === mode.value && map.gameMapId === gameMapId.value,
    )
    .flatMap((map) => {
      const entrance = findEntranceV2(map, entranceType.value);
      if (
        !entrance ||
        (activeFilter.value !== "all" &&
          entranceFilterValueV2(entrance) !== activeFilter.value)
      )
        return [];
      return [{ map, entrance }];
    }),
);

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
  const filter = isCatalogFilterV2(nextEntrance, activeFilter.value) ? activeFilter.value : "all";
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
            class="v2-filter-segment v2-direction-filter"
            role="group"
            :aria-label="filterTitle"
          >
            <span class="v2-filter-label">{{ filterTitle }}</span>
            <div class="v2-segment-buttons v2-direction-buttons">
              <button
                class="tab-btn"
                :class="{ active: activeFilter === 'all' }"
                :aria-pressed="activeFilter === 'all'"
                @click="navigate(mode, entranceType)"
              >
                全部<span v-if="activeFilter === 'all'" class="tab-count-num">
                  ({{ cards.length }})</span
                >
              </button>
              <button
                v-for="item in filterOptions"
                :key="item.value"
                class="tab-btn"
                :class="{ active: activeFilter === item.value }"
                :aria-pressed="activeFilter === item.value"
                @click="navigate(mode, entranceType, item.value)"
              >
                {{ item.label
                }}<span
                  v-if="activeFilter === item.value"
                  class="tab-count-num"
                >
                  ({{ cards.length }})</span
                >
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
.catalog-controls :deep(.catalog-conditions) { grid-column: 1 / -1; min-width: 0; }
.catalog-controls :deep(.density-switch) { position: relative; top: auto; right: auto; transform: none; grid-column: 2; grid-row: 2; }
.catalog-layout-toolbar { grid-column: 1; grid-row: 2; justify-content: space-between; min-height: 0; margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; backdrop-filter: none; }
.catalog-layout-toolbar .v2-direction-filter { flex: 1; min-width: 0; }
@media (min-width: 1200px) {
  .catalog-controls { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); row-gap: 0; }
  .catalog-controls :deep(.catalog-conditions) { grid-column: 2; grid-row: 1; }
  .catalog-controls :deep(.density-switch) { grid-column: 3; grid-row: 1; justify-self: end; }
  .catalog-layout-toolbar { grid-column: 1; grid-row: 1; }
}
@media (max-width: 768px) {
  .catalog-controls { column-gap: 6px; row-gap: 4px; margin-bottom: 10px; }
  .catalog-controls :deep(.catalog-conditions) { grid-column: 1; grid-row: 1; }
  .catalog-controls :deep(.density-switch) { grid-row: 1; }
  .catalog-layout-toolbar { grid-column: 1 / -1; display: flex; }
  .catalog-layout-toolbar .v2-direction-filter { flex: 1; }
}
</style>

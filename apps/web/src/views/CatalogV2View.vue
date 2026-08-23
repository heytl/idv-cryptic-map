<script setup lang="ts">
import {
  ENTRANCE_LABELS,
  MODE_LABELS,
  type EntranceType,
  type GameMode,
} from '@idv-map/shared';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DensitySwitch from '../components/DensitySwitch.vue';
import MapCardV2 from '../components/MapCardV2.vue';
import { useDensity } from '../composables/useDensity';
import {
  catalogFilterLabelV2,
  catalogFilterValuesV2,
  defaultEntranceV2,
  enabledEntranceTypesV2,
  entranceFilterValueV2,
  findEntranceV2,
  mapsV2,
  mapsV2Error,
  type CatalogFilterV2,
} from '../data/maps-v2';

const route = useRoute();
const router = useRouter();
const { compact } = useDensity();

const mode = computed(() => route.params.mode as GameMode);
const entranceType = computed(() => route.params.entrance as EntranceType);
const activeFilter = computed(() => (route.params.filter as CatalogFilterV2 | undefined) || 'all');

const allowedEntrances = computed(() => enabledEntranceTypesV2(mode.value));
const filterTitle = computed(() => entranceType.value === 'front' ? '通道' : '方向');
const filterOptions = computed(() => catalogFilterValuesV2(entranceType.value).map((value) => ({
  value,
  label: catalogFilterLabelV2(entranceType.value, value),
})));

const cards = computed(() => mapsV2
  .filter((map) => map.mode === mode.value)
  .flatMap((map) => {
    const entrance = findEntranceV2(map, entranceType.value);
    if (!entrance || (activeFilter.value !== 'all' && entranceFilterValueV2(entrance) !== activeFilter.value)) return [];
    return [{ map, entrance }];
  }));

function navigate(nextMode: GameMode, nextEntrance: EntranceType, nextFilter: CatalogFilterV2 | 'all' = 'all') {
  router.replace(`/${nextMode}/${nextEntrance}${nextFilter === 'all' ? '' : `/${nextFilter}`}`);
}

function setMode(nextMode: GameMode) {
  const enabled = enabledEntranceTypesV2(nextMode);
  const nextEntrance = enabled.includes(entranceType.value) ? entranceType.value : defaultEntranceV2(nextMode);
  navigate(nextMode, nextEntrance);
}

function onModeChange(event: Event) {
  setMode((event.target as HTMLSelectElement).value as GameMode);
}

function onEntranceChange(event: Event) {
  navigate(mode.value, (event.target as HTMLSelectElement).value as EntranceType);
}
</script>

<template>
  <main id="catalog-v2-view" class="view-panel active">
    <div class="parchment-card">
      <div class="card-inner">
        <div class="v2-filter-toolbar" aria-label="地图筛选">
          <div class="v2-filter-segment v2-filter-desktop" role="group" aria-label="模式">
            <span class="v2-filter-label">模式</span>
            <div class="v2-segment-buttons">
              <button v-for="item in (['hard', 'nightmare'] as const)" :key="item" class="tab-btn" :class="{ active: mode === item }" :aria-pressed="mode === item" @click="setMode(item)">
                {{ MODE_LABELS[item] }}
              </button>
            </div>
          </div>

          <label class="v2-filter-mobile v2-compact-select mode-select">
            <span class="sr-only">模式</span>
            <select :value="mode" aria-label="模式" @change="onModeChange">
              <option v-for="item in (['hard', 'nightmare'] as const)" :key="item" :value="item">{{ MODE_LABELS[item] }}</option>
            </select>
          </label>

          <span class="v2-filter-divider v2-mode-divider" aria-hidden="true"></span>

          <div class="v2-filter-segment v2-filter-desktop" role="group" aria-label="入口">
            <span class="v2-filter-label">入口</span>
            <div class="v2-segment-buttons">
              <button v-for="item in allowedEntrances" :key="item" class="tab-btn" :class="{ active: entranceType === item }" :aria-pressed="entranceType === item" @click="navigate(mode, item)">
                {{ ENTRANCE_LABELS[item] }}
              </button>
            </div>
          </div>

          <label class="v2-filter-mobile v2-compact-select entrance-select">
            <span class="sr-only">入口</span>
            <select :value="entranceType" aria-label="入口" @change="onEntranceChange">
              <option v-for="item in allowedEntrances" :key="item" :value="item">{{ ENTRANCE_LABELS[item] }}</option>
            </select>
          </label>

          <span class="v2-filter-divider v2-direction-divider" aria-hidden="true"></span>

          <div class="v2-filter-segment v2-direction-filter" role="group" :aria-label="filterTitle">
            <span class="v2-filter-label">{{ filterTitle }}</span>
            <div class="v2-segment-buttons v2-direction-buttons">
              <button class="tab-btn" :class="{ active: activeFilter === 'all' }" :aria-pressed="activeFilter === 'all'" @click="navigate(mode, entranceType)">
                全部<span v-if="activeFilter === 'all'" class="tab-count-num"> ({{ cards.length }})</span>
              </button>
              <button v-for="item in filterOptions" :key="item.value" class="tab-btn" :class="{ active: activeFilter === item.value }" :aria-pressed="activeFilter === item.value" @click="navigate(mode, entranceType, item.value)">
                {{ item.label }}<span v-if="activeFilter === item.value" class="tab-count-num"> ({{ cards.length }})</span>
              </button>
            </div>
          </div>

          <DensitySwitch v-model="compact" />
        </div>

        <div class="entry-grid" :class="{ compact }">
          <MapCardV2 v-for="card in cards" :key="card.entrance.id" :map="card.map" :entrance="card.entrance" />
        </div>
        <p v-if="cards.length === 0" class="v2-empty">{{ mapsV2Error || '当前筛选下暂无已发布地图。' }}</p>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { DEFAULT_FLOOR, ENTRANCE_LABELS, type EntranceType, type FloorType, type GameMode } from '@idv-map/shared';
import { computed, onUnmounted, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import FloorSwitchV2 from '../components/FloorSwitchV2.vue';
import LegendBox from '../components/LegendBox.vue';
import MapViewport from '../components/MapViewport.vue';
import { BASE_TITLE } from '../constants';
import { availableFloors, enabledEntranceTypesV2, entranceFilterLabelV2, findEntranceV2, findMapV2 } from '../data/maps-v2';
import { navState } from '../navState';

const route = useRoute();
const router = useRouter();
const mode = computed(() => route.params.mode as GameMode);
const entranceType = computed(() => route.params.entrance as EntranceType);
const map = computed(() => findMapV2(Number(route.params.id), mode.value));
const entrance = computed(() => map.value ? findEntranceV2(map.value, entranceType.value) : undefined);
const enabledEntrances = computed(() => {
  const enabled = enabledEntranceTypesV2(mode.value);
  return map.value?.entrances.filter((item) => enabled.includes(item.type)) ?? [];
});
const floors = computed(() => map.value ? availableFloors(map.value) : [DEFAULT_FLOOR]);
const floor = computed<FloorType>(() => {
  const requested = route.params.floor as FloorType | undefined;
  return requested && floors.value.includes(requested) ? requested : DEFAULT_FLOOR;
});
const imageUrl = computed(() => map.value?.layout[floor.value]?.url ?? '');

watchEffect(() => {
  if (route.name === 'map-v2' && (!map.value || !entrance.value)) router.replace('/');
  if (map.value) document.title = `${map.value.displayName} | ${BASE_TITLE}`;
});
onUnmounted(() => { document.title = BASE_TITLE; });

function setFloor(next: FloorType) {
  const base = `/${mode.value}/${entranceType.value}/map/${map.value!.id}`;
  router.replace(next === DEFAULT_FLOOR ? base : `${base}/${next}`);
}

function setEntrance(next: EntranceType) {
  router.replace(`/${mode.value}/${next}/map/${map.value!.id}${floor.value === DEFAULT_FLOOR ? '' : `/${floor.value}`}`);
}

function goBack() {
  if (navState.enteredFromCatalog) router.back();
  else router.push(`/${mode.value}/${entranceType.value}`);
}
</script>

<template>
  <main v-if="map && entrance" id="strategy-v2-view" class="view-panel active">
    <div class="control-bar">
      <button class="gothic-btn btn-back" @click="goBack">返回手记目录</button>
      <div class="map-title-container">
        <h2 class="map-title">{{ map.displayName }}</h2>
        <span class="map-direction-badge">{{ entrance.typeLabel }} · {{ entranceFilterLabelV2(entrance) }}</span>
      </div>
      <div class="floor-toggle-wrapper">
        <span class="toggle-label">楼层切换:</span>
        <FloorSwitchV2 :floor="floor" :floors="floors" @change="setFloor" />
      </div>
    </div>

    <div class="detail-container">
      <section class="info-sidebar">
        <div class="parchment-card tight">
          <div class="card-inner">
            <h3 class="sidebar-title">{{ entrance.typeLabel }}入口参考</h3>
            <div class="entry-img-container">
              <img :src="entrance.imageUrl" :alt="`${entrance.typeLabel}入口图`">
              <div class="scan-line"></div>
            </div>
            <div class="sidebar-info-box">
              <div class="info-item">
                <span class="label">{{ entrance.type === 'front' ? '通道类型:' : '入口方向:' }}</span>
                <span class="value">{{ entranceFilterLabelV2(entrance) }}</span>
              </div>
              <div class="info-item"><span class="label">特征备注:</span><span class="value handwriting">{{ map.remarks }}</span></div>
            </div>
            <div class="v2-entrance-switch">
              <button v-for="item in enabledEntrances" :key="item.id" class="tab-btn" :class="{ active: item.type === entranceType }" @click="setEntrance(item.type)">
                {{ ENTRANCE_LABELS[item.type] }}
              </button>
            </div>
            <LegendBox />
          </div>
        </div>
      </section>

      <section class="map-main-panel">
        <div class="parchment-card tight map-card">
          <div class="card-inner">
            <MapViewport :image-url="imageUrl" />
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onUnmounted, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { findMapByName } from '../data/maps';
import { BASE_TITLE } from '../constants';
import { navState } from '../navState';
import FloorSwitch, { type Floor } from '../components/FloorSwitch.vue';
import LegendBox from '../components/LegendBox.vue';
import MapViewport from '../components/MapViewport.vue';

const route = useRoute();
const router = useRouter();

// 首次进入由路由守卫保证地图存在；同记录内参数变化守卫不重跑，这里兜底回目录
const map = computed(() => findMapByName(route.params.name as string));
watchEffect(() => {
  if (route.name === 'map' && !map.value) {
    router.replace('/');
  }
});

// 楼层段非 1/2 时按全图处理（与旧站 parseRoute 行为一致）
const floor = computed<Floor>(() => {
  const f = route.params.floor;
  return f === '1' || f === '2' ? f : 'full';
});

watchEffect(() => {
  if (map.value) {
    document.title = `${map.value.displayName} | ${BASE_TITLE}`;
  }
});
onUnmounted(() => {
  document.title = BASE_TITLE;
});

// 楼层切换 replace 更新 hash 楼层段，返回键仍一步回目录（与旧站一致）
function setFloor(f: Floor) {
  router.replace(`/map/${route.params.name as string}${f === 'full' ? '' : `/${f}`}`);
}

function goBack() {
  if (navState.enteredFromCatalog) {
    router.back();
  } else {
    router.push('/');
  }
}
</script>

<template>
  <main v-if="map" id="strategy-view" class="view-panel active">
    <!-- 顶部控制条 -->
    <div class="control-bar">
      <button id="back-btn" class="gothic-btn btn-back" @click="goBack">
        <span class="btn-texture"></span> 返回手记目录
      </button>

      <div class="map-title-container">
        <h2 id="current-map-name" class="map-title">{{ map.displayName }}</h2>
        <span id="current-map-direction" class="map-direction-badge">{{ map.direction }}侧入口</span>
      </div>

      <!-- 一楼二楼切换器 (复古手感拉杆拉动样式) -->
      <div class="floor-toggle-wrapper">
        <span class="toggle-label">楼层切换:</span>
        <FloorSwitch :floor="floor" @change="setFloor" />
      </div>
    </div>

    <div class="detail-container">
      <!-- 左侧/参考面板: 侧门结构 -->
      <section class="info-sidebar">
        <div class="parchment-card tight">
          <div class="card-inner">
            <h3 class="sidebar-title">侧门入口参考</h3>
            <div class="entry-img-container">
              <img id="ref-entry-img" :src="map.entryImg" alt="侧门入口图">
              <div class="scan-line"></div>
            </div>
            <div class="sidebar-info-box">
              <div class="info-item">
                <span class="label">入口方向:</span>
                <span id="info-direction" class="value">{{ map.direction }}侧门</span>
              </div>
              <div class="info-item">
                <span class="label">特征备注:</span>
                <span id="info-remarks" class="value handwriting">{{ map.remarks }}</span>
              </div>
            </div>
            <LegendBox />
          </div>
        </div>
      </section>

      <!-- 右侧：地图交互面板 -->
      <section class="map-main-panel">
        <div class="parchment-card tight map-card">
          <div class="card-inner">
            <MapViewport :map="map" :floor="floor" />
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

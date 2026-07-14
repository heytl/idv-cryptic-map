<script setup lang="ts">
// Phase 2：结构与楼层图切换；缩放/拖拽/全屏/房间高亮在 Phase 3 接入 useZoomPan
import { computed } from 'vue';
import type { MapItem } from '../data/maps';
import type { Floor } from './FloorSwitch.vue';

const props = defineProps<{ map: MapItem; floor: Floor }>();

const imgUrl = computed(() =>
  props.floor === '1' ? props.map.floor1Img :
  props.floor === '2' ? props.map.floor2Img :
  props.map.fullImg,
);
</script>

<template>
  <!-- 地图视口 -->
  <div id="map-viewport" class="map-viewport">
    <!-- 全屏关闭按钮 -->
    <button class="fullscreen-close-btn" title="退出全屏">&times;</button>
    <div id="map-wrapper" class="map-wrapper">
      <img id="main-map-img" :src="imgUrl" alt="交互地图" draggable="false">
      <!-- 高亮覆盖层 -->
      <div id="highlight-overlay" class="highlight-overlay"></div>
    </div>
    <!-- 遮罩图层，制造神秘感 -->
    <div class="vignette-overlay"></div>
  </div>

  <!-- 地图浮动工具栏 -->
  <div class="map-floating-controls">
    <button class="tool-btn zoom-in-btn" title="放大"><span class="icon">+</span></button>
    <button class="tool-btn zoom-out-btn" title="缩小"><span class="icon">-</span></button>
    <button class="tool-btn fullscreen-btn" title="地图全屏"><span class="icon">⤢</span></button>
    <button class="tool-btn reset-btn" title="重置自适应"><span class="icon">⟲</span></button>
  </div>

  <!-- 房间/区域导航 -->
  <div class="room-selector-panel" style="display: none;">
    <span class="room-nav-title">快速区域指引:</span>
    <div id="room-buttons" class="room-buttons"></div>
  </div>
</template>

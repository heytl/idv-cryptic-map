<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { MapItem } from '../data/maps';
import type { Floor } from './FloorSwitch.vue';
import { useZoomPan, ZOOM_CONFIG } from '../composables/useZoomPan';

const props = defineProps<{ map: MapItem; floor: Floor }>();

const viewportEl = ref<HTMLElement | null>(null);
const wrapperEl = ref<HTMLElement | null>(null);
const imgEl = ref<HTMLImageElement | null>(null);

const imgUrl = computed(() =>
  props.floor === '1' ? props.map.floor1Img :
  props.floor === '2' ? props.map.floor2Img :
  props.map.fullImg,
);

const zoom = useZoomPan({ viewport: viewportEl, wrapper: wrapperEl, img: imgEl });

// 图片尺寸不统一（新图有 1650/1700/1800 等高度），
// 每次加载完成后按自然尺寸设置 wrapper 并重新自适应铺满
function fitWrapperToImage() {
  const img = imgEl.value;
  const wrapper = wrapperEl.value;
  if (!img || !wrapper || !img.naturalWidth) return;
  wrapper.style.width = `${img.naturalWidth}px`;
  wrapper.style.height = `${img.naturalHeight}px`;
  zoom.reset();
}

onMounted(() => {
  // 命中缓存时 load 事件可能早于监听，兜底一次
  if (imgEl.value?.complete && imgEl.value.naturalWidth > 0) {
    fitWrapperToImage();
  }
});

// ---- 页内全屏 ----
const isFullscreen = ref(false);

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value;
  // 视口大小发生变化，重新自适应计算居中
  setTimeout(() => zoom.reset(), 80);
}

// 点击图片外部（即视口黑边背景）退出全屏
function onViewportClick(e: MouseEvent) {
  if (isFullscreen.value && e.target === viewportEl.value) {
    toggleFullscreen();
  }
}
</script>

<template>
  <!-- 地图视口 -->
  <div
    id="map-viewport"
    ref="viewportEl"
    class="map-viewport"
    :class="{ 'in-page-fullscreen': isFullscreen }"
    @click="onViewportClick"
  >
    <!-- 全屏关闭按钮 -->
    <button class="fullscreen-close-btn" title="退出全屏" @click.stop="toggleFullscreen">&times;</button>
    <div id="map-wrapper" ref="wrapperEl" class="map-wrapper">
      <img
        id="main-map-img"
        ref="imgEl"
        :src="imgUrl"
        alt="交互地图"
        draggable="false"
        fetchpriority="high"
        @load="fitWrapperToImage"
      >
    </div>
    <!-- 遮罩图层，制造神秘感 -->
    <div class="vignette-overlay"></div>
  </div>

  <!-- 地图浮动工具栏 -->
  <div class="map-floating-controls">
    <button class="tool-btn zoom-in-btn" title="放大" @click="zoom.zoomByFactor(ZOOM_CONFIG.buttonZoomFactor)"><span class="icon">+</span></button>
    <button class="tool-btn zoom-out-btn" title="缩小" @click="zoom.zoomByFactor(1 / ZOOM_CONFIG.buttonZoomFactor)"><span class="icon">-</span></button>
    <button class="tool-btn fullscreen-btn" title="地图全屏" @click="toggleFullscreen"><span class="icon">⤢</span></button>
    <button class="tool-btn reset-btn" title="重置自适应" @click="zoom.reset()"><span class="icon">⟲</span></button>
  </div>
</template>

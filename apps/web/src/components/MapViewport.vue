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

    <!-- 地图浮动工具栏 -->
    <div class="map-floating-controls">
      <button class="tool-btn fullscreen-btn" title="全屏查看" aria-label="全屏查看" @click.stop="toggleFullscreen">
        <svg v-if="!isFullscreen" class="fullscreen-icon-expand" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 3h6v6"></path>
          <path d="M9 21H3v-6"></path>
          <path d="M21 3l-7 7"></path>
          <path d="M3 21l7-7"></path>
        </svg>
        <svg v-else class="fullscreen-icon-compress" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 14h6v6"></path>
          <path d="M20 10h-6V4"></path>
          <path d="M14 10l7-7"></path>
          <path d="M10 14l-7 7"></path>
        </svg>
      </button>
      <button class="tool-btn rotate-btn" title="顺时针旋转 90°" aria-label="顺时针旋转 90°" @click.stop="zoom.rotateMap()">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
          <polyline points="21 3 21 8 16 8"></polyline>
        </svg>
      </button>
      <button class="tool-btn reset-btn" title="重置视角与居中" aria-label="重置视角与居中" @click.stop="zoom.reset(true)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9V5a2 2 0 0 1 2-2h4"></path>
          <path d="M15 3h4a2 2 0 0 1 2 2v4"></path>
          <path d="M21 15v4a2 2 0 0 1-2 2h-4"></path>
          <path d="M9 21H5a2 2 0 0 1-2-2v-4"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      </button>
      <button class="tool-btn zoom-in-btn" title="放大地图" aria-label="放大地图" @click.stop="zoom.zoomByFactor(ZOOM_CONFIG.buttonZoomFactor)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
      <button class="tool-btn zoom-out-btn" title="缩小地图" aria-label="缩小地图" @click.stop="zoom.zoomByFactor(1 / ZOOM_CONFIG.buttonZoomFactor)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
    </div>
  </div>
</template>

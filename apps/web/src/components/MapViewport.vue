<script setup lang="ts">
import { computed, watch, nextTick, onMounted, onUnmounted, ref } from "vue";
import { useZoomPan, ZOOM_CONFIG } from "../composables/useZoomPan";
import { useFloorMotion } from '../composables/useFloorMotion';

import type { FloorSource, PixelRect } from "@idv-map/shared";
import FloorStill from './FloorStill.vue';
const props = withDefaults(defineProps<{ imageUrl: string; region?: PixelRect; sources?: FloorSource[]; floorIndex?: number }>(), { sources: () => [], floorIndex: 0 });
const emit = defineEmits<{ changeFloor: [index: number]; floorMotion: [index: number, duration: number] }>();

const viewportEl = ref<HTMLElement | null>(null);
const wrapperEl = ref<HTMLElement | null>(null);
const imgEl = ref<HTMLImageElement | null>(null);
const naturalWidth = ref(0);
const trackEl = ref<HTMLElement | null>(null);
const viewportSize = ref({ width: 0, height: 0 });
const { pendingFloor, settling, cancelMotion, dragTrack, returnTrack, requestFloor } = useFloorMotion({
  track: trackEl,
  width: () => viewportEl.value?.clientWidth ?? viewportSize.value.width,
  index: () => props.floorIndex,
  count: () => props.sources.length,
  change: index => emit('changeFloor', index),
  progress: (index, duration) => emit('floorMotion', index, duration),
});
const previousIndex = computed(() => pendingFloor.value !== null && pendingFloor.value < props.floorIndex ? pendingFloor.value : props.floorIndex - 1);
const nextIndex = computed(() => pendingFloor.value !== null && pendingFloor.value > props.floorIndex ? pendingFloor.value : props.floorIndex + 1);
const previousSource = computed(() => props.sources[previousIndex.value]);
const nextSource = computed(() => props.sources[nextIndex.value]);

const imgUrl = computed(() => props.imageUrl);

const zoom = useZoomPan({
  viewport: viewportEl,
  wrapper: wrapperEl,
  img: imgEl,
  size: () => props.region,
  swipe: {
    blocked: () => settling.value,
    previous: () => !!previousSource.value,
    next: () => !!nextSource.value,
    move: dragTrack,
    end: step => { if (step) void requestFloor(props.floorIndex + step); else returnTrack(); },
    cancel: cancelMotion,
  },
});

// 图片尺寸不统一（新图有 1650/1700/1800 等高度），
// 每次加载完成后按自然尺寸设置 wrapper 并重新自适应铺满
function fitWrapperToImage() {
  const img = imgEl.value;
  const wrapper = wrapperEl.value;
  if (!img || !wrapper || !img.naturalWidth) return;
  naturalWidth.value = img.naturalWidth;
  wrapper.style.width = `${props.region?.width ?? img.naturalWidth}px`;
  wrapper.style.height = `${props.region?.height ?? img.naturalHeight}px`;
  zoom.reset(true);
}

const imageStyle = computed(() => props.region ? {
  position: "absolute" as const, left: `${-props.region.x}px`, top: `${-props.region.y}px`,
  width: naturalWidth.value ? `${naturalWidth.value}px` : "auto", height: "auto", maxWidth: "none",
} : { position: "static" as const, width: "auto", height: "auto", maxWidth: "none" });
let resizeObserver: ResizeObserver | undefined;
onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    viewportSize.value = { width: viewportEl.value?.clientWidth ?? 0, height: viewportEl.value?.clientHeight ?? 0 };
    if (imgEl.value?.complete && imgEl.value.naturalWidth) zoom.reset(true);
    else cancelMotion();
  });
  if (viewportEl.value) resizeObserver.observe(viewportEl.value);
  // 命中缓存时 load 事件可能早于监听，兜底一次
  if (imgEl.value?.complete && imgEl.value.naturalWidth > 0) {
    fitWrapperToImage();
  }
});

onUnmounted(() => resizeObserver?.disconnect());
watch(() => [props.floorIndex, props.imageUrl, props.region], async () => {
  cancelMotion();
  await nextTick();
  fitWrapperToImage();
}, { flush: 'post' });
defineExpose({ requestFloor, cancelMotion });

// ---- 页内全屏 ----
const isFullscreen = ref(false);

async function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value;
  // 视口大小发生变化，重新自适应计算居中
  await nextTick();
  zoom.reset(true);
}

// 点击图片外部（即视口黑边背景）退出全屏
function onViewportClick(e: MouseEvent) {
  if (isFullscreen.value && (e.target === viewportEl.value || (e.target as Element).classList.contains('current-floor-window'))) {
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
    :class="{ 'in-page-fullscreen': isFullscreen, 'floor-settling': settling }"
    @click="onViewportClick"
  >
    <!-- 全屏关闭按钮 -->
    <button
      class="fullscreen-close-btn"
      title="退出全屏"
      @click.stop="toggleFullscreen"
    >
      &times;
    </button>
    <div ref="trackEl" class="floor-track">
      <div v-if="previousSource" class="floor-neighbor previous"><FloorStill :key="previousIndex + previousSource.url" :source="previousSource" :width="viewportSize.width" :height="viewportSize.height" /></div>
      <div v-if="nextSource" class="floor-neighbor next"><FloorStill :key="nextIndex + nextSource.url" :source="nextSource" :width="viewportSize.width" :height="viewportSize.height" /></div>
      <div class="current-floor-window">
        <div id="map-wrapper" ref="wrapperEl" class="map-wrapper">
          <img
            id="main-map-img"
            ref="imgEl"
            :src="imgUrl"
            :style="imageStyle"
            alt="交互地图"
            draggable="false"
            fetchpriority="high"
            @load="fitWrapperToImage"
          />
        </div>
      </div>
    </div>
    <!-- 遮罩图层，制造神秘感 -->
    <div class="vignette-overlay"></div>

    <!-- 地图浮动工具栏 -->
    <div class="map-floating-controls">
      <button
        class="tool-btn fullscreen-btn"
        title="全屏查看"
        aria-label="全屏查看"
        @click.stop="toggleFullscreen"
      >
        <svg
          v-if="!isFullscreen"
          class="fullscreen-icon-expand"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M15 3h6v6"></path>
          <path d="M9 21H3v-6"></path>
          <path d="M21 3l-7 7"></path>
          <path d="M3 21l7-7"></path>
        </svg>
        <svg
          v-else
          class="fullscreen-icon-compress"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M4 14h6v6"></path>
          <path d="M20 10h-6V4"></path>
          <path d="M14 10l7-7"></path>
          <path d="M10 14l-7 7"></path>
        </svg>
      </button>
      <button
        class="tool-btn rotate-btn"
        title="顺时针旋转 90°"
        aria-label="顺时针旋转 90°"
        @click.stop="zoom.rotateMap()"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
          <polyline points="21 3 21 8 16 8"></polyline>
        </svg>
      </button>
      <button
        class="tool-btn reset-btn"
        title="重置视角与居中"
        aria-label="重置视角与居中"
        @click.stop="zoom.reset(true)"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M3 9V5a2 2 0 0 1 2-2h4"></path>
          <path d="M15 3h4a2 2 0 0 1 2 2v4"></path>
          <path d="M21 15v4a2 2 0 0 1-2 2h-4"></path>
          <path d="M9 21H5a2 2 0 0 1-2-2v-4"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      </button>
      <button
        class="tool-btn zoom-in-btn"
        title="放大地图"
        aria-label="放大地图"
        @click.stop="zoom.zoomByFactor(ZOOM_CONFIG.buttonZoomFactor)"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
      <button
        class="tool-btn zoom-out-btn"
        title="缩小地图"
        aria-label="缩小地图"
        @click.stop="zoom.zoomByFactor(1 / ZOOM_CONFIG.buttonZoomFactor)"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.map-viewport.in-page-fullscreen { width: 100%; height: var(--strategy-viewport-height, 100vh); min-height: 0; }
.map-wrapper { transition: none; overflow: hidden; position: absolute; }
.map-floating-controls { top: 8px; right: 8px; gap: 6px; }
.tool-btn { width: 40px; height: 40px; }
.map-viewport { touch-action: none; overscroll-behavior: contain; }
.floor-track, .current-floor-window, .floor-neighbor { position: absolute; inset: 0; }
.floor-track { will-change: transform; }
.current-floor-window { overflow: hidden; }
.floor-neighbor { pointer-events: none; }
.floor-neighbor.previous { transform: translateX(calc(-100% - 12px)); }
.floor-neighbor.next { transform: translateX(calc(100% + 12px)); }
</style>

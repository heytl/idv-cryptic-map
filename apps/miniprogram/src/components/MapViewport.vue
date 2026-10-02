<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { fitScale, rotatedSize, rotationOffset, type FloorSource, type QuarterTurn } from "@idv-map/shared";
import { forgetImage, loadImage, type LoadedImage } from "../services/images";

defineOptions({ options: { virtualHost: true } });
const props = defineProps<{ source: FloorSource }>();
const instance = getCurrentInstance();
const viewport = ref({ width: 0, height: 0 });
const image = shallowRef<LoadedImage>();
const error = ref("");
const loading = ref(false);
const rotation = ref<QuarterTurn>(0);
const scale = ref(1);
const mounted = ref(true);
async function remount() { mounted.value = false; await nextTick(); if (!disposed) mounted.value = true; }
let requestId = 0;
let disposed = false;
const size = computed(() => props.source.region ?? image.value ?? { width: 0, height: 0 });
const fit = computed(() => fitScale(size.value, viewport.value, rotation.value));
const baseSize = computed(() => ({ width: size.value.width * fit.value, height: size.value.height * fit.value }));
const effective = computed(() => rotatedSize(baseSize.value, rotation.value));
const direction = computed(() => {
  const horizontal = effective.value.width * scale.value > viewport.value.width;
  const vertical = effective.value.height * scale.value > viewport.value.height;
  return horizontal ? (vertical ? "all" : "horizontal") : (vertical ? "vertical" : "none");
});
const movableStyle = computed(() => ({ width: `${effective.value.width}px`, height: `${effective.value.height}px` }));
const centerX = computed(() => (viewport.value.width - effective.value.width) / 2);
const centerY = computed(() => (viewport.value.height - effective.value.height) / 2);
const clipStyle = computed(() => {
  const offset = rotationOffset(baseSize.value, rotation.value);
  return { width: `${baseSize.value.width}px`, height: `${baseSize.value.height}px`,
    transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation.value}deg)` };
});
const imageStyle = computed(() => ({
  width: `${(image.value?.width ?? 0) * fit.value}px`, height: `${(image.value?.height ?? 0) * fit.value}px`,
  left: `${-(props.source.region?.x ?? 0) * fit.value}px`, top: `${-(props.source.region?.y ?? 0) * fit.value}px`,
}));

function reset() { rotation.value = 0; scale.value = 1; void remount(); }
function rotate() {
  const absoluteScale = fit.value * scale.value;
  rotation.value = ((rotation.value + 90) % 360) as QuarterTurn;
  scale.value = Math.max(0.95, Math.min(4, absoluteScale / fit.value));
  void remount();
}
function zoom(factor: number) { scale.value = Math.max(0.95, Math.min(4, scale.value * factor)); }
function onScale(event: { detail: { scale: number } }) {
  if (Number.isFinite(event.detail.scale)) scale.value = event.detail.scale;
}
function measure() {
  nextTick(() => {
    if (disposed) return;
    uni.createSelectorQuery().in(instance!.proxy).select(".viewport").boundingClientRect(result => {
      if (!disposed && result && !Array.isArray(result) && result.width && result.height &&
          (result.width !== viewport.value.width || result.height !== viewport.value.height)) {
        viewport.value = { width: result.width, height: result.height }; reset();
      }
    }).exec();
  });
}
function retryImage() { forgetImage(props.source.url); void fetchImage(); }
async function fetchImage() {
  const id = ++requestId;
  image.value = undefined; error.value = ""; loading.value = true; reset();
  try {
    const loaded = await loadImage(props.source.url);
    if (id !== requestId || disposed) return;
    image.value = loaded; checkDimensions(); measure();
  } catch (cause) {
    if (id === requestId && !disposed) error.value = cause instanceof Error ? cause.message : "图片加载失败";
  } finally { if (id === requestId && !disposed) loading.value = false; }
}
function checkDimensions() {
  const source = props.source;
  error.value = image.value && source.imageWidth && source.imageHeight &&
    (source.imageWidth !== image.value.width || source.imageHeight !== image.value.height)
    ? "图片尺寸与楼层数据不一致，请返回并刷新地图" : "";
}
watch(() => props.source.url, fetchImage, { immediate: true });
watch(() => [props.source.region, props.source.imageWidth, props.source.imageHeight], () => { checkDimensions(); reset(); });
defineExpose({ measure });
onMounted(() => { measure(); uni.onWindowResize(measure); });
onBeforeUnmount(() => { disposed = true; requestId++; uni.offWindowResize(measure); });
</script>

<template>
  <view class="viewport">
    <movable-area v-if="image && fit > 0 && !error && mounted" class="gesture-area" :scale-area="true">
      <movable-view :direction="direction" :style="movableStyle" :x="centerX" :y="centerY"
        :scale="true" :scale-min="0.95" :scale-max="4" :scale-value="scale"
        :animation="false" :inertia="false" :out-of-bounds="false" @scale="onScale">
        <view class="clip" :style="clipStyle">
          <image :src="image.path" :style="imageStyle" mode="scaleToFill"
            @error="error = '地图显示失败，请重试'" />
        </view>
      </movable-view>
    </movable-area>
    <view v-if="loading" class="message">正在加载地图…</view>
    <view v-else-if="error" class="message"><text>{{ error }}</text><button @tap="retryImage">重试</button></view>
    <view v-if="image && !error" class="tools">
      <button aria-label="顺时针旋转90度" @tap="rotate">↻</button>
      <button aria-label="重置并居中" @tap="reset">◎</button>
      <button aria-label="放大地图" @tap="zoom(1.3)">＋</button>
      <button aria-label="缩小地图" @tap="zoom(1 / 1.3)">－</button>
    </view>
  </view>
</template>

<style scoped>
.viewport { position: relative; width: 100%; height: 100%; overflow: hidden; }
.gesture-area { width: 100%; height: 100%; }
.clip { position: absolute; left: 0; top: 0; overflow: hidden; transform-origin: 0 0; }
.clip image { position: absolute; max-width: none; }
.tools { position: absolute; top: 8px; right: 8px; display: flex; flex-direction: column; }
.tools button { width: 44px; height: 44px; padding: 0; line-height: 42px; margin-bottom: 8px; border-radius: 50%; font-size: 22px; }
.message { position: absolute; top: 35%; left: 20px; right: 20px; text-align: center; color: #b1a58f; }
.message button { margin-top: 16px; }
</style>

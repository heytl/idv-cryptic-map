<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { fitScale, rotatedSize, rotationOffset, type FloorSource, type QuarterTurn } from "@idv-map/shared";
import { imageCache, imageErrorMessage, type LoadedImage } from "../services/images";
import ImageProbe from "./ImageProbe.vue";
import UiIcon from "./UiIcon.vue";
import FloorStill from "./FloorStill.vue";
import { createMapGesture, type MapTouchEvent } from "../services/map-gestures";

// The uni-app compiler supplies this view-layer module; there is no JS import.
declare const floorMotion: Record<"configure" | "start" | "move" | "end" | "cancel", (...args: unknown[]) => void>;

defineOptions({ options: { virtualHost: true } });
const props = withDefaults(defineProps<{ source: FloorSource; sources: FloorSource[]; floorIndex: number; focused?: boolean; alignTop?: boolean }>(), { focused: false, alignTop: false });
const emit = defineEmits<{ toggleFocus: []; switchFloor: [step: number]; floorTransition: [step: number]; preview: []; ready: [value: boolean]; interaction: [value: boolean]; activity: [] }>();
const instance = getCurrentInstance();
const viewport = ref({ width: 0, height: 0, left: 0, top: 0 });
const image = shallowRef<LoadedImage>();
const error = ref("");
const loading = ref(false);
const probes = shallowRef<{ id: number; url: string }[]>([]);
const rotation = ref<QuarterTurn>(0);
// Explicit commands only; finger movement stays entirely in the WXS view layer.
const commandedScale = ref(1);
const transformRevision = ref(0);
let gestureScale = 1;
let zoomRequest = 0;
const gesture = createMapGesture();
let tapAllowedUntil = 0;
const transitionStep = ref(0);
const sliding = ref(false);
const motionCommand = ref({ serial: 0, offset: 0, duration: 0 });
let slideTimer: ReturnType<typeof setTimeout> | undefined;
const previousIndex = computed(() => props.floorIndex + (transitionStep.value < 0 ? transitionStep.value : -1));
const nextIndex = computed(() => props.floorIndex + (transitionStep.value > 0 ? transitionStep.value : 1));
const previousSource = computed(() => props.sources[previousIndex.value]);
const nextSource = computed(() => props.sources[nextIndex.value]);
const motionConfig = computed(() => ({ ...motionCommand.value, width: viewport.value.width, height: viewport.value.height,
  left: viewport.value.left, top: viewport.value.top,
  imageWidth: effective.value.width, imageHeight: effective.value.height, alignTop: props.alignTop && rotation.value === 0,
  scale: commandedScale.value, revision: transformRevision.value,
  busy: sliding.value, previous: !!previousSource.value, next: !!nextSource.value }));
function moveTrack(offset: number, duration: number) {
  motionCommand.value = { serial: motionCommand.value.serial + 1, offset, duration };
}
function cancelSlide() {
  clearTimeout(slideTimer); slideTimer = undefined;
  sliding.value = false; transitionStep.value = 0; moveTrack(0, 0);
  emit("interaction", false);
  emit("floorTransition", 0);
}
function requestFloor(step: number) {
  if (sliding.value) return;
  if (!step || !props.sources[props.floorIndex + step]) { moveTrack(0, 240); return; }
  // Keep the capsules usable while a source is loading or has failed.
  if (!image.value || error.value) { emit("switchFloor", step); return; }
  gesture.cancel(); tapAllowedUntil = 0;
  sliding.value = true; transitionStep.value = step;
  emit("interaction", true);
  emit("floorTransition", step);
  moveTrack(-Math.sign(step) * (viewport.value.width + 12), 240);
  slideTimer = setTimeout(() => { slideTimer = undefined; if (!disposed) emit("switchFloor", step); }, 240);
}
let requestId = 0;
let disposed = false;
const size = computed(() => props.source.region ?? image.value ?? { width: 0, height: 0 });
const fit = computed(() => fitScale(size.value, viewport.value, rotation.value));
const baseSize = computed(() => ({ width: size.value.width * fit.value, height: size.value.height * fit.value }));
const effective = computed(() => rotatedSize(baseSize.value, rotation.value));
const surfaceStyle = computed(() => ({ width: `${effective.value.width}px`, height: `${effective.value.height}px` }));
const clipStyle = computed(() => {
  const offset = rotationOffset(baseSize.value, rotation.value);
  return { width: `${baseSize.value.width}px`, height: `${baseSize.value.height}px`,
    transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation.value}deg)` };
});
const imageStyle = computed(() => ({
  width: `${(image.value?.width ?? 0) * fit.value}px`, height: `${(image.value?.height ?? 0) * fit.value}px`,
  left: `${-(props.source.region?.x ?? 0) * fit.value}px`, top: `${-(props.source.region?.y ?? 0) * fit.value}px`,
}));

function reset() {
  emit("activity");
  cancelSlide();
  ++zoomRequest; gesture.cancel(); tapAllowedUntil = 0;
  rotation.value = 0; gestureScale = 1; commandedScale.value = 1;
  transformRevision.value++;
}
function rotate() {
  emit("activity");
  cancelSlide();
  ++zoomRequest; gesture.cancel(); tapAllowedUntil = 0;
  const absoluteScale = fit.value * gestureScale;
  rotation.value = ((rotation.value + 90) % 360) as QuarterTurn;
  gestureScale = Math.max(1, Math.min(4, absoluteScale / fit.value));
  commandedScale.value = gestureScale;
  transformRevision.value++;
}
async function zoom(factor: number) {
  emit("activity");
  const request = ++zoomRequest;
  const target = Math.max(1, Math.min(4, gestureScale * factor));
  if (target === gestureScale) return;
  // Reconcile a stale command first, so a button still works when its target
  // equals the last prop value after a WXS pinch (Vue would skip that write).
  commandedScale.value = gestureScale;
  await nextTick();
  if (disposed || request !== zoomRequest) return;
  gestureScale = target; commandedScale.value = target;
}
function onScale(event: { detail: { scale: number } }) {
  if (Number.isFinite(event.detail.scale) && event.detail.scale > 0) {
    gestureScale = event.detail.scale;
    gesture.scaled();
  }
}
function touchStart(event: MapTouchEvent) {
  emit("interaction", true);
  tapAllowedUntil = 0;
  gesture.start(event, Date.now());
}
function touchMoved(event: MapTouchEvent) { gesture.move(event); }
function touchEnd(event: MapTouchEvent) {
  const result = gesture.end(event, Date.now());
  if (event.touches.length) return;
  emit("interaction", false);
  if (result === "tap") { tapAllowedUntil = Date.now() + 400; moveTrack(0, 220); }
  else moveTrack(0, 240);
}
function touchCancel() { gesture.cancel(); tapAllowedUntil = 0; moveTrack(0, 240); emit("interaction", false); }
function preview() {
  if (Date.now() > tapAllowedUntil) return;
  tapAllowedUntil = 0;
  emit("preview");
}
function measure() {
  nextTick(() => {
    if (disposed) return;
    uni.createSelectorQuery().in(instance!.proxy).select(".viewport").boundingClientRect(result => {
      if (!disposed && result && !Array.isArray(result) && result.width && result.height &&
          (result.width !== viewport.value.width || result.height !== viewport.value.height || result.left !== viewport.value.left || result.top !== viewport.value.top)) {
        viewport.value = { width: result.width, height: result.height, left: result.left ?? 0, top: result.top ?? 0 }; reset();
      }
    }).exec();
  });
}
function retryImage() { imageCache.forget(props.source.url); fetchImage(); }
function fetchImage() {
  emit("ready", false);
  ++requestId;
  image.value = undefined; error.value = ""; loading.value = true; reset();
  const cached = imageCache.get(props.source.url);
  probes.value = cached ? [] : [{ id: requestId, url: props.source.url }];
  if (cached) {
    image.value = cached; loading.value = false; checkDimensions(); measure();
  }
}
function imageLoaded(id: number, url: string, width: number, height: number) {
  if (id !== requestId || disposed || url !== props.source.url) return;
  try {
    image.value = imageCache.remember(url, width, height);
    checkDimensions(); measure();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "无法读取图片尺寸";
  }
  probes.value = []; loading.value = false;
}
function imageFailed(id: number, url: string, detail: string) {
  if (id !== requestId || disposed || url !== props.source.url) return;
  emit("ready", false);
  imageCache.forget(url); probes.value = []; loading.value = false;
  error.value = imageErrorMessage(detail);
  console.error("[MapViewport] image load failed", { url, detail });
}
function displayFailed(event: Event | { detail: { errMsg?: string } }) {
  imageFailed(requestId, props.source.url, "detail" in event ? event.detail.errMsg ?? "Image decode failed" : "Image decode failed");
}
function displayLoaded() { if (!disposed && image.value && !error.value) emit("ready", true); }
function checkDimensions() {
  const source = props.source;
  error.value = image.value && source.imageWidth && source.imageHeight &&
    (source.imageWidth !== image.value.width || source.imageHeight !== image.value.height)
    ? "图片尺寸与楼层数据不一致，请返回并刷新地图" : "";
}
watch(() => props.source.url, fetchImage, { immediate: true });
watch(() => [props.floorIndex, props.source.region, props.source.imageWidth, props.source.imageHeight], () => { checkDimensions(); reset(); });
defineExpose({ measure, requestFloor, onScale, touchStart, touchMoved, touchEnd, touchCancel });
onMounted(() => { measure(); uni.onWindowResize(measure); });
onBeforeUnmount(() => { disposed = true; requestId++; clearTimeout(slideTimer); uni.offWindowResize(measure); });
</script>

<script module="floorMotion" lang="wxs">
// One view-layer owner handles pinch, pan and the unconsumed edge swipe.
// No per-frame setData or native movable-view recognizer competes with it.
function paint(owner, x, duration) {
  var track = owner.selectComponent('.floor-track');
  if (track) track.setStyle({
    transition: duration ? 'transform ' + duration + 'ms cubic-bezier(.22,.8,.24,1)' : 'none',
    transform: 'translate3d(' + x + 'px,0,0)'
  });
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function bound(value, extent, viewport, top) {
  return extent > viewport ? clamp(value, viewport - extent, 0) : (top ? 0 : (viewport - extent) / 2);
}
function drawMap(owner, state) {
  var config = state.config;
  state.panX = bound(state.panX, config.imageWidth * state.scale, config.width, false);
  state.panY = bound(state.panY, config.imageHeight * state.scale, config.height, config.alignTop && state.scale === 1);
  var map = owner.selectComponent('.map-surface');
  if (map) map.setStyle({ transform: 'translate3d(' + state.panX + 'px,' + state.panY + 'px,0) scale(' + state.scale + ')' });
}
function zoomAt(owner, state, scale, x, y) {
  var ratio = scale / state.scale;
  state.panX = x - (x - state.panX) * ratio;
  state.panY = y - (y - state.panY) * ratio;
  state.scale = scale;
  drawMap(owner, state);
}
function eventData(event) {
  return { touches: event.touches || [], changedTouches: event.changedTouches || [] };
}
function configure(value, oldValue, owner) {
  // WeChat invokes change:motion before the first component data patch.
  // An absent initial value must not replace an already configured gesture.
  if (!value) return;
  var state = owner.getState();
  state.config = value;
  if (!oldValue || value.revision !== oldValue.revision || value.imageWidth !== oldValue.imageWidth ||
      value.imageHeight !== oldValue.imageHeight || value.width !== oldValue.width || value.height !== oldValue.height) {
    state.active = false; state.edge = 0;
    state.scale = value.scale || 1;
    state.panX = (value.width - value.imageWidth * state.scale) / 2;
    state.panY = (value.height - value.imageHeight * state.scale) / 2;
    drawMap(owner, state);
  } else if (value.scale !== oldValue.scale) {
    zoomAt(owner, state, value.scale, value.width / 2, value.height / 2);
  }
  if (!oldValue || value.serial !== oldValue.serial) paint(owner, value.offset, value.duration);
}
function rebase(state, touch) {
  state.x = touch.pageX; state.y = touch.pageY;
  state.originX = state.panX; state.originY = state.panY;
  state.axis = ''; state.edge = 0;
}
function pinch(state, touches) {
  var dx = touches[1].pageX - touches[0].pageX;
  var dy = touches[1].pageY - touches[0].pageY;
  state.distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  state.pinchScale = state.scale;
  state.midX = (touches[0].pageX + touches[1].pageX) / 2 - state.left;
  state.midY = (touches[0].pageY + touches[1].pageY) / 2 - state.top;
  state.pinchX = state.panX; state.pinchY = state.panY;
  state.pinching = true; state.multiple = true; state.edge = 0;
}
function start(event, owner) {
  var state = owner.getState();
  var config = state.config || {};
  if (config.busy || !config.imageWidth) return;
  owner.callMethod('touchStart', eventData(event));
  if (!state.active) {
    state.left = config.left || 0; state.top = config.top || 0;
    state.active = true; state.multiple = false; state.pinching = false; state.reportedMove = false;
    rebase(state, event.touches[0]);
  }
  if (event.touches.length > 1) { pinch(state, event.touches); paint(owner, 0, 0); }
}
function move(event, owner) {
  var state = owner.getState();
  if (!state.active || (state.config || {}).busy) return;
  if (event.touches.length > 1) {
    if (!state.pinching) pinch(state, event.touches);
    var first = event.touches[0]; var second = event.touches[1];
    var px = second.pageX - first.pageX; var py = second.pageY - first.pageY;
    var scale = clamp(state.pinchScale * Math.sqrt(px * px + py * py) / state.distance, 1, 4);
    var ratio = scale / state.pinchScale;
    state.panX = (first.pageX + second.pageX) / 2 - state.left - (state.midX - state.pinchX) * ratio;
    state.panY = (first.pageY + second.pageY) / 2 - state.top - (state.midY - state.pinchY) * ratio;
    state.scale = scale; drawMap(owner, state); paint(owner, 0, 0);
    return false;
  }
  if (!event.touches.length) return;
  var touch = event.touches[0];
  if (state.pinching) { state.pinching = false; rebase(state, touch); }
  var dx = touch.pageX - state.x; var dy = touch.pageY - state.y;
  if (!state.reportedMove && dx * dx + dy * dy > 100) {
    state.reportedMove = true;
    owner.callMethod('touchMoved', eventData(event));
  }
  if (!state.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
    state.axis = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y';
  }
  state.panX = state.originX + dx; state.panY = state.originY + dy;
  drawMap(owner, state);
  // Only horizontal displacement left after the map reaches its bound moves the track.
  var edge = state.axis === 'x' && !state.multiple ? dx - (state.panX - state.originX) : 0;
  state.edge = edge;
  var config = state.config; var width = config.width || 1;
  var available = edge < 0 ? config.next : config.previous;
  var offset = available ? clamp(edge, -width, width) : edge * 0.25 / (1 + Math.abs(edge) / width);
  paint(owner, offset, 0);
  return false;
}
function end(event, owner) {
  var state = owner.getState();
  if ((state.config || {}).busy || !state.active) return;
  if (event.touches.length) {
    state.multiple = true;
    if (event.touches.length > 1) pinch(state, event.touches);
    else { state.pinching = false; rebase(state, event.touches[0]); }
    owner.callMethod('touchEnd', eventData(event)); return;
  }
  state.active = false;
  if (state.multiple) owner.callMethod('onScale', { detail: { scale: state.scale } });
  if (!state.multiple && !state.reportedMove) { owner.callMethod('touchEnd', eventData(event)); return; }
  owner.callMethod('touchCancel', {});
  var threshold = Math.max(48, Math.min(96, state.config.width * 0.18));
  if (!state.multiple && Math.abs(state.edge) >= threshold) owner.callMethod('requestFloor', state.edge < 0 ? 1 : -1);
}
function cancel(event, owner) {
  var state = owner.getState();
  state.active = false; state.edge = 0;
  if (state.scale) owner.callMethod('onScale', { detail: { scale: state.scale } });
  paint(owner, 0, 220);
  owner.callMethod('touchCancel', {});
}
module.exports = { configure: configure, start: start, move: move, end: end, cancel: cancel };
</script>

<template>
  <view class="viewport">
    <ImageProbe v-for="probe in probes" :key="probe.id" :url="probe.url" :request-id="probe.id" @loaded="imageLoaded" @failed="imageFailed" />
    <view class="floor-stage" :motion="motionConfig" :change:motion="floorMotion.configure"
      @touchstart="floorMotion.start" @touchmove="floorMotion.move" @touchend="floorMotion.end" @touchcancel="floorMotion.cancel">
      <view class="floor-track">
        <view v-if="previousSource" class="floor-neighbor previous"><FloorStill :source="previousSource" :width="viewport.width" :height="viewport.height" :align-top="previousIndex === 0 && !focused" /></view>
        <view v-if="nextSource" class="floor-neighbor next"><FloorStill :source="nextSource" :width="viewport.width" :height="viewport.height" :align-top="nextIndex === 0 && !focused" /></view>
        <view class="map-window">
          <view v-show="image && fit > 0 && !error" class="map-surface" :style="surfaceStyle">
            <view class="clip" :style="clipStyle">
              <image v-if="image" :src="image.path" :webp="true" :style="imageStyle" mode="scaleToFill"
                @load="displayLoaded" @error="displayFailed" @tap="preview" />
            </view>
          </view>
        </view>
      </view>
    </view>
    <view v-if="loading" class="message">正在加载地图…</view>
    <view v-else-if="error" class="message"><text>{{ error }}</text><button @tap="retryImage">重试</button></view>
    <button v-if="focused" class="fullscreen-close tool-button" hover-class="tool-pressed" aria-label="关闭全屏查看" @tap="emit('toggleFocus')"><view class="tool-surface"><UiIcon name="close" :size="20" /></view></button>
    <view v-if="image && fit > 0 && !error" class="tools" :class="{ focused, sliding }">
      <button class="tool-button" hover-class="tool-pressed" :aria-label="focused ? '退出全屏' : '全屏查看'" :aria-pressed="focused" @tap="emit('toggleFocus')"><view class="tool-surface"><UiIcon :name="focused ? 'compress' : 'expand'" /></view></button>
      <button class="tool-button" hover-class="tool-pressed" aria-label="顺时针旋转90度" @tap="rotate"><view class="tool-surface"><UiIcon name="rotate" /></view></button>
      <button class="tool-button" hover-class="tool-pressed" aria-label="重置并居中" @tap="reset"><view class="tool-surface"><UiIcon name="reset" /></view></button>
      <button class="tool-button" hover-class="tool-pressed" aria-label="放大地图" @tap="zoom(1.3)"><view class="tool-surface"><UiIcon name="plus" /></view></button>
      <button class="tool-button" hover-class="tool-pressed" aria-label="缩小地图" @tap="zoom(1 / 1.3)"><view class="tool-surface"><UiIcon name="minus" /></view></button>
    </view>
  </view>
</template>

<style scoped>
.viewport { position: relative; width: 100%; height: 100%; overflow: hidden; }
.floor-stage, .floor-track { position: absolute; inset: 0; }
.floor-track { will-change: transform; }
.floor-neighbor { position: absolute; inset: 0; pointer-events: none; }
.floor-neighbor.previous { transform: translateX(calc(-100% - 12px)); }
.floor-neighbor.next { transform: translateX(calc(100% + 12px)); }
.tools.sliding { pointer-events: none; }
.map-surface { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
.map-window { position: absolute; inset: 0; overflow: hidden; }
.clip { position: absolute; left: 0; top: 0; overflow: hidden; transform-origin: 0 0; }
.clip image { position: absolute; max-width: none; }
.tools { position: absolute; top: 6px; right: 6px; display: flex; flex-direction: column; z-index: 10; }
.tool-button { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; padding: 2px; margin: 0 0 2px; border: 0; border-radius: 50%; background: transparent; }
.tool-surface { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border: 1px solid #454a49; border-radius: 50%; background: #1c272f; box-shadow: 0 2px 8px rgba(0,0,0,.2); }
.tool-pressed .tool-surface { background: #2a3740; border-color: #c3a168; }
.fullscreen-close { position: absolute; top: 6px; right: 6px; z-index: 11; }
.fullscreen-close .tool-surface { width: 36px; height: 36px; }
.tools.focused { top: 48px; }
.message { position: absolute; top: 35%; left: 20px; right: 20px; text-align: center; color: #b1a58f; }
.message button { margin-top: 16px; }
</style>

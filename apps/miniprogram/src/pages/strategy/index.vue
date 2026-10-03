<script setup lang="ts">
import { computed, ref, shallowRef, nextTick, onBeforeUnmount } from "vue";
import { onHide, onLoad, onResize, onShow } from "@dcloudio/uni-app";
import { DEFAULT_FLOOR, FLOOR_LABELS, availableFloors, resolveFloorSource,
  enabledEntranceTypesV2, type FloorType, type PublicLayoutV4 } from "@idv-map/shared";
import MapViewport from "../../components/MapViewport.vue";
import FloorPreview from "../../components/FloorPreview.vue";
import { adjacentFloor } from "../../services/map-gestures";
import { content } from "../../services/content";

const layout = shallowRef<PublicLayoutV4>();
const floor = ref<FloorType>(DEFAULT_FLOOR);
const error = ref("");
const loading = ref(false);
const focused = ref(false);
const transitioningFloor = ref<number | null>(null);
const windowHeight = ref(0);
const mapReady = ref(false);
const mapInteracting = ref(false);
const foreground = ref(true);
const viewer = ref<InstanceType<typeof MapViewport>>();
const imagePreview = ref<InstanceType<typeof FloorPreview>>();
let params: Record<string, string | undefined> = {};
const floors = computed(() => layout.value ? availableFloors(layout.value) : []);
const floorIndex = computed(() => floors.value.indexOf(floor.value));
const floorSources = computed(() => layout.value ? floors.value.map(item => resolveFloorSource(layout.value!, item)!) : []);
const source = computed(() => floorSources.value[floorIndex.value]);
const highlightedFloor = computed(() => transitioningFloor.value ?? floorIndex.value);
const indicatorStyle = computed(() => {
  const count = floors.value.length || 1;
  return { width: `calc(${100 / count}% - ${(count - 1) * 2 / count}px)`,
    transform: `translateX(calc(${highlightedFloor.value * 100}% + ${highlightedFloor.value * 2}px))` };
});
let disposed = false;

async function load() {
  loading.value = true; error.value = "";
  try {
    const data = await content.load();
    if (disposed) return;
    const selected = data.layouts.find(l => l.id === Number(params.layoutId) && l.gameMapId === params.gameMapId);
    if (!selected) throw new Error("地图不存在或已下架，请返回目录刷新");
    const allowed = selected.entrances.filter(e => enabledEntranceTypesV2(selected.mode).includes(e.type));
    if (!allowed.length) throw new Error("此地图暂无可用入口");
    layout.value = selected;
    uni.setNavigationBarTitle({ title: selected.displayName });
    floor.value = DEFAULT_FLOOR;
  } catch (cause) { if (!disposed) error.value = cause instanceof Error ? cause.message : "加载失败"; }
  finally { if (!disposed) loading.value = false; }
}
async function toggleFocus() { focused.value = !focused.value; await nextTick(); viewer.value?.measure(); }
function switchFloor(step: number) {
  const next = adjacentFloor(floors.value, floor.value, step);
  if (next) floor.value = next;
  transitioningFloor.value = null;
}
function selectFloor(item: FloorType) { viewer.value?.requestFloor(floors.value.indexOf(item) - floorIndex.value); }
function floorTransition(step: number) { transitioningFloor.value = step ? floorIndex.value + step : null; }
function previewFloors() {
  if (!layout.value) return;
  const sources = floors.value.map(item => resolveFloorSource(layout.value!, item)!);
  void imagePreview.value?.open(sources, floors.value.indexOf(floor.value));
}
function back() { uni.navigateBack({ fail: () => uni.reLaunch({ url: "/pages/maps/index" }) }); }
onLoad(query => {
  params = query ?? {};
  windowHeight.value = uni.getWindowInfo().windowHeight;
  void load();
});
onResize(event => { windowHeight.value = event.size?.windowHeight ?? uni.getWindowInfo().windowHeight; viewer.value?.measure(); });
onShow(() => { foreground.value = true; });
onHide(() => { foreground.value = false; });
onBeforeUnmount(() => { disposed = true; });
</script>

<template>
  <view class="strategy" :style="windowHeight ? { height: `${windowHeight}px` } : undefined">
    <view v-if="loading" class="status">正在加载地图…</view>
    <view v-else-if="error" class="status"><text>{{ error }}</text><button @tap="load">重试</button><button @tap="back">返回目录</button></view>
    <template v-else-if="layout && source">
      <view v-if="!focused" class="header">
        <view class="floors"><view class="floor-indicator" :style="indicatorStyle" aria-hidden="true" /><button v-for="(item, index) in floors" :key="item" :class="{ active: highlightedFloor === index }" :data-floor="item" :aria-pressed="floor === item" hover-class="floor-pressed" @tap="selectFloor(item)"><view class="floor-face">{{ FLOOR_LABELS[item] }}</view></button></view>
      </view>
      <view class="map-panel"><MapViewport ref="viewer" :source="source" :sources="floorSources" :floor-index="floorIndex" :focused="focused" :align-top="floor === DEFAULT_FLOOR && !focused" @toggle-focus="toggleFocus" @switch-floor="switchFloor" @floor-transition="floorTransition" @preview="previewFloors" @ready="mapReady = $event" @interaction="mapInteracting = $event" @activity="imagePreview?.activity()" /></view>
      <FloorPreview ref="imagePreview" :sources="floorSources" :current="floorIndex" :ready="mapReady" :interacting="mapInteracting" :foreground="foreground" />
    </template>
  </view>
</template>

<style scoped>
.strategy { --detail-muted: #b1a58f; display: flex; flex-direction: column; height: 100vh; padding-bottom: env(safe-area-inset-bottom); overflow: hidden; position: relative; }
.header { flex: none; padding: 0 8px; background: rgba(17,24,30,.72); }
/* Match the Web pill dimensions while keeping a 44px native tap target. */
.floors { position: relative; display: flex; width: 100%; max-width: 320px; margin: 0 auto; gap: 2px; }
.floor-indicator { position: absolute; left: 0; top: 8.36px; height: 27.28px; border-radius: 999px; background: var(--gold); box-shadow: inset 0 1px 0 #ead5aa; transition: transform 240ms cubic-bezier(.22,.8,.24,1); pointer-events: none; }
.floors button { position: relative; display: flex; align-items: center; justify-content: center; flex: 1 1 0; min-width: 0; height: 44px; min-height: 44px; padding: 0; margin: 0; border: 0; border-radius: 0; background: transparent; font-family: inherit; font-size: 14.4px; line-height: 1.2; font-weight: 500; }
.floor-face { width: 100%; padding: 5px 10px; border-radius: 999px; color: var(--detail-muted); background: transparent; text-align: center; white-space: nowrap; transition: color 180ms ease; }
.floors button.active .floor-face { color: #171710; }
.floor-pressed .floor-face { color: #f0d8ab; }
.map-panel { flex: 1; min-height: 0; }
</style>

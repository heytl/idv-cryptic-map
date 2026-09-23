<script setup lang="ts">
import {
  DEFAULT_FLOOR,
  ENTRANCE_LABELS,
  type EntranceType,
  type FloorType,
  type GameMode,
} from "@idv-map/shared";
import { computed, onUnmounted, ref, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import FloorSwitchV2 from "../components/FloorSwitchV2.vue";
import LegendBox from "../components/LegendBox.vue";
import MapViewport from "../components/MapViewport.vue";
import { BASE_TITLE } from "../constants";
import {
  availableFloors,
  enabledEntranceTypesV2,
  entranceFilterLabelV2,
  findEntranceV2,
  findMapV2,
} from "../data/maps-v2";
import { navState } from "../navState";

const referenceDialog = ref<HTMLDialogElement | null>(null);
function closeReference(event: MouseEvent) {
  if (event.target !== referenceDialog.value) return;
  const box = referenceDialog.value!.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) referenceDialog.value?.close();
}

const route = useRoute();
const router = useRouter();
const mode = computed(() => route.params.mode as GameMode);
const entranceType = computed(() => route.params.entrance as EntranceType);
const map = computed(() =>
  findMapV2(
    Number(route.params.layoutId),
    mode.value,
    route.params.gameMapId as string,
  ),
);
const entrance = computed(() =>
  map.value ? findEntranceV2(map.value, entranceType.value) : undefined,
);
const enabledEntrances = computed(() => {
  const enabled = enabledEntranceTypesV2(mode.value);
  return (
    map.value?.entrances.filter((item) => enabled.includes(item.type)) ?? []
  );
});
const floors = computed(() =>
  map.value ? availableFloors(map.value) : [DEFAULT_FLOOR],
);
const floor = computed<FloorType>(() => {
  const requested = route.params.floor as FloorType | undefined;
  return requested && floors.value.includes(requested)
    ? requested
    : DEFAULT_FLOOR;
});
const imageUrl = computed(() => map.value?.floorImages[floor.value]?.url ?? "");

watchEffect(() => {
  if (route.name === "map-v2" && (!map.value || !entrance.value))
    router.replace("/maps");
  if (map.value) document.title = `${map.value.displayName} | ${BASE_TITLE}`;
});
onUnmounted(() => {
  document.title = BASE_TITLE;
});

function setFloor(next: FloorType) {
  const base = `/maps/${route.params.gameMapId}/${mode.value}/${entranceType.value}/layout/${map.value!.id}`;
  router.replace(next === DEFAULT_FLOOR ? base : `${base}/${next}`);
}

function setEntrance(next: EntranceType) {
  router.replace(
    `/maps/${route.params.gameMapId}/${mode.value}/${next}/layout/${map.value!.id}${floor.value === DEFAULT_FLOOR ? "" : `/${floor.value}`}`,
  );
}

function goBack() {
  if (navState.enteredFromCatalog) router.back();
  else
    router.push(
      `/maps/${route.params.gameMapId}/${mode.value}/${entranceType.value}`,
    );
}
</script>

<template>
  <main v-if="map && entrance" id="strategy-v2-view" class="view-panel active">
    <div class="control-bar">
      <button class="btn-back" aria-label="返回手记目录" @click="goBack">‹ 返回</button>
      <div class="map-title-container">
        <h2 class="map-title">{{ map.displayName }}</h2>
        <span class="map-direction-badge"
          >{{ entrance.typeLabel }} ·
          {{ entranceFilterLabelV2(entrance) }}</span
        >
      </div>
      <div class="floor-toggle-wrapper">
        <FloorSwitchV2 :floor="floor" :floors="floors" @change="setFloor" />
      </div>
      <button class="reference-trigger" @click="referenceDialog?.showModal()">入口参考</button>
    </div>

    <div class="detail-container">
      <dialog ref="referenceDialog" class="reference-dialog" aria-labelledby="reference-title" @click="closeReference">
        <header class="reference-heading"><h2 id="reference-title">入口参考与备注</h2><button aria-label="关闭入口参考" @click="referenceDialog?.close()">×</button></header>
        <div class="parchment-card tight">
          <div class="card-inner">
            <h3 class="sidebar-title">{{ entrance.typeLabel }}入口参考</h3>
            <div class="entry-img-container">
              <img
                :src="entrance.imageUrl"
                :alt="`${entrance.typeLabel}入口图`"
              />
              <div class="scan-line"></div>
            </div>
            <div class="sidebar-info-box">
              <div class="info-item">
                <span class="label">{{
                  entrance.type === "front" ? "通道类型:" : "入口方向:"
                }}</span>
                <span class="value">{{ entranceFilterLabelV2(entrance) }}</span>
              </div>
              <div class="info-item">
                <span class="label">特征备注:</span
                ><span class="value handwriting">{{ map.remarks }}</span>
              </div>
            </div>
            <div class="v2-entrance-switch">
              <button
                v-for="item in enabledEntrances"
                :key="item.id"
                class="tab-btn"
                :class="{ active: item.type === entranceType }"
                @click="setEntrance(item.type)"
              >
                {{ ENTRANCE_LABELS[item.type] }}
              </button>
            </div>
            <LegendBox />
          </div>
        </div>
      </dialog>

      <section class="map-main-panel">
        <MapViewport :image-url="imageUrl" />
      </section>
    </div>
  </main>
</template>

<style scoped>
#strategy-v2-view { display: flex; flex-direction: column; height: 100dvh; min-height: 0; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
.control-bar { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; flex: none; margin: 0; border: 0; border-radius: 0; box-shadow: none; }
.btn-back { width: auto; background: transparent; border: 0; box-shadow: none; padding: 6px 10px; }
.map-title-container { min-width: 0; gap: 8px; }
.map-title { font-size: 1.1rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.map-direction-badge { font-size: .75rem; white-space: nowrap; }
.control-bar button { min-height: 44px; }
.floor-toggle-wrapper { margin: 0; }
.reference-trigger { padding: 6px 10px; border: 0; box-shadow: none; background: transparent; }
.detail-container { display: flex; flex: 1; min-height: 0; gap: 0; }
.map-main-panel { flex: 1; min-width: 0; min-height: 0; }
.map-main-panel :deep(.map-viewport) { min-height: 0; border: 0; border-radius: 0; }
.map-main-panel :deep(.vignette-overlay) { display: none; }
.reference-dialog { position: fixed; inset: 0 0 0 auto; margin: 0; width: min(360px, 100%); max-width: 100%; height: 100dvh; max-height: 100dvh; overflow: auto; border: 0; padding: 16px; }
.reference-dialog::backdrop { background: rgba(10,11,13,.65); }
.reference-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.reference-heading h2 { font-size: 1.1rem; }
.reference-heading button { width: 44px; height: 44px; border: 0; background: transparent; font: inherit; font-size: 24px; color: inherit; cursor: pointer; }
.reference-dialog .parchment-card { padding: 0; border: 0; box-shadow: none; }
.reference-dialog .card-inner { padding: 0; border: 0; }

/* A continuous ink-blue canvas, with brass reserved for controls. */
#strategy-v2-view {
  --detail-ink: #151d23;
  --detail-surface: #1c272f;
  --detail-brass: #c3a168;
  --detail-muted: #b1a58f;
  --detail-line: #454a49;
  background: transparent;
}
.control-bar {
  position: relative;
  isolation: isolate;
  background: transparent;
  border-bottom: 0;
  padding: 3px 16px;
  gap: 16px;
}
.control-bar::before {
  content: "";
  position: absolute;
  inset: 0 calc((100% - 100vw) / 2);
  z-index: -1;
  pointer-events: none;
  background: rgba(17, 24, 30, .72);
  border-bottom: 1px solid rgba(195, 161, 104, .14);
}
.map-title-container { justify-content: flex-start; padding-left: 16px; border-left: 1px solid var(--detail-line); }
.map-title { color: #e1c795; font-weight: 500; letter-spacing: .06em; }
.map-direction-badge { color: var(--detail-muted); background: transparent; border: 0; border-radius: 0; font-weight: 400; padding: 0; }
.control-bar .btn-back,
.control-bar .reference-trigger {
  color: var(--detail-brass); background: transparent; border: 0;
  border-radius: 0; box-shadow: none; font: inherit; font-weight: 500; transform: none; cursor: pointer;
  transition: color .18s ease;
}
.control-bar .reference-trigger { padding-inline: 10px; }
.control-bar .btn-back:hover,
.control-bar .reference-trigger:hover { color: #f0d8ab; }
.floor-toggle-wrapper :deep(.floor-switch) { border: 1px solid var(--detail-line); border-radius: 999px; background: var(--detail-ink); padding: 2px; gap: 2px; }
.floor-toggle-wrapper :deep(.switch-btn) { color: var(--detail-muted); border-radius: 999px; min-width: 52px; padding: 6px 12px; background: transparent; font-family: inherit; font-weight: 500; transition: color .18s ease, background-color .18s ease; }
.floor-toggle-wrapper :deep(.switch-btn:hover) { color: #f0d8ab; }
.floor-toggle-wrapper :deep(.switch-btn.active) { color: #171710; background: var(--detail-brass); box-shadow: inset 0 1px 0 #ead5aa; }
.map-main-panel :deep(.map-viewport) {
  background: transparent;
}
.map-main-panel :deep(.map-viewport.in-page-fullscreen) {
  background-color: var(--strategy-canvas);
  background-image: var(--strategy-atmosphere);
}
.map-main-panel :deep(.tool-btn),
.map-main-panel :deep(.fullscreen-close-btn) {
  border: 1px solid var(--detail-line); border-radius: 50%;
  background: var(--detail-surface); color: var(--detail-brass); opacity: 1;
  box-shadow: 0 2px 8px rgba(0,0,0,.2); transform: none;
  transition: color .18s ease, border-color .18s ease, background-color .18s ease;
}
.map-main-panel :deep(.tool-btn:hover),
.map-main-panel :deep(.fullscreen-close-btn:hover) { color: #f0d8ab; border-color: #917345; background: #2a3740; transform: none; }
.map-main-panel :deep(.tool-btn:active) { background: var(--detail-brass); color: var(--detail-ink); transform: none; }
.reference-dialog { inset-inline-end: max(0px, calc((100vw - var(--strategy-max-width)) / 2)); border-left: 1px solid var(--detail-line); background: var(--detail-surface); color: var(--text-light); color-scheme: dark; }
.reference-dialog .parchment-card { background: transparent; color: inherit; }
.reference-dialog .sidebar-title { color: #e1c795; border-color: var(--detail-line); }
.reference-dialog .entry-img-container { border-color: var(--detail-line); }
.reference-dialog .sidebar-info-box { background: transparent; padding-inline: 0; }
.reference-dialog .info-item .label { color: var(--detail-muted); }
.reference-dialog .tab-btn { background: transparent; color: var(--detail-muted); border: 1px solid var(--detail-line); box-shadow: none; transform: none; }
.reference-dialog .tab-btn:hover { color: #f0d8ab; border-color: var(--detail-brass); }
.reference-dialog .tab-btn.active { background: var(--detail-brass); color: var(--detail-ink); border-color: var(--detail-brass); }
.reference-dialog :deep(.legend-box) { border-color: var(--detail-line); }
.reference-dialog :deep(.legend-label) { color: var(--text-light); }
.reference-dialog :deep(.legend-title) { color: var(--detail-muted); }
.reference-heading { color: #e1c795; border-bottom: 1px solid var(--detail-line); padding-bottom: 8px; }
@media (max-width: 768px) {
  .control-bar { grid-template-columns: auto minmax(0, 1fr) auto; }
  .map-title-container { flex-wrap: wrap; gap: 0 6px; }
  .floor-toggle-wrapper { grid-column: 1 / -1; grid-row: 2; justify-content: center; }
  .reference-trigger { grid-column: 3; grid-row: 1; }
  .btn-back { padding: 4px; }
  .reference-dialog { inset: auto 0 0; width: 100%; height: auto; max-height: 80dvh; border-radius: 12px 12px 0 0; padding-bottom: max(16px, env(safe-area-inset-bottom)); }
  .control-bar { padding: 0 8px 5px; gap: 0 6px; }
  .map-title-container { justify-content: center; padding-left: 0; border-left: 0; }
  .map-title { font-size: .98rem; letter-spacing: .02em; }
  .map-direction-badge { font-size: .7rem; }
  .control-bar .reference-trigger { padding: 4px 6px; }
  .floor-toggle-wrapper :deep(.floor-switch) { width: min(100%, 320px); background: transparent; border: 0; padding: 0; }
  .floor-toggle-wrapper :deep(.switch-btn) { min-width: 0; padding: 5px 10px; }
  .reference-dialog { border-left: 0; border-top: 1px solid var(--detail-line); }
  .control-bar .btn-back { font-size: .85rem; }
  .control-bar .reference-trigger { font-size: .8rem; }
}
@media (prefers-reduced-motion: reduce) {
  .control-bar button, .floor-toggle-wrapper :deep(.switch-btn), .map-main-panel :deep(.tool-btn) { transition: none; }
}
</style>

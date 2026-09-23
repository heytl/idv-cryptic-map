<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ENTRANCE_LABELS, MODE_LABELS, type EntranceType, type GameMode } from "@idv-map/shared";
import { gameMaps, enabledEntranceTypesV2 } from "../data/maps-v2";

const props = defineProps<{ gameMapId: string; mode: GameMode; entrance: EntranceType }>();
const emit = defineEmits<{ apply: [gameMapId: string, mode: GameMode, entrance: EntranceType] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const expanded = ref(false);
const draftMap = ref(props.gameMapId);
const draftMode = ref(props.mode);
const mapName = computed(() => gameMaps.find(m => m.id === props.gameMapId)?.name);
const allowedEntrances = computed(() => enabledEntranceTypesV2(draftMode.value));

function open() {
  draftMap.value = props.gameMapId;
  draftMode.value = props.mode;
  dialog.value?.showModal();
  expanded.value = true;
}
function close() { dialog.value?.close(); }
watch(expanded, (isOpen) => {
  if (typeof document === "undefined") return;
  if (isOpen) {
    document.documentElement.classList.add("condition-dialog-open");
    document.body.classList.add("condition-dialog-open");
  } else {
    document.documentElement.classList.remove("condition-dialog-open");
    document.body.classList.remove("condition-dialog-open");
  }
});
function onClose() {
  expanded.value = false;
  trigger.value?.focus();
}
function selectMode(mode: GameMode) {
  draftMode.value = mode;
}
function selectMap(gameMapId: string) {
  draftMap.value = gameMapId;
}
function selectEntrance(entrance: EntranceType) {
  emit("apply", draftMap.value, draftMode.value, entrance);
  close();
}
function onBackdrop(event: MouseEvent) {
  if (!dialog.value || event.target !== dialog.value) return;
  const box = dialog.value.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
}
</script>

<template>
  <div class="catalog-conditions">
    <button ref="trigger" class="condition-summary" aria-haspopup="dialog" :aria-expanded="expanded" @click="open">
      <span>{{ mapName }}</span><span class="condition-dot" aria-hidden="true">·</span>
      <span>{{ MODE_LABELS[mode] }}</span><span class="condition-dot" aria-hidden="true">·</span>
      <span>{{ ENTRANCE_LABELS[entrance] }}</span>
      <svg class="condition-chevron" :class="{ expanded }" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg>
      <span class="sr-only">，选择条件</span>
    </button>
    <dialog ref="dialog" class="condition-dialog" aria-labelledby="condition-title" @close="onClose" @click="onBackdrop">
      <div>
        <header class="condition-dialog-heading">
          <div>
            <h2 id="condition-title">选择条件</h2>
            <p class="condition-hint">点击入口后立即查看布局</p>
          </div>
          <button type="button" class="condition-close" aria-label="关闭条件选择" @click="close">×</button>
        </header>
        <div class="condition-field" role="group" aria-label="地图">
          <span class="condition-label">地图</span>
          <p v-if="gameMaps.length === 1" class="condition-map-name">{{ gameMaps[0]?.name }}</p>
          <div v-else class="condition-options">
            <button v-for="map in gameMaps" :key="map.id" type="button" class="tab-btn" :class="{ active: draftMap === map.id }" :aria-pressed="draftMap === map.id" @click="selectMap(map.id)">{{ map.name }}</button>
          </div>
        </div>
        <div class="condition-field" role="group" aria-label="模式">
          <span class="condition-label">模式</span>
          <div class="condition-options">
            <button v-for="item in ['hard', 'nightmare'] as const" :key="item" type="button" class="tab-btn" :class="{ active: draftMode === item }" :aria-pressed="draftMode === item" @click="selectMode(item)">{{ MODE_LABELS[item] }}</button>
          </div>
        </div>
        <div class="condition-field" role="group" aria-label="入口">
          <span class="condition-label">入口</span>
          <div class="condition-options">
            <button v-for="item in allowedEntrances" :key="item" type="button" class="tab-btn" :class="{ active: entrance === item }" :aria-pressed="entrance === item" @click="selectEntrance(item)">{{ ENTRANCE_LABELS[item] }}</button>
          </div>
        </div>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.catalog-conditions { text-align: center; }
.condition-summary { display: inline-flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 6px; width: 100%; max-width: 100%; min-height: 44px; padding: 4px 8px; border: 1px solid transparent; border-radius: 4px; background: transparent; color: var(--text-dark); font: inherit; font-size: .95rem; font-weight: 700; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.condition-summary { transition: color .18s ease; }
.condition-summary:hover, .condition-summary[aria-expanded="true"] { color: #76501f; }
.condition-summary:active { color: inherit; background: transparent; }
.condition-summary:focus-visible, .condition-dialog button:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
.condition-dot { opacity: .55; }
.condition-chevron { width: 18px; height: 18px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.7; transition: transform .18s ease; }
.condition-chevron.expanded { transform: rotate(180deg); }
.condition-dialog { position: fixed; inset: 0; margin: auto; width: min(460px, calc(100% - 32px)); max-height: 85dvh; overflow: hidden; overscroll-behavior: none; touch-action: none; padding: 22px; color: var(--text-dark); background: var(--parchment-light); border: 1px solid var(--parchment-dark); border-radius: 8px; box-shadow: 0 18px 60px rgba(26,20,16,.4); text-align: left; }
.condition-dialog::backdrop { background: rgba(26,20,16,.65); }
.condition-dialog-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.condition-dialog-heading h2 { font-size: 1.15rem; margin: 0; }
.condition-hint { margin: 5px 0 0; color: #695b46; font-size: .82rem; line-height: 1.4; }
.condition-close { width: 44px; height: 44px; margin-right: -10px; border: 0; background: transparent; color: #695b46; font-size: 26px; cursor: pointer; }
.condition-close:hover { color: var(--text-dark); }
.condition-field { display: grid; grid-template-columns: 42px minmax(0, 1fr); align-items: start; column-gap: 14px; margin: 16px 0; }
.condition-label { padding-top: 12px; font-size: .85rem; color: #695b46; }
.condition-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.condition-options .tab-btn { min-width: 0; min-height: 44px; padding: 9px 24px; overflow-wrap: anywhere; border: 1px solid var(--parchment-dark); border-radius: 4px; background: transparent; color: var(--text-dark); box-shadow: none; transform: none; font-size: .95rem; font-weight: 500; }
.condition-options .tab-btn:hover { border-color: var(--gold-dark); color: #76501f; }
.condition-options .tab-btn.active { background: var(--gold-dark); color: #fff7e8; border-color: var(--gold-dark); }
.condition-options .tab-btn.active::after { content: '✓'; position: absolute; right: 10px; font-size: 12px; }
.condition-map-name { margin: 0; padding: 11px 0; font-weight: 500; }
:global(html.condition-dialog-open), :global(body.condition-dialog-open) { overflow: hidden; }
@media (max-width: 768px) {
  .condition-summary { gap: 5px; padding: 2px 0; font-size: .9rem; }
  .condition-dialog { inset: auto 0 0; margin: 0; width: 100%; max-width: none; max-height: 85dvh; border-radius: 14px 14px 0 0; padding: 16px 20px max(20px, env(safe-area-inset-bottom)); }
}
@media (prefers-reduced-motion: reduce) { .condition-chevron, .condition-summary { transition: none; } }
</style>

<script setup lang="ts">
import { computed, ref, shallowRef, watch, onBeforeUnmount } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { GAME_MODES, MODE_LABELS, ENTRANCE_LABELS, projectInfo, enabledEntranceTypesV2, isCatalogFilterV2,
  catalogFilterValuesV2, catalogFilterLabelV2, entranceFilterValueV2, entranceFilterLabelV2, findEntranceV2,
  type GameMode, type EntranceType, type CatalogFilterV2, type PublicMapConfigV4 } from "@idv-map/shared";
import { content } from "../../services/content";
import { catalogPreferences } from "../../services/catalog-preferences";
import UiIcon from "../../components/UiIcon.vue";
import { createPullRefresh } from "../../services/pull-refresh";

const config = shallowRef<PublicMapConfigV4>();
const gameMapId = ref("");
const mode = ref<GameMode>("hard");
const entrance = ref<EntranceType>("side");
const filter = ref<CatalogFilterV2 | "">("");
const error = ref("");
const loading = ref(false);
const conditionsOpen = ref(false);
const draftMap = ref("");
const draftMode = ref<GameMode>("hard");
const compact = ref(false);
let initialized = false;
let disposed = false;
try { compact.value = uni.getStorageSync("idv-catalog-compact") === "1"; } catch { /* Optional preference. */ }
watch(compact, value => { try { uni.setStorageSync("idv-catalog-compact", value ? "1" : "0"); } catch { /* Session only. */ } });
const mapName = computed(() => config.value?.gameMaps.find(map => map.id === gameMapId.value)?.name ?? "选择地图");
const cards = computed(() => (config.value?.layouts ?? [])
  .filter(l => l.gameMapId === gameMapId.value && l.mode === mode.value)
  .flatMap(layout => {
    const entry = findEntranceV2(layout, entrance.value);
    return entry && (!filter.value || entranceFilterValueV2(entry) === filter.value) ? [{ layout, entry }] : [];
  })
  .sort((a, b) => a.layout.sort - b.layout.sort || a.layout.id - b.layout.id));
const filters = computed(() => catalogFilterValuesV2(entrance.value).map(value => ({ value, label: catalogFilterLabelV2(entrance.value, value) })));
const entrances = computed(() => enabledEntranceTypesV2(draftMode.value));

async function load(refresh = false) {
  if (loading.value) return;
  loading.value = true; error.value = "";
  try {
    const data = await content.load(refresh);
    if (disposed) return;
    config.value = data;
    if (!initialized) {
      const preferred = catalogPreferences.read(data.gameMaps);
      if (preferred) { gameMapId.value = preferred.gameMapId; mode.value = preferred.mode; entrance.value = preferred.entrance; }
      initialized = true;
    } else if (!data.gameMaps.some(m => m.id === gameMapId.value)) {
      gameMapId.value = data.gameMaps[0]?.id ?? "";
    }
  } catch (cause) { if (!disposed) error.value = cause instanceof Error ? cause.message : "加载失败"; }
  finally { if (!disposed) loading.value = false; }
}
function openConditions() {
  draftMap.value = gameMapId.value; draftMode.value = mode.value; conditionsOpen.value = true;
}
function applyConditions(next: EntranceType) {
  gameMapId.value = draftMap.value; mode.value = draftMode.value; entrance.value = next;
  if (filter.value && !isCatalogFilterV2(next, filter.value)) filter.value = "";
  conditionsOpen.value = false;
  catalogPreferences.remember({ gameMapId: gameMapId.value, mode: mode.value, entrance: entrance.value });
}
function openLayout(id: number) {
  uni.navigateTo({ url: `/pages/strategy/index?gameMapId=${encodeURIComponent(gameMapId.value)}&layoutId=${id}&entrance=${entrance.value}` });
}
function openAbout() { uni.navigateTo({ url: "/pages/about/index" }); }
onLoad(() => { void load(); });
onBeforeUnmount(() => { disposed = true; });
async function refreshMaps() { await load(true); return !error.value; }
const { threshold, phase, progress, triggered, label, hint, pulling, reset, refresh, dispose } =
  createPullRefresh(refreshMaps, () => conditionsOpen.value || loading.value);
onBeforeUnmount(dispose);
</script>

<template>
  <scroll-view class="map-scroll" :scroll-y="!conditionsOpen" :refresher-enabled="!conditionsOpen"
    refresher-default-style="none" refresher-background="#151d23" :refresher-threshold="threshold"
    :refresher-triggered="triggered" @refresherpulling="pulling" @refresherrefresh="refresh"
    @refresherrestore="reset" @refresherabort="reset">
    <view slot="refresher" class="treasure-refresh" :class="phase" role="status" :aria-label="label">
      <view class="treasure" aria-hidden="true" :style="{ transform: `scale(${0.8 + progress * 0.2})` }">
        <view class="rays" :style="{ opacity: progress * 0.55 }" />
        <view class="spark spark-one" /><view class="spark spark-two" /><view class="spark spark-three" />
        <view class="chest-lid" :style="{ transform: `translateY(${-progress * 3}px) rotate(${-progress * 5}deg)` }" />
        <view class="chest-body"><view class="chest-band band-left" /><view class="chest-band band-right" /></view>
        <view class="chest-lock" />
        <view class="result-mark">{{ phase === 'success' ? '✓' : phase === 'error' ? '!' : '' }}</view>
      </view>
      <view class="refresh-copy"><text class="refresh-label">{{ label }}</text><text class="refresh-hint">{{ hint }}</text></view>
    </view>
    <view class="catalog">
      <view v-if="error" class="status"><text>{{ error }}</text><button @tap="load(true)">重试</button></view>
      <view v-else-if="loading && !config" class="status">正在读取地图…</view>
      <view v-if="config" class="paper">
        <view class="paper-inner">
          <view class="catalog-toolbar">
            <button class="condition-summary" aria-label="选择地图、模式和入口" :aria-expanded="conditionsOpen" @tap="openConditions">
              <text>{{ mapName }} · {{ MODE_LABELS[mode] }} · {{ ENTRANCE_LABELS[entrance] }}</text><view class="chevron" />
            </button>
            <view class="density" :class="{ 'compact-active': compact }" role="group" aria-label="卡片密度切换">
              <view class="density-track" /><view class="density-slider" />
              <button :class="{ selected: !compact }" hover-class="density-pressed" aria-label="标准卡片视图" :aria-pressed="!compact" @tap="compact = false"><UiIcon name="comfort" :tone="compact ? 'light' : 'ink'" :size="14" /></button>
              <button :class="{ selected: compact }" hover-class="density-pressed" aria-label="紧凑卡片视图" :aria-pressed="compact" @tap="compact = true"><UiIcon name="compact" :tone="compact ? 'ink' : 'light'" :size="14" /></button>
            </view>
          </view>
          <view class="filter-row" :class="{ passage: entrance === 'front' }">
            <text class="filter-label">{{ entrance === 'front' ? '通道' : '方向' }}</text>
            <view class="filter-options">
              <button :class="{ selected: !filter }" hover-class="filter-pressed" :aria-pressed="!filter" @tap="filter = ''"><view class="filter-face">全部<text v-if="!filter" class="count">({{ cards.length }})</text></view></button>
              <button v-for="item in filters" :key="item.value" :class="{ selected: filter === item.value }" hover-class="filter-pressed" :aria-pressed="filter === item.value" @tap="filter = item.value"><view class="filter-face">{{ item.label }}<text v-if="filter === item.value" class="count">({{ cards.length }})</text></view></button>
            </view>
          </view>
          <view class="cards" :class="{ compact }">
            <button v-for="item in cards" :key="item.entry.id" class="card" hover-class="card-pressed" :aria-label="`${item.layout.displayName}，${item.entry.typeLabel}，${entranceFilterLabelV2(item.entry)}`" @tap="openLayout(item.layout.id)">
              <view class="thumbnail"><image :src="item.entry.thumbUrl" :webp="true" mode="aspectFill" :lazy-load="true" /></view>
              <text class="card-title">{{ item.layout.displayName }}</text>
              <text v-if="!compact" class="card-direction">{{ item.entry.typeLabel }} · {{ entranceFilterLabelV2(item.entry) }}</text>
            </button>
          </view>
          <view v-if="!cards.length" class="status">暂无符合条件的地图，请切换筛选条件</view>
        </view>
      </view>
      <view class="catalog-footer">
        <button class="footer-link" hover-class="footer-pressed" aria-label="关于手册" @tap="openAbout">
          <view class="footer-copyright"><text>© 2026 OUU 第五人格</text><text> · {{ projectInfo.name }}</text></view>
          <view class="footer-about"><text class="footer-about-label">关于手册</text><view class="footer-chevron" aria-hidden="true" /></view>
        </button>
      </view>
    </view>
  </scroll-view>
  <view v-if="conditionsOpen && config" class="conditions-overlay">
    <view class="conditions-scrim" @tap="conditionsOpen = false" @touchmove.stop.prevent />
    <view class="condition-sheet" role="dialog" aria-label="选择条件" aria-modal="true">
      <view class="sheet-heading"><view><text class="sheet-title">选择条件</text><text class="sheet-hint">点击入口后立即查看布局</text></view><button class="close" aria-label="关闭条件选择" @tap="conditionsOpen = false">×</button></view>
      <scroll-view :scroll-y="true" class="condition-fields" @touchmove.stop>
        <view class="condition-field"><text class="field-label">地图</text>
          <text v-if="config.gameMaps.length === 1" class="single-map">{{ config.gameMaps[0]?.name }}</text>
          <view v-else class="condition-options"><button v-for="map in config.gameMaps" :key="map.id" :class="{ selected: draftMap === map.id }" :aria-pressed="draftMap === map.id" @tap="draftMap = map.id">{{ map.name }}</button></view>
        </view>
        <view class="condition-field"><text class="field-label">模式</text><view class="condition-options"><button v-for="item in GAME_MODES" :key="item" :class="{ selected: draftMode === item }" :aria-pressed="draftMode === item" @tap="draftMode = item">{{ MODE_LABELS[item] }}<text v-if="draftMode === item" class="check">✓</text></button></view></view>
        <view class="condition-field"><text class="field-label">入口</text><view class="condition-options"><button v-for="item in entrances" :key="item" @tap="applyConditions(item)">{{ ENTRANCE_LABELS[item] }}</button></view></view>
      </scroll-view>
    </view>
  </view>
</template>

<style scoped>
.map-scroll { height: 100vh; }
.treasure-refresh { width: 100vw; height: 100px; display: flex; align-items: center; justify-content: center; gap: 18px; overflow: hidden; color: #e6c98d; }
.refresh-copy { display: flex; flex-direction: column; gap: 6px; }
.refresh-label { font-size: 13px; font-weight: bold; }
.refresh-hint { color: #afa99b; font-size: 11px; }
.treasure { position: relative; width: 56px; height: 56px; flex: none; transition: transform .12s ease-out; }
.chest-body { position: absolute; left: 4px; bottom: 5px; width: 48px; height: 27px; border: 2px solid #e0bc70; border-radius: 2px 2px 6px 6px; background: linear-gradient(135deg, #94632b, #48331c); box-shadow: inset 0 -4px 0 #39291b, 0 4px 8px #0005; overflow: hidden; }
.chest-band { position: absolute; width: 5px; height: 100%; background: #c5a05a; border: 1px solid #f4d996; }
.band-left { left: 6px; }.band-right { right: 6px; }
.chest-lid { position: absolute; z-index: 2; left: 3px; top: 13px; width: 50px; height: 17px; border: 2px solid #e0bc70; border-radius: 11px 11px 2px 2px; background: linear-gradient(#d4ab58, #805522); transform-origin: 8% 100%; transition: transform .35s ease; }
.chest-lock { position: absolute; z-index: 3; top: 27px; left: 24px; width: 9px; height: 11px; border: 2px solid #ffe2a0; border-radius: 2px; background: #725120; transition: opacity .2s; }
.rays { position: absolute; inset: -14px; border-radius: 50%; background: radial-gradient(ellipse, #ffe5a4aa, #d8a64622 48%, transparent 70%); transition: opacity .3s; }
.spark { position: absolute; z-index: 4; width: 4px; height: 4px; background: #ffe7a5; opacity: 0; transform: rotate(45deg); }
.spark-one { left: 7px; top: 6px; }.spark-two { right: 5px; top: 15px; }.spark-three { left: 27px; top: 0; }
.ready .treasure { animation: chest-ready .65s ease-in-out infinite; }
.loading .chest-lid, .success .chest-lid { transform: translateY(-12px) rotate(-24deg) !important; }
.loading .chest-lock, .success .chest-lock { opacity: 0; }
.loading .rays { animation: chest-glow 1.1s ease-in-out infinite; }
.loading .spark, .success .spark { animation: chest-spark 1.1s ease-out infinite; }
.loading .spark-two, .success .spark-two { animation-delay: .3s; }
.loading .spark-three, .success .spark-three { animation-delay: .6s; }
.result-mark { position: absolute; z-index: 5; top: 14px; left: 21px; color: #fff1c8; font-size: 23px; font-weight: bold; }
.success .result-mark { animation: chest-result .3s ease-out; }
.error .refresh-label, .error .result-mark { color: #efb6a2; }
@keyframes chest-ready { 0%, 100% { transform: rotate(-2deg); } 50% { transform: rotate(2deg); } }
@keyframes chest-glow { 0%, 100% { opacity: .4; transform: scale(.9); } 50% { opacity: 1; transform: scale(1.15); } }
@keyframes chest-spark { 0% { opacity: 0; transform: translateY(10px) rotate(45deg) scale(.5); } 40% { opacity: 1; } 100% { opacity: 0; transform: translateY(-15px) rotate(100deg); } }
@keyframes chest-result { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .treasure, .rays, .spark, .result-mark { animation: none !important; transition: none; } .chest-lid { transition: none; } }

.catalog { padding: 12px 10px calc(8px + env(safe-area-inset-bottom)); }
.catalog-footer { display: flex; justify-content: center; margin-top: 10px; }
.footer-copyright { color: #afa99b; font-size: 11px; line-height: 1.5; text-align: center; }
.footer-link { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-height: 44px; padding: 2px 12px; border: 0; background: transparent; color: var(--gold); font-family: inherit; font-size: 13px; }
.footer-about { display: flex; align-items: center; justify-content: center; gap: 4px; height: 18px; }
.footer-about-label { display: block; line-height: 18px; }
.footer-chevron { flex: none; width: 5px; height: 5px; border-top: 1px solid currentColor; border-right: 1px solid currentColor; transform: rotate(45deg); }
.footer-pressed { color: #e1bf86; }
.paper { padding: 4px; background: var(--parchment); color: var(--ink); border: 1px solid var(--parchment-border); border-radius: 4px; }
.paper-inner { padding: 8px; border: 2px dashed #928469; }
.catalog-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.condition-summary { display: flex; align-items: center; justify-content: center; flex: 1; min-width: 0; min-height: 44px; padding: 4px; color: var(--ink); background: transparent; border: 0; font-weight: 700; font-size: 13px; }
.condition-summary text { min-width: 0; }
.chevron { width: 7px; height: 7px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg); margin: -3px 4px 0 8px; flex: none; }
.density { position: relative; display: flex; flex: none; width: 88px; height: 44px; }
.density-track { position: absolute; top: 8px; left: 0; width: 100%; height: 28px; border: 1px solid var(--gold-dark); border-radius: 14px; background: #0a0b0d; pointer-events: none; }
.density-slider { position: absolute; top: 10px; left: 2px; width: 42px; height: 24px; border-radius: 12px; background: var(--gold); pointer-events: none; transition: transform .2s ease; }
.compact-active .density-slider { transform: translateX(42px); }
.density button { position: relative; z-index: 1; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 0; background: transparent; opacity: .55; }
.density button.selected, .density button.density-pressed { opacity: 1; }
.filter-row { display: flex; align-items: center; margin-bottom: 6px; }
.filter-label { display: none; color: #695b46; font-size: 12px; margin-right: 6px; flex: none; }
.filter-options { display: flex; flex: 1; min-width: 0; }
.filter-options button { display: flex; align-items: center; justify-content: center; flex: 1 1 0%; height: 44px; min-width: 0; padding: 0; margin-right: 4px; border: 0; border-radius: 0; background: transparent; }
.filter-options button:last-child { margin-right: 0; }
.filter-face { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 36px; padding: 6px 2px; border: 1px solid var(--gold-dark); border-radius: 2px; background: #14161a; color: var(--gold); font-size: 12px; line-height: 1; white-space: nowrap; box-shadow: 0 3px 6px rgba(0,0,0,.3); }
.filter-options button.selected .filter-face { background: var(--gold-dark); border-color: var(--gold); color: var(--parchment-light); box-shadow: 0 4px 8px rgba(43,34,22,.35); }
.filter-pressed .filter-face { transform: translateY(1px); box-shadow: 0 1px 3px rgba(0,0,0,.35); }
.passage .filter-options button.selected { flex-grow: 1.35; }
.count { font-size: 10px; margin-left: 3px; }
@media (min-width: 769px) { .filter-label { display: block; } }
.cards { display: flex; flex-wrap: wrap; justify-content: flex-start; }
.card { display: flex; flex-direction: column; align-items: center; width: calc((100% - 12px) / 2); min-width: 0; padding: 10px; margin-right: 12px; margin-bottom: 12px; border: 1px solid var(--parchment-border); border-radius: 4px; background: var(--parchment-light); color: var(--ink); box-shadow: 0 4px 10px rgba(0,0,0,.15); }
.card-pressed { border-color: var(--gold); background: #e3d8c1; }
.card:nth-child(2n) { margin-right: 0; }
.thumbnail { width: 100%; padding-top: 100%; position: relative; background: #0a0b0d; border-radius: 2px; overflow: hidden; }
.thumbnail image { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
.card-title { display: block; width: 100%; text-align: center; color: var(--ink); font-weight: bold; font-size: 14px; line-height: 1.5; margin: 10px 0 4px; }
.card-direction { padding: 2px 8px; background: rgba(43,34,22,.1); border-radius: 10px; color: var(--ink); font-size: 12px; line-height: 1.4; font-weight: bold; }
.compact .card { width: calc((100% - 16px) / 3); padding: 6px; margin-right: 8px; margin-bottom: 8px; }
.compact .card:nth-child(3n) { margin-right: 0; }
.compact .card-title { font-size: 12px; margin-bottom: 0; }
.conditions-overlay { position: fixed; inset: 0; z-index: 30; display: flex; align-items: flex-end; }
.conditions-scrim { position: absolute; inset: 0; background: rgba(26,20,16,.65); }
.condition-sheet { position: relative; display: flex; flex-direction: column; width: 100%; max-height: 85vh; overflow: hidden; padding: 16px 20px calc(20px + env(safe-area-inset-bottom)); border-radius: 14px 14px 0 0; background: var(--parchment-light); color: var(--ink); }
.sheet-heading { display: flex; flex: none; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.sheet-title { display: block; font-size: 18px; font-weight: bold; line-height: 1.5; }
.sheet-hint { display: block; color: #695b46; font-size: 12px; margin-top: 4px; }
.close { width: 44px; height: 44px; padding: 0; line-height: 44px; margin-right: -8px; border: 0; background: transparent; color: #695b46; font-size: 26px; }
.condition-fields { height: 220px; max-height: calc(85vh - 112px - env(safe-area-inset-bottom)); min-height: 0; }
.condition-field { display: flex; align-items: flex-start; margin-bottom: 16px; }
.field-label { flex: none; width: 42px; margin-right: 14px; padding-top: 12px; color: #695b46; font-size: 13px; }
.single-map { padding-top: 11px; line-height: 22px; }
.condition-options { flex: 1; display: flex; flex-wrap: wrap; justify-content: space-between; }
.condition-options button { position: relative; min-height: 44px; width: calc((100% - 8px) / 2); margin-bottom: 8px; padding: 10px 20px; border: 1px solid var(--parchment-border); border-radius: 4px; background: transparent; color: var(--ink); }
.condition-options button.selected { background: var(--gold-dark); border-color: var(--gold-dark); color: #fff7e8; }
.check { position: absolute; right: 8px; }
</style>

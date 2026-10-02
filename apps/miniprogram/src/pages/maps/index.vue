<script setup lang="ts">
import { computed, ref, shallowRef } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { GAME_MODES, MODE_LABELS, ENTRANCE_LABELS, defaultEntranceV2, enabledEntranceTypesV2,
  catalogFilterValuesV2, catalogFilterLabelV2, entranceFilterValueV2, entranceFilterLabelV2, findEntranceV2,
  type GameMode, type EntranceType, type CatalogFilterV2, type PublicMapConfigV4 } from "@idv-map/shared";
import { content } from "../../services/content";

const config = shallowRef<PublicMapConfigV4>();
const gameMapId = ref("");
const mode = ref<GameMode>("hard");
const entrance = ref<EntranceType>("side");
const filter = ref<CatalogFilterV2 | "">("");
const error = ref("");
const loading = ref(false);
const cards = computed(() => (config.value?.layouts ?? [])
  .filter(l => l.gameMapId === gameMapId.value && l.mode === mode.value)
  .flatMap(layout => {
    const entry = findEntranceV2(layout, entrance.value);
    return entry && (!filter.value || entranceFilterValueV2(entry) === filter.value) ? [{ layout, entry }] : [];
  })
  .sort((a, b) => a.layout.sort - b.layout.sort || a.layout.id - b.layout.id));
const filters = computed(() => catalogFilterValuesV2(entrance.value).map(value => ({ value, label: catalogFilterLabelV2(entrance.value, value) })));
const entrances = computed(() => enabledEntranceTypesV2(mode.value));

async function load(refresh = false) {
  loading.value = true; error.value = "";
  try {
    config.value = await content.load(refresh);
    if (!config.value.gameMaps.some(m => m.id === gameMapId.value)) gameMapId.value = config.value.gameMaps[0]?.id ?? "";
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "加载失败"; }
  finally { loading.value = false; }
}
function setMode(next: GameMode) { mode.value = next; entrance.value = defaultEntranceV2(next); filter.value = ""; }
function setEntrance(next: EntranceType) { entrance.value = next; filter.value = ""; }
function openLayout(id: number) {
  uni.navigateTo({ url: `/pages/strategy/index?gameMapId=${encodeURIComponent(gameMapId.value)}&layoutId=${id}&entrance=${entrance.value}` });
}
onLoad(() => { void load(); });
</script>

<template>
  <view class="catalog">
    <text class="heading">加页手记</text>
    <text class="muted">选择入口特征，查阅完整地图</text>
    <view v-if="error" class="status"><text>{{ error }}</text><button @tap="load(true)">重试</button></view>
    <view v-else-if="loading && !config" class="status">正在读取地图…</view>
    <view v-if="config">
      <view class="row maps"><button v-for="map in config.gameMaps" :key="map.id" :class="{ active: gameMapId === map.id }" @tap="gameMapId = map.id; filter = ''">{{ map.name }}</button></view>
      <view class="row"><button v-for="item in GAME_MODES" :key="item" :class="{ active: mode === item }" @tap="setMode(item)">{{ MODE_LABELS[item] }}</button></view>
      <view class="row"><button v-for="item in entrances" :key="item" :class="{ active: entrance === item }" @tap="setEntrance(item)">{{ ENTRANCE_LABELS[item] }}</button></view>
      <view class="row filters"><button :class="{ active: !filter }" @tap="filter = ''">全部</button><button v-for="item in filters" :key="item.value" :class="{ active: filter === item.value }" @tap="filter = item.value">{{ item.label }}</button></view>
      <view class="summary"><text class="muted">共 {{ cards.length }} 张地图</text><button :disabled="loading" @tap="load(true)">{{ loading ? '刷新中…' : '刷新' }}</button></view>
      <view class="cards">
        <view v-for="item in cards" :key="item.layout.id" class="card" hover-class="card-pressed" @tap="openLayout(item.layout.id)">
          <image :src="item.entry.thumbUrl" mode="aspectFit" :lazy-load="true" />
          <text class="card-title">{{ item.layout.displayName }}</text>
          <text class="muted">{{ entranceFilterLabelV2(item.entry) }}</text>
        </view>
      </view>
      <view v-if="!cards.length" class="status">暂无符合条件的地图，请切换筛选条件</view>
    </view>
  </view>
</template>

<style scoped>
.catalog { padding: 20px 16px calc(24px + env(safe-area-inset-bottom)); }
.row { display: flex; flex-wrap: wrap; margin-top: 8px; }
.row button { margin: 0 8px 8px 0; }
.maps { margin-top: 20px; }
.filters button { font-size: 12px; padding: 8px 12px; }
.summary { display: flex; align-items: center; justify-content: space-between; margin: 12px 0; }
.summary button { padding: 8px 12px; }
.cards { display: flex; flex-wrap: wrap; justify-content: space-between; }
.card { width: 48%; border: 1px solid #454a49; background: #1c272f; border-radius: 10px; padding: 10px; margin-bottom: 12px; }
.card-pressed { border-color: #c3a168; }
.card image { display: block; width: 100%; height: 140px; background: #12191f; border-radius: 6px; }
.card-title { display: block; color: #e1c795; margin: 10px 0 4px; }
</style>

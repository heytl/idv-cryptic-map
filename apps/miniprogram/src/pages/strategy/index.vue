<script setup lang="ts">
import { computed, ref, shallowRef, nextTick } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { DEFAULT_FLOOR, FLOOR_LABELS, ENTRANCE_LABELS, availableFloors, resolveFloorSource,
  findEntranceV2, enabledEntranceTypesV2, entranceFilterLabelV2, type FloorType, type EntranceType, type PublicLayoutV4 } from "@idv-map/shared";
import MapViewport from "../../components/MapViewport.vue";
import { content } from "../../services/content";

const layout = shallowRef<PublicLayoutV4>();
const entranceType = ref<EntranceType>("side");
const floor = ref<FloorType>(DEFAULT_FLOOR);
const referenceOpen = ref(false);
const error = ref("");
const loading = ref(false);
const focused = ref(false);
const viewer = ref<InstanceType<typeof MapViewport>>();
let params: Record<string, string | undefined> = {};
const floors = computed(() => layout.value ? availableFloors(layout.value) : []);
const source = computed(() => layout.value ? resolveFloorSource(layout.value, floor.value) : undefined);
const entrance = computed(() => layout.value ? findEntranceV2(layout.value, entranceType.value) : undefined);
const entrances = computed(() => layout.value?.entrances.filter(e => enabledEntranceTypesV2(layout.value!.mode).includes(e.type)) ?? []);

async function load() {
  loading.value = true; error.value = "";
  try {
    const data = await content.load();
    const selected = data.layouts.find(l => l.id === Number(params.layoutId) && l.gameMapId === params.gameMapId);
    if (!selected) throw new Error("地图不存在或已下架，请返回目录刷新");
    layout.value = selected;
    const allowed = selected.entrances.filter(e => enabledEntranceTypesV2(selected.mode).includes(e.type));
    const entry = allowed.find(e => e.type === params.entrance) ?? allowed[0];
    if (!entry) throw new Error("此地图暂无可用入口");
    entranceType.value = entry.type;
    floor.value = DEFAULT_FLOOR;
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "加载失败"; }
  finally { loading.value = false; }
}
async function toggleFocus() { focused.value = !focused.value; await nextTick(); viewer.value?.measure(); }
function back() { uni.navigateBack({ fail: () => uni.reLaunch({ url: "/pages/maps/index" }) }); }
onLoad(query => { params = query ?? {}; void load(); });
</script>

<template>
  <view class="strategy">
    <view v-if="loading" class="status">正在加载地图…</view>
    <view v-else-if="error" class="status"><text>{{ error }}</text><button @tap="load">重试</button><button @tap="back">返回目录</button></view>
    <template v-else-if="layout && source">
      <view v-if="!focused" class="header">
        <view class="title-row"><button @tap="back">‹ 返回</button><view class="title"><text>{{ layout.displayName }}</text><text v-if="entrance" class="muted">{{ entrance.typeLabel }} · {{ entranceFilterLabelV2(entrance) }}</text></view><button @tap="referenceOpen = true">入口参考</button></view>
        <view class="floors"><button v-for="item in floors" :key="item" :class="{ active: floor === item }" @tap="floor = item">{{ FLOOR_LABELS[item] }}</button></view>
      </view>
      <view class="map-panel"><MapViewport ref="viewer" :source="source" /></view>
      <button class="focus" @tap="toggleFocus">{{ focused ? '退出全屏' : '全屏查看' }}</button>
    </template>
    <view v-if="referenceOpen && entrance && layout" class="backdrop" @tap="referenceOpen = false" @touchmove.stop.prevent>
      <view class="sheet" @tap.stop>
        <view class="sheet-heading"><text>入口参考与备注</text><button @tap="referenceOpen = false">关闭</button></view>
        <scroll-view :scroll-y="true" class="sheet-content">
          <image :src="entrance.imageUrl" mode="widthFix" class="entrance-image" />
          <text class="remark">{{ layout.remarks }}</text>
          <view class="entrances"><button v-for="item in entrances" :key="item.id" :class="{ active: entranceType === item.type }" @tap="entranceType = item.type">{{ ENTRANCE_LABELS[item.type] }}</button></view>
          <view class="legend"><text class="red">━ 主要路线</text><text class="blue">━ 次要路线</text><view class="treasure"><image src="/static/treasure.webp" mode="aspectFit" /><text>金箱点</text></view><text>⇅ 上／下层移动</text><text class="green">▲ 起点　● 终点</text></view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.strategy { display: flex; flex-direction: column; height: 100vh; padding-bottom: env(safe-area-inset-bottom); overflow: hidden; position: relative; }
.header { flex: none; padding: 0 8px 6px; }
.title-row { display: flex; align-items: center; justify-content: space-between; }
.title-row button { flex: none; border: 0; background: transparent; padding: 10px 4px; font-size: 12px; }
.title { min-width: 0; text-align: center; color: #e1c795; }
.title text { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.floors { display: flex; justify-content: center; }
.floors button { border: 0; border-radius: 20px; padding: 8px 14px; margin: 2px; }
.map-panel { flex: 1; min-height: 0; }
.focus { position: absolute; left: 8px; bottom: calc(8px + env(safe-area-inset-bottom)); font-size: 12px; }
.backdrop { position: fixed; inset: 0; background: rgba(10,11,13,.75); z-index: 20; display: flex; align-items: flex-end; }
.sheet { width: 100%; background: #1c272f; border-radius: 16px 16px 0 0; padding: 16px 16px calc(16px + env(safe-area-inset-bottom)); }
.sheet-heading { display: flex; align-items: center; justify-content: space-between; color: #e1c795; margin-bottom: 12px; }
.sheet-content { max-height: 65vh; height: 55vh; }
.entrance-image { display: block; width: 100%; }
.remark { display: block; margin: 14px 0; line-height: 1.6; }
.entrances { display: flex; flex-wrap: wrap; }
.entrances button { margin: 0 8px 8px 0; }
.legend text { display: block; margin: 8px 0; }
.treasure { display: flex; align-items: center; }.treasure image { width: 28px; height: 28px; margin-right: 8px; }
.red { color: #ee6464; }.blue { color: #71aef5; }.green { color: #77c68b; }
</style>

<script setup lang="ts">
import {
  ENTRANCE_LABELS,
  REQUIRED_ENTRANCES,
  MODE_LABELS,
  layoutPublicationIssues,
  type EntranceType,
  type GameMode,
  type Layout,
} from "@idv-map/shared";
import {
  NAlert,
  NButton,
  NEmpty,
  NPopconfirm,
  NRadioButton,
  NRadioGroup,
  NSpin,
  NSelect,
  NSwitch,
  NTag,
  useMessage,
} from "naive-ui";
import Sortable from "sortablejs";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import {
  activeMapsV2,
  loadV2,
  markDirtyV2,
  nextIdV2,
  storeV2,
} from "../store-v2";
import MapEditorV2 from "./MapEditorV2.vue";

const message = useMessage();
const editing = ref<Layout | null>(null);
const editingIsNew = ref(false);
const gameMapId = ref("lady-of-doom");
const gameMapOptions = computed(() =>
  storeV2.gameMaps
    .filter((m) => !m.deletedAt)
    .map((m) => ({ label: m.name, value: m.id })),
);
const mapLayouts = computed(() =>
  activeMapsV2.value.filter((m) => m.gameMapId === gameMapId.value),
);
const activeMode = ref<GameMode>("hard");
const modeCounts = computed(() => ({
  hard: mapLayouts.value.filter((map) => map.mode === "hard").length,
  nightmare: mapLayouts.value.filter((map) => map.mode === "nightmare").length,
}));
const visibleMaps = computed(() =>
  mapLayouts.value.filter((map) => map.mode === activeMode.value),
);
const listWrap = ref<HTMLElement>();
let sortable: Sortable | null = null;

onMounted(() => {
  if (!storeV2.loaded && !storeV2.loading) void loadV2();
  void nextTick(initSortable);
});

watch(
  [activeMode, gameMapId, () => visibleMaps.value.length],
  () => void nextTick(initSortable),
);
onBeforeUnmount(() => sortable?.destroy());

function initSortable(): void {
  sortable?.destroy();
  sortable = null;
  if (!listWrap.value) return;
  sortable = Sortable.create(listWrap.value, {
    handle: ".drag-handle",
    animation: 150,
    ghostClass: "v2-sort-ghost",
    onEnd(event) {
      const { oldIndex, newIndex } = event;
      // Sortable 会直接移动 DOM；先还原，再让 Vue 根据数据顺序重新渲染。
      event.from.removeChild(event.item);
      event.from.insertBefore(
        event.item,
        event.from.children[oldIndex ?? 0] ?? null,
      );
      if (oldIndex == null || newIndex == null || oldIndex === newIndex) return;
      reorderVisibleMaps(oldIndex, newIndex);
    },
  });
}

/** 只调整当前模式内的相对顺序，不改变另一模式或已删除地图的位置。 */
function reorderVisibleMaps(oldIndex: number, newIndex: number): void {
  const current = visibleMaps.value;
  const moved = current[oldIndex];
  const target = current[newIndex];
  if (!moved || !target || moved === target) return;
  const from = storeV2.maps.indexOf(moved);
  storeV2.maps.splice(from, 1);
  const to = storeV2.maps.indexOf(target) + (newIndex > oldIndex ? 1 : 0);
  storeV2.maps.splice(to, 0, moved);
  markDirtyV2();
  void nextTick(initSortable);
}

function moveMap(index: number, offset: -1 | 1): void {
  const nextIndex = index + offset;
  if (nextIndex < 0 || nextIndex >= visibleMaps.value.length) return;
  reorderVisibleMaps(index, nextIndex);
}

function togglePublish(map: Layout, value: boolean): void {
  if (value) {
    const issues = layoutPublicationIssues(map);
    if (issues.length > 0) {
      message.warning(
        `「${map.displayName}」还不能发布：${issues.join("；")}`,
        { duration: 10000, closable: true },
      );
      return;
    }
  }
  map.published = value;
  markDirtyV2();
}

function removeMap(map: Layout): void {
  map.deletedAt = new Date().toISOString();
  map.published = false;
  markDirtyV2();
  message.info(
    `已移除「${map.displayName}」，点击“保存内容”后生效；保存前刷新页面可撤销。`,
    {
      duration: 8000,
      closable: true,
    },
  );
}

function entrancesFor(mode: Layout["mode"], id: number): Layout["entrances"] {
  const types: readonly EntranceType[] = REQUIRED_ENTRANCES[mode];
  return types.map((type) => ({
    id: `${id}-${type}`,
    type,
    ...(type === "front" ? { direction: "south" as const } : {}),
  }));
}

function createMap(): void {
  const id = nextIdV2();
  const mode = activeMode.value;
  editing.value = {
    id,
    gameMapId: gameMapId.value,
    mode,
    name: "",
    displayName: "",
    remarks: "",
    sort: (storeV2.maps.length + 1) * 10,
    published: false,
    floorImages: {},
    entrances: entrancesFor(mode, id),
  };
  editingIsNew.value = true;
}

function editMap(map: Layout): void {
  editingIsNew.value = false;
  editing.value = map;
}

function applyMap(map: Layout): void {
  const index = storeV2.maps.findIndex((item) => item.id === map.id);
  if (index === -1) storeV2.maps.push(map);
  else storeV2.maps[index] = map;
  editing.value = null;
  editingIsNew.value = false;
  activeMode.value = map.mode;
  markDirtyV2();
}

function closeEditor(): void {
  editing.value = null;
  editingIsNew.value = false;
}

</script>

<template>
  <n-alert type="info" style="margin-bottom: 14px">
    保存后立即更新正式手册。未发布的布局仅在后台可见。
  </n-alert>

  <n-alert v-if="storeV2.fatal" type="error" style="margin-bottom: 14px">
    {{ storeV2.fatal }}
    <n-button size="small" style="margin-left: 10px" @click="loadV2"
      >重试</n-button
    >
  </n-alert>
  <div v-else-if="storeV2.loading" class="loading-wrap"><n-spin /></div>

  <template v-else>
    <div class="toolbar v2-mode-toolbar">
      <n-select
        v-model:value="gameMapId"
        :options="gameMapOptions"
        aria-label="所属地图"
        style="width: 200px"
      />
      <n-radio-group v-model:value="activeMode" name="v2-map-mode" size="large">
        <n-radio-button value="hard"
          >困难地图（{{ modeCounts.hard }}）</n-radio-button
        >
        <n-radio-button value="nightmare"
          >噩梦地图（{{ modeCounts.nightmare }}）</n-radio-button
        >
      </n-radio-group>
      <span class="spacer"></span>
      <n-button
        type="primary"
        :disabled="!gameMapOptions.some((m) => m.value === gameMapId)"
        @click="createMap"
        >新增{{ MODE_LABELS[activeMode] }}布局</n-button
      >
    </div>

    <n-alert
      v-if="storeV2.version === 0"
      type="warning"
      style="margin-bottom: 14px"
    >
      当前尚未保存，请先选择地图并录入布局。
    </n-alert>

    <div
      v-if="visibleMaps.length"
      ref="listWrap"
      class="card-list v2-card-list"
      :aria-label="`${MODE_LABELS[activeMode]}布局列表`"
    >
      <article
        v-for="(map, index) in visibleMaps"
        :key="map.id"
        class="map-card v2-map-card"
        :class="{ draft: !map.published }"
      >
        <div class="v2-order-controls">
          <span class="drag-handle" aria-hidden="true">⠿</span>
          <div class="v2-order-buttons">
            <n-button
              size="tiny"
              quaternary
              :disabled="index === 0"
              @click="moveMap(index, -1)"
              >上移</n-button
            >
            <n-button
              size="tiny"
              quaternary
              :disabled="index === visibleMaps.length - 1"
              @click="moveMap(index, 1)"
            >
              下移
            </n-button>
          </div>
        </div>
        <div class="meta">
          <div>
            <strong>{{ map.displayName }}</strong>
            <n-tag
              size="small"
              :type="map.published ? 'success' : 'default'"
              style="margin-left: 6px"
            >
              {{ map.published ? "已发布" : "草稿" }}
            </n-tag>
          </div>
          <div class="sub">
            #{{ map.id }} · 入口：{{
              map.entrances
                .map((item) => ENTRANCE_LABELS[item.type])
                .join("、") || "无"
            }}
          </div>
          <div
            v-if="layoutPublicationIssues(map).length"
            class="sub v2-problem"
          >
            发布前还差：{{ layoutPublicationIssues(map).join("；") }}
          </div>
        </div>
        <div class="row-actions v2-map-actions">
          <label class="v2-publish-control">
            <span>发布</span>
            <n-switch
              size="small"
              :value="map.published"
              :aria-label="`${map.displayName}发布状态`"
              @update:value="(value: boolean) => togglePublish(map, value)"
            />
          </label>
          <n-button size="small" @click="editMap(map)">编辑</n-button>
          <n-popconfirm
            positive-text="确认移除"
            negative-text="取消"
            @positive-click="removeMap(map)"
          >
            <template #trigger>
              <n-button size="small" quaternary type="error">移除</n-button>
            </template>
            移除「{{ map.displayName }}」？保存内容
            后将从后台列表和前台隐藏，系统会自动保留上一版备份。
          </n-popconfirm>
        </div>
      </article>
    </div>
    <n-empty v-else :description="`还没有${MODE_LABELS[activeMode]}布局`" class="v2-empty">
      <template #extra>
        <n-button type="primary" :disabled="!gameMapOptions.some((m) => m.value === gameMapId)" @click="createMap">
          新增{{ MODE_LABELS[activeMode] }}布局
        </n-button>
      </template>
    </n-empty>

    <p v-if="visibleMaps.length" class="muted v2-list-hint">
      按住 ⠿ 拖动，或使用“上移 /
      下移”调整当前模式的前台顺序；排序、发布和移除都需点击“保存内容”生效。
    </p>

  </template>

  <MapEditorV2
    v-if="editing"
    :map="editing"
    :is-new="editingIsNew"
    @apply="applyMap"
    @cancel="closeEditor"
  />
</template>

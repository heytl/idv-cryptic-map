<script setup lang="ts">
// 地图列表：方向筛选、拖拽排序（桌面表格 / 窄屏卡片，触屏可用）、发布开关、软删除/回收站
import {
  NButton,
  NDataTable,
  NImage,
  NPopconfirm,
  NRadioButton,
  NRadioGroup,
  NSwitch,
  NTag,
  type DataTableColumns,
} from 'naive-ui';
import Sortable from 'sortablejs';
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { activeMaps, markDirty, nextId, recycledMaps, store } from '../store';
import { DIRECTIONS, type StoredMap } from '../types';
import { useIsNarrow } from '../ui';
import MapEditor from './MapEditor.vue';

const narrow = useIsNarrow();
const filter = ref('all');
const editing = ref<StoredMap | null>(null);
const isNew = ref(false);

const shown = computed(() =>
  filter.value === 'all' ? activeMaps.value : activeMaps.value.filter((m) => m.direction === filter.value),
);

// ---- 拖拽排序（sortablejs 统一支持鼠标与触屏，抓手 .drag-handle）----
const listWrap = ref<HTMLElement>();
let sortable: Sortable | null = null;

function initSortable() {
  sortable?.destroy();
  sortable = null;
  const el = listWrap.value?.querySelector<HTMLElement>(narrow.value ? '.card-list' : '.n-data-table-tbody');
  if (!el) return;
  sortable = Sortable.create(el, {
    handle: '.drag-handle',
    animation: 150,
    onEnd(evt) {
      const { oldIndex, newIndex } = evt;
      // 还原 sortable 的 DOM 移动，改由数据变更驱动 Vue 重渲染
      evt.from.removeChild(evt.item);
      evt.from.insertBefore(evt.item, evt.from.children[oldIndex ?? 0] ?? null);
      if (oldIndex == null || newIndex == null || oldIndex === newIndex) return;
      reorder(oldIndex, newIndex);
    },
  });
}

/** 把筛选视图内的移动映射回 store.maps 全量顺序（插入到目标行位置） */
function reorder(oldI: number, newI: number) {
  const list = shown.value;
  const moved = list[oldI];
  const target = list[newI];
  const from = store.maps.indexOf(moved);
  store.maps.splice(from, 1);
  const to = store.maps.indexOf(target) + (newI > oldI ? 1 : 0);
  store.maps.splice(to, 0, moved);
  markDirty();
}

onMounted(() => nextTick(initSortable));
watch(narrow, () => nextTick(initSortable));
onBeforeUnmount(() => sortable?.destroy());

// ---- 行操作 ----
function togglePublish(m: StoredMap, v: boolean) {
  m.published = v;
  markDirty();
}

function softDelete(m: StoredMap) {
  m.deletedAt = new Date().toISOString();
  m.published = false;
  markDirty();
}

function restore(m: StoredMap) {
  m.deletedAt = null;
  markDirty();
}

function purge(m: StoredMap) {
  store.maps.splice(store.maps.indexOf(m), 1);
  markDirty();
}

function addNew() {
  isNew.value = true;
  editing.value = {
    id: nextId(),
    direction: '左',
    name: '',
    displayName: '',
    remarks: '',
    published: false,
    images: undefined,
  };
}

function applyEdit(next: StoredMap) {
  if (isNew.value) {
    store.maps.push(next);
  } else {
    const i = store.maps.findIndex((m) => m.id === next.id);
    store.maps.splice(i, 1, next);
  }
  markDirty();
  editing.value = null;
  isNew.value = false;
}

// ---- 桌面表格列（render 函数） ----
function thumbOf(m: StoredMap) {
  const src = m.images?.entryThumb ?? m.images?.entry;
  if (!src) return h('div', { class: 'thumb thumb-empty' }, '无');
  return h(NImage, {
    src,
    previewSrc: m.images?.entry ?? src,
    width: 48,
    height: 48,
    objectFit: 'cover',
    lazy: true,
    class: 'thumb-img',
  });
}

const columns: DataTableColumns<StoredMap> = [
  { key: 'drag', title: '', width: 40, render: () => h('span', { class: 'drag-handle' }, '⠿') },
  { key: 'thumb', title: '入口', width: 64, render: thumbOf },
  {
    key: 'displayName',
    title: '展示名',
    minWidth: 130,
    render: (m) => h('div', [m.displayName, m.name !== m.displayName ? h('div', { class: 'muted' }, m.name) : null]),
  },
  {
    key: 'direction',
    title: '方向',
    width: 60,
    render: (m) => h(NTag, { size: 'small', bordered: false }, { default: () => m.direction }),
  },
  { key: 'remarks', title: '备注', minWidth: 150, ellipsis: { tooltip: true }, className: 'muted' },
  {
    key: 'published',
    title: '发布',
    width: 66,
    render: (m) =>
      h(NSwitch, {
        size: 'small',
        value: m.published !== false,
        onUpdateValue: (v: boolean) => togglePublish(m, v),
      }),
  },
  {
    key: 'ops',
    title: '操作',
    width: 110,
    render: (m) =>
      h('div', { class: 'row-actions' }, [
        h(
          NButton,
          {
            size: 'tiny',
            onClick: () => {
              editing.value = m;
              isNew.value = false;
            },
          },
          { default: () => '编辑' },
        ),
        h(NButton, { size: 'tiny', quaternary: true, type: 'error', onClick: () => softDelete(m) }, { default: () => '删除' }),
      ]),
  },
];
</script>

<template>
  <div class="toolbar">
    <n-radio-group :value="filter" size="small" @update:value="(v: string) => (filter = v)">
      <n-radio-button value="all">全部 {{ activeMaps.length }}</n-radio-button>
      <n-radio-button v-for="d in DIRECTIONS" :key="d" :value="d">{{ d }}</n-radio-button>
    </n-radio-group>
    <span class="spacer"></span>
    <n-button type="primary" size="small" @click="addNew">＋ 新增地图</n-button>
  </div>

  <div ref="listWrap">
    <n-data-table
      v-if="!narrow"
      size="small"
      :data="shown"
      :columns="columns"
      :row-key="(m: StoredMap) => m.id"
      :row-class-name="(m: StoredMap) => (m.published === false ? 'draft' : '')"
      :scroll-x="680"
    />

    <div v-else class="card-list">
      <div v-for="m in shown" :key="m.id" class="map-card" :class="{ draft: m.published === false }">
        <span class="drag-handle">⠿</span>
        <img
          v-if="m.images?.entryThumb ?? m.images?.entry"
          class="thumb"
          :src="m.images?.entryThumb ?? m.images?.entry"
          alt=""
          loading="lazy"
        />
        <div v-else class="thumb thumb-empty">无</div>
        <div class="meta">
          <div>{{ m.displayName }} <n-tag size="small" :bordered="false">{{ m.direction }}</n-tag></div>
          <div class="sub">{{ m.remarks }}</div>
        </div>
        <div class="ops">
          <n-switch size="small" :value="m.published !== false" @update:value="(v: boolean) => togglePublish(m, v)" />
          <div class="row-actions">
            <n-button size="tiny" @click="editing = m; isNew = false">编辑</n-button>
            <n-button size="tiny" quaternary type="error" @click="softDelete(m)">删除</n-button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <p class="muted">提示：按住 ⠿ 拖动可调整前台展示顺序（筛选状态下拖动会插入到目标行位置）。所有改动需底部「保存」生效。</p>

  <template v-if="recycledMaps.length > 0">
    <h2 class="section-title">回收站 <span class="muted">恢复后记得重新发布</span></h2>
    <div class="card-list">
      <div v-for="m in recycledMaps" :key="m.id" class="map-card draft">
        <img
          v-if="m.images?.entryThumb ?? m.images?.entry"
          class="thumb"
          :src="m.images?.entryThumb ?? m.images?.entry"
          alt=""
          loading="lazy"
        />
        <div v-else class="thumb thumb-empty">无</div>
        <div class="meta">
          <div>{{ m.displayName }}</div>
          <div class="sub">删除于 {{ m.deletedAt?.slice(0, 10) }}</div>
        </div>
        <div class="row-actions">
          <n-button size="tiny" @click="restore(m)">恢复</n-button>
          <n-popconfirm @positive-click="purge(m)">
            <template #trigger>
              <n-button size="tiny" quaternary type="error">彻底删除</n-button>
            </template>
            彻底删除「{{ m.displayName }}」？保存后不可恢复（版本历史仍可整体回滚）。
          </n-popconfirm>
        </div>
      </div>
    </div>
  </template>

  <MapEditor v-if="editing" :map="editing" @apply="applyEdit" @cancel="editing = null; isNew = false" />
</template>

<script setup lang="ts">
// 地图列表：方向筛选、HTML5 拖拽排序、发布开关、软删除/回收站
import { computed, ref } from 'vue';
import { activeMaps, markDirty, nextId, recycledMaps, store } from '../store';
import { DIRECTIONS, type Direction, type StoredMap } from '../types';
import MapEditor from './MapEditor.vue';

const filter = ref<'all' | Direction>('all');
const editing = ref<StoredMap | null>(null);
const isNew = ref(false);

const shown = computed(() =>
  filter.value === 'all' ? activeMaps.value : activeMaps.value.filter((m) => m.direction === filter.value),
);

// ---- 拖拽排序（整表顺序 = store.maps 顺序，保存时重排 sort）----
const dragId = ref<number | null>(null);
const overId = ref<number | null>(null);

function onDrop(target: StoredMap) {
  if (dragId.value == null || dragId.value === target.id) return;
  const from = store.maps.findIndex((m) => m.id === dragId.value);
  const to = store.maps.findIndex((m) => m.id === target.id);
  const [moved] = store.maps.splice(from, 1);
  store.maps.splice(to, 0, moved);
  markDirty();
  dragId.value = overId.value = null;
}

// ---- 行操作 ----
function togglePublish(m: StoredMap) {
  m.published = m.published === false;
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
  if (!confirm(`彻底删除「${m.displayName}」？此操作保存后不可恢复（版本历史里仍可整体回滚）`)) return;
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
</script>

<template>
  <div class="toolbar">
    <button class="tab" :class="{ active: filter === 'all' }" @click="filter = 'all'">全部 {{ activeMaps.length }}</button>
    <button
      v-for="d in DIRECTIONS"
      :key="d"
      class="tab"
      :class="{ active: filter === d }"
      @click="filter = d"
    >
      {{ d }}
    </button>
    <span class="spacer"></span>
    <button class="primary" @click="addNew">+ 新增地图</button>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 66px">入口</th>
        <th>展示名</th>
        <th style="width: 50px">方向</th>
        <th>备注</th>
        <th style="width: 70px">状态</th>
        <th style="width: 150px">操作</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="m in shown"
        :key="m.id"
        class="draggable"
        :class="{ draft: m.published === false, 'drag-over': overId === m.id }"
        draggable="true"
        @dragstart="dragId = m.id"
        @dragover.prevent="overId = m.id"
        @dragleave="overId = null"
        @drop.prevent="onDrop(m)"
      >
        <td><img class="thumb" :src="m.images?.entryThumb ?? m.images?.entry" alt="" loading="lazy" /></td>
        <td>{{ m.displayName }}<div v-if="m.name !== m.displayName" class="muted">{{ m.name }}</div></td>
        <td>{{ m.direction }}</td>
        <td class="muted">{{ m.remarks }}</td>
        <td>
          <span class="badge" :class="{ on: m.published !== false }">{{ m.published === false ? '草稿' : '已发布' }}</span>
        </td>
        <td>
          <div class="row-actions">
            <button class="small" @click="editing = m; isNew = false">编辑</button>
            <button class="small" @click="togglePublish(m)">{{ m.published === false ? '发布' : '下架' }}</button>
            <button class="small danger" @click="softDelete(m)">删除</button>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
  <p class="muted">提示：拖动行调整前台展示顺序（跨方向筛选时建议切回「全部」再拖）。所有改动需底部「保存」生效。</p>

  <template v-if="recycledMaps.length > 0">
    <h1 style="margin-top: 24px">回收站 <span class="ver">恢复后记得重新发布</span></h1>
    <table>
      <tbody>
        <tr v-for="m in recycledMaps" :key="m.id" class="draft">
          <td style="width: 66px"><img class="thumb" :src="m.images?.entryThumb ?? m.images?.entry" alt="" /></td>
          <td>{{ m.displayName }}</td>
          <td class="muted">删除于 {{ m.deletedAt?.slice(0, 10) }}</td>
          <td style="width: 150px">
            <div class="row-actions">
              <button class="small" @click="restore(m)">恢复</button>
              <button class="small danger" @click="purge(m)">彻底删除</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </template>

  <MapEditor v-if="editing" :map="editing" @apply="applyEdit" @cancel="editing = null; isNew = false" />
</template>

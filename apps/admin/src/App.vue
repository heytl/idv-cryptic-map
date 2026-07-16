<script setup lang="ts">
import { onMounted, ref } from 'vue';
import HistoryView from './components/HistoryView.vue';
import MapTable from './components/MapTable.vue';
import { load, save, store } from './store';

const view = ref<'list' | 'history'>('list');
const saveError = ref('');

onMounted(load);

async function onSave() {
  saveError.value = '';
  const err = await save();
  if (err) saveError.value = err;
}

// 有未保存改动时提醒（关标签页/刷新）
window.addEventListener('beforeunload', (e) => {
  if (store.dirty) e.preventDefault();
});
</script>

<template>
  <h1>
    加页手记 · 地图管理
    <span class="ver">v{{ store.version }} · 数据更新于 {{ store.updatedAt || '—' }}</span>
  </h1>

  <div v-if="store.fatal" class="banner error">
    {{ store.fatal }}
    <button class="small" style="margin-left: 10px" @click="load">重试</button>
  </div>

  <div v-else-if="store.loading" class="muted">加载中…</div>

  <template v-else>
    <div v-if="store.version === 0" class="banner warn">
      KV 中还没有配置数据。请先在仓库执行迁移脚本：<code>node scripts/migrate-phase2.mjs</code>（本地）或加 <code>--remote</code>（生产）。
    </div>

    <div class="toolbar">
      <button class="tab" :class="{ active: view === 'list' }" @click="view = 'list'">地图列表</button>
      <button class="tab" :class="{ active: view === 'history' }" @click="view = 'history'">版本历史</button>
    </div>

    <MapTable v-if="view === 'list'" />
    <HistoryView v-else />

    <div class="savebar">
      <span class="hint">{{ store.dirty ? '有未保存的改动' : '已是最新' }}</span>
      <button class="primary" :disabled="!store.dirty || store.saving" @click="onSave">
        {{ store.saving ? '保存中…' : '保存并生效' }}
      </button>
      <span v-if="saveError" class="hint" style="color: var(--danger)">{{ saveError }}</span>
    </div>
  </template>
</template>

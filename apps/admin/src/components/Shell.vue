<script setup lang="ts">
// 页面骨架：标题/版本、全局错误横幅、视图切换、固定保存条
import { NAlert, NButton, NSpin, NTabPane, NTabs, useMessage } from 'naive-ui';
import { onMounted, ref } from 'vue';
import { load, save, store } from '../store';
import HistoryView from './HistoryView.vue';
import MapTable from './MapTable.vue';

const view = ref('list');
const message = useMessage();

onMounted(load);

async function onSave() {
  const err = await save();
  if (err) message.error(err, { duration: 8000, closable: true });
  else message.success(`已保存并生效（v${store.version}）`);
}

// 有未保存改动时提醒（关标签页/刷新）
window.addEventListener('beforeunload', (e) => {
  if (store.dirty) e.preventDefault();
});
</script>

<template>
  <header class="page-head">
    <h1>加页手记 · 地图管理</h1>
    <span class="muted">v{{ store.version }} · 数据更新于 {{ store.updatedAt || '—' }}</span>
  </header>

  <n-alert v-if="store.fatal" type="error" style="margin-bottom: 14px">
    {{ store.fatal }}
    <n-button size="small" style="margin-left: 10px" @click="load">重试</n-button>
  </n-alert>

  <div v-else-if="store.loading" class="loading-wrap"><n-spin /></div>

  <template v-else>
    <n-alert v-if="store.version === 0" type="warning" style="margin-bottom: 14px">
      KV 中还没有配置数据。请先在仓库执行迁移脚本：<code>node scripts/migrate-phase2.mjs</code>（本地）或加
      <code>--remote</code>（生产）。
    </n-alert>

    <n-tabs v-model:value="view" type="line">
      <n-tab-pane name="list" tab="地图列表"><MapTable /></n-tab-pane>
      <n-tab-pane name="history" tab="版本历史"><HistoryView /></n-tab-pane>
    </n-tabs>

    <div class="savebar">
      <span class="hint">{{ store.dirty ? '有未保存的改动' : '已是最新' }}</span>
      <n-button type="primary" :disabled="!store.dirty" :loading="store.saving" @click="onSave">保存并生效</n-button>
    </div>
  </template>
</template>
